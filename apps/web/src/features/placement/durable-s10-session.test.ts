import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/api-client';
import { DurableS10Session } from './durable-s10-session';
vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn(), apiUrl: (path: string) => '/api' + path }));
const snapshot = {
  epoch: 'existing-server-epoch',
  revision: 8,
  started: 2,
  completed: 2,
  deadline: 1,
  serverNow: 2,
  mediaSha256: 'hash',
  playbackUrl: null,
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(apiFetch).mockReset();
});
describe('S10 stopped-blob transport boundary', () => {
  function pending() {
    const update = vi.fn(),
      saved = vi.fn();
    const client = new DurableS10Session('attempt', 'question', update, saved);
    const blob = new Blob(['actual recorder bytes'], { type: 'audio/webm' });
    Object.defineProperty(blob, 'arrayBuffer', { value: async () => new ArrayBuffer(8) });
    vi.stubGlobal('crypto', {
      randomUUID: () => 'same-upload-key',
      subtle: { digest: vi.fn().mockResolvedValue(new Uint8Array(32).buffer) },
    });
    Object.assign(client, { blob, state: { ...snapshot, phase: 'RECORDING', deadline: 30_000 } });
    return { client, update, saved, blob };
  }
  const recording = (serverNow: number) => ({
    ...snapshot,
    phase: 'RECORDING',
    deadline: 30_000,
    serverNow,
  });
  it('waits on authenticated server time at -15ms, accepts equality, never trusts a fast client clock', async () => {
    const { client, saved } = pending();
    vi.spyOn(Date, 'now').mockReturnValue(9e12);
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(recording(29_985))
      .mockResolvedValueOnce(recording(30_000))
      .mockResolvedValueOnce({ ...recording(30_001), phase: 'SAVED' });
    await client.upload();
    expect(apiFetch).toHaveBeenCalledTimes(3);
    expect(
      vi
        .mocked(apiFetch)
        .mock.calls.slice(0, 2)
        .every(([, init]) => !init),
    ).toBe(true);
    expect(vi.mocked(apiFetch).mock.calls[2][0]).toMatch(/\/answer$/);
    expect(saved).toHaveBeenCalledOnce();
    client.dispose();
  });
  it('retains identical bytes and idempotency command after a rejected first upload', async () => {
    const { client, saved, blob } = pending();
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(recording(30_000))
      .mockRejectedValueOnce(new Error('RECORDING_NOT_FINISHED'))
      .mockResolvedValueOnce(recording(30_020))
      .mockResolvedValueOnce({ ...recording(30_021), phase: 'SAVED' });
    await client.upload();
    expect(saved).not.toHaveBeenCalled();
    await client.upload();
    const forms = vi
      .mocked(apiFetch)
      .mock.calls.filter(([path]) => path.endsWith('/answer'))
      .map(([, init]) => init!.body as FormData);
    expect(forms).toHaveLength(2);
    expect(forms[0].get('command')).toBe(forms[1].get('command'));
    for (const form of forms) {
      expect((form.get('file') as File).size).toBe(blob.size);
      expect((form.get('file') as File).type).toBe(blob.type);
    }
    expect(saved).toHaveBeenCalledOnce();
    client.dispose();
  });
  it('restores a committed lost ACK from server without another upload or recording', async () => {
    const { client, saved } = pending();
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(recording(30_000))
      .mockRejectedValueOnce(new Error('Lost ACK'))
      .mockResolvedValueOnce({ ...recording(30_010), phase: 'SAVED' });
    await client.upload();
    await client.upload();
    expect(vi.mocked(apiFetch).mock.calls.filter(([p]) => p.endsWith('/answer'))).toHaveLength(1);
    expect(saved).toHaveBeenCalledOnce();
    client.dispose();
  });
  it('DEC045 terminal decoder rejection blocks rather than offering another recording or a fake save', async () => {
    const { client, saved, update } = pending();
    const state = {
      ...recording(30001),
      protocolVersion: 2,
      capture: { phase: 'STOP_CONFIRMED', stoppedAt: 30001 },
    };
    Object.assign(client, { state });
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(state)
      .mockRejectedValueOnce({ status: 409, body: { code: 'AUDIO_REJECTED' } });
    await client.upload();
    expect(saved).not.toHaveBeenCalled();
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'BLOCKED', error: 'AUDIO_REJECTED' }),
    );
    client.dispose();
  });
  it.each(['BLOCKED_REVIEW', 'SUPERSEDED'])(
    'fails closed on server %s without an answer request',
    async (phase) => {
      const { client, saved, update } = pending();
      vi.mocked(apiFetch).mockResolvedValue({ ...recording(30_001), phase });
      await client.upload();
      await client.upload();
      expect(apiFetch).toHaveBeenCalledTimes(1);
      expect(saved).not.toHaveBeenCalled();
      expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'BLOCKED' }));
      client.dispose();
    },
  );
  it('retains the blob on disconnected readiness read and does not post until reconnect', async () => {
    const { client, saved } = pending();
    vi.mocked(apiFetch)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(recording(30_002))
      .mockResolvedValueOnce({ ...recording(30_003), phase: 'SAVED' });
    await client.upload();
    expect(saved).not.toHaveBeenCalled();
    await client.upload();
    expect(saved).toHaveBeenCalledOnce();
    expect(vi.mocked(apiFetch).mock.calls.filter(([p]) => p.endsWith('/answer'))).toHaveLength(1);
    client.dispose();
  });
});
describe('durable S10 authority boundary', () => {
  it('DEC045 retries a lost PREPARE ACK with the identical command, never another grant key', async () => {
    const client = new DurableS10Session('attempt', 'question', vi.fn(), vi.fn());
    Object.assign(client, {
      state: { ...snapshot, protocolVersion: 2, phase: 'RECORDING_READY', deadline: null },
    });
    vi.mocked(apiFetch)
      .mockRejectedValueOnce(new Error('Lost ACK'))
      .mockResolvedValueOnce({
        ...snapshot,
        protocolVersion: 2,
        phase: 'RECORDING_READY',
        deadline: null,
        serverNow: 1000,
        capture: {
          phase: 'ARMED',
          armedAt: 1000,
          armExpiresAt: 4000,
          startedAt: null,
          stoppedAt: null,
          nonce: 'a'.repeat(64),
        },
      });
    const testSeam = client as unknown as { send: (action: string) => Promise<unknown> };
    await testSeam.send('PREPARE');
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(apiFetch).mock.calls[0][1]?.body).toBe(
      vi.mocked(apiFetch).mock.calls[1][1]?.body,
    );
    expect(JSON.parse(String(vi.mocked(apiFetch).mock.calls[0][1]?.body)).action).toBe('PREPARE');
    client.dispose();
  });
  it('restores SAVED from server after browser storage loss without opening microphone or replaying', async () => {
    sessionStorage.clear();
    localStorage.clear();
    vi.mocked(apiFetch).mockResolvedValue({
      ...snapshot,
      phase: 'SAVED',
      playbackUrl: '/api/private-answer',
    });
    const microphone = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: microphone },
      configurable: true,
    });
    const update = vi.fn(),
      saved = vi.fn(),
      client = new DurableS10Session('attempt', 'question', update, saved);
    await client.activate();
    expect(saved).toHaveBeenCalledOnce();
    expect(microphone).not.toHaveBeenCalled();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'SAVED' }));
    client.dispose();
  });
  it.each(['PLAYING', 'BLOCKED_REVIEW', 'RECORDING', 'UPLOADING'])(
    'server %s never becomes a fresh local attempt',
    async (phase) => {
      vi.mocked(apiFetch).mockResolvedValue({ ...snapshot, phase });
      const update = vi.fn(),
        client = new DurableS10Session('attempt', 'question', update, vi.fn());
      await client.activate();
      expect(apiFetch).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'BLOCKED' }));
      client.dispose();
    },
  );
  it('microphone denial before claim consumes no command or local authority', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ...snapshot,
      phase: 'NOT_STARTED',
      epoch: null,
      revision: 0,
      started: 0,
      completed: 0,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')),
      },
      configurable: true,
    });
    const update = vi.fn(),
      client = new DurableS10Session('attempt', 'question', update, vi.fn());
    await client.activate();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'MIC_ERROR' }));
    client.dispose();
  });
  it('late read response after unmount cannot claim or open microphone', async () => {
    let resolve!: (value: unknown) => void;
    vi.mocked(apiFetch).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const mic = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: mic },
      configurable: true,
    });
    const client = new DurableS10Session('attempt', 'question', vi.fn(), vi.fn()),
      pending = client.activate();
    client.dispose();
    resolve({ ...snapshot, phase: 'NOT_STARTED' });
    await pending;
    expect(mic).not.toHaveBeenCalled();
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
  it('an unavailable server fails closed without falling back to sessionStorage', async () => {
    sessionStorage.setItem('smart-english:double-prompt:attempt:question:v1', 'IDLE');
    vi.mocked(apiFetch).mockRejectedValue(new Error('Network partition'));
    const update = vi.fn(),
      client = new DurableS10Session('attempt', 'question', update, vi.fn());
    await client.activate();
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'BLOCKED' }));
    expect(apiFetch).toHaveBeenCalledTimes(1);
    client.dispose();
  });
});
