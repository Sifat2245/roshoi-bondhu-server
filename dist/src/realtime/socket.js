import { Server as SocketIOServer } from 'socket.io';
import { env } from '../config/env.js';
import { allowedOrigins, isOriginAllowed } from '../config/cors.js';
import prisma from '../lib/prisma.js';
import { resolveUserFromHeaders, } from '../middleware/auth.middleware.js';
let ioInstance = null;
const onlineSocketsByUser = new Map();
function getSocketCorsOrigins() {
    const configured = env.SOCKET_CORS_ORIGIN.split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    return Array.from(new Set([...allowedOrigins, ...configured]));
}
export function initSocketServer(httpServer) {
    if (ioInstance)
        return ioInstance;
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
    io.use(async (socket, next) => {
        try {
            const handshakeToken = typeof socket.handshake.auth?.token === 'string'
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
        }
        catch {
            return next(new Error('Failed to authenticate socket connection.'));
        }
    });
    io.on('connection', (socket) => {
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
        socket.on('group:join', async (groupId) => {
            if (!groupId || typeof groupId !== 'string')
                return;
            try {
                const group = await prisma.group.findUnique({
                    where: { id: groupId },
                    select: { id: true, privacy: true, status: true, ownerId: true, createdById: true },
                });
                if (!group || group.status === 'DELETED')
                    return;
                if (group.privacy === 'PRIVATE') {
                    const isOwner = (group.ownerId || group.createdById) === user.id;
                    if (!isOwner) {
                        const member = await prisma.groupMember.findUnique({
                            where: { groupId_userId: { groupId: group.id, userId: user.id } },
                            select: { isApproved: true },
                        });
                        if (!member?.isApproved)
                            return;
                    }
                }
                socket.join(`group:${group.id}`);
            }
            catch {
                // Ignore unauthorized/malformed room joins
            }
        });
        socket.on('group:leave', (groupId) => {
            if (groupId && typeof groupId === 'string') {
                socket.leave(`group:${groupId}`);
            }
        });
        // Conversation & typing hooks (ready for durable messaging)
        socket.on('conversation:join', (conversationId) => {
            if (conversationId && typeof conversationId === 'string') {
                socket.join(`conversation:${conversationId}`);
            }
        });
        socket.on('conversation:leave', (conversationId) => {
            if (conversationId && typeof conversationId === 'string') {
                socket.leave(`conversation:${conversationId}`);
            }
        });
        socket.on('chat:typing', (payload) => {
            if (!payload)
                return;
            const data = {
                userId: user.id,
                conversationId: payload.conversationId,
                isTyping: Boolean(payload.isTyping),
            };
            if (payload.conversationId) {
                socket.to(`conversation:${payload.conversationId}`).emit('chat:typing', data);
            }
            else if (payload.recipientId) {
                io.to(`user:${payload.recipientId}`).emit('chat:typing', data);
            }
        });
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
export function getIO() {
    return ioInstance;
}
export function emitToUser(userId, event, payload) {
    ioInstance?.to(`user:${userId}`).emit(event, payload);
}
export function emitToGroup(groupId, event, payload) {
    ioInstance?.to(`group:${groupId}`).emit(event, payload);
}
export function emitToConversation(conversationId, event, payload) {
    ioInstance?.to(`conversation:${conversationId}`).emit(event, payload);
}
export function isUserOnline(userId) {
    const sockets = onlineSocketsByUser.get(userId);
    return Boolean(sockets && sockets.size > 0);
}
export function getOnlineUserIds() {
    return Array.from(onlineSocketsByUser.keys());
}
