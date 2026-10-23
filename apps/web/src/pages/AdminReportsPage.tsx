import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { CalendarDays, Download, ExternalLink, Printer, RefreshCw } from 'lucide-react';
import { ReportEChart } from '@/components/charts/ReportEChart';
import { adminApi } from '@/features/admin/api';
import {
  buildAccountRoleOption,
  buildClassCapacityOption,
  buildClassStatusOption,
  buildEnrollmentDailyOption,
  buildEnrollmentDemandOption,
} from '@/features/admin/report-echarts';
import {
  ReportDrilldownDrawer,
  type ReportDrawerRequest,
} from '@/features/admin/ReportDrilldownDrawer';
import { downloadAdminReportCsv } from '@/features/admin/report-export';
import {
  reportPreset,
  type ReportPeriodInput,
  validateReportPeriod,
} from '@/features/admin/reporting-period';
import type {
  AccountRole,
  AccountStatus,
  AdminSystemReport,
  OfferingStatus,
} from '@/features/admin/types';
import { useAdminSessionExpiry } from '@/features/admin/use-admin-session-expiry';

export function AdminReportsPage() {
  const onSessionExpired = useAdminSessionExpiry();
  const initial = reportPreset(30);
  const [draft, setDraft] = useState(initial);
  const [query, setQuery] = useState<ReportPeriodInput>({});
  const [report, setReport] = useState<AdminSystemReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [drawer, setDrawer] = useState<ReportDrawerRequest | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    adminApi.reports
      .system(query, controller.signal)
      .then((response) => {
        setReport(response);
        setDraft({ from: response.period.from, to: response.period.to });
        setError(false);
      })
      .catch(async (requestError: unknown) => {
        if (controller.signal.aborted || (await onSessionExpired(requestError))) return;
        setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [onSessionExpired, query, reload]);

  const apply = useCallback(() => {
    const message = validateReportPeriod(draft.from, draft.to);
    setValidation(message);
    if (!message) setQuery({ ...draft });
    if (!message) setLoading(true);
  }, [draft]);

  const retry = () => {
    setLoading(true);
    setError(false);
    setReload((value) => value + 1);
  };

  if (loading && !report) return <PageState>Đang tải báo cáo hệ thống...</PageState>;
  if (error && !report) return <PageError onRetry={retry} />;
  if (!report) return null;

  const openClassStatus = (status: OfferingStatus) =>
    setDrawer({
      kind: 'CLASS_LIST',
      title: classStatusLabel(status),
      query: { status },
    });
  const openAccountRole = (role: AccountRole) =>
    setDrawer({
      kind: 'ACCOUNT_LIST',
      title: `Tài khoản · ${roleLabel(role)}`,
      query: { role },
    });
  const openEnrollmentClass = (classOfferingId: string) =>
    setDrawer({
      kind: 'ENROLLMENT_LIST',
      title: 'Ghi danh mới theo lớp',
      query: { from: report.period.from, to: report.period.to, classOfferingId },
    });
  const openEnrollmentDay = (date: string) =>
    setDrawer({
      kind: 'ENROLLMENT_LIST',
      title: `Ghi danh ngày ${date}`,
      query: { from: date, to: date },
    });
  const nonZeroEnrollmentDays = report.enrollmentDemand.daily.filter((item) => item.count > 0);

  return (
    <div className="report-print-root space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-600">
              Báo cáo quản trị
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">
              Báo cáo hệ thống
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Các hàng đợi và chỉ số phục vụ quyết định vận hành hiện tại.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Cập nhật <strong>{new Date(report.generatedAt).toLocaleString('vi-VN')}</strong>
            </p>
            <ActionButton label="Làm mới" onClick={retry}>
              <RefreshCw size={17} />
            </ActionButton>
            <ActionButton label="Xuất CSV" onClick={() => downloadAdminReportCsv(report)}>
              <Download size={17} />
            </ActionButton>
            <ActionButton label="In / Lưu PDF" onClick={() => window.print()}>
              <Printer size={17} />
            </ActionButton>
          </div>
        </div>
        {error ? (
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="alert">
            Không thể làm mới báo cáo. Dữ liệu gần nhất vẫn đang được hiển thị.
          </p>
        ) : null}
      </header>

      <section aria-labelledby="action-heading">
        <SectionHeading
          id="action-heading"
          title="Cần xử lý"
          subtitle="Mở từng hàng đợi để xem chính xác đối tượng tạo ra con số."
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <QueueButton
            label="Lớp nháp chưa sẵn sàng"
            value={report.actionQueues.draftNotReady}
            onClick={() =>
              setDrawer({
                kind: 'CLASS_LIST',
                title: 'Lớp nháp chưa sẵn sàng',
                query: { status: 'DRAFT', readiness: 'NOT_READY' },
              })
            }
          />
          <QueueButton
            label="Lớp đang mở đã đủ sĩ số"
            value={report.actionQueues.openFull}
            onClick={() =>
              setDrawer({
                kind: 'CLASS_LIST',
                title: 'Lớp đang mở đã đủ sĩ số',
                query: { status: 'OPEN', registrationState: 'FULL' },
              })
            }
          />
          <QueueButton
            label="Đăng ký có phí đang chờ xử lý"
            value={report.actionQueues.pendingPayment}
            onClick={() =>
              setDrawer({
                kind: 'ENROLLMENT_LIST',
                title: 'Đăng ký có phí đang chờ xử lý',
                query: { status: 'PENDING_PAYMENT' },
              })
            }
          />
          <QueueButton
            label="Bài Speaking/Writing chờ giảng viên duyệt"
            value={report.actionQueues.gradingBacklog}
            onClick={() =>
              setDrawer({
                kind: 'GRADING_BACKLOG',
                title: 'Bài Speaking/Writing chờ giảng viên duyệt',
                query: {},
              })
            }
          />
        </div>
      </section>

      <section
        aria-labelledby="capacity-heading"
        className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
        data-report-card="class-capacity"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeading
            id="capacity-heading"
            title="Vận hành lớp"
            subtitle="Sĩ số đang học so với sức chứa của các lớp đang mở hoặc đang diễn ra."
          />
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-bold text-indigo-700">
            {report.classes.capacity.totalOperationalClasses} lớp vận hành
          </span>
        </div>
        {report.classes.capacity.items.length ? (
          <>
            <ReportEChart
              ariaLabel="Sĩ số đang học và sức chứa theo lớp"
              className="mt-4 h-[28rem] w-full"
              onDataClick={(data) => {
                const classOfferingId = dataField(data, 'classOfferingId');
                const row = report.classes.capacity.items.find(
                  (item) => item.id === classOfferingId,
                );
                if (row)
                  setDrawer({ kind: 'CLASS_DETAIL', title: `${row.code} · ${row.name}`, row });
              }}
              option={buildClassCapacityOption(report.classes.capacity.items)}
            />
            <ul
              className="mt-4 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-3"
              aria-label="Danh sách sĩ số lớp"
            >
              {report.classes.capacity.items.map((row) => (
                <li key={row.id}>
                  <button
                    className="w-full rounded-xl border border-slate-200 p-3 text-left hover:border-indigo-300 hover:bg-indigo-50/40"
                    onClick={() =>
                      setDrawer({ kind: 'CLASS_DETAIL', title: `${row.code} · ${row.name}`, row })
                    }
                    type="button"
                  >
                    <strong className="block text-slate-900">
                      {row.code} · {row.name}
                    </strong>
                    <span className="text-slate-600">
                      {row.activeEnrollments}
                      {row.maxStudents === null
                        ? ' · Không giới hạn cấu hình'
                        : `/${row.maxStudents} học viên`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {report.classes.capacity.truncated ? (
              <p className="mt-3 text-sm text-slate-500">
                Biểu đồ hiển thị 12 lớp ưu tiên. Mở danh sách lớp để xem đầy đủ.
              </p>
            ) : null}
          </>
        ) : (
          <EmptyState>Chưa có lớp đang mở hoặc đang diễn ra.</EmptyState>
        )}
      </section>

      <section aria-labelledby="current-heading">
        <SectionHeading
          id="current-heading"
          title="Tình hình vận hành hiện tại"
          subtitle="Mỗi thành phần có thể mở danh sách đối tượng tương ứng."
        />
        <div className="mt-3 grid items-start gap-4 xl:grid-cols-12">
          <ChartCard
            className="xl:col-span-5"
            title="Trạng thái lớp"
            subtitle={`${report.classes.total} lớp trên hệ thống`}
          >
            <ReportEChart
              ariaLabel="Lớp học theo trạng thái"
              className="h-72 w-full"
              onDataClick={(data) => {
                const status = dataField(data, 'status') as OfferingStatus | undefined;
                if (status) openClassStatus(status);
              }}
              option={buildClassStatusOption(report)}
            />
            <div
              aria-label="Mở danh sách lớp theo trạng thái"
              className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3"
            >
              {(['DRAFT', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as OfferingStatus[]).map(
                (status) => (
                  <CompactDrilldownButton
                    key={status}
                    label={classStatusControlLabel(status)}
                    onClick={() => openClassStatus(status)}
                    value={report.classes.byStatus[status]}
                  />
                ),
              )}
            </div>
          </ChartCard>
          <ChartCard
            className="xl:col-span-4"
            title="Tài khoản"
            subtitle={`${report.accounts.total} tài khoản theo vai trò`}
          >
            <ReportEChart
              ariaLabel="Tài khoản theo vai trò"
              className="h-72 w-full"
              onDataClick={(data) => {
                const role = dataField(data, 'role') as AccountRole | undefined;
                if (role) openAccountRole(role);
              }}
              option={buildAccountRoleOption(report)}
            />
            <div
              aria-label="Mở danh sách tài khoản theo vai trò"
              className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3"
            >
              {(['STUDENT', 'INSTRUCTOR', 'ADMIN_COORDINATOR'] as AccountRole[]).map((role) => (
                <CompactDrilldownButton
                  key={role}
                  label={roleLabel(role)}
                  onClick={() => openAccountRole(role)}
                  value={report.accounts.byRole[role]}
                />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2" aria-label="Tài khoản theo trạng thái">
              {(['ACTIVE', 'INACTIVE', 'LOCKED'] as AccountStatus[]).map((status) => (
                <button
                  className="rounded-xl border border-slate-200 p-2 text-center hover:border-indigo-300"
                  key={status}
                  onClick={() =>
                    setDrawer({
                      kind: 'ACCOUNT_LIST',
                      title: `Tài khoản · ${accountStatusLabel(status)}`,
                      query: { status },
                    })
                  }
                  type="button"
                >
                  <strong className="block text-xl">{report.accounts.byStatus[status]}</strong>
                  <span className="text-xs text-slate-600">{accountStatusLabel(status)}</span>
                </button>
              ))}
            </div>
          </ChartCard>
          <ChartCard
            className="xl:col-span-3"
            title="Khóa học"
            subtitle={`${report.courses.total} khóa học`}
          >
            <div className="space-y-3">
              <button
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-4 text-left hover:border-indigo-300"
                onClick={() =>
                  setDrawer({
                    kind: 'COURSE_LIST',
                    title: 'Khóa học đã xuất bản',
                    query: { isPublished: true },
                  })
                }
                type="button"
              >
                <span>
                  <strong className="block text-2xl">{report.courses.published}</strong>
                  <span className="text-sm text-slate-600">Đã xuất bản</span>
                </span>
                <ExternalLink size={18} />
              </button>
              <button
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-4 text-left hover:border-indigo-300"
                onClick={() =>
                  setDrawer({
                    kind: 'COURSE_LIST',
                    title: 'Khóa học bản nháp',
                    query: { isPublished: false },
                  })
                }
                type="button"
              >
                <span>
                  <strong className="block text-2xl">{report.courses.draft}</strong>
                  <span className="text-sm text-slate-600">Bản nháp</span>
                </span>
                <ExternalLink size={18} />
              </button>
            </div>
          </ChartCard>
        </div>
      </section>

      <section
        aria-labelledby="demand-heading"
        className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
        data-report-card="enrollment-demand"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeading
            id="demand-heading"
            title="Nhu cầu ghi danh"
            subtitle="Bộ lọc ngày chỉ áp dụng cho phần nhu cầu ghi danh này."
          />
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">
            {report.enrollmentDemand.totalNewEnrollments} ghi danh mới
          </span>
        </div>
        <PeriodControls
          draft={draft}
          loading={loading}
          onApply={apply}
          onDraft={setDraft}
          onPreset={(days) => {
            const period = reportPreset(days);
            setDraft(period);
            setValidation(null);
            setLoading(true);
            setQuery(period);
          }}
          validation={validation}
        />
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <ChartCard
            title="Ghi danh mới theo lớp"
            subtitle={`${report.period.from} – ${report.period.to}`}
          >
            {report.enrollmentDemand.byClass.length ? (
              <>
                <ReportEChart
                  ariaLabel="Nhu cầu ghi danh theo lớp"
                  className="h-80 w-full"
                  onDataClick={(data) => {
                    const classOfferingId = dataField(data, 'classOfferingId');
                    if (classOfferingId) openEnrollmentClass(classOfferingId);
                  }}
                  option={buildEnrollmentDemandOption(report)}
                />
                <ol
                  aria-label="Mở ghi danh theo lớp"
                  className="mt-3 max-h-56 space-y-2 overflow-auto"
                >
                  {report.enrollmentDemand.byClass.map((item) => (
                    <li key={item.classOfferingId}>
                      <button
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-indigo-300 hover:bg-indigo-50/40"
                        onClick={() => openEnrollmentClass(item.classOfferingId)}
                        type="button"
                      >
                        <span className="min-w-0">
                          <strong className="block truncate">
                            {item.classCode} · {item.className}
                          </strong>
                          <span className="block truncate text-xs text-slate-500">
                            {item.courseTitle}
                          </span>
                        </span>
                        <strong className="shrink-0 text-lg text-indigo-700">{item.count}</strong>
                      </button>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <EmptyState>Không có ghi danh mới trong kỳ.</EmptyState>
            )}
          </ChartCard>
          <ChartCard
            title="Ghi danh mới theo ngày"
            subtitle="Chọn một điểm để xem các ghi danh trong ngày"
          >
            <ReportEChart
              ariaLabel="Ghi danh mới theo ngày"
              className="h-80 w-full"
              onDataClick={(data) => {
                const date = dataField(data, 'date');
                if (date) openEnrollmentDay(date);
              }}
              option={buildEnrollmentDailyOption(report)}
            />
            {nonZeroEnrollmentDays.length ? (
              <div
                aria-label="Mở ghi danh theo ngày có phát sinh"
                className="mt-3 max-h-48 space-y-2 overflow-auto"
              >
                {nonZeroEnrollmentDays.map((item) => (
                  <button
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-left hover:border-indigo-300 hover:bg-indigo-50/40"
                    key={item.date}
                    onClick={() => openEnrollmentDay(item.date)}
                    type="button"
                  >
                    <span>{item.date}</span>
                    <strong className="text-indigo-700">{item.count} ghi danh</strong>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState>Không có ngày phát sinh ghi danh trong kỳ.</EmptyState>
            )}
          </ChartCard>
        </div>
      </section>

      <footer className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        <strong className="text-slate-900">Cách đọc báo cáo:</strong> Hàng đợi, sĩ số lớp, trạng
        thái lớp và tài khoản là ảnh chụp hiện tại. Khoảng ngày chỉ thay đổi nhu cầu ghi danh. Đăng
        ký có phí chờ xử lý không được xem là đã thanh toán hoặc giữ chỗ. Giờ Việt Nam (UTC+7).
      </footer>

      {drawer ? (
        <ReportDrilldownDrawer
          key={`${drawer.kind}-${drawer.title}`}
          onClose={() => setDrawer(null)}
          onSessionExpired={onSessionExpired}
          request={drawer}
        />
      ) : null}
    </div>
  );
}

type ReportDateRange = Required<ReportPeriodInput>;

function PeriodControls({
  draft,
  loading,
  onApply,
  onDraft,
  onPreset,
  validation,
}: {
  draft: ReportDateRange;
  loading: boolean;
  onApply: () => void;
  onDraft: (value: ReportDateRange) => void;
  onPreset: (days: 7 | 30 | 90) => void;
  validation: string | null;
}) {
  return (
    <div className="report-no-print mt-4 rounded-2xl bg-slate-50 p-4">
      <div className="grid gap-4 xl:grid-cols-[auto_1fr] xl:items-end">
        <div>
          <p className="mb-2 text-sm font-bold text-slate-700">Chọn nhanh</p>
          <div className="flex flex-wrap gap-2">
            {([7, 30, 90] as const).map((days) => (
              <button
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold"
                key={days}
                onClick={() => onPreset(days)}
                type="button"
              >
                {days} ngày
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <DateField
            label="Từ ngày"
            max={draft.to}
            onChange={(from) => onDraft({ ...draft, from })}
            value={draft.from}
          />
          <DateField
            label="Đến ngày"
            min={draft.from}
            onChange={(to) => onDraft({ ...draft, to })}
            value={draft.to}
          />
          <button
            className="rounded-xl bg-indigo-600 px-5 py-2 font-bold text-white disabled:opacity-50"
            disabled={loading}
            onClick={onApply}
            type="button"
          >
            Áp dụng
          </button>
        </div>
      </div>
      {validation ? (
        <p className="mt-3 text-sm font-semibold text-red-700" role="alert">
          {validation}
        </p>
      ) : null}
      <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
        <CalendarDays size={15} />
        Tối đa 90 ngày · Giờ Việt Nam (UTC+7)
      </p>
    </div>
  );
}

function DateField({
  label,
  max,
  min,
  onChange,
  value,
}: {
  label: string;
  max?: string;
  min?: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <input
        className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
        max={max}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        type="date"
        value={value}
      />
    </label>
  );
}
function ActionButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="report-no-print inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:border-indigo-400"
      onClick={onClick}
      type="button"
    >
      {children}
      {label}
    </button>
  );
}
function QueueButton({
  label,
  onClick,
  value,
}: {
  label: string;
  onClick: () => void;
  value: number;
}) {
  return (
    <button
      className="group flex min-h-32 items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-md"
      onClick={onClick}
      type="button"
    >
      <span>
        <span className="block font-black text-slate-900">{label}</span>
        <span className="mt-2 block text-xs font-bold text-indigo-700 group-hover:underline">
          Xem đúng danh sách →
        </span>
      </span>
      <strong className="text-3xl font-black text-amber-800">{value}</strong>
    </button>
  );
}
function CompactDrilldownButton({
  label,
  onClick,
  value,
}: {
  label: string;
  onClick: () => void;
  value: number;
}) {
  return (
    <button
      aria-label={`${label}: ${value}`}
      className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-left hover:border-indigo-300 hover:bg-indigo-50/40"
      onClick={onClick}
      type="button"
    >
      <span className="min-w-0 text-xs font-semibold text-slate-700">{label}</span>
      <strong className="shrink-0 text-base text-indigo-700">{value}</strong>
    </button>
  );
}
function SectionHeading({ id, subtitle, title }: { id: string; subtitle: string; title: string }) {
  return (
    <div>
      <h2 className="text-xl font-black tracking-tight text-slate-950" id={id}>
        {title}
      </h2>
      <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
    </div>
  );
}
function ChartCard({
  children,
  className = '',
  subtitle,
  title,
}: {
  children: ReactNode;
  className?: string;
  subtitle: string;
  title: string;
}) {
  return (
    <article
      className={`h-fit min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
    >
      <h3 className="text-lg font-black text-slate-950">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      <div className="mt-3">{children}</div>
    </article>
  );
}
function EmptyState({ children }: { children: ReactNode }) {
  return <p className="mt-4 rounded-xl bg-slate-50 p-6 text-center text-slate-600">{children}</p>;
}
function PageState({ children }: { children: ReactNode }) {
  return (
    <div aria-live="polite" className="rounded-2xl bg-white p-8" role="status">
      {children}
    </div>
  );
}
function PageError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-white p-8" role="alert">
      <p className="font-bold text-red-700">Không thể tải báo cáo hệ thống.</p>
      <button
        className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-white"
        onClick={onRetry}
        type="button"
      >
        Thử lại
      </button>
    </div>
  );
}
function dataField(data: unknown, field: string): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const value = (data as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : undefined;
}
function classStatusLabel(status: OfferingStatus) {
  return {
    DRAFT: 'Lớp nháp',
    OPEN: 'Lớp đang mở',
    IN_PROGRESS: 'Lớp đang diễn ra',
    COMPLETED: 'Lớp đã hoàn thành',
    CANCELLED: 'Lớp đã hủy',
  }[status];
}
function classStatusControlLabel(status: OfferingStatus) {
  return {
    DRAFT: 'Lớp nháp',
    OPEN: 'Đang mở',
    IN_PROGRESS: 'Đang diễn ra',
    COMPLETED: 'Đã hoàn thành',
    CANCELLED: 'Đã hủy',
  }[status];
}
function roleLabel(role: AccountRole) {
  return { STUDENT: 'Học viên', INSTRUCTOR: 'Giảng viên', ADMIN_COORDINATOR: 'Điều phối/Admin' }[
    role
  ];
}
function accountStatusLabel(status: AccountStatus) {
  return { ACTIVE: 'Đang hoạt động', INACTIVE: 'Tạm ngưng', LOCKED: 'Đã khóa' }[status];
}
