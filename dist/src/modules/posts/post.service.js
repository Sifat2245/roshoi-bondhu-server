import prisma from '../../lib/prisma.js';
import { paginationUtils } from '../../shared/pagination/pagination.js';
import { FriendsService } from '../friends/friends.service.js';
const getFeed = async (query, currentUserId) => {
    const { page, limit, skip } = paginationUtils.getPaginationOptions(query);
    const { type, cuisine, search, authorId, groupId, filter } = query;
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
        const followingUsers = await prisma.follow.findMany({
            where: { followerId: currentUserId },
            select: { followingId: true },
        });
        const followingIds = followingUsers.map((f) => f.followingId);
        where.authorId = { in: [...followingIds, currentUserId] };
    }
    // Filter out any posts from blocked/blocking users
    if (currentUserId) {
        const blocks = await prisma.userBlock.findMany({
            where: {
                OR: [{ blockerId: currentUserId }, { blockedId: currentUserId }],
            },
            select: { blockerId: true, blockedId: true },
        });
        if (blocks.length > 0) {
            const blockedIds = blocks.map((b) => (b.blockerId === currentUserId ? b.blockedId : b.blockerId));
            if (authorId && blockedIds.includes(authorId)) {
                return { data: [], meta: { page, limit, total: 0, totalPages: 0 } };
            }
            if (where.authorId && typeof where.authorId === 'object' && where.authorId.in) {
                where.authorId.in = where.authorId.in.filter((id) => !blockedIds.includes(id));
            }
            else if (!where.authorId) {
                where.authorId = { notIn: blockedIds };
            }
        }
    }
    // Audience & Privacy Filter (Phase 4)
    // PUBLIC: visible to everyone
    // FRIENDS: visible only to accepted friends
    // ONLY_ME: visible only to the author
    if (currentUserId) {
        const friendIdsSet = await FriendsService.getFriendIdsForUser(currentUserId);
        const friendIds = Array.from(friendIdsSet);
        if (authorId) {
            if (authorId !== currentUserId) {
                // Viewing someone else's profile
                const isFriend = friendIdsSet.has(authorId);
                if (isFriend) {
                    where.audience = { in: ['PUBLIC', 'FRIENDS'] };
                }
                else {
                    where.audience = 'PUBLIC';
                }
            }
            // If authorId === currentUserId, the user can see all their own posts (PUBLIC, FRIENDS, ONLY_ME)
        }
        else {
            // General feed (no specific authorId requested)
            const audienceOr = [
                { authorId: currentUserId }, // Author sees all their own posts
                { audience: 'PUBLIC' }, // Public posts from anyone
            ];
            if (friendIds.length > 0) {
                audienceOr.push({
                    audience: 'FRIENDS',
                    authorId: { in: friendIds }, // Friends-only posts from user's friends
                });
            }
            if (where.OR) {
                where.AND = [
                    { OR: where.OR },
                    { OR: audienceOr },
                ];
                delete where.OR;
            }
            else {
                where.OR = audienceOr;
            }
        }
    }
    else {
        // Unauthenticated visitor: can only see PUBLIC posts
        where.audience = 'PUBLIC';
    }
    const [posts, total] = await Promise.all([
        prisma.post.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
                author: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        image: true,
                        role: true,
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
        }),
        prisma.post.count({ where }),
    ]);
    const formattedPosts = posts.map((post) => ({
        ...post,
        likeCount: post._count.likes,
        commentCount: post._count.comments,
        repostCount: post._count.reposts,
        hasLiked: currentUserId ? post.likes && post.likes.length > 0 : false,
        likes: undefined,
    }));
    const meta = paginationUtils.getPaginationMeta(page, limit, total);
    return { meta, data: formattedPosts };
};
const getPostById = async (id, currentUserId) => {
    const post = await prisma.post.findUnique({
        where: { id },
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
                        },
                    },
                },
            },
            comments: {
                where: { parentId: null },
                orderBy: { createdAt: 'desc' },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            image: true,
                        },
                    },
                    replies: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                    image: true,
                                },
                            },
                        },
                        orderBy: { createdAt: 'asc' },
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
    if (!post || post.deletedAt) {
        throw new Error('Post not found');
    }
    // Audience & Block access control (Phase 4)
    if (currentUserId) {
        if (post.authorId !== currentUserId) {
            // Check block
            const isBlocked = await prisma.userBlock.findFirst({
                where: {
                    OR: [
                        { blockerId: currentUserId, blockedId: post.authorId },
                        { blockerId: post.authorId, blockedId: currentUserId },
                    ],
                },
            });
            if (isBlocked) {
                throw new Error('Post not found');
            }
            if (post.audience === 'ONLY_ME') {
                throw new Error('This post is private.');
            }
            if (post.audience === 'FRIENDS') {
                const friendIds = await FriendsService.getFriendIdsForUser(currentUserId);
                if (!friendIds.has(post.authorId)) {
                    throw new Error('This post is only visible to friends of the author.');
                }
            }
        }
    }
    else {
        if (post.audience !== 'PUBLIC') {
            throw new Error('This post is private. Please sign in to view.');
        }
    }
    return {
        ...post,
        likeCount: post._count.likes,
        commentCount: post._count.comments,
        repostCount: post._count.reposts,
        hasLiked: currentUserId ? post.likes && post.likes.length > 0 : false,
        likes: undefined,
    };
};
const createPost = async (authorId, postData, userRole) => {
    const { postType = 'CASUAL', audience = 'PUBLIC', caption, title, image, images = [], ingredients, instructions, preparationTime, servings, cuisine, categories = [], groupId, } = postData;
    const validAudience = ['PUBLIC', 'FRIENDS', 'ONLY_ME'].includes(audience)
        ? audience
        : 'PUBLIC';
    const resolvedImages = Array.isArray(images) && images.length > 0
        ? images
        : image
            ? [image]
            : [];
    const primaryImage = resolvedImages[0] || image || null;
    let status = 'PUBLISHED';
    if (groupId) {
        const group = await prisma.group.findUnique({
            where: { id: groupId },
            include: {
                members: {
                    where: { userId: authorId },
                },
            },
        });
        if (!group)
            throw new Error('Target group not found.');
        const membership = group.members[0];
        if (!membership || !membership.isApproved) {
            throw new Error('You are not an approved member of this group.');
        }
        if (group.requiresPostApproval && membership.role === 'MEMBER' && userRole !== 'ADMIN') {
            status = 'PENDING_APPROVAL';
        }
    }
    if (postType === 'RECIPE' && (!title || !ingredients || !instructions)) {
        throw new Error('Recipe title, ingredients, and step instructions are required.');
    }
    const newPost = await prisma.post.create({
        data: {
            authorId,
            groupId: groupId || null,
            postType,
            status,
            audience: groupId ? 'PUBLIC' : validAudience,
            caption,
            title: title || null,
            image: primaryImage,
            images: resolvedImages,
            ingredients: postType === 'RECIPE' ? ingredients : null,
            instructions: postType === 'RECIPE' ? instructions : null,
            preparationTime: preparationTime ? parseInt(preparationTime) : null,
            servings: servings ? parseInt(servings) : null,
            cuisine: cuisine || null,
            categories: Array.isArray(categories) ? categories : [],
        },
        include: {
            author: {
                select: { id: true, name: true, image: true, role: true },
            },
            group: {
                select: { id: true, name: true, slug: true },
            },
        },
    });
    return newPost;
};
const repostPost = async (authorId, originalPostId, caption, groupId, audience) => {
    if (!originalPostId)
        throw new Error('Original post ID is required to share.');
    const original = await prisma.post.findUnique({ where: { id: originalPostId } });
    if (!original)
        throw new Error('Original post not found.');
    if (original.audience === 'ONLY_ME') {
        throw new Error('This post is private and cannot be shared.');
    }
    if (original.audience === 'FRIENDS' && original.authorId !== authorId) {
        const friendIds = await FriendsService.getFriendIdsForUser(authorId);
        if (!friendIds.has(original.authorId)) {
            throw new Error('This post is only visible to friends and cannot be shared.');
        }
    }
    return await prisma.post.create({
        data: {
            authorId,
            groupId: groupId || null,
            postType: 'REPOST',
            status: 'PUBLISHED',
            audience: audience || 'PUBLIC',
            caption,
            originalPostId: original.id,
        },
        include: {
            author: { select: { id: true, name: true, image: true } },
            originalPost: {
                include: {
                    author: { select: { id: true, name: true, image: true } },
                },
            },
        },
    });
};
const toggleLike = async (userId, postId) => {
    const existingLike = await prisma.like.findUnique({
        where: {
            userId_postId: { userId, postId },
        },
    });
    let liked = false;
    if (existingLike) {
        await prisma.like.delete({ where: { id: existingLike.id } });
        liked = false;
    }
    else {
        await prisma.like.create({ data: { userId, postId } });
        liked = true;
    }
    const likeCount = await prisma.like.count({ where: { postId } });
    return { liked, likeCount };
};
const createComment = async (userId, postId, content, parentId) => {
    if (!content || !content.trim())
        throw new Error('Comment content cannot be empty.');
    return await prisma.comment.create({
        data: {
            userId,
            postId,
            parentId: parentId || null,
            content: content.trim(),
        },
        include: {
            user: {
                select: { id: true, name: true, image: true },
            },
        },
    });
};
const deletePost = async (userId, userRole, postId) => {
    const post = await prisma.post.findUnique({
        where: { id: postId },
        include: { group: { include: { members: { where: { userId } } } } },
    });
    if (!post || post.deletedAt)
        throw new Error('Post not found.');
    const isAuthor = post.authorId === userId;
    const isPlatformStaff = ['ADMIN', 'MODERATOR'].includes(userRole);
    const isGroupStaff = post.group &&
        post.group.members[0] &&
        ['ADMIN', 'MODERATOR'].includes(post.group.members[0].role);
    if (!isAuthor && !isPlatformStaff && !isGroupStaff) {
        throw new Error('Not authorized to delete this post.');
    }
    // Soft-delete to trash
    await prisma.post.update({
        where: { id: postId },
        data: { deletedAt: new Date() },
    });
    return { id: postId, trashed: true };
};
const getTrash = async (userId) => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // Automatically purge any trashed posts that have stayed in trash for over 30 days
    await prisma.post.deleteMany({
        where: {
            authorId: userId,
            deletedAt: {
                lt: thirtyDaysAgo,
            },
        },
    });
    // Retrieve valid trashed posts (within 30-day window)
    const trashedPosts = await prisma.post.findMany({
        where: {
            authorId: userId,
            deletedAt: {
                gte: thirtyDaysAgo,
            },
        },
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
                },
            },
        },
    });
    return trashedPosts.map((p) => {
        const deletedTime = p.deletedAt ? new Date(p.deletedAt).getTime() : Date.now();
        const elapsedDays = Math.floor((Date.now() - deletedTime) / (24 * 60 * 60 * 1000));
        const daysRemaining = Math.max(0, 30 - elapsedDays);
        return {
            ...p,
            daysRemaining,
            likeCount: p._count.likes,
            commentCount: p._count.comments,
        };
    });
};
const restorePost = async (userId, postId) => {
    const post = await prisma.post.findUnique({
        where: { id: postId },
    });
    if (!post || !post.deletedAt) {
        throw new Error('Post not found in trash.');
    }
    if (post.authorId !== userId) {
        throw new Error('Not authorized to restore this post.');
    }
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    if (post.deletedAt < thirtyDaysAgo) {
        await prisma.post.delete({ where: { id: postId } });
        throw new Error('This post has passed the 30-day trash window and was permanently removed.');
    }
    const restored = await prisma.post.update({
        where: { id: postId },
        data: { deletedAt: null },
    });
    return restored;
};
const permanentDeletePost = async (userId, userRole, postId) => {
    const post = await prisma.post.findUnique({
        where: { id: postId },
    });
    if (!post) {
        throw new Error('Post not found.');
    }
    const isAuthor = post.authorId === userId;
    const isPlatformStaff = ['ADMIN', 'MODERATOR'].includes(userRole);
    if (!isAuthor && !isPlatformStaff) {
        throw new Error('Not authorized to permanently delete this post.');
    }
    await prisma.post.delete({
        where: { id: postId },
    });
    return { id: postId, permanentlyDeleted: true };
};
const emptyTrash = async (userId) => {
    const result = await prisma.post.deleteMany({
        where: {
            authorId: userId,
            deletedAt: {
                not: null,
            },
        },
    });
    return { count: result.count };
};
export const PostService = {
    getFeed,
    getPostById,
    createPost,
    repostPost,
    toggleLike,
    createComment,
    deletePost,
    getTrash,
    restorePost,
    permanentDeletePost,
    emptyTrash,
};
export default PostService;
