import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ClassOfferingStatus, CourseSkillScope, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CatalogQueryDto } from './dto/catalog-query.dto';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

const MAX_SLUG_CREATE_ATTEMPTS = 10;

const publicOfferingSelect = {
  id: true,
  code: true,
  name: true,
  status: true,
  modality: true,
  pricingType: true,
  tuitionFeeVnd: true,
  maxStudents: true,
  totalSessions: true,
  totalPeriods: true,
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
  scheduleSlots: {
    orderBy: [{ dayOfWeek: 'asc' as const }, { startTime: 'asc' as const }],
    select: {
      id: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      locationText: true,
      meetingUrl: true,
    },
  },
  _count: {
    select: {
      enrollments: { where: { status: 'ACTIVE' as const } },
    },
  },
} satisfies Prisma.ClassOfferingSelect;

const publicCourseSelect = {
  id: true,
  title: true,
  slug: true,
  description: true,
  level: true,
  skillScope: true,
  thumbnailUrl: true,
  isPublished: true,
  classOfferings: {
    where: { status: ClassOfferingStatus.OPEN },
    orderBy: { createdAt: 'asc' as const },
    select: publicOfferingSelect,
  },
} satisfies Prisma.CourseSelect;

const publicCourseDetailSelect = {
  ...publicCourseSelect,
  modules: {
    orderBy: { orderIndex: 'asc' as const },
    select: {
      id: true,
      title: true,
      description: true,
      orderIndex: true,
      lessons: {
        orderBy: { orderIndex: 'asc' as const },
        select: {
          id: true,
          title: true,
          description: true,
          orderIndex: true,
          focusSkills: true,
          _count: { select: { resources: true } },
        },
      },
    },
  },
} satisfies Prisma.CourseSelect;

type PublicOfferingRow = Prisma.ClassOfferingGetPayload<{
  select: typeof publicOfferingSelect;
}>;
type PublicCourseRow = Prisma.CourseGetPayload<{ select: typeof publicCourseSelect }>;
type PublicCourseDetailRow = Prisma.CourseGetPayload<{
  select: typeof publicCourseDetailSelect;
}>;

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic(query: CatalogQueryDto) {
    const where: Prisma.CourseWhereInput = {
      isPublished: true,
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
      ...(query.level ? { level: query.level } : {}),
      ...(query.skillScope ? { skillScope: query.skillScope } : {}),
      ...(query.availability
        ? { classOfferings: { some: { status: ClassOfferingStatus.OPEN } } }
        : {}),
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
      data: data.map((course) => this.mapPublicCourse(course)),
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
      select: publicCourseDetailSelect,
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    return this.mapPublicCourseDetail(course);
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
    const baseSlug = slugify(input.title) || 'course';

    for (let attempt = 1; attempt <= MAX_SLUG_CREATE_ATTEMPTS; attempt += 1) {
      const slug = attempt === 1 ? baseSlug : `${baseSlug}-${attempt}`;

      try {
        return await this.prisma.course.create({
          data: {
            title: input.title,
            slug,
            description: input.description ?? '',
            level: input.level,
            skillScope: input.skillScope ?? CourseSkillScope.LR,
            thumbnailUrl: input.thumbnailUrl,
            isPublished: input.isPublished ?? false,
            createdById,
          },
        });
      } catch (error: unknown) {
        if (!this.isCourseSlugCollision(error)) {
          throw error;
        }

        if (attempt === MAX_SLUG_CREATE_ATTEMPTS) {
          throw new ConflictException(
            'Could not create a unique course slug; please use a different title',
          );
        }
      }
    }

    throw new ConflictException(
      'Could not create a unique course slug; please use a different title',
    );
  }

  async update(id: string, input: UpdateCourseDto) {
    await this.requireCourse(id);
    return this.prisma.course.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.level !== undefined ? { level: input.level } : {}),
        ...(input.skillScope !== undefined ? { skillScope: input.skillScope } : {}),
        ...(input.thumbnailUrl !== undefined ? { thumbnailUrl: input.thumbnailUrl } : {}),
        ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
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

  private isCourseSlugCollision(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      return false;
    }

    const metadata = error.meta as Record<string, unknown> | undefined;
    if (metadata?.modelName && metadata.modelName !== 'Course') {
      return false;
    }

    try {
      return JSON.stringify(metadata).toLowerCase().includes('slug');
    } catch {
      return false;
    }
  }

  private mapPublicCourse(course: PublicCourseRow) {
    return {
      ...course,
      classOfferings: course.classOfferings.map(mapPublicOffering),
      openOfferingCount: course.classOfferings.length,
    };
  }

  private mapPublicCourseDetail(course: PublicCourseDetailRow) {
    return {
      ...course,
      classOfferings: course.classOfferings.map(mapPublicOffering),
      openOfferingCount: course.classOfferings.length,
      modules: course.modules.map((module) => ({
        ...module,
        lessons: module.lessons.map((lesson) => ({
          ...lesson,
          resourceCount: lesson._count.resources,
          _count: undefined,
        })),
      })),
    };
  }
}

function mapPublicOffering(offering: PublicOfferingRow) {
  const registeredCount = offering._count.enrollments;
  const remainingSeats =
    offering.maxStudents === null ? null : Math.max(0, offering.maxStudents - registeredCount);
  const isFull = remainingSeats === 0;

  return {
    ...offering,
    registeredCount,
    remainingSeats,
    isFull,
    registrationState: isFull ? ('FULL' as const) : ('AVAILABLE' as const),
    _count: undefined,
  };
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
