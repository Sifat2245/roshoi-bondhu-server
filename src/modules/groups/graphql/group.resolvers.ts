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
        invitedUserIds?: string[];
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
        invitedUserIds: args.invitedUserIds,
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

    updateGroupSettings: async (
      _parent: unknown,
      args: { groupId: string; input: any },
      context: GraphQLContext
    ) => {
      if (!context.currentUser) {
        throw new Error('Authentication required.');
      }
      return await GroupService.updateGroupSettings(
        context.currentUser.id,
        context.currentUser.role,
        args.groupId,
        args.input || {}
      );
    },

    transferGroupOwnership: async (
      _parent: unknown,
      args: { groupId: string; newOwnerUserId: string },
      context: GraphQLContext
    ) => {
      if (!context.currentUser) {
        throw new Error('Authentication required.');
      }
      return await GroupService.transferGroupOwnership(
        context.currentUser.id,
        args.groupId,
        args.newOwnerUserId
      );
    },

    updateGroupLifecycle: async (
      _parent: unknown,
      args: { groupId: string; action: 'PAUSE' | 'RESUME' | 'ARCHIVE' | 'DELETE' },
      context: GraphQLContext
    ) => {
      if (!context.currentUser) {
        throw new Error('Authentication required.');
      }
      return await GroupService.updateGroupLifecycle(
        context.currentUser.id,
        args.groupId,
        args.action
      );
    },
  },

  Group: {
    membersCount: (g: any) => g._count?.members ?? g.memberCount ?? g.membersCount ?? (g.members?.length || 0),
    postsCount: (g: any) => g._count?.posts ?? g.postCount ?? g.postsCount ?? 0,
    ownerId: (g: any) => g.ownerId || g.createdById || null,
    owner: (g: any) => g.owner || g.createdBy || null,
    isMember: (g: any, _args: unknown, context: GraphQLContext) => {
      if (g.isMember !== undefined) return g.isMember;
      if (g.myMembership) return Boolean(g.myMembership.isApproved);
      if (context.currentUser?.id) {
        const effectiveOwnerId = g.ownerId || g.createdById;
        if (effectiveOwnerId === context.currentUser.id) return true;
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
      const effectiveOwnerId = g.ownerId || g.createdById;
      if (context.currentUser?.id && effectiveOwnerId === context.currentUser.id) return 'ADMIN';
      if (g.myMembership) return g.myMembership.role;
      if (context.currentUser?.id) {
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
      const effectiveOwnerId = g.ownerId || g.createdById;
      if (context.currentUser?.id && effectiveOwnerId === context.currentUser.id) return true;
      if (g.myMembership && ['ADMIN', 'MODERATOR'].includes(g.myMembership.role)) return true;
      return false;
    },
    createdBy: (g: any) => g.createdBy || null,
    archivedAt: (g: any) =>
      g.archivedAt instanceof Date ? g.archivedAt.toISOString() : g.archivedAt ? String(g.archivedAt) : null,
    createdAt: (g: any) =>
      g.createdAt instanceof Date ? g.createdAt.toISOString() : g.createdAt ? String(g.createdAt) : null,
  },
};

export default groupResolvers;
