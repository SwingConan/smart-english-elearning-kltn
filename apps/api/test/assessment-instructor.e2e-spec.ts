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
  TestStatus,
  TestType,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { expectSafeError, loginAgent } from './assessment-e2e-helpers';

describe('Instructor assessment APIs (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let instructorAgent: ReturnType<typeof request.agent>;
  let unassignedAgent: ReturnType<typeof request.agent>;
  let studentAgent: ReturnType<typeof request.agent>;
  const sessionIds = new Set<string>();
  const userIds: string[] = [];
  const courseIds: string[] = [];
  const offeringIds: string[] = [];
  const enrollmentIds: string[] = [];
  const unique = `${Date.now()}-${process.pid}`;
  const password = 'AssessmentInstructorE2e!2026';
  const emails = {
    admin: `vs03-f1-admin-${unique}@example.test`,
    instructor: `vs03-f1-instructor-${unique}@example.test`,
    other: `vs03-f1-other-${unique}@example.test`,
    student: `vs03-f1-student-${unique}@example.test`,
  };
  let courseA: string;
  let courseB: string;
  let lessonA: string;
  let lessonB: string;
  let activeEnrollment: string;

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
      createUser(emails.other, UserRole.INSTRUCTOR, passwordHash),
      createUser(emails.student, UserRole.STUDENT, passwordHash),
    ]);
    userIds.push(...users.map(({ id }) => id));
    const [admin, instructor, , student] = users;

    const courses = await Promise.all([
      createCourse('A', admin.id),
      createCourse('B', admin.id),
    ]);
    [courseA, courseB] = courses.map(({ id }) => id);
    courseIds.push(courseA, courseB);

    const [offeringA, offeringB] = await Promise.all([
      prisma.classOffering.create({ data: { courseId: courseA, instructorId: instructor.id, name: 'VS03 F1 A', status: ClassOfferingStatus.OPEN, pricingType: PricingType.FREE } }),
      prisma.classOffering.create({ data: { courseId: courseB, instructorId: instructor.id, name: 'VS03 F1 B', status: ClassOfferingStatus.OPEN, pricingType: PricingType.FREE } }),
    ]);
    offeringIds.push(offeringA.id, offeringB.id);
    const enrollment = await prisma.enrollment.create({ data: { learnerId: student.id, classOfferingId: offeringA.id, status: EnrollmentStatus.ACTIVE } });
    activeEnrollment = enrollment.id;
    enrollmentIds.push(enrollment.id);

    const [moduleA, moduleB] = await Promise.all([
      prisma.module.create({ data: { courseId: courseA, title: 'Module A', orderIndex: 0 } }),
      prisma.module.create({ data: { courseId: courseB, title: 'Module B', orderIndex: 0 } }),
    ]);
    const lessons = await Promise.all([
      prisma.lesson.create({ data: { moduleId: moduleA.id, title: 'Lesson A', orderIndex: 0 } }),
      prisma.lesson.create({ data: { moduleId: moduleB.id, title: 'Lesson B', orderIndex: 0 } }),
    ]);
    [lessonA, lessonB] = lessons.map(({ id }) => id);

    instructorAgent = request.agent(app.getHttpServer());
    unassignedAgent = request.agent(app.getHttpServer());
    studentAgent = request.agent(app.getHttpServer());
    await loginAgent(instructorAgent, emails.instructor, password, sessionIds);
    await loginAgent(unassignedAgent, emails.other, password, sessionIds);
    await loginAgent(studentAgent, emails.student, password, sessionIds);
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
      await prisma.lesson.deleteMany({ where: { module: { courseId: { in: courseIds } } } });
      await prisma.module.deleteMany({ where: { courseId: { in: courseIds } } });
      await prisma.classOffering.deleteMany({ where: { id: { in: offeringIds } } });
      await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
      await prisma.userSession.deleteMany({ where: { sid: { in: [...sessionIds] } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (app) await app.close();
  });

  it('enforces authorization and objective Question validation', async () => {
    await request(app.getHttpServer()).get(`/api/instructor/courses/${courseA}/questions`).expect(401);
    await studentAgent.get(`/api/instructor/courses/${courseA}/questions`).expect(403);
    await unassignedAgent.get(`/api/instructor/courses/${courseA}/questions`).expect(403);
    await instructorAgent.get(`/api/instructor/questions/${crypto.randomUUID()}`).expect(404);

    const validCases = [
      questionInput(QuestionType.SINGLE_CHOICE, ['A', 'B'], [0]),
      questionInput(QuestionType.TRUE_FALSE, ['Custom true', 'Custom false'], [1]),
      questionInput(QuestionType.MULTIPLE_CHOICE, ['A', 'B', 'C'], [0, 2]),
    ];
    for (const input of validCases) {
      const response = await instructorAgent.post(`/api/instructor/courses/${courseA}/questions`).send(input).expect(201);
      expect(response.body.options.map((option: { orderIndex: number }) => option.orderIndex))
        .toEqual(input.options.map((_, index) => index));
      expect(response.body.difficulty).toBe(QuestionDifficulty.HARD);
    }

    const invalidCases = [
      questionInput(QuestionType.SINGLE_CHOICE, ['A', 'B'], []),
      questionInput(QuestionType.SINGLE_CHOICE, ['A', 'B'], [0, 1]),
      questionInput(QuestionType.TRUE_FALSE, ['A', 'B', 'C'], [0]),
      questionInput(QuestionType.MULTIPLE_CHOICE, ['A', 'B'], []),
      { ...questionInput(QuestionType.SINGLE_CHOICE, ['A', 'B'], [0]), content: ' ' },
      questionInput(QuestionType.SINGLE_CHOICE, [' ', 'B'], [0]),
      questionInput(QuestionType.SINGLE_CHOICE, [' Same ', 'same'], [0]),
    ];
    for (const input of invalidCases) {
      await instructorAgent.post(`/api/instructor/courses/${courseA}/questions`).send(input).expect(400);
    }
  });

  it('covers Test defaults, lesson scoping, TestQuestion membership and deletion integrity', async () => {
    const placement = await createTest(courseA, { type: TestType.PLACEMENT, title: 'Default placement' });
    expect(placement).toMatchObject({ status: TestStatus.DRAFT, maxAttempts: 1, showResultAfterSubmit: true, lessonId: null });
    await instructorAgent.post(`/api/instructor/courses/${courseA}/tests`).send({ type: TestType.PLACEMENT, title: 'Bad lesson', lessonId: lessonA }).expect(400);
    await instructorAgent.post(`/api/instructor/courses/${courseA}/tests`).send({ type: TestType.PLACEMENT, title: 'Bad attempts', maxAttempts: 0 }).expect(400);
    await instructorAgent.post(`/api/instructor/courses/${courseA}/tests`).send({ type: TestType.QUIZ, title: 'Draft quiz', lessonId: null }).expect(201);
    await instructorAgent.post(`/api/instructor/courses/${courseA}/tests`).send({ type: TestType.QUIZ, title: 'Same course quiz', lessonId: lessonA }).expect(201);
    await instructorAgent.post(`/api/instructor/courses/${courseA}/tests`).send({ type: TestType.QUIZ, title: 'Cross course quiz', lessonId: lessonB }).expect(404);

    const questionA = await createQuestion(courseA, 'Membership A');
    const questionB = await createQuestion(courseB, 'Membership B');
    const first = await instructorAgent.post(`/api/instructor/tests/${placement.id}/questions`).send({ questionId: questionA.id, points: 2 }).expect(201);
    expect(first.body.orderIndex).toBe(0);
    await instructorAgent.post(`/api/instructor/tests/${placement.id}/questions`).send({ questionId: questionA.id, points: 2 }).expect(409);
    await instructorAgent.post(`/api/instructor/tests/${placement.id}/questions`).send({ questionId: questionB.id, points: 2 }).expect(404);
    await instructorAgent.post(`/api/instructor/tests/${placement.id}/questions`).send({ questionId: questionA.id, points: 0 }).expect(400);

    const otherTest = await createTest(courseA, { type: TestType.PLACEMENT, title: 'Other nested test' });
    const otherQuestion = await createQuestion(courseA, 'Other nested question');
    const otherTq = await instructorAgent.post(`/api/instructor/tests/${otherTest.id}/questions`).send({ questionId: otherQuestion.id, points: 1 }).expect(201);
    await instructorAgent.patch(`/api/instructor/tests/${placement.id}/questions/${otherTq.body.id}`).send({ points: 2 }).expect(404);

    const referenced = await createQuestion(courseA, 'Referenced delete');
    await instructorAgent.post(`/api/instructor/tests/${otherTest.id}/questions`).send({ questionId: referenced.id }).expect(201);
    await instructorAgent.delete(`/api/instructor/questions/${referenced.id}`).expect(409);
    const unreferenced = await createQuestion(courseA, 'Unreferenced delete');
    const optionIds = unreferenced.options.map((option: { id: string }) => option.id);
    await instructorAgent.delete(`/api/instructor/questions/${unreferenced.id}`).expect(200);
    await expect(prisma.questionOption.count({ where: { id: { in: optionIds } } })).resolves.toBe(0);
  });

  it('validates publish/unpublish and complete TestQuestion reorder invariants', async () => {
    const empty = await createTest(courseA, { type: TestType.PLACEMENT, title: 'Empty publish' });
    await instructorAgent.patch(`/api/instructor/tests/${empty.id}/publish`).expect(400);

    const q1 = await createQuestion(courseA, 'Reorder one');
    const q2 = await createQuestion(courseA, 'Reorder two');
    const q3 = await createQuestion(courseA, 'Concurrent add');
    const valid = await createTest(courseA, { type: TestType.PLACEMENT, title: 'Valid publish' });
    const tq1 = (await instructorAgent.post(`/api/instructor/tests/${valid.id}/questions`).send({ questionId: q1.id }).expect(201)).body;
    const tq2 = (await instructorAgent.post(`/api/instructor/tests/${valid.id}/questions`).send({ questionId: q2.id }).expect(201)).body;

    await instructorAgent.patch(`/api/instructor/tests/${valid.id}/questions/reorder`).send({ orderedIds: [tq2.id, tq1.id] }).expect(200);
    for (const orderedIds of [[tq1.id, tq1.id], [tq1.id], [tq1.id, crypto.randomUUID()]]) {
      await instructorAgent.patch(`/api/instructor/tests/${valid.id}/questions/reorder`).send({ orderedIds }).expect(400);
    }
    const ordered = await prisma.testQuestion.findMany({ where: { testId: valid.id }, orderBy: { orderIndex: 'asc' } });
    expect(ordered.map(({ orderIndex }) => orderIndex)).toEqual([0, 1]);

    const race = await Promise.all([
      instructorAgent.patch(`/api/instructor/tests/${valid.id}/questions/reorder`).send({ orderedIds: [tq1.id, tq2.id] }),
      instructorAgent.post(`/api/instructor/tests/${valid.id}/questions`).send({ questionId: q3.id }),
    ]);
    expect(race.every(({ status }) => [200, 201, 400, 409].includes(status))).toBe(true);
    race.forEach(expectSafeError);
    const afterRace = await prisma.testQuestion.findMany({ where: { testId: valid.id }, orderBy: { orderIndex: 'asc' } });
    expect(afterRace.map(({ orderIndex }) => orderIndex)).toEqual(afterRace.map((_, index) => index));
    expect(new Set(afterRace.map(({ id }) => id)).size).toBe(afterRace.length);

    await instructorAgent.patch(`/api/instructor/tests/${valid.id}/publish`).expect(200);
    await instructorAgent.patch(`/api/instructor/tests/${valid.id}/publish`).expect(200);
    await instructorAgent.patch(`/api/instructor/tests/${valid.id}/unpublish`).expect(200);
    await instructorAgent.patch(`/api/instructor/tests/${valid.id}/unpublish`).expect(200);

    const quizNoLesson = await createTest(courseA, { type: TestType.QUIZ, title: 'Quiz missing lesson' });
    await instructorAgent.post(`/api/instructor/tests/${quizNoLesson.id}/questions`).send({ questionId: q1.id }).expect(201);
    await instructorAgent.patch(`/api/instructor/tests/${quizNoLesson.id}/publish`).expect(400);
    const quiz = await createTest(courseA, { type: TestType.QUIZ, title: 'Valid quiz', lessonId: lessonA });
    await instructorAgent.post(`/api/instructor/tests/${quiz.id}/questions`).send({ questionId: q1.id }).expect(201);
    await instructorAgent.patch(`/api/instructor/tests/${quiz.id}/publish`).expect(200);

    const crossLesson = await createTest(courseA, { type: TestType.QUIZ, title: 'Injected cross lesson' });
    await instructorAgent.post(`/api/instructor/tests/${crossLesson.id}/questions`).send({ questionId: q1.id }).expect(201);
    await prisma.test.update({ where: { id: crossLesson.id }, data: { lessonId: lessonB } });
    await instructorAgent.patch(`/api/instructor/tests/${crossLesson.id}/publish`).expect(404);

    const invalidStructure = await createTest(courseA, { type: TestType.PLACEMENT, title: 'Invalid structure' });
    const invalidQuestion = await createQuestion(courseA, 'Invalid after storage');
    await instructorAgent.post(`/api/instructor/tests/${invalidStructure.id}/questions`).send({ questionId: invalidQuestion.id }).expect(201);
    await prisma.questionOption.updateMany({ where: { questionId: invalidQuestion.id }, data: { isCorrect: false } });
    await instructorAgent.patch(`/api/instructor/tests/${invalidStructure.id}/publish`).expect(400);
  });

  it('freezes structure after a real Student Attempt while allowing mutable metadata', async () => {
    const question = await createQuestion(courseA, 'Historical question');
    const spare = await createQuestion(courseA, 'Historical spare');
    const assessment = await createTest(courseA, { type: TestType.PLACEMENT, title: 'Historical test', maxAttempts: 2 });
    const tq = (await instructorAgent.post(`/api/instructor/tests/${assessment.id}/questions`).send({ questionId: question.id, points: 2 }).expect(201)).body;
    await instructorAgent.patch(`/api/instructor/tests/${assessment.id}/publish`).expect(200);
    await studentAgent.post(`/api/learning/enrollments/${activeEnrollment}/tests/${assessment.id}/attempts`).expect(201);

    const blocked = await Promise.all([
      instructorAgent.patch(`/api/instructor/questions/${question.id}`).send({ content: 'Blocked edit' }),
      instructorAgent.post(`/api/instructor/tests/${assessment.id}/questions`).send({ questionId: spare.id }),
      instructorAgent.patch(`/api/instructor/tests/${assessment.id}/questions/${tq.id}`).send({ points: 3 }),
      instructorAgent.delete(`/api/instructor/tests/${assessment.id}/questions/${tq.id}`),
      instructorAgent.patch(`/api/instructor/tests/${assessment.id}/questions/reorder`).send({ orderedIds: [tq.id] }),
      instructorAgent.patch(`/api/instructor/tests/${assessment.id}/unpublish`),
      instructorAgent.patch(`/api/instructor/tests/${assessment.id}`).send({ maxAttempts: 3 }),
      instructorAgent.patch(`/api/instructor/tests/${assessment.id}`).send({ lessonId: lessonA }),
      instructorAgent.patch(`/api/instructor/tests/${assessment.id}`).send({ type: TestType.QUIZ, lessonId: lessonA }),
      instructorAgent.delete(`/api/instructor/tests/${assessment.id}`),
    ]);
    expect(blocked.every(({ status }) => status === 409)).toBe(true);
    blocked.forEach(expectSafeError);

    const sameLockedValue = await instructorAgent.patch(`/api/instructor/tests/${assessment.id}`).send({
      maxAttempts: 2,
      title: 'Historical title updated',
      description: 'Still editable',
      showResultAfterSubmit: false,
    }).expect(200);
    expect(sameLockedValue.body).toMatchObject({
      title: 'Historical title updated',
      description: 'Still editable',
      showResultAfterSubmit: false,
      maxAttempts: 2,
    });
  });

  async function createUser(email: string, role: UserRole, passwordHash: string) {
    return prisma.user.create({ data: { email, fullName: `VS03 ${role}`, role, status: UserStatus.ACTIVE, passwordHash } });
  }

  async function createCourse(label: string, createdById: string) {
    return prisma.course.create({ data: { title: `VS03 F1 Course ${label} ${unique}`, slug: `vs03-f1-${label.toLowerCase()}-${unique}`, description: 'Assessment E2E', level: 'E2E', isPublished: true, createdById } });
  }

  async function createQuestion(courseId: string, content: string) {
    return (await instructorAgent.post(`/api/instructor/courses/${courseId}/questions`).send(questionInput(QuestionType.SINGLE_CHOICE, [`${content} correct`, `${content} wrong`], [0], content)).expect(201)).body;
  }

  async function createTest(courseId: string, input: Record<string, unknown>) {
    return (await instructorAgent.post(`/api/instructor/courses/${courseId}/tests`).send(input).expect(201)).body;
  }
});

function questionInput(
  type: QuestionType,
  labels: string[],
  correctIndexes: number[],
  content = `${type} question`,
) {
  return {
    type,
    difficulty: QuestionDifficulty.HARD,
    content,
    explanation: 'Safe explanation',
    options: labels.map((label, index) => ({ content: label, isCorrect: correctIndexes.includes(index) })),
  };
}
