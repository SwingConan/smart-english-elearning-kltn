import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { Bookmark, CheckCircle2, ChevronLeft, ChevronRight, Clock, Volume2 } from 'lucide-react';
import { useAuth } from '@/features/auth/auth-context';
import {
  workflow,
  type Sitting,
  type WorkflowConfig,
  type WorkflowDiagnostic,
  type WorkflowReview,
} from '@/features/placement/workflow-api';
import { RubricScoreForm } from '@/features/placement/RubricScoreForm';
import { accountLabel } from '@/features/catalog/record-presentation';
import { PlacementReadinessPanel } from '@/features/placement/PlacementReadinessPanel';
import { PlacementClassMatches } from '@/features/placement/PlacementClassMatches';
import { TaskRecorder } from '@/features/placement/TaskRecorder';
import { DoublePromptAnswer } from '@/features/placement/DoublePromptAnswer';
import { AssessmentTextStimulus } from '@/features/placement/AssessmentTextStimulus';
import { resolvePlacementPdfPassages } from '@/features/placement/placement-pdf-passages';
import { PlacementPdfPassagePane } from '@/features/placement/PlacementPdfPassagePane';
import { usePlacementHeaderStatus } from '@/layouts/placement-header-status';
import { apiUrl, ApiError } from '@/lib/api-client';
const field = 'w-full rounded-lg border border-slate-300 bg-white p-3',
  button =
    'rounded-lg border border-indigo-300 bg-white px-4 py-2 text-indigo-900 disabled:opacity-50';
function useRequest() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = useRef<{ path: string; body: unknown } | null>(null);
  const send = async <T,>(
    path: string,
    body: Record<string, unknown>,
    confirmed?: () => Promise<void>,
  ): Promise<T | undefined> => {
    if (busy) return;
    pending.current ??= { path, body: { ...body, idempotencyKey: crypto.randomUUID() } };
    setBusy(true);
    setError('');
    try {
      const p = pending.current,
        r = await workflow.post<T>(p.path, p.body);
      if (confirmed) await confirmed();
      pending.current = null;
      return r;
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) pending.current = null;
      setError(
        'Chưa xác nhận yêu cầu. Thử lại đúng yêu cầu hoặc tải trạng thái đã lưu; không tự tạo lượt thi/điểm 0.',
      );
    } finally {
      setBusy(false);
    }
  };
  return {
    busy,
    error,
    send,
    pending,
    clear: () => {
      pending.current = null;
      setError('');
    },
  };
}
export function PlacementWorkflowPage() {
  const { user } = useAuth();
  if (user?.role === 'STUDENT') return <Navigate to="/placement" replace />;
  return user ? <WorkflowHome key={user.id} /> : <p>Đăng nhập để tiếp tục.</p>;
}
type StaffQueueItem = {
  id: string;
  attemptId?: string;
  assignmentId?: string;
  startedAt?: string;
  submittedAt?: string | null;
  status?: string;
  sourceTitle?: string | null;
  learner?: { fullName?: string | null } | null;
  currentAssignment?: {
    id: string;
    graderId: string;
    graderName: string;
    assignedAt: string;
  } | null;
  evaluationSkills?: { skill: string; published: boolean }[];
  placementSitting?: {
    phase?: string;
    createdAt?: string;
    deadline?: string | null;
    policy?: { mode?: string } | null;
  } | null;
};

