import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Mic, Square } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { studentAssessmentApi } from '@/features/assessments/api';
import { studentAssessmentErrorMessage } from '@/features/assessments/errors';
import type {
  StudentAnswerSelection,
  StudentAttemptContent,
  StudentAttemptGroup,
  StudentAttemptQuestion,
  StudentAttemptStimulus,
  ToeicSkill,
} from '@/features/assessments/types';
import { useSessionExpiry } from '@/features/auth/use-session-expiry';
import { ApiError } from '@/lib/api-client';

type Draft = { selectedOptionIds: string[]; textResponse: string; audioUploaded: boolean };
type Drafts = Record<string, Draft>;
type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
export type RecorderState = 'PREP' | 'READY' | 'RECORDING' | 'LOCAL_DRAFT' | 'UPLOADING' | 'COMMITTED' | 'UPLOAD_ERROR';

const skillLabels: Record<ToeicSkill, string> = { LISTENING: 'Listening', READING: 'Reading', SPEAKING: 'Speaking', WRITING: 'Writing' };
const stageLabels = { PERIODIC: 'Thường kỳ', MIDTERM: 'Giữa kỳ', FINAL: 'Cuối kỳ' } as const;

export function StudentTestAttemptPage() {
  const { enrollmentId, attemptId } = useParams<{ enrollmentId: string; attemptId: string }>();
  const navigate = useNavigate();
  const redirectExpiredSession = useSessionExpiry();
  const [content, setContent] = useState<StudentAttemptContent | null>(null);
  const [drafts, setDrafts] = useState<Drafts>({});
  const draftsRef = useRef<Drafts>({});
  const questionsRef = useRef<StudentAttemptQuestion[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revision = useRef(0);
  const committedRevision = useRef(0);
  const saveInFlight = useRef<Promise<void> | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [audioStates, setAudioStates] = useState<Record<string, RecorderState>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [expired, setExpired] = useState(false);
  const expiryHandled = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    if (!enrollmentId || !attemptId) return;
    void studentAssessmentApi.getAttempt(enrollmentId, attemptId, controller.signal).then((data) => {
      if (data.attempt.status === 'SUBMITTED') {
        navigate(`/student/enrollments/${enrollmentId}/attempts/${attemptId}/result`, { replace: true });
        return;
      }
      const questions = data.groups?.flatMap((group) => group.questions) ?? data.questions ?? [];
      const restored = Object.fromEntries(questions.map((item) => [item.testQuestionId, {
        selectedOptionIds: item.selectedOptionIds ?? [],
        textResponse: item.textResponse ?? '',
        audioUploaded: Boolean(item.audioUploaded),
      }]));
      questionsRef.current = questions;
      draftsRef.current = restored;
      setDrafts(restored);
      setContent(data);
      setError(null);
    }).catch(async (requestError) => {
      if (requestError instanceof Error && requestError.name === 'AbortError') return;
      if (await redirectExpiredSession(requestError)) return;
      setError(studentAssessmentErrorMessage(requestError, 'Không thể tải lượt làm bài.'));
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [attemptId, enrollmentId, navigate, redirectExpiredSession]);

  useEffect(() => {
    if (!content?.attempt.expiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [content?.attempt.expiresAt]);

  const groups = useMemo(() => normalizedGroups(content), [content]);
  const questions = useMemo(() => groups.flatMap((group) => group.questions), [groups]);
  const activeGroup = groups[Math.min(activeGroupIndex, Math.max(0, groups.length - 1))];
  const answered = questions.filter((question) => isAnswered(question, drafts[question.testQuestionId])).length;
  const secondsLeft = content?.attempt.expiresAt
    ? Math.max(0, Math.ceil((new Date(content.attempt.expiresAt).getTime() - now) / 1000))
    : null;
  const unsafeAudio = Object.values(audioStates).some((state) => state === 'RECORDING' || state === 'UPLOADING');

  useEffect(() => {
    if (secondsLeft !== 0 || expiryHandled.current || !enrollmentId || !attemptId) return;
    expiryHandled.current = true;
    setExpired(true);
    setConfirming(false);
    void studentAssessmentApi.getAttempt(enrollmentId, attemptId).then((current) => {
      if (current.attempt.status === 'SUBMITTED') {
        navigate(`/student/enrollments/${enrollmentId}/attempts/${attemptId}/result`, { replace: true });
      }
    }).catch(async (requestError) => {
      if (await redirectExpiredSession(requestError)) return;
      setError('Phiên làm bài đã hết hạn. Vui lòng tải lại để xem trạng thái mới nhất.');
    });
  }, [attemptId, enrollmentId, navigate, redirectExpiredSession, secondsLeft]);

  useEffect(() => {
    if (!unsafeAudio) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsafeAudio]);

  const drainSaveQueue = useCallback(async (): Promise<void> => {
    if (!enrollmentId || !attemptId) return;
    if (saveInFlight.current) return saveInFlight.current;
    const run = async () => {
      while (committedRevision.current < revision.current) {
        const targetRevision = revision.current;
        const snapshot = draftsRef.current;
        setSaveStatus('saving');
        await studentAssessmentApi.saveAnswers(enrollmentId, attemptId, answerPayload(questionsRef.current, snapshot));
        committedRevision.current = targetRevision;
      }
      setSaveStatus('saved');
    };
    const pending = run().catch(async (requestError: unknown) => {
      if (await redirectExpiredSession(requestError)) return;
      setSaveStatus('error');
      setError(studentAssessmentErrorMessage(requestError, 'Không thể tự động lưu câu trả lời.'));
      throw requestError;
    }).finally(() => { saveInFlight.current = null; });
    saveInFlight.current = pending;
    return pending;
  }, [attemptId, enrollmentId, redirectExpiredSession]);

  const scheduleSave = () => {
    revision.current += 1;
    setSaveStatus('pending');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void drainSaveQueue().catch(() => undefined);
    }, 500);
  };

  const updateDraft = (id: string, update: Partial<Draft>) => {
    const next = { ...draftsRef.current, [id]: { ...draftsRef.current[id], ...update } };
    draftsRef.current = next;
    setDrafts(next);
    scheduleSave();
  };

  const uploadAudio = async (questionId: string, blob: Blob): Promise<string> => {
    if (!enrollmentId || !attemptId) throw new Error('Missing assessment context');
    try {
      const uploaded = await studentAssessmentApi.uploadAudio(enrollmentId, attemptId, questionId, blob);
      const next = { ...draftsRef.current, [questionId]: { ...draftsRef.current[questionId], audioUploaded: true } };
      draftsRef.current = next;
      setDrafts(next);
      return uploaded.playbackUrl;
    } catch (requestError) {
      if (await redirectExpiredSession(requestError)) throw requestError;
      setError(studentAssessmentErrorMessage(requestError, 'Không thể tải bản ghi âm lên.'));
      throw requestError;
    }
  };

  const submit = async () => {
    if (!enrollmentId || !attemptId || submitting || unsafeAudio || expired) return;
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    setSubmitting(true);
    setError(null);
    try {
      await drainSaveQueue();
      const result = await studentAssessmentApi.submit(enrollmentId, attemptId, answerPayload(questionsRef.current, draftsRef.current));
      navigate(`/student/enrollments/${enrollmentId}/attempts/${result.attempt.id}/result`, { replace: true });
    } catch (requestError) {
      if (await redirectExpiredSession(requestError)) return;
      if (requestError instanceof ApiError && requestError.status === 409) {
        try {
          const current = await studentAssessmentApi.getAttempt(enrollmentId, attemptId);
          if (current.attempt.status === 'SUBMITTED') {
            navigate(`/student/enrollments/${enrollmentId}/attempts/${attemptId}/result`, { replace: true });
            return;
          }
        } catch { /* keep the safe error below */ }
      }
      setError(studentAssessmentErrorMessage(requestError, 'Không thể nộp bài. Câu trả lời của bạn vẫn được giữ để thử lại.'));
      setConfirming(false);
      setSubmitting(false);
    }
  };

  if (loading) return <p className="py-12 text-center text-slate-500" role="status">Đang tải bài kiểm tra...</p>;
  if (!content) return <ErrorPanel message={error ?? 'Không tìm thấy lượt làm bài.'} onRetry={() => window.location.reload()} />;

  const groupStarts = groupStartNumbers(groups);
  const missingObjective = questions.filter((question) => !['TEXT_RESPONSE', 'AUDIO_RESPONSE'].includes(responseType(question)) && !isAnswered(question, drafts[question.testQuestionId])).length;
  const missingSpeaking = questions.filter((question) => responseType(question) === 'AUDIO_RESPONSE' && !drafts[question.testQuestionId]?.audioUploaded).length;
  const missingWriting = questions.filter((question) => responseType(question) === 'TEXT_RESPONSE' && !drafts[question.testQuestionId]?.textResponse.trim()).length;

  return <div className="mx-auto max-w-7xl space-y-5 pb-28">
    <header className="sticky top-0 z-20 rounded-xl border bg-white/95 p-4 shadow-sm backdrop-blur"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">{content.test.stage ? stageLabels[content.test.stage] : 'Bài kiểm tra trên lớp'}</p><h1 className="text-xl font-bold">{content.test.title}</h1></div><div className="flex flex-wrap gap-3 text-sm"><span>{answered}/{questions.length} đã trả lời</span><SaveIndicator status={saveStatus} />{secondsLeft !== null && <span className={secondsLeft < 300 ? 'font-bold text-red-700' : 'font-semibold'}>{formatTime(secondsLeft)}</span>}</div></div></header>
    {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</div>}
    {expired && <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="status">Đã hết thời gian làm bài. Hệ thống đang xác nhận trạng thái nộp bài.</div>}
    <MobileNavigator groups={groups} drafts={drafts} activeIndex={activeGroupIndex} starts={groupStarts} disabled={unsafeAudio} onSelect={setActiveGroupIndex} />
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
      {activeGroup ? <section className="rounded-2xl border bg-slate-50 p-4 sm:p-6"><div className="mb-4"><span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-800">{skillLabels[activeGroup.skill]}</span><h2 className="mt-2 text-xl font-semibold">{activeGroup.title ?? `${skillLabels[activeGroup.skill]} · Câu ${groupStarts[activeGroupIndex]}`}</h2>{activeGroup.instructions && <p className="mt-1 text-sm text-slate-600">{activeGroup.instructions}</p>}</div><Stimuli stimuli={activeGroup.stimuli} stimulusText={activeGroup.stimulusText} /><div className="mt-5 space-y-4">{activeGroup.questions.map((question, questionIndex) => <QuestionCard key={question.testQuestionId} number={groupStarts[activeGroupIndex] + questionIndex} question={question} draft={drafts[question.testQuestionId]} disabled={submitting || expired} preparationSeconds={activeGroup.preparationSeconds ?? 0} maxRecordingSeconds={activeGroup.maxRecordingSeconds ?? activeGroup.responseSeconds ?? 60} onChange={(update) => updateDraft(question.testQuestionId, update)} onAudio={(blob) => uploadAudio(question.testQuestionId, blob)} onAudioState={(state) => setAudioStates((current) => ({ ...current, [question.testQuestionId]: state }))} />)}</div><div className="mt-6 flex justify-between gap-3"><button className="rounded border px-4 py-2 disabled:opacity-50" disabled={activeGroupIndex === 0 || unsafeAudio} onClick={() => setActiveGroupIndex((index) => Math.max(0, index - 1))} type="button"><ChevronLeft className="inline" size={17} /> Trước</button><button className="rounded border px-4 py-2 disabled:opacity-50" disabled={activeGroupIndex >= groups.length - 1 || unsafeAudio} onClick={() => setActiveGroupIndex((index) => Math.min(groups.length - 1, index + 1))} type="button">Tiếp <ChevronRight className="inline" size={17} /></button></div></section> : null}
      <DesktopNavigator groups={groups} drafts={drafts} activeIndex={activeGroupIndex} starts={groupStarts} disabled={unsafeAudio} onSelect={setActiveGroupIndex} />
    </div>
    <footer className="fixed inset-x-0 bottom-0 z-20 border-t bg-white p-3 shadow-lg"><div className="mx-auto flex max-w-7xl items-center justify-between gap-3"><button className="rounded border px-4 py-2 text-sm disabled:opacity-50" disabled={unsafeAudio} onClick={() => navigate(`/student/enrollments/${enrollmentId}/tests`)} type="button">Danh sách bài kiểm tra</button><button className="rounded bg-blue-600 px-6 py-2.5 font-semibold text-white disabled:opacity-50" disabled={submitting || unsafeAudio || expired} onClick={() => setConfirming(true)} type="button">Nộp bài</button></div></footer>
    {confirming && <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/50 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><h2 className="text-xl font-bold">Xác nhận nộp bài</h2><p className="mt-2 text-sm text-slate-600">Bạn đã trả lời {answered}/{questions.length} câu. Sau khi nộp, câu trả lời không thể chỉnh sửa.</p><ul className="mt-3 space-y-1 text-sm text-slate-600"><li>Chưa trả lời trắc nghiệm: {missingObjective}</li><li>Chưa lưu Speaking: {missingSpeaking}</li><li>Chưa lưu Writing: {missingWriting}</li><li>Trạng thái lưu: <SaveIndicator status={saveStatus} /></li></ul><div className="mt-5 flex justify-end gap-2"><button className="rounded border px-4 py-2" disabled={submitting} onClick={() => setConfirming(false)} type="button">Kiểm tra lại</button><button className="rounded bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={submitting || unsafeAudio} onClick={() => void submit()} type="button">{submitting ? 'Đang nộp...' : 'Xác nhận nộp'}</button></div></div></div>}
  </div>;
}

function QuestionCard({ question, number, draft, disabled, preparationSeconds, maxRecordingSeconds, onChange, onAudio, onAudioState }: { question: StudentAttemptQuestion; number: number; draft?: Draft; disabled: boolean; preparationSeconds: number; maxRecordingSeconds: number; onChange: (value: Partial<Draft>) => void; onAudio: (blob: Blob) => Promise<string>; onAudioState: (state: RecorderState) => void }) {
  const type = responseType(question); const selected = draft?.selectedOptionIds ?? [];
  return <article className="rounded-xl border bg-white p-5 shadow-sm"><div className="flex justify-between gap-3"><h3 className="font-medium"><span className="mr-1 text-slate-500">Câu {number}.</span><span className="whitespace-pre-wrap">{question.question.content}</span></h3><span className="whitespace-nowrap text-sm text-slate-500">{question.points} điểm</span></div>{['SINGLE_CHOICE', 'TRUE_FALSE', 'MULTIPLE_CHOICE'].includes(type) && <div className="mt-4 space-y-2">{question.question.options.map((option) => { const multiple = type === 'MULTIPLE_CHOICE'; return <label className="flex cursor-pointer gap-3 rounded-lg border p-3 hover:bg-slate-50" key={option.id}><input className="mt-1" disabled={disabled} type={multiple ? 'checkbox' : 'radio'} name={multiple ? undefined : question.testQuestionId} checked={selected.includes(option.id)} onChange={(event) => onChange({ selectedOptionIds: multiple ? event.target.checked ? [...new Set([...selected, option.id])] : selected.filter((id) => id !== option.id) : [option.id] })}/><span>{option.content}</span></label>; })}</div>}{type === 'TEXT_RESPONSE' && <div className="mt-4"><textarea className="min-h-40 w-full rounded-lg border p-3" disabled={disabled} maxLength={5000} placeholder="Nhập câu trả lời của bạn..." value={draft?.textResponse ?? ''} onChange={(event) => onChange({ textResponse: event.target.value })}/><p className="mt-1 text-right text-xs text-slate-500">{draft?.textResponse.trim().split(/\s+/).filter(Boolean).length ?? 0} từ</p></div>}{type === 'AUDIO_RESPONSE' && <AudioRecorder disabled={disabled} initialPlaybackUrl={question.audioUrl ?? null} initialCommitted={Boolean(draft?.audioUploaded)} preparationSeconds={preparationSeconds} maxSeconds={maxRecordingSeconds} onUpload={onAudio} onStateChange={onAudioState} />}</article>;
}

export function AudioRecorder({ disabled, initialCommitted, initialPlaybackUrl, preparationSeconds, maxSeconds, onUpload, onStateChange }: { disabled: boolean; initialCommitted: boolean; initialPlaybackUrl: string | null; preparationSeconds: number; maxSeconds: number; onUpload: (blob: Blob) => Promise<string>; onStateChange: (state: RecorderState) => void }) {
  const [state, setState] = useState<RecorderState>(initialCommitted ? 'COMMITTED' : 'PREP');
  const [prepActive, setPrepActive] = useState(false); const [preparationRemaining, setPreparationRemaining] = useState(preparationSeconds); const [seconds, setSeconds] = useState(0); const [blob, setBlob] = useState<Blob | null>(null); const [localUrl, setLocalUrl] = useState<string | null>(null); const [committedUrl, setCommittedUrl] = useState<string | null>(initialPlaybackUrl); const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null); const stream = useRef<MediaStream | null>(null); const chunks = useRef<Blob[]>([]); const localUrlRef = useRef<string | null>(null); const mounted = useRef(true);
  const updateState = useCallback((next: RecorderState) => { setState(next); onStateChange(next); }, [onStateChange]);
  const stopTracks = useCallback(() => { stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null; }, []);
  const revokeLocal = useCallback(() => { if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current); localUrlRef.current = null; setLocalUrl(null); }, []);
  useEffect(() => { if (state !== 'PREP' || !prepActive || preparationRemaining <= 0) return; const timer = window.setTimeout(() => setPreparationRemaining((value) => { if (value <= 1) { setPrepActive(false); updateState('READY'); return 0; } return value - 1; }), 1000); return () => window.clearTimeout(timer); }, [prepActive, preparationRemaining, state, updateState]);
  const stop = useCallback(() => { const current = recorder.current; if (current && current.state !== 'inactive') current.stop(); }, []);
  useEffect(() => { if (state !== 'RECORDING') return; if (seconds >= maxSeconds) { stop(); return; } const timer = window.setTimeout(() => setSeconds((value) => value + 1), 1000); return () => window.clearTimeout(timer); }, [maxSeconds, seconds, state, stop]);
  useEffect(() => () => { mounted.current = false; const current = recorder.current; if (current && current.state !== 'inactive') { current.ondataavailable = null; current.onstop = null; current.stop(); } stopTracks(); if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current); }, [stopTracks]);
  const beginPreparation = () => { revokeLocal(); setBlob(null); setError(null); setPreparationRemaining(preparationSeconds); if (preparationSeconds > 0) { setPrepActive(true); updateState('PREP'); } else { setPrepActive(false); updateState('READY'); } };
  const start = async () => { try { if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('unsupported'); const media = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.current = media; const mimeType = ['audio/webm', 'audio/ogg', 'audio/mp4'].find((candidate) => MediaRecorder.isTypeSupported(candidate)); const next = new MediaRecorder(media, mimeType ? { mimeType } : undefined); chunks.current = []; next.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); }; next.onstop = () => { stopTracks(); recorder.current = null; if (!mounted.current) return; const recorded = new Blob(chunks.current, { type: next.mimeType || 'audio/webm' }); revokeLocal(); const url = URL.createObjectURL(recorded); localUrlRef.current = url; setLocalUrl(url); setBlob(recorded); updateState('LOCAL_DRAFT'); }; recorder.current = next; setSeconds(0); setError(null); updateState('RECORDING'); next.start(); } catch { stopTracks(); setError('Trình duyệt chưa cấp quyền sử dụng micro hoặc không hỗ trợ ghi âm.'); updateState(committedUrl || initialCommitted ? 'COMMITTED' : 'UPLOAD_ERROR'); } };
  const upload = async () => { if (!blob) return; updateState('UPLOADING'); setError(null); try { const playbackUrl = await onUpload(blob); setCommittedUrl(playbackUrl); revokeLocal(); setBlob(null); updateState('COMMITTED'); } catch { setError('Tải bản ghi lên chưa thành công. Bản ghi đã lưu trước đó vẫn được giữ.'); updateState('UPLOAD_ERROR'); } };
  const discardLocalDraft = () => { revokeLocal(); setBlob(null); setError(null); updateState(committedUrl || initialCommitted ? 'COMMITTED' : 'PREP'); };
  const canPrepare = state === 'PREP' && !prepActive || state === 'COMMITTED'; const playback = state === 'LOCAL_DRAFT' || state === 'UPLOAD_ERROR' ? localUrl : committedUrl;
  return <div className="mt-4 rounded-lg border border-dashed p-4"><div className="flex flex-wrap items-center gap-3">{canPrepare && <button className="rounded bg-indigo-600 px-4 py-2 font-medium text-white disabled:opacity-50" disabled={disabled} onClick={beginPreparation} type="button"><Mic className="inline" size={17} /> {state === 'COMMITTED' ? 'Ghi lại' : 'Bắt đầu chuẩn bị'}</button>}{state === 'READY' && <button className="rounded bg-indigo-600 px-4 py-2 font-medium text-white disabled:opacity-50" disabled={disabled} onClick={() => void start()} type="button"><Mic className="inline" size={17} /> Bắt đầu ghi âm</button>}{state === 'RECORDING' && <button className="rounded bg-red-600 px-4 py-2 font-medium text-white" onClick={stop} type="button"><Square className="inline" size={16} /> Dừng</button>}<span aria-live="polite" className="text-sm">{state === 'PREP' && prepActive ? `Thời gian chuẩn bị: ${preparationRemaining}s` : state === 'READY' ? 'Sẵn sàng ghi âm.' : state === 'RECORDING' ? `Đang ghi âm ${Math.min(seconds, maxSeconds)}/${maxSeconds}s` : state === 'LOCAL_DRAFT' ? 'Bản ghi mới chưa được lưu.' : state === 'UPLOADING' ? 'Đang tải câu trả lời lên...' : state === 'COMMITTED' ? 'Đã lưu câu trả lời.' : state === 'UPLOAD_ERROR' ? 'Bản ghi mới chưa được lưu.' : 'Chưa ghi âm.'}</span></div>{playback && <audio className="mt-4 w-full" controls src={playback} />}{(state === 'LOCAL_DRAFT' || state === 'UPLOAD_ERROR' && blob) && <div className="mt-4 flex flex-wrap gap-3"><button className="rounded bg-indigo-600 px-4 py-2 font-medium text-white" onClick={() => void upload()} type="button">{state === 'UPLOAD_ERROR' ? 'Thử tải lại' : 'Lưu câu trả lời'}</button><button className="rounded border px-4 py-2" onClick={discardLocalDraft} type="button">Bỏ bản ghi mới</button></div>}{error && <p className="mt-2 text-sm text-red-700">{error}</p>}</div>;
}

