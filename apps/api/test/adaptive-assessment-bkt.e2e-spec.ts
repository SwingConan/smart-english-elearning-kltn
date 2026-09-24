import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test as NestTest } from '@nestjs/testing';
import * as argon2 from 'argon2';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  ClassOfferingStatus,
  EnrollmentStatus,
  LessonProgressStatus,
  PricingType,
  QuestionDifficulty,
  QuestionType,
  TestStatus,
  TestType,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { computeBktUpdate } from '../src/modules/knowledge-model/bkt';
import { expectSafeError, loginAgent } from './assessment-e2e-helpers';

jest.setTimeout(30_000);

describe('Assessment to BKT to adaptive-path integration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let studentAgent: ReturnType<typeof request.agent>;
  let instructorAgent: ReturnType<typeof request.agent>;
  const sessionIds = new Set<string>();
  const unique = `${Date.now()}-${process.pid}`;
  const password = 'Vs05CrossFeature!2026';
  let adminId: string;
  let instructorId: string;
  let studentId: string;
  let courseId: string;
  let offeringId: string;
  let enrollmentId: string;
  let moduleId: string;
  let lessonId: string;
  let skillId: string;
  let questionId: string;
  let correctOptionId: string;
  let wrongOptionId: string;
  let testId: string;
  let testQuestionId: string;

  beforeAll(async () => {
    const moduleRef = await NestTest.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const [admin, instructor, student] = await Promise.all([
      prisma.user.create({
        data: {
          email: `vs05-f1-admin-${unique}@example.test`,
          passwordHash,
          fullName: 'VS05 F1 Admin',
          role: UserRole.ADMIN_COORDINATOR,
          status: UserStatus.ACTIVE,
        },
      }),
      prisma.user.create({
        data: {
          email: `vs06-d-instructor-${unique}@example.test`,
          passwordHash,
          fullName: 'VS06 D Instructor',
          role: UserRole.INSTRUCTOR,
          status: UserStatus.ACTIVE,
        },
      }),
      prisma.user.create({
        data: {
          email: `vs05-f1-student-${unique}@example.test`,
          passwordHash,
          fullName: 'VS05 F1 Student',
          role: UserRole.STUDENT,
          status: UserStatus.ACTIVE,
        },
      }),
    ]);
    adminId = admin.id;
    instructorId = instructor.id;
    studentId = student.id;

    const course = await prisma.course.create({
      data: {
        title: `VS05 F1 Cross Feature ${unique}`,
        slug: `vs05-f1-cross-feature-${unique}`,
        description: 'Assessment to BKT to adaptive-path E2E fixture',
        level: 'E2E',
        isPublished: true,
        createdById: adminId,
      },
    });
    courseId = course.id;
    const offering = await prisma.classOffering.create({
      data: {
        courseId,
        instructorId,
        name: `VS05 F1 Offering ${unique}`,
        status: ClassOfferingStatus.OPEN,
        pricingType: PricingType.FREE,
      },
    });
    offeringId = offering.id;
    const enrollment = await prisma.enrollment.create({
      data: {
        learnerId: studentId,
        classOfferingId: offeringId,
        status: EnrollmentStatus.ACTIVE,
      },
    });
    enrollmentId = enrollment.id;

    const courseModule = await prisma.module.create({
      data: { courseId, title: 'Cross Feature Module', orderIndex: 0 },
    });
    moduleId = courseModule.id;
    const lesson = await prisma.lesson.create({
      data: { moduleId, title: 'Cross Feature Lesson', orderIndex: 0 },
    });
    lessonId = lesson.id;
    const skill = await prisma.skill.create({
      data: {
        courseId,
        code: `CROSS_${unique}`,
        name: 'Cross Feature Skill',
        pInit: 0.5,
        pLearn: 0.1,
        pGuess: 0.2,
        pSlip: 0.1,
      },
    });
    skillId = skill.id;
    await prisma.lessonSkill.create({ data: { lessonId, skillId } });
    await prisma.courseAdaptivePolicy.create({
      data: { courseId, remedialThreshold: 0.4, progressionThreshold: 0.8 },
    });

    const question = await prisma.question.create({
      data: {
        courseId,
        type: QuestionType.SINGLE_CHOICE,
        difficulty: QuestionDifficulty.MEDIUM,
        content: `Cross feature objective question ${unique}`,
        explanation: 'Secret grading explanation',
        options: {
          create: [
            { content: 'Correct option', isCorrect: true, orderIndex: 0 },
            { content: 'Wrong option', isCorrect: false, orderIndex: 1 },
          ],
        },
      },
      include: { options: { orderBy: { orderIndex: 'asc' } } },
    });
    questionId = question.id;
    correctOptionId = question.options[0].id;
    wrongOptionId = question.options[1].id;
    await prisma.questionSkill.create({ data: { questionId, skillId } });

    const assessment = await prisma.test.create({
      data: {
        courseId,
        type: TestType.PLACEMENT,
        title: `VS05 F1 Assessment ${unique}`,
        status: TestStatus.PUBLISHED,
        maxAttempts: 2,
        showResultAfterSubmit: false,
      },
    });
    testId = assessment.id;
    const testQuestion = await prisma.testQuestion.create({
      data: { testId, questionId, orderIndex: 0, points: 1 },
    });
    testQuestionId = testQuestion.id;

    studentAgent = request.agent(app.getHttpServer());
    instructorAgent = request.agent(app.getHttpServer());
    await loginAgent(studentAgent, `vs05-f1-student-${unique}@example.test`, password, sessionIds);
    await loginAgent(
      instructorAgent,
      `vs06-d-instructor-${unique}@example.test`,
      password,
      sessionIds,
    );
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.masteryHistory.deleteMany({ where: { enrollmentId } });
      await prisma.learnerSkillState.deleteMany({ where: { enrollmentId } });
      await prisma.lessonProgress.deleteMany({ where: { enrollmentId } });
      const attempts = await prisma.testAttempt.findMany({
        where: { testId },
        select: { id: true },
      });
      const attemptIds = attempts.map(({ id }) => id);
      await prisma.testAnswer.deleteMany({ where: { attemptId: { in: attemptIds } } });
      await prisma.testAttempt.deleteMany({ where: { id: { in: attemptIds } } });
      await prisma.testQuestion.deleteMany({ where: { testId } });
      await prisma.test.delete({ where: { id: testId } });
      await prisma.questionSkill.deleteMany({ where: { questionId } });
      await prisma.questionOption.deleteMany({ where: { questionId } });
      await prisma.question.delete({ where: { id: questionId } });
      await prisma.lessonSkill.deleteMany({ where: { lessonId } });
      await prisma.courseAdaptivePolicy.delete({ where: { courseId } });
      await prisma.skill.delete({ where: { id: skillId } });
      await prisma.lesson.delete({ where: { id: lessonId } });
      await prisma.module.delete({ where: { id: moduleId } });
      await prisma.enrollment.delete({ where: { id: enrollmentId } });
      await prisma.classOffering.delete({ where: { id: offeringId } });
      await prisma.course.delete({ where: { id: courseId } });
      await prisma.userSession.deleteMany({ where: { sid: { in: [...sessionIds] } } });
      await prisma.user.deleteMany({
        where: { id: { in: [adminId, instructorId, studentId] } },
      });
    }
    if (app) await app.close();
  });

  it('updates both adaptive path and Instructor dashboard exactly once after a real hidden-result assessment', async () => {
    const policyBefore = await prisma.courseAdaptivePolicy.findUniqueOrThrow({
      where: { courseId },
    });
    const countsBefore = await adaptiveStateCounts();
    const dashboardBefore = await instructorDashboard();
    const repeatedDashboardBefore = await instructorDashboard();
    const before = await adaptivePath();
    const repeatedBefore = await adaptivePath();

    expect(repeatedDashboardBefore.body).toEqual(dashboardBefore.body);
    expect(dashboardSkillState(dashboardBefore.body)).toEqual({
      skillId,
      state: 'PRIOR',
      masteryProbability: 0.5,
      masteryBand: 'UNASSESSED',
      observationCount: 0,
      lastObservedAt: null,
    });
    expect(repeatedBefore.body).toEqual(before.body);
    expect(before.body.policy).toEqual({
      remedialThreshold: 0.4,
      progressionThreshold: 0.8,
      source: 'SAVED',
    });
    expect(skillClassification(before.body)).toMatchObject({
      state: 'PRIOR',
      masteryProbability: 0.5,
      masteryBand: 'UNASSESSED',
      prerequisiteStatus: 'READY',
    });
    expect(before.body.path).toEqual([
      expect.objectContaining({
        lessonId,
        category: 'PROGRESSION',
        reason: expect.objectContaining({
          reasonCode: 'PROGRESSION_PREREQUISITES_READY',
          focusSkillId: skillId,
          state: 'PRIOR',
        }),
      }),
    ]);
    expect(JSON.stringify(before.body)).not.toMatch(
      /isCorrect|correctOption|selectedOptionIds|pointsAwarded|explanation/i,
    );
    await expect(adaptiveStateCounts()).resolves.toEqual(countsBefore);
    await expect(
      prisma.courseAdaptivePolicy.findUniqueOrThrow({ where: { courseId } }),
    ).resolves.toEqual(policyBefore);

    const started = await studentAgent
      .post(`/api/learning/enrollments/${enrollmentId}/tests/${testId}/attempts`)
      .expect(201);
    const attemptId = started.body.id as string;
    const submitted = await submitAttempt(attemptId, correctOptionId).expect(201);
    expectSafeError(submitted);
    expect(submitted.body.attempt).not.toHaveProperty('score');
    expect(submitted.body.attempt).not.toHaveProperty('maxScore');
    const gradedAttempt = await prisma.testAttempt.findUniqueOrThrow({
      where: { id: attemptId },
    });
    expect(gradedAttempt).toMatchObject({ score: 1, maxScore: 1 });

    const persistedAnswer = await prisma.testAnswer.findUniqueOrThrow({
      where: { attemptId_testQuestionId: { attemptId, testQuestionId } },
    });
    expect(persistedAnswer).toMatchObject({
      isCorrect: true,
      pointsAwarded: 1,
      selectedOptionIds: [correctOptionId],
    });

    const learnerState = await prisma.learnerSkillState.findUniqueOrThrow({
      where: { enrollmentId_skillId: { enrollmentId, skillId } },
    });
    const expectedMastery = computeBktUpdate(0.5, 0.1, 0.2, 0.1, true).posteriorMastery;
    const history = await prisma.masteryHistory.findUniqueOrThrow({
      where: {
        testAnswerId_skillId: {
          testAnswerId: persistedAnswer.id,
          skillId,
        },
      },
    });
    expect(learnerState.observationCount).toBe(1);
    expect(learnerState.masteryProbability).toBeCloseTo(expectedMastery, 10);
    expect(history).toMatchObject({
      enrollmentId,
      skillId,
      testAttemptId: attemptId,
      isCorrect: true,
      priorMastery: 0.5,
    });
    expect(history.posteriorMastery).toBeCloseTo(learnerState.masteryProbability, 10);

    const dashboardAfter = await instructorDashboard();
    expect(dashboardSkillState(dashboardAfter.body)).toEqual({
      skillId,
      state: 'OBSERVED',
      masteryProbability: learnerState.masteryProbability,
      masteryBand: 'PROGRESSION_READY',
      observationCount: 1,
      lastObservedAt: learnerState.lastObservedAt?.toISOString(),
    });
    const stateBeforeDashboardRepeat = await prisma.learnerSkillState.findUniqueOrThrow({
      where: { enrollmentId_skillId: { enrollmentId, skillId } },
    });
    const historyBeforeDashboardRepeat = await prisma.masteryHistory.findMany({
      where: { enrollmentId, skillId },
      orderBy: { id: 'asc' },
    });
    const repeatedDashboardAfter = await instructorDashboard();
    expect(repeatedDashboardAfter.body).toEqual(dashboardAfter.body);
    await expect(
      prisma.learnerSkillState.findUniqueOrThrow({
        where: { enrollmentId_skillId: { enrollmentId, skillId } },
      }),
    ).resolves.toEqual(stateBeforeDashboardRepeat);
    await expect(
      prisma.masteryHistory.findMany({
        where: { enrollmentId, skillId },
        orderBy: { id: 'asc' },
      }),
    ).resolves.toEqual(historyBeforeDashboardRepeat);

    const after = await adaptivePath();
    expect(skillClassification(after.body)).toMatchObject({
      state: 'OBSERVED',
      masteryProbability: learnerState.masteryProbability,
      masteryBand: 'PROGRESSION_READY',
      prerequisiteStatus: 'READY',
    });
    expect(after.body.path).toEqual([]);
    expect(after.body.blockedLessons).toEqual([]);
    expect(JSON.stringify(after.body)).not.toMatch(
      /isCorrect|correctOption|selectedOptionIds|pointsAwarded|explanation/i,
    );
    await studentAgent
      .get(`/api/learning/enrollments/${enrollmentId}/attempts/${attemptId}/result`)
      .expect(403);

    const stateBeforeRepeat = await prisma.learnerSkillState.findUniqueOrThrow({
      where: { enrollmentId_skillId: { enrollmentId, skillId } },
    });
    const historyBeforeRepeat = await prisma.masteryHistory.findMany({
      where: { testAttemptId: attemptId },
      orderBy: { id: 'asc' },
    });
    const repeatedSubmit = await submitAttempt(attemptId, wrongOptionId).expect(201);
    expect(repeatedSubmit.body.attempt.submittedAt).toBe(submitted.body.attempt.submittedAt);
    await expect(
      prisma.learnerSkillState.findUniqueOrThrow({
        where: { enrollmentId_skillId: { enrollmentId, skillId } },
      }),
    ).resolves.toEqual(stateBeforeRepeat);
    await expect(
      prisma.masteryHistory.findMany({
        where: { testAttemptId: attemptId },
        orderBy: { id: 'asc' },
      }),
    ).resolves.toEqual(historyBeforeRepeat);
    await expect(adaptivePath()).resolves.toMatchObject({ body: after.body });
    await expect(instructorDashboard()).resolves.toMatchObject({ body: dashboardAfter.body });
    await expect(adaptiveStateCounts()).resolves.toEqual({
      policies: 1,
      learnerStates: 1,
      masteryHistory: 1,
      lessonProgress: 0,
    });
  });

  it('preserves BKT mastery and history when a real Lesson completion records progress', async () => {
    const started = await studentAgent
      .post(`/api/learning/enrollments/${enrollmentId}/tests/${testId}/attempts`)
      .expect(201);
    await submitAttempt(started.body.id as string, correctOptionId).expect(201);

    const learnerStatesBefore = await prisma.learnerSkillState.findMany({
      where: { enrollmentId },
      orderBy: { id: 'asc' },
    });
    const masteryHistoryBefore = await prisma.masteryHistory.findMany({
      where: { enrollmentId },
      orderBy: { id: 'asc' },
    });
    const pathBefore = await adaptivePath();
    const classificationBefore = skillClassification(pathBefore.body);

    expect(learnerStatesBefore).toHaveLength(1);
    expect(learnerStatesBefore[0]).toMatchObject({
      enrollmentId,
      skillId,
      observationCount: expect.any(Number),
    });
    expect(learnerStatesBefore[0].observationCount).toBeGreaterThan(0);
    expect(masteryHistoryBefore.length).toBeGreaterThan(0);
    expect(classificationBefore).toMatchObject({
      skillId,
      state: 'OBSERVED',
      masteryProbability: learnerStatesBefore[0].masteryProbability,
      masteryBand: 'PROGRESSION_READY',
      prerequisiteStatus: 'READY',
    });
    expect(
      pathBefore.body.path.some(({ lessonId: pathLessonId }: { lessonId: string }) =>
        pathLessonId === lessonId,
      ),
    ).toBe(false);
    await expect(
      prisma.lessonProgress.findUnique({
        where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
      }),
    ).resolves.toBeNull();

    const completed = await studentAgent
      .patch(`/api/learning/enrollments/${enrollmentId}/lessons/${lessonId}/complete`)
      .expect(200);
    expect(completed.body).toMatchObject({
      enrollmentId,
      lessonId,
      status: LessonProgressStatus.COMPLETED,
    });
    expect(completed.body.completedAt).toEqual(expect.any(String));
    await expect(
      prisma.lessonProgress.findUnique({
        where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
        select: { status: true, completedAt: true },
      }),
    ).resolves.toEqual({
      status: LessonProgressStatus.COMPLETED,
      completedAt: new Date(completed.body.completedAt as string),
    });

    await expect(
      prisma.learnerSkillState.findMany({
        where: { enrollmentId },
        orderBy: { id: 'asc' },
      }),
    ).resolves.toEqual(learnerStatesBefore);
    await expect(
      prisma.masteryHistory.findMany({
        where: { enrollmentId },
        orderBy: { id: 'asc' },
      }),
    ).resolves.toEqual(masteryHistoryBefore);

    const pathAfter = await adaptivePath();
    expect(skillClassification(pathAfter.body)).toEqual(classificationBefore);
    expect(
      pathAfter.body.path.some(({ lessonId: pathLessonId }: { lessonId: string }) =>
        pathLessonId === lessonId,
      ),
    ).toBe(false);
  });

  function adaptivePath() {
    return studentAgent.get(`/api/learning/enrollments/${enrollmentId}/adaptive-path`).expect(200);
  }

  function instructorDashboard() {
    return instructorAgent
      .get(`/api/instructor/courses/${courseId}/learner-mastery`)
      .expect(200);
  }

  function submitAttempt(attemptId: string, selectedOptionId: string) {
    return studentAgent
      .post(`/api/learning/enrollments/${enrollmentId}/attempts/${attemptId}/submit`)
      .send({
        answers: [{ testQuestionId, selectedOptionIds: [selectedOptionId] }],
      });
  }

  function skillClassification(body: { skillClassifications: Array<{ skillId: string }> }) {
    return body.skillClassifications.find((item) => item.skillId === skillId);
  }

  function dashboardSkillState(body: {
    learners: Array<{
      enrollmentId: string;
      skillStates: Array<{ skillId: string }>;
    }>;
  }) {
    return body.learners
      .find((learner) => learner.enrollmentId === enrollmentId)
      ?.skillStates.find((state) => state.skillId === skillId);
  }

  async function adaptiveStateCounts() {
    const [policies, learnerStates, masteryHistory, lessonProgress] = await Promise.all([
      prisma.courseAdaptivePolicy.count({ where: { courseId } }),
      prisma.learnerSkillState.count({ where: { enrollmentId } }),
      prisma.masteryHistory.count({ where: { enrollmentId } }),
      prisma.lessonProgress.count({ where: { enrollmentId } }),
    ]);
    return { policies, learnerStates, masteryHistory, lessonProgress };
  }
});
