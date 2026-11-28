import crypto from 'node:crypto';
import prisma from '../../lib/prisma.js';
import slugify from 'slugify';
import { NotificationService } from '../notifications/notification.service.js';
const db = prisma;
const getEffectiveOwnerId = (group) => group.ownerId || group.createdById || null;
const isUserGroupStaff = async (group, userId) => {
    if (!userId)
        return false;
    if (getEffectiveOwnerId(group) === userId)
        return true;
    const membership = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: group.id, userId } },
        select: { role: true, isApproved: true },
    });
    return Boolean(membership?.isApproved && ['ADMIN', 'MODERATOR'].includes(membership.role));
};
const createGroup = async (userId, data) => {
    const { name, description, coverImage, avatar, privacy = 'PUBLIC', discoverability = 'VISIBLE', joinMode = 'DIRECT', requiresPostApproval = false, invitedUserIds = [], } = data;
    if (!name || !name.trim())
        throw new Error('Group name is required.');
    const baseSlug = slugify.default ? slugify.default(name, { lower: true, strict: true }) : slugify(name, { lower: true, strict: true }) || 'group';
    let slug = baseSlug;
    let counter = 1;
    while (await prisma.group.findUnique({ where: { slug } })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
    }
    const candidateIds = Array.from(new Set(invitedUserIds.filter((id) => id && id !== userId)));
    let validInvitedIds = [];
    if (candidateIds.length > 0) {
        const existingUsers = await prisma.user.findMany({
            where: { id: { in: candidateIds }, isBanned: false },
            select: { id: true },
        });
        validInvitedIds = existingUsers.map((u) => u.id);
    }
    const createdGroup = await prisma.group.create({
        data: {
            name: name.trim(),
            slug,
            description,
            coverImage,
            avatar,
            privacy,
            discoverability,
            joinMode: joinMode === 'ADMIN_APPROVAL' ? 'ADMIN_APPROVAL' : 'DIRECT',
            requiresPostApproval: Boolean(requiresPostApproval),
            ownerId: userId,
            createdById: userId,
            members: {
                create: [
                    {
                        userId,
                        role: 'ADMIN',
                        isApproved: true,
                    },
                ],
            },
        },
        include: {
            owner: {
                select: { id: true, name: true, image: true },
            },
            createdBy: {
                select: { id: true, name: true, image: true },
            },
            members: {
                include: {
                    user: { select: { id: true, name: true, image: true } },
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
    if (validInvitedIds.length > 0) {
        await Promise.all(validInvitedIds.map(async (inviteeId) => {
            try {
                const invitation = await db.groupInvitation.upsert({
                    where: { groupId_inviteeId: { groupId: createdGroup.id, inviteeId } },
                    update: {
                        inviterId: userId,
                        role: 'MEMBER',
                        status: 'PENDING',
                        respondedAt: null,
                    },
                    create: {
                        groupId: createdGroup.id,
                        inviterId: userId,
                        inviteeId,
                        role: 'MEMBER',
                        status: 'PENDING',
                    },
                });
                await NotificationService.notifyGroupInvite(userId, inviteeId, { id: createdGroup.id, name: createdGroup.name, slug: createdGroup.slug }, invitation.id);
            }
            catch {
                /* ignore individual invite failure */
            }
        }));
    }
    return createdGroup;
};
const getGroups = async (search, myGroups, currentUserId) => {
    const andConditions = [
        { status: { in: ['ACTIVE', 'PAUSED'] } },
    ];
    if (search) {
        andConditions.push({
            OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
            ],
        });
    }
    if (myGroups && currentUserId) {
        andConditions.push({
            OR: [
                { ownerId: currentUserId },
                { createdById: currentUserId },
                {
                    members: {
                        some: {
                            userId: currentUserId,
                            isApproved: true,
                        },
                    },
                },
            ],
        });
    }
    else {
        andConditions.push({
            OR: [
                { discoverability: 'VISIBLE' },
                ...(currentUserId
                    ? [
                        { ownerId: currentUserId },
                        {
                            members: {
                                some: { userId: currentUserId, isApproved: true },
                            },
                        },
                    ]
                    : []),
            ],
        });
    }
    const where = { AND: andConditions };
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
            owner: {
                select: { id: true, name: true, image: true },
            },
            createdBy: {
                select: { id: true, name: true, image: true },
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
        ownerId: getEffectiveOwnerId(g),
        memberCount: g._count.members,
        postCount: g._count.posts,
        myMembership: currentUserId && g.members && g.members[0] ? g.members[0] : null,
        members: undefined,
    }));
};
const getGroupBySlug = async (slug, currentUserId, _currentUserRole) => {
    const group = await prisma.group.findUnique({
        where: { slug },
        include: {
            owner: {
                select: { id: true, name: true, image: true },
            },
            createdBy: {
                select: { id: true, name: true, image: true },
            },
            members: {
                where: { isApproved: true },
                take: 100,
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
    if (!group || group.status === 'DELETED')
        throw new Error('Group not found.');
    let myMembership = null;
    let myPendingInvite = null;
    if (currentUserId) {
        [myMembership, myPendingInvite] = await Promise.all([
            prisma.groupMember.findUnique({
                where: {
                    groupId_userId: {
                        groupId: group.id,
                        userId: currentUserId,
                    },
                },
            }),
            db.groupInvitation.findFirst({
                where: {
                    groupId: group.id,
                    inviteeId: currentUserId,
                    status: 'PENDING',
                },
                include: {
                    inviter: { select: { id: true, name: true, image: true } },
                },
            }),
        ]);
    }
    const effectiveOwnerId = getEffectiveOwnerId(group);
    const isOwner = Boolean(currentUserId && effectiveOwnerId === currentUserId);
    const isGroupStaff = Boolean(isOwner ||
        (myMembership &&
            ['ADMIN', 'MODERATOR'].includes(myMembership.role) &&
            myMembership.isApproved));
    if (group.status === 'ARCHIVED' && !isOwner && !(myMembership?.role === 'ADMIN' && myMembership.isApproved)) {
        throw new Error('This group has been archived.');
    }
    let pendingRequestsCount = 0;
    let pendingPostsCount = 0;
    if (isGroupStaff) {
        [pendingRequestsCount, pendingPostsCount] = await Promise.all([
            prisma.groupMember.count({
                where: { groupId: group.id, isApproved: false },
            }),
            prisma.post.count({
                where: { groupId: group.id, status: 'PENDING_APPROVAL', deletedAt: null },
            }),
        ]);
    }
    const canViewMembers = group.privacy === 'PUBLIC' || Boolean(myMembership?.isApproved) || isOwner;
    const myMembershipStatus = myMembership
        ? myMembership.isApproved
            ? 'APPROVED'
            : 'PENDING'
        : isOwner
            ? 'APPROVED'
            : 'NONE';
    return {
        ...group,
        ownerId: effectiveOwnerId,
        owner: group.owner || group.createdBy || null,
        members: canViewMembers ? group.members : [],
        memberCount: group._count.members,
        postCount: group._count.posts,
        myMembership,
        myMembershipStatus,
        myPendingInvite: myPendingInvite
            ? {
                id: myPendingInvite.id,
                role: myPendingInvite.role,
                inviter: myPendingInvite.inviter,
                createdAt: myPendingInvite.createdAt instanceof Date
                    ? myPendingInvite.createdAt.toISOString()
                    : String(myPendingInvite.createdAt || ''),
            }
            : null,
        canModerate: isGroupStaff,
        pendingRequestsCount,
        pendingPostsCount,
    };
};
const joinGroup = async (userId, groupIdOrSlug) => {
    const group = await prisma.group.findFirst({
        where: {
            OR: [{ id: groupIdOrSlug }, { slug: groupIdOrSlug }],
        },
    });
    if (!group || group.status === 'DELETED')
        throw new Error('Group not found.');
    const existingMember = await prisma.groupMember.findUnique({
        where: {
            groupId_userId: { groupId: group.id, userId },
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
    const pendingInvite = await db.groupInvitation.findUnique({
        where: { groupId_inviteeId: { groupId: group.id, inviteeId: userId } },
    });
    if (pendingInvite && pendingInvite.status === 'PENDING') {
        const res = await respondToInvitation(userId, pendingInvite.id, 'ACCEPT');
        const membership = await prisma.groupMember.findUnique({
            where: { groupId_userId: { groupId: group.id, userId } },
        });
        return { isApproved: Boolean(res.isApproved), membership };
    }
    const isApproved = group.joinMode !== 'ADMIN_APPROVAL';
    const membership = await prisma.groupMember.create({
        data: {
            groupId: group.id,
            userId,
            role: 'MEMBER',
            isApproved,
        },
    });
    if (!isApproved) {
        await NotificationService.notifyGroupJoinRequest(userId, {
            id: group.id,
            name: group.name,
            slug: group.slug,
            ownerId: group.ownerId,
            createdById: group.createdById,
        }).catch(() => { });
    }
    return { isApproved, membership };
};
const leaveGroup = async (userId, groupIdOrSlug) => {
    const group = await prisma.group.findFirst({
        where: {
            OR: [{ id: groupIdOrSlug }, { slug: groupIdOrSlug }],
        },
    });
    if (!group || group.status === 'DELETED')
        throw new Error('Group not found.');
    if (getEffectiveOwnerId(group) === userId) {
        throw new Error('Group owner cannot leave. Please transfer ownership or archive the group first.');
    }
    await prisma.groupMember.deleteMany({
        where: { groupId: group.id, userId },
    });
    return { groupId: group.id };
};
const handleJoinRequest = async (callerUserId, _callerRole, groupId, memberId, action) => {
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group || group.status === 'DELETED')
        throw new Error('Group not found.');
    const callerMembership = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: callerUserId } },
    });
    const isOwner = getEffectiveOwnerId(group) === callerUserId;
    const isGroupStaff = isOwner ||
        Boolean(callerMembership?.isApproved &&
            ['ADMIN', 'MODERATOR'].includes(callerMembership.role));
    if (!isGroupStaff) {
        throw new Error('Only group admins and moderators can process join requests.');
    }
    const targetMember = await prisma.groupMember.findUnique({ where: { id: memberId } });
    if (!targetMember || targetMember.groupId !== groupId) {
        throw new Error('Membership request not found in this group.');
    }
    if (action === 'APPROVE') {
        const approved = await prisma.groupMember.update({
            where: { id: memberId },
            data: { isApproved: true, role: 'MEMBER' },
            include: {
                user: { select: { id: true, name: true, image: true } },
            },
        });
        await NotificationService.notifyGroupJoinApproved(callerUserId, targetMember.userId, {
            id: group.id,
            name: group.name,
            slug: group.slug,
        }).catch(() => { });
        return approved;
    }
    else {
        return await prisma.groupMember.delete({
            where: { id: memberId },
        });
    }
};
const updateMemberRole = async (callerUserId, _callerRole, groupId, memberId, newRole) => {
    if (!['ADMIN', 'MODERATOR', 'MEMBER'].includes(newRole)) {
        throw new Error('Invalid group role.');
    }
    return await prisma.$transaction(async (tx) => {
        const group = await tx.group.findUnique({ where: { id: groupId } });
        if (!group || group.status === 'DELETED')
            throw new Error('Group not found.');
        const effectiveOwnerId = getEffectiveOwnerId(group);
        const isOwner = effectiveOwnerId === callerUserId;
        const callerMembership = await tx.groupMember.findUnique({
            where: { groupId_userId: { groupId, userId: callerUserId } },
        });
        const isGroupAdmin = isOwner || Boolean(callerMembership?.isApproved && callerMembership.role === 'ADMIN');
        if (!isGroupAdmin) {
            throw new Error('Only a Group Admin can change member roles.');
        }
        const targetMember = await tx.groupMember.findUnique({ where: { id: memberId } });
        if (!targetMember || targetMember.groupId !== groupId) {
            throw new Error('Member not found in this group.');
        }
        if (targetMember.userId === callerUserId) {
            throw new Error('You cannot change your own role here.');
        }
        if (targetMember.userId === effectiveOwnerId && newRole !== 'ADMIN') {
            throw new Error('Cannot demote the group owner.');
        }
        if (targetMember.role === 'ADMIN' && !isOwner && newRole !== 'ADMIN') {
            throw new Error('Only the group owner can change another admin’s role.');
        }
        if (targetMember.role === 'ADMIN' && newRole !== 'ADMIN') {
            const adminCount = await tx.groupMember.count({
                where: { groupId, role: 'ADMIN', isApproved: true },
            });
            if (adminCount <= 1) {
                throw new Error('Cannot demote the last active admin of the group.');
            }
        }
        return await tx.groupMember.update({
            where: { id: memberId },
            data: { role: newRole },
            include: { user: { select: { id: true, name: true, image: true, email: true } } },
        });
    });
};
const removeMember = async (callerUserId, _callerRole, groupId, memberId) => {
    return await prisma.$transaction(async (tx) => {
        const group = await tx.group.findUnique({ where: { id: groupId } });
        if (!group || group.status === 'DELETED')
            throw new Error('Group not found.');
        const effectiveOwnerId = getEffectiveOwnerId(group);
        const isOwner = effectiveOwnerId === callerUserId;
        const callerMembership = await tx.groupMember.findUnique({
            where: { groupId_userId: { groupId, userId: callerUserId } },
        });
        const isGroupAdmin = isOwner || Boolean(callerMembership?.isApproved && callerMembership.role === 'ADMIN');
        const isGroupMod = Boolean(callerMembership?.isApproved && callerMembership.role === 'MODERATOR');
        if (!isGroupAdmin && !isGroupMod) {
            throw new Error('Only group admins and moderators can remove members.');
        }
        const targetMember = await tx.groupMember.findUnique({ where: { id: memberId } });
        if (!targetMember || targetMember.groupId !== groupId) {
            throw new Error('Member not found in this group.');
        }
        if (targetMember.userId === effectiveOwnerId) {
            throw new Error('Cannot remove the group owner.');
        }
        if (targetMember.userId === callerUserId) {
            throw new Error('Use Leave Group to remove yourself.');
        }
        if (targetMember.role === 'ADMIN' && !isOwner) {
            throw new Error('Only the group owner can remove another admin.');
        }
        if (isGroupMod && !isGroupAdmin && targetMember.role !== 'MEMBER') {
            throw new Error('Moderators can only remove regular members.');
        }
        await tx.groupMember.delete({ where: { id: memberId } });
        return true;
    });
};
const addMember = async (callerUserId, callerRole, groupId, userId, role = 'MEMBER') => {
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group)
        throw new Error('Group not found.');
    const callerMembership = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: callerUserId } },
    });
    const isMember = group.createdById === callerUserId || Boolean(callerMembership?.isApproved);
    const isPlatformAdmin = callerRole === 'ADMIN';
    if (!isMember && !isPlatformAdmin) {
        throw new Error('You must be a member to invite or add people to this group.');
    }
    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser)
        throw new Error('User not found.');
    const existing = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId } },
    });
    if (existing) {
        if (existing.isApproved) {
            throw new Error('This user is already a member of the group.');
        }
        return await prisma.groupMember.update({
            where: { id: existing.id },
            data: { isApproved: true },
            include: {
                user: { select: { id: true, name: true, image: true, email: true } },
            },
        });
    }
    return await prisma.groupMember.create({
        data: {
            groupId,
            userId,
            role: role || 'MEMBER',
            isApproved: true,
        },
        include: {
            user: { select: { id: true, name: true, image: true, email: true } },
        },
    });
};
const inviteMember = async (callerUserId, callerRole, groupId, inviteeId, role = 'MEMBER') => {
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group || group.status === 'DELETED')
        throw new Error('Group not found.');
    if (callerUserId === inviteeId) {
        throw new Error('You cannot invite yourself to a group.');
    }
    const callerMembership = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: callerUserId } },
    });
    const isMember = group.createdById === callerUserId || Boolean(callerMembership?.isApproved);
    const isPlatformAdmin = callerRole === 'ADMIN';
    if (!isMember && !isPlatformAdmin) {
        throw new Error('You must be a member to invite people to this group.');
    }
    const targetUser = await prisma.user.findUnique({
        where: { id: inviteeId },
        select: { id: true, name: true, image: true, isBanned: true, deletedAt: true },
    });
    if (!targetUser || targetUser.isBanned || targetUser.deletedAt) {
        throw new Error('User not found.');
    }
    const blocked = await prisma.userBlock.findFirst({
        where: {
            OR: [
                { blockerId: callerUserId, blockedId: inviteeId },
                { blockerId: inviteeId, blockedId: callerUserId },
            ],
        },
        select: { id: true },
    });
    if (blocked) {
        throw new Error('Unable to invite this user.');
    }
    const existingMember = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: inviteeId } },
    });
    if (existingMember?.isApproved) {
        throw new Error('This user is already a member of the group.');
    }
    const invitation = await db.groupInvitation.upsert({
        where: { groupId_inviteeId: { groupId, inviteeId } },
        update: {
            inviterId: callerUserId,
            role: role || 'MEMBER',
            status: 'PENDING',
            respondedAt: null,
        },
        create: {
            groupId,
            inviterId: callerUserId,
            inviteeId,
            role: role || 'MEMBER',
            status: 'PENDING',
        },
        include: {
            invitee: { select: { id: true, name: true, image: true } },
        },
    });
    await NotificationService.notifyGroupInvite(callerUserId, inviteeId, { id: group.id, name: group.name, slug: group.slug }, invitation.id).catch(() => { });
    return invitation;
};
const respondToInvitation = async (userId, invitationId, action) => {
    const invitation = await db.groupInvitation.findUnique({
        where: { id: invitationId },
        include: { group: true },
    });
    if (!invitation || invitation.inviteeId !== userId) {
        throw new Error('Group invitation not found.');
    }
    if (invitation.status !== 'PENDING') {
        await NotificationService.resolveGroupInviteNotification(userId, invitation.id, invitation.status === 'ACCEPTED' ? 'ACCEPTED' : 'DECLINED').catch(() => { });
        return { success: true, status: invitation.status, groupSlug: invitation.group?.slug };
    }
    if (!invitation.group || invitation.group.status === 'DELETED') {
        throw new Error('This group no longer exists.');
    }
    const now = new Date();
    if (action === 'ACCEPT') {
        const inviterIsStaff = await isUserGroupStaff(invitation.group, invitation.inviterId);
        const shouldApproveDirectly = invitation.group.joinMode !== 'ADMIN_APPROVAL' || inviterIsStaff;
        const existingMember = await prisma.groupMember.findUnique({
            where: { groupId_userId: { groupId: invitation.groupId, userId } },
        });
        const finalApproved = existingMember?.isApproved ? true : shouldApproveDirectly;
        await prisma.$transaction([
            db.groupInvitation.update({
                where: { id: invitation.id },
                data: { status: 'ACCEPTED', respondedAt: now },
            }),
            prisma.groupMember.upsert({
                where: { groupId_userId: { groupId: invitation.groupId, userId } },
                update: { isApproved: finalApproved },
                create: {
                    groupId: invitation.groupId,
                    userId,
                    role: invitation.role || 'MEMBER',
                    isApproved: finalApproved,
                },
            }),
        ]);
        await NotificationService.resolveGroupInviteNotification(userId, invitation.id, 'ACCEPTED').catch(() => { });
        if (!finalApproved) {
            await NotificationService.notifyGroupJoinRequest(userId, {
                id: invitation.group.id,
                name: invitation.group.name,
                slug: invitation.group.slug,
                ownerId: invitation.group.ownerId,
                createdById: invitation.group.createdById,
            }).catch(() => { });
        }
        return {
            success: true,
            status: finalApproved ? 'ACCEPTED' : 'PENDING_APPROVAL',
            isApproved: finalApproved,
            groupSlug: invitation.group.slug,
        };
    }
    await db.groupInvitation.update({
        where: { id: invitation.id },
        data: { status: 'DECLINED', respondedAt: now },
    });
    await NotificationService.resolveGroupInviteNotification(userId, invitation.id, 'DECLINED').catch(() => { });
    return {
        success: true,
        status: 'DECLINED',
        isApproved: false,
        groupSlug: invitation.group.slug,
    };
};
const getOrCreateInviteLink = async (callerUserId, callerRole, groupId) => {
    const group = await prisma.group.findFirst({
        where: { OR: [{ id: groupId }, { slug: groupId }] },
    });
    if (!group || group.status === 'DELETED')
        throw new Error('Group not found.');
    const isStaff = await isUserGroupStaff(group, callerUserId);
    const callerMembership = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: group.id, userId: callerUserId } },
    });
    const isMember = isStaff || Boolean(callerMembership?.isApproved) || callerRole === 'ADMIN';
    if (!isMember) {
        throw new Error('You must be a group member to create an invite link.');
    }
    const now = new Date();
    const existing = await db.groupInviteLink.findFirst({
        where: {
            groupId: group.id,
            createdById: callerUserId,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        orderBy: { createdAt: 'desc' },
    });
    if (existing) {
        // Keep isStaffLink aligned with caller's current staff permission
        if (existing.isStaffLink !== isStaff) {
            return await db.groupInviteLink.update({
                where: { id: existing.id },
                data: { isStaffLink: isStaff },
            });
        }
        return existing;
    }
    return await db.groupInviteLink.create({
        data: {
            groupId: group.id,
            createdById: callerUserId,
            token: crypto.randomBytes(18).toString('base64url'),
            isStaffLink: isStaff,
        },
    });
};
const regenerateInviteLink = async (callerUserId, callerRole, groupId) => {
    const group = await prisma.group.findFirst({
        where: { OR: [{ id: groupId }, { slug: groupId }] },
    });
    if (!group || group.status === 'DELETED')
        throw new Error('Group not found.');
    const isStaff = await isUserGroupStaff(group, callerUserId);
    const callerMembership = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: group.id, userId: callerUserId } },
    });
    const isMember = isStaff || Boolean(callerMembership?.isApproved) || callerRole === 'ADMIN';
    if (!isMember) {
        throw new Error('You must be a group member to regenerate an invite link.');
    }
    const now = new Date();
    await db.groupInviteLink.updateMany({
        where: { groupId: group.id, createdById: callerUserId, revokedAt: null },
        data: { revokedAt: now },
    });
    return await db.groupInviteLink.create({
        data: {
            groupId: group.id,
            createdById: callerUserId,
            token: crypto.randomBytes(18).toString('base64url'),
            isStaffLink: isStaff,
        },
    });
};
const revokeInviteLink = async (callerUserId, callerRole, groupId, linkId) => {
    const group = await prisma.group.findFirst({
        where: { OR: [{ id: groupId }, { slug: groupId }] },
    });
    if (!group || group.status === 'DELETED')
        throw new Error('Group not found.');
    const isStaff = (await isUserGroupStaff(group, callerUserId)) || callerRole === 'ADMIN';
    const now = new Date();
    if (linkId) {
        const link = await db.groupInviteLink.findFirst({
            where: { id: linkId, groupId: group.id },
        });
        if (!link)
            throw new Error('Invite link not found.');
        if (!isStaff && link.createdById !== callerUserId) {
            throw new Error('Not authorized to revoke this invite link.');
        }
        await db.groupInviteLink.update({
            where: { id: link.id },
            data: { revokedAt: now },
        });
        return true;
    }
    await db.groupInviteLink.updateMany({
        where: isStaff
            ? { groupId: group.id, revokedAt: null }
            : { groupId: group.id, createdById: callerUserId, revokedAt: null },
        data: { revokedAt: now },
    });
    return true;
};
const getGroupInvitePreview = async (groupIdOrSlug, inviteToken, currentUserId) => {
    if (!inviteToken?.trim()) {
        return { valid: false, reason: 'Invitation token is missing.' };
    }
    const link = await db.groupInviteLink.findUnique({
        where: { token: inviteToken.trim() },
        include: {
            createdBy: { select: { id: true, name: true, image: true } },
            group: {
                include: {
                    _count: {
                        select: { members: { where: { isApproved: true } } },
                    },
                },
            },
        },
    });
    if (!link || !link.group || link.group.status === 'DELETED') {
        return { valid: false, reason: 'This invitation link is invalid or expired.' };
    }
    if (link.group.id !== groupIdOrSlug && link.group.slug !== groupIdOrSlug) {
        return { valid: false, reason: 'This invitation link is for a different group.' };
    }
    if (link.revokedAt) {
        return { valid: false, reason: 'This invitation link has been revoked.' };
    }
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
        return { valid: false, reason: 'This invitation link has expired.' };
    }
    const inviterIsStaff = link.isStaffLink || (await isUserGroupStaff(link.group, link.createdById));
    const requiresAdminApproval = link.group.joinMode === 'ADMIN_APPROVAL' && !inviterIsStaff;
    let membershipStatus = 'NONE';
    if (currentUserId) {
        const member = await prisma.groupMember.findUnique({
            where: { groupId_userId: { groupId: link.group.id, userId: currentUserId } },
        });
        if (member) {
            membershipStatus = member.isApproved ? 'APPROVED' : 'PENDING';
        }
        else if (getEffectiveOwnerId(link.group) === currentUserId) {
            membershipStatus = 'APPROVED';
        }
    }
    return {
        valid: true,
        isStaffInvite: inviterIsStaff,
        requiresAdminApproval,
        membershipStatus,
        joinMode: link.group.joinMode || 'DIRECT',
        inviter: link.createdBy,
        group: {
            id: link.group.id,
            name: link.group.name,
            slug: link.group.slug,
            privacy: link.group.privacy,
            avatar: link.group.avatar,
            coverImage: link.group.coverImage,
            membersCount: link.group._count?.members || 0,
        },
    };
};
const acceptGroupInviteLink = async (userId, inviteToken) => {
    const link = await db.groupInviteLink.findUnique({
        where: { token: inviteToken.trim() },
        include: { group: true },
    });
    if (!link || !link.group || link.group.status === 'DELETED') {
        throw new Error('This invitation link is invalid.');
    }
    if (link.revokedAt) {
        throw new Error('This invitation link has been revoked.');
    }
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
        throw new Error('This invitation link has expired.');
    }
    const existing = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: link.group.id, userId } },
    });
    if (existing) {
        if (existing.isApproved) {
            return { status: 'ALREADY_MEMBER', isApproved: true, groupSlug: link.group.slug };
        }
        return { status: 'PENDING_APPROVAL', isApproved: false, groupSlug: link.group.slug };
    }
    const inviterIsStaff = link.isStaffLink || (await isUserGroupStaff(link.group, link.createdById));
    const shouldApproveDirectly = link.group.joinMode !== 'ADMIN_APPROVAL' || inviterIsStaff;
    await prisma.$transaction([
        prisma.groupMember.create({
            data: {
                groupId: link.group.id,
                userId,
                role: 'MEMBER',
                isApproved: shouldApproveDirectly,
            },
        }),
        db.groupInviteLink.update({
            where: { id: link.id },
            data: { useCount: { increment: 1 } },
        }),
    ]);
    const pendingInvite = await db.groupInvitation.findUnique({
        where: { groupId_inviteeId: { groupId: link.group.id, inviteeId: userId } },
    });
    if (pendingInvite && pendingInvite.status === 'PENDING') {
        await db.groupInvitation.update({
            where: { id: pendingInvite.id },
            data: { status: 'ACCEPTED', respondedAt: new Date() },
        });
        await NotificationService.resolveGroupInviteNotification(userId, pendingInvite.id, 'ACCEPTED').catch(() => { });
    }
    if (!shouldApproveDirectly) {
        await NotificationService.notifyGroupJoinRequest(userId, {
            id: link.group.id,
            name: link.group.name,
            slug: link.group.slug,
            ownerId: link.group.ownerId,
            createdById: link.group.createdById,
        }).catch(() => { });
    }
    return {
        status: shouldApproveDirectly ? 'JOINED' : 'PENDING_APPROVAL',
        isApproved: shouldApproveDirectly,
        groupSlug: link.group.slug,
    };
};
const getGroupJoinRequests = async (callerUserId, callerRole, groupId) => {
    const group = await prisma.group.findFirst({
        where: { OR: [{ id: groupId }, { slug: groupId }] },
    });
    if (!group || group.status === 'DELETED')
        throw new Error('Group not found.');
    const isStaff = (await isUserGroupStaff(group, callerUserId)) || callerRole === 'ADMIN';
    if (!isStaff) {
        throw new Error('Only group admins and moderators can view join requests.');
    }
    const requests = await prisma.groupMember.findMany({
        where: { groupId: group.id, isApproved: false },
        orderBy: { createdAt: 'asc' },
        include: {
            user: { select: { id: true, name: true, image: true, bio: true } },
        },
    });
    return requests.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
    }));
};
const getGroupPendingInvitations = async (callerUserId, callerRole, groupId) => {
    const group = await prisma.group.findFirst({
        where: { OR: [{ id: groupId }, { slug: groupId }] },
    });
    if (!group || group.status === 'DELETED')
        throw new Error('Group not found.');
    const isStaff = (await isUserGroupStaff(group, callerUserId)) || callerRole === 'ADMIN';
    if (!isStaff) {
        throw new Error('Only group admins and moderators can view pending invitations.');
    }
    const rows = await db.groupInvitation.findMany({
        where: { groupId: group.id, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        include: {
            inviter: { select: { id: true, name: true, image: true } },
            invitee: { select: { id: true, name: true, image: true } },
        },
    });
    return rows.map((row) => ({
        ...row,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt || ''),
    }));
};
const cancelGroupInvitation = async (callerUserId, callerRole, groupId, invitationId) => {
    const group = await prisma.group.findFirst({
        where: { OR: [{ id: groupId }, { slug: groupId }] },
    });
    if (!group || group.status === 'DELETED')
        throw new Error('Group not found.');
    const invitation = await db.groupInvitation.findFirst({
        where: { id: invitationId, groupId: group.id },
    });
    if (!invitation)
        throw new Error('Invitation not found.');
    const isStaff = (await isUserGroupStaff(group, callerUserId)) || callerRole === 'ADMIN';
    if (!isStaff && invitation.inviterId !== callerUserId) {
        throw new Error('Not authorized to cancel this invitation.');
    }
    await db.groupInvitation.update({
        where: { id: invitation.id },
        data: { status: 'CANCELLED', respondedAt: new Date() },
    });
    await NotificationService.resolveGroupInviteNotification(invitation.inviteeId, invitation.id, 'CANCELLED').catch(() => { });
    return true;
};
const updateGroupCover = async (callerUserId, callerRole, groupId, coverImage) => {
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group)
        throw new Error('Group not found.');
    const callerMembership = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: callerUserId } },
    });
    const isStaff = group.createdById === callerUserId ||
        ['ADMIN', 'MODERATOR'].includes(callerMembership?.role || '');
    const isPlatformStaff = ['ADMIN', 'MODERATOR'].includes(callerRole);
    if (!isStaff && !isPlatformStaff) {
        throw new Error('Only group admins and moderators can update the group cover photo.');
    }
    return await prisma.group.update({
        where: { id: groupId },
        data: { coverImage },
    });
};
const updateGroupSettings = async (callerUserId, _callerRole, groupIdOrSlug, settings) => {
    const group = await prisma.group.findFirst({
        where: {
            OR: [{ id: groupIdOrSlug }, { slug: groupIdOrSlug }],
        },
    });
    if (!group || group.status === 'DELETED')
        throw new Error('Group not found.');
    const callerMembership = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: group.id, userId: callerUserId } },
    });
    const isOwner = getEffectiveOwnerId(group) === callerUserId;
    const isGroupAdmin = isOwner || Boolean(callerMembership?.isApproved && callerMembership.role === 'ADMIN');
    if (!isGroupAdmin) {
        throw new Error('Only group admins can modify group settings.');
    }
    if (settings.name !== undefined) {
        const trimmed = settings.name.trim();
        if (trimmed.length < 2 || trimmed.length > 120) {
            throw new Error('Group name must be between 2 and 120 characters.');
        }
    }
    if (settings.privacy !== undefined && !['PUBLIC', 'PRIVATE'].includes(settings.privacy)) {
        throw new Error('Invalid group privacy setting.');
    }
    if (settings.discoverability !== undefined &&
        !['VISIBLE', 'HIDDEN'].includes(settings.discoverability)) {
        throw new Error('Invalid discoverability setting.');
    }
    if (settings.joinMode !== undefined &&
        !['DIRECT', 'ADMIN_APPROVAL'].includes(settings.joinMode)) {
        throw new Error('Invalid join mode setting.');
    }
    if (settings.challengeCreatorPolicy !== undefined &&
        !['STAFF', 'MEMBERS'].includes(settings.challengeCreatorPolicy)) {
        throw new Error('Invalid challenge creator policy.');
    }
    await prisma.group.update({
        where: { id: group.id },
        data: {
            name: settings.name !== undefined ? settings.name.trim() : undefined,
            description: settings.description !== undefined ? settings.description : undefined,
            coverImage: settings.coverImage !== undefined ? settings.coverImage : undefined,
            avatar: settings.avatar !== undefined ? settings.avatar : undefined,
            privacy: settings.privacy !== undefined ? settings.privacy : undefined,
            discoverability: settings.discoverability !== undefined ? settings.discoverability : undefined,
            joinMode: settings.joinMode !== undefined ? settings.joinMode : undefined,
            requiresPostApproval: settings.requiresPostApproval !== undefined
                ? Boolean(settings.requiresPostApproval)
                : undefined,
            challengeCreatorPolicy: settings.challengeCreatorPolicy !== undefined
                ? settings.challengeCreatorPolicy
                : undefined,
            version: { increment: 1 },
        },
    });
    return await getGroupBySlug(group.slug, callerUserId);
};
const transferGroupOwnership = async (callerUserId, groupId, newOwnerUserId) => {
    if (!newOwnerUserId)
        throw new Error('Target owner user ID is required.');
    const updatedSlug = await prisma.$transaction(async (tx) => {
        const group = await tx.group.findUnique({ where: { id: groupId } });
        if (!group || group.status === 'DELETED')
            throw new Error('Group not found.');
        const effectiveOwnerId = getEffectiveOwnerId(group);
        if (effectiveOwnerId !== callerUserId) {
            throw new Error('Only the current group owner can transfer ownership.');
        }
        if (newOwnerUserId === callerUserId) {
            throw new Error('You are already the owner of this group.');
        }
        const targetMembership = await tx.groupMember.findUnique({
            where: {
                groupId_userId: { groupId, userId: newOwnerUserId },
            },
        });
        if (!targetMembership || !targetMembership.isApproved) {
            throw new Error('The new owner must be an active approved member of this group.');
        }
        if (targetMembership.role !== 'ADMIN') {
            await tx.groupMember.update({
                where: { id: targetMembership.id },
                data: { role: 'ADMIN' },
            });
        }
        await tx.group.update({
            where: { id: groupId },
            data: {
                ownerId: newOwnerUserId,
                version: { increment: 1 },
            },
        });
        return group.slug;
    });
    return await getGroupBySlug(updatedSlug, callerUserId);
};
const updateGroupLifecycle = async (callerUserId, groupId, action) => {
    if (!['PAUSE', 'RESUME', 'ARCHIVE', 'DELETE'].includes(action)) {
        throw new Error('Invalid lifecycle action.');
    }
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group || group.status === 'DELETED')
        throw new Error('Group not found.');
    const effectiveOwnerId = getEffectiveOwnerId(group);
    const isOwner = effectiveOwnerId === callerUserId;
    const callerMembership = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: callerUserId } },
    });
    const isGroupAdmin = isOwner || Boolean(callerMembership?.isApproved && callerMembership.role === 'ADMIN');
    if (action === 'ARCHIVE' || action === 'DELETE') {
        if (!isOwner) {
            throw new Error('Only the group owner can archive or delete the group.');
        }
    }
    else if (!isGroupAdmin) {
        throw new Error('Only group admins can pause or resume the group.');
    }
    const nextStatus = action === 'PAUSE'
        ? 'PAUSED'
        : action === 'RESUME'
            ? 'ACTIVE'
            : action === 'ARCHIVE'
                ? 'ARCHIVED'
                : 'DELETED';
    const updated = await prisma.group.update({
        where: { id: groupId },
        data: {
            status: nextStatus,
            archivedAt: action === 'ARCHIVE' || action === 'DELETE' ? new Date() : null,
            version: { increment: 1 },
        },
        include: {
            owner: { select: { id: true, name: true, image: true } },
            createdBy: { select: { id: true, name: true, image: true } },
            _count: {
                select: {
                    members: { where: { isApproved: true } },
                    posts: { where: { status: 'PUBLISHED' } },
                },
            },
        },
    });
    return {
        ...updated,
        ownerId: getEffectiveOwnerId(updated),
        memberCount: updated._count.members,
        postCount: updated._count.posts,
        myMembership: callerMembership,
        canModerate: isGroupAdmin,
    };
};
export const GroupService = {
    createGroup,
    getGroups,
    getGroupBySlug,
    joinGroup,
    leaveGroup,
    handleJoinRequest,
    updateMemberRole,
    removeMember,
    addMember,
    inviteMember,
    respondToInvitation,
    getOrCreateInviteLink,
    regenerateInviteLink,
    revokeInviteLink,
    getGroupInvitePreview,
    acceptGroupInviteLink,
    getGroupJoinRequests,
    getGroupPendingInvitations,
    cancelGroupInvitation,
    updateGroupCover,
    updateGroupSettings,
    transferGroupOwnership,
    updateGroupLifecycle,
};
export default GroupService;
