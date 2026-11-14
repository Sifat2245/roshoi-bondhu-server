export const postTypeDefs = /* GraphQL */ `
  enum PostType {
    CASUAL
    RECIPE
    REPOST
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
    createdAt: String!
  }

  type PostComment {
    id: ID!
    postId: ID!
    userId: String
    user: PostAuthor
    parentId: ID
    content: String!
    replies: [PostCommentReply!]
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
    likeCount: Int
    commentCount: Int
    repostCount: Int
    hasLiked: Boolean
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
  }

  input UpdatePostInput {
    caption: String
    title: String
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
    createComment(postId: ID!, content: String!, parentId: ID): PostComment!
    deleteComment(id: ID!): Boolean!
    deletePost(postId: ID!): DeleteResult!
    restorePost(postId: ID!): Post!
    permanentDeletePost(postId: ID!): DeleteResult!
    emptyTrash: Boolean!
  }
`;
export default postTypeDefs;
