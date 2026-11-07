import prisma from '../../lib/prisma.js';
import { paginationUtils } from '../../utils/pagination.js';
const getPlatformStats = async () => {
    const [totalUsers, totalPosts, totalRecipes, totalGroups, pendingReports, bannedUsers,] = await Promise.all([
        prisma.user.count(),
        prisma.post.count(),
        prisma.post.count({ where: { postType: 'RECIPE' } }),
        prisma.group.count(),
        prisma.report.count({ where: { status: 'PENDING' } }),
        prisma.user.count({ where: { isBanned: true } }),
    ]);
    const recentUsers = await prisma.user.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
    const recentReports = await prisma.report.findMany({
        where: { status: 'PENDING' },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { reporter: { select: { id: true, name: true, email: true } } },
    });
    return {
        stats: {
            totalUsers,
            totalPosts,
            totalRecipes,
            totalGroups,
            pendingReports,
            bannedUsers,
        },
        recentUsers,
        recentReports,
    };
};
const getUsers = async (query) => {
    const { page, limit, skip } = paginationUtils.getPaginationOptions(query);
    const { search, role, status } = query;
    const where = {};
    if (search) {
        where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
        ];
    }
    if (role && ['USER', 'MODERATOR', 'ADMIN'].includes(role.toUpperCase())) {
        where.role = role.toUpperCase();
    }
    if (status === 'BANNED')
        where.isBanned = true;
    if (status === 'ACTIVE')
        where.isBanned = false;
    const [users, total] = await Promise.all([
        prisma.user.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                email: true,
                image: true,
                role: true,
                isBanned: true,
                createdAt: true,
                _count: {
                    select: {
                        posts: true,
                        createdGroups: true,
                    },
                },
            },
        }),
        prisma.user.count({ where }),
    ]);
    const formattedUsers = users.map((u) => ({
        ...u,
        postCount: u._count.posts,
        groupCount: u._count.createdGroups,
    }));
    const meta = paginationUtils.getPaginationMeta(page, limit, total);
    return { meta, data: formattedUsers };
};
const updateUserRole = async (callerUserId, targetUserId, role) => {
    if (!['USER', 'MODERATOR', 'ADMIN'].includes(role)) {
        throw new Error('Invalid platform role specified.');
    }
    if (targetUserId === callerUserId && role !== 'ADMIN') {
        throw new Error('You cannot change your own admin role.');
    }
    return await prisma.user.update({
        where: { id: targetUserId },
        data: { role: role },
        select: { id: true, name: true, email: true, role: true },
    });
};
const toggleUserBan = async (callerUserId, targetUserId) => {
    if (targetUserId === callerUserId) {
        throw new Error('You cannot ban yourself.');
    }
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser)
        throw new Error('User not found.');
    return await prisma.user.update({
        where: { id: targetUserId },
        data: { isBanned: !targetUser.isBanned },
        select: { id: true, name: true, email: true, isBanned: true },
    });
};
const submitReport = async (reporterId, targetType, targetId, reason) => {
    if (!targetType || !targetId || !reason) {
        throw new Error('Target type, target ID, and reason are required.');
    }
    return await prisma.report.create({
        data: {
            reporterId,
            targetType,
            targetId,
            reason,
        },
    });
};
const getReports = async (status = 'PENDING') => {
    return await prisma.report.findMany({
        where: status !== 'ALL' ? { status: status } : {},
        orderBy: { createdAt: 'desc' },
        include: {
            reporter: {
                select: { id: true, name: true, email: true, image: true },
            },
        },
    });
};
const resolveReport = async (reportId, status) => {
    if (!['RESOLVED', 'DISMISSED'].includes(status)) {
        throw new Error('Status must be RESOLVED or DISMISSED.');
    }
    return await prisma.report.update({
        where: { id: reportId },
        data: { status },
    });
};
export const AdminService = {
    getPlatformStats,
    getUsers,
    updateUserRole,
    toggleUserBan,
    submitReport,
    getReports,
    resolveReport,
};
