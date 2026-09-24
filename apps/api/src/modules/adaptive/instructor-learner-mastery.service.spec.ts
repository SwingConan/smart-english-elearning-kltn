import { NotFoundException } from '@nestjs/common';
import { EnrollmentStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { DEFAULT_ADAPTIVE_POLICY } from './adaptive-policy.constants';
import { InstructorLearnerMasteryService } from './instructor-learner-mastery.service';

describe('InstructorLearnerMasteryService', () => {
  const instructorId = '10000000-0000-4000-8000-000000000001';
  const courseId = '20000000-0000-4000-8000-000000000001';
  const skillA = {
    id: '30000000-0000-4000-8000-000000000001',
    code: 'A-SKILL',
    name: 'A Skill',
    pInit: 0.35,
  };
  const skillB = {
    id: '30000000-0000-4000-8000-000000000002',
    code: 'B-SKILL',
    name: 'B Skill',
    pInit: 0.65,
  };
  const observedAt = new Date('2026-09-24T02:00:00.000Z');

  let prisma: {
    classOffering: { findFirst: jest.Mock };
    courseAdaptivePolicy: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      upsert: jest.Mock;
    };
    skill: { findMany: jest.Mock };
    enrollment: { findMany: jest.Mock; update: jest.Mock };
    learnerSkillState: { create: jest.Mock; update: jest.Mock; upsert: jest.Mock };
    masteryHistory: { create: jest.Mock; update: jest.Mock };
    lessonProgress: { create: jest.Mock; update: jest.Mock; upsert: jest.Mock };
  };
  let service: InstructorLearnerMasteryService;

  const enrollment = (
    overrides: Partial<{
      id: string;
      learnerId: string;
      learnerName: string;
      classOfferingId: string;
      classOfferingName: string;
      learnerSkills: Array<{
        skillId: string;
        masteryProbability: number;
        observationCount: number;
        lastObservedAt: Date | null;
      }>;
    }> = {},
  ) => ({
    id: overrides.id ?? '40000000-0000-4000-8000-000000000001',
    learnerId: overrides.learnerId ?? '50000000-0000-4000-8000-000000000001',
    learner: { fullName: overrides.learnerName ?? 'Learner One' },
    classOffering: {
      id: overrides.classOfferingId ?? '60000000-0000-4000-8000-000000000001',
      name: overrides.classOfferingName ?? 'Class A',
    },
    learnerSkills: overrides.learnerSkills ?? [],
  });

  beforeEach(() => {
    prisma = {
      classOffering: { findFirst: jest.fn().mockResolvedValue({ id: 'assigned' }) },
      courseAdaptivePolicy: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
      },
      skill: { findMany: jest.fn().mockResolvedValue([]) },
      enrollment: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      learnerSkillState: { create: jest.fn(), update: jest.fn(), upsert: jest.fn() },
      masteryHistory: { create: jest.fn(), update: jest.fn() },
      lessonProgress: { create: jest.fn(), update: jest.fn(), upsert: jest.fn() },
    };
    service = new InstructorLearnerMasteryService(prisma as unknown as PrismaService);
  });

  it('returns a current mastery dashboard for an assigned Instructor', async () => {
    prisma.skill.findMany.mockResolvedValue([skillA]);
    prisma.enrollment.findMany.mockResolvedValue([
      enrollment({
        learnerSkills: [
          {
            skillId: skillA.id,
            masteryProbability: 0.72,
            observationCount: 3,
            lastObservedAt: observedAt,
          },
        ],
      }),
    ]);

    await expect(service.getDashboard(instructorId, courseId)).resolves.toMatchObject({
      courseId,
      skills: [{ skillId: skillA.id, code: skillA.code, name: skillA.name }],
      learners: [
        {
          learnerName: 'Learner One',
          skillStates: [{ state: 'OBSERVED', masteryProbability: 0.72 }],
        },
      ],
    });
  });

  it('returns 404 before dashboard reads when Instructor is unassigned', async () => {
    prisma.classOffering.findFirst.mockResolvedValue(null);

    await expect(service.getDashboard(instructorId, courseId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.courseAdaptivePolicy.findUnique).not.toHaveBeenCalled();
    expect(prisma.skill.findMany).not.toHaveBeenCalled();
    expect(prisma.enrollment.findMany).not.toHaveBeenCalled();
  });

  it('isolates two Instructors assigned different ClassOfferings in the same Course', async () => {
    const otherInstructorId = '10000000-0000-4000-8000-000000000002';
    prisma.enrollment.findMany.mockImplementation(({ where }) => {
      const requestedInstructorId = where.classOffering.instructorId;
      return Promise.resolve([
        enrollment({
          id: `enrollment-${requestedInstructorId}`,
          learnerId: `learner-${requestedInstructorId}`,
          classOfferingId: `class-${requestedInstructorId}`,
          classOfferingName: requestedInstructorId === instructorId ? 'Class A' : 'Class B',
        }),
      ]);
    });

    const own = await service.getDashboard(instructorId, courseId);
    const other = await service.getDashboard(otherInstructorId, courseId);

    expect(own.learners.map(({ enrollmentId }) => enrollmentId)).toEqual([
      `enrollment-${instructorId}`,
    ]);
    expect(other.learners.map(({ enrollmentId }) => enrollmentId)).toEqual([
      `enrollment-${otherInstructorId}`,
    ]);
    expect(prisma.enrollment.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          status: EnrollmentStatus.ACTIVE,
          classOffering: { courseId, instructorId },
        },
      }),
    );
    expect(prisma.enrollment.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          status: EnrollmentStatus.ACTIVE,
          classOffering: { courseId, instructorId: otherInstructorId },
        },
      }),
    );
  });

  it('returns ACTIVE Enrollment rows from all own ClassOfferings', async () => {
    prisma.enrollment.findMany.mockResolvedValue([
      enrollment({ id: 'enrollment-a', classOfferingId: 'class-a', classOfferingName: 'Class A' }),
      enrollment({ id: 'enrollment-b', classOfferingId: 'class-b', classOfferingName: 'Class B' }),
    ]);

    const result = await service.getDashboard(instructorId, courseId);

    expect(result.learners.map(({ enrollmentId }) => enrollmentId)).toEqual([
      'enrollment-a',
      'enrollment-b',
    ]);
  });

  it('requests ACTIVE Enrollments only', async () => {
    await service.getDashboard(instructorId, courseId);

    expect(prisma.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: EnrollmentStatus.ACTIVE }),
      }),
    );
  });

  it('keeps two rows when the same learner has two own ACTIVE Enrollments', async () => {
    const learnerId = 'same-learner';
    prisma.enrollment.findMany.mockResolvedValue([
      enrollment({ id: 'enrollment-a', learnerId, classOfferingName: 'Class A' }),
      enrollment({ id: 'enrollment-b', learnerId, classOfferingName: 'Class B' }),
    ]);

    const result = await service.getDashboard(instructorId, courseId);

    expect(result.learners).toHaveLength(2);
    expect(result.learners.map((row) => row.learnerId)).toEqual([learnerId, learnerId]);
  });

  it('constructs PRIOR from pInit with UNASSESSED and zero observations', async () => {
    prisma.skill.findMany.mockResolvedValue([skillA]);
    prisma.enrollment.findMany.mockResolvedValue([enrollment()]);

    const result = await service.getDashboard(instructorId, courseId);

    expect(result.learners[0].skillStates[0]).toEqual({
      skillId: skillA.id,
      state: 'PRIOR',
      masteryProbability: skillA.pInit,
      masteryBand: 'UNASSESSED',
      observationCount: 0,
      lastObservedAt: null,
    });
  });

  it('returns the persisted OBSERVED state exactly', async () => {
    prisma.skill.findMany.mockResolvedValue([skillA]);
    prisma.enrollment.findMany.mockResolvedValue([
      enrollment({
        learnerSkills: [
          {
            skillId: skillA.id,
            masteryProbability: 0.55,
            observationCount: 7,
            lastObservedAt: observedAt,
          },
        ],
      }),
    ]);

    const result = await service.getDashboard(instructorId, courseId);

    expect(result.learners[0].skillStates[0]).toMatchObject({
      state: 'OBSERVED',
      masteryProbability: 0.55,
      observationCount: 7,
      lastObservedAt: observedAt,
    });
  });

  it('classifies observed mastery below the remedial threshold as REMEDIAL', async () => {
    prisma.skill.findMany.mockResolvedValue([skillA]);
    prisma.enrollment.findMany.mockResolvedValue([
      enrollment({
        learnerSkills: [
          {
            skillId: skillA.id,
            masteryProbability: 0.39,
            observationCount: 1,
            lastObservedAt: observedAt,
          },
        ],
      }),
    ]);

    const result = await service.getDashboard(instructorId, courseId);
    expect(result.learners[0].skillStates[0].masteryBand).toBe('REMEDIAL');
  });

  it('classifies the exact remedial threshold as REINFORCEMENT', async () => {
    prisma.skill.findMany.mockResolvedValue([skillA]);
    prisma.enrollment.findMany.mockResolvedValue([
      enrollment({
        learnerSkills: [
          {
            skillId: skillA.id,
            masteryProbability: DEFAULT_ADAPTIVE_POLICY.remedialThreshold,
            observationCount: 1,
            lastObservedAt: observedAt,
          },
        ],
      }),
    ]);

    const result = await service.getDashboard(instructorId, courseId);
    expect(result.learners[0].skillStates[0].masteryBand).toBe('REINFORCEMENT');
  });

  it('classifies the exact progression threshold as PROGRESSION_READY', async () => {
    prisma.skill.findMany.mockResolvedValue([skillA]);
    prisma.enrollment.findMany.mockResolvedValue([
      enrollment({
        learnerSkills: [
          {
            skillId: skillA.id,
            masteryProbability: DEFAULT_ADAPTIVE_POLICY.progressionThreshold,
            observationCount: 1,
            lastObservedAt: observedAt,
          },
        ],
      }),
    ]);

    const result = await service.getDashboard(instructorId, courseId);
    expect(result.learners[0].skillStates[0].masteryBand).toBe('PROGRESSION_READY');
  });

  it('uses persisted thresholds and reports SAVED policy source', async () => {
    prisma.courseAdaptivePolicy.findUnique.mockResolvedValue({
      remedialThreshold: 0.25,
      progressionThreshold: 0.9,
    });

    const result = await service.getDashboard(instructorId, courseId);

    expect(result.policy).toEqual({
      remedialThreshold: 0.25,
      progressionThreshold: 0.9,
      source: 'SAVED',
    });
  });

  it('uses shared DEFAULT thresholds without creating a policy', async () => {
    const result = await service.getDashboard(instructorId, courseId);

    expect(result.policy).toEqual({ ...DEFAULT_ADAPTIVE_POLICY, source: 'DEFAULT' });
    expect(prisma.courseAdaptivePolicy.create).not.toHaveBeenCalled();
    expect(prisma.courseAdaptivePolicy.update).not.toHaveBeenCalled();
    expect(prisma.courseAdaptivePolicy.upsert).not.toHaveBeenCalled();
  });

  it('returns empty Skill arrays for a Course with no Skills', async () => {
    prisma.enrollment.findMany.mockResolvedValue([enrollment()]);

    const result = await service.getDashboard(instructorId, courseId);

    expect(result.skills).toEqual([]);
    expect(result.learners[0].skillStates).toEqual([]);
  });

  it('returns learners empty for an assigned Course with no ACTIVE own Enrollments', async () => {
    prisma.skill.findMany.mockResolvedValue([skillA]);

    const result = await service.getDashboard(instructorId, courseId);

    expect(result.skills).toHaveLength(1);
    expect(result.learners).toEqual([]);
  });

  it('requests deterministic Skill ordering and preserves it in every row', async () => {
    prisma.skill.findMany.mockResolvedValue([skillA, skillB]);
    prisma.enrollment.findMany.mockResolvedValue([enrollment()]);

    const result = await service.getDashboard(instructorId, courseId);

    expect(prisma.skill.findMany).toHaveBeenCalledWith({
      where: { courseId },
      select: { id: true, code: true, name: true, pInit: true },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
    });
    expect(result.skills.map(({ skillId }) => skillId)).toEqual([skillA.id, skillB.id]);
    expect(result.learners[0].skillStates.map(({ skillId }) => skillId)).toEqual([
      skillA.id,
      skillB.id,
    ]);
  });

  it('sorts Enrollment rows by Class name/id, learner name/id, then Enrollment id', async () => {
    prisma.enrollment.findMany.mockResolvedValue([
      enrollment({
        id: 'enrollment-z',
        learnerId: 'learner-z',
        learnerName: 'Zed',
        classOfferingId: 'class-z',
        classOfferingName: 'Beta',
      }),
      enrollment({
        id: 'enrollment-b',
        learnerId: 'learner-b',
        learnerName: 'Alex',
        classOfferingId: 'class-a',
        classOfferingName: 'Alpha',
      }),
      enrollment({
        id: 'enrollment-a',
        learnerId: 'learner-a',
        learnerName: 'Alex',
        classOfferingId: 'class-a',
        classOfferingName: 'Alpha',
      }),
    ]);

    const result = await service.getDashboard(instructorId, courseId);

    expect(result.learners.map(({ enrollmentId }) => enrollmentId)).toEqual([
      'enrollment-a',
      'enrollment-b',
      'enrollment-z',
    ]);
  });

  it('filters LearnerSkillState rows to Skills in the requested Course', async () => {
    await service.getDashboard(instructorId, courseId);

    expect(prisma.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          learnerSkills: {
            where: { skill: { courseId } },
            select: {
              skillId: true,
              masteryProbability: true,
              observationCount: true,
              lastObservedAt: true,
            },
          },
        }),
      }),
    );
  });

  it('returns only minimal learner identity and no assessment secrets', async () => {
    prisma.enrollment.findMany.mockResolvedValue([enrollment()]);

    const result = await service.getDashboard(instructorId, courseId);
    const serialized = JSON.stringify(result);

    expect(result.learners[0]).toMatchObject({
      learnerId: expect.any(String),
      learnerName: 'Learner One',
    });
    expect(serialized).not.toMatch(
      /email|password|session|testAnswer|questionOption|isCorrect|explanation/i,
    );
  });

  it('uses four bounded reads without any persistence or BKT call', async () => {
    await service.getDashboard(instructorId, courseId);

    expect(prisma.classOffering.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.courseAdaptivePolicy.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.skill.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.enrollment.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.learnerSkillState.create).not.toHaveBeenCalled();
    expect(prisma.learnerSkillState.update).not.toHaveBeenCalled();
    expect(prisma.learnerSkillState.upsert).not.toHaveBeenCalled();
    expect(prisma.masteryHistory.create).not.toHaveBeenCalled();
    expect(prisma.masteryHistory.update).not.toHaveBeenCalled();
    expect(prisma.enrollment.update).not.toHaveBeenCalled();
    expect(prisma.lessonProgress.create).not.toHaveBeenCalled();
    expect(prisma.lessonProgress.update).not.toHaveBeenCalled();
    expect(prisma.lessonProgress.upsert).not.toHaveBeenCalled();
  });
});
