import { CatchAsync } from '../../shared/utils/catch-async.js';
import { sendResponse } from '../../shared/utils/send-response.js';
import { FriendsService } from './friends.service.js';
export class FriendsController {
    static getAllFriends = CatchAsync(async (req, res) => {
        const rawUserId = req.query.userId?.trim();
        const userId = rawUserId && rawUserId !== 'me' && rawUserId !== 'undefined' && rawUserId !== 'null'
            ? rawUserId
            : req.user.id;
        const search = req.query.search;
        const friends = await FriendsService.getFriends(userId, req.user?.id, search);
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: 'Friends retrieved successfully',
            data: friends,
        });
    });
    static getFriendRequests = CatchAsync(async (req, res) => {
        const requests = await FriendsService.getFriendRequests(req.user.id);
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: 'Friend requests retrieved successfully',
            data: requests,
        });
    });
    static getSuggestions = CatchAsync(async (req, res) => {
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 25;
        const suggestions = await FriendsService.getSuggestions(req.user.id, limit);
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: 'Friend suggestions retrieved successfully',
            data: suggestions,
        });
    });
    static getRelationshipStatus = CatchAsync(async (req, res) => {
        const targetUserId = req.params.targetUserId;
        const status = await FriendsService.getRelationshipStatus(req.user.id, targetUserId);
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: 'Relationship status retrieved',
            data: status,
        });
    });
    static sendFriendRequest = CatchAsync(async (req, res) => {
        const targetUserId = req.params.targetUserId;
        const result = await FriendsService.sendFriendRequest(req.user.id, targetUserId);
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: result.message,
            data: result,
        });
    });
    static acceptFriendRequest = CatchAsync(async (req, res) => {
        const id = req.params.id;
        const result = await FriendsService.acceptFriendRequest(req.user.id, id);
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: result.message,
            data: result,
        });
    });
    static declineFriendRequest = CatchAsync(async (req, res) => {
        const id = req.params.id;
        const result = await FriendsService.declineFriendRequest(req.user.id, id);
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: result.message,
            data: result,
        });
    });
    static cancelFriendRequest = CatchAsync(async (req, res) => {
        const targetUserId = req.params.targetUserId;
        const result = await FriendsService.cancelFriendRequest(req.user.id, targetUserId);
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: result.message,
            data: result,
        });
    });
    static unfriend = CatchAsync(async (req, res) => {
        const targetUserId = req.params.targetUserId;
        const result = await FriendsService.unfriend(req.user.id, targetUserId);
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: result.message,
            data: result,
        });
    });
    static blockUser = CatchAsync(async (req, res) => {
        const targetUserId = req.params.targetUserId;
        const result = await FriendsService.blockUser(req.user.id, targetUserId);
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: result.message,
            data: result,
        });
    });
    static unblockUser = CatchAsync(async (req, res) => {
        const targetUserId = req.params.targetUserId;
        const result = await FriendsService.unblockUser(req.user.id, targetUserId);
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: result.message,
            data: result,
        });
    });
    static getBlockedUsers = CatchAsync(async (req, res) => {
        const blocked = await FriendsService.getBlockedUsers(req.user.id);
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: 'Blocked users retrieved',
            data: blocked,
        });
    });
}
export default FriendsController;
