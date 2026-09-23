import { NotFoundException } from '@nestjs/common';
import { EnrollmentStatus, LessonProgressStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AdaptiveStudentService } from './adaptive-student.service';

describe('AdaptiveStudentService', () => {
  const learnerId = '10000000-0000-4000-8000-000000000001';
  const enrollmentId = '20000000-0000-4000-8000-000000000001';
  const courseId = '30000000-0000-4000-8000-000000000001';
  const prerequisiteId = '40000000-0000-4000-8000-000000000001';
  const dependentId = '40000000-0000-4000-8000-000000000002';
  const remedialId = '40000000-0000-4000-8000-000000000003';
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: AdaptiveStudentService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new AdaptiveStudentService(prisma as unknown as PrismaService);
  });

  it('scopes authorization and every adaptive read to the active Enrollment Course', async () => {
    await service.getAdaptivePath(learnerId, enrollmentId);

    expect(prisma.enrollment.findFirst).toHaveBeenCalledWith({
      where: { id: enrollmentId, learnerId, status: EnrollmentStatus.ACTIVE },
      select: { id: true, classOffering: { select: { courseId: true } } },
    });
    expect(prisma.courseAdaptivePolicy.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { courseId } }),
    );
    expect(prisma.skill.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { courseId } }),
    );
    expect(prisma.module.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { courseId } }),
    );
  });

  it('returns 404 for a foreign or inactive Enrollment before adaptive reads', async () => {
    prisma.enrollment.findFirst.mockResolvedValue(null);

    await expect(service.getAdaptivePath('foreign-learner', enrollmentId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.courseAdaptivePolicy.findUnique).not.toHaveBeenCalled();
    expect(prisma.skill.findMany).not.toHaveBeenCalled();
    expect(prisma.module.findMany).not.toHaveBeenCalled();
  });

  it('uses DEFAULT policy without any write', async () => {
    const result = await service.getAdaptivePath(learnerId, enrollmentId);

    expect(result.policy).toEqual({
      remedialThreshold: 0.4,
      progressionThreshold: 0.8,
      source: 'DEFAULT',
    });
    expectNoWrites(prisma);
  });

  it('uses SAVED policy values as the real engine input', async () => {
    prisma.courseAdaptivePolicy.findUnique.mockResolvedValue({
      remedialThreshold: 0.1,
      progressionThreshold: 0.9,
    });

    const result = await service.getAdaptivePath(learnerId, enrollmentId);

    expect(result.policy).toEqual({
      remedialThreshold: 0.1,
      progressionThreshold: 0.9,
      source: 'SAVED',
    });
    expect(result.skillClassifications.find(({ skillId }) => skillId === remedialId)).toMatchObject(
      { masteryBand: 'REINFORCEMENT' },
    );
  });

  it('passes mastery, prerequisite direction, mappings, completion and unmapped data to the engine', async () => {
    const result = await service.getAdaptivePath(learnerId, enrollmentId);

    expect(result).toMatchObject({
      enrollmentId,
      courseId,
      configurationStatus: 'PARTIALLY_MAPPED',
    });
    expect(
      result.skillClassifications.find(({ skillId }) => skillId === prerequisiteId),
    ).toMatchObject({
      state: 'PRIOR',
      masteryProbability: 0.9,
      masteryBand: 'UNASSESSED',
    });
    expect(result.skillClassifications.find(({ skillId }) => skillId === remedialId)).toMatchObject(
      {
        state: 'OBSERVED',
        masteryProbability: 0.2,
        masteryBand: 'REMEDIAL',
      },
    );
    expect(result.path).toEqual([
      expect.objectContaining({
        lessonId: 'lesson-remedial',
        category: 'REMEDIAL',
        isCompleted: true,
        isReview: true,
        reason: expect.objectContaining({
          reasonCode: 'REMEDIAL_LOW_MASTERY',
          focusSkillId: remedialId,
        }),
      }),
    ]);
    expect(result.blockedLessons).toEqual([
      expect.objectContaining({
        lessonId: 'lesson-dependent',
        reason: expect.objectContaining({
          reasonCode: 'LOCKED_PREREQUISITE',
          focusSkillId: dependentId,
          unsatisfiedPrerequisites: [expect.objectContaining({ skillId: prerequisiteId })],
        }),
      }),
    ]);
    expect(result.unmappedLessons).toEqual([
      expect.objectContaining({ lessonId: 'lesson-unmapped' }),
    ]);
  });

  it('recomputes and unlocks a dependent Lesson from current observed mastery', async () => {
    prisma.skill.findMany.mockResolvedValue(
      baseSkills().map((skill) =>
        skill.id === prerequisiteId
          ? {
              ...skill,
              learnerStates: [{ masteryProbability: 0.8, observationCount: 1 }],
            }
          : skill,
      ),
    );

    const result = await service.getAdaptivePath(learnerId, enrollmentId);

    expect(result.blockedLessons).toEqual([]);
    expect(result.path).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lessonId: 'lesson-dependent',
          category: 'PROGRESSION',
          reason: expect.objectContaining({ focusSkillId: dependentId }),
        }),
      ]),
    );
  });

  it('treats non-completed and missing LessonProgress as uncompleted', async () => {
    prisma.module.findMany.mockResolvedValue([
      {
        ...baseModules()[0],
        lessons: baseModules()[0].lessons.map((lesson) =>
          lesson.id === 'lesson-remedial'
            ? { ...lesson, progress: [{ status: LessonProgressStatus.IN_PROGRESS }] }
            : lesson,
        ),
      },
    ]);

    const result = await service.getAdaptivePath(learnerId, enrollmentId);

    expect(result.path[0]).toMatchObject({
      lessonId: 'lesson-remedial',
      isCompleted: false,
      isReview: false,
    });
    expect(result.blockedLessons[0].isCompleted).toBe(false);
  });

  it('handles empty Course Skills and Lessons as valid data', async () => {
    prisma.skill.findMany.mockResolvedValue([]);
    prisma.module.findMany.mockResolvedValue([]);

    await expect(service.getAdaptivePath(learnerId, enrollmentId)).resolves.toMatchObject({
      configurationStatus: 'NO_MAPPED_LESSONS',
      skillClassifications: [],
      path: [],
      blockedLessons: [],
      unmappedLessons: [],
    });
  });

  it('returns deep-equal output for repeated reads with unchanged data', async () => {
    const first = await service.getAdaptivePath(learnerId, enrollmentId);
    const second = await service.getAdaptivePath(learnerId, enrollmentId);

    expect(second).toEqual(first);
    expectNoWrites(prisma);
  });

  function createPrismaMock() {
    return {
      enrollment: {
        findFirst: jest.fn().mockResolvedValue({
          id: enrollmentId,
          classOffering: { courseId },
        }),
        update: jest.fn(),
      },
      courseAdaptivePolicy: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        upsert: jest.fn(),
      },
      skill: { findMany: jest.fn().mockResolvedValue(baseSkills()), update: jest.fn() },
      module: { findMany: jest.fn().mockResolvedValue(baseModules()) },
      learnerSkillState: { create: jest.fn(), update: jest.fn(), upsert: jest.fn() },
      masteryHistory: { create: jest.fn() },
      lessonProgress: { create: jest.fn(), update: jest.fn(), upsert: jest.fn() },
    };
  }

  function baseSkills() {
    return [
      {
        id: prerequisiteId,
        code: 'FOUNDATION',
        name: 'Foundation',
        pInit: 0.9,
        learnerStates: [],
        prerequisites: [],
      },
      {
        id: dependentId,
        code: 'DEPENDENT',
        name: 'Dependent',
        pInit: 0.5,
        learnerStates: [],
        prerequisites: [{ prerequisiteSkillId: prerequisiteId }],
      },
      {
        id: remedialId,
        code: 'REMEDIAL',
        name: 'Remedial',
        pInit: 0.5,
        learnerStates: [{ masteryProbability: 0.2, observationCount: 2 }],
        prerequisites: [],
      },
    ];
  }

  function baseModules() {
    return [
      {
        id: 'module-1',
        title: 'Module 1',
        orderIndex: 1,
        lessons: [
          {
            id: 'lesson-remedial',
            title: 'Remedial Lesson',
            orderIndex: 1,
            skills: [{ skillId: remedialId }],
            progress: [{ status: LessonProgressStatus.COMPLETED }],
          },
          {
            id: 'lesson-dependent',
            title: 'Dependent Lesson',
            orderIndex: 2,
            skills: [{ skillId: dependentId }],
            progress: [],
          },
          {
            id: 'lesson-unmapped',
            title: 'Unmapped Lesson',
            orderIndex: 3,
            skills: [],
            progress: [],
          },
        ],
      },
    ];
  }

  function expectNoWrites(database: ReturnType<typeof createPrismaMock>) {
    expect(database.courseAdaptivePolicy.create).not.toHaveBeenCalled();
    expect(database.courseAdaptivePolicy.upsert).not.toHaveBeenCalled();
    expect(database.learnerSkillState.create).not.toHaveBeenCalled();
    expect(database.learnerSkillState.update).not.toHaveBeenCalled();
    expect(database.learnerSkillState.upsert).not.toHaveBeenCalled();
    expect(database.masteryHistory.create).not.toHaveBeenCalled();
    expect(database.lessonProgress.create).not.toHaveBeenCalled();
    expect(database.lessonProgress.update).not.toHaveBeenCalled();
    expect(database.lessonProgress.upsert).not.toHaveBeenCalled();
    expect(database.enrollment.update).not.toHaveBeenCalled();
  }
});
