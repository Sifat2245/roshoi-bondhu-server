import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { emailOTP, bearer, twoFactor } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import prisma from './prisma.js';
import { env } from '../config/env.js';
import EmailService from '../shared/services/email.service.js';

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [
    env.CLIENT_URL,
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
  ],
  emailAndPassword: {
    enabled: true,
    autoSignIn: false, // Require email OTP verification before activating full session
    requireEmailVerification: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 365, // 1 year (within 400 days cookie spec) - persistent until user logs out
    updateAge: 60 * 60 * 24 * 30, // 30 days
  },
  advanced: {
    useSecureCookies: env.NODE_ENV === 'production',
    cookiePrefix: 'heshel',
  },
  plugins: [
    bearer(),
    passkey({
      rpName: 'Heshel',
      rpID: env.NODE_ENV === 'production' ? new URL(env.CLIENT_URL).hostname : 'localhost',
      origin: [
        env.CLIENT_URL,
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:3000',
      ],
    }),
    twoFactor({
      issuer: 'Heshel',
      otpOptions: {
        async sendOTP({ user, otp }) {
          await EmailService.sendTwoFactorOtpEmail(user.email, otp);
        },
      },
    }),
    emailOTP({
      expiresIn: 600, // 10 minutes (600 seconds)
      sendVerificationOnSignUp: true,
      generateOTP: () => Math.floor(100000 + Math.random() * 900000).toString(), // 6-digit numeric OTP
      async sendVerificationOTP({ email, otp, type }) {
        await EmailService.sendOtpEmail({ email, otp, type });
      },
    }),
    {
      id: 'token-logout-cleanup',
      hooks: {
        after: [
          {
            matcher(context: any) {
              return context.path?.startsWith('/sign-out');
            },
            handler: async (c: any) => {
              const isProd = env.NODE_ENV === 'production';
              const clearCookie = (name: string) => {
                const cookieStr = `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=${isProd ? 'None; Secure' : 'Lax'}`;
                if (typeof c.setCookie === 'function') {
                  try {
                    c.setCookie(name, '', { path: '/', maxAge: 0, httpOnly: true, secure: isProd });
                  } catch {}
                } else if (c.responseHeaders?.append) {
                  c.responseHeaders.append('Set-Cookie', cookieStr);
                }
              };
              clearCookie('accessToken');
              clearCookie('refreshToken');
              clearCookie('betterAuthSession');
              clearCookie('heshel.session_token');
            },
          },
        ],
      },
    },
  ],
  user: {
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'USER',
        input: false,
      },
      phone: {
        type: 'string',
        required: false,
      },
      bio: {
        type: 'string',
        required: false,
      },
      coverImage: {
        type: 'string',
        required: false,
      },
      isBanned: {
        type: 'boolean',
        defaultValue: false,
        input: false,
      },
    },
  },
});

export default auth;
