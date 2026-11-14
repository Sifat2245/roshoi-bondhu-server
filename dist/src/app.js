import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { toNodeHandler } from 'better-auth/node';
import auth from './lib/auth.js';
import corsMiddleware from './config/cors.js';
import yoga from './graphql/yoga.js';
import appRouter from './routes.js';
import errorHandler from './middleware/error-handler.js';
import { env } from './config/env.js';
const app = express();
// Trust reverse proxy for accurate IP identification behind CDNs/load balancers
app.set('trust proxy', 1);
// 1. HTTP Security Headers via Helmet
app.use(helmet({
    contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
    crossOriginEmbedderPolicy: false,
}));
// 2. Cross-Origin Resource Sharing
app.use(corsMiddleware);
// 3. Security Rate Limiters
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 40, // 40 attempts per 15 min window
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        statusCode: 429,
        success: false,
        message: 'Too many authentication attempts. Please try again after 15 minutes.',
    },
});
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 600, // 600 requests per 15 min window
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        statusCode: 429,
        success: false,
        message: 'Too many requests. Please slow down and try again later.',
    },
});
// 4. Better Auth Route Handler (Protected with strict auth limiter)
app.all('/api/auth/{*splat}', authLimiter, toNodeHandler(auth));
// 5. GraphQL Yoga Endpoint (Protected with api limiter)
app.use(yoga.graphqlEndpoint, apiLimiter, yoga);
// 6. Express Body Parsers (For REST API endpoints)
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
// 7. Modular Application REST Routes (/api/v1 and /api)
app.use('/api/v1', apiLimiter, appRouter);
app.use('/api', apiLimiter, appRouter);
// 6. Root & Health Information Endpoint
app.get('/', (_req, res) => {
    res.json({
        message: 'Welcome to Heshel (হেঁশেল) Culinary Network API Server',
        status: 'online',
        architecture: 'Modular Monolith with GraphQL Yoga and Better Auth',
        graphql: '/graphql',
        database: 'PostgreSQL (Prisma ORM)',
        auth: 'Better Auth',
    });
});
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// 7. Centralized Error Handling Middleware
app.use(errorHandler);
export default app;
