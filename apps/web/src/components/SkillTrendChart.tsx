import { useMemo, useState } from 'react';
import { ReportEChart } from '@/components/charts/ReportEChart';
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
const scoreText = (value: number) => `${formatTrendNumber(value)}%`;

export function SkillTrendChart({
  points,
  showSampleCount = false,
}: {
  points: SkillTrendPoint[];
  showSampleCount?: boolean;
}) {
  const [visible, setVisible] = useState<ToeicSkill[]>(skills);
  const option = useMemo(
    () => ({
      aria: { show: true },
      color: visible.map((skill) => colors[skill]),
      grid: { left: 45, right: 20, top: 28, bottom: 54, containLabel: true },
      tooltip: { trigger: 'axis', confine: true },
      legend: { show: false },
      xAxis: {
        type: 'category',
        data: points.map((point) => point.title),
        axisLabel: { width: 120, overflow: 'truncate', rotate: points.length > 4 ? 20 : 0 },
      },
      yAxis: { type: 'value', min: 0, max: 100, axisLabel: { formatter: '{value}%' } },
      series: visible.map((skill) => ({
        name: toeicSkillLabel[skill],
        type: 'line',
        smooth: true,
        connectNulls: false,
        symbolSize: 8,
        emphasis: { focus: 'series' },
        data: points.map((point) => point.values[skill]?.score ?? null),
      })),
    }),
    [points, visible],
  );
  if (points.length === 2)
    return <TwoPointSkillComparison points={points} showSampleCount={showSampleCount} />;
  return (
    <div className="mt-4 min-w-0 max-w-full overflow-hidden">
      <div className="mb-3 flex flex-wrap gap-2" aria-label="Lọc kỹ năng">
        {skills.map((skill) => (
          <button
            aria-pressed={visible.includes(skill)}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold ${visible.includes(skill) ? 'border-transparent text-white' : 'bg-white text-slate-500'}`}
            key={skill}
            onClick={() =>
              setVisible((current) =>
                current.includes(skill)
                  ? current.length === 1
                    ? current
                    : current.filter((item) => item !== skill)
                  : [...current, skill],
              )
            }
            style={visible.includes(skill) ? { backgroundColor: colors[skill] } : undefined}
            type="button"
          >
            {toeicSkillLabel[skill]}
          </button>
        ))}
      </div>
      <div className="rounded-xl border bg-white p-2">
        <ReportEChart ariaLabel="Biểu đồ xu hướng kỹ năng theo đợt kiểm tra" option={option} />
      </div>
      <LatestValues points={points} showSampleCount={showSampleCount} />
      <TrendDataTable points={points} showSampleCount={showSampleCount} />
    </div>
  );
}

function LatestValues({
  points,
  showSampleCount,
}: {
  points: SkillTrendPoint[];
  showSampleCount: boolean;
}) {
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Giá trị kỹ năng gần nhất">
      {skills.map((skill) => {
        const latest = [...points].reverse().find((point) => point.values[skill]);
        const value = latest?.values[skill];
        return (
          <div
            className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm"
            key={skill}
          >
            <span className="flex items-center gap-2">
              <i className="size-2.5 rounded-full" style={{ backgroundColor: colors[skill] }} />
              {toeicSkillLabel[skill]}
            </span>
            <strong>
              {value
                ? `${scoreText(value.score)}${showSampleCount ? ` · ${value.sampleCount ?? 0} học viên` : ''}`
                : 'Chưa có dữ liệu'}
            </strong>
          </div>
        );
      })}
    </div>
  );
}

function TwoPointSkillComparison({
  points,
  showSampleCount,
}: {
  points: SkillTrendPoint[];
  showSampleCount: boolean;
}) {
  const first = points[0]!;
  const last = points[1]!;
  const summary = showSampleCount ? null : learnerComparisonSummary(first, last);
  return (
    <div className="mt-4 min-w-0" data-testid="two-point-skill-comparison">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
        <div>
          <strong className="block break-words text-slate-800">{first.title}</strong>
          {new Date(first.date).toLocaleDateString('vi-VN')}
        </div>
        <span aria-hidden="true">→</span>
        <div className="text-right">
          <strong className="block break-words text-slate-800">{last.title}</strong>
          {new Date(last.date).toLocaleDateString('vi-VN')}
        </div>
      </div>
      {summary ? (
        <div
          className="mt-3 rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900"
          data-testid="learner-comparison-summary"
        >
          {summary.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
      {showSampleCount ? (
        <div className="mt-3 rounded-xl bg-sky-50 p-3 text-sm text-sky-900">
          <p>Đây là chênh lệch điểm trung bình của lớp.</p>
          <p>Số học viên có điểm có thể khác giữa hai đợt.</p>
        </div>
      ) : null}
      <div
        className="mt-3 overflow-hidden rounded-xl border bg-white"
        aria-label="Bốn hàng so sánh kỹ năng"
      >
        {skills.map((skill) => {
          const before = first.values[skill];
          const after = last.values[skill];
          const delta = before && after ? roundedTrendNumber(after.score - before.score) : null;
          return (
            <div
              className="grid min-w-0 gap-3 border-b p-3 last:border-b-0 sm:grid-cols-[6rem_minmax(8rem,1fr)_minmax(8rem,1fr)_6rem] sm:items-center"
              data-testid={`comparison-row-${skill}`}
              key={skill}
            >
              <strong className="text-sm">{toeicSkillLabel[skill]}</strong>
              <ComparisonValue label="Đợt trước" value={before} color="#94a3b8" />
              <ComparisonValue label="Đợt hiện tại" value={after} color={colors[skill]} />
              <span
                className="text-right text-sm font-bold"
                style={{ color: delta === null ? '#64748b' : colors[skill] }}
              >
                {delta === null ? '—' : `${delta > 0 ? '+' : ''}${formatTrendNumber(delta)} điểm`}
              </span>
            </div>
          );
        })}
      </div>
      <TrendDataTable points={points} showSampleCount={showSampleCount} />
    </div>
  );
}
function ComparisonValue({
  label,
  value,
  color,
}: {
  label: string;
  value?: { score: number; sampleCount?: number };
  color: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-500">
        <span>{label}</span>
        <strong>{value ? scoreText(value.score) : '—'}</strong>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
        {value ? (
          <div
            className="h-full rounded-full"
            style={{ backgroundColor: color, width: `${Math.max(0, Math.min(100, value.score))}%` }}
          />
        ) : null}
      </div>
      {value?.sampleCount !== undefined ? (
        <small className="mt-1 block text-slate-500">{value.sampleCount} học viên có điểm</small>
      ) : null}
    </div>
  );
}
function learnerComparisonSummary(first: SkillTrendPoint, last: SkillTrendPoint) {
  const compared = skills.flatMap((skill) =>
    first.values[skill] && last.values[skill]
      ? [
          {
            skill,
            delta: roundedTrendNumber(last.values[skill]!.score - first.values[skill]!.score),
          },
        ]
      : [],
  );
  const missing = skills.length - compared.length;
  const lines: string[] = [];
  const up = compared.filter((item) => item.delta > 0);
  const same = compared.filter((item) => item.delta === 0);
  const down = compared.filter((item) => item.delta < 0);
  if (up.length === 4) lines.push('Điểm tăng ở cả 4 kỹ năng.');
  else {
    const parts = [
      ...(up.length ? [`${naturalSkillList(up.map((item) => item.skill))} tăng`] : []),
      ...(same.length ? [`${naturalSkillList(same.map((item) => item.skill))} giữ nguyên`] : []),
      ...(down.length ? [`${naturalSkillList(down.map((item) => item.skill))} giảm`] : []),
    ];
    if (parts.length) lines.push(`${parts.join('; ')}.`);
  }
  if (missing) lines.push('Một số kỹ năng chưa đủ dữ liệu để so sánh.');
  if (up.length) {
    const max = Math.max(...up.map((item) => item.delta));
    lines.push(
      `Mức tăng lớn nhất: ${naturalSkillList(up.filter((item) => item.delta === max).map((item) => item.skill))} +${formatTrendNumber(max)} điểm.`,
    );
  }
  return lines.length ? lines : ['Chưa đủ dữ liệu để so sánh hai đợt kiểm tra.'];
}
function naturalSkillList(items: ToeicSkill[]) {
  const labels = items.map((skill) => toeicSkillLabel[skill]);
  return labels.length <= 1
    ? (labels[0] ?? '')
    : `${labels.slice(0, -1).join(', ')} và ${labels.at(-1)}`;
}
function TrendDataTable({
  points,
  showSampleCount,
}: {
  points: SkillTrendPoint[];
  showSampleCount: boolean;
}) {
  return (
    <div className="sr-only">
      <table>
        <caption>Dữ liệu xu hướng kỹ năng theo đợt kiểm tra</caption>
        <thead>
          <tr>
            <th>Đợt kiểm tra</th>
            <th>Ngày</th>
            {skills.map((skill) => (
              <th key={skill}>{toeicSkillLabel[skill]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.id}>
              <th>{point.title}</th>
              <td>{new Date(point.date).toLocaleDateString('vi-VN')}</td>
              {skills.map((skill) => {
                const value = point.values[skill];
                return (
                  <td key={skill}>
                    {value
                      ? `${scoreText(value.score)}${showSampleCount ? `, ${value.sampleCount ?? 0} học viên` : ''}`
                      : 'Chưa có dữ liệu'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
