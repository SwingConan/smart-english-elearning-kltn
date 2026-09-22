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
import { computeBktUpdate } from '../src/modules/knowledge-model/bkt';
import { expectSafeError, loginAgent } from './assessment-e2e-helpers';

interface QuestionFixture {
  id: string;
  correctOptionId: string;
  wrongOptionId: string;
}

describe('BKT assessment submit integration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let studentAgent: ReturnType<typeof request.agent>;
  const sessionIds = new Set<string>();
  const unique = `${Date.now()}-${process.pid}`;
  const password = 'BktSubmitE2e!2026';
  let adminId: string;
  let studentId: string;
  let courseId: string;
  let offeringId: string;
  let enrollmentId: string;

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
    const [admin, student] = await Promise.all([
      prisma.user.create({
        data: {
          email: `vs04-c2-admin-${unique}@example.test`,
          fullName: 'VS04 C2 Admin',
          role: UserRole.ADMIN_COORDINATOR,
          status: UserStatus.ACTIVE,
          passwordHash,
        },
      }),
      prisma.user.create({
        data: {
          email: `vs04-c2-student-${unique}@example.test`,
          fullName: 'VS04 C2 Student',
          role: UserRole.STUDENT,
          status: UserStatus.ACTIVE,
          passwordHash,
        },
      }),
    ]);
    adminId = admin.id;
    studentId = student.id;
    const course = await prisma.course.create({
      data: {
        title: `VS04 C2 ${unique}`,
        slug: `vs04-c2-${unique}`,
        description: 'BKT submit integration E2E',
        level: 'E2E',
        isPublished: true,
        createdById: adminId,
      },
    });
    courseId = course.id;
    const offering = await prisma.classOffering.create({
      data: {
        courseId,
        name: `VS04 C2 Offering ${unique}`,
        status: ClassOfferingStatus.OPEN,
        pricingType: PricingType.FREE,
      },
    });
    offeringId = offering.id;
    const enrollment = await prisma.enrollment.create({
      data: {
        learnerId: studentId,
        classOfferingId: offeringId,
        status: EnrollmentStatus.ACTIVE,
      },
    });
    enrollmentId = enrollment.id;

    studentAgent = request.agent(app.getHttpServer());
    await loginAgent(
      studentAgent,
      `vs04-c2-student-${unique}@example.test`,
      password,
      sessionIds,
    );
  });

  afterAll(async () => {
    if (prisma) {
      const tests = await prisma.test.findMany({
        where: { courseId },
        select: { id: true },
      });
      const testIds = tests.map(({ id }) => id);
      const attempts = await prisma.testAttempt.findMany({
        where: { testId: { in: testIds } },
        select: { id: true },
      });
      const attemptIds = attempts.map(({ id }) => id);
      const questions = await prisma.question.findMany({
        where: { courseId },
        select: { id: true },
      });
      const questionIds = questions.map(({ id }) => id);

      await prisma.masteryHistory.deleteMany({ where: { enrollmentId } });
      await prisma.learnerSkillState.deleteMany({ where: { enrollmentId } });
      await prisma.testAnswer.deleteMany({ where: { attemptId: { in: attemptIds } } });
      await prisma.testAttempt.deleteMany({ where: { id: { in: attemptIds } } });
      await prisma.testQuestion.deleteMany({ where: { testId: { in: testIds } } });
      await prisma.test.deleteMany({ where: { id: { in: testIds } } });
      await prisma.questionSkill.deleteMany({ where: { questionId: { in: questionIds } } });
      await prisma.questionOption.deleteMany({ where: { questionId: { in: questionIds } } });
      await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
      await prisma.skill.deleteMany({ where: { courseId } });
      await prisma.enrollment.delete({ where: { id: enrollmentId } });
      await prisma.classOffering.delete({ where: { id: offeringId } });
      await prisma.course.delete({ where: { id: courseId } });
      await prisma.userSession.deleteMany({ where: { sid: { in: [...sessionIds] } } });
      await prisma.user.deleteMany({ where: { id: { in: [adminId, studentId] } } });
    }
    if (app) await app.close();
  });

  it('creates independent, sequential state and history only for mapped Skills', async () => {
    const grammar = await createSkill('CORE_GRAMMAR', 0.2, 0.1, 0.2, 0.1);
    const vocabulary = await createSkill('CORE_VOCAB', 0.6, 0.2, 0.15, 0.05);
    const multiSkillQuestion = await createQuestion('Core multi-Skill');
    const grammarQuestion = await createQuestion('Core grammar incorrect');
    const unmappedQuestion = await createQuestion('Core unmapped');
    await prisma.questionSkill.createMany({
      data: [
        { questionId: multiSkillQuestion.id, skillId: grammar.id },
        { questionId: multiSkillQuestion.id, skillId: vocabulary.id },
        { questionId: grammarQuestion.id, skillId: grammar.id },
      ],
    });
    const testId = await createAssessment([
      multiSkillQuestion.id,
      grammarQuestion.id,
      unmappedQuestion.id,
    ]);
    const attemptId = await startAttempt(testId);
    const testQuestions = await testQuestionMap(testId);

    const submitted = await submitAttempt(attemptId, [
      answer(testQuestions.get(multiSkillQuestion.id), multiSkillQuestion.correctOptionId),
      answer(testQuestions.get(grammarQuestion.id), grammarQuestion.wrongOptionId),
      answer(testQuestions.get(unmappedQuestion.id), unmappedQuestion.correctOptionId),
    ]).expect(201);
    expectSafeError(submitted);

    const grammarCorrect = computeBktUpdate(0.2, 0.1, 0.2, 0.1, true);
    const grammarIncorrect = computeBktUpdate(
      grammarCorrect.posteriorMastery,
      0.1,
      0.2,
      0.1,
      false,
    );
    const vocabularyCorrect = computeBktUpdate(0.6, 0.2, 0.15, 0.05, true);
    const states = await prisma.learnerSkillState.findMany({
      where: { enrollmentId },
      include: { skill: { select: { courseId: true } } },
      orderBy: { skillId: 'asc' },
    });
    expect(states).toHaveLength(2);
    expect(states.every(({ skill }) => skill.courseId === courseId)).toBe(true);
    const grammarState = states.find(({ skillId }) => skillId === grammar.id)!;
    const vocabularyState = states.find(({ skillId }) => skillId === vocabulary.id)!;
    expect(grammarState.observationCount).toBe(2);
    expect(grammarState.masteryProbability).toBeCloseTo(
      grammarIncorrect.posteriorMastery,
      10,
    );
    expect(vocabularyState.observationCount).toBe(1);
    expect(vocabularyState.masteryProbability).toBeCloseTo(
      vocabularyCorrect.posteriorMastery,
      10,
    );

    const histories = await prisma.masteryHistory.findMany({
      where: { testAttemptId: attemptId },
      include: { testAnswer: { select: { testQuestionId: true } } },
    });
    expect(histories).toHaveLength(3);
    const grammarHistory = histories
      .filter(({ skillId }) => skillId === grammar.id)
      .sort((left, right) =>
        left.testAnswer.testQuestionId === testQuestions.get(multiSkillQuestion.id)
          ? -1
          : right.testAnswer.testQuestionId === testQuestions.get(multiSkillQuestion.id)
            ? 1
            : 0,
      );
    expect(grammarHistory).toHaveLength(2);
    expect(grammarHistory[0]).toMatchObject({
      isCorrect: true,
      priorMastery: 0.2,
      evidencePosterior: grammarCorrect.evidencePosterior,
      posteriorMastery: grammarCorrect.posteriorMastery,
    });
    expect(grammarHistory[1].isCorrect).toBe(false);
    expect(grammarHistory[1].priorMastery).toBeCloseTo(
      grammarCorrect.posteriorMastery,
      10,
    );
    expect(grammarHistory[1].posteriorMastery).toBeCloseTo(
      grammarIncorrect.posteriorMastery,
      10,
    );
    const vocabularyHistory = histories.find(({ skillId }) => skillId === vocabulary.id)!;
    expect(vocabularyHistory.priorMastery).toBe(0.6);
    expect(vocabularyHistory.posteriorMastery).toBeCloseTo(
      vocabularyCorrect.posteriorMastery,
      10,
    );
    expect(
      histories.some(
        ({ testAnswer }) =>
          testAnswer.testQuestionId === testQuestions.get(unmappedQuestion.id),
      ),
    ).toBe(false);

    const statesBeforeRepeat = await prisma.learnerSkillState.findMany({
      where: { enrollmentId },
      orderBy: { id: 'asc' },
    });
    const historyBeforeRepeat = await prisma.masteryHistory.findMany({
      where: { testAttemptId: attemptId },
      orderBy: { id: 'asc' },
    });
    const repeated = await submitAttempt(attemptId, []).expect(201);
    expect(repeated.body.attempt.submittedAt).toBe(submitted.body.attempt.submittedAt);
    await expect(
      prisma.learnerSkillState.findMany({ where: { enrollmentId }, orderBy: { id: 'asc' } }),
    ).resolves.toEqual(statesBeforeRepeat);
    await expect(
      prisma.masteryHistory.findMany({
        where: { testAttemptId: attemptId },
        orderBy: { id: 'asc' },
      }),
    ).resolves.toEqual(historyBeforeRepeat);
  });

  it('uses submission-time mappings without rewriting earlier history', async () => {
    const skillA = await createSkill('REMAP_A', 0.3, 0.1, 0.2, 0.1);
    const skillB = await createSkill('REMAP_B', 0.7, 0.1, 0.2, 0.1);
    const question = await createQuestion('Remapped question');
    await prisma.questionSkill.create({ data: { questionId: question.id, skillId: skillA.id } });

    const firstTest = await createAssessment([question.id]);
    const firstAttempt = await startAttempt(firstTest);
    const firstQuestions = await testQuestionMap(firstTest);
    await submitAttempt(firstAttempt, [
      answer(firstQuestions.get(question.id), question.correctOptionId),
    ]).expect(201);

    await prisma.questionSkill.deleteMany({ where: { questionId: question.id } });
    await prisma.questionSkill.create({ data: { questionId: question.id, skillId: skillB.id } });
    const secondTest = await createAssessment([question.id]);
    const secondAttempt = await startAttempt(secondTest);
    const secondQuestions = await testQuestionMap(secondTest);
    await submitAttempt(secondAttempt, [
      answer(secondQuestions.get(question.id), question.wrongOptionId),
    ]).expect(201);

    const histories = await prisma.masteryHistory.findMany({
      where: { testAttemptId: { in: [firstAttempt, secondAttempt] } },
    });
    expect(histories).toHaveLength(2);
    expect(histories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ testAttemptId: firstAttempt, skillId: skillA.id }),
        expect.objectContaining({ testAttemptId: secondAttempt, skillId: skillB.id }),
      ]),
    );
    await expect(
      prisma.masteryHistory.count({ where: { testAttemptId: firstAttempt, skillId: skillA.id } }),
    ).resolves.toBe(1);
  });

  it('applies BKT exactly once for concurrent submits of the same Attempt', async () => {
    const skill = await createSkill('SAME_ATTEMPT', 0.4, 0.1, 0.2, 0.1);
    const question = await createQuestion('Same Attempt concurrency');
    await prisma.questionSkill.create({ data: { questionId: question.id, skillId: skill.id } });
    const testId = await createAssessment([question.id]);
    const attemptId = await startAttempt(testId);
    const testQuestions = await testQuestionMap(testId);
    const testQuestionId = testQuestions.get(question.id);

    const responses = await Promise.all([
      submitAttempt(attemptId, [answer(testQuestionId, question.correctOptionId)]),
      submitAttempt(attemptId, [answer(testQuestionId, question.wrongOptionId)]),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([201, 201]);
    expect(responses[0].body.attempt.submittedAt).toBe(responses[1].body.attempt.submittedAt);
    await expect(
      prisma.masteryHistory.count({ where: { testAttemptId: attemptId, skillId: skill.id } }),
    ).resolves.toBe(1);
    const state = await prisma.learnerSkillState.findUniqueOrThrow({
      where: { enrollmentId_skillId: { enrollmentId, skillId: skill.id } },
    });
    expect(state.observationCount).toBe(1);
  });

  it('serializes concurrent different Attempts that observe the same Skill', async () => {
    const skill = await createSkill('DIFFERENT_ATTEMPTS', 0.35, 0.12, 0.2, 0.08);
    const correctQuestion = await createQuestion('Concurrent correct');
    const incorrectQuestion = await createQuestion('Concurrent incorrect');
    await prisma.questionSkill.createMany({
      data: [
        { questionId: correctQuestion.id, skillId: skill.id },
        { questionId: incorrectQuestion.id, skillId: skill.id },
      ],
    });
    const correctTest = await createAssessment([correctQuestion.id]);
    const incorrectTest = await createAssessment([incorrectQuestion.id]);
    const correctAttempt = await startAttempt(correctTest);
    const incorrectAttempt = await startAttempt(incorrectTest);
    const correctQuestions = await testQuestionMap(correctTest);
    const incorrectQuestions = await testQuestionMap(incorrectTest);

    const responses = await Promise.all([
      submitAttempt(correctAttempt, [
        answer(correctQuestions.get(correctQuestion.id), correctQuestion.correctOptionId),
      ]),
      submitAttempt(incorrectAttempt, [
        answer(incorrectQuestions.get(incorrectQuestion.id), incorrectQuestion.wrongOptionId),
      ]),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([201, 201]);
    await expect(
      prisma.masteryHistory.count({
        where: { testAttemptId: { in: [correctAttempt, incorrectAttempt] }, skillId: skill.id },
      }),
    ).resolves.toBe(2);
    const state = await prisma.learnerSkillState.findUniqueOrThrow({
      where: { enrollmentId_skillId: { enrollmentId, skillId: skill.id } },
    });
    expect(state.observationCount).toBe(2);

    const afterCorrect = computeBktUpdate(0.35, 0.12, 0.2, 0.08, true);
    const correctThenIncorrect = computeBktUpdate(
      afterCorrect.posteriorMastery,
      0.12,
      0.2,
      0.08,
      false,
    );
    const afterIncorrect = computeBktUpdate(0.35, 0.12, 0.2, 0.08, false);
    const incorrectThenCorrect = computeBktUpdate(
      afterIncorrect.posteriorMastery,
      0.12,
      0.2,
      0.08,
      true,
    );
    expect(
      [correctThenIncorrect.posteriorMastery, incorrectThenCorrect.posteriorMastery].some(
        (valid) => Math.abs(state.masteryProbability - valid) < 1e-10,
      ),
    ).toBe(true);
  });

  it('rolls back answers, mastery, history, and submit when BKT data is invalid', async () => {
    const skill = await createSkill('ROLLBACK', 0.5, 0.1, 0.2, 0.1);
    const question = await createQuestion('Rollback question');
    await prisma.questionSkill.create({ data: { questionId: question.id, skillId: skill.id } });
    const testId = await createAssessment([question.id]);
    const attemptId = await startAttempt(testId);
    const testQuestions = await testQuestionMap(testId);

    await prisma.$executeRaw`
      UPDATE "skills"
      SET "pLearn" = 'NaN'::double precision
      WHERE "id" = ${skill.id}::uuid
    `;
    const response = await submitAttempt(attemptId, [
      answer(testQuestions.get(question.id), question.correctOptionId),
    ]).expect(500);
    expectSafeError(response);

    const attempt = await prisma.testAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.status).toBe(TestAttemptStatus.IN_PROGRESS);
    expect(attempt.submittedAt).toBeNull();
    await expect(prisma.testAnswer.count({ where: { attemptId } })).resolves.toBe(0);
    await expect(prisma.masteryHistory.count({ where: { testAttemptId: attemptId } })).resolves.toBe(
      0,
    );
    await expect(
      prisma.learnerSkillState.count({ where: { enrollmentId, skillId: skill.id } }),
    ).resolves.toBe(0);
    await prisma.skill.update({ where: { id: skill.id }, data: { pLearn: 0.1 } });
  });

  async function createSkill(
    code: string,
    pInit: number,
    pLearn: number,
    pGuess: number,
    pSlip: number,
  ) {
    return prisma.skill.create({
      data: {
        courseId,
        code: `${code}_${unique}`,
        name: code,
        pInit,
        pLearn,
        pGuess,
        pSlip,
      },
    });
  }

  async function createQuestion(label: string): Promise<QuestionFixture> {
    const question = await prisma.question.create({
      data: {
        courseId,
        type: QuestionType.SINGLE_CHOICE,
        difficulty: QuestionDifficulty.MEDIUM,
        content: `${label} ${unique}`,
        explanation: `${label} explanation`,
        options: {
          create: [
            { content: 'Correct', isCorrect: true, orderIndex: 0 },
            { content: 'Wrong', isCorrect: false, orderIndex: 1 },
          ],
        },
      },
      include: { options: { orderBy: { orderIndex: 'asc' } } },
    });
    return {
      id: question.id,
      correctOptionId: question.options[0].id,
      wrongOptionId: question.options[1].id,
    };
  }

  async function createAssessment(questionIds: string[]): Promise<string> {
    const assessment = await prisma.test.create({
      data: {
        courseId,
        type: TestType.PLACEMENT,
        title: `VS04 C2 Test ${crypto.randomUUID()}`,
        status: TestStatus.PUBLISHED,
        maxAttempts: 1,
        showResultAfterSubmit: true,
      },
    });
    for (const [orderIndex, questionId] of questionIds.entries()) {
      await prisma.testQuestion.create({
        data: { testId: assessment.id, questionId, orderIndex, points: 1 },
      });
    }
    return assessment.id;
  }

  async function startAttempt(testId: string): Promise<string> {
    const response = await studentAgent
      .post(`/api/learning/enrollments/${enrollmentId}/tests/${testId}/attempts`)
      .expect(201);
    return response.body.id as string;
  }

  async function testQuestionMap(testId: string): Promise<Map<string, string>> {
    const rows = await prisma.testQuestion.findMany({
      where: { testId },
      select: { id: true, questionId: true },
    });
    return new Map(rows.map(({ questionId, id }) => [questionId, id]));
  }

  function submitAttempt(
    attemptId: string,
    answers: Array<{ testQuestionId: string; selectedOptionIds: string[] }>,
  ) {
    return studentAgent
      .post(`/api/learning/enrollments/${enrollmentId}/attempts/${attemptId}/submit`)
      .send({ answers });
  }
});

function answer(testQuestionId: string | undefined, selectedOptionId: string) {
  if (!testQuestionId) throw new Error('Expected TestQuestion fixture');
  return { testQuestionId, selectedOptionIds: [selectedOptionId] };
}
