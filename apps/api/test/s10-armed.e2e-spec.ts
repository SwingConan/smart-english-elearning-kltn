import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { startS10DevApp, seedS10DevTask } from './s10-postgres.fixture';
import { s10NewAttemptProtocol } from '../src/modules/placement/s10-protocol';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import type { DurableCommand } from '../src/modules/placement/s10-durable.service';
const suite = process.env.S10_ARMED_ENABLED === 'DEV_DEC045' ? describe : describe.skip;
suite('DEC045 real isolated PostgreSQL28, deterministic clock (not HTTP arrival)', () => {
  let d: Awaited<ReturnType<typeof startS10DevApp>>, now: number, original: Buffer;
  const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
  beforeAll(async () => {
    d = await startS10DevApp();
    original = await readFile(process.env.S10_VALID_ORIGINAL!);
    Object.assign(d.service, { clock: async () => new Date(now) });
  }, 30000);
  afterAll(async () => {
    await d?.app.close();
  });
  async function task() {
    const pinned = new Proxy(d.prisma, {
      get(target, key) {
        if (key === 'testAttempt')
          return {
            create: async (args: { data: Record<string, unknown> }) =>
              target.$transaction(async (tx) =>
                tx.testAttempt.create({
                  data: {
                    ...args.data,
                    s10ProtocolVersion: await s10NewAttemptProtocol(tx),
                  } as never,
                }),
              ),
          };
        return Reflect.get(target, key);
      },
    }) as PrismaService;
    const f = await seedS10DevTask(pinned);
    now = Math.trunc(
      Number(
        (
          await d.prisma.$queryRaw<
            Array<{ ms: number }>
          >`SELECT extract(epoch FROM clock_timestamp())*1000 AS ms`
        )[0].ms,
      ),
    );
    let state = await d.service.state(f.actor, f.attempt.id, f.question.id);
    const tabId = randomUUID(),
      token = randomUUID();
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
    const send = async (c: DurableCommand) =>
      (state = await d.service.command(f.actor, f.attempt.id, f.question.id, c));
    await send(command('CLAIM'));
    for (let i = 0; i < 2; i++) {
      const nonce = randomUUID();
      await send(command('START_PLAY', { nonce }));
      await d.service.readMedia(
        f.actor,
        f.attempt.id,
        f.question.id,
        command('START_PLAY', { nonce }),
      );
      now += 110;
      await send(command('COMPLETE_PLAY', { nonce }));
    }
    expect(state.protocolVersion).toBe(2);
    expect(state.deadline).toBeNull();
    const prepare = command('PREPARE');
    state = await send(prepare);
    const nonce = state.capture!.nonce!;
    return {
      f,
      command,
      send,
      prepare,
      nonce,
      get state() {
        return state;
      },
      async start(offset = 0) {
        now = state.capture!.armedAt + offset;
        const c = command('STARTED', { nonce });
        state = await send(c);
        return c;
      },
      async stop(offset = 0, bytes = original) {
        now = state.deadline! + offset;
        const c = command('STOPPED', { nonce, digest: hash(bytes) });
        state = await send(c);
        return c;
      },
      async upload(bytes = original, c?: DurableCommand) {
        return d.service.upload(
          f.actor,
          f.attempt.id,
          f.question.id,
          c ?? command('UPLOAD', { nonce, digest: hash(bytes) }),
          { buffer: bytes, size: bytes.length, mimetype: 'audio/webm' },
        );
      },
    };
  }
  it.each([2999, 3000])(
    'ARM accepts≤3000ms at %d; duplicate PREPARE/STARTED cannot move t0',
    async (offset) => {
      const t = await task(),
        grant = t.state.capture!;
      expect((await t.send(t.prepare)).capture!.nonce).toBe(t.nonce);
      const c = await t.start(offset),
        deadline = t.state.deadline;
      now += 1;
      await t.send(c);
      expect(t.state.deadline).toBe(deadline);
      expect(t.state.capture!.startedAt).toBe(deadline! - 30000);
      expect(t.state.capture!.armedAt).toBe(grant.armedAt);
    },
  );
  it('ARM at3001ms blocks without new nonce/clock', async () => {
    const t = await task();
    await expect(t.start(3001)).rejects.toMatchObject({ status: 409 });
    expect(
      (await d.prisma.examTaskProgress.findFirstOrThrow({ where: { attemptId: t.f.attempt.id } }))
        .phase,
    ).toBe('BLOCKED_REVIEW');
  });
  it.each([0, 1, 1999, 2000])('STOPPED accepts server boundary D+%d', async (offset) => {
    const t = await task();
    await t.start();
    await t.stop(offset);
    expect(t.state.capture!.stoppedAt).toBe(t.state.deadline! + offset);
  });
  it('STOPPED at D−1 denied, atD+2001 blocks with no answer', async () => {
    const t = await task();
    await t.start();
    await expect(t.stop(-1)).rejects.toMatchObject({ status: 409 });
    await expect(t.stop(2001)).rejects.toMatchObject({ status: 409 });
    expect(await d.prisma.testAnswer.count({ where: { attemptId: t.f.attempt.id } })).toBe(0);
  });
  it('current holder wrong nonce blocks; legacy BEGIN_RECORDING never bypasses grant', async () => {
    const t = await task();
    await expect(t.send(t.command('BEGIN_RECORDING'))).rejects.toMatchObject({ status: 409 });
    await expect(t.send(t.command('STARTED', { nonce: 'a'.repeat(64) }))).rejects.toMatchObject({
      status: 409,
    });
    expect(
      (await d.prisma.examTaskProgress.findFirstOrThrow({ where: { attemptId: t.f.attempt.id } }))
        .phase,
    ).toBe('BLOCKED_REVIEW');
  });
  it('competing tab, stale epoch, foreign learner and revoked session cannot obtain a second capture', async () => {
    const t = await task();
    await expect(t.send(t.command('PREPARE', { tabId: randomUUID() }))).rejects.toMatchObject({
      status: 423,
    });
    await expect(
      t.send(t.command('STARTED', { nonce: t.nonce, epoch: randomUUID() })),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      d.service.state({ ...t.f.actor, id: t.f.other.id }, t.f.attempt.id, t.f.question.id),
    ).rejects.toMatchObject({ status: 401 });
    await d.prisma.userSession.delete({ where: { sid: t.f.actor.sessionId } });
    await expect(t.start()).rejects.toMatchObject({ status: 401 });
    await d.service.cleanup();
    expect(
      (await d.prisma.examTaskProgress.findFirstOrThrow({ where: { attemptId: t.f.attempt.id } }))
        .phase,
    ).toBe('BLOCKED_REVIEW');
  });
  it('same exact original/key concurrent upload commits one protected validation/answer/receipt', async () => {
    const t = await task();
    await t.start();
    await t.stop();
    const c = t.command('UPLOAD', { nonce: t.nonce, digest: hash(original) });
    const result = await Promise.allSettled([t.upload(original, c), t.upload(original, c)]);
    expect(result.every((x) => x.status === 'fulfilled')).toBe(true);
    const p = await d.prisma.examTaskProgress.findFirstOrThrow({
      where: { attemptId: t.f.attempt.id },
    });
    expect(p.phase).toBe('SAVED');
    expect(await d.prisma.examTaskUpload.count({ where: { progressId: p.id } })).toBe(1);
    const a = await d.prisma.testAnswer.findUniqueOrThrow({ where: { id: p.savedAnswerId! } });
    expect(a.pointsAwarded).toBeNull();
    expect(a.isCorrect).toBeNull();
    await expect(
      d.prisma.testAnswer.update({ where: { id: a.id }, data: { pointsAwarded: 0 } }),
    ).rejects.toThrow();
    await expect(
      d.prisma.testAttempt.update({
        where: { id: t.f.attempt.id },
        data: { s10ProtocolVersion: 1 },
      }),
    ).rejects.toThrow();
    const v = await d.prisma.examTaskAudioValidation.findUniqueOrThrow({
      where: { progressId: p.id },
    });
    expect(v.status).toBe('VALID');
    expect(v.sampleCount).toBeGreaterThanOrEqual(v.sampleRate! * 30);
    expect(v.sampleCount).toBeLessThanOrEqual(v.sampleRate! * 35);
    await expect(
      d.prisma.examTaskAudioValidation.update({
        where: { progressId: p.id },
        data: { sampleCount: 0 },
      }),
    ).rejects.toThrow();
    await expect(
      d.prisma.examTaskCapture.update({
        where: { progressId: p.id },
        data: { startedAt: new Date(now + 1) },
      }),
    ).rejects.toThrow();
  }, 30000);
  it('short genuine native original rejects, preserves its bytes, no provisional0', async () => {
    const bytes = await readFile(process.env.S10_SHORT_ORIGINAL!),
      t = await task();
    await t.start();
    await t.stop(0, bytes);
    await expect(t.upload(bytes)).rejects.toMatchObject({ status: 409 });
    const p = await d.prisma.examTaskProgress.findFirstOrThrow({
      where: { attemptId: t.f.attempt.id },
    });
    expect(p.phase).toBe('BLOCKED_REVIEW');
    expect(await d.prisma.testAnswer.count({ where: { attemptId: t.f.attempt.id } })).toBe(0);
    const v = await d.prisma.examTaskAudioValidation.findUniqueOrThrow({
      where: { progressId: p.id },
    });
    expect(v.status).toBe('REJECTED');
    expect(v.digest).toBe(hash(bytes));
  });
  it('a genuine unmodified over35s native negative clip is rejected and preserved', async () => {
    const bytes = await readFile(process.env.S10_LONG_ORIGINAL!),
      t = await task();
    await t.start();
    await t.stop(0, bytes);
    await expect(t.upload(bytes)).rejects.toMatchObject({ status: 409 });
    const p = await d.prisma.examTaskProgress.findFirstOrThrow({
      where: { attemptId: t.f.attempt.id },
    });
    expect(p.phase).toBe('BLOCKED_REVIEW');
    const v = await d.prisma.examTaskAudioValidation.findUniqueOrThrow({
      where: { progressId: p.id },
    });
    expect(v.status).toBe('REJECTED');
    expect(v.digest).toBe(hash(bytes));
    expect(v.sampleCount).toBeGreaterThan(v.sampleRate! * 35);
    expect(await d.prisma.testAnswer.count({ where: { attemptId: t.f.attempt.id } })).toBe(0);
  });
  it.each([Buffer.alloc(0), Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4])])(
    'empty/corrupt originals fail closed',
    async (bytes) => {
      const t = await task();
      await t.start();
      await t.stop(0, bytes);
      await expect(t.upload(bytes)).rejects.toHaveProperty('status');
      expect(
        (await d.prisma.examTaskProgress.findFirstOrThrow({ where: { attemptId: t.f.attempt.id } }))
          .phase,
      ).toBe('BLOCKED_REVIEW');
      expect(await d.prisma.testAnswer.count({ where: { attemptId: t.f.attempt.id } })).toBe(0);
    },
  );
  it('capability off cannot downgrade an already pinned2 attempt', async () => {
    const t = await task();
    process.env.S10_ARMED_ENABLED = 'OFF';
    try {
      await expect(
        d.service.state(t.f.actor, t.f.attempt.id, t.f.question.id),
      ).rejects.toMatchObject({ status: 409 });
    } finally {
      process.env.S10_ARMED_ENABLED = 'DEV_DEC045';
    }
  });
  it('STOPPED preserves fixed upload-only allowance, then SAVED remains owner-readable with capability off', async () => {
    const t = await task();
    await t.start();
    await t.stop();
    const deadline = t.state.deadline!;
    now = deadline + 100000;
    await t.send(t.command('HEARTBEAT'));
    const p = await d.prisma.examTaskProgress.findFirstOrThrow({
      where: { attemptId: t.f.attempt.id },
    });
    expect(p.leaseExpiresAt!.getTime()).toBe(deadline + 120000);
    await t.upload();
    process.env.S10_ARMED_ENABLED = 'OFF';
    try {
      expect((await d.service.state(t.f.actor, t.f.attempt.id, t.f.question.id)).phase).toBe(
        'SAVED',
      );
    } finally {
      process.env.S10_ARMED_ENABLED = 'DEV_DEC045';
    }
  });
  it('upload-only allowance cannot admit a late upload or restart capture', async () => {
    const t = await task();
    await t.start();
    await t.stop();
    await expect(t.send(t.command('STARTED', { nonce: t.nonce }))).rejects.toHaveProperty('status');
    now = t.state.deadline! + 120001;
    await expect(t.upload()).rejects.toHaveProperty('status');
    expect(await d.prisma.testAnswer.count({ where: { attemptId: t.f.attempt.id } })).toBe(0);
  });
  it('protocol2 retains exactly one explicit scoped HVU reset, preserves old grant and rejects a second reset', async () => {
    const t = await task();
    await expect(t.start(3001)).rejects.toHaveProperty('status');
    const sid = randomUUID();
    await d.prisma
      .$executeRaw`INSERT INTO user_sessions(sid,sess,expire) VALUES (${sid},${JSON.stringify({ userId: t.f.coordinator.id })}::json,clock_timestamp()+interval '1 hour')`;
    const hvu = { id: t.f.coordinator.id, role: 'ACADEMIC_MANAGER', sessionId: sid };
    const request = {
      key: randomUUID(),
      epoch: t.state.epoch!,
      reason: 'Synthetic DEV grant expiry independently verified for scoped recovery',
    };
    await expect(
      d.service.reset({ ...hvu, id: t.f.ungranted.id }, t.f.attempt.id, t.f.question.id, request),
    ).rejects.toHaveProperty('status');
    const next = await d.service.reset(hvu, t.f.attempt.id, t.f.question.id, request);
    expect(next.resetCount).toBe(1);
    expect((await d.service.reset(hvu, t.f.attempt.id, t.f.question.id, request)).epoch).toBe(
      next.epoch,
    );
    expect(
      await d.prisma.examTaskCapture.count({ where: { progress: { attemptId: t.f.attempt.id } } }),
    ).toBe(1);
    await expect(
      d.service.reset(hvu, t.f.attempt.id, t.f.question.id, {
        ...request,
        key: randomUUID(),
        epoch: next.epoch!,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await d.prisma.examTaskProgress.count({ where: { attemptId: t.f.attempt.id } })).toBe(2);
    expect(await d.prisma.testAnswer.count({ where: { attemptId: t.f.attempt.id } })).toBe(0);
  });
});
