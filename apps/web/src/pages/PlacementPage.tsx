import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronRight,
  Gauge,
  Headphones,
  History,
  LockKeyhole,
  Mic,
  Save,
  Target,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '@/features/auth/auth-context';
import { placementApi } from '@/features/placement/api';
import {
  emptyPlacementDraft,
  readPlacementDraft,
  writePlacementDraft,
} from '@/features/placement/draft';
import { startPlacementInNewTab } from '@/features/placement/handoff';
import type {
  PlacementConfig,
  PlacementDraft,
  PlacementHistoryItem,
  PlacementSelfLevel,
} from '@/features/placement/types';

const levelDescriptions: Record<PlacementSelfLevel, string> = {
  UNKNOWN: 'Bắt đầu bằng biểu mẫu cân bằng để xác định điểm xuất phát.',
  BEGINNER: 'Bạn mới làm quen với tiếng Anh trong môi trường học tập hoặc công việc.',
  BASIC: 'Bạn hiểu được câu và thông báo ngắn, quen với từ vựng cơ bản.',
  INTERMEDIATE: 'Bạn có thể theo dõi hội thoại và đọc văn bản công việc thông dụng.',
  GOOD: 'Bạn đã có nền tảng tốt và muốn kiểm tra với ngữ liệu thử thách hơn.',
};

