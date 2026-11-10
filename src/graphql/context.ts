import type { YogaInitialContext } from 'graphql-yoga';
import auth from '../lib/auth.js';
import prisma from '../lib/prisma.js';
import jwtUtils from '../shared/utils/jwt.js';
import { env } from '../config/env.js';
import type { GraphQLContext, GraphQLUser } from './graphql.types.js';

export const createContext = async (initialContext: YogaInitialContext): Promise<GraphQLContext> => {
  let currentUser: GraphQLUser | null = null;
  let session: any | null = null;

  try {
    const headers = initialContext.request.headers;
    const authHeader = headers.get('authorization');
    let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

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
              isBanned: true,
              bio: true,
              coverImage: true,
              phone: true,
              emailVerified: true,
            },
          });
          if (user && !user.isBanned) {
            currentUser = user as GraphQLUser;
          }
        }
      } catch {
        // Fall back to session check
      }
    }

    if (!currentUser) {
      const authSession = await auth.api.getSession({
        headers: headers as any,
      });

      if (authSession?.user) {
        currentUser = authSession.user as GraphQLUser;
        session = authSession.session;
      }
    }
  } catch (err) {
    // Unauthenticated queries continue safely with null user
  }

  return {
    ...initialContext,
    prisma,
    currentUser,
    session,
  };
};

export default createContext;
