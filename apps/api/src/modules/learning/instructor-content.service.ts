import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ResourceType } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateModuleDto } from './dto/create-module.dto';
import { UpdateModuleDto } from './dto/update-module.dto';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { ReorderDto } from './dto/reorder.dto';
import { LearningResourceStorage } from './learning-resource.storage';

const MAX_CONTENT_TRANSACTION_ATTEMPTS = 3;

@Injectable()
export class InstructorContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resourceStorage: LearningResourceStorage,
  ) {}

  private async assertInstructorOwnsCourse(instructorId: string, courseId: string): Promise<void> {
    const assignment = await this.prisma.classOffering.findFirst({
      where: { courseId, instructorId },
      select: { id: true },
    });
    if (!assignment) {
      throw new ForbiddenException('You are not assigned to any class offering of this course');
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

    type TeachingOffering = (typeof offerings)[number];
    const courseMap = new Map<
      string,
      {
        course: TeachingOffering['course'];
        classOfferings: Array<Pick<TeachingOffering, 'id' | 'name' | 'status'>>;
      }
    >();
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

  async createModule(instructorId: string, courseId: string, dto: CreateModuleDto) {
    await this.assertInstructorOwnsCourse(instructorId, courseId);

    for (let attempt = 1; attempt <= MAX_CONTENT_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (transaction) => {
            const lastModule = await transaction.module.findFirst({
              where: { courseId },
              orderBy: { orderIndex: 'desc' },
              select: { orderIndex: true },
            });

            return transaction.module.create({
              data: {
                ...dto,
                courseId,
                orderIndex: lastModule ? lastModule.orderIndex + 1 : 0,
              },
            });
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );
      } catch (error: unknown) {
        const retryable =
          this.isPrismaError(error, 'P2034') ||
          this.isRelevantOrderConflict(error, 'Module', ['courseId', 'orderIndex']);
        if (!retryable) throw error;
        if (attempt === MAX_CONTENT_TRANSACTION_ATTEMPTS) {
          throw new ConflictException('Module order changed concurrently; please try again');
        }
      }
    }

    throw new ConflictException('Module could not be created');
  }

  async updateModule(instructorId: string, moduleId: string, dto: UpdateModuleDto) {
    const { expectedUpdatedAt, ...data } = dto;
    return this.prisma.$transaction(async (transaction) => {
      const module = await transaction.module.findUnique({
        where: { id: moduleId },
        select: { courseId: true, updatedAt: true },
      });
      if (!module) throw new NotFoundException('Module not found');
      await this.assertInstructorOwnsCourseIn(transaction, instructorId, module.courseId);
      this.assertFresh(module.updatedAt, expectedUpdatedAt);
      return transaction.module.update({ where: { id: moduleId }, data });
    });
  }

  async deleteModule(instructorId: string, moduleId: string): Promise<{ message: string }> {
    const module = await this.prisma.module.findUnique({
      where: { id: moduleId },
      select: { id: true, courseId: true, orderIndex: true },
    });
    if (!module) throw new NotFoundException('Module not found');
    await this.assertInstructorOwnsCourse(instructorId, module.courseId);

    const storageKeys = await this.runDeleteTransaction(async (transaction) => {
      const currentModule = await transaction.module.findUnique({
        where: { id: moduleId },
        select: { courseId: true },
      });
      if (!currentModule) throw new NotFoundException('Module not found');
      const progressCount = await transaction.lessonProgress.count({ where: { lesson: { moduleId } } });
      if (progressCount > 0) throw new ConflictException('Cannot delete module because learner progress exists.');
      const storedResources = await transaction.learningResource.findMany({
        where: { lesson: { moduleId }, storageKey: { not: null } },
        select: { storageKey: true },
      });
      await transaction.learningResource.deleteMany({ where: { lesson: { moduleId } } });
      await transaction.lesson.deleteMany({ where: { moduleId } });
      await transaction.module.delete({ where: { id: moduleId } });
      await this.reindexModules(transaction, currentModule.courseId);
      return storedResources.flatMap((item) => item.storageKey ? [item.storageKey] : []);
    });
    await Promise.all(storageKeys.map((key) => this.resourceStorage.delete(key).catch(() => undefined)));
    return { message: 'Module deleted successfully' };
  }

  async reorderModules(instructorId: string, courseId: string, dto: ReorderDto): Promise<void> {
    await this.assertInstructorOwnsCourse(instructorId, courseId);

    await this.runReorderTransaction(
      async (transaction) => {
        const existing = await transaction.module.findMany({
          where: { courseId },
          select: { id: true },
        });
        const orderedIds = dto.orderedIds;
        this.validateCompleteOrder(
          existing.map((item) => item.id),
          orderedIds,
          'module IDs of this course',
        );

        for (const [index, id] of orderedIds.entries()) {
          await transaction.module.update({
            where: { id },
            data: { orderIndex: -(index + 1) },
          });
        }
        for (const [index, id] of orderedIds.entries()) {
          await transaction.module.update({
            where: { id },
            data: { orderIndex: index },
          });
        }
      },
      'Module',
      ['courseId', 'orderIndex'],
    );
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

  async createLesson(instructorId: string, moduleId: string, dto: CreateLessonDto) {
    const module = await this.prisma.module.findUnique({
      where: { id: moduleId },
      select: { courseId: true },
    });
    if (!module) throw new NotFoundException('Module not found');
    await this.assertInstructorOwnsCourse(instructorId, module.courseId);

    for (let attempt = 1; attempt <= MAX_CONTENT_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (transaction) => {
            const lastLesson = await transaction.lesson.findFirst({
              where: { moduleId },
              orderBy: { orderIndex: 'desc' },
              select: { orderIndex: true },
            });

            return transaction.lesson.create({
              data: {
                ...dto,
                moduleId,
                orderIndex: lastLesson ? lastLesson.orderIndex + 1 : 0,
              },
            });
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );
      } catch (error: unknown) {
        const retryable =
          this.isPrismaError(error, 'P2034') ||
          this.isRelevantOrderConflict(error, 'Lesson', ['moduleId', 'orderIndex']);
        if (!retryable) throw error;
        if (attempt === MAX_CONTENT_TRANSACTION_ATTEMPTS) {
          throw new ConflictException('Lesson order changed concurrently; please try again');
        }
      }
    }

    throw new ConflictException('Lesson could not be created');
  }

  async updateLesson(instructorId: string, lessonId: string, dto: UpdateLessonDto) {
    const { expectedUpdatedAt, ...data } = dto;
    return this.prisma.$transaction(async (transaction) => {
      const lesson = await transaction.lesson.findUnique({
        where: { id: lessonId },
        select: { updatedAt: true, module: { select: { courseId: true } } },
      });
      if (!lesson) throw new NotFoundException('Lesson not found');
      await this.assertInstructorOwnsCourseIn(transaction, instructorId, lesson.module.courseId);
      this.assertFresh(lesson.updatedAt, expectedUpdatedAt);
      return transaction.lesson.update({ where: { id: lessonId }, data });
    });
  }

  async deleteLesson(instructorId: string, lessonId: string): Promise<{ message: string }> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, moduleId: true, module: { select: { courseId: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertInstructorOwnsCourse(instructorId, lesson.module.courseId);

    const storageKeys = await this.runDeleteTransaction(async (transaction) => {
      const currentLesson = await transaction.lesson.findUnique({
        where: { id: lessonId },
        select: { moduleId: true },
      });
      if (!currentLesson) throw new NotFoundException('Lesson not found');
      const progressCount = await transaction.lessonProgress.count({ where: { lessonId } });
      if (progressCount > 0) throw new ConflictException('Cannot delete lesson because learner progress exists.');
      const storedResources = await transaction.learningResource.findMany({
        where: { lessonId, storageKey: { not: null } },
        select: { storageKey: true },
      });
      await transaction.learningResource.deleteMany({ where: { lessonId } });
      await transaction.lesson.delete({ where: { id: lessonId } });
      await this.reindexLessons(transaction, currentLesson.moduleId);
      return storedResources.flatMap((item) => item.storageKey ? [item.storageKey] : []);
    });
    await Promise.all(storageKeys.map((key) => this.resourceStorage.delete(key).catch(() => undefined)));
    return { message: 'Lesson deleted successfully' };
  }

  async reorderLessons(instructorId: string, moduleId: string, dto: ReorderDto): Promise<void> {
    const module = await this.prisma.module.findUnique({
      where: { id: moduleId },
      select: { courseId: true },
    });
    if (!module) throw new NotFoundException('Module not found');
    await this.assertInstructorOwnsCourse(instructorId, module.courseId);

    await this.runReorderTransaction(
      async (transaction) => {
        const existing = await transaction.lesson.findMany({
          where: { moduleId },
          select: { id: true },
        });
        const orderedIds = dto.orderedIds;
        this.validateCompleteOrder(
          existing.map((item) => item.id),
          orderedIds,
          'lesson IDs of this module',
        );

        for (const [index, id] of orderedIds.entries()) {
          await transaction.lesson.update({ where: { id }, data: { orderIndex: -(index + 1) } });
        }
        for (const [index, id] of orderedIds.entries()) {
          await transaction.lesson.update({ where: { id }, data: { orderIndex: index } });
        }
      },
      'Lesson',
      ['moduleId', 'orderIndex'],
    );
  }

  // --- RESOURCES ---

  async listResources(instructorId: string, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { module: { select: { courseId: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertInstructorOwnsCourse(instructorId, lesson.module.courseId);

    const resources = await this.prisma.learningResource.findMany({
      where: { lessonId },
      orderBy: { orderIndex: 'asc' },
    });
    return Promise.all(resources.map(async (resource) => ({
      ...resource,
      sizeBytes: resource.storageKey
        ? await this.resourceStorage.stat(resource.storageKey).then((item) => item.sizeBytes).catch(() => null)
        : null,
    })));
  }

  async createResource(instructorId: string, lessonId: string, dto: CreateResourceDto) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { module: { select: { courseId: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertInstructorOwnsCourse(instructorId, lesson.module.courseId);

    for (let attempt = 1; attempt <= MAX_CONTENT_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (transaction) => {
            const lastResource = await transaction.learningResource.findFirst({
              where: { lessonId },
              orderBy: { orderIndex: 'desc' },
              select: { orderIndex: true },
            });

            return transaction.learningResource.create({
              data: {
                ...dto,
                lessonId,
                orderIndex: lastResource ? lastResource.orderIndex + 1 : 0,
              },
            });
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );
      } catch (error: unknown) {
        const retryable =
          this.isPrismaError(error, 'P2034') ||
          this.isRelevantOrderConflict(error, 'LearningResource', ['lessonId', 'orderIndex']);
        if (!retryable) throw error;
        if (attempt === MAX_CONTENT_TRANSACTION_ATTEMPTS) {
          throw new ConflictException('Resource order changed concurrently; please try again');
        }
      }
    }

    throw new ConflictException('Resource could not be created');
  }

  async updateResource(instructorId: string, resourceId: string, dto: UpdateResourceDto) {
    const { expectedUpdatedAt, ...data } = dto;
    return this.prisma.$transaction(async (transaction) => {
      const resource = await transaction.learningResource.findUnique({
        where: { id: resourceId },
        select: { updatedAt: true, storageKey: true, type: true, url: true, originalFileName: true, mimeType: true, lesson: { select: { module: { select: { courseId: true } } } } },
      });
      if (!resource) throw new NotFoundException('Resource not found');
      await this.assertInstructorOwnsCourseIn(transaction, instructorId, resource.lesson.module.courseId);
      this.assertFresh(resource.updatedAt, expectedUpdatedAt);
      if (resource.storageKey) {
        if (data.type !== undefined || data.url !== undefined) {
          throw new BadRequestException('Tài liệu đã tải lên không thể đổi thành liên kết. Hãy xóa và tạo lại tài nguyên.');
        }
        if (!resource.originalFileName || !resource.mimeType || resource.type !== ResourceType.DOCUMENT || resource.url !== null) {
          throw new BadRequestException('Trạng thái tài liệu lưu trữ không hợp lệ.');
        }
        const storedMetadataUpdate: Prisma.LearningResourceUpdateInput = {};
        if (data.title !== undefined) storedMetadataUpdate.title = data.title;
        if (data.isDownloadable !== undefined) storedMetadataUpdate.isDownloadable = data.isDownloadable;
        return transaction.learningResource.update({
          where: { id: resourceId },
          data: storedMetadataUpdate,
        });
      }

      if (resource.originalFileName !== null || resource.mimeType !== null) {
        throw new BadRequestException('Trạng thái liên kết ngoài không hợp lệ.');
      }
      const nextType = data.type ?? resource.type;
      const nextUrl = data.url ?? resource.url;
      if (!nextType || typeof nextUrl !== 'string' || nextUrl.trim().length === 0) {
        throw new BadRequestException('Liên kết ngoài cần loại và URL hợp lệ.');
      }
      return transaction.learningResource.update({ where: { id: resourceId }, data });
    });
  }

  async uploadResource(
    instructorId: string,
    lessonId: string,
    input: { title: string; isDownloadable: boolean; replaceResourceId?: string; expectedUpdatedAt?: string },
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { module: { select: { courseId: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertInstructorOwnsCourse(instructorId, lesson.module.courseId);
    const stored = await this.resourceStorage.put(file);
    let oldKey: string | null = null;
    try {
      const resource = await this.prisma.$transaction(async (transaction) => {
        if (input.replaceResourceId) {
          if (!input.expectedUpdatedAt) throw new BadRequestException('expectedUpdatedAt is required when replacing a resource');
          const current = await transaction.learningResource.findFirst({
            where: { id: input.replaceResourceId, lessonId },
            select: { id: true, storageKey: true, updatedAt: true, lesson: { select: { module: { select: { courseId: true } } } } },
          });
          if (!current) throw new NotFoundException('Resource not found');
          await this.assertInstructorOwnsCourseIn(transaction, instructorId, current.lesson.module.courseId);
          this.assertFresh(current.updatedAt, input.expectedUpdatedAt);
          oldKey = current.storageKey;
          return transaction.learningResource.update({
            where: { id: current.id },
            data: {
              title: input.title,
              type: 'DOCUMENT',
              url: null,
              storageKey: stored.key,
              originalFileName: stored.originalFileName,
              mimeType: stored.mimeType,
              isDownloadable: input.isDownloadable,
            },
          });
        }
        const last = await transaction.learningResource.findFirst({
          where: { lessonId }, orderBy: { orderIndex: 'desc' }, select: { orderIndex: true },
        });
        return transaction.learningResource.create({
          data: {
            lessonId,
            title: input.title,
            type: 'DOCUMENT',
            url: null,
            storageKey: stored.key,
            originalFileName: stored.originalFileName,
            mimeType: stored.mimeType,
            isDownloadable: input.isDownloadable,
            orderIndex: last ? last.orderIndex + 1 : 0,
          },
        });
      });
      if (oldKey) await this.resourceStorage.delete(oldKey).catch(() => undefined);
      return { ...resource, sizeBytes: stored.bytes };
    } catch (error) {
      await this.resourceStorage.delete(stored.key).catch(() => undefined);
      throw error;
    }
  }

  async openResource(instructorId: string, resourceId: string) {
    const resource = await this.prisma.learningResource.findUnique({
      where: { id: resourceId },
      select: {
        storageKey: true,
        mimeType: true,
        originalFileName: true,
        lesson: { select: { module: { select: { courseId: true } } } },
      },
    });
    if (!resource?.storageKey || !resource.mimeType || !resource.originalFileName) {
      throw new NotFoundException('Stored resource not found');
    }
    await this.assertInstructorOwnsCourse(instructorId, resource.lesson.module.courseId);
    return {
      stream: this.resourceStorage.open(resource.storageKey),
      mimeType: resource.mimeType,
      fileName: this.safeFileName(resource.originalFileName),
    };
  }

  async deleteResource(instructorId: string, resourceId: string): Promise<{ message: string }> {
    const resource = await this.prisma.learningResource.findUnique({
      where: { id: resourceId },
      select: {
        id: true,
        lessonId: true,
        storageKey: true,
        lesson: { select: { module: { select: { courseId: true } } } },
      },
    });
    if (!resource) throw new NotFoundException('Resource not found');
    await this.assertInstructorOwnsCourse(instructorId, resource.lesson.module.courseId);

    await this.runDeleteTransaction(async (transaction) => {
      const currentResource = await transaction.learningResource.findUnique({
        where: { id: resourceId },
        select: { lessonId: true },
      });
      if (!currentResource) {
        throw new NotFoundException('Resource not found');
      }

      await transaction.learningResource.delete({ where: { id: resourceId } });
      await this.reindexResources(transaction, currentResource.lessonId);
    });

    if (resource.storageKey) await this.resourceStorage.delete(resource.storageKey).catch(() => undefined);

    return { message: 'Resource deleted successfully' };
  }

  async reorderResources(instructorId: string, lessonId: string, dto: ReorderDto): Promise<void> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { module: { select: { courseId: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertInstructorOwnsCourse(instructorId, lesson.module.courseId);

    await this.runReorderTransaction(
      async (transaction) => {
        const existing = await transaction.learningResource.findMany({
          where: { lessonId },
          select: { id: true },
        });
        const orderedIds = dto.orderedIds;
        this.validateCompleteOrder(
          existing.map((item) => item.id),
          orderedIds,
          'resource IDs of this lesson',
        );

        for (const [index, id] of orderedIds.entries()) {
          await transaction.learningResource.update({ where: { id }, data: { orderIndex: -(index + 1) } });
        }
        for (const [index, id] of orderedIds.entries()) {
          await transaction.learningResource.update({ where: { id }, data: { orderIndex: index } });
        }
      },
      'LearningResource',
      ['lessonId', 'orderIndex'],
    );
  }

  private validateCompleteOrder(
    existingIds: string[],
    orderedIds: string[],
    expectedChildren: string,
  ): void {
    if (new Set(orderedIds).size !== orderedIds.length) {
      throw new BadRequestException('orderedIds must not contain duplicates');
    }
    const existingIdSet = new Set(existingIds);
    if (
      orderedIds.length !== existingIds.length ||
      !orderedIds.every((id) => existingIdSet.has(id))
    ) {
      throw new BadRequestException(
        `orderedIds must contain exactly all ${expectedChildren}`,
      );
    }
  }

  private async runReorderTransaction(
    operation: (transaction: Prisma.TransactionClient) => Promise<void>,
    modelName: string,
    orderFields: string[],
  ): Promise<void> {
    for (let attempt = 1; attempt <= MAX_CONTENT_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
        return;
      } catch (error: unknown) {
        const retryable =
          this.isPrismaError(error, 'P2034') ||
          this.isRelevantOrderConflict(error, modelName, orderFields);
        if (!retryable) throw error;
        if (attempt === MAX_CONTENT_TRANSACTION_ATTEMPTS) {
          throw new ConflictException('Content order changed concurrently; please try again');
        }
      }
    }
  }

  private async runDeleteTransaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_CONTENT_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: unknown) {
        if (this.isPrismaError(error, 'P2003')) {
          throw new ConflictException(
            'Cannot delete content because learner progress or dependent content exists.',
          );
        }
        const retryable =
          this.isPrismaError(error, 'P2034') ||
          this.isRelevantOrderConflict(error, 'Module', ['courseId', 'orderIndex']) ||
          this.isRelevantOrderConflict(error, 'Lesson', ['moduleId', 'orderIndex']) ||
          this.isRelevantOrderConflict(error, 'LearningResource', ['lessonId', 'orderIndex']);
        if (!retryable) throw error;
        if (attempt === MAX_CONTENT_TRANSACTION_ATTEMPTS) {
          throw new ConflictException('Content changed concurrently; please try again');
        }
      }
    }
    throw new ConflictException('Content changed concurrently; please try again');
  }

  private async reindexModules(
    transaction: Prisma.TransactionClient,
    courseId: string,
  ): Promise<void> {
    const remaining = await transaction.module.findMany({
      where: { courseId },
      orderBy: { orderIndex: 'asc' },
      select: { id: true },
    });
    for (const [index, item] of remaining.entries()) {
      await transaction.module.update({
        where: { id: item.id },
        data: { orderIndex: -(index + 1) },
      });
    }
    for (const [index, item] of remaining.entries()) {
      await transaction.module.update({
        where: { id: item.id },
        data: { orderIndex: index },
      });
    }
  }

  private async reindexLessons(
    transaction: Prisma.TransactionClient,
    moduleId: string,
  ): Promise<void> {
    const remaining = await transaction.lesson.findMany({
      where: { moduleId },
      orderBy: { orderIndex: 'asc' },
      select: { id: true },
    });
    for (const [index, item] of remaining.entries()) {
      await transaction.lesson.update({
        where: { id: item.id },
        data: { orderIndex: -(index + 1) },
      });
    }
    for (const [index, item] of remaining.entries()) {
      await transaction.lesson.update({
        where: { id: item.id },
        data: { orderIndex: index },
      });
    }
  }

  private async reindexResources(
    transaction: Prisma.TransactionClient,
    lessonId: string,
  ): Promise<void> {
    const remaining = await transaction.learningResource.findMany({
      where: { lessonId },
      orderBy: { orderIndex: 'asc' },
      select: { id: true },
    });
    for (const [index, item] of remaining.entries()) {
      await transaction.learningResource.update({
        where: { id: item.id },
        data: { orderIndex: -(index + 1) },
      });
    }
    for (const [index, item] of remaining.entries()) {
      await transaction.learningResource.update({
        where: { id: item.id },
        data: { orderIndex: index },
      });
    }
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
  }

  private isRelevantOrderConflict(error: unknown, modelName: string, fields: string[]): boolean {
    if (!this.isPrismaError(error, 'P2002')) return false;

    const metadata = (error as Prisma.PrismaClientKnownRequestError).meta as
      Record<string, unknown> | undefined;
    if (metadata?.modelName && metadata.modelName !== modelName) return false;

    try {
      const serialized = JSON.stringify(metadata).toLowerCase();
      return fields.every((field) => serialized.includes(field.toLowerCase()));
    } catch {
      return false;
    }
  }

  private assertFresh(current: Date, expected: string): void {
    if (current.getTime() !== new Date(expected).getTime()) {
      throw new ConflictException({
        code: 'STALE_SHARED_CONTENT',
        message: 'Nội dung đã được cập nhật ở nơi khác. Vui lòng tải lại trước khi tiếp tục chỉnh sửa.',
      });
    }
  }

  private async assertInstructorOwnsCourseIn(
    database: Prisma.TransactionClient,
    instructorId: string,
    courseId: string,
  ): Promise<void> {
    const assignment = await database.classOffering.findFirst({ where: { courseId, instructorId }, select: { id: true } });
    if (!assignment) throw new ForbiddenException('You are not assigned to any class offering of this course');
  }

  private safeFileName(value: string): string {
    return value.replace(/[\\/\r\n"]/g, '_').slice(0, 240) || 'document';
  }
}
