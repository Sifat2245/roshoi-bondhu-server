import { UserService } from '../user.service.js';
export const userResolvers = {
    Query: {
        me: async (_parent, _args, context) => {
            if (!context.currentUser)
                return null;
            try {
                return await UserService.getUserProfile(context.currentUser.id, context.currentUser.id);
            }
            catch {
                return context.currentUser;
            }
        },
        userProfile: async (_parent, args, context) => {
            const target = args.username || args.id;
            if (!target) {
                if (context.currentUser) {
                    return await UserService.getUserProfile(context.currentUser.id, context.currentUser.id);
                }
                return null;
            }
            return await UserService.getUserProfile(target, context.currentUser?.id);
        },
        userPreferences: async (_parent, _args, context) => {
            if (!context.currentUser)
                return null;
            return await UserService.getPreferences(context.currentUser.id);
        },
    },
    Mutation: {
        updateProfile: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            const updated = await UserService.updateProfile(context.currentUser.id, args.input);
            return await UserService.getUserProfile(context.currentUser.id, context.currentUser.id);
        },
        updatePreferences: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            return await UserService.updatePreferences(context.currentUser.id, args.input);
        },
        toggleFollow: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            return await UserService.toggleFollow(context.currentUser.id, args.targetUserId);
        },
    },
    UserProfile: {
        birthDate: (u) => u.birthDate instanceof Date ? u.birthDate.toISOString() : u.birthDate ? String(u.birthDate) : null,
        createdAt: (u) => u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt ? String(u.createdAt) : null,
    },
};
export default userResolvers;
