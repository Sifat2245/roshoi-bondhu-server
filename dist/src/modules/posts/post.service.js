import prisma from '../../lib/prisma.js';
import { paginationUtils } from '../../shared/pagination/pagination.js';
import { FriendsService } from '../friends/friends.service.js';
const db = prisma;
const attachAuthorGroupRoles = async (posts, viewerUserId) => {
    const groupPosts = posts.filter((p) => p.groupId && p.authorId);
    if (groupPosts.length === 0) {
        return posts.map((p) => ({ ...p, authorGroupRole: null }));
    }
    const groupIds = Array.from(new Set(groupPosts.map((p) => p.groupId)));
    const userIds = Array.from(new Set([
        ...groupPosts.map((p) => p.authorId),
        ...(viewerUserId ? [viewerUserId] : []),
    ]));
    const memberships = await prisma.groupMember.findMany({
        where: {
            groupId: { in: groupIds },
            userId: { in: userIds },
            isApproved: true,
        },
        select: {
            groupId: true,
            userId: true,
            role: true,
        },
    });
    const roleMap = new Map();
    for (const m of memberships) {
        roleMap.set(`${m.groupId}:${m.userId}`, m.role);
    }
    return posts.map((post) => {
        if (!post.groupId || !post.authorId) {
            return { ...post, authorGroupRole: null };
        }
        const effectiveOwnerId = post.group?.ownerId || post.group?.createdById;
        const authorGroupRole = effectiveOwnerId && effectiveOwnerId === post.authorId
            ? 'ADMIN'
            : roleMap.get(`${post.groupId}:${post.authorId}`) || null;
        const viewerIsMember = viewerUserId
            ? (effectiveOwnerId && effectiveOwnerId === viewerUserId) ||
                roleMap.has(`${post.groupId}:${viewerUserId}`)
            : false;
        return {
            ...post,
            authorGroupRole,
            group: post.group
                ? {
                    ...post.group,
                    isMember: viewerIsMember,
                }
                : post.group,
        };
    });
};
const getFeed = async (query, currentUserId) => {
    const { page, limit, skip } = paginationUtils.getPaginationOptions(query);
    const { type, cuisine, search, authorId, groupId, filter } = query;
    const where = {
        status: 'PUBLISHED',
        deletedAt: null,
    };
    if (type && ['CASUAL', 'RECIPE', 'REPOST', 'POLL'].includes(type.toUpperCase())) {
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
                    coverImage: true,
                    privacy: true,
                    ownerId: true,
                    createdById: true,
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
                    _count: {
                        select: { likes: true },
                    },
                    likes: currentUserId
                        ? {
                            where: { userId: currentUserId },
                            select: { id: true },
                        }
                        : false,
                    replies: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                    image: true,
                                },
                            },
                            _count: {
                                select: { likes: true },
                            },
                            likes: currentUserId
                                ? {
                                    where: { userId: currentUserId },
                                    select: { id: true },
                                }
                                : false,
                        },
                        orderBy: { createdAt: 'asc' },
                    },
                },
            },
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
    // Group privacy and pending-approval access control
    if (post.groupId) {
        const membership = currentUserId
            ? await prisma.groupMember.findUnique({
                where: {
                    groupId_userId: { groupId: post.groupId, userId: currentUserId },
                },
            })
            : null;
        if (post.group?.privacy === 'PRIVATE') {
            if (!membership || !membership.isApproved) {
                throw new Error('This post belongs to a private group.');
            }
        }
        if (post.status !== 'PUBLISHED') {
            const isAuthor = currentUserId && post.authorId === currentUserId;
            const isGroupStaff = membership && membership.isApproved && ['ADMIN', 'MODERATOR'].includes(membership.role);
            if (!isAuthor && !isGroupStaff) {
                throw new Error('Post not found');
            }
        }
    }
    else if (post.status !== 'PUBLISHED' && post.authorId !== currentUserId) {
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
            if (!post.groupId) {
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
    }
    else {
        if (!post.groupId && post.audience !== 'PUBLIC') {
            throw new Error('This post is private. Please sign in to view.');
        }
    }
    const [withRole] = await attachAuthorGroupRoles([post], currentUserId);
    return {
        ...withRole,
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
        if (!group || group.status === 'DELETED')
            throw new Error('Target group not found.');
        if (group.status === 'PAUSED') {
            throw new Error('This group is currently paused and not accepting new posts.');
        }
        if (group.status === 'ARCHIVED') {
            throw new Error('This group has been archived.');
        }
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
    const pollData = postData.poll;
    let cleanPollQuestion = '';
    let cleanPollOptions = [];
    if (postType === 'POLL' || pollData) {
        if (!pollData || !pollData.question || !Array.isArray(pollData.options)) {
            throw new Error('Poll question and answers are required.');
        }
        cleanPollQuestion = pollData.question.trim();
        cleanPollOptions = pollData.options
            .map((o) => (typeof o === 'string' ? o.trim() : ''))
            .filter(Boolean);
        if (cleanPollQuestion.length < 8 || cleanPollQuestion.length > 200) {
            throw new Error('Write a question between 8 and 200 characters.');
        }
        if (cleanPollOptions.length < 2 || cleanPollOptions.length > 6) {
            throw new Error('Add between two and six answers.');
        }
        if (new Set(cleanPollOptions.map((o) => o.toLowerCase())).size !==
            cleanPollOptions.length) {
            throw new Error('Each answer needs to be different.');
        }
    }
    const newPost = await db.post.create({
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
            poll: (postType === 'POLL' || pollData) &&
                cleanPollQuestion &&
                cleanPollOptions.length >= 2
                ? {
                    create: {
                        question: cleanPollQuestion,
                        multiple: Boolean(pollData?.multiple),
                        expiresAt: pollData?.expiresAt
                            ? new Date(pollData.expiresAt)
                            : null,
                        options: {
                            create: cleanPollOptions.map((text) => ({ text })),
                        },
                    },
                }
                : undefined,
        },
        include: {
            author: {
                select: { id: true, name: true, image: true, role: true },
            },
            group: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    avatar: true,
                    coverImage: true,
                    privacy: true,
                    ownerId: true,
                    createdById: true,
                },
            },
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
    const [withRole] = await attachAuthorGroupRoles([newPost], authorId);
    return withRole;
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
    const resolvedGroupId = typeof groupId === 'string' &&
        groupId.trim() &&
        !['PUBLIC', 'FRIENDS', 'ONLY_ME'].includes(groupId)
        ? groupId.trim()
        : null;
    return await prisma.post.create({
        data: {
            authorId,
            groupId: resolvedGroupId,
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
const toggleCommentLike = async (userId, commentId) => {
    const comment = await prisma.comment.findUnique({
        where: { id: commentId },
    });
    if (!comment)
        throw new Error('Comment not found.');
    const existing = await db.commentLike.findUnique({
        where: {
            userId_commentId: {
                userId,
                commentId,
            },
        },
    });
    let liked = false;
    if (existing) {
        await db.commentLike.delete({ where: { id: existing.id } });
        liked = false;
    }
    else {
        await db.commentLike.create({
            data: {
                userId,
                commentId,
            },
        });
        liked = true;
    }
    const likeCount = await db.commentLike.count({
        where: { commentId },
    });
    return { liked, likeCount };
};
const createComment = async (userId, postId, content, parentId) => {
    if (!content || !content.trim())
        throw new Error('Comment content cannot be empty.');
    const post = await prisma.post.findUnique({
        where: { id: postId },
        select: { id: true, isCommentDisabled: true, deletedAt: true },
    });
    if (!post || post.deletedAt) {
        throw new Error('Post not found.');
    }
    if (post.isCommentDisabled) {
        throw new Error('Commenting has been turned off for this post.');
    }
    return await prisma.comment.create({
        data: {
            userId,
            postId,
            parentId: parentId || null,
            content: content.trim(),
        },
        include: {
            user: {
                select: { id: true, name: true, image: true, role: true },
            },
            replies: {
                include: {
                    user: { select: { id: true, name: true, image: true, role: true } },
                },
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
const formatPoll = (poll, currentUserId, fallbackAuthorId) => {
    if (!poll)
        return null;
    let totalVotes = 0;
    const options = (poll.options || []).map((opt) => {
        const voterIds = Array.isArray(opt.voterIds)
            ? opt.voterIds
            : (opt.votes || []).map((v) => v.userId);
        totalVotes += voterIds.length;
        const hasVoted = currentUserId
            ? voterIds.includes(currentUserId)
            : typeof opt.hasVoted === 'boolean'
                ? opt.hasVoted
                : false;
        const voters = Array.isArray(opt.voters)
            ? opt.voters
            : (opt.votes || []).map((v) => v.user).filter(Boolean);
        return {
            id: opt.id,
            pollId: opt.pollId,
            text: opt.text,
            voteCount: voterIds.length,
            voterIds,
            hasVoted,
            voters,
        };
    });
    return {
        id: poll.id,
        postId: poll.postId,
        authorId: poll.post?.authorId || poll.authorId || fallbackAuthorId || '',
        question: poll.question,
        multiple: poll.multiple,
        closed: poll.closed,
        expiresAt: poll.expiresAt ? poll.expiresAt.toISOString() : null,
        totalVotes,
        options,
        createdAt: poll.createdAt instanceof Date
            ? poll.createdAt.toISOString()
            : String(poll.createdAt),
        updatedAt: poll.updatedAt instanceof Date
            ? poll.updatedAt.toISOString()
            : poll.updatedAt
                ? String(poll.updatedAt)
                : null,
    };
};
const getPollById = async (pollId, currentUserId) => {
    const poll = await db.poll.findUnique({
        where: { id: pollId },
        include: {
            post: { select: { authorId: true } },
            options: {
                include: {
                    votes: {
                        include: {
                            user: {
                                select: { id: true, name: true, image: true, role: true },
                            },
                        },
                    },
                },
                orderBy: { createdAt: 'asc' },
            },
        },
    });
    if (!poll)
        return null;
    return formatPoll(poll, currentUserId);
};
const votePoll = async (userId, pollId, optionId) => {
    const poll = await db.poll.findUnique({
        where: { id: pollId },
        include: {
            post: { select: { authorId: true, groupId: true } },
            options: true,
        },
    });
    if (!poll)
        throw new Error('Poll not found.');
    const isExpired = poll.expiresAt && new Date(poll.expiresAt).getTime() <= Date.now();
    if (poll.closed || isExpired) {
        throw new Error('Voting has ended for this poll.');
    }
    if (poll.post?.groupId) {
        const group = await prisma.group.findUnique({
            where: { id: poll.post.groupId },
            select: { status: true },
        });
        if (group?.status === 'PAUSED') {
            throw new Error('This group is currently paused and not accepting votes.');
        }
        if (group?.status === 'ARCHIVED' || group?.status === 'DELETED') {
            throw new Error('This group is no longer active.');
        }
        const membership = await prisma.groupMember.findFirst({
            where: { groupId: poll.post.groupId, userId, isApproved: true },
        });
        if (!membership) {
            throw new Error('You must be a member of this group to vote.');
        }
    }
    const option = poll.options.find((o) => o.id === optionId);
    if (!option)
        throw new Error('Option not found.');
    const existingVote = await db.pollVote.findUnique({
        where: {
            userId_optionId: { userId, optionId },
        },
    });
    if (existingVote) {
        await db.pollVote.delete({ where: { id: existingVote.id } });
    }
    else {
        if (!poll.multiple) {
            await db.pollVote.deleteMany({
                where: {
                    userId,
                    option: { pollId: poll.id },
                },
            });
        }
        await db.pollVote.create({
            data: { userId, optionId },
        });
    }
    return await getPollById(pollId, userId);
};
const togglePollStatus = async (userId, userRole, pollId) => {
    const poll = await db.poll.findUnique({
        where: { id: pollId },
        include: { post: { select: { authorId: true } } },
    });
    if (!poll)
        throw new Error('Poll not found.');
    const isAuthor = poll.post?.authorId === userId;
    const isStaff = ['ADMIN', 'MODERATOR'].includes(userRole);
    if (!isAuthor && !isStaff) {
        throw new Error('Only the author can change the status of this poll.');
    }
    const isCurrentlyClosed = poll.closed ||
        (poll.expiresAt && new Date(poll.expiresAt).getTime() <= Date.now());
    await db.poll.update({
        where: { id: pollId },
        data: {
            closed: !isCurrentlyClosed,
            expiresAt: isCurrentlyClosed ? null : poll.expiresAt,
        },
    });
    return await getPollById(pollId, userId);
};
const updatePoll = async (userId, userRole, pollId, input) => {
    const poll = await db.poll.findUnique({
        where: { id: pollId },
        include: { post: { select: { authorId: true } }, options: true },
    });
    if (!poll)
        throw new Error('Poll not found.');
    const isAuthor = poll.post?.authorId === userId;
    const isStaff = ['ADMIN', 'MODERATOR'].includes(userRole);
    if (!isAuthor && !isStaff) {
        throw new Error('Only the author can update this poll.');
    }
    const updateData = {};
    if (input.question !== undefined) {
        const q = input.question.trim();
        if (q.length < 8 || q.length > 200) {
            throw new Error('Write a question between 8 and 200 characters.');
        }
        updateData.question = q;
    }
    if (input.multiple !== undefined) {
        updateData.multiple = Boolean(input.multiple);
    }
    if (input.closed !== undefined) {
        updateData.closed = Boolean(input.closed);
    }
    if (input.expiresAt !== undefined) {
        updateData.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    }
    if (input.options && Array.isArray(input.options)) {
        const cleanOptions = input.options
            .map((o) => (typeof o === 'string' ? o.trim() : ''))
            .filter(Boolean);
        if (cleanOptions.length < 2 || cleanOptions.length > 6) {
            throw new Error('Add between two and six answers.');
        }
        if (new Set(cleanOptions.map((o) => o.toLowerCase())).size !==
            cleanOptions.length) {
            throw new Error('Each answer needs to be different.');
        }
        await prisma.$transaction(async (tx) => {
            await tx.poll.update({ where: { id: pollId }, data: updateData });
            await tx.pollOption.deleteMany({ where: { pollId } });
            await tx.pollOption.createMany({
                data: cleanOptions.map((text) => ({ pollId, text })),
            });
        });
        return await getPollById(pollId, userId);
    }
    await db.poll.update({
        where: { id: pollId },
        data: updateData,
    });
    return await getPollById(pollId, userId);
};
const deletePoll = async (userId, userRole, pollId) => {
    const poll = await db.poll.findUnique({
        where: { id: pollId },
        include: { post: { select: { authorId: true, postType: true } } },
    });
    if (!poll)
        throw new Error('Poll not found.');
    const isAuthor = poll.post?.authorId === userId;
    const isStaff = ['ADMIN', 'MODERATOR'].includes(userRole);
    if (!isAuthor && !isStaff) {
        throw new Error('Only the author can delete this poll.');
    }
    await db.poll.delete({ where: { id: pollId } });
    if (poll.post?.postType === 'POLL') {
        await prisma.post.update({
            where: { id: poll.postId },
            data: { postType: 'CASUAL' },
        });
    }
    return true;
};
export const PostService = {
    attachAuthorGroupRoles,
    getFeed,
    getPostById,
    createPost,
    repostPost,
    toggleLike,
    toggleCommentLike,
    createComment,
    deletePost,
    getTrash,
    restorePost,
    permanentDeletePost,
    emptyTrash,
    formatPoll,
    getPollById,
    votePoll,
    togglePollStatus,
    updatePoll,
    deletePoll,
};
export default PostService;
