import prisma from '../../lib/prisma.js';
import { paginationUtils } from '../../utils/pagination.js';
const getFeed = async (query, currentUserId) => {
    const { page, limit, skip } = paginationUtils.getPaginationOptions(query);
    const { type, cuisine, search, authorId, groupId, filter, tag, maxTime } = query;
    const where = {
        status: 'PUBLISHED',
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
    if (maxTime) {
        where.preparationTime = { lte: parseInt(maxTime) };
    }
    if (search || tag) {
        const keyword = search || tag;
        where.OR = [
            { title: { contains: keyword, mode: 'insensitive' } },
            { caption: { contains: keyword, mode: 'insensitive' } },
            { cuisine: { contains: keyword, mode: 'insensitive' } },
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
    if (!post) {
        throw new Error('Post not found');
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
    const { postType = 'CASUAL', caption, title, image, images = [], ingredients, instructions, preparationTime, servings, cuisine, categories = [], groupId, } = postData;
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
            caption,
            title: postType === 'RECIPE' ? title : null,
            image: image || null,
            images,
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
const repostPost = async (authorId, originalPostId, caption, groupId) => {
    if (!originalPostId)
        throw new Error('Original post ID is required to share.');
    const original = await prisma.post.findUnique({ where: { id: originalPostId } });
    if (!original)
        throw new Error('Original post not found.');
    return await prisma.post.create({
        data: {
            authorId,
            groupId: groupId || null,
            postType: 'REPOST',
            status: 'PUBLISHED',
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
    if (!post)
        throw new Error('Post not found.');
    const isAuthor = post.authorId === userId;
    const isPlatformStaff = ['ADMIN', 'MODERATOR'].includes(userRole);
    const isGroupStaff = post.group &&
        post.group.members[0] &&
        ['ADMIN', 'MODERATOR'].includes(post.group.members[0].role);
    if (!isAuthor && !isPlatformStaff && !isGroupStaff) {
        throw new Error('Not authorized to delete this post.');
    }
    await prisma.post.delete({ where: { id: postId } });
    return { id: postId };
};
export const PostService = {
    getFeed,
    getPostById,
    createPost,
    repostPost,
    toggleLike,
    createComment,
    deletePost,
};
