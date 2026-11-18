import prisma from '../../lib/prisma.js';
import { FriendsService } from '../friends/friends.service.js';

export interface PostSearchFilters {
  recentPosts?: boolean;
  datePosted?: string; // ANY_TIME, TODAY, THIS_WEEK, THIS_MONTH, 2026, 2025
  postsFrom?: string; // ANYONE, YOU, FRIENDS, GROUPS
  taggedLocation?: string;
}

export class SearchService {
  /**
   * Get recent searches for a user from database.
   */
  static async getRecentSearches(userId: string, limit: number = 8) {
    if (!userId) return [];

    const items = await prisma.recentSearch.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    const userIdsToFetch = items
      .filter((i) => i.targetType === 'USER' && i.targetId)
      .map((i) => i.targetId as string);

    const groupIdsToFetch = items
      .filter((i) => i.targetType === 'GROUP' && i.targetId)
      .map((i) => i.targetId as string);

    const [users, groups] = await Promise.all([
      userIdsToFetch.length > 0
        ? prisma.user.findMany({
            where: { id: { in: userIdsToFetch } },
            select: {
              id: true,
              name: true,
              image: true,
              role: true,
              profile: {
                select: {
                  username: true,
                  city: true,
                  work: true,
                },
              },
            },
          })
        : [],
      groupIdsToFetch.length > 0
        ? prisma.group.findMany({
            where: { id: { in: groupIdsToFetch } },
            select: {
              id: true,
              name: true,
              slug: true,
              avatar: true,
              privacy: true,
            },
          })
        : [],
    ]);

    const userMap = new Map<string, any>(users.map((u: any) => [u.id, u] as [string, any]));
    const groupMap = new Map<string, any>(groups.map((g: any) => [g.id, g] as [string, any]));

    return items.map((item) => {
      let resolvedUser = null;
      let resolvedGroup = null;

      if (item.targetType === 'USER' && item.targetId) {
        const u = userMap.get(item.targetId);
        if (u) {
          resolvedUser = {
            id: u.id,
            name: u.name,
            image: u.image,
            role: u.role,
            username: u.profile?.username || null,
            city: u.profile?.city || null,
            work: u.profile?.work || null,
          };
        }
      } else if (item.targetType === 'GROUP' && item.targetId) {
        const g = groupMap.get(item.targetId);
        if (g) {
          resolvedGroup = {
            id: g.id,
            name: g.name,
            slug: g.slug,
            avatar: g.avatar,
            privacy: g.privacy,
          };
        }
      }

      return {
        id: item.id,
        query: item.query,
        targetType: item.targetType,
        targetId: item.targetId,
        user: resolvedUser,
        group: resolvedGroup,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      };
    });
  }

