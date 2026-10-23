import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  GraduationCap,
  Printer,
  RefreshCw,
  School,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router';
import { adminApi } from '@/features/admin/api';
import {
  AccountCompositionChart,
  ActivityTrendChart,
  DonutChart,
  SegmentedBar,
  type ChartDatum,
} from '@/features/admin/report-charts';
import { downloadAdminReportCsv } from '@/features/admin/report-export';
import {
  reportPreset,
  type ReportPeriodInput,
  validateReportPeriod,
} from '@/features/admin/reporting-period';
import type { AdminSystemReport } from '@/features/admin/types';
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

  useEffect(() => {
    const controller = new AbortController();
    adminApi.reports
      .system(query, controller.signal)
      .then((response) => {
        setReport(response);
        setDraft({ from: response.activity.period.from, to: response.activity.period.to });
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
    if (!message) {
      setLoading(true);
      setError(false);
      setQuery({ ...draft });
    }
  }, [draft]);

  const selectPreset = (days: 7 | 30 | 90) => {
    const period = reportPreset(days);
    setDraft(period);
    setValidation(null);
    setLoading(true);
    setError(false);
    setQuery(period);
  };

  const retry = () => {
    setLoading(true);
    setError(false);
    setReload((value) => value + 1);
  };

  if (loading && !report) {
    return (
      <div aria-live="polite" className="rounded-2xl bg-white p-8" role="status">
        Đang tải báo cáo hệ thống...
      </div>
    );
  }
  if (error && !report) {
    return (
      <div className="rounded-2xl border border-red-200 bg-white p-8" role="alert">
        <p className="font-bold text-red-700">Không thể tải báo cáo hệ thống.</p>
        <button
          className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-white"
          onClick={retry}
          type="button"
        >
          Thử lại
        </button>
      </div>
    );
  }
  if (!report) return null;

  const { snapshot } = report;
  const classLifecycle: ChartDatum[] = [
    { label: 'Lớp nháp', value: snapshot.classes.byStatus.DRAFT, color: '#94a3b8' },
    { label: 'Đang mở', value: snapshot.classes.byStatus.OPEN, color: '#4f46e5' },
    { label: 'Đang diễn ra', value: snapshot.classes.byStatus.IN_PROGRESS, color: '#0284c7' },
    { label: 'Đã hoàn thành', value: snapshot.classes.byStatus.COMPLETED, color: '#059669' },
    { label: 'Đã hủy', value: snapshot.classes.byStatus.CANCELLED, color: '#dc2626' },
  ];
  const enrollmentComposition: ChartDatum[] = [
    { label: 'Đang hiệu lực', value: snapshot.enrollments.byStatus.ACTIVE, color: '#059669' },
    {
      label: 'Chờ xử lý đăng ký có phí',
      value: snapshot.enrollments.byStatus.PENDING_PAYMENT,
      color: '#d97706',
      note: 'Chưa tính vào sĩ số đang học',
    },
    { label: 'Đã hoàn tất', value: snapshot.enrollments.byStatus.COMPLETED, color: '#4f46e5' },
    { label: 'Đã ngừng học', value: snapshot.enrollments.byStatus.DROPPED, color: '#64748b' },
    { label: 'Đã hủy', value: snapshot.enrollments.byStatus.CANCELLED, color: '#dc2626' },
  ];
  const coursePublication: ChartDatum[] = [
    { label: 'Đã xuất bản', value: snapshot.courses.published, color: '#4f46e5' },
    { label: 'Bản nháp', value: snapshot.courses.draft, color: '#cbd5e1' },
  ];

  return (
    <div className="report-print-root space-y-7">
      <header className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-start lg:p-8">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.16em] text-indigo-600">
              Báo cáo quản trị
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Báo cáo hệ thống
            </h1>
            <p className="mt-2 max-w-2xl text-slate-600">
              Tổng quan vận hành và hoạt động gần đây từ dữ liệu thực của hệ thống.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <Clock3 aria-hidden="true" className="text-indigo-600" size={18} />
            <span>
              Cập nhật lúc <strong>{new Date(report.generatedAt).toLocaleString('vi-VN')}</strong>
            </span>
          </div>
        </div>

        <div className="border-t border-slate-200 bg-slate-50/80 p-5 lg:p-6">
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-950">
            <CalendarDays aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
            <p>
              <strong>Tổng quan hiện tại</strong> phản ánh trạng thái tại thời điểm tải báo cáo. Bộ
              lọc ngày chỉ ảnh hưởng đến <strong>hoạt động trong khoảng thời gian đã chọn</strong>.
            </p>
          </div>
          <div className="report-toolbar report-no-print grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="mb-3 text-sm font-bold text-slate-700">Chọn nhanh khoảng thời gian</p>
              <div className="flex flex-wrap gap-2" aria-label="Khoảng thời gian nhanh">
                {[7, 30, 90].map((days) => (
                  <button
                    className="min-w-20 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:border-indigo-400 hover:text-indigo-700"
                    key={days}
                    onClick={() => selectPreset(days as 7 | 30 | 90)}
                    type="button"
                  >
                    {days} ngày
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="mb-3 text-sm font-bold text-slate-700">Thao tác báo cáo</p>
              <div className="report-toolbar-actions flex flex-wrap gap-2">
                <ToolbarButton icon={RefreshCw} label="Làm mới" onClick={retry} />
                <ToolbarButton
                  icon={Download}
                  label="Xuất CSV"
                  onClick={() => downloadAdminReportCsv(report)}
                />
                <ToolbarButton icon={Printer} label="In / Lưu PDF" onClick={() => window.print()} />
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-2">
              <p className="mb-3 text-sm font-bold text-slate-700">Khoảng ngày tùy chỉnh</p>
              <div className="grid max-w-3xl gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                <label className="text-sm font-semibold text-slate-700">
                  Từ ngày
                  <input
                    className="mt-1 block w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2.5"
                    max={draft.to}
                    onChange={(event) =>
                      setDraft((value) => ({ ...value, from: event.target.value }))
                    }
                    type="date"
                    value={draft.from}
                  />
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Đến ngày
                  <input
                    className="mt-1 block w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2.5"
                    min={draft.from}
                    onChange={(event) =>
                      setDraft((value) => ({ ...value, to: event.target.value }))
                    }
                    type="date"
                    value={draft.to}
                  />
                </label>
                <button
                  className="min-w-28 whitespace-nowrap rounded-xl bg-indigo-600 px-5 py-2.5 font-bold text-white"
                  onClick={apply}
                  type="button"
                >
                  Áp dụng
                </button>
              </div>
            </div>
          </div>
          {validation ? (
            <p className="mt-3 text-sm font-semibold text-red-700" role="alert">
              {validation}
            </p>
          ) : null}
          {loading ? (
            <p className="mt-3 text-sm font-semibold text-indigo-700" role="status">
              Đang cập nhật...
            </p>
          ) : null}
          {error ? (
            <div className="report-no-print mt-3 flex flex-wrap items-center gap-3" role="alert">
              <p className="text-sm text-red-700">
                Không thể cập nhật. Dữ liệu gần nhất vẫn được giữ lại.
              </p>
              <button
                className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-bold text-red-700"
                onClick={retry}
                type="button"
              >
                Thử lại
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <section aria-labelledby="snapshot-heading" className="space-y-5">
        <SectionHeading
          eyebrow="Trạng thái tại thời điểm tải"
          id="snapshot-heading"
          subtitle="Năm chỉ số điều hành cốt lõi, không phụ thuộc khoảng ngày đã chọn."
          title="Tổng quan hiện tại"
        />
        <div
          aria-label="Chỉ số tổng quan hiện tại"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          <Metric
            action="Xem tài khoản"
            detail={`${snapshot.accounts.byRole.STUDENT} học viên · ${snapshot.accounts.byRole.INSTRUCTOR} giảng viên · ${snapshot.accounts.byRole.ADMIN_COORDINATOR} điều phối`}
            href="/admin/accounts"
            icon={Users}
            title="Tài khoản"
            tone="indigo"
            value={snapshot.accounts.total}
          />
          <Metric
            action="Xem khóa học"
            detail={`${snapshot.courses.published} xuất bản · ${snapshot.courses.draft} bản nháp`}
            href="/admin/courses"
            icon={BookOpen}
            title="Khóa học"
            tone="sky"
            value={snapshot.courses.total}
          />
          <Metric
            action="Xem lớp học"
            detail={`${snapshot.classes.byStatus.OPEN} đang mở · ${snapshot.classes.byStatus.IN_PROGRESS} đang diễn ra`}
            href="/admin/class-offerings"
            icon={School}
            title="Lớp học"
            tone="violet"
            value={snapshot.classes.total}
          />
          <Metric
            action="Xem vận hành lớp"
            detail="Chỉ tính các ghi danh đang có hiệu lực."
            href="/admin/class-offerings"
            icon={UserCheck}
            title="Ghi danh đang hiệu lực"
            tone="emerald"
            value={snapshot.enrollments.byStatus.ACTIVE}
          />
          <Metric
            action="Xem lớp học"
            detail="Yêu cầu đang chờ xử lý; không đồng nghĩa đã thanh toán hoặc giữ chỗ."
            href="/admin/class-offerings"
            icon={Clock3}
            title="Chờ xử lý đăng ký có phí"
            tone="amber"
            value={snapshot.enrollments.byStatus.PENDING_PAYMENT}
          />
        </div>
      </section>

      <section
        aria-labelledby="attention-heading"
        className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-amber-100 p-2 text-amber-800">
            <AlertTriangle aria-hidden="true" size={20} />
          </span>
          <div>
            <h2 className="text-lg font-black text-slate-950" id="attention-heading">
              Cần chú ý
            </h2>
            <p className="text-sm text-slate-600">
              Các điểm cần xử lý theo trạng thái vận hành hiện tại.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          <Attention
            label="Lớp nháp chưa sẵn sàng"
            meaning="Thiếu một hoặc nhiều điều kiện để mở lớp."
            value={report.attention.draftNotReady}
          />
          <Attention
            label="Lớp đang mở đã đủ sĩ số"
            meaning="Số học viên đang học đã đạt giới hạn của lớp."
            value={report.attention.openFull}
          />
          <Attention
            label="Đăng ký có phí đang chờ xử lý"
            meaning="Yêu cầu đăng ký có phí đang chờ được xử lý."
            value={report.attention.pendingPayment}
          />
        </div>
      </section>

      <section aria-labelledby="snapshot-visuals-heading" className="space-y-5">
        <SectionHeading
          id="snapshot-visuals-heading"
          subtitle="Biểu đồ tóm tắt luôn đi kèm chú giải và số lượng dạng văn bản."
          title="Tình hình vận hành"
        />
        <div className="grid items-start gap-5 2xl:grid-cols-2">
          <ChartCard
            action="Xem lớp học"
            href="/admin/class-offerings"
            subtitle={`${snapshot.classes.total} lớp trên toàn hệ thống`}
            title="Lớp học theo trạng thái"
          >
            <SegmentedBar ariaLabel="Lớp học theo trạng thái" data={classLifecycle} />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <MiniBreakdown
                rows={[
                  ['Sẵn sàng mở', snapshot.classes.draftReadiness.ready],
                  ['Chưa sẵn sàng', snapshot.classes.draftReadiness.notReady],
                ]}
                title="Mức độ sẵn sàng của lớp nháp"
              />
              <MiniBreakdown
                rows={[
                  ['Còn chỗ', snapshot.classes.openRegistration.AVAILABLE],
                  ['Đã đầy', snapshot.classes.openRegistration.FULL],
                  ['Sắp mở', snapshot.classes.openRegistration.UPCOMING],
                  ['Đã đóng', snapshot.classes.openRegistration.CLOSED],
                ]}
                title="Tình trạng đăng ký của lớp đang mở"
              />
            </div>
          </ChartCard>
          <ChartCard
            action="Xem vận hành lớp"
            href="/admin/class-offerings"
            subtitle={`${snapshot.enrollments.total} ghi danh hiện có`}
            title="Ghi danh theo trạng thái"
          >
            <DonutChart
              ariaLabel="Ghi danh theo trạng thái"
              centerLabel="ghi danh"
              data={enrollmentComposition}
            />
            <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              Các đăng ký có phí đang chờ xử lý chưa được tính vào sĩ số đang học và chưa được xem
              là đã thanh toán.
            </p>
          </ChartCard>
          <ChartCard
            action="Xem tài khoản"
            href="/admin/accounts"
            subtitle={`${snapshot.accounts.total} tài khoản theo vai trò và trạng thái`}
            title="Tài khoản theo vai trò và trạng thái"
          >
            <AccountCompositionChart report={report} />
          </ChartCard>
          <ChartCard
            action="Xem khóa học"
            href="/admin/courses"
            subtitle={`${snapshot.courses.published} trên ${snapshot.courses.total} khóa học đã xuất bản`}
            title="Trạng thái khóa học"
          >
            <SegmentedBar
              ariaLabel="Tỷ lệ khóa học đã xuất bản và bản nháp"
              data={coursePublication}
            />
            <div className="mt-5 flex items-center gap-4 rounded-2xl bg-indigo-50 p-5 text-indigo-950">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white text-indigo-700 shadow-sm">
                <CheckCircle2 aria-hidden="true" size={30} />
              </span>
              <p className="text-base leading-6">
                <strong className="block text-3xl font-black">
                  {snapshot.courses.total
                    ? Math.round((snapshot.courses.published / snapshot.courses.total) * 100)
                    : 0}
                  %
                </strong>
                khóa học hiện đã được xuất bản.
              </p>
            </div>
          </ChartCard>
        </div>
      </section>

      <section aria-labelledby="period-activity-heading" className="space-y-5">
        <SectionHeading
          eyebrow={`${report.activity.period.from} – ${report.activity.period.to} · Giờ Việt Nam (UTC+7)`}
          id="period-activity-heading"
          subtitle="Các hoạt động được ghi nhận trong khoảng ngày đã chọn."
          title="Hoạt động trong khoảng thời gian đã chọn"
        />
        <div aria-label="Tổng hoạt động" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ActivityTotal
            icon={GraduationCap}
            label="Ghi danh mới"
            source="Theo ngày ghi danh"
            value={report.activity.totals.newEnrollments}
          />
          <ActivityTotal
            icon={Activity}
            label="Bài đánh giá đã nộp"
            source="Chỉ tính bài đã nộp"
            value={report.activity.totals.submittedAssessments}
          />
          <ActivityTotal
            icon={CheckCircle2}
            label="Bài học hoàn tất"
            source="Chỉ tính bài học đã hoàn tất"
            value={report.activity.totals.lessonCompletions}
          />
        </div>
        <section
          aria-labelledby="trend-heading"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        >
          <div className="mb-4">
            <h3 className="text-xl font-black" id="trend-heading">
              Xu hướng hoạt động theo ngày
            </h3>
            <p className="text-sm text-slate-500">
              Biểu đồ thể hiện số hoạt động phát sinh theo từng ngày trong khoảng thời gian đã chọn.
            </p>
          </div>
          <ActivityTrendChart report={report} />
          {report.activity.totals.newEnrollments +
            report.activity.totals.submittedAssessments +
            report.activity.totals.lessonCompletions ===
          0 ? (
            <p className="mt-4 rounded-xl bg-slate-100 p-4 text-sm text-slate-700">
              Không ghi nhận hoạt động thuộc ba nhóm này trong khoảng thời gian đã chọn.
            </p>
          ) : null}
        </section>
      </section>

      <section
        aria-labelledby="daily-heading"
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 p-5 sm:p-6">
          <div>
            <h2 className="text-xl font-black" id="daily-heading">
              Chi tiết theo ngày
            </h2>
            <p className="text-sm text-slate-500">
              Đầy đủ {report.activity.period.days} ngày; ngày gần nhất hiển thị trước.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
            Dữ liệu chi tiết
          </span>
        </div>
        <div className="report-daily-scroll max-h-[30rem] overflow-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 shadow-sm">
              <tr>
                <th className="p-3">Ngày</th>
                <th className="p-3">Ghi danh mới</th>
                <th className="p-3">Bài đánh giá đã nộp</th>
                <th className="p-3">Bài học hoàn tất</th>
              </tr>
            </thead>
            <tbody>
              {[...report.activity.daily].reverse().map((row) => (
                <tr className="border-t border-slate-100 even:bg-slate-50/60" key={row.date}>
                  <th className="p-3 font-semibold">{row.date}</th>
                  <td className="p-3">{row.newEnrollments}</td>
                  <td className="p-3">{row.submittedAssessments}</td>
                  <td className="p-3">{row.lessonCompletions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
        <strong className="text-slate-900">Cách đọc báo cáo:</strong> Các số liệu ở phần tình hình
        hiện tại phản ánh trạng thái mới nhất của hệ thống. Phần hoạt động chỉ tính dữ liệu trong
        khoảng ngày đã chọn. Các đăng ký có phí đang chờ xử lý chưa được tính vào sĩ số đang học và
        chưa được xem là đã thanh toán. Báo cáo tạo lúc{' '}
        {new Date(report.generatedAt).toLocaleString('vi-VN')}.
      </footer>
    </div>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex min-w-28 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:border-indigo-400 hover:text-indigo-700"
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden="true" size={17} />
      {label}
    </button>
  );
}

function SectionHeading({
  eyebrow,
  id,
  subtitle,
  title,
}: {
  eyebrow?: string;
  id: string;
  subtitle: string;
  title: string;
}) {
  return (
    <div>
      {eyebrow ? (
        <p className="text-sm font-black tracking-[0.08em] text-indigo-600">{eyebrow}</p>
      ) : null}
      <h2
        className={
          eyebrow
            ? 'mt-1 text-2xl font-black tracking-tight text-slate-950'
            : 'text-2xl font-black tracking-tight text-slate-950'
        }
        id={id}
      >
        {title}
      </h2>
      <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
    </div>
  );
}

const metricTones = {
  indigo: 'bg-indigo-50 text-indigo-700',
  sky: 'bg-sky-50 text-sky-700',
  violet: 'bg-violet-50 text-violet-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
};

function Metric({
  title,
  value,
  detail,
  href,
  action,
  icon: Icon,
  tone,
}: {
  title: string;
  value: number;
  detail: string;
  href: string;
  action: string;
  icon: LucideIcon;
  tone: keyof typeof metricTones;
}) {
  return (
    <article className="group flex min-h-56 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md">
      <div className={`mb-5 w-fit rounded-xl p-2.5 ${metricTones[tone]}`}>
        <Icon aria-hidden="true" size={21} />
      </div>
      <h3 className="text-base font-bold leading-6 text-slate-700">{title}</h3>
      <p className="mt-2 text-4xl font-black tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 flex-1 text-sm leading-6 text-slate-500">{detail}</p>
      <Link
        className="report-no-print mt-4 text-sm font-bold text-indigo-700 group-hover:underline"
        to={href}
      >
        {action} →
      </Link>
    </article>
  );
}

function Attention({ label, meaning, value }: { label: string; meaning: string; value: number }) {
  return (
    <Link
      className="group grid grid-cols-[auto_1fr] gap-3 rounded-xl border border-amber-200 bg-white p-4 transition hover:border-amber-400 hover:shadow-sm"
      to="/admin/class-offerings"
    >
      <strong className="text-3xl font-black text-amber-800">{value}</strong>
      <span>
        <span className="block font-bold text-slate-900">{label}</span>
        <span className="mt-1 block text-sm leading-5 text-slate-600">{meaning}</span>
        <span className="report-no-print mt-2 block text-sm font-bold text-indigo-700 group-hover:underline">
          Mở vận hành lớp →
        </span>
      </span>
    </Link>
  );
}

function ChartCard({
  title,
  subtitle,
  href,
  action,
  children,
}: {
  title: string;
  subtitle: string;
  href: string;
  action: string;
  children: ReactNode;
}) {
  return (
    <article className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-950">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <Link
          className="report-no-print shrink-0 text-sm font-bold text-indigo-700 hover:underline"
          to={href}
        >
          {action} →
        </Link>
      </div>
      {children}
    </article>
  );
}

function MiniBreakdown({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <h4 className="text-sm font-black text-slate-600">{title}</h4>
      <dl className="mt-3 space-y-2">
        {rows.map(([label, value]) => (
          <div className="flex justify-between gap-3 text-sm" key={label}>
            <dt>{label}</dt>
            <dd className="font-black">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ActivityTotal({
  icon: Icon,
  label,
  value,
  source,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  source: string;
}) {
  return (
    <article className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className="rounded-xl bg-indigo-50 p-3 text-indigo-700">
        <Icon aria-hidden="true" size={22} />
      </span>
      <div>
        <h3 className="text-sm font-bold text-slate-600">{label}</h3>
        <p className="text-3xl font-black text-slate-950">{value}</p>
        <p className="text-sm text-slate-500">{source}</p>
      </div>
    </article>
  );
}
