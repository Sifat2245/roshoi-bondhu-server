import express, { type Request, type Response } from 'express';
import { toNodeHandler } from 'better-auth/node';
import auth from './lib/auth.js';
import prisma from './lib/prisma.js';
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

// 6. Backward Compatibility for Legacy Frontend Routes
app.get('/AllRecipes', async (_req: Request, res: Response) => {
  try {
    const recipes = await prisma.post.findMany({
      where: { postType: 'RECIPE', status: 'PUBLISHED' },
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, name: true, image: true, email: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });
    res.json(
      recipes.map((r: any) => ({
        _id: r.id,
        id: r.id,
        title: r.title,
        image: r.image,
        ingredients: r.ingredients,
        instructions: r.instructions,
        preparationTime: r.preparationTime,
        cuisine: r.cuisine,
        categories: r.categories,
        likeCount: r._count.likes,
        userName: r.author.name,
        userEmail: r.author.email,
        userPhoto: r.author.image,
        createdAt: r.createdAt,
      }))
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/top-recipes', async (_req: Request, res: Response) => {
  try {
    const recipes = await prisma.post.findMany({
      where: { postType: 'RECIPE', status: 'PUBLISHED' },
      take: 8,
      include: {
        author: { select: { id: true, name: true, image: true, email: true } },
        _count: { select: { likes: true, comments: true } },
      },
      orderBy: { likes: { _count: 'desc' } },
    });
    res.json(
      recipes.map((r: any) => ({
        _id: r.id,
        id: r.id,
        title: r.title,
        image: r.image,
        ingredients: r.ingredients,
        instructions: r.instructions,
        preparationTime: r.preparationTime,
        cuisine: r.cuisine,
        categories: r.categories,
        likeCount: r._count.likes,
        userName: r.author.name,
        userEmail: r.author.email,
        userPhoto: r.author.image,
        createdAt: r.createdAt,
      }))
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/AllRecipes/:id', async (req: Request, res: Response) => {
  try {
    const recipeId = req.params.id as string;
    const r: any = await prisma.post.findUnique({
      where: { id: recipeId },
      include: {
        author: { select: { id: true, name: true, image: true, email: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });
    if (!r) return res.status(404).json({ error: 'Recipe not found' });
    res.json({
      _id: r.id,
      id: r.id,
      title: r.title,
      image: r.image,
      ingredients: r.ingredients,
      instructions: r.instructions,
      preparationTime: r.preparationTime,
      cuisine: r.cuisine,
      categories: r.categories,
      likeCount: r._count?.likes || 0,
      userName: r.author?.name,
      userEmail: r.author?.email,
      userPhoto: r.author?.image,
      createdAt: r.createdAt,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Root Information Endpoint
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

// 7. Centralized Error Handling Middleware
app.use(errorHandler);

export default app;
