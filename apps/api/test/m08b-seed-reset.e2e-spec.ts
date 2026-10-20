import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { seedM07 } from '../prisma/m07-seed';
import {
  M06_FINAL_ASSESSMENT_ID,
  M06_MIDTERM_ASSESSMENT_ID,
  M06_PERIODIC_ASSESSMENT_ID,
} from '../prisma/m06-seed';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { loginAgent } from './assessment-e2e-helpers';

const DEMO_SUBMITTED_ATTEMPT_ID = 'f3000000-0000-4000-8000-000000000001';
const OUTSIDE_RECOMMENDATION_ID = 'f8900000-0000-4000-8000-000000000001';
const RESET_ASSESSMENT_IDS = [
  M06_PERIODIC_ASSESSMENT_ID,
  M06_MIDTERM_ASSESSMENT_ID,
  M06_FINAL_ASSESSMENT_ID,
];

describe('M08-B seed recommendation reset (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sessionIds = new Set<string>();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.studyRecommendation.deleteMany({ where: { id: OUTSIDE_RECOMMENDATION_ID } });
      await prisma.userSession.deleteMany({ where: { sid: { in: [...sessionIds] } } });
    }
    if (app) await app.close();
  });

  it('removes only recommendations derived from M06 attempts before resetting them', async () => {
    const password = process.env.SEED_DEFAULT_PASSWORD;
    if (!password) throw new Error('M08-B seed reset E2E requires deterministic seed credentials');

    const enrollment = await prisma.enrollment.findFirstOrThrow({
      where: {
        learner: { email: 'student.demo@smart-elearning.local' },
        status: 'ACTIVE',
        classOffering: { course: { slug: 'demo-english-foundations' } },
      },
      select: {
        id: true,
        learner: { select: { passwordHash: true } },
        classOffering: { select: { id: true, courseId: true } },
      },
    });
    const student = request.agent(app.getHttpServer());
    await loginAgent(student, 'student.demo@smart-elearning.local', password, sessionIds);
    await student.get(`/api/learning/enrollments/${enrollment.id}/recommendations`).expect(200);

    const resetAttemptIds = (
      await prisma.testAttempt.findMany({
        where: { classAssessmentId: { in: RESET_ASSESSMENT_IDS } },
        select: { id: true },
      })
    ).map(({ id }) => id);
    expect(resetAttemptIds.length).toBeGreaterThan(0);

    const generated = await prisma.studyRecommendation.findFirstOrThrow({
      where: { enrollmentId: enrollment.id, sourceAttemptId: { in: resetAttemptIds } },
      orderBy: { priority: 'asc' },
    });
    const policyBefore = await prisma.studyRecommendationPolicy.findUniqueOrThrow({
      where: { code: 'M08_STUDY_REC_V1' },
    });

    await prisma.studyRecommendation.upsert({
      where: { id: OUTSIDE_RECOMMENDATION_ID },
      update: { sourceAttemptId: DEMO_SUBMITTED_ATTEMPT_ID },
      create: {
        id: OUTSIDE_RECOMMENDATION_ID,
        learnerId: generated.learnerId,
        enrollmentId: generated.enrollmentId,
        sourceAttemptId: DEMO_SUBMITTED_ATTEMPT_ID,
        policyId: generated.policyId,
        priority: 99,
        ruleReason: { regressionFixture: true },
        skill: generated.skill,
        targetType: generated.targetType,
        lessonId: generated.lessonId,
        resourceId: generated.resourceId,
        title: 'Seed reset scope regression fixture',
        actionText: 'Must survive the M06 attempt reset.',
        isActive: true,
      },
    });

    await seedM07(prisma, {
      courseId: enrollment.classOffering.courseId,
      classOfferingId: enrollment.classOffering.id,
      passwordHash: enrollment.learner.passwordHash,
    });

    await expect(
      prisma.studyRecommendation.count({
        where: { sourceAttemptId: { in: resetAttemptIds } },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.studyRecommendation.findUnique({ where: { id: OUTSIDE_RECOMMENDATION_ID } }),
    ).resolves.not.toBeNull();
    await expect(
      prisma.studyRecommendationPolicy.findUniqueOrThrow({ where: { code: 'M08_STUDY_REC_V1' } }),
    ).resolves.toEqual(policyBefore);
  });
});
