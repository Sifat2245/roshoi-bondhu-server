import type { Request, Response, NextFunction } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import auth from '../lib/auth.js';
import prisma from '../lib/prisma.js';
import jwtUtils from '../shared/utils/jwt.js';
import cookieUtils from '../shared/utils/cookie.js';
import { env } from '../config/env.js';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role: 'USER' | 'MODERATOR' | 'ADMIN';
  isBanned: boolean;
  bio?: string | null;
  coverImage?: string | null;
  phone?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      session?: any;
    }
  }
}

const resolveUserFromHeaders = async (req: Request): Promise<AuthenticatedUser | null> => {
  // 1. Try JWT from Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  // 2. Fallback to accessToken cookie
  if (!token) {
    token = cookieUtils.getCookie(req, 'accessToken') || null;
  }

  if (token) {
    try {
      const decoded: any = jwtUtils.verifyToken(token, env.JWT_ACCESS_SECRET);
      if (decoded && decoded.id) {
        const user = await prisma.user.findUnique({
          where: { id: decoded.id },
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
            status: true,
            isBanned: true,
            bio: true,
            coverImage: true,
            phone: true,
          },
        });
        if (user && user.status !== 'DELETED' && !user.isBanned) {
          return user as AuthenticatedUser;
        }
      }
    } catch {
      // Not a JWT, check if it's a Better Auth session token in the Session table
      try {
        const dbSession = await prisma.session.findUnique({
          where: { token },
        });
        if (dbSession && new Date(dbSession.expiresAt) > new Date()) {
          const user = await prisma.user.findUnique({
            where: { id: dbSession.userId },
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              role: true,
              status: true,
              isBanned: true,
              bio: true,
              coverImage: true,
              phone: true,
            },
          });
          if (user && user.status !== 'DELETED' && !user.isBanned) {
            req.session = dbSession;
            return user as AuthenticatedUser;
          }
        }
      } catch {
        // Fallback to session check below
      }
    }
  }

  // 3. Try Better Auth Session from Cookie / Headers
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (session && session.user) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          role: true,
          status: true,
          isBanned: true,
          bio: true,
          coverImage: true,
          phone: true,
        },
      });
      if (user && user.status !== 'DELETED' && !user.isBanned) {
        req.session = session.session;
        return user as AuthenticatedUser;
      }
    }
  } catch {
    // Session check failed
  }

  return null;
};

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await resolveUserFromHeaders(req);

    if (!user) {
      return res.status(401).json({
        statusCode: 401,
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    if (user.isBanned) {
      return res.status(403).json({
        statusCode: 403,
        success: false,
        message: 'Your account has been suspended by an administrator.',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('[requireAuth Error]:', error);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      message: 'Failed to authenticate request.',
    });
  }
};

export const optionalAuth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const user = await resolveUserFromHeaders(req);
    if (user && !user.isBanned) {
      req.user = user;
    }
    next();
  } catch {
    next();
  }
};

export const requireRole = (allowedRoles: ('USER' | 'MODERATOR' | 'ADMIN')[] = ['ADMIN']) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        statusCode: 401,
        success: false,
        message: 'Authentication required.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        statusCode: 403,
        success: false,
        message: `Access denied. Requires one of: ${allowedRoles.join(', ')}.`,
      });
    }

    next();
  };
};

export default {
  requireAuth,
  optionalAuth,
  requireRole,
};
