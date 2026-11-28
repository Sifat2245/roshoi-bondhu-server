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
            const myUser = currentUserId
                ? await context.prisma.user.findUnique({
                    where: { id: currentUserId },
                    select: {
                        profile: {
                            select: { city: true, work: true, education: true },
                        },
                    },
                })
                : null;
            const myCity = myUser?.profile?.city?.trim().toLowerCase();
            const myWork = myUser?.profile?.work?.trim().toLowerCase();
            const myEducation = myUser?.profile?.education?.trim().toLowerCase();
            let friendIdsSet = new Set();
            let followingIds = [];
            let myGroupIds = [];
            let mutualCountsMap = null;
            if (currentUserId) {
                const [friendsSet, follows, memberships] = await Promise.all([
                    FriendsService.getFriendIdsForUser(currentUserId),
                    context.prisma.follow.findMany({
                        where: { followerId: currentUserId },
                        select: { followingId: true },
                    }),
                    context.prisma.groupMember.findMany({
                        where: { userId: currentUserId, isApproved: true },
                        select: { groupId: true },
                    }),
                ]);
                friendIdsSet = friendsSet;
                followingIds = follows.map((f) => f.followingId);
                myGroupIds = memberships.map((m) => m.groupId);
                if (friendIdsSet.size > 0) {
                    mutualCountsMap = await FriendsService.getMutualCountsMap(friendIdsSet, currentUserId);
                }
            }
            // Explicit Filters handling
            const upperFilter = (filter || '').toUpperCase();
            if ((upperFilter === 'FRIENDS' || upperFilter === 'FOLLOWING') && currentUserId) {
                const allowedAuthorIds = Array.from(new Set([...friendIdsSet, ...followingIds, currentUserId]));
                where.authorId = { in: allowedAuthorIds };
            }
            else if (upperFilter === 'RECIPES') {
                where.postType = 'RECIPE';
            }
            else if (upperFilter === 'GROUPS' && currentUserId) {
                where.groupId = { in: myGroupIds };
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
            // Filter out posts hidden by the viewer
            if (currentUserId) {
                const hidden = await context.prisma.userHiddenPost.findMany({
                    where: { userId: currentUserId },
                    select: { postId: true },
                });
                if (hidden.length > 0) {
                    const hiddenPostIds = hidden.map((h) => h.postId);
                    if (where.id && typeof where.id === 'object' && where.id.notIn) {
                        where.id.notIn = [...where.id.notIn, ...hiddenPostIds];
                    }
                    else {
                        where.id = { notIn: hiddenPostIds };
                    }
                }
            }
            // Audience & Candidate Sourcing Filters (applied for personal/general feeds, not single-group streams)
            if (!groupId) {
                if (currentUserId) {
                    const friendIds = Array.from(friendIdsSet);
                    if (authorId) {
                        if (authorId !== currentUserId) {
                            const isFriend = friendIdsSet.has(authorId);
                            where.audience = isFriend ? { in: ['PUBLIC', 'FRIENDS'] } : 'PUBLIC';
                        }
                    }
                    else if (upperFilter === 'FRIENDS' || upperFilter === 'FOLLOWING') {
                        where.OR = [
                            { authorId: currentUserId },
                            { audience: 'PUBLIC' },
                            { audience: 'FRIENDS', authorId: { in: friendIds } },
                        ];
                    }
                    else {
                        // Default Smart Candidate Sourcing:
                        // 1. Own posts
                        // 2. Friends' posts (Public & Friends)
                        // 3. Followed accounts' public posts
                        // 4. Posts from joined groups
                        // 5. Public recipes from any user
                        // 6. Public posts from strangers ONLY if they have engagement or match location/education/work
                        const audienceOr = [
                            { authorId: currentUserId },
                            { postType: 'RECIPE', audience: 'PUBLIC' },
                        ];
                        if (friendIds.length > 0) {
                            audienceOr.push({
                                audience: 'FRIENDS',
                                authorId: { in: friendIds },
                            });
                            audienceOr.push({
                                audience: 'PUBLIC',
                                authorId: { in: friendIds },
                            });
                        }
                        if (followingIds.length > 0) {
                            audienceOr.push({
                                audience: 'PUBLIC',
                                authorId: { in: followingIds },
                            });
                        }
                        if (myGroupIds.length > 0) {
                            audienceOr.push({
                                groupId: { in: myGroupIds },
                            });
                        }
                        // Engaging or contextually-matched public posts from the community
                        const discoveryConditions = [
                            { likes: { some: {} } },
                            { comments: { some: {} } },
                        ];
                        if (myCity) {
                            discoveryConditions.push({
                                author: { profile: { city: { contains: myCity, mode: 'insensitive' } } },
                            });
                        }
                        if (myEducation) {
                            discoveryConditions.push({
                                author: { profile: { education: { contains: myEducation, mode: 'insensitive' } } },
                            });
                        }
                        if (myWork) {
                            discoveryConditions.push({
                                author: { profile: { work: { contains: myWork, mode: 'insensitive' } } },
                            });
                        }
                        audienceOr.push({
                            audience: 'PUBLIC',
                            OR: discoveryConditions,
                        });
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
            const postInclude = {
                author: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        image: true,
                        role: true,
                        bio: true,
                        profile: {
                            select: {
                                city: true,
                                work: true,
                                education: true,
                            },
                        },
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
            };
            const isRankedFeed = !authorId && !groupId && (!upperFilter || upperFilter === 'ALL');
            let nodes = [];
            let hasNextPage = false;
            if (isRankedFeed) {
                // Facebook-style Candidate Scoring & Ranking
                const candidateLimit = 200;
                const candidates = await context.prisma.post.findMany({
                    where,
                    take: candidateLimit,
                    orderBy: { createdAt: 'desc' },
                    include: postInclude,
                });
                const scoredCandidates = candidates.map((post) => {
                    const authorProfile = post.author?.profile;
                    const authorCity = authorProfile?.city?.trim().toLowerCase();
                    const authorWork = authorProfile?.work?.trim().toLowerCase();
                    const authorEdu = authorProfile?.education?.trim().toLowerCase();
                    const isAuthorSelf = currentUserId ? post.authorId === currentUserId : false;
                    const isFriend = currentUserId ? friendIdsSet.has(post.authorId) : false;
                    const isFollowing = currentUserId ? followingIds.includes(post.authorId) : false;
                    const isJoinedGroup = currentUserId && post.groupId ? myGroupIds.includes(post.groupId) : false;
                    const isRecipe = post.postType === 'RECIPE';
                    const likeCount = post._count?.likes ?? 0;
                    const commentCount = post._count?.comments ?? 0;
                    const repostCount = post._count?.reposts ?? 0;
                    const mutualFriends = currentUserId && mutualCountsMap ? mutualCountsMap.get(post.authorId) || 0 : 0;
                    const sameCity = Boolean(myCity && authorCity && (authorCity.includes(myCity) || myCity.includes(authorCity)));
                    const sameEducation = Boolean(myEducation && authorEdu && (authorEdu.includes(myEducation) || myEducation.includes(authorEdu)));
                    const sameWork = Boolean(myWork && authorWork && (authorWork.includes(myWork) || myWork.includes(authorWork)));
                    const ageHours = Math.max(0, (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60));
                    const timeDecay = Math.min(ageHours * 2.5, 400);
                    const score = (isAuthorSelf ? 1200 : 0) +
                        (isFriend ? 1000 : 0) +
                        (isJoinedGroup ? 600 : 0) +
                        (isFollowing ? 400 : 0) +
                        (isRecipe ? 80 : 0) +
                        likeCount * 4 +
                        commentCount * 8 +
                        repostCount * 12 +
                        mutualFriends * 30 +
                        (sameCity ? 35 : 0) +
                        (sameEducation ? 25 : 0) +
                        (sameWork ? 20 : 0) -
                        timeDecay;
                    return { post, score };
                });
                scoredCandidates.sort((a, b) => {
                    if (b.score !== a.score) {
                        return b.score - a.score;
                    }
                    return new Date(b.post.createdAt).getTime() - new Date(a.post.createdAt).getTime();
                });
                let startIndex = 0;
                if (after) {
                    const decodedId = fromBase64(after);
                    const cursorIndex = scoredCandidates.findIndex((item) => item.post.id === decodedId);
                    if (cursorIndex >= 0) {
                        startIndex = cursorIndex + 1;
                    }
                }
                const paged = scoredCandidates.slice(startIndex, startIndex + limit);
                hasNextPage = startIndex + limit < scoredCandidates.length;
                nodes = paged.map((item) => item.post);
            }
            else {
                // Pure Chronological Stream for explicit filters (Friends, Groups, Profile, etc.)
                const posts = await context.prisma.post.findMany({
                    where,
                    take: limit + 1,
                    ...(cursorObj ? { cursor: cursorObj, skip: 1 } : {}),
                    orderBy: { createdAt: 'desc' },
                    include: postInclude,
                });
                hasNextPage = posts.length > limit;
                nodes = hasNextPage ? posts.slice(0, limit) : posts;
            }
            const nodesWithRoles = await PostService.attachAuthorGroupRoles(nodes, currentUserId);
            const edges = nodesWithRoles.map((post) => ({
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
            if (args.input.poll) {
                const existingPoll = await context.prisma.poll.findUnique({
                    where: { postId: args.id },
                });
                if (existingPoll) {
                    await PostService.updatePoll(context.currentUser.id, context.currentUser.role, existingPoll.id, args.input.poll);
                }
            }
            const updateData = {};
            if (args.input.caption !== undefined)
                updateData.caption = args.input.caption;
            if (args.input.title !== undefined)
                updateData.title = args.input.title;
            if (args.input.audience !== undefined)
                updateData.audience = args.input.audience;
            if (args.input.ingredients !== undefined)
                updateData.ingredients = args.input.ingredients;
            if (args.input.instructions !== undefined)
                updateData.instructions = args.input.instructions;
            if (args.input.preparationTime !== undefined)
                updateData.preparationTime = args.input.preparationTime;
            if (args.input.servings !== undefined)
                updateData.servings = args.input.servings;
            if (args.input.cuisine !== undefined)
                updateData.cuisine = args.input.cuisine;
            if (args.input.images !== undefined) {
                updateData.images = args.input.images;
                updateData.image = args.input.images.length > 0 ? args.input.images[0] : null;
            }
            else if (args.input.image !== undefined) {
                updateData.image = args.input.image;
                if (args.input.image && (!existing.images || existing.images.length === 0)) {
                    updateData.images = [args.input.image];
                }
            }
            await context.prisma.post.update({
                where: { id: args.id },
                data: updateData,
            });
            const fullUpdatedPost = await PostService.getPostById(args.id, context.currentUser.id);
            return fullUpdatedPost;
        },
        repostPost: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            const repost = await PostService.repostPost(context.currentUser.id, args.originalPostId, args.caption, undefined, args.audience);
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
        toggleCommentsDisabled: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            const post = await context.prisma.post.findUnique({
                where: { id: args.postId },
                include: {
                    author: { select: { id: true, name: true, image: true, role: true, bio: true } },
                    _count: { select: { likes: true, comments: true, reposts: true } },
                },
            });
            if (!post)
                throw new Error('Post not found.');
            const isAuthor = post.authorId === context.currentUser.id;
            const isPlatformStaff = ['ADMIN', 'MODERATOR'].includes(context.currentUser.role);
            if (!isAuthor && !isPlatformStaff) {
                throw new Error('Only the author can change commenting settings for this post.');
            }
            const updated = await context.prisma.post.update({
                where: { id: args.postId },
                data: { isCommentDisabled: !post.isCommentDisabled },
                include: {
                    author: { select: { id: true, name: true, image: true, role: true, bio: true } },
                    _count: { select: { likes: true, comments: true, reposts: true } },
                },
            });
            return {
                ...updated,
                likeCount: updated._count.likes,
                commentCount: updated._count.comments,
                repostCount: updated._count.reposts,
                hasLiked: false,
                createdAt: updated.createdAt.toISOString(),
                updatedAt: updated.updatedAt ? updated.updatedAt.toISOString() : null,
            };
        },
        createComment: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            return await PostService.createComment(context.currentUser.id, args.postId, args.content, args.parentId);
        },
        updateComment: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            if (!args.content || !args.content.trim()) {
                throw new Error('Comment content cannot be empty.');
            }
            const comment = await context.prisma.comment.findUnique({
                where: { id: args.id },
            });
            if (!comment)
                throw new Error('Comment not found.');
            if (comment.userId !== context.currentUser.id) {
                throw new Error('You can only edit your own comments.');
            }
            const updated = await context.prisma.comment.update({
                where: { id: args.id },
                data: { content: args.content.trim() },
                include: {
                    user: { select: { id: true, name: true, image: true, role: true } },
                    replies: {
                        include: {
                            user: { select: { id: true, name: true, image: true, role: true } },
                        },
                        orderBy: { createdAt: 'asc' },
                    },
                },
            });
            return {
                ...updated,
                createdAt: updated.createdAt.toISOString(),
                updatedAt: updated.updatedAt ? updated.updatedAt.toISOString() : null,
            };
        },
        deleteComment: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            const comment = await context.prisma.comment.findUnique({
                where: { id: args.id },
                include: { post: { select: { authorId: true } } },
            });
            if (!comment)
                throw new Error('Comment not found.');
            const isCommentAuthor = comment.userId === context.currentUser.id;
            const isPostAuthor = comment.post?.authorId === context.currentUser.id;
            const isPlatformStaff = ['ADMIN', 'MODERATOR'].includes(context.currentUser.role);
            if (!isCommentAuthor && !isPostAuthor && !isPlatformStaff) {
                throw new Error('Not authorized to delete this comment.');
            }
            await context.prisma.comment.delete({ where: { id: args.id } });
            return true;
        },
        toggleCommentLike: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            return await PostService.toggleCommentLike(context.currentUser.id, args.commentId);
        },
        votePoll: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            return await PostService.votePoll(context.currentUser.id, args.pollId, args.optionId);
        },
        togglePollStatus: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            return await PostService.togglePollStatus(context.currentUser.id, context.currentUser.role, args.pollId);
        },
        updatePoll: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            return await PostService.updatePoll(context.currentUser.id, context.currentUser.role, args.id, args.input);
        },
        deletePoll: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            return await PostService.deletePoll(context.currentUser.id, context.currentUser.role, args.id);
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
        hidePost: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            await context.prisma.userHiddenPost.upsert({
                where: {
                    userId_postId: {
                        userId: context.currentUser.id,
                        postId: args.postId,
                    },
                },
                create: {
                    userId: context.currentUser.id,
                    postId: args.postId,
                },
                update: {},
            });
            return true;
        },
        unhidePost: async (_parent, args, context) => {
            if (!context.currentUser) {
                throw new Error('Authentication required.');
            }
            await context.prisma.userHiddenPost.deleteMany({
                where: {
                    userId: context.currentUser.id,
                    postId: args.postId,
                },
            });
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
            return ['CASUAL', 'RECIPE', 'REPOST', 'POLL'].includes(pt) ? pt : 'CASUAL';
        },
        poll: async (post, _args, context) => {
            if (post.poll && post.poll.options) {
                return PostService.formatPoll(post.poll, context.currentUser?.id, post.authorId);
            }
            const poll = await context.prisma.poll.findUnique({
                where: { postId: post.id },
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
            return PostService.formatPoll(poll, context.currentUser?.id, post.authorId);
        },
        status: (post) => post.status || 'PUBLISHED',
        images: (post) => Array.isArray(post.images) && post.images.length > 0
            ? post.images
            : post.image
                ? [post.image]
                : [],
        categories: (post) => (Array.isArray(post.categories) ? post.categories : []),
        ingredients: (post) => {
            if (Array.isArray(post.ingredients)) {
                return post.ingredients.map((item) => typeof item === 'string' ? item : item?.text || item?.name || JSON.stringify(item));
            }
            if (typeof post.ingredients === 'string') {
                try {
                    const parsed = JSON.parse(post.ingredients);
                    if (Array.isArray(parsed)) {
                        return parsed.map((item) => typeof item === 'string' ? item : item?.text || item?.name || JSON.stringify(item));
                    }
                    return [post.ingredients];
                }
                catch {
                    return [post.ingredients];
                }
            }
            return [];
        },
        instructions: (post) => {
            if (Array.isArray(post.instructions)) {
                return post.instructions.map((item) => typeof item === 'string' ? item : JSON.stringify(item));
            }
            if (typeof post.instructions === 'string') {
                try {
                    const parsed = JSON.parse(post.instructions);
                    if (Array.isArray(parsed)) {
                        return parsed.map((item) => typeof item === 'string' ? item : JSON.stringify(item));
                    }
                    return [post.instructions];
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
        isCommentDisabled: (post) => Boolean(post.isCommentDisabled),
        comments: async (post, _args, context) => {
            if (post.comments && Array.isArray(post.comments)) {
                return post.comments;
            }
            const currentUserId = context.currentUser?.id;
            return await context.prisma.comment.findMany({
                where: { postId: post.id, parentId: null },
                orderBy: { createdAt: 'desc' },
                include: {
                    user: {
                        select: { id: true, name: true, image: true, role: true },
                    },
                    _count: {
                        select: { likes: true },
                    },
                    likes: currentUserId
                        ? { where: { userId: currentUserId }, select: { id: true } }
                        : false,
                    replies: {
                        include: {
                            user: { select: { id: true, name: true, image: true, role: true } },
                            _count: { select: { likes: true } },
                            likes: currentUserId
                                ? { where: { userId: currentUserId }, select: { id: true } }
                                : false,
                        },
                        orderBy: { createdAt: 'asc' },
                    },
                },
            });
        },
    },
    OriginalPost: {
        isCommentDisabled: (post) => Boolean(post.isCommentDisabled),
        postType: (post) => {
            const pt = String(post.postType || 'CASUAL').toUpperCase();
            return ['CASUAL', 'RECIPE', 'REPOST', 'POLL'].includes(pt) ? pt : 'CASUAL';
        },
        poll: async (post, _args, context) => {
            if (post.poll && post.poll.options) {
                return PostService.formatPoll(post.poll, context.currentUser?.id, post.authorId);
            }
            const poll = await context.prisma.poll.findUnique({
                where: { postId: post.id },
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
            return PostService.formatPoll(poll, context.currentUser?.id, post.authorId);
        },
        images: (post) => Array.isArray(post.images) && post.images.length > 0
            ? post.images
            : post.image
                ? [post.image]
                : [],
        ingredients: (post) => {
            if (Array.isArray(post.ingredients)) {
                return post.ingredients.map((item) => typeof item === 'string' ? item : item?.text || item?.name || JSON.stringify(item));
            }
            if (typeof post.ingredients === 'string') {
                try {
                    const parsed = JSON.parse(post.ingredients);
                    if (Array.isArray(parsed)) {
                        return parsed.map((item) => typeof item === 'string' ? item : item?.text || item?.name || JSON.stringify(item));
                    }
                    return [post.ingredients];
                }
                catch {
                    return [post.ingredients];
                }
            }
            return [];
        },
        instructions: (post) => {
            if (Array.isArray(post.instructions)) {
                return post.instructions.map((item) => typeof item === 'string' ? item : JSON.stringify(item));
            }
            if (typeof post.instructions === 'string') {
                try {
                    const parsed = JSON.parse(post.instructions);
                    if (Array.isArray(parsed)) {
                        return parsed.map((item) => typeof item === 'string' ? item : JSON.stringify(item));
                    }
                    return [post.instructions];
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
        likeCount: (c) => c.likeCount ?? c._count?.likes ?? 0,
        hasLiked: (c) => typeof c.hasLiked === 'boolean'
            ? c.hasLiked
            : Boolean(c.likes && Array.isArray(c.likes) && c.likes.length > 0),
    },
    PostCommentReply: {
        createdAt: (c) => c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt || ''),
        updatedAt: (c) => c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt ? String(c.updatedAt) : null,
        likeCount: (c) => c.likeCount ?? c._count?.likes ?? 0,
        hasLiked: (c) => typeof c.hasLiked === 'boolean'
            ? c.hasLiked
            : Boolean(c.likes && Array.isArray(c.likes) && c.likes.length > 0),
    },
};
export default postResolvers;
