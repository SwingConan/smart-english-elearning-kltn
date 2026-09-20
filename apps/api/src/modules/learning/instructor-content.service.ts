import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateModuleDto } from './dto/create-module.dto';
import { UpdateModuleDto } from './dto/update-module.dto';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { ReorderDto } from './dto/reorder.dto';

@Injectable()
export class InstructorContentService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertInstructorOwnsCourse(
    instructorId: string,
    courseId: string,
  ): Promise<void> {
    const assignment = await this.prisma.classOffering.findFirst({
      where: { courseId, instructorId },
      select: { id: true },
    });
    if (!assignment) {
      throw new ForbiddenException(
        'You are not assigned to any class offering of this course',
      );
    }
  }

  async listTeaching(instructorId: string) {
    const offerings = await this.prisma.classOffering.findMany({
      where: { instructorId },
      select: {
        id: true,
        name: true,
        status: true,
        course: {
          select: {
            id: true,
            title: true,
            slug: true,
            level: true,
            isPublished: true,
            _count: { select: { modules: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const courseMap = new Map<string, { course: any; classOfferings: any[] }>();
    for (const offering of offerings) {
      const courseId = offering.course.id;
      if (!courseMap.has(courseId)) {
        courseMap.set(courseId, {
          course: offering.course,
          classOfferings: [],
        });
      }
      courseMap.get(courseId)!.classOfferings.push({
        id: offering.id,
        name: offering.name,
        status: offering.status,
      });
    }

    return Array.from(courseMap.values());
  }

  // --- MODULES ---

  async listModules(instructorId: string, courseId: string) {
    await this.assertInstructorOwnsCourse(instructorId, courseId);
    return this.prisma.module.findMany({
      where: { courseId },
      orderBy: { orderIndex: 'asc' },
    });
  }

  async createModule(
    instructorId: string,
    courseId: string,
    dto: CreateModuleDto,
  ) {
    await this.assertInstructorOwnsCourse(instructorId, courseId);
    const lastModule = await this.prisma.module.findFirst({
      where: { courseId },
      orderBy: { orderIndex: 'desc' },
      select: { orderIndex: true },
    });
    const orderIndex = lastModule ? lastModule.orderIndex + 1 : 0;

    return this.prisma.module.create({
      data: {
        ...dto,
        courseId,
        orderIndex,
      },
    });
  }

  async updateModule(
    instructorId: string,
    moduleId: string,
    dto: UpdateModuleDto,
  ) {
    const module = await this.prisma.module.findUnique({
      where: { id: moduleId },
      select: { courseId: true },
    });
    if (!module) throw new NotFoundException('Module not found');

    await this.assertInstructorOwnsCourse(instructorId, module.courseId);

    return this.prisma.module.update({
      where: { id: moduleId },
      data: dto,
    });
  }

  async deleteModule(instructorId: string, moduleId: string): Promise<{ message: string }> {
    const module = await this.prisma.module.findUnique({
      where: { id: moduleId },
      select: { id: true, courseId: true, orderIndex: true },
    });
    if (!module) {
      throw new NotFoundException('Module not found');
    }

    await this.assertInstructorOwnsCourse(instructorId, module.courseId);

    // Check for learner progress on any lesson in this module
    const progressCount = await this.prisma.lessonProgress.count({
      where: {
        lesson: { moduleId },
      },
    });
    if (progressCount > 0) {
      throw new ConflictException(
        'Cannot delete module with existing learner progress. Remove progress records first or contact administrator.',
      );
    }

    // Cascade delete: resources → lessons → module, then reindex
    await this.prisma.$transaction([
      this.prisma.learningResource.deleteMany({
        where: { lesson: { moduleId } },
      }),
      this.prisma.lesson.deleteMany({ where: { moduleId } }),
      this.prisma.module.delete({ where: { id: moduleId } }),
    ]);

    // Reindex remaining modules
    const remaining = await this.prisma.module.findMany({
      where: { courseId: module.courseId },
      orderBy: { orderIndex: 'asc' },
      select: { id: true },
    });

    if (remaining.length > 0) {
      await this.prisma.$transaction([
        ...remaining.map((m, index) =>
          this.prisma.module.update({
            where: { id: m.id },
            data: { orderIndex: -(index + 1) },
          }),
        ),
        ...remaining.map((m, index) =>
          this.prisma.module.update({
            where: { id: m.id },
            data: { orderIndex: index },
          }),
        ),
      ]);
    }

    return { message: 'Module deleted successfully' };
  }

  async reorderModules(
    instructorId: string,
    courseId: string,
    dto: ReorderDto,
  ): Promise<void> {
    await this.assertInstructorOwnsCourse(instructorId, courseId);

    const existing = await this.prisma.module.findMany({
      where: { courseId },
      select: { id: true },
    });

    const existingIds = new Set(existing.map((m) => m.id));
    const orderedIds = dto.orderedIds;

    if (
      orderedIds.length !== existingIds.size ||
      !orderedIds.every((id) => existingIds.has(id))
    ) {
      throw new BadRequestException(
        'orderedIds must contain exactly all module IDs of this course',
      );
    }

    if (new Set(orderedIds).size !== orderedIds.length) {
      throw new BadRequestException('orderedIds must not contain duplicates');
    }

    await this.prisma.$transaction([
      ...orderedIds.map((id, index) =>
        this.prisma.module.update({
          where: { id },
          data: { orderIndex: -(index + 1) },
        }),
      ),
      ...orderedIds.map((id, index) =>
        this.prisma.module.update({
          where: { id },
          data: { orderIndex: index },
        }),
      ),
    ]);
  }

  // --- LESSONS ---

  async listLessons(instructorId: string, moduleId: string) {
    const module = await this.prisma.module.findUnique({
      where: { id: moduleId },
      select: { courseId: true },
    });
    if (!module) throw new NotFoundException('Module not found');
    await this.assertInstructorOwnsCourse(instructorId, module.courseId);

    return this.prisma.lesson.findMany({
      where: { moduleId },
      orderBy: { orderIndex: 'asc' },
    });
  }

  async createLesson(
    instructorId: string,
    moduleId: string,
    dto: CreateLessonDto,
  ) {
    const module = await this.prisma.module.findUnique({
      where: { id: moduleId },
      select: { courseId: true },
    });
    if (!module) throw new NotFoundException('Module not found');
    await this.assertInstructorOwnsCourse(instructorId, module.courseId);

    const lastLesson = await this.prisma.lesson.findFirst({
      where: { moduleId },
      orderBy: { orderIndex: 'desc' },
      select: { orderIndex: true },
    });
    const orderIndex = lastLesson ? lastLesson.orderIndex + 1 : 0;

    return this.prisma.lesson.create({
      data: {
        ...dto,
        moduleId,
        orderIndex,
      },
    });
  }

  async updateLesson(
    instructorId: string,
    lessonId: string,
    dto: UpdateLessonDto,
  ) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { module: { select: { courseId: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertInstructorOwnsCourse(instructorId, lesson.module.courseId);

    return this.prisma.lesson.update({
      where: { id: lessonId },
      data: dto,
    });
  }

  async deleteLesson(instructorId: string, lessonId: string): Promise<{ message: string }> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, moduleId: true, module: { select: { courseId: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertInstructorOwnsCourse(instructorId, lesson.module.courseId);

    const progressCount = await this.prisma.lessonProgress.count({
      where: { lessonId },
    });
    if (progressCount > 0) {
      throw new ConflictException(
        'Cannot delete lesson with existing learner progress. Remove progress records first or contact administrator.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.learningResource.deleteMany({ where: { lessonId } }),
      this.prisma.lesson.delete({ where: { id: lessonId } }),
    ]);

    const remaining = await this.prisma.lesson.findMany({
      where: { moduleId: lesson.moduleId },
      orderBy: { orderIndex: 'asc' },
      select: { id: true },
    });

    if (remaining.length > 0) {
      await this.prisma.$transaction([
        ...remaining.map((l, index) =>
          this.prisma.lesson.update({
            where: { id: l.id },
            data: { orderIndex: -(index + 1) },
          }),
        ),
        ...remaining.map((l, index) =>
          this.prisma.lesson.update({
            where: { id: l.id },
            data: { orderIndex: index },
          }),
        ),
      ]);
    }

    return { message: 'Lesson deleted successfully' };
  }

  async reorderLessons(
    instructorId: string,
    moduleId: string,
    dto: ReorderDto,
  ): Promise<void> {
    const module = await this.prisma.module.findUnique({
      where: { id: moduleId },
      select: { courseId: true },
    });
    if (!module) throw new NotFoundException('Module not found');
    await this.assertInstructorOwnsCourse(instructorId, module.courseId);

    const existing = await this.prisma.lesson.findMany({
      where: { moduleId },
      select: { id: true },
    });

    const existingIds = new Set(existing.map((l) => l.id));
    const orderedIds = dto.orderedIds;

    if (
      orderedIds.length !== existingIds.size ||
      !orderedIds.every((id) => existingIds.has(id))
    ) {
      throw new BadRequestException(
        'orderedIds must contain exactly all lesson IDs of this module',
      );
    }

    if (new Set(orderedIds).size !== orderedIds.length) {
      throw new BadRequestException('orderedIds must not contain duplicates');
    }

    await this.prisma.$transaction([
      ...orderedIds.map((id, index) =>
        this.prisma.lesson.update({
          where: { id },
          data: { orderIndex: -(index + 1) },
        }),
      ),
      ...orderedIds.map((id, index) =>
        this.prisma.lesson.update({
          where: { id },
          data: { orderIndex: index },
        }),
      ),
    ]);
  }

  // --- RESOURCES ---

  async listResources(instructorId: string, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { module: { select: { courseId: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertInstructorOwnsCourse(instructorId, lesson.module.courseId);

    return this.prisma.learningResource.findMany({
      where: { lessonId },
      orderBy: { orderIndex: 'asc' },
    });
  }

  async createResource(
    instructorId: string,
    lessonId: string,
    dto: CreateResourceDto,
  ) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { module: { select: { courseId: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertInstructorOwnsCourse(instructorId, lesson.module.courseId);

    const lastResource = await this.prisma.learningResource.findFirst({
      where: { lessonId },
      orderBy: { orderIndex: 'desc' },
      select: { orderIndex: true },
    });
    const orderIndex = lastResource ? lastResource.orderIndex + 1 : 0;

    return this.prisma.learningResource.create({
      data: {
        ...dto,
        lessonId,
        orderIndex,
      },
    });
  }

  async updateResource(
    instructorId: string,
    resourceId: string,
    dto: UpdateResourceDto,
  ) {
    const resource = await this.prisma.learningResource.findUnique({
      where: { id: resourceId },
      select: { lesson: { select: { module: { select: { courseId: true } } } } },
    });
    if (!resource) throw new NotFoundException('Resource not found');
    await this.assertInstructorOwnsCourse(
      instructorId,
      resource.lesson.module.courseId,
    );

    return this.prisma.learningResource.update({
      where: { id: resourceId },
      data: dto,
    });
  }

  async deleteResource(
    instructorId: string,
    resourceId: string,
  ): Promise<{ message: string }> {
    const resource = await this.prisma.learningResource.findUnique({
      where: { id: resourceId },
      select: { id: true, lessonId: true, lesson: { select: { module: { select: { courseId: true } } } } },
    });
    if (!resource) throw new NotFoundException('Resource not found');
    await this.assertInstructorOwnsCourse(
      instructorId,
      resource.lesson.module.courseId,
    );

    await this.prisma.learningResource.delete({ where: { id: resourceId } });

    const remaining = await this.prisma.learningResource.findMany({
      where: { lessonId: resource.lessonId },
      orderBy: { orderIndex: 'asc' },
      select: { id: true },
    });

    if (remaining.length > 0) {
      await this.prisma.$transaction([
        ...remaining.map((r, index) =>
          this.prisma.learningResource.update({
            where: { id: r.id },
            data: { orderIndex: -(index + 1) },
          }),
        ),
        ...remaining.map((r, index) =>
          this.prisma.learningResource.update({
            where: { id: r.id },
            data: { orderIndex: index },
          }),
        ),
      ]);
    }

    return { message: 'Resource deleted successfully' };
  }

  async reorderResources(
    instructorId: string,
    lessonId: string,
    dto: ReorderDto,
  ): Promise<void> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { module: { select: { courseId: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertInstructorOwnsCourse(instructorId, lesson.module.courseId);

    const existing = await this.prisma.learningResource.findMany({
      where: { lessonId },
      select: { id: true },
    });

    const existingIds = new Set(existing.map((r) => r.id));
    const orderedIds = dto.orderedIds;

    if (
      orderedIds.length !== existingIds.size ||
      !orderedIds.every((id) => existingIds.has(id))
    ) {
      throw new BadRequestException(
        'orderedIds must contain exactly all resource IDs of this lesson',
      );
    }

    if (new Set(orderedIds).size !== orderedIds.length) {
      throw new BadRequestException('orderedIds must not contain duplicates');
    }

    await this.prisma.$transaction([
      ...orderedIds.map((id, index) =>
        this.prisma.learningResource.update({
          where: { id },
          data: { orderIndex: -(index + 1) },
        }),
      ),
      ...orderedIds.map((id, index) =>
        this.prisma.learningResource.update({
          where: { id },
          data: { orderIndex: index },
        }),
      ),
    ]);
  }
}
