import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { classAssessmentApi } from '@/features/assessments/api';
import type { GradingDetail, ToeicSkill } from '@/features/assessments/types';
import { useSessionExpiry } from '@/features/auth/use-session-expiry';

type Scores = Record<string, Record<string, string>>;
type Feedback = Record<string, string>;
type CriterionFeedback = Record<string, Record<string, string>>;
const skillLabels: Partial<Record<ToeicSkill, string>> = { SPEAKING: 'Speaking', WRITING: 'Writing' };

export function AssessmentGradingDetailPage() {
  const { classOfferingId, classAssessmentId, attemptId } = useParams<{ classOfferingId: string; classAssessmentId: string; attemptId: string }>();
  const redirectExpiredSession = useSessionExpiry();
  const [detail, setDetail] = useState<GradingDetail | null>(null);
  const [scores, setScores] = useState<Scores>({});
  const [feedback, setFeedback] = useState<Feedback>({});
  const [criterionFeedback, setCriterionFeedback] = useState<CriterionFeedback>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    if (!classOfferingId || !classAssessmentId || !attemptId) return;
    void classAssessmentApi.gradingDetail(classOfferingId, classAssessmentId, attemptId, controller.signal).then((data) => {
      hydrate(data, setDetail, setScores, setFeedback, setCriterionFeedback);
    }).catch(async (requestError) => {
      if (requestError instanceof Error && requestError.name === 'AbortError') return;
      if (await redirectExpiredSession(requestError)) return;
      setError('Không thể tải bài làm để chấm.');
    });
    return () => controller.abort();
  }, [attemptId, classAssessmentId, classOfferingId, redirectExpiredSession, reload]);

  const save = async (answer: GradingDetail['answers'][number], finalize: boolean) => {
    if (!classOfferingId || !classAssessmentId || !attemptId) return;
    const rubric = answer.testQuestion.question.rubric;
    const values = scores[answer.testQuestion.id] ?? {};
    if (finalize && rubric.criteria.some((criterion) => values[criterion.id]?.trim() === '' || values[criterion.id] === undefined)) {
      setError('Vui lòng nhập điểm cho tất cả tiêu chí trước khi xác nhận điểm cuối.');
      return;
    }
    const criteria = rubric.criteria.flatMap((criterion) => {
      const score = values[criterion.id]?.trim();
      return score ? [{ rubricCriterionId: criterion.id, score, feedback: criterionFeedback[answer.testQuestion.id]?.[criterion.id]?.trim() || null }] : [];
    });
    setSaving(answer.testQuestion.id); setError(null);
    try {
      await classAssessmentApi.gradeAnswer(classOfferingId, classAssessmentId, attemptId, answer.testQuestion.id, { criteria, feedback: feedback[answer.testQuestion.id] ?? '', finalize, editFinal: answer.evaluation?.status === 'REVIEWED_FINAL' });
      const data = await classAssessmentApi.gradingDetail(classOfferingId, classAssessmentId, attemptId);
      hydrate(data, setDetail, setScores, setFeedback, setCriterionFeedback);
    } catch { setError('Không thể lưu kết quả chấm. Kiểm tra điểm theo giới hạn từng tiêu chí.'); }
    finally { setSaving(null); }
  };

  if (!detail && error) return <div className="mx-auto max-w-2xl rounded-xl border border-red-200 bg-red-50 p-6 text-red-700" role="alert">{error}<button className="ml-3 font-semibold underline" onClick={() => { setError(null); setReload((value) => value + 1); }} type="button">Thử lại</button></div>;
  if (!detail) return <p className="p-8 text-center text-slate-500" role="status">Đang tải bài làm...</p>;
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-8"><div><Link className="text-sm text-blue-700 hover:underline" to={`/instructor/classes/${classOfferingId}/assessments/${classAssessmentId}/grading`}>← Danh sách chấm bài</Link><h1 className="mt-3 text-2xl font-bold">Bài làm của {detail.learner.fullName}</h1><p className="text-sm text-slate-600">{detail.test.title} · {detail.learner.email} · lượt {detail.attemptNumber}</p></div>{error && <div className="rounded border border-red-200 bg-red-50 p-3 text-red-700" role="alert">{error}</div>}{detail.answers.map((answer) => { const rubric = answer.testQuestion.question.rubric; const isFinal = answer.evaluation?.status === 'REVIEWED_FINAL'; return <article className="rounded-2xl border bg-white p-6 shadow-sm" key={answer.id}><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs font-bold uppercase text-indigo-700">{skillLabels[answer.testQuestion.question.toeicSkill] ?? 'Kỹ năng sản sinh'}</p><h2 className="mt-2 whitespace-pre-wrap text-lg font-semibold">{answer.testQuestion.question.content}</h2></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${isFinal ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{isFinal ? 'Đã chấm cuối' : 'Chờ chấm'}</span></div>{answer.textResponse && <div className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-4">{answer.textResponse}</div>}{answer.audioUrl && <audio className="mt-4 w-full" controls src={answer.audioUrl} />}
      <div className="mt-5"><h3 className="font-bold">{rubric.name}</h3><div className="mt-3 space-y-3">{rubric.criteria.map((criterion) => <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_8rem]" key={criterion.id}><div><p className="font-medium">{criterion.name}</p>{criterion.description && <p className="mt-1 text-xs text-slate-500">{criterion.description}</p>}<p className="mt-1 text-xs text-slate-500">Trọng số {criterion.weight}</p><label className="mt-2 block text-xs font-medium">Nhận xét tiêu chí<input className="mt-1 w-full rounded border p-2 text-sm" value={criterionFeedback[answer.testQuestion.id]?.[criterion.id] ?? ''} onChange={(event) => setCriterionFeedback((current) => ({ ...current, [answer.testQuestion.id]: { ...current[answer.testQuestion.id], [criterion.id]: event.target.value } }))}/></label></div><label className="text-sm font-medium">Điểm<span className="mt-1 flex items-center gap-2"><input className="w-full rounded border p-2" min="0" max={criterion.maxScore} step="0.01" type="number" value={scores[answer.testQuestion.id]?.[criterion.id] ?? ''} onChange={(event) => setScores((current) => ({ ...current, [answer.testQuestion.id]: { ...current[answer.testQuestion.id], [criterion.id]: event.target.value } }))}/><span>/{criterion.maxScore}</span></span></label></div>)}</div></div><label className="mt-4 block text-sm font-medium">Nhận xét chung<textarea className="mt-1 min-h-24 w-full rounded border p-3" value={feedback[answer.testQuestion.id] ?? ''} onChange={(event) => setFeedback((current) => ({ ...current, [answer.testQuestion.id]: event.target.value }))}/></label><div className="mt-4 flex justify-end gap-2"><button className="rounded border px-4 py-2 text-sm" disabled={saving !== null} onClick={() => void save(answer, false)} type="button">Lưu nháp</button><button className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={saving !== null} onClick={() => void save(answer, true)} type="button">{saving === answer.testQuestion.id ? 'Đang lưu...' : isFinal ? 'Cập nhật điểm cuối' : 'Xác nhận điểm cuối'}</button></div></article>; })}</main>;
}

function hydrate(data: GradingDetail, setDetail: (data: GradingDetail) => void, setScores: (data: Scores) => void, setFeedback: (data: Feedback) => void, setCriterionFeedback: (data: CriterionFeedback) => void) { setDetail(data); setScores(Object.fromEntries(data.answers.map((answer) => [answer.testQuestion.id, Object.fromEntries(answer.testQuestion.question.rubric.criteria.map((criterion) => [criterion.id, String(answer.evaluation?.criterionScores.find((score) => score.rubricCriterionId === criterion.id)?.score ?? '')]))]))); setFeedback(Object.fromEntries(data.answers.map((answer) => [answer.testQuestion.id, answer.evaluation?.feedback ?? '']))); setCriterionFeedback(Object.fromEntries(data.answers.map((answer) => [answer.testQuestion.id, Object.fromEntries(answer.testQuestion.question.rubric.criteria.map((criterion) => [criterion.id, answer.evaluation?.criterionScores.find((score) => score.rubricCriterionId === criterion.id)?.feedback ?? '']))]))); }
