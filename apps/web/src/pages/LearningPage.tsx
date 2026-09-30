import { useEffect, useState } from 'react';
import { BookOpen, CheckCircle2, ChevronRight, Circle } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { learningApi } from '@/features/learning/api';
import type { CourseContent } from '@/features/learning/types';

export function LearningPage() {
  const { enrollmentId = '' } = useParams();
  const [content, setContent] = useState<CourseContent | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void learningApi
      .getContent(enrollmentId, controller.signal)
      .then((data) => {
        setContent(data);
        setState('ready');
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setState('error');
      });
    return () => controller.abort();
  }, [enrollmentId, reload]);
  if (state === 'loading')
    return (
      <div className="space-y-4" role="status">
        {[1, 2, 3].map((item) => (
          <div className="h-40 animate-pulse rounded-2xl bg-white" key={item} />
        ))}
      </div>
    );
  if (state === 'error' || !content)
    return (
      <div className="state-error">
        Không thể tải nội dung lớp.
        <button
          className="ml-3 font-semibold underline"
          onClick={() => setReload((value) => value + 1)}
          type="button"
        >
          Thử lại
        </button>
      </div>
    );
  return (
    <section>
      <div className="rounded-2xl border bg-white p-6">
        <p className="eyebrow">Nội dung chương trình</p>
        <h2 className="mt-2 text-3xl font-bold">Nội dung học tập</h2>
        <p className="mt-3 text-slate-600">
          Mở từng Lesson bằng đường dẫn riêng để theo dõi trạng thái và điều hướng bài trước/bài
          tiếp theo.
        </p>
      </div>
      {content.modules.length === 0 ? (
        <div className="state-empty mt-6">
          <BookOpen className="mx-auto text-indigo-600" />
          <p className="mt-3">Khóa học chưa có nội dung được công bố.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {content.modules.map((module) => (
            <article className="overflow-hidden rounded-2xl border bg-white" key={module.id}>
              <header className="border-b bg-slate-50 p-5">
                <p className="text-xs font-bold text-indigo-700">
                  HỌC PHẦN {module.orderIndex + 1}
                </p>
                <h2 className="mt-1 text-xl font-bold">{module.title}</h2>
                {module.description ? (
                  <p className="mt-2 text-sm text-slate-600">{module.description}</p>
                ) : null}
              </header>
              <ul className="divide-y">
                {module.lessons.map((lesson) => (
                  <li key={lesson.id}>
                    <Link
                      className="flex items-center gap-4 p-4 transition hover:bg-indigo-50"
                      to={`/student/enrollments/${enrollmentId}/lessons/${lesson.id}`}
                    >
                      {lesson.progressStatus === 'COMPLETED' ? (
                        <CheckCircle2 className="shrink-0 text-emerald-600" size={20} />
                      ) : (
                        <Circle className="shrink-0 text-slate-400" size={20} />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{lesson.title}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {lesson.resourceCount} tài liệu · {statusLabel(lesson.progressStatus)}
                        </p>
                      </div>
                      <ChevronRight className="text-slate-400" size={20} />
                    </Link>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
function statusLabel(status: string) {
  return status === 'COMPLETED'
    ? 'Đã hoàn thành'
    : status === 'IN_PROGRESS'
      ? 'Đang học'
      : 'Chưa học';
}
