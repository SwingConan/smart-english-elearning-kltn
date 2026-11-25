import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useAuth } from '@/features/auth/auth-context';
import { accountLabel, classLabel } from '@/features/catalog/record-presentation';
import { classCodeLabel } from '@/features/demo/presentation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { button, field } from '@/features/class-lms/api';
import { schoolDay, schoolTime } from '@/features/class-lms/month';
import { ManualMeetField } from '@/features/meet/ManualMeetField';
import { isManualMeetUrl, MANUAL_MEET_ERROR } from '@/features/meet/manual-meet';
const base = '/v2/session-engagement/';
type Result = {
  status: string;
  version: number;
  raw: { id: string; status: string; acceptedAt: string } | null;
  reviewId: string | null;
};
type View = {
  session: {
    id: string;
    classId: string;
    revision: number;
    startsAt: string;
    endsAt: string;
    timezone: string;
    modality?: 'ONLINE' | 'OFFLINE' | 'HYBRID';
  };
  permissions: {
    teacher: boolean;
    meetPreparer?: boolean;
    learner: boolean;
    inspector: boolean;
    meeting: boolean;
    attendance: boolean;
    schedule: boolean;
  };
  meetUrl: string | null;
  meetState: string;
  attendance: { configured: boolean; state: string; serverTime: string; result: Result | null };
};
type Roster = { data: { learner: { id: string; fullName: string }; result: Result }[] };
type History = {
  data: {
    id: string;
    learnerId: string;
    state: string;
    beforeStatus: string;
    requestedStatus: string;
    reason: string;
    evidence: string;
    reviewReason: string | null;
  }[];
  exceptions?: {
    id: string;
    kind: string;
    modality: string;
    startLocal: string | null;
    endLocal: string | null;
    reason: string;
    state: string;
    reviewReason: string | null;
  }[];
  meets?: {
    id: string;
    number: number;
    url: string;
    reason: string;
    state: string;
    reviewReason: string | null;
  }[];
};
const statusLabel: Record<string, string> = {
  PRESENT: 'Đúng giờ',
  LATE: 'Đi muộn',
  NOT_RECORDED: 'Chưa ghi nhận',
  OPEN: 'Đang mở',
  CLOSED: 'Đóng',
  PENDING_APPROVAL: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
  NOT_PROPOSED: 'Chưa đề xuất',
  ROUTED: 'Chờ duyệt lịch chính thức',
  ONLINE: 'Trực tuyến (Online)',
  OFFLINE: 'Trực tiếp (Offline)',
  HYBRID: 'Kết hợp (Hybrid)',
  LEAVE: 'Nghỉ buổi',
  RESCHEDULE: 'Đổi lịch',
  MAKEUP: 'Dạy bù',
};
function label(v: string) {
  return statusLabel[v] ?? v;
}
function friendlyCommandError(e: unknown): string {
  if (!(e instanceof ApiError)) {
    return 'Không lưu được: vui lòng kiểm tra lại thời gian buổi học, mã điểm danh và thử lại.';
  }
  if (e.status === 404) {
    return 'Buổi học hoặc quyền truy cập không còn hợp lệ. Vui lòng tải lại trang.';
  }
  const msg = e.message || '';
  if (msg.includes('Dated proposal and assignment required')) {
    return 'Vui lòng nhập đầy đủ thời gian bắt đầu/kết thúc mới và chọn phân công đã duyệt.';
  }
  if (msg.includes('Invalid dated interval')) {
    return 'Thời gian kết thúc mới phải sau thời gian bắt đầu mới.';
  }
  if (msg.includes('Only future published official session may be changed')) {
    return 'Chỉ có thể gửi đề nghị nghỉ, đổi lịch hoặc dạy bù cho buổi học chính thức sắp tới.';
  }
  if (msg.includes('Only future')) {
    return 'Thao tác này chỉ áp dụng cho buổi học sắp diễn ra.';
  }
  return 'Không lưu được: vui lòng kiểm tra lại thời gian buổi học, mã điểm danh và thử lại.';
}
function useCommand() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const keys = useRef(new Map<string, string>());
  async function send<T>(
    path: string,
    body: Record<string, unknown>,
    fresh = false,
  ): Promise<T | undefined> {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    const digest = path + JSON.stringify(body);
    if (fresh || !keys.current.has(digest)) keys.current.set(digest, crypto.randomUUID());
    try {
      const value = await apiFetch<T>(base + path, {
        method: 'POST',
        body: JSON.stringify({ ...body, key: keys.current.get(digest) }),
      });
      setMessage('Thao tác thành công.');
      return value;
    } catch (e) {
      setError(friendlyCommandError(e));
    } finally {
      setBusy(false);
    }
  }
  return { busy, message, error, send, setMessage, setError };
}
export function SessionEngagementPanel({
  sessionId,
  focus = 'all',
}: {
  sessionId: string;
  focus?: 'all' | 'meet' | 'schedule';
}) {
  const { user } = useAuth(),
    [view, setView] = useState<View>(),
    [roster, setRoster] = useState<Roster>(),
    [history, setHistory] = useState<History>(),
    [loadError, setLoadError] = useState(''),
    [tick, setTick] = useState(0),
    [revealed, setRevealed] = useState<{ code: string | null; expiresAt: string }>(),
    command = useCommand();
  const reload = () => setTick((x) => x + 1);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((x) => x + 1), 10000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let live = true;
    void apiFetch<View>(base + 'sessions/' + sessionId)
      .then(async (v) => {
        if (!live) return;
        setView(v);
        setLoadError('');
        if (v.permissions.teacher || v.permissions.attendance) {
          const r = await apiFetch<Roster>(base + 'sessions/' + sessionId + '/roster');
          if (live) setRoster(r);
        }
        if (v.permissions.teacher || v.permissions.learner || v.permissions.attendance) {
          const h = await apiFetch<History>(base + 'sessions/' + sessionId + '/history');
          if (live) setHistory(h);
        }
      })
      .catch(() => {
        if (live) {
          setView(undefined);
          setRoster(undefined);
          setRevealed(undefined);
          setLoadError('Thông tin lớp học trực tuyến và điểm danh hiện chưa khả dụng.');
        }
      });
    return () => {
      live = false;
    };
  }, [sessionId, tick]);
  async function form(
    e: FormEvent<HTMLFormElement>,
    path: string,
    build: (d: FormData) => Record<string, unknown>,
  ) {
    e.preventDefault();
    const body = build(new FormData(e.currentTarget));
    if (path.endsWith('/meet') && !isManualMeetUrl(String(body.url ?? ''))) {
      command.setError(MANUAL_MEET_ERROR);
      return;
    }
    if (await command.send(path, body)) reload();
  }
  if (!view) return <p role="status">{loadError || 'Đang tải Meet/điểm danh…'}</p>;
  const p = view.permissions,
    prefix = 'sessions/' + sessionId,
    isOfflineSession = view.session.modality === 'OFFLINE';
  return (
    <section aria-label="Meet và điểm danh" className="space-y-4 border-t border-slate-200 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold text-slate-900">Thông tin buổi học</h2>
          {view.session.modality && (
            <span className="rounded-full bg-[#e9f2e4] px-2.5 py-0.5 text-xs font-semibold text-[#2d581b]">
              {label(view.session.modality)}
            </span>
          )}
          {!isOfflineSession && (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
              Meet: {label(view.meetState)}
            </span>
          )}
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
            Điểm danh: {label(view.attendance.state)}
          </span>
        </div>
        {!isOfflineSession && view.meetUrl && (
          <a className={button} href={view.meetUrl} target="_blank" rel="noopener noreferrer">
            Vào Meet đã duyệt
          </a>
        )}
      </div>
      {p.teacher && focus === 'schedule' && (
        <ExceptionForm sessionId={sessionId} defaultOpen onDone={reload} />
      )}
      {(command.error || command.message) && (
        <p role={command.error ? 'alert' : 'status'}>{command.error || command.message}</p>
      )}
      {(p.teacher || p.meetPreparer) && focus !== 'schedule' && (
        <div className={isOfflineSession ? 'space-y-4' : 'grid gap-4 lg:grid-cols-2'}>
          {isOfflineSession ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              Buổi này dạy trực tiếp tại lớp (Offline), không cần link Google Meet. Nếu cần chuyển
              buổi này sang học Online, hãy gửi yêu cầu ở tab <strong>Nghỉ dạy, đổi lịch &amp; dạy bù</strong>.
            </p>
          ) : (
            <form
              className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4"
              onSubmit={(e) =>
                void form(e, prefix + '/meet', (d) => ({
                  url: d.get('url'),
                  reason: d.get('reason'),
                }))
              }
            >
              <h3 className="text-sm font-bold text-slate-900">Đề xuất link Meet</h3>
              <ManualMeetField label="Link Meet thủ công" className={field} />
              <label className="block space-y-1 text-xs font-semibold text-slate-700">
                <span>Lý do đề xuất</span>
                <textarea name="reason" required maxLength={1000} rows={2} className={field} />
              </label>
              <button disabled={command.busy} className={button}>
                Gửi phê duyệt
              </button>
            </form>
          )}
          {!p.teacher ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-600">
              Bạn được chuẩn bị link cho buổi tương lai đã phân công. Việc điểm danh buổi học được
              thực hiện thống nhất tại mục Điểm danh trong lớp học.
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-xs text-slate-600 space-y-1.5">
              <p className="font-bold text-slate-900">Điểm danh buổi học</p>
              <p>
                Thao tác điểm danh sinh viên được thực hiện thống nhất qua hoạt động{' '}
                <strong>Điểm danh trong lớp</strong> (`/classroom/{view.session.classId}`).
              </p>
            </div>
          )}
        </div>
      )}
      {p.learner && view.attendance.configured && (
        <>
          <p data-testid="attendance-result">
            Kết quả: {label(view.attendance.result?.status ?? 'NOT_RECORDED')}
          </p>
          <form
            className="space-y-3"
            onSubmit={(e) =>
              void form(e, prefix + '/checkin', (d) => ({
                code: String(d.get('code')).trim().toUpperCase(),
              }))
            }
          >
            <label className="block">
              Mã phiên của giảng viên
              <input
                name="code"
                autoComplete="off"
                required
                pattern="[A-Fa-f0-9]{20}"
                maxLength={20}
                className={field}
              />
            </label>
            <button
              disabled={
                command.busy || view.attendance.state !== 'OPEN' || !view.attendance.configured
              }
              className={button}
            >
              Gửi điểm danh
            </button>
          </form>
        </>
      )}
      {history && (
        <details open={(history.exceptions?.length ?? 0) > 0 || (history.meets?.length ?? 0) > 0 || history.data.length > 0}>
          <summary className="cursor-pointer font-semibold text-slate-900">
            Lịch sử yêu cầu và quyết định (
            {(history.exceptions?.length ?? 0) + (history.meets?.length ?? 0) + history.data.length})
          </summary>
          <div className="mt-2 space-y-1.5 text-sm text-slate-700">
            {(history.exceptions ?? []).map((x) => (
              <p key={x.id}>
                <strong>{label(x.kind)}</strong> ({label(x.modality)})
                {x.startLocal && x.endLocal ? ` · ${x.startLocal.replace('T', ' ')} → ${x.endLocal.replace('T', ' ')}` : ''}
                : {label(x.state)} · {x.reason}
                {x.reviewReason ? ` · ${x.reviewReason}` : ''}
              </p>
            ))}
            {(history.meets ?? []).map((x) => (
              <p key={x.id}>
                <strong>Đề xuất Meet #{x.number}</strong>: {label(x.state)} · {x.reason}
                {x.reviewReason ? ` · ${x.reviewReason}` : ''}
              </p>
            ))}
            {history.data.map((x) => (
              <p key={x.id}>
                {label(x.beforeStatus)} → {label(x.requestedStatus)}: {label(x.state)} · {x.reason}
                {x.reviewReason ? ` · ${x.reviewReason}` : ''}
              </p>
            ))}
            {(history.exceptions?.length ?? 0) === 0 &&
              (history.meets?.length ?? 0) === 0 &&
              history.data.length === 0 && (
                <p className="text-xs text-slate-500">Chưa có yêu cầu nào cho buổi học này.</p>
              )}
          </div>
        </details>
      )}
      {p.teacher && focus !== 'schedule' && <ExceptionForm sessionId={sessionId} onDone={reload} />}
      {(p.meeting || p.attendance || p.schedule) && (
        <Link className={button} to="/academic/session-engagement">
          Phê duyệt phòng học & Điểm danh
        </Link>
      )}
    </section>
  );
}
function ExceptionForm({
  sessionId,
  defaultOpen = false,
  onDone,
}: {
  sessionId: string;
  defaultOpen?: boolean;
  onDone?: () => void;
}) {
  const c = useCommand(),
    [options, setOptions] = useState<{
      assignments: {
        id: string;
        effectiveFrom: string;
        reservedUntil: string;
        instructor: { fullName: string };
      }[];
      rooms: { id: string; code: string; name: string }[];
    }>();
  const [excKind, setExcKind] = useState<'LEAVE' | 'RESCHEDULE' | 'MAKEUP'>('LEAVE');
  const [excNowMs] = useState(() => Date.now());
  const defaultAssignmentId =
    options?.assignments.find((x) => new Date(x.reservedUntil).getTime() > excNowMs)?.id ??
    options?.assignments[options.assignments.length - 1]?.id ??
    '';
  useEffect(() => {
    let live = true;
    void apiFetch<NonNullable<typeof options>>(
      base + 'sessions/' + sessionId + '/exception-options',
    )
      .then((r) => {
        if (live) setOptions(r);
      })
      .catch(() => {
        if (live) setOptions(undefined);
      });
    return () => {
      live = false;
    };
  }, [sessionId]);
  return (
    <details open={defaultOpen} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <summary className="cursor-pointer font-semibold text-slate-900">
        Đề nghị nghỉ hoặc dời lịch học
      </summary>
      <form
        className="space-y-3 pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          const kind = String(d.get('kind') ?? '');
          const startLocal = String(d.get('startLocal') ?? '').trim();
          const endLocal = String(d.get('endLocal') ?? '').trim();
          const assignmentId = String(d.get('assignmentId') ?? '').trim();
          if (kind !== 'LEAVE') {
            if (!startLocal || !endLocal || !assignmentId) {
              c.setError(
                'Vui lòng nhập đầy đủ thời gian bắt đầu/kết thúc mới và chọn phân công đã duyệt.',
              );
              return;
            }
            if (endLocal <= startLocal) {
              c.setError('Thời gian kết thúc mới phải sau thời gian bắt đầu mới.');
              return;
            }
          }
          void c
            .send('sessions/' + sessionId + '/exceptions', {
              kind,
              reason: d.get('reason'),
              modality: d.get('modality'),
              timezone: 'Asia/Ho_Chi_Minh',
              requiredCapabilities: [],
              ...(startLocal ? { startLocal } : {}),
              ...(endLocal ? { endLocal } : {}),
              ...(assignmentId ? { assignmentId } : {}),
              ...(d.get('roomId') ? { roomId: d.get('roomId') } : {}),
            })
            .then((r) => {
              if (r) onDone?.();
            });
        }}
      >
        <p className="text-xs text-slate-600">
          Đề xuất thay đổi lịch sẽ gửi tới phòng Học vụ xem xét trước khi cập nhật chính thức.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-xs font-semibold text-slate-700">
            <span>Loại đề nghị</span>
            <select
              name="kind"
              className={field}
              value={excKind}
              onChange={(e) => setExcKind(e.target.value as 'LEAVE' | 'RESCHEDULE' | 'MAKEUP')}
            >
              <option value="LEAVE">Nghỉ buổi</option>
              <option value="RESCHEDULE">Đổi lịch</option>
              <option value="MAKEUP">Dạy bù</option>
            </select>
          </label>
          {excKind !== 'LEAVE' && (
            <>
              <label className="block space-y-1 text-xs font-semibold text-slate-700">
                <span>Hình thức</span>
                <select name="modality" className={field}>
                  <option value="ONLINE">Trực tuyến (Online)</option>
                  <option value="OFFLINE">Trực tiếp tại lớp (Offline)</option>
                  <option value="HYBRID">Kết hợp (Hybrid)</option>
                </select>
              </label>
              <label className="block space-y-1 text-xs font-semibold text-slate-700">
                <span>Bắt đầu mới (giờ Việt Nam)</span>
                <input name="startLocal" type="datetime-local" className={field} />
              </label>
              <label className="block space-y-1 text-xs font-semibold text-slate-700">
                <span>Kết thúc mới (giờ Việt Nam)</span>
                <input name="endLocal" type="datetime-local" className={field} />
              </label>
              <label className="block space-y-1 text-xs font-semibold text-slate-700">
                <span>Phòng (khi cần)</span>
                <select name="roomId" className={field}>
                  <option value="">Lớp học trực tuyến (Online)</option>
                  {options?.rooms.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.code} · {x.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label className="block space-y-1 text-xs font-semibold text-slate-700">
            <span>Phân công đã duyệt</span>
            <select
              key={defaultAssignmentId || 'empty'}
              name="assignmentId"
              defaultValue={defaultAssignmentId}
              className={field}
            >
              <option value="">Chọn phân công</option>
              {options?.assignments.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.instructor.fullName} · {schoolDay(x.effectiveFrom)} –{' '}
                  {schoolDay(x.reservedUntil)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block space-y-1 text-xs font-semibold text-slate-700">
          <span>Lý do đề nghị</span>
          <textarea name="reason" required rows={2} maxLength={1000} className={field} />
        </label>
        <button disabled={c.busy} className={button}>
          Gửi đề nghị lịch
        </button>
        <p role={c.error ? 'alert' : 'status'}>{c.error || c.message}</p>
      </form>
    </details>
  );
}
type Queue = {
  data: {
    classOffering?: { code: string; name: string };
    sessionId: string;
    startsAt: string;
    meets: { id: string }[];
    corrections: { id: string }[];
    exceptions: { id: string }[];
  }[];
};
type Review = {
  learner?: { fullName: string };
  maker?: { id: string; fullName: string; email?: string };
  id: string;
  url?: string;
  reason: string;
  evidence?: string;
  beforeStatus?: string;
  requestedStatus?: string;
  state: string;
  kind?: string;
  startLocal?: string;
  endLocal?: string;
  timezone?: string;
  modality?: string;
  originalSession?: {
    id: string;
    classOffering?: { id: string; code: string; name: string };
    startsAt: string;
    endsAt: string;
    timezone: string;
    modality: string;
    room?: { id: string; code: string; name: string; location: string } | null;
    instructor?: { id: string; fullName: string } | null;
  };
  proposedRoom?: { id: string; code: string; name: string; location: string } | null;
  conflicts?: string[];
};
export function SessionEngagementReviewPage() {
  const [queue, setQueue] = useState<Queue>(),
    [selected, setSelected] = useState<{ kind: string; row: Review }>(),
    [reason, setReason] = useState(''),
    [error, setError] = useState(''),
    [tick, setTick] = useState(0),
    [kindFilter, setKindFilter] = useState<'all' | 'meet' | 'exception' | 'correction'>('all'),
    c = useCommand();
  useEffect(() => {
    let live = true;
    void apiFetch<Queue>(base + 'reviews')
      .then((r) => {
        if (live) setQueue(r);
      })
      .catch(() => {
        if (live) {
          setQueue(undefined);
          setSelected(undefined);
          setError('Không có quyền duyệt hiện hành.');
        }
      });
    return () => {
      live = false;
    };
  }, [tick]);
  async function open(kind: string, id: string) {
    setSelected(undefined);
    try {
      setSelected({ kind, row: await apiFetch<Review>(base + 'reviews/' + kind + '/' + id) });
      setReason('');
    } catch {
      setError('Yêu cầu không còn trong phạm vi duyệt.');
    }
  }
  const meetCount = queue?.data.reduce((sum, s) => sum + s.meets.length, 0) ?? 0;
  const exceptionCount = queue?.data.reduce((sum, s) => sum + s.exceptions.length, 0) ?? 0;
  const correctionCount = queue?.data.reduce((sum, s) => sum + s.corrections.length, 0) ?? 0;
  const visibleRows = (queue?.data ?? []).filter((s) => {
    if (kindFilter === 'meet') return s.meets.length > 0;
    if (kindFilter === 'exception') return s.exceptions.length > 0;
    if (kindFilter === 'correction') return s.corrections.length > 0;
    return true;
  });

  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-slate-600">
        <button
          type="button"
          onClick={() => setTick((x) => x + 1)}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
        >
          Tải lại hàng đợi
        </button>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <span className="inline-flex items-center rounded bg-[#e9f2e4] px-2.5 py-0.5 text-xs font-semibold text-[#2f5d1e]">
              Google Meet · Nghỉ dạy / Đổi lịch / Dạy bù
            </span>
            <h1 className="text-2xl font-bold text-[#e66f2b] sm:text-3xl">
              Duyệt Meet, Đổi lịch &amp; Điểm danh
            </h1>
            <p className="max-w-3xl text-sm text-slate-600">
              Rà soát đề nghị duyệt link Google Meet, đơn xin nghỉ dạy / đổi lịch / dạy bù và yêu cầu điều chỉnh điểm danh từ giảng viên.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-center">
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-semibold text-slate-500">Link Meet</p>
              <p className="text-lg font-bold text-slate-900">{meetCount}</p>
            </div>
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-semibold text-slate-500">Đổi lịch / Dạy bù</p>
              <p className="text-lg font-bold text-slate-900">{exceptionCount}</p>
            </div>
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-semibold text-slate-500">Sửa điểm danh</p>
              <p className="text-lg font-bold text-slate-900">{correctionCount}</p>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {(
            [
              ['all', `Tất cả (${queue?.data.length ?? 0})`],
              ['meet', `Link Google Meet (${meetCount})`],
              ['exception', `Nghỉ dạy / Đổi lịch (${exceptionCount})`],
              ['correction', `Sửa điểm danh (${correctionCount})`],
            ] as const
          ).map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => setKindFilter(k)}
              className={`rounded border px-3 py-1.5 text-xs font-semibold transition ${
                kindFilter === k
                  ? 'border-[#76a35e] bg-[#76a35e] text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      {visibleRows.map((s) => (
        <section
          key={s.sessionId}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4"
        >
          <div>
            <p className="text-sm font-bold text-slate-900">
              {s.classOffering
                ? `${classCodeLabel(s.classOffering.code)} · ${classLabel(s.classOffering.name, s.classOffering.code)}`
                : 'Buổi học'}
            </p>
            <p className="text-xs text-slate-600">
              {new Intl.DateTimeFormat('vi-VN', {
                timeZone: 'Asia/Ho_Chi_Minh',
                dateStyle: 'short',
              }).format(new Date(s.startsAt))}{' '}
              · {schoolTime(s.startsAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {s.meets.map((x) => (
              <button
                key={x.id}
                className="rounded border border-[#76a35e] bg-[#e9f2e4] px-3 py-1.5 text-xs font-semibold text-[#2f5d1e] hover:bg-[#dcebd4]"
                onClick={() => void open('meet', x.id)}
              >
                Xem đề xuất Meet
              </button>
            ))}
            {s.corrections.map((x) => (
              <button key={x.id} className={button} onClick={() => void open('correction', x.id)}>
                Xem yêu cầu sửa điểm danh
              </button>
            ))}
            {s.exceptions.map((x) => (
              <button
                key={x.id}
                className="rounded border border-[#e66f2b]/50 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-[#b84c12] hover:bg-orange-100"
                onClick={() => void open('exception', x.id)}
              >
                Xem đề nghị lịch
              </button>
            ))}
          </div>
        </section>
      ))}
      {queue && !visibleRows.length && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
          Không có yêu cầu nào đang chờ xử lý.
        </div>
      )}
      {selected && (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-5" aria-label="Chi tiết yêu cầu">
          <h2 className="text-lg font-bold text-[#e66f2b]">Chi tiết yêu cầu</h2>
          <p className="text-sm text-slate-800">
            {selected.row.reason
              ?.replace(/^\[Q\d+\s+E2E\s+Demo\]\s*/i, '')
              .replace(/^De xuat link Google Meet cho buoi (\d+)$/i, 'Đề xuất đường dẫn Google Meet cho buổi $1')
              .trim()}
          </p>
          {selected.row.learner && <p className="text-sm text-slate-700">Học viên: {selected.row.learner.fullName}</p>}
          {selected.row.url && <p className="break-all text-sm font-medium text-slate-800">Link cần duyệt: {selected.row.url}</p>}
          {selected.row.evidence && <p className="text-sm text-slate-700">Bằng chứng: {selected.row.evidence}</p>}
          {selected.row.requestedStatus && (
            <p className="text-sm font-medium text-slate-800">
              {label(selected.row.beforeStatus ?? 'NOT_RECORDED')} →{' '}
              {label(selected.row.requestedStatus)}
            </p>
          )}
          {selected.row.kind && (
            <div className="space-y-2 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              {selected.row.maker && (
                <p>
                  <span className="font-semibold">Giảng viên đề nghị:</span>{' '}
                  {accountLabel(selected.row.maker.fullName)}
                </p>
              )}
              {selected.row.originalSession && (
                <p>
                  <span className="font-semibold">Lịch gốc:</span>{' '}
                  {selected.row.originalSession.classOffering
                    ? `${classCodeLabel(selected.row.originalSession.classOffering.code)} · `
                    : ''}
                  {schoolDay(selected.row.originalSession.startsAt)} ·{' '}
                  {schoolTime(selected.row.originalSession.startsAt)}–
                  {schoolTime(selected.row.originalSession.endsAt)} (
                  {label(selected.row.originalSession.modality)}
                  {selected.row.originalSession.room
                    ? ` · ${selected.row.originalSession.room.code}`
                    : ''}
                  )
                </p>
              )}
              <p>
                <span className="font-semibold">Đề xuất ({label(selected.row.kind)}):</span>{' '}
                {selected.row.kind === 'LEAVE'
                  ? 'Hủy buổi học theo đơn xin nghỉ'
                  : `${selected.row.startLocal ?? ''} → ${selected.row.endLocal ?? ''} ${selected.row.timezone ?? ''}${
                      selected.row.modality ? ` (${label(selected.row.modality)})` : ''
                    }${selected.row.proposedRoom ? ` · Phòng ${selected.row.proposedRoom.code}` : ''}`}
              </p>
              {selected.row.conflicts && selected.row.conflicts.length > 0 && (
                <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                  Xung đột phát hiện:{' '}
                  {selected.row.conflicts
                    .map(
                      (c) =>
                        ({
                          CLASS_CONFLICT: 'Trùng khung giờ của chính lớp học này',
                          ROOM_CONFLICT: 'Phòng học đã được sử dụng trong khung giờ này',
                          INSTRUCTOR_CONFLICT: 'Giảng viên đã có lịch dạy khác trong khung giờ này',
                          ROOM_UNSUITABLE: 'Phòng học chưa phù hợp sức chứa hoặc tiện ích buổi học',
                          ASSIGNMENT_WINDOW_MISMATCH: 'Ngoài khoảng hiệu lực phân công giảng viên',
                          APPROVED_EFFECTIVE_ASSIGNMENT_REQUIRED: 'Chưa có phân công giảng viên đã duyệt còn hiệu lực',
                          INVALID_PROPOSAL: 'Đề xuất chưa hợp lệ để kiểm tra lịch',
                        })[c] ?? c,
                    )
                    .join(', ')}
                </p>
              )}
              <p className="text-xs text-slate-500">
                Duyệt tại đây chuyển đề nghị thành dự thảo lịch chính thức để Học vụ độc lập phê duyệt ở mục Phê duyệt học vụ.
              </p>
            </div>
          )}
          <label className="block text-sm font-semibold text-slate-700">
            Lý do quyết định <span className="font-normal text-xs text-slate-500">(bắt buộc trước khi duyệt / từ chối)</span>
            <textarea
              required
              placeholder="Nhập lý do phê duyệt hoặc từ chối..."
              className={field + ' mt-1'}
              value={reason}
              maxLength={1000}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {(['APPROVED', 'REJECTED'] as const).map((decision) => (
              <button
                key={decision}
                className={
                  decision === 'APPROVED'
                    ? 'rounded border border-[#76a35e] bg-[#76a35e] px-4 py-2 text-xs font-bold text-white hover:bg-[#5e8a47] disabled:opacity-50'
                    : 'rounded border border-red-300 bg-white px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50'
                }
                disabled={c.busy || !reason.trim() || selected.row.state !== 'PENDING_APPROVAL'}
                onClick={() =>
                  void c
                    .send('reviews/' + selected.kind + '/' + selected.row.id, { decision, reason })
                    .then((r) => {
                      if (r) {
                        setSelected(undefined);
                        setTick((x) => x + 1);
                      }
                    })
                }
              >
                {decision === 'APPROVED'
                  ? selected.kind === 'exception'
                    ? 'Chuyển dự thảo lịch'
                    : 'Phê duyệt'
                  : 'Từ chối'}
              </button>
            ))}
          </div>
        </section>
      )}
      {(c.error || c.message) && (
        <p
          role={c.error ? 'alert' : 'status'}
          className={`rounded-lg px-4 py-3 text-sm font-medium ${
            c.error ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {c.error || c.message}
        </p>
      )}
    </main>
  );
}
export function ClassAttendancePage() {
  const { classId = '' } = useParams(),
    [searchParams] = useSearchParams(),
    [data, setData] =
      useState<{ id: string; startsAt: string; endsAt: string; revision: number }[]>(),
    [selectedSessionId, setSelectedSessionId] = useState<string>(
      searchParams.get('sessionId') ?? '',
    ),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void apiFetch<{ data: NonNullable<typeof data> }>(base + 'classes/' + classId)
      .then((r) => {
        if (live) {
          setData(r.data);
          const requested = searchParams.get('sessionId');
          if (requested && r.data.some((x) => x.id === requested)) {
            setSelectedSessionId(requested);
          } else if (r.data.length > 0) {
            setSelectedSessionId((prev) => prev || r.data[0].id);
          }
        }
      })
      .catch(() => {
        if (live) setError('Không có buổi chính thức trong phạm vi được phép.');
      });
    return () => {
      live = false;
    };
  }, [classId, searchParams]);
  const mode = searchParams.get('mode');
  return (
    <main className="section-shell space-y-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#76a35e]">
            {mode === 'meet' ? 'Lớp học trực tuyến / Google Meet' : 'Điểm danh buổi học'}
          </p>
          <h1 className="text-2xl font-bold text-[#e66f2b]">Điểm danh buổi học</h1>
        </div>
        <Link className={button} to={'/classroom/' + classId}>
          Về lớp
        </Link>
      </div>
      {error && (
        <div role="alert" className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          {error}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((x, idx) => (
          <div
            key={x.id}
            className={
              'flex flex-col justify-between rounded border p-4 ' +
              (selectedSessionId === x.id
                ? 'border-[#76a35e] bg-[#f4f9f1]'
                : 'border-slate-200 bg-white')
            }
          >
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">Buổi #{idx + 1}</p>
              <Link
                className="mt-1 block font-semibold text-indigo-700 hover:underline"
                to={'/my/events/' + x.id}
              >
                {schoolDay(x.startsAt)} {schoolTime(x.startsAt)} – {schoolTime(x.endsAt)} · v
                {x.revision}
              </Link>
            </div>
            <button
              type="button"
              className={button + ' mt-3 text-xs'}
              onClick={() => setSelectedSessionId(x.id)}
            >
              {selectedSessionId === x.id ? 'Đang chọn buổi này' : 'Chọn buổi này'}
            </button>
          </div>
        ))}
      </div>
      {selectedSessionId && (
        <SessionEngagementPanel key={selectedSessionId} sessionId={selectedSessionId} />
      )}
    </main>
  );
}
const w06NoticeLabels: Record<string, string> = {
  RESCHEDULE: 'Đổi lịch buổi học',
  LEAVE: 'Nghỉ buổi học',
  MAKEUP: 'Dạy bù buổi học',
  MEET_PROPOSED: 'Đề xuất link Google Meet mới',
  MEET_APPROVED: 'Link Google Meet đã được duyệt',
  MEET_REJECTED: 'Link Google Meet bị từ chối',
  PUBLISH: 'Đã công bố buổi học chính thức',
  ATTENDANCE_ENABLED: 'Đã bật điểm danh buổi học',
  CORRECTION_APPROVED: 'Đã duyệt điều chỉnh điểm danh',
  CORRECTION_REJECTED: 'Từ chối điều chỉnh điểm danh',
};

