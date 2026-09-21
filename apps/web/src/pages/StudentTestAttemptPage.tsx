import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { studentAssessmentApi } from '@/features/assessments/api';
import { difficultyLabel, testTypeLabel } from '@/features/assessments/display';
import { studentAssessmentErrorMessage } from '@/features/assessments/errors';
import type {
  StudentAnswerSelection,
  StudentAttemptContent,
  StudentAttemptQuestion,
} from '@/features/assessments/types';
import { useSessionExpiry } from '@/features/auth/use-session-expiry';
import { ApiError } from '@/lib/api-client';

type AnswerState = Record<string, string[]>;
type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export function StudentTestAttemptPage() {
  const { enrollmentId, attemptId } = useParams<{ enrollmentId: string; attemptId: string }>();
  const navigate = useNavigate();
  const redirectExpiredSession = useSessionExpiry();
  const [content, setContent] = useState<StudentAttemptContent | null>(null);
  const [answers, setAnswers] = useState<AnswerState>({});
  const answersRef = useRef<AnswerState>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveGenerationRef = useRef(0);
  const submitInFlight = useRef(false);
  const activeRef = useRef(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    activeRef.current = true;
    async function fetchAttempt() {
      if (!enrollmentId || !attemptId) return;
      try {
        const data = await studentAssessmentApi.getAttempt(enrollmentId, attemptId, controller.signal);
        if (data.attempt.status === 'SUBMITTED') {
          navigate(`/student/enrollments/${enrollmentId}/attempts/${attemptId}/result`, { replace: true });
          return;
        }
        if (!data.questions) {
          setLoadError('Nội dung lượt làm chưa sẵn sàng.');
          return;
        }
        const restored = Object.fromEntries(
          data.questions.map((item) => [item.testQuestionId, [...item.selectedOptionIds]]),
        );
        answersRef.current = restored;
        setAnswers(restored);
        setContent(data);
        setLoadError(null);
        setSaveStatus('idle');
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        if (await redirectExpiredSession(error)) return;
        setLoadError(studentAssessmentErrorMessage(error, 'Không thể tải lượt làm bài.'));
      } finally {
        setLoading(false);
      }
    }
    void fetchAttempt();
    return () => {
      activeRef.current = false;
      controller.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [attemptId, enrollmentId, navigate, redirectExpiredSession, reloadKey]);

  const queueAutosave = (nextAnswers: AnswerState) => {
    if (!content?.questions || !enrollmentId || !attemptId || submitInFlight.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const generation = ++saveGenerationRef.current;
    setSaveStatus('pending');
    const payload = answerPayload(content.questions, nextAnswers);

    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      if (!activeRef.current || submitInFlight.current || generation !== saveGenerationRef.current) return;
      setSaveStatus('saving');
      void studentAssessmentApi.saveAnswers(enrollmentId, attemptId, payload)
        .then(() => {
          if (activeRef.current && generation === saveGenerationRef.current) setSaveStatus('saved');
        })
        .catch(async (error: unknown) => {
          if (!activeRef.current || generation !== saveGenerationRef.current) return;
          if (await redirectExpiredSession(error)) return;
          setSaveStatus('error');
          setActionError(studentAssessmentErrorMessage(error, 'Không thể tự động lưu câu trả lời.'));
        });
    }, 500);
  };

  const updateSelection = (question: StudentAttemptQuestion, optionId: string, checked: boolean) => {
    if (submitting) return;
    const previous = answersRef.current[question.testQuestionId] ?? [];
    const selected = question.question.type === 'MULTIPLE_CHOICE'
      ? checked
        ? [...new Set([...previous, optionId])]
        : previous.filter((id) => id !== optionId)
      : [optionId];
    const next = { ...answersRef.current, [question.testQuestionId]: selected };
    answersRef.current = next;
    setAnswers(next);
    setActionError(null);
    queueAutosave(next);
  };

  const clearSelection = (question: StudentAttemptQuestion) => {
    if (submitting) return;
    const next = { ...answersRef.current, [question.testQuestionId]: [] };
    answersRef.current = next;
    setAnswers(next);
    setActionError(null);
    queueAutosave(next);
  };

  const submit = async () => {
    if (!content?.questions || !enrollmentId || !attemptId || submitInFlight.current) return;
    const unanswered = content.questions.filter(
      (question) => (answersRef.current[question.testQuestionId] ?? []).length === 0,
    ).length;
    const message = unanswered > 0
      ? `Bạn có chắc chắn muốn nộp bài? Bạn còn ${unanswered} câu chưa trả lời.`
      : 'Bạn có chắc chắn muốn nộp bài?';
    if (!window.confirm(message)) return;

    submitInFlight.current = true;
    setSubmitting(true);
    setActionError(null);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    saveGenerationRef.current += 1;
    const finalPayload = answerPayload(content.questions, answersRef.current);

    try {
      await studentAssessmentApi.submit(enrollmentId, attemptId, finalPayload);
      navigate(`/student/enrollments/${enrollmentId}/attempts/${attemptId}/result`, { replace: true });
    } catch (error) {
      if (await redirectExpiredSession(error)) return;
      if (error instanceof ApiError && error.status === 409) {
        try {
          const latest = await studentAssessmentApi.getAttempt(enrollmentId, attemptId);
          if (latest.attempt.status === 'SUBMITTED') {
            navigate(`/student/enrollments/${enrollmentId}/attempts/${attemptId}/result`, { replace: true });
            return;
          }
        } catch (verificationError) {
          if (await redirectExpiredSession(verificationError)) return;
          // Preserve the original safe submission error below.
        }
      }
      setActionError(studentAssessmentErrorMessage(error, 'Không thể nộp bài. Câu trả lời của bạn vẫn được giữ trên trang.'));
    } finally {
      submitInFlight.current = false;
      if (activeRef.current) setSubmitting(false);
    }
  };

  if (loading) return <p className="py-10 text-center text-slate-500" role="status">Đang tải lượt làm bài...</p>;
  if (loadError || !content?.questions) {
    return (
      <div className="mx-auto max-w-3xl rounded border border-red-200 bg-red-50 p-4 text-red-700" role="alert">
        <p>{loadError ?? 'Không thể tải nội dung lượt làm.'}</p>
        <div className="mt-3 flex gap-2">
          <button className="rounded border px-3 py-1 text-sm" onClick={() => { setLoading(true); setLoadError(null); setReloadKey((current) => current + 1); }} type="button">Thử lại</button>
          <Link className="rounded border px-3 py-1 text-sm" to={`/student/enrollments/${enrollmentId}/tests`}>Danh sách bài kiểm tra</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="rounded-lg border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="rounded bg-indigo-100 px-2 py-1 text-xs text-indigo-800">{testTypeLabel[content.test.type]}</span>
            <h1 className="mt-2 text-2xl font-bold">{content.test.title}</h1>
            <p className="mt-1 text-sm text-slate-600">Lượt làm số {content.attempt.attemptNumber}</p>
          </div>
          <SaveIndicator status={saveStatus} />
        </div>
      </header>

      {actionError && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{actionError}</div>}

      <fieldset className="space-y-5" disabled={submitting}>
        {content.questions.map((item, index) => {
          const selectedIds = answers[item.testQuestionId] ?? [];
          const multiple = item.question.type === 'MULTIPLE_CHOICE';
          return (
            <article className="rounded-lg border bg-white p-5 shadow-sm" key={item.testQuestionId}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-500">Câu {index + 1} · {difficultyLabel[item.question.difficulty]}</p>
                  <h2 className="mt-2 whitespace-pre-wrap text-lg font-medium">{item.question.content}</h2>
                </div>
                <span className="whitespace-nowrap text-sm text-slate-500">{item.points} điểm</span>
              </div>
              <div className="mt-4 space-y-2">
                {item.question.options.map((option) => (
                  <label className="flex cursor-pointer items-start gap-3 rounded border p-3 hover:bg-slate-50" key={option.id}>
                    <input
                      checked={selectedIds.includes(option.id)}
                      className="mt-1"
                      name={multiple ? undefined : item.testQuestionId}
                      onChange={(event) => updateSelection(item, option.id, event.target.checked)}
                      type={multiple ? 'checkbox' : 'radio'}
                    />
                    <span>{option.content}</span>
                  </label>
                ))}
              </div>
              {selectedIds.length > 0 && (
                <button className="mt-3 text-sm text-slate-600 underline" onClick={() => clearSelection(item)} type="button">Xóa lựa chọn</button>
              )}
            </article>
          );
        })}
      </fieldset>

      <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-4 shadow-lg">
        <Link className={`rounded border px-4 py-2 text-sm ${submitting ? 'pointer-events-none opacity-50' : ''}`} to={`/student/enrollments/${enrollmentId}/tests`}>Danh sách bài kiểm tra</Link>
        <button className="rounded bg-blue-600 px-6 py-2.5 font-medium text-white disabled:opacity-50" disabled={submitting} onClick={() => void submit()} type="button">{submitting ? 'Đang nộp bài...' : 'Nộp bài'}</button>
      </div>
    </div>
  );
}

function answerPayload(
  questions: StudentAttemptQuestion[],
  answers: AnswerState,
): StudentAnswerSelection[] {
  return questions.map((question) => ({
    testQuestionId: question.testQuestionId,
    selectedOptionIds: [...(answers[question.testQuestionId] ?? [])],
  }));
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  const label: Record<SaveStatus, string> = {
    idle: 'Chưa có thay đổi',
    pending: 'Chờ tự động lưu...',
    saving: 'Đang lưu...',
    saved: 'Đã lưu',
    error: 'Lưu chưa thành công',
  };
  return <span className={`text-sm ${status === 'error' ? 'text-red-700' : 'text-slate-500'}`}>{label[status]}</span>;
}
