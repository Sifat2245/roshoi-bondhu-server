import prisma from '../../lib/prisma.js';

export const groupRepository = {
  findById: async (id: string) => {
    return prisma.group.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: { id: true, name: true, image: true },
        },
        _count: {
          select: { members: true, posts: true },
        },
      },
    });
  },

  findBySlug: async (slug: string) => {
    return prisma.group.findUnique({
      where: { slug },
      include: {
        createdBy: {
          select: { id: true, name: true, image: true },
        },
        _count: {
          select: { members: true, posts: true },
        },
      },
    });
  },

  findMany: async ({
    where,
    take = 20,
    orderBy = { createdAt: 'desc' },
  }: {
    where?: any;
    take?: number;
    orderBy?: any;
  }) => {
    return prisma.group.findMany({
      where,
      take,
      orderBy,
      include: {
        createdBy: {
          select: { id: true, name: true, image: true },
        },
        _count: {
          select: { members: true, posts: true },
        },
      },
    });
  },

  findMember: async (groupId: string, userId: string) => {
    return prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId },
      },
    });
  },
};

export default groupRepository;

