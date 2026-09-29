import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Link2,
  Video,
} from 'lucide-react';
import { Link, useParams } from 'react-router';
import { learningApi } from '@/features/learning/api';
import type { CourseContent, LessonDetail, LessonResource } from '@/features/learning/types';

export function LessonPage() {
  const { enrollmentId = '', lessonId = '' } = useParams();
  const [data, setData] = useState<{ content: CourseContent; lesson: LessonDetail } | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const inFlight = useRef(false);
  const fetchLesson = useCallback(
    async (signal?: AbortSignal) => {
      const [content, lesson] = await Promise.all([
        learningApi.getContent(enrollmentId, signal),
        learningApi.openLesson(enrollmentId, lessonId, signal),
      ]);
      return { content, lesson };
    },
    [enrollmentId, lessonId],
  );
  useEffect(() => {
    const controller = new AbortController();
    void fetchLesson(controller.signal)
      .then((result) => {
        setData(result);
        setState('ready');
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setState('error');
      });
    return () => controller.abort();
  }, [fetchLesson]);
  const navigation = useMemo(() => {
    const lessons = data?.content.modules.flatMap((module) => module.lessons) ?? [];
    const index = lessons.findIndex((lesson) => lesson.id === lessonId);
    return {
      previous: index > 0 ? lessons[index - 1] : null,
      next: index >= 0 && index < lessons.length - 1 ? lessons[index + 1] : null,
    };
  }, [data, lessonId]);
  if (state === 'loading' || data?.lesson.id !== lessonId)
    return <div className="h-96 animate-pulse rounded-2xl bg-white" role="status" />;
  if (state === 'error' || !data)
    return (
      <div className="state-error">
        Không thể mở bài học. Bài học có thể không thuộc lớp của bạn.
      </div>
    );
  const complete = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setCompleting(true);
    setCompleteError(null);
    try {
      await learningApi.completeLesson(enrollmentId, lessonId);
      setData(await fetchLesson());
      setState('ready');
    } catch {
      setCompleteError('Không thể cập nhật trạng thái bài học. Vui lòng thử lại.');
    } finally {
      inFlight.current = false;
      setCompleting(false);
    }
  };
  const download = async (resource: LessonResource) => {
    setDownloadError(null);
    try {
      const response = await learningApi.getResourceDownload(enrollmentId, resource.id);
      window.open(response.url, '_blank', 'noopener,noreferrer');
    } catch {
      setDownloadError(`Không thể tải ${resource.originalFileName ?? resource.title}.`);
    }
  };
  return (
    <article className="rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
      <Link
        className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700"
        to={`/student/enrollments/${enrollmentId}/learn`}
      >
        <ArrowLeft size={16} />
        Nội dung học tập
      </Link>
      <p className="mt-7 text-sm font-semibold text-indigo-700">{data.lesson.module.title}</p>
      <h2 className="mt-2 text-3xl font-bold">{data.lesson.title}</h2>
      {data.lesson.description ? (
        <p className="mt-4 whitespace-pre-line leading-8 text-slate-700">
          {data.lesson.description}
        </p>
      ) : null}
      <section className="mt-9">
        <h3 className="text-xl font-bold">Tài liệu liên quan</h3>
        {downloadError ? (
          <p className="state-error mt-4" role="alert">
            {downloadError}
          </p>
        ) : null}
        {data.lesson.resources.length === 0 ? (
          <div className="state-empty mt-4">Bài học này chưa có tài liệu.</div>
        ) : (
          <div className="mt-4 space-y-3">
            {data.lesson.resources.map((resource) => (
              <ResourceRow download={download} key={resource.id} resource={resource} />
            ))}
          </div>
        )}
      </section>
      <div className="mt-9 border-t pt-6">
        {completeError ? (
          <p className="state-error mb-4" role="alert">
            {completeError}
          </p>
        ) : null}
        {data.lesson.progress.status === 'COMPLETED' ? (
          <p className="flex items-center gap-2 font-semibold text-emerald-700">
            <CheckCircle2 />
            Đã hoàn thành bài học
          </p>
        ) : (
          <button
            className="btn-primary"
            disabled={completing}
            onClick={() => void complete()}
            type="button"
          >
            {completing ? 'Đang cập nhật...' : 'Hoàn thành bài học'}
          </button>
        )}
      </div>
      <nav
        aria-label="Điều hướng bài học"
        className="mt-8 flex items-center justify-between gap-4 border-t pt-6"
      >
        {navigation.previous ? (
          <Link
            className="btn-secondary"
            to={`/student/enrollments/${enrollmentId}/lessons/${navigation.previous.id}`}
          >
            <ArrowLeft size={17} />
            {navigation.previous.title}
          </Link>
        ) : (
          <span />
        )}
        {navigation.next ? (
          <Link
            className="btn-secondary"
            to={`/student/enrollments/${enrollmentId}/lessons/${navigation.next.id}`}
          >
            {navigation.next.title}
            <ArrowRight size={17} />
          </Link>
        ) : (
          <Link className="btn-secondary" to={`/student/enrollments/${enrollmentId}/tests`}>
            Đến bài kiểm tra
            <ArrowRight size={17} />
          </Link>
        )}
      </nav>
    </article>
  );
}

function ResourceRow({
  resource,
  download,
}: {
  resource: LessonResource;
  download: (resource: LessonResource) => Promise<void>;
}) {
  const Icon = resource.type === 'VIDEO' ? Video : resource.type === 'LINK' ? Link2 : FileText;
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-slate-50 p-4">
      <Icon className="text-indigo-600" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{resource.title}</p>
        <p className="mt-1 text-xs text-slate-500">
          {resource.originalFileName ?? resource.type}{' '}
          {resource.mimeType ? `· ${resource.mimeType}` : ''} · cập nhật{' '}
          {new Date(resource.updatedAt).toLocaleDateString('vi-VN')}
        </p>
      </div>
      {resource.isDownloadable ? (
        <button
          className="btn-secondary px-3 py-2 text-sm"
          onClick={() => void download(resource)}
          type="button"
        >
          <Download size={16} />
          Tải xuống
        </button>
      ) : resource.url ? (
        <a
          className="btn-secondary px-3 py-2 text-sm"
          href={resource.url}
          rel="noreferrer"
          target="_blank"
        >
          Mở tài nguyên
          <ExternalLink size={16} />
        </a>
      ) : null}
    </div>
  );
}
