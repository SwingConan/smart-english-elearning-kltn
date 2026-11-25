export type PromptPhase =
  | 'IDLE'
  | 'PREPARING'
  | 'PLAYING'
  | 'NEEDS_GESTURE'
  | 'MIC_ERROR'
  | 'RECORDING'
  | 'RECORDING_ERROR'
  | 'RECORDED'
  | 'SAVED'
  | 'BLOCKED';
export type PromptState = {
  version: 1;
  source: string;
  phase: PromptPhase;
  started: number;
  completed: number;
  deadline: number | null;
  error: string | null;
};
export type PromptPorts = {
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  audio: (source: string) => HTMLAudioElement;
  microphone: () => Promise<MediaStream>;
  recorder: (stream: MediaStream) => MediaRecorder;
  now: () => number;
};

/** Per-tab recovery only. The server still owns submission and media ACL.
 * Interrupted/unknown playback is fail-closed: never guess a completed play.
 */
export class DoublePromptSession {
  state: PromptState;
  private live = true;
  private generation = 0;
  private audio: HTMLAudioElement | null = null;
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chunks: Blob[] = [];

  constructor(
    private key: string,
    source: string,
    private ports: PromptPorts,
    private notify: (state: PromptState) => void,
    private recorded: (blob: Blob) => void,
    saved = false,
  ) {
    this.state = {
      version: 1,
      source,
      phase: 'IDLE',
      started: 0,
      completed: 0,
      deadline: null,
      error: null,
    };
    try {
      const raw = ports.storage.getItem(key);
      if (raw) {
        const value = JSON.parse(raw) as PromptState;
        if (
          value.version !== 1 ||
          value.source !== source ||
          !Number.isInteger(value.started) ||
          !Number.isInteger(value.completed) ||
          value.started < value.completed ||
          value.started > 2 ||
          value.completed < 0
        )
          throw new Error('invalid');
        this.state = value;
        if (value.phase === 'PREPARING' && value.started === 0) this.state.phase = 'IDLE';
        else if (!['IDLE', 'NEEDS_GESTURE', 'MIC_ERROR', 'SAVED'].includes(value.phase)) {
          this.state.phase = 'BLOCKED';
          this.state.error = 'INTERRUPTED_SESSION';
        }
        if (this.state.phase === 'NEEDS_GESTURE') this.state.phase = 'IDLE';
      }
    } catch {
      this.state.phase = 'BLOCKED';
      this.state.error = 'RECOVERY_UNAVAILABLE';
    }
    if (saved)
      this.state = { ...this.state, phase: 'SAVED', started: 2, completed: 2, error: null };
  }

  private update(value: Partial<PromptState>) {
    if (!this.live) return false;
    this.state = { ...this.state, ...value };
    try {
      this.ports.storage.setItem(this.key, JSON.stringify(this.state));
    } catch {
      this.state = { ...this.state, phase: 'BLOCKED', error: 'RECOVERY_UNAVAILABLE' };
      this.clearAudio();
      this.releaseRecording();
    }
    this.notify({ ...this.state });
    return this.state.phase !== 'BLOCKED';
  }

  async activate() {
    if (!this.live || !['IDLE', 'MIC_ERROR'].includes(this.state.phase)) return;
    if (!this.state.source) {
      this.block('QUESTION_AUDIO_MISSING');
      return;
    }
    if (!this.update({ phase: 'PREPARING', error: null })) return;
    const generation = ++this.generation;
    try {
      const stream = await this.ports.microphone();
      if (!this.live || generation !== this.generation || this.state.phase !== 'PREPARING') {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      this.playNext();
    } catch {
      if (this.live && generation === this.generation)
        this.update({ phase: 'MIC_ERROR', error: 'MICROPHONE_UNAVAILABLE' });
    }
  }

  private clearAudio() {
    const audio = this.audio;
    this.audio = null;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.onpause = null;
      audio.onplaying = null;
      audio.oncanplay = null;
      audio.pause();
    }
  }

