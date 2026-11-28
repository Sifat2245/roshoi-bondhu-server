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

    groupJoinRequests: async (
      _parent: unknown,
      args: { groupId: string },
      context: GraphQLContext
    ) => {
      if (!context.currentUser) throw new Error('Authentication required.');
      return await GroupService.getGroupJoinRequests(
        context.currentUser.id,
        context.currentUser.role,
        args.groupId
      );
    },

    groupPendingInvitations: async (
      _parent: unknown,
      args: { groupId: string },
      context: GraphQLContext
    ) => {
      if (!context.currentUser) throw new Error('Authentication required.');
      return await GroupService.getGroupPendingInvitations(
        context.currentUser.id,
        context.currentUser.role,
        args.groupId
      );
    },

    groupInvitePreview: async (
      _parent: unknown,
      args: { slug: string; token: string },
      context: GraphQLContext
    ) => {
      return await GroupService.getGroupInvitePreview(
        args.slug,
        args.token,
        context.currentUser?.id
      );
    },

    groupInviteLink: async (
      _parent: unknown,
      args: { groupId: string },
      context: GraphQLContext
    ) => {
      if (!context.currentUser) throw new Error('Authentication required.');
      const link = await GroupService.getOrCreateInviteLink(
        context.currentUser.id,
        context.currentUser.role,
        args.groupId
      );
      return {
        ...link,
        createdAt: link.createdAt instanceof Date ? link.createdAt.toISOString() : String(link.createdAt || ''),
        expiresAt: link.expiresAt ? new Date(link.expiresAt).toISOString() : null,
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
        joinMode?: string;
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
        joinMode: (args.joinMode as any) || 'DIRECT',
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
      const res = await GroupService.joinGroup(context.currentUser.id, args.groupId);
      return {
        success: true,
        isApproved: Boolean(res.isApproved),
        status: res.isApproved ? 'JOINED' : 'PENDING_APPROVAL',
      };
    },

    handleGroupJoinRequest: async (
      _parent: unknown,
      args: { groupId: string; memberId: string; action: string },
      context: GraphQLContext
    ) => {
      if (!context.currentUser) throw new Error('Authentication required.');
      const action = args.action.toUpperCase() === 'APPROVE' ? 'APPROVE' : 'REJECT';
      await GroupService.handleJoinRequest(
        context.currentUser.id,
        context.currentUser.role,
        args.groupId,
        args.memberId,
        action
      );
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

    inviteGroupMember: async (
      _parent: unknown,
      args: { groupId: string; userId: string; role?: string },
      context: GraphQLContext
    ) => {
      if (!context.currentUser) {
        throw new Error('Authentication required.');
      }
      return await GroupService.inviteMember(
        context.currentUser.id,
        context.currentUser.role,
        args.groupId,
        args.userId,
        (args.role as any) || 'MEMBER'
      );
    },

    respondGroupInvitation: async (
      _parent: unknown,
      args: { invitationId: string; action: string },
      context: GraphQLContext
    ) => {
      if (!context.currentUser) {
        throw new Error('Authentication required.');
      }
      const action = args.action.toUpperCase() === 'ACCEPT' ? 'ACCEPT' : 'DECLINE';
      const res = await GroupService.respondToInvitation(
        context.currentUser.id,
        args.invitationId,
        action
      );
      return {
        success: true,
        isApproved: Boolean(res.isApproved),
        status: res.status || (res.isApproved ? 'ACCEPTED' : 'DECLINED'),
        groupSlug: res.groupSlug || null,
      };
    },

    cancelGroupInvitation: async (
      _parent: unknown,
      args: { groupId: string; invitationId: string },
      context: GraphQLContext
    ) => {
      if (!context.currentUser) throw new Error('Authentication required.');
      return await GroupService.cancelGroupInvitation(
        context.currentUser.id,
        context.currentUser.role,
        args.groupId,
        args.invitationId
      );
    },

    regenerateGroupInviteLink: async (
      _parent: unknown,
      args: { groupId: string },
      context: GraphQLContext
    ) => {
      if (!context.currentUser) throw new Error('Authentication required.');
      const link = await GroupService.regenerateInviteLink(
        context.currentUser.id,
        context.currentUser.role,
        args.groupId
      );
      return {
        ...link,
        createdAt: link.createdAt instanceof Date ? link.createdAt.toISOString() : String(link.createdAt || ''),
        expiresAt: link.expiresAt ? new Date(link.expiresAt).toISOString() : null,
      };
    },

    revokeGroupInviteLink: async (
      _parent: unknown,
      args: { groupId: string; linkId?: string },
      context: GraphQLContext
    ) => {
      if (!context.currentUser) throw new Error('Authentication required.');
      return await GroupService.revokeInviteLink(
        context.currentUser.id,
        context.currentUser.role,
        args.groupId,
        args.linkId
      );
    },

    acceptGroupInviteLink: async (
      _parent: unknown,
      args: { token: string },
      context: GraphQLContext
    ) => {
      if (!context.currentUser) throw new Error('Authentication required.');
      const res = await GroupService.acceptGroupInviteLink(
        context.currentUser.id,
        args.token
      );
      return {
        success: true,
        isApproved: Boolean(res.isApproved),
        status: res.status,
        groupSlug: res.groupSlug,
      };
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
    joinMode: (g: any) => g.joinMode || 'DIRECT',
    myMembershipStatus: (g: any, _args: unknown, context: GraphQLContext) => {
      if (g.myMembershipStatus !== undefined) return g.myMembershipStatus;
      const effectiveOwnerId = g.ownerId || g.createdById;
      if (context.currentUser?.id && effectiveOwnerId === context.currentUser.id) return 'APPROVED';
      if (g.myMembership) return g.myMembership.isApproved ? 'APPROVED' : 'PENDING';
      return 'NONE';
    },
    myPendingInvite: (g: any) => g.myPendingInvite || null,
    currentUserRole: (g: any, _args: unknown, context: GraphQLContext) => {
      if (g.currentUserRole !== undefined) return g.currentUserRole;
      const effectiveOwnerId = g.ownerId || g.createdById;
      if (context.currentUser?.id && effectiveOwnerId === context.currentUser.id) return 'ADMIN';
      if (g.myMembership) return g.myMembership.isApproved ? g.myMembership.role : null;
      if (context.currentUser?.id) {
        if (g.members && Array.isArray(g.members)) {
          const m = g.members.find(
            (x: any) =>
              (x.userId === context.currentUser?.id || x.user?.id === context.currentUser?.id) &&
              x.isApproved
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
      if (g.myMembership?.isApproved && ['ADMIN', 'MODERATOR'].includes(g.myMembership.role)) {
        return true;
      }
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
