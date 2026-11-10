import type { Request, Response } from 'express';
import { CatchAsync } from '../../shared/utils/catch-async.js';
import { sendResponse } from '../../shared/utils/send-response.js';
import { AuthService } from './auth.service.js';

const signup = CatchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.signup(req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: result.message,
    data: result,
  });
});

const verifyOTP = CatchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.verifyOTP(req.body, res);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

const resendOTP = CatchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.resendOTP(req.body.email);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

const forgotPassword = CatchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.forgotPassword(req.body.email);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

const resetPassword = CatchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.resetPassword(req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

const login = CatchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.login(req.body, res);
  if ((result as any).requiresVerification) {
    return sendResponse(res, {
      statusCode: 403,
      success: false,
      message: result.message,
      data: result,
    });
  }
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

const logout = CatchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.logout(req, res);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

const getMe = CatchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.getMe(req.user!.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'User profile retrieved successfully.',
    data: result,
  });
});

export const AuthController = {
  signup,
  verifyOTP,
  resendOTP,
  forgotPassword,
  resetPassword,
  login,
  logout,
  getMe,
};

export default AuthController;

