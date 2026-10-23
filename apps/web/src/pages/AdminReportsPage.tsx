import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { adminApi } from '@/features/admin/api';
import {
  reportPreset,
  type ReportPeriodInput,
  validateReportPeriod,
} from '@/features/admin/reporting-period';
import type { AdminSystemReport } from '@/features/admin/types';
import { useAdminSessionExpiry } from '@/features/admin/use-admin-session-expiry';

const roleLabels = {
  STUDENT: 'Học viên',
  INSTRUCTOR: 'Giảng viên',
  ADMIN_COORDINATOR: 'Điều phối viên',
} as const;
const statusLabels = {
  DRAFT: 'Bản nháp',
  OPEN: 'Đang mở',
  IN_PROGRESS: 'Đang diễn ra',
  COMPLETED: 'Đã hoàn thành',
  CANCELLED: 'Đã hủy',
} as const;

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
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-wider text-indigo-600">UC43</p>
        <h1 className="text-3xl font-black text-slate-950">Báo cáo hệ thống</h1>
        <p className="mt-2 text-slate-600">Tổng quan vận hành từ dữ liệu hiện tại của hệ thống.</p>
        <p className="mt-3 rounded-xl bg-indigo-50 p-4 text-sm text-indigo-950">
          Bộ lọc thời gian chỉ áp dụng cho Hoạt động trong kỳ; Tổng quan hiện tại luôn phản ánh
          trạng thái ở thời điểm tải báo cáo.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Cập nhật lúc {new Date(report.generatedAt).toLocaleString('vi-VN')}.
        </p>
      </header>

      <section aria-labelledby="snapshot-heading" className="space-y-6">
        <div>
          <h2 className="text-2xl font-black" id="snapshot-heading">
            Tổng quan hiện tại
          </h2>
          <p className="text-sm text-slate-600">
            Ảnh chụp trạng thái hiện tại, không phụ thuộc khoảng thời gian bên dưới.
          </p>
        </div>

        <section
          aria-label="Chỉ số tổng quan hiện tại"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
        >
          <Metric
            title="Tài khoản"
            value={snapshot.accounts.total}
            detail={`${snapshot.accounts.byRole.STUDENT} học viên · ${snapshot.accounts.byRole.INSTRUCTOR} giảng viên`}
            href="/admin/accounts"
            action="Xem tài khoản"
          />
          <Metric
            title="Khóa học"
            value={snapshot.courses.total}
            detail={`${snapshot.courses.published} đã xuất bản`}
            href="/admin/courses"
            action="Xem khóa học"
          />
          <Metric
            title="Lớp học"
            value={snapshot.classes.total}
            detail={`${snapshot.classes.byStatus.OPEN} đang mở · ${snapshot.classes.byStatus.IN_PROGRESS} đang diễn ra`}
            href="/admin/class-offerings"
            action="Xem lớp học"
          />
          <Metric
            title="Ghi danh đang hoạt động"
            value={snapshot.enrollments.byStatus.ACTIVE}
            detail="Chỉ Enrollment trạng thái ACTIVE."
            href="/admin/class-offerings"
            action="Xem vận hành lớp"
          />
          <Metric
            title="Chờ xử lý đăng ký có phí"
            value={snapshot.enrollments.byStatus.PENDING_PAYMENT}
            detail="Hàng đợi vận hành; không đồng nghĩa đã thanh toán, thanh toán thành công, giữ chỗ hay doanh thu."
            href="/admin/class-offerings"
            action="Xem lớp học"
          />
        </section>

        <section
          aria-labelledby="attention-heading"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-5"
        >
          <h2 className="text-xl font-black" id="attention-heading">
            Cần chú ý
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Attention
              href="/admin/class-offerings"
              label="Lớp nháp chưa sẵn sàng"
              value={report.attention.draftNotReady}
            />
            <Attention
              href="/admin/class-offerings"
              label="Lớp đang mở đã đầy"
              value={report.attention.openFull}
            />
            <Attention
              href="/admin/class-offerings"
              label="Ghi danh PENDING_PAYMENT · điểm vào vận hành lớp hiện có"
              value={report.attention.pendingPayment}
            />
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <Breakdown
            title="Tài khoản theo vai trò"
            rows={Object.entries(roleLabels).map(([key, label]) => [
              label,
              snapshot.accounts.byRole[key as keyof typeof roleLabels],
            ])}
            href="/admin/accounts"
          />
          <Breakdown
            title="Tài khoản theo trạng thái"
            rows={[
              ['Đang hoạt động', snapshot.accounts.byStatus.ACTIVE],
              ['Không hoạt động', snapshot.accounts.byStatus.INACTIVE],
              ['Đã khóa', snapshot.accounts.byStatus.LOCKED],
            ]}
            href="/admin/accounts"
          />
          <Breakdown
            title="Khóa học"
            rows={[
              ['Đã xuất bản', snapshot.courses.published],
              ['Bản nháp', snapshot.courses.draft],
            ]}
            href="/admin/courses"
          />
          <Breakdown
            title="Lớp học theo trạng thái"
            rows={Object.entries(statusLabels).map(([key, label]) => [
              label,
              snapshot.classes.byStatus[key as keyof typeof statusLabels],
            ])}
            href="/admin/class-offerings"
          />
          <Breakdown
            title="Mức sẵn sàng của lớp nháp"
            rows={[
              ['Sẵn sàng', snapshot.classes.draftReadiness.ready],
              ['Chưa sẵn sàng', snapshot.classes.draftReadiness.notReady],
            ]}
            href="/admin/class-offerings"
          />
          <Breakdown
            title="Đăng ký lớp đang mở"
            rows={[
              ['Có thể đăng ký', snapshot.classes.openRegistration.AVAILABLE],
              ['Đã đầy', snapshot.classes.openRegistration.FULL],
              ['Sắp mở', snapshot.classes.openRegistration.UPCOMING],
              ['Đã đóng', snapshot.classes.openRegistration.CLOSED],
            ]}
            href="/admin/class-offerings"
          />
          <Breakdown
            title="Ghi danh theo trạng thái"
            rows={[
              ['Đang học', snapshot.enrollments.byStatus.ACTIVE],
              ['Chờ thanh toán', snapshot.enrollments.byStatus.PENDING_PAYMENT],
              ['Hoàn thành', snapshot.enrollments.byStatus.COMPLETED],
              ['Đã rời', snapshot.enrollments.byStatus.DROPPED],
              ['Đã hủy', snapshot.enrollments.byStatus.CANCELLED],
            ]}
            href="/admin/class-offerings"
          />
        </div>

        <p className="rounded-xl bg-slate-200 p-4 text-sm text-slate-700">
          “Chờ thanh toán” chỉ là trạng thái ghi danh; báo cáo không suy diễn thanh toán thành công
          hay doanh thu.
        </p>
      </section>

      <section aria-labelledby="period-activity-heading" className="space-y-6">
        <div>
          <h2 className="text-2xl font-black" id="period-activity-heading">
            Hoạt động trong kỳ
          </h2>
          <p className="text-sm text-slate-600">
            Các sự kiện có timestamp thực được ghi nhận trong khoảng ngày đã chọn.
          </p>
        </div>

        <section
          aria-labelledby="period-heading"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold" id="period-heading">
                Khoảng hoạt động
              </h3>
              <p className="text-sm text-slate-500">
                Tối đa 90 ngày, tính cả ngày bắt đầu và kết thúc.
              </p>
            </div>
            <div className="flex gap-2">
              {[7, 30, 90].map((days) => (
                <button
                  className="rounded-lg border px-3 py-2 text-sm font-semibold"
                  key={days}
                  onClick={() => selectPreset(days as 7 | 30 | 90)}
                  type="button"
                >
                  {days} ngày
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="text-sm font-semibold">
              Từ ngày
              <input
                className="mt-1 block w-full rounded-lg border px-3 py-2"
                max={draft.to}
                onChange={(event) => setDraft((value) => ({ ...value, from: event.target.value }))}
                type="date"
                value={draft.from}
              />
            </label>
            <label className="text-sm font-semibold">
              Đến ngày
              <input
                className="mt-1 block w-full rounded-lg border px-3 py-2"
                min={draft.from}
                onChange={(event) => setDraft((value) => ({ ...value, to: event.target.value }))}
                type="date"
                value={draft.to}
              />
            </label>
            <button
              className="rounded-lg bg-indigo-600 px-4 py-2 font-bold text-white"
              onClick={apply}
              type="button"
            >
              Áp dụng
            </button>
          </div>
          {validation ? (
            <p className="mt-2 text-sm font-semibold text-red-700" role="alert">
              {validation}
            </p>
          ) : null}
          {loading ? (
            <p className="mt-2 text-sm text-indigo-700" role="status">
              Đang cập nhật...
            </p>
          ) : null}
          {error ? (
            <div className="mt-3 flex flex-wrap items-center gap-3" role="alert">
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
        </section>

        <section aria-label="Tổng hoạt động" className="grid gap-4 sm:grid-cols-3">
          <Metric
            title="Ghi danh mới"
            value={report.activity.totals.newEnrollments}
            detail="Theo enrolledAt"
          />
          <Metric
            title="Bài đánh giá đã nộp"
            value={report.activity.totals.submittedAssessments}
            detail="Chỉ trạng thái SUBMITTED"
          />
          <Metric
            title="Bài học hoàn tất"
            value={report.activity.totals.lessonCompletions}
            detail="Chỉ trạng thái COMPLETED"
          />
        </section>

        <section
          aria-labelledby="activity-heading"
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="p-5">
            <h2 className="text-xl font-black" id="activity-heading">
              Chi tiết theo ngày
            </h2>
            <p className="text-sm text-slate-500">
              {report.activity.period.from} – {report.activity.period.to} (
              {report.activity.period.days} ngày), {report.activity.period.timeZone}.
            </p>
            {report.activity.totals.newEnrollments +
              report.activity.totals.submittedAssessments +
              report.activity.totals.lessonCompletions ===
            0 ? (
              <p className="mt-3 rounded-lg bg-slate-100 p-3 text-sm">
                Không ghi nhận hoạt động thuộc ba nhóm này trong khoảng thời gian đã chọn.
              </p>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-3">Ngày</th>
                  <th className="p-3">Ghi danh mới</th>
                  <th className="p-3">Bài assessment đã nộp</th>
                  <th className="p-3">Bài học hoàn tất</th>
                </tr>
              </thead>
              <tbody>
                {[...report.activity.daily].reverse().map((row) => (
                  <tr className="border-t" key={row.date}>
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
      </section>
    </div>
  );
}

function Metric({
  title,
  value,
  detail,
  href,
  action,
}: {
  title: string;
  value: number;
  detail: string;
  href?: string;
  action?: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold text-slate-500">{title}</h2>
      <p className="mt-2 text-3xl font-black">{value}</p>
      <p className="mt-1 text-sm text-slate-600">{detail}</p>
      {href && action ? (
        <Link
          className="mt-3 inline-block text-sm font-bold text-indigo-700 hover:underline"
          to={href}
        >
          {action}
        </Link>
      ) : null}
    </article>
  );
}

function Attention({ label, value, href }: { label: string; value: number; href?: string }) {
  const content = (
    <>
      <strong className="text-2xl">{value}</strong>
      <span className="text-sm">{label}</span>
    </>
  );
  return href ? (
    <Link
      className="flex flex-col rounded-xl bg-white p-4 hover:ring-2 hover:ring-amber-400"
      to={href}
    >
      {content}
    </Link>
  ) : (
    <div className="flex flex-col rounded-xl bg-white p-4">{content}</div>
  );
}

function Breakdown({
  title,
  rows,
  href,
}: {
  title: string;
  rows: Array<[string, number]>;
  href: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex justify-between gap-3">
        <h2 className="text-xl font-black">{title}</h2>
        <Link className="text-sm font-bold text-indigo-700" to={href}>
          Xem chi tiết
        </Link>
      </div>
      <dl className="mt-4 space-y-2">
        {rows.map(([label, value]) => (
          <div className="flex justify-between border-b py-2 last:border-0" key={label}>
            <dt>{label}</dt>
            <dd className="font-bold">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
