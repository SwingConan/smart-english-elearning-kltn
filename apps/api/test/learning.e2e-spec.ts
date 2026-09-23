import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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
  ResourceType,
  TestStatus,
  TestType,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { computeBktUpdate } from '../src/modules/knowledge-model/bkt';

describe('Student learning APIs (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let studentAgent: ReturnType<typeof request.agent>;
  let otherStudentAgent: ReturnType<typeof request.agent>;
  let instructorAgent: ReturnType<typeof request.agent>;
  let adminAgent: ReturnType<typeof request.agent>;
  const unique = `${Date.now()}-${process.pid}`;
  const password = 'Vs02Learning!2026';
  const sessionIds = new Set<string>();
  const userIds: string[] = [];
  const courseIds: string[] = [];
  const enrollments = new Map<EnrollmentStatus | string, string>();
  let courseId: string;
  let lessonAId: string;
  let lessonBId: string;
  let foreignLessonId: string;
  let observedSkillId: string;
  let priorSkillId: string;
  let foreignSkillId: string;
  let hiddenResultAttemptId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    const hash = await argon2.hash(password, { type: argon2.argon2id });
    const [admin, instructor, student, otherStudent] = await Promise.all([
      createUser('admin', UserRole.ADMIN_COORDINATOR, hash), createUser('instructor', UserRole.INSTRUCTOR, hash),
      createUser('student', UserRole.STUDENT, hash), createUser('other-student', UserRole.STUDENT, hash),
    ]);
    userIds.push(admin.id, instructor.id, student.id, otherStudent.id);
    const [course, foreignCourse, emptyCourse] = await Promise.all([createCourse('course', admin.id), createCourse('foreign', admin.id), createCourse('empty', admin.id)]);
    courseIds.push(course.id, foreignCourse.id, emptyCourse.id);
    courseId = course.id;
    const module = await prisma.module.create({ data: { courseId, title: 'Module', orderIndex: 0 } });
    const foreignModule = await prisma.module.create({ data: { courseId: foreignCourse.id, title: 'Foreign module', orderIndex: 0 } });
    const [lessonA, lessonB, foreignLesson] = await Promise.all([
      prisma.lesson.create({ data: { moduleId: module.id, title: 'Lesson A', orderIndex: 0 } }),
      prisma.lesson.create({ data: { moduleId: module.id, title: 'Lesson B', orderIndex: 1 } }),
      prisma.lesson.create({ data: { moduleId: foreignModule.id, title: 'Foreign lesson', orderIndex: 0 } }),
    ]);
    lessonAId = lessonA.id; lessonBId = lessonB.id; foreignLessonId = foreignLesson.id;
    await prisma.learningResource.createMany({ data: [
      { lessonId: lessonA.id, title: 'Video', type: ResourceType.VIDEO, url: 'https://example.test/video', orderIndex: 0 },
      { lessonId: lessonA.id, title: 'Document', type: ResourceType.DOCUMENT, url: 'https://example.test/doc', orderIndex: 1, isDownloadable: true },
    ] });

    for (const status of Object.values(EnrollmentStatus)) {
      const offering = await prisma.classOffering.create({ data: { courseId, instructorId: instructor.id, name: `${status} class`, status: ClassOfferingStatus.OPEN, pricingType: PricingType.FREE } });
      const enrollment = await prisma.enrollment.create({ data: { learnerId: student.id, classOfferingId: offering.id, status } });
      enrollments.set(status, enrollment.id);
    }
    const otherOffering = await prisma.classOffering.create({ data: { courseId, instructorId: instructor.id, name: 'Other student class', status: ClassOfferingStatus.OPEN, pricingType: PricingType.FREE } });
    const otherEnrollment = await prisma.enrollment.create({ data: { learnerId: otherStudent.id, classOfferingId: otherOffering.id, status: EnrollmentStatus.ACTIVE } });
    enrollments.set('OTHER', otherEnrollment.id);
    const emptyOffering = await prisma.classOffering.create({ data: { courseId: emptyCourse.id, instructorId: instructor.id, name: 'Empty course class', status: ClassOfferingStatus.OPEN, pricingType: PricingType.FREE } });
    const emptyEnrollment = await prisma.enrollment.create({ data: { learnerId: student.id, classOfferingId: emptyOffering.id, status: EnrollmentStatus.ACTIVE } });
    enrollments.set('ZERO', emptyEnrollment.id);

    for (const label of ['OPEN_OPEN', 'COMPLETE_COMPLETE', 'OPEN_COMPLETE']) {
      const offering = await prisma.classOffering.create({ data: { courseId, instructorId: instructor.id, name: `${label} class`, status: ClassOfferingStatus.OPEN, pricingType: PricingType.FREE } });
      const enrollment = await prisma.enrollment.create({ data: { learnerId: student.id, classOfferingId: offering.id, status: EnrollmentStatus.ACTIVE } });
      enrollments.set(label, enrollment.id);
    }

    studentAgent = request.agent(app.getHttpServer()); otherStudentAgent = request.agent(app.getHttpServer());
    instructorAgent = request.agent(app.getHttpServer()); adminAgent = request.agent(app.getHttpServer());
    await login(studentAgent, `vs02-student-${unique}@example.test`);
    await login(otherStudentAgent, `vs02-other-student-${unique}@example.test`);
    await login(instructorAgent, `vs02-instructor-${unique}@example.test`);
    await login(adminAgent, `vs02-admin-${unique}@example.test`);

    const observedSkill = await prisma.skill.create({
      data: {
        courseId,
        code: 'ALPHA_MASTERY',
        name: 'Alpha Mastery',
        pInit: 0.3,
        pLearn: 0.1,
        pGuess: 0.2,
        pSlip: 0.1,
      },
    });
    const priorSkill = await prisma.skill.create({
      data: {
        courseId,
        code: 'BETA_PRIOR',
        name: 'Beta Prior',
        description: 'No observations yet',
        pInit: 0.6,
        pLearn: 0.15,
        pGuess: 0.2,
        pSlip: 0.1,
      },
    });
    const foreignSkill = await prisma.skill.create({
      data: {
        courseId: foreignCourse.id,
        code: 'FOREIGN_SKILL',
        name: 'Foreign Skill',
      },
    });
    observedSkillId = observedSkill.id;
    priorSkillId = priorSkill.id;
    foreignSkillId = foreignSkill.id;
    await prisma.skillPrerequisite.create({
      data: { skillId: observedSkillId, prerequisiteSkillId: priorSkillId },
    });

    const question = await prisma.question.create({
      data: {
        courseId,
        type: QuestionType.SINGLE_CHOICE,
        difficulty: QuestionDifficulty.MEDIUM,
        content: 'Hidden-result mastery question',
        explanation: 'Must not leak through mastery APIs',
        options: {
          create: [
            { content: 'Correct option', isCorrect: true, orderIndex: 0 },
            { content: 'Wrong option', isCorrect: false, orderIndex: 1 },
          ],
        },
      },
      include: { options: { orderBy: { orderIndex: 'asc' } } },
    });
    await prisma.questionSkill.create({
      data: { questionId: question.id, skillId: observedSkillId },
    });
    const hiddenResultTest = await prisma.test.create({
      data: {
        courseId,
        type: TestType.PLACEMENT,
        title: 'Hidden result mastery test',
        status: TestStatus.PUBLISHED,
        maxAttempts: 2,
        showResultAfterSubmit: false,
      },
    });
    const testQuestion = await prisma.testQuestion.create({
      data: { testId: hiddenResultTest.id, questionId: question.id, orderIndex: 0, points: 1 },
    });
    for (const selectedOptionId of [question.options[0].id, question.options[1].id]) {
      const started = await studentAgent
        .post(
          `/api/learning/enrollments/${id(EnrollmentStatus.ACTIVE)}/tests/${hiddenResultTest.id}/attempts`,
        )
        .expect(201);
      hiddenResultAttemptId ??= started.body.id as string;
      await studentAgent
        .post(
          `/api/learning/enrollments/${id(EnrollmentStatus.ACTIVE)}/attempts/${started.body.id}/submit`,
        )
        .send({
          answers: [{ testQuestionId: testQuestion.id, selectedOptionIds: [selectedOptionId] }],
        })
        .expect(201);
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.userSession.deleteMany({ where: { sid: { in: [...sessionIds] } } });
      const tests = await prisma.test.findMany({
        where: { courseId: { in: courseIds } },
        select: { id: true },
      });
      const testIds = tests.map(({ id }) => id);
      const attempts = await prisma.testAttempt.findMany({
        where: { testId: { in: testIds } },
        select: { id: true },
      });
      const attemptIds = attempts.map(({ id }) => id);
      const questions = await prisma.question.findMany({
        where: { courseId: { in: courseIds } },
        select: { id: true },
      });
      const questionIds = questions.map(({ id }) => id);
      await prisma.masteryHistory.deleteMany({
        where: { enrollment: { classOffering: { courseId: { in: courseIds } } } },
      });
      await prisma.learnerSkillState.deleteMany({
        where: { enrollment: { classOffering: { courseId: { in: courseIds } } } },
      });
      await prisma.testAnswer.deleteMany({ where: { attemptId: { in: attemptIds } } });
      await prisma.testAttempt.deleteMany({ where: { id: { in: attemptIds } } });
      await prisma.testQuestion.deleteMany({ where: { testId: { in: testIds } } });
      await prisma.test.deleteMany({ where: { id: { in: testIds } } });
      await prisma.questionSkill.deleteMany({ where: { questionId: { in: questionIds } } });
      await prisma.skillPrerequisite.deleteMany({ where: { skill: { courseId: { in: courseIds } } } });
      await prisma.questionOption.deleteMany({ where: { questionId: { in: questionIds } } });
      await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
      await prisma.skill.deleteMany({ where: { courseId: { in: courseIds } } });
      await prisma.lessonProgress.deleteMany({ where: { enrollment: { classOffering: { courseId: { in: courseIds } } } } });
      await prisma.enrollment.deleteMany({ where: { classOffering: { courseId: { in: courseIds } } } });
      await prisma.learningResource.deleteMany({ where: { lesson: { module: { courseId: { in: courseIds } } } } });
      await prisma.lesson.deleteMany({ where: { module: { courseId: { in: courseIds } } } });
      await prisma.module.deleteMany({ where: { courseId: { in: courseIds } } });
      await prisma.classOffering.deleteMany({ where: { courseId: { in: courseIds } } });
      await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (app) await app.close();
  });

  it('enforces authentication, STUDENT role, ACTIVE status, IDOR and course integrity', async () => {
    const active = id(EnrollmentStatus.ACTIVE);
    await request(app.getHttpServer()).get(`/api/learning/enrollments/${active}/content`).expect(401);
    await instructorAgent.get(`/api/learning/enrollments/${active}/content`).expect(403);
    await adminAgent.get(`/api/learning/enrollments/${active}/content`).expect(403);
    await studentAgent.get(`/api/learning/enrollments/${active}/content`).expect(200);
    await otherStudentAgent.get(`/api/learning/enrollments/${active}/content`).expect(404);
    await request(app.getHttpServer())
      .get(`/api/learning/enrollments/${active}/mastery`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/learning/enrollments/${active}/mastery/${observedSkillId}/history`)
      .expect(401);
    await instructorAgent.get(`/api/learning/enrollments/${active}/mastery`).expect(403);
    await adminAgent.get(`/api/learning/enrollments/${active}/mastery`).expect(403);
    await instructorAgent
      .get(`/api/learning/enrollments/${active}/mastery/${observedSkillId}/history`)
      .expect(403);
    await adminAgent
      .get(`/api/learning/enrollments/${active}/mastery/${observedSkillId}/history`)
      .expect(403);
    await otherStudentAgent.get(`/api/learning/enrollments/${active}/mastery`).expect(404);
    await otherStudentAgent
      .get(`/api/learning/enrollments/${active}/mastery/${observedSkillId}/history`)
      .expect(404);
    await studentAgent
      .get(`/api/learning/enrollments/${active}/mastery/${foreignSkillId}/history`)
      .expect(404);
    await studentAgent.post(`/api/learning/enrollments/${active}/lessons/${foreignLessonId}/open`).expect(404);
    await studentAgent.patch(`/api/learning/enrollments/${active}/lessons/${foreignLessonId}/complete`).expect(404);

    for (const status of [EnrollmentStatus.PENDING_PAYMENT, EnrollmentStatus.COMPLETED, EnrollmentStatus.DROPPED, EnrollmentStatus.CANCELLED]) {
      const enrollmentId = id(status);
      await studentAgent.get(`/api/learning/enrollments/${enrollmentId}/content`).expect(404);
      await studentAgent.post(`/api/learning/enrollments/${enrollmentId}/lessons/${lessonAId}/open`).expect(404);
      await studentAgent.patch(`/api/learning/enrollments/${enrollmentId}/lessons/${lessonAId}/complete`).expect(404);
      await studentAgent.get(`/api/learning/enrollments/${enrollmentId}/progress`).expect(404);
      await studentAgent.get(`/api/learning/enrollments/${enrollmentId}/mastery`).expect(404);
      await studentAgent
        .get(`/api/learning/enrollments/${enrollmentId}/mastery/${observedSkillId}/history`)
        .expect(404);
    }
  });

  it('returns mixed mastery with stable ordering and performs no GET-side writes', async () => {
    const active = id(EnrollmentStatus.ACTIVE);
    const expectedAfterCorrect = computeBktUpdate(0.3, 0.1, 0.2, 0.1, true);
    const expectedAfterIncorrect = computeBktUpdate(
      expectedAfterCorrect.posteriorMastery,
      0.1,
      0.2,
      0.1,
      false,
    );
    const stateCount = await prisma.learnerSkillState.count({ where: { enrollmentId: active } });
    const historyCount = await prisma.masteryHistory.count({ where: { enrollmentId: active } });

    const response = await studentAgent
      .get(`/api/learning/enrollments/${active}/mastery`)
      .expect(200);
    expect(response.body).toMatchObject({ enrollmentId: active, courseId });
    expect(response.body.skills.map(({ code }: { code: string }) => code)).toEqual([
      'ALPHA_MASTERY',
      'BETA_PRIOR',
    ]);
    expect(response.body.skills[0]).toMatchObject({
      id: observedSkillId,
      masteryProbability: expectedAfterIncorrect.posteriorMastery,
      observationCount: 2,
      state: 'OBSERVED',
      prerequisites: [{ id: priorSkillId, code: 'BETA_PRIOR', name: 'Beta Prior' }],
    });
    expect(response.body.skills[0].lastObservedAt).toEqual(expect.any(String));
    expect(response.body.skills[1]).toMatchObject({
      id: priorSkillId,
      masteryProbability: 0.6,
      observationCount: 0,
      lastObservedAt: null,
      state: 'PRIOR',
      prerequisites: [],
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /selectedOptionIds|pointsAwarded|explanation|isCorrect|options/i,
    );

    await studentAgent.get(`/api/learning/enrollments/${active}/mastery`).expect(200);
    await expect(
      prisma.learnerSkillState.count({ where: { enrollmentId: active } }),
    ).resolves.toBe(stateCount);
    await expect(prisma.masteryHistory.count({ where: { enrollmentId: active } })).resolves.toBe(
      historyCount,
    );
    const zero = await studentAgent
      .get(`/api/learning/enrollments/${id('ZERO')}/mastery`)
      .expect(200);
    expect(zero.body.skills).toEqual([]);
  });

  it('returns learner-owned history independently of hidden assessment results', async () => {
    const active = id(EnrollmentStatus.ACTIVE);
    const expectedAfterCorrect = computeBktUpdate(0.3, 0.1, 0.2, 0.1, true);
    const expectedAfterIncorrect = computeBktUpdate(
      expectedAfterCorrect.posteriorMastery,
      0.1,
      0.2,
      0.1,
      false,
    );
    await studentAgent
      .get(`/api/learning/enrollments/${active}/attempts/${hiddenResultAttemptId}/result`)
      .expect(403);
    const stateCount = await prisma.learnerSkillState.count({ where: { enrollmentId: active } });
    const historyCount = await prisma.masteryHistory.count({ where: { enrollmentId: active } });

    const response = await studentAgent
      .get(`/api/learning/enrollments/${active}/mastery/${observedSkillId}/history`)
      .expect(200);
    expect(response.body.skill).toEqual({
      id: observedSkillId,
      code: 'ALPHA_MASTERY',
      name: 'Alpha Mastery',
      description: null,
    });
    expect(response.body.current).toMatchObject({ observationCount: 2, state: 'OBSERVED' });
    expect(response.body.history).toHaveLength(2);
    expect(response.body.history.map(({ isCorrect }: { isCorrect: boolean }) => isCorrect)).toEqual([
      true,
      false,
    ]);
    expect(response.body.history[0]).toEqual(
      expect.objectContaining({
        priorMastery: 0.3,
        createdAt: expect.any(String),
      }),
    );
    expect(response.body.history[0].evidencePosterior).toBeCloseTo(
      expectedAfterCorrect.evidencePosterior,
      10,
    );
    expect(response.body.history[0].posteriorMastery).toBeCloseTo(
      expectedAfterCorrect.posteriorMastery,
      10,
    );
    expect(response.body.history[1].priorMastery).toBeCloseTo(
      response.body.history[0].posteriorMastery,
      10,
    );
    expect(response.body.history[1].evidencePosterior).toBeCloseTo(
      expectedAfterIncorrect.evidencePosterior,
      10,
    );
    expect(response.body.history[1].posteriorMastery).toBeCloseTo(
      expectedAfterIncorrect.posteriorMastery,
      10,
    );
    expect(JSON.stringify(response.body)).not.toMatch(
      /selectedOptionIds|pointsAwarded|explanation|options|correctOption/i,
    );

    const prior = await studentAgent
      .get(`/api/learning/enrollments/${active}/mastery/${priorSkillId}/history`)
      .expect(200);
    expect(prior.body.current).toEqual({
      masteryProbability: 0.6,
      observationCount: 0,
      lastObservedAt: null,
      state: 'PRIOR',
    });
    expect(prior.body.history).toEqual([]);

    const otherEnrollment = id('OTHER');
    const other = await otherStudentAgent
      .get(`/api/learning/enrollments/${otherEnrollment}/mastery/${observedSkillId}/history`)
      .expect(200);
    expect(other.body.current).toMatchObject({ observationCount: 0, state: 'PRIOR' });
    expect(other.body.history).toEqual([]);
    await expect(
      prisma.learnerSkillState.count({ where: { enrollmentId: active } }),
    ).resolves.toBe(stateCount);
    await expect(prisma.masteryHistory.count({ where: { enrollmentId: active } })).resolves.toBe(
      historyCount,
    );
  });

  it('orders mastery history deterministically when observations share a timestamp', async () => {
    const active = id(EnrollmentStatus.ACTIVE);
    const tiedAt = new Date('2026-09-22T00:00:00.000Z');
    const rows = await prisma.masteryHistory.findMany({
      where: { enrollmentId: active, skillId: observedSkillId },
      select: { id: true, testAttemptId: true, testAnswerId: true },
    });
    expect(rows).toHaveLength(2);
    await prisma.masteryHistory.updateMany({
      where: { id: { in: rows.map(({ id }) => id) } },
      data: { createdAt: tiedAt },
    });
    const expectedIds = [...rows]
      .sort((left, right) =>
        compareUuid(left.testAttemptId, right.testAttemptId) ||
        compareUuid(left.testAnswerId, right.testAnswerId) ||
        compareUuid(left.id, right.id),
      )
      .map(({ id }) => id);

    const response = await studentAgent
      .get(`/api/learning/enrollments/${active}/mastery/${observedSkillId}/history`)
      .expect(200);
    expect(response.body.history.map(({ id }: { id: string }) => id)).toEqual(expectedIds);
    expect(response.body.history.map(({ createdAt }: { createdAt: string }) => createdAt)).toEqual([
      tiedAt.toISOString(),
      tiedAt.toISOString(),
    ]);
  });

  it('opens, completes idempotently and calculates course-scoped progress', async () => {
    const active = id(EnrollmentStatus.ACTIVE);
    const opened = await studentAgent.post(`/api/learning/enrollments/${active}/lessons/${lessonAId}/open`).expect(201);
    expect(opened.body.progress.status).toBe(LessonProgressStatus.IN_PROGRESS);
    const reopened = await studentAgent.post(`/api/learning/enrollments/${active}/lessons/${lessonAId}/open`).expect(201);
    expect(reopened.body.progress.status).toBe(LessonProgressStatus.IN_PROGRESS);
    const completed = await studentAgent.patch(`/api/learning/enrollments/${active}/lessons/${lessonAId}/complete`).expect(200);
    const completedAt = completed.body.completedAt;
    const repeated = await studentAgent.patch(`/api/learning/enrollments/${active}/lessons/${lessonAId}/complete`).expect(200);
    expect(repeated.body.completedAt).toBe(completedAt);
    const reopenedCompleted = await studentAgent.post(`/api/learning/enrollments/${active}/lessons/${lessonAId}/open`).expect(201);
    expect(reopenedCompleted.body.progress.status).toBe(LessonProgressStatus.COMPLETED);
    expect(reopenedCompleted.body.progress.completedAt).toBe(completedAt);

    await prisma.lessonProgress.create({ data: { enrollmentId: active, lessonId: foreignLessonId, status: LessonProgressStatus.COMPLETED } });
    const progress = await studentAgent.get(`/api/learning/enrollments/${active}/progress`).expect(200);
    expect(progress.body).toMatchObject({ totalLessons: 2, completedLessons: 1, progressPercent: 50 });
    const content = await studentAgent.get(`/api/learning/enrollments/${active}/content`).expect(200);
    expect(content.body.modules[0].lessons).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: lessonAId, progressStatus: LessonProgressStatus.COMPLETED, resourceCount: 2 }),
      expect.objectContaining({ id: lessonBId, progressStatus: 'NOT_STARTED' }),
    ]));
    expect(content.body).not.toHaveProperty('mastery');

    const zero = await studentAgent.get(`/api/learning/enrollments/${id('ZERO')}/progress`).expect(200);
    expect(zero.body).toMatchObject({ totalLessons: 0, completedLessons: 0, progressPercent: 0 });
  });

  it('keeps one IN_PROGRESS row under concurrent open/open', async () => {
    const enrollmentId = id('OPEN_OPEN');
    const responses = await Promise.all([open(enrollmentId), open(enrollmentId)]);
    expect(responses.every(({ status }) => status < 500)).toBe(true);
    await expect(progressRows(enrollmentId)).resolves.toEqual([{ status: LessonProgressStatus.IN_PROGRESS, completedAt: null }]);
  });

  it('keeps one completed row under concurrent complete/complete', async () => {
    const enrollmentId = id('COMPLETE_COMPLETE');
    const responses = await Promise.all([complete(enrollmentId), complete(enrollmentId)]);
    expect(responses.every(({ status }) => status < 500)).toBe(true);
    const rows = await progressRows(enrollmentId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe(LessonProgressStatus.COMPLETED);
    expect(rows[0].completedAt).toBeInstanceOf(Date);
  });

  it('never downgrades COMPLETED under concurrent open/complete', async () => {
    const enrollmentId = id('OPEN_COMPLETE');
    const responses = await Promise.all([open(enrollmentId), complete(enrollmentId)]);
    expect(responses.every(({ status }) => status < 500)).toBe(true);
    const rows = await progressRows(enrollmentId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe(LessonProgressStatus.COMPLETED);
    expect(rows[0].completedAt).toBeInstanceOf(Date);
  });

  async function createUser(label: string, role: UserRole, passwordHash: string) { return prisma.user.create({ data: { email: `vs02-${label}-${unique}@example.test`, fullName: label, role, status: UserStatus.ACTIVE, passwordHash } }); }
  async function createCourse(label: string, createdById: string) { return prisma.course.create({ data: { title: `VS02 ${label} ${unique}`, slug: `vs02-learning-${label}-${unique}`, description: 'E2E', level: 'E2E', isPublished: true, createdById } }); }
  async function login(agent: ReturnType<typeof request.agent>, email: string) { const response = await agent.post('/api/auth/login').send({ email, password }).expect(200); sessionIds.add(extractSessionId(cookie(response.headers['set-cookie']))); }
  function id(key: EnrollmentStatus | string): string { const value = enrollments.get(key); if (!value) throw new Error(`Missing enrollment ${key}`); return value; }
  function compareUuid(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
  function open(enrollmentId: string) { return studentAgent.post(`/api/learning/enrollments/${enrollmentId}/lessons/${lessonBId}/open`); }
  function complete(enrollmentId: string) { return studentAgent.patch(`/api/learning/enrollments/${enrollmentId}/lessons/${lessonBId}/complete`); }
  function progressRows(enrollmentId: string) { return prisma.lessonProgress.findMany({ where: { enrollmentId, lessonId: lessonBId }, select: { status: true, completedAt: true } }); }
});

function cookie(value: string[] | string | undefined): string { const result = Array.isArray(value) ? value[0] : value; if (!result) throw new Error('Expected session cookie'); return result; }
function extractSessionId(value: string): string { const signed = decodeURIComponent(value.split(';', 1)[0].split('=', 2)[1]); const unsigned = signed.startsWith('s:') ? signed.slice(2) : signed; return unsigned.slice(0, unsigned.lastIndexOf('.')); }
