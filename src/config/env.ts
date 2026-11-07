import dotenv from "dotenv";
import ms from "ms";

dotenv.config();

type TokenExpiresIn = ms.StringValue;

const getTokenDuration = (
  name: string,
  fallback: TokenExpiresIn,
): TokenExpiresIn => {
  const value = (process.env[name] || fallback) as TokenExpiresIn;
  const milliseconds = ms(value);
  if (!Number.isFinite(milliseconds) || milliseconds < 1000) {
    throw new Error(`${name} must be a duration of at least one second, such as 1d.`);
  }
  return value;
};

interface EnvConfig {
  NODE_ENV: string;
  PORT: string;
  FRONTEND_URL: string;
  COOKIE_DOMAIN?: string;
  DATABASE_URL: string;
  DIRECT_URL: string;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_ACCESS_EXPIRES_IN: TokenExpiresIn;
  JWT_REFRESH_EXPIRES_IN: TokenExpiresIn;
  BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN: TokenExpiresIn;
  BETTER_AUTH_UPDATE_TOKEN_EXPIRES_IN: TokenExpiresIn;
  SEED_ADMIN_PASSWORD: string;
  SEED_MENTOR_PASSWORD: string;
  SEED_STUDENT_PASSWORD: string;
}

const localEnvVariables = (): EnvConfig => {
  const requiredEnvVariables = [
    "NODE_ENV",
    "PORT",
    "DATABASE_URL",
    "DIRECT_URL",
    "BETTER_AUTH_URL",
    "BETTER_AUTH_SECRET",
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
  ];

  requiredEnvVariables.forEach((variable) => {
    if (!process.env[variable]) {
      throw new Error(`Environment variable ${variable} is required`);
    }
  });

  return {
    NODE_ENV: process.env.NODE_ENV as string,
    PORT: process.env.PORT as string,
    FRONTEND_URL: new URL(process.env.FRONTEND_URL || "http://localhost:3000").origin,
    COOKIE_DOMAIN: process.env.COOKIE_DOMAIN?.trim() || undefined,
    DATABASE_URL: process.env.DATABASE_URL as string,
    DIRECT_URL: process.env.DIRECT_URL as string,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL as string,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET as string,
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET as string,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET as string,
    JWT_ACCESS_EXPIRES_IN: getTokenDuration("JWT_ACCESS_EXPIRES_IN", "1d"),
    JWT_REFRESH_EXPIRES_IN: getTokenDuration("JWT_REFRESH_EXPIRES_IN", "7d"),
    BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN: getTokenDuration(
      "BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN",
      "1d",
    ),
    BETTER_AUTH_UPDATE_TOKEN_EXPIRES_IN: getTokenDuration(
      "BETTER_AUTH_UPDATE_TOKEN_EXPIRES_IN",
      "1d",
    ),
    SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD || "Admin123!",
    SEED_MENTOR_PASSWORD: process.env.SEED_MENTOR_PASSWORD || "Mentor123!",
    SEED_STUDENT_PASSWORD: process.env.SEED_STUDENT_PASSWORD || "Student123!",
  };
};

export const envVariables = localEnvVariables();
