import prisma from '../../lib/prisma.js';
import slugify from 'slugify';
const createGroup = async (userId, data) => {
    const { name, description, coverImage, avatar, privacy = 'PUBLIC', requiresPostApproval = false } = data;
    if (!name || !name.trim())
        throw new Error('Group name is required.');
    const baseSlug = slugify(name, { lower: true, strict: true }) || 'group';
    let slug = baseSlug;
    let counter = 1;
    while (await prisma.group.findUnique({ where: { slug } })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
    }
    return await prisma.group.create({
        data: {
            name: name.trim(),
            slug,
            description,
            coverImage,
            avatar,
            privacy,
            requiresPostApproval: Boolean(requiresPostApproval),
            createdById: userId,
            members: {
                create: {
                    userId,
                    role: 'ADMIN',
                    isApproved: true,
                },
            },
        },
        include: {
            members: {
                include: {
                    user: { select: { id: true, name: true, image: true } },
                },
            },
        },
    });
};
const getGroups = async (search, myGroups, currentUserId) => {
    const where = {};
    if (search) {
        where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
        ];
    }
    if (myGroups && currentUserId) {
        where.members = {
            some: {
                userId: currentUserId,
                isApproved: true,
            },
        };
    }
    const groups = await prisma.group.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
            _count: {
                select: {
                    members: { where: { isApproved: true } },
                    posts: { where: { status: 'PUBLISHED' } },
                },
            },
            members: currentUserId
                ? {
                    where: { userId: currentUserId },
                    select: { role: true, isApproved: true },
                }
                : false,
        },
    });
    return groups.map((g) => ({
        ...g,
        memberCount: g._count.members,
        postCount: g._count.posts,
        myMembership: currentUserId && g.members && g.members[0] ? g.members[0] : null,
        members: undefined,
    }));
};
const getGroupBySlug = async (slug, currentUserId, currentUserRole) => {
    const group = await prisma.group.findUnique({
        where: { slug },
        include: {
            createdBy: {
                select: { id: true, name: true, image: true },
            },
            members: {
                where: { isApproved: true },
                take: 30,
                include: {
                    user: { select: { id: true, name: true, image: true, role: true } },
                },
            },
            _count: {
                select: {
                    members: { where: { isApproved: true } },
                    posts: { where: { status: 'PUBLISHED' } },
                },
            },
        },
    });
    if (!group)
        throw new Error('Group not found.');
    let myMembership = null;
    if (currentUserId) {
        myMembership = await prisma.groupMember.findUnique({
            where: {
                groupId_userId: {
                    groupId: group.id,
                    userId: currentUserId,
                },
            },
        });
    }
    const isGroupStaff = myMembership && ['ADMIN', 'MODERATOR'].includes(myMembership.role) && myMembership.isApproved;
    const isPlatformStaff = currentUserRole && ['ADMIN', 'MODERATOR'].includes(currentUserRole);
    let pendingRequestsCount = 0;
    let pendingPostsCount = 0;
    if (isGroupStaff || isPlatformStaff) {
        [pendingRequestsCount, pendingPostsCount] = await Promise.all([
            prisma.groupMember.count({
                where: { groupId: group.id, isApproved: false },
            }),
            prisma.post.count({
                where: { groupId: group.id, status: 'PENDING_APPROVAL' },
            }),
        ]);
    }
    return {
        ...group,
        memberCount: group._count.members,
        postCount: group._count.posts,
        myMembership,
        canModerate: Boolean(isGroupStaff || isPlatformStaff),
        pendingRequestsCount,
        pendingPostsCount,
    };
};
const joinGroup = async (userId, groupId) => {
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group)
        throw new Error('Group not found.');
    const existingMember = await prisma.groupMember.findUnique({
        where: {
            groupId_userId: { groupId, userId },
        },
    });
    if (existingMember) {
        if (existingMember.isApproved) {
            throw new Error('You are already an active member of this group.');
        }
        else {
            throw new Error('Your membership request is currently pending approval.');
        }
    }
    const isApproved = group.privacy === 'PUBLIC';
    const membership = await prisma.groupMember.create({
        data: {
            groupId,
            userId,
            role: 'MEMBER',
            isApproved,
        },
    });
    return { isApproved, membership };
};
const leaveGroup = async (userId, groupId) => {
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group)
        throw new Error('Group not found.');
    if (group.createdById === userId) {
        throw new Error('Group creator cannot leave. Please delete the group or transfer ownership.');
    }
    await prisma.groupMember.deleteMany({
        where: { groupId, userId },
    });
    return { groupId };
};
const handleJoinRequest = async (callerUserId, callerRole, groupId, memberId, action) => {
    const callerMembership = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: callerUserId } },
    });
    const isGroupStaff = callerMembership && ['ADMIN', 'MODERATOR'].includes(callerMembership.role);
    const isPlatformStaff = ['ADMIN', 'MODERATOR'].includes(callerRole);
    if (!isGroupStaff && !isPlatformStaff) {
        throw new Error('Only group admins and moderators can process join requests.');
    }
    if (action === 'APPROVE') {
        return await prisma.groupMember.update({
            where: { id: memberId },
            data: { isApproved: true },
        });
    }
    else {
        return await prisma.groupMember.delete({
            where: { id: memberId },
        });
    }
};
const updateMemberRole = async (callerUserId, callerRole, groupId, memberId, newRole) => {
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group)
        throw new Error('Group not found.');
    const isGroupAdmin = group.createdById === callerUserId;
    const isPlatformAdmin = callerRole === 'ADMIN';
    if (!isGroupAdmin && !isPlatformAdmin) {
        throw new Error('Only the Group Admin can change member roles.');
    }
    return await prisma.groupMember.update({
        where: { id: memberId },
        data: { role: newRole },
        include: { user: { select: { id: true, name: true, email: true } } },
    });
};
const updateGroupSettings = async (callerUserId, callerRole, groupId, settings) => {
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group)
        throw new Error('Group not found.');
    const isGroupAdmin = group.createdById === callerUserId;
    const isPlatformAdmin = callerRole === 'ADMIN';
    if (!isGroupAdmin && !isPlatformAdmin) {
        throw new Error('Only Group Admin can modify group settings.');
    }
    return await prisma.group.update({
        where: { id: groupId },
        data: {
            name: settings.name !== undefined ? settings.name.trim() : undefined,
            description: settings.description !== undefined ? settings.description : undefined,
            coverImage: settings.coverImage !== undefined ? settings.coverImage : undefined,
            avatar: settings.avatar !== undefined ? settings.avatar : undefined,
            privacy: settings.privacy !== undefined ? settings.privacy : undefined,
            requiresPostApproval: settings.requiresPostApproval !== undefined ? Boolean(settings.requiresPostApproval) : undefined,
        },
    });
};
export const GroupService = {
    createGroup,
    getGroups,
    getGroupBySlug,
    joinGroup,
    leaveGroup,
    handleJoinRequest,
    updateMemberRole,
    updateGroupSettings,
};
