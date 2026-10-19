import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { M08_LEGACY_PRACTICE_TEST_ID } from '../prisma/m08-seed';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { loginAgent } from './assessment-e2e-helpers';

describe('M08 canonical curriculum practice availability (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let student: ReturnType<typeof request.agent>;
  let enrollmentId: string;
  const sessionIds = new Set<string>();

  beforeAll(async () => {
    const password = process.env.SEED_DEFAULT_PASSWORD;
    if (!password) throw new Error('M08 E2E requires SEED_DEFAULT_PASSWORD and deterministic seed data');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    const enrollment = await prisma.enrollment.findFirstOrThrow({
      where: {
        status: 'ACTIVE',
        learner: { email: 'student.demo@smart-elearning.local' },
        classOffering: {
          course: { slug: 'demo-english-foundations' },
          classAssessments: {
            some: { isActive: true, test: { purpose: 'PRACTICE_MOCK', lessonId: { not: null } } },
          },
        },
      },
      select: { id: true },
    });
    enrollmentId = enrollment.id;
    student = request.agent(app.getHttpServer());
    await loginAgent(student, 'student.demo@smart-elearning.local', password, sessionIds);
  });

  afterAll(async () => {
    if (prisma) await prisma.userSession.deleteMany({ where: { sid: { in: [...sessionIds] } } });
    if (app) await app.close();
  });

  it('lists exactly the seven linked canonical practices and excludes the retired legacy test', async () => {
    const response = await student.get(`/api/learning/enrollments/${enrollmentId}/tests`).expect(200);
    const linkedPractices = response.body.filter(
      (item: { purpose: string; lessonId: string | null }) =>
        item.purpose === 'PRACTICE_MOCK' && item.lessonId !== null,
    );

    expect(linkedPractices).toHaveLength(7);
    expect(response.body.map((item: { id: string }) => item.id)).not.toContain(
      M08_LEGACY_PRACTICE_TEST_ID,
    );
  });

  it('resolves the canonical lesson CTA to its active class assignment', async () => {
    const practice = await prisma.test.findFirstOrThrow({
      where: {
        course: { slug: 'demo-english-foundations' },
        purpose: 'PRACTICE_MOCK',
        status: 'PUBLISHED',
        title: 'Bài luyện sau bài học — Part 1',
        lessonId: { not: null },
      },
      select: {
        id: true,
        lessonId: true,
        classAssessments: {
          where: { isActive: true },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!practice.lessonId) throw new Error('Canonical Part 1 practice must be lesson-linked');

    const lesson = await student
      .post(`/api/learning/enrollments/${enrollmentId}/lessons/${practice.lessonId}/open`)
      .expect(201);
    expect(lesson.body.practice).toEqual({
      classAssessmentId: practice.classAssessments[0].id,
      testId: practice.id,
      title: 'Bài luyện sau bài học — Part 1',
    });
  });

  it('rejects starting the retired legacy practice without deleting its history', async () => {
    const before = await prisma.test.findUniqueOrThrow({
      where: { id: M08_LEGACY_PRACTICE_TEST_ID },
      select: { status: true, _count: { select: { testQuestions: true, attempts: true } } },
    });
    expect(before).toMatchObject({ status: 'DRAFT', _count: { testQuestions: 3 } });

    await student
      .post(`/api/learning/enrollments/${enrollmentId}/tests/${M08_LEGACY_PRACTICE_TEST_ID}/attempts`)
      .expect(404);

    const after = await prisma.test.findUniqueOrThrow({
      where: { id: M08_LEGACY_PRACTICE_TEST_ID },
      select: { status: true, _count: { select: { testQuestions: true, attempts: true } } },
    });
    expect(after).toEqual(before);
  });
});
