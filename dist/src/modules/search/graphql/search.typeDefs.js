export const searchTypeDefs = /* GraphQL */ `
  enum SearchTargetType {
    KEYWORD
    USER
    GROUP
  }

  type RecentSearchUser {
    id: ID!
    name: String!
    image: String
    role: String
    username: String
    city: String
    work: String
  }

  type RecentSearchGroup {
    id: ID!
    name: String!
    slug: String!
    avatar: String
    privacy: String!
  }

  type RecentSearchItem {
    id: ID!
    query: String!
    targetType: SearchTargetType!
    targetId: String
    user: RecentSearchUser
    group: RecentSearchGroup
    createdAt: String!
    updatedAt: String!
  }

  type UserSearchResult {
    id: ID!
    name: String!
    username: String
    email: String
    image: String
    bio: String
    role: String
    city: String
    work: String
    education: String
    followersCount: Int
    mutualFriendsCount: Int
    friendshipStatus: String
    isFollowing: Boolean
    isMe: Boolean
  }

  type GroupSearchResult {
    id: ID!
    name: String!
    slug: String!
    avatar: String
    coverImage: String
    description: String
    privacy: String!
    membersCount: Int!
    isMember: Boolean!
    membershipStatus: String
  }

  type SearchSuggestions {
    users: [UserSearchResult!]!
    groups: [GroupSearchResult!]!
  }

  input SearchPostsFilterInput {
    recentPosts: Boolean
    datePosted: String
    postsFrom: String
    taggedLocation: String
  }

  type GlobalSearchResults {
    users: [UserSearchResult!]!
    groups: [GroupSearchResult!]!
    posts: [Post!]!
    totalUsers: Int!
    totalGroups: Int!
    totalPosts: Int!
  }

  type Query {
    recentSearches(limit: Int): [RecentSearchItem!]!
    searchSuggestions(query: String!): SearchSuggestions!
    searchAll(query: String!, postFilters: SearchPostsFilterInput): GlobalSearchResults!
  }

  type Mutation {
    saveRecentSearch(query: String!, targetType: SearchTargetType!, targetId: String): RecentSearchItem!
    removeRecentSearch(id: ID!): Boolean!
    clearRecentSearches: Boolean!
  }
`;
export default searchTypeDefs;
