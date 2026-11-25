import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { RefreshCw, ShieldCheck, UserCheck, Video } from 'lucide-react';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError, apiFetch } from '@/lib/api-client';
import { accountLabel } from '@/features/catalog/record-presentation';
import { SourceRecord } from '@/features/catalog/SourceRecord';
import { consultationBookingLabel, consultationReviewLabel } from '@/features/presentation/labels';
import { ManualMeetField } from '@/features/meet/ManualMeetField';
import { isManualMeetUrl, MANUAL_MEET_ERROR } from '@/features/meet/manual-meet';
import { StudentConsultationsPage } from '@/features/learner/StudentConsultationsPage';

const TZ = 'Asia/Ho_Chi_Minh';
const fmt = new Intl.DateTimeFormat('vi-VN', {
  timeZone: TZ,
  dateStyle: 'short',
  timeStyle: 'short',
});
const dayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const time = (s: string) => fmt.format(new Date(s));

const WEEKDAY_LABELS = [
  'Chủ nhật',
  'Thứ hai',
  'Thứ ba',
  'Thứ tư',
  'Thứ năm',
  'Thứ sáu',
  'Thứ bảy',
];

function formatMinute(m?: number | null) {
  if (typeof m !== 'number') return '--:--';
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function vnDayKey(iso: string) {
  return dayFmt.format(new Date(iso));
}

export type ConsultationBooking = {
  actions?: {
    submit: boolean; cancel: boolean; reschedule: boolean; requestCancel: boolean;
    requestReschedule: boolean; reportAbsence: boolean; disputableReportIds: string[];
  };
  id: string;
  teacherId: string;
  learnerId?: string;
  learnerName?: string | null;
  learnerEmail?: string | null;
  startsAt: string;
  endsAt: string;
  state: string;
  expiresAt: string | null;
  topic: string | null;
  displayName: string;
  profileNumber: number;
  version: number;
  linkRevision?: number | null;
  joinUrl: string | null;
  linkBlockReason?: string | null;
  changes?: { id: string; kind: string; state: string; reason?: string }[] | null;
  reports?:
    | {
        id: string;
        kind?: string;
        evidence?: string;
        makerId?: string;
        summary?: string;
        outcome?: string;
        createdAt?: string;
      }[]
    | null;
};

type Profile = {
  id: string;
  teacherId: string;
  revisionId?: string;
  number?: number;
  version?: number;
  displayName: string;
  headline?: string;
  bio?: string;
  specialties?: string;
  state?: string;
  enabled?: boolean;
  canReview?: boolean;
  reviewReason?: string | null;
};

type Availability = {
  id: string;
  teacherId?: string;
  kind?: string;
  weekday?: number | null;
  startMinute?: number | null;
  endMinute?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  bookingMode?: string;
  state?: string;
  version?: number;
  active?: boolean;
};

type Workspace = {
  profiles: Profile[];
  availability: Availability[];
  links: {
    id: string;
    bookingId: string;
    url: string | null;
    state: string;
    canReview: boolean;
    linkClear: boolean;
    reviewReason?: string | null;
    startsAt?: string | null;
    teacherName?: string | null;
    learnerName?: string | null;
  }[];
  changes: {
    id: string;
    bookingId?: string;
    kind: string;
    reason: string;
    startsAt?: string;
    proposedStartsAt?: string | null;
    proposedEndsAt?: string | null;
    state?: string;
    canReview?: boolean;
    reviewReason?: string | null;
  }[];
};

type Command = { key: string; op: string; [key: string]: unknown };

const status: Record<string, string> = {
  HOLD: 'Giữ chỗ 5 phút',
  PENDING_GV: 'Chờ giảng viên (tối đa 12 giờ)',
  REQUESTED: 'Chờ giảng viên xác nhận',
  CONFIRMED: 'Đã xác nhận',
  COMPLETED: 'Đã hoàn thành',
  EXPIRED: 'Đã hết hạn',
  REJECTED: 'Đã từ chối',
  CANCELLED: 'Đã hủy',
  SUPERSEDED: 'Đã đổi sang hẹn mới',
  APPROVED: 'Đã duyệt',
  DRAFT: 'Bản nháp',
  PENDING: 'Chờ duyệt',
};

const noticeLabels: Record<string, string> = {
  REVIEW_PROFILE_V1: 'Hồ sơ chờ duyệt độc lập',
  REVIEW_LINK_V1: 'Link tư vấn chờ duyệt độc lập',
  REVIEW_CHANGE_V1: 'Thay đổi lịch chờ duyệt',
  LINK_COLLISION_V1: 'Link tư vấn đã bị chặn',
  PROFILE_SAVE: 'Đã lưu nháp hồ sơ',
  PROFILE_APPROVE: 'Hồ sơ được duyệt',
  PROFILE_REJECT: 'Hồ sơ bị từ chối',
  LINK_PROPOSE: 'Đã gửi link để duyệt',
  LINK_APPROVE: 'Link được duyệt',
  LINK_REJECT: 'Link bị từ chối',
  HOLD: 'Đã giữ chỗ tạm',
  SUBMIT: 'Đã gửi yêu cầu tư vấn',
  CONFIRM: 'Giảng viên xác nhận lịch',
  REJECT: 'Giảng viên từ chối lịch',
  CANCEL: 'Lịch hẹn đã hủy',
  RESCHEDULE: 'Đã đề nghị giờ hẹn mới',
  EXPIRED: 'Giữ chỗ/yêu cầu đã hết hạn',
  CHANGE_REQUEST: 'Đã gửi đề nghị thay đổi',
  CHANGE_APPROVE: 'Thay đổi đã được duyệt',
  CHANGE_REJECT: 'Thay đổi bị từ chối',
  NO_SHOW: 'Đã ghi nhận báo cáo vắng',
  DISPUTE: 'Đã ghi nhận phản hồi tranh chấp',
};

export function ConsultationDay({
  day,
  bookings,
}: {
  day: string;
  bookings: ConsultationBooking[];
}) {
  const rows = bookings.filter(
    (b) =>
      !['EXPIRED', 'REJECTED', 'CANCELLED', 'SUPERSEDED'].includes(b.state) &&
      vnDayKey(b.startsAt) === day,
  );
  if (!rows.length) return null;
  return (
    <div className="mt-2 space-y-1">
      {rows.map((b) => (
        <Link
          key={b.id}
          to="/consultations"
          className="block break-words rounded-lg border border-teal-200 bg-teal-50/90 p-1.5 text-xs text-teal-950 transition hover:border-teal-400"
        >
          <strong>Tư vấn 1:1 · {status[b.state] ?? consultationBookingLabel(b.state)}</strong> ·{' '}
          {time(b.startsAt)}
        </Link>
      ))}
    </div>
  );
}

export function ConsultationReview({
  kind,
  version,
  id,
  approve,
  reject,
  busy,
  send,
}: {
  kind: string;
  version?: number;
  id: string;
  approve: string;
  reject: string;
  busy: boolean;
  send: (op: string, data: Record<string, unknown>) => void | Promise<void>;
}) {
  const [reviewReason, setReviewReason] = useState('');
  const clean = reviewReason.trim();
  const ready = !busy && clean.length >= 10;
  return (
    <fieldset
      className="mt-3 space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/80 p-3"
      aria-label={'Duyệt ' + kind + (version ? ' v' + version : '')}
    >
      <legend className="text-xs font-semibold text-slate-700">
        Quyết định độc lập cho {kind}
        {version ? ' v' + version : ''}
      </legend>
      <label htmlFor={'reason-' + id} className="block text-xs font-semibold text-slate-700">
        Lý do duyệt hoặc từ chối {kind}
      </label>
      <textarea
        id={'reason-' + id}
        className="input-field py-2 text-sm"
        minLength={10}
        maxLength={1000}
        value={reviewReason}
        onChange={(e) => setReviewReason(e.target.value)}
        placeholder="Nêu căn cứ quyết định, tối thiểu 10 ký tự"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!ready}
          className="btn-primary px-3 py-1.5 text-xs"
          onClick={() => void send(approve, { id, reason: clean })}
        >
          Phê duyệt {kind}
        </button>
        <button
          type="button"
          disabled={!ready}
          className="btn-secondary border-rose-200 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50"
          onClick={() => void send(reject, { id, reason: clean })}
        >
          Từ chối {kind}
        </button>
      </div>
    </fieldset>
  );
}

