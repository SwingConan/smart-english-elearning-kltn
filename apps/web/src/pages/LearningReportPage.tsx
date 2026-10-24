import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { SkillTrendChart } from '@/components/SkillTrendChart';
import type { SkillTrendPoint } from '@/components/SkillTrendChart';
import type { LearningReport, ReportSkill } from '@/features/reports/api';
import { reportApi } from '@/features/reports/api';

const skills: ReportSkill[] = ['LISTENING', 'READING', 'SPEAKING', 'WRITING'];
const skillLabels: Record<ReportSkill, string> = {
  LISTENING: 'Nghe',
  READING: 'Đọc',
  SPEAKING: 'Nói',
  WRITING: 'Viết',
};
const unmetLabels: Record<string, string> = {
  ENROLLMENT_NOT_ACTIVE: 'Ghi danh không còn ở trạng thái đang học.',
  CLASS_NOT_COMPLETED: 'Lớp học chưa kết thúc.',
  LESSON_PROGRESS_BELOW_POLICY: 'Tiến độ bài học chưa đạt chính sách hoàn thành.',
  ATTENDANCE_UNMARKED: 'Vẫn còn buổi học chưa được điểm danh.',
  ATTENDANCE_BELOW_POLICY: 'Tỷ lệ tham dự chưa đạt yêu cầu.',
  FINAL_ASSESSMENT_NOT_CONFIGURED: 'Lớp chưa có bài đánh giá cuối khóa.',
  FINAL_ASSESSMENT_INCOMPLETE_OR_PENDING: 'Bài cuối khóa chưa hoàn tất hoặc đang chờ duyệt.',
};
const stateLabels = {
  FINAL: 'Đã có kết quả cuối cùng',
  PENDING_REVIEW: 'Đang chờ duyệt',
  IN_PROGRESS: 'Đang làm',
};

