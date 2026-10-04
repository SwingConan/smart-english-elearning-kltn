import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { classAssessmentApi } from '@/features/assessments/api';
import type { GradingQueue } from '@/features/assessments/types';
import { useSessionExpiry } from '@/features/auth/use-session-expiry';

const states = { SUBMITTED_PENDING_REVIEW: 'Chờ chấm', PARTIALLY_REVIEWED: 'Đang chấm', REVIEWED_FINAL: 'Đã chấm' } as const;
type Filter = 'ALL' | 'WAITING' | 'COMPLETED';

export function AssessmentGradingQueuePage() {
  const { classOfferingId, classAssessmentId } = useParams<{ classOfferingId: string; classAssessmentId: string }>();
  const redirectExpiredSession = useSessionExpiry();
  const [queue, setQueue] = useState<GradingQueue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    if (!classOfferingId || !classAssessmentId) return;
    void classAssessmentApi.gradingQueue(classOfferingId, classAssessmentId, controller.signal).then(setQueue).catch(async (requestError) => {
      if (requestError instanceof Error && requestError.name === 'AbortError') return;
      if (await redirectExpiredSession(requestError)) return;
      setError('Không thể tải danh sách chấm bài.');
    });
    return () => controller.abort();
  }, [classAssessmentId, classOfferingId, redirectExpiredSession, reload]);
  const submissions = useMemo(() => (queue?.submissions ?? []).filter((submission) => filter === 'ALL' || filter === 'COMPLETED' && submission.gradingState === 'REVIEWED_FINAL' || filter === 'WAITING' && submission.gradingState !== 'REVIEWED_FINAL'), [filter, queue]);
  if (error && !queue) return <div className="p-8 text-red-700" role="alert">{error}<button className="ml-3 font-semibold underline" onClick={() => { setError(null); setReload((value) => value + 1); }} type="button">Thử lại</button></div>;
  if (!queue) return <p className="p-8 text-center text-slate-500" role="status">Đang tải danh sách chấm bài...</p>;
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-8"><div><Link className="text-sm text-blue-700 hover:underline" to={`/instructor/classes/${classOfferingId}/assessments`}>← Lịch bài kiểm tra</Link><h1 className="mt-3 text-2xl font-bold">Chấm bài: {queue.assessment.test.title}</h1><p className="text-sm text-slate-600">{queue.assessment.classOffering.name} · {queue.submissions.length} bài đã nộp</p></div>{error && <div className="rounded border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>}<div className="flex flex-wrap gap-2" aria-label="Lọc danh sách chấm bài">{([['ALL', 'Tất cả'], ['WAITING', 'Chờ chấm'], ['COMPLETED', 'Đã chấm']] as const).map(([value, label]) => <button className={`rounded-full border px-4 py-2 text-sm font-medium ${filter === value ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : 'bg-white'}`} key={value} onClick={() => setFilter(value)} type="button">{label}</button>)}</div>{submissions.length === 0 ? <div className="rounded-xl border bg-white p-8 text-center text-slate-500">Không có bài nộp phù hợp bộ lọc.</div> : <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-4">Học viên</th><th className="p-4">Nộp lúc</th><th className="p-4">Listening / Reading</th><th className="p-4">Trạng thái</th><th className="p-4"></th></tr></thead><tbody>{submissions.map((submission) => <tr className="border-t" key={submission.id}><td className="p-4"><p className="font-semibold">{submission.learner.fullName}</p><p className="text-xs text-slate-500">{submission.learner.email}</p></td><td className="p-4">{new Date(submission.submittedAt).toLocaleString('vi-VN')}</td><td className="p-4">{objectiveSnapshot(submission.skillScores)}</td><td className="p-4"><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">{states[submission.gradingState]}</span></td><td className="p-4 text-right"><Link className="rounded bg-indigo-600 px-3 py-2 font-medium text-white" to={`/instructor/classes/${classOfferingId}/assessments/${classAssessmentId}/attempts/${submission.id}/grading`}>{submission.gradingState === 'REVIEWED_FINAL' ? 'Xem lại' : 'Chấm bài'}</Link></td></tr>)}</tbody></table></div>}</main>;
}

function objectiveSnapshot(scores: GradingQueue['submissions'][number]['skillScores']) { const listening = scores.find((score) => score.skill === 'LISTENING'); const reading = scores.find((score) => score.skill === 'READING'); const display = (score: typeof listening) => score?.status === 'FINAL' ? `${Math.round(score.normalizedScore)}%` : '—'; return `L ${display(listening)} · R ${display(reading)}`; }
