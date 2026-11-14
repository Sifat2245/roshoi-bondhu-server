import { PostService } from '../post.service.js';
import { FriendsService } from '../../friends/friends.service.js';
function toBase64(str) {
    return Buffer.from(str, 'utf-8').toString('base64');
}
function fromBase64(str) {
    try {
        return Buffer.from(str, 'base64').toString('utf-8');
    }
    catch {
        return '';
    }
}
export const postResolvers = {
    Query: {
        feed: async (_parent, args, context) => {
            const currentUserId = context.currentUser?.id;
            const { first = 10, after, type, cuisine, search, authorId, groupId, filter } = args;
            const limit = Math.min(Math.max(1, first || 10), 50);
            const where = {
                status: 'PUBLISHED',
                deletedAt: null,
            };
            if (type && ['CASUAL', 'RECIPE', 'REPOST'].includes(type.toUpperCase())) {
                where.postType = type.toUpperCase();
            }
            if (cuisine) {
                where.cuisine = { equals: cuisine, mode: 'insensitive' };
            }
            if (authorId) {
                where.authorId = authorId;
            }
            if (groupId) {
                const targetGroup = await context.prisma.group.findUnique({
                    where: { id: groupId },
                    select: { id: true, privacy: true },
                });
                if (!targetGroup) {
                    return {
                        edges: [],
                        pageInfo: {
                            hasNextPage: false,
                            hasPreviousPage: false,
                            startCursor: null,
                            endCursor: null,
                        },
                        totalCount: 0,
                    };
                }
                if (targetGroup.privacy === 'PRIVATE' || targetGroup.privacy === 'SECRET') {
                    if (!currentUserId) {
                        throw new Error('This group is private. Please sign in to view its posts.');
                    }
                    const isPlatformStaff = context.currentUser?.role && ['ADMIN', 'MODERATOR'].includes(context.currentUser.role);
                    if (!isPlatformStaff) {
                        const membership = await context.prisma.groupMember.findUnique({
                            where: { groupId_userId: { groupId, userId: currentUserId } },
                        });
                        if (!membership || !membership.isApproved) {
                            throw new Error('This group is private. You must be an approved member to view its posts.');
                        }
                    }
                }
                where.groupId = groupId;
            }
            if (search) {
                where.OR = [
                    { title: { contains: search, mode: 'insensitive' } },
                    { caption: { contains: search, mode: 'insensitive' } },
                    { cuisine: { contains: search, mode: 'insensitive' } },
                ];
            }
            if (filter === 'FOLLOWING' && currentUserId) {
                const followingUsers = await context.prisma.follow.findMany({
                    where: { followerId: currentUserId },
                    select: { followingId: true },
                });
                const followingIds = followingUsers.map((f) => f.followingId);
                where.authorId = { in: [...followingIds, currentUserId] };
            }
            // Filter out blocked/blocking users
            if (currentUserId) {
                const blocks = await context.prisma.userBlock.findMany({
                    where: {
                        OR: [{ blockerId: currentUserId }, { blockedId: currentUserId }],
                    },
                    select: { blockerId: true, blockedId: true },
                });
                if (blocks.length > 0) {
                    const blockedIds = blocks.map((b) => (b.blockerId === currentUserId ? b.blockedId : b.blockerId));
                    if (authorId && blockedIds.includes(authorId)) {
                        return {
                            edges: [],
                            pageInfo: {
                                hasNextPage: false,
                                hasPreviousPage: false,
                                startCursor: null,
                                endCursor: null,
                            },
                            totalCount: 0,
                        };
                    }
                    if (where.authorId && typeof where.authorId === 'object' && where.authorId.in) {
                        where.authorId.in = where.authorId.in.filter((id) => !blockedIds.includes(id));
                    }
                    else if (!where.authorId) {
                        where.authorId = { notIn: blockedIds };
                    }
                }
            }
            // Audience & Privacy Filters
            if (currentUserId) {
                const friendIdsSet = await FriendsService.getFriendIdsForUser(currentUserId);
                const friendIds = Array.from(friendIdsSet);
                if (authorId) {
                    if (authorId !== currentUserId) {
                        const isFriend = friendIdsSet.has(authorId);
                        where.audience = isFriend ? { in: ['PUBLIC', 'FRIENDS'] } : 'PUBLIC';
                    }
                }
                else {
                    const audienceOr = [
                        { authorId: currentUserId },
                        { audience: 'PUBLIC' },
                    ];
                    if (friendIds.length > 0) {
                        audienceOr.push({
                            audience: 'FRIENDS',
                            authorId: { in: friendIds },
                        });
                    }
                    if (where.OR) {
                        where.AND = [{ OR: where.OR }, { OR: audienceOr }];
                        delete where.OR;
                    }
                    else {
                        where.OR = audienceOr;
                    }
                }
            }
            else {
                where.audience = 'PUBLIC';
            }
            // If not querying a specific group, ensure posts from private groups do not leak into the general feed
            if (!groupId) {
                const groupPrivacyCondition = {
                    OR: [
                        { groupId: null },
                        { group: { privacy: 'PUBLIC' } },
                        ...(currentUserId
                            ? [
                                {
                                    group: {
                                        members: {
                                            some: { userId: currentUserId, isApproved: true },
                                        },
                                    },
                                },
                            ]
                            : []),
                    ],
                };
                if (where.AND) {
                    where.AND.push(groupPrivacyCondition);
                }
                else if (where.OR) {
                    where.AND = [{ OR: where.OR }, groupPrivacyCondition];
                    delete where.OR;
                }
                else {
                    where.AND = [groupPrivacyCondition];
                }
            }
            let cursorObj = undefined;
            if (after) {
                const decodedId = fromBase64(after);
                if (decodedId) {
                    cursorObj = { id: decodedId };
                }
            }
            const posts = await context.prisma.post.findMany({
                where,
                take: limit + 1,
                ...(cursorObj ? { cursor: cursorObj, skip: 1 } : {}),
                orderBy: { createdAt: 'desc' },
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
                },
            });
            const hasNextPage = posts.length > limit;
            const nodes = hasNextPage ? posts.slice(0, limit) : posts;
            const edges = nodes.map((post) => ({
                cursor: toBase64(post.id),
                node: {
                    ...post,
                    likeCount: post._count?.likes ?? 0,
                    commentCount: post._count?.comments ?? 0,
                    repostCount: post._count?.reposts ?? 0,
                    hasLiked: currentUserId ? Boolean(post.likes && post.likes.length > 0) : false,
                },
            }));
            const totalCount = await context.prisma.post.count({ where });
            return {
                edges,
                pageInfo: {
                    hasNextPage,
                    hasPreviousPage: Boolean(after),
                    startCursor: edges[0]?.cursor || null,
                    endCursor: edges[edges.length - 1]?.cursor || null,
                },
                totalCount,
            };
        },
        post: async (_parent, args, context) => {
            const currentUserId = context.currentUser?.id;
            return await PostService.getPostById(args.id, currentUserId);
        },
        trash: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            const userId = context.currentUser.id;
            const { first = 10, after } = args;
            const limit = Math.min(Math.max(1, first || 10), 50);
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            // Auto-purge past 30 days
            await context.prisma.post.deleteMany({
                where: {
                    authorId: userId,
                    deletedAt: {
                        lt: thirtyDaysAgo,
                    },
                },
            });
            let cursorObj = undefined;
            if (after) {
                const decodedId = fromBase64(after);
                if (decodedId) {
                    cursorObj = { id: decodedId };
                }
            }
            const trashedPosts = await context.prisma.post.findMany({
                where: {
                    authorId: userId,
                    deletedAt: {
                        gte: thirtyDaysAgo,
                    },
                },
                take: limit + 1,
                ...(cursorObj ? { cursor: cursorObj, skip: 1 } : {}),
                orderBy: {
                    deletedAt: 'desc',
                },
                include: {
                    author: {
                        select: {
                            id: true,
                            name: true,
                            image: true,
                        },
                    },
                    _count: {
                        select: {
                            likes: true,
                            comments: true,
                            reposts: true,
                        },
                    },
                },
            });
            const hasNextPage = trashedPosts.length > limit;
            const nodes = hasNextPage ? trashedPosts.slice(0, limit) : trashedPosts;
            const edges = nodes.map((p) => {
                const deletedTime = p.deletedAt ? new Date(p.deletedAt).getTime() : Date.now();
                const elapsedDays = Math.floor((Date.now() - deletedTime) / (24 * 60 * 60 * 1000));
                const daysRemaining = Math.max(0, 30 - elapsedDays);
                return {
                    cursor: toBase64(p.id),
                    node: {
                        ...p,
                        daysRemaining,
                        likeCount: p._count?.likes ?? 0,
                        commentCount: p._count?.comments ?? 0,
                        repostCount: p._count?.reposts ?? 0,
                        hasLiked: false,
                    },
                };
            });
            const totalCount = await context.prisma.post.count({
                where: {
                    authorId: userId,
                    deletedAt: {
                        gte: thirtyDaysAgo,
                    },
                },
            });
            return {
                edges,
                pageInfo: {
                    hasNextPage,
                    hasPreviousPage: Boolean(after),
                    startCursor: edges[0]?.cursor || null,
                    endCursor: edges[edges.length - 1]?.cursor || null,
                },
                totalCount,
            };
        },
    },
    Mutation: {
        createPost: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            const post = await PostService.createPost(context.currentUser.id, args.input, context.currentUser.role);
            return {
                ...post,
                likeCount: 0,
                commentCount: 0,
                repostCount: 0,
                hasLiked: false,
            };
        },
        updatePost: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            const existing = await context.prisma.post.findUnique({
                where: { id: args.id },
            });
            if (!existing) {
                throw new Error('Post not found.');
            }
            if (existing.authorId !== context.currentUser.id && context.currentUser.role !== 'ADMIN') {
                throw new Error('Not authorized to edit this post.');
            }
            const updated = await context.prisma.post.update({
                where: { id: args.id },
                data: {
                    caption: args.input.caption ?? existing.caption,
                    title: args.input.title ?? existing.title,
                },
                include: {
                    author: {
                        select: { id: true, name: true, image: true, role: true },
                    },
                    _count: {
                        select: { likes: true, comments: true, reposts: true },
                    },
                },
            });
            return {
                ...updated,
                likeCount: updated._count.likes,
                commentCount: updated._count.comments,
                repostCount: updated._count.reposts,
                hasLiked: false,
            };
        },
        repostPost: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            const repost = await PostService.repostPost(context.currentUser.id, args.originalPostId, args.caption, args.audience);
            return {
                ...repost,
                likeCount: 0,
                commentCount: 0,
                repostCount: 0,
                hasLiked: false,
            };
        },
        toggleLike: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            return await PostService.toggleLike(context.currentUser.id, args.postId);
        },
        createComment: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            return await PostService.createComment(context.currentUser.id, args.postId, args.content, args.parentId);
        },
        deleteComment: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            const comment = await context.prisma.comment.findUnique({
                where: { id: args.id },
            });
            if (!comment)
                throw new Error('Comment not found.');
            if (comment.userId !== context.currentUser.id && context.currentUser.role !== 'ADMIN') {
                throw new Error('Not authorized to delete this comment.');
            }
            await context.prisma.comment.delete({ where: { id: args.id } });
            return true;
        },
        deletePost: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            await PostService.deletePost(context.currentUser.id, context.currentUser.role, args.postId);
            return { success: true, id: args.postId };
        },
        restorePost: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            return await PostService.restorePost(context.currentUser.id, args.postId);
        },
        permanentDeletePost: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            await PostService.permanentDeletePost(context.currentUser.id, context.currentUser.role, args.postId);
            return { success: true, id: args.postId };
        },
        emptyTrash: async (_parent, _args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            await PostService.emptyTrash(context.currentUser.id);
            return true;
        },
    },
    Post: {
        audience: (post) => {
            const aud = String(post.audience || 'PUBLIC').toUpperCase();
            return ['PUBLIC', 'FRIENDS', 'ONLY_ME'].includes(aud) ? aud : 'PUBLIC';
        },
        postType: (post) => {
            const pt = String(post.postType || 'CASUAL').toUpperCase();
            return ['CASUAL', 'RECIPE', 'REPOST'].includes(pt) ? pt : 'CASUAL';
        },
        status: (post) => post.status || 'PUBLISHED',
        images: (post) => Array.isArray(post.images) && post.images.length > 0
            ? post.images
            : post.image
                ? [post.image]
                : [],
        categories: (post) => (Array.isArray(post.categories) ? post.categories : []),
        ingredients: (post) => {
            if (Array.isArray(post.ingredients))
                return post.ingredients;
            if (typeof post.ingredients === 'string') {
                try {
                    return JSON.parse(post.ingredients);
                }
                catch {
                    return [post.ingredients];
                }
            }
            return [];
        },
        instructions: (post) => {
            if (Array.isArray(post.instructions))
                return post.instructions;
            if (typeof post.instructions === 'string') {
                try {
                    return JSON.parse(post.instructions);
                }
                catch {
                    return [post.instructions];
                }
            }
            return [];
        },
        createdAt: (post) => post.createdAt instanceof Date ? post.createdAt.toISOString() : String(post.createdAt || ''),
        updatedAt: (post) => post.updatedAt instanceof Date
            ? post.updatedAt.toISOString()
            : post.updatedAt
                ? String(post.updatedAt)
                : null,
        deletedAt: (post) => post.deletedAt instanceof Date
            ? post.deletedAt.toISOString()
            : post.deletedAt
                ? String(post.deletedAt)
                : null,
        likeCount: (post) => post.likeCount ?? post._count?.likes ?? 0,
        commentCount: (post) => post.commentCount ?? post._count?.comments ?? 0,
        repostCount: (post) => post.repostCount ?? post._count?.reposts ?? 0,
        hasLiked: (post) => Boolean(post.hasLiked),
    },
    OriginalPost: {
        postType: (post) => {
            const pt = String(post.postType || 'CASUAL').toUpperCase();
            return ['CASUAL', 'RECIPE', 'REPOST'].includes(pt) ? pt : 'CASUAL';
        },
        images: (post) => Array.isArray(post.images) && post.images.length > 0
            ? post.images
            : post.image
                ? [post.image]
                : [],
        ingredients: (post) => {
            if (Array.isArray(post.ingredients))
                return post.ingredients;
            if (typeof post.ingredients === 'string') {
                try {
                    return JSON.parse(post.ingredients);
                }
                catch {
                    return [post.ingredients];
                }
            }
            return [];
        },
        instructions: (post) => {
            if (Array.isArray(post.instructions))
                return post.instructions;
            if (typeof post.instructions === 'string') {
                try {
                    return JSON.parse(post.instructions);
                }
                catch {
                    return [post.instructions];
                }
            }
            return [];
        },
        createdAt: (post) => post.createdAt instanceof Date ? post.createdAt.toISOString() : String(post.createdAt || ''),
    },
    PostComment: {
        createdAt: (c) => c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt || ''),
        updatedAt: (c) => c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt ? String(c.updatedAt) : null,
    },
};
export default postResolvers;
