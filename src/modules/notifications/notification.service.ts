import prisma from '../../lib/prisma.js';
import { emitToUser } from '../../realtime/socket.js';

export type NotificationKind =
  | 'FRIEND_REQUEST'
  | 'FRIEND_ACCEPT'
  | 'GROUP_INVITE'
  | 'GROUP_JOIN_REQUEST'
  | 'GROUP_JOIN_APPROVED'
  | 'POST_LIKE'
  | 'COMMENT_LIKE'
  | 'POST_COMMENT'
  | 'COMMENT_REPLY'
  | 'MENTION'
  | 'SYSTEM';

const db = prisma as any;

const snippet = (text?: string | null, max = 72) => {
  if (!text) return '';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
};

const isBlockedBetween = async (userA: string, userB: string) => {
  if (userA === userB) return false;
  const block = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: userA, blockedId: userB },
        { blockerId: userB, blockedId: userA },
      ],
    },
    select: { id: true },
  });
  return Boolean(block);
};

const isEligibleUser = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isBanned: true, deletedAt: true, status: true },
  });
  return Boolean(user && !user.isBanned && !user.deletedAt && user.status === 'ACTIVE');
};

const buildAggregatedLikeMessage = (
  target: 'post' | 'comment',
  actorCount: number
) => {
  if (actorCount <= 1) return `liked your ${target}.`;
  if (actorCount === 2) return `and 1 other liked your ${target}.`;
  return `and ${actorCount - 1} others liked your ${target}.`;
};

export const serializeNotification = (item: any) => {
  const actor = item.actor
    ? {
        id: item.actor.id,
        name: item.actor.name,
        image: item.actor.image,
      }
    : undefined;

  return {
    id: item.id,
    userId: item.recipientId,
    senderId: item.actorId || undefined,
    sender: actor,
    actor,
    type: item.type,
    title: item.title || undefined,
    message: item.message,
    link: item.link || undefined,
    iconType: item.iconType || 'SYSTEM',
    actionable: Boolean(item.actionable),
    actionStatus: item.actionStatus || undefined,
    postId: item.postId || undefined,
    commentId: item.commentId || undefined,
    groupId: item.groupId || undefined,
    invitationId: item.invitationId || undefined,
    friendshipRequestId: item.friendshipRequestId || undefined,
    actorCount: item.actorCount || 1,
    metadata: item.metadata || undefined,
    isUnread: !item.readAt,
    createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
  };
};

const notificationInclude = {
  actor: {
    select: {
      id: true,
      name: true,
      image: true,
      isBanned: true,
      deletedAt: true,
    },
  },
  group: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
};

const createAndEmit = async (params: {
  recipientId: string;
  actorId?: string | null;
  type: NotificationKind;
  message: string;
  title?: string;
  link?: string;
  iconType: string;
  actionable?: boolean;
  actionStatus?: string;
  postId?: string;
  commentId?: string;
  groupId?: string;
  invitationId?: string;
  friendshipRequestId?: string;
  metadata?: Record<string, any>;
}) => {
  const { recipientId, actorId } = params;
  if (!recipientId || (actorId && actorId === recipientId)) return null;
  if (!(await isEligibleUser(recipientId))) return null;
  if (actorId && (await isBlockedBetween(recipientId, actorId))) return null;

  const created = await db.notification.create({
    data: {
      recipientId,
      actorId: actorId || null,
      type: params.type,
      title: params.title || null,
      message: params.message,
      link: params.link || null,
      iconType: params.iconType,
      actionable: Boolean(params.actionable),
      actionStatus: params.actionStatus || null,
      postId: params.postId || null,
      commentId: params.commentId || null,
      groupId: params.groupId || null,
      invitationId: params.invitationId || null,
      friendshipRequestId: params.friendshipRequestId || null,
      metadata: params.metadata || undefined,
    },
    include: notificationInclude,
  });

  const serialized = serializeNotification(created);
  emitToUser(recipientId, 'notification:new', serialized);
  return serialized;
};