type NavigatorProps = { groups: StudentAttemptGroup[]; drafts: Drafts; activeIndex: number; starts: number[]; disabled: boolean; onSelect: (index: number) => void };
function DesktopNavigator(props: NavigatorProps) { return <aside className="hidden self-start rounded-2xl border bg-white p-4 shadow-sm lg:sticky lg:top-24 lg:block"><h2 className="font-bold">Điều hướng câu hỏi</h2><NavigatorContent {...props} /></aside>; }
function MobileNavigator(props: NavigatorProps) { return <details className="rounded-xl border bg-white p-4 lg:hidden"><summary className="cursor-pointer font-semibold">Điều hướng câu hỏi</summary><NavigatorContent {...props} /></details>; }
function NavigatorContent({ groups, drafts, activeIndex, starts, disabled, onSelect }: NavigatorProps) { return <div className="mt-3 space-y-4">{(['LISTENING', 'READING', 'SPEAKING', 'WRITING'] as ToeicSkill[]).map((skill) => { const skillGroups = groups.map((group, index) => ({ group, index })).filter(({ group }) => group.skill === skill); if (!skillGroups.length) return null; return <section key={skill}><h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{skillLabels[skill]}</h3><div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-1">{skillGroups.map(({ group, index }) => { const complete = group.questions.every((question) => isAnswered(question, drafts[question.testQuestionId])); const end = starts[index] + group.questions.length - 1; return <button aria-current={index === activeIndex ? 'step' : undefined} className={`rounded-lg border px-3 py-2 text-left text-sm ${index === activeIndex ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : complete ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'bg-white text-slate-600'}`} disabled={disabled} key={group.id} onClick={() => onSelect(index)} type="button">Câu {starts[index]}{end > starts[index] ? `–${end}` : ''} · {complete ? 'Đã trả lời' : 'Chưa hoàn tất'}</button>; })}</div></section>; })}</div>; }
function Stimuli({ stimuli, stimulusText }: { stimuli: StudentAttemptStimulus[]; stimulusText?: string | null }) { return <div className="space-y-3">{stimulusText && <div className="whitespace-pre-wrap rounded-xl border bg-white p-4 text-sm leading-7">{stimulusText}</div>}{stimuli.map((stimulus) => <div className="rounded-xl border bg-white p-3" key={stimulus.id}>{stimulus.type === 'TEXT' ? <p className="whitespace-pre-wrap">{stimulus.textContent}</p> : stimulus.type === 'IMAGE' ? <img className="mx-auto max-h-96 rounded object-contain" src={stimulus.mediaUrl ?? ''} alt={stimulus.altText ?? 'Nội dung câu hỏi'} /> : <audio className="w-full" controls preload="metadata" src={stimulus.mediaUrl ?? ''}>Trình duyệt không hỗ trợ phát âm thanh.</audio>}</div>)}</div>; }
function normalizedGroups(content: StudentAttemptContent | null): StudentAttemptGroup[] { if (!content) return []; if (content.groups?.length) return [...content.groups].sort((left, right) => left.orderIndex - right.orderIndex); const questions = content.questions ?? []; return questions.length ? [{ id: 'legacy-objective-questions', skill: questions[0].question.toeicSkill ?? 'READING', orderIndex: 0, title: null, instructions: null, taskCode: null, preparationSeconds: null, responseSeconds: null, recommendedSeconds: null, maxRecordingSeconds: null, stimulusText: null, stimuli: [], questions }] : []; }
function groupStartNumbers(groups: StudentAttemptGroup[]): number[] { let next = 1; return groups.map((group) => { const start = next; next += group.questions.length; return start; }); }
function answerPayload(questions: StudentAttemptQuestion[], drafts: Drafts): StudentAnswerSelection[] { return questions.reduce<StudentAnswerSelection[]>((payload, question) => { const draft = drafts[question.testQuestionId]; const type = responseType(question); if (type === 'AUDIO_RESPONSE') return payload; if (type === 'TEXT_RESPONSE') payload.push({ testQuestionId: question.testQuestionId, textResponse: draft?.textResponse ?? '' }); else payload.push({ testQuestionId: question.testQuestionId, selectedOptionIds: draft?.selectedOptionIds ?? [] }); return payload; }, []); }
function responseType(question: StudentAttemptQuestion) { return question.question.responseType ?? question.question.type; }
function isAnswered(question: StudentAttemptQuestion, draft?: Draft) { const type = responseType(question); return type === 'TEXT_RESPONSE' ? Boolean(draft?.textResponse.trim()) : type === 'AUDIO_RESPONSE' ? Boolean(draft?.audioUploaded) : Boolean(draft?.selectedOptionIds.length); }
function formatTime(seconds: number) { return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`; }
function SaveIndicator({ status }: { status: SaveStatus }) { const labels = { idle: 'Sẵn sàng', pending: 'Chờ tự động lưu...', saving: 'Đang lưu...', saved: 'Đã lưu', error: 'Lưu chưa thành công' }; return <span className={status === 'error' ? 'text-red-700' : 'text-slate-500'}>{labels[status]}</span>; }
function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="mx-auto max-w-2xl rounded-xl border border-red-200 bg-red-50 p-6 text-red-700" role="alert">{message}<button className="ml-3 font-semibold underline" onClick={onRetry} type="button">Thử lại</button></div>; }
