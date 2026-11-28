import type { Request, Response } from 'express';
import { CatchAsync } from '../../shared/utils/catch-async.js';
import { sendResponse } from '../../shared/utils/send-response.js';
import { NotificationService } from './notification.service.js';
import { FriendsService } from '../friends/friends.service.js';
import { GroupService } from '../groups/group.service.js';
import prisma from '../../lib/prisma.js';

const db = prisma as any;

const listNotifications = CatchAsync(async (req: Request, res: Response) => {
  if (!req.user?.id) {
    return sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'No notifications for guest user.',
      data: [],
    });
  }

  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 40;
  const data = await NotificationService.listForUser(req.user.id, limit);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Notifications retrieved successfully.',
    data,
  });
});

const markNotificationsRead = CatchAsync(async (req: Request, res: Response) => {
  const { ids, all } = req.body || {};
  const result = await NotificationService.markRead(req.user!.id, ids, Boolean(all));
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Notifications marked as read.',
    data: result,
  });
});

const respondToNotification = CatchAsync(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const notificationId = req.params.id as string;
  const action = String(req.body?.action || '').toUpperCase();

  if (action !== 'ACCEPT' && action !== 'DECLINE') {
    throw new Error('Action must be ACCEPT or DECLINE.');
  }

  const notification = await db.notification.findFirst({
    where: { id: notificationId, recipientId: userId },
  });

  if (!notification) {
    throw new Error('Notification not found.');
  }

  if (notification.type === 'FRIEND_REQUEST') {
    const target = notification.friendshipRequestId || notification.actorId;
    if (!target) throw new Error('Friend request reference is missing.');

    if (action === 'ACCEPT') {
      await FriendsService.acceptFriendRequest(userId, target);
    } else {
      await FriendsService.declineFriendRequest(userId, target);
    }
  } else if (notification.type === 'GROUP_INVITE') {
    if (!notification.invitationId) {
      throw new Error('Group invitation reference is missing.');
    }
    await GroupService.respondToInvitation(
      userId,
      notification.invitationId,
      action as 'ACCEPT' | 'DECLINE'
    );
  } else {
    await NotificationService.dismissNotification(userId, notificationId);
  }

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `Notification ${action.toLowerCase()}ed.`,
    data: { id: notificationId, action },
  });
});

const dismissNotification = CatchAsync(async (req: Request, res: Response) => {
  const result = await NotificationService.dismissNotification(
    req.user!.id,
    req.params.id as string
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Notification dismissed.',
    data: result,
  });
});

export const NotificationController = {
  listNotifications,
  markNotificationsRead,
  respondToNotification,
  dismissNotification,
};

export default NotificationController;

