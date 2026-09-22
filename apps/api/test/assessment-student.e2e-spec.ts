import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test as NestTest } from '@nestjs/testing';
import * as argon2 from 'argon2';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  ClassOfferingStatus,
  EnrollmentStatus,
  PricingType,
  QuestionDifficulty,
  QuestionType,
  TestAttemptStatus,
  TestStatus,
  TestType,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { expectSafeError, loginAgent } from './assessment-e2e-helpers';

interface QuestionFixture {
  id: string;
  options: Array<{ id: string; isCorrect: boolean }>;
}

describe('Student assessment APIs (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let studentAgent: ReturnType<typeof request.agent>;
  let secondStudentAgent: ReturnType<typeof request.agent>;
  let instructorAgent: ReturnType<typeof request.agent>;
  const sessionIds = new Set<string>();
  const userIds: string[] = [];
  const courseIds: string[] = [];
  const offeringIds: string[] = [];
  const enrollmentIds: string[] = [];
  const unique = `${Date.now()}-${process.pid}`;
  const password = 'AssessmentStudentE2e!2026';
  const emails = {
    admin: `vs03-f1-student-admin-${unique}@example.test`,
    instructor: `vs03-f1-student-instructor-${unique}@example.test`,
    student: `vs03-f1-student-one-${unique}@example.test`,
    second: `vs03-f1-student-two-${unique}@example.test`,
  };
  let courseA: string;
  let courseB: string;
  let activeEnrollment: string;
  let foreignEnrollment: string;
  const statusEnrollments = new Map<EnrollmentStatus, string>();
  let sc: QuestionFixture;
  let tf: QuestionFixture;
  let mc: QuestionFixture;
  let mainPublishedTest: string;
  let draftTest: string;
  let foreignPublishedTest: string;

  beforeAll(async () => {
    const moduleRef = await NestTest.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const users = await Promise.all([
      createUser(emails.admin, UserRole.ADMIN_COORDINATOR, passwordHash),
      createUser(emails.instructor, UserRole.INSTRUCTOR, passwordHash),
      createUser(emails.student, UserRole.STUDENT, passwordHash),
      createUser(emails.second, UserRole.STUDENT, passwordHash),
    ]);
    userIds.push(...users.map(({ id }) => id));
    const [admin, instructor, student, secondStudent] = users;
    const courses = await Promise.all([createCourse('A', admin.id), createCourse('B', admin.id)]);
    [courseA, courseB] = courses.map(({ id }) => id);
    courseIds.push(courseA, courseB);

    const statuses = [
      EnrollmentStatus.ACTIVE,
      EnrollmentStatus.PENDING_PAYMENT,
      EnrollmentStatus.COMPLETED,
      EnrollmentStatus.DROPPED,
      EnrollmentStatus.CANCELLED,
    ];
    for (const [index, status] of statuses.entries()) {
      const offering = await prisma.classOffering.create({
        data: { courseId: courseA, instructorId: instructor.id, name: `Status ${status}`, status: ClassOfferingStatus.OPEN, pricingType: PricingType.FREE },
      });
      offeringIds.push(offering.id);
      const enrollment = await prisma.enrollment.create({ data: { learnerId: student.id, classOfferingId: offering.id, status } });
      enrollmentIds.push(enrollment.id);
      statusEnrollments.set(status, enrollment.id);
      if (index === 0) activeEnrollment = enrollment.id;
    }
    const foreignOffering = await prisma.classOffering.create({ data: { courseId: courseA, instructorId: instructor.id, name: 'Foreign learner', status: ClassOfferingStatus.OPEN, pricingType: PricingType.FREE } });
    offeringIds.push(foreignOffering.id);
    const foreign = await prisma.enrollment.create({ data: { learnerId: secondStudent.id, classOfferingId: foreignOffering.id, status: EnrollmentStatus.ACTIVE } });
    foreignEnrollment = foreign.id;
    enrollmentIds.push(foreign.id);

    sc = await createQuestion(courseA, QuestionType.SINGLE_CHOICE, 'SC', [true, false]);
    tf = await createQuestion(courseA, QuestionType.TRUE_FALSE, 'TF', [true, false]);
    mc = await createQuestion(courseA, QuestionType.MULTIPLE_CHOICE, 'MC', [true, true, false, false]);
    mainPublishedTest = await createAssessment('Main published', courseA, TestStatus.PUBLISHED, 10, true, [sc.id, tf.id, mc.id]);
    draftTest = await createAssessment('Hidden draft', courseA, TestStatus.DRAFT, 1, true, [sc.id]);
    const foreignQuestion = await createQuestion(courseB, QuestionType.SINGLE_CHOICE, 'Foreign SC', [true, false]);
    foreignPublishedTest = await createAssessment('Foreign published', courseB, TestStatus.PUBLISHED, 1, true, [foreignQuestion.id]);

    studentAgent = request.agent(app.getHttpServer());
    secondStudentAgent = request.agent(app.getHttpServer());
    instructorAgent = request.agent(app.getHttpServer());
    await loginAgent(studentAgent, emails.student, password, sessionIds);
    await loginAgent(secondStudentAgent, emails.second, password, sessionIds);
    await loginAgent(instructorAgent, emails.instructor, password, sessionIds);
  });

  afterAll(async () => {
    if (prisma) {
      const tests = await prisma.test.findMany({ where: { courseId: { in: courseIds } }, select: { id: true } });
      const testIds = tests.map(({ id }) => id);
      const attempts = await prisma.testAttempt.findMany({ where: { testId: { in: testIds } }, select: { id: true } });
      await prisma.testAnswer.deleteMany({ where: { attemptId: { in: attempts.map(({ id }) => id) } } });
      await prisma.testAttempt.deleteMany({ where: { testId: { in: testIds } } });
      await prisma.testQuestion.deleteMany({ where: { testId: { in: testIds } } });
      await prisma.test.deleteMany({ where: { id: { in: testIds } } });
      const questions = await prisma.question.findMany({ where: { courseId: { in: courseIds } }, select: { id: true } });
      await prisma.questionOption.deleteMany({ where: { questionId: { in: questions.map(({ id }) => id) } } });
      await prisma.question.deleteMany({ where: { id: { in: questions.map(({ id }) => id) } } });
      await prisma.lessonProgress.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } });
      await prisma.enrollment.deleteMany({ where: { id: { in: enrollmentIds } } });
      await prisma.classOffering.deleteMany({ where: { id: { in: offeringIds } } });
      await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
      await prisma.userSession.deleteMany({ where: { sid: { in: [...sessionIds] } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (app) await app.close();
  });

  it('enforces the learner authorization matrix and returns a secret-free published list', async () => {
    await request(app.getHttpServer()).get(`/api/learning/enrollments/${activeEnrollment}/tests`).expect(401);
    await instructorAgent.get(`/api/learning/enrollments/${activeEnrollment}/tests`).expect(403);
    await studentAgent.get(`/api/learning/enrollments/${activeEnrollment}/tests`).expect(200);
    for (const status of [EnrollmentStatus.PENDING_PAYMENT, EnrollmentStatus.COMPLETED, EnrollmentStatus.DROPPED, EnrollmentStatus.CANCELLED]) {
      await studentAgent.get(`/api/learning/enrollments/${statusEnrollments.get(status)}/tests`).expect(404);
    }
    await studentAgent.get(`/api/learning/enrollments/${foreignEnrollment}/tests`).expect(404);
    await studentAgent.post(`/api/learning/enrollments/${activeEnrollment}/tests/${foreignPublishedTest}/attempts`).expect(404);

    const foreignAttempt = await prisma.testAttempt.create({ data: { testId: mainPublishedTest, enrollmentId: foreignEnrollment, attemptNumber: 1 } });
    await studentAgent.get(`/api/learning/enrollments/${activeEnrollment}/attempts/${foreignAttempt.id}`).expect(404);

    const list = await studentAgent.get(`/api/learning/enrollments/${activeEnrollment}/tests`).expect(200);
    expect(list.body.map((test: { id: string }) => test.id)).toContain(mainPublishedTest);
    expect(list.body.map((test: { id: string }) => test.id)).not.toContain(draftTest);
    expect(list.body.map((test: { id: string }) => test.id)).not.toContain(foreignPublishedTest);
    const main = list.body.find((test: { id: string }) => test.id === mainPublishedTest);
    expect(main).toMatchObject({ questionCount: 3, attemptsUsed: 0, hasInProgressAttempt: false });
    expect(JSON.stringify(list.body)).not.toMatch(/questions|options|isCorrect|explanation|selectedOptionIds|pointsAwarded/);
  });

  it('starts/resumes sequential attempts, handles concurrency, and enforces maxAttempts', async () => {
    const raceTest = await createAssessment('Concurrent start', courseA, TestStatus.PUBLISHED, 2, true, [sc.id]);
    const responses = await Promise.all([
      studentAgent.post(`/api/learning/enrollments/${activeEnrollment}/tests/${raceTest}/attempts`),
      studentAgent.post(`/api/learning/enrollments/${activeEnrollment}/tests/${raceTest}/attempts`),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([201, 201]);
    expect(responses[0].body.id).toBe(responses[1].body.id);
    expect(responses[0].body).toMatchObject({ attemptNumber: 1, status: TestAttemptStatus.IN_PROGRESS });
    await expect(prisma.testAttempt.count({ where: { testId: raceTest, enrollmentId: activeEnrollment, status: TestAttemptStatus.IN_PROGRESS } })).resolves.toBe(1);

    const resumed = await studentAgent.post(`/api/learning/enrollments/${activeEnrollment}/tests/${raceTest}/attempts`).expect(201);
    expect(resumed.body.id).toBe(responses[0].body.id);
    await prisma.testAttempt.update({ where: { id: resumed.body.id }, data: { status: TestAttemptStatus.SUBMITTED, score: 0, maxScore: 1, submittedAt: new Date() } });
    const second = await studentAgent.post(`/api/learning/enrollments/${activeEnrollment}/tests/${raceTest}/attempts`).expect(201);
    expect(second.body.attemptNumber).toBe(2);
    const secondResume = await studentAgent.post(`/api/learning/enrollments/${activeEnrollment}/tests/${raceTest}/attempts`).expect(201);
    expect(secondResume.body.id).toBe(second.body.id);
    await prisma.testAttempt.update({ where: { id: second.body.id }, data: { status: TestAttemptStatus.SUBMITTED, score: 0, maxScore: 1, submittedAt: new Date() } });
    const limit = await studentAgent.post(`/api/learning/enrollments/${activeEnrollment}/tests/${raceTest}/attempts`).expect(409);
    expectSafeError(limit);

    const oneAttempt = await createAssessment('One attempt', courseA, TestStatus.PUBLISHED, 1, true, [sc.id]);
    const only = await studentAgent.post(`/api/learning/enrollments/${activeEnrollment}/tests/${oneAttempt}/attempts`).expect(201);
    await prisma.testAttempt.update({ where: { id: only.body.id }, data: { status: TestAttemptStatus.SUBMITTED, score: 0, maxScore: 1, submittedAt: new Date() } });
    await studentAgent.post(`/api/learning/enrollments/${activeEnrollment}/tests/${oneAttempt}/attempts`).expect(409);
  });

  it('returns safe attempt content and atomically validates autosave selections', async () => {
    const autosaveTest = await createAssessment('Autosave', courseA, TestStatus.PUBLISHED, 1, true, [sc.id, tf.id, mc.id]);
    const otherTest = await createAssessment('Other answers', courseA, TestStatus.PUBLISHED, 1, true, [sc.id]);
    const otherTq = await prisma.testQuestion.findFirstOrThrow({ where: { testId: otherTest } });
    const started = await studentAgent.post(`/api/learning/enrollments/${activeEnrollment}/tests/${autosaveTest}/attempts`).expect(201);
    const content = await studentAgent.get(`/api/learning/enrollments/${activeEnrollment}/attempts/${started.body.id}`).expect(200);
    expect(content.body.questions).toHaveLength(3);
    expect(content.body.questions[0]).toMatchObject({ testQuestionId: expect.any(String), points: expect.any(Number), selectedOptionIds: [] });
    expect(JSON.stringify(content.body)).not.toMatch(/isCorrect|explanation|pointsAwarded|score|maxScore/);

    const byQuestion = new Map(content.body.questions.map((item: { question: { id: string }; testQuestionId: string }) => [item.question.id, item.testQuestionId]));
    const scTq = byQuestion.get(sc.id) as string;
    const tfTq = byQuestion.get(tf.id) as string;
    const mcTq = byQuestion.get(mc.id) as string;
    await studentAgent.patch(`/api/learning/enrollments/${activeEnrollment}/attempts/${started.body.id}/answers`).send({ answers: [
      { testQuestionId: scTq, selectedOptionIds: [] },
      { testQuestionId: tfTq, selectedOptionIds: [] },
      { testQuestionId: mcTq, selectedOptionIds: [] },
    ] }).expect(200);
    await studentAgent.patch(`/api/learning/enrollments/${activeEnrollment}/attempts/${started.body.id}/answers`).send({ answers: [
      { testQuestionId: scTq, selectedOptionIds: [] },
      { testQuestionId: tfTq, selectedOptionIds: [tf.options[0].id] },
      { testQuestionId: mcTq, selectedOptionIds: [mc.options[0].id, mc.options[1].id] },
    ] }).expect(200);
    const stored = await prisma.testAnswer.findMany({ where: { attemptId: started.body.id } });
    expect(stored).toHaveLength(3);
    expect(stored.every(({ isCorrect, pointsAwarded }) => isCorrect === null && pointsAwarded === null)).toBe(true);

    await studentAgent.patch(`/api/learning/enrollments/${activeEnrollment}/attempts/${started.body.id}/answers`).send({ answers: [{ testQuestionId: scTq, selectedOptionIds: [sc.options[0].id, sc.options[1].id] }] }).expect(400);
    await studentAgent.patch(`/api/learning/enrollments/${activeEnrollment}/attempts/${started.body.id}/answers`).send({ answers: [{ testQuestionId: tfTq, selectedOptionIds: [tf.options[0].id, tf.options[1].id] }] }).expect(400);
    await studentAgent.patch(`/api/learning/enrollments/${activeEnrollment}/attempts/${started.body.id}/answers`).send({ answers: [{ testQuestionId: scTq, selectedOptionIds: [tf.options[0].id] }] }).expect(400);
    await studentAgent.patch(`/api/learning/enrollments/${activeEnrollment}/attempts/${started.body.id}/answers`).send({ answers: [{ testQuestionId: otherTq.id, selectedOptionIds: [] }] }).expect(400);
    await studentAgent.patch(`/api/learning/enrollments/${activeEnrollment}/attempts/${started.body.id}/answers`).send({ answers: [{ testQuestionId: scTq, selectedOptionIds: [sc.options[0].id, sc.options[0].id] }] }).expect(400);
    await studentAgent.patch(`/api/learning/enrollments/${activeEnrollment}/attempts/${started.body.id}/answers`).send({ answers: [{ testQuestionId: scTq, selectedOptionIds: [] }, { testQuestionId: scTq, selectedOptionIds: [] }] }).expect(400);

    await studentAgent.patch(`/api/learning/enrollments/${activeEnrollment}/attempts/${started.body.id}/answers`).send({ answers: [{ testQuestionId: scTq, selectedOptionIds: [sc.options[0].id] }] }).expect(200);
    await studentAgent.patch(`/api/learning/enrollments/${activeEnrollment}/attempts/${started.body.id}/answers`).send({ answers: [
      { testQuestionId: scTq, selectedOptionIds: [sc.options[1].id] },
      { testQuestionId: tfTq, selectedOptionIds: [sc.options[0].id] },
    ] }).expect(400);
    const unchanged = await prisma.testAnswer.findUniqueOrThrow({ where: { attemptId_testQuestionId: { attemptId: started.body.id, testQuestionId: scTq } } });
    expect(unchanged.selectedOptionIds).toEqual([sc.options[0].id]);

    await studentAgent.get(`/api/learning/enrollments/${activeEnrollment}/attempts/${started.body.id}/result`).expect(404);
    await studentAgent.post(`/api/learning/enrollments/${activeEnrollment}/attempts/${started.body.id}/submit`).send({ answers: [] }).expect(201);
    await studentAgent.patch(`/api/learning/enrollments/${activeEnrollment}/attempts/${started.body.id}/answers`).send({ answers: [] }).expect(409);
  });

  it('uses final payload over autosave, scores deterministically, and keeps repeated submit immutable', async () => {
    const scoringTest = await createAssessment('Scoring', courseA, TestStatus.PUBLISHED, 6, true, [sc.id, tf.id, mc.id], [2, 3, 2]);
    const tqRows = await prisma.testQuestion.findMany({ where: { testId: scoringTest }, include: { question: true } });
    const tq = new Map(tqRows.map((item) => [item.questionId, item.id]));
    const payloads = [
      [answer(tq.get(sc.id), [sc.options[0].id]), answer(tq.get(tf.id), [tf.options[0].id]), answer(tq.get(mc.id), [mc.options[1].id, mc.options[0].id])],
      [answer(tq.get(sc.id), [sc.options[1].id]), answer(tq.get(tf.id), [tf.options[1].id]), answer(tq.get(mc.id), [mc.options[0].id])],
      [],
      [answer(tq.get(mc.id), [mc.options[0].id, mc.options[1].id, mc.options[2].id])],
      [answer(tq.get(mc.id), [mc.options[2].id, mc.options[3].id])],
      [answer(tq.get(sc.id), [sc.options[0].id]), answer(tq.get(tf.id), [tf.options[1].id]), answer(tq.get(mc.id), [mc.options[0].id])],
    ];
    const expectedScores = [7, 0, 0, 0, 0, 2];
    const submittedAttempts: string[] = [];

    for (const [index, payload] of payloads.entries()) {
      const started = await studentAgent.post(`/api/learning/enrollments/${activeEnrollment}/tests/${scoringTest}/attempts`).expect(201);
      submittedAttempts.push(started.body.id);
      if (index === 0) {
        await studentAgent.patch(`/api/learning/enrollments/${activeEnrollment}/attempts/${started.body.id}/answers`).send({ answers: [answer(tq.get(sc.id), [sc.options[1].id])] }).expect(200);
      }
      const submitted = await studentAgent.post(`/api/learning/enrollments/${activeEnrollment}/attempts/${started.body.id}/submit`).send({ answers: payload }).expect(201);
      expect(submitted.body.attempt).toMatchObject({ score: expectedScores[index], maxScore: 7 });
      if (index === 0) {
        const finalSc = await prisma.testAnswer.findUniqueOrThrow({ where: { attemptId_testQuestionId: { attemptId: started.body.id, testQuestionId: tq.get(sc.id)! } } });
        expect(finalSc.selectedOptionIds).toEqual([sc.options[0].id]);
        expect(finalSc.isCorrect).toBe(true);
      }
      if (index === 2) {
        const omitted = await prisma.testAnswer.findMany({ where: { attemptId: started.body.id } });
        expect(omitted).toHaveLength(3);
        expect(omitted.every(({ selectedOptionIds, pointsAwarded }) => selectedOptionIds.length === 0 && pointsAwarded === 0)).toBe(true);
      }
    }

    const immutableAttemptId = submittedAttempts[0];
    const beforeAttempt = await prisma.testAttempt.findUniqueOrThrow({ where: { id: immutableAttemptId } });
    const beforeAnswers = await prisma.testAnswer.findMany({ where: { attemptId: immutableAttemptId }, orderBy: { testQuestionId: 'asc' } });
    const repeated = await studentAgent.post(`/api/learning/enrollments/${activeEnrollment}/attempts/${immutableAttemptId}/submit`).send({ answers: [answer(tq.get(sc.id), [sc.options[1].id])] }).expect(201);
    expect(repeated.body.attempt).toMatchObject({ score: 7, maxScore: 7 });
    const afterAttempt = await prisma.testAttempt.findUniqueOrThrow({ where: { id: immutableAttemptId } });
    const afterAnswers = await prisma.testAnswer.findMany({ where: { attemptId: immutableAttemptId }, orderBy: { testQuestionId: 'asc' } });
    expect(afterAttempt).toMatchObject({ score: beforeAttempt.score, maxScore: beforeAttempt.maxScore, submittedAt: beforeAttempt.submittedAt });
    expect(afterAnswers).toEqual(beforeAnswers);

    const result = await studentAgent.get(`/api/learning/enrollments/${activeEnrollment}/attempts/${immutableAttemptId}/result`).expect(200);
    expect(result.body.attempt).toMatchObject({ score: 7, maxScore: 7, percentage: 100, startedAt: expect.any(String), submittedAt: expect.any(String) });
    expect(result.body.questions[0].question).toHaveProperty('explanation');
    expect(result.body.questions[0].question.options[0]).toEqual(expect.objectContaining({ isCorrect: expect.any(Boolean), wasSelected: expect.any(Boolean) }));
    expect(result.body.questions[0].answer).toEqual(expect.objectContaining({ isCorrect: expect.any(Boolean), pointsAwarded: expect.any(Number) }));
    expect(result.body.attempt).not.toHaveProperty('passed');
    const rounded = await studentAgent.get(`/api/learning/enrollments/${activeEnrollment}/attempts/${submittedAttempts[5]}/result`).expect(200);
    expect(rounded.body.attempt).toMatchObject({ score: 2, maxScore: 7, percentage: 28.57 });

    await prisma.test.update({ where: { id: scoringTest }, data: { showResultAfterSubmit: false } });
    await studentAgent.get(`/api/learning/enrollments/${activeEnrollment}/attempts/${immutableAttemptId}/result`).expect(403);
    await prisma.test.update({ where: { id: scoringTest }, data: { showResultAfterSubmit: true } });
    await studentAgent.get(`/api/learning/enrollments/${activeEnrollment}/attempts/${immutableAttemptId}/result`).expect(200);

    const forbiddenFieldsTest = await createAssessment('Unknown grading fields', courseA, TestStatus.PUBLISHED, 1, true, [sc.id]);
    const forbiddenTq = await prisma.testQuestion.findFirstOrThrow({ where: { testId: forbiddenFieldsTest } });
    const forbiddenAttempt = await studentAgent.post(`/api/learning/enrollments/${activeEnrollment}/tests/${forbiddenFieldsTest}/attempts`).expect(201);
    await studentAgent.post(`/api/learning/enrollments/${activeEnrollment}/attempts/${forbiddenAttempt.body.id}/submit`).send({ answers: [{ testQuestionId: forbiddenTq.id, selectedOptionIds: [], isCorrect: true, pointsAwarded: 999 }], score: 999 }).expect(400);
  });

  it('serializes concurrent submissions into one immutable result without duplicate answers', async () => {
    const concurrentTest = await createAssessment('Concurrent submit', courseA, TestStatus.PUBLISHED, 1, true, [sc.id, tf.id, mc.id], [2, 3, 5]);
    const rows = await prisma.testQuestion.findMany({ where: { testId: concurrentTest }, include: { question: true } });
    const tq = new Map(rows.map((item) => [item.questionId, item.id]));
    const started = await studentAgent.post(`/api/learning/enrollments/${activeEnrollment}/tests/${concurrentTest}/attempts`).expect(201);
    const correct = [answer(tq.get(sc.id), [sc.options[0].id]), answer(tq.get(tf.id), [tf.options[0].id]), answer(tq.get(mc.id), [mc.options[0].id, mc.options[1].id])];
    const wrong = [answer(tq.get(sc.id), [sc.options[1].id]), answer(tq.get(tf.id), [tf.options[1].id]), answer(tq.get(mc.id), [mc.options[2].id])];
    const responses = await Promise.all([
      studentAgent.post(`/api/learning/enrollments/${activeEnrollment}/attempts/${started.body.id}/submit`).send({ answers: correct }),
      studentAgent.post(`/api/learning/enrollments/${activeEnrollment}/attempts/${started.body.id}/submit`).send({ answers: wrong }),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([201, 201]);
    responses.forEach(expectSafeError);
    expect(responses[0].body.attempt.score).toBe(responses[1].body.attempt.score);
    expect(responses[0].body.attempt.maxScore).toBe(responses[1].body.attempt.maxScore);
    expect(responses[0].body.attempt.submittedAt).toBe(responses[1].body.attempt.submittedAt);
    const stored = await prisma.testAttempt.findUniqueOrThrow({ where: { id: started.body.id } });
    expect(stored.status).toBe(TestAttemptStatus.SUBMITTED);
    expect(stored.submittedAt).not.toBeNull();
    await expect(prisma.testAnswer.count({ where: { attemptId: started.body.id } })).resolves.toBe(3);
    const uniqueAnswers = await prisma.testAnswer.findMany({ where: { attemptId: started.body.id }, select: { testQuestionId: true } });
    expect(new Set(uniqueAnswers.map(({ testQuestionId }) => testQuestionId)).size).toBe(3);
  });

  async function createUser(email: string, role: UserRole, passwordHash: string) {
    return prisma.user.create({ data: { email, fullName: `VS03 ${role}`, role, status: UserStatus.ACTIVE, passwordHash } });
  }

  async function createCourse(label: string, createdById: string) {
    return prisma.course.create({ data: { title: `VS03 Student ${label} ${unique}`, slug: `vs03-student-${label.toLowerCase()}-${unique}`, description: 'Student assessment E2E', level: 'E2E', isPublished: true, createdById } });
  }

  async function createQuestion(courseId: string, type: QuestionType, label: string, correctness: boolean[]): Promise<QuestionFixture> {
    const question = await prisma.question.create({
      data: {
        courseId,
        type,
        difficulty: QuestionDifficulty.MEDIUM,
        content: `${label} content`,
        explanation: `${label} explanation`,
        options: { create: correctness.map((isCorrect, orderIndex) => ({ content: `${label} option ${orderIndex}`, isCorrect, orderIndex })) },
      },
      include: { options: { orderBy: { orderIndex: 'asc' } } },
    });
    return { id: question.id, options: question.options.map(({ id, isCorrect }) => ({ id, isCorrect })) };
  }

  async function createAssessment(
    title: string,
    courseId: string,
    status: TestStatus,
    maxAttempts: number,
    showResultAfterSubmit: boolean,
    questionIds: string[],
    points = questionIds.map(() => 1),
  ): Promise<string> {
    const assessment = await prisma.test.create({
      data: { courseId, type: TestType.PLACEMENT, title: `${title} ${unique}`, status, maxAttempts, showResultAfterSubmit },
    });
    for (const [orderIndex, questionId] of questionIds.entries()) {
      await prisma.testQuestion.create({ data: { testId: assessment.id, questionId, orderIndex, points: points[orderIndex] } });
    }
    return assessment.id;
  }
});

function answer(testQuestionId: string | undefined, selectedOptionIds: string[]) {
  if (!testQuestionId) throw new Error('Expected TestQuestion fixture');
  return { testQuestionId, selectedOptionIds };
}
