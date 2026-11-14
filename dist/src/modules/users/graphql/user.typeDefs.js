export const userTypeDefs = /* GraphQL */ `
  type UserProfile {
    id: ID!
    name: String!
    email: String!
    username: String
    image: String
    bio: String
    coverImage: String
    phone: String
    emailVerified: Boolean
    role: String!
    city: String
    work: String
    education: String
    gender: String
    birthDate: String
    hometown: String
    languages: String
    expertise: String
    hobbies: String
    interests: String
    website: String
    socialLinks: String
    contactVisibility: String
    birthdayVisibility: String
    recipesCount: Int
    postsCount: Int
    followersCount: Int
    followingCount: Int
    friendsCount: Int
    createdGroupsCount: Int
    isFollowing: Boolean
    isMe: Boolean
    twoFactorEnabled: Boolean
    emailOtpEnabled: Boolean
    totpEnabled: Boolean
    preferences: UserPreferences
    createdAt: String
  }

  type UserPreferences {
    id: ID
    theme: String
    locale: String
    timezone: String
    defaultPostAudience: String
    friendRequestPolicy: String
    messagePolicy: String
    twoFactorEnabled: Boolean
    highQualityUploads: Boolean
    hdrVideo: Boolean
    autoplay: String
    dataSaver: Boolean
    stepGalleryFullscreen: Boolean
    showNutritionOverlay: Boolean
    version: Int
  }

  type FollowResult {
    isFollowing: Boolean!
    followersCount: Int!
  }

  input UpdateProfileInput {
    name: String
    bio: String
    image: String
    coverImage: String
    city: String
    work: String
    education: String
    gender: String
    birthDate: String
    phone: String
    hometown: String
    languages: String
    expertise: String
    hobbies: String
    interests: String
    website: String
    socialLinks: String
    contactVisibility: String
    birthdayVisibility: String
  }

  input UpdatePreferencesInput {
    theme: String
    locale: String
    timezone: String
    defaultPostAudience: String
    friendRequestPolicy: String
    messagePolicy: String
    highQualityUploads: Boolean
    hdrVideo: Boolean
    autoplay: String
    dataSaver: Boolean
    stepGalleryFullscreen: Boolean
    showNutritionOverlay: Boolean
  }

  type Query {
    me: UserProfile
    userProfile(id: ID, username: String): UserProfile
    userPreferences: UserPreferences
  }

  type Mutation {
    updateProfile(input: UpdateProfileInput!): UserProfile!
    updatePreferences(input: UpdatePreferencesInput!): UserPreferences!
    toggleFollow(targetUserId: ID!): FollowResult!
  }
`;
export default userTypeDefs;
