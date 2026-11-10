import prisma from '../../lib/prisma.js';
import { NotFoundError, ValidationError } from '../../shared/errors/app-error.js';
const getUserProfile = async (targetUserId, currentUserId) => {
    const resolvedTargetId = (targetUserId === 'me' && currentUserId) ? currentUserId : targetUserId;
    if (!resolvedTargetId || resolvedTargetId === 'undefined') {
        throw new ValidationError('User ID is required.');
    }
    const user = await prisma.user.findUnique({
        where: { id: resolvedTargetId },
        select: {
            id: true,
            name: true,
            email: true,
            image: true,
            coverImage: true,
            bio: true,
            phone: true,
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
        throw new NotFoundError('User not found.');
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
    const { name, bio, image, coverImage, phone } = data;
    return await prisma.user.update({
        where: { id: userId },
        data: {
            name: name !== undefined ? name.trim() : undefined,
            bio: bio !== undefined ? bio : undefined,
            image: image !== undefined ? image : undefined,
            coverImage: coverImage !== undefined ? coverImage : undefined,
            phone: phone !== undefined ? phone.trim() : undefined,
        },
        select: {
            id: true,
            name: true,
            email: true,
            image: true,
            coverImage: true,
            bio: true,
            phone: true,
            role: true,
        },
    });
};
export const UserService = {
    getUserProfile,
    toggleFollow,
    updateProfile,
};
export default UserService;
