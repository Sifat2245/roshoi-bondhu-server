import prisma from '../../lib/prisma.js';
import slugify from 'slugify';

interface CreateGroupInput {
  name: string;
  description?: string;
  coverImage?: string;
  avatar?: string;
  privacy?: 'PUBLIC' | 'PRIVATE';
  discoverability?: 'VISIBLE' | 'HIDDEN';
  requiresPostApproval?: boolean;
  invitedUserIds?: string[];
}

interface UpdateGroupSettingsInput {
  name?: string;
  description?: string | null;
  coverImage?: string | null;
  avatar?: string | null;
  privacy?: 'PUBLIC' | 'PRIVATE';
  discoverability?: 'VISIBLE' | 'HIDDEN';
  requiresPostApproval?: boolean;
  challengeCreatorPolicy?: 'STAFF' | 'MEMBERS';
}

const getEffectiveOwnerId = (group: { ownerId?: string | null; createdById?: string | null }) =>
  group.ownerId || group.createdById || null;

const createGroup = async (userId: string, data: CreateGroupInput) => {
  const {
    name,
    description,
    coverImage,
    avatar,
    privacy = 'PUBLIC',
    discoverability = 'VISIBLE',
    requiresPostApproval = false,
    invitedUserIds = [],
  } = data;

  if (!name || !name.trim()) throw new Error('Group name is required.');

  const baseSlug = (slugify as any).default ? (slugify as any).default(name, { lower: true, strict: true }) : (slugify as any)(name, { lower: true, strict: true }) || 'group';
  let slug = baseSlug;
  let counter = 1;

  while (await prisma.group.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  const candidateIds = Array.from(new Set(invitedUserIds.filter((id) => id && id !== userId)));
  let validInvitedIds: string[] = [];
  if (candidateIds.length > 0) {
    const existingUsers = await prisma.user.findMany({
      where: { id: { in: candidateIds }, isBanned: false },
      select: { id: true },
    });
    validInvitedIds = existingUsers.map((u) => u.id);
  }

  return await prisma.group.create({
    data: {
      name: name.trim(),
      slug,
      description,
      coverImage,
      avatar,
      privacy,
      discoverability,
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
          ...validInvitedIds.map((invitedId) => ({
            userId: invitedId,
            role: 'MEMBER' as const,
            isApproved: true,
          })),
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
};

const getGroups = async (search?: string, myGroups?: boolean, currentUserId?: string) => {
  const andConditions: any[] = [
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
  } else {
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

  return groups.map((g: any) => ({
    ...g,
    ownerId: getEffectiveOwnerId(g),
    memberCount: g._count.members,
    postCount: g._count.posts,
    myMembership: currentUserId && g.members && g.members[0] ? g.members[0] : null,
    members: undefined,
  }));
};

const getGroupBySlug = async (slug: string, currentUserId?: string, _currentUserRole?: string) => {
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

  if (!group || group.status === 'DELETED') throw new Error('Group not found.');

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

  const effectiveOwnerId = getEffectiveOwnerId(group);
  const isOwner = Boolean(currentUserId && effectiveOwnerId === currentUserId);
  const isGroupStaff = Boolean(
    isOwner ||
      (myMembership &&
        ['ADMIN', 'MODERATOR'].includes(myMembership.role) &&
        myMembership.isApproved)
  );

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

  return {
    ...group,
    ownerId: effectiveOwnerId,
    owner: group.owner || group.createdBy || null,
    members: canViewMembers ? group.members : [],
    memberCount: group._count.members,
    postCount: group._count.posts,
    myMembership,
    canModerate: isGroupStaff,
    pendingRequestsCount,
    pendingPostsCount,
  };
};

const joinGroup = async (userId: string, groupIdOrSlug: string) => {
  const group = await prisma.group.findFirst({
    where: {
      OR: [{ id: groupIdOrSlug }, { slug: groupIdOrSlug }],
    },
  });
  if (!group) throw new Error('Group not found.');

  const existingMember = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: { groupId: group.id, userId },
    },
  });

  if (existingMember) {
    if (existingMember.isApproved) {
      throw new Error('You are already an active member of this group.');
    } else {
      throw new Error('Your membership request is currently pending approval.');
    }
  }

  const isApproved = group.privacy === 'PUBLIC';

  const membership = await prisma.groupMember.create({
    data: {
      groupId: group.id,
      userId,
      role: 'MEMBER',
      isApproved,
    },
  });

  return { isApproved, membership };
};

const leaveGroup = async (userId: string, groupIdOrSlug: string) => {
  const group = await prisma.group.findFirst({
    where: {
      OR: [{ id: groupIdOrSlug }, { slug: groupIdOrSlug }],
    },
  });
  if (!group || group.status === 'DELETED') throw new Error('Group not found.');

  if (getEffectiveOwnerId(group) === userId) {
    throw new Error('Group owner cannot leave. Please transfer ownership or archive the group first.');
  }

  await prisma.groupMember.deleteMany({
    where: { groupId: group.id, userId },
  });

  return { groupId: group.id };
};

const handleJoinRequest = async (
  callerUserId: string,
  _callerRole: string,
  groupId: string,
  memberId: string,
  action: 'APPROVE' | 'REJECT'
) => {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group || group.status === 'DELETED') throw new Error('Group not found.');

  const callerMembership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: callerUserId } },
  });

  const isOwner = getEffectiveOwnerId(group) === callerUserId;
  const isGroupStaff =
    isOwner ||
    Boolean(
      callerMembership?.isApproved &&
        ['ADMIN', 'MODERATOR'].includes(callerMembership.role)
    );

  if (!isGroupStaff) {
    throw new Error('Only group admins and moderators can process join requests.');
  }

  const targetMember = await prisma.groupMember.findUnique({ where: { id: memberId } });
  if (!targetMember || targetMember.groupId !== groupId) {
    throw new Error('Membership request not found in this group.');
  }

  if (action === 'APPROVE') {
    return await prisma.groupMember.update({
      where: { id: memberId },
      data: { isApproved: true, role: 'MEMBER' },
    });
  } else {
    return await prisma.groupMember.delete({
      where: { id: memberId },
    });
  }
};

