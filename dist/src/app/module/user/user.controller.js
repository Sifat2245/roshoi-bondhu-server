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
const getFriends = CatchAsync(async (req, res) => {
    const result = await UserService.getFriends(req.user.id);
    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: 'Friends retrieved successfully.',
        data: result,
    });
});
const getSuggestions = CatchAsync(async (req, res) => {
    const result = await UserService.getSuggestions(req.user.id);
    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: 'Friend suggestions retrieved.',
        data: result,
    });
});
const getNotifications = CatchAsync(async (req, res) => {
    const result = await UserService.getNotifications(req.user?.id || '');
    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: 'Notifications retrieved.',
        data: result,
    });
});
export const UserController = {
    getUserProfile,
    toggleFollow,
    updateProfile,
    getFriends,
    getSuggestions,
    getNotifications,
};
