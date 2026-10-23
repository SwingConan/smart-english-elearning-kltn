import type { EChartsCoreOption } from 'echarts/core';
import type { AdminReportClassRow, AdminSystemReport, OfferingStatus } from './types';

const classStatusLabels: Record<OfferingStatus, string> = {
  DRAFT: 'Lớp nháp',
  OPEN: 'Đang mở',
  IN_PROGRESS: 'Đang diễn ra',
  COMPLETED: 'Đã hoàn thành',
  CANCELLED: 'Đã hủy',
};

const classStatusColors: Record<OfferingStatus, string> = {
  DRAFT: '#94a3b8',
  OPEN: '#4f46e5',
  IN_PROGRESS: '#0284c7',
  COMPLETED: '#059669',
  CANCELLED: '#dc2626',
};

const base = {
  animationDuration: 250,
  aria: { show: true, decal: { show: false } },
  textStyle: { fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' },
} satisfies EChartsCoreOption;

export function buildClassCapacityOption(items: AdminReportClassRow[]): EChartsCoreOption {
  const labels = items.map((item) => `${item.code} · ${item.name}`);
  return {
    ...base,
    grid: { left: 8, right: 24, top: 12, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => capacityTooltip(params, items),
    },
    xAxis: { type: 'value', minInterval: 1, name: 'Học viên ACTIVE' },
    yAxis: {
      type: 'category',
      inverse: true,
      data: labels,
      axisLabel: { width: 210, overflow: 'truncate' },
    },
    series: [
      {
        name: 'Đang học',
        type: 'bar',
        stack: 'capacity',
        barMaxWidth: 30,
        itemStyle: { color: '#4f46e5', borderRadius: [5, 0, 0, 5] },
        data: items.map((item) => ({
          value: item.activeEnrollments,
          classOfferingId: item.id,
          item,
        })),
      },
      {
        name: 'Còn chỗ',
        type: 'bar',
        stack: 'capacity',
        barMaxWidth: 30,
        itemStyle: { color: '#c7d2fe', borderRadius: [0, 5, 5, 0] },
        data: items.map((item) => ({
          value: item.remainingSeats ?? 0,
          classOfferingId: item.id,
          item,
        })),
      },
    ],
  };
}

export function buildClassStatusOption(report: AdminSystemReport): EChartsCoreOption {
  const statuses = Object.keys(classStatusLabels) as OfferingStatus[];
  return {
    ...base,
    grid: { left: 8, right: 28, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'item',
      formatter: (input: unknown) => {
        const data = chartData(input);
        const total = report.classes.total;
        const share = total ? Math.round((Number(data.value) / total) * 100) : 0;
        return `${escapeHtml(String(data.name))}<br/><strong>${Number(data.value)}</strong> lớp · ${share}%`;
      },
    },
    xAxis: { type: 'value', minInterval: 1 },
    yAxis: {
      type: 'category',
      inverse: true,
      data: statuses.map((status) => classStatusLabels[status]),
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 24,
        data: statuses.map((status) => ({
          value: report.classes.byStatus[status],
          name: classStatusLabels[status],
          status,
          itemStyle: { color: classStatusColors[status], borderRadius: 5 },
        })),
      },
    ],
  };
}

export function buildAccountRoleOption(report: AdminSystemReport): EChartsCoreOption {
  const roles = [
    {
      name: 'Học viên',
      value: report.accounts.byRole.STUDENT,
      role: 'STUDENT',
      itemStyle: { color: '#4f46e5' },
    },
    {
      name: 'Giảng viên',
      value: report.accounts.byRole.INSTRUCTOR,
      role: 'INSTRUCTOR',
      itemStyle: { color: '#0284c7' },
    },
    {
      name: 'Điều phối/Admin',
      value: report.accounts.byRole.ADMIN_COORDINATOR,
      role: 'ADMIN_COORDINATOR',
      itemStyle: { color: '#7c3aed' },
    },
  ];
  return {
    ...base,
    tooltip: { trigger: 'item', formatter: '{b}<br/><strong>{c}</strong> tài khoản · {d}%' },
    legend: { bottom: 0, type: 'scroll' },
    series: [
      {
        name: 'Vai trò',
        type: 'pie',
        radius: ['48%', '72%'],
        center: ['50%', '42%'],
        label: {
          show: true,
          position: 'center',
          formatter: `${report.accounts.total}\nTài khoản`,
          fontWeight: 700,
          fontSize: 15,
        },
        emphasis: { label: { show: true } },
        data: roles,
      },
    ],
  };
}

export function buildEnrollmentDemandOption(report: AdminSystemReport): EChartsCoreOption {
  const rows = report.enrollmentDemand.byClass;
  return {
    ...base,
    grid: { left: 8, right: 24, top: 12, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'item',
      formatter: (input: unknown) => {
        const data = chartData(input) as { row?: (typeof rows)[number] };
        const row = data.row;
        if (!row) return '';
        return `${escapeHtml(row.classCode)} · ${escapeHtml(row.className)}<br/>${escapeHtml(row.courseTitle)}<br/><strong>${row.count}</strong> ghi danh mới`;
      },
    },
    xAxis: { type: 'value', minInterval: 1 },
    yAxis: {
      type: 'category',
      inverse: true,
      data: rows.map((row) => `${row.classCode} · ${row.className}`),
      axisLabel: { width: 190, overflow: 'truncate' },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 26,
        itemStyle: { color: '#0f766e', borderRadius: 5 },
        data: rows.map((row) => ({ value: row.count, classOfferingId: row.classOfferingId, row })),
      },
    ],
  };
}

export function buildEnrollmentDailyOption(report: AdminSystemReport): EChartsCoreOption {
  const rows = report.enrollmentDemand.daily;
  return {
    ...base,
    grid: { left: 8, right: 18, top: 20, bottom: 24, containLabel: true },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: rows.map((row) => row.date),
      axisLabel: { hideOverlap: true },
    },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      {
        name: 'Ghi danh mới',
        type: 'line',
        smooth: false,
        symbolSize: 8,
        lineStyle: { color: '#4f46e5', width: 3 },
        itemStyle: { color: '#4f46e5' },
        areaStyle: { color: 'rgba(79,70,229,0.10)' },
        data: rows.map((row) => ({ value: row.count, date: row.date })),
      },
    ],
  };
}

function capacityTooltip(params: unknown, items: AdminReportClassRow[]) {
  const first = Array.isArray(params)
    ? (params[0] as { data?: { classOfferingId?: string } })
    : null;
  const item = items.find((candidate) => candidate.id === first?.data?.classOfferingId);
  if (!item) return '';
  const capacity =
    item.maxStudents === null
      ? `${item.activeEnrollments} · Không giới hạn cấu hình`
      : `${item.activeEnrollments}/${item.maxStudents} · còn ${item.remainingSeats ?? 0} chỗ`;
  return [
    `<strong>${escapeHtml(item.code)} · ${escapeHtml(item.name)}</strong>`,
    escapeHtml(item.course.title),
    `Giảng viên: ${escapeHtml(item.instructor?.fullName ?? 'Chưa phân công')}`,
    `Sĩ số: ${capacity}`,
    `Bắt đầu: ${item.classStart ? escapeHtml(item.classStart.slice(0, 10)) : 'Chưa cấu hình'}`,
  ].join('<br/>');
}

function chartData(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object') return {};
  const value = (input as { data?: unknown }).data;
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      })[character] ?? character,
  );
}
