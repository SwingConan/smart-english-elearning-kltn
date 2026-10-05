import { useEffect, useState } from 'react';
import { Award } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { assessmentTypeLabel } from '@/features/assessments/display';
import { learningApi } from '@/features/learning/api';
import type { CourseProgress } from '@/features/learning/types';

export function ClassResultsPage() {
  const { enrollmentId = '' } = useParams();
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void learningApi
      .getProgress(enrollmentId, controller.signal)
      .then(setProgress)
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(true);
      });
    return () => controller.abort();
  }, [enrollmentId]);
  if (error) return <div className="state-error">Không thể tải danh sách kết quả.</div>;
  if (!progress) return <div className="h-60 animate-pulse rounded-2xl bg-white" role="status" />;
  const completed = progress.assessments.flatMap((assessment) =>
    assessment.submittedAttempts
      .filter((attempt) => attempt.resultAvailable)
      .map((attempt) => ({ assessment, attempt })),
  );
  return (
    <section>
      <div className="rounded-2xl border bg-white p-6">
        <p className="eyebrow">Kết quả bài kiểm tra</p>
        <h2 className="mt-2 text-3xl font-bold">Kết quả</h2>
        <p className="mt-3 text-slate-600">
          Các bài đã nộp và được phép công bố sẽ xuất hiện tại đây.
        </p>
      </div>
      {completed.length === 0 ? (
        <div className="state-empty mt-6">
          <Award className="mx-auto text-indigo-600" />
          <p className="mt-3">Chưa có kết quả được công bố.</p>
          <Link
            className="mt-3 inline-block font-semibold text-indigo-700"
            to={`/student/enrollments/${enrollmentId}/tests`}
          >
            Mở bài kiểm tra
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {completed.map(({ assessment, attempt }) => (
            <article className="rounded-2xl border bg-white p-5" key={attempt.attemptId}>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-800">
                  {assessmentTypeLabel(assessment.purpose, assessment.stage)}
                </span>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                  Đã nộp
                </span>
              </div>
              <h3 className="mt-2 text-lg font-bold">{assessment.title}</h3>
              <p className="mt-1 text-sm font-semibold text-slate-700">
                Lượt {attempt.attemptNumber}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                {attempt.submittedAt
                  ? `Nộp lúc ${new Date(attempt.submittedAt).toLocaleString('vi-VN')}`
                  : 'Đã hoàn thành'}
              </p>
              <Link
                className="btn-secondary mt-4"
                to={`/student/enrollments/${enrollmentId}/attempts/${attempt.attemptId}/result`}
              >
                Xem chi tiết
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
