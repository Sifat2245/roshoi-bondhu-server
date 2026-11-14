import { FriendsService } from '../friends.service.js';
export const friendsResolvers = {
    Query: {
        friends: async (_parent, args, context) => {
            const currentUserId = context.currentUser?.id;
            const targetUserId = args.userId || currentUserId;
            if (!targetUserId)
                return [];
            const resolvedId = await FriendsService.resolveUserId(targetUserId, currentUserId);
            const friends = await FriendsService.getFriends(resolvedId, currentUserId, args.search);
            return friends.map((f) => ({
                id: f.id,
                name: f.name,
                email: f.email || '',
                image: f.image || null,
                bio: f.bio || '',
                mutualCount: f.mutualCount ?? 0,
            }));
        },
        friendRequests: async (_parent, _args, context) => {
            if (!context.currentUser)
                return [];
            const requests = await FriendsService.getFriendRequests(context.currentUser.id);
            return requests.map((r) => ({
                id: r.id,
                senderId: r.senderId,
                receiverId: r.receiverId,
                status: r.status,
                sender: {
                    id: r.sender?.id,
                    name: r.sender?.name,
                    image: r.sender?.image,
                    username: r.sender?.profile?.username,
                    city: r.sender?.profile?.city,
                    bio: r.sender?.profile?.bio,
                },
                mutualFriendsCount: r.mutualFriendsCount ?? 0,
                createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt || ''),
            }));
        },
        friendSuggestions: async (_parent, args, context) => {
            if (!context.currentUser)
                return [];
            const suggestions = await FriendsService.getSuggestions(context.currentUser.id, args.limit || 20);
            return suggestions.map((s) => ({
                id: s.id,
                name: s.name,
                email: s.email || '',
                image: s.image || null,
                bio: s.bio || s.profile?.bio || '',
                mutualCount: s.mutualFriendsCount ?? s.mutualCount ?? 0,
            }));
        },
        blockedUsers: async (_parent, _args, context) => {
            if (!context.currentUser)
                return [];
            const blocked = await FriendsService.getBlockedUsers(context.currentUser.id);
            return blocked.map((b) => ({
                id: b.id,
                name: b.name,
                username: b.username || '',
                image: b.image || null,
                blockedAt: b.blockedAt instanceof Date ? b.blockedAt.toISOString() : String(b.blockedAt || ''),
            }));
        },
        relationshipStatus: async (_parent, args, context) => {
            if (!context.currentUser) {
                return {
                    status: 'NONE',
                    friendsCount: 0,
                    mutualCount: 0,
                    mutualSample: [],
                };
            }
            return await FriendsService.getRelationshipStatus(context.currentUser.id, args.targetUserId);
        },
    },
    Mutation: {
        sendFriendRequest: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            return await FriendsService.sendFriendRequest(context.currentUser.id, args.receiverId);
        },
        acceptFriendRequest: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            await FriendsService.acceptFriendRequest(context.currentUser.id, args.requestId);
            return true;
        },
        declineFriendRequest: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            await FriendsService.declineFriendRequest(context.currentUser.id, args.requestId);
            return true;
        },
        cancelFriendRequest: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            await FriendsService.cancelFriendRequest(context.currentUser.id, args.receiverId);
            return true;
        },
        unfriend: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            await FriendsService.unfriend(context.currentUser.id, args.friendId);
            return true;
        },
        blockUser: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            await FriendsService.blockUser(context.currentUser.id, args.userId);
            return true;
        },
        unblockUser: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            await FriendsService.unblockUser(context.currentUser.id, args.userId);
            return true;
        },
    },
};
export default friendsResolvers;
