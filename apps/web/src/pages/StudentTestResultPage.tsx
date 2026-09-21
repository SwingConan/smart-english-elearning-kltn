import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { studentAssessmentApi } from '@/features/assessments/api';
import { difficultyLabel, testTypeLabel } from '@/features/assessments/display';
import { studentAssessmentErrorMessage } from '@/features/assessments/errors';
import type { StudentAttemptResult } from '@/features/assessments/types';
import { useSessionExpiry } from '@/features/auth/use-session-expiry';
import { ApiError } from '@/lib/api-client';

type ResultState = 'loading' | 'ready' | 'hidden' | 'missing' | 'error';

export function StudentTestResultPage() {
  const { enrollmentId, attemptId } = useParams<{ enrollmentId: string; attemptId: string }>();
  const redirectExpiredSession = useSessionExpiry();
  const [result, setResult] = useState<StudentAttemptResult | null>(null);
  const [state, setState] = useState<ResultState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchResult() {
      if (!enrollmentId || !attemptId) return;
      try {
        const data = await studentAssessmentApi.getResult(enrollmentId, attemptId, controller.signal);
        setResult(data);
        setError(null);
        setState('ready');
      } catch (requestError) {
        if (requestError instanceof Error && requestError.name === 'AbortError') return;
        if (await redirectExpiredSession(requestError)) return;
        if (requestError instanceof ApiError && requestError.status === 403) {
          setState('hidden');
          return;
        }
        if (requestError instanceof ApiError && requestError.status === 404) {
          setState('missing');
          return;
        }
        setError(studentAssessmentErrorMessage(requestError, 'Không thể tải kết quả bài kiểm tra.'));
        setState('error');
      }
    }
    void fetchResult();
    return () => controller.abort();
  }, [attemptId, enrollmentId, redirectExpiredSession, reloadKey]);

  if (state === 'loading') {
    return <p className="py-10 text-center text-slate-500" role="status">Đang tải kết quả...</p>;
  }

  if (state !== 'ready' || !result) {
    const message = state === 'hidden'
      ? 'Kết quả của bài kiểm tra này hiện chưa được công bố.'
      : state === 'missing'
        ? 'Kết quả chưa tồn tại hoặc lượt làm vẫn đang được thực hiện.'
        : error ?? 'Không thể tải kết quả bài kiểm tra.';
    return (
      <div className="mx-auto max-w-3xl space-y-4 rounded-lg border bg-white p-6 shadow-sm">
        <div className={`rounded p-4 ${state === 'hidden' ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700'}`} role="alert">{message}</div>
        <div className="flex flex-wrap gap-2">
          {state === 'missing' && <Link className="rounded border px-4 py-2 text-sm" to={`/student/enrollments/${enrollmentId}/attempts/${attemptId}`}>Quay lại lượt làm</Link>}
          <Link className="rounded border px-4 py-2 text-sm" to={`/student/enrollments/${enrollmentId}/tests`}>Danh sách bài kiểm tra</Link>
          <Link className="rounded border px-4 py-2 text-sm" to={`/student/enrollments/${enrollmentId}/learn`}>Nội dung học</Link>
          {state === 'error' && <button className="rounded border px-4 py-2 text-sm" onClick={() => { setState('loading'); setError(null); setReloadKey((current) => current + 1); }} type="button">Thử lại</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="rounded-lg border bg-white p-6 shadow-sm">
        <span className="rounded bg-indigo-100 px-2 py-1 text-xs text-indigo-800">{testTypeLabel[result.test.type]}</span>
        <h1 className="mt-2 text-2xl font-bold">Kết quả: {result.test.title}</h1>
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <ResultMetric label="Điểm" value={`${result.attempt.score}/${result.attempt.maxScore}`} />
          <ResultMetric label="Tỷ lệ" value={`${result.attempt.percentage}%`} />
          <ResultMetric label="Lượt làm" value={String(result.attempt.attemptNumber)} />
          <ResultMetric label="Nộp lúc" value={new Date(result.attempt.submittedAt).toLocaleString('vi-VN')} />
        </div>
      </header>

      <div className="space-y-5">
        {result.questions.map((item, index) => (
          <article className={`rounded-lg border p-5 shadow-sm ${item.answer.isCorrect ? 'border-green-200 bg-green-50/40' : 'border-red-200 bg-red-50/40'}`} key={item.testQuestionId}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-500">Câu {index + 1} · {difficultyLabel[item.question.difficulty]}</p>
                <h2 className="mt-2 whitespace-pre-wrap text-lg font-medium">{item.question.content}</h2>
              </div>
              <div className="text-right text-sm">
                <p className={item.answer.isCorrect ? 'font-semibold text-green-700' : 'font-semibold text-red-700'}>{item.answer.isCorrect ? 'Đúng' : 'Chưa đúng'}</p>
                <p className="text-slate-600">{item.answer.pointsAwarded}/{item.points} điểm</p>
              </div>
            </div>
            <ul className="mt-4 space-y-2">
              {item.question.options.map((option) => {
                const style = option.isCorrect
                  ? 'border-green-300 bg-green-100 text-green-900'
                  : option.wasSelected
                    ? 'border-red-300 bg-red-100 text-red-900'
                    : 'border-slate-200 bg-white text-slate-700';
                return (
                  <li className={`rounded border p-3 ${style}`} key={option.id}>
                    <span>{option.content}</span>
                    {option.isCorrect && <span className="ml-2 text-sm font-medium">Đáp án đúng</span>}
                    {option.wasSelected && <span className="ml-2 text-sm font-medium">Bạn đã chọn</span>}
                  </li>
                );
              })}
            </ul>
            {item.question.explanation && (
              <div className="mt-4 rounded bg-blue-50 p-3 text-sm text-blue-900">
                <span className="font-semibold">Giải thích: </span>{item.question.explanation}
              </div>
            )}
          </article>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link className="rounded border px-4 py-2 text-sm" to={`/student/enrollments/${enrollmentId}/tests`}>Danh sách bài kiểm tra</Link>
        <Link className="rounded border px-4 py-2 text-sm" to={`/student/enrollments/${enrollmentId}/learn`}>Nội dung học</Link>
      </div>
    </div>
  );
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
