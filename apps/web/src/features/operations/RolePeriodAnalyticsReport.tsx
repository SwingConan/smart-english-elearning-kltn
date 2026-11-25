import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  Filter,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react';
import type { EChartsOption } from 'echarts';
import { ReportEChart } from '@/components/charts/ReportEChart';
import { classCodeLabel } from '@/features/demo/presentation';
import { apiFetch } from '@/lib/api-client';
import {
  exportPeriodReportCsv,
  exportPeriodReportExcel,
} from './role-period-export';
import {
  formatPrintTimestampVn,
  PrintableReportFooter,
  PrintableReportHeader,
} from './PrintableReportChrome';

export type PeriodPreset = 'TODAY' | 'LAST_7D' | 'THIS_MONTH' | 'LAST_MONTH' | 'ALL' | 'CUSTOM';

export interface PeriodKpiCard {
  id: string;
  label: string;
  value: string | number;
  sublabel: string;
  tone: 'indigo' | 'emerald' | 'amber' | 'sky' | 'rose' | 'slate';
}

export interface PeriodChartSeries {
  name: string;
  type: 'bar' | 'line';
  color: string;
  data: number[];
}

export interface PeriodBreakdownColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
}

export type PeriodReportRow = Record<string, string | number | null | undefined>;

export interface PeriodSecondaryPanel {
  title: string;
  subtitle: string;
  columns: PeriodBreakdownColumn[];
  rows: PeriodReportRow[];
}

export interface PeriodLedgerRow extends PeriodReportRow {
  id: string;
  href?: string | null;
  hrefLabel?: string | null;
}

export interface PeriodAnalyticsReport {
  role:
    | 'COUNSELOR'
    | 'ACADEMIC_MANAGER'
    | 'INSTRUCTOR'
    | 'STUDENT'
    | 'TEACHING_INSPECTOR'
    | 'SYSTEM_ADMIN';
  roleLabel: string;
  reportTitle: string;
  reportSubtitle: string;
  generatedAt: string;
  timezone: string;
  actor: { id: string; fullName: string; role: string };
  filters: {
    preset: PeriodPreset;
    from: string;
    to: string;
    scopeId: string | null;
    scopeLabel: string;
    scopeSelectLabel: string;
    scopeOptions: Array<{ id: string; label: string }>;
  };
  kpis: PeriodKpiCard[];
  executiveSummary: string[];
  charts: {
    trend: {
      title: string;
      subtitle: string;
      labels: string[];
      series: PeriodChartSeries[];
    };
    distribution: {
      title: string;
      subtitle: string;
      kind: 'pie' | 'bar';
      items: Array<{ name: string; value: number; color?: string }>;
    };
  };
  breakdown: {
    title: string;
    subtitle: string;
    columns: PeriodBreakdownColumn[];
    rows: PeriodReportRow[];
    totals: PeriodReportRow;
  };
  secondaryPanel: PeriodSecondaryPanel | null;
  ledger: {
    title: string;
    subtitle: string;
    columns: PeriodBreakdownColumn[];
    rows: PeriodLedgerRow[];
  };
  exportFilenameBase: string;
}

const PRESET_OPTIONS: Array<{ id: PeriodPreset; label: string }> = [
  { id: 'TODAY', label: 'Hôm nay' },
  { id: 'LAST_7D', label: '7 ngày' },
  { id: 'THIS_MONTH', label: 'Tháng này' },
  { id: 'LAST_MONTH', label: 'Tháng trước' },
  { id: 'ALL', label: 'Toàn kỳ' },
];

const KPI_TONE_CLASSES: Record<PeriodKpiCard['tone'], string> = {
  indigo: 'border-indigo-200 bg-indigo-50/60 text-indigo-950',
  emerald: 'border-emerald-200 bg-emerald-50/60 text-emerald-950',
  amber: 'border-amber-200 bg-amber-50/70 text-amber-950',
  sky: 'border-sky-200 bg-sky-50/60 text-sky-950',
  rose: 'border-rose-200 bg-rose-50/70 text-rose-950',
  slate: 'border-slate-200 bg-slate-50 text-slate-900',
};

