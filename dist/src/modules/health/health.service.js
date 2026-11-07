import { env } from '../../config/env.js';
export const healthService = {
    getHealth: () => ({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        environment: env.NODE_ENV,
    }),
};
export default healthService;
