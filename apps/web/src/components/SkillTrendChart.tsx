import { toeicSkillLabel } from '@/features/assessments/display';
import type { ToeicSkill } from '@/features/assessments/types';

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

export function SkillTrendChart({ points, showSampleCount = false }: { points: SkillTrendPoint[]; showSampleCount?: boolean }) {
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
            {skills.map((skill) => { const value = point.values[skill]; return value ? <g key={skill}><circle cx={x(index)} cy={y(value.score)} fill="white" r="5" stroke={colors[skill]} strokeWidth="3" /><text fill={colors[skill]} fontSize="9" fontWeight="700" textAnchor="middle" x={x(index)} y={y(value.score) - 8}>{value.score}%{showSampleCount && value.sampleCount !== undefined ? ` · n=${value.sampleCount}` : ''}</text></g> : null; })}
          </g>)}
        </svg>
      </div>
      <div className="sr-only">
        <table>
          <caption>Dữ liệu xu hướng kỹ năng theo đợt kiểm tra</caption>
          <thead><tr><th>Đợt kiểm tra</th><th>Ngày</th>{skills.map((skill) => <th key={skill}>{toeicSkillLabel[skill]}</th>)}</tr></thead>
          <tbody>{points.map((point) => <tr key={point.id}><th>{point.title}</th><td>{new Date(point.date).toLocaleDateString('vi-VN')}</td>{skills.map((skill) => { const value = point.values[skill]; return <td key={skill}>{value ? `${value.score}%${showSampleCount ? `, ${value.sampleCount ?? 0} học viên` : ''}` : 'Chưa có dữ liệu'}</td>; })}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
