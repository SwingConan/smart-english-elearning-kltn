import { s10ProtocolEnabled } from './s10-protocol';
import { S10OriginalAudioValidator } from './s10-original-audio';
import { privatePlacementPreviewEnabled } from './placement-preview.guard';
import { HttpException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { Prisma, type ExamTaskProgress } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AssessmentResponseStorage } from './assessment-response.storage';
import { AssessmentStimulusMediaStorage } from './assessment-stimulus-media.storage';
import { AuthorizationService } from '../authorization/authorization.service';

export type RecoveryActor = { id: string; role: string; sessionId: string };
export type DurableCommand = {
  action:
    | 'CLAIM'
    | 'START_PLAY'
    | 'COMPLETE_PLAY'
    | 'AUTOPLAY_DENIED'
    | 'RESUME_PLAY'
    | 'PREPARE'
    | 'STARTED'
    | 'STOPPED'
    | 'BEGIN_RECORDING'
    | 'HEARTBEAT'
    | 'INTERRUPT'
    | 'UPLOAD';
  key: string;
  epoch: string | null;
  revision: number;
  tabId: string;
  token: string;
  nonce?: string;
  digest?: string;
};
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
class Fault extends Error {
  constructor(
    readonly code: string,
    readonly status = 409,
  ) {
    super(code);
  }
}
function fail(code: string, status = 409): never {
  throw new Fault(code, status);
}
type Tx = Prisma.TransactionClient;
const terminal = ['SAVED', 'SUPERSEDED', 'BLOCKED_REVIEW'];

export function wavDurationMs(body: Buffer): number {
  if (
    body.length < 44 ||
    body.toString('ascii', 0, 4) !== 'RIFF' ||
    body.toString('ascii', 8, 12) !== 'WAVE'
  )
    return fail('WAV_INVALID', 503);
  let rate = 0,
    bytes = 0;
  for (let offset = 12; offset + 8 <= body.length;) {
    const size = body.readUInt32LE(offset + 4),
      end = offset + 8 + size;
    if (end > body.length) fail('WAV_INVALID', 503);
    const kind = body.toString('ascii', offset, offset + 4);
    if (kind === 'fmt ' && size >= 16) {
      if (body.readUInt16LE(offset + 8) !== 1) fail('WAV_PCM_REQUIRED', 503);
      rate = body.readUInt32LE(offset + 16);
    }
    if (kind === 'data') bytes += size;
    offset = end + (size % 2);
  }
  if (!rate || !bytes) fail('WAV_INVALID', 503);
  return Math.ceil((bytes * 1000) / rate);
}

export function validateDurableCommand(value: unknown): DurableCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('COMMAND_INVALID', 400);
  const c = value as DurableCommand;
  if (
    Object.keys(c).some(
      (k) =>
        !['action', 'key', 'epoch', 'revision', 'tabId', 'token', 'nonce', 'digest'].includes(k),
    ) ||
    ![
      'CLAIM',
      'START_PLAY',
      'COMPLETE_PLAY',
      'AUTOPLAY_DENIED',
      'RESUME_PLAY',
      'PREPARE',
      'STARTED',
      'STOPPED',
      'BEGIN_RECORDING',
      'HEARTBEAT',
      'INTERRUPT',
      'UPLOAD',
    ].includes(c.action) ||
    !uuid(c.key) ||
    !uuid(c.tabId) ||
    !uuid(c.token) ||
    (c.epoch !== null && !uuid(c.epoch)) ||
    !Number.isSafeInteger(c.revision) ||
    c.revision < 0 ||
    (c.nonce !== undefined && !uuid(c.nonce) && !/^[a-f0-9]{64}$/.test(c.nonce)) ||
    (c.digest !== undefined && !/^[a-f0-9]{64}$/.test(c.digest))
  )
    fail('COMMAND_INVALID', 400);
  return c;
}

