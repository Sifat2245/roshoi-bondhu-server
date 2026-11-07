import { healthService } from '../health.service.js';

export const healthResolvers = {
  Query: {
    health: () => healthService.getHealth(),
  },
};

export default healthResolvers;

