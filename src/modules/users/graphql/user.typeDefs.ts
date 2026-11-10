export const userTypeDefs = /* GraphQL */ `
  type UserProfile {
    id: ID!
    name: String!
    email: String!
    image: String
    bio: String
    coverImage: String
    phone: String
    emailVerified: Boolean
    role: String!
  }

  type Query {
    me: UserProfile
  }
`;

export default userTypeDefs;

