import { NotFoundException } from '@nestjs/common';
import { ClassOfferingStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CoursesService, slugify } from './courses.service';

describe('CoursesService', () => {
  const prisma = {
    course: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const service = new CoursesService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes a title into a URL-safe lowercase slug', () => {
    expect(slugify('  Tiếng Anh Giao Tiếp — Cơ Bản!  ')).toBe(
      'tieng-anh-giao-tiep-co-ban',
    );
  });

  it('adds a deterministic suffix when a slug collides', async () => {
    prisma.course.findUnique
      .mockResolvedValueOnce({ id: 'existing-id' })
      .mockResolvedValueOnce(null);
    prisma.course.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'course-id', ...data }),
    );

    const result = await service.create(
      {
        title: 'English Basics',
        level: 'Beginner',
        description: 'Description',
      },
      'admin-id',
    );

    expect(result.slug).toBe('english-basics-2');
    expect(prisma.course.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          slug: 'english-basics-2',
          createdById: 'admin-id',
        }),
      }),
    );
  });

  it('does not change the slug when editing a title', async () => {
    prisma.course.findUnique.mockResolvedValue({ id: 'course-id' });
    prisma.course.update.mockResolvedValue({
      id: 'course-id',
      title: 'Updated title',
      slug: 'original-slug',
    });

    await service.update('course-id', { title: 'Updated title' });

    expect(prisma.course.update).toHaveBeenCalledWith({
      where: { id: 'course-id' },
      data: { title: 'Updated title' },
    });
  });

  it('lists only published courses with search and level filters', async () => {
    prisma.course.findMany.mockReturnValue(Promise.resolve([]));
    prisma.course.count.mockReturnValue(Promise.resolve(0));
    prisma.$transaction.mockResolvedValue([[], 0]);

    const result = await service.listPublic({
      search: 'English',
      level: 'Beginner',
      page: 2,
      limit: 12,
    });

    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isPublished: true,
          title: { contains: 'English', mode: 'insensitive' },
          level: 'Beginner',
        },
        skip: 12,
        take: 12,
        select: expect.objectContaining({
          classOfferings: expect.objectContaining({
            where: { status: ClassOfferingStatus.OPEN },
          }),
        }),
      }),
    );
    expect(result.meta).toEqual({
      total: 0,
      page: 2,
      limit: 12,
      totalPages: 0,
    });
  });

  it('returns 404 when public detail is unpublished or missing', async () => {
    prisma.course.findFirst.mockResolvedValue(null);

    await expect(service.getPublicBySlug('hidden-course')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.course.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: 'hidden-course', isPublished: true },
      }),
    );
  });
});
