import type { EChartsCoreOption } from 'echarts/core';

export interface RoleReportTrendDay {
  date: string;
  total: number;
  completed: number;
  bySource: Record<string, number>;
}

export interface DomainChartRow {
  code: string;
  label: string;
  count: number;
}

export interface ShiftChartRow {
  label: string;
  count: number;
}

const BASE_OPTION = {
  animationDuration: 250,
  aria: { show: true, decal: { show: false } },
  textStyle: { fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' },
} satisfies EChartsCoreOption;

const DONUT_PALETTE = ['#2f5d1e', '#76a35e', '#e66f2b', '#0284c7', '#f59e0b', '#6366f1', '#64748b'];

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>'"]/g,
    (ch) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      })[ch] ?? ch,
  );
}

function shortDate(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  return m ? `${m[3]}/${m[2]}` : dateKey;
}

function fullDate(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : dateKey;
}

export function buildTrend7dOption(
  days: RoleReportTrendDay[],
  selectedDate: string,
  completedLabel = 'Đã công bố / Hoàn tất',
): EChartsCoreOption {
  return {
    ...BASE_OPTION,
    legend: {
      bottom: 0,
      textStyle: { fontSize: 11, color: '#475569' },
      data: ['Tổng hoạt động ghi nhận', completedLabel],
    },
    grid: { left: 10, right: 16, top: 20, bottom: 38, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      renderMode: 'html',
      confine: true,
      formatter: (params: unknown) => {
        const list = Array.isArray(params) ? params : [];
        const first = list[0] as { dataIndex?: number } | undefined;
        const day = first?.dataIndex !== undefined ? days[first.dataIndex] : undefined;
        if (!day) return '';
        const pct = day.total > 0 ? Math.round((day.completed / day.total) * 100) : 0;
        return [
          `<strong>${escapeHtml(fullDate(day.date))}</strong>`,
          `Tổng ghi nhận: <strong>${day.total}</strong> bản ghi`,
          `${escapeHtml(completedLabel)}: <strong>${day.completed}</strong> (${pct}%)`,
        ].join('<br/>');
      },
    },
    xAxis: {
      type: 'category',
      data: days.map((d) => shortDate(d.date)),
      axisLabel: { color: '#475569', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: '#64748b', fontSize: 11 },
      splitLine: { lineStyle: { color: '#f1f5f9' } },
    },
    series: [
      {
        name: 'Tổng hoạt động ghi nhận',
        type: 'bar',
        barMaxWidth: 26,
        itemStyle: { color: '#76a35e' },
        data: days.map((d) => ({
          value: d.total,
          date: d.date,
          itemStyle: {
            color: d.date === selectedDate ? '#e66f2b' : '#76a35e',
            borderRadius: [5, 5, 0, 0],
          },
        })),
      },
      {
        name: completedLabel,
        type: 'bar',
        barMaxWidth: 26,
        itemStyle: { color: '#cde0c2', borderRadius: [5, 5, 0, 0] },
        data: days.map((d) => ({ value: d.completed, date: d.date })),
      },
    ],
  };
}

export function buildDomainDonutOption(rows: DomainChartRow[]): EChartsCoreOption {
  const active = rows.filter((r) => r.count > 0);
  const total = active.reduce((sum, r) => sum + r.count, 0);
  return {
    ...BASE_OPTION,
    color: DONUT_PALETTE,
    tooltip: {
      trigger: 'item',
      renderMode: 'html',
      confine: true,
      formatter: (params: unknown) => {
        const d = (params as { name?: string; value?: number }) ?? {};
        const val = Number(d.value ?? 0);
        const share = total > 0 ? Math.round((val / total) * 100) : 0;
        return `<strong>${escapeHtml(String(d.name ?? ''))}</strong><br/>${val} bản ghi · ${share}%`;
      },
    },
    legend: {
      bottom: 0,
      left: 'center',
      type: active.length > 4 ? 'scroll' : 'plain',
      itemWidth: 10,
      itemHeight: 8,
      itemGap: 10,
      textStyle: { fontSize: 11, color: '#475569' },
    },
    series: [
      {
        name: 'Phân hệ',
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '41%'],
        avoidLabelOverlap: true,
        label: {
          show: true,
          formatter: '{d}%',
          fontSize: 11,
          fontWeight: 'bold',
          color: '#1e293b',
        },
        itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
        data: active.map((r) => ({
          name: r.label,
          value: r.count,
          sourceCode: r.code,
        })),
      },
    ],
  };
}

export function buildShiftBarOption(shifts: ShiftChartRow[]): EChartsCoreOption {
  const total = shifts.reduce((s, r) => s + r.count, 0);
  return {
    ...BASE_OPTION,
    grid: { left: 10, right: 18, top: 18, bottom: 26, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      renderMode: 'html',
      confine: true,
      formatter: (params: unknown) => {
        const first = Array.isArray(params) ? (params[0] as { name?: string; value?: number }) : null;
        if (!first) return '';
        const val = Number(first.value ?? 0);
        const pct = total > 0 ? Math.round((val / total) * 100) : 0;
        return `<strong>${escapeHtml(String(first.name ?? ''))}</strong><br/>${val} hoạt động (${pct}%)`;
      },
    },
    xAxis: {
      type: 'category',
      data: shifts.map((s) => s.label),
      axisLabel: { color: '#475569', fontSize: 11, interval: 0 },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: '#64748b', fontSize: 11 },
      splitLine: { lineStyle: { color: '#f1f5f9' } },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 36,
        itemStyle: { color: '#2f5d1e', borderRadius: [5, 5, 0, 0] },
        data: shifts.map((s) => s.count),
      },
    ],
  };
}
