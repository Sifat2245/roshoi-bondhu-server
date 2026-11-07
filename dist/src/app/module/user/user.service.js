import prisma from '../../lib/prisma.js';
const getUserProfile = async (targetUserId, currentUserId) => {
    const resolvedTargetId = targetUserId === 'me' || !targetUserId ? currentUserId : targetUserId;
    if (!resolvedTargetId)
        throw new Error('User not found.');
    const user = await prisma.user.findUnique({
        where: { id: resolvedTargetId },
        select: {
            id: true,
            name: true,
            email: true,
            image: true,
            coverImage: true,
            bio: true,
            role: true,
            createdAt: true,
            _count: {
                select: {
                    posts: { where: { status: 'PUBLISHED' } },
                    followers: true,
                    following: true,
                    createdGroups: true,
                },
            },
        },
    });
    if (!user)
        throw new Error('User not found.');
    let isFollowing = false;
    if (currentUserId && currentUserId !== user.id) {
        const follow = await prisma.follow.findUnique({
            where: {
                followerId_followingId: {
                    followerId: currentUserId,
                    followingId: user.id,
                },
            },
        });
        isFollowing = Boolean(follow);
    }
    return {
        ...user,
        recipesCount: user._count.posts,
        followersCount: user._count.followers,
        followingCount: user._count.following,
        isFollowing,
        isMe: currentUserId ? currentUserId === user.id : false,
    };
};
const toggleFollow = async (currentUserId, targetUserId) => {
    if (currentUserId === targetUserId) {
        throw new Error('You cannot follow yourself.');
    }
    const existingFollow = await prisma.follow.findUnique({
        where: {
            followerId_followingId: {
                followerId: currentUserId,
                followingId: targetUserId,
            },
        },
    });
    let following = false;
    if (existingFollow) {
        await prisma.follow.delete({ where: { id: existingFollow.id } });
        following = false;
    }
    else {
        await prisma.follow.create({
            data: {
                followerId: currentUserId,
                followingId: targetUserId,
            },
        });
        following = true;
    }
    const followersCount = await prisma.follow.count({
        where: { followingId: targetUserId },
    });
    return { following, followersCount };
};
const updateProfile = async (userId, data) => {
    const { name, bio, image, coverImage } = data;
    return await prisma.user.update({
        where: { id: userId },
        data: {
            name: name !== undefined ? name.trim() : undefined,
            bio: bio !== undefined ? bio : undefined,
            image: image !== undefined ? image : undefined,
            coverImage: coverImage !== undefined ? coverImage : undefined,
        },
        select: {
            id: true,
            name: true,
            email: true,
            image: true,
            coverImage: true,
            bio: true,
            role: true,
        },
    });
};
const getFriends = async (userId) => {
    const follows = await prisma.follow.findMany({
        where: { followerId: userId },
        include: {
            following: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    image: true,
                    coverImage: true,
                    bio: true,
                    _count: {
                        select: { followers: true, following: true, posts: true },
                    },
                },
            },
        },
    });
    if (follows.length > 0) {
        return follows.map((f) => ({
            ...f.following,
            mutualCount: Math.floor(Math.random() * 8) + 1,
        }));
    }
    const otherUsers = await prisma.user.findMany({
        where: { id: { not: userId } },
        take: 12,
        select: {
            id: true,
            name: true,
            email: true,
            image: true,
            coverImage: true,
            bio: true,
            _count: {
                select: { followers: true, following: true, posts: true },
            },
        },
    });
    return otherUsers.map((u) => ({
        ...u,
        mutualCount: Math.floor(Math.random() * 5) + 1,
    }));
};
const getSuggestions = async (userId) => {
    const users = await prisma.user.findMany({
        where: { id: { not: userId } },
        take: 12,
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            name: true,
            email: true,
            image: true,
            coverImage: true,
            bio: true,
            _count: {
                select: { followers: true, following: true, posts: true },
            },
        },
    });
    return users.map((u) => ({
        ...u,
        mutualCount: Math.floor(Math.random() * 10) + 1,
    }));
};
const getNotifications = async (userId) => {
    const users = await prisma.user.findMany({
        where: { id: { not: userId } },
        take: 6,
        select: { id: true, name: true, image: true },
    });
    return [
        {
            id: 'notif-1',
            type: 'REACTION',
            actor: users[0] || {
                name: 'Chef Rahima',
                image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
            },
            message: 'reacted to your recipe: "Dhaka Kacchi Biryani"',
            timeAgo: '30m',
            isUnread: true,
            iconType: 'HEART',
        },
        {
            id: 'notif-2',
            type: 'COMMENT',
            actor: users[1] || {
                name: 'Mohammad Junayed',
                image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100',
            },
            message: 'commented: "How much mustard oil did you use for the marination?"',
            timeAgo: '2h',
            isUnread: true,
            iconType: 'COMMENT',
        },
        {
            id: 'notif-3',
            type: 'GROUP_INVITE',
            actor: users[2] || {
                name: 'Aravh Hussain',
                image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100',
            },
            message: 'invited you to join the group Secret Grandma Recipes',
            timeAgo: '5h',
            isUnread: false,
            iconType: 'INVITE',
            actionable: true,
        },
        {
            id: 'notif-4',
            type: 'FOLLOW',
            actor: users[3] || {
                name: 'Sadia Islam Juthe',
                image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100',
            },
            message: 'started following your culinary journey on Hesheli',
            timeAgo: '1d',
            isUnread: false,
            iconType: 'USER',
        },
    ];
};
export const UserService = {
    getUserProfile,
    toggleFollow,
    updateProfile,
    getFriends,
    getSuggestions,
    getNotifications,
};
