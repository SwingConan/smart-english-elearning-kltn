import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { M06_FINAL_ATTEMPT_ID, M06_MIDTERM_ASSESSMENT_ID, M06_MIDTERM_TEST_ID, M06_PENDING_ATTEMPT_ID } from '../prisma/m06-seed';
import { loginAgent } from './assessment-e2e-helpers';

describe('M06 in-class assessment lifecycle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let student: ReturnType<typeof request.agent>;
  let instructor: ReturnType<typeof request.agent>;
  let enrollmentId: string;
  let learnerId: string;
  let classOfferingId: string;
  const sessionIds = new Set<string>();

  beforeAll(async () => {
    const password = process.env.SEED_DEFAULT_PASSWORD;
    if (!password) throw new Error('M06 E2E requires SEED_DEFAULT_PASSWORD and deterministic seed data');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    const assessment = await prisma.classAssessment.findUniqueOrThrow({ where: { id: M06_MIDTERM_ASSESSMENT_ID }, select: { classOfferingId: true } });
    classOfferingId = assessment.classOfferingId;
    const enrollment = await prisma.enrollment.findFirstOrThrow({ where: { classOfferingId, learner: { email: 'student.demo@smart-elearning.local' } }, select: { id: true, learnerId: true } });
    enrollmentId = enrollment.id;
    learnerId = enrollment.learnerId;
    student = request.agent(app.getHttpServer());
    instructor = request.agent(app.getHttpServer());
    await loginAgent(student, 'student.demo@smart-elearning.local', password, sessionIds);
    await loginAgent(instructor, 'instructor.demo@smart-elearning.local', password, sessionIds);
  });

  afterAll(async () => {
    if (prisma) await prisma.userSession.deleteMany({ where: { sid: { in: [...sessionIds] } } });
    if (app) await app.close();
  });

  it('projects three separately assigned demo assessments without answer-key secrets', async () => {
    const response = await student.get(`/api/learning/enrollments/${enrollmentId}/tests`).expect(200);
    const m06 = response.body.filter((item: { id: string }) => item.id.startsWith('86000000-'));
    expect(m06).toHaveLength(3);
    expect(m06.map((item: { stage: string }) => item.stage)).toEqual(['PERIODIC', 'MIDTERM', 'FINAL']);
    expect(m06.map((item: { title: string }) => item.title)).toEqual([
      'Kiểm tra thường kỳ 01',
      'Kiểm tra giữa kỳ',
      'Kiểm tra cuối kỳ',
    ]);
    expect(m06.find((item: { id: string }) => item.id === M06_MIDTERM_TEST_ID)).toMatchObject({ questionCount: 11, timeLimitMinutes: 30, skills: ['LISTENING', 'READING', 'SPEAKING', 'WRITING'] });
    expect(JSON.stringify(m06)).not.toMatch(/isCorrect|explanation|rubric|answerKey/);
  });

  it('keeps pending productive skills and overall total truthful until instructor final grading', async () => {
    const pending = await student.get(`/api/learning/enrollments/${enrollmentId}/attempts/${M06_PENDING_ATTEMPT_ID}/result`).expect(200);
    expect(pending.body).toMatchObject({ gradingState: 'SUBMITTED_PENDING_REVIEW', total: null });
    expect(pending.body.skills).toEqual(expect.arrayContaining([
      expect.objectContaining({ skill: 'LISTENING', state: 'FINAL' }),
      expect.objectContaining({ skill: 'READING', state: 'FINAL' }),
      expect.objectContaining({ skill: 'SPEAKING', state: 'PENDING_REVIEW', normalizedScore: null }),
      expect.objectContaining({ skill: 'WRITING', state: 'PENDING_REVIEW', normalizedScore: null }),
    ]));
    const finalResult = await student.get(`/api/learning/enrollments/${enrollmentId}/attempts/${M06_FINAL_ATTEMPT_ID}/result`).expect(200);
    expect(finalResult.body.gradingState).toBe('REVIEWED_FINAL');
    expect(finalResult.body.total).toEqual(expect.objectContaining({ awardedPoints: expect.any(Number), maxPoints: expect.any(Number), percentage: expect.any(Number) }));
  });

  it('enforces role and class ownership on the nested grading workspace', async () => {
    await student.get(`/api/instructor/classes/${classOfferingId}/assessments/${M06_MIDTERM_ASSESSMENT_ID}/grading`).expect(403);
    const queue = await instructor.get(`/api/instructor/classes/${classOfferingId}/assessments/${M06_MIDTERM_ASSESSMENT_ID}/grading`).expect(200);
    expect(queue.body.submissions).toEqual(expect.arrayContaining([expect.objectContaining({ id: M06_PENDING_ATTEMPT_ID, gradingState: 'SUBMITTED_PENDING_REVIEW' })]));
    const detail = await instructor.get(`/api/instructor/classes/${classOfferingId}/assessments/${M06_MIDTERM_ASSESSMENT_ID}/attempts/${M06_PENDING_ATTEMPT_ID}/grading`).expect(200);
    expect(detail.body.answers).toHaveLength(3);
    expect(detail.body.answers.every((answer: { testQuestion: { question: { responseType: string; rubric: unknown } } }) => ['AUDIO_RESPONSE', 'TEXT_RESPONSE'].includes(answer.testQuestion.question.responseType) && Boolean(answer.testQuestion.question.rubric))).toBe(true);
  });

  it('persists one instructor-final Decimal evaluation and requires explicit final editing', async () => {
    const detail = await instructor.get(`/api/instructor/classes/${classOfferingId}/assessments/${M06_MIDTERM_ASSESSMENT_ID}/attempts/${M06_PENDING_ATTEMPT_ID}/grading`).expect(200);
    const answer = detail.body.answers[0];
    const criteria = answer.testQuestion.question.rubric.criteria.map((criterion: { id: string; maxScore: number }) => ({ rubricCriterionId: criterion.id, score: String(Number(criterion.maxScore) / 2) }));
    const endpoint = `/api/instructor/classes/${classOfferingId}/assessments/${M06_MIDTERM_ASSESSMENT_ID}/attempts/${M06_PENDING_ATTEMPT_ID}/answers/${answer.testQuestion.id}/evaluation`;
    await instructor.put(endpoint).send({ criteria, feedback: 'E2E rubric feedback', finalize: true }).expect(200);
    const finalCount = await prisma.answerEvaluation.count({ where: { testAnswerId: answer.id, source: 'INSTRUCTOR', status: 'REVIEWED_FINAL' } });
    expect(finalCount).toBe(1);
    await instructor.put(endpoint).send({ criteria, feedback: 'Blocked implicit edit', finalize: true }).expect(409);
    await instructor.put(endpoint).send({ criteria, feedback: 'Explicit final edit', finalize: true, editFinal: true }).expect(200);
    await expect(prisma.answerEvaluation.count({ where: { testAnswerId: answer.id, source: 'INSTRUCTOR', status: 'REVIEWED_FINAL' } })).resolves.toBe(1);
    const persisted = await prisma.testAnswer.findUniqueOrThrow({ where: { id: answer.id }, select: { pointsAwarded: true } });
    expect(Number(persisted.pointsAwarded)).toBe(Number(answer.testQuestion.points) / 2);
  });

  it('serves learner audio only through authenticated owner/instructor endpoints', async () => {
    const answer = await prisma.testAnswer.findFirstOrThrow({ where: { attemptId: M06_PENDING_ATTEMPT_ID, audioStorageKey: { not: null } }, select: { testQuestionId: true } });
    await request(app.getHttpServer()).get(`/api/learning/enrollments/${enrollmentId}/attempts/${M06_PENDING_ATTEMPT_ID}/answers/${answer.testQuestionId}/audio`).expect(401);
    await student.get(`/api/learning/enrollments/${enrollmentId}/attempts/${M06_PENDING_ATTEMPT_ID}/answers/${answer.testQuestionId}/audio`).expect(200).expect('Content-Type', /audio/);
    await instructor.get(`/api/instructor/classes/${classOfferingId}/assessments/${M06_MIDTERM_ASSESSMENT_ID}/attempts/${M06_PENDING_ATTEMPT_ID}/answers/${answer.testQuestionId}/audio`).expect(200).expect('Content-Type', /audio/);
  });

  it('finalizes an expired attempt from persisted state and ignores a late submit payload', async () => {
    const attemptId = randomUUID();
    const objective = await prisma.testQuestion.findFirstOrThrow({
      where: { testId: M06_MIDTERM_TEST_ID, question: { responseType: 'SINGLE_CHOICE' } },
      orderBy: { orderIndex: 'asc' },
      select: { id: true, points: true, question: { select: { options: { orderBy: { orderIndex: 'asc' }, select: { id: true, isCorrect: true } } } } },
    });
    const writing = await prisma.testQuestion.findFirstOrThrow({
      where: { testId: M06_MIDTERM_TEST_ID, question: { responseType: 'TEXT_RESPONSE' } },
      select: { id: true },
    });
    const correct = objective.question.options.find((option) => option.isCorrect)!;
    const wrong = objective.question.options.find((option) => !option.isCorrect)!;
    await prisma.testAttempt.create({ data: { id: attemptId, testId: M06_MIDTERM_TEST_ID, learnerId, enrollmentId, classAssessmentId: M06_MIDTERM_ASSESSMENT_ID, attemptNumber: 9001, startedAt: new Date(Date.now() - 60 * 60 * 1000) } });
    await prisma.testAnswer.createMany({ data: [
      { attemptId, testQuestionId: objective.id, selectedOptionIds: [correct.id] },
      { attemptId, testQuestionId: writing.id, textResponse: 'Persisted before the deadline.' },
    ] });
    try {
      await student.post(`/api/learning/enrollments/${enrollmentId}/attempts/${attemptId}/submit`).send({ answers: [
        { testQuestionId: objective.id, selectedOptionIds: [wrong.id] },
        { testQuestionId: writing.id, textResponse: 'Late payload must never be stored.' },
      ] }).expect(201);
      const answers = await prisma.testAnswer.findMany({ where: { attemptId }, select: { testQuestionId: true, selectedOptionIds: true, textResponse: true, pointsAwarded: true } });
      const objectiveAnswer = answers.find((answer) => answer.testQuestionId === objective.id)!;
      expect(objectiveAnswer.selectedOptionIds).toEqual([correct.id]);
      expect(Number(objectiveAnswer.pointsAwarded)).toBe(objective.points);
      expect(answers.find((answer) => answer.testQuestionId === writing.id)?.textResponse).toBe('Persisted before the deadline.');
      const result = await student.get(`/api/learning/enrollments/${enrollmentId}/attempts/${attemptId}/result`).expect(200);
      expect(result.body.attempt.score).toBe(objective.points);
    } finally {
      await prisma.attemptSkillScore.deleteMany({ where: { attemptId } });
      await prisma.testAnswer.deleteMany({ where: { attemptId } });
      await prisma.testAttempt.delete({ where: { id: attemptId } });
    }
  });

  it('rejects final grading for missing Speaking and Writing responses', async () => {
    const attemptId = randomUUID();
    const productive = await prisma.testQuestion.findMany({
      where: { testId: M06_MIDTERM_TEST_ID, question: { responseType: { in: ['AUDIO_RESPONSE', 'TEXT_RESPONSE'] } } },
      orderBy: { orderIndex: 'asc' },
      select: { id: true, question: { select: { responseType: true, rubric: { select: { criteria: { orderBy: { orderIndex: 'asc' }, select: { id: true, maxScore: true } } } } } } },
    });
    const speaking = productive.find((item) => item.question.responseType === 'AUDIO_RESPONSE')!;
    const writing = productive.find((item) => item.question.responseType === 'TEXT_RESPONSE')!;
    await prisma.testAttempt.create({ data: { id: attemptId, testId: M06_MIDTERM_TEST_ID, learnerId, enrollmentId, classAssessmentId: M06_MIDTERM_ASSESSMENT_ID, attemptNumber: 9002, status: 'SUBMITTED', startedAt: new Date(Date.now() - 60 * 60 * 1000), submittedAt: new Date() } });
    await prisma.testAnswer.createMany({ data: [
      { attemptId, testQuestionId: speaking.id },
      { attemptId, testQuestionId: writing.id, textResponse: '   ' },
    ] });
    try {
      for (const item of [speaking, writing]) {
        const criteria = item.question.rubric!.criteria.map((criterion) => ({ rubricCriterionId: criterion.id, score: String(criterion.maxScore) }));
        const endpoint = `/api/instructor/classes/${classOfferingId}/assessments/${M06_MIDTERM_ASSESSMENT_ID}/attempts/${attemptId}/answers/${item.id}/evaluation`;
        const response = await instructor.put(endpoint).send({ criteria, finalize: true }).expect(400);
        expect(response.body.code).toBe('PRODUCTIVE_RESPONSE_MISSING');
      }
      expect(await prisma.answerEvaluation.count({ where: { testAnswer: { attemptId } } })).toBe(0);
      expect(await prisma.attemptSkillScore.count({ where: { attemptId, skill: { in: ['SPEAKING', 'WRITING'] } } })).toBe(0);
      const result = await student.get(`/api/learning/enrollments/${enrollmentId}/attempts/${attemptId}/result`).expect(200);
      expect(result.body.total).toBeNull();
      expect(result.body.skills).toEqual(expect.arrayContaining([
        expect.objectContaining({ skill: 'SPEAKING', state: 'MISSING_RESPONSE' }),
        expect.objectContaining({ skill: 'WRITING', state: 'MISSING_RESPONSE' }),
      ]));
    } finally {
      await prisma.testAnswer.deleteMany({ where: { attemptId } });
      await prisma.testAttempt.delete({ where: { id: attemptId } });
    }
  });
});
