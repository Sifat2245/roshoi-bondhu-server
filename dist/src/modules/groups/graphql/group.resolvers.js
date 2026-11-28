import { GroupService } from '../group.service.js';
export const groupResolvers = {
    Query: {
        groups: async (_parent, args, context) => {
            const currentUserId = context.currentUser?.id;
            const groups = await GroupService.getGroups(args.search, args.myGroups, currentUserId);
            return groups.map((g) => ({
                ...g,
                createdAt: g.createdAt instanceof Date ? g.createdAt.toISOString() : String(g.createdAt || ''),
            }));
        },
        group: async (_parent, args, context) => {
            const currentUserId = context.currentUser?.id;
            const role = context.currentUser?.role;
            const group = await GroupService.getGroupBySlug(args.slug, currentUserId, role);
            if (!group)
                return null;
            return {
                ...group,
                createdAt: group.createdAt instanceof Date ? group.createdAt.toISOString() : String(group.createdAt || ''),
            };
        },
    },
    Mutation: {
        createGroup: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            return await GroupService.createGroup(context.currentUser.id, {
                name: args.name,
                description: args.description,
                privacy: args.privacy || 'PUBLIC',
                coverImage: args.coverImage,
                avatar: args.avatar,
                invitedUserIds: args.invitedUserIds,
            });
        },
        joinGroup: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            await GroupService.joinGroup(context.currentUser.id, args.groupId);
            return true;
        },
        leaveGroup: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            await GroupService.leaveGroup(context.currentUser.id, args.groupId);
            return true;
        },
        updateGroupMemberRole: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            return await GroupService.updateMemberRole(context.currentUser.id, context.currentUser.role, args.groupId, args.memberId, args.role);
        },
        removeGroupMember: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            return await GroupService.removeMember(context.currentUser.id, context.currentUser.role, args.groupId, args.memberId);
        },
        addGroupMember: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            return await GroupService.addMember(context.currentUser.id, context.currentUser.role, args.groupId, args.userId, args.role || 'MEMBER');
        },
        updateGroupCover: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            return await GroupService.updateGroupCover(context.currentUser.id, context.currentUser.role, args.groupId, args.coverImage);
        },
        updateGroupSettings: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            return await GroupService.updateGroupSettings(context.currentUser.id, context.currentUser.role, args.groupId, args.input || {});
        },
        transferGroupOwnership: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            return await GroupService.transferGroupOwnership(context.currentUser.id, args.groupId, args.newOwnerUserId);
        },
        updateGroupLifecycle: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            return await GroupService.updateGroupLifecycle(context.currentUser.id, args.groupId, args.action);
        },
    },
    Group: {
        membersCount: (g) => g._count?.members ?? g.memberCount ?? g.membersCount ?? (g.members?.length || 0),
        postsCount: (g) => g._count?.posts ?? g.postCount ?? g.postsCount ?? 0,
        ownerId: (g) => g.ownerId || g.createdById || null,
        owner: (g) => g.owner || g.createdBy || null,
        isMember: (g, _args, context) => {
            if (g.isMember !== undefined)
                return g.isMember;
            if (g.myMembership)
                return Boolean(g.myMembership.isApproved);
            if (context.currentUser?.id) {
                const effectiveOwnerId = g.ownerId || g.createdById;
                if (effectiveOwnerId === context.currentUser.id)
                    return true;
                if (g.members && Array.isArray(g.members)) {
                    return g.members.some((m) => (m.userId === context.currentUser?.id || m.user?.id === context.currentUser?.id) &&
                        m.isApproved);
                }
            }
            return false;
        },
        currentUserRole: (g, _args, context) => {
            if (g.currentUserRole !== undefined)
                return g.currentUserRole;
            const effectiveOwnerId = g.ownerId || g.createdById;
            if (context.currentUser?.id && effectiveOwnerId === context.currentUser.id)
                return 'ADMIN';
            if (g.myMembership)
                return g.myMembership.role;
            if (context.currentUser?.id) {
                if (g.members && Array.isArray(g.members)) {
                    const m = g.members.find((x) => x.userId === context.currentUser?.id || x.user?.id === context.currentUser?.id);
                    return m?.role || null;
                }
            }
            return null;
        },
        canModerate: (g, _args, context) => {
            if (g.canModerate !== undefined)
                return g.canModerate;
            const effectiveOwnerId = g.ownerId || g.createdById;
            if (context.currentUser?.id && effectiveOwnerId === context.currentUser.id)
                return true;
            if (g.myMembership && ['ADMIN', 'MODERATOR'].includes(g.myMembership.role))
                return true;
            return false;
        },
        createdBy: (g) => g.createdBy || null,
        archivedAt: (g) => g.archivedAt instanceof Date ? g.archivedAt.toISOString() : g.archivedAt ? String(g.archivedAt) : null,
        createdAt: (g) => g.createdAt instanceof Date ? g.createdAt.toISOString() : g.createdAt ? String(g.createdAt) : null,
    },
};
export default groupResolvers;