const updateMemberRole = async (
  callerUserId: string,
  _callerRole: string,
  groupId: string,
  memberId: string,
  newRole: 'ADMIN' | 'MODERATOR' | 'MEMBER'
) => {
  if (!['ADMIN', 'MODERATOR', 'MEMBER'].includes(newRole)) {
    throw new Error('Invalid group role.');
  }

  return await prisma.$transaction(async (tx) => {
    const group = await tx.group.findUnique({ where: { id: groupId } });
    if (!group || group.status === 'DELETED') throw new Error('Group not found.');

    const effectiveOwnerId = getEffectiveOwnerId(group);
    const isOwner = effectiveOwnerId === callerUserId;

    const callerMembership = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: callerUserId } },
    });

    const isGroupAdmin =
      isOwner || Boolean(callerMembership?.isApproved && callerMembership.role === 'ADMIN');

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
      data: { role: newRole as any },
      include: { user: { select: { id: true, name: true, image: true, email: true } } },
    });
  });
};

const removeMember = async (
  callerUserId: string,
  _callerRole: string,
  groupId: string,
  memberId: string
) => {
  return await prisma.$transaction(async (tx) => {
    const group = await tx.group.findUnique({ where: { id: groupId } });
    if (!group || group.status === 'DELETED') throw new Error('Group not found.');

    const effectiveOwnerId = getEffectiveOwnerId(group);
    const isOwner = effectiveOwnerId === callerUserId;

    const callerMembership = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: callerUserId } },
    });

    const isGroupAdmin =
      isOwner || Boolean(callerMembership?.isApproved && callerMembership.role === 'ADMIN');
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

