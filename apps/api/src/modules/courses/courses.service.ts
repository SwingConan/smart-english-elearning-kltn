import { Injectable, NotFoundException } from '@nestjs/common';
import { ClassOfferingStatus, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CatalogQueryDto } from './dto/catalog-query.dto';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

const publicOfferingSelect = {
  id: true,
  name: true,
  status: true,
  pricingType: true,
  tuitionFeeVnd: true,
  maxStudents: true,
  enrollmentStart: true,
  enrollmentEnd: true,
  classStart: true,
  classEnd: true,
  instructor: {
    select: {
      id: true,
      fullName: true,
    },
  },
} satisfies Prisma.ClassOfferingSelect;

const publicCourseSelect = {
  id: true,
  title: true,
  slug: true,
  description: true,
  level: true,
  thumbnailUrl: true,
  isPublished: true,
  classOfferings: {
    where: { status: ClassOfferingStatus.OPEN },
    orderBy: { createdAt: 'asc' as const },
    select: publicOfferingSelect,
  },
} satisfies Prisma.CourseSelect;

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic(query: CatalogQueryDto) {
    const where: Prisma.CourseWhereInput = {
      isPublished: true,
      ...(query.search
        ? { title: { contains: query.search, mode: 'insensitive' } }
        : {}),
      ...(query.level ? { level: query.level } : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        select: publicCourseSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.course.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      },
    };
  }

  async getPublicBySlug(slug: string) {
    const course = await this.prisma.course.findFirst({
      where: { slug, isPublished: true },
      select: publicCourseSelect,
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    return course;
  }

  listAdmin() {
    return this.prisma.course.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        _count: { select: { classOfferings: true } },
      },
    });
  }

  async create(input: CreateCourseDto, createdById: string) {
    const slug = await this.createAvailableSlug(input.title);
    return this.prisma.course.create({
      data: {
        title: input.title,
        slug,
        description: input.description ?? '',
        level: input.level,
        thumbnailUrl: input.thumbnailUrl,
        isPublished: input.isPublished ?? false,
        createdById,
      },
    });
  }

  async update(id: string, input: UpdateCourseDto) {
    await this.requireCourse(id);
    return this.prisma.course.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.level !== undefined ? { level: input.level } : {}),
        ...(input.thumbnailUrl !== undefined
          ? { thumbnailUrl: input.thumbnailUrl }
          : {}),
        ...(input.isPublished !== undefined
          ? { isPublished: input.isPublished }
          : {}),
      },
    });
  }

  private async requireCourse(id: string): Promise<void> {
    const course = await this.prisma.course.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
  }

  private async createAvailableSlug(title: string): Promise<string> {
    const base = slugify(title) || 'course';
    let candidate = base;
    let suffix = 2;

    while (
      await this.prisma.course.findUnique({
        where: { slug: candidate },
        select: { id: true },
      })
    ) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[đð]/g, 'd')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
