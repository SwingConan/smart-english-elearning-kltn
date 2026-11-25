import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileSpreadsheet,
  ShieldCheck,
  Users,
  Video,
} from 'lucide-react';
import { useAuth } from '@/features/auth/auth-context';
import { accountLabel, classLabel, isTechnicalQaRecord } from '@/features/catalog/record-presentation';
import { classCodeLabel } from '@/features/demo/presentation';
import { classStateLabel } from '@/features/presentation/labels';
import { apiFetch } from '@/lib/api-client';
import { workspaceApi, type WorkspaceClass } from './api';

type InspectionItem = {
  classCode?: string | null;
  className?: string | null;
  valid: boolean;
  meetUrl: string | null;
  scheduledSeconds: number;
  observedSeconds: number | null;
  approvedSeconds: number | null;
  hoursState: string;
  assignment: {
    id: string;
    classId: string;
    startsAt: string;
    endsAt: string;
    state: string;
  };
  reports: { id: string; presence: string }[];
  clocks: { id: string; kind: string }[];
};

type InspectionDashboardResponse = {
  data: InspectionItem[];
  notifications: { id: string; kind: string; createdAt: string }[];
};

function formatDateTimeVn(iso: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function formatHmVn(iso: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function ymdCenter(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function formatSecondsCompact(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return '0 phút';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) return mins > 0 ? `${hrs}g ${mins}p` : `${hrs} giờ`;
  if (mins > 0) return `${mins} phút`;
  return `${secs} giây`;
}

function shiftStateLabel(state: string): string {
  const map: Record<string, string> = {
    ACTIVE: 'Chờ tiếp nhận',
    ACKNOWLEDGED: 'Đã tiếp nhận',
    ACCEPTED: 'Đã tiếp nhận',
    DECLINED: 'Không thể nhận',
    INVALIDATED: 'Đã thay thế lịch',
  };
  return map[state] ?? state;
}

/**
 * Role-dedicated operational dashboard for TEACHING_INSPECTOR (`inspector@gmail.com`),
 * aggregating real W08 inspection assignments, pending acknowledgments, reports, and scoped classes.
 */
export function InspectorWorkspaceDashboard() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<WorkspaceClass[]>([]);
  const [shifts, setShifts] = useState<InspectionItem[]>([]);
  const [notificationCount, setNotificationCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const now = new Date();
    const from = new Date(now.getTime() - 7 * 86_400_000).toISOString();
    const to = new Date(now.getTime() + 14 * 86_400_000).toISOString();

    Promise.all([
      workspaceApi.classes(),
      apiFetch<InspectionDashboardResponse>(
        `/v2/inspection?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=50`,
      ),
    ])
      .then(([clsRes, inspRes]) => {
        if (!active) return;
        setClasses(clsRes.data ?? []);
        setShifts(inspRes.data ?? []);
        setNotificationCount(inspRes.notifications?.length ?? 0);
        setError('');
      })
      .catch(() => {
        if (active) {
          setError('Không thể tải tổng quan thanh tra lúc này. Vui lòng thử tải lại trang.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (!user) return null;

  const validShifts = shifts.filter((s) => s.valid);
  const pendingAckShifts = validShifts.filter((s) => s.assignment.state === 'ACTIVE');
  const acknowledgedShifts = validShifts.filter((s) =>
    ['ACKNOWLEDGED', 'ACCEPTED'].includes(s.assignment.state),
  );
  const reportedShifts = validShifts.filter((s) => s.reports.length > 0);
  const approvedShifts = validShifts.filter((s) => s.hoursState === 'HVU_CONFIRMED');
  const totalObservedSec = validShifts.reduce((sum, s) => sum + (s.observedSeconds ?? 0), 0);

  const priorityShifts = [...validShifts].sort(
    (a, b) => new Date(a.assignment.startsAt).getTime() - new Date(b.assignment.startsAt).getTime(),
  );

  return (
    <div className="workspace-page space-y-6">
      <header className="workspace-header">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge-info">
              <ShieldCheck size={13} aria-hidden="true" />
              Cổng Thanh tra Đào tạo
            </span>
            <span className="badge-published">{accountLabel(user.fullName)}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            Tổng quan thanh tra giảng dạy
          </h1>
          <p className="max-w-3xl text-sm text-slate-600">
            Theo dõi nhanh ca trực thanh tra trong phạm vi ±14 ngày, xác nhận nhận ca, chấm công
            vào/ra ca và đối chiếu giờ dạy cùng phòng Học vụ.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link className="btn-primary px-3.5 py-2 text-xs sm:text-sm" to="/workspace/inspection">
            Mở ca trực &amp; chấm công
          </Link>
          <Link className="btn-secondary px-3.5 py-2 text-xs sm:text-sm" to="/workspace/reports">
            Xem báo cáo thanh tra
          </Link>
        </div>
      </header>

      {error ? (
        <p role="alert" className="state-error text-sm font-medium">
          {error}
        </p>
      ) : null}

      {/* 4 Real KPI Cards */}
      <section aria-label="Chỉ số thanh tra hiện hành" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="workspace-card border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span>Chờ tiếp nhận ca</span>
            <AlertCircle size={16} className="text-amber-600" aria-hidden="true" />
          </div>
          <div className="mt-2 text-3xl font-bold text-slate-950">
            {loading ? '…' : pendingAckShifts.length}
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Ca hiệu lực mới điều phối cần bạn xác nhận tham gia
          </p>
        </div>

        <div className="workspace-card border-l-4 border-l-indigo-600">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span>Ca hiệu lực (±14 ngày)</span>
            <Calendar size={16} className="text-indigo-600" aria-hidden="true" />
          </div>
          <div className="mt-2 text-3xl font-bold text-slate-950">
            {loading ? '…' : validShifts.length}
          </div>
          <p className="mt-1 text-xs text-slate-600">
            {acknowledgedShifts.length} đã tiếp nhận · {notificationCount} thông báo thay đổi
          </p>
        </div>

        <div className="workspace-card border-l-4 border-l-emerald-600">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span>Biên bản &amp; Đối chiếu giờ</span>
            <CheckCircle2 size={16} className="text-emerald-600" aria-hidden="true" />
          </div>
          <div className="mt-2 text-3xl font-bold text-slate-950">
            {loading ? '…' : `${reportedShifts.length}/${validShifts.length}`}
          </div>
          <p className="mt-1 text-xs text-slate-600">
            {approvedShifts.length} ca Học vụ đã xác nhận · Quan sát {formatSecondsCompact(totalObservedSec)}
          </p>
        </div>

        <div className="workspace-card border-l-4 border-l-sky-600">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span>Lớp được cấp quyền</span>
            <Users size={16} className="text-sky-600" aria-hidden="true" />
          </div>
          <div className="mt-2 text-3xl font-bold text-slate-950">
            {loading ? '…' : `${classes.length} lớp`}
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Phạm vi lớp học đang có hiệu lực giám sát
          </p>
        </div>
      </section>

      {/* Priority Shift Queue */}
      <section className="workspace-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Lịch ca thanh tra hiệu lực gần đây</h2>
            <p className="text-xs text-slate-500">
              Các ca cần tiếp nhận, quan sát hoặc vừa hoàn thành biên bản trong phạm vi 3 tuần
            </p>
          </div>
          <Link
            to="/workspace/inspection"
            className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 hover:underline"
          >
            Xem đầy đủ lịch tuần <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </div>

        {loading ? (
          <p role="status" className="text-sm text-slate-500">
            Đang tổng hợp danh sách ca thanh tra…
          </p>
        ) : priorityShifts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            Hiện chưa có ca thanh tra hiệu lực nào trong khoảng thời gian gần đây.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {priorityShifts.slice(0, 6).map((s) => {
              const title = s.classCode
                ? `${classCodeLabel(s.classCode)} · ${s.className ?? ''}`
                : `Lớp ${s.assignment.classId.slice(0, 8)}`;
              const hasReport = s.reports.length > 0;
              return (
                <div
                  key={s.assignment.id}
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          s.assignment.state === 'ACTIVE'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {shiftStateLabel(s.assignment.state)}
                      </span>
                      <span className="text-xs font-semibold text-slate-500">
                        <Clock size={12} className="mr-1 inline" aria-hidden="true" />
                        {formatDateTimeVn(s.assignment.startsAt)} – {formatHmVn(s.assignment.endsAt)}
                      </span>
                    </div>
                    <p className="truncate text-sm font-bold text-slate-900">{title}</p>
                    <p className="text-xs text-slate-600">
                      {hasReport ? 'Đã nộp biên bản quan sát' : 'Chưa nộp biên bản'} ·{' '}
                      {s.hoursState === 'HVU_CONFIRMED'
                        ? `Học vụ đã xác nhận (${formatSecondsCompact(s.approvedSeconds)})`
                        : 'Chờ Học vụ đối chiếu giờ'}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {s.meetUrl ? (
                      <a
                        href={s.meetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Video size={13} aria-hidden="true" />
                        Vào Google Meet
                      </a>
                    ) : null}
                    <Link
                      to={`/workspace/inspection?assignment=${s.assignment.id}&date=${ymdCenter(s.assignment.startsAt)}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#76a35e] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#5e8a47]"
                    >
                      Xử lý ca <ArrowRight size={13} aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Quick Action Cards */}
      <section aria-label="Phân hệ nghiệp vụ thanh tra" className="grid gap-4 md:grid-cols-3">
        <Link
          className="workspace-card group flex flex-col justify-between gap-3 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
          to="/workspace/inspection"
        >
          <div className="space-y-1.5">
            <span className="badge-info">
              <ShieldCheck size={13} aria-hidden="true" />
              Giám sát ca dạy
            </span>
            <h2 className="text-base font-bold text-slate-950 group-hover:text-indigo-700">
              Ca trực, quan sát &amp; chấm công
            </h2>
            <p className="text-xs text-slate-600">
              Tiếp nhận phân công, bấm giờ quan sát, chấm công vào/ra ca và gửi biên bản cho Học vụ.
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700">
            Mở phân hệ thanh tra <ArrowRight size={13} aria-hidden="true" />
          </span>
        </Link>

        <Link
          className="workspace-card group flex flex-col justify-between gap-3 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
          to="/calendar"
        >
          <div className="space-y-1.5">
            <span className="badge-info">
              <Calendar size={13} aria-hidden="true" />
              Lịch trung tâm
            </span>
            <h2 className="text-base font-bold text-slate-950 group-hover:text-indigo-700">
              Thời khóa biểu lớp giám sát
            </h2>
            <p className="text-xs text-slate-600">
              Tra cứu lịch học các lớp thuộc phạm vi theo ngày, tuần hoặc tháng chuẩn múi giờ GMT+7.
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700">
            Xem lịch trung tâm <ArrowRight size={13} aria-hidden="true" />
          </span>
        </Link>

        <Link
          className="workspace-card group flex flex-col justify-between gap-3 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
          to="/workspace/reports"
        >
          <div className="space-y-1.5">
            <span className="badge-info">
              <FileSpreadsheet size={13} aria-hidden="true" />
              Thống kê &amp; Đối soát
            </span>
            <h2 className="text-base font-bold text-slate-950 group-hover:text-indigo-700">
              Báo cáo thanh tra đa kỳ
            </h2>
            <p className="text-xs text-slate-600">
              Tổng hợp ca trực, tỷ lệ biên bản, giờ quan sát đối chiếu và xuất Excel / CSV.
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700">
            Xem báo cáo thanh tra <ArrowRight size={13} aria-hidden="true" />
          </span>
        </Link>
      </section>

      {/* Scoped Classes List */}
      <section className="workspace-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Lớp trong phạm vi giám sát</h2>
            <p className="text-xs text-slate-500">
              Các lớp học bạn được cấp quyền đọc và điều phối giám sát chất lượng giảng dạy
            </p>
          </div>
          <span className="badge-info">{classes.length} lớp</span>
        </div>

        {classes.length === 0 ? (
          <p className="text-sm text-slate-600">Chưa có lớp nào được cấp quyền đọc trong phạm vi hiện tại.</p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {classes.map((item) => (
              <li
                key={item.id}
                className="workspace-subcard flex flex-col justify-between gap-3 bg-white"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="badge-info">{classStateLabel(item.status)}</span>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                      <Users size={13} aria-hidden="true" />
                      {item.activeLearnerCount} học viên đang học
                    </span>
                  </div>

                  <Link
                    className="block pt-1 text-base font-bold text-[#e66f2b] hover:underline"
                    to={`/workspace/classes/${item.id}`}
                  >
                    {isTechnicalQaRecord(item.name, item.code, item.course.title)
                      ? classLabel(item.name, item.code, item.course.title)
                      : `${classCodeLabel(item.code)} · ${item.name}`}
                  </Link>

                  <p className="text-xs font-medium text-slate-600">
                    {isTechnicalQaRecord(item.course.title) ? 'Chương trình TOEIC' : item.course.title} ·
                    Giảng viên:{' '}
                    {item.instructor ? accountLabel(item.instructor.fullName) : 'Chưa phân công'}
                  </p>
                </div>

                <div className="flex justify-end border-t border-slate-100 pt-2.5">
                  <Link
                    to={`/workspace/classes/${item.id}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 hover:underline"
                  >
                    <ClipboardCheck size={13} aria-hidden="true" />
                    Xem hồ sơ lớp <ArrowRight size={13} aria-hidden="true" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
