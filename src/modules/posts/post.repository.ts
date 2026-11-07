import prisma from '../../lib/prisma.js';

export const postRepository = {
  findById: async (id: string) => {
    return prisma.post.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
            role: true,
          },
        },
        group: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        originalPost: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                image: true,
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
      },
    });
  },

  findMany: async ({
    where,
    skip = 0,
    take = 10,
    orderBy = { createdAt: 'desc' },
  }: {
    where: any;
    skip?: number;
    take?: number;
    orderBy?: any;
  }) => {
    return prisma.post.findMany({
      where,
      skip,
      take,
      orderBy,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
            role: true,
          },
        },
        group: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        originalPost: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                image: true,
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
      },
    });
  },

  count: async (where: any) => {
    return prisma.post.count({ where });
  },

  delete: async (id: string) => {
    return prisma.post.delete({ where: { id } });
  },
};

export default postRepository;

