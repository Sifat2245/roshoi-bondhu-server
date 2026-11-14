import type { GraphQLContext } from '../../../graphql/graphql.types.js';
import { UserService } from '../user.service.js';

export const userResolvers = {
  Query: {
    me: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      if (!context.currentUser) return null;
      try {
        return await UserService.getUserProfile(context.currentUser.id, context.currentUser.id);
      } catch {
        return context.currentUser;
      }
    },

    userProfile: async (
      _parent: unknown,
      args: { id?: string; username?: string },
      context: GraphQLContext
    ) => {
      const target = args.username || args.id;
      if (!target) {
        if (context.currentUser) {
          return await UserService.getUserProfile(context.currentUser.id, context.currentUser.id);
        }
        return null;
      }
      return await UserService.getUserProfile(target, context.currentUser?.id);
    },

    userPreferences: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      if (!context.currentUser) return null;
      return await UserService.getPreferences(context.currentUser.id);
    },
  },

  Mutation: {
    updateProfile: async (
      _parent: unknown,
      args: { input: any },
      context: GraphQLContext
    ) => {
      if (!context.currentUser) {
        throw new Error('Authentication required.');
      }
      const updated = await UserService.updateProfile(context.currentUser.id, args.input);
      return await UserService.getUserProfile(context.currentUser.id, context.currentUser.id);
    },

    updatePreferences: async (
      _parent: unknown,
      args: { input: any },
      context: GraphQLContext
    ) => {
      if (!context.currentUser) {
        throw new Error('Authentication required.');
      }
      return await UserService.updatePreferences(context.currentUser.id, args.input);
    },

    toggleFollow: async (
      _parent: unknown,
      args: { targetUserId: string },
      context: GraphQLContext
    ) => {
      if (!context.currentUser) {
        throw new Error('Authentication required.');
      }
      return await UserService.toggleFollow(context.currentUser.id, args.targetUserId);
    },
  },

  UserProfile: {
    birthDate: (u: any) =>
      u.birthDate instanceof Date ? u.birthDate.toISOString() : u.birthDate ? String(u.birthDate) : null,
    createdAt: (u: any) =>
      u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt ? String(u.createdAt) : null,
  },
};

export default userResolvers;