const addMember = async (
  callerUserId: string,
  callerRole: string,
  groupId: string,
  userId: string,
  role: 'ADMIN' | 'MODERATOR' | 'MEMBER' = 'MEMBER'
) => {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw new Error('Group not found.');

  const callerMembership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: callerUserId } },
  });

  const isMember = group.createdById === callerUserId || Boolean(callerMembership?.isApproved);
  const isPlatformAdmin = callerRole === 'ADMIN';

  if (!isMember && !isPlatformAdmin) {
    throw new Error('You must be a member to invite or add people to this group.');
  }

  const targetUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!targetUser) throw new Error('User not found.');

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
      role: (role as any) || 'MEMBER',
      isApproved: true,
    },
    include: {
      user: { select: { id: true, name: true, image: true, email: true } },
    },
  });
};

const updateGroupCover = async (
  callerUserId: string,
  callerRole: string,
  groupId: string,
  coverImage: string
) => {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw new Error('Group not found.');

  const callerMembership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: callerUserId } },
  });

  const isStaff =
    group.createdById === callerUserId ||
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

const updateGroupSettings = async (
  callerUserId: string,
  _callerRole: string,
  groupIdOrSlug: string,
  settings: UpdateGroupSettingsInput
) => {
  const group = await prisma.group.findFirst({
    where: {
      OR: [{ id: groupIdOrSlug }, { slug: groupIdOrSlug }],
    },
  });
  if (!group || group.status === 'DELETED') throw new Error('Group not found.');

  const callerMembership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: callerUserId } },
  });

  const isOwner = getEffectiveOwnerId(group) === callerUserId;
  const isGroupAdmin =
    isOwner || Boolean(callerMembership?.isApproved && callerMembership.role === 'ADMIN');

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

  if (
    settings.discoverability !== undefined &&
    !['VISIBLE', 'HIDDEN'].includes(settings.discoverability)
  ) {
    throw new Error('Invalid discoverability setting.');
  }

  if (
    settings.challengeCreatorPolicy !== undefined &&
    !['STAFF', 'MEMBERS'].includes(settings.challengeCreatorPolicy)
  ) {
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
      discoverability:
        settings.discoverability !== undefined ? settings.discoverability : undefined,
      requiresPostApproval:
        settings.requiresPostApproval !== undefined
          ? Boolean(settings.requiresPostApproval)
          : undefined,
      challengeCreatorPolicy:
        settings.challengeCreatorPolicy !== undefined
          ? settings.challengeCreatorPolicy
          : undefined,
      version: { increment: 1 },
    },
  });

  return await getGroupBySlug(group.slug, callerUserId);
};

const transferGroupOwnership = async (
  callerUserId: string,
  groupId: string,
  newOwnerUserId: string
) => {
  if (!newOwnerUserId) throw new Error('Target owner user ID is required.');

  const updatedSlug = await prisma.$transaction(async (tx) => {
    const group = await tx.group.findUnique({ where: { id: groupId } });
    if (!group || group.status === 'DELETED') throw new Error('Group not found.');

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

const updateGroupLifecycle = async (
  callerUserId: string,
  groupId: string,
  action: 'PAUSE' | 'RESUME' | 'ARCHIVE' | 'DELETE'
) => {
  if (!['PAUSE', 'RESUME', 'ARCHIVE', 'DELETE'].includes(action)) {
    throw new Error('Invalid lifecycle action.');
  }

  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group || group.status === 'DELETED') throw new Error('Group not found.');

  const effectiveOwnerId = getEffectiveOwnerId(group);
  const isOwner = effectiveOwnerId === callerUserId;

  const callerMembership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: callerUserId } },
  });
  const isGroupAdmin =
    isOwner || Boolean(callerMembership?.isApproved && callerMembership.role === 'ADMIN');

  if (action === 'ARCHIVE' || action === 'DELETE') {
    if (!isOwner) {
      throw new Error('Only the group owner can archive or delete the group.');
    }
  } else if (!isGroupAdmin) {
    throw new Error('Only group admins can pause or resume the group.');
  }

  const nextStatus =
    action === 'PAUSE'
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
  updateGroupCover,
  updateGroupSettings,
  transferGroupOwnership,
  updateGroupLifecycle,
};

export default GroupService;

