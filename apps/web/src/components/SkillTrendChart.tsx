import { toeicSkillLabel } from '@/features/assessments/display';
import type { ToeicSkill } from '@/features/assessments/types';
import { formatTrendNumber, roundedTrendNumber } from './trend-format';

const skills: ToeicSkill[] = ['LISTENING', 'READING', 'SPEAKING', 'WRITING'];
const colors: Record<ToeicSkill, string> = {
  LISTENING: '#4f46e5',
  READING: '#0284c7',
  SPEAKING: '#059669',
  WRITING: '#d97706',
};

export type SkillTrendPoint = {
  id: string;
  title: string;
  date: string;
  values: Partial<Record<ToeicSkill, { score: number; sampleCount?: number }>>;
};

function scoreText(value: number) {
  return `${formatTrendNumber(value)}%`;
}

export function SkillTrendChart({ points, showSampleCount = false }: { points: SkillTrendPoint[]; showSampleCount?: boolean }) {
  if (points.length === 2) {
    return <TwoPointSkillSlope points={points} showSampleCount={showSampleCount} />;
  }
  const width = 760;
  const height = 300;
  const left = 52;
  const right = 28;
  const top = 24;
  const bottom = 70;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const x = (index: number) => left + (points.length <= 1 ? chartWidth / 2 : (index * chartWidth) / (points.length - 1));
  const y = (score: number) => top + ((100 - score) * chartHeight) / 100;
  return (
    <div className="mt-4 min-w-0 max-w-full overflow-hidden">
      <div className="mb-3 flex flex-wrap gap-4 text-xs" aria-label="Chú giải kỹ năng">
        {skills.map((skill) => <span className="flex items-center gap-1" key={skill}><i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[skill] }} />{toeicSkillLabel[skill]}</span>)}
      </div>
      <div className="w-full max-w-full overflow-x-auto rounded-xl border bg-white p-2">
        <svg aria-label="Biểu đồ xu hướng kỹ năng theo đợt kiểm tra" className="h-auto w-full" role="img" viewBox={`0 0 ${width} ${height}`}>
          {[0, 25, 50, 75, 100].map((tick) => <g key={tick}><line stroke="#e2e8f0" x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} /><text fill="#64748b" fontSize="11" textAnchor="end" x={left - 8} y={y(tick) + 4}>{tick}</text></g>)}
          {skills.map((skill) => points.slice(0, -1).map((point, index) => {
            const current = point.values[skill];
            const next = points[index + 1]?.values[skill];
            return current && next ? <line key={`${skill}-${point.id}`} stroke={colors[skill]} strokeWidth="2.5" x1={x(index)} x2={x(index + 1)} y1={y(current.score)} y2={y(next.score)} /> : null;
          }))}
          {points.map((point, index) => <g key={point.id}>
            <text fill="#334155" fontSize="10" textAnchor="middle" x={x(index)} y={height - 36}>{point.title.length > 18 ? `${point.title.slice(0, 16)}…` : point.title}</text>
            <text fill="#64748b" fontSize="9" textAnchor="middle" x={x(index)} y={height - 21}>{new Date(point.date).toLocaleDateString('vi-VN')}</text>
            {skills.map((skill) => { const value = point.values[skill]; return value ? <circle key={skill} cx={x(index)} cy={y(value.score)} fill="white" r="5" stroke={colors[skill]} strokeWidth="3" /> : null; })}
          </g>)}
        </svg>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Giá trị kỹ năng gần nhất">
        {skills.map((skill) => {
          const latest = [...points].reverse().find((point) => point.values[skill]);
          const value = latest?.values[skill];
          return <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm" key={skill}><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[skill] }} />{toeicSkillLabel[skill]}</span><strong>{value ? `${scoreText(value.score)}${showSampleCount ? ` · n=${value.sampleCount ?? 0}` : ''}` : 'Chưa có dữ liệu'}</strong></div>;
        })}
      </div>
      <div className="sr-only">
        <table>
          <caption>Dữ liệu xu hướng kỹ năng theo đợt kiểm tra</caption>
          <thead><tr><th>Đợt kiểm tra</th><th>Ngày</th>{skills.map((skill) => <th key={skill}>{toeicSkillLabel[skill]}</th>)}</tr></thead>
          <tbody>{points.map((point) => <tr key={point.id}><th>{point.title}</th><td>{new Date(point.date).toLocaleDateString('vi-VN')}</td>{skills.map((skill) => { const value = point.values[skill]; return <td key={skill}>{value ? `${scoreText(value.score)}${showSampleCount ? `, ${value.sampleCount ?? 0} học viên` : ''}` : 'Chưa có dữ liệu'}</td>; })}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function TwoPointSkillSlope({ points, showSampleCount }: { points: [SkillTrendPoint, SkillTrendPoint] | SkillTrendPoint[]; showSampleCount: boolean }) {
  const first = points[0]!;
  const last = points[1]!;
  return <div className="mt-4 min-w-0" data-testid="two-point-skill-slope">
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
      <div><strong className="block break-words text-slate-800">{first.title}</strong>{new Date(first.date).toLocaleDateString('vi-VN')}</div>
      <span aria-hidden="true">→</span>
      <div className="text-right"><strong className="block break-words text-slate-800">{last.title}</strong>{new Date(last.date).toLocaleDateString('vi-VN')}</div>
    </div>
    <div className="mt-3 overflow-hidden rounded-xl border bg-white" aria-label="Bốn hàng xu hướng kỹ năng">
      {skills.map((skill) => {
        const before = first.values[skill];
        const after = last.values[skill];
        const delta = before && after ? after.score - before.score : null;
        const y = (score: number) => Number((26 - Math.max(0, Math.min(100, score)) * 0.2).toFixed(2));
        const roundedDelta = delta === null ? null : roundedTrendNumber(delta);
        return <div className="grid min-w-0 grid-cols-[5.5rem_3.5rem_minmax(5rem,14rem)_3.5rem] items-center gap-2 border-b p-3 last:border-b-0 sm:grid-cols-[7rem_4.5rem_minmax(7rem,14rem)_4.5rem_6rem]" data-testid={`trend-row-${skill}`} key={skill}>
          <strong className="text-sm">{toeicSkillLabel[skill]}</strong>
          <span className="text-center font-bold">{before ? scoreText(before.score) : '—'}{showSampleCount && before ? <small className="block font-normal text-slate-500">n={before.sampleCount ?? 0}</small> : null}</span>
          <svg aria-hidden="true" className="h-8 w-full max-w-56 justify-self-center" preserveAspectRatio="none" viewBox="0 0 100 32">
            <line stroke="#e2e8f0" x1="3" x2="97" y1="16" y2="16" />
            {before && after ? <><line stroke={colors[skill]} strokeWidth="3" x1="4" x2="96" y1={y(before.score)} y2={y(after.score)} /><circle cx="4" cy={y(before.score)} fill="white" r="4" stroke={colors[skill]} strokeWidth="3" /><circle cx="96" cy={y(after.score)} fill={colors[skill]} r="4" /></> : <line stroke="#94a3b8" strokeDasharray="5 4" x1="4" x2="96" y1="16" y2="16" />}
          </svg>
          <span className="text-center font-bold">{after ? scoreText(after.score) : '—'}{showSampleCount && after ? <small className="block font-normal text-slate-500">n={after.sampleCount ?? 0}</small> : null}</span>
          <span className="col-span-4 text-right text-sm font-bold sm:col-span-1" style={{ color: roundedDelta === null ? '#64748b' : colors[skill] }}>{roundedDelta === null ? '—' : `${roundedDelta > 0 ? '+' : ''}${formatTrendNumber(roundedDelta)} điểm`}</span>
        </div>;
      })}
    </div>
    <TrendDataTable points={points} showSampleCount={showSampleCount} />
  </div>;
}

function TrendDataTable({ points, showSampleCount }: { points: SkillTrendPoint[]; showSampleCount: boolean }) {
  return <div className="sr-only"><table><caption>Dữ liệu xu hướng kỹ năng theo đợt kiểm tra</caption><thead><tr><th>Đợt kiểm tra</th><th>Ngày</th>{skills.map((skill) => <th key={skill}>{toeicSkillLabel[skill]}</th>)}</tr></thead><tbody>{points.map((point) => <tr key={point.id}><th>{point.title}</th><td>{new Date(point.date).toLocaleDateString('vi-VN')}</td>{skills.map((skill) => { const value = point.values[skill]; return <td key={skill}>{value ? `${scoreText(value.score)}${showSampleCount ? `, ${value.sampleCount ?? 0} học viên` : ''}` : 'Chưa có dữ liệu'}</td>; })}</tr>)}</tbody></table></div>;
}
