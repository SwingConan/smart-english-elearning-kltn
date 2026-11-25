/** ADR prototype ONLY. Not a Nest provider or production persistence adapter.
 * Methods execute synchronously as one transaction in a single-process fixture.
 * A production implementation needs durable CAS + audit + answer transactions.
 */
import { createHash, randomUUID } from 'node:crypto';

export type S10Phase =
  | 'NOT_STARTED'
  | 'READY'
  | 'PLAYING'
  | 'WAITING_GESTURE'
  | 'RECORDING_READY'
  | 'RECORDING'
  | 'UPLOADING'
  | 'UPLOAD_RETRY'
  | 'SAVED'
  | 'BLOCKED_REVIEW';
export type S10Actor = { learnerId: string; sessionId: string };
export type S10Binding = {
  learnerId: string;
  attemptId: string;
  questionId: string;
  contentVersion: string;
  assetVersion: string;
  mediaSha256: string;
  durationMs: number;
};
export type S10Action =
  | 'CLAIM'
  | 'START_PLAY'
  | 'AUTOPLAY_DENIED'
  | 'RESUME_PLAY'
  | 'COMPLETE_PLAY'
  | 'BEGIN_RECORDING'
  | 'INTERRUPT'
  | 'UPLOAD_BEGIN';
export type S10Command = {
  action: S10Action;
  key: string;
  epoch: string;
  revision: number;
  tabId: string;
  leaseToken?: string;
  nonce?: string;
  digest?: string;
};
export class S10ContractError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 409,
  ) {
    super(code);
  }
}
type Result = {
  state: ReturnType<S10LedgerPrototype['view']>;
  duplicate: boolean;
  eventId: string;
  leaseToken?: string;
  nonce?: string;
};

export class S10LedgerPrototype {
  readonly epoch = randomUUID();
  readonly audit: Array<{
    eventId: string;
    action: string;
    accepted: boolean;
    code?: string;
    at: number;
    revision: number;
  }> = [];
  private phase: S10Phase = 'NOT_STARTED';
  private revision = 0;
  private started = 0;
  private completed = 0;
  private deadline: number | null = null;
  private lease: { actor: S10Actor; tabId: string; token: string; expiry: number } | null = null;
  private play: { nonce: string; issuedAt: number; mediaRead: boolean } | null = null;
  private receipts = new Map<
    string,
    { fingerprint: string; result: Omit<Result, 'state' | 'duplicate'> }
  >();
  private uploadFlights = new Map<string, { fingerprint: string; promise: Promise<Result> }>();
  private uploadResults = new Map<string, { fingerprint: string; result: Result }>();

  constructor(
    readonly binding: S10Binding,
    private now: () => number,
    private leaseMs: number,
  ) {
    if (
      !Number.isFinite(binding.durationMs) ||
      binding.durationMs <= 0 ||
      !/^[a-f0-9]{64}$/.test(binding.mediaSha256) ||
      leaseMs <= 0
    )
      throw new S10ContractError('INVALID_TRUSTED_BINDING');
  }

  private event(action: string, accepted: boolean, code?: string) {
    const eventId = randomUUID();
    this.audit.push({ eventId, action, accepted, code, at: this.now(), revision: this.revision });
    return eventId;
  }
  private reject(code: string, status = 409): never {
    this.event('REJECT', false, code);
    throw new S10ContractError(code, status);
  }
  private authorize(actor: S10Actor) {
    if (actor.learnerId !== this.binding.learnerId) this.reject('TASK_NOT_FOUND', 404);
  }
  private expire() {
    if (
      this.lease &&
      this.now() >= this.lease.expiry &&
      !['SAVED', 'BLOCKED_REVIEW'].includes(this.phase) &&
      this.uploadFlights.size === 0
    ) {
      this.phase = 'BLOCKED_REVIEW';
      ++this.revision;
      this.event('LEASE_EXPIRED', true);
    }
  }
  private view() {
    return {
      epoch: this.epoch,
      revision: this.revision,
      phase: this.phase,
      playStartedCount: this.started,
      playCompletedCount: this.completed,
      recordingDeadline: this.deadline,
      serverNow: this.now(),
      mediaSha256: this.binding.mediaSha256,
      contentVersion: this.binding.contentVersion,
      assetVersion: this.binding.assetVersion,
      lastEventId: this.audit.at(-1)?.eventId ?? null,
    };
  }
  state(actor: S10Actor) {
    this.authorize(actor);
    this.expire();
    return this.view();
  }
  private fingerprint(actor: S10Actor, command: S10Command) {
    return createHash('sha256').update(JSON.stringify({ actor, command })).digest('hex');
  }
  private leaseMatches(actor: S10Actor, command: S10Command) {
    return (
      this.lease &&
      this.lease.actor.learnerId === actor.learnerId &&
      this.lease.actor.sessionId === actor.sessionId &&
      this.lease.tabId === command.tabId &&
      this.lease.token === command.leaseToken
    );
  }

