import type { YogaInitialContext } from 'graphql-yoga';
import type { PrismaClient } from '@prisma/client';

export interface GraphQLUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role: string;
  isBanned: boolean;
  bio?: string | null;
  coverImage?: string | null;
}

export interface GraphQLContext extends YogaInitialContext {
  prisma: PrismaClient;
  currentUser: GraphQLUser | null;
  session: any | null;
}