const listForUser = async (userId: string, limit = 40) => {
  const blocks = await prisma.userBlock.findMany({
    where: {
      OR: [{ blockerId: userId }, { blockedId: userId }],
    },
    select: { blockerId: true, blockedId: true },
  });
  const blockedIds = new Set<string>();
  for (const b of blocks) {
    blockedIds.add(b.blockerId === userId ? b.blockedId : b.blockerId);
  }

  const rows = await db.notification.findMany({
    where: {
      recipientId: userId,
      dismissedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(100, Math.max(1, limit)),
    include: notificationInclude,
  });

  return rows
    .filter((row: any) => {
      if (row.actorId && blockedIds.has(row.actorId)) return false;
      if (row.actor && (row.actor.isBanned || row.actor.deletedAt)) return false;
      return true;
    })
    .map(serializeNotification);
};

const markRead = async (userId: string, ids?: string[], all = false) => {
  const now = new Date();
  if (all) {
    await db.notification.updateMany({
      where: { recipientId: userId, readAt: null, dismissedAt: null },
      data: { readAt: now },
    });
    emitToUser(userId, 'notification:read-all', { readAt: now.toISOString() });
    return { success: true };
  }

  const cleanIds = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (cleanIds.length === 0) return { success: true };

  await db.notification.updateMany({
    where: { recipientId: userId, id: { in: cleanIds }, readAt: null },
    data: { readAt: now },
  });
  emitToUser(userId, 'notification:read', { ids: cleanIds, readAt: now.toISOString() });
  return { success: true };
};

const dismissNotification = async (userId: string, notificationId: string) => {
  const existing = await db.notification.findFirst({
    where: { id: notificationId, recipientId: userId },
  });
  if (!existing) return { success: true };

  await db.notification.update({
    where: { id: existing.id },
    data: { dismissedAt: new Date(), readAt: existing.readAt || new Date() },
  });
  emitToUser(userId, 'notification:dismissed', { id: existing.id });
  return { success: true };
};

const notifyFriendRequest = async (
  senderId: string,
  receiverId: string,
  friendshipRequestId?: string
) => {
  if (!senderId || !receiverId || senderId === receiverId) return null;
  if (!(await isEligibleUser(receiverId))) return null;
  if (await isBlockedBetween(senderId, receiverId)) return null;

  // Replace any stale pending friend request notification from same sender
  const existing = await db.notification.findFirst({
    where: {
      recipientId: receiverId,
      actorId: senderId,
      type: 'FRIEND_REQUEST',
      actionable: true,
      dismissedAt: null,
    },
    include: notificationInclude,
  });

  if (existing) {
    const updated = await db.notification.update({
      where: { id: existing.id },
      data: {
        friendshipRequestId: friendshipRequestId || existing.friendshipRequestId,
        readAt: null,
        createdAt: new Date(),
      },
      include: notificationInclude,
    });
    const serialized = serializeNotification(updated);
    emitToUser(receiverId, 'notification:new', serialized);
    return serialized;
  }

  return createAndEmit({
    recipientId: receiverId,
    actorId: senderId,
    type: 'FRIEND_REQUEST',
    message: 'sent you a friend request.',
    link: `/profile/${senderId}`,
    iconType: 'FRIEND_REQUEST',
    actionable: true,
    actionStatus: 'PENDING',
    friendshipRequestId,
  });
};

const resolveFriendRequestNotification = async (
  receiverId: string,
  senderId: string,
  status: 'ACCEPTED' | 'DECLINED' | 'CANCELLED'
) => {
  const pending = await db.notification.findMany({
    where: {
      recipientId: receiverId,
      actorId: senderId,
      type: 'FRIEND_REQUEST',
      actionable: true,
    },
    select: { id: true },
  });

  if (pending.length === 0) return;

  const now = new Date();
  await db.notification.updateMany({
    where: { id: { in: pending.map((p: any) => p.id) } },
    data: {
      actionable: false,
      actionStatus: status,
      readAt: now,
      dismissedAt: status === 'CANCELLED' || status === 'DECLINED' ? now : null,
    },
  });

  for (const item of pending) {
    if (status === 'CANCELLED' || status === 'DECLINED') {
      emitToUser(receiverId, 'notification:dismissed', { id: item.id });
    } else {
      emitToUser(receiverId, 'notification:updated', {
        id: item.id,
        actionable: false,
        actionStatus: status,
        isUnread: false,
      });
    }
  }
};

const notifyFriendAccepted = async (accepterId: string, requesterId: string) => {
  return createAndEmit({
    recipientId: requesterId,
    actorId: accepterId,
    type: 'FRIEND_ACCEPT',
    message: 'accepted your friend request.',
    link: `/profile/${accepterId}`,
    iconType: 'FRIEND_ACCEPT',
    actionable: false,
  });
};

const notifyGroupInvite = async (
  inviterId: string,
  inviteeId: string,
  group: { id: string; name: string; slug: string },
  invitationId: string
) => {
  if (!inviterId || !inviteeId || inviterId === inviteeId) return null;
  if (!(await isEligibleUser(inviteeId))) return null;
  if (await isBlockedBetween(inviterId, inviteeId)) return null;

  const existing = await db.notification.findFirst({
    where: {
      recipientId: inviteeId,
      invitationId,
      type: 'GROUP_INVITE',
    },
  });

  if (existing) {
    const updated = await db.notification.update({
      where: { id: existing.id },
      data: {
        actorId: inviterId,
        message: `invited you to join ${group.name}.`,
        link: `/group/${group.slug}`,
        actionable: true,
        actionStatus: 'PENDING',
        readAt: null,
        dismissedAt: null,
        createdAt: new Date(),
      },
      include: notificationInclude,
    });
    const serialized = serializeNotification(updated);
    emitToUser(inviteeId, 'notification:new', serialized);
    return serialized;
  }

  return createAndEmit({
    recipientId: inviteeId,
    actorId: inviterId,
    type: 'GROUP_INVITE',
    message: `invited you to join ${group.name}.`,
    link: `/group/${group.slug}`,
    iconType: 'INVITE',
    actionable: true,
    actionStatus: 'PENDING',
    groupId: group.id,
    invitationId,
    metadata: { groupName: group.name, groupSlug: group.slug },
  });
};

const resolveGroupInviteNotification = async (
  inviteeId: string,
  invitationId: string,
  status: 'ACCEPTED' | 'DECLINED' | 'CANCELLED'
) => {
  const existing = await db.notification.findMany({
    where: { recipientId: inviteeId, invitationId, type: 'GROUP_INVITE' },
    select: { id: true },
  });
  if (existing.length === 0) return;

  const now = new Date();
  await db.notification.updateMany({
    where: { id: { in: existing.map((n: any) => n.id) } },
    data: {
      actionable: false,
      actionStatus: status,
      readAt: now,
      dismissedAt: status === 'DECLINED' || status === 'CANCELLED' ? now : null,
    },
  });

  for (const item of existing) {
    if (status === 'DECLINED' || status === 'CANCELLED') {
      emitToUser(inviteeId, 'notification:dismissed', { id: item.id });
    } else {
      emitToUser(inviteeId, 'notification:updated', {
        id: item.id,
        actionable: false,
        actionStatus: status,
        isUnread: false,
      });
    }
  }
};

const notifyGroupJoinRequest = async (
  requesterId: string,
  group: { id: string; name: string; slug: string; ownerId?: string | null; createdById?: string | null }
) => {
  const staffMembers = await prisma.groupMember.findMany({
    where: {
      groupId: group.id,
      isApproved: true,
      role: { in: ['ADMIN', 'MODERATOR'] },
    },
    select: { userId: true },
  });

  const recipientSet = new Set<string>(staffMembers.map((m) => m.userId));
  if (group.ownerId) recipientSet.add(group.ownerId);
  if (group.createdById) recipientSet.add(group.createdById);
  recipientSet.delete(requesterId);

  await Promise.all(
    Array.from(recipientSet).map((adminId) =>
      createAndEmit({
        recipientId: adminId,
        actorId: requesterId,
        type: 'GROUP_JOIN_REQUEST',
        message: `requested to join ${group.name}.`,
        link: `/group/${group.slug}/manage/member-requests`,
        iconType: 'INVITE',
        actionable: false,
        groupId: group.id,
        metadata: { groupName: group.name, groupSlug: group.slug },
      }).catch(() => null)
    )
  );
};

const notifyGroupJoinApproved = async (
  approverId: string,
  targetUserId: string,
  group: { id: string; name: string; slug: string }
) => {
  return createAndEmit({
    recipientId: targetUserId,
    actorId: approverId,
    type: 'GROUP_JOIN_APPROVED',
    message: `approved your request to join ${group.name}.`,
    link: `/group/${group.slug}`,
    iconType: 'INVITE',
    actionable: false,
    groupId: group.id,
    metadata: { groupName: group.name, groupSlug: group.slug },
  });
};

const notifyPostLike = async (actorId: string, postId: string) => {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, title: true, caption: true, deletedAt: true },
  });
  if (!post || post.deletedAt || post.authorId === actorId) return null;
  if (!(await isEligibleUser(post.authorId))) return null;
  if (await isBlockedBetween(post.authorId, actorId)) return null;

  const aggregateKey = `POST_LIKE:${post.id}`;
  const existing = await db.notification.findUnique({
    where: {
      recipientId_aggregateKey: {
        recipientId: post.authorId,
        aggregateKey,
      },
    },
  });

  let notificationId: string;
  if (existing) {
    await db.notificationActor.upsert({
      where: {
        notificationId_actorId: {
          notificationId: existing.id,
          actorId,
        },
      },
      update: { actedAt: new Date() },
      create: { notificationId: existing.id, actorId },
    });

    const count = await db.notificationActor.count({
      where: { notificationId: existing.id },
    });

    const updated = await db.notification.update({
      where: { id: existing.id },
      data: {
        actorId,
        actorCount: count,
        message: buildAggregatedLikeMessage('post', count),
        readAt: null,
        dismissedAt: null,
        createdAt: new Date(),
      },
      include: notificationInclude,
    });
    notificationId = updated.id;
    const serialized = serializeNotification(updated);
    emitToUser(post.authorId, 'notification:new', serialized);
    return serialized;
  }

  const created = await db.notification.create({
    data: {
      recipientId: post.authorId,
      actorId,
      type: 'POST_LIKE',
      aggregateKey,
      actorCount: 1,
      message: buildAggregatedLikeMessage('post', 1),
      link: `/post/${post.id}`,
      iconType: 'HEART',
      postId: post.id,
      actors: {
        create: { actorId },
      },
    },
    include: notificationInclude,
  });
  notificationId = created.id;
  void notificationId;
  const serialized = serializeNotification(created);
  emitToUser(post.authorId, 'notification:new', serialized);
  return serialized;
};

