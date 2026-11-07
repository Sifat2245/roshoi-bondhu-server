import type { YogaInitialContext } from 'graphql-yoga';
import auth from '../lib/auth.js';
import prisma from '../lib/prisma.js';
import type { GraphQLContext, GraphQLUser } from './graphql.types.js';

export const createContext = async (initialContext: YogaInitialContext): Promise<GraphQLContext> => {
  let currentUser: GraphQLUser | null = null;
  let session: any | null = null;

  try {
    const headers = initialContext.request.headers;
    const authSession = await auth.api.getSession({
      headers,
    });

    if (authSession?.user) {
      currentUser = authSession.user as GraphQLUser;
      session = authSession.session;
    }
  } catch (err) {
    // Unauthenticated queries (such as public health check) continue safely with null user
  }

  return {
    ...initialContext,
    prisma,
    currentUser,
    session,
  };
};

export default createContext;