  /**
   * Save or update recent search entry in database.
   */
  static async saveRecentSearch(
    userId: string,
    query: string,
    targetType: 'KEYWORD' | 'USER' | 'GROUP',
    targetId?: string
  ) {
    if (!userId || !query.trim()) {
      throw new Error('User ID and search query are required.');
    }

    const trimmed = query.trim();

    const record = await prisma.recentSearch.upsert({
      where: {
        userId_query_targetType: {
          userId,
          query: trimmed,
          targetType,
        },
      },
      create: {
        userId,
        query: trimmed,
        targetType,
        targetId: targetId || null,
      },
      update: {
        updatedAt: new Date(),
        targetId: targetId || null,
      },
    });

    // Prune entries beyond the latest 20
    const count = await prisma.recentSearch.count({ where: { userId } });
    if (count > 20) {
      const oldest = await prisma.recentSearch.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        skip: 20,
        select: { id: true },
      });
      if (oldest.length > 0) {
        await prisma.recentSearch.deleteMany({
          where: { id: { in: oldest.map((o) => o.id) } },
        });
      }
    }

    return {
      id: record.id,
      query: record.query,
      targetType: record.targetType,
      targetId: record.targetId,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  /**
   * Remove single recent search entry.
   */
  static async removeRecentSearch(userId: string, id: string) {
    if (!userId || !id) return false;
    const result = await prisma.recentSearch.deleteMany({
      where: { id, userId },
    });
    return result.count > 0;
  }

  /**
   * Clear all recent searches for a user.
   */
  static async clearRecentSearches(userId: string) {
    if (!userId) return false;
    await prisma.recentSearch.deleteMany({
      where: { userId },
    });
    return true;
  }

  /**
   * Autocomplete suggestions (Users & Groups ONLY, no posts).
   */
  static async getSearchSuggestions(query: string, currentUserId?: string) {
    const q = query.trim();
    if (!q) {
      return { users: [], groups: [] };
    }

    const [matchingUsers, matchingGroups, friendIdsSet] = await Promise.all([
      prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { profile: { username: { contains: q, mode: 'insensitive' } } },
          ],
        },
        take: 5,
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          role: true,
          profile: {
            select: {
              username: true,
              bio: true,
              city: true,
              work: true,
              education: true,
            },
          },
        },
      }),
      prisma.group.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { slug: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 5,
        select: {
          id: true,
          name: true,
          slug: true,
          avatar: true,
          coverImage: true,
          description: true,
          privacy: true,
          members: currentUserId
            ? {
                where: { userId: currentUserId, isApproved: true },
                select: { id: true },
              }
            : false,
        },
      }),
      currentUserId
        ? FriendsService.getFriendIdsForUser(currentUserId)
        : Promise.resolve(new Set<string>()),
    ]);

    let mutualCountsMap: Map<string, number> | null = null;
    if (currentUserId && friendIdsSet.size > 0) {
      mutualCountsMap = await FriendsService.getMutualCountsMap(friendIdsSet, currentUserId);
    }

    const users = matchingUsers.map((u) => {
      const isMe = currentUserId ? u.id === currentUserId : false;
      const isFriend = currentUserId ? friendIdsSet.has(u.id) : false;
      const mutualFriendsCount =
        currentUserId && mutualCountsMap ? mutualCountsMap.get(u.id) || 0 : 0;

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        image: u.image,
        role: u.role,
        username: u.profile?.username || null,
        bio: u.profile?.bio || null,
        city: u.profile?.city || null,
        work: u.profile?.work || null,
        education: u.profile?.education || null,
        mutualFriendsCount,
        friendshipStatus: isFriend ? 'FRIENDS' : 'NONE',
        isMe,
      };
    });

    const groups = matchingGroups.map((g: any) => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
      avatar: g.avatar,
      coverImage: g.coverImage,
      description: g.description,
      privacy: g.privacy,
      membersCount: 0, // No member count in autocomplete dropdown
      isMember: Boolean(g.members && g.members.length > 0),
      membershipStatus: g.members && g.members.length > 0 ? 'APPROVED' : 'NONE',
    }));

    return { users, groups };
  }

  /**
   * Full Search Page Results (Users, Groups with member count, and relevant Posts).
   */
  static async searchAll(
    query: string,
    postFilters: PostSearchFilters = {},
    currentUserId?: string
  ) {
    const q = query.trim();
    if (!q) {
      return {
        users: [],
        groups: [],
        posts: [],
        totalUsers: 0,
        totalGroups: 0,
        totalPosts: 0,
      };
    }

    // 1. Blocked users filtering
    let blockedIds: string[] = [];
    if (currentUserId) {
      const blocks = await prisma.userBlock.findMany({
        where: {
          OR: [{ blockerId: currentUserId }, { blockedId: currentUserId }],
        },
        select: { blockerId: true, blockedId: true },
      });
      blockedIds = blocks.map((b) =>
        b.blockerId === currentUserId ? b.blockedId : b.blockerId
      );
    }

    // 2. Fetch Users
    const [matchingUsers, matchingGroups, friendIdsSet, memberships] =
      await Promise.all([
        prisma.user.findMany({
          where: {
            AND: [
              {
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { email: { contains: q, mode: 'insensitive' } },
                  { profile: { username: { contains: q, mode: 'insensitive' } } },
                  { profile: { bio: { contains: q, mode: 'insensitive' } } },
                  { profile: { city: { contains: q, mode: 'insensitive' } } },
                ],
              },
              blockedIds.length > 0 ? { id: { notIn: blockedIds } } : {},
            ],
          },
          take: 20,
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
            profile: {
              select: {
                username: true,
                bio: true,
                city: true,
                work: true,
                education: true,
              },
            },
          },
        }),
        prisma.group.findMany({
          where: {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { slug: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
            ],
          },
          take: 20,
          select: {
            id: true,
            name: true,
            slug: true,
            avatar: true,
            coverImage: true,
            description: true,
            privacy: true,
            _count: {
              select: {
                members: { where: { isApproved: true } },
              },
            },
            members: currentUserId
              ? {
                  where: { userId: currentUserId, isApproved: true },
                  select: { id: true },
                }
              : false,
          },
        }),
        currentUserId
          ? FriendsService.getFriendIdsForUser(currentUserId)
          : Promise.resolve(new Set<string>()),
        currentUserId
          ? prisma.groupMember.findMany({
              where: { userId: currentUserId, isApproved: true },
              select: { groupId: true },
            })
          : Promise.resolve([]),
      ]);

    const friendIds = Array.from(friendIdsSet);
    const myGroupIds = memberships.map((m) => m.groupId);

    let mutualCountsMap: Map<string, number> | null = null;
    if (currentUserId && friendIdsSet.size > 0) {
      mutualCountsMap = await FriendsService.getMutualCountsMap(friendIdsSet, currentUserId);
    }

    const users = matchingUsers.map((u) => {
      const isMe = currentUserId ? u.id === currentUserId : false;
      const isFriend = currentUserId ? friendIdsSet.has(u.id) : false;
      const mutualFriendsCount =
        currentUserId && mutualCountsMap ? mutualCountsMap.get(u.id) || 0 : 0;

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        image: u.image,
        role: u.role,
        username: u.profile?.username || null,
        bio: u.profile?.bio || null,
        city: u.profile?.city || null,
        work: u.profile?.work || null,
        education: u.profile?.education || null,
        mutualFriendsCount,
        friendshipStatus: isFriend ? 'FRIENDS' : 'NONE',
        isMe,
      };
    });

    const groups = matchingGroups.map((g: any) => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
      avatar: g.avatar,
      coverImage: g.coverImage,
      description: g.description,
      privacy: g.privacy,
      membersCount: g._count?.members ?? 0,
      isMember: Boolean(g.members && g.members.length > 0),
      membershipStatus: g.members && g.members.length > 0 ? 'APPROVED' : 'NONE',
    }));

    // 3. Build Post Query Filters
    const postWhere: any = {
      deletedAt: null,
      status: 'PUBLISHED',
      AND: [
        {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { caption: { contains: q, mode: 'insensitive' } },
            { cuisine: { contains: q, mode: 'insensitive' } },
            { author: { name: { contains: q, mode: 'insensitive' } } },
            { author: { profile: { username: { contains: q, mode: 'insensitive' } } } },
            { group: { name: { contains: q, mode: 'insensitive' } } },
          ],
        },
      ],
    };

    if (blockedIds.length > 0) {
      postWhere.authorId = { notIn: blockedIds };
    }

    // Filter out posts hidden by current user
    if (currentUserId) {
      const hidden = await prisma.userHiddenPost.findMany({
        where: { userId: currentUserId },
        select: { postId: true },
      });
      if (hidden.length > 0) {
        postWhere.id = { notIn: hidden.map((h) => h.postId) };
      }
    }

    // Post privacy conditions
    if (currentUserId) {
      postWhere.AND.push({
        OR: [
          { authorId: currentUserId },
          { audience: 'PUBLIC' },
          { audience: 'FRIENDS', authorId: { in: friendIds } },
        ],
      });
      postWhere.AND.push({
        OR: [
          { groupId: null },
          { group: { privacy: 'PUBLIC' } },
          { group: { members: { some: { userId: currentUserId, isApproved: true } } } },
        ],
      });
    } else {
      postWhere.audience = 'PUBLIC';
      postWhere.AND.push({
        OR: [{ groupId: null }, { group: { privacy: 'PUBLIC' } }],
      });
    }

    // Apply Post Sub-filters (Date, Posts from, Location)
    if (postFilters.datePosted && postFilters.datePosted !== 'ANY_TIME') {
      const now = new Date();
      let dateCondition: any = undefined;

      switch (postFilters.datePosted) {
        case 'TODAY':
          dateCondition = {
            gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          };
          break;
        case 'THIS_WEEK':
          dateCondition = {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          };
          break;
        case 'THIS_MONTH':
          dateCondition = {
            gte: new Date(now.getFullYear(), now.getMonth(), 1),
          };
          break;
        case '2026':
          dateCondition = {
            gte: new Date('2026-01-01T00:00:00.000Z'),
            lt: new Date('2027-01-01T00:00:00.000Z'),
          };
          break;
        case '2025':
          dateCondition = {
            gte: new Date('2025-01-01T00:00:00.000Z'),
            lt: new Date('2026-01-01T00:00:00.000Z'),
          };
          break;
        default:
          break;
      }

      if (dateCondition) {
        postWhere.createdAt = dateCondition;
      }
    }

    if (postFilters.postsFrom) {
      if (postFilters.postsFrom === 'YOU' && currentUserId) {
        postWhere.authorId = currentUserId;
      } else if (postFilters.postsFrom === 'FRIENDS' && currentUserId) {
        postWhere.authorId = { in: friendIds };
      } else if (postFilters.postsFrom === 'GROUPS' && currentUserId) {
        postWhere.groupId = { in: myGroupIds };
      }
    }

    if (postFilters.taggedLocation && postFilters.taggedLocation.trim()) {
      const loc = postFilters.taggedLocation.trim();
      postWhere.AND.push({
        OR: [
          { author: { profile: { city: { contains: loc, mode: 'insensitive' } } } },
          { cuisine: { contains: loc, mode: 'insensitive' } },
        ],
      });
    }

    const posts = await prisma.post.findMany({
      where: postWhere,
      take: 25,
      orderBy: postFilters.recentPosts ? { createdAt: 'desc' } : { createdAt: 'desc' },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
            bio: true,
          },
        },
        group: {
          select: {
            id: true,
            name: true,
            slug: true,
            avatar: true,
            privacy: true,
          },
        },
        originalPost: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                image: true,
                role: true,
              },
            },
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
            reposts: true,
          },
        },
        likes: currentUserId
          ? {
              where: { userId: currentUserId },
              select: { id: true },
            }
          : false,
        poll: {
          include: {
            post: { select: { authorId: true } },
            options: {
              include: {
                votes: {
                  include: {
                    user: { select: { id: true, name: true, image: true, role: true } },
                  },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    const formattedPosts = posts.map((post: any) => ({
      ...post,
      likeCount: post._count?.likes ?? 0,
      commentCount: post._count?.comments ?? 0,
      repostCount: post._count?.reposts ?? 0,
      hasLiked: currentUserId ? Boolean(post.likes && post.likes.length > 0) : false,
      createdAt:
        post.createdAt instanceof Date ? post.createdAt.toISOString() : String(post.createdAt || ''),
      updatedAt:
        post.updatedAt instanceof Date
          ? post.updatedAt.toISOString()
          : post.updatedAt
          ? String(post.updatedAt)
          : null,
      deletedAt:
        post.deletedAt instanceof Date
          ? post.deletedAt.toISOString()
          : post.deletedAt
          ? String(post.deletedAt)
          : null,
    }));

    return {
      users,
      groups,
      posts: formattedPosts,
      totalUsers: users.length,
      totalGroups: groups.length,
      totalPosts: formattedPosts.length,
    };
  }
}
export default SearchService;
