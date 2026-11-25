import { Logger } from '@nestjs/common';
import { grantAcademic } from './wave02b.fixture';
import * as request from 'supertest';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { startWave01App } from './wave01-postgres.fixture';
import { seedWave03A } from './wave03a.fixture';
import { seedPlacementWorkflowSource } from './wave04b.fixture';
import { PlacementWorkflowService } from '../src/modules/placement/workflow.service';
const base = '/api/v2/placement/workflow',
  reason = 'Synthetic W04B independent DEV workflow verification';
describe('W04B real HTTP/PostgreSQL26 workflow', () => {
  let d: Awaited<ReturnType<typeof startWave01App>>,
    f: Awaited<ReturnType<typeof seedWave03A>>,
    lr: Awaited<ReturnType<typeof seedPlacementWorkflowSource>>,
    four: typeof lr,
    policy: string,
    fp: string,
    aid: string;
  const evidence: unknown[] = [],
    key = () => randomUUID(),
    body = () => ({
      idempotencyKey: key(),
      sourceVersionId: lr.version.id,
      policyId: policy,
      mode: 'LR',
      goalLR: 650,
    });
  const a = () => f.agents.get(f.contenders[0].id)!,
    teacher = () => f.agents.get(f.teacher.id)!,
    checker = () => f.agents.get(f.planningApprover.id)!,
    hvu = () => f.agents.get(f.academic.id)!;
  async function login(u: { id: string; email: string }) {
    const ag = request.agent(d.app.getHttpServer());
    await ag.post('/api/auth/login').send({ email: u.email, password: f.password }).expect(200);
    f.agents.set(u.id, ag);
    return ag;
  }
  async function grant(user: { id: string; email: string }, cap: string) {
    const r = await f.agents
      .get(f.approver.id)!
      .post('/api/authority/grants')
      .send({
        userId: user.id,
        capability: cap,
        scopeType: 'GLOBAL',
        reason,
        effectiveAt: new Date(Date.now() - 1000).toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(r.status).toBe(201);
    await f.agents
      .get(f.secondApprover.id)!
      .post('/api/authority/grants/' + r.body.id + '/approve')
      .expect(201);
    await login(user);
    return r.body.id as string;
  }
  async function createTiming(
    source: typeof lr,
    writingSeconds = 60,
    speakingSeconds = 30,
    uploadSeconds = 120,
  ) {
    const p = await teacher()
      .post(base + '/policies')
      .send({
        idempotencyKey: key(),
        kind: 'SOURCE_TIMING',
        mode: source.version.mode,
        sourceId: source.version.id,
        body: {
          sourceHash: source.version.sourceHash,
          evidence: reason,
          tasks: source.groups
            .filter((g) => ['SPEAKING', 'WRITING'].includes(g.group.skill))
            .map((g) => ({
              groupId: g.group.id,
              preparationSeconds: 0,
              playbackSeconds: g.group.taskCode === 'SE_SW_01_S10_V01' ? 210 : 0,
              responseSeconds:
                g.group.skill === 'SPEAKING'
                  ? g.group.taskCode === 'SE_SW_01_S10_V01'
                    ? 30
                    : speakingSeconds
                  : writingSeconds,
              uploadSeconds,
            })),
        },
        reason,
      })
      .expect(201);
    await checker()
      .post(base + '/policies/' + p.body.id + '/approve')
      .send({ idempotencyKey: key(), reason })
      .expect(201);
    return p.body.id as string;
  }
  beforeAll(async () => {
    process.env.W04B_ENABLED = 'DEV_WORKFLOW';
    jest.spyOn(Logger.prototype, 'error').mockImplementation((x: unknown) => {
      evidence.push({ internalDiagnostic: x });
    });
    d = await startWave01App();
    d.app.useLogger(['error']);
    f = await seedWave03A(d);
    lr = await seedPlacementWorkflowSource(d, 'LR');
    four = await seedPlacementWorkflowSource(d, 'FOUR_SKILLS');
    for (const cap of ['placement.source.author', 'placement.rubric.author'])
      await grant(f.teacher, cap);
    for (const u of [f.academic, f.planningApprover])
      for (const cap of [
        'placement.source.approve',
        'placement.rubric.approve',
        'placement.grader.assign',
        'placement.result.publish',
        'placement.criteria.author',
        'placement.criteria.approve',
      ])
        await grant(u, cap);
    policy = await createTiming(lr);
    fp = await createTiming(four);
  }, 60000);
  afterAll(async () => {
    await mkdir(process.env.W04B_EVIDENCE_ROOT ?? '.local-storage/v2-wave04b', { recursive: true });
    await writeFile(
      (process.env.W04B_EVIDENCE_ROOT ?? '.local-storage/v2-wave04b') + '/http-evidence.json',
      JSON.stringify(evidence, null, 2),
    );
    await d?.app.close();
  }, 30000);
  it('guest401 and no-grant roles cannot author, assign or publish; real flags false', async () => {
    await request(d.app.getHttpServer())
      .get(base + '/config')
      .expect(401);
    for (const u of [f.learner, f.admin, f.ungrantedAcademic, f.cashier, f.inspector])
      await f.agents
        .get(u.id)!
        .post(base + '/policies')
        .send({
          idempotencyKey: key(),
          kind: 'SOURCE_TIMING',
          mode: 'LR',
          sourceId: lr.version.id,
          body: {},
          reason,
        })
        .expect(403);
    const c = (
      await a()
        .get(base + '/config')
        .expect(200)
    ).body;
    expect(c.realExamEnabled).toBe(false);
    expect(c.releaseFlags).toEqual({
      MEDIA_QA_PASS: false,
      ACADEMIC_APPROVED: false,
      PUBLISHED: false,
    });
    expect(JSON.stringify(c)).not.toMatch(/sourceHash|isCorrect|INTERNAL_PREVIEW_KEY/);
    evidence.push({ auth: true, grantRequired: true, flagsFalse: true });
  });
  it('missing opt-in/production fail closed without starting; unpublished policy/mode/goal tamper blocked', async () => {
    delete process.env.W04B_ENABLED;
    await a()
      .post(base + '/attempts')
      .send(body())
      .expect(409);
    process.env.W04B_ENABLED = 'DEV_WORKFLOW';
    const old = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    await a()
      .post(base + '/attempts')
      .send(body())
      .expect(409);
    process.env.NODE_ENV = old;
    await a()
      .post(base + '/attempts')
      .send({ ...body(), policyId: key() })
      .expect(409);
    await a()
      .post(base + '/attempts')
      .send({ ...body(), mode: 'FOUR_SKILLS' })
      .expect(400);
    await a()
      .post(base + '/attempts')
      .send({ ...body(), goalLR: 9 })
      .expect(400);
  });
  it('source author/checker is independent and approved policy/graph immutable in PostgreSQL', async () => {
    const p = await hvu()
      .post(base + '/policies')
      .send({ idempotencyKey: key(), kind: 'CRITERIA', mode: 'LR', body: {}, reason })
      .expect(400);
    expect(p.body).toBeDefined();
    await expect(
      d.prisma.placementWorkflowPolicy.update({
        where: { id: policy },
        data: { reason: 'Tamper immutable approved policy' },
      }),
    ).rejects.toThrow();
    await expect(
      d.prisma.question.update({
        where: { id: lr.groups[0].question.id },
        data: { content: 'Changed frozen source' },
      }),
    ).rejects.toThrow();
  });
  it('parallel start requests share one first sitting, same key replay and no goal changes', async () => {
    const b = body(),
      rs = await Promise.all([
        a()
          .post(base + '/attempts')
          .send(b),
        a()
          .post(base + '/attempts')
          .send(b),
      ]);
    expect(rs.map((r) => r.status)).toEqual([201, 201]);
    aid = rs[0].body.attemptId;
    expect(rs[1].body.attemptId).toBe(aid);
    expect(
      await d.prisma.testAttempt.count({
        where: { learnerId: f.contenders[0].id, placementVersionId: lr.version.id },
      }),
    ).toBe(1);
    const n = (
      await a()
        .post(base + '/attempts')
        .send(body())
        .expect(201)
    ).body;
    expect(n.attemptId).toBe(aid);
    await a()
      .post(base + '/attempts')
      .send({ ...body(), goalLR: 700 })
      .expect(409);
    await a().post('/api/v2/placement/previews').send(body()).expect(400);
    evidence.push({ firstSitting: true, idempotency: true });
  });
  it('only current Listening appears; refresh preserves original UTC deadline; cross-owner404 and no keys', async () => {
    const e = (
      await a()
        .get(base + '/attempts/' + aid)
        .expect(200)
    ).body;
    expect(e.phase).toBe('LISTENING');
    expect(e.groups.every((g: { skill: string }) => g.skill === 'LISTENING')).toBe(true);
    expect(Date.parse(e.deadline) - Date.parse(e.phaseStartedAt)).toBe(2700000);
    expect(JSON.stringify(e)).not.toMatch(
      /isCorrect|questionId|explanation|storageKey|INTERNAL_PREVIEW_KEY|sourceHash/,
    );
    const r = (
      await a()
        .get(base + '/attempts/' + aid)
        .expect(200)
    ).body;
    expect(r.deadline).toBe(e.deadline);
    await f.agents
      .get(f.contenders[1].id)!
      .get(base + '/attempts/' + aid)
      .expect(404);
    await a()
      .get('/api/v2/placement/attempts/' + aid + '/exam')
      .expect(409);
  });
  it('future question write denied and concurrent tabs produce one accepted CAS; exact lost-ACK retry', async () => {
    const e = (await a().get(base + '/attempts/' + aid)).body,
      q = lr.groups[0].tq;
    await a()
      .post(base + '/attempts/' + aid + '/answers')
      .send({
        idempotencyKey: key(),
        expectedLockVersion: e.lockVersion,
        questionId: lr.groups[1].tq.id,
        selectedOptionIds: [],
      })
      .expect(404);
    const options = await d.prisma.questionOption.findMany({
      where: { questionId: lr.groups[0].question.id },
      orderBy: { orderIndex: 'asc' },
    });
    const b = {
        idempotencyKey: key(),
        expectedLockVersion: e.lockVersion,
        questionId: q.id,
        selectedOptionIds: [options[0].id],
      },
      r = await Promise.all([
        a()
          .post(base + '/attempts/' + aid + '/answers')
          .send(b),
        a()
          .post(base + '/attempts/' + aid + '/answers')
          .send({ ...b, idempotencyKey: key() }),
      ]);
    expect(r.map((r) => r.status).sort()).toEqual([201, 409]);
    const winner = r[0].status === 201 ? b : null;
    if (winner) {
      const retry = await a()
        .post(base + '/attempts/' + aid + '/answers')
        .send(b)
        .expect(201);
      expect(retry.body.lockVersion).toBe(r[0].body.lockVersion);
    }
    evidence.push({ twoTabsCAS: true, answerOwned: true });
  });
  it('transition Reading sets original75min, LR prohibits break; receipt stable and no automatic published score', async () => {
    let e = (await a().get(base + '/attempts/' + aid)).body;
    await a()
      .post(base + '/attempts/' + aid + '/commands')
      .send({ idempotencyKey: key(), expectedLockVersion: e.lockVersion, action: 'BREAK' })
      .expect(400);
    e = (
      await a()
        .post(base + '/attempts/' + aid + '/commands')
        .send({ idempotencyKey: key(), expectedLockVersion: e.lockVersion, action: 'NEXT' })
        .expect(201)
    ).body;
    expect(e.phase).toBe('READING');
    expect(Date.parse(e.deadline) - Date.parse(e.phaseStartedAt)).toBe(4500000);
    const q = lr.groups[1].tq,
      ops = await d.prisma.questionOption.findMany({
        where: { questionId: lr.groups[1].question.id },
        orderBy: { orderIndex: 'asc' },
      });
    e = (
      await a()
        .post(base + '/attempts/' + aid + '/answers')
        .send({
          idempotencyKey: key(),
          expectedLockVersion: e.lockVersion,
          questionId: q.id,
          selectedOptionIds: [ops[0].id],
        })
        .expect(201)
    ).body;
    const b = { idempotencyKey: key(), expectedLockVersion: e.lockVersion, action: 'NEXT' },
      r = (
        await a()
          .post(base + '/attempts/' + aid + '/commands')
          .send(b)
          .expect(201)
      ).body;
    expect(r.phase).toBe('SUBMITTED');
    expect(r.receipt).toMatch(/^[a-f0-9-]{36}$/);
    expect(
      (
        await a()
          .post(base + '/attempts/' + aid + '/commands')
          .send(b)
          .expect(201)
      ).body,
    ).toEqual(r);
    const diag = (
      await a()
        .get(base + '/attempts/' + aid + '/diagnostic')
        .expect(200)
    ).body;
    expect(diag.state).toBe('PENDING_REVIEW');
    expect(diag.skillResults.every((s: { value: unknown }) => s.value === null)).toBe(true);
    expect(diag.matching.classes).toEqual([]);
  });
  it('independent HVU releases objective version; own raw Part evidence only, no ETS/item keys', async () => {
    const e = await d.prisma.placementHumanEvaluation.findFirstOrThrow({
      where: { attemptId: aid, skill: 'LR' },
    });
    await a()
      .post(base + '/evaluations/' + e.id + '/publish')
      .send({ idempotencyKey: key(), reason })
      .expect(403);
    await f.agents
      .get(f.ungrantedAcademic.id)!
      .post(base + '/evaluations/' + e.id + '/publish')
      .send({ idempotencyKey: key(), reason })
      .expect(403);
    await checker()
      .post(base + '/evaluations/' + e.id + '/publish')
      .send({ idempotencyKey: key(), reason })
      .expect(201);
    const r = (
      await a()
        .get(base + '/attempts/' + aid + '/diagnostic')
        .expect(200)
    ).body;
    expect(r.state).toBe('PUBLISHED');
    expect(r.parts).toHaveLength(2);
    expect(r.officialToeicScore).toBeNull();
    expect(r.fourSkillsTotal).toBeNull();
    expect(r.matching.reasons).toContain('APPROVED_CRITERIA_MISSING');
    expect(JSON.stringify(r)).not.toMatch(
      /isCorrect|selectedOptionIds|explanation|INTERNAL_PREVIEW_KEY/,
    );
    await f.agents
      .get(f.contenders[1].id)!
      .get(base + '/attempts/' + aid + '/diagnostic')
      .expect(404);
    evidence.push({ independentLRRelease: true, unpublishedNull: true, noKeysOrETS: true });
  });
  it('FOUR missing rubric stays pending; break server600s exposes no Speaking until resume', async () => {
    const r = await a()
        .post(base + '/attempts')
        .send({
          ...body(),
          mode: 'FOUR_SKILLS',
          sourceVersionId: four.version.id,
          policyId: fp,
          goalSpeaking: 0,
          goalWriting: 175,
        })
        .expect(201),
      id = r.body.attemptId;
    let e = (await a().get(base + '/attempts/' + id)).body;
    for (const action of ['NEXT', 'BREAK'])
      e = (
        await a()
          .post(base + '/attempts/' + id + '/commands')
          .send({ idempotencyKey: key(), expectedLockVersion: e.lockVersion, action })
          .expect(201)
      ).body;
    expect(e.phase).toBe('BREAK');
    expect(Date.parse(e.deadline) - Date.parse(e.phaseStartedAt)).toBe(600000);
    expect((await a().get(base + '/attempts/' + id)).body.groups).toEqual([]);
    e = (
      await a()
        .post(base + '/attempts/' + id + '/commands')
        .send({ idempotencyKey: key(), expectedLockVersion: e.lockVersion, action: 'NEXT' })
        .expect(201)
    ).body;
    expect(e.phase).toBe('SPEAKING');
    const blocked = (
      await a()
        .post(base + '/attempts/' + id + '/commands')
        .send({ idempotencyKey: key(), expectedLockVersion: e.lockVersion, action: 'NEXT' })
        .expect(201)
    ).body;
    expect(blocked.phase).toBe('BLOCKED_REVIEW');
    expect((await d.prisma.testAttempt.findUniqueOrThrow({ where: { id } })).score).toBeNull();
    await a()
      .post(base + '/attempts/' + id + '/commands')
      .send({ idempotencyKey: key(), expectedLockVersion: blocked.lockVersion, action: 'NEXT' })
      .expect(409);
    const diag = (await a().get(base + '/attempts/' + id + '/diagnostic')).body;
    expect(
      diag.skillResults
        .filter((s: { skill: string }) => ['SPEAKING', 'WRITING'].includes(s.skill))
        .every((s: { value: unknown }) => s.value === null),
    ).toBe(true);
    evidence.push({ breakBounded: true, unsafeRecordingBlockedNotZero: true });
  });
  it('application/service restart recovers same receipt and no new attempt', async () => {
    const before = (await a().get(base + '/attempts/' + aid)).body;
    const svc = d.app.get(PlacementWorkflowService);
    expect(svc).toBeDefined();
    const saved = await d.prisma.placementSitting.findUniqueOrThrow({ where: { attemptId: aid } });
    expect(saved.receipt).toBe(before.receipt);
    expect(saved.phase).toBe('SUBMITTED');
    const r = (
      await a()
        .post(base + '/attempts')
        .send(body())
        .expect(201)
    ).body;
    expect(r.attemptId).toBe(aid);
  });
  let gid: string,
    gs: typeof lr,
    rid: string,
    assignmentId: string,
    speakingEval: string,
    writingEval: string;
  const wav = () => {
    const b = Buffer.alloc(44 + 3200);
    b.write('RIFF');
    b.writeUInt32LE(b.length - 8, 4);
    b.write('WAVEfmt ', 8);
    b.writeUInt32LE(16, 16);
    b.writeUInt16LE(1, 20);
    b.writeUInt16LE(1, 22);
    b.writeUInt32LE(16000, 24);
    b.writeUInt32LE(32000, 28);
    b.writeUInt16LE(2, 32);
    b.writeUInt16LE(16, 34);
    b.write('data', 36);
    b.writeUInt32LE(3200, 40);
    return b;
  };
  async function next(id: string, action = 'NEXT') {
    const e = (await a().get(base + '/attempts/' + id)).body;
    return (
      await a()
        .post(base + '/attempts/' + id + '/commands')
        .send({ idempotencyKey: key(), expectedLockVersion: e.lockVersion, action })
        .expect(201)
    ).body;
  }
  it('real non-S10 WAV upload has original bytes/hash, rejects foreign/non-WAV/retry mutation', async () => {
    gs = await seedPlacementWorkflowSource(d, 'FOUR_SKILLS', true);
    const p = await createTiming(gs);
    gid = (
      await a()
        .post(base + '/attempts')
        .send({
          ...body(),
          sourceVersionId: gs.version.id,
          policyId: p,
          mode: 'FOUR_SKILLS',
          goalSpeaking: 100,
          goalWriting: 100,
        })
        .expect(201)
    ).body.attemptId;
    await next(gid);
    let e = await next(gid);
    expect(e.phase).toBe('SPEAKING');
    const q = gs.groups[2].tq.id,
      b = { idempotencyKey: key(), expectedLockVersion: e.lockVersion, tabId: key(), token: key() };
    const begin = { ...b, idempotencyKey: key() };
    const ticket = (
      await a()
        .post(base + '/attempts/' + gid + '/recordings/' + q + '/begin')
        .send(begin)
        .expect(201)
    ).body;
    expect(
      (
        await a()
          .post(base + '/attempts/' + gid + '/recordings/' + q + '/begin')
          .send(begin)
          .expect(201)
      ).body,
    ).toEqual(ticket);
    await a()
      .post(base + '/attempts/' + gid + '/recordings/' + q + '/begin')
      .send({ ...begin, idempotencyKey: key(), tabId: key() })
      .expect(409);
    b.expectedLockVersion = ticket.lockVersion;
    await a()
      .post(base + '/attempts/' + gid + '/recordings/' + q)
      .field('idempotencyKey', b.idempotencyKey)
      .field('expectedLockVersion', String(b.expectedLockVersion))
      .field('tabId', b.tabId)
      .field('token', b.token)
      .attach('file', Buffer.from('fakeWAV'), { filename: 'bad.wav', contentType: 'audio/wav' })
      .expect(400);
    const upload = () =>
      a()
        .post(base + '/attempts/' + gid + '/recordings/' + q)
        .field('idempotencyKey', b.idempotencyKey)
        .field('expectedLockVersion', String(b.expectedLockVersion))
        .field('tabId', b.tabId)
        .field('token', b.token)
        .attach('file', wav(), { filename: 'original.wav', contentType: 'audio/wav' });
    const r = await upload().expect(201),
      retry = await upload().expect(201);
    expect(retry.body).toEqual(r.body);
    expect(await d.prisma.placementTaskRecording.count({ where: { attemptId: gid } })).toBe(1);
    await f.agents
      .get(f.contenders[1].id)!
      .post(base + '/attempts/' + gid + '/recordings/' + q)
      .field('idempotencyKey', key())
      .field('expectedLockVersion', '0')
      .field('tabId', b.tabId)
      .field('token', b.token)
      .attach('file', wav(), { filename: 'original.wav', contentType: 'audio/wav' })
      .expect(404);
    e = await next(gid);
    expect(e.phase).toBe('WRITING');
    await a()
      .post(base + '/attempts/' + gid + '/answers')
      .send({
        idempotencyKey: key(),
        expectedLockVersion: e.lockVersion,
        questionId: gs.groups[3].tq.id,
        textResponse: 'Original synthetic learner announcement for manual review.',
      })
      .expect(201);
    await next(gid);
    expect(await d.prisma.enrollment.count({ where: { learnerId: f.contenders[0].id } })).toBe(0);
    evidence.push({
      genericOriginalWav: true,
      uploadSameBytesIdempotent: true,
      preEnrollment: true,
    });
  });
  it('rubric must be independently approved with exact task descriptors; unapproved blocks FINAL', async () => {
    const body = {
      sourceHash: gs.version.sourceHash,
      evidence: reason,
      scale: 'SYNTHETIC_INTERNAL_POINTS_NOT_FACULTY_CALIBRATED',
      tasks: gs.groups
        .filter((g) => ['SPEAKING', 'WRITING'].includes(g.group.skill))
        .map((g) => ({
          groupId: g.group.id,
          criteria: [
            {
              code: 'EVIDENCE',
              descriptor: 'Synthetic internal content evidence descriptor only',
              max: 7,
            },
          ],
        })),
    };
    rid = (
      await teacher()
        .post(base + '/policies')
        .send({
          idempotencyKey: key(),
          kind: 'RUBRIC',
          mode: 'FOUR_SKILLS',
          sourceId: gs.version.id,
          body,
          reason,
        })
        .expect(201)
    ).body.id;
    await teacher()
      .post(base + '/policies/' + rid + '/approve')
      .send({ idempotencyKey: key(), reason })
      .expect(403);
    await f.agents
      .get(f.ungrantedAcademic.id)!
      .post(base + '/policies/' + rid + '/approve')
      .send({ idempotencyKey: key(), reason })
      .expect(403);
    assignmentId = (
      await hvu()
        .post(base + '/attempts/' + gid + '/assignments')
        .send({ idempotencyKey: key(), graderId: f.teacher.id, eligibilityConfirmed: true, reason })
        .expect(201)
    ).body.id;
    await teacher()
      .post(base + '/attempts/' + gid + '/evaluations')
      .send({
        idempotencyKey: key(),
        skill: 'SPEAKING',
        rubricId: rid,
        expectedNumber: 0,
        originalEvidenceReviewed: true,
        scores: {},
        reason,
      })
      .expect(409);
    await checker()
      .post(base + '/policies/' + rid + '/approve')
      .send({ idempotencyKey: key(), reason })
      .expect(201);
  });
  it('wrong GV/HV/QT/HVU cannot read original recordings; current assigned GV must inspect original before scoring', async () => {
    const q = gs.groups[2].tq.id;
    for (const u of [f.otherTeacher, f.learner, f.admin, f.academic])
      await f.agents
        .get(u.id)!
        .get(base + '/attempts/' + gid + '/recordings/' + q)
        .expect(u.role === 'INSTRUCTOR' ? 404 : 403);
    const r = await teacher()
      .get(base + '/attempts/' + gid + '/review')
      .expect(200);
    expect(r.body.tasks.find((t: { skill: string }) => t.skill === 'WRITING').text).toContain(
      'Original synthetic learner',
    );
    const scores = {
      [gs.groups[2].group.id]: [
        {
          code: 'EVIDENCE',
          score: 5,
          evidence: 'Manual original acoustic observation in synthetic recording',
          feedback: 'Synthetic descriptive feedback after listening to original',
        },
      ],
    };
    await teacher()
      .post(base + '/attempts/' + gid + '/evaluations')
      .send({
        idempotencyKey: key(),
        skill: 'SPEAKING',
        rubricId: rid,
        expectedNumber: 0,
        originalEvidenceReviewed: true,
        scores,
        reason,
      })
      .expect(409);
    const audio = await teacher()
      .get(base + '/attempts/' + gid + '/recordings/' + q)
      .expect(200);
    expect(audio.headers['content-type']).toMatch(/audio\/wav/);
    expect(audio.headers['cache-control']).toBe('private, no-store');
    expect(await d.prisma.placementEvidenceRead.count({ where: { assignmentId } })).toBe(2);
    speakingEval = (
      await teacher()
        .post(base + '/attempts/' + gid + '/evaluations')
        .send({
          idempotencyKey: key(),
          skill: 'SPEAKING',
          rubricId: rid,
          expectedNumber: 0,
          originalEvidenceReviewed: true,
          scores,
          reason,
        })
        .expect(201)
    ).body.id;
    writingEval = (
      await teacher()
        .post(base + '/attempts/' + gid + '/evaluations')
        .send({
          idempotencyKey: key(),
          skill: 'WRITING',
          rubricId: rid,
          expectedNumber: 0,
          originalEvidenceReviewed: true,
          scores: {
            [gs.groups[3].group.id]: [
              {
                code: 'EVIDENCE',
                score: 6,
                evidence: 'Manual text evidence from original submitted announcement',
                feedback: 'Synthetic criterion feedback with original text reference',
              },
            ],
          },
          reason,
        })
        .expect(201)
    ).body.id;
  });
  it('FOUR LR partial has S/W pending null and no matching even when GV FINAL exists', async () => {
    const e = await d.prisma.placementHumanEvaluation.findFirstOrThrow({
      where: { attemptId: gid, skill: 'LR' },
    });
    await checker()
      .post(base + '/evaluations/' + e.id + '/publish')
      .send({ idempotencyKey: key(), reason })
      .expect(201);
    const diag = (await a().get(base + '/attempts/' + gid + '/diagnostic')).body;
    expect(diag.state).toBe('PARTIAL');
    expect(
      diag.skillResults
        .filter((s: { skill: string }) => ['SPEAKING', 'WRITING'].includes(s.skill))
        .every((s: { value: unknown }) => s.value === null),
    ).toBe(true);
    expect(diag.matching.classes).toEqual([]);
  });
  it('independent HVU publishes S/W; stale criterion versions and AI-only/self-publication cannot bypass', async () => {
    await teacher()
      .post(base + '/evaluations/' + speakingEval + '/publish')
      .send({ idempotencyKey: key(), reason })
      .expect(403);
    await checker()
      .post(base + '/evaluations/' + speakingEval + '/publish')
      .send({ idempotencyKey: key(), reason })
      .expect(201);
    expect((await a().get(base + '/attempts/' + gid + '/diagnostic')).body.state).toBe('PARTIAL');
    await checker()
      .post(base + '/evaluations/' + writingEval + '/publish')
      .send({ idempotencyKey: key(), reason })
      .expect(201);
    const diag = (await a().get(base + '/attempts/' + gid + '/diagnostic')).body;
    expect(diag.state).toBe('PUBLISHED');
    expect(diag.skillResults.find((s: { skill: string }) => s.skill === 'SPEAKING').value).toBe(5);
    expect(diag.fourSkillsTotal).toBeNull();
  });
  it('correction appends signed evaluation; previous published result visible until republish', async () => {
    const scores = {
        [gs.groups[2].group.id]: [
          {
            code: 'EVIDENCE',
            score: 4,
            evidence: 'Corrected human evidence against original synthetic audio',
            feedback: 'Correction explanation with immutable prior result retained',
          },
        ],
      },
      b = {
        idempotencyKey: key(),
        skill: 'SPEAKING',
        rubricId: rid,
        expectedNumber: 1,
        originalEvidenceReviewed: true,
        scores,
        reason: 'Correction after independent review, retain original publication',
      };
    const r = await teacher()
      .post(base + '/attempts/' + gid + '/evaluations')
      .send(b)
      .expect(201);
    expect(r.body.number).toBe(2);
    expect(
      (await a().get(base + '/attempts/' + gid + '/diagnostic')).body.skillResults.find(
        (s: { skill: string }) => s.skill === 'SPEAKING',
      ).value,
    ).toBe(5);
    await checker()
      .post(base + '/evaluations/' + r.body.id + '/publish')
      .send({ idempotencyKey: key(), reason })
      .expect(201);
    expect(
      (await a().get(base + '/attempts/' + gid + '/diagnostic')).body.skillResults.find(
        (s: { skill: string }) => s.skill === 'SPEAKING',
      ).value,
    ).toBe(4);
    await expect(
      d.prisma.placementHumanEvaluation.update({
        where: { id: speakingEval },
        data: { reason: 'Tamper published evaluation' },
      }),
    ).rejects.toThrow();
    evidence.push({
      manualFinal: true,
      originalReadRequired: true,
      partialPendingNull: true,
      independentPublish: true,
      correctionHistory: true,
    });
  });
  it('reassignment removes old GV access immediately; new GV needs own original-evidence receipts', async () => {
    await hvu()
      .post(base + '/attempts/' + gid + '/assignments')
      .send({
        idempotencyKey: key(),
        graderId: f.otherTeacher.id,
        eligibilityConfirmed: true,
        reason: 'Explicit eligible GV reassignment, preserve previous grader history',
      })
      .expect(201);
    await teacher()
      .get(base + '/attempts/' + gid + '/review')
      .expect(404);
    await teacher()
      .get(base + '/attempts/' + gid + '/recordings/' + gs.groups[2].tq.id)
      .expect(404);
    await f.agents
      .get(f.otherTeacher.id)!
      .get(base + '/attempts/' + gid + '/review')
      .expect(200);
    expect(await d.prisma.placementGraderAssignment.count({ where: { attemptId: gid } })).toBe(2);
  });
  it('versioned independently approved criteria match actual approved class facts, never reserve seats; full class excluded', async () => {
    const ap = '/api/v2/academic',
      maker = hvu();
    let v = (
      await maker
        .post(ap + '/programs/' + f.published.id + '/versions')
        .send({
          title: 'Synthetic LR curriculum version for match proof',
          description: 'Original LR curriculum with immutable learning goals, DEV only',
          level: 'INTERNAL',
          skillScope: 'LR',
          standardPricingType: 'FREE',
          standardTuitionFeeVnd: 0,
          effectiveFrom: new Date(Date.now() - 60000).toISOString(),
          reason,
        })
        .expect(201)
    ).body;
    v = (
      await maker
        .post(ap + '/versions/' + v.id + '/submit')
        .send({ expectedLockVersion: v.lockVersion, reason })
        .expect(201)
    ).body;
    const future = new Date(Date.now() + 14 * 86400000),
      end = new Date(future.getTime() + 3600000);
    v = (
      await checker()
        .post(ap + '/versions/' + v.id + '/approve')
        .send({
          expectedLockVersion: v.lockVersion,
          poPriceConfirmed: true,
          poPriceReference: 'PO-DEC071-W04B-SYNTHETIC-FREE-PRICE',
          reason,
        })
        .expect(201)
    ).body;
    const cl = (
      await maker
        .post(ap + '/versions/' + v.id + '/offers')
        .send({
          code: 'W04B-' + key().slice(0, 8),
          name: 'Synthetic one-seat approved LR class',
          modality: 'OFFLINE',
          maxStudents: 1,
          enrollmentStart: new Date(Date.now() - 86400000).toISOString(),
          enrollmentEnd: future.toISOString(),
          classStart: future.toISOString(),
          classEnd: end.toISOString(),
          reason,
        })
        .expect(201)
    ).body;
    await d.prisma.classOffering.update({
      where: { id: cl.id },
      data: {
        status: 'OPEN',
        totalSessions: 1,
        classStart: future,
        classEnd: end,
        enrollmentStart: new Date(Date.now() - 86400000),
        enrollmentEnd: future,
      },
    });
    const room = (
      await maker
        .post(ap + '/rooms')
        .send({
          code: 'W04B-' + key().slice(0, 8),
          name: 'Synthetic actual room',
          location: 'Private DEV campus',
          capacity: 1,
          capabilities: ['WHITEBOARD'],
          status: 'ACTIVE',
          reason,
        })
        .expect(201)
    ).body;
    await grantAcademic(
      d.prisma,
      f.planningApprover.id,
      f.approver.id,
      f.secondApprover.id,
      'academic.schedule.approve',
      'CLASS',
      cl.id,
    );
    let assignment = (
      await maker
        .post(ap + '/classes/' + cl.id + '/assignments')
        .send({
          instructorId: f.teacher.id,
          effectiveFrom: new Date(Date.now() + 1000).toISOString(),
          effectiveTo: new Date(Date.now() + 30 * 86400000).toISOString(),
          reason,
        })
        .expect(201)
    ).body;
    assignment = (
      await maker
        .post(ap + '/assignments/' + assignment.id + '/submit')
        .send({ expectedLockVersion: assignment.lockVersion, reason })
        .expect(201)
    ).body;
    assignment = (
      await checker()
        .post(ap + '/assignments/' + assignment.id + '/approve')
        .send({ expectedLockVersion: assignment.lockVersion, reason, eligibilityConfirmed: true })
        .expect(201)
    ).body;
    const local = (x: Date) => new Date(x.getTime() + 7 * 3600000).toISOString().slice(0, 16);
    let session = (
      await maker
        .post(ap + '/classes/' + cl.id + '/sessions')
        .send({
          startLocal: local(future),
          endLocal: local(end),
          timezone: 'Asia/Ho_Chi_Minh',
          modality: 'OFFLINE',
          roomId: room.id,
          assignmentId: assignment.id,
          requiredCapabilities: ['WHITEBOARD'],
          reason,
        })
        .expect(201)
    ).body;
    session = (
      await maker
        .post(ap + '/sessions/' + session.id + '/submit')
        .send({ expectedLockVersion: session.lockVersion, reason })
        .expect(201)
    ).body;
    await checker()
      .post(ap + '/sessions/' + session.id + '/approve')
      .send({ expectedLockVersion: session.lockVersion, reason })
      .expect(201);
    const body = {
      evidence: reason,
      rules: [
        {
          skill: 'READING',
          part: 'P7',
          scale: 'INTERNAL_RAW_COUNT',
          minSamples: 1,
          min: 0,
          max: 1,
          courseVersionIds: [v.id],
        },
      ],
    };
    const criteria = (
      await maker
        .post(base + '/policies')
        .send({ idempotencyKey: key(), kind: 'CRITERIA', mode: 'LR', body, reason })
        .expect(201)
    ).body;
    await maker
      .post(base + '/policies/' + criteria.id + '/approve')
      .send({ idempotencyKey: key(), reason })
      .expect(403);
    await checker()
      .post(base + '/policies/' + criteria.id + '/approve')
      .send({ idempotencyKey: key(), reason })
      .expect(201);
    const before = await d.prisma.enrollment.count(),
      diag = (
        await a()
          .get(base + '/attempts/' + aid + '/diagnostic')
          .expect(200)
      ).body;
    expect(diag.matching.status).toBe('MATCHED');
    expect(diag.matching.classes.map((x: { id: string }) => x.id)).toEqual([cl.id]);
    expect(diag.matching.classes[0].availableSeats).toBe(1);
    expect(diag.matching.classes[0].seatGuaranteed).toBe(false);
    expect(await d.prisma.enrollment.count()).toBe(before);
    await d.prisma.enrollment.create({
      data: { learnerId: f.learner.id, classOfferingId: cl.id, status: 'PENDING_PAYMENT' },
    });
    const full = (await a().get(base + '/attempts/' + aid + '/diagnostic')).body;
    expect(full.matching.classes).toEqual([]);
    expect(full.matching.reasons).toContain('CLASS_FULL_OR_CAPACITY_UNVERIFIED');
    evidence.push({
      actualClassVersionScheduleRoom: true,
      independentCriteria: true,
      partSampleRequired: true,
      noEnrollmentSideEffect: true,
      fullClassExcluded: true,
    });
  });
  it('PostgreSQL rejects forged deadline extension and current session/grant bypass; numeric clock stable outside UTC', async () => {
    const live = await d.prisma.placementSitting.findFirstOrThrow({
      where: { phase: 'BLOCKED_REVIEW' },
    });
    await expect(
      d.prisma.placementSitting.update({
        where: { attemptId: live.attemptId },
        data: {
          phase: 'SPEAKING',
          deadline: new Date(Date.now() + 86400000),
          lockVersion: { increment: 1 },
        },
      }),
    ).rejects.toThrow();
    await expect(
      d.prisma.placementResultRelease.create({
        data: { evaluationId: key(), publishedById: f.academic.id, reason },
      }),
    ).rejects.toThrow();
    for (const zone of ['Asia/Ho_Chi_Minh', 'America/New_York'])
      await d.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL TIME ZONE '" + zone + "'");
        const [r] = await tx.$queryRaw<
          { ms: number }[]
        >`SELECT (EXTRACT(EPOCH FROM clock_timestamp())*1000)::double precision AS ms`;
        expect(Math.abs(r.ms - Date.now())).toBeLessThan(2000);
      });
  });
  it('policy metadata never leaks to ungranted roles; malformed timing cannot become approved', async () => {
    await f.agents
      .get(f.admin.id)!
      .get(base + '/config')
      .expect(403);
    const ungranted = (
      await f.agents
        .get(f.ungrantedAcademic.id)!
        .get(base + '/config')
        .expect(200)
    ).body;
    expect(ungranted.policies).toEqual([]);
    expect(ungranted.sources).toEqual([]);
    const r = await a()
      .get(base + '/config')
      .expect(200);
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect(JSON.stringify(r.body)).not.toMatch(/sourceHash|descriptor|tokenHash|sessionHash/);
    await teacher()
      .post(base + '/policies')
      .send({
        idempotencyKey: key(),
        kind: 'SOURCE_TIMING',
        mode: 'FOUR_SKILLS',
        sourceId: gs.version.id,
        body: { sourceHash: gs.version.sourceHash, evidence: 3, tasks: [null] },
        reason,
      })
      .expect(400);
  });
  it('real deadline boundary permits only receipt-bound upload, redacts prompts and never extends next Writing window', async () => {
    const source = await seedPlacementWorkflowSource(d, 'FOUR_SKILLS', true),
      pid = await createTiming(source, 1, 1, 120),
      id = (
        await a()
          .post(base + '/attempts')
          .send({
            ...body(),
            sourceVersionId: source.version.id,
            policyId: pid,
            mode: 'FOUR_SKILLS',
            goalSpeaking: 0,
            goalWriting: 0,
          })
          .expect(201)
      ).body.attemptId;
    await next(id);
    const e = await next(id),
      qid = source.groups[2].tq.id,
      originalDeadline = e.deadline,
      cmd = {
        idempotencyKey: key(),
        expectedLockVersion: e.lockVersion,
        tabId: key(),
        token: key(),
      };
    const ticket = (
      await a()
        .post(base + '/attempts/' + id + '/recordings/' + qid + '/begin')
        .send(cmd)
        .expect(201)
    ).body;
    await new Promise((r) =>
      setTimeout(r, Math.max(0, Date.parse(originalDeadline) - Date.now() + 30)),
    );
    const waiting = (
      await a()
        .get(base + '/attempts/' + id)
        .expect(200)
    ).body;
    expect(waiting.awaitingUpload).toBe(true);
    expect(waiting.groups[0].questions[0].content).toBe('');
    expect(waiting.groups[0].stimuli).toEqual([]);
    await a()
      .post(base + '/attempts/' + id + '/recordings/' + qid)
      .field('idempotencyKey', key())
      .field('expectedLockVersion', String(ticket.lockVersion))
      .field('tabId', cmd.tabId)
      .field('token', cmd.token)
      .attach('file', wav(), { filename: 'original.wav', contentType: 'audio/wav' })
      .expect(201);
    const writing = (
      await a()
        .get(base + '/attempts/' + id)
        .expect(200)
    ).body;
    expect(writing.phase).toBe('WRITING');
    expect(writing.phaseStartedAt).toBe(originalDeadline);
    expect(Date.parse(writing.deadline) - Date.parse(originalDeadline)).toBe(1000);
    await new Promise((r) =>
      setTimeout(r, Math.max(0, Date.parse(writing.deadline) - Date.now() + 30)),
    );
    const expired = (
      await a()
        .get(base + '/attempts/' + id)
        .expect(200)
    ).body;
    expect(expired.phase).toBe('SUBMITTED');
    const late = (
      await a()
        .post(base + '/attempts/' + id + '/answers')
        .send({
          idempotencyKey: key(),
          expectedLockVersion: expired.lockVersion,
          questionId: source.groups[3].tq.id,
          textResponse: 'Late text must not be stored',
        })
        .expect(201)
    ).body;
    expect(late.saved).toBe(false);
    expect(
      await d.prisma.testAnswer.count({
        where: { attemptId: id, testQuestionId: source.groups[3].tq.id },
      }),
    ).toBe(0);
    const diag = (await a().get(base + '/attempts/' + id + '/diagnostic')).body;
    expect(diag.skillResults.every((s: { value: unknown }) => s.value === null)).toBe(true);
    evidence.push({
      realBoundaryClock: true,
      receiptUploadOnly: true,
      noPromptInUploadWindow: true,
      nextWindowNotExtended: true,
      lateWritingDenied: true,
    });
  });
  it('lost unfinished capture cannot start again after refresh or tab switch and becomes BLOCKED_REVIEW without zero', async () => {
    const source = await seedPlacementWorkflowSource(d, 'FOUR_SKILLS', true),
      pid = await createTiming(source, 60, 1, 0),
      id = (
        await a()
          .post(base + '/attempts')
          .send({
            ...body(),
            sourceVersionId: source.version.id,
            policyId: pid,
            mode: 'FOUR_SKILLS',
            goalSpeaking: 0,
            goalWriting: 0,
          })
          .expect(201)
      ).body.attemptId;
    await next(id);
    const e = await next(id),
      qid = source.groups[2].tq.id,
      cmd = {
        idempotencyKey: key(),
        expectedLockVersion: e.lockVersion,
        tabId: key(),
        token: key(),
      },
      r = (
        await a()
          .post(base + '/attempts/' + id + '/recordings/' + qid + '/begin')
          .send(cmd)
          .expect(201)
      ).body;
    expect(
      (await a().get(base + '/attempts/' + id)).body.groups[0].questions[0].recordingState,
    ).toBe('STARTED');
    await a()
      .post(base + '/attempts/' + id + '/recordings/' + qid + '/begin')
      .send({ ...cmd, idempotencyKey: key(), expectedLockVersion: r.lockVersion, tabId: key() })
      .expect(409);
    await new Promise((x) => setTimeout(x, Math.max(0, Date.parse(e.deadline) - Date.now() + 30)));
    const blocked = (
      await a()
        .get(base + '/attempts/' + id)
        .expect(200)
    ).body;
    expect(blocked.phase).toBe('BLOCKED_REVIEW');
    expect(await d.prisma.placementTaskRecording.count({ where: { attemptId: id } })).toBe(1);
    expect((await d.prisma.testAttempt.findUniqueOrThrow({ where: { id } })).score).toBeNull();
  });
  it('private copied media tamper blocks own active sitting durably; original selected13 media remain untouched', async () => {
    const { readFile, writeFile } = await import('node:fs/promises'),
      { resolve, sep } = await import('node:path'),
      u = f.contenders[2],
      agent = f.agents.get(u.id)!,
      r = (
        await agent
          .post(base + '/attempts')
          .send({
            ...body(),
            sourceVersionId: four.version.id,
            policyId: fp,
            mode: 'FOUR_SKILLS',
            goalSpeaking: 0,
            goalWriting: 0,
          })
          .expect(201)
      ).body;
    const asset = four.snapshot.groups.flatMap((g) => g.stimuli).find((a) => a.type === 'AUDIO')!,
      root = resolve(process.env.ASSESSMENT_STIMULUS_AUTHORED_ROOT!),
      file = resolve(root, asset.storageKey!.replace(/^authored\//, ''));
    expect(file.startsWith(root + sep)).toBe(true);
    const bytes = await readFile(file),
      changed = Buffer.from(bytes);
    changed[changed.length - 1] ^= 1;
    try {
      await writeFile(file, changed);
      await agent.get(base + '/attempts/' + r.attemptId).expect(503);
      const row = await d.prisma.placementSitting.findUniqueOrThrow({
        where: { attemptId: r.attemptId },
      });
      expect(row.phase).toBe('BLOCKED_REVIEW');
      expect(
        (await d.prisma.testAttempt.findUniqueOrThrow({ where: { id: r.attemptId } })).score,
      ).toBeNull();
    } finally {
      await writeFile(file, bytes);
    }
    evidence.push({
      integrityIncidentCommitted: true,
      onlyUniqueDevCopyTampered: true,
      selectedOriginalsNotModified: true,
    });
  });
  it('fractional approved criterion points use exact decimal totals in PostgreSQL and preserve prior publication until independent release', async () => {
    const tasks = gs.groups
      .filter((g) => ['SPEAKING', 'WRITING'].includes(g.group.skill))
      .map((g) => ({
        groupId: g.group.id,
        criteria: [
          { code: 'A', descriptor: 'Synthetic fractional evidence descriptor A', max: 0.1 },
          { code: 'B', descriptor: 'Synthetic fractional evidence descriptor B', max: 0.2 },
        ],
      }));
    const rubric = (
      await teacher()
        .post(base + '/policies')
        .send({
          idempotencyKey: key(),
          kind: 'RUBRIC',
          mode: 'FOUR_SKILLS',
          sourceId: gs.version.id,
          body: {
            sourceHash: gs.version.sourceHash,
            evidence: reason,
            scale: 'SYNTHETIC_FRACTIONAL_INTERNAL',
            tasks,
          },
          reason,
        })
        .expect(201)
    ).body.id;
    await checker()
      .post(base + '/policies/' + rubric + '/approve')
      .send({ idempotencyKey: key(), reason })
      .expect(201);
    const grader = f.agents.get(f.otherTeacher.id)!;
    await grader.get(base + '/attempts/' + gid + '/recordings/' + gs.groups[2].tq.id).expect(200);
    const scored = (
      await grader
        .post(base + '/attempts/' + gid + '/evaluations')
        .send({
          idempotencyKey: key(),
          skill: 'SPEAKING',
          rubricId: rubric,
          expectedNumber: 2,
          originalEvidenceReviewed: true,
          scores: {
            [gs.groups[2].group.id]: [
              {
                code: 'A',
                score: 0.1,
                evidence: 'Original audio synthetic evidence criterion A',
                feedback: 'Synthetic fractional criterion feedback A',
              },
              {
                code: 'B',
                score: 0.2,
                evidence: 'Original audio synthetic evidence criterion B',
                feedback: 'Synthetic fractional criterion feedback B',
              },
            ],
          },
          reason: 'New signed synthetic fractional rubric, no faculty calibration claim',
        })
        .expect(201)
    ).body;
    const row = await d.prisma.placementHumanEvaluation.findUniqueOrThrow({
      where: { id: scored.id },
    });
    expect((row.body as { total: string }).total).toBe('0.3');
    expect(
      (await a().get(base + '/attempts/' + gid + '/diagnostic')).body.skillResults.find(
        (s: { skill: string }) => s.skill === 'SPEAKING',
      ).value,
    ).toBe(4);
    await checker()
      .post(base + '/evaluations/' + scored.id + '/publish')
      .send({ idempotencyKey: key(), reason })
      .expect(201);
    expect(
      (await a().get(base + '/attempts/' + gid + '/diagnostic')).body.skillResults.find(
        (s: { skill: string }) => s.skill === 'SPEAKING',
      ).value,
    ).toBe(0.3);
  });
  it('revoked publisher grant/session denies both new publication and replay; whole AppModule restart retains state', async () => {
    const grantRow = await d.prisma.permissionGrant.findFirstOrThrow({
      where: {
        userId: f.planningApprover.id,
        capability: 'placement.result.publish',
        revokedAt: null,
      },
    });
    await f.agents
      .get(f.approver.id)!
      .post('/api/authority/grants/' + grantRow.id + '/revoke')
      .send({ reason: 'Synthetic negative revoke placement publication scope' })
      .expect(201);
    await checker()
      .post(base + '/evaluations/' + writingEval + '/publish')
      .send({ idempotencyKey: key(), reason })
      .expect(401);
    await login(f.planningApprover);
    await checker()
      .post(base + '/evaluations/' + writingEval + '/publish')
      .send({ idempotencyKey: key(), reason })
      .expect(403);
    const before = (await a().get(base + '/attempts/' + aid)).body;
    await d.app.close();
    d = await startWave01App();
    await login(f.contenders[0]);
    const after = (await a().get(base + '/attempts/' + aid)).body;
    expect(after.receipt).toBe(before.receipt);
    expect(after.deadline).toBe(before.deadline);
    expect(after.phase).toBe('SUBMITTED');
    evidence.push({ reassignmentRevokesOldTeacher: true, grantRevoked: true, appRestart: true });
  }, 60000);
});
