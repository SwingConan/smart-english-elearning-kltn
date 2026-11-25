import { ConfigService } from '@nestjs/config';
import { AuthorizationService } from '../src/modules/authorization/authorization.service';
import { createHash, randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import {
  S10DurableService,
  type DurableCommand,
} from '../src/modules/placement/s10-durable.service';
import { AssessmentStimulusMediaStorage } from '../src/modules/placement/assessment-stimulus-media.storage';
import { AssessmentResponseStorage } from '../src/modules/placement/assessment-response.storage';
import { seedS10DevTask, startS10DevApp } from './s10-postgres.fixture';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pg = process.env.BATCH04_PG_URL ? describe : describe.skip;
pg('Batch 04 — real isolated PostgreSQL/AppModule (synthetic data only)', () => {
  let dev: Awaited<ReturnType<typeof startS10DevApp>>;
  let task: Awaited<ReturnType<typeof seedS10DevTask>>;
  let state: Awaited<ReturnType<S10DurableService['state']>>;
  let tabId: string = randomUUID(),
    token: string = randomUUID();
  const command = (
    action: DurableCommand['action'],
    extra: Partial<DurableCommand> = {},
  ): DurableCommand => ({
    action,
    key: randomUUID(),
    epoch: state.epoch,
    revision: state.revision,
    tabId,
    token,
    ...extra,
  });
  const send = async (c: DurableCommand) => {
    state = await dev.service.command(task.actor, task.attempt.id, task.question.id, c);
    return state;
  };
  beforeAll(async () => {
    dev = await startS10DevApp();
    task = await seedS10DevTask(dev.prisma);
    state = await dev.service.state(task.actor, task.attempt.id, task.question.id);
  }, 30_000);
  afterAll(async () => {
    await dev?.app.close();
  });
  it('read-only state creates no ledger/answer and rejects foreign/stale sessions', async () => {
    expect(state.phase).toBe('NOT_STARTED');
    expect(await dev.prisma.examTaskProgress.count({ where: { attemptId: task.attempt.id } })).toBe(
      0,
    );
    await expect(
      dev.service.state(
        { ...task.actor, sessionId: randomUUID() },
        task.attempt.id,
        task.question.id,
      ),
    ).rejects.toMatchObject({ status: 401 });
    const sid = randomUUID();
    await dev.prisma.userSession.create({
      data: { sid, sess: { userId: task.other.id }, expire: new Date(Date.now() + 24 * 3600_000) },
    });
    await expect(
      dev.service.state(
        { id: task.other.id, role: 'STUDENT', sessionId: sid },
        task.attempt.id,
        task.question.id,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('concurrent tabs and independent Prisma connections obtain exactly one lease; tokens hashed', async () => {
    const second = new PrismaService(
      new ConfigService({ DATABASE_URL: process.env.BATCH04_PG_URL }),
    );
    const peer = new S10DurableService(
      second,
      dev.app.get(AssessmentStimulusMediaStorage),
      dev.app.get(AssessmentResponseStorage),
      dev.app.get(AuthorizationService),
    );
    const candidates = Array.from({ length: 12 }, () =>
      command('CLAIM', { tabId: randomUUID(), token: randomUUID() }),
    );
    const results = await Promise.allSettled(
      candidates.map((c, i) =>
        (i % 2 ? peer : dev.service).command(task.actor, task.attempt.id, task.question.id, c),
      ),
    );
    const winner = results.findIndex((r) => r.status === 'fulfilled');
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    tabId = candidates[winner].tabId;
    token = candidates[winner].token;
    state = await peer.state(task.actor, task.attempt.id, task.question.id);
    expect(state.phase).toBe('READY');
    const row = await second.examTaskProgress.findUniqueOrThrow({ where: { epoch: state.epoch! } });
    expect(row.leaseTokenHash).not.toBe(token);
    expect(JSON.stringify(row)).not.toContain(task.actor.sessionId);
    await second.$disconnect();
  }, 30_000);
  it('survives app restart/reconnect and rejects refresh claimant, stale revision and early completion', async () => {
    const epoch = state.epoch;
    await dev.app.close();
    dev = await startS10DevApp();
    state = await dev.service.state(task.actor, task.attempt.id, task.question.id);
    expect(state.epoch).toBe(epoch);
    await expect(
      send(command('CLAIM', { tabId: randomUUID(), token: randomUUID() })),
    ).rejects.toMatchObject({ status: 423 });
    await expect(
      send(command('START_PLAY', { revision: 0, nonce: randomUUID() })),
    ).rejects.toMatchObject({ status: 409 });
    const nonce = randomUUID(),
      start = command('START_PLAY', { nonce });
    await send(start);
    await send(start);
    expect(state.started).toBe(1);
    await expect(send(command('COMPLETE_PLAY', { nonce }))).rejects.toMatchObject({ status: 409 });
    await expect(
      dev.service.readMedia(
        task.actor,
        task.attempt.id,
        task.question.id,
        command('START_PLAY', { nonce }),
        'bytes=0-100',
      ),
    ).rejects.toMatchObject({ status: 416 });
    await dev.service.readMedia(
      task.actor,
      task.attempt.id,
      task.question.id,
      command('START_PLAY', { nonce }),
    );
    await expect(
      dev.service.readMedia(
        task.actor,
        task.attempt.id,
        task.question.id,
        command('START_PLAY', { nonce }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await send(command('AUTOPLAY_DENIED', { nonce }));
    await send(command('RESUME_PLAY', { nonce }));
    await wait(110);
    await send(command('COMPLETE_PLAY', { nonce }));
    expect(state.completed).toBe(1);
  }, 30_000);
  it('enforces two ordinals and one 30s server deadline; heartbeat cannot extend it', async () => {
    const nonce = randomUUID();
    await send(command('START_PLAY', { nonce }));
    await dev.service.readMedia(
      task.actor,
      task.attempt.id,
      task.question.id,
      command('START_PLAY', { nonce }),
    );
    await wait(110);
    await send(command('COMPLETE_PLAY', { nonce }));
    expect(state.started).toBe(2);
    expect(state.completed).toBe(2);
    expect(state.deadline! - state.serverNow).toBeGreaterThan(29_900);
    const deadline = state.deadline;
    await send(command('BEGIN_RECORDING'));
    await send(command('HEARTBEAT'));
    expect(state.deadline).toBe(deadline);
    await expect(send(command('START_PLAY', { nonce: randomUUID() }))).rejects.toMatchObject({
      status: 409,
    });
  });
  it('atomic save/audit/receipt; storage failure, concurrent same-byte retry and changed bytes', async () => {
    await wait(Math.max(0, state.deadline! - Date.now() + 30));
    const bytes = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4]);
    const digest = createHash('sha256').update(bytes).digest('hex');
    const c = command('UPLOAD', { digest });
    const storage = dev.app.get(AssessmentResponseStorage);
    const failed = jest
      .spyOn(storage, 'put')
      .mockRejectedValueOnce(new Error('injected storage unavailable'));
    await expect(
      dev.service.upload(task.actor, task.attempt.id, task.question.id, c, {
        buffer: bytes,
        mimetype: 'audio/webm',
        size: bytes.length,
      }),
    ).rejects.toMatchObject({ status: 503 });
    failed.mockRestore();
    expect(await dev.prisma.testAnswer.count({ where: { attemptId: task.attempt.id } })).toBe(0);
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        dev.service.upload(task.actor, task.attempt.id, task.question.id, c, {
          buffer: bytes,
          mimetype: 'audio/webm',
          size: bytes.length,
        }),
      ),
    );
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    state = await dev.service.state(task.actor, task.attempt.id, task.question.id);
    expect(state.phase).toBe('SAVED');
    expect(await dev.prisma.testAnswer.count({ where: { attemptId: task.attempt.id } })).toBe(1);
    const answer = await dev.prisma.testAnswer.findFirstOrThrow({
      where: { attemptId: task.attempt.id },
    });
    expect(answer.pointsAwarded).toBeNull();
    const changed = Buffer.from([...bytes, 5]),
      different = { ...c, digest: createHash('sha256').update(changed).digest('hex') };
    await expect(
      dev.service.upload(task.actor, task.attempt.id, task.question.id, different, {
        buffer: changed,
        mimetype: 'audio/webm',
        size: changed.length,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await dev.prisma.examTaskEvent.count({
        where: {
          progressId: (
            await dev.prisma.examTaskProgress.findUniqueOrThrow({ where: { epoch: state.epoch! } })
          ).id,
          action: 'SAVED',
        },
      }),
    ).toBe(1);
  }, 45_000);
  it('real HTTP auth, legacy bypass denial, explicit HVU permission, one parallel reset and old epoch revoked', async () => {
    const task2 = await seedS10DevTask(dev.prisma),
      a = task2.attempt.id,
      q = task2.question.id,
      base = `/api/placement/attempts/${a}/tasks/${q}/s10`;
    const learner = request.agent(dev.app.getHttpServer()),
      teacher = request.agent(dev.app.getHttpServer()),
      hvu = request.agent(dev.app.getHttpServer()),
      ungranted = request.agent(dev.app.getHttpServer());
    for (const [agent, user] of [
      [learner, task2.owner],
      [teacher, task2.teacher],
      [hvu, task2.coordinator],
      [ungranted, task2.ungranted],
    ] as const)
      await agent
        .post('/api/auth/login')
        .send({ email: user.email, password: task2.password })
        .expect(200);
    await request(dev.app.getHttpServer()).get(base).expect(401);
    let s = (await learner.get(base).expect(200)).body;
    const c = {
      action: 'CLAIM',
      key: randomUUID(),
      epoch: null,
      revision: 0,
      tabId: randomUUID(),
      token: randomUUID(),
    };
    s = (
      await learner
        .post(base + '/commands')
        .send(c)
        .expect(201)
    ).body;
    const epoch = s.epoch;
    await learner
      .post(base + '/commands')
      .send({ ...c, action: 'INTERRUPT', epoch, revision: s.revision, key: randomUUID() })
      .expect(201);
    await learner
      .get(`/api/placement/attempts/${a}/stimuli/${task2.stimulus.id}/media`)
      .expect(409);
    await learner
      .post(`/api/placement/attempts/${a}/answers/${q}/audio`)
      .attach('file', Buffer.from([1]), { filename: 'x.webm', contentType: 'audio/webm' })
      .expect(409);
    const reset = {
      epoch,
      key: randomUUID(),
      reason: 'Synthetic DEV microphone failure independently confirmed',
    };
    await learner
      .post(base + '/recovery')
      .send(reset)
      .expect(403);
    await teacher
      .post(base + '/recovery')
      .send(reset)
      .expect(403);
    await teacher
      .post(base + '/incidents')
      .send({ reason: 'Synthetic incident for academic review' })
      .expect(201);
    await ungranted
      .post(base + '/recovery')
      .send(reset)
      .expect(403);
    await hvu
      .post(base + '/recovery')
      .send({ ...reset, reason: '' })
      .expect(400);
    const raced = await Promise.all([
      hvu.post(base + '/recovery').send(reset),
      hvu.post(base + '/recovery').send({ ...reset, key: randomUUID() }),
    ]);
    expect(raced.map((r) => r.status).sort()).toEqual([201, 409]);
    const next = (await learner.get(base).expect(200)).body;
    expect(next.epoch).not.toBe(epoch);
    expect(next.resetCount).toBe(1);
    await learner
      .post(base + '/commands')
      .send({
        ...c,
        action: 'START_PLAY',
        epoch,
        revision: s.revision,
        key: randomUUID(),
        nonce: randomUUID(),
      })
      .expect(409);
    await hvu
      .post(base + '/recovery')
      .send({ ...reset, key: randomUUID(), epoch: next.epoch })
      .expect(409);
    await learner.post('/api/auth/logout').expect(204);
    await learner.get(base).expect(401);
  }, 30_000);
  it('context rejects forged role, changed content and a submission racing after blob write', async () => {
    const t = await seedS10DevTask(dev.prisma),
      a = t.attempt.id,
      q = t.question.id,
      token = randomUUID(),
      tabId = randomUUID();
    await expect(
      dev.service.state({ ...t.actor, role: 'ADMIN_COORDINATOR' }, a, q),
    ).rejects.toMatchObject({ status: 401 });
    const claimed = await dev.service.command(t.actor, a, q, {
      action: 'CLAIM',
      key: randomUUID(),
      epoch: null,
      revision: 0,
      tabId,
      token,
    });
    const row = await dev.prisma.examTaskProgress.findUniqueOrThrow({
      where: { epoch: claimed.epoch! },
    });
    await dev.prisma.examTaskProgress.update({
      where: { id: row.id },
      data: {
        started: 2,
        completed: 2,
        phase: 'RECORDING',
        responseDeadline: new Date(Date.now() - 100),
      },
    });
    const bytes = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 3, 4]),
      c: DurableCommand = {
        action: 'UPLOAD',
        key: randomUUID(),
        epoch: row.epoch,
        revision: row.revision,
        tabId,
        token,
        digest: createHash('sha256').update(bytes).digest('hex'),
      };
    const storage = dev.app.get(AssessmentResponseStorage),
      original = storage.put.bind(storage);
    const spy = jest.spyOn(storage, 'put').mockImplementationOnce(async (...args) => {
      const stored = await original(...args);
      await dev.prisma.testAttempt.update({
        where: { id: a },
        data: { status: 'SUBMITTED', submittedAt: new Date() },
      });
      return stored;
    });
    await expect(
      dev.service.upload(t.actor, a, q, c, {
        buffer: bytes,
        mimetype: 'audio/webm',
        size: bytes.length,
      }),
    ).rejects.toMatchObject({ status: 409 });
    spy.mockRestore();
    expect(await dev.prisma.testAnswer.count({ where: { attemptId: a } })).toBe(0);
    const t2 = await seedS10DevTask(dev.prisma),
      c2 = { action: 'CLAIM' as const, key: randomUUID(), epoch: null, revision: 0, tabId, token };
    const s = await dev.service.command(t2.actor, t2.attempt.id, t2.question.id, c2);
    await dev.prisma.question.update({
      where: { id: t2.question.questionId },
      data: { content: 'Changed synthetic content snapshot' },
    });
    await expect(
      dev.service.command(t2.actor, t2.attempt.id, t2.question.id, {
        ...c2,
        action: 'START_PLAY',
        key: randomUUID(),
        epoch: s.epoch,
        revision: s.revision,
        nonce: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await dev.service.state(t2.actor, t2.attempt.id, t2.question.id)).phase).toBe(
      'BLOCKED_REVIEW',
    );
  });
  it('database check/immutability and append-only audit reject tampering', async () => {
    const row = await dev.prisma.examTaskProgress.findUniqueOrThrow({
      where: { epoch: state.epoch! },
    });
    await expect(
      dev.prisma.examTaskProgress.update({ where: { id: row.id }, data: { started: 3 } }),
    ).rejects.toThrow();
    await expect(
      dev.prisma.examTaskProgress.update({
        where: { id: row.id },
        data: { mediaSha256: '0'.repeat(64) },
      }),
    ).rejects.toThrow();
    await expect(
      dev.prisma.examTaskEvent.deleteMany({ where: { progressId: row.id } }),
    ).rejects.toThrow();
    await expect(dev.prisma.examTaskProgress.delete({ where: { id: row.id } })).rejects.toThrow();
  });
  it('expired lease needs review; reset keeps binding, permits one new claim, and cannot be self-approved', async () => {
    const t = await seedS10DevTask(dev.prisma),
      a = t.attempt.id,
      q = t.question.id;
    const c: DurableCommand = {
      action: 'CLAIM',
      key: randomUUID(),
      epoch: null,
      revision: 0,
      tabId: randomUUID(),
      token: randomUUID(),
    };
    const claimed = await dev.service.command(t.actor, a, q, c);
    const row = await dev.prisma.examTaskProgress.findUniqueOrThrow({
      where: { epoch: claimed.epoch! },
    });
    await dev.prisma.examTaskProgress.update({
      where: { id: row.id },
      data: { leaseExpiresAt: new Date(Date.now() - 1) },
    });
    expect((await dev.service.state(t.actor, a, q)).phase).toBe('BLOCKED_REVIEW');
    await expect(
      dev.service.command(t.actor, a, q, {
        ...c,
        action: 'START_PLAY',
        key: randomUUID(),
        epoch: row.epoch,
        revision: 1,
        nonce: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 409 });
    const sid = randomUUID();
    await dev.prisma
      .$executeRaw`INSERT INTO user_sessions(sid,sess,expire) VALUES (${sid},${JSON.stringify({ userId: t.coordinator.id })}::json,clock_timestamp()+interval '1 hour')`;
    const hvu = { id: t.coordinator.id, role: 'ACADEMIC_MANAGER', sessionId: sid };
    const reset = {
      key: randomUUID(),
      epoch: row.epoch,
      reason: 'Verified synthetic DEV interruption after lease expiry',
    };
    const next = await dev.service.reset(hvu, a, q, reset);
    expect(next.resetCount).toBe(1);
    expect((await dev.service.reset(hvu, a, q, reset)).epoch).toBe(next.epoch);
    const resumed = await dev.service.command(t.actor, a, q, {
      ...c,
      key: randomUUID(),
      epoch: next.epoch,
      revision: 0,
    });
    expect(resumed.phase).toBe('READY');
    const nextrow = await dev.prisma.examTaskProgress.findUniqueOrThrow({
      where: { epoch: next.epoch! },
    });
    expect(nextrow.mediaSha256).toBe(row.mediaSha256);
    expect(nextrow.contentVersion).toBe(row.contentVersion);
    await expect(
      dev.service.readMedia(t.actor, a, q, { ...c, epoch: row.epoch, nonce: randomUUID() }),
    ).rejects.toMatchObject({ status: 409 });
    await dev.prisma.examRecoveryPermission.update({
      where: { userId: hvu.id },
      data: { revokedAt: new Date() },
    });
    await expect(dev.service.review(hvu, a, q)).rejects.toMatchObject({ status: 403 });
    await dev.prisma.userSession.delete({ where: { sid: t.actor.sessionId } });
    await expect(
      dev.service.command(t.actor, a, q, {
        ...c,
        key: randomUUID(),
        epoch: next.epoch,
        revision: resumed.revision,
        action: 'HEARTBEAT',
      }),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('upload failure before atomic event commit leaves no answer; grace expiry and orphan cleanup are durable', async () => {
    const t = await seedS10DevTask(dev.prisma),
      a = t.attempt.id,
      q = t.question.id,
      token = randomUUID(),
      tabId = randomUUID();
    const claimed = await dev.service.command(t.actor, a, q, {
      action: 'CLAIM',
      key: randomUUID(),
      epoch: null,
      revision: 0,
      token,
      tabId,
    });
    const original = await dev.prisma.examTaskProgress.findUniqueOrThrow({
      where: { epoch: claimed.epoch! },
    });
    // Test-only checkpoint fixture; production deadline paths above use actual two-play timing.
    const t2 = await seedS10DevTask(dev.prisma),
      a2 = t2.attempt.id,
      q2 = t2.question.id;
    const binding = await dev.service.command(t2.actor, a2, q2, {
      action: 'CLAIM',
      key: randomUUID(),
      epoch: null,
      revision: 0,
      token,
      tabId,
    });
    const bound = await dev.prisma.examTaskProgress.findUniqueOrThrow({
      where: { epoch: binding.epoch! },
    });
    await dev.prisma.examTaskProgress.update({
      where: { id: bound.id },
      data: {
        started: 2,
        completed: 2,
        phase: 'RECORDING',
        responseDeadline: new Date(Date.now() - 100),
      },
    });
    const bytes = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 8, 9]),
      digest = createHash('sha256').update(bytes).digest('hex');
    const c: DurableCommand = {
      action: 'UPLOAD',
      key: randomUUID(),
      epoch: bound.epoch,
      revision: bound.revision,
      tabId,
      token,
      digest,
    };
    const audit = jest.spyOn(
      dev.service as unknown as { audit: (...args: unknown[]) => Promise<void> },
      'audit',
    );
    const originalAudit = audit.getMockImplementation()!;
    audit.mockImplementation(async (...args) => {
      if (args[3] === 'SAVED') throw new Error('Injected before commit');
      return originalAudit(...args);
    });
    await expect(
      dev.service.upload(t2.actor, a2, q2, c, {
        buffer: bytes,
        mimetype: 'audio/webm',
        size: bytes.length,
      }),
    ).rejects.toMatchObject({ status: 503 });
    audit.mockRestore();
    expect(await dev.prisma.testAnswer.count({ where: { attemptId: a2 } })).toBe(0);
    const job = await dev.prisma.examTaskUpload.findFirstOrThrow({
      where: { progressId: bound.id },
    });
    expect(job.status).toBe('STAGED');
    expect(
      (await dev.prisma.examTaskReceipt.findFirstOrThrow({ where: { progressId: bound.id } }))
        .outcome,
    ).not.toMatchObject({ phase: 'SAVED' });
    await dev.prisma.examTaskUpload.update({
      where: { id: job.id },
      data: { createdAt: new Date(Date.now() - 7200_000) },
    });
    await dev.service.cleanup();
    expect(
      (await dev.prisma.examTaskUpload.findUniqueOrThrow({ where: { id: job.id } })).status,
    ).toBe('DELETED');
    await expect(dev.app.get(AssessmentResponseStorage).read(job.storageKey)).rejects.toThrow();
    const event = await dev.prisma.examTaskEvent.findFirstOrThrow({
      where: { progressId: bound.id, action: 'STAGED_UPLOAD_EXPIRED' },
    });
    expect(event.actorKind).toBe('SYSTEM');
    expect(event.actorId).toBeNull();
    await dev.prisma.examTaskProgress.update({
      where: { id: original.id },
      data: {
        started: 2,
        completed: 2,
        phase: 'RECORDING',
        responseDeadline: new Date(Date.now() - 180_000),
        leaseExpiresAt: new Date(Date.now() + 60_000),
      },
    });
    // Even with a live lease, read state cannot present an expired upload grace as active.
    expect((await dev.service.state(t.actor, a, q)).phase).toBe('BLOCKED_REVIEW');
    await expect(
      dev.service.command(t.actor, a, q, {
        ...c,
        key: randomUUID(),
        epoch: original.epoch,
        revision: original.revision,
        action: 'HEARTBEAT',
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      dev.service.upload(
        t.actor,
        a,
        q,
        { ...c, key: randomUUID(), epoch: original.epoch, revision: original.revision },
        { buffer: bytes, mimetype: 'audio/webm', size: bytes.length },
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect((await dev.service.state(t.actor, a, q)).phase).toBe('BLOCKED_REVIEW');
  });
});