export function W06Notifications() {
  const [rows, setRows] = useState<{ id: string; kind: string; sessionId: string | null }[]>();
  const load = useCallback(() => {
    void apiFetch<{ data: NonNullable<typeof rows> }>(base + 'notifications')
      .then((r) => setRows(r.data))
      .catch(() => setRows(undefined));
  }, []);
  useEffect(load, [load]);
  if (!rows) return null;
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer font-semibold text-slate-900">
        Thông báo nghiệp vụ buổi học ({rows.length})
      </summary>
      <p className="mt-1 text-xs text-slate-500">
        Cập nhật trạng thái phê duyệt link Meet, lịch dạy và điều chỉnh điểm danh trong hệ thống.
      </p>
      <div className="mt-2 space-y-1.5 text-sm">
        {rows.length === 0 ? (
          <p className="text-xs text-slate-500">Chưa có thông báo mới.</p>
        ) : (
          rows.map((x) => (
            <p key={x.id} className="text-slate-700">
              <strong className="text-slate-900">{w06NoticeLabels[x.kind] ?? label(x.kind)}</strong>
              {x.sessionId && (
                <>
                  {' '}
                  ·{' '}
                  <Link
                    to={'/my/events/' + x.sessionId}
                    className="font-semibold text-[#4d7439] underline"
                  >
                    Xem chi tiết buổi học
                  </Link>
                </>
              )}
            </p>
          ))
        )}
      </div>
    </details>
  );
}
