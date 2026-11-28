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
    discoverability: String
    status: String
    requiresPostApproval: Boolean
    challengeCreatorPolicy: String
    version: Int
    archivedAt: String
    ownerId: ID
    owner: GroupMemberUser
    createdById: ID
    createdBy: GroupMemberUser
    members: [GroupMember!]
    membersCount: Int
    postsCount: Int
    isMember: Boolean
    currentUserRole: String
    canModerate: Boolean
    pendingRequestsCount: Int
    pendingPostsCount: Int
    createdAt: String
  }

  input UpdateGroupSettingsInput {
    name: String
    description: String
    coverImage: String
    avatar: String
    privacy: String
    discoverability: String
    requiresPostApproval: Boolean
    challengeCreatorPolicy: String
  }

  type Query {
    groups(search: String, myGroups: Boolean): [Group!]!
    group(slug: String!): Group
  }

  type Mutation {
    createGroup(
      name: String!
      description: String
      privacy: String
      coverImage: String
      avatar: String
      invitedUserIds: [ID!]
    ): Group!
    joinGroup(groupId: ID!): Boolean!
    leaveGroup(groupId: ID!): Boolean!
    updateGroupMemberRole(groupId: ID!, memberId: ID!, role: String!): GroupMember!
    removeGroupMember(groupId: ID!, memberId: ID!): Boolean!
    addGroupMember(groupId: ID!, userId: ID!, role: String): GroupMember!
    updateGroupCover(groupId: ID!, coverImage: String!): Group!
    updateGroupSettings(groupId: ID!, input: UpdateGroupSettingsInput!): Group!
    transferGroupOwnership(groupId: ID!, newOwnerUserId: ID!): Group!
    updateGroupLifecycle(groupId: ID!, action: String!): Group!
  }
`;

export default groupTypeDefs;
