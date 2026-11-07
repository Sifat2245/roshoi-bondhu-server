import type { Request, Response } from 'express';
import { CatchAsync } from '../../shared/utils/catch-async.js';
import { sendResponse } from '../../shared/utils/send-response.js';
import { UserService } from './user.service.js';

const getUserProfile = CatchAsync(async (req: Request, res: Response) => {
  const userId = req.params.id as string;
  const result = await UserService.getUserProfile(userId, req.user?.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'User profile retrieved successfully.',
    data: result,
  });
});

const toggleFollow = CatchAsync(async (req: Request, res: Response) => {
  const targetId = req.params.id as string;
  const result = await UserService.toggleFollow(req.user!.id, targetId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.following ? 'Followed user.' : 'Unfollowed user.',
    data: result,
  });
});

const updateProfile = CatchAsync(async (req: Request, res: Response) => {
  const result = await UserService.updateProfile(req.user!.id, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Profile updated successfully!',
    data: result,
  });
});

export const UserController = {
  getUserProfile,
  toggleFollow,
  updateProfile,
};

export default UserController;

