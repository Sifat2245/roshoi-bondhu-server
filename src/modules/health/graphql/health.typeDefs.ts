export const healthTypeDefs = /* GraphQL */ `
  type HealthStatus {
    status: String!
    uptime: Float!
    timestamp: String!
    environment: String!
  }

  type Query {
    health: HealthStatus!
  }
`;

export default healthTypeDefs;

