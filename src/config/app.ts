import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import auth from '../app/lib/auth.js';
import routerIndex from '../app/router/index.js';
import prisma from '../app/lib/prisma.js';

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.CLIENT_URL,
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true); // Dev convenience
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  })
);

// Better Auth Route Handler
app.all('/api/auth/{*splat}', toNodeHandler(auth));

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Application Modular Router (Both /api/v1 and /api)
app.use('/api/v1', routerIndex);
app.use('/api', routerIndex);

// Backward Compatibility for Legacy Frontend Routes
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

app.get('/', (_req: Request, res: Response) => {
  res.json({
    message: 'Welcome to Hesheli (হেশেলী) Social Media Modular API Server',
    status: 'online',
    pattern: 'Modular Architecture (Controller-Service-Route)',
    database: 'PostgreSQL (NeonDB via Prisma Schema Folder)',
    auth: 'Better Auth',
  });
});

// Global Error Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Unhandled Server Error]:', err);
  res.status(err.statusCode || 500).json({
    statusCode: err.statusCode || 500,
    success: false,
    message: err.message || 'An unexpected internal server error occurred.',
  });
});

export default app;

