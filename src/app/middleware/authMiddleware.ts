import type { Request, Response, NextFunction } from 'express';
import auth from '../lib/auth.js';
import prisma from '../lib/prisma.js';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role: 'USER' | 'MODERATOR' | 'ADMIN';
  isBanned: boolean;
  bio?: string | null;
  coverImage?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      session?: any;
    }
  }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await auth.api.getSession({
      headers: req.headers as any,
    });

    if (!session || !session.user) {
      return res.status(401).json({
        statusCode: 401,
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    const freshUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        isBanned: true,
        bio: true,
        coverImage: true,
      },
    });

    if (!freshUser) {
      return res.status(401).json({
        statusCode: 401,
        success: false,
        message: 'User no longer exists.',
      });
    }

    if (freshUser.isBanned) {
      return res.status(403).json({
        statusCode: 403,
        success: false,
        message: 'Your account has been suspended by an administrator.',
      });
    }

    req.user = freshUser as AuthenticatedUser;
    req.session = session.session;
    next();
  } catch (error) {
    console.error('[requireAuth Error]:', error);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      message: 'Failed to authenticate session.',
    });
  }
};

export const optionalAuth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const session = await auth.api.getSession({
      headers: req.headers as any,
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
          isBanned: true,
        },
      });

      if (user && !user.isBanned) {
        req.user = user as AuthenticatedUser;
        req.session = session.session;
      }
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