function alignClass(align?: 'left' | 'right' | 'center'): string {
  if (align === 'right') return 'text-right tabular-nums';
  if (align === 'center') return 'text-center';
  return 'text-left';
}

function cleanClassTokenText(value: string): string {
  return value
    .replace(/^\[(?:SYNTHETIC (?:DEMO|DRAFT)|SYNTHETIC DEMO BR136)\]\s*/gi, '')
    .replace(/\bW0[123][A-Z]*-[A-Za-z0-9-]+\b/g, (token) => classCodeLabel(token));
}

function formatPeriodCell(key: string, value: string | number | null | undefined): string | number {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string' && key === 'classCode') {
    return cleanClassTokenText(value);
  }
  return value;
}

function buildTrendOption(report: PeriodAnalyticsReport): EChartsOption {
  const { labels, series } = report.charts.trend;
  return {
    tooltip: { trigger: 'axis' },
    legend: {
      top: 0,
      left: 0,
      type: 'scroll',
      textStyle: { fontSize: 12, color: '#334155' },
    },
    grid: { top: 44, left: 14, right: 16, bottom: 18, containLabel: true },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { color: '#64748b', fontSize: 11 },
      axisLine: { lineStyle: { color: '#cbd5e1' } },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: '#64748b', fontSize: 11 },
      splitLine: { lineStyle: { color: '#f1f5f9' } },
    },
    series: series.map((s) => ({
      name: s.name,
      type: s.type,
      data: s.data,
      smooth: s.type === 'line',
      barMaxWidth: 26,
      itemStyle: { color: s.color, borderRadius: s.type === 'bar' ? [4, 4, 0, 0] : 0 },
      lineStyle: s.type === 'line' ? { color: s.color, width: 2.5 } : undefined,
    })),
  };
}

function buildDistributionOption(report: PeriodAnalyticsReport): EChartsOption {
  const { kind, items } = report.charts.distribution;
  const cleanedItems = items.map((item) => ({
    ...item,
    name: cleanClassTokenText(item.name),
  }));
  if (kind === 'pie') {
    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: {
        bottom: 0,
        left: 'center',
        type: 'scroll',
        textStyle: { fontSize: 12, color: '#334155' },
      },
      series: [
        {
          type: 'pie',
          radius: ['42%', '68%'],
          center: ['50%', '43%'],
          avoidLabelOverlap: true,
          label: { show: false },
          data: cleanedItems.map((item) => ({
            name: item.name,
            value: item.value,
            itemStyle: item.color ? { color: item.color } : undefined,
          })),
        },
      ],
    };
  }

  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { top: 14, left: 10, right: 20, bottom: 16, containLabel: true },
    xAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: '#64748b', fontSize: 11 },
      splitLine: { lineStyle: { color: '#f1f5f9' } },
    },
    yAxis: {
      type: 'category',
      data: [...cleanedItems].reverse().map((i) => i.name),
      axisLabel: { color: '#334155', fontSize: 11, width: 132, overflow: 'truncate' },
      axisLine: { lineStyle: { color: '#cbd5e1' } },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 22,
        data: [...cleanedItems].reverse().map((i) => ({
          value: i.value,
          itemStyle: { color: i.color ?? '#4f46e5', borderRadius: [0, 4, 4, 0] },
        })),
      },
    ],
  };
}

/**
 * Shared domain-rich period analytics component for COUNSELOR, ACADEMIC_MANAGER,
 * INSTRUCTOR, and STUDENT portals.
 */