export function PlacementPage() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [config, setConfig] = useState<PlacementConfig | null>(null);
  const [draft, setDraft] = useState<PlacementDraft>(() =>
    typeof sessionStorage === 'undefined' ? emptyPlacementDraft : readPlacementDraft(sessionStorage),
  );
  const [customGoal, setCustomGoal] = useState('');
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<PlacementHistoryItem[]>([]);
  const [microphoneState, setMicrophoneState] = useState<
    'UNCHECKED' | 'CHECKING' | 'READY' | 'DENIED' | 'UNSUPPORTED'
  >('UNCHECKED');

  useEffect(() => {
    const controller = new AbortController();
    void placementApi
      .config(controller.signal)
      .then((payload) => {
        if (controller.signal.aborted) return;
        setMessage(null);
        setConfig(payload);
        setDraft((current) => {
          const selectedMode = payload.modes.find(({ code }) => code === current.mode);
          if (selectedMode?.enabled) return current;
          const fallback = payload.modes.find(({ code, enabled }) => code === 'LR' && enabled)
            ?? payload.modes.find(({ enabled }) => enabled);
          return fallback ? { ...current, mode: fallback.code } : current;
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setMessage('Chưa thể tải cấu hình kiểm tra đầu vào. Vui lòng thử lại.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    writePlacementDraft(sessionStorage, draft);
  }, [draft]);

  useEffect(() => {
    if (!user || user.role !== 'STUDENT') return;
    const controller = new AbortController();
    void placementApi
      .history(controller.signal)
      .then(setHistory)
      .catch(() => undefined);
    return () => controller.abort();
  }, [user]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; attemptId?: string };
      if (data.type === 'PLACEMENT_SUBMITTED' && data.attemptId) {
        navigate(`/placement/attempts/${data.attemptId}/result`);
      }
    };
    const channel = 'BroadcastChannel' in window
      ? new BroadcastChannel('smart-english-placement')
      : null;
    channel?.addEventListener('message', handleMessage);
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== 'smart-english:placement-event' || !event.newValue) return;
      try {
        handleMessage({ data: JSON.parse(event.newValue) } as MessageEvent);
      } catch {
        return;
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => {
      channel?.removeEventListener('message', handleMessage);
      channel?.close();
      window.removeEventListener('storage', handleStorage);
    };
  }, [navigate]);

  const selectedLevel = config?.selfLevels.find(({ code }) => code === draft.selfLevel);
  const goalIsPreset = config?.goalPresets.includes(draft.goalScore ?? -1) ?? false;
  const selectedMode = config?.modes.find(({ code }) => code === draft.mode);
  const lrMode = config?.modes.find(({ code }) => code === 'LR');
  const fourSkillsMode = config?.modes.find(({ code }) => code === 'FOUR_SKILLS');
  const progress = useMemo(() => `${draft.step}/3`, [draft.step]);

  const chooseGoal = (goalScore: number) => {
    setDraft((current) => ({ ...current, goalScore }));
    setCustomGoal('');
    setMessage(null);
  };

  const useCustomGoal = () => {
    if (!config) return;
    const value = Number(customGoal);
    if (
      !Number.isInteger(value) ||
      value < config.customGoalRange.min ||
      value > config.customGoalRange.max
    ) {
      setMessage(
        `Mục tiêu cần là số nguyên từ ${config.customGoalRange.min} đến ${config.customGoalRange.max}.`,
      );
      return;
    }
    chooseGoal(value);
  };

  const start = async () => {
    if (!draft.goalScore || !draft.selfLevel || !ready) return;
    if (!selectedMode?.enabled) {
      setMessage('Chế độ kiểm tra này hiện không khả dụng. Vui lòng chọn chế độ khác.');
      return;
    }
    writePlacementDraft(sessionStorage, draft);
    if (!user) {
      navigate(`/login?${new URLSearchParams({ returnUrl: '/placement' }).toString()}`);
      return;
    }
    if (user.role !== 'STUDENT') {
      setMessage('Chỉ tài khoản học viên mới có thể bắt đầu bài kiểm tra đầu vào.');
      return;
    }
    if (draft.mode === 'FOUR_SKILLS' && microphoneState !== 'READY') {
      setMessage('Hãy kiểm tra và cho phép microphone trước khi bắt đầu bài kiểm tra 4 kỹ năng.');
      return;
    }
    setStarting(true);
    setMessage(null);
    try {
      const attempt = await startPlacementInNewTab({
        mode: draft.mode,
        selfLevel: draft.selfLevel,
        goalScore: draft.goalScore,
      });
      setMessage(
        attempt.resumed
          ? `Bạn có một bài ${attempt.test.mode === 'FOUR_SKILLS' ? '4 kỹ năng' : 'L&R'} đang làm. Hệ thống đã mở lại đúng bài đó trong tab mới.`
          : 'Bài kiểm tra đã được mở trong tab mới. Giữ tab này để xem kết quả sau khi nộp.',
      );
    } catch (error) {
      setMessage(
        error instanceof Error && error.message === 'POPUP_BLOCKED'
          ? 'Trình duyệt đã chặn tab mới. Hãy cho phép pop-up rồi thử lại.'
          : 'Chưa thể bắt đầu bài kiểm tra. Vui lòng thử lại.',
      );
    } finally {
      setStarting(false);
    }
  };

  const checkMicrophone = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMicrophoneState('UNSUPPORTED');
      return;
    }
    setMicrophoneState('CHECKING');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicrophoneState('READY');
    } catch {
      setMicrophoneState('DENIED');
    }
  };

  if (loading || authLoading) {
    return <p className="section-shell" role="status">Đang chuẩn bị kiểm tra đầu vào…</p>;
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="eyebrow">Kiểm tra đầu vào TOEIC</p>
          <h1 className="page-title">Xác định điểm xuất phát của bạn</h1>
          <p className="page-lead max-w-3xl">
            Chọn mục tiêu, trình độ tự đánh giá và chế độ Listening & Reading hoặc 4 kỹ năng.
          </p>
        </div>
        <span className="rounded-full bg-indigo-100 px-4 py-2 text-sm font-semibold text-indigo-800">
          Bước {progress}
        </span>
      </div>

      {message ? <p className="mt-6 rounded-xl bg-amber-50 p-4 text-amber-900" role="status">{message}</p> : null}

      {!config ? (
        <div className="state-error mt-8">Cấu hình kiểm tra đầu vào hiện không khả dụng.</div>
      ) : draft.step === 1 ? (
        <div className="mt-10">
          <div className="flex items-center gap-3">
            <Target className="text-indigo-600" />
            <h2 className="text-2xl font-bold">Mục tiêu của bạn</h2>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {config.goalPresets.map((goal) => (
              <button
                aria-pressed={draft.goalScore === goal && !customGoal}
                className={`rounded-2xl border p-6 text-left transition ${draft.goalScore === goal && !customGoal ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-200' : 'bg-white hover:border-indigo-300'}`}
                key={goal}
                onClick={() => chooseGoal(goal)}
                type="button"
              >
                <span className="text-3xl font-bold">{goal === 750 ? '750+' : goal}</span>
                <span className="mt-2 block text-sm text-slate-600">Mục tiêu tham khảo</span>
              </button>
            ))}
            <div className={`rounded-2xl border p-5 ${draft.goalScore && !goalIsPreset ? 'border-indigo-600 bg-indigo-50' : 'bg-white'}`}>
              <label className="text-sm font-semibold" htmlFor="custom-goal">Mục tiêu khác</label>
              <input
                className="mt-3 w-full rounded-lg border px-3 py-2"
                id="custom-goal"
                inputMode="numeric"
                onChange={(event) => setCustomGoal(event.target.value)}
                placeholder="Ví dụ: 600"
                value={customGoal}
              />
              <button className="mt-3 text-sm font-semibold text-indigo-700" onClick={useCustomGoal} type="button">Áp dụng</button>
            </div>
          </div>
          <button className="btn-primary mt-8" disabled={!draft.goalScore} onClick={() => setDraft((current) => ({ ...current, step: 2 }))} type="button">
            Tiếp tục <ChevronRight size={18} />
          </button>
        </div>
      ) : draft.step === 2 ? (
        <div className="mt-10">
          <div className="flex items-center gap-3">
            <Gauge className="text-indigo-600" />
            <h2 className="text-2xl font-bold">Trình độ hiện tại</h2>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {config.selfLevels.map((level) => (
              <button
                aria-pressed={draft.selfLevel === level.code}
                className={`rounded-2xl border p-6 text-left transition ${draft.selfLevel === level.code ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-200' : 'bg-white hover:border-indigo-300'}`}
                key={level.code}
                onClick={() => setDraft((current) => ({ ...current, selfLevel: level.code }))}
                type="button"
              >
                <span className="text-lg font-bold">{level.label}</span>
                <span className="mt-2 block text-sm leading-6 text-slate-600">{levelDescriptions[level.code]}</span>
              </button>
            ))}
          </div>
          <div className="mt-8 flex gap-3">
            <button className="btn-secondary" onClick={() => setDraft((current) => ({ ...current, step: 1 }))} type="button">Quay lại</button>
            <button className="btn-primary" disabled={!draft.selfLevel} onClick={() => setDraft((current) => ({ ...current, step: 3 }))} type="button">Tiếp tục <ChevronRight size={18} /></button>
          </div>
        </div>
      ) : (
        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_.8fr]">
          <div className="card">
            <h2 className="text-2xl font-bold">Xác nhận và hướng dẫn</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                aria-pressed={draft.mode === 'LR'}
                className={`rounded-xl border p-4 text-left ${draft.mode === 'LR' ? 'border-indigo-600 bg-indigo-50' : 'bg-white'} ${lrMode?.enabled ? '' : 'cursor-not-allowed opacity-60'}`}
                disabled={!lrMode?.enabled}
                onClick={() => setDraft((current) => ({ ...current, mode: 'LR' }))}
                type="button"
              >
                <strong>Listening &amp; Reading</strong>
                <span className="mt-2 block text-sm text-slate-600">Chấm tự động và có đánh giá, gợi ý khóa học sau khi nộp.</span>
                {!lrMode?.enabled ? <span className="mt-2 block text-sm font-semibold text-amber-700">{lrMode?.note ?? 'Chế độ này hiện không khả dụng.'}</span> : null}
              </button>
              <button
                aria-pressed={draft.mode === 'FOUR_SKILLS'}
                className={`rounded-xl border p-4 text-left ${draft.mode === 'FOUR_SKILLS' ? 'border-indigo-600 bg-indigo-50' : 'bg-white'} ${fourSkillsMode?.enabled ? '' : 'cursor-not-allowed opacity-60'}`}
                disabled={!fourSkillsMode?.enabled}
                onClick={() => setDraft((current) => ({ ...current, mode: 'FOUR_SKILLS' }))}
                type="button"
              >
                <strong>4 kỹ năng</strong>
                <span className="mt-2 block text-sm text-slate-600">Listening, Reading, Speaking và Writing. Speaking/Writing chờ đánh giá.</span>
                {!fourSkillsMode?.enabled ? <span className="mt-2 block text-sm font-semibold text-amber-700">{fourSkillsMode?.note ?? 'Chế độ này hiện không khả dụng.'}</span> : null}
              </button>
            </div>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              <Summary label="Bài kiểm tra" value={draft.mode === 'LR' ? 'Listening & Reading' : '4 kỹ năng'} />
              <Summary label="Thời lượng" value={draft.mode === 'FOUR_SKILLS' ? '45 phút' : selectedLevel?.durationMinutes ? `${selectedLevel.durationMinutes} phút` : 'Theo cấu hình bài'} />
              <Summary label="Mục tiêu" value={draft.goalScore === 750 ? '750+' : String(draft.goalScore)} />
              <Summary label="Tự đánh giá" value={selectedLevel?.label ?? ''} />
            </dl>
            <div className="mt-7 space-y-4">
              {[
                [Headphones, 'Chuẩn bị tai nghe và kiểm tra âm lượng trước khi bắt đầu.'],
                [Save, 'Câu trả lời được lưu ngay sau mỗi lựa chọn.'],
                [LockKeyhole, 'Đồng hồ do máy chủ kiểm soát; bài tự nộp khi hết giờ.'],
              ].map(([Icon, text]) => (
                <div className="flex gap-3" key={String(text)}>
                  <Icon className="mt-0.5 shrink-0 text-indigo-600" size={20} />
                  <p className="text-slate-700">{String(text)}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 rounded-xl bg-slate-100 p-4 text-sm text-slate-700">{config.disclaimer}</p>
            <label className="mt-6 flex items-start gap-3 rounded-xl border p-4">
              <input checked={ready} className="mt-1" onChange={(event) => setReady(event.target.checked)} type="checkbox" />
              <span>Tôi đã đọc hướng dẫn và sẵn sàng bắt đầu.</span>
            </label>
            <div className="mt-6 flex flex-wrap gap-3">
              <button className="btn-secondary" onClick={() => setDraft((current) => ({ ...current, step: 2 }))} type="button">Quay lại</button>
              <button className="btn-primary" disabled={!ready || starting || !selectedMode?.enabled || (draft.mode === 'FOUR_SKILLS' && microphoneState !== 'READY')} onClick={() => void start()} type="button">
                {starting ? 'Đang chuẩn bị…' : user ? 'Mở bài kiểm tra' : 'Đăng nhập để bắt đầu'}
              </button>
            </div>
          </div>
          <aside className="space-y-5">
            <div className="card border-dashed">
              <Mic className="text-indigo-600" />
              <h2 className="mt-4 text-xl font-bold">Kiểm tra microphone</h2>
              <p className="mt-2 text-slate-600">Chỉ chế độ 4 kỹ năng cần microphone. Trình duyệt chỉ hỏi quyền khi bạn bấm nút kiểm tra.</p>
              <button className="btn-secondary mt-4" disabled={microphoneState === 'CHECKING'} onClick={() => void checkMicrophone()} type="button">
                {microphoneState === 'CHECKING' ? 'Đang kiểm tra…' : 'Kiểm tra micro'}
              </button>
              {microphoneState === 'READY' ? <p className="mt-3 text-sm font-semibold text-emerald-700">Microphone đã sẵn sàng.</p> : null}
              {microphoneState === 'DENIED' ? <p className="mt-3 text-sm text-red-700" role="alert">Quyền microphone bị từ chối. Hãy cấp quyền trong cài đặt trình duyệt rồi thử lại.</p> : null}
              {microphoneState === 'UNSUPPORTED' ? <p className="mt-3 text-sm text-red-700" role="alert">Trình duyệt này không hỗ trợ ghi âm. Bạn vẫn có thể chọn Listening &amp; Reading.</p> : null}
            </div>
          </aside>
        </div>
      )}

      {user?.role === 'STUDENT' ? (
        <section className="mt-16 border-t pt-10">
          <div className="flex items-center gap-3"><History className="text-indigo-600" /><h2 className="text-2xl font-bold">Lịch sử kiểm tra đầu vào</h2></div>
          {history.length ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {history.map((item) => (
                <Link className="card transition hover:border-indigo-300" key={item.attemptId} to={item.resultPath}>
                  <div className="flex items-center justify-between gap-3"><span className="font-bold">{item.title}</span><Check className="text-emerald-600" /></div>
                  <p className="mt-2 text-sm text-slate-600">Đã nộp {new Date(item.submittedAt).toLocaleString('vi-VN')} · {item.mode === 'LR' ? `${item.score}/${item.maxScore} câu đúng` : '4 kỹ năng'}</p>
                  {item.mode === 'FOUR_SKILLS' ? <div className="mt-2 flex flex-wrap gap-2 text-xs">{item.skillScores.map((skill) => <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-800" key={skill.skill}>{skill.skill === 'LISTENING' ? 'Listening' : 'Reading'}: {Number(skill.normalizedScore).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}% · Đã chấm</span>)}{item.skillResults?.map((skill) => <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-800" key={skill.skill}>{skill.skill === 'SPEAKING' ? 'Speaking' : 'Writing'}: {skill.submittedResponseCount}/{skill.requiredResponseCount} · Chờ đánh giá</span>)}</div> : null}
                  {item.placementLevelLabel ? <p className="mt-2 text-sm font-semibold text-indigo-700">Đánh giá nội bộ: {item.placementLevelLabel}</p> : null}
                </Link>
              ))}
            </div>
          ) : <p className="mt-4 text-slate-600">Bạn chưa có kết quả kiểm tra đầu vào nào.</p>}
        </section>
      ) : null}
    </section>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-4"><dt className="text-sm text-slate-500">{label}</dt><dd className="mt-1 font-bold">{value}</dd></div>;
}
