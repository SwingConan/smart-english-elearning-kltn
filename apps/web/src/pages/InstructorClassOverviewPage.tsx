import { useState } from 'react';
import { Link, useOutletContext } from 'react-router';
import type { InstructorClassWorkspaceContext } from '@/layouts/InstructorClassWorkspaceLayout';

const stageLabel: Record<string, string> = {
  PERIODIC: 'Thường kỳ',
  MIDTERM: 'Giữa kỳ',
  FINAL: 'Cuối kỳ',
};
export function InstructorClassOverviewPage() {
  const { overview } = useOutletContext<InstructorClassWorkspaceContext>();
  const [drilldown, setDrilldown] = useState<null | {
    title: string;
    caption: string;
    rows: Array<{ key: string; primary: string; secondary: string; href?: string }>;
  }>(null);
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
          detail={`${overview.lessonProgress.completed}/${overview.lessonProgress.total} lượt hoàn thành (${overview.activeLearnerCount} học viên × ${overview.activeLearnerCount ? overview.lessonProgress.total / overview.activeLearnerCount : 0} bài)`}
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
            <button
              className="mt-3 grid grid-cols-[64px_1fr_30px] items-center gap-3 text-sm"
              key={bucket.label}
              onClick={() => setDrilldown({
                title: `Tiến độ ${bucket.label}`,
                caption: `${bucket.count} học viên trong khoảng tiến độ này`,
                rows: (bucket.learners ?? []).map((item) => ({
                  key: item.enrollmentId,
                  primary: item.learner.fullName,
                  secondary: `${item.completedLessons}/${item.totalLessons} bài · Hoạt động gần nhất ${formatDate(item.lastActivityAt)}`,
                  href: `${base}/learners/${item.enrollmentId}`,
                })),
              })}
              type="button"
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
            </button>
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
            {([
              ['FINAL', overview.grading.final, 'đã chấm đủ'],
              ['PARTIAL', overview.grading.partial, 'đang chấm'],
              ['WAITING', overview.grading.waiting, 'chờ chấm'],
            ] as const).map(([state, count, label]) => (
              <button className="font-semibold text-indigo-700 underline" key={state} onClick={() => setDrilldown({
                title: `Bài nộp ${label}`,
                caption: `${count} lượt làm`,
                rows: (overview.grading.attempts ?? []).filter((item) => item.state === state).map((item) => ({
                  key: item.attemptId,
                  primary: `${item.learner.fullName} · ${item.assessmentTitle}`,
                  secondary: `Lượt ${item.attemptNumber} · ${formatDate(item.submittedAt)}`,
                  href: item.assessmentId ? `${base}/assessments/${item.assessmentId}/attempts/${item.attemptId}/grading` : undefined,
                })),
              })} type="button">{count} {label}</button>
            ))}
          </div>
        </Panel>
      </section>
      <Panel title="Bài kiểm tra cần chú ý" caption="Số liệu theo học viên đang học trong lớp">
        <div className="mt-4 grid gap-3">
          {overview.assessments.map((a) => (
            <article
              className="rounded-xl border p-4 hover:border-indigo-300"
              key={a.id}
            >
              <div className="flex flex-wrap justify-between gap-2">
                <Link className="font-bold text-indigo-800" to={`${base}/assessments`}>{a.test.title}</Link>
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
                <button className="font-semibold text-indigo-700 underline" onClick={() => setDrilldown(assessmentDrilldown(a, 'SUBMITTED', base))} type="button">
                  <strong>{a.submittedLearnerCount}</strong> đã nộp
                </button>
                <button className="font-semibold text-indigo-700 underline" onClick={() => setDrilldown(assessmentDrilldown(a, 'IN_PROGRESS', base))} type="button">
                  <strong>{a.inProgressLearnerCount}</strong> đang làm
                </button>
                <button className="font-semibold text-indigo-700 underline" onClick={() => setDrilldown(assessmentDrilldown(a, 'NOT_SUBMITTED', base))} type="button">
                  <strong>{a.notSubmittedLearnerCount}</strong> chưa nộp
                </button>
              </div>
            </article>
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
                  {item.kind === 'INACTIVE' && (
                    <button className="ml-2 font-semibold text-indigo-700 underline" onClick={() => setDrilldown({
                      title: 'Học viên cần theo dõi',
                      caption: 'Không có hoạt động học tập trong ít nhất 7 ngày',
                      rows: (item.learners ?? []).map((learner) => ({
                        key: learner.enrollmentId,
                        primary: learner.learner.fullName,
                        secondary: `Hoạt động gần nhất ${formatDate(learner.lastActivityAt)} · ${learner.completedLessons}/${learner.totalLessons} bài`,
                        href: `${base}/learners/${learner.enrollmentId}`,
                      })),
                    })} type="button">Xem học viên →</button>
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
            {overview.upcomingDeadlines.map((item) => {
              const [title, ...subtitle] = item.title.split(' — ');
              return <li className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-xl border bg-slate-50 p-3 text-sm" key={`${item.assessmentId}-${item.kind}`}>
                <time className="self-start rounded-lg bg-white px-2 py-1 text-center font-semibold shadow-sm" dateTime={item.at}>{formatDate(item.at)}</time>
                <div className="min-w-0">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${item.kind === 'OPEN' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{item.kind === 'OPEN' ? 'Mở' : 'Đóng'}</span>
                  <strong className="mt-1 block break-words">{title}</strong>
                  {subtitle.length ? <span className="mt-0.5 block break-words text-xs text-slate-500">{subtitle.join(' — ')}</span> : null}
                </div>
              </li>;
            })}
            {!overview.upcomingDeadlines.length && (
              <li className="text-sm text-slate-500">Chưa có mốc sắp tới.</li>
            )}
          </ol>
        </Panel>
      </section>
      {drilldown ? <DrilldownDialog detail={drilldown} onClose={() => setDrilldown(null)} /> : null}
    </div>
  );
}

function assessmentDrilldown(
  assessment: InstructorClassWorkspaceContext['overview']['assessments'][number],
  state: 'SUBMITTED' | 'IN_PROGRESS' | 'NOT_SUBMITTED',
  base: string,
) {
  const labels = { SUBMITTED: 'đã nộp', IN_PROGRESS: 'đang làm', NOT_SUBMITTED: 'chưa nộp' };
  const rows = (assessment.learners ?? []).filter((item) => item.state === state);
  return {
    title: `${assessment.test.title} · ${labels[state]}`,
    caption: `${rows.length}/${assessment.activeLearnerCount} học viên`,
    rows: rows.map((item) => ({
      key: item.enrollmentId,
      primary: item.learner.fullName,
      secondary: `${item.completedLessons}/${item.totalLessons} bài · ${item.learner.email}`,
      href: `${base}/learners/${item.enrollmentId}`,
    })),
  };
}

function DrilldownDialog({ detail, onClose }: { detail: { title: string; caption: string; rows: Array<{ key: string; primary: string; secondary: string; href?: string }> }; onClose: () => void }) {
  return <div aria-label={detail.title} aria-modal="true" className="fixed inset-0 z-50 flex justify-end bg-slate-950/40" role="dialog">
    <section className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold">{detail.title}</h2><p className="text-sm text-slate-500">{detail.caption}</p></div><button className="rounded border px-3 py-2" onClick={onClose} type="button">Đóng</button></div>
      <div className="mt-5 space-y-3">{detail.rows.map((row) => <article className="rounded-xl border p-4" key={row.key}><strong>{row.primary}</strong><p className="mt-1 text-sm text-slate-500">{row.secondary}</p>{row.href ? <Link className="mt-2 inline-block font-semibold text-indigo-700" to={row.href}>Mở chi tiết →</Link> : null}</article>)}{detail.rows.length === 0 ? <p className="rounded bg-slate-50 p-4 text-sm text-slate-500">Không có học viên trong nhóm này.</p> : null}</div>
    </section>
  </div>;
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
