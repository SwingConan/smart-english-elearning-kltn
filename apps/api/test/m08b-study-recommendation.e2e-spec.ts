import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { loginAgent } from './assessment-e2e-helpers';

const SECOND_SOURCE_ATTEMPT_ID = 'f3600000-0000-4000-8000-000000000099';
const DEFAULT_POLICY = {
  weakThreshold: 60,
  strongThreshold: 80,
  minimumTaskQuestions: 2,
  maxRecommendations: 3,
};

type LearnerFixture = {
  agent: ReturnType<typeof request.agent>;
  enrollmentId: string;
};

describe('M08-B study recommendations (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: ReturnType<typeof request.agent>;
  let studentDemo: LearnerFixture;
  let thuTrang: LearnerFixture;
  let baoLong: LearnerFixture;
  let studentNewestFinalAttemptId: string;
  const sessionIds = new Set<string>();

  beforeAll(async () => {
    const password = process.env.SEED_DEFAULT_PASSWORD;
    if (!password) throw new Error('M08-B E2E requires deterministic seed credentials');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    studentDemo = await learnerFixture('student.demo@smart-elearning.local', password);
    thuTrang = await learnerFixture('thu.trang@smart-elearning.local', password);
    baoLong = await learnerFixture('bao.long@smart-elearning.local', password);
    studentNewestFinalAttemptId = (
      await prisma.testAttempt.findFirstOrThrow({
        where: {
          enrollmentId: studentDemo.enrollmentId,
          status: 'SUBMITTED',
          submittedAt: new Date('2026-10-04T12:30:00.000Z'),
          test: { purpose: 'IN_CLASS' },
        },
        select: { id: true },
      })
    ).id;
    admin = request.agent(app.getHttpServer());
    await loginAgent(admin, 'admin.demo@smart-elearning.local', password, sessionIds);
    await cleanupGeneratedState();
  });

  afterAll(async () => {
    if (prisma) {
      await cleanupGeneratedState();
      await prisma.studyRecommendationPolicy.update({
        where: { code: 'M08_STUDY_REC_V1' },
        data: { ...DEFAULT_POLICY, isActive: true },
      });
      await prisma.userSession.deleteMany({ where: { sid: { in: [...sessionIds] } } });
    }
    if (app) await app.close();
  });

  it('uses student.demo newest FINAL midterm from 2026-10-04 and ignores the older pending attempt', async () => {
    const [first, concurrent] = await Promise.all([
      studentDemo.agent
        .get(`/api/learning/enrollments/${studentDemo.enrollmentId}/recommendations`)
        .expect(200),
      studentDemo.agent
        .get(`/api/learning/enrollments/${studentDemo.enrollmentId}/recommendations`)
        .expect(200),
    ]);

    expect(first.body).toMatchObject({
      state: 'READY',
      source: {
        attemptId: studentNewestFinalAttemptId,
        submittedAt: '2026-10-04T12:30:00.000Z',
      },
      pendingNewerAttempt: null,
    });
    expect(first.body.recommendations.length).toBeGreaterThan(0);
    expect(first.body.recommendations.length).toBeLessThanOrEqual(3);
    expect(first.body.recommendations[0]).toMatchObject({
      priority: 1,
      targetType: 'LESSON',
      reasonStatus: 'AVAILABLE',
      lesson: {
        path: expect.stringContaining(
          `/student/enrollments/${studentDemo.enrollmentId}/lessons/`,
        ),
      },
      practice: {
        actionable: true,
        availability: 'AVAILABLE',
        startPath: expect.stringContaining(
          `/api/learning/enrollments/${studentDemo.enrollmentId}/tests/`,
        ),
      },
    });
    expect(concurrent.body.recommendations.map((item: { id: string }) => item.id)).toEqual(
      first.body.recommendations.map((item: { id: string }) => item.id),
    );
    expect(first.body.schedule7Days).toHaveLength(7);
    expect(JSON.stringify(first.body)).not.toMatch(
      /storageKey|isCorrect|correctOption|transcript/i,
    );

    const countBefore = await prisma.studyRecommendation.count({
      where: {
        enrollmentId: studentDemo.enrollmentId,
        sourceAttemptId: studentNewestFinalAttemptId,
      },
    });
    const second = await studentDemo.agent
      .get(`/api/learning/enrollments/${studentDemo.enrollmentId}/recommendations`)
      .expect(200);
    const countAfter = await prisma.studyRecommendation.count({
      where: {
        enrollmentId: studentDemo.enrollmentId,
        sourceAttemptId: studentNewestFinalAttemptId,
      },
    });
    expect(second.body.recommendations.map((item: { id: string }) => item.id)).toEqual(
      first.body.recommendations.map((item: { id: string }) => item.id),
    );
    expect(countAfter).toBe(countBefore);
  });

  it('keeps thu.trang prior FINAL recommendation while exposing the newer PARTIAL midterm', async () => {
    const response = await thuTrang.agent
      .get(`/api/learning/enrollments/${thuTrang.enrollmentId}/recommendations`)
      .expect(200);

    expect(response.body).toMatchObject({
      state: 'READY',
      source: { submittedAt: '2026-09-23T12:30:00.000Z' },
      pendingNewerAttempt: {
        submittedAt: '2026-10-09T12:30:00.000Z',
        pendingSkills: ['WRITING'],
      },
    });
    expect(response.body.recommendations.length).toBeGreaterThan(0);
    expect(response.body.focus?.skill).not.toBe('SPEAKING');
    expect(response.body.focus?.skill).not.toBe('WRITING');
    expect(JSON.stringify(response.body.pendingNewerAttempt)).not.toContain('normalizedScore');
  });

  it('returns PENDING_REVIEW for bao.long without inventing a prior final source', async () => {
    const response = await baoLong.agent
      .get(`/api/learning/enrollments/${baoLong.enrollmentId}/recommendations`)
      .expect(200);

    expect(response.body).toMatchObject({
      state: 'PENDING_REVIEW',
      source: null,
      pendingNewerAttempt: {
        submittedAt: '2026-10-10T12:30:00.000Z',
        pendingSkills: expect.arrayContaining(['SPEAKING', 'WRITING']),
      },
      recommendations: [],
      schedule7Days: [],
    });
  });

  it('enforces ownership using the existing not-found convention', async () => {
    await studentDemo.agent
      .get(`/api/learning/enrollments/${thuTrang.enrollmentId}/recommendations`)
      .expect(404);
  });

  it('applies policy changes only to a new source and retains frozen history', async () => {
    await admin.get('/api/admin/study-recommendation-policy').expect(200).expect(({ body }) => {
      expect(body).toMatchObject({ code: 'M08_STUDY_REC_V1', ...DEFAULT_POLICY });
    });
    await admin
      .put('/api/admin/study-recommendation-policy')
      .send({ ...DEFAULT_POLICY, weakThreshold: 85, strongThreshold: 80 })
      .expect(400);
    await studentDemo.agent
      .put('/api/admin/study-recommendation-policy')
      .send({ ...DEFAULT_POLICY, weakThreshold: 55, strongThreshold: 85 })
      .expect(403);
    await admin
      .put('/api/admin/study-recommendation-policy')
      .send({ ...DEFAULT_POLICY, weakThreshold: 55, strongThreshold: 85 })
      .expect(200);

    const unchanged = await studentDemo.agent
      .get(`/api/learning/enrollments/${studentDemo.enrollmentId}/recommendations`)
      .expect(200);
    expect(unchanged.body.recommendations[0].reason.policy).toMatchObject({
      weakThreshold: 60,
      strongThreshold: 80,
    });

    await createSecondEligibleSource();
    const next = await studentDemo.agent
      .get(`/api/learning/enrollments/${studentDemo.enrollmentId}/recommendations`)
      .expect(200);
    expect(next.body).toMatchObject({
      state: 'READY',
      source: { attemptId: SECOND_SOURCE_ATTEMPT_ID },
      pendingNewerAttempt: null,
    });
    expect(next.body.recommendations[0].reason.policy).toMatchObject({
      weakThreshold: 55,
      strongThreshold: 85,
    });
    const oldHistory = next.body.history.find(
      (item: { sourceAttemptId: string }) =>
        item.sourceAttemptId === studentNewestFinalAttemptId,
    );
    expect(oldHistory).toBeDefined();
    expect(oldHistory.current).toBe(false);
    expect(oldHistory.recommendations[0].reason.policy.weakThreshold).toBe(60);
  });

  async function learnerFixture(email: string, password: string): Promise<LearnerFixture> {
    const enrollment = await prisma.enrollment.findFirstOrThrow({
      where: {
        learner: { email },
        status: 'ACTIVE',
        classOffering: { course: { slug: 'demo-english-foundations' } },
      },
      select: { id: true },
    });
    const agent = request.agent(app.getHttpServer());
    await loginAgent(agent, email, password, sessionIds);
    return { agent, enrollmentId: enrollment.id };
  }

  async function createSecondEligibleSource() {
    const source = await prisma.testAttempt.findUniqueOrThrow({
      where: { id: studentNewestFinalAttemptId },
      include: { answers: true, skillScores: true },
    });
    await prisma.testAttempt.create({
      data: {
        id: SECOND_SOURCE_ATTEMPT_ID,
        testId: source.testId,
        learnerId: source.learnerId,
        enrollmentId: source.enrollmentId,
        classAssessmentId: source.classAssessmentId,
        attemptNumber: 99,
        status: source.status,
        score: source.score,
        maxScore: source.maxScore,
        startedAt: new Date('2026-10-05T12:30:00Z'),
        submittedAt: new Date('2026-10-05T12:55:00Z'),
        answers: {
          create: source.answers.map((answer) => ({
            testQuestionId: answer.testQuestionId,
            selectedOptionIds: answer.selectedOptionIds,
            textResponse: answer.textResponse,
            audioStorageKey: null,
            isCorrect: answer.isCorrect,
            pointsAwarded: answer.pointsAwarded,
          })),
        },
        skillScores: {
          create: source.skillScores.map((score) => ({
            skill: score.skill,
            rawScore: score.rawScore,
            maxRawScore: score.maxRawScore,
            normalizedScore: score.normalizedScore,
            estimatedToeicScore: score.estimatedToeicScore,
            status: score.status,
            source: score.source,
          })),
        },
      },
    });
  }

  async function cleanupGeneratedState() {
    const enrollmentIds = [studentDemo, thuTrang, baoLong]
      .filter(Boolean)
      .map(({ enrollmentId }) => enrollmentId);
    if (enrollmentIds.length) {
      await prisma.studyRecommendation.deleteMany({
        where: { enrollmentId: { in: enrollmentIds } },
      });
    }
    const second = await prisma.testAttempt.findUnique({
      where: { id: SECOND_SOURCE_ATTEMPT_ID },
      select: { id: true },
    });
    if (second) {
      await prisma.attemptSkillScore.deleteMany({ where: { attemptId: second.id } });
      await prisma.testAnswer.deleteMany({ where: { attemptId: second.id } });
      await prisma.testAttempt.delete({ where: { id: second.id } });
    }
  }
});