export function RolePeriodAnalyticsReport() {
  const [preset, setPreset] = useState<PeriodPreset>('THIS_MONTH');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [scopeId, setScopeId] = useState<string>('');
  const [searchText, setSearchText] = useState('');
  const [report, setReport] = useState<PeriodAnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(
    async (opts?: {
      nextPreset?: PeriodPreset;
      nextFrom?: string;
      nextTo?: string;
      nextScopeId?: string;
    }) => {
      const p = opts?.nextPreset ?? preset;
      const f = opts?.nextFrom ?? (p === 'CUSTOM' ? customFrom : '');
      const t = opts?.nextTo ?? (p === 'CUSTOM' ? customTo : '');
      const s = opts?.nextScopeId ?? scopeId;

      const qs = new URLSearchParams();
      qs.set('preset', p);
      if (p === 'CUSTOM' && f) qs.set('from', f);
      if (p === 'CUSTOM' && t) qs.set('to', t);
      if (s) qs.set('scopeId', s);

      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch<PeriodAnalyticsReport>(
          `/v2/operations/role-reports/period-analytics?${qs.toString()}`,
        );
        setReport(res);
        setCustomFrom(res.filters.from);
        setCustomTo(res.filters.to);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Không thể tải báo cáo tổng hợp');
      } finally {
        setLoading(false);
      }
    },
    [customFrom, customTo, preset, scopeId],
  );

  useEffect(() => {
    void loadReport({ nextPreset: 'THIS_MONTH', nextScopeId: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectPreset = (next: PeriodPreset) => {
    setPreset(next);
    void loadReport({ nextPreset: next });
  };

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customFrom || !customTo) return;
    setPreset('CUSTOM');
    void loadReport({ nextPreset: 'CUSTOM', nextFrom: customFrom, nextTo: customTo });
  };

  const handleScopeChange = (nextScopeId: string) => {
    setScopeId(nextScopeId);
    void loadReport({ nextScopeId });
  };

  const filteredLedgerRows = useMemo(() => {
    if (!report) return [];
    const q = searchText.trim().toLowerCase();
    if (!q) return report.ledger.rows;
    return report.ledger.rows.filter((row) =>
      report.ledger.columns.some((col) =>
        String(row[col.key] ?? '')
          .toLowerCase()
          .includes(q),
      ),
    );
  }, [report, searchText]);

  const trendOption = useMemo(() => (report ? buildTrendOption(report) : null), [report]);
  const distOption = useMemo(() => (report ? buildDistributionOption(report) : null), [report]);

  if (loading && !report) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white p-6" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900">
        <h2 className="text-base font-semibold">Không thể tải báo cáo tổng hợp</h2>
        <p className="mt-1 text-sm">{error}</p>
        <button
          type="button"
          onClick={() => void loadReport()}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-800"
        >
          <RefreshCw className="h-4 w-4" />
          Thử tải lại
        </button>
      </div>
    );
  }

  if (!report) return null;

  const hasDistData = report.charts.distribution.items.some((i) => i.value > 0);

  return (
    <div className="report-print-root space-y-6">
      <PrintableReportHeader
        department={`Smart English LMS · ${report.roleLabel}`}
        documentCode={`BC-${report.role}`}
        metaRows={[
          { label: 'Người lập', value: report.actor.fullName },
          { label: 'Vai trò', value: report.roleLabel },
          { label: 'Kỳ báo cáo', value: `${report.filters.from} → ${report.filters.to}` },
          { label: 'Phạm vi lọc', value: cleanClassTokenText(report.filters.scopeLabel) },
          {
            label: 'Múi giờ chuẩn',
            value: report.timezone === 'Asia/Ho_Chi_Minh' ? 'Việt Nam (GMT+7)' : report.timezone,
          },
          { label: 'Xuất bản lúc', value: `${formatPrintTimestampVn()} (GMT+7)` },
        ]}
      />
      {/* Filter & Export Controls */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Filter className="h-3.5 w-3.5" />
              Kỳ báo cáo:
            </span>
            {PRESET_OPTIONS.map((opt) => {
              const active = preset === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelectPreset(opt.id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => exportPeriodReportExcel(report)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Xuất Excel (.xls)
            </button>
            <button
              type="button"
              onClick={() => exportPeriodReportCsv(report)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              Xuất CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" />
              In báo cáo
            </button>
            <button
              type="button"
              onClick={() => void loadReport()}
              disabled={loading}
              aria-label="Làm mới số liệu"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-3 border-t border-slate-100 pt-3 md:flex-row md:items-end md:justify-between">
          <form onSubmit={handleApplyCustom} className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="period-from" className="block text-[11px] font-medium text-slate-500">
                Từ ngày
              </label>
              <input
                id="period-from"
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="mt-0.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="period-to" className="block text-[11px] font-medium text-slate-500">
                Đến ngày
              </label>
              <input
                id="period-to"
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="mt-0.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              Áp dụng khoảng ngày
            </button>
          </form>

          <div className="min-w-[240px]">
            <label htmlFor="period-scope" className="block text-[11px] font-medium text-slate-500">
              {report.filters.scopeSelectLabel}
            </label>
            <select
              id="period-scope"
              value={scopeId}
              onChange={(e) => handleScopeChange(e.target.value)}
              className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
            >
              <option value="">Tất cả ({report.filters.scopeOptions.length})</option>
              {report.filters.scopeOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {cleanClassTokenText(opt.label)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          {error}
        </div>
      ) : null}

      {/* Header & Executive Summary */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm print:border-0 print:p-0">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between print:block print:text-center">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 print:hidden">
              <BarChart3 className="h-3.5 w-3.5" />
              {report.roleLabel}
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 print:mt-0 print:text-lg print:uppercase print:tracking-wide">
              {report.reportTitle}
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600 print:mx-auto print:text-xs">
              {report.reportSubtitle}
            </p>
          </div>

          <div className="shrink-0 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-600 print:hidden">
            <div>
              <span className="font-semibold text-slate-800">Người lập:</span> {report.actor.fullName}
            </div>
            <div className="mt-1">
              <span className="font-semibold text-slate-800">Kỳ báo cáo:</span> {report.filters.from} → {report.filters.to}
            </div>
            <div className="mt-1">
              <span className="font-semibold text-slate-800">Phạm vi:</span>{' '}
              {cleanClassTokenText(report.filters.scopeLabel)}
            </div>
            <div className="mt-1">
              <span className="font-semibold text-slate-800">Múi giờ chuẩn:</span>{' '}
              {report.timezone === 'Asia/Ho_Chi_Minh' ? 'Việt Nam (GMT+7)' : report.timezone}
            </div>
          </div>
        </div>

        <div className="report-print-keep mt-5 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 print:mt-3 print:rounded-lg print:border-slate-300 print:bg-slate-50/60 print:p-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-900 print:text-slate-900">
            <Sparkles className="h-4 w-4 text-indigo-600 print:hidden" />
            {report.role === 'STUDENT'
              ? 'Tóm tắt tình hình học tập (Số liệu thực tế trong kỳ)'
              : 'Tóm tắt điều hành (Số liệu thực tế trong kỳ)'}
          </div>
          <ul className="mt-2.5 space-y-1.5 text-sm text-slate-700 print:mt-1.5 print:text-xs">
            {report.executiveSummary.map((line, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-600 print:bg-slate-700" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 4 KPI Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 print:grid-cols-4 print:gap-2">
        {report.kpis.map((kpi) => (
          <div
            key={kpi.id}
            className={`report-print-keep rounded-2xl border p-5 shadow-sm transition print:rounded-lg print:p-2.5 ${KPI_TONE_CLASSES[kpi.tone]}`}
          >
            <div className="text-xs font-semibold uppercase tracking-wide opacity-80 print:text-[10px]">
              {kpi.label}
            </div>
            <div className="mt-2 text-3xl font-bold tracking-tight print:mt-1 print:text-lg">
              {kpi.value}
            </div>
            <div className="mt-1.5 text-xs leading-relaxed opacity-85 print:mt-1 print:text-[10px]">
              {kpi.sublabel}
            </div>
          </div>
        ))}
      </section>

      {/* Two Charts */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12 print:grid-cols-2 print:gap-3">
        <div className="report-print-keep rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-7 print:col-span-1 print:rounded-lg print:p-3">
          <h2 className="text-base font-bold text-slate-900 print:text-xs">{report.charts.trend.title}</h2>
          <p className="mt-0.5 text-xs text-slate-500 print:text-[10px]">{report.charts.trend.subtitle}</p>
          <div className="mt-4 print:mt-2">
            {trendOption ? (
              <ReportEChart
                ariaLabel={report.charts.trend.title}
                className="h-72 w-full print:h-48"
                option={trendOption}
              />
            ) : null}
          </div>
        </div>

        <div className="report-print-keep rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-5 print:col-span-1 print:rounded-lg print:p-3">
          <h2 className="text-base font-bold text-slate-900 print:text-xs">{report.charts.distribution.title}</h2>
          <p className="mt-0.5 text-xs text-slate-500 print:text-[10px]">{report.charts.distribution.subtitle}</p>
          <div className="mt-4 print:mt-2">
            {hasDistData && distOption ? (
              <ReportEChart
                ariaLabel={report.charts.distribution.title}
                className="h-72 w-full print:h-48"
                option={distOption}
              />
            ) : (
              <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-500 print:h-48">
                Chưa phát sinh dữ liệu phân bổ trong khoảng thời gian đã chọn.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Domain Breakdown Table with Totals */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-bold text-slate-900">{report.breakdown.title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{report.breakdown.subtitle}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {report.breakdown.columns.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 ${alignClass(col.align)}`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {report.breakdown.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={report.breakdown.columns.length}
                    className="px-4 py-8 text-center text-sm text-slate-500"
                  >
                    Không có dữ liệu tổng hợp theo tiêu chí đang lọc.
                  </td>
                </tr>
              ) : (
                report.breakdown.rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70">
                    {report.breakdown.columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-4 py-3 text-slate-700 ${alignClass(col.align)}`}
                      >
                        {formatPeriodCell(col.key, row[col.key])}
                      </td>
                    ))}
                  </tr>
                ))
              )}
              <tr className="bg-indigo-50/70 font-semibold text-indigo-950">
                {report.breakdown.columns.map((col) => (
                  <td key={col.key} className={`px-4 py-3 ${alignClass(col.align)}`}>
                    {report.breakdown.totals[col.key] ?? '—'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Secondary Panel (when present) */}
      {report.secondaryPanel && report.secondaryPanel.rows.length > 0 ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-base font-bold text-slate-900">{report.secondaryPanel.title}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{report.secondaryPanel.subtitle}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {report.secondaryPanel.columns.map((col) => (
                    <th
                      key={col.key}
                      scope="col"
                      className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 ${alignClass(col.align)}`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {report.secondaryPanel.rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70">
                    {report.secondaryPanel!.columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-4 py-3 text-slate-700 ${alignClass(col.align)}`}
                      >
                        {row[col.key] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Detail Ledger Table */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">{report.ledger.title}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{report.ledger.subtitle}</p>
          </div>
          <div className="relative w-full sm:w-72 print:hidden">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Tìm trong sổ chi tiết..."
              aria-label="Tìm trong sổ chi tiết"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {report.ledger.columns.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 ${alignClass(col.align)}`}
                  >
                    {col.label}
                  </th>
                ))}
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 print:hidden">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredLedgerRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={report.ledger.columns.length + 1}
                    className="px-4 py-10 text-center text-sm text-slate-500"
                  >
                    {searchText.trim()
                      ? 'Không tìm thấy dòng chi tiết phù hợp với từ khóa.'
                      : 'Chưa có bản ghi chi tiết nào trong khoảng thời gian đã chọn.'}
                  </td>
                </tr>
              ) : (
                filteredLedgerRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70">
                    {report.ledger.columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-4 py-3 text-slate-700 ${alignClass(col.align)}`}
                      >
                        {formatPeriodCell(col.key, row[col.key])}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-4 py-3 text-right print:hidden">
                      {row.href ? (
                        <Link
                          to={row.href}
                          className="inline-flex items-center rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                        >
                          {row.hrefLabel ?? 'Chi tiết'}
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <PrintableReportFooter
        leftName={report.actor.fullName}
        leftTitle={report.role === 'STUDENT' ? 'Học viên' : 'Người lập báo cáo'}
        rightTitle={
          report.role === 'STUDENT' ? 'Xác nhận của Trung tâm' : 'Xác nhận của Ban quản lý'
        }
      />
    </div>
  );
}
