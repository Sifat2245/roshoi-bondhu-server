import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../shared/errors/app-error.js';
import { env } from '../config/env.js';

export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const statusCode = err instanceof AppError ? err.statusCode : err.statusCode || 500;
  const message = err.message || 'An unexpected internal server error occurred.';
  const code = err instanceof AppError ? err.code : 'INTERNAL_SERVER_ERROR';

  if (env.NODE_ENV !== 'production' || statusCode >= 500) {
    console.error(`[Error Handler] [${code}]:`, err);
  }

  res.status(statusCode).json({
    statusCode,
    success: false,
    code,
    message,
    ...(env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

export default errorHandler;

