import { createSchema } from 'graphql-yoga';
import { healthTypeDefs } from '../modules/health/graphql/health.typeDefs.js';
import { healthResolvers } from '../modules/health/graphql/health.resolvers.js';
import { userTypeDefs } from '../modules/users/graphql/user.typeDefs.js';
import { userResolvers } from '../modules/users/graphql/user.resolvers.js';
import { postTypeDefs } from '../modules/posts/graphql/post.typeDefs.js';
import { postResolvers } from '../modules/posts/graphql/post.resolvers.js';
import { friendsTypeDefs } from '../modules/friends/graphql/friends.typeDefs.js';
import { friendsResolvers } from '../modules/friends/graphql/friends.resolvers.js';
import { groupTypeDefs } from '../modules/groups/graphql/group.typeDefs.js';
import { groupResolvers } from '../modules/groups/graphql/group.resolvers.js';
export const schema = createSchema({
    typeDefs: [healthTypeDefs, userTypeDefs, postTypeDefs, friendsTypeDefs, groupTypeDefs],
    resolvers: [healthResolvers, userResolvers, postResolvers, friendsResolvers, groupResolvers],
});
export default schema;
