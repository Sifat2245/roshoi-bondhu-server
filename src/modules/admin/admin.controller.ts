import type { Request, Response } from 'express';
import { CatchAsync } from '../../shared/utils/catch-async.js';
import { sendResponse } from '../../shared/utils/send-response.js';
import { AdminService } from './admin.service.js';

const getPlatformStats = CatchAsync(async (_req: Request, res: Response) => {
  const result = await AdminService.getPlatformStats();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Platform statistics loaded.',
    data: result,
  });
});

const getUsers = CatchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getUsers(req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'User directory retrieved.',
    meta: result.meta,
    data: result.data,
  });
});

const updateUserRole = CatchAsync(async (req: Request, res: Response) => {
  const targetUserId = req.params.id as string;
  const { role } = req.body;
  const result = await AdminService.updateUserRole(req.user!.id, targetUserId, role);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `User role updated to ${role} successfully.`,
    data: result,
  });
});

const toggleUserBan = CatchAsync(async (req: Request, res: Response) => {
  const targetUserId = req.params.id as string;
  const result = await AdminService.toggleUserBan(req.user!.id, targetUserId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.isBanned ? 'User has been suspended.' : 'User suspension lifted.',
    data: result,
  });
});

const submitReport = CatchAsync(async (req: Request, res: Response) => {
  const { targetType, targetId, reason } = req.body;
  const result = await AdminService.submitReport(req.user!.id, targetType, targetId, reason);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Report submitted for review.',
    data: result,
  });
});

const getReports = CatchAsync(async (req: Request, res: Response) => {
  const { status } = req.query as any;
  const result = await AdminService.getReports(status);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Reports retrieved successfully.',
    data: result,
  });
});

const resolveReport = CatchAsync(async (req: Request, res: Response) => {
  const reportId = req.params.id as string;
  const { status } = req.body;
  const result = await AdminService.resolveReport(reportId, status);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `Report marked as ${status}.`,
    data: result,
  });
});

export const AdminController = {
  getPlatformStats,
  getUsers,
  updateUserRole,
  toggleUserBan,
  submitReport,
  getReports,
  resolveReport,
};

export default AdminController;

