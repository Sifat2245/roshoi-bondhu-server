import type { GraphQLContext } from '../../../graphql/graphql.types.js';
import { AdminService } from '../admin.service.js';

export const reportResolvers = {
  Mutation: {
    submitReport: async (
      _parent: unknown,
      args: { targetType: string; targetId: string; reason: string },
      context: GraphQLContext
    ) => {
      if (!context.currentUser) {
        throw new Error('Authentication required.');
      }
      return await AdminService.submitReport(
        context.currentUser.id,
        args.targetType,
        args.targetId,
        args.reason
      );
    },
  },
};

