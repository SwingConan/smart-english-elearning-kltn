import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  AttemptEvaluationStatus,
  CourseRecommendationKind,
  CriterionRuleMode,
  EvaluationMetric,
  PlacementMode,
  Prisma,
  SkillScoreSource,
  SkillScoreStatus,
  TestAttemptStatus,
  TestPurpose,
  TestStatus,
  ToeicSkill,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { loginAgent } from './assessment-e2e-helpers';

describe('M09-D deterministic criteria administration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: ReturnType<typeof request.agent>;
  let student: ReturnType<typeof request.agent>;
  let instructor: ReturnType<typeof request.agent>;
  const sessionIds = new Set<string>();
  const userIds: string[] = [];
  const attemptIds: string[] = [];
  const unique = `${Date.now()}-${process.pid}`;
  const password = 'M09dCriteria!2026';
  const emails = {
    admin: `m09d-admin-${unique}@example.com`,
    student: `m09d-student-${unique}@example.com`,
    instructor: `m09d-instructor-${unique}@example.com`,
  };
  let courseId: string;
  let testId: string;
  let policyId: string;
  let historicalAttemptId: string;
  let futureAttemptId: string;
  let originalPolicyUpdatedAt: Date | null = null;
  let originalBands: Array<{ id: string; minValue: Prisma.Decimal; maxValue: Prisma.Decimal }> = [];
  const historicalReason = {
    schemaVersion: 1,
    evaluationPolicyCode: 'M04_PLACEMENT_LR_NORMALIZED_V1',
    evaluationLevel: 'ADVANCING',
    profile: { ruleMode: 'ALL', priority: 999 },
    criteria: [{ skill: 'READING', value: 95, min: 90, max: 100, matched: true }],
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    const policy = await prisma.evaluationPolicy.findFirstOrThrow({
      where: { placementMode: PlacementMode.LR, isActive: true },
      include: {
        bands: {
          where: { metric: EvaluationMetric.LR_NORMALIZED },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });
    policyId = policy.id;
    originalPolicyUpdatedAt = policy.updatedAt;
    originalBands = policy.bands.map(({ id, minValue, maxValue }) => ({ id, minValue, maxValue }));

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    for (const [email, fullName, role] of [
      [emails.admin, 'M09D Admin', UserRole.ADMIN_COORDINATOR],
      [emails.student, 'M09D Student', UserRole.STUDENT],
      [emails.instructor, 'M09D Instructor', UserRole.INSTRUCTOR],
    ] as const) {
      const user = await prisma.user.create({
        data: { email, fullName, role, status: UserStatus.ACTIVE, passwordHash },
      });
      userIds.push(user.id);
    }
    const course = await prisma.course.create({
      data: {
        title: `M09D Course ${unique}`,
        slug: `m09d-course-${unique}`,
        description: 'M09-D future-only fixture',
        level: 'FOUNDATION',
        isPublished: true,
        createdById: userIds[0],
      },
    });
    courseId = course.id;
    const placementTest = await prisma.test.create({
      data: {
        purpose: TestPurpose.PLACEMENT,
        placementMode: PlacementMode.LR,
        title: `M09D Placement ${unique}`,
        status: TestStatus.PUBLISHED,
      },
    });
    testId = placementTest.id;
    const historical = await createAttempt(95);
    historicalAttemptId = historical.id;
    const future = await createAttempt(65);
    futureAttemptId = future.id;
    await prisma.attemptEvaluation.create({
      data: {
        attemptId: historicalAttemptId,
        evaluationPolicyId: policyId,
        status: AttemptEvaluationStatus.FINAL,
        placementLevelCode: 'ADVANCING',
        placementLevelLabel: 'Nâng cao',
        summary: 'Historical evaluation must remain frozen.',
      },
    });
    await prisma.courseRecommendation.create({
      data: {
        attemptId: historicalAttemptId,
        courseId,
        kind: CourseRecommendationKind.PRIMARY,
        ruleReason: historicalReason,
      },
    });

    admin = request.agent(app.getHttpServer());
    student = request.agent(app.getHttpServer());
    instructor = request.agent(app.getHttpServer());
    await loginAgent(admin, emails.admin, password, sessionIds);
    await loginAgent(student, emails.student, password, sessionIds);
    await loginAgent(instructor, emails.instructor, password, sessionIds);
  });

  afterAll(async () => {
    if (prisma) {
      if (originalBands.length) {
        await prisma.$transaction(
          originalBands.map((band) =>
            prisma.evaluationBand.update({
              where: { id: band.id },
              data: { minValue: band.minValue, maxValue: band.maxValue },
            }),
          ),
        );
      }
      if (originalPolicyUpdatedAt) {
        await prisma.evaluationPolicy.update({
          where: { id: policyId },
          data: { updatedAt: originalPolicyUpdatedAt },
        });
      }
      await prisma.userSession.deleteMany({ where: { sid: { in: [...sessionIds] } } });
      await prisma.courseRecommendation.deleteMany({ where: { attemptId: { in: attemptIds } } });
      await prisma.attemptEvaluation.deleteMany({ where: { attemptId: { in: attemptIds } } });
      await prisma.attemptSkillScore.deleteMany({ where: { attemptId: { in: attemptIds } } });
      await prisma.testAttempt.deleteMany({ where: { id: { in: attemptIds } } });
      await prisma.courseSkillCriterion.deleteMany({ where: { profile: { courseId } } });
      await prisma.courseRecommendationProfile.deleteMany({ where: { courseId } });
      await prisma.test.deleteMany({ where: { id: testId } });
      await prisma.course.deleteMany({ where: { id: courseId } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (app) await app.close();
  });

  it('enforces ADMIN_COORDINATOR on representative reads and every mutation route', async () => {
    await request(app.getHttpServer()).get('/api/admin/criteria/placement-evaluation').expect(401);
    await student.get('/api/admin/criteria/placement-evaluation').expect(403);
    await instructor.get('/api/admin/criteria/course-recommendations').expect(403);
    await request(app.getHttpServer())
      .put('/api/admin/criteria/placement-evaluation')
      .send({ foundationUpperBoundary: 45, advancingLowerBoundary: 70 })
      .expect(401);
    await student
      .put('/api/admin/criteria/placement-evaluation')
      .send({ foundationUpperBoundary: 45, advancingLowerBoundary: 70 })
      .expect(403);
    await instructor
      .put(`/api/admin/criteria/course-recommendations/${courseId}`)
      .send(validProfile())
      .expect(403);
  });

  it('gets and validates placement configuration without leaking internal detail', async () => {
    const response = await admin.get('/api/admin/criteria/placement-evaluation').expect(200);
    expect(response.body.policy).toMatchObject({
      code: 'M04_PLACEMENT_LR_NORMALIZED_V1',
      placementMode: 'LR',
      isActive: true,
    });
    expect(response.body.bands.map(({ code }: { code: string }) => code)).toEqual([
      'FOUNDATION',
      'DEVELOPING',
      'ADVANCING',
    ]);
    await admin
      .put('/api/admin/criteria/placement-evaluation')
      .send({ foundationUpperBoundary: 80, advancingLowerBoundary: 70 })
      .expect(400)
      .expect((result) => expect(JSON.stringify(result.body)).not.toMatch(/Prisma|SQL|stack/i));
  });

  it('lists courses first, including an unconfigured course, and reads a null profile', async () => {
    const list = await admin
      .get(
        `/api/admin/criteria/course-recommendations?search=${encodeURIComponent(`M09D Course ${unique}`)}&profileState=UNCONFIGURED&page=1&limit=20`,
      )
      .expect(200);
    expect(list.body.data).toEqual([
      expect.objectContaining({ course: expect.objectContaining({ id: courseId }), profile: null }),
    ]);
    await admin
      .get(`/api/admin/criteria/course-recommendations/${courseId}`)
      .expect(200)
      .expect((response) => expect(response.body.profile).toBeNull());
  });

  it('updates both criteria families while preserving historical snapshots', async () => {
    const beforePolicy = await prisma.evaluationPolicy.findUniqueOrThrow({
      where: { id: policyId },
      select: { updatedAt: true },
    });
    const beforeEvaluation = await prisma.attemptEvaluation.findUniqueOrThrow({
      where: { attemptId: historicalAttemptId },
    });
    const beforeRecommendation = await prisma.courseRecommendation.findUniqueOrThrow({
      where: { attemptId_courseId: { attemptId: historicalAttemptId, courseId } },
    });

    await admin
      .put('/api/admin/criteria/placement-evaluation')
      .send({ foundationUpperBoundary: 66, advancingLowerBoundary: 80 })
      .expect(200)
      .expect((response) => {
        expect(response.body.bands).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ code: 'FOUNDATION', minValue: 0, maxValue: 66 }),
            expect.objectContaining({ code: 'DEVELOPING', minValue: 66, maxValue: 80 }),
            expect.objectContaining({ code: 'ADVANCING', minValue: 80, maxValue: 100 }),
          ]),
        );
        expect(new Date(response.body.policy.updatedAt).getTime()).toBeGreaterThan(
          beforePolicy.updatedAt.getTime(),
        );
      });
    await admin
      .put(`/api/admin/criteria/course-recommendations/${courseId}`)
      .send(validProfile())
      .expect(200)
      .expect((response) =>
        expect(response.body.profile).toMatchObject({
          isActive: true,
          ruleMode: 'ALL',
          priority: 7,
        }),
      );

    const afterEvaluation = await prisma.attemptEvaluation.findUniqueOrThrow({
      where: { attemptId: historicalAttemptId },
    });
    const afterRecommendation = await prisma.courseRecommendation.findUniqueOrThrow({
      where: { attemptId_courseId: { attemptId: historicalAttemptId, courseId } },
    });
    expect(afterEvaluation).toEqual(beforeEvaluation);
    expect(afterRecommendation).toEqual(beforeRecommendation);
  });

  it('uses the latest configuration for a new result and rejects invalid profile input', async () => {
    await admin
      .put(`/api/admin/criteria/course-recommendations/${courseId}`)
      .send({
        ...validProfile(),
        criteria: [{ skill: 'READING', minNormalizedScore: 90, maxNormalizedScore: 10 }],
      })
      .expect(400);
    await admin
      .put(`/api/admin/criteria/course-recommendations/${courseId}`)
      .send({
        ...validProfile(),
        criteria: [
          { skill: 'READING', minNormalizedScore: 0, maxNormalizedScore: 65 },
          { skill: 'READING', minNormalizedScore: 0, maxNormalizedScore: 65 },
        ],
      })
      .expect(400);

    const result = await student
      .get(`/api/placement/attempts/${futureAttemptId}/result`)
      .expect(200);
    expect(result.body.evaluation.levelCode).toBe('FOUNDATION');
    expect(result.body.recommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ course: expect.objectContaining({ id: courseId }) }),
      ]),
    );
    await expect(
      prisma.attemptEvaluation.findUniqueOrThrow({ where: { attemptId: futureAttemptId } }),
    ).resolves.toMatchObject({ placementLevelCode: 'FOUNDATION' });
  });

  function validProfile() {
    return {
      isActive: true,
      ruleMode: CriterionRuleMode.ALL,
      priority: 7,
      criteria: [
        { skill: ToeicSkill.LISTENING, minNormalizedScore: 0, maxNormalizedScore: 65 },
        { skill: ToeicSkill.READING, minNormalizedScore: 0, maxNormalizedScore: 65 },
      ],
    };
  }

  async function createAttempt(score: number) {
    const attempt = await prisma.testAttempt.create({
      data: {
        testId,
        learnerId: userIds[1],
        attemptNumber: attemptIds.length + 1,
        status: TestAttemptStatus.SUBMITTED,
        score,
        maxScore: 100,
        submittedAt: new Date(),
      },
    });
    attemptIds.push(attempt.id);
    await prisma.attemptSkillScore.createMany({
      data: [ToeicSkill.LISTENING, ToeicSkill.READING].map((skill) => ({
        attemptId: attempt.id,
        skill,
        normalizedScore: score,
        status: SkillScoreStatus.FINAL,
        source: SkillScoreSource.OBJECTIVE_AUTO,
      })),
    });
    return attempt;
  }
});
