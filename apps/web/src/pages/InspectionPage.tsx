import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { ApiError, apiFetch } from '@/lib/api-client';
import { useAuth } from '@/features/auth/auth-context';
import { ConfirmDialog } from '@/components/ui/Feedback';
import { accountLabel } from '@/features/catalog/record-presentation';
import { classCodeLabel } from '@/features/demo/presentation';
import { learnerClassLabel } from '@/features/enrollments/presentation';

const base = '/v2/inspection';

type Assignment = {
  id: string;
  classId: string;
  sessionId: string;
  teacherId: string;
  inspectorId: string;
  revision: number;
  startsAt: string;
  endsAt: string;
  state: string;
  version: number;
  reason: string;
};

type Detail = {
  classCode?: string | null;
  className?: string | null;
  personnel: {
    actualSeconds: number | null;
    approvedSeconds: number | null;
    correctedOutAt: string | null;
    revision: number | null;
  } | null;
  assignment: Assignment;
  valid: boolean;
  rights: { assign: boolean; hours: boolean; shift: boolean; inspector: boolean; teacher: boolean };
  meetUrl: string | null;
  scheduledSeconds: number;
  observedSeconds: number | null;
  approvedSeconds: number | null;
  hoursState: string;
  attestation: string;
  serverTime: string;
  segments: { id: string; startedAt: string; stoppedAt: string | null }[];
  reports: { id: string; number: number; presence: string; conditions: string; reason: string }[];
  decisions: {
    id: string;
    number: number;
    disposition: string;
    approvedSeconds: number | null;
    reason: string;
  }[];
  disputes: { id: string; reason: string }[];
  clocks: { id: string; kind: string; createdAt: string }[];
  corrections: {
    id: string;
    revision: number;
    proposedOutAt: string | null;
    kind: string;
    evidence: string;
    reason: string;
    decision: {
      disposition: string;
      reason: string;
      correctedOutAt: string | null;
      approvedShiftSeconds: number | null;
    } | null;
  }[];
};

type Dashboard = {
  from: string;
  to: string;
  nextAssignmentCursor: string | null;
  nextSessionCursor: string | null;
  data: Detail[];
  sessions: {
    id: string;
    classId: string;
    classCode?: string | null;
    className?: string | null;
    startsAt: string;
    endsAt: string;
    revision: number;
  }[];
  inspectors: { id: string; fullName: string }[];
  notifications: { id: string; kind: string; createdAt: string }[];
};

const when = (s: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(s));

const whenWithSeconds = (s: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(s));

const shortTime = (s: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(s));

const dayHeading = (ymd: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(ymd + 'T12:00:00+07:00'));

