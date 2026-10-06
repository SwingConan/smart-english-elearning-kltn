import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma, ResourceType } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { InstructorContentService } from './instructor-content.service';
import { LearningResourceStorage } from './learning-resource.storage';

describe('InstructorContentService', () => {
  const instructorId = 'instructor-id';
  const courseId = 'course-id';
  const moduleId = 'module-id';
  const lessonId = 'lesson-id';
  const resourceId = 'resource-id';
  const transaction = {
    classOffering: { findFirst: jest.fn() },
    module: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    lesson: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
    learningResource: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
    lessonProgress: { count: jest.fn(), deleteMany: jest.fn() },
  };
  const prisma = {
    classOffering: { findFirst: jest.fn(), findMany: jest.fn() },
    module: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    lesson: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    learningResource: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  };
  const storage = {
    stat: jest.fn().mockResolvedValue(null),
    put: jest.fn(),
    open: jest.fn(),
    delete: jest.fn(),
  };
  const service = new InstructorContentService(
    prisma as unknown as PrismaService,
    storage as unknown as LearningResourceStorage,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    storage.delete.mockResolvedValue(undefined);
    prisma.classOffering.findFirst.mockResolvedValue({ id: 'offering-id' });
    prisma.module.findUnique.mockResolvedValue({ courseId });
    prisma.lesson.findUnique.mockResolvedValue({ module: { courseId } });
    prisma.learningResource.findUnique.mockResolvedValue({ lesson: { module: { courseId } } });
    transaction.module.findFirst.mockResolvedValue({ orderIndex: 2 });
    transaction.classOffering.findFirst.mockResolvedValue({ id: 'offering-id' });
    transaction.module.findUnique.mockResolvedValue({ id: moduleId, courseId, updatedAt: new Date() });
    transaction.lesson.findFirst.mockResolvedValue({ orderIndex: 3 });
    transaction.learningResource.findFirst.mockResolvedValue({ orderIndex: 4 });
    transaction.module.create.mockImplementation(({ data }) => Promise.resolve({ id: moduleId, ...data }));
    transaction.lesson.create.mockImplementation(({ data }) => Promise.resolve({ id: lessonId, ...data }));
    transaction.learningResource.create.mockImplementation(({ data }) => Promise.resolve({ id: resourceId, ...data }));
    prisma.$transaction.mockImplementation((value: unknown) =>
      typeof value === 'function'
        ? (value as (client: typeof transaction) => Promise<unknown>)(transaction)
        : Promise.resolve(value),
    );
  });

  it('allows an assigned instructor and rejects an unassigned instructor', async () => {
    prisma.module.findMany.mockResolvedValue([]);
    await expect(service.listModules(instructorId, courseId)).resolves.toEqual([]);
    prisma.classOffering.findFirst.mockResolvedValueOnce(null);
    await expect(service.listModules(instructorId, courseId)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('resolves lesson and resource ownership through their parent course', async () => {
    prisma.lesson.findMany.mockResolvedValue([]);
    prisma.learningResource.findMany.mockResolvedValue([]);
    await service.listLessons(instructorId, moduleId);
    await service.listResources(instructorId, lessonId);
    expect(prisma.classOffering.findFirst).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { courseId, instructorId } }));
    expect(prisma.classOffering.findFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { courseId, instructorId } }));
  });

  it('rejects mutation when the instructor owns a different course', async () => {
    transaction.module.findUnique.mockResolvedValue({ id: moduleId, courseId: 'course-b', updatedAt: new Date() });
    transaction.classOffering.findFirst.mockResolvedValue(null);
    await expect(service.updateModule(instructorId, moduleId, {
      title: 'Denied',
      expectedUpdatedAt: new Date().toISOString(),
    })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a stale shared-content update without overwriting', async () => {
    transaction.module.findUnique.mockResolvedValue({ id: moduleId, courseId, updatedAt: new Date('2026-10-06T00:00:00.000Z') });
    await expect(service.updateModule(instructorId, moduleId, {
      title: 'Stale title', expectedUpdatedAt: '2026-10-05T00:00:00.000Z',
    })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'STALE_SHARED_CONTENT' }) });
    expect(transaction.module.update).not.toHaveBeenCalled();
  });

  it('preserves the old object and cleans up the new object on a stale resource replacement', async () => {
    prisma.lesson.findUnique.mockResolvedValue({ module: { courseId } });
    storage.put.mockResolvedValue({ key: 'new.txt', bytes: 3, mimeType: 'text/plain', originalFileName: 'new.txt' });
    transaction.learningResource.findFirst.mockResolvedValue({
      id: resourceId, storageKey: 'old.txt', updatedAt: new Date('2026-10-06T00:00:00.000Z'),
      lesson: { module: { courseId } },
    });
    const file = { buffer: Buffer.from('new'), size: 3, mimetype: 'text/plain', originalname: 'new.txt' };
    await expect(service.uploadResource(instructorId, lessonId, {
      title: 'New', isDownloadable: true, replaceResourceId: resourceId, expectedUpdatedAt: '2026-10-05T00:00:00.000Z',
    }, file)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'STALE_SHARED_CONTENT' }) });
    expect(transaction.learningResource.update).not.toHaveBeenCalled();
    expect(storage.delete).toHaveBeenCalledWith('new.txt');
    expect(storage.delete).not.toHaveBeenCalledWith('old.txt');
  });

  it('preserves stored-resource representation during generic edits', async () => {
    transaction.learningResource.findUnique.mockResolvedValue({
      updatedAt: new Date('2026-10-06T00:00:00.000Z'), storageKey: 'stored.pdf',
      type: ResourceType.DOCUMENT, url: null, originalFileName: 'guide.pdf', mimeType: 'application/pdf',
      lesson: { module: { courseId } },
    });
    transaction.learningResource.update.mockResolvedValue({ id: resourceId });
    await expect(service.updateResource(instructorId, resourceId, {
      title: 'Tên mới', expectedUpdatedAt: '2026-10-06T00:00:00.000Z',
    })).resolves.toEqual({ id: resourceId });
    await expect(service.updateResource(instructorId, resourceId, {
      type: ResourceType.LINK, url: 'https://example.test', expectedUpdatedAt: '2026-10-06T00:00:00.000Z',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cleans parent-owned stored files only after a successful database delete', async () => {
    prisma.lesson.findUnique.mockResolvedValue({ id: lessonId, moduleId, module: { courseId } });
    transaction.lesson.findUnique.mockResolvedValue({ moduleId });
    transaction.lessonProgress.count.mockResolvedValue(0);
    transaction.learningResource.findMany.mockResolvedValue([{ storageKey: 'lesson/file.pdf' }]);
    transaction.lesson.findMany.mockResolvedValue([]);
    await service.deleteLesson(instructorId, lessonId);
    expect(storage.delete).toHaveBeenCalledWith('lesson/file.pdf');

    storage.delete.mockClear();
    transaction.lesson.delete.mockRejectedValueOnce(new Error('database failure'));
    await expect(service.deleteLesson(instructorId, lessonId)).rejects.toThrow('database failure');
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it.each([
    ['module', () => service.createModule(instructorId, courseId, { title: 'Module' }), transaction.module.create, { courseId, orderIndex: 3 }],
    ['lesson', () => service.createLesson(instructorId, moduleId, { title: 'Lesson' }), transaction.lesson.create, { moduleId, orderIndex: 4 }],
    ['resource', () => service.createResource(instructorId, lessonId, { title: 'Resource', type: ResourceType.LINK, url: 'https://example.test' }), transaction.learningResource.create, { lessonId, orderIndex: 5 }],
  ])('appends the next order for %s creation', async (_kind, invoke, createMock, expected) => {
    await invoke();
    expect(createMock).toHaveBeenCalledWith({ data: expect.objectContaining(expected) });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('retries only relevant order conflicts and stops after three attempts', async () => {
    prisma.$transaction.mockRejectedValue(moduleOrderCollision());
    await expect(service.createModule(instructorId, courseId, { title: 'Module' })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);

    jest.clearAllMocks();
    prisma.classOffering.findFirst.mockResolvedValue({ id: 'offering-id' });
    const unrelated = new Prisma.PrismaClientKnownRequestError('Unique failed', {
      code: 'P2002', clientVersion: '7.10.0', meta: { modelName: 'User', target: ['email'] },
    });
    prisma.$transaction.mockRejectedValue(unrelated);
    await expect(service.createModule(instructorId, courseId, { title: 'Module' })).rejects.toBe(unrelated);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['lesson', () => service.createLesson(instructorId, moduleId, { title: 'Lesson' })],
    ['resource', () => service.createResource(instructorId, lessonId, { title: 'Resource', type: ResourceType.LINK, url: 'https://example.test' })],
  ])('bounds P2034 retries for %s creation', async (_kind, invoke) => {
    prisma.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('Transaction conflict', {
      code: 'P2034', clientVersion: '7.10.0',
    }));
    await expect(invoke()).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['modules', () => service.reorderModules(instructorId, courseId, { orderedIds: ['a', 'b'] }), transaction.module.findMany, transaction.module.update],
    ['lessons', () => service.reorderLessons(instructorId, moduleId, { orderedIds: ['a', 'b'] }), transaction.lesson.findMany, transaction.lesson.update],
    ['resources', () => service.reorderResources(instructorId, lessonId, { orderedIds: ['a', 'b'] }), transaction.learningResource.findMany, transaction.learningResource.update],
  ])('accepts a complete deterministic %s reorder through a transaction', async (_kind, invoke, findMany, update) => {
    findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    await invoke();
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(update).toHaveBeenCalledTimes(4);
    expect(update).toHaveBeenLastCalledWith({ where: { id: 'b' }, data: { orderIndex: 1 } });
  });

  it.each([
    ['modules', (orderedIds: string[]) => service.reorderModules(instructorId, courseId, { orderedIds }), transaction.module.findMany],
    ['lessons', (orderedIds: string[]) => service.reorderLessons(instructorId, moduleId, { orderedIds }), transaction.lesson.findMany],
    ['resources', (orderedIds: string[]) => service.reorderResources(instructorId, lessonId, { orderedIds }), transaction.learningResource.findMany],
  ])('rejects duplicate, missing and foreign IDs when reordering %s', async (_kind, invoke, findMany) => {
    findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    for (const orderedIds of [['a', 'a'], ['a'], ['a', 'foreign']]) {
      await expect(invoke(orderedIds)).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('bounds reorder serialization retries and preserves unrelated errors', async () => {
    const serialization = new Prisma.PrismaClientKnownRequestError('Transaction conflict', {
      code: 'P2034', clientVersion: '7.10.0',
    });
    prisma.$transaction.mockRejectedValue(serialization);
    await expect(service.reorderModules(instructorId, courseId, { orderedIds: [] })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);

    jest.clearAllMocks();
    prisma.classOffering.findFirst.mockResolvedValue({ id: 'offering-id' });
    const unrelated = new Error('unrelated');
    prisma.$transaction.mockRejectedValue(unrelated);
    await expect(service.reorderModules(instructorId, courseId, { orderedIds: [] })).rejects.toBe(unrelated);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects lesson and module deletion when learner progress exists without deleting progress', async () => {
    prisma.lesson.findUnique.mockResolvedValue({ id: lessonId, moduleId, module: { courseId } });
    prisma.module.findUnique.mockResolvedValue({ id: moduleId, courseId, orderIndex: 0 });
    transaction.lesson.findUnique.mockResolvedValue({ moduleId });
    transaction.module.findUnique.mockResolvedValue({ courseId });
    transaction.lessonProgress.count.mockResolvedValue(1);

    await expect(service.deleteLesson(instructorId, lessonId)).rejects.toThrow('learner progress exists');
    await expect(service.deleteModule(instructorId, moduleId)).rejects.toThrow('learner progress exists');
    expect(transaction.lessonProgress.deleteMany).not.toHaveBeenCalled();
    expect(transaction.lesson.delete).not.toHaveBeenCalled();
    expect(transaction.module.delete).not.toHaveBeenCalled();
  });

  it('deletes no-progress lessons, modules and resources and reindexes siblings', async () => {
    prisma.lesson.findUnique.mockResolvedValue({ id: lessonId, moduleId, module: { courseId } });
    prisma.module.findUnique.mockResolvedValue({ id: moduleId, courseId, orderIndex: 0 });
    prisma.learningResource.findUnique.mockResolvedValue({ id: resourceId, lessonId, lesson: { module: { courseId } } });
    transaction.lesson.findUnique.mockResolvedValue({ moduleId });
    transaction.module.findUnique.mockResolvedValue({ courseId });
    transaction.learningResource.findUnique.mockResolvedValue({ lessonId });
    transaction.lessonProgress.count.mockResolvedValue(0);
    transaction.module.findMany.mockResolvedValue([]);
    transaction.lesson.findMany.mockResolvedValue([]);
    transaction.learningResource.findMany.mockResolvedValue([]);

    await service.deleteLesson(instructorId, lessonId);
    await service.deleteModule(instructorId, moduleId);
    await service.deleteResource(instructorId, resourceId);
    expect(transaction.lesson.delete).toHaveBeenCalledWith({ where: { id: lessonId } });
    expect(transaction.module.delete).toHaveBeenCalledWith({ where: { id: moduleId } });
    expect(transaction.learningResource.delete).toHaveBeenCalledWith({ where: { id: resourceId } });
    expect(transaction.lessonProgress.deleteMany).not.toHaveBeenCalled();
  });
});

function moduleOrderCollision(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique failed', {
    code: 'P2002', clientVersion: '7.10.0', meta: { modelName: 'Module', target: ['courseId', 'orderIndex'] },
  });
}
