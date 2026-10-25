import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Award,
  BookOpenCheck,
  CalendarCheck,
  CheckCircle2,
  CircleAlert,
  Target,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { SkillTrendChart, type SkillTrendPoint } from '@/components/SkillTrendChart';
import {
  PageContainer,
  PageHeader,
  SectionHeader,
  StatusBadge,
  Timeline,
} from '@/components/ui/ProductPrimitives';
import type { LearningReport, ReportSkill } from '@/features/reports/api';
import { reportApi } from '@/features/reports/api';
import { deriveSkillInsights } from '@/lib/learning-report-insights';

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
const assessmentState: Record<string, { label: string; tone: 'success' | 'warning' | 'info' }> = {
  FINAL: { label: 'Đã có kết quả cuối', tone: 'success' },
  PENDING_REVIEW: { label: 'Đang chờ duyệt', tone: 'warning' },
  IN_PROGRESS: { label: 'Đang thực hiện', tone: 'info' },
};

export function LearningReportPage() {
  const { enrollmentId = '' } = useParams();
  const [report, setReport] = useState<LearningReport | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const load = useCallback(() => {
    setState('loading');
    return reportApi
      .get(enrollmentId)
      .then((data) => {
        setReport(data);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, [enrollmentId]);

  useEffect(() => {
    let active = true;
    void reportApi
      .get(enrollmentId)
      .then((data) => {
        if (!active) return;
        setReport(data);
        setState('ready');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [enrollmentId]);

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
      .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
  }, [report]);

  if (state === 'loading') return <p role="status">Đang tổng hợp báo cáo học tập…</p>;
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
  const insights = deriveSkillInsights(report.skillTrend);
  const firstIncompleteLesson = lessons.find((lesson) => lesson.status !== 'COMPLETED');
  const nextAction = getNextAction(report, enrollmentId, firstIncompleteLesson?.id);

  return (
    <PageContainer className="space-y-10">
      <PageHeader
        eyebrow="Bức tranh học tập"
        title="Báo cáo học tập"
        description={`${report.enrollment.course.title} · ${report.enrollment.classOffering.name}. Chỉ điểm đã chấm cuối được dùng để so sánh kỹ năng.`}
        actions={
          <Link className="btn-primary" to={nextAction.to}>
            {nextAction.label} <ArrowRight size={17} />
          </Link>
        }
      />

      <section aria-label="Tổng quan điều hành việc học">
        <SectionHeader
          title="Tổng quan điều hành việc học"
          description="Các chỉ số dùng mẫu số và trạng thái riêng; thiếu dữ liệu không được quy đổi thành 0%."
        />
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SnapshotCard
            icon={<BookOpenCheck size={20} />}
            label="Hoàn thành bài học"
            value={`${completedLessons}/${lessons.length} · ${report.completion.evidence.lesson.percent}%`}
          />
          <SnapshotCard
            icon={<Target size={20} />}
            label="Kết quả đánh giá"
            value={`${completedAssessments}/${report.assessments.length} đã có kết quả cuối`}
          />
          <SnapshotCard
            icon={<CalendarCheck size={20} />}
            label="Điểm danh"
            value={
              report.attendance.percent === null
                ? `${report.attendance.markedSessions}/${report.attendance.totalSessions} buổi đã ghi nhận · chưa đủ dữ liệu tỷ lệ`
                : `${report.attendance.markedSessions}/${report.attendance.totalSessions} buổi đã ghi nhận · ${report.attendance.percent}% trên các buổi đã ghi nhận`
            }
          />
          <SnapshotCard
            icon={<Award size={20} />}
            label="Sẵn sàng hoàn thành"
            value={
              report.completion.eligible
                ? 'Đã đạt điều kiện hiện tại'
                : 'Còn điều kiện cần hoàn tất'
            }
          />
          <SnapshotCard
            label="Kỹ năng mạnh nhất"
            value={
              insights.strongest
                ? `${skillLabels[insights.strongest.skill]} · ${insights.strongest.score}%`
                : 'Chưa có điểm cuối'
            }
          />
          <SnapshotCard
            label="Kỹ năng cần ưu tiên"
            value={
              insights.weakest
                ? `${skillLabels[insights.weakest.skill]} · ${insights.weakest.score}%`
                : 'Chưa có điểm cuối'
            }
          />
          <SnapshotCard label="Hành động tiếp theo" value={nextAction.label} />
        </div>
      </section>

      <section className="rounded-3xl border bg-white p-6 shadow-sm">
        <SectionHeader
          title="Nhận định từ dữ liệu hiện tại"
          description="Được tính cố định từ điểm FINAL hiện tại và lần FINAL liền trước, không dùng nội dung AI tạo sinh."
        />
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InsightCard
            icon={<Award />}
            title="Mạnh nhất"
            value={
              insights.strongest
                ? `${skillLabels[insights.strongest.skill]} · ${insights.strongest.score}%`
                : 'Chưa đủ dữ liệu'
            }
          />
          <InsightCard
            icon={<Target />}
            title="Cần ưu tiên"
            value={
              insights.weakest
                ? `${skillLabels[insights.weakest.skill]} · ${insights.weakest.score}%`
                : 'Chưa đủ dữ liệu'
            }
          />
          <InsightCard
            icon={<ArrowUpRight />}
            title="Tiến bộ rõ nhất"
            value={
              insights.improving
                ? `${skillLabels[insights.improving.skill]} · +${insights.improving.delta} điểm`
                : 'Chưa có mức tăng để so sánh'
            }
          />
          <InsightCard
            icon={<ArrowDownRight />}
            title="Thay đổi mới nhất"
            value={
              insights.latestChange
                ? `${skillLabels[insights.latestChange.skill]} · ${insights.latestChange.delta! > 0 ? '+' : ''}${insights.latestChange.delta} điểm`
                : 'Cần ít nhất hai kết quả FINAL cùng kỹ năng'
            }
            warning={Boolean(insights.latestChange && insights.latestChange.delta! < 0)}
          />
        </div>
      </section>

      <section>
        <SectionHeader
          title="Hiệu suất theo kỹ năng"
          description="Điểm phần trăm chuẩn hóa của từng kỹ năng. Chọn kỹ năng trên biểu đồ để ẩn hoặc hiện chuỗi dữ liệu."
        />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {skills.map((skill) => {
            const current = insights.current.find((item) => item.skill === skill);
            const pending = report.skillTrend.some(
              (row) => row.skill === skill && row.status !== 'FINAL',
            );
            return (
              <div className="rounded-2xl border bg-white p-5" key={skill}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-600">{skillLabels[skill]}</p>
                  {current?.delta !== null && current?.delta !== undefined ? (
                    <StatusBadge tone={current.delta >= 0 ? 'success' : 'danger'}>
                      {current.delta > 0 ? '+' : ''}
                      {current.delta} điểm
                    </StatusBadge>
                  ) : null}
                </div>
                <strong className="mt-3 block text-2xl">
                  {current ? `${current.score}%` : pending ? 'Đang chờ duyệt' : 'Chưa có dữ liệu'}
                </strong>
                <p className="mt-1 text-xs text-slate-500">
                  {current
                    ? 'Kết quả FINAL gần nhất'
                    : 'Không dùng giá trị 0 thay cho dữ liệu thiếu'}
                </p>
              </div>
            );
          })}
        </div>
        {trend.length > 0 ? (
          <SkillTrendChart points={trend} />
        ) : (
          <p className="state-empty mt-5">Chưa có điểm kỹ năng cuối để vẽ xu hướng.</p>
        )}
      </section>

      <section>
        <SectionHeader
          title="Tiến độ học phần"
          description="Mở từng học phần để xem chi tiết; thanh tiến độ chỉ tính bài học đã hoàn thành."
        />
        <div className="mt-5 space-y-4">
          {report.modules.map((module) => {
            const completed = module.lessons.filter(
              (lesson) => lesson.status === 'COMPLETED',
            ).length;
            const percent = module.lessons.length
              ? Math.round((completed / module.lessons.length) * 100)
              : 0;
            return (
              <details className="group rounded-2xl border bg-white p-5" key={module.id}>
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-bold">{module.title}</h3>
                      <p className="text-sm text-slate-500">
                        {completed}/{module.lessons.length} bài đã hoàn thành
                      </p>
                    </div>
                    <strong>{percent}%</strong>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-indigo-600"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </summary>
                <ul className="mt-5 divide-y border-t">
                  {module.lessons.map((lesson) => (
                    <li className="flex items-center justify-between gap-3 py-3" key={lesson.id}>
                      <span>{lesson.title}</span>
                      <StatusBadge
                        tone={
                          lesson.status === 'COMPLETED'
                            ? 'success'
                            : lesson.status === 'IN_PROGRESS'
                              ? 'info'
                              : 'neutral'
                        }
                      >
                        {lesson.status === 'COMPLETED'
                          ? 'Đã hoàn thành'
                          : lesson.status === 'IN_PROGRESS'
                            ? 'Đang học'
                            : 'Chưa bắt đầu'}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      </section>

      <section>
        <SectionHeader
          title="Dòng thời gian đánh giá"
          description="Kết quả chờ duyệt được ghi rõ và không tham gia tính điểm kỹ năng cuối."
        />
        <div className="mt-5 rounded-3xl border bg-white p-6">
          {report.assessments.length ? (
            <Timeline
              items={report.assessments
                .slice()
                .sort(
                  (a, b) =>
                    new Date(a.submittedAt ?? a.startedAt).getTime() -
                    new Date(b.submittedAt ?? b.startedAt).getTime(),
                )
                .map((item) => {
                  const status = assessmentState[item.resultState];
                  return {
                    id: item.id,
                    title: item.test.title,
                    meta: <StatusBadge tone={status.tone}>{status.label}</StatusBadge>,
                    tone:
                      item.resultState === 'FINAL' ? ('success' as const) : ('warning' as const),
                    description: (
                      <>
                        <p>
                          {assessmentStage(item.classAssessment?.stage)} ·{' '}
                          {assessmentPurpose(item.test.purpose)} ·{' '}
                          {formatDate(item.submittedAt ?? item.startedAt)}
                        </p>
                        {item.resultState === 'FINAL' &&
                        item.score !== null &&
                        item.score !== undefined ? (
                          <p className="mt-1 font-semibold">
                            Điểm cuối: {item.score}
                            {item.maxScore ? `/${item.maxScore}` : ''}
                          </p>
                        ) : item.resultState === 'PENDING_REVIEW' ? (
                          <p className="mt-1 text-amber-800">
                            Đang chờ giảng viên duyệt; chưa được tính vào xu hướng.
                          </p>
                        ) : null}
                      </>
                    ),
                  };
                })}
            />
          ) : (
            <p className="state-empty">Chưa có lần đánh giá nào.</p>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border bg-white p-6">
          <SectionHeader
            title="Điều kiện còn thiếu"
            description="Mỗi điều kiện phản ánh trực tiếp dữ liệu hoàn thành hiện tại."
          />
          {report.completion.unmet.length ? (
            <ul className="mt-5 space-y-3">
              {report.completion.unmet.map((code) => (
                <li className="flex gap-3 rounded-2xl bg-amber-50 p-4 text-amber-950" key={code}>
                  <CircleAlert className="mt-0.5 shrink-0" size={19} />
                  <div>
                    <p>{unmetLabels[code] ?? 'Còn điều kiện chưa hoàn tất.'}</p>
                    <Link
                      className="mt-2 inline-flex items-center gap-1 font-bold text-indigo-700"
                      to={blockerAction(code, enrollmentId).to}
                    >
                      {blockerAction(code, enrollmentId).label} <ArrowRight size={15} />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-5 flex gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-900">
              <CheckCircle2 className="shrink-0" /> Đã đáp ứng các điều kiện hiện tại.
            </div>
          )}
        </div>

        <div className="rounded-3xl border bg-white p-6">
          <SectionHeader
            title="Khuyến nghị tiếp theo"
            description="Ưu tiên hành động gắn với dữ liệu yếu hoặc điều kiện còn thiếu."
          />
          <div className="mt-5 space-y-3">
            {report.recommendations.length ? (
              report.recommendations.map((item) => (
                <article className="rounded-2xl bg-indigo-50 p-4" key={item.id}>
                  <strong>{item.title}</strong>
                  <p className="mt-1 text-sm text-slate-700">{item.actionText}</p>
                  <Link
                    className="mt-3 inline-flex items-center gap-1 font-bold text-indigo-700"
                    to={
                      item.lessonId
                        ? `/student/enrollments/${enrollmentId}/lessons/${item.lessonId}`
                        : `/student/enrollments/${enrollmentId}/recommendations`
                    }
                  >
                    Thực hiện ngay <ArrowRight size={15} />
                  </Link>
                </article>
              ))
            ) : (
              <div className="rounded-2xl bg-indigo-50 p-4">
                <strong>
                  {insights.weakest
                    ? `Ưu tiên kỹ năng ${skillLabels[insights.weakest.skill]}`
                    : nextAction.label}
                </strong>
                <p className="mt-1 text-sm text-slate-700">
                  Dựa trên kết quả FINAL và các điều kiện hoàn thành đang có.
                </p>
                <Link
                  className="mt-3 inline-flex items-center gap-1 font-bold text-indigo-700"
                  to={nextAction.to}
                >
                  Mở hành động <ArrowRight size={15} />
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>
    </PageContainer>
  );
}

function SnapshotCard({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-indigo-700">
        {icon}
        <p className="text-sm font-semibold text-slate-600">{label}</p>
      </div>
      <strong className="mt-3 block leading-6 text-slate-950">{value}</strong>
    </div>
  );
}

function InsightCard({
  icon,
  title,
  value,
  warning = false,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-4 ${warning ? 'bg-rose-50 text-rose-950' : 'bg-slate-50 text-slate-950'}`}
    >
      <span className={warning ? 'text-rose-600' : 'text-indigo-600'}>{icon}</span>
      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
      <strong className="mt-1 block">{value}</strong>
    </div>
  );
}

function getNextAction(report: LearningReport, enrollmentId: string, lessonId?: string) {
  const first = report.completion.unmet[0];
  if (first === 'LESSON_PROGRESS_BELOW_POLICY') {
    return {
      label: 'Tiếp tục bài học',
      to: lessonId
        ? `/student/enrollments/${enrollmentId}/lessons/${lessonId}`
        : `/student/enrollments/${enrollmentId}/learn`,
    };
  }
  if (first?.startsWith('ATTENDANCE'))
    return { label: 'Kiểm tra điểm danh', to: `/student/enrollments/${enrollmentId}/attendance` };
  if (first?.startsWith('FINAL_ASSESSMENT'))
    return { label: 'Mở bài kiểm tra', to: `/student/enrollments/${enrollmentId}/tests` };
  if (!first)
    return {
      label: 'Kiểm tra cấp chứng chỉ',
      to: `/student/enrollments/${enrollmentId}/certificate`,
    };
  return { label: 'Xem tổng quan lớp', to: `/student/enrollments/${enrollmentId}` };
}

function blockerAction(code: string, enrollmentId: string) {
  if (code === 'LESSON_PROGRESS_BELOW_POLICY')
    return { label: 'Mở nội dung học tập', to: `/student/enrollments/${enrollmentId}/learn` };
  if (code.startsWith('ATTENDANCE'))
    return { label: 'Xem điểm danh', to: `/student/enrollments/${enrollmentId}/attendance` };
  if (code.startsWith('FINAL_ASSESSMENT'))
    return { label: 'Xem bài kiểm tra', to: `/student/enrollments/${enrollmentId}/tests` };
  return { label: 'Xem tổng quan lớp', to: `/student/enrollments/${enrollmentId}` };
}

function assessmentStage(stage?: string) {
  if (stage === 'FINAL') return 'Cuối khóa';
  if (stage === 'MIDTERM') return 'Giữa khóa';
  return 'Định kỳ';
}

function assessmentPurpose(purpose: string) {
  if (purpose === 'PLACEMENT') return 'Đầu vào';
  if (purpose === 'PRACTICE_MOCK') return 'Luyện tập';
  return 'Trong lớp';
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('vi-VN');
}
