import prisma from '../../lib/prisma.js';
import slugify from 'slugify';

interface CreateGroupInput {
  name: string;
  description?: string;
  coverImage?: string;
  avatar?: string;
  privacy?: 'PUBLIC' | 'PRIVATE';
  requiresPostApproval?: boolean;
  invitedUserIds?: string[];
}

const createGroup = async (userId: string, data: CreateGroupInput) => {
  const {
    name,
    description,
    coverImage,
    avatar,
    privacy = 'PUBLIC',
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
      requiresPostApproval: Boolean(requiresPostApproval),
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
  const where: any = {};

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (myGroups && currentUserId) {
    where.OR = [
      { createdById: currentUserId },
      {
        members: {
          some: {
            userId: currentUserId,
            isApproved: true,
          },
        },
      },
    ];
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
    memberCount: g._count.members,
    postCount: g._count.posts,
    myMembership: currentUserId && g.members && g.members[0] ? g.members[0] : null,
    members: undefined,
  }));
};

const getGroupBySlug = async (slug: string, currentUserId?: string, currentUserRole?: string) => {
  const group = await prisma.group.findUnique({
    where: { slug },
    include: {
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

  if (!group) throw new Error('Group not found.');

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

  const isGroupStaff =
    myMembership && ['ADMIN', 'MODERATOR'].includes(myMembership.role) && myMembership.isApproved;
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
  if (!group) throw new Error('Group not found.');

  if (group.createdById === userId) {
    throw new Error('Group creator cannot leave. Please delete the group or transfer ownership.');
  }

  await prisma.groupMember.deleteMany({
    where: { groupId: group.id, userId },
  });

  return { groupId: group.id };
};

const handleJoinRequest = async (
  callerUserId: string,
  callerRole: string,
  groupId: string,
  memberId: string,
  action: 'APPROVE' | 'REJECT'
) => {
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
  } else {
    return await prisma.groupMember.delete({
      where: { id: memberId },
    });
  }
};

const updateMemberRole = async (
  callerUserId: string,
  callerRole: string,
  groupId: string,
  memberId: string,
  newRole: 'ADMIN' | 'MODERATOR' | 'MEMBER'
) => {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw new Error('Group not found.');

  const callerMembership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: callerUserId } },
  });

  const isGroupAdmin = group.createdById === callerUserId || callerMembership?.role === 'ADMIN';
  const isPlatformAdmin = callerRole === 'ADMIN';

  if (!isGroupAdmin && !isPlatformAdmin) {
    throw new Error('Only a Group Admin can change member roles.');
  }

  const targetMember = await prisma.groupMember.findUnique({ where: { id: memberId } });
  if (!targetMember) throw new Error('Member not found.');

  if (targetMember.userId === group.createdById && newRole !== 'ADMIN') {
    throw new Error('Cannot demote the group creator.');
  }

  return await prisma.groupMember.update({
    where: { id: memberId },
    data: { role: newRole as any },
    include: { user: { select: { id: true, name: true, image: true, email: true } } },
  });
};

const removeMember = async (
  callerUserId: string,
  callerRole: string,
  groupId: string,
  memberId: string
) => {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw new Error('Group not found.');

  const callerMembership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: callerUserId } },
  });

  const isGroupAdmin = group.createdById === callerUserId || callerMembership?.role === 'ADMIN';
  const isGroupMod = callerMembership?.role === 'MODERATOR';
  const isPlatformAdmin = callerRole === 'ADMIN';

  if (!isGroupAdmin && !isGroupMod && !isPlatformAdmin) {
    throw new Error('Only group admins and moderators can remove members.');
  }

  const targetMember = await prisma.groupMember.findUnique({ where: { id: memberId } });
  if (!targetMember) throw new Error('Member not found.');

  if (targetMember.userId === group.createdById) {
    throw new Error('Cannot remove the group creator.');
  }

  if (isGroupMod && !isGroupAdmin && targetMember.role !== 'MEMBER') {
    throw new Error('Moderators can only remove regular members.');
  }

  await prisma.groupMember.delete({ where: { id: memberId } });
  return true;
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
  callerRole: string,
  groupId: string,
  settings: any
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
    throw new Error('Only group admins and moderators can modify group settings.');
  }

  return await prisma.group.update({
    where: { id: groupId },
    data: {
      name: settings.name !== undefined ? settings.name.trim() : undefined,
      description: settings.description !== undefined ? settings.description : undefined,
      coverImage: settings.coverImage !== undefined ? settings.coverImage : undefined,
      avatar: settings.avatar !== undefined ? settings.avatar : undefined,
      privacy: settings.privacy !== undefined ? settings.privacy : undefined,
      requiresPostApproval:
        settings.requiresPostApproval !== undefined ? Boolean(settings.requiresPostApproval) : undefined,
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
  removeMember,
  addMember,
  updateGroupCover,
  updateGroupSettings,
};

export default GroupService;

