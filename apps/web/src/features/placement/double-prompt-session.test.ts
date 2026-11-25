import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { DoublePromptSession, type PromptState } from './double-prompt-session';

class TestAudio {
  ended = false;
  controls = false;
  loop = false;
  preload = '';
  onended: (() => void) | null = null;
  onpause: (() => void) | null = null;
  onplaying: (() => void) | null = null;
  onerror: (() => void) | null = null;
  oncanplay: (() => void) | null = null;
  play = vi.fn(() => {
    this.onplaying?.();
    return Promise.resolve();
  });
  pause = vi.fn();
  finish() {
    this.ended = true;
    this.onended?.();
  }
}
class TestRecorder {
  state = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;
  start = vi.fn(() => {
    this.state = 'recording';
  });
  stop = vi.fn(() => {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['synthetic response']) });
    this.onstop?.();
  });
}
function harness(saved = false) {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
  const audio: TestAudio[] = [],
    recorders: TestRecorder[] = [],
    urls: string[] = [],
    states: PromptState[] = [];
  const trackStop = vi.fn();
  const microphone = vi.fn(
    async () => ({ getTracks: () => [{ stop: trackStop }] }) as unknown as MediaStream,
  );
  const recorded = vi.fn();
  const ports = {
    storage,
    now: () => Date.now(),
    microphone,
    audio: (url: string) => {
      urls.push(url);
      const a = new TestAudio();
      audio.push(a);
      return a as unknown as HTMLAudioElement;
    },
    recorder: () => {
      const r = new TestRecorder();
      recorders.push(r);
      return r as unknown as MediaRecorder;
    },
  };
  const create = () =>
    new DoublePromptSession(
      'attempt/question/v1',
      '/api/owned/same.wav',
      ports,
      (s) => states.push(s),
      recorded,
      saved,
    );
  return {
    data,
    storage,
    ports,
    audio,
    urls,
    recorders,
    states,
    recorded,
    trackStop,
    microphone,
    create,
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-30T00:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('double prompt then 30-second response', () => {
  it('plays the same source exactly twice; timer/recorder begin only after second ended', async () => {
    const h = harness(),
      s = h.create();
    await s.activate();
    expect(h.audio).toHaveLength(1);
    expect(h.recorders).toHaveLength(0);
    expect(s.state.deadline).toBeNull();
    await vi.advanceTimersByTimeAsync(12_000);
    h.audio[0].finish();
    expect(h.audio).toHaveLength(2);
    expect(h.recorders).toHaveLength(0);
    expect(s.state.deadline).toBeNull();
    await vi.advanceTimersByTimeAsync(12_000);
    h.audio[1].finish();
    expect(s.state.deadline).toBe(Date.now() + 30_000);
    expect(h.recorders[0].start).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(h.recorded).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.recorded).toHaveBeenCalledTimes(1);
    expect(s.state.phase).toBe('RECORDED');
    await s.activate();
    s.resumePlayback();
    expect(h.audio).toHaveLength(2);
    expect(h.urls).toEqual(['/api/owned/same.wav', '/api/owned/same.wav']);
    s.dispose();
  });
  it('ignores duplicate/stale ended, canplay and late play rejections', async () => {
    const h = harness(),
      s = h.create();
    await s.activate();
    const stale = h.audio[0].onended!;
    h.audio[0].oncanplay?.();
    h.audio[0].oncanplay?.();
    expect(h.audio[0].play).toHaveBeenCalledTimes(1);
    h.audio[0].finish();
    stale();
    stale();
    expect(s.state.completed).toBe(1);
    expect(h.audio).toHaveLength(2);
    const stale2 = h.audio[1].onended!;
    h.audio[1].finish();
    stale2();
    stale2();
    expect(s.state.completed).toBe(2);
    expect(h.recorders).toHaveLength(1);
    expect(h.audio).toHaveLength(2);
    s.dispose();
  });
  it('handles StrictMode setup-cleanup-setup without duplicate playback or leaked mic tracks', async () => {
    const h = harness(),
      first = h.create();
    const pending = first.activate();
    first.dispose();
    const second = h.create();
    await second.activate();
    await pending;
    expect(h.audio).toHaveLength(1);
    expect(h.trackStop).toHaveBeenCalled();
    second.dispose();
  });
  it.each([1, 2])(
    'refresh/revisit during play %s is blocked without replay or timer',
    async (ordinal) => {
      const h = harness(),
        s = h.create();
      await s.activate();
      if (ordinal === 2) h.audio[0].finish();
      s.dispose();
      const restored = h.create();
      await restored.activate();
      expect(restored.state.phase).toBe('BLOCKED');
      expect(h.audio).toHaveLength(ordinal);
      expect(h.recorders).toHaveLength(0);
      restored.dispose();
    },
  );
  it('refresh during recording never replays or fabricates a saved answer', async () => {
    const h = harness(),
      s = h.create();
    await s.activate();
    h.audio[0].finish();
    h.audio[1].finish();
    s.dispose();
    const restored = h.create();
    await restored.activate();
    await vi.advanceTimersByTimeAsync(40_000);
    expect(restored.state.phase).toBe('BLOCKED');
    expect(h.recorded).not.toHaveBeenCalled();
    expect(h.audio).toHaveLength(2);
    restored.dispose();
  });
  it('autoplay-denied requires a gesture, then still has only two successful starts', async () => {
    const h = harness();
    let calls = 0;
    h.ports.audio = (url) => {
      h.urls.push(url);
      const a = new TestAudio();
      if (calls++ === 0)
        a.play = vi.fn(() =>
          Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })),
        );
      h.audio.push(a);
      return a as unknown as HTMLAudioElement;
    };
    const s = h.create();
    await s.activate();
    await Promise.resolve();
    expect(s.state.phase).toBe('NEEDS_GESTURE');
    expect(s.state.started).toBe(0);
    s.resumePlayback();
    h.audio[1].finish();
    h.audio[2].finish();
    s.resumePlayback();
    expect(s.state.started).toBe(2);
    expect(s.state.completed).toBe(2);
    expect(h.recorders).toHaveLength(1);
    s.dispose();
  });
  it('mic denial retries before audio; playback errors never unlock recording', async () => {
    const h = harness();
    h.microphone.mockRejectedValueOnce(new Error('permission'));
    const s = h.create();
    await s.activate();
    expect(s.state.phase).toBe('MIC_ERROR');
    expect(h.audio).toHaveLength(0);
    await s.activate();
    h.audio[0].onerror?.();
    await s.activate();
    s.resumePlayback();
    expect(s.state.phase).toBe('BLOCKED');
    expect(h.audio).toHaveLength(1);
    expect(h.recorders).toHaveLength(0);
    expect(s.state.deadline).toBeNull();
    s.dispose();
  });
  it('recording failure retries only inside the original deadline, with no third question play', async () => {
    const h = harness(),
      s = h.create();
    await s.activate();
    h.audio[0].finish();
    h.audio[1].finish();
    const deadline = s.state.deadline;
    await vi.advanceTimersByTimeAsync(5_000);
    h.recorders[0].onerror?.();
    expect(s.state.phase).toBe('RECORDING_ERROR');
    await s.retryRecording();
    expect(s.state.deadline).toBe(deadline);
    expect(h.audio).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(25_000);
    expect(h.recorded).toHaveBeenCalledTimes(1);
    s.dispose();
  });
  it('expired recording retry, pause and bad recovery storage all fail closed', async () => {
    const h = harness(),
      s = h.create();
    await s.activate();
    h.audio[0].finish();
    h.audio[1].finish();
    h.recorders[0].onerror?.();
    await vi.advanceTimersByTimeAsync(31_000);
    await s.retryRecording();
    expect(s.state.phase).toBe('BLOCKED');
    expect(h.recorded).not.toHaveBeenCalled();
    s.dispose();
    const h2 = harness(),
      s2 = h2.create();
    await s2.activate();
    h2.audio[0].onpause?.();
    expect(s2.state.phase).toBe('BLOCKED');
    s2.dispose();
    h2.data.set('attempt/question/v1', 'invalid json');
    expect(h2.create().state.phase).toBe('BLOCKED');
  });
  it('a server-saved answer on refresh never replays the question', async () => {
    const h = harness(true),
      s = h.create();
    await s.activate();
    expect(s.state.phase).toBe('SAVED');
    expect(h.audio).toHaveLength(0);
    s.dispose();
  });
  it('late microphone resolution, missing source and unavailable storage cannot start stray media', async () => {
    const h = harness();
    let resolve!: (stream: MediaStream) => void;
    h.microphone.mockImplementationOnce(
      () =>
        new Promise<MediaStream>((done) => {
          resolve = done;
        }),
    );
    const s = h.create();
    const pending = s.activate();
    s.suspend();
    resolve({ getTracks: () => [{ stop: h.trackStop }] } as unknown as MediaStream);
    await pending;
    expect(h.audio).toHaveLength(0);
    expect(h.trackStop).toHaveBeenCalled();
    s.dispose();
    const h2 = harness();
    h2.storage.setItem = () => {
      throw new Error('blocked storage');
    };
    const s2 = h2.create();
    await s2.activate();
    expect(s2.state.phase).toBe('BLOCKED');
    expect(h2.audio).toHaveLength(0);
    s2.dispose();
  });
  it('constructor/start recorder failure never yields an answer and can only use remaining time', async () => {
    const h = harness();
    h.ports.recorder = () => {
      throw new Error('unsupported recording');
    };
    const s = h.create();
    await s.activate();
    h.audio[0].finish();
    h.audio[1].finish();
    expect(s.state.phase).toBe('RECORDING_ERROR');
    expect(h.recorded).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    await s.retryRecording();
    expect(s.state.phase).toBe('BLOCKED');
    expect(h.audio).toHaveLength(2);
    s.dispose();
  });
});