@Injectable()
export class S10DurableService implements OnModuleInit, OnModuleDestroy {
  private readonly decoder = new S10OriginalAudioValidator();
  private readonly logger = new Logger(S10DurableService.name);
  private timer?: ReturnType<typeof setInterval>;
  // DEV defaults, explicitly configurable; these do not select a production SLA.
  private readonly leaseMs = this.setting('S10_LEASE_MS', 90_000, 30_000);
  private readonly graceMs = this.setting('S10_UPLOAD_GRACE_MS', 120_000, 1_000);
  private readonly stagedMs = this.setting('S10_STAGED_TTL_MS', 3_600_000, 300_000);
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: AssessmentStimulusMediaStorage,
    private readonly storage: AssessmentResponseStorage,
    private readonly authority: AuthorizationService,
  ) {}
  private setting(name: string, fallback: number, minimum: number) {
    const value = Number(process.env[name] ?? fallback);
    if (!Number.isSafeInteger(value) || value < minimum || value > 86_400_000)
      throw new Error(`Invalid ${name}`);
    return value;
  }
  onModuleInit() {
    this.timer = setInterval(() => {
      void this.cleanup().catch(() => this.logger.warn('S10_ORPHAN_CLEANUP_FAILED'));
    }, 60_000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private async clock(tx: Tx) {
    // Numeric epoch avoids driver/session timezone interpretation of raw timestamptz.
    const [row] = await tx.$queryRaw<
      Array<{ ms: number }>
    >`SELECT (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::double precision AS ms`;
    return new Date(row.ms);
  }
  private async requireV2(tx: Tx) {
    if (!(await s10ProtocolEnabled(tx))) fail('S10_PROTOCOL_DISABLED', 409);
    if (this.leaseMs !== 90000 || this.graceMs !== 120000)
      fail('S10_POLICY_CONFIGURATION_MISMATCH', 503);
    try {
      await this.decoder.ready();
    } catch {
      fail('S10_DECODER_UNAVAILABLE', 503);
    }
  }
  private async actorContext(tx: Tx, actor: RecoveryActor, c?: DurableCommand) {
    await tx.$queryRaw`SELECT set_config('app.s10_actor',${actor.id},true),set_config('app.s10_session',${actor.sessionId},true),set_config('app.s10_tab',${c?.tabId ?? ''},true),set_config('app.s10_token',${c?.token ?? ''},true)`;
  }
  private grantNonce(p: ExamTaskProgress, key: string) {
    const secret = process.env.S10_GRANT_SECRET;
    if (!secret || secret.length < 32) fail('S10_GRANT_UNAVAILABLE', 503);
    return createHmac('sha256', secret)
      .update(
        JSON.stringify([
          'DEC045',
          p.id,
          p.epoch,
          key,
          p.leaseSessionHash,
          p.leaseTabHash,
          p.leaseTokenHash,
          p.mediaSha256,
        ]),
      )
      .digest('hex');
  }
  private async enrich(tx: Tx, p: ExamTaskProgress | null, now: Date, grant = false) {
    const result = {
      ...this.view(p, now),
      capture: null as null | {
        phase: string;
        armedAt: number;
        armExpiresAt: number;
        startedAt: number | null;
        stoppedAt: number | null;
        stopDigest: string | null;
        nonce?: string;
      },
    };
    if (p?.protocolVersion !== 2) return result;
    const cap = await tx.examTaskCapture.findUnique({ where: { progressId: p.id } });
    if (!cap) return result;
    result.capture = {
      phase: cap.phase,
      armedAt: cap.armedAt.getTime(),
      armExpiresAt: cap.armExpiresAt.getTime(),
      startedAt: cap.startedAt?.getTime() ?? null,
      stoppedAt: cap.stoppedAt?.getTime() ?? null,
      stopDigest: cap.stopDigest,
    };
    if (
      (!cap.startedAt && now > cap.armExpiresAt) ||
      (cap.deadline && !cap.stoppedAt && now.getTime() > cap.deadline.getTime() + 2000)
    )
      result.phase = 'BLOCKED_REVIEW';
    if (grant && result.phase !== 'BLOCKED_REVIEW') {
      const nonce = this.grantNonce(p, cap.prepareKey);
      if (hash(nonce) !== cap.nonceHash) fail('S10_GRANT_UNAVAILABLE', 503);
      result.capture.nonce = nonce;
    }
    return result;
  }
  private async v2Timing(tx: Tx, p: ExamTaskProgress, now: Date) {
    const cap = await tx.examTaskCapture.findUnique({ where: { progressId: p.id } });
    if (
      (!cap?.startedAt && cap && now > cap.armExpiresAt) ||
      (cap?.deadline && !cap.stoppedAt && now.getTime() > cap.deadline.getTime() + 2000)
    ) {
      p.phase = 'BLOCKED_REVIEW';
      ++p.revision;
      if (cap.phase !== 'BLOCKED_REVIEW')
        await tx.examTaskCapture.update({
          where: { progressId: p.id },
          data: { phase: 'BLOCKED_REVIEW' },
        });
      fail(cap.startedAt ? 'STOPPED_TOO_LATE' : 'ARM_EXPIRED');
    }
  }
  private async captureCommand(tx: Tx, p: ExamTaskProgress, c: DurableCommand, now: Date) {
    const cap = await tx.examTaskCapture.findUnique({ where: { progressId: p.id } });
    if (c.action === 'PREPARE') {
      if (cap || p.phase !== 'RECORDING_READY' || p.started !== 2 || p.completed !== 2)
        fail('ARM_ALREADY_ISSUED_OR_NOT_READY');
      await tx.examTaskCapture.create({
        data: {
          progressId: p.id,
          prepareKey: c.key,
          nonceHash: hash(this.grantNonce(p, c.key)),
          armedAt: now,
          armExpiresAt: new Date(now.getTime() + 3000),
        },
      });
      return;
    }
    if (!cap || hash(c.nonce ?? '') !== cap.nonceHash) {
      if (cap && cap.phase !== 'BLOCKED_REVIEW')
        await tx.examTaskCapture.update({
          where: { progressId: p.id },
          data: { phase: 'BLOCKED_REVIEW' },
        });
      p.phase = 'BLOCKED_REVIEW';
      ++p.revision;
      fail('ARM_NONCE_INVALID');
    }
    if (c.action === 'STARTED') {
      if (cap.phase !== 'ARMED' || p.phase !== 'RECORDING_READY' || now > cap.armExpiresAt)
        fail('STARTED_NOT_ALLOWED');
      p.responseDeadline = new Date(now.getTime() + 30000);
      p.phase = 'RECORDING';
      await tx.examTaskCapture.update({
        where: { progressId: p.id },
        data: { phase: 'START_CONFIRMED', startedAt: now, deadline: p.responseDeadline },
      });
    } else {
      if (cap.phase !== 'START_CONFIRMED' || !cap.deadline || !c.digest)
        fail('STOPPED_NOT_ALLOWED');
      if (now < cap.deadline) fail('RECORDING_NOT_FINISHED');
      if (now.getTime() > cap.deadline.getTime() + 2000) fail('STOPPED_TOO_LATE');
      await tx.examTaskCapture.update({
        where: { progressId: p.id },
        data: { phase: 'STOP_CONFIRMED', stoppedAt: now, stopDigest: c.digest },
      });
      p.phase = 'UPLOAD_RETRY';
      p.leaseExpiresAt = new Date(cap.deadline.getTime() + this.graceMs);
    }
  }
  private async validateOriginal(
    tx: Tx,
    p: ExamTaskProgress,
    job: { digest: string; storageKey: string; bytes: number },
    result: Awaited<ReturnType<S10OriginalAudioValidator['validate']>>,
    actor: RecoveryActor,
  ) {
    const existing = await tx.examTaskAudioValidation.findUnique({ where: { progressId: p.id } });
    if (existing) {
      if (existing.digest !== job.digest) fail('UPLOAD_BYTES_CHANGED');
      return existing.status === 'VALID';
    }
    await tx.examTaskAudioValidation.create({
      data: {
        progressId: p.id,
        digest: job.digest,
        storageKey: job.storageKey,
        bytes: job.bytes,
        ...result,
        sourceSha256: p.mediaSha256,
      },
    });
    await this.audit(
      tx,
      p,
      actor,
      'ORIGINAL_AUDIO_VALIDATED',
      result.status === 'VALID',
      result.code ?? undefined,
    );
    if (result.status === 'VALID') return true;
    p.phase = 'BLOCKED_REVIEW';
    ++p.revision;
    await this.persist(tx, p);
    await tx.examTaskCapture.update({
      where: { progressId: p.id },
      data: { phase: 'BLOCKED_REVIEW' },
    });
    return false;
  }
  private async rejectOriginalInput(
    actor: RecoveryActor,
    a: string,
    q: string,
    c: DurableCommand,
    file?: { buffer: Buffer; size: number; mimetype: string },
  ) {
    await this.transact(async (tx) => {
      await this.lock(tx, a);
      const ctx = await this.context(tx, actor, a, q, true),
        p = await this.current(tx, a, q);
      if (!p || p.protocolVersion !== 2) return;
      await this.requireV2(tx);
      await this.actorContext(tx, actor, c);
      this.checkLease(p, actor, c, ctx.now);
      if (p.phase === 'SAVED') fail('SAVED_ORIGINAL_IMMUTABLE');
      const original = file?.buffer;
      let key: string | null = null;
      if (original?.length && original.length <= 10485760) {
        key = `${actor.id}/${a}/${q}/${randomUUID()}.bin`;
        await this.storage.put(
          { learnerId: actor.id, attemptId: a, testQuestionId: q },
          original,
          'application/octet-stream',
          key,
        );
      }
      if (!(await tx.examTaskAudioValidation.findUnique({ where: { progressId: p.id } })))
        await tx.examTaskAudioValidation.create({
          data: {
            progressId: p.id,
            digest: hash(original ?? Buffer.alloc(0)),
            storageKey: key,
            bytes: Math.min(original?.length ?? 0, 10485760),
            status: 'REJECTED',
            code: 'AUDIO_FILE_INVALID',
            decoderIdentity: 'input-rejected-before-decode',
            sourceSha256: p.mediaSha256,
          },
        });
      p.phase = 'BLOCKED_REVIEW';
      ++p.revision;
      await this.persist(tx, p);
      const cap = await tx.examTaskCapture.findUnique({ where: { progressId: p.id } });
      if (cap && cap.phase !== 'BLOCKED_REVIEW')
        await tx.examTaskCapture.update({
          where: { progressId: p.id },
          data: { phase: 'BLOCKED_REVIEW' },
        });
      await this.audit(tx, p, actor, 'ORIGINAL_AUDIO_REJECTED', false, 'AUDIO_FILE_INVALID');
    });
  }
  private async context(
    tx: Tx,
    actor: RecoveryActor,
    attemptId: string,
    questionId: string,
    write: boolean,
    staff = false,
  ) {
    const now = await this.clock(tx);
    // Match connect-pg-simple's SQL expiry semantics for its timestamp column.
    const [session] = await tx.$queryRaw<
      Array<{ sess: { userId?: string } }>
    >`SELECT sess FROM user_sessions WHERE sid=${actor.sessionId} AND expire >= clock_timestamp()`;
    if (!session || session.sess?.userId !== actor.id) fail('SESSION_EXPIRED', 401);
    const user = await tx.user.findUnique({
      where: { id: actor.id },
      select: { role: true, status: true, email: true },
    });
    if (!user || user.status !== 'ACTIVE' || user.role !== actor.role) fail('SESSION_EXPIRED', 401);
    if (!staff && actor.role !== 'STUDENT') fail('ROLE_FORBIDDEN', 403);
    const attempt = await tx.testAttempt.findFirst({
      where: {
        id: attemptId,
        ...(!staff ? { learnerId: actor.id } : {}),
        enrollmentId: null,
        classAssessmentId: null,
        test: { purpose: 'PLACEMENT', placementMode: 'FOUR_SKILLS' },
      },
      include: { test: true, placementVersion: true },
    });
    if (!attempt) fail('TASK_NOT_FOUND', 404);
    if (attempt.placementVersionId) {
      if (
        !(await privatePlacementPreviewEnabled(tx)) ||
        !user.email?.endsWith('@example.invalid') ||
        attempt.placementVersion?.purpose !== 'DEV_PREVIEW'
      )
        fail('PRIVATE_PREVIEW_UNAVAILABLE', 409);
      await tx.$queryRaw`SELECT set_config('app.class_lms_actor',${actor.id},true),set_config('app.class_lms_session',${actor.sessionId},true)`;
    }
    const question = await tx.testQuestion.findFirst({
      where: {
        id: questionId,
        testId: attempt.testId,
        group: { taskCode: 'SE_SW_01_S10_V01' },
        question: { responseType: 'AUDIO_RESPONSE' },
      },
      include: {
        question: true,
        group: { include: { stimuli: { orderBy: { orderIndex: 'asc' } } } },
      },
    });
    if (!question?.group) fail('TASK_NOT_FOUND', 404);
    const sitting = await tx.placementSitting.findUnique({
      where: { attemptId },
      include: { policy: true },
    });
    if (sitting) {
      const window = (
        sitting.policy.body as { tasks?: { groupId: string; preparationSeconds: number }[] }
      ).tasks?.find((t) => t.groupId === question.group!.id);
      if (
        write &&
        (!window ||
          now.getTime() < sitting.phaseStartedAt.getTime() + window.preparationSeconds * 1000)
      )
        fail('PLACEMENT_PREPARATION_PENDING');
      const groups =
        (
          attempt.placementVersion?.snapshot as { groups?: { id: string; skill: string }[] }
        )?.groups?.filter((g) => g.skill === 'SPEAKING') ?? [];
      if (
        write &&
        (sitting.phase !== 'SPEAKING' ||
          groups[sitting.taskIndex]?.id !== question.group.id ||
          !sitting.deadline ||
          now >= sitting.deadline)
      )
        fail('ORIGINAL_PLACEMENT_TASK_WINDOW_CLOSED');
    }
    const expired =
      attempt.test.timeLimitMinutes !== null &&
      now.getTime() >= attempt.startedAt.getTime() + attempt.test.timeLimitMinutes * 60_000;
    if (write && (attempt.status !== 'IN_PROGRESS' || expired)) fail('ATTEMPT_NOT_WRITABLE');
    return { now, attempt, question };
  }
  private async lock(tx: Tx, attemptId: string) {
    // Same lock order for every task mutation and reset. Real row lock fences submission updates too.
    await tx.$queryRaw`SELECT id FROM test_attempts WHERE id=${attemptId}::uuid FOR UPDATE`;
  }
  private current(tx: Tx, attemptId: string, questionId: string) {
    return tx.examTaskProgress.findFirst({
      where: { attemptId, testQuestionId: questionId },
      orderBy: { resetCount: 'desc' },
    });
  }
  private contentVersion(ctx: Awaited<ReturnType<S10DurableService['context']>>) {
    const q = ctx.question;
    return hash(
      JSON.stringify({
        questionId: q.questionId,
        content: q.question.content,
        group: q.group?.taskCode,
        instructions: q.group?.instructions,
        response: q.group?.responseSeconds,
        media: q.group?.stimuli
          .filter((s) => s.type === 'AUDIO')
          .map((s) => ({
            id: s.id,
            key: s.storageKey,
            mime: s.mimeType,
            protected: s.isProtected,
          })),
      }),
    );
  }
  private view(p: ExamTaskProgress | null, now: Date) {
    return {
      protocolVersion: p?.protocolVersion ?? 1,
      epoch: p?.epoch ?? null,
      revision: p?.revision ?? 0,
      phase:
        p && !terminal.includes(p.phase) && this.expiredProgress(p, now)
          ? 'BLOCKED_REVIEW'
          : (p?.phase ?? 'NOT_STARTED'),
      started: p?.started ?? 0,
      completed: p?.completed ?? 0,
      deadline: p?.responseDeadline?.getTime() ?? null,
      serverNow: now.getTime(),
      mediaSha256: p?.mediaSha256 ?? null,
      contentVersion: p?.contentVersion ?? null,
      assetVersion: p?.assetVersion ?? null,
      resetCount: p?.resetCount ?? 0,
      playbackUrl:
        p?.phase === 'SAVED'
          ? `/api/placement/attempts/${p.attemptId}/answers/${p.testQuestionId}/audio`
          : null,
    };
  }
  private expiredProgress(p: ExamTaskProgress, now: Date) {
    return Boolean(
      (p.leaseExpiresAt && p.leaseExpiresAt <= now) ||
      (p.responseDeadline && now.getTime() > p.responseDeadline.getTime() + this.graceMs),
    );
  }
  private async audit(
    tx: Tx,
    p: ExamTaskProgress,
    actor: RecoveryActor,
    action: string,
    accepted: boolean,
    code?: string,
    reason?: string,
  ) {
    await tx.examTaskEvent.create({
      data: {
        progressId: p.id,
        actorId: actor.role === 'SYSTEM' ? null : actor.id,
        actorKind: actor.role === 'SYSTEM' ? 'SYSTEM' : 'USER',
        action,
        accepted,
        code,
        reason,
        revision: p.revision,
      },
    });
  }
  private async persist(tx: Tx, p: ExamTaskProgress) {
    const {
      id,
      attemptId,
      testQuestionId,
      learnerId,
      epoch,
      parentEpoch,
      resetCount,
      contentVersion,
      assetVersion,
      mediaSha256,
      mediaStorageKey,
      mediaDurationMs,
      createdAt,
      updatedAt,
      ...data
    } = p;
    void attemptId;
    void testQuestionId;
    void learnerId;
    void epoch;
    void parentEpoch;
    void resetCount;
    void contentVersion;
    void assetVersion;
    void mediaSha256;
    void mediaStorageKey;
    void mediaDurationMs;
    void createdAt;
    void updatedAt;
    await tx.examTaskProgress.update({ where: { id }, data });
  }
  private checkLease(p: ExamTaskProgress, actor: RecoveryActor, c: DurableCommand, now: Date) {
    if (p.phase === 'SUPERSEDED' || p.epoch !== c.epoch) fail('STALE_EPOCH');
    if (!terminal.includes(p.phase) && (!p.leaseExpiresAt || this.expiredProgress(p, now))) {
      p.phase = 'BLOCKED_REVIEW';
      ++p.revision;
      fail('LEASE_EXPIRED');
    }
    if (
      p.leaseSessionHash !== hash(actor.sessionId) ||
      p.leaseTabHash !== hash(c.tabId) ||
      p.leaseTokenHash !== hash(c.token)
    )
      fail('LEASE_BUSY', 423);
    if (p.phase === 'BLOCKED_REVIEW') fail('BLOCKED_REVIEW');
  }
  private fingerprint(actor: RecoveryActor, c: DurableCommand) {
    return hash(
      JSON.stringify([
        actor.id,
        hash(actor.sessionId),
        c.action,
        c.key,
        c.epoch,
        c.revision,
        c.tabId,
        hash(c.token),
        c.nonce ?? null,
        c.digest ?? null,
      ]),
    );
  }
  private receiptWhere(p: ExamTaskProgress, actor: RecoveryActor, c: DurableCommand) {
    return {
      progressId_actorHash_key: {
        progressId: p.id,
        actorHash: hash(actor.id + ':' + actor.sessionId),
        key: c.key,
      },
    };
  }
  private async receipt(
    tx: Tx,
    p: ExamTaskProgress,
    actor: RecoveryActor,
    c: DurableCommand,
    outcome: Prisma.InputJsonValue,
  ) {
    await tx.examTaskReceipt.create({
      data: {
        progressId: p.id,
        actorHash: hash(actor.id + ':' + actor.sessionId),
        key: c.key,
        fingerprint: this.fingerprint(actor, c),
        outcome,
      },
    });
  }
  private async transact<T>(work: (tx: Tx) => Promise<T>): Promise<Exclude<T, { fault: unknown }>> {
    try {
      const value = await this.prisma.$transaction(work, { timeout: 20_000, maxWait: 10_000 });
      if (value && typeof value === 'object' && 'fault' in value) {
        const f = (value as { fault: { code: string; status: number } }).fault;
        throw new HttpException({ code: f.code, message: f.code }, f.status);
      }
      return value as Exclude<T, { fault: unknown }>;
    } catch (e) {
      if (e instanceof HttpException) throw e;
      if (e instanceof Fault) throw new HttpException({ code: e.code, message: e.code }, e.status);
      throw new HttpException(
        { code: 'S10_STORAGE_UNCERTAIN', message: 'S10_STORAGE_UNCERTAIN' },
        503,
      );
    }
  }
  async state(actor: RecoveryActor, attemptId: string, questionId: string) {
    // Read-only; deliberately does not call getExam or create a task/epoch.
    return this.transact(async (tx) => {
      const ctx = await this.context(tx, actor, attemptId, questionId, false);
      const p = await this.current(tx, attemptId, questionId);
      // A durable receipt remains readable after capability-off. This grants no
      // recording/write authority; context still authenticates owner and source.
      if (ctx.attempt.s10ProtocolVersion === 2 && p?.phase !== 'SAVED') await this.requireV2(tx);
      const result = await this.enrich(tx, p, ctx.now);
      if (p && p.contentVersion !== this.contentVersion(ctx)) result.phase = 'BLOCKED_REVIEW';
      return result;
    });
  }
  async command(actor: RecoveryActor, attemptId: string, questionId: string, input: unknown) {
    return this.transact(async (tx) => {
      const c = validateDurableCommand(input);
      if (c.action === 'UPLOAD') fail('MULTIPART_REQUIRED', 400);
      await this.lock(tx, attemptId);
      const ctx = await this.context(tx, actor, attemptId, questionId, true);
      if (ctx.attempt.s10ProtocolVersion === 2) {
        await this.requireV2(tx);
        await this.actorContext(tx, actor, c);
      }
      let p = await this.current(tx, attemptId, questionId);
      if (!p) {
        if (c.action !== 'CLAIM' || c.epoch !== null || c.revision !== 0)
          fail('TASK_NOT_INITIALIZED');
        if (
          await tx.testAnswer.findUnique({
            where: { attemptId_testQuestionId: { attemptId, testQuestionId: questionId } },
          })
        )
          fail('LEGACY_ANSWER_REQUIRES_REVIEW');
        const stimulus = ctx.question.group!.stimuli.find(
          (s) => s.type === 'AUDIO' && !s.isProtected,
        );
        if (!stimulus?.storageKey || stimulus.mimeType !== 'audio/wav')
          fail('MEDIA_UNAVAILABLE', 503);
        let body: Buffer;
        try {
          body = await this.media.read(stimulus.storageKey);
          if (ctx.attempt.placementVersion) {
            const provenance = ctx.attempt.placementVersion.provenance as {
              assets?: Array<{ id: string; sha256: string }>;
            };
            if (provenance.assets?.find((a) => a.id === stimulus.id)?.sha256 !== hash(body))
              fail('MEDIA_SOURCE_HASH_CHANGED', 503);
          }
        } catch {
          return fail('MEDIA_UNAVAILABLE', 503);
        }
        p = await tx.examTaskProgress.create({
          data: {
            attemptId,
            testQuestionId: questionId,
            learnerId: actor.id,
            protocolVersion: ctx.attempt.s10ProtocolVersion,
            contentVersion: this.contentVersion(ctx),
            assetVersion: stimulus.storageKey.match(/_(v\d+)\./)?.[1] ?? 'snapshot',
            mediaSha256: hash(body),
            mediaStorageKey: stimulus.storageKey,
            mediaDurationMs: wavDurationMs(body),
          },
        });
      }
      try {
        if (
          c.epoch !== p.epoch &&
          !(c.action === 'CLAIM' && c.epoch === null && p.resetCount === 0)
        )
          fail('STALE_EPOCH');
        if (p.contentVersion !== this.contentVersion(ctx)) {
          p.phase = 'BLOCKED_REVIEW';
          ++p.revision;
          fail('CONTENT_VERSION_CHANGED');
        }
        if (p.protocolVersion === 2 && (c.action !== 'CLAIM' || p.phase !== 'NOT_STARTED')) {
          this.checkLease(p, actor, c.action === 'CLAIM' ? { ...c, epoch: p.epoch } : c, ctx.now);
          await this.v2Timing(tx, p, ctx.now);
        }
        const receipt = await tx.examTaskReceipt.findUnique({
          where: this.receiptWhere(p, actor, c),
        });
        if (receipt) {
          if (receipt.fingerprint !== this.fingerprint(actor, c)) fail('IDEMPOTENCY_KEY_CONFLICT');
          if (p.phase === 'SUPERSEDED' || p.phase === 'BLOCKED_REVIEW') fail('BLOCKED_REVIEW');
          return this.enrich(tx, p, ctx.now, c.action === 'PREPARE');
        }
        // A valid holder may always fail closed despite an in-flight response/cursor.
        if (c.revision !== p.revision && c.action !== 'INTERRUPT') fail('STALE_REVISION');
        if (c.action === 'CLAIM') {
          if (p.phase !== 'NOT_STARTED') fail('LEASE_BUSY', 423);
          p.leaseSessionHash = hash(actor.sessionId);
          p.leaseTabHash = hash(c.tabId);
          p.leaseTokenHash = hash(c.token);
          p.leaseExpiresAt = new Date(ctx.now.getTime() + this.leaseMs);
          p.phase = 'READY';
        } else {
          this.checkLease(p, actor, c, ctx.now);
          switch (c.action) {
            case 'HEARTBEAT':
              break;
            case 'START_PLAY':
              if (p.phase !== 'READY' || p.started !== p.completed || p.started >= 2 || !c.nonce)
                fail('PLAY_QUOTA_OR_PHASE');
              ++p.started;
              p.playNonceHash = hash(c.nonce);
              p.playIssuedAt = ctx.now;
              p.mediaRead = false;
              p.phase = 'PLAYING';
              break;
            case 'AUTOPLAY_DENIED':
              if (p.phase !== 'PLAYING' || p.playNonceHash !== hash(c.nonce ?? ''))
                fail('NONCE_OR_PHASE');
              p.phase = 'WAITING_GESTURE';
              break;
            case 'RESUME_PLAY':
              if (p.phase !== 'WAITING_GESTURE' || p.playNonceHash !== hash(c.nonce ?? ''))
                fail('NONCE_OR_PHASE');
              p.phase = 'PLAYING';
              break;
            case 'COMPLETE_PLAY':
              if (p.phase !== 'PLAYING' || !p.mediaRead || p.playNonceHash !== hash(c.nonce ?? ''))
                fail('NONCE_OR_PHASE');
              if (
                !p.playIssuedAt ||
                ctx.now.getTime() - p.playIssuedAt.getTime() < p.mediaDurationMs
              )
                fail('PLAY_TOO_EARLY');
              ++p.completed;
              p.playNonceHash = null;
              p.playIssuedAt = null;
              if (p.completed === 2) {
                p.phase = 'RECORDING_READY';
                if (p.protocolVersion === 1)
                  p.responseDeadline = new Date(ctx.now.getTime() + 30_000);
              } else p.phase = 'READY';
              break;
            case 'PREPARE':
            case 'STARTED':
            case 'STOPPED':
              if (p.protocolVersion !== 2) fail('PROTOCOL_VERSION_REQUIRED');
              await this.captureCommand(tx, p, c, ctx.now);
              break;
            case 'BEGIN_RECORDING':
              if (p.protocolVersion === 2) fail('LEGACY_RECORDING_BYPASS');
              if (
                p.phase !== 'RECORDING_READY' ||
                !p.responseDeadline ||
                p.responseDeadline <= ctx.now
              )
                fail('RECORDING_NOT_ALLOWED');
              p.phase = 'RECORDING';
              break;
            case 'INTERRUPT':
              if (!terminal.includes(p.phase)) p.phase = 'BLOCKED_REVIEW';
              break;
          }
          const capture =
            p.protocolVersion === 2
              ? await tx.examTaskCapture.findUnique({ where: { progressId: p.id } })
              : null;
          // STOPPED fixes the digest and ends capture authority. Retain the
          // existing upload-only allowance; heartbeats must never extend it.
          p.leaseExpiresAt =
            capture?.stoppedAt && p.responseDeadline
              ? new Date(p.responseDeadline.getTime() + this.graceMs)
              : new Date(ctx.now.getTime() + this.leaseMs);
        }
        ++p.revision;
        await this.persist(tx, p);
        await this.audit(tx, p, actor, c.action, true);
        await this.receipt(tx, p, actor, c, { phase: p.phase, revision: p.revision });
        return this.enrich(tx, p, await this.clock(tx), c.action === 'PREPARE');
      } catch (e) {
        if (!(e instanceof Fault)) throw e;
        if (!(p.protocolVersion === 2 && ['LEASE_BUSY', 'STALE_EPOCH'].includes(e.code)))
          await this.persist(tx, p);
        await this.audit(tx, p, actor, c.action, false, e.code);
        return { fault: { code: e.code, status: e.status } };
      }
    });
  }
  async readMedia(
    actor: RecoveryActor,
    attemptId: string,
    questionId: string,
    c: DurableCommand,
    range?: string,
  ) {
    return this.transact(async (tx) => {
      validateDurableCommand(c);
      await this.lock(tx, attemptId);
      const ctx = await this.context(tx, actor, attemptId, questionId, true),
        p = await this.current(tx, attemptId, questionId);
      if (!p) fail('TASK_NOT_INITIALIZED');
      if (p.protocolVersion === 2) {
        await this.requireV2(tx);
        await this.actorContext(tx, actor, c);
      }
      try {
        this.checkLease(p, actor, c, ctx.now);
        if (range) fail('RANGE_UNSUPPORTED', 416);
        if (c.action !== 'START_PLAY' || c.revision !== p.revision) fail('STALE_MEDIA_CURSOR');
        if (p.contentVersion !== this.contentVersion(ctx)) fail('CONTENT_VERSION_CHANGED');
        if (
          !['PLAYING', 'WAITING_GESTURE'].includes(p.phase) ||
          p.mediaRead ||
          p.playNonceHash !== hash(c.nonce ?? '')
        )
          fail('MEDIA_PERMIT_USED_OR_INVALID');
        let body: Buffer;
        try {
          body = await this.media.read(p.mediaStorageKey);
        } catch {
          p.phase = 'BLOCKED_REVIEW';
          ++p.revision;
          fail('MEDIA_UNAVAILABLE', 503);
        }
        if (hash(body) !== p.mediaSha256) {
          p.phase = 'BLOCKED_REVIEW';
          ++p.revision;
          fail('MEDIA_HASH_CHANGED', 503);
        }
        p.mediaRead = true;
        await this.persist(tx, p);
        await this.audit(tx, p, actor, 'MEDIA_GRANTED', true);
        return { body, mimeType: 'audio/wav' };
      } catch (e) {
        if (!(e instanceof Fault)) throw e;
        if (!(p.protocolVersion === 2 && ['LEASE_BUSY', 'STALE_EPOCH'].includes(e.code)))
          await this.persist(tx, p);
        await this.audit(tx, p, actor, 'MEDIA_DENIED', false, e.code);
        return { fault: { code: e.code, status: e.status } };
      }
    });
  }
  async upload(
    actor: RecoveryActor,
    attemptId: string,
    questionId: string,
    input: unknown,
    file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    let c: DurableCommand;
    try {
      c = validateDurableCommand(input);
    } catch {
      throw new HttpException({ code: 'COMMAND_INVALID' }, 400);
    }
    if (
      c.action !== 'UPLOAD' ||
      !file ||
      file.size !== file.buffer.length ||
      !file.size ||
      file.size > 10 * 1024 * 1024
    ) {
      if (c.action === 'UPLOAD')
        await this.rejectOriginalInput(actor, attemptId, questionId, c, file);
      throw new HttpException({ code: 'AUDIO_FILE_INVALID' }, 400);
    }
    const mime = file.mimetype.split(';')[0];
    const extension =
      mime === 'audio/webm' &&
      file.buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
        ? '.webm'
        : mime === 'audio/ogg' && file.buffer.toString('ascii', 0, 4) === 'OggS'
          ? '.ogg'
          : mime === 'audio/mp4' && file.buffer.toString('ascii', 4, 8) === 'ftyp'
            ? '.m4a'
            : null;
    if (!extension || c.digest !== hash(file.buffer)) {
      await this.rejectOriginalInput(actor, attemptId, questionId, c, file);
      throw new HttpException({ code: 'AUDIO_FILE_INVALID' }, 400);
    }
    if (mime !== 'audio/webm') {
      const pinned = await this.prisma.testAttempt.findUnique({
        where: { id: attemptId },
        select: { s10ProtocolVersion: true },
      });
      if (pinned?.s10ProtocolVersion === 2) {
        await this.rejectOriginalInput(actor, attemptId, questionId, c, file);
        throw new HttpException({ code: 'AUDIO_FILE_INVALID' }, 400);
      }
    }
    const prepared = await this.transact(async (tx) => {
      await this.lock(tx, attemptId);
      const ctx = await this.context(tx, actor, attemptId, questionId, true),
        p = await this.current(tx, attemptId, questionId);
      if (!p) fail('TASK_NOT_INITIALIZED');
      if (p.protocolVersion === 2) {
        await this.requireV2(tx);
        await this.actorContext(tx, actor, c);
      }
      try {
        this.checkLease(p, actor, c, ctx.now);
        if (p.protocolVersion === 2) {
          const cap = await tx.examTaskCapture.findUnique({ where: { progressId: p.id } });
          if (
            cap?.phase !== 'STOP_CONFIRMED' ||
            cap.stopDigest !== c.digest ||
            hash(c.nonce ?? '') !== cap.nonceHash ||
            mime !== 'audio/webm'
          )
            fail('STOPPED_ORIGINAL_REQUIRED');
        }
        if (p.contentVersion !== this.contentVersion(ctx)) fail('CONTENT_VERSION_CHANGED');
        const receipt = await tx.examTaskReceipt.findUnique({
          where: this.receiptWhere(p, actor, c),
        });
        if (receipt && receipt.fingerprint !== this.fingerprint(actor, c))
          fail('IDEMPOTENCY_KEY_CONFLICT');
        if (p.phase === 'SAVED') {
          if (!receipt) fail('ALREADY_SAVED');
          return { saved: this.view(p, ctx.now) };
        }
        if (!p.responseDeadline || ctx.now < p.responseDeadline) fail('RECORDING_NOT_FINISHED');
        if (ctx.now.getTime() > p.responseDeadline.getTime() + this.graceMs) {
          p.phase = 'BLOCKED_REVIEW';
          ++p.revision;
          fail('UPLOAD_GRACE_EXPIRED');
        }
        if (p.uploadDigest && p.uploadDigest !== c.digest) fail('UPLOAD_BYTES_CHANGED');
        if (!receipt && c.revision !== p.revision) fail('STALE_REVISION');
        if (!['RECORDING', 'UPLOADING', 'UPLOAD_RETRY'].includes(p.phase))
          fail('UPLOAD_NOT_ALLOWED');
        let job = await tx.examTaskUpload.findUnique({
          where: { progressId_key: { progressId: p.id, key: c.key } },
        });
        if (job && job.status !== 'STAGED') fail('UPLOAD_NOT_RETRYABLE');
        if (!job) {
          if (p.uploadDigest) fail('UPLOAD_KEY_CHANGED');
          job = await tx.examTaskUpload.create({
            data: {
              progressId: p.id,
              key: c.key,
              digest: c.digest!,
              mimeType: mime,
              bytes: file.size,
              storageKey: `${actor.id}/${attemptId}/${questionId}/${randomUUID()}${extension}`,
            },
          });
          p.uploadDigest = c.digest!;
          p.phase = 'UPLOADING';
          // Upload retry grace is not recording time or a device-transfer lease.
          p.leaseExpiresAt = new Date(p.responseDeadline.getTime() + this.graceMs);
          ++p.revision;
          await this.persist(tx, p);
          await this.receipt(tx, p, actor, c, { phase: 'STAGED' });
          await this.audit(tx, p, actor, 'UPLOAD_STAGED', true);
        }
        return { job };
      } catch (e) {
        if (!(e instanceof Fault)) throw e;
        if (!(p.protocolVersion === 2 && ['LEASE_BUSY', 'STALE_EPOCH'].includes(e.code)))
          await this.persist(tx, p);
        await this.audit(tx, p, actor, 'UPLOAD_DENIED', false, e.code);
        return { fault: { code: e.code, status: e.status } };
      }
    });
    if ('saved' in prepared) return prepared.saved;
    if (!('job' in prepared) || !prepared.job)
      throw new HttpException({ code: 'UPLOAD_UNCERTAIN' }, 503);
    const job = prepared.job;
    try {
      try {
        await this.storage.put(
          { learnerId: actor.id, attemptId, testQuestionId: questionId },
          file.buffer,
          mime,
          job.storageKey,
        );
      } catch {
        if (hash(await this.storage.read(job.storageKey)) !== c.digest)
          throw new Error('Storage write failed');
      }
      if (hash(await this.storage.read(job.storageKey)) !== c.digest)
        throw new Error('Stored bytes changed');
      const originalValidation = await this.prisma.examTaskProgress
        .findUnique({ where: { id: job.progressId }, select: { protocolVersion: true } })
        .then((p) => (p?.protocolVersion === 2 ? this.decoder.validate(file.buffer) : null));
      return await this.transact(async (tx) => {
        await this.lock(tx, attemptId);
        const ctx = await this.context(tx, actor, attemptId, questionId, true),
          p = await this.current(tx, attemptId, questionId);
        if (!p || p.id !== job.progressId) fail('STALE_EPOCH');
        if (p.protocolVersion === 2) {
          await this.requireV2(tx);
          await this.actorContext(tx, actor, c);
        }
        this.checkLease(p, actor, c, ctx.now);
        if (p.contentVersion !== this.contentVersion(ctx)) fail('CONTENT_VERSION_CHANGED');
        const latest = await tx.examTaskUpload.findUniqueOrThrow({ where: { id: job.id } });
        if (latest.status === 'COMMITTED' && p.phase === 'SAVED') return this.view(p, ctx.now);
        if (
          latest.status !== 'STAGED' ||
          !p.responseDeadline ||
          ctx.now.getTime() > p.responseDeadline.getTime() + this.graceMs
        )
          fail('UPLOAD_GRACE_EXPIRED');
        if (
          p.protocolVersion === 2 &&
          !(await this.validateOriginal(tx, p, job, originalValidation!, actor))
        )
          return { fault: { code: 'AUDIO_REJECTED', status: 409 } };
        const answer = await tx.testAnswer.upsert({
          where: { attemptId_testQuestionId: { attemptId, testQuestionId: questionId } },
          create: { attemptId, testQuestionId: questionId, audioStorageKey: job.storageKey },
          update: {
            audioStorageKey: job.storageKey,
            selectedOptionIds: [],
            textResponse: null,
            isCorrect: null,
            pointsAwarded: null,
          },
        });
        p.phase = 'SAVED';
        p.savedAnswerId = answer.id;
        ++p.revision;
        await this.persist(tx, p);
        await tx.examTaskUpload.update({ where: { id: job.id }, data: { status: 'COMMITTED' } });
        await tx.examTaskReceipt.update({
          where: this.receiptWhere(p, actor, c),
          data: { outcome: { phase: 'SAVED', answerId: answer.id, revision: p.revision } },
        });
        await this.audit(tx, p, actor, 'SAVED', true);
        return this.view(p, ctx.now);
      });
    } catch (e) {
      // The durable outbox retains the pre-reserved path even on crash/unknown commit.
      await this.prisma
        .$transaction(async (tx) => {
          await this.lock(tx, attemptId);
          const p = await tx.examTaskProgress.findUnique({ where: { id: job.progressId } });
          if (p && p.phase === 'UPLOADING') {
            if (p.protocolVersion === 2) await this.actorContext(tx, actor, c);
            await tx.examTaskProgress.update({
              where: { id: p.id },
              data: { phase: 'UPLOAD_RETRY', revision: { increment: 1 } },
            });
            await this.audit(tx, p, actor, 'UPLOAD_FAILED', false, 'UPLOAD_RETRY');
          }
        })
        .catch(() => undefined);
      if (e instanceof HttpException) throw e;
      throw new HttpException({ code: 'UPLOAD_RETRY' }, 503);
    }
  }
  async reset(
    actor: RecoveryActor,
    attemptId: string,
    questionId: string,
    input: { key?: string; epoch?: string; reason?: string },
  ) {
    return this.transact(async (tx) => {
      if (
        !uuid(input?.key) ||
        !uuid(input.epoch) ||
        typeof input.reason !== 'string' ||
        input.reason.trim().length < 10 ||
        input.reason.length > 500
      )
        fail('RESET_REASON_REQUIRED', 400);
      // Same authority lock as grant/role revocation; a queued reset cannot use stale rights.
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
      await this.lock(tx, attemptId);
      const ctx = await this.context(tx, actor, attemptId, questionId, true, true);
      if (ctx.attempt.s10ProtocolVersion === 2) {
        await this.requireV2(tx);
        await this.actorContext(tx, actor);
      }
      if (actor.role !== 'ACADEMIC_MANAGER' || ctx.attempt.learnerId === actor.id)
        fail('RECOVERY_PERMISSION_REQUIRED', 403);
      const permission = await tx.examRecoveryPermission.findUnique({
        where: { userId: actor.id },
      });
      if (
        (!permission || permission.revokedAt) &&
        !(await this.authority.permits(
          actor.id,
          'assessment.recovery.approve',
          { type: 'GLOBAL' },
          tx,
        ))
      )
        fail('RECOVERY_PERMISSION_REQUIRED', 403);
      const old = await tx.examTaskProgress.findUnique({ where: { epoch: input.epoch } });
      if (!old || old.attemptId !== attemptId || old.testQuestionId !== questionId)
        fail('TASK_NOT_FOUND', 404);
      const key = {
        progressId_actorHash_key: {
          progressId: old.id,
          actorHash: hash(actor.id + ':' + actor.sessionId),
          key: input.key,
        },
      };
      const fingerprint = hash(JSON.stringify([input.epoch, input.reason.trim(), 'RESET']));
      const previous = await tx.examTaskReceipt.findUnique({ where: key });
      if (previous) {
        if (previous.fingerprint !== fingerprint) fail('IDEMPOTENCY_KEY_CONFLICT');
        return this.view(await this.current(tx, attemptId, questionId), ctx.now);
      }
      try {
        if (
          old.resetCount !== 0 ||
          (await tx.examTaskProgress.count({
            where: { attemptId, resetCount: 1 },
          }))
        )
          fail('RESET_LIMIT');
        if (this.expiredProgress(old, ctx.now) && !terminal.includes(old.phase))
          old.phase = 'BLOCKED_REVIEW';
        if (old.phase !== 'BLOCKED_REVIEW') fail('RESET_REQUIRES_BLOCKED_REVIEW');
        if (old.contentVersion !== this.contentVersion(ctx)) fail('CONTENT_VERSION_CHANGED');
        old.phase = 'SUPERSEDED';
        ++old.revision;
        await this.persist(tx, old);
        const next = await tx.examTaskProgress.create({
          data: {
            attemptId,
            testQuestionId: questionId,
            learnerId: old.learnerId,
            protocolVersion: old.protocolVersion,
            resetCount: 1,
            parentEpoch: old.epoch,
            contentVersion: old.contentVersion,
            assetVersion: old.assetVersion,
            mediaSha256: old.mediaSha256,
            mediaStorageKey: old.mediaStorageKey,
            mediaDurationMs: old.mediaDurationMs,
          },
        });
        await this.audit(tx, old, actor, 'RESET_APPROVED', true, undefined, input.reason.trim());
        await this.audit(
          tx,
          next,
          actor,
          'RESET_EPOCH_CREATED',
          true,
          undefined,
          input.reason.trim(),
        );
        await tx.examTaskReceipt.create({
          data: {
            progressId: old.id,
            actorHash: hash(actor.id + ':' + actor.sessionId),
            key: input.key,
            fingerprint,
            outcome: { epoch: next.epoch },
          },
        });
        return this.view(next, ctx.now);
      } catch (e) {
        if (!(e instanceof Fault)) throw e;
        await this.audit(tx, old, actor, 'RESET_DENIED', false, e.code, input.reason.trim());
        return { fault: { code: e.code, status: e.status } };
      }
    });
  }
  async incident(actor: RecoveryActor, attemptId: string, questionId: string, reason: unknown) {
    return this.transact(async (tx) => {
      if (typeof reason !== 'string' || reason.trim().length < 10 || reason.length > 500)
        fail('INCIDENT_REASON_REQUIRED', 400);
      await this.lock(tx, attemptId);
      await this.context(tx, actor, attemptId, questionId, false, actor.role !== 'STUDENT');
      const p = await this.current(tx, attemptId, questionId);
      if (!p) fail('TASK_NOT_INITIALIZED');
      await this.audit(tx, p, actor, 'INCIDENT_REPORTED', true, undefined, reason.trim());
      return { reported: true };
    });
  }
  async review(actor: RecoveryActor, attemptId: string, questionId: string) {
    return this.transact(async (tx) => {
      const ctx = await this.context(tx, actor, attemptId, questionId, false, true);
      if (actor.role !== 'ACADEMIC_MANAGER') fail('RECOVERY_PERMISSION_REQUIRED', 403);
      const permission = await tx.examRecoveryPermission.findUnique({
        where: { userId: actor.id },
      });
      if (
        (!permission || permission.revokedAt) &&
        !(await this.authority.permits(
          actor.id,
          'assessment.recovery.approve',
          { type: 'GLOBAL' },
          tx,
        ))
      )
        fail('RECOVERY_PERMISSION_REQUIRED', 403);
      const p = await this.current(tx, attemptId, questionId);
      if (!p) fail('TASK_NOT_INITIALIZED');
      const events = await tx.examTaskEvent.findMany({
        where: { progress: { attemptId, testQuestionId: questionId } },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          id: true,
          actorId: true,
          actorKind: true,
          action: true,
          accepted: true,
          code: true,
          reason: true,
          createdAt: true,
          revision: true,
        },
      });
      return { state: this.view(p, ctx.now), events };
    });
  }
  async cleanup() {
    // Revoked holders cannot authenticate an INTERRUPT. Persist their fail-closed
    // state through the existing maintenance worker; never reset or delete originals.
    const expired = await this.prisma.$queryRaw<Array<{ id: string; attemptId: string }>>`
      SELECT p.id,p."attemptId" FROM exam_task_progress p LEFT JOIN exam_task_captures c ON c."progressId"=p.id
      WHERE p."protocolVersion"=2 AND p.phase NOT IN ('NOT_STARTED','SAVED','SUPERSEDED','BLOCKED_REVIEW') AND
      (p."leaseExpiresAt"<(clock_timestamp() AT TIME ZONE 'UTC') OR
       (c."startedAt" IS NULL AND c."armExpiresAt"<(clock_timestamp() AT TIME ZONE 'UTC')) OR
       (c."stoppedAt" IS NULL AND c.deadline+interval '2000 milliseconds'<(clock_timestamp() AT TIME ZONE 'UTC')) OR
       NOT EXISTS(SELECT 1 FROM users u JOIN user_sessions s ON s.sess->>'userId'=u.id::text
          AND encode(sha256(convert_to(s.sid,'UTF8')),'hex')=p."leaseSessionHash"
          WHERE u.id=p."learnerId" AND u.role='STUDENT' AND u.status='ACTIVE' AND s.expire>clock_timestamp())) LIMIT 20`;
    for (const row of expired)
      await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, row.attemptId);
        await tx.$queryRaw`SELECT set_config('app.s10_system','maintenance',true)`;
        const p = await tx.examTaskProgress.findUniqueOrThrow({ where: { id: row.id } });
        if (terminal.includes(p.phase) || p.phase === 'NOT_STARTED') return;
        const cap = await tx.examTaskCapture.findUnique({ where: { progressId: p.id } }),
          time = await this.clock(tx);
        const [valid] = await tx.$queryRaw<
          Array<{ ok: boolean }>
        >`SELECT EXISTS(SELECT 1 FROM users u JOIN user_sessions s ON s.sess->>'userId'=u.id::text AND encode(sha256(convert_to(s.sid,'UTF8')),'hex')=${p.leaseSessionHash} WHERE u.id=${p.learnerId}::uuid AND u.role='STUDENT' AND u.status='ACTIVE' AND s.expire>clock_timestamp()) AS ok`;
        if (
          valid.ok &&
          !this.expiredProgress(p, time) &&
          !(cap && !cap.startedAt && time > cap.armExpiresAt) &&
          !(cap?.deadline && !cap.stoppedAt && time.getTime() > cap.deadline.getTime() + 2000)
        )
          return;
        p.phase = 'BLOCKED_REVIEW';
        ++p.revision;
        await this.persist(tx, p);
        if (cap && cap.phase !== 'BLOCKED_REVIEW')
          await tx.examTaskCapture.update({
            where: { progressId: p.id },
            data: { phase: 'BLOCKED_REVIEW' },
          });
        await this.audit(
          tx,
          p,
          { id: p.learnerId, role: 'SYSTEM', sessionId: '' },
          'CAPTURE_EXPIRED_OR_REVOKED',
          true,
        );
      });
    const now = await this.clock(this.prisma);
    const rows = await this.prisma.examTaskUpload.findMany({
      where: {
        status: { in: ['STAGED', 'DELETING'] },
        createdAt: { lt: new Date(now.getTime() - this.stagedMs) },
      },
      take: 50,
    });
    for (const row of rows) {
      const remove = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.s10_system','maintenance',true)`;
        const p = await tx.examTaskProgress.findUniqueOrThrow({ where: { id: row.progressId } });
        await this.lock(tx, p.attemptId);
        if (p.protocolVersion === 2) return false;
        const job = await tx.examTaskUpload.findUniqueOrThrow({ where: { id: row.id } });
        if (!['STAGED', 'DELETING'].includes(job.status)) return false;
        if (await tx.testAnswer.count({ where: { audioStorageKey: job.storageKey } })) {
          await tx.examTaskUpload.update({ where: { id: row.id }, data: { status: 'COMMITTED' } });
          return false;
        }
        await tx.examTaskUpload.update({ where: { id: row.id }, data: { status: 'DELETING' } });
        if (!terminal.includes(p.phase)) {
          p.phase = 'BLOCKED_REVIEW';
          ++p.revision;
          await this.persist(tx, p);
          await this.audit(
            tx,
            p,
            { id: p.learnerId, role: 'SYSTEM', sessionId: '' },
            'STAGED_UPLOAD_EXPIRED',
            true,
          );
        }
        return true;
      });
      if (remove) {
        await this.storage.delete(row.storageKey);
        await this.prisma.examTaskUpload.update({
          where: { id: row.id },
          data: { status: 'DELETED' },
        });
      }
    }
  }
}
