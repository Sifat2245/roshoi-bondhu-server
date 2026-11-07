import { CatchAsync } from '../../shared/utils/catch-async.js';
import { sendResponse } from '../../shared/utils/send-response.js';
import { GroupService } from './group.service.js';
const createGroup = CatchAsync(async (req, res) => {
    const result = await GroupService.createGroup(req.user.id, req.body);
    sendResponse(res, {
        statusCode: 201,
        success: true,
        message: 'Group created successfully!',
        data: result,
    });
});
const getGroups = CatchAsync(async (req, res) => {
    const { search, myGroups } = req.query;
    const result = await GroupService.getGroups(search, myGroups === 'true', req.user?.id);
    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: 'Groups retrieved successfully.',
        data: result,
    });
});
const getGroupBySlug = CatchAsync(async (req, res) => {
    const slug = req.params.slug;
    const result = await GroupService.getGroupBySlug(slug, req.user?.id, req.user?.role);
    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: 'Group details retrieved successfully.',
        data: result,
    });
});
const joinGroup = CatchAsync(async (req, res) => {
    const groupId = req.params.id;
    const result = await GroupService.joinGroup(req.user.id, groupId);
    sendResponse(res, {
        statusCode: 201,
        success: true,
        message: result.isApproved
            ? 'Joined group successfully!'
            : 'Join request submitted! Waiting for group admin approval.',
        data: result.membership,
    });
});
const leaveGroup = CatchAsync(async (req, res) => {
    const groupId = req.params.id;
    const result = await GroupService.leaveGroup(req.user.id, groupId);
    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: 'Left group successfully.',
        data: result,
    });
});
const handleJoinRequest = CatchAsync(async (req, res) => {
    const groupId = req.params.id;
    const memberId = req.params.memberId;
    const { action } = req.body;
    const result = await GroupService.handleJoinRequest(req.user.id, req.user.role, groupId, memberId, action);
    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: action === 'APPROVE' ? 'Member request approved.' : 'Member request rejected.',
        data: result,
    });
});
const updateMemberRole = CatchAsync(async (req, res) => {
    const groupId = req.params.id;
    const memberId = req.params.memberId;
    const { newRole } = req.body;
    const result = await GroupService.updateMemberRole(req.user.id, req.user.role, groupId, memberId, newRole);
    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: `Member role updated to ${newRole} successfully.`,
        data: result,
    });
});
const updateGroupSettings = CatchAsync(async (req, res) => {
    const groupId = req.params.id;
    const result = await GroupService.updateGroupSettings(req.user.id, req.user.role, groupId, req.body);
    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: 'Group settings updated successfully.',
        data: result,
    });
});
export const GroupController = {
    createGroup,
    getGroups,
    getGroupBySlug,
    joinGroup,
    leaveGroup,
    handleJoinRequest,
    updateMemberRole,
    updateGroupSettings,
};
export default GroupController;
