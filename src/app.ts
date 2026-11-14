import express, { type Request, type Response } from 'express';
import { toNodeHandler } from 'better-auth/node';
import auth from './lib/auth.js';
import corsMiddleware from './config/cors.js';
import yoga from './graphql/yoga.js';
import appRouter from './routes.js';
import errorHandler from './middleware/error-handler.js';

const app = express();

// 1. Cross-Origin Resource Sharing
app.use(corsMiddleware);

// 2. Better Auth Route Handler (Must precede generic body parsers)
app.all('/api/auth/{*splat}', toNodeHandler(auth));

// 3. GraphQL Yoga Endpoint (Mounted at /graphql before body parser for clean stream handling)
app.use(yoga.graphqlEndpoint, yoga);

// 4. Express Body Parsers (For REST API endpoints)
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// 5. Modular Application REST Routes (/api/v1 and /api)
app.use('/api/v1', appRouter);
app.use('/api', appRouter);

// 6. Root & Health Information Endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    message: 'Welcome to Heshel (হেঁশেল) Culinary Network API Server',
    status: 'online',
    architecture: 'Modular Monolith with GraphQL Yoga and Better Auth',
    graphql: '/graphql',
    database: 'PostgreSQL (Prisma ORM)',
    auth: 'Better Auth',
  });
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 7. Centralized Error Handling Middleware
app.use(errorHandler);

export default app;
