import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useAuth } from '@/features/auth/auth-context';
import {
  placementIntegration,
  type Mode,
  type PlacementHistoryEntry,
  type PlacementIntegrationConfig,
  type PreviewExam,
  type PreviewDiagnostic,
} from '@/features/placement/integration-api';
import { DoublePromptAnswer } from '@/features/placement/DoublePromptAnswer';
import { AssessmentTextStimulus } from '@/features/placement/AssessmentTextStimulus';
import { resolvePlacementPdfPassages } from '@/features/placement/placement-pdf-passages';
import { PlacementPdfPassagePane } from '@/features/placement/PlacementPdfPassagePane';
const field = 'w-full rounded-lg border border-slate-300 p-3';
const btn =
  'rounded-lg border border-indigo-300 bg-white px-4 py-2 text-indigo-800 disabled:opacity-50';

type PlacementDraft = {
  version: 2;
  mode: Mode;
  goalLR: string;
  goalSpeaking: string;
  goalWriting: string;
};

const emptyDraft: PlacementDraft = {
  version: 2,
  mode: 'LR',
  goalLR: '',
  goalSpeaking: '',
  goalWriting: '',
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));

const modeTitle = (mode?: Mode) => (mode === 'FOUR_SKILLS' ? 'Bốn kỹ năng' : 'Listening & Reading');

function readDraft(userId: string): PlacementDraft {
  try {
    const raw = sessionStorage.getItem(`smart-english:placement-v2:${userId}`);
    if (!raw) return emptyDraft;
    const parsed = JSON.parse(raw) as Partial<PlacementDraft>;
    if (parsed.version !== 2) return emptyDraft;
    return {
      version: 2,
      mode: parsed.mode === 'FOUR_SKILLS' ? 'FOUR_SKILLS' : 'LR',
      goalLR: typeof parsed.goalLR === 'string' ? parsed.goalLR : '',
      goalSpeaking: typeof parsed.goalSpeaking === 'string' ? parsed.goalSpeaking : '',
      goalWriting: typeof parsed.goalWriting === 'string' ? parsed.goalWriting : '',
    };
  } catch {
    return emptyDraft;
  }
}

export function PlacementIntegrationPage() {
  const { user } = useAuth();
  return <PlacementIntegrationContent key={`${user?.id ?? 'guest'}:${user?.role ?? 'guest'}`} />;
}

