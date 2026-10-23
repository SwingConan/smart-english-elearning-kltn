import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ExternalLink, Search, X } from 'lucide-react';
import { Link } from 'react-router';
import { adminApi } from './api';
import type {
  AccountQuery,
  AdminAccount,
  AdminCourse,
  AdminReportClassRow,
  AdminReportClassesQuery,
  AdminReportEnrollmentRow,
  AdminReportEnrollmentsQuery,
  AdminReportGradingBacklogQuery,
  AdminReportGradingBacklogRow,
  CourseQuery,
  EnrollmentStatus,
  OperationalReadinessReason,
  PageMeta,
} from './types';

const readinessReasonLabels: Record<OperationalReadinessReason, string> = {
  COURSE_UNPUBLISHED: 'Khóa học chưa được xuất bản',
  INSTRUCTOR_MISSING: 'Chưa phân công giảng viên',
  INSTRUCTOR_INACTIVE: 'Giảng viên được phân công không ở trạng thái hoạt động',
  SCHEDULE_MISSING: 'Chưa có lịch học',
  SCHEDULE_DESTINATION_MISSING: 'Có lịch học chưa có địa điểm hoặc đường dẫn học',
  CLASS_DATES_MISSING: 'Ngày bắt đầu/kết thúc lớp chưa được cấu hình đầy đủ hoặc chưa hợp lệ',
};

export type ReportDrawerRequest =
  | { kind: 'CLASS_LIST'; title: string; query: AdminReportClassesQuery }
  | { kind: 'ACCOUNT_LIST'; title: string; query: AccountQuery }
  | { kind: 'COURSE_LIST'; title: string; query: CourseQuery }
  | { kind: 'ENROLLMENT_LIST'; title: string; query: AdminReportEnrollmentsQuery }
  | { kind: 'GRADING_BACKLOG'; title: string; query: AdminReportGradingBacklogQuery }
  | { kind: 'CLASS_DETAIL'; title: string; row: AdminReportClassRow };

type DrawerRow =
  | AdminReportClassRow
  | AdminAccount
  | AdminCourse
  | AdminReportEnrollmentRow
  | AdminReportGradingBacklogRow;

