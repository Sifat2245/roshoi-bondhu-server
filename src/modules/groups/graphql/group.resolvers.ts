import type { GraphQLContext } from '../../../graphql/graphql.types.js';
import { GroupService } from '../group.service.js';

export const groupResolvers = {
  Query: {
    groups: async (
      _parent: unknown,
      args: { search?: string; myGroups?: boolean },
      context: GraphQLContext
    ) => {
      const currentUserId = context.currentUser?.id;
      const groups = await GroupService.getGroups(args.search, args.myGroups, currentUserId);
      return groups.map((g: any) => ({
        ...g,
        createdAt: g.createdAt instanceof Date ? g.createdAt.toISOString() : String(g.createdAt || ''),
      }));
    },

    group: async (
      _parent: unknown,
      args: { slug: string },
      context: GraphQLContext
    ) => {
      const currentUserId = context.currentUser?.id;
      const role = context.currentUser?.role;
      const group = await GroupService.getGroupBySlug(args.slug, currentUserId, role);
      if (!group) return null;
      return {
        ...group,
        createdAt: group.createdAt instanceof Date ? group.createdAt.toISOString() : String(group.createdAt || ''),
      };
    },
  },

  Mutation: {
    createGroup: async (
      _parent: unknown,
      args: { name: string; description?: string; privacy?: string },
      context: GraphQLContext
    ) => {
      if (!context.currentUser) {
        throw new Error('Authentication required.');
      }
      return await GroupService.createGroup(context.currentUser.id, {
        name: args.name,
        description: args.description,
        privacy: (args.privacy as any) || 'PUBLIC',
      });
    },

    joinGroup: async (
      _parent: unknown,
      args: { groupId: string },
      context: GraphQLContext
    ) => {
      if (!context.currentUser) {
        throw new Error('Authentication required.');
      }
      await GroupService.joinGroup(context.currentUser.id, args.groupId);
      return true;
    },

    leaveGroup: async (
      _parent: unknown,
      args: { groupId: string },
      context: GraphQLContext
    ) => {
      if (!context.currentUser) {
        throw new Error('Authentication required.');
      }
      await GroupService.leaveGroup(context.currentUser.id, args.groupId);
      return true;
    },
  },

  Group: {
    membersCount: (g: any) => g._count?.members ?? g.membersCount ?? 0,
    postsCount: (g: any) => g._count?.posts ?? g.postsCount ?? 0,
    createdAt: (g: any) =>
      g.createdAt instanceof Date ? g.createdAt.toISOString() : g.createdAt ? String(g.createdAt) : null,
  },
};

export default groupResolvers;

