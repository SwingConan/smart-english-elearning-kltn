import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { apiFetch, apiUrl } from '@/lib/api-client';
import { pcmWav } from '@/features/placement/microphone-capture';
type Check = {
  id: string;
  bytes: number;
  durationMs: number;
  sha256: string;
  playbackUrl: string;
  operatorConfirmed: boolean;
};
const root = '/v2/placement/workflow/microphone-checks';
const button =
  'rounded-lg border border-indigo-300 bg-white px-4 py-3 text-indigo-900 disabled:opacity-50';
export function PlacementMicrophonePage() {
  const { pathname } = useLocation();
  const backPath = pathname.startsWith('/student/') ? '/student/placement' : '/placement';
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState('IDLE'),
    [error, setError] = useState(''),
    [device, setDevice] = useState('');
  const [recorded, setRecorded] = useState(false),
    [check, setCheck] = useState<Check>(),
    [played, setPlayed] = useState(false),
    [physical, setPhysical] = useState(false);
  const capture = useRef<() => void>(() => {}),
    release = useRef<() => void>(() => {}),
    alive = useRef(true),
    opening = useRef(false);
  const pending = useRef<{ blob: Blob; key: string } | null>(null),
    confirmationKey = useRef(crypto.randomUUID());
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      release.current();
    };
  }, []);
  const id = params.get('check');
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    void apiFetch<Check>(root + '/' + encodeURIComponent(id), { signal: controller.signal })
      .then((value) => {
        setCheck(value);
        setState(value.operatorConfirmed ? 'CONFIRMED' : 'SAVED');
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Không mở được bản ghi thuộc tài khoản hiện tại.');
      });
    return () => controller.abort();
  }, [id]);
  const start = async () => {
    if (opening.current) return;
    opening.current = true;
    setState('REQUESTING');
    setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error('Trình duyệt chưa hỗ trợ microphone trên kết nối này.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      release.current = () => stream.getTracks().forEach((t) => t.stop());
      setDevice(stream.getAudioTracks()[0]?.label || 'Microphone được trình duyệt cho phép');
      const context = new AudioContext();
      release.current = () => {
        stream.getTracks().forEach((t) => t.stop());
        void context.close();
        opening.current = false;
      };
      await context.resume();
      if (!alive.current) {
        release.current();
        return;
      }
      const source = context.createMediaStreamSource(stream),
        processor = context.createScriptProcessor(4096, 1, 1),
        chunks: Float32Array[] = [];
      let closed = false;
      processor.onaudioprocess = (e) => {
        if (!closed) chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(context.destination);
      const timer = setTimeout(() => capture.current(), 10000);
      release.current = () => {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        processor.disconnect();
        source.disconnect();
        stream.getTracks().forEach((t) => {
          t.onended = null;
          t.stop();
        });
        void context.close();
        opening.current = false;
      };
      capture.current = () => {
        if (closed) return;
        try {
          pending.current = { blob: pcmWav(chunks, context.sampleRate), key: crypto.randomUUID() };
          setRecorded(true);
          setState('RECORDED');
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Chưa thu được âm thanh.');
          setState('ERROR');
        } finally {
          release.current();
        }
      };
      for (const track of stream.getTracks())
        track.onended = () => {
          release.current();
          setState('ERROR');
          setError('Microphone bị ngắt. Chưa có bản ghi được tải lên.');
        };
      setState('RECORDING');
    } catch (e) {
      release.current();
      opening.current = false;
      setState('ERROR');
      setError(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Chưa được cấp quyền microphone. Hãy cho phép trong trình duyệt rồi thử lại.'
          : e instanceof Error
            ? e.message
            : 'Không mở được microphone.',
      );
    }
  };
  const upload = async () => {
    if (!pending.current) return;
    setState('UPLOADING');
    setError('');
    const form = new FormData();
    form.append('file', pending.current.blob, 'microphone-original.wav');
    form.append('idempotencyKey', pending.current.key);
    try {
      const value = await apiFetch<Check>(root, { method: 'POST', body: form });
      setCheck(value);
      pending.current = null;
      setParams({ check: value.id }, { replace: true });
      setState('SAVED');
    } catch {
      setState('RECORDED');
      setError('Chưa nhận xác nhận lưu. Giữ bản ghi hiện tại và thử tải lại cùng bản ghi.');
    }
  };
  const busy = ['REQUESTING', 'RECORDING', 'UPLOADING', 'CONFIRMING'].includes(state);
  return (
    <main className="section-shell max-w-3xl space-y-5 py-10">
      <Link to={backPath}>← Quay lại Kiểm tra đầu vào</Link>
      <h1 className="text-3xl font-bold">Kiểm tra microphone vật lý</h1>
      <p>
        Kiểm tra độc lập, không tạo lượt thi hoặc điểm. Dùng microphone của bạn, nói một đoạn khoảng
        5–10 giây, tải lên và nghe lại bản ghi từ máy chủ.
      </p>
      <ol className="list-inside list-decimal space-y-2">
        <li>Bấm mở microphone và tự chọn Cho phép trong trình duyệt.</li>
        <li>Nói tên hoặc một câu dễ nhận ra; bản ghi tự dừng sau 10 giây.</li>
        <li>Tải bản ghi lên, phát đến hết và xác nhận bạn nghe được giọng của mình.</li>
      </ol>
      <p role="status">
        {state === 'RECORDING'
          ? 'Đang ghi từ microphone'
          : state === 'REQUESTING'
            ? 'Đang chờ quyền microphone'
            : state === 'CONFIRMED'
              ? 'Operator đã xác nhận microphone vật lý và bản phát lại.'
              : check
                ? 'Bản ghi đã được lưu; cần nghe lại và xác nhận operator.'
                : recorded
                  ? 'Đã thu bản ghi, chưa tải lên.'
                  : 'Chưa kiểm tra microphone vật lý.'}
      </p>
      {device && <p>Thiết bị trình duyệt: {device}</p>}
      {error && <p role="alert">{error}</p>}
      {!check && !recorded && (
        <button className={button} disabled={busy} onClick={() => void start()}>
          Mở microphone vật lý
        </button>
      )}
      {state === 'RECORDING' && (
        <button className={button} onClick={() => capture.current()}>
          Dừng ghi âm
        </button>
      )}
      {recorded && !check && (
        <button className={button} disabled={busy} onClick={() => void upload()}>
          Tải bản ghi lên máy chủ
        </button>
      )}
      {check && (
        <section className="space-y-4 rounded-xl border bg-white p-5">
          <h2 className="text-xl font-bold">Nghe bản ghi đã lưu</h2>
          <p>Thời lượng đã lưu: {(check.durationMs / 1000).toFixed(1)} giây.</p>
          <audio
            className="w-full"
            controls
            preload="none"
            src={apiUrl(check.playbackUrl.replace(/^\/api/, ''))}
            onEnded={() => setPlayed(true)}
            onError={() =>
              setError('Không phát được bản ghi đã lưu. Chưa xác nhận microphone PASS.')
            }
          />
          {!check.operatorConfirmed && (
            <>
              <label className="flex gap-3">
                <input
                  type="checkbox"
                  disabled={!played || busy}
                  checked={physical}
                  onChange={(e) => setPhysical(e.target.checked)}
                />
                Tôi dùng microphone vật lý và đã nghe rõ giọng của mình trong bản ghi phát lại từ
                máy chủ.
              </label>
              <button
                className={button}
                disabled={!played || !physical || busy}
                onClick={() => {
                  setState('CONFIRMING');
                  setError('');
                  void apiFetch(root + '/' + check.id + '/confirm', {
                    method: 'POST',
                    body: JSON.stringify({
                      idempotencyKey: confirmationKey.current,
                      physicalDeviceConfirmed: true,
                      originalPlaybackConfirmed: true,
                    }),
                  })
                    .then(() => {
                      setCheck({ ...check, operatorConfirmed: true });
                      setState('CONFIRMED');
                    })
                    .catch(() => {
                      setState('SAVED');
                      setError('Chưa lưu được xác nhận operator. Thử lại cùng xác nhận.');
                    });
                }}
              >
                Xác nhận operator đã nghe bản ghi
              </button>
            </>
          )}
          <p className="break-all text-sm text-slate-600">Mã kiểm tra: {check.id}</p>
        </section>
      )}
    </main>
  );
}
