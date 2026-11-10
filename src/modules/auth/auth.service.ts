import prisma from '../../lib/prisma.js';
import auth from '../../lib/auth.js';
import tokenUtils from '../../shared/utils/token.js';
import jwtUtils from '../../shared/utils/jwt.js';
import cookieUtils from '../../shared/utils/cookie.js';
import { envVariables } from '../../config/env.js';
import { AppError, UnauthorizedError, ValidationError, ForbiddenError } from '../../shared/errors/app-error.js';
import type { Request, Response } from 'express';
import crypto from 'crypto';

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface VerifyOtpInput {
  email: string;
  otp: string;
}

export interface ResetPasswordInput {
  email: string;
  otp: string;
  password: string;
}

const signup = async (data: SignupInput) => {
  const { name, email, password, phone } = data;

  if (!email || !email.includes('@')) {
    throw new ValidationError('A valid email address is required.');
  }
  if (!name || name.trim().length < 2) {
    throw new ValidationError('Full name is required.');
  }
  if (!password || password.length < 6) {
    throw new ValidationError('Password must be at least 6 characters.');
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: { accounts: true },
  });

  if (existingUser) {
    if (existingUser.emailVerified) {
      throw new ValidationError('An account with this email already exists. Please log in.');
    } else {
      // Re-trigger OTP verification for unverified account
      try {
        await (auth.api as any).sendVerificationOTP({
          body: { email: normalizedEmail, type: 'email-verification' },
        });
      } catch (err) {
        console.warn('[Signup Resend OTP Warning]:', err);
      }

      return {
        success: true,
        message: 'Account already created. A new 6-digit verification code has been sent to your email.',
        email: normalizedEmail,
        requiresVerification: true,
      };
    }
  }

  // Create user via Better Auth with emailOTP plugin
  const result = await auth.api.signUpEmail({
    body: {
      name: name.trim(),
      email: normalizedEmail,
      password,
    },
  });

  if (!result || !result.user) {
    throw new AppError('Failed to create account. Please try again.', 500);
  }

  // If user provided a phone number optionally, save it in transaction
  if (phone && phone.trim()) {
    await prisma.user.update({
      where: { id: result.user.id },
      data: { phone: phone.trim() },
    });
  }

  return {
    success: true,
    message: 'Account created successfully! Please check your email for the 6-digit verification code.',
    email: normalizedEmail,
    requiresVerification: true,
  };
};

const verifyOTP = async (data: VerifyOtpInput, res: Response) => {
  const { email, otp } = data;

  if (!email || !otp) {
    throw new ValidationError('Both email and 6-digit verification code are required.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const cleanOtp = otp.trim();

  // Call Better Auth emailOTP plugin verifyEmailOTP
  let verifyResult: any;
  try {
    verifyResult = await (auth.api as any).verifyEmailOTP({
      body: {
        email: normalizedEmail,
        otp: cleanOtp,
      },
    });
  } catch (err: any) {
    throw new ValidationError(err.message || 'Invalid or expired verification code.');
  }

  if (!verifyResult || !verifyResult.status) {
    throw new ValidationError('Verification code is invalid or has expired.');
  }

  // Fetch full user record
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      role: true,
      image: true,
      bio: true,
      coverImage: true,
      phone: true,
      isBanned: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new AppError('User not found after verification.', 404);
  }

  // Create persistent session (10 years)
  const sessionToken = crypto.randomUUID();
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      token: sessionToken,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    },
  });

  // Generate non-expiring JWT token
  const token = tokenUtils.generateUserToken({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    image: user.image,
  });

  // Set secure HTTPS cookies
  tokenUtils.setAccessTokenCookie(res, token);
  tokenUtils.setBetterAuthSessionCookie(res, sessionToken);

  return {
    success: true,
    message: 'Email verified successfully! You are now logged in.',
    user,
    token,
    session: {
      id: session.id,
      token: session.token,
      expiresAt: session.expiresAt,
    },
  };
};

