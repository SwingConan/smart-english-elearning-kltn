import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { studentAssessmentApi } from '@/features/assessments/api';
import { testTypeLabel } from '@/features/assessments/display';
import { studentAssessmentErrorMessage } from '@/features/assessments/errors';
import type { StudentTestListItem } from '@/features/assessments/types';
import { useSessionExpiry } from '@/features/auth/use-session-expiry';

export function StudentAssessmentListPage() {
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const navigate = useNavigate();
  const redirectExpiredSession = useSessionExpiry();
  const startInFlight = useRef(false);
  const [tests, setTests] = useState<StudentTestListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingTestId, setPendingTestId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchTests() {
      if (!enrollmentId) return;
      try {
        const data = await studentAssessmentApi.listTests(enrollmentId, controller.signal);
        setTests(data);
        setLoadError(null);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        if (await redirectExpiredSession(error)) return;
        setLoadError(studentAssessmentErrorMessage(error, 'Không thể tải danh sách bài kiểm tra.'));
      } finally {
        setLoading(false);
      }
    }
    void fetchTests();
    return () => controller.abort();
  }, [enrollmentId, redirectExpiredSession, reloadKey]);

  const startOrResume = async (test: StudentTestListItem) => {
    if (!enrollmentId || startInFlight.current) return;
    startInFlight.current = true;
    setPendingTestId(test.id);
    setActionError(null);
    try {
      const attempt = await studentAssessmentApi.startOrResume(enrollmentId, test.id);
      navigate(`/student/enrollments/${enrollmentId}/attempts/${attempt.id}`);
    } catch (error) {
      if (await redirectExpiredSession(error)) return;
      setActionError(studentAssessmentErrorMessage(error, 'Không thể bắt đầu bài kiểm tra.'));
    } finally {
      startInFlight.current = false;
      setPendingTestId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link className="text-sm font-medium text-blue-700 hover:underline" to={enrollmentId ? `/student/enrollments/${enrollmentId}/learn` : '/student/enrollments'}>
          ← Quay lại nội dung học
        </Link>
        <h1 className="mt-3 text-2xl font-bold">Bài kiểm tra</h1>
        <p className="mt-1 text-sm text-slate-600">Bắt đầu, tiếp tục hoặc xem lại kết quả các bài đã nộp.</p>
      </div>

      {actionError && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{actionError}</div>}

      {loading ? (
        <p className="py-10 text-center text-slate-500" role="status">Đang tải bài kiểm tra...</p>
      ) : loadError ? (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-red-700" role="alert">
          <p>{loadError}</p>
          <button className="mt-3 rounded border px-3 py-1 text-sm" onClick={() => { setLoading(true); setLoadError(null); setReloadKey((current) => current + 1); }} type="button">Thử lại</button>
        </div>
      ) : tests.length === 0 ? (
        <div className="rounded border bg-white p-8 text-center text-slate-500">Khóa học hiện chưa có bài kiểm tra đã xuất bản.</div>
      ) : (
        <div className="space-y-4">
          {tests.map((test) => {
            const limitReached = !test.hasInProgressAttempt && test.attemptsUsed >= test.maxAttempts;
            return (
              <article className="rounded-lg border bg-white p-5 shadow-sm" key={test.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <span className="rounded bg-indigo-100 px-2 py-1 text-xs text-indigo-800">{testTypeLabel[test.type]}</span>
                    <h2 className="mt-2 text-lg font-semibold">{test.title}</h2>
                    {test.description && <p className="mt-1 text-sm text-slate-600">{test.description}</p>}
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
                      <span>{test.questionCount} câu hỏi</span>
                      <span>Đã dùng {test.attemptsUsed}/{test.maxAttempts} lượt</span>
                      <span>{test.hasInProgressAttempt ? 'Đang làm' : 'Không có lượt đang làm'}</span>
                    </div>
                    {limitReached && <p className="mt-2 text-sm text-amber-700">Bạn đã sử dụng hết số lượt làm bài.</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!limitReached && (
                      <button
                        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                        disabled={pendingTestId !== null}
                        onClick={() => void startOrResume(test)}
                        type="button"
                      >
                        {pendingTestId === test.id
                          ? 'Đang mở...'
                          : test.hasInProgressAttempt
                            ? 'Tiếp tục làm bài'
                            : 'Bắt đầu làm bài'}
                      </button>
                    )}
                    {test.latestSubmittedAttemptId && (
                      <Link className="rounded border px-4 py-2 text-sm font-medium" to={`/student/enrollments/${enrollmentId}/attempts/${test.latestSubmittedAttemptId}/result`}>
                        Xem kết quả
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
