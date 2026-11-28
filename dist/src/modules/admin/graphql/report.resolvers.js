import { AdminService } from '../admin.service.js';
export const reportResolvers = {
    Mutation: {
        submitReport: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            return await AdminService.submitReport(context.currentUser.id, args.targetType, args.targetId, args.reason);
        },
    },
};
