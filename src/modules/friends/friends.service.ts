import prisma from '../../lib/prisma.js';

export function getCanonicalPair(u1: string, u2: string) {
  return u1 < u2 ? { userLowId: u1, userHighId: u2 } : { userLowId: u2, userHighId: u1 };
}

export class FriendsService {
  /**
   * Resolves any user identifier (CUID, @handle, username, email, or 'me') into a valid User CUID.
   */
  static async resolveUserId(idOrHandle?: string, currentUserId?: string): Promise<string> {
    if (!idOrHandle || idOrHandle === 'me') return currentUserId || idOrHandle || '';
    const clean = idOrHandle.replace(/^@/, '').trim();

    // 1. Direct match on user ID
    const existingById = await prisma.user.findUnique({
      where: { id: idOrHandle },
      select: { id: true },
    });
    if (existingById) return existingById.id;

    // 2. Match by username or email
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { profile: { username: { equals: clean, mode: 'insensitive' } } },
          { email: { equals: clean, mode: 'insensitive' } },
          { email: { startsWith: `${clean}@`, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });

    return user ? user.id : idOrHandle;
  }

  /**
   * Helper to retrieve all friend IDs for a given user.
   */
  static async getFriendIdsForUser(userId: string): Promise<Set<string>> {
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [{ userLowId: userId }, { userHighId: userId }],
      },
      select: {
        userLowId: true,
        userHighId: true,
      },
    });

    const friendIds = new Set<string>();
    for (const f of friendships) {
      if (f.userLowId === userId) {
        friendIds.add(f.userHighId);
      } else {
        friendIds.add(f.userLowId);
      }
    }
    return friendIds;
  }

  /**
   * Batch calculate mutual friend counts for any user against a reference user's friend network.
   * Runs in 1 single database query!
   */
  static async getMutualCountsMap(
    primaryFriendIds: Set<string>,
    userId: string
  ): Promise<Map<string, number>> {
    const mutualCounts = new Map<string, number>();
    if (primaryFriendIds.size === 0) return mutualCounts;

    const primaryFriendsArr = Array.from(primaryFriendIds);
    const mutualFriendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { userLowId: { in: primaryFriendsArr } },
          { userHighId: { in: primaryFriendsArr } },
        ],
      },
      select: {
        userLowId: true,
        userHighId: true,
      },
    });

    for (const f of mutualFriendships) {
      if (primaryFriendIds.has(f.userLowId) && f.userHighId !== userId) {
        mutualCounts.set(f.userHighId, (mutualCounts.get(f.userHighId) || 0) + 1);
      }
      if (primaryFriendIds.has(f.userHighId) && f.userLowId !== userId) {
        mutualCounts.set(f.userLowId, (mutualCounts.get(f.userLowId) || 0) + 1);
      }
    }

    return mutualCounts;
  }

  /**
   * Calculate mutual friend count between two users.
   */
  static async getMutualFriends(userAId: string, userBId: string) {
    if (userAId === userBId) return { count: 0, sample: [] };

    const [friendsA, friendsB] = await Promise.all([
      this.getFriendIdsForUser(userAId),
      this.getFriendIdsForUser(userBId),
    ]);

    const mutualIds: string[] = [];
    for (const id of friendsA) {
      if (friendsB.has(id)) {
        mutualIds.push(id);
      }
    }

    let sample: any[] = [];
    if (mutualIds.length > 0) {
      sample = await prisma.user.findMany({
        where: { id: { in: mutualIds.slice(0, 3) } },
        select: {
          id: true,
          name: true,
          image: true,
        },
      });
    }

    return {
      count: mutualIds.length,
      sample,
    };
  }

  /**
   * Get all accepted friends of a user.
   */
  static async getFriends(userId: string, currentUserId?: string, search?: string) {
    const resolvedUserId = await this.resolveUserId(userId, currentUserId);
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [{ userLowId: resolvedUserId }, { userHighId: resolvedUserId }],
      },
      include: {
        userLow: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            profile: {
              select: {
                username: true,
                city: true,
                work: true,
                bio: true,
              },
            },
          },
        },
        userHigh: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            profile: {
              select: {
                username: true,
                city: true,
                work: true,
                bio: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const viewerId = currentUserId || resolvedUserId;
    let viewerMutualCounts: Map<string, number> | null = null;
    if (viewerId !== resolvedUserId) {
      const viewerFriends = await this.getFriendIdsForUser(viewerId);
      viewerMutualCounts = await this.getMutualCountsMap(viewerFriends, viewerId);
    }

    const friends = friendships.map((f) => {
      const isLow = f.userLowId === resolvedUserId;
      const target = isLow ? f.userHigh : f.userLow;

      const mutualCount = viewerMutualCounts ? viewerMutualCounts.get(target.id) || 0 : 0;

      return {
        id: target.id,
        name: target.name,
        username: target.profile?.username || target.email?.split('@')[0],
        image: target.image || null,
        city: target.profile?.city || null,
        work: target.profile?.work || null,
        bio: target.profile?.bio || null,
        mutualFriends: mutualCount,
        friendshipId: f.id,
        since: f.createdAt,
      };
    });

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      return friends.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.username.toLowerCase().includes(q) ||
          (f.city && f.city.toLowerCase().includes(q))
      );
    }

    return friends;
  }

  /**
   * Get incoming pending friend requests for a user.
   */
  static async getFriendRequests(userId: string) {
    const [requests, myFriendIds] = await Promise.all([
      prisma.friendshipRequest.findMany({
        where: {
          receiverId: userId,
          status: 'PENDING',
        },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              image: true,
              profile: {
                select: {
                  username: true,
                  city: true,
                  work: true,
                  bio: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.getFriendIdsForUser(userId),
    ]);

    const mutualCounts = await this.getMutualCountsMap(myFriendIds, userId);

    const result = requests.map((req) => {
      const mutualCount = mutualCounts.get(req.sender.id) || 0;

      return {
        id: req.id,
        userId: req.sender.id,
        name: req.sender.name,
        username: req.sender.profile?.username || '',
        image: req.sender.image || null,
        city: req.sender.profile?.city || null,
        work: req.sender.profile?.work || null,
        bio: req.sender.profile?.bio || null,
        mutualFriends: mutualCount,
        createdAt: req.createdAt,
      };
    });

    return result;
  }

  /**
   * Facebook-style People You May Know (PYMK) suggestions.
   */
  static async getSuggestions(userId: string, limit: number = 25) {
    const [myFriendIds, blocksIssued, blocksReceived, pendingRequests, myUser] = await Promise.all([
      this.getFriendIdsForUser(userId),
      prisma.userBlock.findMany({ where: { blockerId: userId }, select: { blockedId: true } }),
      prisma.userBlock.findMany({ where: { blockedId: userId }, select: { blockerId: true } }),
      prisma.friendshipRequest.findMany({
        where: {
          OR: [{ senderId: userId }, { receiverId: userId }],
          status: 'PENDING',
        },
        select: { senderId: true, receiverId: true },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { profile: { select: { city: true } } },
      }),
    ]);

    const excludeIds = new Set<string>();
    excludeIds.add(userId);
    myFriendIds.forEach((id) => excludeIds.add(id));
    blocksIssued.forEach((b) => excludeIds.add(b.blockedId));
    blocksReceived.forEach((b) => excludeIds.add(b.blockerId));
    pendingRequests.forEach((r) => {
      excludeIds.add(r.senderId);
      excludeIds.add(r.receiverId);
    });

    const myCity = myUser?.profile?.city?.trim().toLowerCase();

    // Query candidates and compute mutual friend counts concurrently
    const [candidates, mutualCounts] = await Promise.all([
      prisma.user.findMany({
        where: {
          id: { notIn: Array.from(excludeIds) },
          status: 'ACTIVE',
          isBanned: false,
        },
        select: {
          id: true,
          name: true,
          image: true,
          profile: {
            select: {
              username: true,
              city: true,
              work: true,
              bio: true,
            },
          },
        },
        take: 120, // ample candidate pool for scoring
      }),
      this.getMutualCountsMap(myFriendIds, userId),
    ]);

    const scored = candidates.map((candidate) => {
      const mutualCount = mutualCounts.get(candidate.id) || 0;
      const candidateCity = candidate.profile?.city?.trim().toLowerCase();
      const sameCity = Boolean(
        myCity && candidateCity && (myCity.includes(candidateCity) || candidateCity.includes(myCity))
      );

      // Facebook PYMK Scoring:
      // High weight on mutual friends, bonus for same city, slight bonus for complete profile/photo
      const score = mutualCount * 100 + (sameCity ? 15 : 0) + (candidate.image ? 5 : 0);

      let reason = 'Suggested for you';
      if (mutualCount > 0) {
        reason = `${mutualCount} mutual ${mutualCount === 1 ? 'friend' : 'friends'}`;
      } else if (sameCity && candidate.profile?.city) {
        reason = `Lives in ${candidate.profile.city}`;
      }

      return {
        id: candidate.id,
        name: candidate.name,
        username: candidate.profile?.username || '',
        image: candidate.image || null,
        city: candidate.profile?.city || null,
        work: candidate.profile?.work || null,
        bio: candidate.profile?.bio || null,
        mutualFriends: mutualCount,
        reason,
        score,
      };
    });

    // Sort by highest mutual score first, then alphabetically
    scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    return scored.slice(0, limit);
  }

  /**
   * Get relationship status between current user and target user.
   */
  static async getRelationshipStatus(currentUserId: string, targetUserId: string) {
    const resolvedTargetId = await this.resolveUserId(targetUserId, currentUserId);
    if (currentUserId === resolvedTargetId) {
      const friendsCount = await prisma.friendship.count({
        where: { OR: [{ userLowId: currentUserId }, { userHighId: currentUserId }] },
      });
      return { status: 'SELF', friendsCount, mutualCount: 0 };
    }

    // Check blocks
    const [blockByMe, blockByTarget] = await Promise.all([
      prisma.userBlock.findUnique({
        where: { blockerId_blockedId: { blockerId: currentUserId, blockedId: resolvedTargetId } },
      }),
      prisma.userBlock.findUnique({
        where: { blockerId_blockedId: { blockerId: resolvedTargetId, blockedId: currentUserId } },
      }),
    ]);

    if (blockByMe) return { status: 'BLOCKING', friendsCount: 0, mutualCount: 0 };
    if (blockByTarget) return { status: 'BLOCKED', friendsCount: 0, mutualCount: 0 };

    const { userLowId, userHighId } = getCanonicalPair(currentUserId, resolvedTargetId);

    const [friendship, sentRequest, receivedRequest, mutual] = await Promise.all([
      prisma.friendship.findUnique({
        where: { userLowId_userHighId: { userLowId, userHighId } },
      }),
      prisma.friendshipRequest.findUnique({
        where: { senderId_receiverId: { senderId: currentUserId, receiverId: resolvedTargetId } },
      }),
      prisma.friendshipRequest.findUnique({
        where: { senderId_receiverId: { senderId: resolvedTargetId, receiverId: currentUserId } },
      }),
      this.getMutualFriends(currentUserId, resolvedTargetId),
    ]);

    const targetFriendsCount = await prisma.friendship.count({
      where: { OR: [{ userLowId: resolvedTargetId }, { userHighId: resolvedTargetId }] },
    });

    if (friendship) {
      return {
        status: 'FRIENDS',
        friendsCount: targetFriendsCount,
        mutualCount: mutual.count,
        mutualSample: mutual.sample,
      };
    }

    if (sentRequest && sentRequest.status === 'PENDING') {
      return {
        status: 'REQUEST_SENT',
        requestId: sentRequest.id,
        friendsCount: targetFriendsCount,
        mutualCount: mutual.count,
        mutualSample: mutual.sample,
      };
    }

    if (receivedRequest && receivedRequest.status === 'PENDING') {
      return {
        status: 'REQUEST_RECEIVED',
        requestId: receivedRequest.id,
        friendsCount: targetFriendsCount,
        mutualCount: mutual.count,
        mutualSample: mutual.sample,
      };
    }

    return {
      status: 'NONE',
      friendsCount: targetFriendsCount,
      mutualCount: mutual.count,
      mutualSample: mutual.sample,
    };
  }

  /**
   * Send a friend request (or auto-accept if crossed request exists).
   */
  static async sendFriendRequest(senderId: string, rawReceiverId: string) {
    const receiverId = await this.resolveUserId(rawReceiverId, senderId);
    if (senderId === receiverId) {
      throw new Error('You cannot send a friend request to yourself');
    }

    // Check blocks
    const blocked = await prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: senderId, blockedId: receiverId },
          { blockerId: receiverId, blockedId: senderId },
        ],
      },
    });
    if (blocked) {
      throw new Error('Unable to send friend request to this user');
    }

    const { userLowId, userHighId } = getCanonicalPair(senderId, receiverId);

    // Check if already friends
    const existingFriendship = await prisma.friendship.findUnique({
      where: { userLowId_userHighId: { userLowId, userHighId } },
    });
    if (existingFriendship) {
      return { success: true, status: 'FRIENDS', message: 'You are already friends' };
    }

    // Check if reverse request exists
    const reverseRequest = await prisma.friendshipRequest.findUnique({
      where: { senderId_receiverId: { senderId: receiverId, receiverId: senderId } },
    });

    if (reverseRequest && reverseRequest.status === 'PENDING') {
      // Crossed request -> Auto-accept!
      await prisma.$transaction([
        prisma.friendshipRequest.update({
          where: { id: reverseRequest.id },
          data: { status: 'ACCEPTED' },
        }),
        prisma.friendship.upsert({
          where: { userLowId_userHighId: { userLowId, userHighId } },
          update: {},
          create: { userLowId, userHighId },
        }),
      ]);

      return {
        success: true,
        status: 'FRIENDS',
        message: 'Mutual request detected, you are now friends!',
      };
    }

    // Upsert outgoing request
    await prisma.friendshipRequest.upsert({
      where: { senderId_receiverId: { senderId, receiverId } },
      update: { status: 'PENDING' },
      create: { senderId, receiverId, status: 'PENDING' },
    });

    return {
      success: true,
      status: 'REQUEST_SENT',
      message: 'Friend request sent',
    };
  }

  /**
   * Accept an incoming friend request.
   */
  static async acceptFriendRequest(currentUserId: string, requestIdOrSenderId: string) {
    const request = await prisma.friendshipRequest.findFirst({
      where: {
        receiverId: currentUserId,
        status: 'PENDING',
        OR: [{ id: requestIdOrSenderId }, { senderId: requestIdOrSenderId }],
      },
    });

    if (!request) {
      throw new Error('Pending friend request not found');
    }

    const { userLowId, userHighId } = getCanonicalPair(request.senderId, currentUserId);

    await prisma.$transaction([
      prisma.friendshipRequest.update({
        where: { id: request.id },
        data: { status: 'ACCEPTED' },
      }),
      prisma.friendship.upsert({
        where: { userLowId_userHighId: { userLowId, userHighId } },
        update: {},
        create: { userLowId, userHighId },
      }),
    ]);

    return { success: true, message: 'Friend request accepted' };
  }

  /**
   * Decline an incoming friend request.
   */
  static async declineFriendRequest(currentUserId: string, requestIdOrSenderId: string) {
    const request = await prisma.friendshipRequest.findFirst({
      where: {
        receiverId: currentUserId,
        status: 'PENDING',
        OR: [{ id: requestIdOrSenderId }, { senderId: requestIdOrSenderId }],
      },
    });

    if (!request) {
      return { success: true, message: 'Friend request already processed' };
    }

    await prisma.friendshipRequest.update({
      where: { id: request.id },
      data: { status: 'DECLINED' },
    });

    return { success: true, message: 'Friend request declined' };
  }

  /**
   * Cancel an outgoing friend request.
   */
  static async cancelFriendRequest(senderId: string, rawReceiverId: string) {
    const receiverId = await this.resolveUserId(rawReceiverId, senderId);
    const request = await prisma.friendshipRequest.findFirst({
      where: {
        senderId,
        receiverId,
        status: 'PENDING',
      },
    });

    if (request) {
      await prisma.friendshipRequest.update({
        where: { id: request.id },
        data: { status: 'CANCELLED' },
      });
    }

    return { success: true, message: 'Friend request cancelled' };
  }

  /**
   * Unfriend a user.
   */
  static async unfriend(currentUserId: string, rawTargetUserId: string) {
    const targetUserId = await this.resolveUserId(rawTargetUserId, currentUserId);
    const { userLowId, userHighId } = getCanonicalPair(currentUserId, targetUserId);

    await prisma.$transaction([
      prisma.friendship.deleteMany({
        where: { userLowId, userHighId },
      }),
      prisma.friendshipRequest.deleteMany({
        where: {
          OR: [
            { senderId: currentUserId, receiverId: targetUserId },
            { senderId: targetUserId, receiverId: currentUserId },
          ],
        },
      }),
    ]);

    return { success: true, message: 'Friend removed' };
  }

  /**
   * Block a user.
   */
  static async blockUser(blockerId: string, rawBlockedId: string) {
    const blockedId = await this.resolveUserId(rawBlockedId, blockerId);
    if (blockerId === blockedId) {
      throw new Error('You cannot block yourself');
    }

    const { userLowId, userHighId } = getCanonicalPair(blockerId, blockedId);

    await prisma.$transaction([
      prisma.userBlock.upsert({
        where: { blockerId_blockedId: { blockerId, blockedId } },
        update: {},
        create: { blockerId, blockedId },
      }),
      prisma.friendship.deleteMany({
        where: { userLowId, userHighId },
      }),
      prisma.friendshipRequest.deleteMany({
        where: {
          OR: [
            { senderId: blockerId, receiverId: blockedId },
            { senderId: blockedId, receiverId: blockerId },
          ],
        },
      }),
    ]);

    return { success: true, message: 'User blocked' };
  }

  /**
   * Unblock a user.
   */
  static async unblockUser(blockerId: string, blockedId: string) {
    await prisma.userBlock.deleteMany({
      where: { blockerId, blockedId },
    });

    return { success: true, message: 'User unblocked' };
  }

  /**
   * Get blocked users list.
   */
  static async getBlockedUsers(currentUserId: string) {
    const blocks = await prisma.userBlock.findMany({
      where: { blockerId: currentUserId },
      include: {
        blocked: {
          select: {
            id: true,
            name: true,
            image: true,
            profile: { select: { username: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return blocks.map((b) => ({
      id: b.blocked.id,
      name: b.blocked.name,
      username: b.blocked.profile?.username,
      image: b.blocked.image,
      blockedAt: b.createdAt,
    }));
  }
}

export default FriendsService;

