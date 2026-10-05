import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { studentAssessmentApi } from '@/features/assessments/api';
import { assessmentTypeLabel } from '@/features/assessments/display';
import { studentAssessmentErrorMessage } from '@/features/assessments/errors';
import type { StudentAttemptResult, ToeicSkill } from '@/features/assessments/types';
import { useSessionExpiry } from '@/features/auth/use-session-expiry';
import { ApiError } from '@/lib/api-client';

const skillLabels: Record<ToeicSkill, string> = { LISTENING: 'Listening', READING: 'Reading', SPEAKING: 'Speaking', WRITING: 'Writing' };
const stateLabels = { FINAL: 'Đã chấm', PENDING_REVIEW: 'Chờ giảng viên chấm', MISSING_RESPONSE: 'Chưa có câu trả lời' };

export function StudentTestResultPage() {
  const { enrollmentId, attemptId } = useParams<{ enrollmentId: string; attemptId: string }>();
  const redirectExpiredSession = useSessionExpiry();
  const [result, setResult] = useState<StudentAttemptResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<'hidden' | 'missing' | 'generic' | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    if (!enrollmentId || !attemptId) return;
    void studentAssessmentApi.getResult(enrollmentId, attemptId, controller.signal).then(setResult).catch(async (requestError) => {
      if (requestError instanceof Error && requestError.name === 'AbortError') return;
      if (await redirectExpiredSession(requestError)) return;
      if (requestError instanceof ApiError && requestError.status === 403) {
        setErrorKind('hidden'); setError('Kết quả của bài kiểm tra này hiện chưa được công bố.'); return;
      }
      if (requestError instanceof ApiError && requestError.status === 404) {
        setErrorKind('missing'); setError('Kết quả chưa tồn tại hoặc lượt làm vẫn đang được thực hiện.'); return;
      }
      setErrorKind('generic'); setError(studentAssessmentErrorMessage(requestError, 'Không thể tải kết quả bài kiểm tra.'));
    });
    return () => controller.abort();
  }, [attemptId, enrollmentId, redirectExpiredSession]);
  if (error) return <div className="mx-auto max-w-3xl space-y-4 rounded-xl border border-red-200 bg-red-50 p-6 text-red-700" role="alert"><p>{error}</p><div className="flex gap-2">{errorKind === 'missing' && <Link className="rounded border border-red-300 px-3 py-2 text-sm" to={`/student/enrollments/${enrollmentId}/attempts/${attemptId}`}>Quay lại lượt làm</Link>}<Link className="rounded border border-red-300 px-3 py-2 text-sm" to={`/student/enrollments/${enrollmentId}/tests`}>Danh sách bài kiểm tra</Link></div></div>;
  if (!result) return <p className="py-12 text-center text-slate-500" role="status">Đang tải kết quả...</p>;
  return <div className="mx-auto max-w-5xl space-y-6">
    <header className="rounded-2xl border bg-white p-6 shadow-sm"><span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-800">{assessmentTypeLabel(result.test.purpose ?? 'IN_CLASS', result.test.stage)}</span><h1 className="mt-3 text-2xl font-bold">Kết quả: {result.test.title}</h1><p className="mt-2 text-sm text-slate-600">Lượt làm số {result.attempt.attemptNumber} · Nộp lúc {new Date(result.attempt.submittedAt).toLocaleString('vi-VN')}</p>{result.gradingState === 'SUBMITTED_PENDING_REVIEW' && <div className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">Bài đã được ghi nhận. Điểm Speaking và Writing sẽ hiển thị sau khi giảng viên hoàn tất chấm.</div>}{result.total ? <div className="mt-5 rounded-xl bg-indigo-50 p-5"><p className="text-sm text-indigo-700">{result.total.label}</p><p className="mt-1 text-3xl font-bold text-indigo-950">{formatNumber(result.total.awardedPoints)}/{formatNumber(result.total.maxPoints)} điểm · {formatNumber(result.total.percentage)}%</p></div> : result.skills ? <div className="mt-5 rounded-xl bg-slate-100 p-5"><p className="font-semibold">Tổng điểm đang chờ hoàn tất chấm</p><p className="mt-1 text-sm text-slate-600">Tổng điểm chỉ được công bố khi cả bốn kỹ năng có kết quả cuối cùng.</p></div> : <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-indigo-50 p-4"><p className="text-xs text-indigo-700">Điểm</p><p className="text-2xl font-bold">{formatNumber(result.attempt.score)}/{formatNumber(result.attempt.maxScore)}</p></div><div className="rounded-xl bg-indigo-50 p-4"><p className="text-xs text-indigo-700">Tỷ lệ</p><p className="text-2xl font-bold">{formatNumber(result.attempt.percentage)}%</p></div></div>}</header>
    {result.skills && <section><h2 className="mb-3 text-lg font-bold">Kết quả theo kỹ năng</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{result.skills.map((skill) => <article className="rounded-xl border bg-white p-4" key={skill.skill}><p className="font-semibold">{skillLabels[skill.skill]}</p><p className="mt-2 text-2xl font-bold">{skill.normalizedScore === null ? '—' : `${formatNumber(skill.normalizedScore)}%`}</p><p className={`mt-2 text-xs font-semibold ${skill.state === 'FINAL' ? 'text-emerald-700' : 'text-amber-700'}`}>{stateLabels[skill.state]}</p>{skill.rawScore !== null && <p className="mt-1 text-xs text-slate-500">{formatNumber(skill.rawScore)}/{formatNumber(skill.maxRawScore ?? 0)} điểm</p>}</article>)}</div></section>}
    <section className="space-y-4"><h2 className="text-lg font-bold">Chi tiết câu trả lời</h2>{result.questions.map((item, index) => <article className="rounded-xl border bg-white p-5 shadow-sm" key={item.testQuestionId}><div className="flex justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-slate-500">Câu {index + 1}{item.question.toeicSkill ? ` · ${skillLabels[item.question.toeicSkill]}` : ''}</p><h3 className="mt-2 whitespace-pre-wrap font-medium">{item.question.content}</h3></div><p className="whitespace-nowrap text-sm font-semibold">{item.answer.pointsAwarded === null ? 'Chờ chấm' : `${formatNumber(item.answer.pointsAwarded)}/${formatNumber(item.points)} điểm`}</p></div>{item.question.options.length > 0 && <ul className="mt-4 space-y-2">{item.question.options.map((option) => <li className={`rounded border p-3 ${option.isCorrect ? 'border-emerald-300 bg-emerald-50' : option.wasSelected ? 'border-rose-300 bg-rose-50' : ''}`} key={option.id}><span>{option.content}</span>{option.isCorrect && <span className="ml-2 text-xs font-semibold text-emerald-800">Đáp án đúng</span>}{option.wasSelected && <span className="ml-2 text-xs font-semibold text-slate-700">Bạn đã chọn</span>}</li>)}</ul>}{item.answer.textResponse && <div className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">{item.answer.textResponse}</div>}{item.answer.audioUrl && <audio className="mt-4 w-full" controls src={item.answer.audioUrl} />}{item.question.explanation && <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm"><strong>Giải thích: </strong>{item.question.explanation}</div>}{item.answer.evaluation && <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4"><p className="font-semibold text-emerald-900">Nhận xét của giảng viên</p>{item.answer.evaluation.feedback && <p className="mt-1 text-sm">{item.answer.evaluation.feedback}</p>}<ul className="mt-3 space-y-1 text-sm">{item.answer.evaluation.criteria.map((criterion) => <li key={criterion.id}>{criterion.name}: {formatNumber(criterion.score)}/{formatNumber(criterion.maxScore)}{criterion.feedback ? ` — ${criterion.feedback}` : ''}</li>)}</ul></div>}</article>)}</section>
    <div className="flex gap-2"><Link className="rounded border px-4 py-2 text-sm" to={`/student/enrollments/${enrollmentId}/tests`}>Danh sách bài kiểm tra</Link><Link className="rounded border px-4 py-2 text-sm" to={`/student/enrollments/${enrollmentId}/progress`}>Xem tiến độ</Link></div>
  </div>;
}
function formatNumber(value: number) { return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value); }
