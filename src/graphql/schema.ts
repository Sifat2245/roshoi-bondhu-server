import { createSchema } from 'graphql-yoga';
import { healthTypeDefs } from '../modules/health/graphql/health.typeDefs.js';
import { healthResolvers } from '../modules/health/graphql/health.resolvers.js';
import { userTypeDefs } from '../modules/users/graphql/user.typeDefs.js';
import { userResolvers } from '../modules/users/graphql/user.resolvers.js';

export const schema = createSchema({
  typeDefs: [healthTypeDefs, userTypeDefs],
  resolvers: [healthResolvers, userResolvers],
});

export default schema;