  command(actor: S10Actor, command: S10Command): Result {
    this.authorize(actor);
    this.expire();
    if (
      !command ||
      typeof command !== 'object' || Array.isArray(command) ||
      Object.keys(command).some(key=>!['action','key','epoch','revision','tabId','leaseToken','nonce','digest'].includes(key)) ||
      ![
        'CLAIM',
        'START_PLAY',
        'AUTOPLAY_DENIED',
        'RESUME_PLAY',
        'COMPLETE_PLAY',
        'BEGIN_RECORDING',
        'INTERRUPT',
        'UPLOAD_BEGIN',
      ].includes(command.action) ||
      typeof command.key !== 'string' ||
      command.key.length < 8 ||
      command.key.length > 128 ||
      typeof command.tabId !== 'string' ||
      command.tabId.length < 8 ||
      command.tabId.length > 128 ||
      !Number.isSafeInteger(command.revision)
    )
      this.reject('INVALID_COMMAND', 400);
    if (command.epoch !== this.epoch) this.reject('STALE_EPOCH');
    const fingerprint = this.fingerprint(actor, command),
      receipt = this.receipts.get(command.key);
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) this.reject('IDEMPOTENCY_KEY_CONFLICT');
      if (this.phase === 'BLOCKED_REVIEW') this.reject('BLOCKED_REVIEW');
      return { ...receipt.result, state: this.view(), duplicate: true };
    }
    if (this.phase === 'BLOCKED_REVIEW') this.reject('BLOCKED_REVIEW');
    if (command.revision !== this.revision) this.reject('STALE_REVISION');
    let secrets: { leaseToken?: string; nonce?: string } = {};
    if (command.action === 'CLAIM') {
      if (this.lease || this.phase !== 'NOT_STARTED') this.reject('LEASE_BUSY', 423);
      this.lease = {
        actor: { ...actor },
        tabId: command.tabId,
        token: randomUUID(),
        expiry: this.now() + this.leaseMs,
      };
      this.phase = 'READY';
      secrets = { leaseToken: this.lease.token };
    } else {
      if (!this.leaseMatches(actor, command)) this.reject('LEASE_MISMATCH', 423);
      switch (command.action) {
        case 'START_PLAY':
          if (this.phase !== 'READY' || this.started !== this.completed || this.started >= 2)
            this.reject('PLAY_QUOTA_OR_PHASE');
          ++this.started;
          this.play = { nonce: randomUUID(), issuedAt: this.now(), mediaRead: false };
          this.phase = 'PLAYING';
          secrets = { nonce: this.play.nonce };
          break;
        case 'AUTOPLAY_DENIED':
          if (this.phase !== 'PLAYING' || this.play?.nonce !== command.nonce)
            this.reject('PLAY_NONCE_OR_PHASE');
          this.phase = 'WAITING_GESTURE';
          break;
        case 'RESUME_PLAY':
          if (this.phase !== 'WAITING_GESTURE' || !this.play || this.play.nonce !== command.nonce)
            this.reject('PLAY_NONCE_OR_PHASE');
          this.phase = 'PLAYING';
          this.play.issuedAt = this.now();
          secrets = { nonce: this.play.nonce };
          break;
        case 'COMPLETE_PLAY':
          if (
            this.phase !== 'PLAYING' ||
            !this.play ||
            this.play.nonce !== command.nonce ||
            !this.play.mediaRead
          )
            this.reject('PLAY_NONCE_OR_PHASE');
          if (this.now() - this.play.issuedAt < this.binding.durationMs)
            this.reject('PLAY_TOO_EARLY');
          ++this.completed;
          this.play = null;
          if (this.completed === 2) {
            this.phase = 'RECORDING_READY';
            this.deadline = this.now() + 30_000;
          } else this.phase = 'READY';
          break;
        case 'BEGIN_RECORDING':
          if (this.phase === 'RECORDING_READY' && this.deadline && this.now() >= this.deadline) {
            this.phase = 'BLOCKED_REVIEW';
            ++this.revision;
            this.event('RECORDING_WINDOW_EXPIRED', true);
            this.reject('RECORDING_WINDOW_EXPIRED');
          }
          if (
            this.phase !== 'RECORDING_READY' ||
            this.completed !== 2 ||
            !this.deadline ||
            this.now() >= this.deadline
          )
            this.reject('RECORDING_NOT_ALLOWED');
          this.phase = 'RECORDING';
          break;
        case 'INTERRUPT':
          this.phase = 'BLOCKED_REVIEW';
          break;
        case 'UPLOAD_BEGIN':
          if (
            !['RECORDING', 'UPLOAD_RETRY'].includes(this.phase) ||
            !this.deadline ||
            this.now() < this.deadline ||
            !/^[a-f0-9]{64}$/.test(command.digest ?? '')
          )
            this.reject('UPLOAD_NOT_ALLOWED');
          this.phase = 'UPLOADING';
          break;
      }
    }
    ++this.revision;
    const result = { eventId: this.event(command.action, true), ...secrets };
    this.receipts.set(command.key, { fingerprint, result });
    return { ...result, state: this.view(), duplicate: false };
  }

  /** One read grant per ordinal; no signed URL cache or Range quota bypass.
   * Browser bytes already received can still be copied/replayed outside the app.
   */
  readMedia(actor: S10Actor, tabId: string, leaseToken: string, nonce: string) {
    this.authorize(actor);
    this.expire();
    if (
      !this.leaseMatches(actor, { tabId, leaseToken } as S10Command) ||
      this.phase === 'BLOCKED_REVIEW'
    )
      this.reject('LEASE_MISMATCH', 423);
    if (
      !['PLAYING', 'WAITING_GESTURE'].includes(this.phase) ||
      !this.play ||
      this.play.nonce !== nonce ||
      this.play.mediaRead
    )
      this.reject('MEDIA_GRANT_USED_OR_INVALID');
    this.play.mediaRead = true;
    this.event('MEDIA_GRANTED', true);
  }

  async upload(
    actor: S10Actor,
    command: S10Command,
    persist: () => Promise<void>,
  ): Promise<Result> {
    this.authorize(actor);
    this.expire();
    if (
      command.action !== 'UPLOAD_BEGIN' ||
      command.epoch !== this.epoch ||
      !this.leaseMatches(actor, command)
    )
      this.reject('UPLOAD_AUTHORITY_INVALID', 423);
    const fingerprint = this.fingerprint(actor, command),
      previous = this.uploadResults.get(command.key),
      flight = this.uploadFlights.get(command.key);
    if (previous) {
      if (previous.fingerprint !== fingerprint) this.reject('IDEMPOTENCY_KEY_CONFLICT');
      return { ...previous.result, state: this.view(), duplicate: true };
    }
    if (flight) {
      if (flight.fingerprint !== fingerprint) this.reject('IDEMPOTENCY_KEY_CONFLICT');
      return flight.promise;
    }
    const begun = this.command(actor, command);
    if (begun.duplicate && this.phase !== 'UPLOAD_RETRY') this.reject('UPLOAD_NOT_RETRYABLE');
    if (begun.duplicate) {
      this.phase = 'UPLOADING';
      ++this.revision;
      this.event('UPLOAD_RETRY_BEGIN', true);
    }
    // The promise is registered before persist is invoked, deduplicating races.
    const promise = Promise.resolve()
      .then(persist)
      .then(
        () => {
          this.phase = 'SAVED';
          ++this.revision;
          const eventId = this.event('SAVED', true);
          const result = { state: this.view(), eventId, duplicate: false };
          this.uploadResults.set(command.key, { fingerprint, result });
          return result;
        },
        () => {
          this.phase = 'UPLOAD_RETRY';
          ++this.revision;
          this.event('UPLOAD_FAILED', true);
          throw new S10ContractError('UPLOAD_RETRY', 503);
        },
      )
      .finally(() => {
        this.uploadFlights.delete(command.key);
      });
    this.uploadFlights.set(command.key, { fingerprint, promise });
    return promise;
  }
}
