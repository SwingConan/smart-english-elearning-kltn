import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useSessionExpiry } from '@/features/auth/use-session-expiry';
import { learningApi } from '@/features/learning/api';
import { progressStatusColor, progressStatusIcon, resourceTypeIcon, resourceTypeLabel } from '@/features/learning/display';
import type { CourseContent, CourseProgress, LessonDetail } from '@/features/learning/types';

export function LearningPage() {
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const redirectExpiredSession = useSessionExpiry();

  const [content, setContent] = useState<CourseContent | null>(null);
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [lessonDetail, setLessonDetail] = useState<LessonDetail | null>(null);
  const [loadingContent, setLoadingContent] = useState(true);
  const [loadingLesson, setLoadingLesson] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lessonError, setLessonError] = useState<string | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const completionInFlight = useRef(false);

  // Load Content and Progress
  useEffect(() => {
    if (!enrollmentId) return;
    const controller = new AbortController();

    void Promise.all([
      learningApi.getContent(enrollmentId, controller.signal),
      learningApi.getProgress(enrollmentId, controller.signal)
    ])
    .then(([contentData, progressData]) => {
      setContent(contentData);
      setProgress(progressData);
      setLoadingContent(false);
    })
    .catch(async (err: unknown) => {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (await redirectExpiredSession(err)) return;
      setError('Không thể tải dữ liệu khóa học.');
      setLoadingContent(false);
    });

    return () => controller.abort();
  }, [enrollmentId, redirectExpiredSession]);

  // Load Lesson Detail
  useEffect(() => {
    if (!enrollmentId || !selectedLessonId) return;
    const controller = new AbortController();

    void learningApi.openLesson(enrollmentId, selectedLessonId, controller.signal)
      .then((detail) => {
        setLessonDetail(detail);
        setLessonError(null);
        setLoadingLesson(false);
      })
      .catch(async (err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (await redirectExpiredSession(err)) return;
        setLessonDetail(null);
        setLessonError('Không thể mở bài học. Vui lòng thử lại.');
        setLoadingLesson(false);
      });

    return () => controller.abort();
  }, [enrollmentId, redirectExpiredSession, selectedLessonId]);

  const selectLesson = (lessonId: string): void => {
    setSelectedLessonId(lessonId);
    setLessonDetail(null);
    setLessonError(null);
    setCompletionError(null);
    setLoadingLesson(true);
  };

  const handleCompleteLesson = async (): Promise<void> => {
    if (!enrollmentId || !lessonDetail || completionInFlight.current) return;

    completionInFlight.current = true;
    setIsCompleting(true);
    setCompletionError(null);
    try {
      await learningApi.completeLesson(enrollmentId, lessonDetail.id);
      const [updatedContent, updatedProgress, updatedLesson] = await Promise.all([
        learningApi.getContent(enrollmentId),
        learningApi.getProgress(enrollmentId),
        learningApi.openLesson(enrollmentId, lessonDetail.id),
      ]);
      setContent(updatedContent);
      setProgress(updatedProgress);
      setLessonDetail(updatedLesson);
    } catch (requestError: unknown) {
      if (await redirectExpiredSession(requestError)) return;
      setCompletionError(
        'Không thể hoàn thành bài học hoặc làm mới tiến độ. Vui lòng thử lại.',
      );
    } finally {
      completionInFlight.current = false;
      setIsCompleting(false);
    }
  };

  if (loadingContent) {
    return <div role="status" className="p-6">Đang tải nội dung...</div>;
  }

  if (error || !content) {
    return <div role="alert" className="p-6 rounded-md bg-red-50 text-red-700">{error ?? 'Không thể tải khóa học.'}</div>;
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-100px)]">
      {/* Header */}
      <header className="mb-4">
        <Link to="/student/enrollments" className="text-blue-600 hover:underline mb-2 inline-block font-medium">
          &larr; Quay lại danh sách lớp học
        </Link>
        <div className="flex flex-wrap gap-4 justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <h1 className="text-xl font-bold">{content.course.title}</h1>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              to={`/student/enrollments/${enrollmentId}/tests`}
            >
              Bài kiểm tra
            </Link>
            <Link
              className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
              to={`/student/enrollments/${enrollmentId}/mastery`}
            >
              Tiến độ kỹ năng
            </Link>
            {progress && (
              <div className="flex items-center gap-4">
                <div className="text-sm font-medium">
                  Đã học: {progress.completedLessons} / {progress.totalLessons} bài
                </div>
                <div className="w-48 bg-slate-200 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${progress.progressPercent}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 flex-col md:flex-row gap-6">
        {/* Sidebar */}
        <aside className="w-full md:w-1/3 lg:w-1/4 bg-white p-4 rounded-xl shadow-sm border border-slate-200 overflow-y-auto self-start sticky top-4 max-h-[calc(100vh-140px)]">
          <h2 className="font-semibold text-lg mb-4">Nội dung khóa học</h2>
          <div className="space-y-4">
            {content.modules.map((module) => (
              <div key={module.id}>
                <h3 className="font-medium bg-slate-50 text-slate-800 p-2 rounded-lg">{module.title}</h3>
                <ul className="mt-2 space-y-1">
                  {module.lessons.map((lesson) => (
                    <li key={lesson.id}>
                      <button
                        onClick={() => selectLesson(lesson.id)}
                        className={`w-full text-left p-2 rounded-lg flex items-start gap-2 hover:bg-slate-50 transition-colors ${selectedLessonId === lesson.id ? 'bg-blue-50 text-blue-900 font-medium' : 'text-slate-600'}`}
                      >
                        <span className={`mt-0.5 ${progressStatusColor(lesson.progressStatus)}`}>
                          {progressStatusIcon(lesson.progressStatus)}
                        </span>
                        <span className="flex-1 text-sm leading-tight">{lesson.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          {!selectedLessonId ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-slate-500">
              <span className="text-4xl mb-4">📚</span>
              <p>Vui lòng chọn bài học từ danh sách bên trái để bắt đầu.</p>
            </div>
          ) : loadingLesson ? (
            <div className="flex items-center justify-center min-h-[400px]">Đang tải bài học...</div>
          ) : lessonError ? (
            <div className="flex items-center justify-center min-h-[400px] text-red-700" role="alert">
              {lessonError}
            </div>
          ) : lessonDetail ? (
            <div>
              <div className="mb-6">
                <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 mb-2">
                  {lessonDetail.module.title}
                </span>
                <h2 className="text-2xl font-bold mb-2">{lessonDetail.title}</h2>
                {lessonDetail.description && (
                  <p className="text-slate-600">{lessonDetail.description}</p>
                )}
              </div>

              <div className="space-y-4 mb-8">
                <h3 className="text-lg font-semibold border-b border-slate-100 pb-2">Tài liệu học tập</h3>
                {lessonDetail.resources.length === 0 ? (
                  <p className="text-slate-500 italic">Không có tài liệu nào cho bài học này.</p>
                ) : (
                  <ul className="space-y-3">
                    {lessonDetail.resources.map(res => (
                      <li key={res.id} className="flex flex-wrap items-center gap-3 p-4 border border-slate-200 rounded-lg bg-slate-50">
                        <span className="text-2xl">{resourceTypeIcon(res.type)}</span>
                        <div className="flex-1 min-w-[200px]">
                          <div className="font-medium">{res.title}</div>
                          <div className="text-sm text-slate-500">{resourceTypeLabel(res.type)}</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {res.type === 'VIDEO' && (
                            <a href={res.url} target="_blank" rel="noreferrer" className="text-sm bg-blue-100 text-blue-700 px-3 py-1.5 rounded-md hover:bg-blue-200 font-medium">Xem video</a>
                          )}
                          {res.type === 'LINK' && (
                            <a href={res.url} target="_blank" rel="noreferrer" className="text-sm bg-slate-200 text-slate-700 px-3 py-1.5 rounded-md hover:bg-slate-300 font-medium">Mở liên kết</a>
                          )}
                          {res.type === 'DOCUMENT' && (
                            <>
                              <a href={res.url} target="_blank" rel="noreferrer" className="text-sm bg-slate-200 text-slate-700 px-3 py-1.5 rounded-md hover:bg-slate-300 font-medium">Xem tài liệu</a>
                              {res.isDownloadable && (
                                <a href={res.url} download className="text-sm bg-blue-100 text-blue-700 px-3 py-1.5 rounded-md hover:bg-blue-200 font-medium">Tải xuống</a>
                              )}
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="pt-6 border-t border-slate-100">
                {completionError ? (
                  <p className="mb-4 rounded-md bg-red-50 p-3 text-red-700" role="alert">
                    {completionError}
                  </p>
                ) : null}
                {lessonDetail.progress.status !== 'COMPLETED' ? (
                  <button
                    onClick={() => void handleCompleteLesson()}
                    disabled={isCompleting}
                    className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 font-medium disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isCompleting ? 'Đang cập nhật...' : 'Hoàn thành bài học'}
                  </button>
                ) : (
                  <div className="text-green-600 font-medium flex items-center gap-2 bg-green-50 p-4 rounded-lg">
                    <span className="text-xl">✓</span> Đã hoàn thành bài học
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center min-h-[400px] text-slate-500">Không tìm thấy nội dung bài học.</div>
          )}
        </main>
      </div>
    </div>
  );
}
