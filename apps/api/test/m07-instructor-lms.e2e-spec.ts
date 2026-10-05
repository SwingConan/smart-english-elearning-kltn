import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { loginAgent } from './assessment-e2e-helpers';

describe('M07 Instructor LMS acceptance journey (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let instructor: ReturnType<typeof request.agent>;
  let student: ReturnType<typeof request.agent>;
  let classOfferingId: string;
  let enrollmentId: string;
  let resourceId: string;
  const sessionIds = new Set<string>();

  beforeAll(async () => {
    const password = process.env.SEED_DEFAULT_PASSWORD;
    if (!password) throw new Error('M07 E2E requires SEED_DEFAULT_PASSWORD and deterministic seed data');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    const enrollment = await prisma.enrollment.findFirstOrThrow({
      where: { learner: { email: 'student.demo@smart-elearning.local' }, status: 'ACTIVE', classOffering: { instructor: { email: 'instructor.demo@smart-elearning.local' } } },
      select: { id: true, classOfferingId: true },
    });
    enrollmentId = enrollment.id;
    classOfferingId = enrollment.classOfferingId;
    const resource = await prisma.learningResource.findFirstOrThrow({
      where: { storageKey: 'm07/instructor-class-handbook.txt', lesson: { module: { course: { classOfferings: { some: { id: classOfferingId } } } } } },
      select: { id: true },
    });
    resourceId = resource.id;
    instructor = request.agent(app.getHttpServer());
    student = request.agent(app.getHttpServer());
    await loginAgent(instructor, 'instructor.demo@smart-elearning.local', password, sessionIds);
    await loginAgent(student, 'student.demo@smart-elearning.local', password, sessionIds);
  });

  afterAll(async () => {
    if (prisma) await prisma.userSession.deleteMany({ where: { sid: { in: [...sessionIds] } } });
    if (app) await app.close();
  });

  it('opens the assigned class workspace, overview, roster and learner detail', async () => {
    const classes = await instructor.get('/api/instructor/classes').expect(200);
    expect(classes.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: classOfferingId, activeLearnerCount: expect.any(Number) })]));
    const overview = await instructor.get(`/api/instructor/classes/${classOfferingId}/overview`).expect(200);
    expect(overview.body).toEqual(expect.objectContaining({ activeLearnerCount: expect.any(Number), lessonProgress: expect.objectContaining({ percentage: expect.any(Number) }), pendingGradingCount: expect.any(Number) }));
    const roster = await instructor.get(`/api/instructor/classes/${classOfferingId}/learners`).expect(200);
    expect(roster.body.learners.length).toBeGreaterThanOrEqual(8);
    expect(roster.body.learners[0]).toEqual(expect.objectContaining({ progressPercentage: expect.any(Number), submittedAssessmentCount: expect.any(Number), pendingGradingCount: expect.any(Number) }));
    await instructor.get(`/api/instructor/classes/${classOfferingId}/learners/${enrollmentId}`).expect(200).expect((response) => {
      expect(response.body).toEqual(expect.objectContaining({ lessonProgress: expect.any(Array), attempts: expect.any(Array) }));
    });
  });

  it('blocks cross-class workspace IDs without leaking child data', async () => {
    await instructor.get('/api/instructor/classes/00000000-0000-4000-8000-000000000099/learners').expect(403);
    await instructor.get(`/api/instructor/classes/${classOfferingId}/learners/00000000-0000-4000-8000-000000000099`).expect(404);
    await student.get(`/api/instructor/classes/${classOfferingId}/overview`).expect(403);
  });

  it('delivers a stored document only to eligible authenticated users with safe headers', async () => {
    await request(app.getHttpServer()).get(`/api/learning/enrollments/${enrollmentId}/resources/${resourceId}/download`).expect(401);
    await student.get(`/api/learning/enrollments/${enrollmentId}/resources/${resourceId}/download`).expect(200)
      .expect('Content-Type', /text\/plain/).expect('Content-Disposition', /attachment; filename="cam-nang-hoc-tap.txt"/);
    await instructor.get(`/api/instructor/resources/${resourceId}/file`).expect(200)
      .expect('Content-Type', /text\/plain/).expect('Content-Disposition', /inline; filename="cam-nang-hoc-tap.txt"/);
  });

  it('rejects stale shared curriculum edits and permits an explicit fresh restore', async () => {
    const module = await prisma.module.findFirstOrThrow({ where: { course: { classOfferings: { some: { id: classOfferingId } } } }, orderBy: { orderIndex: 'asc' }, select: { id: true, description: true, updatedAt: true } });
    const changed = await instructor.patch(`/api/instructor/modules/${module.id}`).send({ description: 'M07 concurrency probe', expectedUpdatedAt: module.updatedAt.toISOString() }).expect(200);
    await instructor.patch(`/api/instructor/modules/${module.id}`).send({ description: 'stale overwrite', expectedUpdatedAt: module.updatedAt.toISOString() }).expect(409)
      .expect((response) => expect(response.body.code).toBe('STALE_SHARED_CONTENT'));
    await instructor.patch(`/api/instructor/modules/${module.id}`).send({ description: module.description, expectedUpdatedAt: changed.body.updatedAt }).expect(200);
  });

  it('projects oldest-first grading work and truthful latest-attempt class results', async () => {
    const grading = await instructor.get(`/api/instructor/classes/${classOfferingId}/grading`).expect(200);
    const timestamps = grading.body.submissions.map((item: { submittedAt: string }) => new Date(item.submittedAt).getTime());
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
    const results = await instructor.get(`/api/instructor/classes/${classOfferingId}/results`).expect(200);
    expect(results.body.assessments).toEqual(expect.arrayContaining([expect.objectContaining({
      submittedCount: expect.any(Number), latestAttemptCount: expect.any(Number), fullyGradedCount: expect.any(Number), pendingGradingCount: expect.any(Number),
      skillAverages: expect.arrayContaining([expect.objectContaining({ sampleCount: expect.any(Number), excludedCount: expect.any(Number) })]),
    })]));
    expect(JSON.stringify(results.body)).not.toMatch(/official|bestScore|toeicTotal/i);
  });
});
