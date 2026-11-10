import dotenv from 'dotenv';

dotenv.config();

export interface EnvConfig {
  NODE_ENV: string;
  PORT: number;
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  CLIENT_URL: string;
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
}

export const env: EnvConfig = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5000', 10),
  DATABASE_URL: process.env.DATABASE_URL || '',
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || 'hesheli-super-secret-key-fallback',
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || 'http://localhost:5000',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
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
};

export const envVariables = env;
export default env;