const handlePostUnlike = async (actorId: string, postId: string) => {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { authorId: true },
  });
  if (!post) return;

  const existing = await db.notification.findUnique({
    where: {
      recipientId_aggregateKey: {
        recipientId: post.authorId,
        aggregateKey: `POST_LIKE:${postId}`,
      },
    },
  });
  if (!existing) return;

  await db.notificationActor.deleteMany({
    where: { notificationId: existing.id, actorId },
  });

  const remaining = await db.notificationActor.findMany({
    where: { notificationId: existing.id },
    orderBy: { actedAt: 'desc' },
    take: 1,
  });
  const count = await db.notificationActor.count({
    where: { notificationId: existing.id },
  });

  if (count === 0 || remaining.length === 0) {
    await db.notification.delete({ where: { id: existing.id } });
    emitToUser(post.authorId, 'notification:dismissed', { id: existing.id });
    return;
  }

  const updated = await db.notification.update({
    where: { id: existing.id },
    data: {
      actorId: remaining[0].actorId,
      actorCount: count,
      message: buildAggregatedLikeMessage('post', count),
    },
    include: notificationInclude,
  });
  emitToUser(post.authorId, 'notification:updated', serializeNotification(updated));
};

const notifyCommentLike = async (actorId: string, commentId: string) => {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, userId: true, postId: true, content: true },
  });
  if (!comment || comment.userId === actorId) return null;
  if (!(await isEligibleUser(comment.userId))) return null;
  if (await isBlockedBetween(comment.userId, actorId)) return null;

  const aggregateKey = `COMMENT_LIKE:${comment.id}`;
  const existing = await db.notification.findUnique({
    where: {
      recipientId_aggregateKey: {
        recipientId: comment.userId,
        aggregateKey,
      },
    },
  });

  if (existing) {
    await db.notificationActor.upsert({
      where: {
        notificationId_actorId: { notificationId: existing.id, actorId },
      },
      update: { actedAt: new Date() },
      create: { notificationId: existing.id, actorId },
    });
    const count = await db.notificationActor.count({
      where: { notificationId: existing.id },
    });
    const updated = await db.notification.update({
      where: { id: existing.id },
      data: {
        actorId,
        actorCount: count,
        message: buildAggregatedLikeMessage('comment', count),
        readAt: null,
        dismissedAt: null,
        createdAt: new Date(),
      },
      include: notificationInclude,
    });
    const serialized = serializeNotification(updated);
    emitToUser(comment.userId, 'notification:new', serialized);
    return serialized;
  }

  const created = await db.notification.create({
    data: {
      recipientId: comment.userId,
      actorId,
      type: 'COMMENT_LIKE',
      aggregateKey,
      actorCount: 1,
      message: buildAggregatedLikeMessage('comment', 1),
      link: `/post/${comment.postId}`,
      iconType: 'HEART',
      postId: comment.postId,
      commentId: comment.id,
      actors: {
        create: { actorId },
      },
    },
    include: notificationInclude,
  });
  const serialized = serializeNotification(created);
  emitToUser(comment.userId, 'notification:new', serialized);
  return serialized;
};

