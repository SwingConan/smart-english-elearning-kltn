import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, CheckCircle2, Clock3, ListChecks, Volume2, X } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { placementApi } from '@/features/placement/api';
import { announcePlacementSubmitted } from '@/features/placement/handoff';
import { placementTimerWarning } from '@/features/placement/timer';
import type { PlacementExamGroup, PlacementExamResponse } from '@/features/placement/types';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function PlacementExamPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const [exam, setExam] = useState<PlacementExamResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [marks, setMarks] = useState<Set<string>>(new Set());
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const timeoutSubmitted = useRef(false);
  const warnedFive = useRef(false);
  const warnedOne = useRef(false);

  useEffect(() => {
    if (!attemptId) return;
    const controller = new AbortController();
    void placementApi
      .exam(attemptId, controller.signal)
      .then((payload) => {
        setExam(payload);
        if (payload.state === 'IN_PROGRESS') {
          const restored: Record<string, string[]> = {};
          payload.groups.forEach((group) =>
            group.questions.forEach((question) => {
              restored[question.testQuestionId] = question.selectedOptionIds;
            }),
          );
          setAnswers(restored);
          try {
            const savedMarks = JSON.parse(
              localStorage.getItem(`smart-english:placement-marks:${attemptId}`) ?? '[]',
            ) as string[];
            setMarks(new Set(savedMarks.filter((value) => typeof value === 'string')));
          } catch {
            setMarks(new Set());
          }
        }
      })
      .catch(() => setError('Không thể tải bài kiểm tra hoặc bạn không có quyền truy cập.'));
    return () => controller.abort();
  }, [attemptId]);

  const submit = useCallback(async (reason: 'MANUAL' | 'TIMEOUT') => {
    if (!attemptId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await placementApi.submit(attemptId, reason);
      announcePlacementSubmitted(attemptId);
      setConfirmOpen(false);
      setExam({
        state: 'SUBMITTED',
        attemptId,
        submittedAt: result.submittedAt,
        resultPath: `/placement/attempts/${attemptId}/result`,
      });
    } catch {
      setError('Chưa thể nộp bài. Câu trả lời đã lưu vẫn được giữ trên máy chủ.');
      timeoutSubmitted.current = false;
    } finally {
      setSubmitting(false);
    }
  }, [attemptId, submitting]);

  useEffect(() => {
    if (!attemptId || !exam || exam.state !== 'IN_PROGRESS') return;
    const tick = () => {
      const seconds = Math.max(
        0,
        Math.ceil((new Date(exam.attempt.expiresAt).getTime() - Date.now()) / 1000),
      );
      setRemainingSeconds(seconds);
      const nextWarning = placementTimerWarning(
        seconds,
        warnedFive.current,
        warnedOne.current,
      );
      if (nextWarning === 'FIVE_MINUTES') {
        warnedFive.current = true;
        setWarning('Còn 5 phút. Hãy kiểm tra các câu chưa trả lời.');
      }
      if (nextWarning === 'ONE_MINUTE') {
        warnedOne.current = true;
        setWarning('Còn 1 phút. Bài sẽ tự động nộp khi hết giờ.');
      }
      if (seconds === 0 && !timeoutSubmitted.current) {
        timeoutSubmitted.current = true;
        void submit('TIMEOUT');
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [attemptId, exam, submit]);

  const questions = useMemo(
    () =>
      exam?.state === 'IN_PROGRESS'
        ? exam.groups.flatMap((group) => group.questions)
        : [],
    [exam],
  );
  const unansweredCount = questions.filter(
    (question) => (answers[question.testQuestionId] ?? []).length === 0,
  ).length;

  const save = async (testQuestionId: string, selectedOptionIds: string[]) => {
    if (!attemptId) return;
    setAnswers((current) => ({ ...current, [testQuestionId]: selectedOptionIds }));
    setSaveStates((current) => ({ ...current, [testQuestionId]: 'saving' }));
    try {
      await placementApi.saveAnswer(attemptId, testQuestionId, selectedOptionIds);
      setSaveStates((current) => ({ ...current, [testQuestionId]: 'saved' }));
    } catch {
      setSaveStates((current) => ({ ...current, [testQuestionId]: 'error' }));
    }
  };

  const toggleMark = (testQuestionId: string) => {
    if (!attemptId) return;
    setMarks((current) => {
      const next = new Set(current);
      if (next.has(testQuestionId)) next.delete(testQuestionId);
      else next.add(testQuestionId);
      localStorage.setItem(
        `smart-english:placement-marks:${attemptId}`,
        JSON.stringify([...next]),
      );
      return next;
    });
  };

  if (error && !exam) return <ExamState title="Không thể mở bài kiểm tra" text={error} />;
  if (!exam) return <p className="mx-auto max-w-7xl p-8" role="status">Đang tải bài kiểm tra…</p>;
  if (exam.state === 'SUBMITTED') {
    return (
      <ExamState
        title="Bài kiểm tra đã được nộp"
        text="Kết quả đã được lưu. Bạn có thể đóng tab này hoặc xem kết quả ngay."
      >
        <Link className="btn-primary mt-6" to={exam.resultPath}>Xem kết quả</Link>
      </ExamState>
    );
  }

  const timerText = remainingSeconds === null
    ? '--:--'
    : `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="sticky top-0 z-30 mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">Kiểm tra đầu vào L&R</p><h1 className="font-bold">{exam.test.title}</h1></div>
        <div className="flex items-center gap-3">
          <span aria-live="polite" className={`flex items-center gap-2 rounded-full px-4 py-2 font-mono font-bold ${remainingSeconds !== null && remainingSeconds <= 60 ? 'bg-red-100 text-red-800' : 'bg-slate-100'}`}><Clock3 size={18} /> {timerText}</span>
          <button className="btn-primary" onClick={() => setConfirmOpen(true)} type="button">Nộp bài</button>
        </div>
      </div>
      {warning ? <div className="mb-5 rounded-xl bg-amber-100 p-4 text-amber-900" role="alert">{warning}</div> : null}
      {error ? <div className="mb-5 rounded-xl bg-red-50 p-4 text-red-800" role="alert">{error}</div> : null}

      <details className="mb-5 rounded-xl border bg-white p-4 lg:hidden">
        <summary className="flex cursor-pointer items-center gap-2 font-semibold"><ListChecks size={18} /> Danh sách câu hỏi</summary>
        <Navigator answers={answers} current={currentQuestion} marks={marks} questions={questions} />
      </details>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-8">
          {exam.groups.map((group) => (
            <GroupCard
              answers={answers}
              group={group}
              key={group.id}
              marks={marks}
              onFocus={setCurrentQuestion}
              onMark={toggleMark}
              onSave={(questionId, selected) => void save(questionId, selected)}
              saveStates={saveStates}
            />
          ))}
        </div>
        <aside className="hidden lg:block">
          <div className="sticky top-28 rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-bold"><ListChecks size={19} /> Câu hỏi</h2>
            <Navigator answers={answers} current={currentQuestion} marks={marks} questions={questions} />
            <div className="mt-5 border-t pt-4 text-sm text-slate-600"><p>{questions.length - unansweredCount}/{questions.length} câu đã trả lời</p><p>{marks.size} câu đánh dấu xem lại</p></div>
          </div>
        </aside>
      </div>

      {confirmOpen ? (
        <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold">Xác nhận nộp bài</h2><p className="mt-2 text-slate-600">Bạn còn {unansweredCount} câu chưa trả lời và {marks.size} câu đánh dấu xem lại.</p></div><button aria-label="Đóng" onClick={() => setConfirmOpen(false)} type="button"><X /></button></div>
            <div className="mt-6 flex justify-end gap-3"><button className="btn-secondary" onClick={() => setConfirmOpen(false)} type="button">Tiếp tục kiểm tra</button><button className="btn-primary" disabled={submitting} onClick={() => void submit('MANUAL')} type="button">{submitting ? 'Đang nộp…' : 'Nộp bài'}</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function GroupCard({ group, answers, marks, saveStates, onSave, onMark, onFocus }: {
  group: PlacementExamGroup;
  answers: Record<string, string[]>;
  marks: Set<string>;
  saveStates: Record<string, SaveState>;
  onSave: (questionId: string, selected: string[]) => void;
  onMark: (questionId: string) => void;
  onFocus: (questionId: string) => void;
}) {
  const [audioError, setAudioError] = useState<string | null>(null);
  const playAudio = () => {
    if (!group.audioUrl) return;
    setAudioError(null);
    if (
      typeof window.speechSynthesis === 'undefined' ||
      typeof window.SpeechSynthesisUtterance === 'undefined'
    ) {
      setAudioError('Trình duyệt này không hỗ trợ phát audio. Vui lòng dùng trình duyệt khác để tiếp tục phần Listening.');
      return;
    }
    if (group.audioUrl.startsWith('tts:')) {
      const utterance = new SpeechSynthesisUtterance(group.audioUrl.slice(4));
      utterance.lang = 'en-US';
      utterance.rate = 0.95;
      utterance.onerror = () => setAudioError('Không thể phát audio trong trình duyệt này. Vui lòng thử lại hoặc dùng trình duyệt khác.');
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }
  };
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><span className="text-xs font-bold uppercase tracking-wider text-indigo-600">{group.skill === 'LISTENING' ? 'Listening' : 'Reading'}</span><h2 className="mt-1 text-xl font-bold">{group.title}</h2><p className="mt-1 text-sm text-slate-600">{group.instructions}</p></div>{group.skill === 'LISTENING' ? <button className="btn-secondary" onClick={playAudio} type="button"><Volume2 size={18} /> Phát audio</button> : null}</div>
      {audioError ? <p className="mt-3 text-sm text-red-700" role="alert">{audioError}</p> : null}
      {group.skill === 'READING' && group.stimulusText ? <div className="mt-6 whitespace-pre-line rounded-xl bg-slate-50 p-5 leading-7 text-slate-800">{group.stimulusText}</div> : null}
      <div className="mt-6 space-y-6">
        {group.questions.map((question) => {
          const selected = answers[question.testQuestionId] ?? [];
          const multiple = question.responseType === 'MULTIPLE_CHOICE';
          const saveState = saveStates[question.testQuestionId] ?? 'idle';
          return (
            <article className="scroll-mt-32 rounded-xl border p-5" id={`question-${question.testQuestionId}`} key={question.testQuestionId} onFocus={() => onFocus(question.testQuestionId)}>
              <div className="flex items-start justify-between gap-4"><h3 className="font-semibold">Câu {question.orderIndex + 1}. {question.content}</h3><button aria-label="Đánh dấu xem lại" aria-pressed={marks.has(question.testQuestionId)} className={marks.has(question.testQuestionId) ? 'text-amber-600' : 'text-slate-400'} onClick={() => onMark(question.testQuestionId)} type="button"><Bookmark fill={marks.has(question.testQuestionId) ? 'currentColor' : 'none'} /></button></div>
              <div className="mt-4 grid gap-2">
                {question.options.map((option) => {
                  const checked = selected.includes(option.id);
                  return <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${checked ? 'border-indigo-500 bg-indigo-50' : 'hover:bg-slate-50'}`} key={option.id}><input checked={checked} name={question.testQuestionId} onChange={() => { const next = multiple ? checked ? selected.filter((id) => id !== option.id) : [...selected, option.id] : [option.id]; onSave(question.testQuestionId, next); }} type={multiple ? 'checkbox' : 'radio'} /><span>{option.content}</span></label>;
                })}
              </div>
              <p className={`mt-3 text-xs ${saveState === 'error' ? 'text-red-700' : 'text-slate-500'}`} role="status">{saveState === 'saving' ? 'Đang lưu…' : saveState === 'saved' ? 'Đã lưu' : saveState === 'error' ? 'Lỗi lưu — chọn lại để thử lại' : 'Chưa thay đổi'}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Navigator({ questions, answers, marks, current }: { questions: PlacementExamGroup['questions']; answers: Record<string, string[]>; marks: Set<string>; current: string | null }) {
  return <div className="mt-4 grid grid-cols-5 gap-2">{questions.map((question, index) => { const answered = (answers[question.testQuestionId] ?? []).length > 0; const marked = marks.has(question.testQuestionId); return <a aria-label={`Câu ${index + 1}${answered ? ', đã trả lời' : ', chưa trả lời'}${marked ? ', đánh dấu' : ''}`} className={`grid size-10 place-items-center rounded-lg border text-sm font-semibold ${current === question.testQuestionId ? 'ring-2 ring-indigo-500' : ''} ${marked ? 'border-amber-500 bg-amber-50' : answered ? 'border-emerald-500 bg-emerald-50' : 'bg-white'}`} href={`#question-${question.testQuestionId}`} key={question.testQuestionId} onClick={() => document.getElementById(`question-${question.testQuestionId}`)?.focus()}>{index + 1}</a>; })}</div>;
}

function ExamState({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return <section className="mx-auto mt-16 max-w-xl rounded-2xl border bg-white p-8 text-center shadow-sm"><CheckCircle2 className="mx-auto text-emerald-600" size={48} /><h1 className="mt-4 text-2xl font-bold">{title}</h1><p className="mt-3 text-slate-600">{text}</p>{children}</section>;
}
