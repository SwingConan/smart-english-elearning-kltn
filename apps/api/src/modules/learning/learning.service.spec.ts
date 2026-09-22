import { ConflictException, NotFoundException } from '@nestjs/common';
import { EnrollmentStatus, LessonProgressStatus, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { LearningService } from './learning.service';

describe('LearningService', () => {
  const learnerId = 'learner-id';
  const enrollmentId = 'enrollment-id';
  const lessonId = 'lesson-id';
  const courseId = 'course-id';
  const now = new Date('2026-09-20T12:00:00.000Z');
  const enrollment = { id: enrollmentId, classOfferingId: 'offering-id', status: EnrollmentStatus.ACTIVE, classOffering: { courseId } };
  const lesson = { id: lessonId, title: 'Lesson', description: null, orderIndex: 0, module: { id: 'module-id', title: 'Module' }, resources: [] };
  const transaction = {
    lessonProgress: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  };
  const prisma = {
    enrollment: { findFirst: jest.fn() },
    course: { findUniqueOrThrow: jest.fn() },
    lesson: { findFirst: jest.fn(), count: jest.fn() },
    lessonProgress: { count: jest.fn() },
    skill: { findMany: jest.fn(), findFirst: jest.fn() },
    masteryHistory: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new LearningService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    jest.clearAllMocks();
    prisma.enrollment.findFirst.mockResolvedValue(enrollment);
    prisma.lesson.findFirst.mockResolvedValue(lesson);
    prisma.course.findUniqueOrThrow.mockResolvedValue({ title: 'Course', modules: [] });
    prisma.lesson.count.mockResolvedValue(0);
    prisma.lessonProgress.count.mockResolvedValue(0);
    prisma.skill.findMany.mockResolvedValue([]);
    prisma.masteryHistory.findMany.mockResolvedValue([]);
    transaction.lessonProgress.findUnique.mockResolvedValue(null);
    transaction.lessonProgress.create.mockImplementation(({ data }) => Promise.resolve({ id: 'progress-id', completedAt: null, ...data }));
    transaction.lessonProgress.update.mockImplementation(({ data }) => Promise.resolve({ id: 'progress-id', enrollmentId, lessonId, completedAt: null, ...data }));
    prisma.$transaction.mockImplementation((operation: (client: typeof transaction) => Promise<unknown>) => operation(transaction));
  });

  afterEach(() => jest.useRealTimers());

  it('scopes every learning request to the current learner and ACTIVE enrollment', async () => {
    await service.getContent(learnerId, enrollmentId);
    expect(prisma.enrollment.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: enrollmentId, learnerId, status: EnrollmentStatus.ACTIVE },
    }));
  });

  it.each([
    EnrollmentStatus.PENDING_PAYMENT,
    EnrollmentStatus.COMPLETED,
    EnrollmentStatus.DROPPED,
    EnrollmentStatus.CANCELLED,
  ])('returns 404 for unavailable enrollment status %s', async (status) => {
    prisma.enrollment.findFirst.mockResolvedValue(null);
    await expect(service.getProgress(learnerId, `${enrollmentId}-${status}`)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 for another learner and a cross-course lesson', async () => {
    prisma.enrollment.findFirst.mockResolvedValueOnce(null);
    await expect(service.getContent('other-learner', enrollmentId)).rejects.toBeInstanceOf(NotFoundException);
    prisma.enrollment.findFirst.mockResolvedValue(enrollment);
    prisma.lesson.findFirst.mockResolvedValue(null);
    await expect(service.openLesson(learnerId, enrollmentId, 'foreign-lesson')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.lesson.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'foreign-lesson', module: { courseId } } }));
  });

  it('creates IN_PROGRESS on first open and records lastAccessedAt', async () => {
    const result = await service.openLesson(learnerId, enrollmentId, lessonId);
    expect(transaction.lessonProgress.create).toHaveBeenCalledWith({ data: {
      enrollmentId, lessonId, status: LessonProgressStatus.IN_PROGRESS, lastAccessedAt: now,
    } });
    expect(result.progress.status).toBe(LessonProgressStatus.IN_PROGRESS);
  });

  it.each([LessonProgressStatus.IN_PROGRESS, LessonProgressStatus.COMPLETED])('updates access without downgrading %s progress', async (status) => {
    const completedAt = status === LessonProgressStatus.COMPLETED ? new Date('2026-09-19T12:00:00Z') : null;
    transaction.lessonProgress.findUnique.mockResolvedValue({ status, completedAt });
    await service.openLesson(learnerId, enrollmentId, lessonId);
    expect(transaction.lessonProgress.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { status, lastAccessedAt: now },
    }));
  });

  it('creates COMPLETED progress and upgrades IN_PROGRESS', async () => {
    await service.completeLesson(learnerId, enrollmentId, lessonId);
    expect(transaction.lessonProgress.create).toHaveBeenCalledWith({ data: {
      enrollmentId, lessonId, status: LessonProgressStatus.COMPLETED, lastAccessedAt: now, completedAt: now,
    } });

    transaction.lessonProgress.findUnique.mockResolvedValue({ status: LessonProgressStatus.IN_PROGRESS, completedAt: null });
    await service.completeLesson(learnerId, enrollmentId, lessonId);
    expect(transaction.lessonProgress.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: LessonProgressStatus.COMPLETED, completedAt: now }) }));
  });

  it('is idempotent for completed progress and preserves completedAt', async () => {
    const completedAt = new Date('2026-09-19T12:00:00Z');
    const existing = { id: 'progress-id', status: LessonProgressStatus.COMPLETED, completedAt };
    transaction.lessonProgress.findUnique.mockResolvedValue(existing);
    await expect(service.completeLesson(learnerId, enrollmentId, lessonId)).resolves.toBe(existing);
    expect(transaction.lessonProgress.update).not.toHaveBeenCalled();
  });

  it.each([
    [0, 0, 0],
    [3, 0, 0],
    [3, 2, 67],
    [3, 3, 100],
    [1, 2, 100],
  ])('computes bounded progress for %i total and %i complete', async (total, complete, expected) => {
    prisma.lesson.count.mockResolvedValue(total);
    prisma.lessonProgress.count.mockResolvedValue(complete);
    await expect(service.getProgress(learnerId, enrollmentId)).resolves.toMatchObject({
      totalLessons: total, completedLessons: complete, progressPercent: expected,
    });
    expect(prisma.lessonProgress.count).toHaveBeenCalledWith({ where: {
      enrollmentId, status: LessonProgressStatus.COMPLETED, lesson: { module: { courseId } },
    } });
  });

  it('maps real content and progress without inventing mastery data', async () => {
    prisma.course.findUniqueOrThrow.mockResolvedValue({
      id: courseId, title: 'Course', level: 'A1', modules: [{
        id: 'module-id', title: 'Module', description: null, orderIndex: 0,
        lessons: [{ id: lessonId, title: 'Lesson', description: null, orderIndex: 0, _count: { resources: 2 }, progress: [{ status: LessonProgressStatus.COMPLETED }] }],
      }],
    });
    const result = await service.getContent(learnerId, enrollmentId);
    expect(result.modules[0].lessons[0]).toMatchObject({ progressStatus: LessonProgressStatus.COMPLETED, resourceCount: 2 });
    expect(result).not.toHaveProperty('mastery');
    expect(result).not.toHaveProperty('adaptive');
  });

  it('returns all Skills with mixed PRIOR and OBSERVED state in stable order', async () => {
    prisma.skill.findMany.mockResolvedValue([
      {
        id: 'alpha-id',
        code: 'ALPHA',
        name: 'Alpha',
        description: null,
        pInit: 0.3,
        learnerStates: [{
          masteryProbability: 0.81,
          observationCount: 2,
          lastObservedAt: now,
        }],
        prerequisites: [
          { prerequisiteSkill: { id: 'z-id', code: 'ZETA', name: 'Zeta' } },
          { prerequisiteSkill: { id: 'b-id', code: 'BETA', name: 'Beta' } },
        ],
      },
      {
        id: 'beta-id',
        code: 'BETA',
        name: 'Beta',
        description: 'Prior Skill',
        pInit: 0.45,
        learnerStates: [],
        prerequisites: [],
      },
    ]);

    const result = await service.getMastery(learnerId, enrollmentId);

    expect(prisma.skill.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { courseId },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
    }));
    expect(result).toMatchObject({ enrollmentId, courseId });
    expect(result.skills).toEqual([
      expect.objectContaining({
        code: 'ALPHA',
        masteryProbability: 0.81,
        observationCount: 2,
        lastObservedAt: now,
        state: 'OBSERVED',
        prerequisites: [
          { id: 'b-id', code: 'BETA', name: 'Beta' },
          { id: 'z-id', code: 'ZETA', name: 'Zeta' },
        ],
      }),
      expect.objectContaining({
        code: 'BETA',
        masteryProbability: 0.45,
        observationCount: 0,
        lastObservedAt: null,
        state: 'PRIOR',
      }),
    ]);
  });

  it('returns an empty mastery overview without creating state or history', async () => {
    await expect(service.getMastery(learnerId, enrollmentId)).resolves.toEqual({
      enrollmentId,
      courseId,
      skills: [],
    });
    expect(prisma.skill.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.masteryHistory.findMany).not.toHaveBeenCalled();
  });

  it('returns stored history and PRIOR fallback without exposing assessment answers', async () => {
    prisma.skill.findFirst.mockResolvedValue({
      id: 'skill-id',
      code: 'GRAMMAR',
      name: 'Grammar',
      description: null,
      pInit: 0.4,
      learnerStates: [],
    });
    prisma.masteryHistory.findMany.mockResolvedValue([]);

    const prior = await service.getMasteryHistory(learnerId, enrollmentId, 'skill-id');
    expect(prior.current).toEqual({
      masteryProbability: 0.4,
      observationCount: 0,
      lastObservedAt: null,
      state: 'PRIOR',
    });
    expect(prior.history).toEqual([]);
    expect(prisma.masteryHistory.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { enrollmentId, skillId: 'skill-id' },
      orderBy: [
        { createdAt: 'asc' },
        { testAttemptId: 'asc' },
        { testAnswerId: 'asc' },
        { id: 'asc' },
      ],
    }));
  });

  it('returns 404 for a missing or cross-Course Skill before querying history', async () => {
    prisma.skill.findFirst.mockResolvedValue(null);
    await expect(
      service.getMasteryHistory(learnerId, enrollmentId, 'foreign-skill'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.skill.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'foreign-skill', courseId },
    }));
    expect(prisma.masteryHistory.findMany).not.toHaveBeenCalled();
  });

  it('retries progress conflicts at most three times and does not swallow unrelated errors', async () => {
    prisma.$transaction.mockRejectedValue(progressConflict());
    await expect(service.openLesson(learnerId, enrollmentId, lessonId)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);

    jest.clearAllMocks();
    prisma.enrollment.findFirst.mockResolvedValue(enrollment);
    prisma.lesson.findFirst.mockResolvedValue(lesson);
    const unrelated = new Error('unrelated');
    prisma.$transaction.mockRejectedValue(unrelated);
    await expect(service.openLesson(learnerId, enrollmentId, lessonId)).rejects.toBe(unrelated);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

function progressConflict(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique failed', {
    code: 'P2002', clientVersion: '7.10.0', meta: { modelName: 'LessonProgress', target: ['enrollmentId', 'lessonId'] },
  });
}
