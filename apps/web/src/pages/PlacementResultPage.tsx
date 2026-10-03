import { useEffect, useState } from 'react';
import { BarChart3, CheckCircle2, Mic, PenLine, RefreshCw } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { CourseRecommendationCard } from '@/features/placement/CourseRecommendationCard';
import { PlacementEvaluationCard } from '@/features/placement/PlacementEvaluationCard';
import { placementApi } from '@/features/placement/api';
import type { PlacementResult } from '@/features/placement/types';

const selfLevelLabel = { UNKNOWN: 'Chưa xác định', BEGINNER: 'Mới bắt đầu', BASIC: 'Cơ bản', INTERMEDIATE: 'Trung bình', GOOD: 'Khá' };

export function PlacementResultPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const [result, setResult] = useState<PlacementResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!attemptId) return;
    const controller = new AbortController();
    void placementApi.result(attemptId, controller.signal).then((payload) => {
      if (!controller.signal.aborted) { setError(null); setResult(payload); }
    }).catch((requestError: unknown) => {
      if (controller.signal.aborted || requestError instanceof DOMException && requestError.name === 'AbortError') return;
      setError('Không thể tải kết quả hoặc bài kiểm tra chưa được nộp.');
    });
    return () => controller.abort();
  }, [attemptId, retry]);
  if (error && !result) return <section className="mx-auto max-w-3xl p-8"><div className="state-error">{error}</div><button className="btn-primary mt-4" onClick={() => setRetry((value) => value + 1)} type="button">Thử lại</button></section>;
  if (!result) return <section className="mx-auto max-w-5xl animate-pulse px-4 py-12" role="status" aria-label="Đang tải kết quả"><div className="h-56 rounded-3xl bg-slate-200" /><div className="mt-7 grid gap-5 md:grid-cols-2"><div className="h-44 rounded-2xl bg-slate-100" /><div className="h-44 rounded-2xl bg-slate-100" /></div></section>;
  result.skillResults ??= result.skillScores.map((score) => ({
    skill: score.skill,
    status: 'FINAL' as const,
    rawScore: score.rawScore,
    maxRawScore: score.maxRawScore,
    normalizedScore: score.normalizedScore,
  }));
  const primary = result.recommendations.filter((item) => item.kind === 'PRIMARY');
  const supplementary = result.recommendations.filter((item) => item.kind === 'SUPPLEMENTARY');
  const fourSkills = result.mode === 'FOUR_SKILLS';
  return (
    <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <header className="rounded-3xl bg-indigo-950 p-8 text-white sm:p-10">
        <div className="flex items-center gap-2 text-emerald-300"><CheckCircle2 size={20} /><span className="font-semibold">Đã hoàn thành</span></div>
        <h1 className="mt-4 text-3xl font-bold">{fourSkills ? 'Kết quả kiểm tra đầu vào 4 kỹ năng' : 'Kết quả kiểm tra đầu vào L&R'}</h1><p className="mt-3 text-indigo-100">{result.title}</p>
        <dl className="mt-6 grid gap-3 text-sm text-indigo-100 sm:grid-cols-2 lg:grid-cols-4"><div><dt>Mục tiêu đã chọn</dt><dd className="font-bold text-white">{result.goalScore === 750 ? '750+' : result.goalScore}</dd></div><div><dt>Trình độ tự đánh giá</dt><dd className="font-bold text-white">{selfLevelLabel[result.selfLevel]}</dd></div><div><dt>Thời lượng</dt><dd className="font-bold text-white">{result.durationMinutes} phút</dd></div><div><dt>Hoàn thành lúc</dt><dd className="font-bold text-white">{new Date(result.submittedAt).toLocaleString('vi-VN')}</dd></div></dl>
      </header>
      <div className="mt-7 grid gap-5 md:grid-cols-2">{result.skillResults.map((score) => score.status === 'FINAL' ? <article className="card" key={score.skill}><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-indigo-600">{score.skill === 'LISTENING' ? 'Listening' : 'Reading'}</p><h2 className="mt-2 text-3xl font-bold">{Number(score.rawScore)}/{Number(score.maxRawScore)} câu đúng</h2><span className="mt-2 inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">Đã chấm</span></div><BarChart3 className="text-indigo-500" size={40} /></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${Number(score.normalizedScore)}%` }} /></div><p className="mt-2 text-sm text-slate-600">Tỷ lệ đúng: {Number(score.normalizedScore).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%</p></article> : <article className="card" key={score.skill}><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-indigo-600">{score.skill === 'SPEAKING' ? 'Speaking' : 'Writing'}</p><h2 className="mt-2 text-2xl font-bold">{score.submittedResponseCount}/{score.requiredResponseCount} {score.skill === 'SPEAKING' ? 'câu trả lời đã nộp' : 'bài viết đã nộp'}</h2></div>{score.skill === 'SPEAKING' ? <Mic className="text-indigo-500" size={40} /> : <PenLine className="text-indigo-500" size={40} />}</div><span className="mt-5 inline-block rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">{score.submittedResponseCount === score.requiredResponseCount ? 'Chờ đánh giá' : 'Có câu chưa trả lời · Chờ đánh giá'}</span></article>)}</div>
      {result.enhancement.status === 'PENDING_SKILL_EVALUATION' ? <div className="mt-7 rounded-2xl border border-indigo-200 bg-indigo-50 p-5 text-indigo-950"><h2 className="font-bold">Đang chờ đánh giá Speaking và Writing</h2><p className="mt-2 leading-7">{result.enhancement.message}</p></div> : null}
      <div className="mt-7">{result.evaluation ? <PlacementEvaluationCard evaluation={result.evaluation} /> : null}</div>
      {result.enhancement.status === 'ERROR' ? <div className="state-error mt-7"><p className="font-semibold">Kết quả bài làm đã được lưu, nhưng phần đánh giá và gợi ý khóa học tạm thời chưa khả dụng.</p><button className="btn-secondary mt-4" onClick={() => setRetry((value) => value + 1)} type="button"><RefreshCw className="mr-2 inline" size={16} />Thử tải lại gợi ý</button></div> : null}
      {result.enhancement.status === 'READY' ? <section className="mt-8"><h2 className="text-2xl font-bold text-slate-950">Lộ trình phù hợp với bạn</h2>{result.recommendations.length ? <><div className="mt-5 grid gap-5">{primary.map((item) => <CourseRecommendationCard key={item.course.id} recommendation={item} />)}</div>{supplementary.length ? <><h2 className="mt-9 text-xl font-bold">Lựa chọn bổ sung</h2><div className="mt-4 grid gap-5">{supplementary.map((item) => <CourseRecommendationCard key={item.course.id} recommendation={item} />)}</div></> : null}</> : <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-5"><h3 className="font-bold">Chưa có khóa học phù hợp ngay lúc này</h3><p className="mt-2 text-slate-600">Bạn có thể khám phá danh mục để chọn khóa học theo mục tiêu của mình.</p></div>}</section> : null}
      <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950"><h2 className="font-bold">Lưu ý về kết quả</h2><p className="mt-2 leading-7">{result.disclaimer}</p></div>
      <div className="mt-8 flex flex-wrap gap-3"><Link className="btn-primary" to="/catalog">Xem các khóa học</Link><Link className="btn-secondary" to="/placement">Xem lịch sử kiểm tra đầu vào</Link></div>
    </section>
  );
}
