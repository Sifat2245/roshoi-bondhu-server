export const reportTypeDefs = /* GraphQL */ `
  type Report {
    id: ID!
    reporterId: String!
    targetType: String!
    targetId: String!
    reason: String!
    status: String!
    createdAt: String!
    updatedAt: String
  }

  type Mutation {
    submitReport(targetType: String!, targetId: String!, reason: String!): Report!
  }
`;