  private releaseRecording() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const recorder = this.recorder;
    this.recorder = null;
    if (recorder) {
      recorder.onstop = null;
      recorder.onerror = null;
      recorder.ondataavailable = null;
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          /* already stopped */
        }
      }
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  private block(error: string) {
    ++this.generation;
    this.clearAudio();
    this.releaseRecording();
    this.chunks = [];
    this.update({ phase: 'BLOCKED', error });
  }

  private playNext() {
    if (!this.live || this.state.completed >= 2 || this.state.started !== this.state.completed)
      return;
    const ordinal = this.state.started + 1;
    this.clearAudio();
    if (!this.update({ phase: 'PLAYING', started: ordinal, error: null })) {
      this.releaseRecording();
      return;
    }
    const generation = this.generation;
    let audio: HTMLAudioElement;
    try {
      audio = this.ports.audio(this.state.source);
    } catch {
      this.block('QUESTION_AUDIO_ERROR');
      return;
    }
    audio.preload = 'auto';
    audio.controls = false;
    audio.loop = false;
    this.audio = audio;
    let audible = false;
    const current = () =>
      this.live &&
      generation === this.generation &&
      this.audio === audio &&
      this.state.phase === 'PLAYING' &&
      this.state.started === ordinal;
    audio.onplaying = () => {
      if (current()) audible = true;
    };
    // canplay can fire repeatedly. play() is issued once per reserved ordinal.
    audio.oncanplay = () => undefined;
    audio.onerror = () => {
      if (current()) this.block('QUESTION_AUDIO_ERROR');
    };
    audio.onpause = () => {
      if (current() && !audio.ended) this.block('QUESTION_AUDIO_INTERRUPTED');
    };
    audio.onended = () => {
      if (!current() || !audio.ended || this.state.completed !== ordinal - 1) return;
      this.clearAudio();
      if (!this.update({ completed: ordinal })) {
        this.releaseRecording();
        return;
      }
      if (ordinal === 1) this.playNext();
      else {
        if (!this.update({ deadline: this.ports.now() + 30_000 })) {
          this.releaseRecording();
          return;
        }
        this.startRecording();
      }
    };
    try {
      void audio.play().catch((error: unknown) => {
        if (!current()) return;
        if (!audible && error instanceof Error && error.name === 'NotAllowedError') {
          this.clearAudio();
          this.update({
            phase: 'NEEDS_GESTURE',
            started: ordinal - 1,
            error: 'AUTOPLAY_REQUIRES_GESTURE',
          });
        } else this.block('QUESTION_AUDIO_ERROR');
      });
    } catch {
      if (current()) this.block('QUESTION_AUDIO_ERROR');
    }
  }

  resumePlayback() {
    if (this.live && this.state.phase === 'NEEDS_GESTURE') this.playNext();
  }

  private startRecording() {
    if (
      !this.live ||
      this.state.completed !== 2 ||
      this.state.started !== 2 ||
      !this.stream ||
      !this.state.deadline
    )
      return;
    const remaining = this.state.deadline - this.ports.now();
    if (remaining <= 0) {
      this.block('RESPONSE_WINDOW_EXPIRED');
      return;
    }
    try {
      const recorder = this.ports.recorder(this.stream);
      this.recorder = recorder;
      this.chunks = [];
      const generation = this.generation;
      const current = () =>
        this.live && generation === this.generation && this.recorder === recorder;
      recorder.ondataavailable = (event) => {
        if (current() && event.data.size) this.chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (current()) this.recordingError();
      };
      recorder.onstop = () => {
        if (!current() || this.state.phase !== 'RECORDING') return;
        if (this.ports.now() < this.state.deadline!) {
          this.recordingError();
          return;
        }
        const blob = new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' });
        this.releaseRecording();
        if (!blob.size) {
          this.update({ phase: 'BLOCKED', error: 'RECORDING_EMPTY' });
          return;
        }
        if (this.update({ phase: 'RECORDED', error: null })) this.recorded(blob);
      };
      if (!this.update({ phase: 'RECORDING', error: null })) {
        this.releaseRecording();
        return;
      }
      recorder.start();
      this.timer = setTimeout(() => {
        if (!current() || this.state.phase !== 'RECORDING') return;
        try {
          recorder.stop();
        } catch {
          this.recordingError();
        }
      }, remaining);
    } catch {
      this.recordingError();
    }
  }

  private recordingError() {
    this.releaseRecording();
    this.chunks = [];
    this.update({ phase: 'RECORDING_ERROR', error: 'RECORDING_FAILED' });
  }

  async retryRecording() {
    if (!this.live || this.state.phase !== 'RECORDING_ERROR') return;
    if (!this.state.deadline || this.ports.now() >= this.state.deadline) {
      this.block('RESPONSE_WINDOW_EXPIRED');
      return;
    }
    if (!this.update({ phase: 'PREPARING' })) return;
    const generation = ++this.generation;
    try {
      const stream = await this.ports.microphone();
      if (!this.live || generation !== this.generation) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      this.startRecording();
    } catch {
      if (this.live && generation === this.generation) this.recordingError();
    }
  }

  saved() {
    this.update({ phase: 'SAVED', error: null });
  }

  suspend() {
    if (
      ['PREPARING', 'PLAYING', 'RECORDING', 'NEEDS_GESTURE', 'RECORDING_ERROR'].includes(
        this.state.phase,
      )
    ) {
      if (this.state.phase === 'PREPARING' && this.state.started === 0) {
        ++this.generation;
        this.releaseRecording();
        this.update({ phase: 'IDLE' });
      } else this.block('NAVIGATION_INTERRUPTED');
    }
  }

  dispose() {
    this.suspend();
    this.live = false;
    ++this.generation;
    this.clearAudio();
    this.releaseRecording();
  }
}
