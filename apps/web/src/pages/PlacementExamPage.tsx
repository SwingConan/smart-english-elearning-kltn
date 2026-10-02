import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, CheckCircle2, Clock3, ListChecks, Mic, Square, X } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { placementApi } from '@/features/placement/api';
import { announcePlacementSubmitted } from '@/features/placement/handoff';
import { placementTimerWarning } from '@/features/placement/timer';
import { ApiError } from '@/lib/api-client';
import type { PlacementExamGroup, PlacementExamResponse } from '@/features/placement/types';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type ProductiveSaveState = 'DIRTY' | 'SAVING' | 'ERROR' | 'RECORDING' | 'LOCAL_DRAFT' | 'UPLOADING';

export function PlacementExamPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const [exam, setExam] = useState<PlacementExamResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [marks, setMarks] = useState<Set<string>>(new Set());
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [productiveAnswered, setProductiveAnswered] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState<Set<string>>(new Set());
  const [productiveSaveStates, setProductiveSaveStates] = useState<Record<string, ProductiveSaveState>>({});
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
        if (controller.signal.aborted) return;
        setError(null);
        setExam(payload);
        if (payload.state === 'IN_PROGRESS') {
          const restored: Record<string, string[]> = {};
          payload.groups.forEach((group) =>
            group.questions.forEach((question) => {
              restored[question.testQuestionId] = question.selectedOptionIds;
            }),
          );
          setAnswers(restored);
          const productive: Record<string, boolean> = {};
          payload.groups.forEach((group) =>
            group.questions.forEach((question) => {
              productive[question.testQuestionId] =
                Boolean(question.textResponse?.trim()) || Boolean(question.audioUploaded);
            }),
          );
          setProductiveAnswered(productive);
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
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setError('Không thể tải bài kiểm tra hoặc bạn không có quyền truy cập.');
      });
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
    } catch (submitError: unknown) {
      const body = submitError instanceof ApiError && typeof submitError.body === 'object'
        ? submitError.body as { code?: string; message?: string }
        : null;
      setError(
        body?.code === 'AUDIO_UPLOAD_INCOMPLETE' && body.message
          ? body.message
          : 'Chưa thể nộp bài. Câu trả lời đã lưu vẫn được giữ trên máy chủ.',
      );
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
    (question) =>
      question.responseType === 'TEXT_RESPONSE' || question.responseType === 'AUDIO_RESPONSE'
        ? !productiveAnswered[question.testQuestionId]
        : (answers[question.testQuestionId] ?? []).length === 0,
  ).length;
  const missingSpeakingCount = questions.filter(
    (question) => question.responseType === 'AUDIO_RESPONSE' && !productiveAnswered[question.testQuestionId],
  ).length;
  const pendingWritingCount = Object.values(productiveSaveStates).filter(
    (state) => state === 'DIRTY' || state === 'SAVING',
  ).length;
  const failedWritingCount = Object.values(productiveSaveStates).filter(
    (state) => state === 'ERROR',
  ).length;
  const manualSubmitBlocked = Object.keys(productiveSaveStates).length > 0;

  const handleProductiveSaved = useCallback((questionId: string, saved: boolean) => {
    setProductiveAnswered((current) => ({ ...current, [questionId]: saved }));
  }, []);
  const handleUploading = useCallback((questionId: string, active: boolean) => {
    setUploading((current) => {
      const next = new Set(current);
      if (active) next.add(questionId);
      else next.delete(questionId);
      return next;
    });
  }, []);
  const handleProductiveSaveState = useCallback((questionId: string, state: ProductiveSaveState | null) => {
    setProductiveSaveStates((current) => {
      const next = { ...current };
      if (state) next[questionId] = state;
      else delete next[questionId];
      return next;
    });
  }, []);

  const save = async (testQuestionId: string, selectedOptionIds: string[]) => {
    if (!attemptId) return;
    setAnswers((current) => ({ ...current, [testQuestionId]: selectedOptionIds }));
    setSaveStates((current) => ({ ...current, [testQuestionId]: 'saving' }));
    try {
      await placementApi.saveAnswer(attemptId, testQuestionId, { selectedOptionIds });
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
        <div><p className="text-sm text-slate-500">{exam.test.mode === 'FOUR_SKILLS' ? 'Kiểm tra đầu vào 4 kỹ năng' : 'Kiểm tra đầu vào L&R'}</p><h1 className="font-bold">{exam.test.title}</h1></div>
        <div className="flex items-center gap-3">
          <span aria-live="polite" className={`flex items-center gap-2 rounded-full px-4 py-2 font-mono font-bold ${remainingSeconds !== null && remainingSeconds <= 60 ? 'bg-red-100 text-red-800' : 'bg-slate-100'}`}><Clock3 size={18} /> {timerText}</span>
          <button className="btn-primary" disabled={manualSubmitBlocked} onClick={() => setConfirmOpen(true)} type="button">Nộp bài</button>
        </div>
      </div>
      {warning ? <div className="mb-5 rounded-xl bg-amber-100 p-4 text-amber-900" role="alert">{warning}</div> : null}
      {error ? <div className="mb-5 rounded-xl bg-red-50 p-4 text-red-800" role="alert">{error}</div> : null}

      <details className="mb-5 rounded-xl border bg-white p-4 lg:hidden">
        <summary className="flex cursor-pointer items-center gap-2 font-semibold"><ListChecks size={18} /> Danh sách câu hỏi</summary>
        <Navigator answers={answers} current={currentQuestion} groups={exam.groups} locked={uploading.size > 0} marks={marks} productiveAnswered={productiveAnswered} />
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
              attemptId={attemptId!}
              onProductiveSaved={handleProductiveSaved}
              onProductiveSaveState={handleProductiveSaveState}
              onUploading={handleUploading}
              saveStates={saveStates}
            />
          ))}
        </div>
        <aside className="hidden lg:block">
          <div className="sticky top-28 rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-bold"><ListChecks size={19} /> Câu hỏi</h2>
            <Navigator answers={answers} current={currentQuestion} groups={exam.groups} locked={uploading.size > 0} marks={marks} productiveAnswered={productiveAnswered} />
            <div className="mt-5 border-t pt-4 text-sm text-slate-600"><p>{questions.length - unansweredCount}/{questions.length} câu đã trả lời</p><p>{marks.size} câu đánh dấu xem lại</p></div>
          </div>
        </aside>
      </div>

      {confirmOpen ? (
        <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold">Xác nhận nộp bài</h2><p className="mt-2 text-slate-600">Bạn còn {unansweredCount} câu chưa trả lời và {marks.size} câu đánh dấu xem lại.</p></div><button aria-label="Đóng" onClick={() => setConfirmOpen(false)} type="button"><X /></button></div>
            {uploading.size ? <p className="mt-4 text-sm text-amber-800">Còn {uploading.size} câu Speaking đang tải lên. Vui lòng đợi hoàn tất.</p> : null}
            {pendingWritingCount ? <p className="mt-4 text-sm text-amber-800">Còn {pendingWritingCount} câu Writing có thay đổi đang chờ lưu. Vui lòng đợi hoàn tất.</p> : null}
            {failedWritingCount ? <p className="mt-4 text-sm text-red-700">Còn {failedWritingCount} câu Writing chưa lưu được. Vui lòng chỉnh sửa để thử lưu lại.</p> : null}
            {missingSpeakingCount ? <p className="mt-2 text-sm text-amber-800">Còn {missingSpeakingCount} câu Speaking chưa được ghi và tải lên. Bài chỉ có thể nộp thủ công sau khi các bản ghi được lưu.</p> : null}
            <div className="mt-6 flex justify-end gap-3"><button className="btn-secondary" onClick={() => setConfirmOpen(false)} type="button">Tiếp tục kiểm tra</button><button className="btn-primary" disabled={submitting || manualSubmitBlocked} onClick={() => void submit('MANUAL')} type="button">{submitting ? 'Đang nộp…' : 'Nộp bài'}</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function GroupCard({ group, answers, marks, saveStates, onSave, onMark, onFocus, attemptId, onProductiveSaved, onProductiveSaveState, onUploading }: {
  group: PlacementExamGroup;
  answers: Record<string, string[]>;
  marks: Set<string>;
  saveStates: Record<string, SaveState>;
  onSave: (questionId: string, selected: string[]) => void;
  onMark: (questionId: string) => void;
  onFocus: (questionId: string) => void;
  attemptId: string;
  onProductiveSaved: (questionId: string, saved: boolean) => void;
  onProductiveSaveState: (questionId: string, state: ProductiveSaveState | null) => void;
  onUploading: (questionId: string, active: boolean) => void;
}) {
  const [audioError, setAudioError] = useState<string | null>(null);
  const playLegacyAudio = () => {
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
      <div className="flex flex-wrap items-center justify-between gap-3"><div><span className="text-xs font-bold uppercase tracking-wider text-indigo-600">{skillLabel(group.skill)}</span><h2 className="mt-1 text-xl font-bold">{group.title}</h2><p className="mt-1 text-sm text-slate-600">{group.instructions}</p></div>{group.skill === 'LISTENING' && (group.stimuli?.length ?? 0) === 0 ? <button className="btn-secondary" onClick={playLegacyAudio} type="button">Phát audio</button> : null}</div>
      {audioError ? <p className="mt-3 text-sm text-red-700" role="alert">{audioError}</p> : null}
      <Stimuli group={group} onError={setAudioError} />
      {group.skill === 'READING' && group.stimulusText ? <div className="mt-6 whitespace-pre-line rounded-xl bg-slate-50 p-5 leading-7 text-slate-800">{group.stimulusText}</div> : null}
      <div className="mt-6 space-y-6">
        {group.questions.map((question) => {
          const selected = answers[question.testQuestionId] ?? [];
          const multiple = question.responseType === 'MULTIPLE_CHOICE';
          const saveState = saveStates[question.testQuestionId] ?? 'idle';
          return (
            <article className="scroll-mt-32 rounded-xl border p-5" id={`question-${question.testQuestionId}`} key={question.testQuestionId} onFocus={() => onFocus(question.testQuestionId)}>
              <div className="flex items-start justify-between gap-4"><h3 className="font-semibold">Câu {question.orderIndex + 1}. {question.content}</h3><button aria-label="Đánh dấu xem lại" aria-pressed={marks.has(question.testQuestionId)} className={marks.has(question.testQuestionId) ? 'text-amber-600' : 'text-slate-400'} onClick={() => onMark(question.testQuestionId)} type="button"><Bookmark fill={marks.has(question.testQuestionId) ? 'currentColor' : 'none'} /></button></div>
              {question.responseType === 'TEXT_RESPONSE' ? (
                <WritingAnswer
                  attemptId={attemptId}
                  initialValue={question.textResponse ?? ''}
                  onSaved={onProductiveSaved}
                  onSaveState={onProductiveSaveState}
                  testQuestionId={question.testQuestionId}
                />
              ) : question.responseType === 'AUDIO_RESPONSE' ? (
                <SpeakingAnswer
                  attemptId={attemptId}
                  initialAudioUrl={question.audioUrl ?? null}
                  maxSeconds={group.maxRecordingSeconds ?? group.responseSeconds ?? 60}
                  preparationSeconds={group.preparationSeconds ?? 0}
                  onSaved={onProductiveSaved}
                  onSaveState={onProductiveSaveState}
                  onUploading={onUploading}
                  testQuestionId={question.testQuestionId}
                />
              ) : <div className="mt-4 grid gap-2">
                {question.options.map((option) => {
                  const checked = selected.includes(option.id);
                  return <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${checked ? 'border-indigo-500 bg-indigo-50' : 'hover:bg-slate-50'}`} key={option.id}><input checked={checked} name={question.testQuestionId} onChange={() => { const next = multiple ? checked ? selected.filter((id) => id !== option.id) : [...selected, option.id] : [option.id]; onSave(question.testQuestionId, next); }} type={multiple ? 'checkbox' : 'radio'} /><span>{option.content}</span></label>;
                })}
              </div>}
              {question.responseType !== 'TEXT_RESPONSE' && question.responseType !== 'AUDIO_RESPONSE' ? <p className={`mt-3 text-xs ${saveState === 'error' ? 'text-red-700' : 'text-slate-500'}`} role="status">{saveState === 'saving' ? 'Đang lưu…' : saveState === 'saved' ? 'Đã lưu' : saveState === 'error' ? 'Lỗi lưu — chọn lại để thử lại' : 'Chưa thay đổi'}</p> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function skillLabel(skill: PlacementExamGroup['skill']) {
  return ({ LISTENING: 'Listening', READING: 'Reading', SPEAKING: 'Speaking', WRITING: 'Writing' })[skill];
}

function Stimuli({ group, onError }: { group: PlacementExamGroup; onError: (message: string | null) => void }) {
  return <div className="mt-6 space-y-4">{(group.stimuli ?? []).map((stimulus) => {
    if (stimulus.type === 'TEXT') return <div className="whitespace-pre-line rounded-xl bg-slate-50 p-5 leading-7" key={stimulus.id}>{stimulus.textContent}</div>;
    if (stimulus.type === 'IMAGE') return <img alt={stimulus.altText ?? 'Hình minh họa cho bài kiểm tra'} className="mx-auto max-h-[42rem] max-w-full rounded-xl object-contain" key={stimulus.id} onError={() => onError('Không thể tải hình ảnh. Vui lòng thử lại.')} src={stimulus.mediaUrl ?? ''} />;
    return <audio className="w-full" controls key={stimulus.id} onError={() => onError('Không thể tải audio chuẩn của bài kiểm tra. Vui lòng thử lại; hệ thống không thay thế bằng giọng đọc tổng hợp.')} preload="metadata" src={stimulus.mediaUrl ?? ''} />;
  })}</div>;
}

function WritingAnswer({ attemptId, testQuestionId, initialValue, onSaved, onSaveState }: {
  attemptId: string;
  testQuestionId: string;
  initialValue: string;
  onSaved: (questionId: string, saved: boolean) => void;
  onSaveState: (questionId: string, state: ProductiveSaveState | null) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [state, setState] = useState<SaveState>(initialValue.trim() ? 'saved' : 'idle');
  const revision = useRef(0);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  useEffect(() => {
    if (revision.current === 0) return;
    const savingRevision = revision.current;
    setState('saving');
    onSaveState(testQuestionId, 'SAVING');
    const timer = window.setTimeout(() => {
      void placementApi.saveAnswer(attemptId, testQuestionId, { textResponse: value }).then(() => {
        if (!mounted.current || revision.current !== savingRevision) return;
        setState('saved');
        onSaved(testQuestionId, Boolean(value.trim()));
        onSaveState(testQuestionId, null);
      }).catch(() => {
        if (!mounted.current || revision.current !== savingRevision) return;
        setState('error');
        onSaveState(testQuestionId, 'ERROR');
      });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [attemptId, onSaveState, onSaved, testQuestionId, value]);
  return <div className="mt-4"><label className="font-medium" htmlFor={`writing-${testQuestionId}`}>Câu trả lời Writing</label><textarea className="mt-2 min-h-56 w-full rounded-xl border p-4" id={`writing-${testQuestionId}`} onChange={(event) => { revision.current += 1; setState('idle'); onSaveState(testQuestionId, 'DIRTY'); setValue(event.target.value); }} value={value} /><div className="mt-2 flex justify-between text-xs text-slate-600"><span role="status">{state === 'saving' ? 'Đang lưu…' : state === 'saved' ? 'Đã lưu' : state === 'error' ? 'Lỗi lưu — thử lại' : value ? 'Có thay đổi chưa lưu' : 'Chưa nhập'}</span><span>{value.trim() ? value.trim().split(/\s+/).length : 0} từ</span></div></div>;
}

function SpeakingAnswer({ attemptId, testQuestionId, initialAudioUrl, maxSeconds, preparationSeconds, onSaved, onSaveState, onUploading }: {
  attemptId: string; testQuestionId: string; initialAudioUrl: string | null; maxSeconds: number;
  preparationSeconds: number;
  onSaved: (questionId: string, saved: boolean) => void;
  onSaveState: (questionId: string, state: ProductiveSaveState | null) => void;
  onUploading: (questionId: string, active: boolean) => void;
}) {
  const [state, setState] = useState<'NOT_RECORDED' | 'PREPARING' | 'READY' | 'RECORDING' | 'RECORDED_LOCAL' | 'UPLOADING' | 'UPLOADED' | 'UPLOAD_ERROR'>(initialAudioUrl ? 'UPLOADED' : 'NOT_RECORDED');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(initialAudioUrl);
  const [seconds, setSeconds] = useState(0);
  const [preparationRemaining, setPreparationRemaining] = useState(preparationSeconds);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const mounted = useRef(true);
  useEffect(() => () => { if (localUrl) URL.revokeObjectURL(localUrl); }, [localUrl]);
  useEffect(() => () => {
    mounted.current = false;
    const activeRecorder = recorder.current;
    if (activeRecorder) {
      activeRecorder.ondataavailable = null;
      activeRecorder.onstop = null;
      activeRecorder.onerror = null;
      if (activeRecorder.state !== 'inactive') activeRecorder.stop();
    }
    stream.current?.getTracks().forEach((track) => track.stop());
    recorder.current = null;
    stream.current = null;
    chunks.current = [];
    onUploading(testQuestionId, false);
    onSaveState(testQuestionId, null);
  }, [onSaveState, onUploading, testQuestionId]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (state === 'RECORDING') { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [state]);
  useEffect(() => {
    if (state !== 'PREPARING') return;
    const timer = window.setTimeout(
      () => setPreparationRemaining((value) => {
        if (value <= 1) {
          setState('READY');
          return 0;
        }
        return value - 1;
      }),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [preparationRemaining, state]);
  useEffect(() => {
    if (state !== 'RECORDING') return;
    const timer = window.setInterval(() => setSeconds((value) => {
      if (value + 1 >= maxSeconds) recorder.current?.stop();
      return Math.min(value + 1, maxSeconds);
    }), 1000);
    return () => window.clearInterval(timer);
  }, [maxSeconds, state]);
  const start = async () => {
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      const type = ['audio/webm', 'audio/ogg', 'audio/mp4'].find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? '';
      const next = new MediaRecorder(media, type ? { mimeType: type } : undefined);
      stream.current = media; recorder.current = next; chunks.current = []; setSeconds(0);
      next.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      next.onstop = () => {
        media.getTracks().forEach((track) => track.stop());
        stream.current = null;
        recorder.current = null;
        if (!mounted.current) return;
        const recorded = new Blob(chunks.current, { type: next.mimeType || 'audio/webm' });
        setBlob(recorded);
        setLocalUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(recorded); });
        setState('RECORDED_LOCAL');
        onUploading(testQuestionId, false);
        onSaveState(testQuestionId, 'LOCAL_DRAFT');
      };
      next.onerror = () => {
        media.getTracks().forEach((track) => track.stop());
        stream.current = null;
        recorder.current = null;
        if (!mounted.current) return;
        setState('UPLOAD_ERROR');
        onUploading(testQuestionId, false);
        onSaveState(testQuestionId, 'ERROR');
      };
      next.start(); setState('RECORDING'); onUploading(testQuestionId, true); onSaveState(testQuestionId, 'RECORDING');
    } catch {
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      recorder.current = null;
      if (mounted.current) {
        setState('UPLOAD_ERROR');
        onSaveState(testQuestionId, null);
      }
    }
  };
  const stop = () => recorder.current?.stop();
  const upload = async () => {
    if (!blob) return;
    setState('UPLOADING'); onUploading(testQuestionId, true); onSaveState(testQuestionId, 'UPLOADING');
    try {
      const saved = await placementApi.uploadAudio(attemptId, testQuestionId, blob);
      if (!mounted.current) return;
      setPlaybackUrl(saved.playbackUrl);
      setLocalUrl((old) => { if (old) URL.revokeObjectURL(old); return null; });
      setBlob(null);
      setState('UPLOADED');
      onSaved(testQuestionId, true);
      onSaveState(testQuestionId, null);
    } catch {
      if (!mounted.current) return;
      setState('UPLOAD_ERROR');
      onSaveState(testQuestionId, 'ERROR');
    } finally {
      if (mounted.current) onUploading(testQuestionId, false);
    }
  };
  const discardLocalDraft = () => {
    setLocalUrl((old) => { if (old) URL.revokeObjectURL(old); return null; });
    setBlob(null);
    setState(playbackUrl ? 'UPLOADED' : 'NOT_RECORDED');
    onSaved(testQuestionId, Boolean(playbackUrl));
    onSaveState(testQuestionId, null);
  };
  const beginPreparation = () => {
    setPreparationRemaining(preparationSeconds);
    setState(preparationSeconds > 0 ? 'PREPARING' : 'READY');
  };
  const canPrepare = state === 'NOT_RECORDED' || state === 'UPLOADED' || state === 'RECORDED_LOCAL' || state === 'UPLOAD_ERROR';
  return <div className="mt-4 rounded-xl bg-slate-50 p-4"><div className="flex flex-wrap items-center gap-3">{canPrepare ? <button className="btn-secondary" onClick={beginPreparation} type="button"><Mic size={17} />{state === 'UPLOADED' || state === 'RECORDED_LOCAL' ? 'Ghi lại' : 'Bắt đầu chuẩn bị'}</button> : null}{state === 'READY' ? <button className="btn-primary" onClick={() => void start()} type="button"><Mic size={17} /> Bắt đầu ghi âm</button> : null}{state === 'RECORDING' ? <button className="btn-primary" onClick={stop} type="button"><Square size={16} /> Dừng</button> : null}<span aria-live="polite" className="text-sm">{state === 'PREPARING' ? `Thời gian chuẩn bị: ${preparationRemaining}s` : state === 'READY' ? 'Sẵn sàng ghi âm. Bản ghi chỉ bắt đầu khi bạn bấm nút.' : state === 'RECORDING' ? `Đang ghi âm ${seconds}/${maxSeconds}s` : state === 'RECORDED_LOCAL' ? 'Bản ghi mới chưa được lưu' : state === 'UPLOADING' ? 'Đang tải câu trả lời lên…' : state === 'UPLOADED' ? 'Đã lưu câu trả lời' : state === 'UPLOAD_ERROR' ? blob ? 'Bản ghi mới chưa được lưu — tải lên thất bại' : 'Lỗi ghi âm — thử lại' : 'Chưa ghi âm'}</span></div>{localUrl || playbackUrl ? <audio className="mt-4 w-full" controls src={localUrl ?? playbackUrl ?? ''} /> : null}{state === 'RECORDED_LOCAL' || state === 'UPLOAD_ERROR' && blob ? <div className="mt-4 flex flex-wrap gap-3"><button className="btn-primary" onClick={() => void upload()} type="button">Lưu câu trả lời</button>{playbackUrl ? <button className="btn-secondary" onClick={discardLocalDraft} type="button">Bỏ bản ghi mới</button> : null}</div> : null}</div>;
}

function Navigator({ groups, answers, productiveAnswered, marks, current, locked }: { groups: PlacementExamGroup[]; answers: Record<string, string[]>; productiveAnswered: Record<string, boolean>; marks: Set<string>; current: string | null; locked: boolean }) {
  const questions = groups.flatMap((group) => group.questions);
  const skills = [...new Set(groups.map((group) => group.skill))];
  return <div className="mt-4 space-y-4">{skills.map((skill) => <section aria-label={`${skillLabel(skill)} questions`} key={skill}><p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">{skillLabel(skill)}</p><div className="grid grid-cols-5 gap-2">{groups.filter((group) => group.skill === skill).flatMap((group) => group.questions).map((question) => { const index = questions.findIndex((candidate) => candidate.testQuestionId === question.testQuestionId); const answered = (answers[question.testQuestionId] ?? []).length > 0 || Boolean(productiveAnswered[question.testQuestionId]); const marked = marks.has(question.testQuestionId); return <a aria-label={`Câu ${index + 1}${answered ? ', đã trả lời' : ', chưa trả lời'}${marked ? ', đánh dấu' : ''}`} className={`grid size-10 place-items-center rounded-lg border text-sm font-semibold ${current === question.testQuestionId ? 'ring-2 ring-indigo-500' : ''} ${marked ? 'border-amber-500 bg-amber-50' : answered ? 'border-emerald-500 bg-emerald-50' : 'bg-white'}`} href={`#question-${question.testQuestionId}`} key={question.testQuestionId} onClick={(event) => { if (locked) { event.preventDefault(); return; } document.getElementById(`question-${question.testQuestionId}`)?.focus(); }}>{index + 1}</a>; })}</div></section>)}</div>;
}

function ExamState({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return <section className="mx-auto mt-16 max-w-xl rounded-2xl border bg-white p-8 text-center shadow-sm"><CheckCircle2 className="mx-auto text-emerald-600" size={48} /><h1 className="mt-4 text-2xl font-bold">{title}</h1><p className="mt-3 text-slate-600">{text}</p>{children}</section>;
}
