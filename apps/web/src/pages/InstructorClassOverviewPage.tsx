import { Link, useOutletContext } from 'react-router';
import type { InstructorClassWorkspaceContext } from '@/layouts/InstructorClassWorkspaceLayout';

const stageLabel: Record<string, string> = {
  PERIODIC: 'Thường kỳ',
  MIDTERM: 'Giữa kỳ',
  FINAL: 'Cuối kỳ',
};
export function InstructorClassOverviewPage() {
  const { overview } = useOutletContext<InstructorClassWorkspaceContext>();
  const base = `/instructor/classes/${overview.classOffering.id}`;
  const activeAssessments = overview.assessments.filter(
    (item) => item.availability !== 'CLOSED',
  ).length;
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border bg-white p-6 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-wider text-indigo-600">
          Không gian giảng dạy
        </p>
        <h2 className="mt-2 text-3xl font-bold">Tổng quan lớp</h2>
        <p className="mt-2 text-slate-600">
          Tình trạng hiện tại, việc cần xử lý và các mốc sắp tới.
        </p>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Học viên" value={overview.activeLearnerCount} detail="đang học" />
        <Metric
          label="Tiến độ lớp"
          value={`${overview.lessonProgress.percentage}%`}
          detail={`${overview.lessonProgress.completed}/${overview.lessonProgress.total} lượt bài học`}
        />
        <Metric label="Bài đang/sắp mở" value={activeAssessments} />
        <Link to={`${base}/grading`}>
          <Metric
            label="Cần chấm"
            value={overview.pendingGradingCount}
            detail="Mở danh sách chấm →"
            accent="amber"
          />
        </Link>
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <Panel title="Phân bố tiến độ" caption={`${overview.activeLearnerCount} học viên đang học`}>
          {overview.progressBuckets.map((bucket) => (
            <div
              className="mt-3 grid grid-cols-[64px_1fr_30px] items-center gap-3 text-sm"
              key={bucket.label}
            >
              <span>{bucket.label}</span>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-indigo-600"
                  style={{
                    width: `${overview.activeLearnerCount ? (bucket.count / overview.activeLearnerCount) * 100 : 0}%`,
                  }}
                />
              </div>
              <strong>{bucket.count}</strong>
            </div>
          ))}
        </Panel>
        <Panel
          title="Tình trạng chấm"
          caption={`${overview.grading.final + overview.grading.partial + overview.grading.waiting} bài nộp có phần thi cần theo dõi`}
        >
          <div
            className="mt-4 flex h-5 overflow-hidden rounded-full bg-slate-100"
            aria-label="Thành phần trạng thái chấm"
          >
            {(['final', 'partial', 'waiting'] as const).map((key) => (
              <div
                className={
                  key === 'final'
                    ? 'bg-emerald-500'
                    : key === 'partial'
                      ? 'bg-indigo-500'
                      : 'bg-amber-400'
                }
                key={key}
                style={{
                  width: `${(overview.grading[key] / Math.max(1, overview.grading.final + overview.grading.partial + overview.grading.waiting)) * 100}%`,
                }}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <span>{overview.grading.final} đã chấm đủ</span>
            <span>{overview.grading.partial} đang chấm</span>
            <span>{overview.grading.waiting} chờ chấm</span>
          </div>
        </Panel>
      </section>
      <Panel title="Bài kiểm tra cần chú ý" caption="Số liệu theo học viên đang học trong lớp">
        <div className="mt-4 grid gap-3">
          {overview.assessments.map((a) => (
            <Link
              className="rounded-xl border p-4 hover:border-indigo-300"
              key={a.id}
              to={`${base}/assessments`}
            >
              <div className="flex flex-wrap justify-between gap-2">
                <strong>{a.test.title}</strong>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-semibold ${a.availability === 'OPEN' ? 'bg-indigo-50 text-indigo-700' : a.availability === 'UPCOMING' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}
                >
                  {stageLabel[a.stage] ?? a.stage} ·{' '}
                  {a.availability === 'OPEN'
                    ? 'Đang mở'
                    : a.availability === 'UPCOMING'
                      ? 'Sắp mở'
                      : 'Đã đóng'}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                {formatDate(a.openAt)} → {formatDate(a.closeAt)}
              </p>
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <span>
                  <strong>{a.submittedLearnerCount}</strong> đã nộp
                </span>
                <span>
                  <strong>{a.inProgressLearnerCount}</strong> đang làm
                </span>
                <span>
                  <strong>{a.notSubmittedLearnerCount}</strong> chưa nộp
                </span>
              </div>
            </Link>
          ))}
          {!overview.assessments.length && <p className="text-slate-500">Chưa có lịch kiểm tra.</p>}
        </div>
      </Panel>
      <section className="grid gap-6 lg:grid-cols-2">
        <Panel title="Cần theo dõi" caption="Chỉ hiển thị trạng thái có thể hành động">
          {overview.followUps.length ? (
            <ul className="mt-3 space-y-2">
              {overview.followUps.map((item) => (
                <li className="rounded-lg bg-amber-50 p-3 text-sm" key={item.kind}>
                  <strong>{item.count}</strong> {item.label}{' '}
                  {item.kind === 'GRADING' && (
                    <Link className="ml-2 font-semibold text-indigo-700" to={`${base}/grading`}>
                      Xử lý →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-emerald-700">Không có việc tồn đọng cần chú ý.</p>
          )}
        </Panel>
        <Panel title="Mốc sắp tới" caption="Thời gian mở/đóng đã thiết lập">
          <ol className="mt-3 space-y-2">
            {overview.upcomingDeadlines.map((item) => (
              <li className="flex gap-3 text-sm" key={`${item.assessmentId}-${item.kind}`}>
                <time className="whitespace-nowrap font-semibold">{formatDate(item.at)}</time>
                <span>
                  {item.kind === 'OPEN' ? 'Mở' : 'Đóng'} · {item.title}
                </span>
              </li>
            ))}
            {!overview.upcomingDeadlines.length && (
              <li className="text-sm text-slate-500">Chưa có mốc sắp tới.</li>
            )}
          </ol>
        </Panel>
      </section>
    </div>
  );
}
function Metric({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string | number;
  detail?: string;
  accent?: string;
}) {
  return (
    <div className="h-full rounded-2xl border bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p
        className={`mt-2 text-3xl font-bold ${accent === 'amber' ? 'text-amber-700' : 'text-indigo-700'}`}
      >
        {value}
      </p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}
function Panel({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-white p-5">
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="text-sm text-slate-500">{caption}</p>
      {children}
    </section>
  );
}
function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(
        new Date(value),
      )
    : 'Không giới hạn';
}
