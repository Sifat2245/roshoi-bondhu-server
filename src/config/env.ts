import dotenv from 'dotenv';

dotenv.config();

export interface EnvConfig {
  NODE_ENV: string;
  PORT: number;
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  CLIENT_URL: string;
  CORS_ORIGINS?: string;
  COOKIE_DOMAIN?: string;
  JWT_ACCESS_SECRET: string;
  JWT_ACCESS_EXPIRES_IN: any;
  JWT_REFRESH_SECRET: string;
  JWT_REFRESH_EXPIRES_IN: any;
  BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN: any;
  CLOUDINARY_CLOUD_NAME?: string;
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;
  // SMTP Configuration
  SMTP_HOST?: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM: string;
  // Realtime Socket.IO
  SOCKET_ENABLED: boolean;
  SOCKET_PATH: string;
  SOCKET_CORS_ORIGIN: string;
  SOCKET_PING_INTERVAL: number;
  SOCKET_PING_TIMEOUT: number;
  // Optional Web Push (VAPID)
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}

export const env: EnvConfig = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5000', 10),
  DATABASE_URL: process.env.DATABASE_URL || '',
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || 'hesheli-super-secret-key-fallback',
  BETTER_AUTH_URL:
    process.env.BETTER_AUTH_URL ||
    (process.env.VERCEL ? 'https://heshel-server.vercel.app' : 'http://localhost:5000'),
  CLIENT_URL:
    process.env.CLIENT_URL ||
    (process.env.NODE_ENV === 'production'
      ? 'https://heshel-server-fg2v.vercel.app'
      : 'http://localhost:5173'),
  CORS_ORIGINS: process.env.CORS_ORIGINS,
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN,
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'hesheli-access-secret',
  JWT_ACCESS_EXPIRES_IN: (process.env.JWT_ACCESS_EXPIRES_IN || '15m') as any,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'hesheli-refresh-secret',
  JWT_REFRESH_EXPIRES_IN: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as any,
  BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN: (process.env.BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN || '7d') as any,
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM || '"Heshel • হেঁশেল" <no-reply@heshel.com>',
  SOCKET_ENABLED: process.env.SOCKET_ENABLED !== 'false' && process.env.VERCEL !== '1',
  SOCKET_PATH: process.env.SOCKET_PATH || '/socket.io',
  SOCKET_CORS_ORIGIN:
    process.env.SOCKET_CORS_ORIGIN ||
    process.env.CLIENT_URL ||
    (process.env.NODE_ENV === 'production'
      ? 'https://heshel-server-fg2v.vercel.app'
      : 'http://localhost:5173'),
  SOCKET_PING_INTERVAL: parseInt(process.env.SOCKET_PING_INTERVAL || '25000', 10),
  SOCKET_PING_TIMEOUT: parseInt(process.env.SOCKET_PING_TIMEOUT || '20000', 10),
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
  VAPID_SUBJECT: process.env.VAPID_SUBJECT,
};

// Strict production validation: abort startup if essential secrets are missing or using dev fallbacks
if (env.NODE_ENV === 'production') {
  const missingOrInsecure: string[] = [];
  if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET === 'hesheli-super-secret-key-fallback') {
    missingOrInsecure.push('BETTER_AUTH_SECRET');
  }
  if (!process.env.JWT_ACCESS_SECRET || process.env.JWT_ACCESS_SECRET === 'hesheli-access-secret') {
    missingOrInsecure.push('JWT_ACCESS_SECRET');
  }
  if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET === 'hesheli-refresh-secret') {
    missingOrInsecure.push('JWT_REFRESH_SECRET');
  }
  if (!process.env.DATABASE_URL) {
    missingOrInsecure.push('DATABASE_URL');
  }
  if (missingOrInsecure.length > 0) {
    throw new Error(
      `[CRITICAL SECURITY] Production environment is missing required secure secrets: ${missingOrInsecure.join(', ')}. Server startup aborted.`
    );
  }
}

export const envVariables = env;
export default env;
