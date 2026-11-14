export const friendsTypeDefs = /* GraphQL */ `
  type Friend {
    id: ID!
    name: String!
    email: String
    image: String
    bio: String
    mutualCount: Int
  }

  type FriendshipRequestSender {
    id: ID!
    name: String!
    image: String
    username: String
    city: String
    bio: String
  }

  type FriendshipRequest {
    id: ID!
    senderId: String!
    receiverId: String!
    status: String!
    sender: FriendshipRequestSender
    mutualFriendsCount: Int
    createdAt: String!
  }

  type BlockedUser {
    id: ID!
    name: String!
    username: String
    image: String
    blockedAt: String!
  }

  type FriendRequestResult {
    success: Boolean!
    status: String!
    message: String
  }

  type RelationshipMutualSample {
    id: ID!
    name: String!
    image: String
  }

  type RelationshipStatus {
    status: String!
    requestId: String
    friendsCount: Int
    mutualCount: Int
    mutualSample: [RelationshipMutualSample!]
  }

  type Query {
    friends(userId: ID, search: String): [Friend!]!
    friendRequests: [FriendshipRequest!]!
    friendSuggestions(limit: Int): [Friend!]!
    blockedUsers: [BlockedUser!]!
    relationshipStatus(targetUserId: ID!): RelationshipStatus!
  }

  type Mutation {
    sendFriendRequest(receiverId: ID!): FriendRequestResult!
    acceptFriendRequest(requestId: ID!): Boolean!
    declineFriendRequest(requestId: ID!): Boolean!
    cancelFriendRequest(receiverId: ID!): Boolean!
    unfriend(friendId: ID!): Boolean!
    blockUser(userId: ID!): Boolean!
    unblockUser(userId: ID!): Boolean!
  }
`;
export default friendsTypeDefs;
