import { createHash } from 'node:crypto';
import { S10ContractError, S10LedgerPrototype, type S10Command } from './s10-ledger.prototype';
const hash = createHash('sha256').update('synthetic-wave').digest('hex');
function fixture() {
  let now = 1000,
    key = 0;
  const actor = { learnerId: 'owner', sessionId: 'session-a' };
  const ledger = new S10LedgerPrototype(
    {
      learnerId: 'owner',
      attemptId: 'attempt',
      questionId: 's10',
      contentVersion: 'v01',
      assetVersion: 'v01',
      mediaSha256: hash,
      durationMs: 100,
    },
    () => now,
    120000,
  );
  let token = '';
  const cmd = (action: S10Command['action'], extra: Partial<S10Command> = {}) => ({
    action,
    key: `request-${++key}`,
    epoch: ledger.epoch,
    revision: ledger.state(actor).revision,
    tabId: 'tab-owner',
    leaseToken: token,
    ...extra,
  });
  const claim = () => {
    const result = ledger.command(actor, cmd('CLAIM'));
    token = result.leaseToken!;
    return result;
  };
  const play = () => {
    const begin = ledger.command(actor, cmd('START_PLAY'));
    ledger.readMedia(actor, 'tab-owner', token, begin.nonce!);
    now += 100;
    return ledger.command(actor, cmd('COMPLETE_PLAY', { nonce: begin.nonce }));
  };
  return {
    ledger,
    actor,
    cmd,
    claim,
    play,
    advance: (ms: number) => {
      now += ms;
    },
    getToken: () => token,
  };
}
describe('server S10 contract prototype — no production registration or database', () => {
  it('an expired response window blocks rather than granting a new deadline', () => {
    const f = fixture();
    f.claim();
    f.play();
    f.play();
    const deadline = f.ledger.state(f.actor).recordingDeadline;
    f.advance(30001);
    expect(() => f.ledger.command(f.actor, f.cmd('BEGIN_RECORDING'))).toThrow(
      'RECORDING_WINDOW_EXPIRED',
    );
    expect(f.ledger.state(f.actor).phase).toBe('BLOCKED_REVIEW');
    expect(f.ledger.state(f.actor).recordingDeadline).toBe(deadline);
  });
  it('enforces two completed ordinals, server deadline and no third play', () => {
    const f = fixture();
    f.claim();
    expect(() => f.ledger.command(f.actor, f.cmd('BEGIN_RECORDING'))).toThrow();
    f.play();
    const last = f.play();
    expect(last.state.playStartedCount).toBe(2);
    expect(last.state.playCompletedCount).toBe(2);
    expect(last.state.recordingDeadline).toBe(last.state.serverNow + 30000);
    const deadline = last.state.recordingDeadline;
    f.ledger.command(f.actor, f.cmd('BEGIN_RECORDING'));
    expect(() => f.ledger.command(f.actor, f.cmd('START_PLAY'))).toThrow();
    expect(f.ledger.state(f.actor).recordingDeadline).toBe(deadline);
  });
  it('idempotent replay returns current state without rewinding or granting new quota', () => {
    const f = fixture(),
      claim = f.cmd('CLAIM');
    const first = f.ledger.command(f.actor, claim);
    const retry = f.ledger.command(f.actor, claim);
    expect(retry.leaseToken).toBe(first.leaseToken);
    expect(retry.duplicate).toBe(true);
    expect(retry.state.revision).toBe(first.state.revision);
    expect(() => f.ledger.command(f.actor, { ...claim, tabId: 'other-tab' })).toThrow(
      'IDEMPOTENCY_KEY_CONFLICT',
    );
  });
  it('refuses stale epoch/revision, invalid actions, foreign actors and early completion', () => {
    const f = fixture();
    f.claim();
    expect(() => f.ledger.state({ ...f.actor, learnerId: 'other' })).toThrow('TASK_NOT_FOUND');
    expect(() => f.ledger.command(f.actor, f.cmd('START_PLAY', { epoch: 'stale' }))).toThrow(
      'STALE_EPOCH',
    );
    expect(() => f.ledger.command(f.actor, f.cmd('START_PLAY', { revision: 0 }))).toThrow(
      'STALE_REVISION',
    );
    const start = f.ledger.command(f.actor, f.cmd('START_PLAY'));
    f.ledger.readMedia(f.actor, 'tab-owner', f.getToken(), start.nonce!);
    expect(() => f.ledger.command(f.actor, f.cmd('COMPLETE_PLAY', { nonce: start.nonce }))).toThrow(
      'PLAY_TOO_EARLY',
    );
    expect(() => f.ledger.command(f.actor, f.cmd('COMPLETE_PLAY', { nonce: 'forged' }))).toThrow();
  });
  it('another tab/device cannot claim or mutate the active lease', () => {
    const f = fixture();
    f.claim();
    expect(() => f.ledger.command(f.actor, f.cmd('CLAIM', { tabId: 'tab-other' }))).toThrow(
      'LEASE_BUSY',
    );
    expect(() =>
      f.ledger.command({ ...f.actor, sessionId: 'session-b' }, f.cmd('START_PLAY')),
    ).toThrow('LEASE_MISMATCH');
  });
  it.each([1, 2])('refresh at play %s cannot acquire a new epoch or replay', (ordinal) => {
    const f = fixture();
    f.claim();
    if (ordinal === 2) f.play();
    f.ledger.command(f.actor, f.cmd('START_PLAY'));
    expect(() => f.ledger.command(f.actor, f.cmd('CLAIM', { tabId: 'refreshed-tab' }))).toThrow();
    expect(f.ledger.state(f.actor).playStartedCount).toBe(ordinal);
    f.advance(120001);
    expect(f.ledger.state(f.actor).phase).toBe('BLOCKED_REVIEW');
    expect(() => f.ledger.command(f.actor, f.cmd('CLAIM'))).toThrow('BLOCKED_REVIEW');
  });
  it('media grants are one use, nonce bound and never exposed in GET state', () => {
    const f = fixture();
    f.claim();
    const started = f.ledger.command(f.actor, f.cmd('START_PLAY'));
    f.ledger.readMedia(f.actor, 'tab-owner', f.getToken(), started.nonce!);
    expect(() => f.ledger.readMedia(f.actor, 'tab-owner', f.getToken(), started.nonce!)).toThrow();
    const state = JSON.stringify(f.ledger.state(f.actor));
    expect(state).not.toContain(f.getToken());
    expect(state).not.toContain(started.nonce!);
  });
  it('autoplay gesture continuation keeps the same ordinal and one media grant', () => {
    const f = fixture();
    f.claim();
    const started = f.ledger.command(f.actor, f.cmd('START_PLAY'));
    f.ledger.command(f.actor, f.cmd('AUTOPLAY_DENIED', { nonce: started.nonce }));
    const resumed = f.ledger.command(f.actor, f.cmd('RESUME_PLAY', { nonce: started.nonce }));
    expect(resumed.nonce).toBe(started.nonce);
    expect(resumed.state.playStartedCount).toBe(1);
    f.ledger.readMedia(f.actor, 'tab-owner', f.getToken(), resumed.nonce!);
    f.advance(100);
    f.ledger.command(f.actor, f.cmd('COMPLETE_PLAY', { nonce: resumed.nonce }));
  });
  it('interrupt never grants a reset, compensation, score or new deadline', () => {
    const f = fixture();
    f.claim();
    f.play();
    f.play();
    f.ledger.command(f.actor, f.cmd('BEGIN_RECORDING'));
    const deadline = f.ledger.state(f.actor).recordingDeadline;
    f.ledger.command(f.actor, f.cmd('INTERRUPT'));
    expect(() => f.ledger.command(f.actor, f.cmd('START_PLAY'))).toThrow();
    expect(f.ledger.state(f.actor).recordingDeadline).toBe(deadline);
    expect(f.ledger.audit.length).toBeGreaterThan(0);
  });
  it('concurrent identical upload persists once and changed-byte key reuse is rejected', async () => {
    const f = fixture();
    f.claim();
    f.play();
    f.play();
    f.ledger.command(f.actor, f.cmd('BEGIN_RECORDING'));
    f.advance(30000);
    let release!: () => void;
    const persist = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const command = f.cmd('UPLOAD_BEGIN', { digest: hash });
    const a = f.ledger.upload(f.actor, command, persist),
      b = f.ledger.upload(f.actor, command, persist);
    await Promise.resolve();
    expect(persist).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([a, b]);
    expect(f.ledger.state(f.actor).phase).toBe('SAVED');
    await f.ledger.upload(f.actor, command, persist);
    expect(persist).toHaveBeenCalledTimes(1);
    await expect(
      f.ledger.upload(f.actor, { ...command, digest: 'a'.repeat(64) }, persist),
    ).rejects.toBeInstanceOf(S10ContractError);
  });
  it('failed upload retries the same receipt and keeps the original deadline', async () => {
    const f = fixture();
    f.claim();
    f.play();
    f.play();
    f.ledger.command(f.actor, f.cmd('BEGIN_RECORDING'));
    const deadline = f.ledger.state(f.actor).recordingDeadline;
    f.advance(30000);
    const cmd = f.cmd('UPLOAD_BEGIN', { digest: hash });
    const persist = jest
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue(undefined);
    await expect(f.ledger.upload(f.actor, cmd, persist)).rejects.toThrow('UPLOAD_RETRY');
    expect(f.ledger.state(f.actor).phase).toBe('UPLOAD_RETRY');
    await f.ledger.upload(f.actor, cmd, persist);
    expect(f.ledger.state(f.actor).recordingDeadline).toBe(deadline);
    expect(f.ledger.state(f.actor).phase).toBe('SAVED');
  });
});
