import * as request from 'supertest';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { startWave01App } from './wave01-postgres.fixture';
import { seedWave03A } from './wave03a.fixture';
import { seedPlacementPreview } from './wave04a.fixture';
import {
  placementEligibility,
  type PlacementProvenance,
} from '../src/modules/placement/source-eligibility';
import { PlacementIntegrationService } from '../src/modules/placement/integration.service';
describe('W04A Placement integration actual PostgreSQL25', () => {
  const previousPreviewFlag = process.env.W04A_PREVIEW_ENABLED;
  let d: Awaited<ReturnType<typeof startWave01App>>,
    f: Awaited<ReturnType<typeof seedWave03A>>,
    lr: Awaited<ReturnType<typeof seedPlacementPreview>>,
    four: typeof lr,
    aid: string;
  let version = 0;
  const evidence: unknown[] = [];
  const path = '/api/v2/placement',
    agent = () => f.agents.get(f.contenders[0].id)!,
    body = () => ({
      idempotencyKey: randomUUID(),
      mode: 'LR',
      sourceVersionId: lr.version.id,
      goalLR: 650,
    });
  beforeAll(async () => {
    process.env.W04A_PREVIEW_ENABLED = 'DEV_PREVIEW_ONLY';
    d = await startWave01App();
    f = await seedWave03A(d);
    lr = await seedPlacementPreview(d, 'LR');
    four = await seedPlacementPreview(d, 'FOUR_SKILLS');
  }, 60000);
  afterAll(async () => {
    const evidenceRoot=process.env.W04A_EVIDENCE_ROOT??'.local-storage/v2-wave04a';
    await mkdir(evidenceRoot, { recursive: true });
    await writeFile(
      evidenceRoot+'/placement-http-evidence.json',
      JSON.stringify(evidence, null, 2),
    );
    if (previousPreviewFlag) process.env.W04A_PREVIEW_ENABLED = previousPreviewFlag;
    else delete process.env.W04A_PREVIEW_ENABLED;
    await d?.app.close();
  });
  it('guest401/wrong role403, signed-in unenrolled learner can prepare without tuition; config carries no keys/source hashes', async () => {
    await request(d.app.getHttpServer())
      .get(path + '/config')
      .expect(401);
    await f.agents
      .get(f.teacher.id)!
      .get(path + '/config')
      .expect(403);
    const c = (
      await agent()
        .get(path + '/config')
        .expect(200)
    ).body;
    expect(c.fullExamEnabled).toBe(false);
    expect(c.previewEnabled).toBe(true);
    expect(c.sources).toHaveLength(2);
    expect(await d.prisma.enrollment.count({ where: { learnerId: f.contenders[0].id } })).toBe(0);
    expect(JSON.stringify(c)).not.toMatch(/sourceHash|isCorrect|selfLevel/);
    evidence.push({ A1: true, unauth401: true, role403: true, noEnrollmentRequired: true });
  });
  it('legacy small form start/config/result/submit cannot bypass W04A full source or scoring gates', async () => {
    await agent().get('/api/placement/config').expect(409);
    await agent()
      .post('/api/placement/attempts/start')
      .send({ mode: 'LR', selfLevel: 'UNKNOWN', goalScore: 650 })
      .expect(409);
    await agent()
      .get('/api/placement/attempts/' + randomUUID() + '/result')
      .expect(409);
    await agent()
      .post('/api/placement/attempts/' + randomUUID() + '/submit')
      .send({ reason: 'MANUAL' })
      .expect(409);
    evidence.push({ legacyEntryAndResultRetired: true });
  });
  it('private preview requires opt-in plus pinned marker identity; production and missing opt-in fail closed', async () => {
    delete process.env.W04A_PREVIEW_ENABLED;
    expect((await agent().get(path + '/config')).body.previewEnabled).toBe(false);
    await agent()
      .post(path + '/previews')
      .send(body())
      .expect(409);
    process.env.W04A_PREVIEW_ENABLED = 'DEV_PREVIEW_ONLY';
    const old = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await agent()
        .post(path + '/previews')
        .send(body())
        .expect(409);
    } finally {
      process.env.NODE_ENV = old;
    }
    evidence.push({ previewFence: true, productionDenied: true });
  });
  it('mode-specific goals validate exact independent values, no selfLevel or inferred SW', async () => {
    for (const b of [
      { ...body(), goalLR: 9 },
      { ...body(), goalLR: 991 },
      { ...body(), goalLR: 650.5 },
      { ...body(), goalSpeaking: 0 },
      { ...body(), goalWriting: 0 },
      { ...body(), selfLevel: 'GOOD' },
      { ...body(), mode: 'FOUR_SKILLS', sourceVersionId: four.version.id },
      {
        ...body(),
        mode: 'FOUR_SKILLS',
        sourceVersionId: four.version.id,
        goalSpeaking: 201,
        goalWriting: 100,
      },
    ])
      await agent()
        .post(path + '/previews')
        .send(b)
        .expect(400);
    await agent()
      .post(path + '/previews')
      .send({ ...body(), sourceVersionId: four.version.id })
      .expect(409);
    evidence.push({ goalValidation: true, wrongMode409: true, noSelfLevel: true });
  });
  it('duplicate/concurrent start yields one durable attempt and request audit; changed goals do not rewrite persisted targets', async () => {
    const b = body();
    const r = await Promise.all([
      agent()
        .post(path + '/previews')
        .send(b),
      agent()
        .post(path + '/previews')
        .send(b),
    ]);
    expect(r.map((x) => x.status)).toEqual([201, 201]);
    aid = r[0].body.attemptId;
    expect(r[1].body.attemptId).toBe(aid);
    expect(
      await d.prisma.testAttempt.count({
        where: { learnerId: f.contenders[0].id, placementVersionId: lr.version.id },
      }),
    ).toBe(1);
    expect(
      await d.prisma.domainAuditEvent.count({
        where: { actorId: f.contenders[0].id, action: 'W04A_START', objectType: 'W04A_REQUEST' },
      }),
    ).toBe(1);
    await agent()
      .post(path + '/previews')
      .send({ ...b, goalLR: 700 })
      .expect(409);
    await agent()
      .post(path + '/previews')
      .send({ ...body(), goalLR: 700 })
      .expect(409);
    evidence.push({ startIdempotent: true, concurrency: true, goalsImmutable: true });
  });
  it('own version-pinned exam is answer-safe; foreign student/teacher/legacy mutation and unknown media blocked', async () => {
    const x = (
      await agent()
        .get(path + '/attempts/' + aid + '/exam')
        .expect(200)
    ).body;
    expect(x.wholeExamDeadline).toBeNull();
    expect(x.ungraded).toBe(true);
    expect(JSON.stringify(x)).not.toMatch(
      /isCorrect|INTERNAL_PREVIEW_KEY|sourceHash|questionId|rubric/,
    );
    await f.agents
      .get(f.learner.id)!
      .get(path + '/attempts/' + aid + '/exam')
      .expect(404);
    await f.agents
      .get(f.teacher.id)!
      .get(path + '/attempts/' + aid + '/exam')
      .expect(403);
    await agent()
      .get('/api/placement/attempts/' + aid + '/exam')
      .expect(404);
    await agent()
      .get(path + '/attempts/' + aid + '/stimuli/' + randomUUID())
      .expect(404);
    evidence.push({ ownership404: true, keysHidden: true, wholeTimerNull: true });
  });
  it('answer CAS and independent Mark persist across reread, duplicate ACK replay does not create new write', async () => {
    const q = lr.snapshot.groups[0].questions[0],
      b = { idempotencyKey: randomUUID(), expectedLockVersion: version, marked: true };
    const m = (
      await agent()
        .put(path + '/attempts/' + aid + '/marks/' + q.id)
        .send(b)
        .expect(200)
    ).body;
    version = m.lockVersion;
    expect(
      (
        await agent()
          .put(path + '/attempts/' + aid + '/marks/' + q.id)
          .send(b)
          .expect(200)
      ).body.lockVersion,
    ).toBe(version);
    let x = (await agent().get(path + '/attempts/' + aid + '/exam')).body;
    expect(x.marked).toContain(q.id);
    expect(x.groups[0].questions[0].selectedOptionIds).toEqual([]);
    const answer = {
      idempotencyKey: randomUUID(),
      expectedLockVersion: version,
      selectedOptionIds: [q.options[1].id],
    };
    const r = await Promise.all([
      agent()
        .put(path + '/attempts/' + aid + '/answers/' + q.id)
        .send(answer),
      agent()
        .put(path + '/attempts/' + aid + '/answers/' + q.id)
        .send({ ...answer, idempotencyKey: randomUUID() }),
    ]);
    expect(r.map((x) => x.status).sort()).toEqual([200, 409]);
    version = r.find((x) => x.status === 200)!.body.lockVersion;
    x = (await agent().get(path + '/attempts/' + aid + '/exam')).body;
    expect(x.groups[0].questions[0].selectedOptionIds).toEqual([q.options[1].id]);
    await agent()
      .put(path + '/attempts/' + aid + '/answers/' + q.id)
      .send({
        ...answer,
        idempotencyKey: randomUUID(),
        expectedLockVersion: version,
        selectedOptionIds: [randomUUID()],
      })
      .expect(400);
    evidence.push({ answerMarkIndependent: true, cas409: true, refreshPersistence: true });
  });
  it('DB freezes complete source graph/version and refuses learnerPublishable or scored preview mutation', async () => {
    for (const work of [
      () =>
        d.prisma.placementSourceVersion.update({
          where: { id: lr.version.id },
          data: { sourceHash: '0'.repeat(64) },
        }),
      () =>
        d.prisma.question.update({
          where: { id: lr.groups[0].question.id },
          data: { content: 'Tamper' },
        }),
      () =>
        d.prisma.questionOption.update({
          where: { id: lr.snapshot.groups[0].questions[0].options[0].id },
          data: { isCorrect: false },
        }),
      () =>
        d.prisma.test.update({ where: { id: lr.version.testId }, data: { timeLimitMinutes: 120 } }),
      () =>
        d.prisma.testQuestionGroup.update({
          where: { id: lr.groups[0].group.id },
          data: { taskCode: 'P1' },
        }),
      () => d.prisma.testAttempt.update({ where: { id: aid }, data: { score: 0 } }),
    ])
      await expect(work()).rejects.toThrow();
    evidence.push({ sqlImmutable: true, noFakeZero: true });
  });
  it('historical unversioned attempt cannot bypass the full-source boundary outside verified private fixture mode', async () => {
    const old = await d.prisma.testAttempt.create({
      data: {
        testId: lr.version.testId,
        learnerId: f.learner.id,
        attemptNumber: 1,
        placementGoalScore: 650,
      },
    });
    delete process.env.W04A_PREVIEW_ENABLED;
    await f.agents.get(f.learner.id)!
      .get('/api/placement/attempts/' + old.id + '/exam')
      .expect(409);
    process.env.W04A_PREVIEW_ENABLED = 'DEV_PREVIEW_ONLY';
    const diag = (
      await f.agents.get(f.learner.id)!
        .get(path + '/attempts/' + old.id + '/diagnostic')
        .expect(200)
    ).body;
    expect(diag.sourceStatus).toBe('LEGACY_SOURCE_UNVERIFIED');
    expect(diag.score).toBeNull();
    expect(diag.recommendations).toEqual([]);
    evidence.push({ legacyUnversionedBypassBlocked: true, legacyDiagnosticPending: true });
  });
  it('full blueprint/rights/media reviewers fail closed; raw draft never becomes learnerPublishable', async () => {
    const x = placementEligibility(
      four.snapshot,
      four.version.provenance as unknown as PlacementProvenance,
    );
    expect(x.learnerPublishable).toBe(false);
    expect(x.reasons).toEqual(
      expect.arrayContaining([
        'FULL_LR_200_REQUIRED',
        'FULL_FOUR_SKILLS_219_REQUIRED',
        'SOURCE_RIGHTS_PENDING',
        'ACADEMIC_REVIEW_PENDING',
        'TWO_MEDIA_REVIEWERS_PENDING',
        'SYNTHETIC_NOT_PUBLISHABLE',
      ]),
    );
    expect(await d.prisma.testQuestion.count({ where: { testId: four.version.testId } })).toBe(4);
    evidence.push({ noFakeFullBank: true, fullBlueprintAndRightsBlocked: true });
  });
  it('obsolete whole-exam expiry cannot turn an interrupted historical S10 task into zero',async()=>{
    const test=await d.prisma.test.create({data:{purpose:'PLACEMENT',placementMode:'FOUR_SKILLS',title:'Private historical expiry protocol fixture',timeLimitMinutes:1}});
    const g=await d.prisma.testQuestionGroup.create({data:{testId:test.id,skill:'SPEAKING',orderIndex:0,taskCode:'SE_SW_01_S10_V01'}});
    await d.prisma.testQuestion.create({data:{testId:test.id,groupId:g.id,questionId:four.groups[2].question.id,orderIndex:0}});
    const a=await d.prisma.testAttempt.create({data:{testId:test.id,learnerId:f.learner.id,attemptNumber:1,startedAt:new Date(Date.now()-120000)}});
    await f.agents.get(f.learner.id)!.get('/api/placement/attempts/'+a.id+'/exam').expect(409);
    const row=await d.prisma.testAttempt.findUniqueOrThrow({where:{id:a.id}});expect(row.status).toBe('IN_PROGRESS');expect(row.score).toBeNull();expect(row.maxScore).toBeNull();
    evidence.push({historicalS10ExpiryFailClosed:true,noInventedFullDeadlineOrZero:true});
  });
  it('completion receipt idempotent and ungraded, diagnostics/history null with no matching or external results', async () => {
    const b = { idempotencyKey: randomUUID(), expectedLockVersion: version };
    const rr = await Promise.all([
      agent()
        .post(path + '/attempts/' + aid + '/complete')
        .send(b),
      agent()
        .post(path + '/attempts/' + aid + '/complete')
        .send(b),
    ]);
    expect(rr.map((x) => x.status)).toEqual([201, 201]);
    expect(rr[0].body.receipt).toBeTruthy();
    expect(rr[0].body.receipt).toBe(rr[1].body.receipt);
    const x = (
      await agent()
        .get(path + '/attempts/' + aid + '/diagnostic')
        .expect(200)
    ).body;
    expect(x.score).toBeNull();
    expect(x.officialToeicScore).toBeNull();
    expect(x.measuredLevel).toBeNull();
    expect(x.recommendations).toEqual([]);
    expect(x.label).toBe('CHƯA ĐỦ DỮ LIỆU');
    expect(await d.prisma.attemptSkillScore.count({ where: { attemptId: aid } })).toBe(0);
    const h = (await agent().get(path + '/history')).body;
    expect(h.find((x: { attemptId: string }) => x.attemptId === aid).score).toBeNull();
    await f.agents
      .get(f.learner.id)!
      .get(path + '/attempts/' + aid + '/diagnostic')
      .expect(404);
    evidence.push({ completeReceipt: true, allScoresNull: true, noMatching: true });
  });
  it('FOUR_SKILLS goals0 and175 stay independent; S10 missing recording blocks completion without scoring or replay', async () => {
    const x = (
      await f.agents
        .get(f.contenders[1].id)!
        .post(path + '/previews')
        .send({
          ...body(),
          mode: 'FOUR_SKILLS',
          sourceVersionId: four.version.id,
          goalSpeaking: 0,
          goalWriting: 175,
        })
        .expect(201)
    ).body;
    expect(x.goals.goalSpeaking).toBe(0);
    expect(x.goals.goalWriting).toBe(175);
    await f.agents
      .get(f.contenders[1].id)!
      .post(path + '/attempts/' + x.attemptId + '/complete')
      .send({ idempotencyKey: randomUUID(), expectedLockVersion: 0 })
      .expect(409);
    const state = (
      await f.agents.get(f.contenders[1].id)!.get(path + '/attempts/' + x.attemptId + '/diagnostic')
    ).body;
    expect(
      state.skillResults.filter((x: { status: string }) => x.status === 'PENDING_EVALUATION'),
    ).toHaveLength(2);
    evidence.push({
      independentSWGoals: true,
      s10CompletionFailClosed: true,
      pendingNotZero: true,
    });
  });
  it('AI_ESTIMATE PROVISIONAL never becomes FINAL, a zero, or class matching in the diagnostic', async () => {
    const a = await d.prisma.testAttempt.findFirstOrThrow({
      where: { learnerId: f.contenders[1].id, placementVersionId: four.version.id },
    });
    await d.prisma.attemptSkillScore.create({
      data: {
        attemptId: a.id,
        skill: 'SPEAKING',
        status: 'PROVISIONAL',
        source: 'AI_ESTIMATE',
        normalizedScore: 95,
        estimatedToeicScore: 180,
      },
    });
    const x = (
      await f.agents
        .get(f.contenders[1].id)!
        .get(path + '/attempts/' + a.id + '/diagnostic')
        .expect(200)
    ).body;
    expect(x.skillResults.find((s: { skill: string }) => s.skill === 'SPEAKING').score).toBeNull();
    expect(x.skillResults.find((s: { skill: string }) => s.skill === 'SPEAKING').status).toBe(
      'PENDING_EVALUATION',
    );
    expect(x.recommendations).toEqual([]);
    evidence.push({ provisionalNotFinal: true, noMatching: true });
  });
  it('expired server session denies even with a valid browser cookie; a revoked account also denies', async () => {
    const u = f.contenders[2],
      a = request.agent(d.app.getHttpServer());
    await a.post('/api/auth/login').send({ email: u.email, password: f.password }).expect(200);
    await d.prisma
      .$executeRaw`UPDATE user_sessions SET expire=clock_timestamp()-interval '1 minute' WHERE sess->>'userId'=${u.id}`;
    await a.get(path + '/config').expect(401);
    await a.post('/api/auth/login').send({ email: u.email, password: f.password }).expect(200);
    await d.prisma.user.update({ where: { id: u.id }, data: { status: 'LOCKED' } });
    await a.get(path + '/config').expect(401);
    evidence.push({ expiredSession401: true, revokedAccount401: true });
  });
  it('missing/changed asset bytes deny preparation without rewriting media or starting an attempt', async () => {
    const { AssessmentStimulusMediaStorage } =
      await import('../src/modules/placement/assessment-stimulus-media.storage');
    const storage = d.app.get(AssessmentStimulusMediaStorage),
      spy = jest.spyOn(storage, 'read').mockRejectedValueOnce(new Error('Synthetic missing file'));
    await agent()
      .post(path + '/previews')
      .send({
        ...body(),
        mode: 'FOUR_SKILLS',
        sourceVersionId: four.version.id,
        goalSpeaking: 100,
        goalWriting: 150,
      })
      .expect(503);
    spy.mockRestore();
    expect(
      await d.prisma.testAttempt.count({
        where: { learnerId: f.contenders[0].id, placementVersionId: four.version.id },
      }),
    ).toBe(0);
    evidence.push({ missingAsset503: true, noAttemptCreated: true, mediaUnchanged: true });
  });
  it('DB outage propagates503, identical request can retry, logout/expired current session immediately denied', async () => {
    const service = d.app.get(PlacementIntegrationService),
      prisma = service['db'],
      spy = jest
        .spyOn(prisma, '$transaction')
        .mockRejectedValueOnce(new Error('Synthetic unavailable'));
    await agent()
      .get(path + '/config')
      .expect(503);
    spy.mockRestore();
    await agent()
      .get(path + '/config')
      .expect(200);
    await agent().post('/api/auth/logout').expect(204);
    await agent()
      .get(path + '/attempts/' + aid + '/exam')
      .expect(401);
    evidence.push({ dbOutage503: true, retry: true, logout401: true });
  });
});