const resendOTP = async (email: string) => {
  if (!email || !email.includes('@')) {
    throw new ValidationError('A valid email address is required to resend the code.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    throw new ValidationError('No account found with this email.');
  }

  if (user.emailVerified) {
    throw new ValidationError('This account is already verified. Please log in.');
  }

  await (auth.api as any).sendVerificationOTP({
    body: {
      email: normalizedEmail,
      type: 'email-verification',
    },
  });

  return {
    success: true,
    message: 'A fresh 6-digit code has been sent to your email address.',
    email: normalizedEmail,
  };
};

const forgotPassword = async (email: string) => {
  if (!email || !email.includes('@')) {
    throw new ValidationError('A valid email address is required.');
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Better Auth creates the verification record and triggers sendVerificationOTP({ type: 'forget-password' })
  await (auth.api as any).requestPasswordResetEmailOTP({
    body: { email: normalizedEmail },
  });

  return {
    success: true,
    message: 'If an account exists with this email, a 6-digit password reset code has been sent.',
    email: normalizedEmail,
  };
};

const resetPassword = async (data: ResetPasswordInput) => {
  const { email, otp, password } = data;

  if (!email || !otp || !password) {
    throw new ValidationError('Email, 6-digit verification code, and new password are required.');
  }

  if (password.length < 6) {
    throw new ValidationError('Password must be at least 6 characters long.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const cleanOtp = otp.trim();

  try {
    await (auth.api as any).resetPasswordEmailOTP({
      body: {
        email: normalizedEmail,
        otp: cleanOtp,
        password,
      },
    });
  } catch (err: any) {
    throw new ValidationError(err.message || 'Invalid or expired verification code.');
  }

  // Revoke active sessions for security as required by Phase 1 specification
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  if (user) {
    await prisma.session.deleteMany({
      where: { userId: user.id },
    });
  }

  return {
    success: true,
    message: 'Password reset successfully! You can now log in with your new password.',
  };
};

const login = async (data: LoginInput, res: Response) => {
  const { email, password } = data;

  if (!email || !password) {
    throw new ValidationError('Email and password are required.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const aliasEmail = normalizedEmail.endsWith('@hesheli.com')
    ? normalizedEmail.replace('@hesheli.com', '@heshel.com')
    : normalizedEmail.endsWith('@heshel.com')
    ? normalizedEmail.replace('@heshel.com', '@hesheli.com')
    : normalizedEmail;

  // Find user in database with domain alias flexibility
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: normalizedEmail }, { email: aliasEmail }],
    },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      role: true,
      image: true,
      bio: true,
      coverImage: true,
      phone: true,
      isBanned: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new UnauthorizedError('Invalid email or password.');
  }

  if (user.isBanned) {
    throw new ForbiddenError('Your account has been suspended. Please contact support.');
  }

  // Check email verification status
  if (!user.emailVerified) {
    try {
      await (auth.api as any).sendVerificationOTP({
        body: { email: normalizedEmail, type: 'email-verification' },
      });
    } catch (err) {
      console.warn('[Login Unverified OTP Resend]:', err);
    }

    return {
      success: false,
      requiresVerification: true,
      email: user.email,
      message: 'Your email is not verified yet. We have sent a 6-digit verification code to your email.',
    };
  }

  // Authenticate password with Better Auth
  let signInResponse: any;
  try {
    signInResponse = await auth.api.signInEmail({
      body: {
        email: user.email,
        password,
      },
      asResponse: true,
    });
  } catch (err: any) {
    throw new UnauthorizedError(err.message || 'Invalid email or password.');
  }

  if (!signInResponse || !signInResponse.ok) {
    let errMessage = 'Invalid email or password.';
    try {
      const errJson = await signInResponse.json();
      if (errJson?.message) errMessage = errJson.message;
    } catch {}
    throw new UnauthorizedError(errMessage);
  }

  // Forward all Better Auth session cookies to Express response
  const setCookieHeaders = typeof signInResponse.headers.getSetCookie === 'function'
    ? signInResponse.headers.getSetCookie()
    : [signInResponse.headers.get('set-cookie')].filter(Boolean);

  for (const cookie of setCookieHeaders) {
    res.append('Set-Cookie', cookie);
  }

  let signInData: any = {};
  try {
    signInData = await signInResponse.json();
  } catch {}

  const sessionToken = signInData?.session?.token || crypto.randomUUID();

  // Generate non-expiring JWT token
  const token = tokenUtils.generateUserToken({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    image: user.image,
  });

  // Set secure HTTPS cookies
  tokenUtils.setAccessTokenCookie(res, token);

  return {
    success: true,
    message: 'Logged in successfully.',
    user,
    token,
    session: signInData?.session || {
      token: sessionToken,
    },
  };
};

const logout = async (userIdOrReq?: string | Request, res?: Response) => {
  let req: Request | undefined;
  let resolvedUserId: string | undefined;
  let rawSessionToken: string | undefined;

  if (typeof userIdOrReq === 'string') {
    resolvedUserId = userIdOrReq;
  } else if (userIdOrReq && typeof userIdOrReq === 'object') {
    req = userIdOrReq as Request;
    resolvedUserId = (req as any)?.user?.id;
  }

  if (req) {
    if (!resolvedUserId) {
      const authHeader = req.headers?.authorization;
      const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
      const cookieToken = (req.cookies as any)?.accessToken || cookieUtils.getCookie(req, 'accessToken');
      const token = bearerToken || cookieToken;

      if (token) {
        const decoded = jwtUtils.decodeToken(token) as any;
        if (decoded?.id) resolvedUserId = decoded.id;
      }
    }

    const sessionCookie = (req.cookies as any)?.['heshel.session_token'] ||
      (req ? cookieUtils.getCookie(req, 'heshel.session_token') : undefined);

    if (sessionCookie) {
      rawSessionToken = sessionCookie.split('.')[0];
    }
  }

  if (resolvedUserId) {
    await prisma.session.deleteMany({
      where: { userId: resolvedUserId },
    });
  }
  if (rawSessionToken) {
    await prisma.session.deleteMany({
      where: { token: rawSessionToken },
    });
  }

  if (res) {
    tokenUtils.clearAuthCookies(res, req);
  }

  return {
    success: true,
    message: 'Logged out successfully.',
  };
};

const getMe = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      image: true,
      bio: true,
      coverImage: true,
      phone: true,
      role: true,
      isBanned: true,
      createdAt: true,
      _count: {
        select: {
          posts: { where: { status: 'PUBLISHED' } },
          followers: true,
          following: true,
          createdGroups: true,
        },
      },
    },
  });

  if (!user) {
    throw new UnauthorizedError('User account not found.');
  }

  return {
    ...user,
    postsCount: user._count.posts,
    followersCount: user._count.followers,
    followingCount: user._count.following,
    createdGroupsCount: user._count.createdGroups,
  };
};

export const AuthService = {
  signup,
  verifyOTP,
  resendOTP,
  forgotPassword,
  resetPassword,
  login,
  logout,
  getMe,
};

export default AuthService;