export function ConsultationsPage() {
  const {user}=useAuth();
  return user?.role==='STUDENT'?<StudentConsultationsPage key={user.id} />:<StaffConsultationsPage />;
}

type StaffTab = 'bookings' | 'schedule' | 'profile';
type BookingFilter = 'ALL' | 'PENDING_GV' | 'CONFIRMED' | 'HISTORY';

const HALF_HOUR_OPTIONS = Array.from({ length: 31 }, (_, i) => {
  const minutes = 7 * 60 + i * 30;
  return { value: minutes, label: formatMinute(minutes) };
});

function toIsoWithVnOffset(localValue: string) {
  if (!localValue) return '';
  if (/[+-]\d{2}:\d{2}|Z$/i.test(localValue)) return localValue;
  return localValue.length === 16 ? `${localValue}:00+07:00` : `${localValue}+07:00`;
}

function clockRange(startsAt: string, endsAt: string) {
  const start = new Intl.DateTimeFormat('vi-VN', {
    timeZone: TZ,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(startsAt));
  const end = new Intl.DateTimeFormat('vi-VN', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(endsAt));
  return `${start} – ${end}`;
}

function StaffConsultationsPage() {
  const { user } = useAuth();
  const role = user?.role;
  const isManager = role === 'ACADEMIC_MANAGER';
  const [tab, setTab] = useState<StaffTab>('bookings');
  const [bookingFilter, setBookingFilter] = useState<BookingFilter>('ALL');
  const [workspace, setWorkspace] = useState<Workspace>();
  const [bookings, setBookings] = useState<ConsultationBooking[]>([]);
  const [notices, setNotices] = useState<
    { id: string; objectId: string; kind: string; reason: string; createdAt?: string }[]
  >([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [last, setLast] = useState<Command | null>(null);

  // Profile form state (prefilled cleanly from current profile when untouched)
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [specialties, setSpecialties] = useState('');
  const [profileTouched, setProfileTouched] = useState(false);

  // Schedule form state
  const [weekday, setWeekday] = useState(1);
  const [startMinute, setStartMinute] = useState(540);
  const [endMinute, setEndMinute] = useState(1020);
  const [weeklyReason, setWeeklyReason] = useState('');
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [removingSlotId, setRemovingSlotId] = useState<string | null>(null);
  const [removeSlotReason, setRemoveSlotReason] = useState('');

  // Per-booking inline action drawer
  const [drawer, setDrawer] = useState<{
    bookingId: string;
    kind: 'meet' | 'cancel' | 'noshow' | 'dispute';
    parentId?: string;
  } | null>(null);
  const [drawerUrl, setDrawerUrl] = useState('');
  const [drawerReason, setDrawerReason] = useState('');

  // Manager filter tabs & search
  const [managerTab, setManagerTab] = useState<'pending' | 'approved' | 'profiles'>('pending');
  const [managerSearch, setManagerSearch] = useState('');
  // Manager profile toggle inline reason
  const [managerProfileReason, setManagerProfileReason] = useState<Record<string, string>>({});

  useEffect(() => {
    let live = true;
    void (async () => {
      const w = await apiFetch<Workspace>('/v2/consultations/workspace');
      const b = isManager
        ? { data: [] }
        : await apiFetch<{ data: ConsultationBooking[] }>('/v2/consultations/bookings');
      const n = await apiFetch<
        { id: string; objectId: string; kind: string; reason: string; createdAt?: string }[]
      >('/v2/consultations/notifications');
      if (live) {
        setWorkspace(w);
        setBookings(Array.isArray(b?.data) ? b.data : []);
        setNotices(Array.isArray(n) ? n : []);
        if (!profileTouched && w?.profiles?.[0]) {
          setName(w.profiles[0].displayName ?? '');
          setBio(w.profiles[0].bio ?? '');
          setSpecialties(w.profiles[0].specialties ?? '');
        }
        setError('');
      }
    })().catch((e) => {
      if (live) {
        setError(
          e instanceof ApiError
            ? `Không tải được dữ liệu tư vấn (${e.status}).`
            : 'Không tải được dữ liệu tư vấn hoặc phiên không còn quyền.',
        );
      }
    });
    return () => {
      live = false;
    };
  }, [revision, role, isManager, profileTouched]);

  async function execute(command: Command) {
    if (busy) return false;
    if (command.op === 'LINK_PROPOSE' && !isManualMeetUrl(String(command.url ?? ''))) {
      setError(MANUAL_MEET_ERROR);
      return false;
    }
    setBusy(true);
    setError('');
    setMessage('');
    setLast(command);
    try {
      await apiFetch('/v2/consultations/commands', {
        method: 'POST',
        body: JSON.stringify(command),
      });
      setLast(null);
      setDrawer(null);
      setDrawerReason('');
      setDrawerUrl('');
      setRemovingSlotId(null);
      setRemoveSlotReason('');
      setMessage('Thao tác đã được lưu thành công.');
      setRevision((x) => x + 1);
      return true;
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message || 'Yêu cầu bị từ chối: phiên/quyền, lịch hoặc phiên bản đã đổi.'
          : 'Chưa biết máy chủ đã lưu hay chưa. Bạn có thể gửi lại đúng yêu cầu bên dưới.',
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  const send = (op: string, data: Record<string, unknown> = {}) =>
    void execute({ key: crypto.randomUUID(), op, ...data });

  const actionBtn = (
    text: string,
    op: string,
    data: Record<string, unknown> = {},
    variant: 'primary' | 'secondary' | 'danger' = 'primary',
    disabledExtra = false,
  ) => (
    <button
      type="button"
      className={
        variant === 'danger'
          ? 'btn-secondary border-rose-200 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50'
          : variant === 'secondary'
            ? 'btn-secondary px-3 py-1.5 text-xs'
            : 'btn-primary px-3 py-1.5 text-xs'
      }
      disabled={busy || disabledExtra}
      onClick={() => send(op, data)}
    >
      {text}
    </button>
  );

  const pendingGvCount = bookings.filter((b) => b.state === 'PENDING_GV').length;
  const confirmedCount = bookings.filter((b) => b.state === 'CONFIRMED').length;
  const historyCount = bookings.filter(
    (b) => !['HOLD', 'PENDING_GV', 'CONFIRMED'].includes(b.state),
  ).length;
  const activeAvailability = (workspace?.availability ?? []).filter((a) => a.active !== false);
  const weeklyDuplicateMap = activeAvailability.reduce<Record<string, number>>((acc, a) => {
    if (a.kind === 'WEEKLY') {
      const sig = `${a.weekday}-${a.startMinute}-${a.endMinute}`;
      acc[sig] = (acc[sig] ?? 0) + 1;
    }
    return acc;
  }, {});

  const sortedBookings = [...bookings].sort((a, b) => {
    const rank = (s: string) => (s === 'PENDING_GV' ? 0 : s === 'CONFIRMED' ? 1 : 2);
    const diff = rank(a.state) - rank(b.state);
    if (diff !== 0) return diff;
    return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
  });

  const filteredBookings = sortedBookings.filter((b) => {
    if (bookingFilter === 'PENDING_GV') return b.state === 'PENDING_GV';
    if (bookingFilter === 'CONFIRMED') return b.state === 'CONFIRMED';
    if (bookingFilter === 'HISTORY') return !['HOLD', 'PENDING_GV', 'CONFIRMED'].includes(b.state);
    return true;
  });

  const currentProfile = workspace?.profiles?.[0];
  const attentionLinks = isManager
    ? (workspace?.links ?? [])
    : (workspace?.links ?? []).filter(
        (l) =>
          !l.linkClear ||
          l.state === 'PENDING' ||
          l.state === 'REJECTED' ||
          !bookings.some((b) => b.id === l.bookingId),
      );
  const hasReviewItems =
    !!workspace &&
    (attentionLinks.length > 0 ||
      workspace.changes.length > 0 ||
      (isManager && workspace.profiles.length > 0));

  const pendingLinks = attentionLinks.filter((l) => l.state === 'PENDING' || !l.linkClear);
  const processedLinks = attentionLinks.filter((l) => l.state !== 'PENDING' && l.linkClear);
  const pendingProfiles = (workspace?.profiles ?? []).filter((p) => p.state === 'DRAFT' || !p.state);
  const pendingChanges = workspace?.changes ?? [];
  const managerPendingCount = pendingLinks.length + pendingChanges.length + pendingProfiles.length;
  const searchLower = managerSearch.trim().toLowerCase();
  const matchesSearch = (parts: (string | null | undefined)[]) =>
    !searchLower || parts.filter(Boolean).join(' ').toLowerCase().includes(searchLower);

  const openDrawer = (
    bookingId: string,
    kind: 'meet' | 'cancel' | 'noshow' | 'dispute',
    parentId?: string,
  ) => {
    if (drawer?.bookingId === bookingId && drawer.kind === kind && drawer.parentId === parentId) {
      setDrawer(null);
      return;
    }
    setDrawer({ bookingId, kind, parentId });
    setDrawerReason('');
    setDrawerUrl('');
  };

  return (
    <main className="section-shell min-w-0 space-y-5 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-[#e66f2b] sm:text-[26px]">
              {isManager ? 'Phê duyệt tư vấn 1:1' : 'Tư vấn học thuật 1:1'}
            </h1>
            {currentProfile && (
              <span
                className={
                  currentProfile.state === 'APPROVED' ? 'badge-published' : 'badge-pending'
                }
              >
                <ShieldCheck size={13} aria-hidden="true" />
                Hồ sơ {status[currentProfile.state ?? 'DRAFT'] ?? currentProfile.state}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600">
            {isManager
              ? 'Phê duyệt hồ sơ giảng viên, link Google Meet và đề nghị đổi lịch tư vấn.'
              : 'Xác nhận lịch hẹn với học viên, gửi link Google Meet và thiết lập khung giờ rảnh.'}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          className="btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2 text-xs"
          onClick={() => setRevision((x) => x + 1)}
        >
          <RefreshCw size={14} aria-hidden="true" />
          Làm mới
        </button>
      </header>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-medium text-rose-950"
        >
          <span>{error}</span>
          <div className="flex flex-wrap gap-2">
            {last && (
              <button
                type="button"
                className="btn-secondary px-3 py-1.5 text-xs"
                disabled={busy}
                onClick={() => void execute(last)}
              >
                Gửi lại cùng yêu cầu
              </button>
            )}
            <button
              type="button"
              className="btn-secondary px-3 py-1.5 text-xs"
              disabled={busy}
              onClick={() => setRevision((x) => x + 1)}
            >
              Tải lại dữ liệu
            </button>
          </div>
        </div>
      )}

      {message && (
        <p
          role="status"
          className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm font-medium text-emerald-950"
        >
          {message}
        </p>
      )}

      {!isManager && (
        <nav aria-label="Điều hướng quản lý tư vấn 1:1" className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab('bookings')}
            className={
              tab === 'bookings'
                ? 'btn-primary px-4 py-2 text-sm'
                : 'btn-secondary px-4 py-2 text-sm'
            }
          >
            Yêu cầu & Lịch hẹn ({bookings.length})
            {pendingGvCount > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                {pendingGvCount} chờ duyệt
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab('schedule')}
            className={
              tab === 'schedule'
                ? 'btn-primary px-4 py-2 text-sm'
                : 'btn-secondary px-4 py-2 text-sm'
            }
          >
            Lịch rảnh & Ngày nghỉ ({activeAvailability.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('profile')}
            className={
              tab === 'profile'
                ? 'btn-primary px-4 py-2 text-sm'
                : 'btn-secondary px-4 py-2 text-sm'
            }
          >
            Hồ sơ & Nhật ký ({notices.length})
          </button>
        </nav>
      )}

      {(isManager || tab === 'bookings') && (
        <div className="space-y-6">
          {isManager &&
            workspace &&
            workspace.profiles.length === 0 &&
            workspace.links.length === 0 &&
            workspace.changes.length === 0 && (
              <section className="workspace-card space-y-2">
                <span className="badge-info">
                  <UserCheck size={13} aria-hidden="true" />
                  Hàng đợi phê duyệt tư vấn 1:1
                </span>
                <h2 className="text-base font-bold text-slate-950">
                  Hiện chưa có hồ sơ, link Meet hay đề nghị đổi lịch nào chờ duyệt
                </h2>
                <p className="text-sm text-slate-600">
                  Khi giảng viên cập nhật hồ sơ tư vấn, gửi link Google Meet mới hoặc phát sinh đề
                  nghị hủy/đổi lịch cần xem xét độc lập, yêu cầu sẽ hiển thị ngay tại đây để bạn phê
                  duyệt.
                </p>
              </section>
            )}

          {isManager && workspace && (
            <section className="workspace-card space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex flex-wrap gap-2" role="tablist" aria-label="Phân loại duyệt tư vấn">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={managerTab === 'pending'}
                    onClick={() => setManagerTab('pending')}
                    className={
                      managerTab === 'pending'
                        ? 'btn-primary px-3.5 py-2 text-xs'
                        : 'btn-secondary px-3.5 py-2 text-xs'
                    }
                  >
                    Chờ duyệt ({managerPendingCount})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={managerTab === 'approved'}
                    onClick={() => setManagerTab('approved')}
                    className={
                      managerTab === 'approved'
                        ? 'btn-primary px-3.5 py-2 text-xs'
                        : 'btn-secondary px-3.5 py-2 text-xs'
                    }
                  >
                    Link Meet đã xử lý ({processedLinks.length})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={managerTab === 'profiles'}
                    onClick={() => setManagerTab('profiles')}
                    className={
                      managerTab === 'profiles'
                        ? 'btn-primary px-3.5 py-2 text-xs'
                        : 'btn-secondary px-3.5 py-2 text-xs'
                    }
                  >
                    Hồ sơ giảng viên ({workspace.profiles.length})
                  </button>
                </div>
                <input
                  type="search"
                  className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-[#5f8b48] focus:outline-none"
                  placeholder="Tìm tên giảng viên, học viên hoặc URL…"
                  value={managerSearch}
                  onChange={(e) => setManagerSearch(e.target.value)}
                />
              </div>

              {managerTab === 'pending' && managerPendingCount === 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Hiện không có hồ sơ, link Google Meet hay đề nghị đổi lịch nào đang chờ phê duyệt.
                </div>
              )}

              {((managerTab === 'pending' && pendingProfiles.length > 0) || managerTab === 'profiles') &&
                workspace.profiles
                  .filter((p) => (managerTab === 'pending' ? p.state === 'DRAFT' || !p.state : true))
                  .filter((p) => matchesSearch([p.displayName, p.bio, p.specialties, p.headline]))
                  .map((p) => {
                  const revId = p.revisionId ?? p.id;
                  const ver = p.number ?? p.version ?? 1;
                  const toggleReason = (managerProfileReason[p.id] ?? '').trim();
                  return (
                    <section
                      id={'review-' + revId}
                      key={p.id}
                      className="workspace-subcard space-y-2 bg-white text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-bold text-slate-950">
                          {p.displayName} · v{ver} · {status[p.state ?? 'DRAFT']}
                        </h3>
                        <span className={p.state === 'APPROVED' ? 'badge-published' : 'badge-pending'}>
                          {consultationReviewLabel(p.state ?? 'DRAFT')}
                        </span>
                      </div>
                      {p.bio && <p className="text-slate-700">{p.bio}</p>}
                      <p className="text-xs text-slate-600">
                        {p.specialties ?? p.headline} ·{' '}
                        {p.enabled !== false ? 'Đang bật đặt lịch' : 'Đã ngừng đặt mới'}
                      </p>
                      {p.reviewReason && (
                        <p className="text-xs text-slate-600">Lý do quyết định: {p.reviewReason}</p>
                      )}
                      {p.canReview && (p.state === 'DRAFT' || !p.state) && (
                        <ConsultationReview
                          key={revId}
                          kind="hồ sơ"
                          version={ver}
                          id={revId}
                          approve="PROFILE_APPROVE"
                          reject="PROFILE_REJECT"
                          busy={busy}
                          send={send}
                        />
                      )}
                      <div className="space-y-2 border-t border-slate-100 pt-2">
                        <input
                          className="input-field py-1.5 text-xs"
                          placeholder="Lý do bật / ngừng tiếp nhận lịch tư vấn (tối thiểu 10 ký tự)"
                          value={managerProfileReason[p.id] ?? ''}
                          onChange={(e) =>
                            setManagerProfileReason((prev) => ({
                              ...prev,
                              [p.id]: e.target.value,
                            }))
                          }
                        />
                        <div className="flex flex-wrap gap-2">
                          {p.enabled !== false
                            ? actionBtn(
                                'Ngừng đặt mới',
                                'PROFILE_DISABLE',
                                { id: p.id, reason: toggleReason },
                                'secondary',
                                toggleReason.length < 10,
                              )
                            : p.canReview &&
                              actionBtn(
                                'Cho phép đặt mới',
                                'PROFILE_ENABLE',
                                { id: p.id, reason: toggleReason },
                                'primary',
                                toggleReason.length < 10,
                              )}
                        </div>
                      </div>
                    </section>
                  );
                })}

              {(managerTab === 'pending' ? pendingLinks : managerTab === 'approved' ? processedLinks : [])
                .filter((l) => {
                  const lb = bookings.find((b) => b.id === l.bookingId);
                  return matchesSearch([
                    l.teacherName ?? lb?.displayName,
                    l.learnerName ?? lb?.learnerName,
                    l.url,
                  ]);
                })
                .map((l) => {
                const linkedBooking = bookings.find((b) => b.id === l.bookingId);
                return (
                  <section
                    id={'review-' + l.id}
                    key={l.id}
                    className="workspace-subcard space-y-2 bg-white text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-slate-950">
                          Link tư vấn Google Meet ·{' '}
                          {status[l.state] ?? consultationReviewLabel(l.state)}
                        </h3>
                        {(l.startsAt || linkedBooking) && (
                          <p className="text-xs text-slate-600">
                            Buổi hẹn {time(l.startsAt ?? linkedBooking!.startsAt)}
                            {(l.teacherName ?? linkedBooking?.displayName)
                              ? ` · GV ${accountLabel(l.teacherName ?? linkedBooking!.displayName)}`
                              : ''}
                            {(l.learnerName ?? linkedBooking?.learnerName)
                              ? ` · HV ${accountLabel(l.learnerName ?? linkedBooking!.learnerName ?? '')}`
                              : ''}
                          </p>
                        )}
                      </div>
                      <span
                        className={
                          !l.linkClear || l.state === 'REJECTED'
                            ? 'badge-draft bg-rose-50 text-rose-700'
                            : l.state === 'APPROVED'
                              ? 'badge-published'
                              : 'badge-pending'
                        }
                      >
                        {consultationReviewLabel(l.state)}
                      </span>
                    </div>
                    <p className="break-all text-slate-700">
                      {l.linkClear
                        ? l.url
                        : 'Link trùng tài nguyên lớp, đã chặn. Giảng viên cần đề xuất link riêng mới.'}
                    </p>
                    {l.reviewReason && (
                      <p className="text-xs text-slate-600">Lý do quyết định: {l.reviewReason}</p>
                    )}
                    {l.canReview && l.state === 'PENDING' && (
                      <ConsultationReview
                        kind="link tư vấn"
                        id={l.id}
                        approve="LINK_APPROVE"
                        reject="LINK_REJECT"
                        busy={busy}
                        send={send}
                      />
                    )}
                  </section>
                );
              })}

              {managerTab === 'pending' &&
                pendingChanges
                  .filter((c) => matchesSearch([c.reason, c.kind]))
                  .map((c) => (
                <section
                  id={'review-' + c.id}
                  key={c.id}
                  className="workspace-subcard space-y-2 bg-white text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-bold text-slate-950">
                      Đề nghị {c.kind === 'CANCEL' ? 'hủy lịch hẹn' : c.kind === 'RESCHEDULE' ? 'đổi giờ hẹn' : c.kind}
                    </h3>
                    {c.state && (
                      <span className="badge-pending">{consultationReviewLabel(c.state)}</span>
                    )}
                  </div>
                  <p className="text-slate-700">
                    {c.reason}
                    {c.startsAt ? ` · ${time(c.startsAt)}` : ''}
                  </p>
                  {c.reviewReason && (
                    <p className="text-xs text-slate-600">Lý do quyết định: {c.reviewReason}</p>
                  )}
                  {c.canReview !== false && (
                    <ConsultationReview
                      kind="thay đổi lịch"
                      id={c.id}
                      approve="CHANGE_APPROVE"
                      reject="CHANGE_REJECT"
                      busy={busy}
                      send={send}
                    />
                  )}
                </section>
              ))}
            </section>
          )}

          {!isManager && hasReviewItems && workspace && (
            <section className="workspace-card space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <span className="badge-info">
                    <UserCheck size={13} aria-hidden="true" />
                    Trạng thái link Meet &amp; Đề nghị
                  </span>
                  <h2 className="mt-1 text-lg font-bold text-slate-950">
                    Theo dõi duyệt link Meet &amp; đề nghị thay đổi
                  </h2>
                </div>
              </div>
              {attentionLinks.map((l) => {
                const linkedBooking = bookings.find((b) => b.id === l.bookingId);
                return (
                  <section
                    id={'review-' + l.id}
                    key={l.id}
                    className="workspace-subcard space-y-2 bg-white text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-slate-950">
                          Link tư vấn Google Meet ·{' '}
                          {status[l.state] ?? consultationReviewLabel(l.state)}
                        </h3>
                        {(l.startsAt || linkedBooking) && (
                          <p className="text-xs text-slate-600">
                            Buổi hẹn {time(l.startsAt ?? linkedBooking!.startsAt)}
                          </p>
                        )}
                      </div>
                      <span
                        className={
                          !l.linkClear || l.state === 'REJECTED'
                            ? 'badge-draft bg-rose-50 text-rose-700'
                            : l.state === 'APPROVED'
                              ? 'badge-published'
                              : 'badge-pending'
                        }
                      >
                        {consultationReviewLabel(l.state)}
                      </span>
                    </div>
                    <p className="break-all text-slate-700">
                      {l.linkClear
                        ? l.url
                        : 'Link trùng tài nguyên lớp, đã chặn. Giảng viên cần đề xuất link riêng mới.'}
                    </p>
                    {l.reviewReason && (
                      <p className="text-xs text-slate-600">Lý do quyết định: {l.reviewReason}</p>
                    )}
                    {l.canReview && l.state === 'PENDING' && (
                      <ConsultationReview
                        kind="link tư vấn"
                        id={l.id}
                        approve="LINK_APPROVE"
                        reject="LINK_REJECT"
                        busy={busy}
                        send={send}
                      />
                    )}
                  </section>
                );
              })}
              {workspace.changes.map((c) => (
                <section
                  id={'review-' + c.id}
                  key={c.id}
                  className="workspace-subcard space-y-2 bg-white text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-bold text-slate-950">
                      Đề nghị{' '}
                      {c.kind === 'CANCEL'
                        ? 'hủy lịch hẹn'
                        : c.kind === 'RESCHEDULE'
                          ? 'đổi giờ hẹn'
                          : c.kind}
                    </h3>
                    {c.state && (
                      <span className="badge-pending">{consultationReviewLabel(c.state)}</span>
                    )}
                  </div>
                  <p className="text-slate-700">
                    {c.reason}
                    {c.startsAt ? ` · ${time(c.startsAt)}` : ''}
                  </p>
                  {c.reviewReason && (
                    <p className="text-xs text-slate-600">Lý do quyết định: {c.reviewReason}</p>
                  )}
                  {c.canReview !== false && (
                    <ConsultationReview
                      kind="thay đổi lịch"
                      id={c.id}
                      approve="CHANGE_APPROVE"
                      reject="CHANGE_REJECT"
                      busy={busy}
                      send={send}
                    />
                  )}
                </section>
              ))}
            </section>
          )}

          {!isManager && (
            <section className="workspace-card space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">Danh sách lịch hẹn tư vấn</h2>
                  <p className="text-xs text-slate-500">
                    Mỗi thẻ hiển thị rõ học viên, khung giờ và thao tác trực tiếp tại chỗ
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc lịch hẹn">
                  {(
                    [
                      ['ALL', `Tất cả (${bookings.length})`],
                      ['PENDING_GV', `Chờ xác nhận (${pendingGvCount})`],
                      ['CONFIRMED', `Đã xác nhận (${confirmedCount})`],
                      ['HISTORY', `Đã hoàn thành / Hủy (${historyCount})`],
                    ] as const
                  ).map(([key, labelText]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setBookingFilter(key)}
                      className={
                        bookingFilter === key
                          ? 'rounded-lg bg-[#2d581b] px-3 py-1.5 text-xs font-semibold text-white'
                          : 'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50'
                      }
                    >
                      {labelText}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {filteredBookings.map((b) => {
                  const learnerDisplay = b.learnerName
                    ? accountLabel(b.learnerName)
                    : 'Học viên đặt lịch';
                  const isMeetOpen =
                    drawer?.bookingId === b.id && drawer.kind === 'meet';
                  const linkedReview = workspace?.links.find((l) => l.bookingId === b.id);
                  return (
                    <article
                      key={b.id}
                      className="workspace-subcard min-w-0 space-y-3 bg-white"
                      data-booking-id={b.id}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <h3 className="text-base font-bold text-slate-950">
                            {learnerDisplay}
                            {b.learnerEmail ? (
                              <span className="ml-2 text-xs font-normal text-slate-500">
                                ({b.learnerEmail})
                              </span>
                            ) : null}
                          </h3>
                          <p className="text-xs font-medium text-[#4d7439]">
                            {clockRange(b.startsAt, b.endsAt)}
                          </p>
                        </div>
                        <span
                          className={
                            b.state === 'CONFIRMED' || b.state === 'COMPLETED'
                              ? 'badge-published'
                              : b.state === 'HOLD' ||
                                  b.state === 'PENDING_GV' ||
                                  b.state === 'REQUESTED'
                                ? 'badge-pending'
                                : 'badge-draft'
                          }
                        >
                          {status[b.state] ?? consultationBookingLabel(b.state)}
                        </span>
                      </div>

                      {b.topic && (
                        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-sm text-slate-700">
                          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Nội dung cần tư vấn
                          </span>
                          <p className="mt-0.5">{b.topic}</p>
                        </div>
                      )}

                      {b.expiresAt && b.state === 'PENDING_GV' && (
                        <p className="text-xs text-amber-800">
                          Hạn phản hồi trước: <strong>{time(b.expiresAt)}</strong>
                        </p>
                      )}

                      {b.linkBlockReason && (
                        <p
                          role="alert"
                          className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs font-medium text-amber-900"
                        >
                          Link tư vấn đã bị chặn do trùng tài nguyên lớp học. Vui lòng đề xuất một
                          link Google Meet riêng khác.
                        </p>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          {b.joinUrl ? (
                            <a
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[#f4f9f1] px-3 py-1.5 text-xs font-semibold text-[#2d581b] underline hover:bg-[#e5f2dd]"
                              href={b.joinUrl}
                              rel="noreferrer"
                              target="_blank"
                            >
                              <Video size={14} aria-hidden="true" />
                              Mở phòng Google Meet
                            </a>
                          ) : b.state === 'CONFIRMED' ? (
                            <span className="text-xs text-slate-500">
                              {linkedReview?.state === 'PENDING'
                                ? 'Link Google Meet đã gửi, đang chờ Học vụ duyệt.'
                                : 'Chưa có link Google Meet được duyệt cho buổi hẹn này.'}
                            </span>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {b.state === 'PENDING_GV' && (
                            <>
                              {actionBtn('Xác nhận lịch hẹn', 'CONFIRM', { id: b.id })}
                              {actionBtn('Từ chối', 'REJECT', { id: b.id }, 'danger')}
                            </>
                          )}
                          {b.state === 'CONFIRMED' && new Date(b.endsAt).getTime() >= Date.now() && (
                            <>
                              {linkedReview?.state !== 'PENDING' && (
                                <button
                                  type="button"
                                  className="btn-primary px-3 py-1.5 text-xs"
                                  disabled={busy}
                                  onClick={() => openDrawer(b.id, 'meet')}
                                >
                                  {drawer?.bookingId === b.id && drawer.kind === 'meet'
                                    ? 'Đóng khung gửi Meet'
                                    : b.joinUrl
                                      ? 'Cập nhật link Meet'
                                      : 'Gửi link Meet duyệt'}
                                </button>
                              )}
                              <button
                                type="button"
                                className="btn-secondary px-3 py-1.5 text-xs"
                                disabled={busy}
                                onClick={() => openDrawer(b.id, 'noshow')}
                              >
                                Ghi nhận vắng mặt
                              </button>
                            </>
                          )}
                          {['PENDING_GV', 'CONFIRMED'].includes(b.state) &&
                            new Date(b.endsAt).getTime() >= Date.now() && (
                            <button
                              type="button"
                              className="btn-secondary px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50"
                              disabled={busy}
                              onClick={() => openDrawer(b.id, 'cancel')}
                            >
                              Đề nghị hủy có duyệt
                            </button>
                          )}
                        </div>
                      </div>

                      {isMeetOpen && (
                        <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <ManualMeetField
                            label="Link Google Meet riêng cho buổi tư vấn"
                            className="input-field py-1.5 text-sm"
                            value={drawerUrl}
                            onChange={setDrawerUrl}
                          />
                          <label className="block space-y-1 text-xs font-semibold text-slate-700">
                            <span>Ghi chú gửi Học vụ duyệt (tối thiểu 10 ký tự)</span>
                            <input
                              className="input-field py-1.5 text-sm"
                              value={drawerReason}
                              onChange={(e) => setDrawerReason(e.target.value)}
                              maxLength={1000}
                              placeholder="Ví dụ: Link Google Meet riêng cho buổi tư vấn lộ trình TOEIC"
                            />
                          </label>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
                              className="btn-secondary px-3 py-1.5 text-xs"
                              onClick={() => setDrawer(null)}
                            >
                              Hủy
                            </button>
                            {actionBtn(
                              'Gửi link cho Học vụ duyệt',
                              'LINK_PROPOSE',
                              { id: b.id, url: drawerUrl, reason: drawerReason.trim() },
                              'primary',
                              drawerReason.trim().length < 10 || !drawerUrl.trim(),
                            )}
                          </div>
                        </div>
                      )}

                      {drawer?.bookingId === b.id &&
                        (drawer.kind === 'cancel' || drawer.kind === 'noshow') && (
                          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <label className="block space-y-1 text-xs font-semibold text-slate-700">
                              <span>
                                {drawer.kind === 'cancel'
                                  ? 'Lý do đề nghị hủy lịch (tối thiểu 10 ký tự)'
                                  : 'Bằng chứng / ghi chú học viên vắng (tối thiểu 10 ký tự)'}
                              </span>
                              <textarea
                                className="input-field py-1.5 text-sm"
                                rows={2}
                                value={drawerReason}
                                onChange={(e) => setDrawerReason(e.target.value)}
                                maxLength={1000}
                                placeholder={
                                  drawer.kind === 'cancel'
                                    ? 'Ví dụ: Trùng lịch họp bộ môn đột xuất, đề nghị hủy và mở khung thay thế'
                                    : 'Ví dụ: Đã chờ 15 phút trong phòng Meet nhưng học viên không tham gia'
                                }
                              />
                            </label>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[11px] text-slate-500">
                                {drawerReason.trim().length}/10 ký tự tối thiểu
                              </span>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  className="btn-secondary px-3 py-1.5 text-xs"
                                  onClick={() => setDrawer(null)}
                                >
                                  Đóng
                                </button>
                                {drawer.kind === 'cancel'
                                  ? actionBtn(
                                      'Gửi đề nghị hủy',
                                      'CHANGE_REQUEST',
                                      {
                                        id: b.id,
                                        kind: 'CANCEL',
                                        version: b.version,
                                        reason: drawerReason.trim(),
                                      },
                                      'danger',
                                      drawerReason.trim().length < 10,
                                    )
                                  : actionBtn(
                                      'Xác nhận ghi nhận vắng',
                                      'NO_SHOW',
                                      { id: b.id, evidence: drawerReason.trim() },
                                      'secondary',
                                      drawerReason.trim().length < 10,
                                    )}
                              </div>
                            </div>
                          </div>
                        )}

                      {b.changes?.map((c) => (
                        <p key={c.id} className="text-xs text-slate-600">
                          Đề nghị {c.kind === 'CANCEL' ? 'hủy lịch' : 'đổi lịch'} ·{' '}
                          {status[c.state] ?? c.state}
                          {c.reason ? ` · ${c.reason}` : ''}
                        </p>
                      ))}

                      {b.reports?.map((r) => (
                        <div
                          key={r.id}
                          className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 text-xs text-slate-700"
                        >
                          <p>
                            {r.kind === 'NO_SHOW'
                              ? `Báo cáo vắng mặt · ${r.evidence}`
                              : r.kind
                                ? `${r.kind} · ${r.evidence}`
                                : `${r.summary} — ${r.outcome}`}
                          </p>
                          {r.kind === 'NO_SHOW' && r.makerId !== user?.id && (
                            <button
                              type="button"
                              className="btn-secondary px-2.5 py-1 text-xs"
                              disabled={busy}
                              onClick={() => openDrawer(b.id, 'dispute', r.id)}
                            >
                              Phản hồi tranh chấp
                            </button>
                          )}
                          {drawer?.bookingId === b.id &&
                            drawer.kind === 'dispute' &&
                            drawer.parentId === r.id && (
                              <div className="space-y-2 border-t border-slate-200 pt-2">
                                <textarea
                                  className="input-field py-1.5 text-sm"
                                  rows={2}
                                  value={drawerReason}
                                  onChange={(e) => setDrawerReason(e.target.value)}
                                  placeholder="Nhập nội dung phản hồi tranh chấp (tối thiểu 10 ký tự)"
                                />
                                {actionBtn(
                                  'Gửi phản hồi tranh chấp',
                                  'DISPUTE',
                                  {
                                    id: b.id,
                                    parentId: r.id,
                                    evidence: drawerReason.trim(),
                                  },
                                  'primary',
                                  drawerReason.trim().length < 10,
                                )}
                              </div>
                            )}
                        </div>
                      ))}
                    </article>
                  );
                })}
              </div>

              {filteredBookings.length === 0 && (
                <p className="workspace-subcard text-sm text-slate-600">
                  {bookings.length === 0
                    ? 'Hiện chưa có lịch hẹn tư vấn nào.'
                    : 'Không có lịch hẹn nào khớp bộ lọc đang chọn.'}
                </p>
              )}
            </section>
          )}
        </div>
      )}

      {!isManager && tab === 'schedule' && (
        <section className="workspace-card space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-lg font-bold text-slate-950">Lịch rảnh hàng tuần & ngày nghỉ</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Thiết lập khung giờ trống cố định trong tuần hoặc thời gian nghỉ đột xuất.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="workspace-subcard space-y-3 bg-white">
              <h3 className="text-sm font-bold text-slate-900">Thêm khung giờ trống hàng tuần</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block space-y-1 text-xs font-semibold text-slate-700">
                  <span>Thứ trong tuần</span>
                  <select
                    className="input-field py-2 text-sm"
                    value={weekday}
                    onChange={(e) => setWeekday(Number(e.target.value))}
                  >
                    {WEEKDAY_LABELS.map((d, i) => (
                      <option key={d} value={i}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1 text-xs font-semibold text-slate-700">
                  <span>Từ giờ</span>
                  <select
                    className="input-field py-2 text-sm"
                    value={startMinute}
                    onChange={(e) => setStartMinute(Number(e.target.value))}
                  >
                    {HALF_HOUR_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1 text-xs font-semibold text-slate-700">
                  <span>Đến giờ</span>
                  <select
                    className="input-field py-2 text-sm"
                    value={endMinute}
                    onChange={(e) => setEndMinute(Number(e.target.value))}
                  >
                    {HALF_HOUR_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block space-y-1 text-xs font-semibold text-slate-700">
                <span>Ghi chú mở khung giờ (tối thiểu 10 ký tự)</span>
                <input
                  className="input-field py-2 text-sm"
                  value={weeklyReason}
                  onChange={(e) => setWeeklyReason(e.target.value)}
                  maxLength={1000}
                  placeholder="Ví dụ: Mở khung tư vấn lộ trình TOEIC sáng thứ hai"
                />
              </label>
              {endMinute <= startMinute && (
                <p className="text-xs font-medium text-rose-700">
                  Giờ kết thúc phải lớn hơn giờ bắt đầu.
                </p>
              )}
              {actionBtn(
                'Thêm khung tuần',
                'AVAILABILITY_ADD',
                {
                  kind: 'WEEKLY',
                  weekday,
                  startMinute,
                  endMinute,
                  reason: weeklyReason.trim(),
                },
                'primary',
                weeklyReason.trim().length < 10 || endMinute <= startMinute,
              )}
            </div>

            <div className="workspace-subcard space-y-3 bg-white">
              <h3 className="text-sm font-bold text-slate-900">Đăng ký khoảng thời gian nghỉ</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1 text-xs font-semibold text-slate-700">
                  <span>Bắt đầu nghỉ</span>
                  <input
                    type="datetime-local"
                    className="input-field py-2 text-sm"
                    value={leaveStart}
                    onChange={(e) => setLeaveStart(e.target.value)}
                  />
                </label>
                <label className="block space-y-1 text-xs font-semibold text-slate-700">
                  <span>Kết thúc nghỉ</span>
                  <input
                    type="datetime-local"
                    className="input-field py-2 text-sm"
                    value={leaveEnd}
                    onChange={(e) => setLeaveEnd(e.target.value)}
                  />
                </label>
              </div>
              <label className="block space-y-1 text-xs font-semibold text-slate-700">
                <span>Lý do nghỉ (tối thiểu 10 ký tự)</span>
                <input
                  className="input-field py-2 text-sm"
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  maxLength={1000}
                  placeholder="Ví dụ: Bận hội đồng chấm thi hoặc công tác chuyên môn"
                />
              </label>
              {actionBtn(
                'Thêm ngày nghỉ',
                'AVAILABILITY_ADD',
                {
                  kind: 'LEAVE',
                  startsAt: toIsoWithVnOffset(leaveStart),
                  endsAt: toIsoWithVnOffset(leaveEnd),
                  reason: leaveReason.trim(),
                },
                'secondary',
                !leaveStart || !leaveEnd || leaveReason.trim().length < 10,
              )}
            </div>
          </div>

          <div className="space-y-2.5 border-t border-slate-100 pt-4">
            <h3 className="text-sm font-bold text-slate-900">
              Khung giờ & ngày nghỉ đang áp dụng ({activeAvailability.length})
            </h3>
            {activeAvailability.length === 0 ? (
              <p className="text-sm text-slate-600">Chưa có khung giờ rảnh hoặc ngày nghỉ nào.</p>
            ) : (
              activeAvailability.map((a) => {
                const sig =
                  a.kind === 'WEEKLY' ? `${a.weekday}-${a.startMinute}-${a.endMinute}` : '';
                const dupCount = sig ? weeklyDuplicateMap[sig] ?? 1 : 1;
                return (
                  <div
                    key={a.id}
                    className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800">
                        {a.kind === 'WEEKLY'
                          ? `${WEEKDAY_LABELS[a.weekday ?? 0] ?? `Thứ ${a.weekday}`} · ${formatMinute(a.startMinute)}–${formatMinute(a.endMinute)}`
                          : a.startsAt && a.endsAt
                            ? `Ngày nghỉ: ${time(a.startsAt)} — ${time(a.endsAt)}`
                            : 'Khung giờ'}
                        {dupCount > 1 && (
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">
                            Trùng khung ({dupCount})
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        className="btn-secondary border-rose-200 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50"
                        onClick={() => {
                          setRemovingSlotId(removingSlotId === a.id ? null : a.id);
                          setRemoveSlotReason('Cập nhật lại lịch tư vấn rảnh của giảng viên.');
                        }}
                      >
                        Ngừng khung này
                      </button>
                    </div>
                    {removingSlotId === a.id && (
                      <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2">
                        <input
                          className="input-field min-w-[240px] flex-1 py-1.5 text-xs"
                          value={removeSlotReason}
                          onChange={(e) => setRemoveSlotReason(e.target.value)}
                          placeholder="Lý do ngừng khung giờ (tối thiểu 10 ký tự)"
                        />
                        {actionBtn(
                          'Xác nhận ngừng',
                          'AVAILABILITY_REMOVE',
                          { id: a.id, reason: removeSlotReason.trim() },
                          'danger',
                          removeSlotReason.trim().length < 10,
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}

      {(isManager || tab === 'profile') && (
        <div className="grid gap-6 lg:grid-cols-2">
          {!isManager && (
            <section className="workspace-card space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                <h2 className="text-lg font-bold text-slate-950">Hồ sơ tư vấn</h2>
                {currentProfile && (
                  <span
                    className={
                      currentProfile.state === 'APPROVED' ? 'badge-published' : 'badge-pending'
                    }
                  >
                    v{currentProfile.number ?? currentProfile.version ?? 1} ·{' '}
                    {status[currentProfile.state ?? 'DRAFT'] ?? currentProfile.state}
                  </span>
                )}
              </div>
              {currentProfile?.reviewReason && (
                <p className="text-xs font-medium text-slate-700">
                  Ghi chú duyệt: {currentProfile.reviewReason}
                </p>
              )}
              <label className="block space-y-1 text-xs font-semibold text-slate-700">
                <span>Tên hiển thị</span>
                <input
                  className="input-field py-2 text-sm"
                  value={name}
                  onChange={(e) => {
                    setProfileTouched(true);
                    setName(e.target.value);
                  }}
                  maxLength={120}
                />
              </label>
              <label className="block space-y-1 text-xs font-semibold text-slate-700">
                <span>Giới thiệu</span>
                <textarea
                  className="input-field py-2 text-sm"
                  rows={3}
                  value={bio}
                  onChange={(e) => {
                    setProfileTouched(true);
                    setBio(e.target.value);
                  }}
                  maxLength={2000}
                />
              </label>
              <label className="block space-y-1 text-xs font-semibold text-slate-700">
                <span>Chuyên môn</span>
                <input
                  className="input-field py-2 text-sm"
                  value={specialties}
                  onChange={(e) => {
                    setProfileTouched(true);
                    setSpecialties(e.target.value);
                  }}
                  maxLength={500}
                />
              </label>
              {actionBtn(
                'Lưu bản nháp hồ sơ',
                'PROFILE_SAVE',
                { displayName: name, bio, specialties },
                'primary',
                !name.trim(),
              )}
            </section>
          )}

          <section className={`workspace-card space-y-3 ${isManager ? 'lg:col-span-2' : ''}`}>
            <h2 className="text-lg font-bold text-slate-950">
              Nhật ký gần đây ({notices.length})
            </h2>
            {notices.length === 0 && (
              <p className="text-xs text-slate-500">Chưa có hoạt động nào.</p>
            )}
            <div className="space-y-2">
              {notices.slice(0, 6).map((n) => (
                <div
                  key={n.id}
                  className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-slate-900">
                      {noticeLabels[n.kind] ?? 'Cập nhật tư vấn'}
                    </strong>
                    {n.createdAt && (
                      <span className="text-xs text-slate-400">{time(n.createdAt)}</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    {n.reason === 'Consultation state updated'
                      ? 'Cập nhật trạng thái lịch tư vấn'
                      : n.reason}
                  </p>
                  {n.kind.startsWith('REVIEW_') && (
                    <Link
                      className="mt-1 inline-block text-xs font-semibold text-[#4d7439] underline"
                      to={'/consultations#review-' + n.objectId}
                    >
                      Mở yêu cầu duyệt
                    </Link>
                  )}
                </div>
              ))}
              {notices.length > 6 && (
                <details className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs">
                  <summary className="cursor-pointer font-semibold text-slate-700">
                    Xem thêm {notices.length - 6} nhật ký cũ hơn
                  </summary>
                  <div className="mt-2 space-y-2">
                    {notices.slice(6).map((n) => (
                      <div
                        key={n.id}
                        className="rounded-lg border border-slate-200 bg-white p-2.5 text-slate-700"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong className="text-slate-900">
                            {noticeLabels[n.kind] ?? 'Cập nhật tư vấn'}
                          </strong>
                          {n.createdAt && (
                            <span className="text-slate-400">{time(n.createdAt)}</span>
                          )}
                        </div>
                        <p className="mt-0.5 text-slate-600">
                          {n.reason === 'Consultation state updated'
                            ? 'Cập nhật trạng thái lịch tư vấn'
                            : n.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
