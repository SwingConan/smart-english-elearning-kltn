import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toeicSkillLabel } from '@/features/assessments/display';
import type { ToeicSkill } from '@/features/assessments/types';
import { instructorApi } from '@/features/instructor/api';
import type { InstructorLearnerDetail } from '@/features/instructor/types';
import { SkillTrendChart } from '@/components/SkillTrendChart';
import { formatTrendNumber } from '@/components/trend-format';
export function InstructorLearnerDetailPage() {
  const { classOfferingId = '', enrollmentId = '' } = useParams();
  const [data, setData] = useState<InstructorLearnerDetail | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    void instructorApi.classes
      .learner(classOfferingId, enrollmentId, c.signal)
      .then((loaded) => { setData(loaded); setError(false); })
      .catch((cause: unknown) => { if (!(cause instanceof Error && cause.name === 'AbortError')) setError(true); });
    return () => c.abort();
  }, [classOfferingId, enrollmentId]);
  const groups = useMemo(() => {
    const map = new Map<string, { title: string; attempts: InstructorLearnerDetail['attempts'] }>();
    for (const attempt of data?.attempts ?? []) {
      const key = attempt.classAssessment?.id ?? attempt.id;
      const group = map.get(key) ?? {
        title: attempt.classAssessment?.test.title ?? 'Bài kiểm tra',
        attempts: [],
      };
      group.attempts.push(attempt);
      map.set(key, group);
    }
    return [...map.values()];
  }, [data]);
  if (error)
    return (
      <div className="state-error">
        Không thể tải hồ sơ học viên hoặc bạn không có quyền truy cập.
      </div>
    );
  if (!data) return <div className="h-64 animate-pulse rounded-2xl bg-slate-200" />;
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-6">
        <Link
          className="text-sm font-semibold text-indigo-700"
          to={`/instructor/classes/${classOfferingId}/learners`}
        >
          ← Danh sách học viên
        </Link>
        <div className="mt-3 flex flex-wrap justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">{data.enrollment.learner.fullName}</h2>
            <p className="text-slate-500">{data.enrollment.learner.email}</p>
          </div>
          <span className="h-fit rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">
            {data.enrollment.status === 'ACTIVE' ? 'Đang học' : data.enrollment.status}
          </span>
        </div>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-4">
          <Summary
            label="Hoàn thành"
            value={`${data.summary.completedLessons}/${data.summary.totalLessons} bài`}
          />
          <Summary label="Bài đã nộp" value={data.summary.submittedAssessmentCount} />
          <Summary label="Chờ chấm" value={data.summary.pendingGradingCount} />
          <Summary label="Hoạt động gần nhất" value={formatDate(data.summary.lastActivityAt)} />
        </dl>
      </section>
      <section className="rounded-2xl border bg-white p-5">
        <h3 className="font-bold">Kết quả 4 kỹ năng gần nhất</h3>
        {data.latestFourSkillSnapshot ? (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {data.latestFourSkillSnapshot.scores.map((score) => (
              <div className="rounded-xl bg-indigo-50 p-3" key={score.skill}>
                <strong>{toeicSkillLabel[score.skill as ToeicSkill]}</strong>
                <p className="text-xl font-bold text-indigo-700">{formatTrendNumber(score.normalizedScore)}%</p>
                <div className="mt-2 h-2 rounded bg-indigo-100">
                  <div
                    className="h-full bg-indigo-600"
                    style={{ width: `${score.normalizedScore}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-slate-500">
            Chưa có cùng một bài được chấm hoàn tất đủ bốn kỹ năng.
          </p>
        )}
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <Panel title="Tiến độ theo mô-đun" caption="Tổng hợp toàn bộ bài học của khóa.">
          {data.moduleProgress.map((module) => (
            <div className="mt-3" key={module.id}>
              <div className="flex justify-between text-sm">
                <strong>{module.title}</strong>
                <span>
                  {module.completed}/{module.total} · {module.percentage}%
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded bg-slate-100">
                <div className="h-full bg-indigo-600" style={{ width: `${module.percentage}%` }} />
              </div>
            </div>
          ))}
        </Panel>
        <Panel title="Hoạt động gần đây" caption="Từ lịch sử bài học, bài nộp và kết quả chấm.">
          <ol className="mt-3 space-y-3">
            {data.recentActivity.map((item, index) => (
              <li
                className="border-l-2 border-indigo-200 pl-3 text-sm"
                key={`${item.type}-${item.at}-${index}`}
              >
                <strong>{activityLabel(item.type)}</strong>
                <p>{item.label}</p>
                <time className="text-xs text-slate-500">{formatDate(item.at)}</time>
              </li>
            ))}
            {!data.recentActivity.length && (
              <li className="text-sm text-slate-500">Chưa ghi nhận hoạt động học tập.</li>
            )}
          </ol>
        </Panel>
      </section>
      <Panel
        title={data.skillTrend.length === 2 ? 'So sánh 2 đợt kiểm tra gần nhất' : 'Xu hướng kỹ năng'}
        caption={data.skillTrend.length === 2 ? 'So sánh điểm nội bộ 0–100 giữa hai đợt đã chấm hoàn tất. Đây là kết quả bài làm, không phải điểm TOEIC hoặc khẳng định năng lực thực tế; dữ liệu thiếu được để trống.' : 'Điểm nội bộ 0–100 theo từng đợt kiểm tra đã chấm hoàn tất. Đây là diễn biến kết quả bài làm, không phải điểm TOEIC hoặc khẳng định năng lực thực tế; dữ liệu thiếu được để trống.'}
      >
        {data.skillTrend.length ? <SkillTrendChart points={data.skillTrend.map((point) => ({ id: point.attemptId, title: point.assessmentTitle, date: point.date, values: Object.fromEntries(point.scores.map((score) => [score.skill, { score: score.normalizedScore }])) }))} /> : <p className="mt-3 text-sm text-slate-500">Chưa có điểm cuối để hiển thị xu hướng.</p>}
      </Panel>
      <Panel title="Lịch sử bài kiểm tra" caption="Lượt gần nhất mở sẵn; các đợt cũ được thu gọn.">
        <div className="mt-3 space-y-3">
          {groups.map((group, index) => (
            <details
              className="rounded-xl border bg-slate-50 p-3"
              key={group.title}
              open={index === 0}
            >
              <summary className="cursor-pointer font-semibold">
                {group.title} · {group.attempts.length} lượt
              </summary>
              {group.attempts.map((attempt) => (
                <article className="mt-3 rounded-lg bg-white p-3" key={attempt.id}>
                  <div className="flex justify-between">
                    <b>Lượt {attempt.attemptNumber}</b>
                    <time className="text-xs text-slate-500">
                      {formatDate(attempt.submittedAt)}
                    </time>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {attempt.skillScores.map((score) => (
                      <span className="rounded-full border px-2 py-1 text-xs" key={score.skill}>
                        {toeicSkillLabel[score.skill as ToeicSkill]}:{' '}
                        {score.status === 'FINAL' ? `${formatTrendNumber(score.normalizedScore)}%` : 'Đang chờ'}
                      </span>
                    ))}
                  </div>
                  {[...new Set(attempt.feedback?.map((item) => item.feedback).filter(Boolean))].map(
                    (feedback) => (
                      <p className="mt-2 text-sm text-slate-600" key={feedback}>
                        Nhận xét: {feedback}
                      </p>
                    ),
                  )}
                </article>
              ))}
            </details>
          ))}
        </div>
      </Panel>
    </div>
  );
}
function Summary({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 font-bold">{value}</dd>
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
      <h3 className="font-bold">{title}</h3>
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
    : 'Chưa ghi nhận';
}
function activityLabel(type: string) {
  return (
    (
      {
        LESSON_COMPLETED: 'Hoàn thành bài học',
        LESSON_ACCESSED: 'Mở bài học',
        ASSESSMENT_SUBMITTED: 'Nộp bài kiểm tra',
        GRADING_FINAL: 'Có kết quả chấm',
      } as Record<string, string>
    )[type] ?? 'Hoạt động'
  );
}