const resolveMentionedUserIdsFromContent = async (
  content: string,
  explicitIds: string[] = [],
  authorId: string
): Promise<string[]> => {
  const result = new Set<string>();
  const cleanExplicit = explicitIds.filter((id) => Boolean(id) && id !== authorId);

  if (cleanExplicit.length > 0) {
    const valid = await prisma.user.findMany({
      where: { id: { in: cleanExplicit }, isBanned: false, deletedAt: null },
      select: { id: true },
    });
    for (const u of valid) result.add(u.id);
  }

  // Fallback: match @username tokens (e.g. @chef_rahim) from database profiles
  const handleMatches = Array.from(content.matchAll(/(?:^|\s)@([a-zA-Z0-9._-]{2,40})/g)).map(
    (m) => m[1]
  );
  if (handleMatches.length > 0) {
    const profileUsers = await prisma.userProfile.findMany({
      where: {
        username: { in: handleMatches, mode: 'insensitive' },
      },
      select: { userId: true },
    });
    for (const p of profileUsers) {
      if (p.userId !== authorId) result.add(p.userId);
    }
  }

  return Array.from(result);
};

const notifyCommentAndMentions = async (params: {
  actorId: string;
  postId: string;
  commentId: string;
  parentId?: string | null;
  content: string;
  mentionedUserIds?: string[];
}) => {
  const { actorId, postId, commentId, parentId, content, mentionedUserIds = [] } = params;
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, deletedAt: true },
  });
  if (!post || post.deletedAt) return;

  const textPreview = snippet(content, 72);
  const link = `/post/${post.id}`;
  const notifiedUsers = new Set<string>([actorId]);

  // 1. Reply notification to parent comment author
  if (parentId) {
    const parentComment = await prisma.comment.findUnique({
      where: { id: parentId },
      select: { id: true, userId: true },
    });
    if (parentComment && !notifiedUsers.has(parentComment.userId)) {
      notifiedUsers.add(parentComment.userId);
      await createAndEmit({
        recipientId: parentComment.userId,
        actorId,
        type: 'COMMENT_REPLY',
        message: textPreview
          ? `replied to your comment: "${textPreview}"`
          : 'replied to your comment.',
        link,
        iconType: 'COMMENT',
        postId: post.id,
        commentId,
      });
    }
  }

  // 2. Mention notifications (deduplicated against reply recipient)
  const resolvedMentionIds = await resolveMentionedUserIdsFromContent(
    content,
    mentionedUserIds,
    actorId
  );

  for (const mentionedId of resolvedMentionIds) {
    if (notifiedUsers.has(mentionedId)) continue;
    notifiedUsers.add(mentionedId);
    await createAndEmit({
      recipientId: mentionedId,
      actorId,
      type: 'MENTION',
      message: textPreview
        ? `mentioned you in a comment: "${textPreview}"`
        : 'mentioned you in a comment.',
      link,
      iconType: 'MENTION',
      postId: post.id,
      commentId,
    });
  }

  // 3. Post comment notification to post author (if not already notified via reply or mention)
  if (!notifiedUsers.has(post.authorId)) {
    notifiedUsers.add(post.authorId);
    await createAndEmit({
      recipientId: post.authorId,
      actorId,
      type: 'POST_COMMENT',
      message: textPreview
        ? `commented on your post: "${textPreview}"`
        : 'commented on your post.',
      link,
      iconType: 'COMMENT',
      postId: post.id,
      commentId,
    });
  }
};

export const NotificationService = {
  listForUser,
  markRead,
  dismissNotification,
  notifyFriendRequest,
  resolveFriendRequestNotification,
  notifyFriendAccepted,
  notifyGroupInvite,
  resolveGroupInviteNotification,
  notifyGroupJoinRequest,
  notifyGroupJoinApproved,
  notifyPostLike,
  handlePostUnlike,
  notifyCommentLike,
  notifyCommentAndMentions,
  resolveMentionedUserIdsFromContent,
  serializeNotification,
};

export default NotificationService;

