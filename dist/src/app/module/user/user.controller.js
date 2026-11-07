import { CatchAsync } from '../../shared/catchAsync.js';
import { sendResponse } from '../../shared/sendResponse.js';
import { UserService } from './user.service.js';
const getUserProfile = CatchAsync(async (req, res) => {
    const userId = req.params.id;
    const result = await UserService.getUserProfile(userId, req.user?.id);
    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: 'User profile retrieved successfully.',
        data: result,
    });
});
const toggleFollow = CatchAsync(async (req, res) => {
    const targetId = req.params.id;
    const result = await UserService.toggleFollow(req.user.id, targetId);
    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: result.following ? 'Followed user.' : 'Unfollowed user.',
        data: result,
    });
});
const updateProfile = CatchAsync(async (req, res) => {
    const result = await UserService.updateProfile(req.user.id, req.body);
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