export function LearningReportPage() {
  const { enrollmentId = '' } = useParams();
  const [report, setReport] = useState<LearningReport | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const load = useCallback(() => {
    return reportApi
      .get(enrollmentId)
      .then((data) => {
        setReport(data);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, [enrollmentId]);
  useEffect(() => void load(), [load]);

  const trend = useMemo<SkillTrendPoint[]>(() => {
    if (!report) return [];
    return report.assessments
      .filter((attempt) => attempt.submittedAt)
      .map((attempt) => ({
        id: attempt.id,
        title: attempt.test.title,
        date: attempt.submittedAt!,
        values: Object.fromEntries(
          attempt.skillScores
            .filter(
              (score) =>
                score.status === 'FINAL' &&
                score.normalizedScore !== null &&
                score.normalizedScore !== undefined,
            )
            .map((score) => [score.skill, { score: score.normalizedScore! }]),
        ) as SkillTrendPoint['values'],
      }))
      .filter((point) => Object.keys(point.values).length > 0)
      .reverse();
  }, [report]);

  if (state === 'loading') return <p role="status">Đang tổng hợp báo cáo…</p>;
  if (state === 'error' || !report)
    return (
      <div className="state-error" role="alert">
        Chưa thể tải báo cáo.{' '}
        <button className="btn-secondary ml-3" onClick={() => void load()}>
          Thử lại
        </button>
      </div>
    );
  const lessons = report.modules.flatMap((module) => module.lessons);
  const completedLessons = lessons.filter((lesson) => lesson.status === 'COMPLETED').length;
  const completedAssessments = report.assessments.filter(
    (item) => item.resultState === 'FINAL',
  ).length;

  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-2xl font-black">Báo cáo học tập</h2>
        <p className="text-slate-600">
          {report.enrollment.course.title} · {report.enrollment.classOffering.name}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Bài học hoàn thành"
          value={`${completedLessons}/${lessons.length} · ${report.completion.evidence.lesson.percent}%`}
        />
        <Metric
          label="Đánh giá có kết quả"
          value={`${completedAssessments}/${report.assessments.length}`}
        />
        <Metric
          label="Điểm danh"
          value={
            report.attendance.percent === null ? 'Chưa có dữ liệu' : `${report.attendance.percent}%`
          }
        />
        <Metric
          label="Sẵn sàng hoàn thành"
          value={report.completion.eligible ? 'Đạt' : 'Chưa đạt'}
        />
      </div>

      <div>
        <h3 className="text-xl font-bold">Tiến độ theo học phần</h3>
        <div className="mt-4 space-y-4">
          {report.modules.map((module) => (
            <article className="rounded-2xl border bg-white p-5" key={module.id}>
              <h4 className="font-bold">{module.title}</h4>
              <ul className="mt-3 space-y-2">
                {module.lessons.map((lesson) => (
                  <li className="flex justify-between gap-3" key={lesson.id}>
                    <span>{lesson.title}</span>
                    <span>
                      {lesson.status === 'COMPLETED'
                        ? 'Đã hoàn thành'
                        : lesson.status === 'IN_PROGRESS'
                          ? 'Đang học'
                          : 'Chưa bắt đầu'}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xl font-bold">Lịch sử đánh giá</h3>
        {report.assessments.length === 0 ? (
          <p className="state-empty mt-4">Chưa có lần đánh giá nào.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {report.assessments.map((item) => (
              <article className="rounded-2xl border bg-white p-5" key={item.id}>
                <div className="flex flex-wrap justify-between gap-2">
                  <strong>{item.test.title}</strong>
                  <span>{stateLabels[item.resultState]}</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {item.classAssessment?.stage === 'FINAL'
                    ? 'Cuối khóa'
                    : item.classAssessment?.stage === 'MIDTERM'
                      ? 'Giữa khóa'
                      : 'Định kỳ'}{' '}
                  ·{' '}
                  {item.test.purpose === 'PLACEMENT'
                    ? 'Đầu vào'
                    : item.test.purpose === 'PRACTICE_MOCK'
                      ? 'Luyện tập'
                      : 'Trong lớp'}{' '}
                  · {new Date(item.submittedAt ?? item.startedAt).toLocaleString('vi-VN')}
                </p>
                {item.resultState === 'FINAL' && item.score !== null && item.score !== undefined ? (
                  <p className="mt-2 font-semibold">
                    Điểm cuối cùng: {item.score}
                    {item.maxScore ? `/${item.maxScore}` : ''}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-xl font-bold">Kết quả theo kỹ năng</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {skills.map((skill) => {
            const rows = report.skillTrend.filter((row) => row.skill === skill);
            const final = rows.find(
              (row) =>
                row.status === 'FINAL' &&
                row.normalizedScore !== null &&
                row.normalizedScore !== undefined,
            );
            const pending = rows.some((row) => row.status !== 'FINAL');
            return (
              <Metric
                key={skill}
                label={skillLabels[skill]}
                value={
                  final
                    ? `${final.normalizedScore}%`
                    : pending
                      ? 'Đang chờ duyệt'
                      : 'Chưa có dữ liệu'
                }
              />
            );
          })}
        </div>
        {trend.length > 0 ? (
          <SkillTrendChart points={trend} />
        ) : (
          <p className="mt-4 text-slate-500">Chưa có điểm kỹ năng cuối cùng để vẽ xu hướng.</p>
        )}
      </div>

      <div className="rounded-2xl border bg-white p-5">
        <h3 className="text-xl font-bold">Điều kiện hoàn thành</h3>
        <p className="mt-3">
          Bài học tối thiểu: {report.completion.policy.minLessonCompletionPercent}% · Điểm danh tối
          thiểu:{' '}
          {report.completion.policy.minAttendancePercent === null
            ? 'Không áp dụng'
            : `${report.completion.policy.minAttendancePercent}%`}{' '}
          · Bài cuối khóa:{' '}
          {report.completion.policy.requireFinalAssessment ? 'Bắt buộc' : 'Không bắt buộc'}
        </p>
        {report.completion.unmet.length > 0 ? (
          <ul className="mt-4 list-disc space-y-2 pl-6 text-amber-800">
            {report.completion.unmet.map((code) => (
              <li key={code}>{unmetLabels[code] ?? 'Còn điều kiện chưa hoàn tất.'}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-emerald-700">Đã đáp ứng các điều kiện hiện tại.</p>
        )}
      </div>

      <div>
        <h3 className="text-xl font-bold">Gợi ý đang áp dụng</h3>
        {report.recommendations.length === 0 ? (
          <p className="mt-3 text-slate-500">Chưa có gợi ý mới.</p>
        ) : (
          report.recommendations.map((item) => (
            <article className="mt-3 rounded-xl bg-indigo-50 p-4" key={item.id}>
              <strong>{item.title}</strong>
              <p>{item.actionText}</p>
              {item.lessonId ? (
                <Link
                  className="mt-2 inline-block font-semibold text-indigo-700"
                  to={`/student/enrollments/${enrollmentId}/lessons/${item.lessonId}`}
                >
                  Mở bài học →
                </Link>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <strong className="mt-2 block text-xl">{value}</strong>
    </div>
  );
}