export function ReportDrilldownDrawer({
  onClose,
  onSessionExpired,
  request,
}: {
  onClose: () => void;
  onSessionExpired: (error: unknown) => Promise<boolean>;
  request: ReportDrawerRequest;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const [rows, setRows] = useState<DrawerRow[]>([]);
  const [loadedKind, setLoadedKind] = useState<ReportDrawerRequest['kind'] | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [loading, setLoading] = useState(request.kind !== 'CLASS_DETAIL');
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    triggerRef.current = document.activeElement as HTMLElement;
    dialogRef.current?.showModal();
  }, [request]);

  useEffect(() => {
    if (request.kind === 'CLASS_DETAIL') return;
    const controller = new AbortController();
    const common = { page, limit: 10, ...(appliedSearch ? { search: appliedSearch } : {}) };
    const promise =
      request.kind === 'CLASS_LIST'
        ? adminApi.reports.classes({ ...request.query, ...common }, controller.signal)
        : request.kind === 'ACCOUNT_LIST'
          ? adminApi.accounts.list({ ...request.query, ...common }, controller.signal)
          : request.kind === 'COURSE_LIST'
            ? adminApi.courses.list({ ...request.query, ...common }, controller.signal)
            : request.kind === 'ENROLLMENT_LIST'
              ? adminApi.reports.enrollments({ ...request.query, ...common }, controller.signal)
              : adminApi.reports.gradingBacklog({ ...request.query, ...common }, controller.signal);
    promise
      .then((response) => {
        setRows(response.data);
        setMeta(response.meta);
        setLoadedKind(request.kind);
      })
      .catch(async (requestError: unknown) => {
        if (controller.signal.aborted || (await onSessionExpired(requestError))) return;
        setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [appliedSearch, onSessionExpired, page, reload, request]);

  const close = () => dialogRef.current?.close();
  const closed = () => {
    onClose();
    triggerRef.current?.focus();
  };

  return (
    <dialog
      aria-labelledby="report-drawer-title"
      className="report-no-print fixed inset-y-0 right-0 left-auto m-0 h-dvh w-full max-w-2xl overflow-hidden border-0 bg-white p-0 shadow-2xl backdrop:bg-slate-950/45 open:flex open:flex-col"
      onClose={closed}
      ref={dialogRef}
    >
      <>
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-indigo-600">
              Chi tiết vận hành
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950" id="report-drawer-title">
              {request.title}
            </h2>
            {meta ? <p className="mt-1 text-sm text-slate-500">{meta.total} kết quả</p> : null}
          </div>
          <button
            aria-label="Đóng chi tiết"
            className="rounded-xl border border-slate-300 p-2 text-slate-700 hover:bg-slate-50"
            onClick={close}
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        {request.kind === 'CLASS_DETAIL' ? (
          <ClassDetail row={request.row} />
        ) : (
          <>
            <form
              className="flex gap-2 border-b border-slate-200 p-4"
              onSubmit={(event) => {
                event.preventDefault();
                setLoading(true);
                setError(false);
                setPage(1);
                setAppliedSearch(search.trim());
              }}
            >
              <label className="relative flex-1">
                <span className="sr-only">Tìm trong danh sách</span>
                <Search
                  aria-hidden="true"
                  className="absolute left-3 top-2.5 text-slate-400"
                  size={18}
                />
                <input
                  className="w-full rounded-xl border border-slate-300 py-2 pl-10 pr-3"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={
                    request.kind === 'CLASS_LIST'
                      ? 'Tìm theo tên hoặc mã lớp'
                      : 'Tìm theo tên, mã hoặc email'
                  }
                  value={search}
                />
              </label>
              <button
                className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white"
                type="submit"
              >
                Tìm
              </button>
            </form>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {loading ? <DrawerState>Đang tải dữ liệu...</DrawerState> : null}
              {error ? (
                <DrawerState>
                  <p>Không thể tải danh sách.</p>
                  <button
                    className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-white"
                    onClick={() => {
                      setLoading(true);
                      setError(false);
                      setReload((value) => value + 1);
                    }}
                    type="button"
                  >
                    Thử lại
                  </button>
                </DrawerState>
              ) : null}
              {!loading && !error && loadedKind === request.kind && rows.length === 0 ? (
                <DrawerState>Không có dữ liệu phù hợp.</DrawerState>
              ) : null}
              {!loading && !error && loadedKind === request.kind && rows.length > 0 ? (
                <DrawerRows kind={request.kind} rows={rows} />
              ) : null}
            </div>
            {meta && meta.totalPages > 1 ? (
              <footer className="flex items-center justify-between gap-3 border-t border-slate-200 p-4 text-sm">
                <button
                  className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-40"
                  disabled={page <= 1}
                  onClick={() => {
                    setLoading(true);
                    setPage((value) => value - 1);
                  }}
                  type="button"
                >
                  Trang trước
                </button>
                <span>
                  Trang {meta.page}/{meta.totalPages}
                </span>
                <button
                  className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-40"
                  disabled={page >= meta.totalPages}
                  onClick={() => {
                    setLoading(true);
                    setPage((value) => value + 1);
                  }}
                  type="button"
                >
                  Trang sau
                </button>
              </footer>
            ) : null}
          </>
        )}
      </>
    </dialog>
  );
}

function DrawerRows({
  kind,
  rows,
}: {
  kind: Exclude<ReportDrawerRequest['kind'], 'CLASS_DETAIL'>;
  rows: DrawerRow[];
}) {
  if (kind === 'CLASS_LIST') return <ClassRows rows={rows as AdminReportClassRow[]} />;
  if (kind === 'ACCOUNT_LIST') return <AccountRows rows={rows as AdminAccount[]} />;
  if (kind === 'COURSE_LIST') return <CourseRows rows={rows as AdminCourse[]} />;
  if (kind === 'ENROLLMENT_LIST')
    return <EnrollmentRows rows={rows as AdminReportEnrollmentRow[]} />;
  return <BacklogRows rows={rows as AdminReportGradingBacklogRow[]} />;
}

function ClassRows({ rows }: { rows: AdminReportClassRow[] }) {
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li className="rounded-xl border border-slate-200 p-4" key={row.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <strong>
                {row.code} · {row.name}
              </strong>
              <p className="text-sm text-slate-500">
                {row.course.title} · {row.instructor?.fullName ?? 'Chưa phân công'}
              </p>
            </div>
            <StatePill>{classStatus(row.status)}</StatePill>
          </div>
          <p className="mt-2 text-sm">
            Sĩ số đang học:{' '}
            <strong>
              {row.activeEnrollments}
              {row.maxStudents === null ? ' · Không giới hạn cấu hình' : `/${row.maxStudents}`}
            </strong>
          </p>
          {row.status === 'DRAFT' &&
          !row.operationalReadiness.isReady &&
          row.operationalReadiness.missing.length > 0 ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <strong>Chưa sẵn sàng vì:</strong>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {row.operationalReadiness.missing.map((reason) => (
                  <li key={reason}>{readinessReasonLabels[reason]}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <Link
            className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-indigo-700"
            to={`/admin/class-offerings/${row.id}/operations`}
          >
            Mở vận hành lớp <ExternalLink size={14} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function AccountRows({ rows }: { rows: AdminAccount[] }) {
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li className="rounded-xl border border-slate-200 p-4" key={row.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <strong>{row.fullName}</strong>
              <p className="text-sm text-slate-500">{row.email}</p>
            </div>
            <StatePill>{accountStatusLabel(row.status)}</StatePill>
          </div>
          <p className="mt-2 text-sm">Vai trò: {accountRoleLabel(row.role)}</p>
          <Link
            className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-indigo-700"
            to={`/admin/accounts/${row.id}`}
          >
            Mở tài khoản <ExternalLink size={14} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CourseRows({ rows }: { rows: AdminCourse[] }) {
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li className="rounded-xl border border-slate-200 p-4" key={row.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <strong>{row.title}</strong>
              <p className="text-sm text-slate-500">{row.level}</p>
            </div>
            <StatePill>{row.isPublished ? 'Đã xuất bản' : 'Bản nháp'}</StatePill>
          </div>
          <Link
            className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-indigo-700"
            to={`/admin/courses/${row.id}/edit`}
          >
            Mở khóa học <ExternalLink size={14} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function EnrollmentRows({ rows }: { rows: AdminReportEnrollmentRow[] }) {
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li className="rounded-xl border border-slate-200 p-4" key={row.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <strong>{row.learner.fullName}</strong>
              <p className="text-sm text-slate-500">{row.learner.email}</p>
            </div>
            <StatePill>{enrollmentStatusLabel(row.status)}</StatePill>
          </div>
          <p className="mt-2 text-sm">
            {row.classOffering.code} · {row.classOffering.name}
          </p>
          <p className="text-sm text-slate-500">
            {row.course.title} · {new Date(row.enrolledAt).toLocaleString('vi-VN')}
          </p>
          <Link
            className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-indigo-700"
            to={`/admin/class-offerings/${row.classOffering.id}/operations`}
          >
            Mở vận hành lớp <ExternalLink size={14} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function BacklogRows({ rows }: { rows: AdminReportGradingBacklogRow[] }) {
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li className="rounded-xl border border-slate-200 p-4" key={row.attemptId}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <strong>{row.learner.fullName}</strong>
              <p className="text-sm text-slate-500">
                {row.assessment.title} · {row.classOffering.code} · {row.classOffering.name}
              </p>
            </div>
            <StatePill>
              {row.gradingState === 'PARTIALLY_REVIEWED' ? 'Đã duyệt một phần' : 'Chờ duyệt'}
            </StatePill>
          </div>
          <p className="mt-2 text-sm">
            Còn {row.pendingProductiveAnswers}/{row.totalProductiveAnswers} câu Speaking/Writing cần
            duyệt
          </p>
          <p className="text-sm text-slate-500">
            Nộp {new Date(row.submittedAt).toLocaleString('vi-VN')} ·{' '}
            {row.instructor?.fullName ?? 'Chưa phân công'}
          </p>
          <Link
            className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-indigo-700"
            to={`/admin/class-offerings/${row.classOffering.id}/operations`}
          >
            Mở vận hành lớp <ExternalLink size={14} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ClassDetail({ row }: { row: AdminReportClassRow }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto p-5">
      <dl className="grid gap-4 rounded-2xl bg-slate-50 p-5 sm:grid-cols-2">
        <Detail label="Lớp" value={`${row.code} · ${row.name}`} />
        <Detail label="Khóa học" value={row.course.title} />
        <Detail label="Giảng viên" value={row.instructor?.fullName ?? 'Chưa phân công'} />
        <Detail label="Trạng thái" value={classStatus(row.status)} />
        <Detail
          label="Sĩ số đang học"
          value={
            row.maxStudents === null
              ? `${row.activeEnrollments} · Không giới hạn cấu hình`
              : `${row.activeEnrollments}/${row.maxStudents}`
          }
        />
        <Detail
          label="Còn chỗ"
          value={
            row.remainingSeats === null ? 'Không giới hạn cấu hình' : String(row.remainingSeats)
          }
        />
        <Detail
          label="Bắt đầu"
          value={
            row.classStart ? new Date(row.classStart).toLocaleDateString('vi-VN') : 'Chưa cấu hình'
          }
        />
      </dl>
      <Link
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white"
        to={`/admin/class-offerings/${row.id}/operations`}
      >
        Mở vận hành lớp <ExternalLink size={16} />
      </Link>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
function StatePill({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
      {children}
    </span>
  );
}
function DrawerState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 p-6 text-center text-slate-600" role="status">
      {children}
    </div>
  );
}
function classStatus(status: AdminReportClassRow['status']) {
  return {
    DRAFT: 'Lớp nháp',
    OPEN: 'Đang mở',
    IN_PROGRESS: 'Đang diễn ra',
    COMPLETED: 'Đã hoàn thành',
    CANCELLED: 'Đã hủy',
  }[status];
}

function accountRoleLabel(role: AdminAccount['role']) {
  return {
    STUDENT: 'Học viên',
    INSTRUCTOR: 'Giảng viên',
    ADMIN_COORDINATOR: 'Điều phối/Admin',
  }[role];
}

function accountStatusLabel(status: AdminAccount['status']) {
  return {
    ACTIVE: 'Đang hoạt động',
    INACTIVE: 'Tạm ngưng',
    LOCKED: 'Đã khóa',
  }[status];
}

function enrollmentStatusLabel(status: EnrollmentStatus) {
  return {
    ACTIVE: 'Đang hiệu lực',
    PENDING_PAYMENT: 'Chờ xử lý đăng ký có phí',
    COMPLETED: 'Đã hoàn tất',
    DROPPED: 'Đã ngừng học',
    CANCELLED: 'Đã hủy',
  }[status];
}
