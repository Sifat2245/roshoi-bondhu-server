export const postTypeDefs = /* GraphQL */ `
  enum PostType {
    CASUAL
    RECIPE
    REPOST
    POLL
  }

  enum PostAudience {
    PUBLIC
    FRIENDS
    ONLY_ME
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  type PostAuthor {
    id: ID!
    name: String!
    email: String
    image: String
    role: String
    bio: String
  }

  type PostGroup {
    id: ID!
    name: String!
    slug: String!
    avatar: String
    privacy: String
  }

  type PostCommentReply {
    id: ID!
    postId: ID!
    userId: String
    user: PostAuthor
    content: String!
    likeCount: Int
    hasLiked: Boolean
    createdAt: String!
    updatedAt: String
  }

  type PostComment {
    id: ID!
    postId: ID!
    userId: String
    user: PostAuthor
    parentId: ID
    content: String!
    likeCount: Int
    hasLiked: Boolean
    replies: [PostCommentReply!]
    createdAt: String!
    updatedAt: String
  }

  type PollOption {
    id: ID!
    pollId: ID!
    text: String!
    voteCount: Int!
    voterIds: [String!]!
    hasVoted: Boolean
    voters: [PostAuthor!]
  }

  type Poll {
    id: ID!
    postId: ID!
    authorId: String
    question: String!
    multiple: Boolean!
    closed: Boolean!
    expiresAt: String
    totalVotes: Int!
    options: [PollOption!]!
    createdAt: String!
    updatedAt: String
  }

  type OriginalPost {
    id: ID!
    authorId: String!
    author: PostAuthor
    postType: PostType
    caption: String
    title: String
    image: String
    images: [String!]
    cuisine: String
    preparationTime: Int
    servings: Int
    ingredients: [String!]
    instructions: [String!]
    isCommentDisabled: Boolean
    poll: Poll
    createdAt: String
  }

  type Post {
    id: ID!
    authorId: String!
    author: PostAuthor
    groupId: String
    group: PostGroup
    postType: PostType
    status: String
    audience: PostAudience
    caption: String
    title: String
    image: String
    images: [String!]
    ingredients: [String!]
    instructions: [String!]
    preparationTime: Int
    servings: Int
    cuisine: String
    categories: [String!]
    originalPostId: String
    originalPost: OriginalPost
    poll: Poll
    likeCount: Int
    commentCount: Int
    repostCount: Int
    hasLiked: Boolean
    isCommentDisabled: Boolean
    comments: [PostComment!]
    daysRemaining: Int
    deletedAt: String
    createdAt: String!
    updatedAt: String
  }

  type PostEdge {
    cursor: String!
    node: Post!
  }

  type PostConnection {
    edges: [PostEdge!]!
    pageInfo: PageInfo!
    totalCount: Int
  }

  type LikeResult {
    liked: Boolean!
    likeCount: Int!
  }

  type DeleteResult {
    success: Boolean!
    id: ID!
  }

  input CreatePollInput {
    question: String!
    options: [String!]!
    multiple: Boolean
    expiresAt: String
  }

  input UpdatePollInput {
    question: String
    options: [String!]
    multiple: Boolean
    closed: Boolean
    expiresAt: String
  }

  input CreatePostInput {
    postType: PostType
    audience: PostAudience
    caption: String
    title: String
    image: String
    images: [String!]
    ingredients: [String!]
    instructions: [String!]
    preparationTime: Int
    servings: Int
    cuisine: String
    categories: [String!]
    groupId: ID
    poll: CreatePollInput
  }

  input UpdatePostInput {
    caption: String
    title: String
    audience: PostAudience
    image: String
    images: [String!]
    ingredients: [String!]
    instructions: [String!]
    preparationTime: Int
    servings: Int
    cuisine: String
    poll: UpdatePollInput
  }

  type Query {
    feed(
      first: Int
      after: String
      type: String
      cuisine: String
      search: String
      authorId: ID
      groupId: ID
      filter: String
    ): PostConnection!

    post(id: ID!): Post

    trash(
      first: Int
      after: String
    ): PostConnection!
  }

  type Mutation {
    createPost(input: CreatePostInput!): Post!
    updatePost(id: ID!, input: UpdatePostInput!): Post!
    repostPost(originalPostId: ID!, caption: String, audience: PostAudience): Post!
    toggleLike(postId: ID!): LikeResult!
    toggleCommentLike(commentId: ID!): LikeResult!
    toggleCommentsDisabled(postId: ID!): Post!
    createComment(postId: ID!, content: String!, parentId: ID): PostComment!
    updateComment(id: ID!, content: String!): PostComment!
    deleteComment(id: ID!): Boolean!
    votePoll(pollId: ID!, optionId: ID!): Poll!
    togglePollStatus(pollId: ID!): Poll!
    updatePoll(id: ID!, input: UpdatePollInput!): Poll!
    deletePoll(id: ID!): Boolean!
    deletePost(postId: ID!): DeleteResult!
    restorePost(postId: ID!): Post!
    permanentDeletePost(postId: ID!): DeleteResult!
    emptyTrash: Boolean!
  }
`;

export default postTypeDefs;

