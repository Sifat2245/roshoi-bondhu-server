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

  type GroupPendingInviteSummary {
    id: ID!
    role: String!
    inviter: GroupMemberUser
    createdAt: String
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
    joinMode: String
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
    myMembershipStatus: String
    myPendingInvite: GroupPendingInviteSummary
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
    joinMode: String
    requiresPostApproval: Boolean
    challengeCreatorPolicy: String
  }

  type GroupJoinRequestUser {
    id: ID!
    name: String!
    image: String
    bio: String
  }

  type GroupJoinRequestItem {
    id: ID!
    groupId: ID!
    userId: ID!
    role: String!
    isApproved: Boolean!
    createdAt: String!
    user: GroupJoinRequestUser
  }

  type GroupPendingInvitationItem {
    id: ID!
    groupId: ID!
    inviterId: ID!
    inviteeId: ID!
    role: String!
    status: String!
    createdAt: String!
    inviter: GroupMemberUser
    invitee: GroupMemberUser
  }

  type GroupInviteLinkItem {
    id: ID!
    groupId: ID!
    token: String!
    isStaffLink: Boolean!
    useCount: Int!
    createdAt: String!
    expiresAt: String
  }

  type GroupInvitePreviewGroup {
    id: ID!
    name: String!
    slug: String!
    privacy: String!
    avatar: String
    coverImage: String
    membersCount: Int
  }

  type GroupInvitePreview {
    valid: Boolean!
    reason: String
    isStaffInvite: Boolean
    requiresAdminApproval: Boolean
    membershipStatus: String
    joinMode: String
    inviter: GroupMemberUser
    group: GroupInvitePreviewGroup
  }

  type GroupJoinResult {
    success: Boolean!
    isApproved: Boolean!
    status: String!
    groupSlug: String
  }

  type Query {
    groups(search: String, myGroups: Boolean): [Group!]!
    group(slug: String!): Group
    groupJoinRequests(groupId: ID!): [GroupJoinRequestItem!]!
    groupPendingInvitations(groupId: ID!): [GroupPendingInvitationItem!]!
    groupInvitePreview(slug: String!, token: String!): GroupInvitePreview!
    groupInviteLink(groupId: ID!): GroupInviteLinkItem
  }

  type GroupInvitationResult {
    id: ID!
    groupId: ID!
    inviteeId: ID!
    role: String!
    status: String!
  }

  type Mutation {
    createGroup(
      name: String!
      description: String
      privacy: String
      joinMode: String
      coverImage: String
      avatar: String
      invitedUserIds: [ID!]
    ): Group!
    joinGroup(groupId: ID!): GroupJoinResult!
    leaveGroup(groupId: ID!): Boolean!
    handleGroupJoinRequest(groupId: ID!, memberId: ID!, action: String!): Boolean!
    updateGroupMemberRole(groupId: ID!, memberId: ID!, role: String!): GroupMember!
    removeGroupMember(groupId: ID!, memberId: ID!): Boolean!
    addGroupMember(groupId: ID!, userId: ID!, role: String): GroupMember!
    inviteGroupMember(groupId: ID!, userId: ID!, role: String): GroupInvitationResult!
    respondGroupInvitation(invitationId: ID!, action: String!): GroupJoinResult!
    cancelGroupInvitation(groupId: ID!, invitationId: ID!): Boolean!
    regenerateGroupInviteLink(groupId: ID!): GroupInviteLinkItem!
    revokeGroupInviteLink(groupId: ID!, linkId: ID): Boolean!
    acceptGroupInviteLink(token: String!): GroupJoinResult!
    updateGroupCover(groupId: ID!, coverImage: String!): Group!
    updateGroupSettings(groupId: ID!, input: UpdateGroupSettingsInput!): Group!
    transferGroupOwnership(groupId: ID!, newOwnerUserId: ID!): Group!
    updateGroupLifecycle(groupId: ID!, action: String!): Group!
  }
`;
export default groupTypeDefs;
