import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { loginAgent } from './assessment-e2e-helpers';
import writeXlsxFile from 'write-excel-file/node';

describe('M07 Instructor LMS acceptance journey (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let instructor: ReturnType<typeof request.agent>;
  let student: ReturnType<typeof request.agent>;
  let classOfferingId: string;
  let enrollmentId: string;
  let resourceId: string;
  let lessonId: string;
  let courseId: string;
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
      where: {
        learner: { email: 'student.demo@smart-elearning.local' },
        status: 'ACTIVE',
        classOffering: {
          code: 'TOEIC-LR-2609-EVE',
          instructor: { email: 'instructor.demo@smart-elearning.local' },
        },
      },
      select: { id: true, classOfferingId: true, classOffering: { select: { courseId: true } } },
    });
    enrollmentId = enrollment.id;
    classOfferingId = enrollment.classOfferingId;
    courseId = enrollment.classOffering.courseId;
    const resource = await prisma.learningResource.findFirstOrThrow({
      where: { storageKey: 'm07/instructor-class-handbook.txt', lesson: { module: { course: { classOfferings: { some: { id: classOfferingId } } } } } },
      select: { id: true, lessonId: true },
    });
    resourceId = resource.id;
    lessonId = resource.lessonId;
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
    await student.post(`/api/learning/enrollments/${enrollmentId}/lessons/${lessonId}/open`).expect(201)
      .expect((response) => {
        expect(response.body.resources).toEqual(expect.arrayContaining([expect.objectContaining({ id: resourceId })]));
        expect(JSON.stringify(response.body.resources)).not.toContain('storageKey');
      });
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
    expect(grading.body.summary).toEqual(expect.objectContaining({ waiting: expect.any(Number), partial: expect.any(Number), final: expect.any(Number) }));
    expect(grading.body.submissions).toEqual(expect.arrayContaining([expect.objectContaining({ productiveFinalizedCount: expect.any(Number), productiveTotal: expect.any(Number) })]));
    const timestamps = grading.body.submissions.map((item: { submittedAt: string }) => new Date(item.submittedAt).getTime());
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
    const results = await instructor.get(`/api/instructor/classes/${classOfferingId}/results`).expect(200);
    expect(results.body.assessments).toEqual(expect.arrayContaining([expect.objectContaining({
      submittedCount: expect.any(Number), latestAttemptCount: expect.any(Number), fullyGradedCount: expect.any(Number), pendingGradingCount: expect.any(Number),
      skillAverages: expect.arrayContaining([expect.objectContaining({ sampleCount: expect.any(Number), excludedCount: expect.any(Number) })]),
    })]));
    expect(JSON.stringify(results.body)).not.toMatch(/official|bestScore|toeicTotal/i);
  });

  it('imports a question, finds it through pagination, adds it to a Part and publishes the draft', async () => {
    const marker = `M07 isolated import ${Date.now()}`;
    const file = await writeXlsxFile([
      ['skill', 'type', 'difficulty', 'content', 'explanation', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_options', 'rubric_id'],
      ['READING', 'SINGLE_CHOICE', 'EASY', marker, 'Isolated E2E fixture', 'Correct', 'Distractor', '', '', 'A', ''],
    ], { sheet: 'Questions' }).toBuffer();
    let questionId: string | undefined;
    let testId: string | undefined;
    let published = false;
    try {
      const preview = await instructor.post(`/api/instructor/courses/${courseId}/questions/import-preview`)
        .attach('file', file, { filename: 'm07-isolated.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        .expect(201);
      expect(preview.body).toEqual(expect.objectContaining({ canConfirm: true, summary: { total: 1, valid: 1, invalid: 0, warnings: 0 } }));
      const confirmed = await instructor.post(`/api/instructor/courses/${courseId}/questions/import-confirm`)
        .send({ rows: [preview.body.rows[0].input] }).expect(201);
      questionId = confirmed.body.questionIds[0];
      const found = await instructor.get(`/api/instructor/courses/${courseId}/questions?page=1&pageSize=20&search=${encodeURIComponent(marker)}&skill=READING`).expect(200);
      expect(found.body).toEqual(expect.objectContaining({ total: 1, totalPages: 1, items: [expect.objectContaining({ id: questionId, content: marker })] }));

      const draft = await instructor.post(`/api/instructor/courses/${courseId}/tests`).send({
        type: 'IN_CLASS', title: marker, description: 'Disposable M07 E2E draft', lessonId, maxAttempts: 1, showResultAfterSubmit: true,
      }).expect(201);
      testId = draft.body.id;
      const part = await instructor.post(`/api/instructor/tests/${testId}/groups`).send({ skill: 'READING', title: 'Reading Part' }).expect(201);
      await instructor.post(`/api/instructor/tests/${testId}/questions`).send({ questionId, groupId: part.body.id, points: 1 }).expect(201);
      await instructor.patch(`/api/instructor/tests/${testId}/publish`).expect(200);
      published = true;
    } finally {
      if (testId) {
        if (published) await instructor.patch(`/api/instructor/tests/${testId}/unpublish`).expect(200);
        await instructor.delete(`/api/instructor/tests/${testId}`).expect(200);
      }
      if (questionId) await instructor.delete(`/api/instructor/questions/${questionId}`).expect(200);
    }
  });
});
