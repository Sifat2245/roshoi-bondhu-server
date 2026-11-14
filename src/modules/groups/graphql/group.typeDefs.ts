export const groupTypeDefs = /* GraphQL */ `
  type GroupMemberUser {
    id: ID!
    name: String!
    image: String
  }

  type GroupMember {
    id: ID!
    userId: ID!
    user: GroupMemberUser
    role: String!
    isApproved: Boolean!
  }

  type Group {
    id: ID!
    name: String!
    slug: String!
    description: String
    coverImage: String
    avatar: String
    privacy: String!
    requiresPostApproval: Boolean
    createdById: ID!
    members: [GroupMember!]
    membersCount: Int
    postsCount: Int
    isMember: Boolean
    currentUserRole: String
    createdAt: String
  }

  type Query {
    groups(search: String, myGroups: Boolean): [Group!]!
    group(slug: String!): Group
  }

  type Mutation {
    createGroup(name: String!, description: String, privacy: String): Group!
    joinGroup(groupId: ID!): Boolean!
    leaveGroup(groupId: ID!): Boolean!
  }
`;

export default groupTypeDefs;

