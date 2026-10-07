import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  AnswerEvaluationStatus,
  SkillScoreStatus,
  TestAttemptStatus,
  ToeicSkill,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { InstructorWorkspaceService } from './instructor-workspace.service';

describe('InstructorWorkspaceService', () => {
  const classroom = {
    id: 'class-a',
    code: 'A01',
    name: 'Class A',
    status: 'IN_PROGRESS',
    modality: 'ONLINE',
    classStart: new Date(),
    classEnd: new Date(),
    course: { id: 'course-a', title: 'Course A', level: 'FOUNDATION' },
    scheduleSlots: [],
  };
  const prisma = {
    classOffering: { findFirst: jest.fn(), findMany: jest.fn() },
    enrollment: { count: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    lesson: { count: jest.fn() },
    module: { findMany: jest.fn() },
    lessonProgress: { count: jest.fn() },
    classAssessment: { findMany: jest.fn() },
    testAttempt: { findMany: jest.fn() },
  };
  const service = new InstructorWorkspaceService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.classOffering.findFirst.mockResolvedValue(classroom);
  });

  it('rejects a class not assigned to the current instructor without querying child data', async () => {
    prisma.classOffering.findFirst.mockResolvedValue(null);
    await expect(service.overview('instructor-a', 'class-b')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.enrollment.count).not.toHaveBeenCalled();
  });

  it('aggregates the overview with bounded aggregate queries and pending productive grading', async () => {
    prisma.enrollment.count.mockResolvedValue(3);
    prisma.lesson.count.mockResolvedValue(4);
    prisma.lessonProgress.count.mockResolvedValue(7);
    prisma.enrollment.findMany.mockResolvedValue([
      { id: 'enrollment-a', learnerId: 'learner-a', enrolledAt: new Date(), lessonProgress: [] },
    ]);
    prisma.classAssessment.findMany.mockResolvedValue([
      {
        id: 'assessment-a',
        stage: 'MIDTERM',
        openAt: null,
        closeAt: null,
        createdAt: new Date(),
        test: { id: 'test-a', title: 'Midterm' },
      },
    ]);
    prisma.testAttempt.findMany.mockResolvedValue([
      {
        learnerId: 'learner-a',
        classAssessmentId: 'assessment-a',
        status: TestAttemptStatus.SUBMITTED,
        answers: [
          { evaluations: [], testQuestion: { question: { toeicSkill: ToeicSkill.WRITING } } },
        ],
      },
    ]);
    const result = await service.overview('instructor-a', 'class-a');
    expect(result).toMatchObject({
      activeLearnerCount: 3,
      lessonProgress: { completed: 7, total: 12, percentage: 58 },
      pendingGradingCount: 1,
    });
    expect(prisma.lessonProgress.count).toHaveBeenCalledTimes(1);
    expect(prisma.testAttempt.findMany).toHaveBeenCalledTimes(1);
  });

  it('projects database time-only values without leaking the 1970 transport date', async () => {
    prisma.classOffering.findMany.mockResolvedValue([
      {
        ...classroom,
        scheduleSlots: [
          {
            dayOfWeek: 2,
            startTime: new Date('1970-01-01T18:00:00.000Z'),
            endTime: new Date('1970-01-01T20:00:00.000Z'),
            locationText: null,
          },
        ],
        _count: { enrollments: 12 },
      },
    ]);
    const result = await service.listClasses('instructor-a');
    expect(result[0].scheduleSlots).toEqual([
      { dayOfWeek: 2, startTime: '18:00', endTime: '20:00', locationText: null },
    ]);
    expect(JSON.stringify(result)).not.toContain('1970');
  });

  it('keeps learner IDs scoped to the owned class', async () => {
    prisma.enrollment.findFirst.mockResolvedValue(null);
    prisma.module.findMany.mockResolvedValue([]);
    await expect(
      service.learnerDetail('instructor-a', 'class-a', 'enrollment-from-class-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.enrollment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'enrollment-from-class-b', classOfferingId: 'class-a' },
      }),
    );
  });

  it('uses latest submitted attempts and FINAL-only scores for class averages', async () => {
    prisma.enrollment.findMany.mockResolvedValue([
      { id: 'enrollment-a', learnerId: 'learner-a', learner: { fullName: 'A', email: 'a@test' } },
      { id: 'enrollment-b', learnerId: 'learner-b', learner: { fullName: 'B', email: 'b@test' } },
    ]);
    prisma.classAssessment.findMany.mockResolvedValue([
      {
        id: 'assessment-a',
        stage: 'MIDTERM',
        createdAt: new Date(),
        openAt: null,
        closeAt: null,
        test: { id: 'test-a', title: 'Midterm', purpose: 'IN_CLASS' },
        attempts: [
          {
            id: 'new-a',
            learnerId: 'learner-a',
            attemptNumber: 2,
            submittedAt: new Date(),
            learner: { fullName: 'A', email: 'a@test' },
            skillScores: [
              {
                skill: ToeicSkill.LISTENING,
                status: SkillScoreStatus.FINAL,
                normalizedScore: { toString: () => '80' },
              },
              {
                skill: ToeicSkill.READING,
                status: SkillScoreStatus.PROVISIONAL,
                normalizedScore: { toString: () => '99' },
              },
              {
                skill: ToeicSkill.SPEAKING,
                status: SkillScoreStatus.FINAL,
                normalizedScore: { toString: () => '70' },
              },
              {
                skill: ToeicSkill.WRITING,
                status: SkillScoreStatus.FINAL,
                normalizedScore: { toString: () => '60' },
              },
            ],
          },
          {
            id: 'old-a',
            learnerId: 'learner-a',
            attemptNumber: 1,
            submittedAt: new Date(),
            learner: { fullName: 'A', email: 'a@test' },
            skillScores: [
              {
                skill: ToeicSkill.READING,
                status: SkillScoreStatus.FINAL,
                normalizedScore: { toString: () => '100' },
              },
            ],
          },
          {
            id: 'only-b',
            learnerId: 'learner-b',
            attemptNumber: 1,
            submittedAt: new Date(),
            learner: { fullName: 'B', email: 'b@test' },
            skillScores: [
              {
                skill: ToeicSkill.LISTENING,
                status: SkillScoreStatus.FINAL,
                normalizedScore: { toString: () => '60' },
              },
            ],
          },
        ],
      },
    ]);
    const result = await service.results('instructor-a', 'class-a');
    const assessment = result.assessments[0];
    expect(assessment.learners.map((item) => item.id)).toEqual(['new-a', 'only-b']);
    expect(assessment.skillAverages.find((item) => item.skill === ToeicSkill.LISTENING)).toEqual({
      skill: ToeicSkill.LISTENING,
      average: 70,
      sampleCount: 2,
      excludedCount: 0,
      distribution: { below50: 0, from50To69: 1, from70To84: 1, from85To100: 0 },
    });
    expect(assessment.skillAverages.find((item) => item.skill === ToeicSkill.READING)).toEqual({
      skill: ToeicSkill.READING,
      average: null,
      sampleCount: 0,
      excludedCount: 2,
      distribution: { below50: 0, from50To69: 0, from70To84: 0, from85To100: 0 },
    });
    expect(assessment).toMatchObject({
      submittedCount: 3,
      latestAttemptCount: 2,
      fullyGradedCount: 0,
      pendingGradingCount: 2,
    });
  });

  it('requests the class grading queue in deterministic oldest-first order', async () => {
    prisma.testAttempt.findMany.mockResolvedValue([]);
    await service.gradingInbox('instructor-a', 'class-a');
    expect(prisma.testAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          classAssessment: { classOfferingId: 'class-a' },
          status: TestAttemptStatus.SUBMITTED,
        },
        orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('classifies productive grading truthfully and excludes objective-only attempts', async () => {
    const base = {
      attemptNumber: 1,
      submittedAt: new Date(),
      learner: { id: 'learner', fullName: 'Learner', email: 'learner@test' },
      classAssessment: { id: 'assessment', stage: 'MIDTERM', test: { id: 'test', title: 'Test' } },
      skillScores: [],
    };
    prisma.testAttempt.findMany.mockResolvedValue([
      { ...base, id: 'objective-only', answers: [] },
      { ...base, id: 'waiting', answers: [{ evaluations: [] }] },
      {
        ...base,
        id: 'partial',
        answers: [
          { evaluations: [{ id: 'draft', status: AnswerEvaluationStatus.PENDING_REVIEW }] },
          { evaluations: [] },
        ],
      },
      {
        ...base,
        id: 'final',
        answers: [
          { evaluations: [{ id: 'final-a', status: AnswerEvaluationStatus.REVIEWED_FINAL }] },
          { evaluations: [{ id: 'final-b', status: AnswerEvaluationStatus.REVIEWED_FINAL }] },
        ],
      },
    ]);
    const result = await service.gradingInbox('instructor-a', 'class-a');
    expect(result.submissions.map(({ id, gradingState }) => [id, gradingState])).toEqual([
      ['waiting', 'WAITING'],
      ['partial', 'PARTIAL'],
      ['final', 'FINAL'],
    ]);
    expect(result.summary).toEqual({ waiting: 1, partial: 1, final: 1 });
  });
});
