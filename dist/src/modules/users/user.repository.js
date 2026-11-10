import prisma from '../../lib/prisma.js';
export const userRepository = {
    findById: async (id) => {
        return prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                email: true,
                image: true,
                bio: true,
                coverImage: true,
                phone: true,
                role: true,
                isBanned: true,
                createdAt: true,
                _count: {
                    select: {
                        followers: true,
                        following: true,
                        posts: true,
                    },
                },
            },
        });
    },
    findByEmail: async (email) => {
        return prisma.user.findUnique({
            where: { email },
        });
    },
    updateProfile: async (userId, data) => {
        return prisma.user.update({
            where: { id: userId },
            data,
            select: {
                id: true,
                name: true,
                email: true,
                image: true,
                bio: true,
                coverImage: true,
                phone: true,
                role: true,
            },
        });
    },
    findFollowers: async (userId) => {
        return prisma.follow.findMany({
            where: { followingId: userId },
            include: {
                follower: {
                    select: {
                        id: true,
                        name: true,
                        image: true,
                        bio: true,
                    },
                },
            },
        });
    },
    findFollowing: async (userId) => {
        return prisma.follow.findMany({
            where: { followerId: userId },
            include: {
                following: {
                    select: {
                        id: true,
                        name: true,
                        image: true,
                        bio: true,
                    },
                },
            },
        });
    },
};
export default userRepository;
