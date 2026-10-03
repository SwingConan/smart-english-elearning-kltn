import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  PlacementMode,
  PlacementSelfLevel,
  QuestionDifficulty,
  TestAttemptStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import {
  PLACEMENT_FOUR_SKILLS_FORM_ID,
  PLACEMENT_LR_FORM_IDS,
} from '../src/modules/placement/placement-form.policy';
import { loginAgent } from './assessment-e2e-helpers';

describe('Placement L&R APIs (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let learner: ReturnType<typeof request.agent>;
  let otherLearner: ReturnType<typeof request.agent>;
  let learnerId: string;
  let otherLearnerId: string;
  let activeAttemptId: string;
  let responseStorageRoot: string;
  const userIds: string[] = [];
  const sessionIds = new Set<string>();
  const unique = `${Date.now()}-${process.pid}`;
  const password = 'PlacementE2e!2026';
  const learnerEmail = `m03-learner-${unique}@example.test`;
  const otherEmail = `m03-other-${unique}@example.test`;

  beforeAll(async () => {
    responseStorageRoot = await mkdtemp(join(tmpdir(), 'm05-placement-e2e-'));
    process.env.ASSESSMENT_RESPONSE_STORAGE_ROOT = responseStorageRoot;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const users = await Promise.all(
      [learnerEmail, otherEmail].map((email) =>
        prisma.user.create({
          data: {
            email,
            fullName: email === learnerEmail ? 'M03 Learner' : 'M03 Other Learner',
            passwordHash,
            role: UserRole.STUDENT,
            status: UserStatus.ACTIVE,
          },
        }),
      ),
    );
    [learnerId, otherLearnerId] = users.map(({ id }) => id);
    userIds.push(learnerId, otherLearnerId);
    learner = request.agent(app.getHttpServer());
    otherLearner = request.agent(app.getHttpServer());
    await loginAgent(learner, learnerEmail, password, sessionIds);
    await loginAgent(otherLearner, otherEmail, password, sessionIds);
  });

  afterAll(async () => {
    if (prisma) {
      const attempts = await prisma.testAttempt.findMany({
        where: { learnerId: { in: userIds } },
        select: { id: true },
      });
      const attemptIds = attempts.map(({ id }) => id);
      await prisma.courseRecommendation.deleteMany({ where: { attemptId: { in: attemptIds } } });
      await prisma.attemptEvaluation.deleteMany({ where: { attemptId: { in: attemptIds } } });
      await prisma.attemptSkillScore.deleteMany({ where: { attemptId: { in: attemptIds } } });
      await prisma.testAnswer.deleteMany({ where: { attemptId: { in: attemptIds } } });
      await prisma.testAttempt.deleteMany({ where: { id: { in: attemptIds } } });
      await prisma.userSession.deleteMany({ where: { sid: { in: [...sessionIds] } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (app) await app.close();
    if (responseStorageRoot) await rm(responseStorageRoot, { recursive: true, force: true });
    delete process.env.ASSESSMENT_RESPONSE_STORAGE_ROOT;
  });

  it('publishes both Placement modes and rejects a guest start', async () => {
    const config = await request(app.getHttpServer()).get('/api/placement/config').expect(200);
    expect(config.body.modes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'LR', enabled: true }),
        expect.objectContaining({ code: 'FOUR_SKILLS', enabled: true }),
      ]),
    );
    expect(JSON.stringify(config.body)).not.toContain(PLACEMENT_LR_FORM_IDS.CORE);

    await request(app.getHttpServer())
      .post('/api/placement/attempts/start')
      .send({ mode: 'LR', selfLevel: 'UNKNOWN', goalScore: 550 })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/placement/attempts/start')
      .send({ mode: 'FOUR_SKILLS', selfLevel: 'GOOD', goalScore: 750 })
      .expect(401);
  });

  it('seeds distinct Foundation, Core and Advanced grouped content', async () => {
    const formIds = [
      PLACEMENT_LR_FORM_IDS.FOUNDATION,
      PLACEMENT_LR_FORM_IDS.CORE,
      PLACEMENT_LR_FORM_IDS.ADVANCED,
    ];
    const forms = await prisma.test.findMany({
      where: { id: { in: formIds } },
      include: {
        questionGroups: true,
        testQuestions: { include: { question: { select: { id: true, difficulty: true } } } },
      },
    });
    const byId = new Map(forms.map((form) => [form.id, form]));
    const questionIds = formIds.map(
      (id) => new Set(byId.get(id)?.testQuestions.map(({ question }) => question.id)),
    );

    for (const id of formIds) {
      expect(byId.get(id)?.questionGroups).toHaveLength(4);
      expect(byId.get(id)?.testQuestions).toHaveLength(8);
    }
    expect([...questionIds[0]].some((id) => questionIds[1].has(id))).toBe(false);
    expect([...questionIds[1]].some((id) => questionIds[2].has(id))).toBe(false);
    expect([...questionIds[0]].some((id) => questionIds[2].has(id))).toBe(false);
    expect(
      byId.get(PLACEMENT_LR_FORM_IDS.FOUNDATION)?.testQuestions.map(({ question }) => question.difficulty),
    ).toEqual(expect.arrayContaining([QuestionDifficulty.EASY, QuestionDifficulty.MEDIUM]));
    expect(
      byId.get(PLACEMENT_LR_FORM_IDS.CORE)?.testQuestions.map(({ question }) => question.difficulty),
    ).toEqual(expect.arrayContaining([QuestionDifficulty.EASY, QuestionDifficulty.MEDIUM]));
    expect(
      byId.get(PLACEMENT_LR_FORM_IDS.ADVANCED)?.testQuestions.map(({ question }) => question.difficulty),
    ).toEqual(expect.arrayContaining([QuestionDifficulty.MEDIUM, QuestionDifficulty.HARD]));
  });

  it('validates fields and creates one pre-enrollment learner-owned attempt', async () => {
    await learner
      .post('/api/placement/attempts/start')
      .send({ mode: 'LR', selfLevel: 'INVALID', goalScore: 1000 })
      .expect(400);

    const response = await learner
      .post('/api/placement/attempts/start')
      .send({ mode: PlacementMode.LR, selfLevel: PlacementSelfLevel.UNKNOWN, goalScore: 550 })
      .expect(201);
    activeAttemptId = response.body.attemptId;
    expect(response.body.resumed).toBe(false);
    const row = await prisma.testAttempt.findUniqueOrThrow({ where: { id: activeAttemptId } });
    expect(row).toEqual(
      expect.objectContaining({
        learnerId,
        enrollmentId: null,
        classAssessmentId: null,
        placementSelfLevel: PlacementSelfLevel.UNKNOWN,
        placementGoalScore: 550,
      }),
    );
  });

  it('resumes the same LR attempt even when self-level changes', async () => {
    const response = await learner
      .post('/api/placement/attempts/start')
      .send({ mode: 'LR', selfLevel: 'GOOD', goalScore: 750 })
      .expect(201);
    expect(response.body).toEqual(expect.objectContaining({ attemptId: activeAttemptId, resumed: true }));
    expect(
      await prisma.testAttempt.count({
        where: {
          learnerId,
          status: TestAttemptStatus.IN_PROGRESS,
          enrollmentId: null,
          classAssessmentId: null,
        },
      }),
    ).toBe(1);
  });

  it('runs a real FOUR_SKILLS flow alongside LR with secure media and truthful pending results', async () => {
    const [firstStart, secondStart] = await Promise.all([
      learner.post('/api/placement/attempts/start').send({ mode: 'FOUR_SKILLS', selfLevel: 'UNKNOWN', goalScore: 650 }),
      learner.post('/api/placement/attempts/start').send({ mode: 'FOUR_SKILLS', selfLevel: 'GOOD', goalScore: 750 }),
    ]);
    expect(firstStart.status).toBe(201);
    expect(secondStart.status).toBe(201);
    expect(firstStart.body.attemptId).toBe(secondStart.body.attemptId);
    const fourAttemptId = firstStart.body.attemptId as string;
    await request(app.getHttpServer())
      .get(`/api/placement/attempts/${fourAttemptId}/exam`)
      .expect(401);
    await request(app.getHttpServer())
      .put(`/api/placement/attempts/${fourAttemptId}/answers/00000000-0000-4000-8000-000000000001`)
      .send({ textResponse: 'guest' })
      .expect(401);
    await request(app.getHttpServer())
      .post(`/api/placement/attempts/${fourAttemptId}/answers/00000000-0000-4000-8000-000000000001/audio`)
      .attach('file', Buffer.from('guest'), { filename: 'guest.webm', contentType: 'audio/webm' })
      .expect(401);
    expect(
      await prisma.testAttempt.count({
        where: {
          learnerId,
          status: TestAttemptStatus.IN_PROGRESS,
          enrollmentId: null,
          classAssessmentId: null,
        },
      }),
    ).toBe(2);

    const examResponse = await learner
      .get(`/api/placement/attempts/${fourAttemptId}/exam`)
      .expect(200);
    const groups = examResponse.body.groups as Array<{
      title: string;
      stimuli: Array<{ id: string; type: string; mediaUrl: string | null }>;
      questions: Array<{ testQuestionId: string; responseType: string }>;
    }>;
    const tasks = groups.flatMap(({ questions }) => questions);
    expect(tasks).toHaveLength(21);
    expect(tasks.filter(({ responseType }) => responseType === 'AUDIO_RESPONSE')).toHaveLength(3);
    expect(tasks.filter(({ responseType }) => responseType === 'TEXT_RESPONSE')).toHaveLength(2);
    const serialized = JSON.stringify(examResponse.body);
    expect(serialized).not.toContain('isCorrect');
    expect(serialized).not.toContain('LISTENING_TRANSCRIPT');
    expect(serialized).not.toContain('Will you translate an e-mail into Spanish for me?');
    expect(groups.map(({ title }) => title)).toEqual(
      expect.arrayContaining([
        'Part 1 — Mô tả hình ảnh',
        'Part 7 — Đọc hiểu',
        'Speaking — Đọc thành tiếng',
        'Writing — Trình bày quan điểm',
      ]),
    );
    expect(groups.some(({ title }) => /^(L[1-4]|R[5-7]|S|W)_/.test(title))).toBe(false);

    const visibleMedia = groups.flatMap(({ stimuli }) => stimuli);
    const image = visibleMedia.find(({ type, mediaUrl }) => type === 'IMAGE' && mediaUrl);
    const audio = visibleMedia.find(({ type, mediaUrl }) => type === 'AUDIO' && mediaUrl);
    expect(image).toBeDefined();
    expect(audio).toBeDefined();
    const imageResponse = await learner
      .get(image!.mediaUrl!)
      .expect('Content-Type', /image\/jpeg/)
      .expect(200);
    expect(Buffer.isBuffer(imageResponse.body)).toBe(true);
    expect(imageResponse.body.length).toBeGreaterThan(0);
    const audioResponse = await learner
      .get(audio!.mediaUrl!)
      .expect('Content-Type', /audio\/mpeg/)
      .expect(200);
    expect(Buffer.isBuffer(audioResponse.body)).toBe(true);
    expect(audioResponse.body.length).toBeGreaterThan(0);
    await otherLearner.get(image!.mediaUrl!).expect(404);
    await otherLearner.get(audio!.mediaUrl!).expect(404);
    await learner
      .get(`/api/placement/attempts/${fourAttemptId}/stimuli/00000000-0000-4000-8000-000000000001/media`)
      .expect(404);

    const incomplete = await learner
      .post(`/api/placement/attempts/${fourAttemptId}/submit`)
      .send({ reason: 'MANUAL' })
      .expect(409);
    expect(incomplete.body.code).toBe('AUDIO_UPLOAD_INCOMPLETE');

    const objective = await prisma.testQuestion.findFirstOrThrow({
      where: {
        testId: PLACEMENT_FOUR_SKILLS_FORM_ID,
        question: { responseType: 'SINGLE_CHOICE' },
      },
      include: { question: { include: { options: true } } },
      orderBy: { orderIndex: 'asc' },
    });
    const objectiveOption = objective.question.options[0];
    await learner
      .put(`/api/placement/attempts/${fourAttemptId}/answers/${objective.id}`)
      .send({ selectedOptionIds: [objectiveOption.id] })
      .expect(200);
    await learner
      .put(`/api/placement/attempts/${fourAttemptId}/answers/${objective.id}`)
      .send({ textResponse: 'invalid' })
      .expect(400);

    const writingTasks = tasks.filter(({ responseType }) => responseType === 'TEXT_RESPONSE');
    for (const [index, task] of writingTasks.entries()) {
      await learner
        .put(`/api/placement/attempts/${fourAttemptId}/answers/${task.testQuestionId}`)
        .send({ textResponse: `Persisted Writing response ${index + 1}.` })
        .expect(200);
    }

    const speakingTasks = tasks.filter(({ responseType }) => responseType === 'AUDIO_RESPONSE');
    await learner
      .post(`/api/placement/attempts/${fourAttemptId}/answers/${objective.id}/audio`)
      .attach('file', Buffer.from('invalid target'), { filename: 'answer.webm', contentType: 'audio/webm' })
      .expect(400);
    for (const task of speakingTasks) {
      await learner
        .post(`/api/placement/attempts/${fourAttemptId}/answers/${task.testQuestionId}/audio`)
        .attach('file', Buffer.from('small deterministic e2e audio fixture'), {
          filename: 'answer.webm',
          contentType: 'audio/webm',
        })
        .expect(201);
    }
    await learner
      .get(`/api/placement/attempts/${fourAttemptId}/answers/${speakingTasks[0].testQuestionId}/audio`)
      .expect(200);
    await otherLearner
      .get(`/api/placement/attempts/${fourAttemptId}/answers/${speakingTasks[0].testQuestionId}/audio`)
      .expect(404);

    const submitted = await learner
      .post(`/api/placement/attempts/${fourAttemptId}/submit`)
      .send({ reason: 'MANUAL' })
      .expect(201);
    const repeatedSubmit = await learner
      .post(`/api/placement/attempts/${fourAttemptId}/submit`)
      .send({ reason: 'MANUAL' })
      .expect(201);
    expect(repeatedSubmit.body).toEqual(submitted.body);
    expect(submitted.body.enhancement.status).toBe('PENDING_SKILL_EVALUATION');
    expect(submitted.body.evaluation).toBeNull();
    expect(submitted.body.recommendations).toEqual([]);
    expect(submitted.body.skillResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skill: 'LISTENING', status: 'FINAL' }),
        expect.objectContaining({ skill: 'READING', status: 'FINAL' }),
        expect.objectContaining({ skill: 'SPEAKING', status: 'PENDING_EVALUATION', submittedResponseCount: 3 }),
        expect.objectContaining({ skill: 'WRITING', status: 'PENDING_EVALUATION', submittedResponseCount: 2 }),
      ]),
    );
    expect(
      await prisma.attemptSkillScore.count({
        where: { attemptId: fourAttemptId, skill: { in: ['SPEAKING', 'WRITING'] } },
      }),
    ).toBe(0);
    expect(await prisma.attemptEvaluation.count({ where: { attemptId: fourAttemptId } })).toBe(0);
    expect(await prisma.courseRecommendation.count({ where: { attemptId: fourAttemptId } })).toBe(0);

    await learner
      .post(`/api/placement/attempts/${fourAttemptId}/answers/${speakingTasks[0].testQuestionId}/audio`)
      .attach('file', Buffer.from('late upload'), { filename: 'late.webm', contentType: 'audio/webm' })
      .expect(409);
    const history = await learner.get('/api/placement/history').expect(200);
    expect(history.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ attemptId: fourAttemptId, mode: 'FOUR_SKILLS' }),
      ]),
    );

    const timeoutStart = await otherLearner
      .post('/api/placement/attempts/start')
      .send({ mode: 'FOUR_SKILLS', selfLevel: 'BASIC', goalScore: 550 })
      .expect(201);
    await prisma.testAttempt.update({
      where: { id: timeoutStart.body.attemptId },
      data: { startedAt: new Date(Date.now() - 46 * 60_000) },
    });
    const timeoutResult = await otherLearner
      .get(`/api/placement/attempts/${timeoutStart.body.attemptId}/result`)
      .expect(200);
    expect(timeoutResult.body.skillResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skill: 'SPEAKING', submittedResponseCount: 0, requiredResponseCount: 3 }),
        expect.objectContaining({ skill: 'WRITING', submittedResponseCount: 0, requiredResponseCount: 2 }),
      ]),
    );
  });

  it('returns an answer-safe grouped exam and enforces owner access', async () => {
    const response = await learner
      .get(`/api/placement/attempts/${activeAttemptId}/exam`)
      .expect(200);
    expect(response.body.groups).toHaveLength(4);
    expect(response.body.groups[0]).toEqual(
      expect.objectContaining({ skill: 'LISTENING', stimulusText: null }),
    );
    expect(response.body.groups[2]).toEqual(
      expect.objectContaining({ skill: 'READING', stimulusText: expect.any(String) }),
    );
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('isCorrect');
    expect(serialized).not.toContain('explanation');
    expect(serialized).not.toContain('pointsAwarded');
    await otherLearner.get(`/api/placement/attempts/${activeAttemptId}/exam`).expect(404);
  });

  it('autosaves, restores, rejects foreign options and blocks cross-user mutation', async () => {
    const testQuestion = await prisma.testQuestion.findFirstOrThrow({
      where: { testId: PLACEMENT_LR_FORM_IDS.CORE },
      orderBy: { orderIndex: 'asc' },
      include: { question: { include: { options: true } } },
    });
    const correct = testQuestion.question.options.find(({ isCorrect }) => isCorrect)!;
    await learner
      .put(`/api/placement/attempts/${activeAttemptId}/answers/${testQuestion.id}`)
      .send({ selectedOptionIds: [correct.id] })
      .expect(200);
    const reloaded = await learner
      .get(`/api/placement/attempts/${activeAttemptId}/exam`)
      .expect(200);
    expect(JSON.stringify(reloaded.body)).toContain(correct.id);

    await learner
      .put(`/api/placement/attempts/${activeAttemptId}/answers/${testQuestion.id}`)
      .send({ selectedOptionIds: ['00000000-0000-4000-8000-000000000001'] })
      .expect(400);
    await otherLearner
      .put(`/api/placement/attempts/${activeAttemptId}/answers/${testQuestion.id}`)
      .send({ selectedOptionIds: [correct.id] })
      .expect(404);
    await otherLearner
      .post(`/api/placement/attempts/${activeAttemptId}/submit`)
      .send({ reason: 'MANUAL' })
      .expect(404);
    await otherLearner.get(`/api/placement/attempts/${activeAttemptId}/result`).expect(404);
  });

  it('submits idempotently, evaluates deterministically and recommends seeded courses', async () => {
    const bktBefore = await prisma.learnerSkillState.count();
    const historyBefore = await prisma.masteryHistory.count();
    const first = await learner
      .post(`/api/placement/attempts/${activeAttemptId}/submit`)
      .send({ reason: 'MANUAL' })
      .expect(201);
    const second = await learner
      .post(`/api/placement/attempts/${activeAttemptId}/submit`)
      .send({ reason: 'MANUAL' })
      .expect(201);
    expect(second.body).toEqual(first.body);
    expect(first.body.skillScores).toHaveLength(2);
    expect(first.body.skillScores).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skill: 'LISTENING', status: 'FINAL', source: 'OBJECTIVE_AUTO' }),
        expect.objectContaining({ skill: 'READING', status: 'FINAL', source: 'OBJECTIVE_AUTO' }),
      ]),
    );
    expect(await prisma.learnerSkillState.count()).toBe(bktBefore);
    expect(await prisma.masteryHistory.count()).toBe(historyBefore);
    expect(first.body.enhancement).toEqual({ status: 'READY', error: null });
    expect(first.body.evaluation).toEqual(
      expect.objectContaining({
        status: 'FINAL',
        levelCode: 'FOUNDATION',
        levelLabel: 'Nền tảng',
        overallNormalizedScore: 12.5,
        strongestSkill: 'LISTENING',
        weakestSkill: 'READING',
        lrTotalScore: null,
        aiExplanation: null,
      }),
    );
    expect(first.body.recommendations.length).toBeGreaterThan(0);
    expect(first.body.recommendations[0]).toEqual(
      expect.objectContaining({
        kind: 'PRIMARY',
        course: expect.objectContaining({ id: expect.any(String), slug: expect.any(String) }),
        reason: expect.objectContaining({ schemaVersion: 1, criteria: expect.any(Array) }),
        classOfferings: expect.any(Array),
      }),
    );
    expect(await prisma.attemptEvaluation.count({ where: { attemptId: activeAttemptId } })).toBe(1);
    expect(await prisma.courseRecommendation.count({ where: { attemptId: activeAttemptId } })).toBe(
      first.body.recommendations.length,
    );
  });

  it('concurrent historical result access converges to one snapshot', async () => {
    const attemptNumber =
      (await prisma.testAttempt.count({ where: { learnerId, testId: PLACEMENT_LR_FORM_IDS.ADVANCED } })) + 1;
    const historical = await prisma.testAttempt.create({
      data: {
        learnerId,
        testId: PLACEMENT_LR_FORM_IDS.ADVANCED,
        attemptNumber,
        status: TestAttemptStatus.SUBMITTED,
        placementSelfLevel: PlacementSelfLevel.GOOD,
        placementGoalScore: 750,
        submittedAt: new Date(),
        score: 6,
        maxScore: 8,
        skillScores: {
          create: [
            { skill: 'LISTENING', rawScore: 3, maxRawScore: 4, normalizedScore: 75, status: 'FINAL', source: 'OBJECTIVE_AUTO' },
            { skill: 'READING', rawScore: 3, maxRawScore: 4, normalizedScore: 75, status: 'FINAL', source: 'OBJECTIVE_AUTO' },
          ],
        },
      },
    });
    const [first, second] = await Promise.all([
      learner.get(`/api/placement/attempts/${historical.id}/result`),
      learner.get(`/api/placement/attempts/${historical.id}/result`),
    ]);
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(first.body.evaluation).toEqual(second.body.evaluation);
    expect(first.body.recommendations).toEqual(second.body.recommendations);
    expect(await prisma.attemptEvaluation.count({ where: { attemptId: historical.id } })).toBe(1);
    await otherLearner.get(`/api/placement/attempts/${historical.id}/result`).expect(404);
  });

  it('keeps a valid objective result usable when evaluation input is invalid', async () => {
    const attemptNumber =
      (await prisma.testAttempt.count({ where: { learnerId, testId: PLACEMENT_LR_FORM_IDS.FOUNDATION } })) + 1;
    const historical = await prisma.testAttempt.create({
      data: {
        learnerId,
        testId: PLACEMENT_LR_FORM_IDS.FOUNDATION,
        attemptNumber,
        status: TestAttemptStatus.SUBMITTED,
        placementSelfLevel: PlacementSelfLevel.BEGINNER,
        placementGoalScore: 450,
        submittedAt: new Date(),
        score: 0,
        maxScore: 0,
        skillScores: {
          create: [
            { skill: 'LISTENING', rawScore: 0, maxRawScore: 0, normalizedScore: 0, status: 'FINAL', source: 'OBJECTIVE_AUTO' },
            { skill: 'READING', rawScore: 0, maxRawScore: 0, normalizedScore: 0, status: 'FINAL', source: 'OBJECTIVE_AUTO' },
          ],
        },
      },
    });
    const response = await learner.get(`/api/placement/attempts/${historical.id}/result`).expect(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        attemptId: historical.id,
        score: 0,
        maxScore: 0,
        enhancement: expect.objectContaining({ status: 'ERROR' }),
        evaluation: null,
        recommendations: [],
      }),
    );
  });

  it('returns only the current learner completed history', async () => {
    const history = await learner.get('/api/placement/history').expect(200);
    expect(history.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ attemptId: activeAttemptId })]),
    );
    const foreignHistory = await otherLearner.get('/api/placement/history').expect(200);
    expect(foreignHistory.body.map((item: { attemptId: string }) => item.attemptId)).not.toContain(
      activeAttemptId,
    );
  });

  it('lazily finalizes an expired orphan before starting a new attempt', async () => {
    const count = await prisma.testAttempt.count({
      where: { learnerId, testId: PLACEMENT_LR_FORM_IDS.ADVANCED },
    });
    const expired = await prisma.testAttempt.create({
      data: {
        learnerId,
        testId: PLACEMENT_LR_FORM_IDS.ADVANCED,
        attemptNumber: count + 1,
        status: TestAttemptStatus.IN_PROGRESS,
        placementSelfLevel: PlacementSelfLevel.GOOD,
        placementGoalScore: 750,
        startedAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });
    const response = await learner
      .post('/api/placement/attempts/start')
      .send({ mode: 'LR', selfLevel: 'BASIC', goalScore: 450 })
      .expect(201);
    expect(response.body.attemptId).not.toBe(expired.id);
    expect(
      (await prisma.testAttempt.findUniqueOrThrow({ where: { id: expired.id } })).status,
    ).toBe(TestAttemptStatus.SUBMITTED);
    activeAttemptId = response.body.attemptId;
  });

  it('concurrent double start converges to one active LR attempt', async () => {
    await prisma.testAttempt.update({
      where: { id: activeAttemptId },
      data: { status: TestAttemptStatus.SUBMITTED, submittedAt: new Date(), score: 0, maxScore: 0 },
    });
    const [first, second] = await Promise.all([
      learner.post('/api/placement/attempts/start').send({ mode: 'LR', selfLevel: 'BASIC', goalScore: 550 }),
      learner.post('/api/placement/attempts/start').send({ mode: 'LR', selfLevel: 'GOOD', goalScore: 650 }),
    ]);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.attemptId).toBe(second.body.attemptId);
    expect(
      await prisma.testAttempt.count({
        where: {
          learnerId,
          status: TestAttemptStatus.IN_PROGRESS,
          enrollmentId: null,
          classAssessmentId: null,
        },
      }),
    ).toBe(1);
  });
});