const formatDuration = (n: number | null, fallback = 'Chưa ghi nhận') => {
  if (n === null) return fallback;
  if (n === 0) return '0 giây';
  if (n < 60) return `${n} giây`;
  const hours = Math.floor(n / 3600);
  const mins = Math.floor((n % 3600) / 60);
  const secs = n % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} giờ`);
  if (mins > 0) parts.push(`${mins} phút`);
  if (hours === 0 && secs > 0) parts.push(`${secs} giây`);
  return parts.join(' ');
};

const cleanInspectionNote = (text: string | null | undefined) => {
  const cleaned = String(text ?? '')
    .replace(/^\s*\[Q\d+[^\]]*\]\s*/gi, '')
    .trim();
  return cleaned || '—';
};

const ASSIGNMENT_STATE_LABELS: Record<string, string> = {
  DISPATCHED: 'Đã phân công',
  ACTIVE: 'Chờ tiếp nhận',
  ACKNOWLEDGED: 'Đã tiếp nhận',
  ACCEPTED: 'Đã tiếp nhận',
  DECLINED: 'Không thể nhận',
  STARTED: 'Đang quan sát ca dạy',
  STOPPED: 'Đã kết thúc quan sát',
  INVALIDATED: 'Đã thay thế lịch',
  REASSIGNED: 'Đã điều phối lại',
  OFFICIAL_REVISION_INVALIDATED: 'Hết hiệu lực do lịch buổi học thay đổi',
};

const HOURS_STATE_LABELS: Record<string, string> = {
  PENDING: 'Chờ đối chiếu giờ',
  PENDING_REVIEW: 'Chờ Học vụ duyệt biên bản',
  HVU_CONFIRMED: 'Học vụ đã xác nhận giờ',
  UNCONFIRMED: 'Chưa đối chiếu giờ',
  APPROVED: 'Đã xác nhận đủ giờ',
  PARTIAL: 'Xác nhận một phần',
  REJECTED: 'Từ chối xác nhận',
  REJECT: 'Từ chối xác nhận',
  APPROVE: 'Xác nhận đủ giờ',
  DISPUTED: 'Đang khiếu nại',
};

const PRESENCE_LABELS: Record<string, string> = {
  PRESENT: 'Có mặt đúng giờ',
  LATE: 'Vào muộn',
  ABSENT: 'Vắng mặt',
  INACCESSIBLE: 'Không vào được lớp / Link lỗi',
};

const CLOCK_KIND_LABELS: Record<string, string> = {
  IN: 'Vào ca thanh tra',
  OUT: 'Ra ca thanh tra',
};

const CORRECTION_KIND_LABELS: Record<string, string> = {
  MISSING_CHECKOUT: 'Thiếu thao tác ra ca',
  LATE: 'Vào ca muộn do sự cố',
  EARLY: 'Ra ca sớm',
  CANCELLED: 'Buổi học hủy / thay đổi đột xuất',
  WRONG_DEVICE: 'Lỗi thiết bị / đường truyền',
};

const CORRECTION_DECISION_LABELS: Record<string, string> = {
  ACCEPT: 'Chấp nhận điều chỉnh',
  REJECT: 'Từ chối điều chỉnh',
};

const NOTIFICATION_KIND_LABELS: Record<string, string> = {
  DISPATCH: 'Phân công ca thanh tra mới',
  ACK: 'Thanh tra đã xác nhận tiếp nhận ca',
  DECLINE: 'Thanh tra báo không thể nhận ca',
  START: 'Bắt đầu quan sát ca dạy',
  STOP: 'Kết thúc lượt quan sát ca dạy',
  IN: 'Ghi nhận vào ca thanh tra',
  OUT: 'Ghi nhận ra ca thanh tra',
  REPORT: 'Đã gửi biên bản quan sát ca dạy',
  REVIEW: 'Phòng Học vụ đã xem xét giờ giảng dạy',
  DISPUTE: 'Giảng viên đã gửi khiếu nại giờ giảng',
  REASSIGN: 'Đã điều phối lại thanh tra viên',
  REASSIGNED: 'Đã điều phối lại thanh tra viên',
  CORRECTION: 'Có đề nghị điều chỉnh giờ ra ca thanh tra',
  CORRECTION_REVIEW: 'Học vụ đã duyệt điều chỉnh chấm công thanh tra',
  OFFICIAL_REVISION_INVALIDATED: 'Ca thanh tra hết hiệu lực do lịch buổi học thay đổi',
};

const DEFAULT_ACTION_REASONS: Record<string, string> = {
  ACK: 'Thanh tra xác nhận tiếp nhận ca đúng lịch phân công',
  START: 'Bắt đầu quan sát lớp học trực tuyến',
  STOP: 'Kết thúc lượt quan sát ca dạy',
  IN: 'Ghi nhận thời điểm vào ca thanh tra',
  OUT: 'Ghi nhận thời điểm ra ca thanh tra',
};

function formatClassTitle(classId: string, code?: string | null, name?: string | null) {
  if (code || name) {
    const cleanCode = code ? classCodeLabel(code) || code : '';
    const cleanName = name ? learnerClassLabel(name, code ?? '') : '';
    if (cleanCode && cleanName) return `${cleanCode} · ${cleanName}`;
    return cleanCode || cleanName;
  }
  return `Lớp ${classId.slice(0, 8)}`;
}

const input = 'input-field py-2 text-sm';
const button = 'btn-secondary px-3.5 py-2 text-xs';

function dayKey(s: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date(s))
      .map((x) => [x.type, x.value]),
  );
  return p.year + '-' + p.month + '-' + p.day;
}

function duringDay(start: string, end: string, day: string) {
  const from = new Date(day + 'T00:00:00+07:00').getTime();
  return new Date(start).getTime() < from + 86400000 && new Date(end).getTime() > from;
}

function moveDay(day: string, n: number) {
  return new Date(new Date(day + 'T12:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
}

export function InspectionPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const paramDate = searchParams.get('date');
  const paramAssignment = searchParams.get('assignment');
  const validParamDate = paramDate && /^\d{4}-\d{2}-\d{2}$/.test(paramDate) ? paramDate : null;

  const [firstDay, setFirstDay] = useState(
      () => validParamDate ?? dayKey(new Date().toISOString()),
    ),
    [outLocal, setOutLocal] = useState('');
  const days = Array.from({ length: 7 }, (_, i) => moveDay(firstDay, i));
  const query =
    '?from=' +
    encodeURIComponent(new Date(firstDay + 'T00:00:00+07:00').toISOString()) +
    '&to=' +
    encodeURIComponent(new Date(moveDay(firstDay, 7) + 'T00:00:00+07:00').toISOString()) +
    '&limit=25';
  const [data, setData] = useState<Dashboard>(),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(() => paramAssignment ?? ''),
    [notificationsOpen, setNotificationsOpen] = useState(() => location.hash === '#notifications'),
    [classFilter, setClassFilter] = useState('ALL'),
    [sessionId, setSessionId] = useState(''),
    [inspectorId, setInspectorId] = useState(''),
    [reason, setReason] = useState(''),
    [disputeReason, setDisputeReason] = useState(''),
    [confirmReportOpen, setConfirmReportOpen] = useState(false),
    [conditions, setConditions] = useState(''),
    [presence, setPresence] = useState('PRESENT'),
    [approved, setApproved] = useState(''),
    [kind, setKind] = useState('MISSING_CHECKOUT'),
    [evidence, setEvidence] = useState('');
  useEffect(() => {
    if (validParamDate) setFirstDay(validParamDate);
    if (paramAssignment) setSelected(paramAssignment);
  }, [paramAssignment, validParamDate]);

  useEffect(() => {
    if (location.hash === '#notifications') {
      setNotificationsOpen(true);
      const el = document.getElementById('notifications');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.hash, data]);

  const keys = useRef(new Map<string, string>());
  const isInstructorOnly = user?.role === 'INSTRUCTOR';
  const isInspectorRole = user?.role === 'TEACHING_INSPECTOR';

  const classOptions = [
    ...new Map(
      [
        ...(data?.data ?? []).map((d) => [
          d.assignment.classId,
          formatClassTitle(d.assignment.classId, d.classCode, d.className),
        ]),
        ...(data?.sessions ?? []).map((s) => [
          s.classId,
          formatClassTitle(s.classId, s.classCode, s.className),
        ]),
      ] as Array<[string, string]>,
    ).entries(),
  ].map(([id, label]) => ({ id, label }));

  const matchesClass = (id: string) => classFilter === 'ALL' || id === classFilter;
  const filteredSessions = (data?.sessions ?? []).filter((s) => matchesClass(s.classId));
  const filteredAssignments = (data?.data ?? []).filter((d) => matchesClass(d.assignment.classId));
  const activeAssignments = filteredAssignments.filter((d) => d.valid);
  const outdatedAssignments = filteredAssignments.filter((d) => !d.valid);
  const current =
    filteredAssignments.find((x) => x.assignment.id === selected) ??
    activeAssignments[0] ??
    filteredAssignments[0];

  const reload = useCallback(async () => {
    try {
      setData(await apiFetch<Dashboard>(base + query));
      setError('');
    } catch {
      setData(undefined);
      setError('Không tải được phạm vi thanh tra. Kiểm tra phiên đăng nhập và quyền được cấp.');
    }
  }, [query]);

  useEffect(() => {
    let live = true;
    void apiFetch<Dashboard>(base + query)
      .then((v) => {
        if (live) {
          setData(v);
          setError('');
        }
      })
      .catch(() => {
        if (live)
          setError('Không tải được phạm vi thanh tra. Kiểm tra phiên đăng nhập và quyền được cấp.');
      });
    return () => {
      live = false;
    };
  }, [query]);

  async function more(targetKind: 'Assignment' | 'Session') {
    if (!data) return;
    const cursor = targetKind === 'Assignment' ? data.nextAssignmentCursor : data.nextSessionCursor;
    if (!cursor) return;
    try {
      const n = await apiFetch<Dashboard>(
        base +
          query +
          '&' +
          (targetKind === 'Assignment' ? 'assignmentCursor' : 'sessionCursor') +
          '=' +
          cursor,
      );
      setData((old) => {
        if (!old) return n;
        const join = <T extends { id: string }>(a: T[], b: T[]) => [
          ...new Map([...a, ...b].map((x) => [x.id, x])).values(),
        ];
        return targetKind === 'Session'
          ? {
              ...old,
              sessions: join(old.sessions, n.sessions),
              nextSessionCursor: n.nextSessionCursor,
            }
          : {
              ...old,
              data: [
                ...new Map([...old.data, ...n.data].map((x) => [x.assignment.id, x])).values(),
              ],
              nextAssignmentCursor: n.nextAssignmentCursor,
            };
      });
    } catch {
      setError('Không tải được trang tiếp theo. Quyền hoặc khoảng ngày có thể đã đổi.');
    }
  }

  async function send(action?: string, extra: Record<string, unknown> = {}, customReason?: string) {
    if (busy) return;
    const activeId = current?.assignment.id ?? selected;
    if (action && !activeId) return;

    const effectiveReason = (
      customReason ??
      (reason.trim().length >= 3 ? reason.trim() : action ? DEFAULT_ACTION_REASONS[action] ?? '' : '')
    ).trim();

    if (effectiveReason.length < 3) {
      setError('Vui lòng nhập lý do / ghi chú từ 3 ký tự trở lên trước khi thực hiện thao tác này.');
      return;
    }

    setBusy(true);
    setError('');
    setMessage('');
    const path = action ? base + '/assignments/' + activeId + '/commands' : base + '/assignments',
      body = {
        reason: effectiveReason,
        ...(action ? { action, version: current?.assignment.version } : { sessionId, inspectorId }),
        ...extra,
      },
      digest = path + JSON.stringify(body);
    if (!keys.current.has(digest)) keys.current.set(digest, crypto.randomUUID());
    try {
      const r = await apiFetch<{ id: string }>(path, {
        method: 'POST',
        body: JSON.stringify({ ...body, key: keys.current.get(digest) }),
      });
      await reload();
      setSelected(r.id);
      if (!customReason && reason.trim()) setReason('');
      setMessage('Đã ghi nhận thao tác thanh tra thành công.');
    } catch (e) {
      const apiMsg = e instanceof ApiError && e.message && !e.message.startsWith('HTTP ')
        ? e.message
        : e instanceof Error && /[\u00C0-\u1EF9]/.test(e.message)
          ? e.message
          : '';
      setError(
        apiMsg ||
          'Không thể thực hiện thao tác. Vui lòng kiểm tra lại trạng thái ca hoặc tải lại trang để đồng bộ phiên bản mới nhất.',
      );
    } finally {
      setBusy(false);
    }
  }

  const pendingAckCount = activeAssignments.filter((d) => d.assignment.state === 'ACTIVE').length;
  const reportedCount = activeAssignments.filter((d) => d.reports.length > 0).length;
  const totalApprovedSeconds = activeAssignments.reduce((sum, d) => sum + (d.approvedSeconds ?? 0), 0);

  const isCurrentlyObserving = Boolean(current?.segments.some((seg) => seg.stoppedAt === null));
  const hasCompletedSegment = Boolean(current?.segments.some((seg) => seg.stoppedAt !== null));
  const isAcked = Boolean(current && ['ACKNOWLEDGED', 'ACCEPTED'].includes(current.assignment.state));
  const hasClockIn = Boolean(current?.clocks.some((c) => c.kind === 'IN'));
  const hasClockOut = Boolean(current?.clocks.some((c) => c.kind === 'OUT'));
  const serverNowMs = current ? new Date(current.serverTime).getTime() : 0;
  const shiftStartMs = current ? new Date(current.assignment.startsAt).getTime() : 0;
  const shiftEndMs = current ? new Date(current.assignment.endsAt).getTime() : 0;
  const inShiftWindow = Boolean(
    current && serverNowMs >= shiftStartMs && serverNowMs < shiftEndMs,
  );
  const isBeforeShift = Boolean(current && serverNowMs < shiftStartMs);
  const isAfterShift = Boolean(current && serverNowMs >= shiftEndMs);

  return (
    <div className="section-shell min-w-0 space-y-5 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-[#e66f2b] sm:text-[26px]">
            {isInstructorOnly
              ? 'Giờ giảng & Đối chiếu thanh tra'
              : 'Ca thanh tra & giờ giảng dạy'}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {user?.role === 'ACADEMIC_MANAGER'
              ? 'Điều phối thanh tra viên theo từng buổi học đã duyệt và đối chiếu xác nhận giờ giảng.'
              : isInstructorOnly
                ? 'Theo dõi lịch thanh tra dự giờ các buổi dạy của bạn, đối chiếu giờ giảng đã chốt và gửi phản hồi nếu có sai lệch.'
                : 'Theo dõi lịch ca trực theo tuần, tiếp nhận ca, bấm giờ quan sát và gửi biên bản cho Học vụ.'}
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary px-3.5 py-2 text-xs"
          disabled={busy}
          onClick={() => void reload()}
        >
          Làm mới
        </button>
      </header>

      {/* Weekly KPI Summary */}
      <section aria-label="Tóm tắt ca trong tuần" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {isInstructorOnly ? 'Ca dự giờ trong tuần' : 'Ca hiệu lực trong tuần'}
          </p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900">{activeAssignments.length}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {outdatedAssignments.length > 0
              ? `${outdatedAssignments.length} ca cũ đã thay thế`
              : 'Không có ca thay thế trong tuần'}
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            {isInstructorOnly ? 'Chờ thanh tra xác nhận' : 'Chờ tiếp nhận ca'}
          </p>
          <p className="mt-1.5 text-2xl font-bold text-amber-950">{pendingAckCount}</p>
          <p className="mt-0.5 text-xs text-amber-800">
            {isInstructorOnly
              ? 'Ca chưa được thanh tra xác nhận dự giờ'
              : 'Cần xác nhận nhận ca hoặc báo bận'}
          </p>
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-4 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">
            Biên bản đã nộp
          </p>
          <p className="mt-1.5 text-2xl font-bold text-sky-950">
            {reportedCount}/{activeAssignments.length}
          </p>
          <p className="mt-0.5 text-xs text-sky-800">
            {isInstructorOnly
              ? 'Biên bản dự giờ đã gửi Học vụ'
              : 'Gửi phòng Học vụ đối chiếu giờ dạy'}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            Giờ Học vụ đã xác nhận
          </p>
          <p className="mt-1.5 text-2xl font-bold text-emerald-950">
            {totalApprovedSeconds > 0 ? formatDuration(totalApprovedSeconds) : 'Chưa có'}
          </p>
          <p className="mt-0.5 text-xs text-emerald-800">Tổng giờ đã chốt trong tuần đang xem</p>
        </div>
      </section>

      <div className="space-y-6">
        <div className="min-w-0 space-y-6">
          {error && (
            <p role="alert" className="state-error text-sm font-medium">
              {error}
            </p>
          )}
          {message && (
            <p
              role="status"
              className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm font-medium text-emerald-950"
            >
              {message}
            </p>
          )}

          {/* Weekly Calendar Grid */}
          <section aria-label="Lịch điều phối tuần" className="workspace-card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-bold text-slate-900">Lịch trong tuần</h2>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Lọc theo lớp"
                  className="max-w-xs rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                  value={classOptions.some((c) => c.id === classFilter) ? classFilter : 'ALL'}
                  onChange={(e) => setClassFilter(e.target.value)}
                >
                  <option value="ALL">
                    {classOptions.length ? `Tất cả lớp (${classOptions.length})` : 'Tất cả lớp'}
                  </option>
                  {classOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={button}
                  onClick={() => setFirstDay(moveDay(firstDay, -7))}
                >
                  ← Tuần trước
                </button>
                <input
                  aria-label="Từ ngày"
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                  type="date"
                  value={firstDay}
                  onChange={(e) => {
                    if (e.target.value) setFirstDay(e.target.value);
                  }}
                />
                <button
                  type="button"
                  className={button}
                  onClick={() => setFirstDay(moveDay(firstDay, 7))}
                >
                  Tuần sau →
                </button>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-7">
              {days.map((day) => (
                <section
                  key={day}
                  className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 p-2"
                >
                  <h3 className="text-xs font-bold text-slate-700">{dayHeading(day)}</h3>
                  {filteredSessions
                    .filter((s) => duringDay(s.startsAt, s.endsAt, day))
                    .map((s) => (
                      <button
                        className={`my-1.5 block w-full break-words rounded border p-2 text-left text-[11px] transition ${
                          sessionId === s.id
                            ? 'border-[#e66f2b] bg-orange-50/60 ring-2 ring-[#e66f2b]/25'
                            : 'border-slate-200 bg-white hover:border-[#76a35e]'
                        }`}
                        key={s.id}
                        aria-pressed={sessionId === s.id}
                        onClick={() => setSessionId(s.id)}
                      >
                        <strong className="text-[#2f5d1e]">{shortTime(s.startsAt)} · Buổi học</strong>
                        <p className="mt-0.5 line-clamp-2 text-slate-600">
                          {formatClassTitle(s.classId, s.classCode, s.className)}
                        </p>
                      </button>
                    ))}
                  {activeAssignments
                    .filter((d) => duringDay(d.assignment.startsAt, d.assignment.endsAt, day))
                    .map((d) => (
                      <button
                        className={`my-1.5 block w-full overflow-hidden rounded border p-2 text-left text-[11px] leading-snug transition ${
                          current?.assignment.id === d.assignment.id
                            ? 'border-[#76a35e] bg-[#e9f2e4] text-slate-900'
                            : 'border-[#76a35e]/40 bg-white text-slate-800 hover:bg-[#f4f9f1]'
                        }`}
                        key={d.assignment.id}
                        onClick={() => setSelected(d.assignment.id)}
                      >
                        <strong className="block text-[#2f5d1e]">
                          {shortTime(d.assignment.startsAt)} – {shortTime(d.assignment.endsAt)}
                        </strong>
                        <p className="mt-0.5 line-clamp-2 font-medium text-slate-800">
                          {d.classCode ? classCodeLabel(d.classCode) : formatClassTitle(d.assignment.classId)}
                          {d.className ? ` · ${learnerClassLabel(d.className, d.classCode ?? '')}` : ''}
                        </p>
                        <span className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                          {ASSIGNMENT_STATE_LABELS[d.assignment.state] ?? d.assignment.state}
                        </span>
                        {inspectorId === d.assignment.inspectorId && (
                          <p className="mt-0.5 text-[10px] text-amber-700">Thanh tra viên đã có ca</p>
                        )}
                      </button>
                    ))}
                </section>
              ))}
            </div>

            {data && !filteredSessions.length && !activeAssignments.length && (
              <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
                Tuần này chưa có buổi học hoặc ca thanh tra nào phù hợp bộ lọc. Dùng nút Tuần trước / Tuần sau để xem lịch khác.
              </p>
            )}
            {data?.nextSessionCursor && (
              <button className={button} onClick={() => void more('Session')}>
                Tải thêm buổi
              </button>
            )}
            {data?.nextAssignmentCursor && (
              <button className={button} onClick={() => void more('Assignment')}>
                Tải thêm ca
              </button>
            )}
          </section>

          {/* Operator Dispatch Box — Only shown when user can dispatch upcoming approved sessions */}
          {!!data?.sessions.length && (
            <section className="workspace-card space-y-3 border-l-4 border-l-indigo-600">
              <fieldset className="space-y-3">
                <legend className="text-base font-bold text-slate-900">
                  Điều phối thanh tra cho buổi học đã duyệt
                </legend>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Buổi chính thức
                    <select
                      className={input}
                      value={sessionId}
                      onChange={(e) => setSessionId(e.target.value)}
                    >
                      <option value="">Chọn buổi học</option>
                      {data.sessions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {when(s.startsAt)} · {formatClassTitle(s.classId, s.classCode, s.className)} · Đợt #{s.revision}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    Thanh tra viên phụ trách
                    <select
                      className={input}
                      value={inspectorId}
                      onChange={(e) => setInspectorId(e.target.value)}
                    >
                      <option value="">Chọn thanh tra viên</option>
                      {data.inspectors.map((i) => (
                        <option key={i.id} value={i.id}>
                          {accountLabel(i.fullName)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block text-xs font-semibold text-slate-700">
                  Lý do / yêu cầu điều phối (tối thiểu 3 ký tự)
                  <input
                    className={input}
                    type="text"
                    placeholder="VD: Phân công thanh tra dự giờ buổi 1 lớp tối..."
                    value={reason}
                    maxLength={1000}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <button
                  className="btn-primary text-xs"
                  disabled={busy || !sessionId || !inspectorId || reason.trim().length < 3}
                  onClick={() => void send()}
                >
                  Phân công ca thanh tra
                </button>
              </fieldset>
            </section>
          )}

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            {/* Left column: Assignment Table */}
            <section id="assignments" className="workspace-card space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Danh sách ca ({activeAssignments.length})
                </h2>
                <span className="text-xs text-slate-500">
                  {isInstructorOnly || isInspectorRole
                    ? 'Bấm một dòng để xem chi tiết & thao tác'
                    : 'Bấm một dòng để xem / đối chiếu giờ'}
                </span>
              </div>

              {activeAssignments.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Hiện chưa có ca thanh tra hiệu lực nào phù hợp bộ lọc trong tuần này.
                </p>
              ) : (
                <div className="data-table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Lớp &amp; Thời gian</th>
                        <th>Trạng thái</th>
                        <th>Quan sát / Duyệt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeAssignments.map((d) => {
                        const isSelected = current?.assignment.id === d.assignment.id;
                        return (
                          <tr
                            key={d.assignment.id}
                            onClick={() => setSelected(d.assignment.id)}
                            className={`cursor-pointer transition ${
                              isSelected ? 'bg-[#f4f9f1]' : 'hover:bg-slate-50/80'
                            }`}
                          >
                            <td className="px-4 py-2.5">
                              <button
                                type="button"
                                onClick={() => setSelected(d.assignment.id)}
                                aria-pressed={isSelected}
                                className="text-left font-semibold text-slate-900 hover:text-[#2f5d1e]"
                              >
                                {formatClassTitle(d.assignment.classId, d.classCode, d.className)}
                              </button>
                              <p className="text-xs text-slate-500">
                                {when(d.assignment.startsAt)} – {shortTime(d.assignment.endsAt)}
                              </p>
                            </td>
                            <td className="whitespace-nowrap px-4 py-2.5">
                              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                                {ASSIGNMENT_STATE_LABELS[d.assignment.state] ?? d.assignment.state}
                              </span>
                              <p className="mt-0.5 text-[11px] text-slate-500">
                                {HOURS_STATE_LABELS[d.hoursState] ?? d.hoursState}
                              </p>
                            </td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-700">
                              {formatDuration(d.observedSeconds, 'Chưa quan sát')} /{' '}
                              {formatDuration(d.approvedSeconds, 'Chờ duyệt')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {outdatedAssignments.length > 0 && (
                <details className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs">
                  <summary className="cursor-pointer font-semibold text-slate-600">
                    Ca phiên bản cũ đã thay thế ({outdatedAssignments.length})
                  </summary>
                  <div className="mt-2.5 space-y-2">
                    {outdatedAssignments.map((d, idx) => (
                      <button
                        key={d.assignment.id}
                        className="w-full break-words rounded-lg border border-slate-200 bg-white p-2.5 text-left text-xs text-slate-600 hover:border-slate-400"
                        onClick={() => setSelected(d.assignment.id)}
                        aria-pressed={current?.assignment.id === d.assignment.id}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <strong className="text-slate-800">
                            Lần điều phối #{idx + 1} · {formatClassTitle(d.assignment.classId, d.classCode, d.className)}
                          </strong>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                            {ASSIGNMENT_STATE_LABELS[d.assignment.state] ?? d.assignment.state}
                          </span>
                        </div>
                        <p className="mt-0.5">
                          {when(d.assignment.startsAt)} – {shortTime(d.assignment.endsAt)}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {cleanInspectionNote(d.assignment.reason)}
                        </p>
                      </button>
                    ))}
                  </div>
                </details>
              )}
            </section>

            {/* Right column: Selected Shift Detail & Contextual Workflow */}
            {current && (
              <article className="workspace-card space-y-4" aria-label="Chi tiết ca">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      {formatClassTitle(current.assignment.classId, current.classCode, current.className)}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {when(current.assignment.startsAt)} → {shortTime(current.assignment.endsAt)} ·{' '}
                      <span className="font-semibold text-slate-800">
                        {ASSIGNMENT_STATE_LABELS[current.assignment.state] ?? current.assignment.state}
                      </span>
                    </p>
                  </div>
                  {current.meetUrl && (
                    <a
                      className="btn-primary px-3 py-1.5 text-xs"
                      href={current.meetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Vào Google Meet
                    </a>
                  )}
                </div>

                {!current.valid && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                    Ca thanh tra thuộc phiên bản lịch cũ — chỉ dùng để tham khảo đối chiếu, không thể gửi thêm thao tác mới.
                  </p>
                )}

                {!isInstructorOnly && (
                  <p className="text-xs text-slate-500">
                    Lượt cập nhật #{current.assignment.version} · Giờ máy chủ: {when(current.serverTime)}
                  </p>
                )}

                <section id="hours" className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                      <dt className="text-[11px] font-medium text-slate-500">Theo lịch</dt>
                      <dd className="mt-0.5 text-sm font-bold text-slate-900">
                        {formatDuration(current.scheduledSeconds)}
                      </dd>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                      <dt className="text-[11px] font-medium text-slate-500">Thanh tra quan sát</dt>
                      <dd className="mt-0.5 text-sm font-bold text-slate-900">
                        {formatDuration(current.observedSeconds, 'Chưa ghi nhận')}
                      </dd>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                      <dt className="text-[11px] font-medium text-slate-500">Học vụ xác nhận</dt>
                      <dd className="mt-0.5 text-sm font-bold text-[#2f5d1e]">
                        {current.approvedSeconds !== null
                          ? formatDuration(current.approvedSeconds)
                          : 'Chờ đối chiếu'}
                      </dd>
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        {HOURS_STATE_LABELS[current.hoursState] ?? current.hoursState}
                      </span>
                    </div>
                  </div>

                  {!isInstructorOnly && (
                    <p className="text-xs text-slate-500">
                      Biên bản do thanh tra lập cần được Học vụ đối chiếu độc lập trước khi chốt giờ dạy.
                    </p>
                  )}

                  {/* Contextual Reason Box + Step-by-step Inspector Actions */}
                  {(current.rights.inspector || current.rights.hours || current.rights.shift || current.rights.assign) &&
                    current.valid && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
                        <label className="block text-xs font-semibold text-slate-700">
                          Ghi chú / Lý do thao tác (bắt buộc nếu từ chối ca, duyệt giờ hoặc điều chỉnh)
                          <textarea
                            className={`${input} mt-1 bg-white`}
                            rows={2}
                            placeholder={
                              isInspectorRole
                                ? 'Tùy chọn cho Tiếp nhận / Vào-Ra ca / Bắt đầu quan sát; bắt buộc nhập nếu Báo bận hoặc Đề xuất điều chỉnh...'
                                : 'Nhập ghi chú quyết định / lý do (tối thiểu 3 ký tự)...'
                            }
                            value={reason}
                            maxLength={1000}
                            onChange={(e) => setReason(e.target.value)}
                          />
                        </label>
                      </div>
                    )}

                  {current.rights.inspector && (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 text-xs text-slate-700 space-y-1">
                        <p className="font-semibold text-indigo-950">
                          Quy trình 4 bước: 1. Tiếp nhận ca → 2. Vào ca &amp; Bắt đầu quan sát → 3. Dừng quan sát &amp; Ra ca → 4. Gửi biên bản
                        </p>
                        {current.valid && isBeforeShift && (
                          <p className="text-indigo-800">
                            Ca chưa tới giờ diễn ra ({when(current.assignment.startsAt)}). Bạn có thể <strong>Tiếp nhận ca</strong> trước; các nút <em>Bắt đầu quan sát</em> và <em>Ghi nhận vào/ra ca</em> sẽ mở đúng khung giờ trực.
                          </p>
                        )}
                        {current.valid && isAfterShift && (
                          <p className="text-amber-800">
                            Ca đã qua khung giờ kết thúc ({shortTime(current.assignment.endsAt)}). Nếu cần bổ sung giờ vào/ra ca bị thiếu, hãy dùng mục <strong>Đề xuất điều chỉnh chấm công</strong> bên dưới.
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={
                            current.assignment.state === 'ACTIVE' && current.valid
                              ? 'btn-primary px-3.5 py-2 text-xs'
                              : button
                          }
                          disabled={busy || !current.valid || isAcked}
                          onClick={() => void send('ACK')}
                        >
                          {isAcked ? 'Đã tiếp nhận ca' : 'Tiếp nhận ca'}
                        </button>
                        <button
                          type="button"
                          className={button}
                          disabled={busy || !current.valid || reason.trim().length < 3}
                          title="Nhập lý do vào ô ghi chú ở trên trước khi báo bận"
                          onClick={() => void send('DECLINE')}
                        >
                          Báo không thể nhận
                        </button>
                        <button
                          type="button"
                          className={button}
                          disabled={busy || !current.valid || !inShiftWindow || isCurrentlyObserving}
                          title={
                            !inShiftWindow
                              ? 'Chỉ mở khi đang trong khung giờ diễn ra ca học'
                              : undefined
                          }
                          onClick={() => void send('START')}
                        >
                          {isCurrentlyObserving ? 'Đang quan sát…' : 'Bắt đầu quan sát'}
                        </button>
                        <button
                          type="button"
                          className={
                            isCurrentlyObserving ? 'btn-primary px-3.5 py-2 text-xs' : button
                          }
                          disabled={busy || !isCurrentlyObserving}
                          onClick={() => void send('STOP')}
                        >
                          Dừng quan sát
                        </button>
                      </div>

                      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5">
                        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                          Biên bản quan sát buổi học
                        </h3>
                        {current.valid && (!hasCompletedSegment || isCurrentlyObserving) && (
                          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                            {isCurrentlyObserving
                              ? 'Đang mở lượt quan sát — hãy bấm Dừng quan sát trước khi gửi biên bản.'
                              : 'Cần có ít nhất 1 lượt Bắt đầu & Dừng quan sát hoàn tất trong khung giờ ca trước khi gửi biên bản.'}
                          </p>
                        )}
                        <label className="block text-xs font-semibold text-slate-700">
                          Tình trạng giảng viên
                          <select
                            className={input}
                            disabled={!current.valid}
                            value={presence}
                            onChange={(e) => setPresence(e.target.value)}
                          >
                            {['PRESENT', 'LATE', 'ABSENT', 'INACCESSIBLE'].map((s) => (
                              <option key={s} value={s}>
                                {PRESENCE_LABELS[s] ?? s}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-xs font-semibold text-slate-700">
                          Điều kiện / nội dung quan sát
                          <textarea
                            className={input}
                            disabled={!current.valid}
                            placeholder="Ghi nhận hiện diện giảng viên, sĩ số lớp, chất lượng âm thanh/đường truyền..."
                            value={conditions}
                            onChange={(e) => setConditions(e.target.value)}
                            maxLength={2000}
                          />
                        </label>
                        <button
                          type="button"
                          className="btn-primary text-xs"
                          disabled={
                            busy ||
                            !current.valid ||
                            !hasCompletedSegment ||
                            isCurrentlyObserving ||
                            conditions.trim().length < 3
                          }
                          onClick={() => setConfirmReportOpen(true)}
                        >
                          Gửi biên bản quan sát
                        </button>
                      </div>

                      <ConfirmDialog
                        open={confirmReportOpen}
                        title="Gửi biên bản quan sát?"
                        description="Biên bản quan sát sẽ được gửi đến phòng Học vụ để đối chiếu và xác nhận giờ giảng dạy của giảng viên."
                        confirmLabel="Xác nhận gửi biên bản"
                        cancelLabel="Ở lại"
                        busy={busy}
                        onCancel={() => setConfirmReportOpen(false)}
                        onConfirm={() => {
                          setConfirmReportOpen(false);
                          const reportReason =
                            reason.trim().length >= 3
                              ? reason.trim()
                              : 'Thanh tra gửi biên bản quan sát ca dạy';
                          void send('REPORT', { presence, conditions }, reportReason);
                        }}
                      >
                        <div className="space-y-1 text-xs">
                          <p>
                            Tình trạng giảng viên:{' '}
                            <strong>{PRESENCE_LABELS[presence] ?? presence}</strong>
                          </p>
                          <p>Nội dung quan sát: {conditions}</p>
                        </div>
                      </ConfirmDialog>
                    </div>
                  )}

                  {current.segments.length > 0 && (
                    <div className="space-y-1 text-xs text-slate-600">
                      <p className="font-semibold text-slate-700">Các lượt bấm giờ quan sát:</p>
                      <ul className="space-y-1">
                        {current.segments.map((s) => (
                          <li key={s.id}>
                            {whenWithSeconds(s.startedAt)} →{' '}
                            {s.stoppedAt ? whenWithSeconds(s.stoppedAt) : 'Đang quan sát'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {current.reports.map((r) => (
                    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs" key={r.id}>
                      <strong className="text-slate-900">
                        Biên bản lần #{r.number} · {PRESENCE_LABELS[r.presence] ?? r.presence}
                      </strong>
                      <p className="mt-1 break-words text-slate-700">
                        {cleanInspectionNote(r.conditions)}
                      </p>
                      <p className="mt-0.5 text-slate-500">
                        Ghi chú: {cleanInspectionNote(r.reason)}
                      </p>
                    </div>
                  ))}

                  {current.rights.hours && current.valid && (
                    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <label className="block text-xs font-semibold text-slate-700">
                        Số phút đề nghị Học vụ xác nhận
                        <input
                          className={`${input} mt-1 bg-white`}
                          type="number"
                          min="0"
                          step="1"
                          placeholder="Ví dụ: 90 hoặc 120 phút"
                          value={approved === '' ? '' : String(Math.round(Number(approved) / 60))}
                          onChange={(e) =>
                            setApproved(
                              e.target.value === ''
                                ? ''
                                : String(Math.max(0, Math.round(Number(e.target.value) * 60))),
                            )
                          }
                        />
                      </label>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
                        <span>Chọn nhanh:</span>
                        {[60, 90, 120].map((mins) => (
                          <button
                            key={mins}
                            type="button"
                            onClick={() => setApproved(String(mins * 60))}
                            className="rounded border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-100"
                          >
                            {mins} phút
                          </button>
                        ))}
                        {approved !== '' && (
                          <span className="ml-1 font-medium text-slate-500">
                            (= {(Number(approved) / 3600).toFixed(2)} giờ · {approved} giây)
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {['APPROVE', 'PARTIAL', 'REJECT'].map((d, i) => (
                          <button
                            className={button}
                            key={d}
                            disabled={
                              busy || reason.trim().length < 3 || (d !== 'REJECT' && approved === '')
                            }
                            onClick={() =>
                              void send('REVIEW', {
                                disposition: d,
                                ...(d === 'REJECT' ? {} : { approvedSeconds: Number(approved) }),
                              })
                            }
                          >
                            {['Xác nhận đủ giờ', 'Xác nhận một phần', 'Từ chối xác nhận'][i]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {current.rights.teacher && (
                    <details className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                        Khiếu nại sai lệch giờ giảng (nếu có)
                      </summary>
                      <div className="mt-2.5 space-y-2">
                        <textarea
                          className={input}
                          rows={2}
                          maxLength={1000}
                          placeholder="Nhập nội dung khiếu nại (tối thiểu 3 ký tự)..."
                          value={disputeReason}
                          onChange={(e) => setDisputeReason(e.target.value)}
                        />
                        <button
                          className={button}
                          disabled={
                            busy || (disputeReason.trim().length < 3 && reason.trim().length < 3)
                          }
                          onClick={() =>
                            void send('DISPUTE', {}, disputeReason.trim() || reason.trim())
                          }
                        >
                          Gửi khiếu nại
                        </button>
                      </div>
                    </details>
                  )}

                  {current.decisions.map((d) => (
                    <p key={d.id} className="text-xs text-slate-700">
                      <strong className="text-slate-900">Quyết định đối chiếu #{d.number}:</strong>{' '}
                      {HOURS_STATE_LABELS[d.disposition] ?? d.disposition} ·{' '}
                      {formatDuration(d.approvedSeconds)} · {cleanInspectionNote(d.reason)}
                    </p>
                  ))}

                  {current.disputes.map((d) => (
                    <p key={d.id} className="text-xs text-amber-800">
                      Khiếu nại của giảng viên: {cleanInspectionNote(d.reason)}
                    </p>
                  ))}
                </section>

                {(current.rights.inspector || current.rights.shift) && (
                  <section id="shift" className="space-y-3 border-t border-slate-200 pt-4">
                    <h3 className="text-sm font-bold text-slate-900">Chấm công ca thanh tra</h3>
                    <p className="text-xs text-slate-600">
                      Sự kiện vào/ra ca giúp ghi nhận mốc thực tế. Nếu thiếu hoặc sai giờ ra ca,
                      thanh tra gửi đề xuất điều chỉnh để phòng Học vụ xét duyệt độc lập.
                    </p>

                    {current.rights.inspector && (
                      <>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={button}
                            disabled={busy || !current.valid || !inShiftWindow || hasClockIn}
                            onClick={() => void send('IN')}
                          >
                            {hasClockIn ? 'Đã vào ca' : 'Ghi nhận vào ca'}
                          </button>
                          <button
                            type="button"
                            className={button}
                            disabled={
                              busy || !current.valid || !inShiftWindow || !hasClockIn || hasClockOut
                            }
                            onClick={() => void send('OUT')}
                          >
                            {hasClockOut ? 'Đã ra ca' : 'Ghi nhận ra ca'}
                          </button>
                        </div>

                        <details className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                          <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                            Đề xuất điều chỉnh chấm công (nếu thiếu / sai giờ ra ca)
                          </summary>
                          <div className="mt-3 space-y-2.5">
                            <label className="block text-xs font-semibold text-slate-700">
                              Loại sự cố / điều chỉnh
                              <select
                                className={`${input} mt-1 bg-white`}
                                disabled={!current.valid}
                                value={kind}
                                onChange={(e) => setKind(e.target.value)}
                              >
                                {[
                                  'MISSING_CHECKOUT',
                                  'LATE',
                                  'EARLY',
                                  'CANCELLED',
                                  'WRONG_DEVICE',
                                ].map((k) => (
                                  <option key={k} value={k}>
                                    {CORRECTION_KIND_LABELS[k] ?? k}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="block text-xs font-semibold text-slate-700">
                              Thời gian ra ca đề xuất
                              <input
                                className={`${input} mt-1 bg-white`}
                                disabled={!current.valid}
                                type="datetime-local"
                                step="1"
                                value={outLocal}
                                onChange={(e) => setOutLocal(e.target.value)}
                              />
                            </label>
                            <label className="block text-xs font-semibold text-slate-700">
                              Mô tả / minh chứng đối chiếu
                              <textarea
                                className={`${input} mt-1 bg-white`}
                                disabled={!current.valid}
                                placeholder="Mô tả nguyên nhân và thời điểm thực tế rời lớp trực tuyến..."
                                value={evidence}
                                onChange={(e) => setEvidence(e.target.value)}
                                maxLength={2000}
                              />
                            </label>
                            <button
                              type="button"
                              className="btn-secondary text-xs"
                              disabled={busy || !current.valid || evidence.trim().length < 3}
                              onClick={() => {
                                const corrReason =
                                  reason.trim().length >= 3
                                    ? reason.trim()
                                    : `Đề xuất điều chỉnh chấm công (${CORRECTION_KIND_LABELS[kind] ?? kind})`;
                                void send(
                                  'CORRECTION',
                                  {
                                    kind,
                                    evidence,
                                    ...(outLocal
                                      ? { proposedOutAt: new Date(outLocal + '+07:00').toISOString() }
                                      : {}),
                                  },
                                  corrReason,
                                );
                              }}
                            >
                              Gửi đề xuất điều chỉnh chấm công
                            </button>
                          </div>
                        </details>
                      </>
                    )}

                    <p className="text-xs text-slate-700">
                      Thời lượng ca thực tế:{' '}
                      <strong>
                        {formatDuration(current.personnel?.actualSeconds ?? null, 'Chưa ghi nhận')}
                      </strong>{' '}
                      · Học vụ phê duyệt:{' '}
                      <strong>
                        {formatDuration(current.personnel?.approvedSeconds ?? null, 'Chờ xét duyệt')}
                      </strong>
                    </p>

                    {current.personnel?.correctedOutAt && (
                      <p className="text-xs text-emerald-800">
                        Thời gian ra ca đã duyệt: {when(current.personnel.correctedOutAt)} · Lần điều chỉnh #{current.personnel.revision}
                      </p>
                    )}

                    {current.clocks.length > 0 && (
                      <ul className="space-y-1 text-xs text-slate-600">
                        {current.clocks.map((c) => (
                          <li key={c.id}>
                            <span className="font-semibold text-slate-800">
                              {CLOCK_KIND_LABELS[c.kind] ?? c.kind}
                            </span>{' '}
                            · {whenWithSeconds(c.createdAt)}
                          </li>
                        ))}
                      </ul>
                    )}

                    {current.corrections.map((c) => (
                      <div key={c.id} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs">
                        <p className="font-semibold text-slate-900">
                          Đề xuất điều chỉnh #{c.revision} · {CORRECTION_KIND_LABELS[c.kind] ?? c.kind}
                        </p>
                        <p className="mt-0.5 text-slate-600">{cleanInspectionNote(c.reason)}</p>
                        {c.proposedOutAt && (
                          <p className="mt-0.5 text-slate-600">
                            Thời gian ra ca đề xuất: {when(c.proposedOutAt)}
                          </p>
                        )}
                        <p className="mt-0.5 text-slate-700">Minh chứng: {cleanInspectionNote(c.evidence)}</p>
                        <p className="mt-1 font-medium text-slate-800">
                          {c.decision
                            ? `${CORRECTION_DECISION_LABELS[c.decision.disposition] ?? c.decision.disposition} · ${cleanInspectionNote(c.decision.reason)}`
                            : 'Đang chờ phòng Học vụ phê duyệt'}
                        </p>
                        {current.rights.shift && !c.decision && (
                          <div className="mt-2 flex gap-2">
                            {['ACCEPT', 'REJECT'].map((d) => (
                              <button
                                className={button}
                                key={d}
                                disabled={busy || reason.trim().length < 3}
                                onClick={() =>
                                  void send('CORRECTION_REVIEW', {
                                    correctionId: c.id,
                                    disposition: d,
                                  })
                                }
                              >
                                {d === 'ACCEPT' ? 'Chấp nhận điều chỉnh' : 'Từ chối điều chỉnh'}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </section>
                )}

                {current.rights.assign && (
                  <button
                    className={button}
                    disabled={busy || !inspectorId || reason.trim().length < 3}
                    onClick={() => void send('REASSIGN', { inspectorId })}
                  >
                    Phân công lại cho thanh tra viên đã chọn
                  </button>
                )}
              </article>
            )}
          </div>

          {data && data.notifications?.length > 0 && (
            <details
              id="notifications"
              open={notificationsOpen}
              onToggle={(e) => setNotificationsOpen(e.currentTarget.open)}
              className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-sm"
            >
              <summary className="cursor-pointer font-semibold text-slate-700">
                Lịch sử thông báo thay đổi ({data.notifications.length})
              </summary>
              <div className="mt-2.5 space-y-1.5 text-xs">
                {data.notifications.map((n) => (
                  <p key={n.id} className="text-slate-700">
                    <span className="text-slate-500">{when(n.createdAt)}</span> ·{' '}
                    <strong className="text-slate-900">
                      {NOTIFICATION_KIND_LABELS[n.kind] ?? n.kind}
                    </strong>
                  </p>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
