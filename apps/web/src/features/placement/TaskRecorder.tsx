import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
type Command = {
  idempotencyKey: string;
  expectedLockVersion: number;
  tabId: string;
  token: string;
};
// Native PCM capture, one server start receipt. Refresh never grants a replacement capture.
export function TaskRecorder({
  attemptId,
  questionId,
  lockVersion,
  readyAt,
  serverTime,
  initialState,
  onSaved,
  onBusy,
}: {
  attemptId: string;
  questionId: string;
  lockVersion: number;
  readyAt: number;
  serverTime: number;
  initialState: string | null;
  onSaved: () => void;
  onBusy: (v: boolean) => void;
}) {
  const [state, setState] = useState(
      initialState === 'SAVED' ? 'SAVED' : initialState === 'STARTED' ? 'BLOCKED' : 'IDLE',
    ),
    [error, setError] = useState(''),
    [ready, setReady] = useState(serverTime >= readyAt);
  const cleanup = useRef<() => void>(() => {}),
    stop = useRef<() => void>(() => {}),
    claim = useRef<Command | null>(null),
    body = useRef<{ blob: Blob; command: Command } | null>(null),
    clock = useRef({ server: serverTime, at: 0 }),
    alive = useRef(true),
    callbacks = useRef({ onSaved, onBusy });
  useEffect(() => {
    callbacks.current = { onSaved, onBusy };
  }, [onSaved, onBusy]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cleanup.current();
      callbacks.current.onBusy(false);
    };
  }, []);
  useEffect(() => {
    clock.current = { server: serverTime, at: performance.now() };
    const t = setTimeout(() => setReady(true), Math.max(0, readyAt - serverTime));
    return () => clearTimeout(t);
  }, [serverTime, readyAt]);
  useEffect(() => {
    callbacks.current.onBusy(
      ['OPENING', 'RECORDING', 'RECORDED', 'UPLOADING', 'RETRY', 'BEGIN_RETRY'].includes(state),
    );
  }, [state]);
  const upload = async () => {
    if (!body.current) return;
    setState('UPLOADING');
    setError('');
    try {
      const form = new FormData(),
        b = body.current;
      for (const [k, v] of Object.entries(b.command)) form.append(k, String(v));
      form.append('file', b.blob, 'original.wav');
      await apiFetch('/v2/placement/workflow/attempts/' + attemptId + '/recordings/' + questionId, {
        method: 'POST',
        body: form,
      });
      body.current = null;
      setState('SAVED');
      callbacks.current.onSaved();
    } catch {
      setState('RETRY');
      setError(
        'Chưa nhận ACK lưu. Giữ WAV và receipt gốc để thử lại; không mở lượt ghi mới hoặc chấm 0.',
      );
    }
  };
  const start = async () => {
    setState('OPENING');
    setError('');
    let acknowledged = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      cleanup.current = () => stream.getTracks().forEach((t) => t.stop());
      claim.current ??= {
        idempotencyKey: crypto.randomUUID(),
        expectedLockVersion: lockVersion,
        tabId: crypto.randomUUID(),
        token: crypto.randomUUID(),
      };
      const receipt = await apiFetch<{ lockVersion: number; recordingDeadline: string }>(
        '/v2/placement/workflow/attempts/' + attemptId + '/recordings/' + questionId + '/begin',
        { method: 'POST', body: JSON.stringify(claim.current) },
      );
      acknowledged = true;
      const remaining =
        Date.parse(receipt.recordingDeadline) -
        clock.current.server -
        (performance.now() - clock.current.at);
      if (!alive.current || remaining <= 0) {
        cleanup.current();
        if (alive.current) setState('BLOCKED');
        return;
      }
      const context = new AudioContext();
      await context.resume();
      const source = context.createMediaStreamSource(stream),
        processor = context.createScriptProcessor(4096, 1, 1),
        samples: Float32Array[] = [];
      let ended = false;
      processor.onaudioprocess = (e) => {
        if (!ended) samples.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(context.destination);
      const finish = () => {
        if (ended) return;
        ended = true;
        const n = samples.reduce((a, b) => a + b.length, 0),
          buffer = new ArrayBuffer(44 + n * 2),
          v = new DataView(buffer),
          str = (at: number, s: string) =>
            [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
        str(0, 'RIFF');
        v.setUint32(4, 36 + n * 2, true);
        str(8, 'WAVEfmt ');
        v.setUint32(16, 16, true);
        v.setUint16(20, 1, true);
        v.setUint16(22, 1, true);
        v.setUint32(24, context.sampleRate, true);
        v.setUint32(28, context.sampleRate * 2, true);
        v.setUint16(32, 2, true);
        v.setUint16(34, 16, true);
        str(36, 'data');
        v.setUint32(40, n * 2, true);
        let at = 44;
        for (const b of samples)
          for (const x of b) {
            v.setInt16(at, Math.max(-1, Math.min(1, x)) * (x < 0 ? 32768 : 32767), true);
            at += 2;
          }
        cleanup.current();
        body.current = {
          blob: new Blob([buffer], { type: 'audio/wav' }),
          command: {
            ...claim.current!,
            idempotencyKey: crypto.randomUUID(),
            expectedLockVersion: receipt.lockVersion,
          },
        };
        setState('RECORDED');
      };
      const timer = setTimeout(
        finish,
        Math.max(
          0,
          Date.parse(receipt.recordingDeadline) -
            clock.current.server -
            (performance.now() - clock.current.at),
        ),
      );
      cleanup.current = () => {
        clearTimeout(timer);
        ended = true;
        processor.disconnect();
        source.disconnect();
        stream.getTracks().forEach((t) => {
          t.onended = null;
          t.stop();
        });
        void context.close();
      };
      stop.current = finish;
      for (const t of stream.getTracks())
        t.onended = () => {
          cleanup.current();
          setState('BLOCKED');
          setError('Microphone bị ngắt sau receipt bắt đầu. Báo sự cố; không ghi lại.');
        };
      setState('RECORDING');
    } catch {
      cleanup.current();
      setState(acknowledged ? 'BLOCKED' : claim.current ? 'BEGIN_RETRY' : 'ERROR');
      setError(
        acknowledged
          ? 'Bản ghi bị gián đoạn sau khi bắt đầu. Cần học vụ kiểm tra.'
          : 'Chưa mở bản ghi. Nếu mất ACK, chỉ thử lại đúng receipt trong deadline gốc.',
      );
    }
  };
  return (
    <section className="space-y-3 rounded-xl bg-slate-50 p-4">
      <p role="status">
        {state === 'RECORDING'
          ? 'Đang ghi PCM WAV gốc'
          : state === 'SAVED'
            ? 'Đã lưu WAV gốc'
            : state}
      </p>
      {error && <p role="alert">{error}</p>}
      {state === 'BLOCKED' && (
        <p role="alert">
          Không thể khôi phục an toàn bản ghi đang mở. Báo sự cố để giữ bài, không ghi lại hoặc tự
          chấm 0.
        </p>
      )}
      {['IDLE', 'ERROR', 'BEGIN_RETRY'].includes(state) && (
        <button
          className="rounded-lg border px-4 py-2"
          disabled={!ready}
          onClick={() => void start()}
        >
          {state === 'BEGIN_RETRY' ? 'Thử lại đúng receipt bắt đầu' : 'Bắt đầu ghi âm'}
        </button>
      )}
      {state === 'RECORDING' && (
        <button className="rounded-lg border px-4 py-2" onClick={() => stop.current()}>
          Kết thúc ghi âm
        </button>
      )}
      {['RECORDED', 'RETRY'].includes(state) && (
        <button className="rounded-lg border px-4 py-2" onClick={() => void upload()}>
          Lưu / thử lại WAV gốc
        </button>
      )}
      <p>
        Cửa sổ ghi do server giữ. Upload allowance chỉ dành cho byte đã ghi, không mở thêm thời gian
        trả lời hoặc lượt ghi.
      </p>
    </section>
  );
}
