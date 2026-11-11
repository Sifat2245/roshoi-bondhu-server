import prisma from '../../lib/prisma.js';
import auth from '../../lib/auth.js';
import tokenUtils from '../../shared/utils/token.js';
import jwtUtils from '../../shared/utils/jwt.js';
import cookieUtils from '../../shared/utils/cookie.js';
import { envVariables } from '../../config/env.js';
import { AppError, UnauthorizedError, ValidationError, ForbiddenError, NotFoundError } from '../../shared/errors/app-error.js';
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
      status: true,
      deletedAt: true,
      deactivatedUntil: true,
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

  if (user.status === 'DELETED') {
    throw new ForbiddenError('This account has been deleted and can no longer be accessed.');
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

  // Reactivate account if it was deactivated
  let reactivated = false;
  if (user.status === 'DEACTIVATED') {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        status: 'ACTIVE',
        deactivatedUntil: null,
      },
    });
    reactivated = true;
  }

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
    message: reactivated ? 'Welcome back! Your account has been reactivated.' : 'Logged in successfully.',
    user: {
      ...user,
      status: 'ACTIVE',
      deactivatedUntil: null,
    },
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
      status: true,
      deletedAt: true,
      deactivatedUntil: true,
      isBanned: true,
      createdAt: true,
      profile: true,
      preferences: true,
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

  let profile = user.profile;
  if (!profile) {
    try {
      const defaultUsername = user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
      profile = await prisma.userProfile.create({
        data: {
          userId: user.id,
          username: defaultUsername,
          bio: user.bio || '',
          phone: user.phone || null,
        },
      });
    } catch {
      profile = null;
    }
  }

  return {
    ...user,
    username: profile?.username || user.email.split('@')[0],
    city: profile?.city || profile?.hometown || '',
    work: profile?.work || '',
    education: profile?.education || '',
    gender: profile?.gender || '',
    birthDate: profile?.birthDate || null,
    hometown: profile?.hometown || profile?.city || '',
    languages: profile?.languages || '',
    expertise: profile?.expertise || '',
    hobbies: profile?.hobbies || '',
    interests: profile?.interests || '',
    website: profile?.website || '',
    socialLinks: profile?.socialLinks || '',
    contactVisibility: profile?.contactVisibility || 'PUBLIC',
    birthdayVisibility: profile?.birthdayVisibility || 'FRIENDS',
    postsCount: user._count.posts,
    followersCount: user._count.followers,
    followingCount: user._count.following,
    createdGroupsCount: user._count.createdGroups,
  };
};

const changePassword = async (
  userId: string,
  data: { currentPassword?: string; newPassword?: string }
) => {
  const { currentPassword, newPassword } = data;
  if (!currentPassword || !newPassword) {
    throw new ValidationError('Current password and new password are required.');
  }
  if (newPassword.length < 6) {
    throw new ValidationError('New password must be at least 6 characters long.');
  }

  const account = await prisma.account.findFirst({
    where: { userId, providerId: 'credential' },
  });

  if (!account || !account.password) {
    throw new ValidationError('No password-based credential account found for this user.');
  }

  const { verifyPassword, hashPassword } = await import('better-auth/crypto');
  const isMatch = await verifyPassword({
    hash: account.password,
    password: currentPassword,
  });

  if (!isMatch) {
    throw new ValidationError('Current password does not match.');
  }

  const hashedPassword = await hashPassword(newPassword);

  await prisma.account.update({
    where: { id: account.id },
    data: { password: hashedPassword },
  });

  return {
    success: true,
    message: 'Password changed successfully! Please keep your new password safe.',
  };
};

function parseUserAgent(ua?: string | null): { device: string; type: 'MOBILE' | 'DESKTOP' } {
  if (!ua) return { device: 'Web Browser', type: 'DESKTOP' };

  const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(ua);
  let browser = 'Browser';
  if (/Edg/i.test(ua)) browser = 'Microsoft Edge';
  else if (/Chrome/i.test(ua)) browser = 'Google Chrome';
  else if (/Firefox/i.test(ua)) browser = 'Mozilla Firefox';
  else if (/Safari/i.test(ua)) browser = 'Apple Safari';

  let os = '';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Macintosh|Mac OS/i.test(ua)) os = 'macOS';
  else if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/iPad/i.test(ua)) os = 'iPad';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Linux/i.test(ua)) os = 'Linux';

  const device = os ? `${browser} on ${os}` : browser;
  return { device, type: isMobile ? 'MOBILE' : 'DESKTOP' };
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const getSessions = async (userId: string, currentToken?: string) => {
  const sessions = await prisma.session.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });

  if (!sessions.length) {
    return [
      {
        id: 'current-session',
        device: 'Current Web Browser',
        type: 'DESKTOP',
        ipAddress: '127.0.0.1',
        location: 'Dhaka, Bangladesh',
        lastActive: 'Active now',
        activeNow: true,
      },
    ];
  }

  return sessions.map((s, index) => {
    const isCurrent = currentToken ? s.token === currentToken : index === 0;
    const parsed = parseUserAgent(s.userAgent);
    return {
      id: s.id,
      device: parsed.device,
      type: parsed.type,
      ipAddress: s.ipAddress || '127.0.0.1',
      location: 'Dhaka, Bangladesh',
      lastActive: isCurrent ? 'Active now' : `Active ${formatRelativeTime(s.updatedAt || s.createdAt)}`,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      expiresAt: s.expiresAt,
      activeNow: isCurrent,
    };
  });
};

