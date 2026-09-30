import { useEffect, useState } from 'react';
import { BarChart3, CheckCircle2 } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { placementApi } from '@/features/placement/api';
import type { PlacementResult } from '@/features/placement/types';

export function PlacementResultPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const [result, setResult] = useState<PlacementResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!attemptId) return;
    const controller = new AbortController();
    void placementApi.result(attemptId, controller.signal).then(setResult).catch(() => setError('Không thể tải kết quả hoặc bài kiểm tra chưa được nộp.'));
    return () => controller.abort();
  }, [attemptId]);
  if (error) return <section className="mx-auto max-w-3xl p-8"><div className="state-error">{error}</div></section>;
  if (!result) return <p className="mx-auto max-w-3xl p-8" role="status">Đang tải kết quả…</p>;
  return (
    <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <div className="rounded-3xl bg-indigo-950 p-8 text-white sm:p-10"><div className="flex items-center gap-2 text-emerald-300"><CheckCircle2 size={20} /><span className="font-semibold">Đã nộp</span></div><h1 className="mt-4 text-3xl font-bold">Kết quả Placement L&R</h1><p className="mt-3 text-indigo-100">{result.title}</p><p className="mt-6 text-sm text-indigo-200">Mục tiêu đã chọn: <strong className="text-white">{result.goalScore === 750 ? '750+' : result.goalScore}</strong> · Nộp lúc {new Date(result.submittedAt).toLocaleString('vi-VN')}</p></div>
      <div className="mt-7 grid gap-5 md:grid-cols-2">{result.skillScores.map((score) => <article className="card" key={score.skill}><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-indigo-600">{score.skill === 'LISTENING' ? 'Listening' : 'Reading'}</p><h2 className="mt-2 text-3xl font-bold">{Number(score.rawScore)}/{Number(score.maxRawScore)}</h2></div><BarChart3 className="text-indigo-500" size={40} /></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${Number(score.normalizedScore)}%` }} /></div><p className="mt-2 text-sm text-slate-600">Điểm chuẩn hóa nội bộ: {Number(score.normalizedScore).toFixed(2)}%</p></article>)}</div>
      <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950"><h2 className="font-bold">Lưu ý về kết quả</h2><p className="mt-2 leading-7">{result.disclaimer}</p></div>
      <div className="mt-8 flex flex-wrap gap-3"><Link className="btn-primary" to="/catalog">Xem các khóa học</Link><Link className="btn-secondary" to="/placement">Xem lịch sử Placement</Link></div>
    </section>
  );
}
