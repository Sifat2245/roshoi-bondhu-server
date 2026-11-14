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
    },
    Group: {
        membersCount: (g) => g._count?.members ?? g.membersCount ?? 0,
        postsCount: (g) => g._count?.posts ?? g.postsCount ?? 0,
        createdAt: (g) => g.createdAt instanceof Date ? g.createdAt.toISOString() : g.createdAt ? String(g.createdAt) : null,
    },
};
export default groupResolvers;
