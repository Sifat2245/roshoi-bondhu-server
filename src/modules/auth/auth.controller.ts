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

const changePassword = CatchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.changePassword(req.user!.id, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

const getSessions = CatchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.getSessions(req.user!.id, req.session?.token);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Active sessions retrieved successfully.',
    data: result,
  });
});

const revokeSession = CatchAsync(async (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;
  const result = await AuthService.revokeSession(req.user!.id, sessionId, req.session?.token);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

const revokeOtherSessions = CatchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.revokeOtherSessions(req.user!.id, req.session?.token);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

const deactivateAccount = CatchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.deactivateAccount(req.user!.id, req.body, res, req);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: result,
  });
});

const deleteAccount = CatchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.deleteAccount(req.user!.id, req.body, res, req);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
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
  changePassword,
  getSessions,
  revokeSession,
  revokeOtherSessions,
  deactivateAccount,
  deleteAccount,
};

export default AuthController;

