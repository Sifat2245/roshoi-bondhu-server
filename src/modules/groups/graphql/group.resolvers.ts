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
      args: {
        name: string;
        description?: string;
        privacy?: string;
        coverImage?: string;
        avatar?: string;
      },
      context: GraphQLContext
    ) => {
      if (!context.currentUser) {
        throw new Error('Authentication required.');
      }
      return await GroupService.createGroup(context.currentUser.id, {
        name: args.name,
        description: args.description,
        privacy: (args.privacy as any) || 'PUBLIC',
        coverImage: args.coverImage,
        avatar: args.avatar,
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

    updateGroupMemberRole: async (
      _parent: unknown,
      args: { groupId: string; memberId: string; role: string },
      context: GraphQLContext
    ) => {
      if (!context.currentUser) {
        throw new Error('Authentication required.');
      }
      return await GroupService.updateMemberRole(
        context.currentUser.id,
        context.currentUser.role,
        args.groupId,
        args.memberId,
        args.role as any
      );
    },

    removeGroupMember: async (
      _parent: unknown,
      args: { groupId: string; memberId: string },
      context: GraphQLContext
    ) => {
      if (!context.currentUser) {
        throw new Error('Authentication required.');
      }
      return await GroupService.removeMember(
        context.currentUser.id,
        context.currentUser.role,
        args.groupId,
        args.memberId
      );
    },

    addGroupMember: async (
      _parent: unknown,
      args: { groupId: string; userId: string; role?: string },
      context: GraphQLContext
    ) => {
      if (!context.currentUser) {
        throw new Error('Authentication required.');
      }
      return await GroupService.addMember(
        context.currentUser.id,
        context.currentUser.role,
        args.groupId,
        args.userId,
        (args.role as any) || 'MEMBER'
      );
    },

    updateGroupCover: async (
      _parent: unknown,
      args: { groupId: string; coverImage: string },
      context: GraphQLContext
    ) => {
      if (!context.currentUser) {
        throw new Error('Authentication required.');
      }
      return await GroupService.updateGroupCover(
        context.currentUser.id,
        context.currentUser.role,
        args.groupId,
        args.coverImage
      );
    },
  },

  Group: {
    membersCount: (g: any) => g._count?.members ?? g.memberCount ?? g.membersCount ?? (g.members?.length || 0),
    postsCount: (g: any) => g._count?.posts ?? g.postCount ?? g.postsCount ?? 0,
    isMember: (g: any, _args: unknown, context: GraphQLContext) => {
      if (g.isMember !== undefined) return g.isMember;
      if (g.myMembership) return Boolean(g.myMembership.isApproved);
      if (context.currentUser?.id) {
        if (g.createdById === context.currentUser.id) return true;
        if (g.members && Array.isArray(g.members)) {
          return g.members.some(
            (m: any) =>
              (m.userId === context.currentUser?.id || m.user?.id === context.currentUser?.id) &&
              m.isApproved
          );
        }
      }
      return false;
    },
    currentUserRole: (g: any, _args: unknown, context: GraphQLContext) => {
      if (g.currentUserRole !== undefined) return g.currentUserRole;
      if (g.myMembership) return g.myMembership.role;
      if (context.currentUser?.id) {
        if (g.createdById === context.currentUser.id) return 'ADMIN';
        if (g.members && Array.isArray(g.members)) {
          const m = g.members.find(
            (x: any) => x.userId === context.currentUser?.id || x.user?.id === context.currentUser?.id
          );
          return m?.role || null;
        }
      }
      return null;
    },
    canModerate: (g: any, _args: unknown, context: GraphQLContext) => {
      if (g.canModerate !== undefined) return g.canModerate;
      if (context.currentUser?.id && g.createdById === context.currentUser.id) return true;
      if (g.myMembership && ['ADMIN', 'MODERATOR'].includes(g.myMembership.role)) return true;
      return false;
    },
    createdBy: (g: any) => g.createdBy || null,
    createdAt: (g: any) =>
      g.createdAt instanceof Date ? g.createdAt.toISOString() : g.createdAt ? String(g.createdAt) : null,
  },
};

export default groupResolvers;
