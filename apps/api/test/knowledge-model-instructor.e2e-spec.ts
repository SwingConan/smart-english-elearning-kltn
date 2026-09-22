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

describe('Instructor knowledge-model APIs (e2e)', () => {
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
  const password = 'KnowledgeModelE2e!2026';
  let courseA: string;
  let courseB: string;
  let lessonA: string;
  let lessonB: string;
  let questionA: string;
  let enrollmentA: string;
  let skillA: string;
  let skillB: string;
  let skillC: string;
  let crossCourseSkill: string;

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
    const users = await Promise.all([
      createUser(`vs04-b-admin-${unique}@example.test`, UserRole.ADMIN_COORDINATOR, passwordHash),
      createUser(`vs04-b-instructor-${unique}@example.test`, UserRole.INSTRUCTOR, passwordHash),
      createUser(`vs04-b-other-${unique}@example.test`, UserRole.INSTRUCTOR, passwordHash),
      createUser(`vs04-b-student-${unique}@example.test`, UserRole.STUDENT, passwordHash),
    ]);
    userIds.push(...users.map(({ id }) => id));
    const [admin, instructor, otherInstructor, student] = users;

    const courses = await Promise.all([createCourse('A', admin.id), createCourse('B', admin.id)]);
    [courseA, courseB] = courses.map(({ id }) => id);
    courseIds.push(courseA, courseB);

    const offerings = await Promise.all([
      prisma.classOffering.create({
        data: {
          courseId: courseA,
          instructorId: instructor.id,
          name: 'VS04 B A',
          status: ClassOfferingStatus.OPEN,
          pricingType: PricingType.FREE,
        },
      }),
      prisma.classOffering.create({
        data: {
          courseId: courseB,
          instructorId: instructor.id,
          name: 'VS04 B B',
          status: ClassOfferingStatus.OPEN,
          pricingType: PricingType.FREE,
        },
      }),
    ]);
    offeringIds.push(...offerings.map(({ id }) => id));
    const enrollment = await prisma.enrollment.create({
      data: {
        learnerId: student.id,
        classOfferingId: offerings[0].id,
        status: EnrollmentStatus.ACTIVE,
      },
    });
    enrollmentA = enrollment.id;
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

    const question = await prisma.question.create({
      data: {
        courseId: courseA,
        type: QuestionType.SINGLE_CHOICE,
        difficulty: QuestionDifficulty.EASY,
        content: 'Knowledge model question A',
        options: {
          create: [
            { content: 'Correct', isCorrect: true, orderIndex: 0 },
            { content: 'Wrong', isCorrect: false, orderIndex: 1 },
          ],
        },
      },
    });
    questionA = question.id;

    const skills = await Promise.all([
      prisma.skill.create({ data: { courseId: courseA, code: 'ALPHA', name: 'Alpha' } }),
      prisma.skill.create({ data: { courseId: courseA, code: 'BETA', name: 'Beta' } }),
      prisma.skill.create({ data: { courseId: courseA, code: 'GAMMA', name: 'Gamma' } }),
      prisma.skill.create({ data: { courseId: courseB, code: 'FOREIGN', name: 'Foreign' } }),
    ]);
    [skillA, skillB, skillC, crossCourseSkill] = skills.map(({ id }) => id);

    instructorAgent = request.agent(app.getHttpServer());
    unassignedAgent = request.agent(app.getHttpServer());
    studentAgent = request.agent(app.getHttpServer());
    await loginAgent(instructorAgent, users[1].email, password, sessionIds);
    await loginAgent(unassignedAgent, otherInstructor.email, password, sessionIds);
    await loginAgent(studentAgent, student.email, password, sessionIds);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.masteryHistory.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } });
      await prisma.learnerSkillState.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } });
      await prisma.questionSkill.deleteMany({
        where: { question: { courseId: { in: courseIds } } },
      });
      await prisma.lessonSkill.deleteMany({
        where: { lesson: { module: { courseId: { in: courseIds } } } },
      });
      await prisma.skillPrerequisite.deleteMany({
        where: { skill: { courseId: { in: courseIds } } },
      });
      await prisma.skill.deleteMany({ where: { courseId: { in: courseIds } } });

      const tests = await prisma.test.findMany({
        where: { courseId: { in: courseIds } },
        select: { id: true },
      });
      const testIds = tests.map(({ id }) => id);
      const attempts = await prisma.testAttempt.findMany({
        where: { testId: { in: testIds } },
        select: { id: true },
      });
      await prisma.testAnswer.deleteMany({
        where: { attemptId: { in: attempts.map(({ id }) => id) } },
      });
      await prisma.testAttempt.deleteMany({ where: { testId: { in: testIds } } });
      await prisma.testQuestion.deleteMany({ where: { testId: { in: testIds } } });
      await prisma.test.deleteMany({ where: { id: { in: testIds } } });
      const questions = await prisma.question.findMany({
        where: { courseId: { in: courseIds } },
        select: { id: true },
      });
      await prisma.questionOption.deleteMany({
        where: { questionId: { in: questions.map(({ id }) => id) } },
      });
      await prisma.question.deleteMany({
        where: { id: { in: questions.map(({ id }) => id) } },
      });
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

  it('enforces authentication, Instructor role, assignment, and entity-first authorization', async () => {
    await request(app.getHttpServer()).get(`/api/instructor/courses/${courseA}/skills`).expect(401);
    await studentAgent.get(`/api/instructor/courses/${courseA}/skills`).expect(403);
    await unassignedAgent.get(`/api/instructor/courses/${courseA}/skills`).expect(403);
    await unassignedAgent.get(`/api/instructor/skills/${skillA}/prerequisites`).expect(403);
    await instructorAgent
      .get(`/api/instructor/skills/${crypto.randomUUID()}/prerequisites`)
      .expect(404);
  });

  it('lists and creates Skills with defaults, custom parameters, validation and uniqueness', async () => {
    const defaults = await instructorAgent
      .post(`/api/instructor/courses/${courseA}/skills`)
      .send({ code: '  Case_Code  ', name: '  Default Skill  ' })
      .expect(201);
    expect(defaults.body).toMatchObject({
      code: 'Case_Code',
      name: 'Default Skill',
      pInit: 0.5,
      pLearn: 0.1,
      pGuess: 0.2,
      pSlip: 0.1,
    });

    await instructorAgent
      .post(`/api/instructor/courses/${courseA}/skills`)
      .send({
        code: 'CUSTOM_BKT',
        name: 'Custom BKT',
        pInit: 0.3,
        pLearn: 0.25,
        pGuess: 0.4,
        pSlip: 0.2,
      })
      .expect(201);
    await instructorAgent
      .post(`/api/instructor/courses/${courseA}/skills`)
      .send({ code: 'BAD_RANGE', name: 'Bad', pInit: 1.1 })
      .expect(400);
    await instructorAgent
      .post(`/api/instructor/courses/${courseA}/skills`)
      .send({ code: 'BAD_SUM', name: 'Bad', pGuess: 0.7, pSlip: 0.3 })
      .expect(400);
    const duplicate = await instructorAgent
      .post(`/api/instructor/courses/${courseA}/skills`)
      .send({ code: 'Case_Code', name: 'Duplicate' })
      .expect(409);
    expectSafeError(duplicate);

    const list = await instructorAgent.get(`/api/instructor/courses/${courseA}/skills`).expect(200);
    const codes = list.body.map((skill: { code: string }) => skill.code);
    const repeated = await instructorAgent
      .get(`/api/instructor/courses/${courseA}/skills`)
      .expect(200);
    expect(repeated.body.map((skill: { code: string }) => skill.code)).toEqual(codes);
    expect(codes).toEqual(expect.arrayContaining(['ALPHA', 'Case_Code', 'CUSTOM_BKT']));
    expect(list.body[0]).not.toHaveProperty('learnerStates');
    expect(list.body[0]).not.toHaveProperty('masteryHistory');
  });

  it('updates effective values and freezes only changed BKT parameters after history', async () => {
    const beforeHistory = await createSkill('HISTORY_SKILL', 'History Skill');
    await instructorAgent
      .patch(`/api/instructor/skills/${beforeHistory.id}`)
      .send({ name: 'Before History', pGuess: 0.3, pSlip: 0.2 })
      .expect(200);
    await instructorAgent
      .patch(`/api/instructor/skills/${beforeHistory.id}`)
      .send({ pGuess: 0.85 })
      .expect(400);

    await createMasteryHistory(beforeHistory.id, questionA);
    const blocked = await instructorAgent
      .patch(`/api/instructor/skills/${beforeHistory.id}`)
      .send({ pInit: 0.6 })
      .expect(409);
    expectSafeError(blocked);

    const sameValue = await instructorAgent
      .patch(`/api/instructor/skills/${beforeHistory.id}`)
      .send({ pGuess: 0.3, name: 'Same Value Allowed' })
      .expect(200);
    expect(sameValue.body).toMatchObject({ name: 'Same Value Allowed', pGuess: 0.3 });
    await instructorAgent
      .patch(`/api/instructor/skills/${beforeHistory.id}`)
      .send({ description: 'Metadata remains editable' })
      .expect(200);
  });

  it('deletes unreferenced Skills and returns a safe conflict for referenced Skills', async () => {
    const removable = await createSkill('REMOVABLE', 'Removable');
    await instructorAgent.delete(`/api/instructor/skills/${removable.id}`).expect(200);
    await expect(prisma.skill.findUnique({ where: { id: removable.id } })).resolves.toBeNull();

    const referenced = await createSkill('REFERENCED', 'Referenced');
    await prisma.questionSkill.create({ data: { questionId: questionA, skillId: referenced.id } });
    const response = await instructorAgent
      .delete(`/api/instructor/skills/${referenced.id}`)
      .expect(409);
    expectSafeError(response);
  });

  it('performs atomic full-set prerequisite replacement and rejects invalid/cyclic graphs', async () => {
    await replacePrerequisites(skillA, [skillB, skillC], 200);
    let current = await instructorAgent
      .get(`/api/instructor/skills/${skillA}/prerequisites`)
      .expect(200);
    expect(current.body.map((skill: { id: string }) => skill.id)).toEqual([skillB, skillC]);

    await replacePrerequisites(skillA, [skillC], 200);
    current = await instructorAgent
      .get(`/api/instructor/skills/${skillA}/prerequisites`)
      .expect(200);
    expect(current.body.map((skill: { id: string }) => skill.id)).toEqual([skillC]);
    await replacePrerequisites(skillA, [skillB, skillB], 400);
    await replacePrerequisites(skillA, [skillA], 400);
    await replacePrerequisites(skillA, [crossCourseSkill], 404);
    current = await instructorAgent
      .get(`/api/instructor/skills/${skillA}/prerequisites`)
      .expect(200);
    expect(current.body.map((skill: { id: string }) => skill.id)).toEqual([skillC]);

    await replacePrerequisites(skillA, [skillB], 200);
    await replacePrerequisites(skillB, [skillA], 400);
    await replacePrerequisites(skillB, [skillC], 200);
    await replacePrerequisites(skillC, [skillA], 400);
    const cAfterFailure = await instructorAgent
      .get(`/api/instructor/skills/${skillC}/prerequisites`)
      .expect(200);
    expect(cAfterFailure.body).toEqual([]);

    await replacePrerequisites(skillA, [], 200);
    await replacePrerequisites(skillB, [], 200);
  });

  it('serializes conflicting prerequisite replacements without leaving a cycle', async () => {
    const responses = await Promise.all([
      instructorAgent
        .put(`/api/instructor/skills/${skillA}/prerequisites`)
        .send({ prerequisiteSkillIds: [skillB] }),
      instructorAgent
        .put(`/api/instructor/skills/${skillB}/prerequisites`)
        .send({ prerequisiteSkillIds: [skillA] }),
    ]);
    responses.forEach(expectSafeError);
    expect(responses.filter(({ status }) => status === 200)).toHaveLength(1);
    expect(responses.every(({ status }) => [200, 400, 409].includes(status))).toBe(true);

    const edges = await prisma.skillPrerequisite.findMany({
      where: { skillId: { in: [skillA, skillB] } },
      select: { skillId: true, prerequisiteSkillId: true },
    });
    expect(edges).toHaveLength(1);
    await replacePrerequisites(skillA, [], 200);
    await replacePrerequisites(skillB, [], 200);
  });

  it('replaces QuestionSkill sets, permits zero/many and preserves history', async () => {
    await instructorAgent
      .put(`/api/instructor/questions/${questionA}/skills`)
      .send({ skillIds: [skillA, skillB] })
      .expect(200);
    let current = await instructorAgent
      .get(`/api/instructor/questions/${questionA}/skills`)
      .expect(200);
    expect(current.body.map((skill: { id: string }) => skill.id)).toEqual([skillA, skillB]);

    await instructorAgent
      .put(`/api/instructor/questions/${questionA}/skills`)
      .send({ skillIds: [skillB] })
      .expect(200);
    await instructorAgent
      .put(`/api/instructor/questions/${questionA}/skills`)
      .send({ skillIds: [skillB, skillB] })
      .expect(400);
    await instructorAgent
      .put(`/api/instructor/questions/${questionA}/skills`)
      .send({ skillIds: [crossCourseSkill] })
      .expect(404);

    const history = await createMasteryHistory(skillA, questionA);
    const historyCount = await prisma.masteryHistory.count({ where: { id: history.id } });
    await instructorAgent
      .put(`/api/instructor/questions/${questionA}/skills`)
      .send({ skillIds: [skillA, skillC] })
      .expect(200);
    await instructorAgent
      .put(`/api/instructor/questions/${questionA}/skills`)
      .send({ skillIds: [] })
      .expect(200);
    current = await instructorAgent
      .get(`/api/instructor/questions/${questionA}/skills`)
      .expect(200);
    expect(current.body).toEqual([]);
    await expect(prisma.masteryHistory.count({ where: { id: history.id } })).resolves.toBe(
      historyCount,
    );
  });

  it('replaces LessonSkill sets with zero/one/many and rejects duplicate or cross-Course IDs', async () => {
    await instructorAgent
      .put(`/api/instructor/lessons/${lessonA}/skills`)
      .send({ skillIds: [skillA, skillC] })
      .expect(200);
    let current = await instructorAgent
      .get(`/api/instructor/lessons/${lessonA}/skills`)
      .expect(200);
    expect(current.body.map((skill: { id: string }) => skill.id)).toEqual([skillA, skillC]);
    await instructorAgent
      .put(`/api/instructor/lessons/${lessonA}/skills`)
      .send({ skillIds: [skillC] })
      .expect(200);
    await instructorAgent
      .put(`/api/instructor/lessons/${lessonA}/skills`)
      .send({ skillIds: [skillC, skillC] })
      .expect(400);
    await instructorAgent
      .put(`/api/instructor/lessons/${lessonA}/skills`)
      .send({ skillIds: [crossCourseSkill] })
      .expect(404);
    await instructorAgent
      .put(`/api/instructor/lessons/${lessonA}/skills`)
      .send({ skillIds: [] })
      .expect(200);
    current = await instructorAgent.get(`/api/instructor/lessons/${lessonA}/skills`).expect(200);
    expect(current.body).toEqual([]);
    await instructorAgent.get(`/api/instructor/lessons/${lessonB}/skills`).expect(200);
  });

  async function createUser(email: string, role: UserRole, passwordHash: string) {
    return prisma.user.create({
      data: { email, fullName: `VS04 ${role}`, role, status: UserStatus.ACTIVE, passwordHash },
    });
  }

  async function createCourse(label: string, createdById: string) {
    return prisma.course.create({
      data: {
        title: `VS04 B Course ${label} ${unique}`,
        slug: `vs04-b-${label.toLowerCase()}-${unique}`,
        description: 'Knowledge-model E2E',
        level: 'E2E',
        isPublished: true,
        createdById,
      },
    });
  }

  async function createSkill(code: string, name: string) {
    return (
      await instructorAgent
        .post(`/api/instructor/courses/${courseA}/skills`)
        .send({ code, name })
        .expect(201)
    ).body;
  }

  async function replacePrerequisites(skillId: string, ids: string[], status: number) {
    return instructorAgent
      .put(`/api/instructor/skills/${skillId}/prerequisites`)
      .send({ prerequisiteSkillIds: ids })
      .expect(status);
  }

  async function createMasteryHistory(skillId: string, questionId: string) {
    const test = await prisma.test.create({
      data: {
        courseId: courseA,
        type: TestType.PLACEMENT,
        title: `History ${crypto.randomUUID()}`,
        status: TestStatus.PUBLISHED,
      },
    });
    const testQuestion = await prisma.testQuestion.create({
      data: { testId: test.id, questionId, orderIndex: 0, points: 1 },
    });
    const attempt = await prisma.testAttempt.create({
      data: {
        testId: test.id,
        enrollmentId: enrollmentA,
        attemptNumber: 1,
        status: TestAttemptStatus.SUBMITTED,
        score: 1,
        maxScore: 1,
        submittedAt: new Date(),
      },
    });
    const answer = await prisma.testAnswer.create({
      data: {
        attemptId: attempt.id,
        testQuestionId: testQuestion.id,
        isCorrect: true,
        pointsAwarded: 1,
      },
    });
    return prisma.masteryHistory.create({
      data: {
        enrollmentId: enrollmentA,
        skillId,
        testAttemptId: attempt.id,
        testAnswerId: answer.id,
        isCorrect: true,
        priorMastery: 0.5,
        evidencePosterior: 0.8,
        posteriorMastery: 0.82,
      },
    });
  }
});
