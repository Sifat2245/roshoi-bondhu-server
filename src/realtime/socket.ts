import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { env } from '../config/env.js';
import { allowedOrigins, isOriginAllowed } from '../config/cors.js';
import prisma from '../lib/prisma.js';
import {
  resolveUserFromHeaders,
  type AuthenticatedUser,
} from '../middleware/auth.middleware.js';

export interface AuthenticatedSocket extends Socket {
  user?: AuthenticatedUser;
}

let ioInstance: SocketIOServer | null = null;
const onlineSocketsByUser = new Map<string, Set<string>>();

function getSocketCorsOrigins(): string[] {
  const configured = env.SOCKET_CORS_ORIGIN.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set([...allowedOrigins, ...configured]));
}

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  if (ioInstance) return ioInstance;

  const origins = getSocketCorsOrigins();

  const io = new SocketIOServer(httpServer, {
    path: env.SOCKET_PATH,
    pingInterval: env.SOCKET_PING_INTERVAL,
    pingTimeout: env.SOCKET_PING_TIMEOUT,
    cors: {
      origin: (origin, callback) => {
        if (isOriginAllowed(origin, origins)) {
          return callback(null, true);
        }
        return callback(new Error(`Socket CORS blocked for origin: ${origin}`));
      },
      credentials: true,
    },
  });

  // Authenticate every handshake using Better Auth session / JWT + account status check
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const handshakeToken =
        typeof socket.handshake.auth?.token === 'string'
          ? socket.handshake.auth.token
          : null;

      const user = await resolveUserFromHeaders(socket.request, handshakeToken);
      if (!user) {
        return next(new Error('Authentication required.'));
      }
      if (user.isBanned) {
        return next(new Error('Account suspended.'));
      }

      socket.user = user;
      return next();
    } catch {
      return next(new Error('Failed to authenticate socket connection.'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const user = socket.user;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    // Join personal user channel for real-time notifications & direct updates
    socket.join(`user:${user.id}`);

    // Track online presence per user
    let userSockets = onlineSocketsByUser.get(user.id);
    const wasOffline = !userSockets || userSockets.size === 0;
    if (!userSockets) {
      userSockets = new Set();
      onlineSocketsByUser.set(user.id, userSockets);
    }
    userSockets.add(socket.id);

    socket.emit('presence:list', {
      onlineUserIds: Array.from(onlineSocketsByUser.keys()),
    });

    if (wasOffline) {
      socket.broadcast.emit('presence:online', { userId: user.id });
    }

    // Group room subscription (validates current membership for private groups)
    socket.on('group:join', async (groupId: string) => {
      if (!groupId || typeof groupId !== 'string') return;
      try {
        const group = await prisma.group.findUnique({
          where: { id: groupId },
          select: { id: true, privacy: true, status: true, ownerId: true, createdById: true },
        });
        if (!group || group.status === 'DELETED') return;

        if (group.privacy === 'PRIVATE') {
          const isOwner = (group.ownerId || group.createdById) === user.id;
          if (!isOwner) {
            const member = await prisma.groupMember.findUnique({
              where: { groupId_userId: { groupId: group.id, userId: user.id } },
              select: { isApproved: true },
            });
            if (!member?.isApproved) return;
          }
        }

        socket.join(`group:${group.id}`);
      } catch {
        // Ignore unauthorized/malformed room joins
      }
    });

    socket.on('group:leave', (groupId: string) => {
      if (groupId && typeof groupId === 'string') {
        socket.leave(`group:${groupId}`);
      }
    });

    // Conversation & typing hooks (ready for durable messaging)
    socket.on('conversation:join', (conversationId: string) => {
      if (conversationId && typeof conversationId === 'string') {
        socket.join(`conversation:${conversationId}`);
      }
    });

    socket.on('conversation:leave', (conversationId: string) => {
      if (conversationId && typeof conversationId === 'string') {
        socket.leave(`conversation:${conversationId}`);
      }
    });

    socket.on(
      'chat:typing',
      (payload: { conversationId?: string; recipientId?: string; isTyping?: boolean }) => {
        if (!payload) return;
        const data = {
          userId: user.id,
          conversationId: payload.conversationId,
          isTyping: Boolean(payload.isTyping),
        };
        if (payload.conversationId) {
          socket.to(`conversation:${payload.conversationId}`).emit('chat:typing', data);
        } else if (payload.recipientId) {
          io.to(`user:${payload.recipientId}`).emit('chat:typing', data);
        }
      }
    );

    socket.on('disconnect', () => {
      const sockets = onlineSocketsByUser.get(user.id);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineSocketsByUser.delete(user.id);
          socket.broadcast.emit('presence:offline', { userId: user.id });
        }
      }
    });
  });

  ioInstance = io;
  console.log(`[Socket.IO] initialized on path ${env.SOCKET_PATH}`);
  return io;
}

export function getIO(): SocketIOServer | null {
  return ioInstance;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  ioInstance?.to(`user:${userId}`).emit(event, payload);
}

export function emitToGroup(groupId: string, event: string, payload: unknown): void {
  ioInstance?.to(`group:${groupId}`).emit(event, payload);
}

export function emitToConversation(
  conversationId: string,
  event: string,
  payload: unknown
): void {
  ioInstance?.to(`conversation:${conversationId}`).emit(event, payload);
}

export function isUserOnline(userId: string): boolean {
  const sockets = onlineSocketsByUser.get(userId);
  return Boolean(sockets && sockets.size > 0);
}

export function getOnlineUserIds(): string[] {
  return Array.from(onlineSocketsByUser.keys());
}

