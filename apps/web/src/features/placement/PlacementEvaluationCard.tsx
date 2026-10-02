import { BarChart3, Scale } from 'lucide-react';
import type { PlacementEvaluation } from './types';

const skillLabel = (skill: string | null) =>
  skill === 'LISTENING' ? 'Listening' : skill === 'READING' ? 'Reading' : '—';

export function PlacementEvaluationCard({ evaluation }: { evaluation: PlacementEvaluation }) {
  const percentage = Number(evaluation.overallNormalizedScore).toLocaleString('vi-VN', {
    maximumFractionDigits: 1,
  });
  return (
    <article className="card border-indigo-100 bg-indigo-50/40">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Đánh giá nội bộ</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">{evaluation.levelLabel ?? 'Đang cập nhật'}</h2>
          <p className="mt-2 text-sm text-slate-600">Tỷ lệ đúng toàn bài: {percentage}%</p>
        </div>
        <BarChart3 className="shrink-0 text-indigo-600" size={36} />
      </div>
      {evaluation.balanceState === 'BALANCED' ? (
        <p className="mt-5 flex items-center gap-2 font-semibold text-indigo-700"><Scale size={18} />Kết quả Listening và Reading hiện tương đương.</p>
      ) : (
        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-white p-4"><dt className="text-sm text-slate-500">Kỹ năng nổi trội</dt><dd className="mt-1 font-bold">{skillLabel(evaluation.strongestSkill)}</dd></div>
          <div className="rounded-xl bg-white p-4"><dt className="text-sm text-slate-500">Kỹ năng nên ưu tiên</dt><dd className="mt-1 font-bold">{skillLabel(evaluation.weakestSkill)}</dd></div>
        </dl>
      )}
      {evaluation.summary ? <p className="mt-5 leading-7 text-slate-700">{evaluation.summary}</p> : null}
    </article>
  );
}
