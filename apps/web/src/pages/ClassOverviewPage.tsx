import { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, ClipboardList, UserRound } from 'lucide-react';
import { Link, useOutletContext, useParams } from 'react-router';
import { assessmentTypeLabel } from '@/features/assessments/display';
import type { ClassShellContext } from '@/layouts/ClassShellLayout';
import { learningApi } from '@/features/learning/api';
import type { CourseContent, CourseProgress } from '@/features/learning/types';

export function ClassOverviewPage() {
  const { enrollment } = useOutletContext<ClassShellContext>();
  const { enrollmentId = '' } = useParams();
  const [data, setData] = useState<{ content: CourseContent; progress: CourseProgress } | null>(
    null,
  );
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      learningApi.getContent(enrollmentId, controller.signal),
      learningApi.getProgress(enrollmentId, controller.signal),
    ])
      .then(([content, progress]) => {
        setData({ content, progress });
        setState('ready');
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setState('error');
      });
    return () => controller.abort();
  }, [enrollmentId, reload]);
  if (state === 'loading')
    return <div className="h-72 animate-pulse rounded-2xl bg-white" role="status" />;
  if (state === 'error' || !data)
    return (
      <div className="state-error">
        Không thể tải tổng quan lớp.
        <button
          className="ml-3 font-semibold underline"
          onClick={() => setReload((value) => value + 1)}
          type="button"
        >
          Thử lại
        </button>
      </div>
    );
  const lessons = data.content.modules.flatMap((module) => module.lessons);
  const next = lessons.find((lesson) => lesson.progressStatus !== 'COMPLETED') ?? lessons[0];
  const pendingAssessments = data.progress.assessments.filter(
    (item) => item.status !== 'COMPLETED',
  );
  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-indigo-950 p-7 text-white">
        <p className="text-sm font-semibold text-indigo-200">Tổng quan lớp</p>
        <h2 className="mt-2 text-3xl font-bold">{enrollment.classOffering.name}</h2>
        <p className="mt-2 text-indigo-100">
          Bạn đã hoàn thành {data.progress.completedLessons}/{data.progress.totalLessons} bài học.
        </p>
        {next ? (
          <Link
            className="btn-light mt-6"
            to={`/student/enrollments/${enrollmentId}/lessons/${next.id}`}
          >
            Tiếp tục: {next.title} <ArrowRight size={17} />
          </Link>
        ) : null}
      </section>
      <div className="grid gap-5 md:grid-cols-3">
        <Metric label="Tiến độ tổng" value={`${data.progress.progressPercent}%`} />
        <Metric
          label="Bài đã hoàn thành"
          value={`${data.progress.completedLessons}/${data.progress.totalLessons}`}
        />
        <Metric label="Bài kiểm tra cần làm" value={String(pendingAssessments.length)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border bg-white p-6">
          <h2 className="text-xl font-bold">Thông tin lớp</h2>
          <dl className="mt-5 space-y-4 text-sm">
            <Info
              icon={UserRound}
              label="Giảng viên"
              value={enrollment.classOffering.instructor?.fullName ?? 'Đang cập nhật'}
            />
            <Info
              icon={CalendarDays}
              label="Lịch học"
              value={
                enrollment.classOffering.scheduleSlots.length
                  ? `${enrollment.classOffering.scheduleSlots.length} buổi/tuần`
                  : 'Đang cập nhật'
              }
            />
          </dl>
        </section>
        <section className="rounded-2xl border bg-white p-6">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <ClipboardList size={20} />
            Bài kiểm tra
          </h2>
          {pendingAssessments.length ? (
            <div className="mt-4 space-y-3">
              {pendingAssessments.slice(0, 3).map((item) => (
                <div className="rounded-xl bg-slate-50 p-4" key={item.id}>
                  <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-800">
                    {assessmentTypeLabel(item.purpose, item.stage)}
                  </span>
                  <p className="mt-2 font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {item.status === 'IN_PROGRESS' ? 'Đang làm' : 'Chưa bắt đầu'}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-600">Không có bài kiểm tra đang chờ.</p>
          )}
          <Link
            className="mt-4 inline-block font-semibold text-indigo-700"
            to={`/student/enrollments/${enrollmentId}/tests`}
          >
            Mở danh sách bài kiểm tra →
          </Link>
        </section>
      </div>
      <section className="rounded-2xl border bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Nội dung chương trình</h2>
          <Link
            className="font-semibold text-indigo-700"
            to={`/student/enrollments/${enrollmentId}/learn`}
          >
            Xem nội dung học tập
          </Link>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {data.content.modules.map((module) => (
            <article className="rounded-xl bg-slate-50 p-4" key={module.id}>
              <p className="text-xs font-bold text-indigo-700">HỌC PHẦN {module.orderIndex + 1}</p>
              <h3 className="mt-2 font-bold">{module.title}</h3>
              <p className="mt-1 text-sm text-slate-500">{module.lessons.length} bài học</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-indigo-700">{value}</p>
    </div>
  );
}
function Info({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3">
      <Icon className="text-indigo-600" size={19} />
      <div>
        <dt className="text-slate-500">{label}</dt>
        <dd className="mt-1 font-semibold">{value}</dd>
      </div>
    </div>
  );
}
