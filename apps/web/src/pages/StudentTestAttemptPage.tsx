import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { studentAssessmentApi } from '@/features/assessments/api';
import { studentAssessmentErrorMessage } from '@/features/assessments/errors';
import type { StudentAnswerSelection, StudentAttemptContent, StudentAttemptQuestion, StudentAttemptStimulus, ToeicSkill } from '@/features/assessments/types';
import { useSessionExpiry } from '@/features/auth/use-session-expiry';
import { ApiError } from '@/lib/api-client';

type Draft = { selectedOptionIds: string[]; textResponse: string; audioUploaded: boolean };
type Drafts = Record<string, Draft>;
type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
const skillLabels: Record<ToeicSkill, string> = { LISTENING: 'Listening', READING: 'Reading', SPEAKING: 'Speaking', WRITING: 'Writing' };

export function StudentTestAttemptPage() {
  const { enrollmentId, attemptId } = useParams<{ enrollmentId: string; attemptId: string }>();
  const navigate = useNavigate();
  const redirectExpiredSession = useSessionExpiry();
  const [content, setContent] = useState<StudentAttemptContent | null>(null);
  const [drafts, setDrafts] = useState<Drafts>({});
  const draftsRef = useRef<Drafts>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveGeneration = useRef(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    if (!enrollmentId || !attemptId) return;
    void studentAssessmentApi.getAttempt(enrollmentId, attemptId, controller.signal).then((data) => {
      if (data.attempt.status === 'SUBMITTED') {
        navigate(`/student/enrollments/${enrollmentId}/attempts/${attemptId}/result`, { replace: true });
        return;
      }
      const questions = data.groups?.flatMap((group) => group.questions) ?? data.questions ?? [];
      const restored = Object.fromEntries(questions.map((item) => [item.testQuestionId, { selectedOptionIds: item.selectedOptionIds ?? [], textResponse: item.textResponse ?? '', audioUploaded: Boolean(item.audioUploaded) }]));
      draftsRef.current = restored;
      setDrafts(restored);
      setContent(data);
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

  const questions = useMemo(() => content?.groups?.flatMap((group) => group.questions) ?? content?.questions ?? [], [content]);
  const answered = questions.filter((question) => isAnswered(question, drafts[question.testQuestionId])).length;
  const secondsLeft = content?.attempt.expiresAt ? Math.max(0, Math.ceil((new Date(content.attempt.expiresAt).getTime() - now) / 1000)) : null;

  const persist = (next: Drafts) => {
    if (!enrollmentId || !attemptId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const generation = ++saveGeneration.current;
    setSaveStatus('pending');
    saveTimer.current = setTimeout(() => {
      setSaveStatus('saving');
      void studentAssessmentApi.saveAnswers(enrollmentId, attemptId, answerPayload(questions, next)).then(() => { if (generation === saveGeneration.current) setSaveStatus('saved'); }).catch(async (requestError: unknown) => {
        if (generation !== saveGeneration.current) return;
        if (await redirectExpiredSession(requestError)) return;
        setSaveStatus('error');
        setError(studentAssessmentErrorMessage(requestError, 'Không thể tự động lưu câu trả lời.'));
      });
    }, 500);
  };
  const updateDraft = (id: string, update: Partial<Draft>) => {
    const next = { ...draftsRef.current, [id]: { ...draftsRef.current[id], ...update } };
    draftsRef.current = next; setDrafts(next); persist(next);
  };
  const uploadAudio = async (questionId: string, blob: Blob) => {
    if (!enrollmentId || !attemptId) return;
    setSaveStatus('saving');
    try {
      await studentAssessmentApi.uploadAudio(enrollmentId, attemptId, questionId, blob);
      const next = { ...draftsRef.current, [questionId]: { ...draftsRef.current[questionId], audioUploaded: true } };
      draftsRef.current = next; setDrafts(next); setSaveStatus('saved');
    } catch (requestError) {
      if (await redirectExpiredSession(requestError)) return;
      setSaveStatus('error'); setError(studentAssessmentErrorMessage(requestError, 'Không thể tải bản ghi âm lên.'));
    }
  };
  const submit = async () => {
    if (!enrollmentId || !attemptId || submitting) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveGeneration.current += 1;
    setSubmitting(true); setError(null);
    try {
      const result = await studentAssessmentApi.submit(enrollmentId, attemptId, answerPayload(questions, draftsRef.current));
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
        } catch { /* retain the safe submission error below */ }
      }
      setError(studentAssessmentErrorMessage(requestError, 'Không thể nộp bài. Câu trả lời của bạn vẫn được giữ để thử lại.'));
      setConfirming(false); setSubmitting(false);
    }
  };

  if (loading) return <p className="py-12 text-center text-slate-500" role="status">Đang tải bài kiểm tra...</p>;
  if (!content) return <ErrorPanel message={error ?? 'Không tìm thấy lượt làm bài.'} />;
  return <div className="mx-auto max-w-6xl space-y-5 pb-24">
    <header className="sticky top-0 z-20 rounded-xl border bg-white/95 p-4 shadow-sm backdrop-blur"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Bài kiểm tra trên lớp</p><h1 className="text-xl font-bold">{content.test.title}</h1></div><div className="flex gap-3 text-sm"><span>{answered}/{questions.length} đã trả lời</span><SaveIndicator status={saveStatus} />{secondsLeft !== null && <span className={secondsLeft < 300 ? 'font-bold text-red-700' : 'font-semibold'}>{formatTime(secondsLeft)}</span>}</div></div></header>
    {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</div>}
    {(content.groups ?? []).map((group) => <section className="rounded-2xl border bg-slate-50 p-4 sm:p-6" key={group.id}><div className="mb-4"><span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-800">{skillLabels[group.skill]}</span><h2 className="mt-2 text-xl font-semibold">{group.title ?? skillLabels[group.skill]}</h2>{group.instructions && <p className="mt-1 text-sm text-slate-600">{group.instructions}</p>}</div><Stimuli stimuli={group.stimuli} stimulusText={group.stimulusText} /><div className="mt-5 space-y-4">{group.questions.map((question) => <QuestionCard key={question.testQuestionId} question={question} draft={drafts[question.testQuestionId]} disabled={submitting} onChange={(update) => updateDraft(question.testQuestionId, update)} onAudio={(blob) => void uploadAudio(question.testQuestionId, blob)} />)}</div></section>)}
    {!content.groups?.length && <div className="space-y-4">{questions.map((question) => <QuestionCard key={question.testQuestionId} question={question} draft={drafts[question.testQuestionId]} disabled={submitting} onChange={(update) => updateDraft(question.testQuestionId, update)} onAudio={(blob) => void uploadAudio(question.testQuestionId, blob)} />)}</div>}
    <footer className="fixed inset-x-0 bottom-0 z-20 border-t bg-white p-3 shadow-lg"><div className="mx-auto flex max-w-6xl items-center justify-between gap-3"><Link className="rounded border px-4 py-2 text-sm" to={`/student/enrollments/${enrollmentId}/tests`}>Danh sách bài kiểm tra</Link><button className="rounded bg-blue-600 px-6 py-2.5 font-semibold text-white disabled:opacity-50" disabled={submitting} onClick={() => setConfirming(true)} type="button">Nộp bài</button></div></footer>
    {confirming && <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/50 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><h2 className="text-xl font-bold">Xác nhận nộp bài</h2><p className="mt-2 text-sm text-slate-600">Bạn đã trả lời {answered}/{questions.length} câu. Sau khi nộp, câu trả lời không thể chỉnh sửa.</p><div className="mt-5 flex justify-end gap-2"><button className="rounded border px-4 py-2" disabled={submitting} onClick={() => setConfirming(false)}>Kiểm tra lại</button><button className="rounded bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={submitting} onClick={() => void submit()}>{submitting ? 'Đang nộp...' : 'Xác nhận nộp'}</button></div></div></div>}
  </div>;
}

function QuestionCard({ question, draft, disabled, onChange, onAudio }: { question: StudentAttemptQuestion; draft?: Draft; disabled: boolean; onChange: (value: Partial<Draft>) => void; onAudio: (blob: Blob) => void }) {
  const type = question.question.responseType ?? question.question.type; const selected = draft?.selectedOptionIds ?? [];
  return <article className="rounded-xl border bg-white p-5 shadow-sm"><div className="flex justify-between gap-3"><h3 className="whitespace-pre-wrap font-medium">{question.question.content}</h3><span className="whitespace-nowrap text-sm text-slate-500">{question.points} điểm</span></div>{['SINGLE_CHOICE', 'TRUE_FALSE', 'MULTIPLE_CHOICE'].includes(type) && <div className="mt-4 space-y-2">{question.question.options.map((option) => { const multiple = type === 'MULTIPLE_CHOICE'; return <label className="flex cursor-pointer gap-3 rounded-lg border p-3 hover:bg-slate-50" key={option.id}><input className="mt-1" disabled={disabled} type={multiple ? 'checkbox' : 'radio'} name={multiple ? undefined : question.testQuestionId} checked={selected.includes(option.id)} onChange={(event) => onChange({ selectedOptionIds: multiple ? (event.target.checked ? [...new Set([...selected, option.id])] : selected.filter((id) => id !== option.id)) : [option.id] })}/><span>{option.content}</span></label>; })}</div>}{type === 'TEXT_RESPONSE' && <textarea className="mt-4 min-h-40 w-full rounded-lg border p-3" disabled={disabled} maxLength={5000} placeholder="Nhập câu trả lời của bạn..." value={draft?.textResponse ?? ''} onChange={(event) => onChange({ textResponse: event.target.value })} />}{type === 'AUDIO_RESPONSE' && <AudioRecorder disabled={disabled} uploaded={Boolean(draft?.audioUploaded)} onAudio={onAudio} />}</article>;
}
function AudioRecorder({ disabled, uploaded, onAudio }: { disabled: boolean; uploaded: boolean; onAudio: (blob: Blob) => void }) {
  const recorder = useRef<MediaRecorder | null>(null); const chunks = useRef<Blob[]>([]); const [recording, setRecording] = useState(false); const [error, setError] = useState<string | null>(null);
  const start = async () => { try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const next = new MediaRecorder(stream); chunks.current = []; next.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); }; next.onstop = () => { onAudio(new Blob(chunks.current, { type: next.mimeType || 'audio/webm' })); stream.getTracks().forEach((track) => track.stop()); }; recorder.current = next; next.start(); setRecording(true); setError(null); } catch { setError('Trình duyệt chưa cấp quyền sử dụng micro.'); } };
  const stop = () => { recorder.current?.stop(); setRecording(false); };
  return <div className="mt-4 rounded-lg border border-dashed p-4"><p className="text-sm text-slate-600">Ghi âm câu trả lời bằng micro của thiết bị.</p><button className={`mt-3 rounded px-4 py-2 font-medium text-white ${recording ? 'bg-red-600' : 'bg-indigo-600'}`} disabled={disabled} onClick={() => recording ? stop() : void start()} type="button">{recording ? 'Dừng và tải lên' : uploaded ? 'Ghi âm lại' : 'Bắt đầu ghi âm'}</button>{uploaded && !recording && <p className="mt-2 text-sm font-medium text-emerald-700">Đã lưu bản ghi âm.</p>}{error && <p className="mt-2 text-sm text-red-700">{error}</p>}</div>;
}
function Stimuli({ stimuli, stimulusText }: { stimuli: StudentAttemptStimulus[]; stimulusText?: string | null }) { return <div className="space-y-3">{stimulusText && <div className="whitespace-pre-wrap rounded-xl border bg-white p-4 text-sm leading-7">{stimulusText}</div>}{stimuli.map((stimulus) => <div className="rounded-xl border bg-white p-3" key={stimulus.id}>{stimulus.type === 'TEXT' ? <p className="whitespace-pre-wrap">{stimulus.textContent}</p> : stimulus.type === 'IMAGE' ? <img className="mx-auto max-h-96 rounded object-contain" src={stimulus.mediaUrl ?? ''} alt={stimulus.altText ?? 'Nội dung câu hỏi'} /> : <audio className="w-full" controls preload="metadata" src={stimulus.mediaUrl ?? ''}>Trình duyệt không hỗ trợ phát âm thanh.</audio>}</div>)}</div>; }
function answerPayload(questions: StudentAttemptQuestion[], drafts: Drafts): StudentAnswerSelection[] { return questions.reduce<StudentAnswerSelection[]>((payload, question) => { const draft = drafts[question.testQuestionId]; const type = question.question.responseType ?? question.question.type; if (type === 'AUDIO_RESPONSE') return payload; if (type === 'TEXT_RESPONSE') payload.push({ testQuestionId: question.testQuestionId, textResponse: draft?.textResponse ?? '' }); else payload.push({ testQuestionId: question.testQuestionId, selectedOptionIds: draft?.selectedOptionIds ?? [] }); return payload; }, []); }
function isAnswered(question: StudentAttemptQuestion, draft?: Draft) { const type = question.question.responseType ?? question.question.type; return type === 'TEXT_RESPONSE' ? Boolean(draft?.textResponse.trim()) : type === 'AUDIO_RESPONSE' ? Boolean(draft?.audioUploaded) : Boolean(draft?.selectedOptionIds.length); }
function formatTime(seconds: number) { return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`; }
function SaveIndicator({ status }: { status: SaveStatus }) { const labels = { idle: 'Sẵn sàng', pending: 'Chờ tự động lưu...', saving: 'Đang lưu...', saved: 'Đã lưu', error: 'Lưu chưa thành công' }; return <span className={status === 'error' ? 'text-red-700' : 'text-slate-500'}>{labels[status]}</span>; }
function ErrorPanel({ message }: { message: string }) { return <div className="mx-auto max-w-2xl rounded-xl border border-red-200 bg-red-50 p-6 text-red-700" role="alert">{message}</div>; }