function WorkflowHome() {
  const { user } = useAuth();
  const [policyReason, setPolicyReason] = useState('');
  const nav = useNavigate(),
    [config, setConfig] = useState<WorkflowConfig>(),
    [queue, setQueue] = useState<StaffQueueItem[]>([]),
    [staffTab, setStaffTab] = useState<'queue' | 'config'>('queue'),
    [queueSearch, setQueueSearch] = useState(''),
    [queueFilter, setQueueFilter] = useState<'ALL' | 'NEEDS_ACTION' | 'FOUR_SKILLS' | 'LR'>('ALL'),
    [error, setError] = useState(''),
    [mode, setMode] = useState('LR'),
    [source, setSource] = useState(''),
    [goalLR, setLR] = useState(''),
    [goalS, setS] = useState(''),
    [goalW, setW] = useState(''),
    [consent, setConsent] = useState(false),
    [mic, setMic] = useState(false),
    [kind, setKind] = useState('SOURCE_TIMING'),
    [body, setBody] = useState(''),
    [note, setNote] = useState(''),
    req = useRequest();
  const load = useCallback(async () => {
    try {
      const c = await workflow.config();
      setConfig(c);
      try {
        setQueue(await workflow.get<StaffQueueItem[]>('/queue'));
      } catch {
        setQueue([]);
      }
    } catch {
      setError(
        'Phân hệ kiểm tra đầu vào hiện chưa sẵn sàng hoặc tài khoản chưa được cấp quyền thao tác.',
      );
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  if (!config)
    return (
      <main className="section-shell py-10">
        <h1>Đánh giá kiểm tra đầu vào</h1>
        <p role="alert">{error || 'Đang tải…'}</p>
      </main>
    );
  const policy = config.policies.find(
    (p) => p.kind === 'SOURCE_TIMING' && p.sourceId === source && (p.approved || p.approvedById),
  );
  const authorCap =
    'placement.' +
    { SOURCE_TIMING: 'source', RUBRIC: 'rubric', CRITERIA: 'criteria' }[kind] +
    '.author';
  const canAuthorAnyPolicy = ['source', 'rubric', 'criteria'].some(
    (k) => config.permissions[`placement.${k}.author`],
  );
  const canApproveAnyPolicy = ['source', 'rubric', 'criteria'].some(
    (k) => config.permissions[`placement.${k}.approve`],
  );
  const policyKindLabels: Record<string, string> = {
    SOURCE_TIMING: 'Nguồn & Thời lượng',
    RUBRIC: 'Thang chấm (Rubric)',
    CRITERIA: 'Tiêu chí xếp lớp',
  };
  const policyModeLabels: Record<string, string> = {
    LR: 'Listening & Reading',
    FOUR_SKILLS: '4 kỹ năng',
  };
  const phaseLabels: Record<string, string> = {
    SUBMITTED: 'Đã nộp bài · Chờ xử lý',
    IN_PROGRESS: 'Đang làm bài',
    PUBLISHED: 'Đã công bố kết quả',
    BLOCKED_REVIEW: 'Đang rà soát',
  };
  const formatPlacementTime = (iso?: string | null) =>
    iso
      ? new Intl.DateTimeFormat('vi-VN', {
          timeZone: 'Asia/Ho_Chi_Minh',
          dateStyle: 'short',
          timeStyle: 'short',
        }).format(new Date(iso))
      : '—';
  const isQueueNeedsAction = (x: StaffQueueItem) => {
    const modeCode = x.placementSitting?.policy?.mode ?? '';
    const skills = x.evaluationSkills ?? [];
    if (modeCode === 'FOUR_SKILLS') {
      const sPub = skills.find((s) => s.skill === 'SPEAKING')?.published;
      const wPub = skills.find((s) => s.skill === 'WRITING')?.published;
      return !x.currentAssignment || !sPub || !wPub;
    }
    return !skills.some((s) => s.published);
  };
  const filteredQueue = queue.filter((x) => {
    const modeCode = x.placementSitting?.policy?.mode ?? '';
    if (queueFilter === 'FOUR_SKILLS' && modeCode !== 'FOUR_SKILLS') return false;
    if (queueFilter === 'LR' && modeCode !== 'LR') return false;
    if (queueFilter === 'NEEDS_ACTION' && !isQueueNeedsAction(x)) return false;
    const q = queueSearch.trim().toLowerCase();
    if (!q) return true;
    const learnerName = x.learner?.fullName ? accountLabel(x.learner.fullName) : '';
    const graderName = x.currentAssignment?.graderName ? accountLabel(x.currentAssignment.graderName) : '';
    const sourceTitle = x.sourceTitle ?? '';
    return `${learnerName} ${graderName} ${sourceTitle} ${x.id} ${modeCode}`.toLowerCase().includes(q);
  });
  return (
    <main className="workspace-page">
      <div className="workspace-header">
        <div>
          <span className="badge-info">Đánh giá năng lực đầu vào TOEIC</span>
          <h1 className="mt-2 text-2xl font-bold text-[#e66f2b] sm:text-3xl">
            {config.internalAssessment
              ? 'Quản lý kiểm tra đầu vào Smart English'
              : 'Kiểm tra đầu vào'}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {config.internalAssessment
              ? 'Theo dõi lượt thi xếp lớp, phân công giảng viên chấm Nói/Viết và xem cấu hình tiêu chuẩn.'
              : 'Không gian kiểm tra và cấu hình kiểm định đầu vào.'}
          </p>
        </div>
        {config.role !== 'STUDENT' && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStaffTab('queue')}
              className={`rounded-lg border px-3.5 py-2 text-xs font-semibold transition ${
                staffTab === 'queue'
                  ? 'border-[#5f8b48] bg-[#5f8b48] text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              Danh sách lượt thi ({queue.length})
            </button>
            {(canAuthorAnyPolicy || canApproveAnyPolicy || config.policies.length > 0) && (
              <button
                type="button"
                onClick={() => setStaffTab('config')}
                className={`rounded-lg border px-3.5 py-2 text-xs font-semibold transition ${
                  staffTab === 'config'
                    ? 'border-[#5f8b48] bg-[#5f8b48] text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Cấu hình &amp; Tiêu chuẩn ({config.policies.length})
              </button>
            )}
          </div>
        )}
      </div>
      {req.error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {req.error}
        </p>
      )}
      {config.role === 'STUDENT' && (
        <Link className={button} to="/placement/microphone">
          Kiểm tra microphone vật lý trước khi thi
        </Link>
      )}
      {(config.role === 'STUDENT' || staffTab === 'config') &&
        ['placement.source.author', 'placement.source.approve', 'placement.result.publish'].some(
          (cap) => config.permissions[cap],
        ) && <PlacementReadinessPanel />}
      {config.role === 'STUDENT' ? (
        <section className="max-w-2xl space-y-4 rounded-xl border p-5">
          <h2 className="text-xl font-bold">Chuẩn bị một lượt thi DEV</h2>
          <label>
            Chế độ
            <select
              aria-label="Chế độ"
              className={field}
              value={mode}
              onChange={(e) => {
                setMode(e.target.value);
                setSource('');
                setS('');
                setW('');
                setConsent(false);
                setMic(false);
              }}
            >
              <option value="LR">Listening & Reading</option>
              <option value="FOUR_SKILLS">Bốn kỹ năng</option>
            </select>
          </label>
          <label>
            Nguồn kiểm chứng
            <select
              aria-label="Nguồn kiểm chứng"
              className={field}
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="">Chọn nguồn có timing đã duyệt DEV</option>
              {config.sources
                .filter((s) => s.mode === mode)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} · {s.itemCount} câu synthetic
                  </option>
                ))}
            </select>
          </label>
          <label>
            Mục tiêu LR
            <input
              className={field}
              type="number"
              min="10"
              max="990"
              value={goalLR}
              onChange={(e) => setLR(e.target.value)}
            />
          </label>
          {mode === 'FOUR_SKILLS' && (
            <>
              <label>
                Mục tiêu Speaking
                <input
                  className={field}
                  type="number"
                  min="0"
                  max="200"
                  value={goalS}
                  onChange={(e) => setS(e.target.value)}
                />
              </label>
              <label>
                Mục tiêu Writing
                <input
                  className={field}
                  type="number"
                  min="0"
                  max="200"
                  value={goalW}
                  onChange={(e) => setW(e.target.value)}
                />
              </label>
              <button
                className={button}
                onClick={() =>
                  void navigator.mediaDevices
                    .getUserMedia({ audio: true })
                    .then((s) => {
                      s.getTracks().forEach((t) => t.stop());
                      setMic(true);
                      setNote('Microphone sẵn sàng');
                    })
                    .catch(() => {
                      setMic(false);
                      setNote('Không mở được microphone. Chưa bắt đầu lượt thi.');
                    })
                }
              >
                Kiểm tra microphone
              </button>
              <p role="status">{note}</p>
            </>
          )}
          <p>
            Listening 45 phút, Reading 75 phút; không tạm dừng. Bốn kỹ năng được nghỉ tối đa 10 phút
            sau Reading; cửa sổ từng bài S/W theo phiên bản đã duyệt. Refresh không gia hạn hoặc tạo
            lượt mới.
          </p>
          <label className="flex gap-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Tôi hiểu đây là kiểm chứng DEV và sẵn sàng bắt đầu.
          </label>
          <button
            className={button}
            disabled={
              !consent ||
              !policy ||
              req.busy ||
              !goalLR ||
              !Number.isInteger(Number(goalLR)) ||
              +goalLR < 10 ||
              +goalLR > 990 ||
              (mode === 'FOUR_SKILLS' &&
                (!mic ||
                  goalS === '' ||
                  goalW === '' ||
                  ![+goalS, +goalW].every((x) => Number.isInteger(x) && x >= 0 && x <= 200)))
            }
            onClick={() =>
              void req
                .send<{ attemptId: string }>('/attempts', {
                  sourceVersionId: source,
                  policyId: policy!.id,
                  mode,
                  goalLR: +goalLR,
                  ...(mode === 'FOUR_SKILLS' ? { goalSpeaking: +goalS, goalWriting: +goalW } : {}),
                })
                .then((r) => {
                  if (r) nav('/placement/sittings/' + r.attemptId);
                })
            }
          >
            Bắt đầu / tiếp tục đúng lượt DEV
          </button>
          <button className={button} disabled>
            Bài thi thật chưa phát hành
          </button>
        </section>
      ) : staffTab === 'config' ? (
        <div className="space-y-5">
          {canAuthorAnyPolicy && (
            <details className="workspace-card">
              <summary className="cursor-pointer text-base font-bold text-slate-900 select-none">
                + Tạo phiên bản chính sách mới (Cấu hình kỹ thuật)
              </summary>
              <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block text-xs font-semibold text-slate-700">
                    Loại cấu hình
                    <select
                      aria-label="Loại"
                      className={field + ' mt-1'}
                      value={kind}
                      onChange={(e) => setKind(e.target.value)}
                    >
                      <option value="SOURCE_TIMING">Nguồn và cửa sổ thời gian</option>
                      <option value="RUBRIC">Rubric theo task</option>
                      <option value="CRITERIA">Tiêu chí đối sánh lớp</option>
                    </select>
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    Chế độ thi
                    <select
                      aria-label="Chế độ"
                      className={field + ' mt-1'}
                      value={mode}
                      onChange={(e) => setMode(e.target.value)}
                    >
                      <option value="LR">Nghe &amp; Đọc (Listening &amp; Reading)</option>
                      <option value="FOUR_SKILLS">Đánh giá 4 kỹ năng</option>
                    </select>
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    Nguồn đề áp dụng
                    <select
                      aria-label="Nguồn kiểm chứng"
                      className={field + ' mt-1'}
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                    >
                      <option value="">Tiêu chí không gắn nguồn</option>
                      {config.sources.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block text-xs font-semibold text-slate-700">
                  Nội dung phiên bản (JSON có nguồn chứng cứ và thang nội bộ)
                  <textarea
                    aria-label="Nội dung phiên bản"
                    className={field + ' mt-1 font-mono text-xs'}
                    rows={6}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                </label>
                {config.sources.find((s) => s.id === source)?.sourceHash && (
                  <details className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                    <summary className="cursor-pointer font-semibold text-slate-700">
                      Xem metadata nguồn kiểm chứng
                    </summary>
                    <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(
                        config.sources.find((s) => s.id === source),
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                )}
                <label className="block text-xs font-semibold text-slate-700">
                  Lý do soạn/duyệt chính sách (tối thiểu 10 ký tự)
                  <input
                    aria-label="Lý do chính sách"
                    className={field + ' mt-1'}
                    value={policyReason}
                    onChange={(e) => setPolicyReason(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className={button}
                  disabled={
                    !config.permissions[authorCap] || req.busy || policyReason.trim().length < 10
                  }
                  onClick={() => {
                    try {
                      const parsed = JSON.parse(body);
                      void req
                        .send('/policies', {
                          kind,
                          mode,
                          ...(kind === 'CRITERIA' ? {} : { sourceId: source }),
                          body: parsed,
                          reason: policyReason,
                        })
                        .then((r) => {
                          if (r) {
                            setBody('');
                            void Promise.resolve().then(load);
                          }
                        });
                    } catch {
                      setNote('JSON không hợp lệ; chưa gửi.');
                    }
                  }}
                >
                  Tạo bản nháp mới
                </button>
                {note && <p role="status" className="text-xs text-amber-800">{note}</p>}
              </div>
            </details>
          )}
          {(canAuthorAnyPolicy || canApproveAnyPolicy) && (
            <section className="workspace-card space-y-3">
              <h2 className="text-lg font-bold text-slate-900">
                Danh sách chính sách đã cấu hình ({config.policies.length})
              </h2>
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Loại cấu hình</th>
                      <th>Chế độ</th>
                      <th>Trạng thái</th>
                      <th>Chi tiết kỹ thuật</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {config.policies.map((p) => {
                      const cap =
                        'placement.' +
                        { SOURCE_TIMING: 'source', RUBRIC: 'rubric', CRITERIA: 'criteria' }[p.kind] +
                        '.approve';
                      return (
                        <tr key={p.id} className="align-top">
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {policyKindLabels[p.kind] ?? p.kind}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-700">
                            {policyModeLabels[p.mode] ?? p.mode}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className={p.approvedById ? 'badge-published' : 'badge-draft'}>
                              {p.approvedById ? 'Đã duyệt' : 'Bản nháp'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <details className="text-xs">
                              <summary className="cursor-pointer font-semibold text-[#2f5d1e] select-none hover:underline">
                                Xem tham số cấu hình (JSON)
                              </summary>
                              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-3 text-[11px] text-slate-700">
                                {JSON.stringify(p.body, null, 2)}
                              </pre>
                            </details>
                            {!p.approvedById && config.permissions[cap] && (
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <input
                                  aria-label="Lý do duyệt"
                                  placeholder="Lý do duyệt (>= 10 ký tự)"
                                  className="rounded border border-slate-300 px-2.5 py-1 text-xs"
                                  value={policyReason}
                                  onChange={(e) => setPolicyReason(e.target.value)}
                                />
                                <button
                                  type="button"
                                  className={button + ' text-xs'}
                                  disabled={req.busy || policyReason.trim().length < 10}
                                  onClick={() =>
                                    void req
                                      .send('/policies/' + p.id + '/approve', { reason: policyReason })
                                      .then((r) => {
                                        if (r) void load();
                                      })
                                  }
                                >
                                  Phê duyệt chính sách
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      ) : null}
      {(config.role === 'STUDENT' || staffTab === 'queue') && (
        <section className="workspace-card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Các lượt thi trong phạm vi của bạn ({filteredQueue.length}/{queue.length})
              </h2>
              <p className="text-xs text-slate-600">
                Bài Listening &amp; Reading được chấm tự động sau khi nộp; bài 4 kỹ năng cần phân công giảng viên chấm Nói/Viết và công bố độc lập.
              </p>
            </div>
            {queue.length > 0 && config.role !== 'STUDENT' && (
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    ['ALL', 'Tất cả'],
                    ['FOUR_SKILLS', '4 kỹ năng'],
                    ['LR', 'Listening & Reading'],
                    ['NEEDS_ACTION', 'Chờ xử lý'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setQueueFilter(key)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      queueFilter === key
                        ? 'border-[#5f8b48] bg-[#e9f2e4] text-[#2f5d1e]'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <input
                  type="search"
                  className="w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-[#5f8b48] focus:outline-none"
                  placeholder="Tìm thí sinh, GV hoặc mã…"
                  value={queueSearch}
                  onChange={(e) => setQueueSearch(e.target.value)}
                />
              </div>
            )}
          </div>
          {filteredQueue.length === 0 ? (
            <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
              {queue.length === 0
                ? 'Hiện chưa có lượt thi kiểm tra đầu vào nào được phân công chấm hoặc chờ xử lý trong phạm vi của bạn.'
                : 'Không có lượt thi nào khớp từ khóa hoặc bộ lọc hiện tại.'}
            </p>
          ) : config.role === 'STUDENT' ? (
            <div className="space-y-2">
              {filteredQueue.map((x) => (
                <p className="border-b py-3" key={x.id}>
                  <Link className="text-indigo-800 underline" to={'/placement/sittings/' + x.id}>
                    Lượt thi {formatPlacementTime(x.startedAt)} · {x.id.slice(0, 8)}
                  </Link>
                </p>
              ))}
            </div>
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Thí sinh</th>
                    <th>Đề thi &amp; Hình thức</th>
                    <th>Giảng viên chấm</th>
                    <th>Thời gian nộp</th>
                    <th>Trạng thái xử lý</th>
                    <th className="text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredQueue.map((x) => {
                    const attemptId = x.attemptId ?? x.id;
                    const modeCode = x.placementSitting?.policy?.mode ?? '';
                    const phaseCode = x.placementSitting?.phase ?? x.status ?? '';
                    const skills = x.evaluationSkills ?? [];
                    const hasSpeakingEval = skills.some((s) => s.skill === 'SPEAKING');
                    const hasWritingEval = skills.some((s) => s.skill === 'WRITING');
                    const swPublished =
                      skills.find((s) => s.skill === 'SPEAKING')?.published &&
                      skills.find((s) => s.skill === 'WRITING')?.published;
                    const lrPublished = skills.find((s) => s.skill === 'LR')?.published;

                    let statusLabel = phaseLabels[phaseCode] ?? 'Chờ rà soát';
                    let statusBadgeClass = 'badge-pending';
                    if (modeCode === 'FOUR_SKILLS') {
                      if (swPublished) {
                        statusLabel = 'Đã chấm & công bố 4 kỹ năng';
                        statusBadgeClass = 'badge-published';
                      } else if (hasSpeakingEval && hasWritingEval) {
                        statusLabel = 'Đã chấm Nói/Viết · Chờ công bố';
                        statusBadgeClass = 'badge-info';
                      } else if (x.currentAssignment) {
                        statusLabel = 'Đã phân công GV · Chờ chấm Nói/Viết';
                        statusBadgeClass = 'badge-pending';
                      } else {
                        statusLabel = 'Chờ phân công GV chấm Nói/Viết';
                        statusBadgeClass = 'badge-warning';
                      }
                    } else if (modeCode === 'LR') {
                      if (lrPublished) {
                        statusLabel = 'Đã chấm tự động · Đã công bố';
                        statusBadgeClass = 'badge-published';
                      } else {
                        statusLabel = 'Đã chấm tự động (Nghe & Đọc)';
                        statusBadgeClass = 'badge-info';
                      }
                    }

                    return (
                      <tr key={x.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <span className="font-semibold text-slate-900">
                            {x.learner?.fullName
                              ? accountLabel(x.learner.fullName)
                              : `Thí sinh #${attemptId.slice(0, 8).toUpperCase()}`}
                          </span>
                          <p className="text-[11px] text-slate-500">
                            Mã hồ sơ #{attemptId.slice(0, 8).toUpperCase()}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <div className="font-semibold text-slate-800">
                            {policyModeLabels[modeCode] || 'Đánh giá đầu vào'}
                          </div>
                          {x.sourceTitle && (
                            <div className="line-clamp-1 text-[11px] text-slate-500">
                              {x.sourceTitle
                                .replace('Smart English Original FOUR_SKILLS Placement Bank (SE-ORIG-V1)', 'Ngân hàng đề 4 kỹ năng chuẩn Smart English')
                                .replace('Smart English Original LR Placement Bank (SE-ORIG-V1)', 'Ngân hàng đề Nghe & Đọc chuẩn Smart English')}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {modeCode === 'FOUR_SKILLS' ? (
                            x.currentAssignment ? (
                              <span className="font-medium text-slate-800">
                                {accountLabel(x.currentAssignment.graderName)}
                              </span>
                            ) : (
                              <span className="font-medium text-amber-700">Chưa phân công GV</span>
                            )
                          ) : (
                            <span className="text-slate-400">Tự động chấm trắc nghiệm</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                          {formatPlacementTime(x.submittedAt ?? x.startedAt ?? x.placementSitting?.createdAt)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className={statusBadgeClass}>{statusLabel}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <Link
                            className="inline-flex items-center rounded-lg border border-[#5f8b48] bg-[#f4f8f1] px-3 py-1.5 text-xs font-semibold text-[#2f5d1e] hover:bg-[#5f8b48] hover:text-white"
                            to={'/workspace/placement/attempts/' + attemptId}
                          >
                            {modeCode === 'FOUR_SKILLS' && !x.currentAssignment
                              ? 'Phân công GV chấm'
                              : modeCode === 'FOUR_SKILLS'
                                ? 'Mở hồ sơ & Chấm/Công bố'
                                : 'Xem chi tiết bài làm'}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
export function PlacementSittingPage() {
  const { user } = useAuth(),
    { attemptId } = useParams();
  return <SittingExam key={user?.id + ':' + attemptId} id={attemptId!} />;
}
function SittingExam({ id }: { id: string }) {
  const navigate = useNavigate();
  const { setStatus: setHeaderStatus } = usePlacementHeaderStatus();
  const [loading, setLoading] = useState(false);
  const [confirmNextOpen, setConfirmNextOpen] = useState(false);
  const [exam, setExam] = useState<Sitting>(),
    [error, setError] = useState(''),
    [current, setCurrent] = useState(0),
    [text, setText] = useState<Record<string, string>>({}),
    [choices, setChoices] = useState<Record<string, string[]>>({}),
    [recording, setRecording] = useState(false),
    [remaining, setRemaining] = useState(0),
    req = useRequest(),
    received = useRef({ at: 0, remaining: 0 });
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const e = await workflow.get<Sitting>('/attempts/' + id);
      setExam(e);
      setHeaderStatus(
        e.phase === 'SUBMITTED'
          ? 'SUBMITTED_PENDING_REVIEW'
          : e.phase === 'BLOCKED_REVIEW'
            ? 'BLOCKED_REVIEW'
            : 'IN_PROGRESS',
      );
      received.current = {
        at: performance.now(),
        remaining: e.deadline ? Math.max(0, Date.parse(e.deadline) - Date.parse(e.serverTime)) : 0,
      };
      setRemaining(Math.ceil(received.current.remaining / 1000));
      setError('');
      return e;
    } catch {
      setExam(undefined);
      setHeaderStatus(null);
      setError('Không thể tải lượt thi hoặc phiên đã hết hạn. Câu trả lời đã lưu được giữ nguyên.');
    } finally {
      setLoading(false);
    }
  }, [id, setHeaderStatus]);
  useEffect(() => {
    void Promise.resolve().then(load);
    const timer = setInterval(() => {
      const left = Math.max(
        0,
        Math.ceil((received.current.remaining - (performance.now() - received.current.at)) / 1000),
      );
      setRemaining(left);
      if (!left && received.current.remaining > 0) {
        received.current.remaining = 0;
        void Promise.resolve().then(load);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    if (exam?.phase === 'SUBMITTED') {
      void navigate('/placement/sittings/' + id + '/result', { replace: true });
    }
  }, [exam?.phase, id, navigate]);
  const write = async (path: string, b: Record<string, unknown>) => {
    if (loading || req.busy) return;
    const payload = (req.pending.current?.body ?? b) as Record<string, unknown>;
    const r = await req.send(path, { ...b, expectedLockVersion: exam!.lockVersion }, async () => {
      if (!(await load())) throw new Error('Authoritative state unavailable after ACK');
    });
    if (r) {
      if (typeof payload.questionId === 'string' && payload.marked === undefined) {
        const qid = payload.questionId;
        setText((prev) => {
          const next = { ...prev };
          delete next[qid];
          return next;
        });
        setChoices((prev) => {
          const next = { ...prev };
          delete next[qid];
          return next;
        });
      }
    }
  };
  if (!exam)
    return (
      <main className="p-8">
        <p role="alert">{error || 'Đang tải lượt thi…'}</p>
      </main>
    );
  const qs = exam.groups.flatMap((g) => g.questions.map((q) => ({ g, q }))),
    item = qs[Math.min(current, Math.max(0, qs.length - 1))],
    q = item?.q,
    g = item?.g,
    terminal = ['SUBMITTED', 'BLOCKED_REVIEW'].includes(exam.phase);
  const estimatedNow = exam.deadline
      ? Date.parse(exam.deadline) - remaining * 1000
      : Date.parse(exam.serverTime),
    prepReady =
      !g?.window ||
      estimatedNow >= Date.parse(exam.phaseStartedAt) + g.window.preparationSeconds * 1000,
    responseReady =
      !g?.window ||
      estimatedNow >=
        Date.parse(exam.phaseStartedAt) +
          (g.window.preparationSeconds + g.window.playbackSeconds) * 1000;
  const answeredCount = qs.filter(
    ({ q: itemQ }) =>
      itemQ.selectedOptionIds.length > 0 ||
      !!itemQ.textResponse?.trim() ||
      itemQ.audioUploaded,
  ).length;
  const activeIdx = Math.min(current, Math.max(0, qs.length - 1));
  const pdfPassage = resolvePlacementPdfPassages(g);
  const pdfFallbackText =
    g?.stimulusText ??
    g?.stimuli.find((s) => s.type === 'TEXT' && s.textContent)?.textContent ??
    null;
  const isMarked = q ? exam.marked.includes(q.testQuestionId) : false;
  const currentSaved = q
    ? q.selectedOptionIds.length > 0 || !!q.textResponse?.trim() || q.audioUploaded
    : false;
  const currentDirty = q
    ? (q.responseType === 'SINGLE_CHOICE' && choices[q.testQuestionId] !== undefined) ||
      (q.responseType === 'TEXT_RESPONSE' && text[q.testQuestionId] !== undefined)
    : false;

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-6 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-xs">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 font-semibold text-emerald-700 ring-1 ring-emerald-200/80">
              {exam.internalAssessment
                ? 'Đánh giá năng lực đầu vào Smart English'
                : 'Kiểm chứng DEV riêng tư'}
            </span>
            <span>·</span>
            <Link
              className="text-slate-500 underline-offset-2 hover:text-emerald-700 hover:underline"
              to={'/placement/sittings/' + id + '/result'}
            >
              Trạng thái kết quả
            </Link>
          </div>
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              {exam.title}
            </h1>
            <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
              {{
                LISTENING: 'Nghe hiểu',
                READING: 'Đọc hiểu',
                SPEAKING: 'Nói',
                WRITING: 'Viết',
                BREAK: 'Nghỉ giữa phần',
                SUBMITTED: 'Đã nộp bài',
                BLOCKED_REVIEW: 'Cần hỗ trợ',
              }[exam.phase] ?? exam.phase}
              {['SPEAKING', 'WRITING'].includes(exam.phase) ? ` · Bài ${exam.taskIndex + 1}` : ''}
            </span>
          </div>
          {exam.deadline && (
            <p className="text-xs text-slate-500">
              Hạn server:{' '}
              {new Intl.DateTimeFormat('vi-VN', {
                timeZone: 'Asia/Ho_Chi_Minh',
                dateStyle: 'short',
                timeStyle: 'medium',
              }).format(new Date(exam.deadline))}{' '}
              (Việt Nam) · Không tạm dừng/gia hạn
            </p>
          )}
        </div>
        <div
          aria-live="polite"
          className="flex items-center gap-3 rounded-xl bg-slate-900 px-4 py-2.5 text-white shadow-sm"
        >
          <Clock className="h-5 w-5 text-emerald-400" />
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-300">
              Thời gian còn lại
            </p>
            <strong className="text-2xl font-bold tabular-nums sm:text-3xl">
              {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
            </strong>
          </div>
        </div>
      </header>
      {exam.awaitingUpload && (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900"
        >
          Đã hết cửa sổ trả lời; chỉ tải bản ghi đã thực hiện. Không phát lại hoặc ghi mới.
        </p>
      )}
      {(error || req.error) && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          <span>{error || req.error}</span>
          {req.pending.current && (
            <button
              className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
              disabled={loading || req.busy}
              onClick={() => void write(req.pending.current!.path, {})}
            >
              Thử lại đúng yêu cầu
            </button>
          )}
        </div>
      )}
      {terminal ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <h2 className="text-xl font-bold text-slate-900">
            {exam.phase === 'SUBMITTED' ? 'Đã nộp bài thành công' : 'Cần học vụ kiểm tra'}
          </h2>
          {exam.blockedReason && (
            <div className="space-y-2 text-sm text-slate-700">
              <p>
                Chưa nộp, không tự chấm 0 — bài làm đã được giữ lại để học vụ kiểm tra lý do:{' '}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-900">
                  {exam.blockedReason}
                </code>
              </p>
            </div>
          )}
          {exam.phase === 'SUBMITTED' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-700">
                {exam.mode === 'LR'
                  ? 'Bài làm đã được lưu và chấm tự động phần Nghe/Đọc. Đang chuyển tới trang kết quả và gợi ý lớp học…'
                  : 'Bài làm đã được lưu. Điểm Nghe/Đọc đã sẵn sàng; phần Nói/Viết chờ giáo viên chấm và xác nhận.'}
              </p>
              <Link
                to={'/placement/sittings/' + id + '/result'}
                className="inline-flex items-center rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-emerald-800"
              >
                Xem kết quả ngay
              </Link>
            </div>
          )}
        </section>
      ) : exam.phase === 'BREAK' ? (
        <section className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-8">
          <h2 className="text-xl font-bold text-indigo-950">Nghỉ giữa Reading và Speaking</h2>
          <p className="text-sm text-indigo-900">
            Server tự kết thúc tối đa 10 phút; chưa mở câu Speaking.
          </p>
          <button
            className="rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
            disabled={loading || req.busy}
            onClick={() => void write('/attempts/' + id + '/commands', { action: 'NEXT' })}
          >
            Bắt đầu Speaking
          </button>
        </section>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_290px]">
          <section className="min-w-0 space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-md bg-emerald-700 px-2 py-0.5 text-xs font-bold tracking-wide text-white">
                    {g?.skill ?? exam.phase}
                  </span>
                  <h2 className="text-lg font-bold text-slate-900 sm:text-xl">
                    Câu {Math.min(activeIdx + 1, qs.length)}
                    {qs.length > 0 ? (
                      <span className="ml-1.5 text-sm font-normal text-slate-400">
                        / {qs.length}
                      </span>
                    ) : null}
                  </h2>
                  {currentDirty && (req.busy || loading) ? (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                      Đang tự động lưu…
                    </span>
                  ) : currentDirty ? (
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                      Chưa lưu thay đổi
                    </span>
                  ) : currentSaved ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Đã lưu
                    </span>
                  ) : null}
                </div>
              </div>
              {q && (
                <button
                  type="button"
                  aria-label={isMarked ? 'Bỏ Mark' : 'Đánh dấu Mark'}
                  aria-pressed={isMarked}
                  title={isMarked ? 'Bỏ đánh dấu câu này' : 'Đánh dấu xem lại (Bookmark)'}
                  disabled={loading || req.busy || recording || !!req.pending.current}
                  onClick={() =>
                    void write('/attempts/' + id + '/answers', {
                      questionId: q.testQuestionId,
                      marked: !isMarked,
                    })
                  }
                  className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition disabled:opacity-50 ${
                    isMarked
                      ? 'border-amber-300 bg-amber-50 text-amber-600 shadow-xs hover:bg-amber-100'
                      : 'border-slate-200 bg-white text-slate-400 hover:border-amber-300 hover:bg-amber-50/50 hover:text-amber-500'
                  }`}
                >
                  <Bookmark
                    className={`h-5 w-5 ${isMarked ? 'fill-amber-400 text-amber-500' : ''}`}
                  />
                </button>
              )}
            </div>

            <div className={pdfPassage ? 'grid items-start gap-6 xl:grid-cols-12' : 'space-y-5'}>
              {pdfPassage && (
                <div className="xl:col-span-7 xl:max-h-[75vh] xl:overflow-y-auto xl:pr-1">
                  <PlacementPdfPassagePane passage={pdfPassage} fallbackText={pdfFallbackText} />
                </div>
              )}

              <div className={pdfPassage ? 'space-y-5 xl:col-span-5' : 'space-y-5'}>
                {!pdfPassage && g?.instructions && (
                  <p className="rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
                    {g.instructions}
                  </p>
                )}
                {!pdfPassage && g?.stimulusText && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-[15px] leading-relaxed whitespace-pre-line text-slate-800">
                    {g.stimulusText}
                  </div>
                )}
                {!prepReady && (
                  <p
                    role="status"
                    className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-medium text-indigo-800"
                  >
                    Đang trong cửa sổ chuẩn bị của server.
                  </p>
                )}

                {g?.stimuli.map((s) =>
                  s.type === 'AUDIO' && g.window && (!prepReady || responseReady) ? null : s.type ===
                    'TEXT' ? (
                    pdfPassage ? null : (
                      <div
                        key={s.id}
                        className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-[15px] leading-relaxed text-slate-800 sm:p-5"
                      >
                        <AssessmentTextStimulus content={s.textContent} />
                      </div>
                    )
                  ) : s.mediaUrl ? (
                    s.type === 'IMAGE' ? (
                      <div
                        key={s.id}
                        className="flex justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                      >
                        <img
                          src={apiUrl(s.mediaUrl.replace(/^\/api/, ''))}
                          alt="Tư liệu câu hỏi"
                          className="max-h-[420px] w-full max-w-2xl rounded-lg bg-white object-contain shadow-xs"
                        />
                      </div>
                    ) : (
                      <div
                        key={s.id}
                        className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-3.5"
                      >
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-800">
                          <Volume2 className="h-4 w-4" />
                          <span>File nghe câu hỏi</span>
                        </div>
                        <audio
                          controls
                          preload="metadata"
                          className="w-full"
                          src={apiUrl(s.mediaUrl.replace(/^\/api/, ''))}
                        />
                      </div>
                    )
                  ) : null,
                )}

                <p className="text-base font-semibold leading-relaxed text-slate-900 sm:text-[17px]">
                  {q?.content ?? 'Không có câu trong phần này của fixture DEV nhỏ.'}
                </p>

                {q?.responseType === 'SINGLE_CHOICE' && (
                  <fieldset
                    className="space-y-2.5"
                    disabled={!responseReady || loading || req.busy || !!req.pending.current}
                  >
                    <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Chọn một đáp án
                    </legend>
                    {q.options.map((o, idx) => {
                      const letter = ['A', 'B', 'C', 'D', 'E'][idx] ?? String(idx + 1);
                      const selected = (choices[q.testQuestionId] ?? q.selectedOptionIds).includes(
                        o.id,
                      );
                      const stripped = o.content
                        .trim()
                        .replace(new RegExp(`^(?:\\(${letter}\\)|${letter}[.):])\\s*`, 'i'), '');
                      const displayText =
                        !stripped ||
                        stripped.toUpperCase() === letter ||
                        stripped.toUpperCase() === `(${letter})`
                          ? `Đáp án ${letter}`
                          : stripped;
                      return (
                        <label
                          key={o.id}
                          className={`group flex cursor-pointer items-center gap-3.5 rounded-xl border px-4 py-3.5 transition ${
                            selected
                              ? 'border-emerald-600 bg-emerald-50/80 ring-1 ring-emerald-600 shadow-xs'
                              : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/40'
                          }`}
                        >
                          <input
                            type="radio"
                            className="sr-only"
                            name={q.testQuestionId}
                            checked={selected}
                            onChange={() => {
                              const qid = q.testQuestionId;
                              setChoices((v) => ({ ...v, [qid]: [o.id] }));
                              void write('/attempts/' + id + '/answers', {
                                questionId: qid,
                                selectedOptionIds: [o.id],
                              });
                            }}
                          />
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition ${
                              selected
                                ? 'bg-emerald-700 text-white'
                                : 'border border-slate-300 bg-slate-100 text-slate-700 group-hover:border-emerald-400 group-hover:bg-emerald-50'
                            }`}
                          >
                            {letter}
                          </span>
                          <span className="flex-1 text-[15px] leading-snug text-slate-800">
                            {displayText}
                          </span>
                          {selected && (
                            <span className="shrink-0 text-xs font-semibold text-emerald-700">
                              {choices[q.testQuestionId]
                                ? req.busy || loading
                                  ? 'Đang lưu…'
                                  : 'Chưa lưu'
                                : 'Đã lưu'}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </fieldset>
                )}

                {q?.responseType === 'TEXT_RESPONSE' && (
                  <textarea
                    aria-label="Bài viết"
                    className={field}
                    rows={8}
                    disabled={!responseReady || loading || req.busy || !!req.pending.current}
                    value={text[q.testQuestionId] ?? q.textResponse ?? ''}
                    onChange={(e) => setText((v) => ({ ...v, [q.testQuestionId]: e.target.value }))}
                  />
                )}

                {q?.responseType === 'AUDIO_RESPONSE' &&
                  (g?.taskCode === 'SE_SW_01_S10_V01' ? (
                    <DoublePromptAnswer
                      key={q.testQuestionId}
                      attemptId={id}
                      questionId={q.testQuestionId}
                      source=""
                      active={prepReady}
                      initialAudioUrl={null}
                      onSaved={() => void load()}
                      onSaveState={() => {}}
                      onUploading={(_id, b) => setRecording(b)}
                    />
                  ) : (
                    <TaskRecorder
                      key={q.testQuestionId}
                      attemptId={id}
                      questionId={q.testQuestionId}
                      lockVersion={exam.lockVersion}
                      readyAt={
                        Date.parse(exam.phaseStartedAt) +
                        ((g?.window?.preparationSeconds ?? 0) + (g?.window?.playbackSeconds ?? 0)) *
                          1000
                      }
                      initialState={q.recordingState ?? (q.audioUploaded ? 'SAVED' : null)}
                      serverTime={Date.parse(exam.serverTime)}
                      onSaved={() => void load()}
                      onBusy={setRecording}
                    />
                  ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  disabled={activeIdx <= 0 || loading || recording || req.busy || !!req.pending.current}
                  onClick={() => setCurrent((i) => Math.max(0, i - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Câu trước
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  disabled={
                    activeIdx >= qs.length - 1 ||
                    loading ||
                    recording ||
                    req.busy ||
                    !!req.pending.current
                  }
                  onClick={() => setCurrent((i) => Math.min(qs.length - 1, i + 1))}
                >
                  Câu sau
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              {q &&
                (q.responseType === 'TEXT_RESPONSE' ||
                  (q.responseType === 'SINGLE_CHOICE' &&
                    choices[q.testQuestionId] !== undefined &&
                    !req.busy &&
                    !loading)) && (
                  <button
                    className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-emerald-800 disabled:opacity-50"
                    disabled={!responseReady || loading || req.busy || !!req.pending.current}
                    onClick={() =>
                      void write('/attempts/' + id + '/answers', {
                        questionId: q.testQuestionId,
                        ...(q.responseType === 'TEXT_RESPONSE'
                          ? { textResponse: text[q.testQuestionId] ?? q.textResponse ?? '' }
                          : { selectedOptionIds: choices[q.testQuestionId] ?? q.selectedOptionIds }),
                      })
                    }
                  >
                    Lưu câu trả lời
                  </button>
                )}
              {q?.responseType === 'SINGLE_CHOICE' &&
                (choices[q.testQuestionId] === undefined || req.busy || loading) && (
                  <span className="text-xs font-medium text-slate-500">
                    {req.busy || loading
                      ? 'Đang tự động lưu đáp án…'
                      : currentSaved
                        ? 'Đáp án đã tự động lưu'
                        : 'Chọn A/B/C/D để tự động lưu'}
                  </span>
                )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <div className="flex flex-wrap gap-2.5">
                <button
                  className="rounded-xl border border-slate-300 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  disabled={
                    loading ||
                    req.busy ||
                    recording ||
                    !!req.pending.current ||
                    (exam.phase === 'SPEAKING' && !q?.audioUploaded)
                  }
                  onClick={() => {
                    if (Object.keys(text).length || Object.keys(choices).length) {
                      setError('Lưu câu đang sửa trước khi chuyển phần.');
                      return;
                    }
                    setConfirmNextOpen(true);
                  }}
                >
                  Kết thúc phần / bài hiện tại
                </button>
                {exam.phase === 'READING' && exam.mode === 'FOUR_SKILLS' && (
                  <button
                    className={button}
                    disabled={
                      req.busy ||
                      recording ||
                      !!req.pending.current ||
                      !!Object.keys(text).length ||
                      !!Object.keys(choices).length
                    }
                    onClick={() => void write('/attempts/' + id + '/commands', { action: 'BREAK' })}
                  >
                    Nghỉ tối đa 10 phút
                  </button>
                )}
              </div>
              <button
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                disabled={loading || req.busy}
                onClick={() =>
                  void write('/attempts/' + id + '/commands', {
                    action: 'INCIDENT',
                    reason: 'Learner reports microphone/playback or unsafe recovery incident',
                  })
                }
              >
                Báo sự cố — giữ bài để học vụ kiểm tra
              </button>
            </div>
          </section>

          <aside className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs lg:sticky lg:top-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900">Điều hướng phần đang mở</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 tabular-nums">
                {answeredCount}/{qs.length}
              </span>
            </div>
            <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Đã lưu
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm border-2 border-slate-900 bg-white" /> Đang xem
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="text-amber-500">★</span> Đánh dấu
              </span>
            </div>
            <div className="grid max-h-[440px] grid-cols-5 gap-1.5 overflow-y-auto pr-1">
              {qs.map(({ q: itemQ }, i) => {
                const isActive = i === activeIdx;
                const isDone =
                  itemQ.selectedOptionIds.length > 0 ||
                  !!itemQ.textResponse?.trim() ||
                  itemQ.audioUploaded;
                const markedHere = exam.marked.includes(itemQ.testQuestionId);
                return (
                  <button
                    key={itemQ.testQuestionId}
                    disabled={loading || recording || req.busy || !!req.pending.current}
                    onClick={() => setCurrent(i)}
                    className={`relative flex h-9 items-center justify-center rounded-lg border text-xs font-semibold tabular-nums transition disabled:opacity-50 ${
                      isActive
                        ? 'border-slate-900 bg-slate-900 text-white shadow-xs'
                        : isDone
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {i + 1}
                    {markedHere && (
                      <span
                        className={`ml-0.5 text-[10px] ${
                          isActive ? 'text-amber-300' : 'text-amber-500'
                        }`}
                      >
                        ★
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      )}
      {confirmNextOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">
              {(exam.phase === 'READING' && exam.mode === 'LR') ||
              (exam.phase === 'WRITING' && exam.taskIndex === 7)
                ? 'Nộp bài và kết thúc kiểm tra?'
                : 'Kết thúc phần hiện tại?'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {(exam.phase === 'READING' && exam.mode === 'LR') ||
              (exam.phase === 'WRITING' && exam.taskIndex === 7)
                ? 'Các câu chưa trả lời sẽ không được tính đúng.'
                : 'Bạn sẽ chuyển sang phần tiếp theo và không thể quay lại sửa phần này.'}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmNextOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Ở lại làm tiếp
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmNextOpen(false);
                  void write('/attempts/' + id + '/commands', { action: 'NEXT' });
                  setCurrent(0);
                }}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
              >
                Xác nhận tiếp tục
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
export function PlacementWorkflowResultPage() {
  const { user } = useAuth(),
    { attemptId } = useParams();
  return <Result key={user?.id + ':' + attemptId} id={attemptId!} />;
}
function skillNameVi(skill: string) {
  if (skill === 'LISTENING') return 'Nghe hiểu (Listening)';
  if (skill === 'READING') return 'Đọc hiểu (Reading)';
  if (skill === 'SPEAKING') return 'Nói (Speaking)';
  if (skill === 'WRITING') return 'Viết (Writing)';
  return skill;
}

function rubricCriterionLabelVi(code: string): string {
  const labels: Record<string, string> = {
    TASK_FULFILLMENT: 'Hoàn thành yêu cầu đề bài',
    LANGUAGE_DELIVERY: 'Ngôn ngữ & Diễn đạt',
    PRONUNCIATION_INTONATION: 'Phát âm & Ngữ điệu',
    GRAMMAR_VOCABULARY: 'Ngữ pháp & Từ vựng',
    COHERENCE_ORGANIZATION: 'Bố cục & Mạch lạc',
  };
  return labels[code] ?? code;
}

function QuickConclusionPanel({
  diagnosis,
  aiAdvisory,
  aiLiveActive,
}: {
  diagnosis?: WorkflowDiagnostic['diagnosis'];
  aiAdvisory?: WorkflowDiagnostic['aiAdvisory'];
  aiLiveActive: boolean;
}) {
  if (!diagnosis) {
    return (
      <p className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 text-sm leading-6 text-slate-800">
        {aiAdvisory?.diagnosisAdvisory}
      </p>
    );
  }
  const ov = diagnosis.overallSummary;
  const weakParts = diagnosis.partBreakdown.filter(
    (p) => p.answered > 0 && (p.answeredAccuracyPct ?? p.accuracyPct ?? 0) < 70,
  );
  const topStrength = diagnosis.strengths[0];
  const topFix = diagnosis.improvements[0];

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <article className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-1.5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
          {aiLiveActive ? 'Tổng quan (Gemini AI)' : 'Tổng quan bài làm'}
        </p>
        <p className="text-sm font-bold text-slate-950">
          {ov.lrCorrectCount != null
            ? `Đúng ${ov.lrCorrectCount}/${ov.lrTotalItems} câu (${ov.lrAccuracyPct}%)`
            : 'Đang chờ công bố điểm'}
        </p>
        <p className="text-xs leading-5 text-slate-700">
          {topStrength
            ? `Làm tốt nhất: ${topStrength.titleVi} (${topStrength.evidenceBadge}).`
            : `Đã làm ${ov.lrAnsweredCount}/${ov.lrTotalItems} câu.`}
        </p>
      </article>

      <article className="rounded-xl border border-rose-100 bg-rose-50/50 p-4 space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
          Các phần sai nhiều cần ưu tiên
        </p>
        {weakParts.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {weakParts.slice(0, 4).map((p) => {
              const pWrong = p.wrong ?? Math.max(0, p.answered - p.correct);
              const acc = p.answeredAccuracyPct ?? p.accuracyPct ?? 0;
              return (
                <span
                  key={p.part}
                  className="inline-flex items-center rounded-md border border-rose-200 bg-white px-2 py-0.5 text-xs font-semibold text-rose-900"
                >
                  {p.part}: Sai {pWrong}/{p.answered} ({100 - acc}%)
                </span>
              );
            })}
          </div>
        ) : (
          <p className="text-xs leading-5 text-emerald-800 font-medium">
            Các phần đã làm đều đạt từ 70% trở lên.
          </p>
        )}
      </article>

      <article className="rounded-xl border border-amber-100 bg-amber-50/50 p-4 space-y-1.5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
          Trọng tâm nên sửa trước tiên
        </p>
        {topFix ? (
          <>
            <p className="text-sm font-bold text-slate-950">{topFix.titleVi}</p>
            <p className="text-xs leading-5 text-slate-700">{topFix.actionableStep}</p>
          </>
        ) : (
          <p className="text-xs leading-5 text-slate-700">
            Tiếp tục hoàn thành đều các phần để xác định thêm điểm cần cải thiện.
          </p>
        )}
      </article>
    </div>
  );
}

function Result({ id }: { id: string }) {
  const { setStatus: setHeaderStatus } = usePlacementHeaderStatus();
  const [d, setD] = useState<WorkflowDiagnostic>(),
    [error, setError] = useState('');
  const [advisoryBusy, setAdvisoryBusy] = useState(false);
  const [advisoryNotice, setAdvisoryNotice] = useState('');
  const autoAdvisoryFiredRef = useRef<string | null>(null);
  const requestAdvisory = useCallback(
    async (isAuto = false) => {
      if (advisoryBusy) return;
      setAdvisoryBusy(true);
      if (!isAuto) setAdvisoryNotice('');
      try {
        const value = await workflow.post<WorkflowDiagnostic>('/attempts/' + id + '/advisory', {});
        setD(value);
        setAdvisoryNotice(
          value.aiAdvisory?.fallbackUsed
            ? 'Gemini chưa khả dụng hoặc đã chạm hạn mức. Kết quả và gợi ý theo quy tắc vẫn được giữ nguyên.'
            : 'Đã cập nhật nhận xét chuyên sâu từ Gemini AI.',
        );
      } catch {
        if (!isAuto) {
          setAdvisoryNotice(
            'Chưa nhận được gợi ý AI. Kết quả hiện tại vẫn được giữ nguyên; hệ thống không tự gửi lại.',
          );
        }
      } finally {
        setAdvisoryBusy(false);
      }
    },
    [advisoryBusy, id],
  );
  useEffect(() => {
    const c = new AbortController();
    void workflow
      .get<WorkflowDiagnostic>('/attempts/' + id + '/diagnostic', c.signal)
      .then((value) => {
        if (!c.signal.aborted) {
          setD(value);
          setHeaderStatus(value.state === 'PUBLISHED' ? 'PUBLISHED' : 'SUBMITTED_PENDING_REVIEW');
          setError('');
          if (value.aiProviderReady && autoAdvisoryFiredRef.current !== id) {
            autoAdvisoryFiredRef.current = id;
            void workflow
              .post<WorkflowDiagnostic>('/attempts/' + id + '/advisory', {})
              .then((advised) => {
                if (!c.signal.aborted) {
                  setD(advised);
                  setAdvisoryNotice(
                    advised.aiAdvisory?.fallbackUsed
                      ? ''
                      : 'Nhận xét AI (Gemini) đã tự động tổng hợp từ kết quả làm bài.',
                  );
                }
              })
              .catch(() => {
                /* Keep deterministic diagnosis safely without disrupting display */
              });
          }
        }
      })
      .catch(() => {
        if (!c.signal.aborted) {
          setHeaderStatus(null);
          setError('Không có quyền hoặc kết quả chưa sẵn sàng.');
        }
      });
    return () => c.abort();
  }, [id, setHeaderStatus]);

  const ov = d?.diagnosis?.overallSummary;
  const totalAnswered = ov?.lrAnsweredCount ?? 0;
  const totalItems = ov?.lrTotalItems ?? 0;
  const totalCorrect = ov?.lrCorrectCount ?? 0;
  const totalWrong = ov && ov.lrCorrectCount != null ? Math.max(0, totalAnswered - totalCorrect) : 0;
  const totalSkipped = ov ? Math.max(0, totalItems - totalAnswered) : 0;
  const aiLiveActive = !!d?.aiAdvisory && !d.aiAdvisory.fallbackUsed;

  return (
    <main className="section-shell space-y-6 py-8">
      <header className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-6 text-white shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-indigo-400/30 bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-100">
              Báo cáo Kết quả Đầu vào & Lộ trình Học
            </span>
            {d ? (
              <span
                data-testid="result-attempt-status-badge"
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  d.state === 'PUBLISHED'
                    ? 'border-emerald-400/30 bg-emerald-500/20 text-emerald-200'
                    : 'border-amber-400/30 bg-amber-500/20 text-amber-200'
                }`}
              >
                {d.state === 'PUBLISHED' ? 'Kết quả đã công bố' : 'Đã nộp — đang chờ chấm'}
              </span>
            ) : null}
          </div>
          {d ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <span
                data-testid="result-attempt-ref"
                className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 font-mono font-semibold text-white"
              >
                Mã lượt làm bài: #{(d.attemptRef ?? (d.attemptId ?? id).slice(0, 8)).toUpperCase()}
              </span>
              {d.diagnosis?.sourceDigestRef ? (
                <span
                  data-testid="result-source-digest-ref"
                  className="rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 font-mono text-slate-300"
                >
                  Mã phiên bản đề: #{d.diagnosis.sourceDigestRef}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <h1 className="mt-3 text-2xl font-bold sm:text-3xl">Kết quả đánh giá năng lực đầu vào</h1>
        {d && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <h2 className="font-semibold text-emerald-300">{d.label}</h2>
            <p className="text-indigo-200">
              Mục tiêu: LR {d.goals.goalLR}
              {d.goals.goalSpeaking != null ? ` · Nói ${d.goals.goalSpeaking}` : ''}
              {d.goals.goalWriting != null ? ` · Viết ${d.goals.goalWriting}` : ''}
            </p>
          </div>
        )}
      </header>

      {error && (
        <div
          className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900"
          role="alert"
        >
          {error}
        </div>
      )}

      {d && (
        <>
          {/* 1. Tổng quan điểm số & Tiến độ làm bài */}
          <section aria-label="Tổng quan kỹ năng" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-slate-900">1. Tổng quan kết quả bài làm</h3>
              {ov && ov.lrCorrectCount != null ? (
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-900">
                    Đúng: {totalCorrect}/{totalItems} ({ov.lrAccuracyPct}%)
                  </span>
                  <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-900">
                    Làm sai: {totalWrong} câu
                  </span>
                  {totalSkipped > 0 ? (
                    <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-slate-700">
                      Bỏ trống: {totalSkipped} câu
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {d.skillResults.map((s) => {
                const pct =
                  s.status === 'PUBLISHED' &&
                  s.value != null &&
                  s.samples != null &&
                  s.samples > 0 &&
                  s.scale === 'INTERNAL_RAW_COUNT'
                    ? Math.round((s.value / s.samples) * 100)
                    : null;
                return (
                  <article
                    className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs"
                    key={s.skill}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                          {s.skill}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            s.status === 'PUBLISHED'
                              ? 'bg-emerald-50 text-emerald-800'
                              : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          {s.status === 'PUBLISHED' ? 'Đã công bố' : 'Chờ chấm'}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {skillNameVi(s.skill)}
                      </p>
                      <div className="mt-3 flex items-baseline gap-2">
                        <strong className="text-3xl font-extrabold text-slate-900">
                          {s.status === 'PUBLISHED' ? s.value : 'ĐANG CHẤM'}
                        </strong>
                        {s.status === 'PUBLISHED' &&
                        s.samples != null &&
                        s.scale === 'INTERNAL_RAW_COUNT' ? (
                          <span className="text-sm font-semibold text-slate-500">
                            / {s.samples} câu ({pct}%)
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-4">
                      {pct !== null ? (
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${
                              pct >= 70
                                ? 'bg-emerald-600'
                                : pct >= 50
                                  ? 'bg-indigo-600'
                                  : 'bg-amber-500'
                            }`}
                            style={{ width: `${Math.min(Math.max(pct, 4), 100)}%` }}
                          />
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>

            {ov?.balanceLabelVi ? (
              <p className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-sm font-medium text-indigo-950">
                {ov.balanceLabelVi}
              </p>
            ) : null}
          </section>

          {/* 2. Nhận xét bài kiểm tra đầu vào & Phân tích sai ở đâu / sai thế nào */}
          {d.aiAdvisory ? (
            <section
              aria-label="Tổng hợp giải thích và tư vấn"
              className="space-y-5 rounded-2xl border border-indigo-200 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                    Ứng dụng AI (1/2) · Chấm &amp; Nhận xét bài kiểm tra đầu vào{' '}
                    {aiLiveActive ? '· Gemini AI' : ''}
                  </p>
                  <h3 className="mt-0.5 text-lg font-bold text-slate-900">
                    2. Đánh giá chi tiết: Bạn đang làm tốt phần nào, sai ở đâu và sai như thế nào?
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      aiLiveActive
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                        : 'border-indigo-200 bg-indigo-50 text-indigo-900'
                    }`}
                  >
                    {d.aiAdvisory.modeBadge}
                  </span>
                  <button
                    type="button"
                    disabled={advisoryBusy}
                    onClick={() => void requestAdvisory(false)}
                    className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-900 hover:bg-indigo-100 disabled:opacity-50"
                  >
                    {advisoryBusy ? 'Đang phân tích Gemini…' : 'Phân tích lại bằng Gemini AI'}
                  </button>
                </div>
              </div>

              {advisoryNotice ? (
                <p role="status" className="text-xs font-medium text-indigo-800">
                  {advisoryNotice}
                </p>
              ) : null}

              <QuickConclusionPanel
                diagnosis={d.diagnosis}
                aiAdvisory={d.aiAdvisory}
                aiLiveActive={aiLiveActive}
              />

              {/* 2A. Điểm mạnh vs Lỗi sai cần sửa — trọng tâm dễ đọc nhất */}
              {d.diagnosis &&
              (d.diagnosis.strengths.length > 0 || d.diagnosis.improvements.length > 0) ? (
                <div className="grid gap-4 lg:grid-cols-2 pt-1">
                  <div className="space-y-2.5 rounded-xl border border-emerald-200 bg-emerald-50/30 p-4">
                    <h4 className="text-sm font-bold text-emerald-950">
                      Phần làm tốt (Nên duy trì)
                    </h4>
                    {d.diagnosis.strengths.length > 0 ? (
                      d.diagnosis.strengths.map((st) => (
                        <article
                          key={st.domainCode}
                          className="rounded-lg border border-emerald-200 bg-white p-3 space-y-1 text-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-emerald-800">{st.partScope}</span>
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-900">
                              {st.evidenceBadge}
                            </span>
                          </div>
                          <h5 className="text-sm font-bold text-slate-900">{st.titleVi}</h5>
                          <p className="leading-5 text-slate-700">{st.pedagogicalSummary}</p>
                        </article>
                      ))
                    ) : (
                      <p className="text-xs text-slate-600">
                        Chưa có mảng kiến thức nào đạt mức tốt ổn định — hãy xem lại các phần cần cải thiện bên cạnh.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2.5 rounded-xl border border-amber-200 bg-amber-50/30 p-4">
                    <h4 className="text-sm font-bold text-amber-950">
                      Chỗ đang sai &amp; Cách khắc phục ngay
                    </h4>
                    {d.diagnosis.improvements.length > 0 ? (
                      d.diagnosis.improvements.map((imp) => (
                        <article
                          key={imp.domainCode}
                          className="rounded-lg border border-amber-200 bg-white p-3 space-y-1.5 text-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-amber-900">{imp.partScope}</span>
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-900">
                              {imp.evidenceBadge}
                            </span>
                          </div>
                          <h5 className="text-sm font-bold text-slate-900">{imp.titleVi}</h5>
                          <p className="leading-5 text-slate-700">{imp.pedagogicalSummary}</p>
                          <p className="rounded-md bg-indigo-50/70 px-2.5 py-1.5 font-semibold text-indigo-950">
                            Cách sửa: {imp.actionableStep}
                          </p>
                        </article>
                      ))
                    ) : (
                      <p className="text-xs text-slate-600">
                        Chưa thấy lỗi sai tập trung ở mảng kiến thức nào; bạn có thể làm thêm các phần còn bỏ trống để đánh giá đầy đủ hơn.
                      </p>
                    )}
                  </div>
                </div>
              ) : null}

              {/* 2B. Phân tích lỗi từng Part (gọn, rõ Đúng / Sai / Bỏ trống) */}
              {d.diagnosis && d.diagnosis.partBreakdown.length > 0 ? (
                <div className="space-y-3 pt-1">
                  <h4 className="text-sm font-bold text-slate-900">
                    Kết quả từng phần thi (Part 1 – Part 7)
                  </h4>
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {d.diagnosis.partBreakdown.map((p) => {
                      const pWrong = p.wrong ?? Math.max(0, p.answered - p.correct);
                      const pSkip = p.unanswered ?? Math.max(0, p.samples - p.answered);
                      const notStarted = p.answered === 0;
                      const acc = p.answeredAccuracyPct ?? p.accuracyPct ?? 0;
                      const pillCls = notStarted
                        ? 'bg-slate-100 text-slate-600'
                        : acc >= 70
                          ? 'bg-emerald-50 text-emerald-800'
                          : acc >= 50
                            ? 'bg-amber-50 text-amber-800'
                            : 'bg-rose-50 text-rose-800';
                      const barCls = notStarted
                        ? 'bg-slate-300'
                        : acc >= 70
                          ? 'bg-emerald-500'
                          : acc >= 50
                            ? 'bg-amber-500'
                            : 'bg-rose-500';
                      return (
                        <article
                          key={p.part}
                          className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/40 p-3.5 text-xs space-y-2.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-bold text-indigo-700">
                                {p.skill === 'LISTENING' ? 'Nghe' : 'Đọc'} · {p.part}
                              </span>
                              <h5 className="text-sm font-bold text-slate-900">{p.titleVi}</h5>
                            </div>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 font-semibold ${pillCls}`}>
                              {notStarted ? 'Chưa làm' : `${acc}%`}
                            </span>
                          </div>
                          {!notStarted ? (
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                              <div
                                className={`h-full rounded-full ${barCls}`}
                                style={{ width: `${Math.min(Math.max(acc, 3), 100)}%` }}
                              />
                            </div>
                          ) : null}
                          <div className="flex flex-wrap items-center gap-3 text-slate-700 font-medium">
                            <span className="text-emerald-700">Đúng: {p.correct}/{p.answered}</span>
                            <span className="text-rose-700">Sai: {pWrong}</span>
                            {pSkip > 0 ? <span className="text-slate-500">Chưa làm: {pSkip}</span> : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ) : (
                d.parts.map((p) => (
                  <p key={p.part} className="text-sm text-slate-700">
                    {p.part}: {p.correct}/{p.samples} câu đúng
                  </p>
                ))
              )}

              {/* Speaking / Writing nếu là bài 4 kỹ năng */}
              {d.diagnosis && d.diagnosis.productiveSkills.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 pt-1">
                  {d.diagnosis.productiveSkills.map((ps) => {
                    const isPublished = ps.status === 'PUBLISHED';
                    const taskGroups = ps.criteriaBreakdown.reduce<
                      Array<{
                        taskGroupId: string;
                        taskTitle: string;
                        items: typeof ps.criteriaBreakdown;
                      }>
                    >((acc, item) => {
                      const existing = acc.find((g) => g.taskGroupId === item.taskGroupId);
                      if (existing) {
                        existing.items.push(item);
                      } else {
                        acc.push({
                          taskGroupId: item.taskGroupId,
                          taskTitle: item.taskTitle,
                          items: [item],
                        });
                      }
                      return acc;
                    }, []);
                    return (
                      <article
                        key={ps.skill}
                        className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h5 className="text-sm font-bold text-slate-900">{skillNameVi(ps.skill)}</h5>
                          <span
                            className={`rounded-full px-2.5 py-0.5 font-semibold ${
                              isPublished
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {ps.statusLabel}
                          </span>
                        </div>
                        {ps.pendingNotice ? (
                          <p className="text-amber-950">{ps.pendingNotice}</p>
                        ) : (
                          <>
                            <div className="rounded-lg border border-emerald-200/80 bg-white px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                              <span className="font-bold text-emerald-900">
                                Tổng điểm Rubric: {ps.totalScore} điểm ({ps.taskCount} nhiệm vụ)
                              </span>
                              <span className="text-[11px] text-slate-500">
                                Thang chấm Rubric nội bộ (Nói / Viết)
                              </span>
                            </div>
                            {taskGroups.length > 0 ? (
                              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                                {taskGroups.map((tg, idx) => (
                                  <div
                                    key={tg.taskGroupId}
                                    className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-1.5"
                                  >
                                    <p className="font-semibold text-slate-900">
                                      Nhiệm vụ {idx + 1}: {tg.taskTitle}
                                    </p>
                                    {tg.items.map((c) => (
                                      <div
                                        key={`${tg.taskGroupId}-${c.code}`}
                                        className="rounded bg-slate-50 px-2 py-1.5 space-y-0.5"
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="font-semibold text-slate-700">
                                            {rubricCriterionLabelVi(c.code)}
                                          </span>
                                          <span className="font-bold text-[#2f5d1e]">
                                            {c.score} điểm
                                          </span>
                                        </div>
                                        {c.feedbackText ? (
                                          <p className="text-slate-600 leading-4">
                                            Nhận xét GV: {c.feedbackText}
                                          </p>
                                        ) : null}
                                      </div>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </>
                        )}
                      </article>
                    );
                  })}
                </div>
              ) : null}

              <details className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 text-xs">
                <summary className="cursor-pointer font-semibold text-slate-800">
                  Xem chi tiết từng chủ đề ngữ pháp / kỹ năng (13 mảng) &amp; toàn văn nhận xét AI
                </summary>
                <div className="mt-3 space-y-4">
                  <div className="rounded-lg border border-indigo-100 bg-white p-3 space-y-1">
                    <p className="font-bold text-indigo-900">Giải trình tổng hợp từ Gemini AI:</p>
                    <p className="leading-5 text-slate-700">{d.aiAdvisory.diagnosisAdvisory}</p>
                  </div>
                  {d.diagnosis && d.diagnosis.knowledgeBreakdown.length > 0 ? (
                    <div className="grid gap-2.5 md:grid-cols-2">
                      {d.diagnosis.knowledgeBreakdown.map((k) => {
                        const kWrong = k.wrong ?? Math.max(0, k.answered - k.correct);
                        return (
                          <div
                            key={k.domainCode}
                            className="rounded-lg border border-slate-200 bg-white p-3 space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-indigo-800">
                                {k.skill} · {k.partScope}
                              </span>
                              <span className="text-slate-600 font-medium">{k.statusLabel}</span>
                            </div>
                            <p className="font-semibold text-slate-900">{k.titleVi}</p>
                            <p className="text-slate-700">
                              Đã làm {k.answered}/{k.samples} câu · Đúng {k.correct} · Sai {kWrong}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </details>
            </section>
          ) : null}

          {/* 3. Đề xuất Khóa học & Lớp học phù hợp ngay dưới phần nhận xét */}
          <PlacementClassMatches
            matching={d.matching}
            recommendation={d.recommendation}
            aiClassFitAdvisory={d.aiAdvisory?.classFitAdvisory}
            diagnosis={d.diagnosis}
            goals={d.goals}
            aiLiveActive={aiLiveActive}
          />

          {/* 4. Tài liệu tự ôn tập gợi ý */}
          {d.selfStudyGuidance && d.selfStudyGuidance.length > 0 ? (
            <section
              aria-label="Định hướng tự học và tài liệu xác thực"
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4"
            >
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                  Lộ trình tự luyện trọng tâm
                </p>
                <h3 className="mt-0.5 text-lg font-bold text-slate-900">
                  4. Tài liệu ôn tập được gợi ý cho bạn
                </h3>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {d.selfStudyGuidance.map((item) => (
                  <article
                    key={item.domainCode}
                    className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-2 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-indigo-800">
                        {item.skill} · {item.partScope}
                      </span>
                      <span className="font-semibold text-slate-600">{item.observedEvidence}</span>
                    </div>
                    <h4 className="font-bold text-slate-900">{item.topicTitleVi}</h4>
                    <p className="text-xs leading-5 text-slate-700">{item.focusSummaryVi}</p>
                    <div className="border-t border-slate-200/80 pt-2 text-xs">
                      {item.resourceStatus === 'VETTED_AVAILABLE' ? (
                        <div className="space-y-1">
                          {item.vettedResources.map((res) => (
                            <p key={res.slug}>
                              <Link
                                className="font-semibold text-indigo-700 underline hover:text-indigo-900"
                                to={res.path}
                              >
                                📖 {res.title}
                              </Link>{' '}
                              <span className="text-slate-500">({res.verifiedSource})</span>
                            </p>
                          ))}
                        </div>
                      ) : (
                        <p className="font-medium text-amber-900">{item.resourceStatusLabel}</p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
export function PlacementWorkflowReviewPage() {
  const { user } = useAuth(),
    { attemptId } = useParams();
  return <Review key={user?.id + ':' + attemptId} id={attemptId!} />;
}
function formatReviewDateTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function EvaluationSummaryView({ body, skill }: { body: Record<string, unknown>; skill: string }) {
  const rawParts = Array.isArray(body.parts)
    ? (body.parts as Array<{ skill?: string; part?: string | null; samples?: number; correct?: number }>)
    : null;
  if (skill === 'LR' && rawParts) {
    const groupedMap = new Map<
      string,
      { skill: string; part: string; correct: number; samples: number }
    >();
    const totals = rawParts.reduce(
      (acc, p, idx) => {
        const samples = Number(p.samples ?? 0);
        const correct = Number(p.correct ?? 0);
        const skillKey = p.skill ?? 'L&R';
        const partKey = p.part ?? `Phần ${idx + 1}`;
        const bucketKey = `${skillKey}:${partKey}`;
        const cur = groupedMap.get(bucketKey) ?? {
          skill: skillKey,
          part: partKey,
          correct: 0,
          samples: 0,
        };
        cur.correct += correct;
        cur.samples += samples;
        groupedMap.set(bucketKey, cur);

        acc.samples += samples;
        acc.correct += correct;
        if (p.skill === 'LISTENING') {
          acc.lCorrect += correct;
          acc.lSamples += samples;
        } else if (p.skill === 'READING') {
          acc.rCorrect += correct;
          acc.rSamples += samples;
        }
        return acc;
      },
      { correct: 0, samples: 0, lCorrect: 0, lSamples: 0, rCorrect: 0, rSamples: 0 },
    );
    const aggregatedParts = [...groupedMap.values()];
    return (
      <div className="space-y-3">
        <div className="grid gap-2.5 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] font-semibold text-slate-500">Listening đúng</p>
            <p className="text-base font-bold text-slate-900">
              {totals.lCorrect}/{totals.lSamples} câu
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] font-semibold text-slate-500">Reading đúng</p>
            <p className="text-base font-bold text-slate-900">
              {totals.rCorrect}/{totals.rSamples} câu
            </p>
          </div>
          <div className="rounded-lg border border-[#76a35e]/40 bg-[#f4f9f1] px-3 py-2">
            <p className="text-[11px] font-semibold text-[#2f5d1e]">Tổng Listening &amp; Reading</p>
            <p className="text-base font-bold text-[#2f5d1e]">
              {totals.correct}/{totals.samples} câu (
              {totals.samples > 0 ? Math.round((totals.correct / totals.samples) * 100) : 0}%)
            </p>
          </div>
        </div>
        {aggregatedParts.length > 0 && (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Kỹ năng</th>
                  <th>Phần thi</th>
                  <th>Số câu đúng</th>
                  <th>Tỷ lệ đạt</th>
                </tr>
              </thead>
              <tbody>
                {aggregatedParts.map((p) => {
                  const pct = p.samples > 0 ? Math.round((p.correct / p.samples) * 100) : 0;
                  return (
                    <tr key={`${p.skill}-${p.part}`}>
                      <td className="font-semibold text-slate-800">
                        {p.skill === 'LISTENING' ? 'Listening' : p.skill === 'READING' ? 'Reading' : p.skill}
                      </td>
                      <td className="text-xs text-slate-700">{p.part}</td>
                      <td className="text-xs font-semibold text-slate-900">
                        {p.correct} / {p.samples} câu
                      </td>
                      <td className="text-xs text-slate-700">{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  const total = body.total !== undefined ? String(body.total) : null;
  const max = body.max !== undefined ? String(body.max) : null;
  const rawScale = body.scale !== undefined ? String(body.scale) : null;
  const scaleLabels: Record<string, string> = {
    INTERNAL_0_100_DRAFT_RUBRIC: 'Thang chấm Rubric nội bộ (Nói / Viết)',
    INTERNAL_RAW_COUNT: 'Số câu trả lời đúng',
  };
  const scale = rawScale ? (scaleLabels[rawScale] ?? rawScale) : null;
  const samples = body.samples !== undefined ? String(body.samples) : null;

  return (
    <div className="grid gap-2.5 sm:grid-cols-3">
      {total !== null && max !== null && (
        <div className="rounded-lg border border-[#76a35e]/40 bg-[#f4f9f1] px-3 py-2">
          <p className="text-[11px] font-semibold text-[#2f5d1e]">Điểm quy đổi / Tổng điểm</p>
          <p className="text-base font-bold text-[#2f5d1e]">
            {total} / {max}
          </p>
        </div>
      )}
      {scale && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-semibold text-slate-500">Thang chuẩn</p>
          <p className="text-base font-bold text-slate-900">{scale}</p>
        </div>
      )}
      {samples && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-semibold text-slate-500">Số phần đã chấm</p>
          <p className="text-base font-bold text-slate-900">{samples} bài</p>
        </div>
      )}
    </div>
  );
}

function Review({ id }: { id: string }) {
  const [d, setD] = useState<WorkflowReview>(),
    [c, setC] = useState<WorkflowConfig>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [grader, setGrader] = useState(''),
    [rubric, setRubric] = useState(''),
    [skill, setSkill] = useState('SPEAKING'),
    [why, setWhy] = useState(''),
    [publishReasons, setPublishReasons] = useState<Record<string, string>>({}),
    req = useRequest();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, rev] = await Promise.all([
        workflow.config(),
        workflow.get<WorkflowReview>('/attempts/' + id + '/review'),
      ]);
      setC(cfg);
      setD(rev);
      if (rev.currentAssignment?.graderId) {
        setGrader((cur) => cur || rev.currentAssignment!.graderId);
      }
      setError('');
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError(
          'Hồ sơ lượt thi này thuộc dữ liệu thử nghiệm cũ chưa được phát hành trong đợt kiểm tra nội bộ hiện hành.',
        );
      } else if (e instanceof ApiError && (e.status === 403 || e.status === 404)) {
        setError('Tài khoản hiện tại không có phân công hoặc quyền xem/chấm/công bố lượt thi này.');
      } else {
        setError('Không tải được hồ sơ kiểm tra đầu vào. Vui lòng thử tải lại.');
      }
      return false;
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const refCode = d?.attemptRef ?? id.slice(0, 8).toUpperCase();
  const modeLabel =
    d?.mode === 'FOUR_SKILLS'
      ? '4 kỹ năng (Nghe · Đọc · Nói · Viết)'
      : d?.mode === 'LR'
        ? 'Listening & Reading (Chấm tự động)'
        : d?.mode ?? '';

  return (
    <main className="workspace-page space-y-5">
      <div>
        <Link
          to="/workspace/placement"
          className="inline-flex items-center gap-1 text-sm font-semibold text-[#2f5d1e] hover:text-[#e66f2b] hover:underline"
        >
          <ChevronLeft size={16} aria-hidden="true" />
          Quay lại danh sách lượt thi
        </Link>
      </div>

      <header className="workspace-header flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge-info">
              {d?.internalAssessment ? 'Đánh giá đầu vào nội bộ Smart English' : 'Hồ sơ lượt thi đầu vào'}
            </span>
            <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-600">
              #{refCode}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-[#e66f2b] sm:text-3xl">
            {d?.learnerName ? `Hồ sơ thí sinh: ${accountLabel(d.learnerName)}` : 'Kiểm tra & chấm đầu vào'}
          </h1>
          {d && (
            <p className="text-sm text-slate-600">
              {d.sourceTitle ? `${d.sourceTitle} · ` : ''}
              {modeLabel} · Nộp bài: {formatReviewDateTime(d.submittedAt)}
            </p>
          )}
        </div>
      </header>

      {loading && !d && !error && (
        <p role="status" className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Đang tải hồ sơ lượt thi…
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </p>
      )}
      {(error || req.error) && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {error || req.error}
        </p>
      )}

      {req.pending.current && !req.busy && (
        <button
          type="button"
          className={button}
          onClick={() => {
            const pending = req.pending.current;
            if (pending)
              void req.send(pending.path, pending.body as Record<string, unknown>, async () => {
                if (!(await load())) throw new Error('Review state not confirmed');
              });
          }}
        >
          Thử lại đúng yêu cầu đã gửi
        </button>
      )}

      {d && d.mode === 'LR' && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-2">
          <h2 className="text-base font-bold text-slate-900">Quy trình chấm điểm Listening &amp; Reading</h2>
          <p className="text-xs text-slate-600">
            Bài thi Listening &amp; Reading được hệ thống chấm tự động ngay khi thí sinh nộp bài và không cần phân công giảng viên chấm Nói/Viết.
          </p>
        </section>
      )}

      {c?.permissions['placement.grader.assign'] && d?.mode === 'FOUR_SKILLS' && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-lg font-bold text-[#2f5d1e]">Phân công giảng viên chấm Nói &amp; Viết</h2>
              <p className="text-xs text-slate-600">
                Bài thi 4 kỹ năng gồm {d.swTaskCounts?.speaking ?? 0} câu Speaking và {d.swTaskCounts?.writing ?? 0} câu Writing cần giảng viên đủ điều kiện chấm điểm độc lập.
              </p>
            </div>
            {d.currentAssignment ? (
              <span className="badge-published">Đã phân công GV</span>
            ) : (
              <span className="badge-warning">Chưa phân công GV</span>
            )}
          </div>

          {d.currentAssignment && (
            <div className="rounded-lg border border-[#cde0c2] bg-[#f7faf5] p-3.5 text-xs space-y-1">
              <p className="font-bold text-[#2f5d1e]">
                Giảng viên đang phụ trách (Lần #{d.currentAssignment.number}):{' '}
                {accountLabel(d.currentAssignment.graderName)}
              </p>
              <p className="text-slate-600">
                Thời gian phân công: {formatReviewDateTime(d.currentAssignment.assignedAt)} · Lý do:{' '}
                {/wave\s*0\d|disposable|demo|synthetic/i.test(d.currentAssignment.reason)
                  ? 'Phân công giảng viên chấm Nói & Viết theo quy trình'
                  : d.currentAssignment.reason}
              </p>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-700">
              GV đủ điều kiện chấm Nói/Viết
              <select
                aria-label="GV đủ điều kiện"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900"
                disabled={req.busy || !!req.pending.current}
                value={grader}
                onChange={(e) => setGrader(e.target.value)}
              >
                <option value="">Chọn giảng viên phụ trách…</option>
                {c.graders?.map((g) => (
                  <option key={g.id} value={g.id}>
                    {accountLabel(g.fullName)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Lý do phân công / đổi giảng viên (tối thiểu 10 ký tự)
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900"
                placeholder="VD: Phân công giảng viên chấm kỹ năng Nói và Viết…"
                value={why}
                onChange={(e) => setWhy(e.target.value)}
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className="rounded-lg bg-[#76a35e] px-4 py-2 text-xs font-bold text-white hover:bg-[#5e8a47] disabled:opacity-50"
              disabled={!grader || why.trim().length < 10 || req.busy || !!req.pending.current}
              onClick={() => {
                setNotice('');
                void req
                  .send('/attempts/' + id + '/assignments', {
                    graderId: grader,
                    eligibilityConfirmed: true,
                    reason: why.trim(),
                  })
                  .then((r) => {
                    if (r) {
                      setNotice('Đã cập nhật phân công giảng viên chấm bài thành công.');
                      setWhy('');
                      void load();
                    }
                  });
              }}
            >
              Xác nhận đủ điều kiện và phân công
            </button>
          </div>
        </section>
      )}

      {d?.tasks.map((t) => (
        <article className="space-y-3 rounded-xl border border-slate-200 bg-white p-5" key={t.questionId}>
          <h2 className="text-base font-bold text-slate-900">{t.skill} · Bài làm gốc của thí sinh</h2>
          <p className="text-sm text-slate-700">{t.prompt}</p>
          {t.text !== null && (
            <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-800">{t.text}</pre>
          )}
          {t.recordingUrl && (
            <audio controls src={apiUrl(t.recordingUrl.replace(/^\/api/, ''))} preload="none" />
          )}
        </article>
      ))}

      {d && c?.role === 'INSTRUCTOR' && (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-bold text-slate-900">Chấm thủ công theo rubric đã duyệt</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-700">
              Kỹ năng
              <select
                aria-label="Kỹ năng"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900"
                disabled={req.busy || !!req.pending.current}
                value={skill}
                onChange={(e) => setSkill(e.target.value)}
              >
                <option value="SPEAKING">Kỹ năng Nói (Speaking)</option>
                <option value="WRITING">Kỹ năng Viết (Writing)</option>
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Thang chấm chuẩn
              <select
                aria-label="Rubric"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900"
                disabled={req.busy || !!req.pending.current}
                value={rubric}
                onChange={(e) => setRubric(e.target.value)}
              >
                <option value="">Chọn phiên bản đã duyệt</option>
                {d.rubrics.map((r, rIdx) => (
                  <option key={r.id} value={r.id}>
                    Thang chấm chuẩn #{rIdx + 1} (mã {r.id.slice(0, 6).toUpperCase()})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <RubricScoreForm
            key={id + ':' + skill + ':' + rubric}
            review={d}
            rubricId={rubric}
            skill={skill}
            busy={req.busy || !!req.pending.current}
            onSubmit={async (scores, reason) => {
              const result = await req.send(
                '/attempts/' + id + '/evaluations',
                {
                  skill,
                  rubricId: rubric,
                  expectedNumber: Math.max(
                    0,
                    ...d.evaluations.filter((e) => e.skill === skill).map((e) => e.number),
                  ),
                  scores,
                  originalEvidenceReviewed: true,
                  reason,
                },
                async () => {
                  if (!(await load())) throw new Error('Review state not confirmed');
                },
              );
              return !!result;
            }}
          />
        </section>
      )}

      {d && d.evaluations.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900">
            Kết quả đánh giá theo kỹ năng ({d.evaluations.length})
          </h2>
          {d.evaluations.map((e) => {
            const pubReason = publishReasons[e.id] ?? '';
            return (
              <article className="space-y-4 rounded-xl border border-slate-200 bg-white p-5" key={e.id}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <h3 className="text-base font-bold text-slate-900">
                    {e.skill === 'LR' ? 'Listening & Reading (Tự động)' : e.skill} · Bản #{e.number}
                  </h3>
                  <span className={e.release ? 'badge-published' : 'badge-info'}>
                    {e.release
                      ? 'Đã công bố chính thức'
                      : e.skill === 'LR'
                        ? 'Đã ghi nhận điểm tự động'
                        : 'Chờ công bố độc lập'}
                  </span>
                </div>

                <EvaluationSummaryView body={e.body} skill={e.skill} />

                {!e.release && c?.permissions['placement.result.publish'] && (
                  <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Lý do xác nhận &amp; công bố độc lập (tối thiểu 10 ký tự)
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-normal text-slate-900"
                        placeholder="VD: Đã rà soát đầy đủ kết quả làm bài, xác nhận công bố…"
                        value={pubReason}
                        onChange={(ev) =>
                          setPublishReasons((prev) => ({ ...prev, [e.id]: ev.target.value }))
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="rounded-lg bg-[#76a35e] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#5e8a47] disabled:opacity-50"
                      disabled={pubReason.trim().length < 10 || req.busy || !!req.pending.current}
                      onClick={() => {
                        setNotice('');
                        void req
                          .send('/evaluations/' + e.id + '/publish', { reason: pubReason.trim() })
                          .then((r) => {
                            if (r) {
                              setNotice('Đã xác nhận và công bố kết quả đánh giá.');
                              setPublishReasons((prev) => ({ ...prev, [e.id]: '' }));
                              void load();
                            }
                          });
                      }}
                    >
                      {d?.internalAssessment
                        ? 'Xác nhận & công bố kết quả nội bộ'
                        : 'Kiểm tra & công bố độc lập DEV'}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
