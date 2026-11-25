import { apiFetch, apiUrl } from '@/lib/api-client';
export type S10State = {
  protocolVersion?: number;
  capture?: {
    phase: string;
    armedAt: number;
    armExpiresAt: number;
    startedAt: number | null;
    stoppedAt: number | null;
    stopDigest?: string | null;
    nonce?: string;
  } | null;
  epoch: string | null;
  revision: number;
  phase: string;
  started: number;
  completed: number;
  deadline: number | null;
  serverNow: number;
  mediaSha256: string | null;
  playbackUrl: string | null;
};
type Command = {
  action: string;
  key: string;
  epoch: string | null;
  revision: number;
  tabId: string;
  token: string;
  nonce?: string;
  digest?: string;
};
export type S10ClientState = {
  phase: string;
  started: number;
  remaining: number;
  error?: string;
  playbackUrl?: string | null;
};
export class DurableS10Session {
  private readonly tabId = crypto.randomUUID();
  private readonly token = crypto.randomUUID();
  private state: S10State | null = null;
  private disposed = false;
  private failed = false;
  private claimed = false;
  private busy = false;
  private resuming = false;
  private queue: Promise<unknown> = Promise.resolve();
  private audio: HTMLAudioElement | null = null;
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private url: string | null = null;
  private nonce: string | undefined;
  private blob: Blob | null = null;
  private uploadCommand: Command | null = null;
  private heartbeat?: ReturnType<typeof setInterval>;
  private timer?: ReturnType<typeof setInterval>;
  private stopAt = 0;
  private nativeStartedAt = 0;
  private armValidUntil = 0;
  private captureNonce?: string;
  private stoppedCommand: Command | null = null;
  private polling = false;
  private hardStop?: ReturnType<typeof setTimeout>;
  private armStop?: ReturnType<typeof setTimeout>;
  private readonly base: string;
  private readonly pagehide = () => this.dispose();
  constructor(
    attemptId: string,
    questionId: string,
    private readonly update: (state: S10ClientState) => void,
    private readonly saved: () => void,
  ) {
    this.base = `/placement/attempts/${encodeURIComponent(attemptId)}/tasks/${encodeURIComponent(questionId)}/s10`;
    window.addEventListener('pagehide', this.pagehide);
  }
  private show(phase: string, error?: string) {
    if (!this.disposed)
      this.update({
        phase,
        started: this.state?.started ?? 0,
        remaining: Math.max(0, Math.ceil((this.stopAt - performance.now()) / 1000)),
        error,
        playbackUrl: this.state?.playbackUrl,
      });
  }
  private command(action: string, extra: Partial<Command> = {}): Command {
    return {
      action,
      key: crypto.randomUUID(),
      epoch: this.state?.epoch ?? null,
      revision: this.state?.revision ?? 0,
      tabId: this.tabId,
      token: this.token,
      ...extra,
    };
  }
  private send(action: string, extra: Partial<Command> = {}): Promise<S10State> {
    const work = this.queue.then(async () => {
      if (this.disposed || this.failed) throw new Error('DISPOSED');
      let started = performance.now();
      const command =
        action === 'STOPPED'
          ? (this.stoppedCommand ??= this.command(action, extra))
          : this.command(action, extra);
      let result!: S10State;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          started = performance.now();
          result = await apiFetch<S10State>(this.base + '/commands', {
            method: 'POST',
            body: JSON.stringify(command),
            ...(['PREPARE', 'STARTED', 'STOPPED'].includes(action)
              ? { signal: AbortSignal.timeout(1400) }
              : {}),
          });
          break;
        } catch (error) {
          if (this.fatalResponse(error)) throw error;
          if (
            !['PREPARE', 'STARTED', 'STOPPED'].includes(action) ||
            attempt === 1 ||
            (typeof error === 'object' &&
              error !== null &&
              'status' in error &&
              Number(error.status) < 500)
          )
            throw error;
        }
      }
      this.state = result;
      if (action === 'PREPARE' && result.capture)
        this.armValidUntil = started + Math.max(0, result.capture.armExpiresAt - result.serverNow);
      if (result.deadline !== null) {
        const bound =
          performance.now() +
          Math.max(0, result.deadline - result.serverNow - (performance.now() - started));
        this.stopAt = this.stopAt ? Math.min(this.stopAt, bound) : bound;
      }
      return result;
    });
    this.queue = work.catch(() => undefined);
    return work;
  }
  async activate() {
    if (this.disposed || this.failed || this.busy) return;
    this.busy = true;
    this.show('PREPARING');
    try {
      this.state = await apiFetch<S10State>(this.base);
      if (this.disposed) return;
      if (this.state.phase === 'SAVED') {
        this.show('SAVED');
        this.saved();
        return;
      }
      if (this.state.phase !== 'NOT_STARTED') {
        this.show('BLOCKED', 'SERVER_RECOVERY_REQUIRED');
        return;
      }
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        this.show('MIC_ERROR', 'MICROPHONE_DENIED');
        return;
      }
      if (this.disposed) {
        this.stopTracks();
        return;
      }
      await this.send('CLAIM');
      this.claimed = true;
      if (this.disposed || this.failed) {
        this.interrupt();
        return;
      }
      this.heartbeat = setInterval(() => {
        void this.send('HEARTBEAT').catch(() => this.block('CONNECTION_UNCERTAIN'));
      }, 15_000);
      await this.playNext();
    } catch {
      this.block('CONNECTION_OR_LEASE_UNCERTAIN');
    } finally {
      this.busy = false;
    }
  }
  private async playNext() {
    if (this.disposed) return;
    this.nonce = crypto.randomUUID();
    await this.send('START_PLAY', { nonce: this.nonce });
    const response = await fetch(apiUrl(this.base + '/media'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.command('START_PLAY', { nonce: this.nonce })),
    });
    if (!response.ok) throw new Error('MEDIA_DENIED');
    const bytes = await response.arrayBuffer();
    const actual = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('');
    if (actual !== this.state?.mediaSha256) throw new Error('MEDIA_HASH');
    if (this.disposed) return;
    // Verify both permits against the same immutable snapshot and play one local WAV URL.
    if (!this.url) this.url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
    if (!this.audio) {
      this.audio = new Audio(this.url);
      this.audio.onended = () => {
        void this.ended();
      };
      this.audio.onerror = () => this.block('AUDIO_ERROR');
    }
    this.audio.currentTime = 0;
    this.show('PLAYING');
    try {
      await this.audio.play();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotAllowedError') {
        await this.send('AUTOPLAY_DENIED', { nonce: this.nonce });
        this.show('NEEDS_GESTURE');
      } else throw e;
    }
  }
  resumePlayback() {
    if (
      !this.audio ||
      this.disposed ||
      this.failed ||
      this.resuming ||
      this.state?.phase !== 'WAITING_GESTURE'
    )
      return;
    this.resuming = true;
    this.show('PLAYING');
    // Invoke play within the trusted gesture; no extra ordinal is reserved.
    const playing = this.audio.play();
    void Promise.all([this.send('RESUME_PLAY', { nonce: this.nonce }), playing])
      .then(() => this.show('PLAYING'))
      .catch(() => this.block('AUDIO_RESUME_FAILED'))
      .finally(() => {
        this.resuming = false;
      });
  }
  private async ended() {
    if (this.disposed) return;
    try {
      const result = await this.send('COMPLETE_PLAY', { nonce: this.nonce });
      if (this.disposed) return;
      if (result.completed === 1) {
        await this.playNext();
        return;
      }
      if (result.protocolVersion === 2) {
        const grant = await this.send('PREPARE');
        if (
          !grant.capture?.nonce ||
          grant.capture.phase !== 'ARMED' ||
          grant.serverNow > grant.capture.armExpiresAt ||
          performance.now() >= this.armValidUntil
        )
          throw new Error('ARM_UNAVAILABLE');
        this.captureNonce = grant.capture.nonce;
        this.armStop = setTimeout(
          () => {
            if (!this.state?.capture?.startedAt) this.block('ARM_CONFIRMATION_UNCERTAIN');
          },
          Math.max(0, this.armValidUntil - performance.now()),
        );
      } else await this.send('BEGIN_RECORDING');
      if (this.disposed || !this.stream) return;
      this.recorder = new MediaRecorder(this.stream);
      const chunks: BlobPart[] = [];
      this.recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      this.recorder.onerror = () => this.block('RECORDING_ERROR');
      this.recorder.onstop = async () => {
        if (this.hardStop) clearTimeout(this.hardStop);
        this.stopTracks();
        if (this.disposed) return;
        const blob = new Blob(chunks, { type: this.recorder?.mimeType || 'audio/webm' });
        if (!blob.size) {
          this.block('EMPTY_RECORDING');
          return;
        }
        this.blob = blob;
        if (this.state?.protocolVersion === 2) {
          this.show('CONFIRMING');
          try {
            await this.confirmStopped();
          } catch {
            if (this.failed) return;
            this.show('UPLOAD_RETRY', 'STOPPED_ACK_UNCERTAIN_SAME_BLOB_RETAINED');
            return;
          }
        }
        this.show('RECORDED');
      };
      this.stream.getAudioTracks().forEach((t) => {
        t.onended = () => {
          if (this.recorder?.state === 'recording') this.block('MICROPHONE_LOST');
        };
      });
      if (this.state?.protocolVersion === 2)
        this.recorder.onstart = () => {
          this.nativeStartedAt = performance.now();
          this.hardStop = setTimeout(() => this.block('CAPTURE_35S_LIMIT'), 35000);
          void this.send('STARTED', { nonce: this.captureNonce })
            .then(() => {
              if (this.armStop) clearTimeout(this.armStop);
            })
            .catch(() => this.block('STARTED_UNCERTAIN'));
        };
      this.recorder.start();
      this.show('RECORDING');
      this.timer = setInterval(() => {
        this.show('RECORDING');
        if (this.state?.protocolVersion === 2) {
          if (this.state.capture?.startedAt && performance.now() >= this.stopAt)
            void this.finishV2();
          return;
        }
        if (performance.now() >= this.stopAt) {
          if (this.timer) clearInterval(this.timer);
          if (this.recorder?.state === 'recording') this.recorder.stop();
        }
      }, 50);
    } catch {
      this.block('PLAYBACK_OR_RECORDING_UNCERTAIN');
    }
  }
  private async finishV2() {
    if (this.polling || this.disposed || this.failed || this.recorder?.state !== 'recording')
      return;
    this.polling = true;
    try {
      const current = await apiFetch<S10State>(this.base);
      if (this.disposed || this.failed) return;
      if (
        current.epoch !== this.state?.epoch ||
        current.phase === 'BLOCKED_REVIEW' ||
        !current.deadline
      ) {
        this.block('SERVER_CAPTURE_UNSAFE');
        return;
      }
      this.state = current;
      if (current.serverNow < current.deadline) return;
      // Use only the approved termination tail. This is a capture floor, never
      // server authorization; STOPPED and original decoded samples are checked by PG/API.
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, this.nativeStartedAt + 30100 - performance.now())),
      );
      if (this.disposed || this.failed) return;
      if (this.timer) clearInterval(this.timer);
      if (this.recorder?.state === 'recording') this.recorder.stop();
    } catch {
      /* Keep original recording only within the existing35s hard cap. */
    } finally {
      this.polling = false;
    }
  }
  private async confirmStopped() {
    if (
      !this.blob ||
      this.state?.capture?.phase === 'STOP_CONFIRMED' ||
      this.state?.phase === 'SAVED'
    )
      return;
    const bytes = await this.blob.arrayBuffer();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('');
    let result: S10State;
    try {
      result = await this.send('STOPPED', { nonce: this.captureNonce, digest });
    } catch (error) {
      if (this.failed) throw error;
      const stored = await apiFetch<S10State>(this.base);
      if (stored.epoch !== this.state?.epoch || stored.phase === 'BLOCKED_REVIEW') {
        this.block('SERVER_RECOVERY_REQUIRED');
        throw error;
      }
      if (stored.capture?.phase !== 'STOP_CONFIRMED' || stored.capture.stopDigest !== digest)
        throw error;
      this.state = stored;
      result = stored;
    }
    if (result.capture?.phase !== 'STOP_CONFIRMED') throw new Error('STOPPED_UNCONFIRMED');
    // Capture has ended and the server now pins the upload-only expiry to D.
    // Idle heartbeats cannot renew that allowance and must not discard a stopped
    // original merely because the API restarts before the user uploads it.
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.hardStop) clearTimeout(this.hardStop);
  }
  private fatalResponse(error: unknown) {
    if (this.state?.protocolVersion !== 2 || typeof error !== 'object' || !error) return false;
    const body = 'body' in error ? (error.body as { code?: string }) : null;
    const code = body?.code;
    if (
      ('status' in error && error.status === 401) ||
      (code &&
        [
          'ARM_EXPIRED',
          'STOPPED_TOO_LATE',
          'BLOCKED_REVIEW',
          'STALE_EPOCH',
          'LEASE_EXPIRED',
          'S10_PROTOCOL_DISABLED',
          'AUDIO_REJECTED',
          'AUDIO_FILE_INVALID',
          'ARM_NONCE_INVALID',
        ].includes(code))
    ) {
      this.block(code ?? 'SESSION_REVOKED');
      return true;
    }
    return false;
  }
  async upload() {
    if (!this.blob || this.busy || this.disposed || this.failed) return;
    this.busy = true;
    this.show('UPLOADING');
    try {
      if (this.state?.protocolVersion === 2) await this.confirmStopped();
      if (!this.uploadCommand) {
        if (this.heartbeat) clearInterval(this.heartbeat);
        await this.queue;
        const bytes = await this.blob.arrayBuffer();
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
          .map((x) => x.toString(16).padStart(2, '0'))
          .join('');
        this.uploadCommand = this.command('UPLOAD', {
          digest,
          ...(this.captureNonce ? { nonce: this.captureNonce } : {}),
        });
      }
      // Stopping capture is deliberately conservative. It does not prove that
      // PostgreSQL's recording deadline has elapsed (nor does the client clock).
      // Wait with the recorder stopped and retain the original blob/command.
      // Reads do not renew a lease, advance a revision or grant recording time.
      let ready = false;
      for (let read = 0; read < 20; read++) {
        const current = await apiFetch<S10State>(this.base);
        if (this.disposed || this.failed) return;
        if (current.epoch !== this.uploadCommand.epoch) {
          this.block('SERVER_RECOVERY_REQUIRED');
          return;
        }
        this.state = current;
        if (current.phase === 'SAVED') {
          this.blob = null;
          this.show('SAVED');
          this.saved();
          return;
        }
        if (!['RECORDING', 'UPLOADING', 'UPLOAD_RETRY'].includes(current.phase)) {
          this.block('SERVER_RECOVERY_REQUIRED');
          return;
        }
        if (current.deadline === null || !Number.isFinite(current.serverNow)) {
          this.block('INVALID_SERVER_DEADLINE');
          return;
        }
        if (current.serverNow >= current.deadline) {
          ready = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (!ready) throw new Error('SERVER_RECORDING_NOT_FINISHED');
      if (this.disposed || this.failed || !this.blob) return;
      const form = new FormData();
      form.append('command', JSON.stringify(this.uploadCommand));
      form.append('file', this.blob, 'response.webm');
      this.state = await apiFetch<S10State>(this.base + '/answer', { method: 'POST', body: form });
      if (this.state.phase !== 'SAVED') throw new Error('SAVE_UNCERTAIN');
      this.blob = null;
      this.show('SAVED');
      this.saved();
    } catch (error) {
      if (this.failed || this.fatalResponse(error)) return;
      this.show('UPLOAD_RETRY', 'UPLOAD_FAILED_SAME_BLOB_RETAINED');
    } finally {
      this.busy = false;
    }
  }
  private stopTracks() {
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    this.stream = null;
  }
  private block(error: string) {
    if (this.disposed) return;
    this.show('BLOCKED', error);
    this.failed = true;
    this.interrupt();
    this.release();
  }
  private interrupt() {
    if (!this.claimed || this.state?.phase === 'SAVED') return;
    void fetch(apiUrl(this.base + '/commands'), {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.command('INTERRUPT')),
    }).catch(() => undefined);
  }
  private release() {
    if (this.timer) clearInterval(this.timer);
    if (this.hardStop) clearTimeout(this.hardStop);
    if (this.armStop) clearTimeout(this.armStop);
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
    }
    if (this.recorder) {
      this.recorder.onstop = null;
      this.recorder.onerror = null;
      if (this.recorder.state === 'recording') this.recorder.stop();
    }
    this.stopTracks();
  }
  dispose() {
    if (this.disposed) return;
    this.interrupt();
    this.disposed = true;
    this.release();
    if (this.url) URL.revokeObjectURL(this.url);
    this.blob = null;
    window.removeEventListener('pagehide', this.pagehide);
  }
}
