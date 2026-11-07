import type { GraphQLContext } from '../../../graphql/graphql.types.js';

export const userResolvers = {
  Query: {
    me: (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      return context.currentUser;
    },
  },
};

export default userResolvers;