const revokeSession = async (userId: string, sessionId: string, currentToken?: string) => {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
  });

  if (!session || session.userId !== userId) {
    throw new NotFoundError('Session not found or already signed out.');
  }

  await prisma.session.delete({
    where: { id: sessionId },
  });

  const isCurrentSession = currentToken ? session.token === currentToken : false;

  return {
    success: true,
    isCurrentSession,
    message: isCurrentSession
      ? 'Current session revoked. You have been signed out.'
      : 'Device session revoked successfully.',
  };
};

const revokeOtherSessions = async (userId: string, currentToken?: string) => {
  if (currentToken) {
    await prisma.session.deleteMany({
      where: {
        userId,
        NOT: { token: currentToken },
      },
    });
  } else {
    const latest = await prisma.session.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    if (latest) {
      await prisma.session.deleteMany({
        where: {
          userId,
          NOT: { id: latest.id },
        },
      });
    }
  }

  return {
    success: true,
    message: 'Logged out of all other sessions successfully.',
  };
};

const deactivateAccount = async (
  userId: string,
  data: { password?: string; durationDays?: number | null },
  res?: Response,
  req?: Request
) => {
  const { password, durationDays } = data;
  if (!password) {
    throw new ValidationError('Password is required to confirm account deactivation.');
  }

  const account = await prisma.account.findFirst({
    where: { userId, providerId: 'credential' },
  });

  if (!account || !account.password) {
    throw new ValidationError('No password-based credential account found for this user.');
  }

  const { verifyPassword } = await import('better-auth/crypto');
  const isMatch = await verifyPassword({
    hash: account.password,
    password,
  });

  if (!isMatch) {
    throw new UnauthorizedError('Incorrect password. Please verify your current password.');
  }

  const deactivatedUntil =
    durationDays && durationDays > 0
      ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
      : null;

  await prisma.user.update({
    where: { id: userId },
    data: {
      status: 'DEACTIVATED',
      deactivatedUntil,
    },
  });

  // Revoke all active sessions for this user
  await prisma.session.deleteMany({
    where: { userId },
  });

  if (res) {
    tokenUtils.clearAuthCookies(res, req);
  }

  return {
    success: true,
    message: deactivatedUntil
      ? `Your account has been deactivated for ${durationDays} days. Logging in will reactivate it.`
      : 'Your account has been deactivated. Logging in anytime will reactivate it.',
  };
};

const deleteAccount = async (
  userId: string,
  data: { password?: string },
  res?: Response,
  req?: Request
) => {
  const { password } = data;
  if (!password) {
    throw new ValidationError('Password is required to confirm account deletion.');
  }

  const account = await prisma.account.findFirst({
    where: { userId, providerId: 'credential' },
  });

  if (!account || !account.password) {
    throw new ValidationError('No password-based credential account found for this user.');
  }

  const { verifyPassword } = await import('better-auth/crypto');
  const isMatch = await verifyPassword({
    hash: account.password,
    password,
  });

  if (!isMatch) {
    throw new UnauthorizedError('Incorrect password. Please verify your current password.');
  }

  // Soft delete: keep row and relations, mark status as DELETED, record deletedAt
  await prisma.user.update({
    where: { id: userId },
    data: {
      status: 'DELETED',
      deletedAt: new Date(),
    },
  });

  // Revoke all active sessions immediately
  await prisma.session.deleteMany({
    where: { userId },
  });

  if (res) {
    tokenUtils.clearAuthCookies(res, req);
  }

  return {
    success: true,
    message: 'Your account has been deleted. You will no longer be able to log in.',
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
  changePassword,
  getSessions,
  revokeSession,
  revokeOtherSessions,
  deactivateAccount,
  deleteAccount,
};

export default AuthService;
