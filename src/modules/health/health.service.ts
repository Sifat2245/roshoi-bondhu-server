import { env } from '../../config/env.js';

export interface HealthResult {
  status: string;
  uptime: number;
  timestamp: string;
  environment: string;
}

export const healthService = {
  getHealth: (): HealthResult => ({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  }),
};

export default healthService;