function PlacementIntegrationContent() {
  const { user } = useAuth();
  const isStudent = user?.role === 'STUDENT';
  const [config, setConfig] = useState<PlacementIntegrationConfig>();
  const [history, setHistory] = useState<PlacementHistoryEntry[]>();
  const [loadError, setLoadError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isStudent) {
      return;
    }
    let live = true;
    const controller = new AbortController();
    void placementIntegration
      .config(controller.signal)
      .then((value) => {
        if (live) {
          setConfig(value);
          setLoadError('');
        }
      })
      .catch((err: unknown) => {
        if (!live || (err instanceof DOMException && err.name === 'AbortError')) return;
        setLoadError('Chưa tải được thông tin mở bài kiểm tra đầu vào. Vui lòng thử lại.');
      });
    void placementIntegration
      .history()
      .then((value) => {
        if (live) setHistory(value);
      })
      .catch(() => {
        if (live) setHistory([]);
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [isStudent, user?.id, tick]);

  const historyList = isStudent && history && history.length > 0 ? history : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
      <div className="mb-6">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200/80 bg-indigo-50 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-indigo-700">
          Đánh giá năng lực đầu vào
        </span>
      </div>

      <div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-12">
        {/* Left Column: Shared Hero, Single Action Area & Steps */}
        <div className="space-y-6 lg:col-span-7">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl lg:text-5xl">
              Kiểm tra đầu vào Smart English
            </h1>
            <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg sm:leading-8">
              Chọn Listening &amp; Reading hoặc bốn kỹ năng để đánh giá đầu vào nội bộ, lưu kết quả
              và định hướng học tập. Phần Nói và Viết do giáo viên chấm và xác nhận điểm.
            </p>
          </div>

          <div className="space-y-5 rounded-2xl border border-indigo-100 bg-white p-6 shadow-sm">
            {!user ? (
              <>
                <div className="flex items-start gap-3.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-indigo-50 font-bold text-indigo-600">
                    ✓
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Tham gia bằng tài khoản học viên
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Đăng nhập để kiểm tra trạng thái mở đề, chọn hình thức Listening &amp; Reading
                      hoặc 4 kỹ năng, nhập mục tiêu điểm số và lưu lịch sử làm bài.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <Link className="btn-primary" to="/login?returnUrl=%2Fplacement">
                    Đăng nhập để tiếp tục
                  </Link>
                  <Link className="btn-secondary" to="/register?returnUrl=%2Fplacement">
                    Đăng ký tài khoản mới
                  </Link>
                </div>
              </>
            ) : !isStudent ? (
              <div className="space-y-4">
                <p role="alert" className="text-sm leading-6 text-slate-700">
                  Chức năng tham gia bài kiểm tra đầu vào áp dụng cho tài khoản học viên. Bạn có thể
                  quản lý hoặc kiểm tra quy trình đầu vào trong không gian làm việc.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Link className="btn-secondary text-sm" to="/workspace">
                    Vào không gian làm việc
                  </Link>
                </div>
              </div>
            ) : (
              <StudentPlacementActionCard
                key={user.id}
                userId={user.id}
                config={config}
                loadError={loadError}
                onReload={() => setTick((t) => t + 1)}
              />
            )}
          </div>

          {/* Steps indicator (Identical structure for Guest & Logged-in) */}
          <div className="grid gap-4 pt-2 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200/80 bg-white p-4">
              <span className="text-xs font-bold uppercase text-indigo-600">Bước 1</span>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {isStudent ? 'Đã đăng nhập học viên' : 'Đăng nhập tài khoản'}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">Xác thực quyền tham gia &amp; lưu bài</p>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-white p-4">
              <span className="text-xs font-bold uppercase text-indigo-600">Bước 2</span>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                Chọn hình thức &amp; mục tiêu
              </p>
              <p className="mt-0.5 text-xs text-slate-500">L&amp;R hoặc 4 kỹ năng</p>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-white p-4">
              <span className="text-xs font-bold uppercase text-indigo-600">Bước 3</span>
              <p className="mt-1 text-sm font-semibold text-slate-900">Làm bài &amp; xem kết quả</p>
              <p className="mt-0.5 text-xs text-slate-500">Lưu đáp án và kết quả theo tài khoản</p>
            </div>
          </div>
        </div>

        {/* Right Column: Identical Assessment Details Card */}
        <div className="space-y-5 lg:col-span-5">
          <div className="space-y-5 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Định dạng bài kiểm tra</h2>

            <div className="space-y-4 text-sm">
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">Listening &amp; Reading</span>
                  <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-800">
                    2 kỹ năng
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-5 text-slate-600">
                  100 câu Nghe hiểu và 100 câu Đọc hiểu. Kết quả ghi nhận số câu đúng trên bài kiểm
                  tra nội bộ Smart English.
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">Bốn kỹ năng</span>
                  <span className="rounded-md bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-800">
                    Toàn diện
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-5 text-slate-600">
                  Bao gồm Listening &amp; Reading kết hợp phần trả lời Nói (Speaking) và Viết
                  (Writing) để ghi nhận đầy đủ năng lực.
                </p>
              </div>
            </div>

            <div className="space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
              <div className="flex items-center justify-between">
                <span>Trạng thái kiểm tra nội bộ:</span>
                <span className="font-semibold text-slate-700">
                  {isStudent && config
                    ? config.fullExamEnabled
                      ? 'Đang mở cho học viên'
                      : 'Chờ phê duyệt & mở đề'
                    : 'Theo lịch mở đề của trung tâm'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Điều kiện tham gia:</span>
                <span className="font-semibold text-slate-700">Tài khoản học viên hợp lệ</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Lưu trữ &amp; theo dõi:</span>
                <span className="font-semibold text-slate-700">Ghi nhận trên tài khoản</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Real History & Results — Rendered ONLY when the logged-in student actually has data */}
      {historyList.length > 0 && (
        <section
          aria-labelledby="placement-history-heading"
          className="mt-10 border-t border-slate-200 pt-8"
        >
          <h2 id="placement-history-heading" className="text-xl font-bold text-slate-900">
            Lịch sử và kết quả kiểm tra đầu vào của bạn
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {historyList.map((item, idx) => {
              const canResume =
                config?.workflowEnabled &&
                item.kind === 'DEV_WORKFLOW' &&
                item.status &&
                !['SUBMITTED', 'BLOCKED_REVIEW'].includes(item.status);
              return (
                <article
                  key={item.attemptId}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-wide text-indigo-600">
                        {item.mode ? modeTitle(item.mode) : `Lần ${historyList.length - idx}`}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                        {item.status === 'SUBMITTED'
                          ? 'Đã nộp bài'
                          : item.status === 'BLOCKED_REVIEW'
                            ? 'Chờ trung tâm kiểm tra'
                            : 'Đang ghi nhận'}
                      </span>
                    </div>
                    <h3 className="mt-2 font-semibold text-slate-900">
                      {item.label || `Lần kiểm tra ${historyList.length - idx}`}
                    </h3>
                    {item.startedAt && (
                      <p className="mt-1 text-xs text-slate-500">
                        Bắt đầu: {formatDateTime(item.startedAt)}
                      </p>
                    )}
                    {item.submittedAt && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        Đã nộp: {formatDateTime(item.submittedAt)}
                      </p>
                    )}
                  </div>
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    {canResume ? (
                      <Link
                        className="text-sm font-semibold text-indigo-700 hover:underline"
                        to={'/placement/sittings/' + item.attemptId}
                      >
                        Tiếp tục bài đang làm →
                      </Link>
                    ) : item.resultPath ? (
                      <Link
                        className="text-sm font-semibold text-indigo-700 hover:underline"
                        to={item.resultPath}
                      >
                        Xem kết quả &amp; gợi ý →
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-500">
                        Trung tâm sẽ thông báo khi có kết quả.
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function StudentPlacementActionCard({
  userId,
  config,
  loadError,
  onReload,
}: {
  userId: string;
  config?: PlacementIntegrationConfig;
  loadError: string;
  onReload: () => void;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const microphonePath = pathname.startsWith('/student/')
    ? '/student/placement/microphone'
    : '/placement/microphone';
  const [draft, setDraft] = useState<PlacementDraft>(() => readDraft(userId));
  const [formError, setFormError] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(`smart-english:placement-v2:${userId}`, JSON.stringify(draft));
    } catch {
      /* ignore storage errors */
    }
  }, [draft, userId]);

  if (loadError) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-rose-700">
          {loadError}
        </p>
        <button type="button" className="btn-secondary text-sm" onClick={onReload}>
          Thử lại
        </button>
      </div>
    );
  }

  if (!config) {
    return (
      <p role="status" className="text-sm text-slate-600">
        Đang kiểm tra trạng thái mở đề và quyền tham gia của tài khoản…
      </p>
    );
  }

  const sources = config.sources ?? [];
  const modes = config.modes ?? ['LR', 'FOUR_SKILLS'];
  const matchingSource = sources.find((s) => s.mode === draft.mode);
  const canStartOfficial = Boolean(config.fullExamEnabled && matchingSource);
  const canStartPreview = Boolean(
    !config.fullExamEnabled && config.previewEnabled && matchingSource,
  );

  const switchMode = (nextMode: Mode) => {
    setFormError('');
    setDraft((prev) => ({
      ...prev,
      mode: nextMode,
      ...(nextMode === 'LR' ? { goalSpeaking: '', goalWriting: '' } : {}),
    }));
  };

  const validateAndStart = async () => {
    if (starting || (!canStartOfficial && !canStartPreview) || !matchingSource) return;
    if (config.fullExamEnabled && matchingSource.attemptId && !matchingSource.retakeAllowed) {
      navigate(
        `/placement/sittings/${matchingSource.attemptId}${matchingSource.attemptStatus === 'SUBMITTED' ? '/result' : ''}`,
      );
      return;
    }
    setFormError('');
    const lr = Number(draft.goalLR);
    if (!draft.goalLR.trim() || !Number.isInteger(lr) || lr < 10 || lr > 990) {
      setFormError('Mục tiêu Listening & Reading phải là số nguyên từ 10 đến 990.');
      return;
    }
    let speaking: number | undefined;
    let writing: number | undefined;
    if (draft.mode === 'FOUR_SKILLS') {
      const s = Number(draft.goalSpeaking);
      const w = Number(draft.goalWriting);
      if (!draft.goalSpeaking.trim() || !Number.isInteger(s) || s < 0 || s > 200) {
        setFormError('Mục tiêu Speaking phải là số nguyên từ 0 đến 200.');
        return;
      }
      if (!draft.goalWriting.trim() || !Number.isInteger(w) || w < 0 || w > 200) {
        setFormError('Mục tiêu Writing phải là số nguyên từ 0 đến 200.');
        return;
      }
      speaking = s;
      writing = w;
    }
    setStarting(true);
    try {
      const res = await placementIntegration.start({
        mode: draft.mode,
        sourceVersionId: matchingSource.id,
        ...(config.fullExamEnabled ? { policyId: matchingSource.policyId } : {}),
        goalLR: lr,
        ...(draft.mode === 'FOUR_SKILLS' ? { goalSpeaking: speaking, goalWriting: writing } : {}),
        idempotencyKey: crypto.randomUUID(),
      });
      navigate(res.examPath);
    } catch {
      setFormError('Chưa thể mở bài kiểm tra vào lúc này. Vui lòng thử lại sau.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-5">
      {config.fullExamEnabled && draft.mode === 'FOUR_SKILLS' && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700">
          <Link to={microphonePath} className="font-semibold text-emerald-700 hover:underline">
            Kiểm tra microphone trước khi thi Nói
          </Link>
        </div>
      )}
      {!config.fullExamEnabled && (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50/75 px-3.5 py-2.5 text-sm text-amber-950"
        >
          Bài kiểm tra đầu vào chính thức hiện chưa mở. Bạn vẫn có thể chọn hình thức và lưu mục
          tiêu điểm số trước để sẵn sàng khi trung tâm phát hành đề.
        </p>
      )}

      <fieldset className="space-y-2.5">
        <legend className="text-sm font-semibold text-slate-900">Chọn hình thức kiểm tra</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label
            className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm transition ${
              draft.mode === 'LR'
                ? 'border-indigo-500 bg-indigo-50/50 text-indigo-950'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
            }`}
          >
            <input
              type="radio"
              name="placement-mode"
              value="LR"
              checked={draft.mode === 'LR'}
              disabled={!modes.includes('LR')}
              onChange={() => switchMode('LR')}
              className="mt-1"
            />
            <span>
              <span className="block font-semibold">Listening &amp; Reading</span>
              <span className="mt-0.5 block text-xs text-slate-500">2 kỹ năng Nghe &amp; Đọc</span>
            </span>
          </label>
          <label
            className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm transition ${
              draft.mode === 'FOUR_SKILLS'
                ? 'border-indigo-500 bg-indigo-50/50 text-indigo-950'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
            }`}
          >
            <input
              type="radio"
              name="placement-mode"
              value="FOUR_SKILLS"
              checked={draft.mode === 'FOUR_SKILLS'}
              disabled={!modes.includes('FOUR_SKILLS')}
              onChange={() => switchMode('FOUR_SKILLS')}
              className="mt-1"
            />
            <span>
              <span className="block font-semibold">Bốn kỹ năng</span>
              <span className="mt-0.5 block text-xs text-slate-500">Nghe, Đọc, Nói &amp; Viết</span>
            </span>
          </label>
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium text-slate-800">
            Mục tiêu Listening &amp; Reading (10–990)
          </span>
          <input
            type="number"
            min={10}
            max={990}
            placeholder="Ví dụ: 650"
            className="input-field mt-1.5 py-2.5 text-sm"
            value={draft.goalLR}
            onChange={(e) => setDraft((prev) => ({ ...prev, goalLR: e.target.value }))}
          />
        </label>
        {draft.mode === 'FOUR_SKILLS' && (
          <>
            <label className="block text-sm">
              <span className="font-medium text-slate-800">Mục tiêu Speaking (0–200)</span>
              <input
                type="number"
                min={0}
                max={200}
                placeholder="Ví dụ: 140"
                className="input-field mt-1.5 py-2.5 text-sm"
                value={draft.goalSpeaking}
                onChange={(e) => setDraft((prev) => ({ ...prev, goalSpeaking: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-800">Mục tiêu Writing (0–200)</span>
              <input
                type="number"
                min={0}
                max={200}
                placeholder="Ví dụ: 140"
                className="input-field mt-1.5 py-2.5 text-sm"
                value={draft.goalWriting}
                onChange={(e) => setDraft((prev) => ({ ...prev, goalWriting: e.target.value }))}
              />
            </label>
          </>
        )}
      </div>

      {formError && (
        <p role="alert" className="text-sm text-rose-700">
          {formError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        {canStartOfficial ? (
          <button
            type="button"
            className="btn-primary"
            disabled={starting}
            onClick={() => void validateAndStart()}
          >
            {matchingSource?.retakeAllowed
              ? 'Bắt đầu lượt mới'
              : matchingSource?.attemptId
                ? matchingSource.attemptStatus === 'SUBMITTED'
                  ? 'Xem kết quả'
                  : 'Tiếp tục làm bài'
                : starting
                  ? 'Đang mở bài…'
                  : 'Bắt đầu làm bài'}
          </button>
        ) : (
          <>
            <button type="button" className="btn-primary opacity-60 cursor-not-allowed" disabled>
              Bài kiểm tra chính thức chưa mở
            </button>
            {canStartPreview && (
              <button
                type="button"
                className="btn-secondary text-sm"
                disabled={starting}
                onClick={() => void validateAndStart()}
              >
                {starting ? 'Đang mở bản xem thử…' : 'Mở bản xem thử nội bộ'}
              </button>
            )}
          </>
        )}
        {matchingSource?.retakeAllowed && matchingSource.attemptId && (
          <Link
            className="btn-secondary"
            to={`/placement/sittings/${matchingSource.attemptId}/result`}
          >
            Xem kết quả lượt trước
          </Link>
        )}
      </div>
    </div>
  );
}
export function PlacementPreviewExamPage() {
  const { attemptId } = useParams<{ attemptId: string }>(),
    navigate = useNavigate();
  const [exam, setExam] = useState<PreviewExam>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [current, setCurrent] = useState(0),
    [navigatorOpen, setNavigatorOpen] = useState(false),
    [text, setText] = useState<Record<string, string>>({}),
    [choiceDraft, setChoiceDraft] = useState<Record<string, string[]>>({}),
    [recordingBusy, setRecordingBusy] = useState(false),
    [tick, setTick] = useState(0);
  const forceReload = useRef(false);
  const [hasPending, setHasPending] = useState(false);
  const pending = useRef<{
    q: string | undefined;
    kind: 'answers' | 'marks' | 'complete';
    body: Record<string, unknown>;
  } | null>(null);
  useEffect(() => {
    let live = true;
    if (!attemptId) return;
    void placementIntegration
      .exam(attemptId)
      .then((x) => {
        if (live) {
          setExam(x);
          setText((prev) => {
            const saved = Object.fromEntries(
              x.groups
                .flatMap((g) => g.questions)
                .map((q) => [q.testQuestionId, q.textResponse ?? '']),
            );
            const next = forceReload.current ? saved : { ...saved, ...prev };
            forceReload.current = false;
            return next;
          });
          setError('');
        }
      })
      .catch(() => {
        if (live) {
          setExam(undefined);
          setError(
            'Không thể tải phiên hoặc bạn không có quyền. Câu trả lời đã lưu không bị chuyển thành điểm 0.',
          );
        }
      });
    return () => {
      live = false;
    };
  }, [attemptId, tick]);
  const write = async (
    q: string | undefined,
    kind: 'answers' | 'marks' | 'complete',
    payload: Record<string, unknown>,
  ) => {
    if (!attemptId || !exam || busy) return;
    setBusy(true);
    setError('');
    setHasPending(true);
    pending.current ??= {
      q,
      kind,
      body: {
        ...payload,
        idempotencyKey: crypto.randomUUID(),
        expectedLockVersion: exam.lockVersion,
      },
    };
    try {
      const p = pending.current;
      const res = await placementIntegration.write(attemptId, p.q, p.kind, p.body);
      if (res.state === 'PREVIEW_COMPLETED') {
        pending.current = null;
        setHasPending(false);
        navigate('/placement/previews/' + attemptId + '/result');
        return;
      }
      const fresh = await placementIntegration.exam(attemptId);
      setExam(fresh);
      pending.current = null;
      setHasPending(false);
      if (p.q)
        setChoiceDraft((previous) => {
          const next = { ...previous };
          delete next[p.q!];
          return next;
        });
    } catch {
      setError(
        'Chưa xác nhận đã lưu. Giữ nguyên yêu cầu để thử lại; nếu xung đột hai tab, tải trạng thái mới trước khi sửa tiếp.',
      );
    } finally {
      setBusy(false);
    }
  };
  if (!exam)
    return (
      <main className="section-shell py-10">
        <h1>Phiên xem thử Placement</h1>
        {error ? <p role="alert">{error}</p> : <p role="status">Đang tải…</p>}
        <button className={btn} onClick={() => setTick((x) => x + 1)}>
          Tải lại phiên
        </button>
      </main>
    );
  const questions = exam.groups.flatMap((g) => g.questions),
    q = questions[current] ?? questions[0],
    group = exam.groups.find((g) =>
      g.questions.some((x) => x.testQuestionId === q?.testQuestionId),
    ),
    done = exam.state === 'PREVIEW_COMPLETED';
  const nav = (
    <nav aria-label="Số câu và đánh dấu" className="space-y-3">
      <h2 className="font-bold">Điều hướng câu hỏi</h2>
      <p>Mark chỉ để ghi nhớ, không nộp bài hoặc chấm điểm.</p>
      <div className="grid grid-cols-4 gap-2">
        {questions.map((x, i) => (
          <button
            className={`${btn} ${current === i ? 'ring-2 ring-indigo-600' : ''}`}
            aria-current={current === i ? 'step' : undefined}
            aria-label={`Câu ${i + 1}${x.selectedOptionIds.length || x.textResponse || x.audioUploaded ? ', đã trả lời' : ', chưa trả lời'}${exam.marked.includes(x.testQuestionId) ? ', đánh dấu' : ''}`}
            key={x.testQuestionId}
            disabled={recordingBusy}
            onClick={() => {
              setCurrent(i);
              setNavigatorOpen(false);
            }}
          >
            {i + 1}
            {exam.marked.includes(x.testQuestionId) ? ' ★' : ''}
          </button>
        ))}
      </div>
    </nav>
  );
  return (
    <main className="mx-auto max-w-[1600px] space-y-5 px-4 py-6">
      <h1 className="text-2xl font-bold">{exam.title}</h1>
      <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4">
        DEV — Bản xem thử không chấm điểm, {questions.length} câu/tác vụ kỹ thuật. Không phải đề thi
        đầy đủ 200/219. Chưa áp dụng timer toàn bài.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button
          className={btn}
          disabled={busy || recordingBusy}
          onClick={() => {
            pending.current = null;
            setChoiceDraft({});
            setHasPending(false);
            forceReload.current = true;
            setTick((x) => x + 1);
          }}
        >
          Tải trạng thái đã lưu
        </button>
        {hasPending && (
          <button
            className={btn}
            disabled={busy}
            onClick={() => void write(pending.current!.q, pending.current!.kind, {})}
          >
            Thử lại yêu cầu chưa xác nhận
          </button>
        )}
        <button className={btn + ' lg:hidden'} onClick={() => setNavigatorOpen(true)}>
          Mở điều hướng câu hỏi
        </button>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,1fr)]">
        <section className="min-w-0 rounded-xl border bg-white p-5" aria-label="Nội dung câu hỏi">
          <h2 className="text-xl font-bold" tabIndex={-1}>
            Câu {current + 1} · {group?.skill}
          </h2>
          {(() => {
            const pdfPassage = resolvePlacementPdfPassages(group);
            if (pdfPassage) {
              const fallback =
                group?.stimulusText ??
                group?.stimuli.find((x) => x.type === 'TEXT')?.textContent ??
                null;
              return (
                <div className="mt-4">
                  <PlacementPdfPassagePane passage={pdfPassage} fallbackText={fallback} />
                </div>
              );
            }
            return (
              <>
                {group?.instructions && <p>{group.instructions}</p>}
                {group?.stimulusText && <p>{group.stimulusText}</p>}
                {group?.stimuli
                  .filter((x) => x.type === 'TEXT')
                  .map((s) => (
                    <AssessmentTextStimulus key={s.id} content={s.textContent} />
                  ))}
              </>
            );
          })()}
          {q && (
            <>
              <p className="my-5 text-lg">{q.content}</p>
              {group?.playbackPolicy ? (
                <DoublePromptAnswer
                  key={q.testQuestionId}
                  attemptId={attemptId!}
                  questionId={q.testQuestionId}
                  source=""
                  active={!done}
                  initialAudioUrl={null}
                  onSaved={() => setTick((x) => x + 1)}
                  onUploading={(_, v) => setRecordingBusy(v)}
                  onSaveState={(_, s) => setRecordingBusy(s !== null)}
                />
              ) : q.responseType === 'TEXT_RESPONSE' ? (
                <div className="space-y-3">
                  <label className="block">
                    Bài viết xem thử
                    <textarea
                      aria-label="Bài viết xem thử"
                      className={field}
                      disabled={done || busy}
                      maxLength={20000}
                      value={text[q.testQuestionId] ?? ''}
                      onChange={(e) =>
                        setText((t) => ({ ...t, [q.testQuestionId]: e.target.value }))
                      }
                    />
                  </label>
                  <button
                    className={btn}
                    disabled={done || busy || hasPending}
                    onClick={() =>
                      void write(q.testQuestionId, 'answers', {
                        textResponse: text[q.testQuestionId] ?? '',
                      })
                    }
                  >
                    Lưu bài viết
                  </button>
                </div>
              ) : (
                <fieldset className="space-y-3">
                  <legend>Chọn câu trả lời xem thử</legend>
                  {q.options.map((o) => (
                    <label className="flex gap-3 rounded-lg border p-3" key={o.id}>
                      <input
                        type="radio"
                        name={q.testQuestionId}
                        disabled={done || busy || hasPending}
                        checked={(choiceDraft[q.testQuestionId] ?? q.selectedOptionIds).includes(
                          o.id,
                        )}
                        onChange={() => {
                          setChoiceDraft((current) => ({ ...current, [q.testQuestionId]: [o.id] }));
                          void write(q.testQuestionId, 'answers', { selectedOptionIds: [o.id] });
                        }}
                      />
                      {o.content}
                    </label>
                  ))}
                </fieldset>
              )}
              <button
                className={btn + ' mt-5'}
                disabled={done || busy || recordingBusy || hasPending}
                onClick={() =>
                  void write(q.testQuestionId, 'marks', {
                    marked: !exam.marked.includes(q.testQuestionId),
                  })
                }
              >
                {exam.marked.includes(q.testQuestionId) ? 'Bỏ Mark' : 'Đánh dấu Mark'}
              </button>
            </>
          )}
        </section>
        <aside className="hidden min-w-0 rounded-xl border bg-white p-4 lg:block">{nav}</aside>
      </div>
      {navigatorOpen && (
        <dialog
          open
          className="fixed inset-0 z-50 max-h-[90vh] w-[min(92vw,440px)] overflow-auto rounded-xl border bg-white p-5"
          aria-label="Điều hướng câu hỏi"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setNavigatorOpen(false);
          }}
        >
          <button className={btn} autoFocus onClick={() => setNavigatorOpen(false)}>
            Đóng điều hướng
          </button>
          {nav}
        </dialog>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          className={btn}
          disabled={done || busy || recordingBusy || hasPending}
          onClick={() => void write(undefined, 'complete', {})}
        >
          Kết thúc bản xem thử không chấm điểm
        </button>
        <Link className={btn} to={'/placement/previews/' + attemptId + '/result'}>
          Xem trạng thái chẩn đoán
        </Link>
      </div>
    </main>
  );
}
export function PlacementDiagnosticPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  return <PlacementDiagnostic key={attemptId} attemptId={attemptId} />;
}
function PlacementDiagnostic({ attemptId }: { attemptId: string | undefined }) {
  const [data, setData] = useState<PreviewDiagnostic>(),
    [error, setError] = useState(''),
    [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    if (attemptId)
      void placementIntegration
        .diagnostic(attemptId)
        .then((d) => {
          if (live) {
            setData(d);
            setError('');
          }
        })
        .catch(() => {
          if (live)
            setError(
              'Không thể tải trạng thái hoặc bạn không có quyền truy cập. Không có điểm được suy diễn.',
            );
        });
    return () => {
      live = false;
    };
  }, [attemptId, tick]);
  return (
    <main className="section-shell max-w-4xl space-y-5 py-10">
      <Link to="/placement">← Kiểm tra đầu vào</Link>
      <h1 className="text-3xl font-bold">Trạng thái Placement</h1>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <h2 className="text-2xl font-bold">{data.label}</h2>
          <p>
            {data.state === 'PREVIEW_IN_PROGRESS'
              ? 'Bản xem thử đang làm'
              : 'PENDING — Đang chờ đủ nguồn và điều kiện đánh giá'}
          </p>
          <p>
            Mục tiêu tự khai LR: {data.goals.goalLR}
            {data.mode === 'FOUR_SKILLS'
              ? ` · Speaking: ${data.goals.goalSpeaking} · Writing: ${data.goals.goalWriting}`
              : ''}
            . Mục tiêu không phải điểm năng lực.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {data.skillResults.map((s) => (
              <article key={s.skill} className="rounded-xl border p-5">
                <h3 className="font-bold">{s.skill}</h3>
                <p>
                  {s.status === 'PENDING_EVALUATION'
                    ? 'CHỜ ĐÁNH GIÁ / CHỜ QUY TRÌNH DUYỆT'
                    : 'CHƯA ĐỦ DỮ LIỆU'}
                </p>
                <p>Chưa có điểm được phép công bố.</p>
              </article>
            ))}
          </div>
          <p>
            Chưa có tiêu chí matching được duyệt. Không gợi ý lớp hoặc quy đổi điểm TOEIC chính
            thức.
          </p>
          {data.receipt && <p>Biên nhận bản xem thử: {data.receipt}</p>}
        </>
      )}
      <button className={btn} onClick={() => setTick((x) => x + 1)}>
        Tải lại trạng thái
      </button>
    </main>
  );
}
