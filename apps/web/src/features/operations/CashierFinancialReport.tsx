import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  Lightbulb,
  Printer,
  RefreshCw,
  Search,
} from 'lucide-react';
import type { EChartsCoreOption } from 'echarts/core';
import { ReportEChart } from '@/components/charts/ReportEChart';
import { useAuth } from '@/features/auth/auth-context';
import { apiFetch } from '@/lib/api-client';
import { centerToday } from './model';
import {
  downloadCashierFinancialCsv,
  downloadCashierFinancialExcel,
  financialMethodLabels,
  financialStatusLabels,
  numberToVietnameseWords,
  printCashierReceiptDocument,
  type CashierFinancialReportData,
} from './cashier-financial-export';
import {
  formatPrintTimestampVn,
  PrintableReportFooter,
  PrintableReportHeader,
} from './PrintableReportChrome';

type PresetKey = 'TODAY' | 'LAST_7D' | 'THIS_MONTH' | 'LAST_MONTH' | 'ALL' | 'CUSTOM';

const vnd = (amount: number) => `${amount.toLocaleString('vi-VN')} đ`;

const exceptionClassLabels: Record<string, string> = {
  UNDERPAYMENT: 'Chuyển thiếu tiền',
  OVERPAYMENT: 'Chuyển dư tiền',
  UNMATCHED_CODE: 'Không khớp mã thanh toán',
  EXPIRED_HOLD: 'Quá hạn giữ chỗ 15 phút',
  CLASS_FULL: 'Lớp đã hết chỗ',
  DUPLICATE_TX: 'Trùng lặp giao dịch',
  RECEIVER_MISMATCH: 'Sai tài khoản nhận',
  WRONG_TYPE: 'Sai loại giao dịch',
};

function formatVnDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}` : iso;
}

function computePresetDates(preset: Exclude<PresetKey, 'CUSTOM' | 'ALL'>, today: string): {
  from: string;
  to: string;
} {
  const [y, m, d] = today.split('-').map(Number);
  if (preset === 'TODAY') {
    return { from: today, to: today };
  }
  if (preset === 'LAST_7D') {
    const start = new Date(Date.UTC(y, m - 1, d - 6, 12, 0, 0)).toISOString().slice(0, 10);
    return { from: start, to: today };
  }
  if (preset === 'THIS_MONTH') {
    return { from: `${today.slice(0, 8)}01`, to: today };
  }
  // LAST_MONTH
  const firstPrev = new Date(Date.UTC(y, m - 2, 1, 12, 0, 0)).toISOString().slice(0, 10);
  const lastPrev = new Date(Date.UTC(y, m - 1, 0, 12, 0, 0)).toISOString().slice(0, 10);
  return { from: firstPrev, to: lastPrev };
}

export function CashierFinancialReport() {
  const { user } = useAuth();
  const today = useMemo(() => centerToday(), []);
  const initialRange = useMemo(() => computePresetDates('THIS_MONTH', today), [today]);

  const [preset, setPreset] = useState<PresetKey>('THIS_MONTH');
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [draftFrom, setDraftFrom] = useState(initialRange.from);
  const [draftTo, setDraftTo] = useState(initialRange.to);
  const [classId, setClassId] = useState('ALL');
  const [method, setMethod] = useState('ALL');
  const [search, setSearch] = useState('');

  const [report, setReport] = useState<CashierFinancialReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportNotice, setExportNotice] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (preset === 'ALL') {
        qs.set('preset', 'ALL');
      } else {
        qs.set('from', fromDate);
        qs.set('to', toDate);
      }
      if (classId !== 'ALL') qs.set('classId', classId);
      if (method !== 'ALL') qs.set('method', method);

      const data = await apiFetch<CashierFinancialReportData>(
        `/v2/payments/sepay/cashier/financial-report?${qs.toString()}`,
      );
      setReport(data);
      setDraftFrom(data.window.from);
      setDraftTo(data.window.to);
      setError('');
    } catch {
      setReport(null);
      setError('Bạn chưa có quyền xem báo cáo tài chính hoặc dữ liệu tạm thời không khả dụng.');
    } finally {
      setLoading(false);
    }
  }, [preset, fromDate, toDate, classId, method]);

  useEffect(() => {
    void loadReport();
  }, [loadReport, reloadTick]);

  const applyPreset = (next: Exclude<PresetKey, 'CUSTOM'>) => {
    setPreset(next);
    if (next !== 'ALL') {
      const r = computePresetDates(next, today);
      setFromDate(r.from);
      setToDate(r.to);
      setDraftFrom(r.from);
      setDraftTo(r.to);
    }
  };

  const applyCustomRange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftFrom || !draftTo) return;
    if (draftFrom > draftTo) {
      setError('Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.');
      return;
    }
    setPreset('CUSTOM');
    setFromDate(draftFrom);
    setToDate(draftTo);
  };

  const filteredLedger = useMemo(() => {
    if (!report) return [];
    const q = search.trim().toLowerCase();
    if (!q) return report.ledgerRows;
    return report.ledgerRows.filter(
      (r) =>
        r.receivableCode.toLowerCase().includes(q) ||
        (r.receiptNumber ?? '').toLowerCase().includes(q) ||
        r.learnerName.toLowerCase().includes(q) ||
        r.learnerEmail.toLowerCase().includes(q) ||
        r.classCode.toLowerCase().includes(q),
    );
  }, [report, search]);

  const cashflowChartOption: EChartsCoreOption | null = useMemo(() => {
    if (!report || report.dailySeries.length === 0) return null;
    const days = report.dailySeries;
    return {
      animationDuration: 250,
      aria: { show: true, decal: { show: false } },
      textStyle: { fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' },
      legend: {
        bottom: 0,
        textStyle: { fontSize: 11, color: '#475569' },
        data: ['Thực thu (VND)', 'Phải thu phát sinh (VND)'],
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
          const pt = first?.dataIndex !== undefined ? days[first.dataIndex] : undefined;
          if (!pt) return '';
          return [
            `<strong>${formatVnDate(pt.date)}</strong>`,
            `Thực thu: <strong>${vnd(pt.collectedVnd)}</strong> (${pt.receiptsCount} phiếu)`,
            `Phải thu phát sinh: <strong>${vnd(pt.invoicedVnd)}</strong> (${pt.receivablesCount} khoản)`,
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
        axisLabel: {
          color: '#64748b',
          fontSize: 11,
          formatter: (val: number) =>
            val >= 1_000_000
              ? `${(val / 1_000_000).toFixed(val % 1_000_000 === 0 ? 0 : 1)}tr`
              : val >= 1000
                ? `${Math.round(val / 1000)}k`
                : `${val}`,
        },
        splitLine: { lineStyle: { color: '#f1f5f9' } },
      },
      series: [
        {
          name: 'Thực thu (VND)',
          type: 'bar',
          barMaxWidth: 24,
          data: days.map((d) => d.collectedVnd),
          itemStyle: { color: '#2f5d1e', borderRadius: [4, 4, 0, 0] },
        },
        {
          name: 'Phải thu phát sinh (VND)',
          type: 'bar',
          barMaxWidth: 24,
          data: days.map((d) => d.invoicedVnd),
          itemStyle: { color: '#e66f2b', borderRadius: [4, 4, 0, 0] },
        },
      ],
    };
  }, [report]);

  const structureChartOption: EChartsCoreOption | null = useMemo(() => {
    if (!report) return null;
    const s = report.summary;
    const segments = [
      { name: 'SePay tự động', value: s.sepayAutoCollectedVnd, itemStyle: { color: '#2f5d1e' } },
      {
        name: 'Thu ngân thủ công',
        value: s.cashierManualCollectedVnd,
        itemStyle: { color: '#76a35e' },
      },
      { name: 'Còn phải thu', value: s.activeDebtVnd, itemStyle: { color: '#e66f2b' } },
      { name: 'Quá hạn giữ chỗ', value: s.expiredHoldVnd, itemStyle: { color: '#94a3b8' } },
    ].filter((x) => x.value > 0);
    if (segments.length === 0) return null;

    return {
      animationDuration: 250,
      aria: { show: true, decal: { show: false } },
      textStyle: { fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' },
      tooltip: {
        trigger: 'item',
        renderMode: 'html',
        confine: true,
        formatter: (p: unknown) => {
          const item = p as { name?: string; value?: number; percent?: number };
          return `<strong>${item.name ?? ''}</strong><br/>${vnd(Number(item.value ?? 0))} (${item.percent ?? 0}%)`;
        },
      },
      legend: {
        bottom: 0,
        textStyle: { fontSize: 11, color: '#475569' },
      },
      series: [
        {
          name: 'Cơ cấu dòng tiền',
          type: 'pie',
          radius: ['48%', '72%'],
          center: ['50%', '43%'],
          label: { show: true, formatter: '{d}%', fontSize: 11 },
          data: segments,
        },
      ],
    };
  }, [report]);

  const filterSummaryLabel = useMemo(() => {
    const className =
      classId === 'ALL'
        ? 'Tất cả lớp'
        : (report?.classOptions.find((c) => c.id === classId)?.code ?? 'Theo lớp');
    const methodName =
      method === 'ALL' ? 'Tất cả kênh' : (financialMethodLabels[method] ?? method);
    return `${className} · ${methodName}`;
  }, [classId, method, report?.classOptions]);

  const handleExport = (kind: 'EXCEL' | 'CSV') => {
    if (!report) return;
    const viewerName = user?.fullName ?? 'Thu ngân Smart English';
    const fileName =
      kind === 'EXCEL'
        ? downloadCashierFinancialExcel(report, viewerName, filterSummaryLabel)
        : downloadCashierFinancialCsv(report);
    setExportNotice(
      `Đã xuất ${kind === 'EXCEL' ? 'Excel chuẩn kế toán' : 'CSV'} ${fileName} (${report.ledgerRows.length} dòng bảng kê kèm tổng hợp).`,
    );
  };

  const totalsByClass = useMemo(() => {
    if (!report) return { invoiced: 0, collected: 0, debt: 0, expired: 0 };
    return report.byClass.reduce(
      (acc, c) => ({
        invoiced: acc.invoiced + c.invoicedVnd,
        collected: acc.collected + c.collectedVnd,
        debt: acc.debt + c.activeDebtVnd,
        expired: acc.expired + c.expiredHoldVnd,
      }),
      { invoiced: 0, collected: 0, debt: 0, expired: 0 },
    );
  }, [report]);

  const totalsLedger = useMemo(
    () =>
      filteredLedger.reduce(
        (acc, r) => ({
          invoiced: acc.invoiced + r.amountVnd,
          paid: acc.paid + r.paidAmountVnd,
          remaining: acc.remaining + r.remainingVnd,
        }),
        { invoiced: 0, paid: 0, remaining: 0 },
      ),
    [filteredLedger],
  );

  const selectedClassLabel =
    classId === 'ALL'
      ? 'Tất cả lớp học'
      : (report?.classOptions.find((c) => c.id === classId)?.code ?? classId);
  const selectedMethodLabel =
    method === 'ALL' ? 'Tất cả kênh thu' : (financialMethodLabels[method] ?? method);

  return (
    <div className="report-print-root space-y-5">
      {report && (
        <PrintableReportHeader
          department="Phòng Tài chính & Thu ngân · Smart English LMS"
          documentCode="BC-TC-01"
          title="Báo cáo tài chính & đối soát doanh thu học phí"
          subtitle={`Tổng hợp thực thu, công nợ theo lớp và bảng kê chứng từ kỳ ${formatVnDate(report.window.from)} – ${formatVnDate(report.window.to)}`}
          metaRows={[
            {
              label: 'Kỳ báo cáo',
              value: `${formatVnDate(report.window.from)} – ${formatVnDate(report.window.to)} (${report.window.spanDays} ngày)`,
            },
            { label: 'Phạm vi lớp học', value: selectedClassLabel },
            { label: 'Kênh thanh toán', value: selectedMethodLabel },
            { label: 'Đơn vị tính', value: 'Việt Nam Đồng (VNĐ)' },
            { label: 'Người lập biểu', value: user?.fullName ?? 'Thu ngân Smart English' },
            { label: 'Xuất bản lúc', value: `${formatPrintTimestampVn()} (GMT+7)` },
          ]}
        />
      )}
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 print:hidden">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#2f5d1e]">
            Thu ngân · Báo cáo tài chính &amp; Thu chi học phí
          </p>
          <h1 className="mt-1 text-2xl font-bold text-[#e66f2b] sm:text-[26px]">
            Báo cáo tài chính &amp; Đối soát doanh thu
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Tổng hợp thực thu theo phiếu thu hợp lệ, công nợ phải thu theo lớp, cơ cấu kênh thanh toán
            và bảng kê chi tiết chuẩn kế toán để xuất Excel / PDF.
          </p>
        </div>
        {report && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleExport('EXCEL')}
              className="btn-primary inline-flex items-center gap-1.5 px-3.5 py-2 text-xs"
            >
              <FileSpreadsheet size={14} aria-hidden="true" />
              Xuất Excel (.xls)
            </button>
            <button
              type="button"
              onClick={() => handleExport('CSV')}
              className="btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-xs"
            >
              <Download size={14} aria-hidden="true" />
              Xuất CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-xs"
            >
              <Printer size={14} aria-hidden="true" />
              In / Xuất PDF
            </button>
            <button
              type="button"
              onClick={() => setReloadTick((n) => n + 1)}
              className="btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-xs"
            >
              <RefreshCw size={14} aria-hidden="true" />
              Làm mới
            </button>
          </div>
        )}
      </header>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 print:hidden">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <span className="block text-xs font-semibold text-slate-700">Kỳ báo cáo nhanh</span>
            <div className="inline-flex flex-wrap overflow-hidden rounded-lg border border-slate-300 text-xs font-semibold">
              {(
                [
                  ['TODAY', 'Hôm nay'],
                  ['LAST_7D', '7 ngày'],
                  ['THIS_MONTH', 'Tháng này'],
                  ['LAST_MONTH', 'Tháng trước'],
                  ['ALL', 'Toàn kỳ'],
                ] as const
              ).map(([key, label], idx) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyPreset(key)}
                  className={`px-3 py-1.5 ${idx > 0 ? 'border-l border-slate-300' : ''} ${
                    preset === key
                      ? 'bg-[#76a35e] text-white'
                      : 'bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={applyCustomRange} className="flex flex-wrap items-end gap-2">
            <label className="space-y-1 text-xs font-semibold text-slate-700">
              <span>Từ ngày</span>
              <input
                type="date"
                value={draftFrom}
                onChange={(e) => setDraftFrom(e.target.value)}
                className="input-field py-1.5 text-xs"
                required
              />
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-700">
              <span>Đến ngày</span>
              <input
                type="date"
                value={draftTo}
                onChange={(e) => setDraftTo(e.target.value)}
                className="input-field py-1.5 text-xs"
                required
              />
            </label>
            <button type="submit" className="btn-primary px-3 py-1.5 text-xs">
              Áp dụng kỳ
            </button>
          </form>

          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1 text-xs font-semibold text-slate-700">
              <span>Lớp học</span>
              <select
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                className="input-field py-1.5 text-xs min-w-[160px]"
              >
                <option value="ALL">Tất cả lớp</option>
                {(report?.classOptions ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-700">
              <span>Kênh thu</span>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="input-field py-1.5 text-xs min-w-[155px]"
              >
                <option value="ALL">Tất cả kênh</option>
                <option value="SEPAY_AUTO_VERIFIED">SePay tự động</option>
                <option value="CASHIER_MANUAL_VERIFIED">Thu ngân thủ công</option>
              </select>
            </label>
          </div>
        </div>
      </section>

      {exportNotice && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-900 print:hidden"
        >
          {exportNotice}
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      )}

      {loading && !report && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
          Đang tổng hợp số liệu tài chính theo kỳ...
        </div>
      )}

      {report && (
        <>
          <section className="rounded-xl border border-[#cde0c2] bg-[#f4f9f1] p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-[#2f5d1e]">
              <Lightbulb size={16} aria-hidden="true" />
              <span>
                Tóm tắt tài chính kỳ {formatVnDate(report.window.from)} –{' '}
                {formatVnDate(report.window.to)} ({report.window.spanDays} ngày)
              </span>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-xs text-slate-700">
              <li>
                <strong>Tổng thực thu học phí:</strong>{' '}
                <span className="font-bold text-[#2f5d1e]">
                  {vnd(report.summary.totalCollectedVnd)}
                </span>{' '}
                ({numberToVietnameseWords(report.summary.totalCollectedVnd)}) qua{' '}
                <strong>{report.summary.receiptsCount}</strong> phiếu thu hợp lệ.
              </li>
              <li>
                <strong>Tỷ lệ thu hồi trên phải thu hiệu lực:</strong>{' '}
                <strong>{report.summary.recoveryRatePct}%</strong> (đã thu đối soát so với tổng phải
                thu hiệu lực {vnd(report.summary.activeInvoicedVnd)}). Công nợ còn lại cần theo dõi:{' '}
                <strong>{vnd(report.summary.activeDebtVnd)}</strong> ({report.summary.activeDebtCount}{' '}
                khoản).
              </li>
              <li>
                <strong>Khoản giữ chỗ quá hạn 15 phút:</strong>{' '}
                {vnd(report.summary.expiredHoldVnd)} ({report.summary.expiredHoldCount} hồ sơ đã tự
                động hủy &amp; giải phóng chỗ) ·{' '}
                <strong>Ngoại lệ chờ xử lý:</strong> {report.summary.pendingExceptionsCount} giao
                dịch ({vnd(report.summary.pendingExceptionsVnd)}).
              </li>
            </ul>
          </section>

          <section
            aria-label="Chỉ số tài chính trong kỳ"
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 print:grid-cols-4 print:gap-2"
          >
            <div className="report-print-keep rounded-xl border border-slate-200 bg-white p-4 print:rounded-lg print:p-2.5">
              <p className="text-xs font-medium text-slate-500 print:text-[10px]">Tổng thực thu (Phiếu thu)</p>
              <p className="mt-1 text-2xl font-bold text-[#2f5d1e] print:text-base">
                {vnd(report.summary.totalCollectedVnd)}
              </p>
              <p className="mt-1 text-xs text-slate-600 print:text-[10px]">
                {report.summary.receiptsCount} phiếu thu · SePay:{' '}
                {vnd(report.summary.sepayAutoCollectedVnd)}
              </p>
            </div>

            <div className="report-print-keep rounded-xl border border-slate-200 bg-white p-4 print:rounded-lg print:p-2.5">
              <p className="text-xs font-medium text-slate-500 print:text-[10px]">Phải thu hiệu lực &amp; Thu hồi</p>
              <p className="mt-1 text-2xl font-bold text-slate-900 print:text-base">
                {vnd(report.summary.activeInvoicedVnd)}
              </p>
              <p className="mt-1 text-xs text-slate-600 print:text-[10px]">
                Tỷ lệ thu hồi: <strong>{report.summary.recoveryRatePct}%</strong> · Thủ công:{' '}
                {vnd(report.summary.cashierManualCollectedVnd)}
              </p>
            </div>

            <div className="report-print-keep rounded-xl border border-slate-200 bg-white p-4 print:rounded-lg print:p-2.5">
              <p className="text-xs font-medium text-slate-500 print:text-[10px]">Công nợ còn phải thu</p>
              <p
                className={`mt-1 text-2xl font-bold print:text-base ${
                  report.summary.activeDebtVnd > 0 ? 'text-[#e66f2b]' : 'text-slate-900'
                }`}
              >
                {vnd(report.summary.activeDebtVnd)}
              </p>
              <p className="mt-1 text-xs text-slate-600 print:text-[10px]">
                {report.summary.activeDebtCount} khoản đang chờ/một phần · Ngoại lệ chờ:{' '}
                {report.summary.pendingExceptionsCount}
              </p>
            </div>

            <div className="report-print-keep rounded-xl border border-slate-200 bg-white p-4 print:rounded-lg print:p-2.5">
              <p className="text-xs font-medium text-slate-500 print:text-[10px]">Giữ chỗ quá hạn 15 phút</p>
              <p className="mt-1 text-2xl font-bold text-slate-700 print:text-base">
                {vnd(report.summary.expiredHoldVnd)}
              </p>
              <p className="mt-1 text-xs text-slate-600 print:text-[10px]">
                {report.summary.expiredHoldCount} lượt giữ chỗ hết hạn đã hoàn trả lớp
              </p>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-12 print:grid-cols-2 print:gap-3">
            <div className="report-print-keep rounded-xl border border-slate-200 bg-white p-4 lg:col-span-7 print:col-span-1 print:rounded-lg print:p-3">
              <h2 className="text-sm font-bold text-slate-900 print:text-xs">
                Diễn biến thực thu &amp; phải thu theo ngày (VND)
              </h2>
              <p className="text-xs text-slate-500 print:text-[10px]">
                So sánh tiền đã thực thu qua phiếu thu với giá trị phải thu phát sinh từng ngày.
              </p>
              {cashflowChartOption ? (
                <div className="mt-2">
                  <ReportEChart
                    ariaLabel="Biểu đồ diễn biến thực thu và phải thu theo ngày"
                    className="h-64 w-full print:h-48"
                    option={cashflowChartOption}
                  />
                </div>
              ) : (
                <p className="mt-6 text-center text-xs text-slate-500">
                  Chưa có dữ liệu dòng tiền trong kỳ đã chọn.
                </p>
              )}
            </div>

            <div className="report-print-keep rounded-xl border border-slate-200 bg-white p-4 lg:col-span-5 print:col-span-1 print:rounded-lg print:p-3">
              <h2 className="text-sm font-bold text-slate-900 print:text-xs">
                Cơ cấu dòng tiền &amp; Tình trạng thu
              </h2>
              <p className="text-xs text-slate-500 print:text-[10px]">
                Tỷ trọng giữa SePay tự động, xác nhận thủ công, công nợ và quá hạn.
              </p>
              {structureChartOption ? (
                <div className="mt-2">
                  <ReportEChart
                    ariaLabel="Biểu đồ cơ cấu dòng tiền và tình trạng thu"
                    className="h-64 w-full print:h-48"
                    option={structureChartOption}
                  />
                </div>
              ) : (
                <p className="mt-6 text-center text-xs text-slate-500">
                  Chưa có phát sinh tài chính trong kỳ để vẽ tỷ trọng.
                </p>
              )}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-12 print:grid-cols-1 print:gap-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-8 print:col-span-1 print:rounded-lg print:p-3">
              <h2 className="text-sm font-bold text-slate-900">
                I. Tổng hợp doanh thu &amp; công nợ theo Lớp học
              </h2>
              {report.byClass.length === 0 ? (
                <p className="mt-3 text-xs text-slate-500">Chưa phát sinh dữ liệu lớp học trong kỳ.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 text-slate-500">
                      <tr>
                        <th className="py-2 pr-3">Lớp học</th>
                        <th className="py-2 pr-3 text-right">Phải thu phát sinh</th>
                        <th className="py-2 pr-3 text-right">Thực thu</th>
                        <th className="py-2 pr-3 text-right">Còn nợ</th>
                        <th className="py-2 pr-3 text-right">Quá hạn giữ chỗ</th>
                        <th className="py-2 text-right">Tỷ lệ thu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.byClass.map((c) => (
                        <tr key={c.classId}>
                          <td className="py-2.5 pr-3">
                            <span className="font-mono font-bold text-slate-900">{c.classCode}</span>
                            <div className="text-[11px] text-slate-500">{c.className}</div>
                          </td>
                          <td className="py-2.5 pr-3 text-right font-medium">
                            {vnd(c.invoicedVnd)}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-bold text-[#2f5d1e]">
                            {vnd(c.collectedVnd)}
                          </td>
                          <td className="py-2.5 pr-3 text-right text-[#e66f2b]">
                            {vnd(c.activeDebtVnd)}
                          </td>
                          <td className="py-2.5 pr-3 text-right text-slate-500">
                            {vnd(c.expiredHoldVnd)}
                          </td>
                          <td className="py-2.5 text-right font-semibold">{c.collectionRatePct}%</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-900">
                      <tr>
                        <td className="py-2 pr-3">Tổng cộng ({report.byClass.length} lớp)</td>
                        <td className="py-2 pr-3 text-right">{vnd(totalsByClass.invoiced)}</td>
                        <td className="py-2 pr-3 text-right text-[#2f5d1e]">
                          {vnd(totalsByClass.collected)}
                        </td>
                        <td className="py-2 pr-3 text-right text-[#e66f2b]">
                          {vnd(totalsByClass.debt)}
                        </td>
                        <td className="py-2 pr-3 text-right text-slate-600">
                          {vnd(totalsByClass.expired)}
                        </td>
                        <td className="py-2 text-right">{report.summary.recoveryRatePct}%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            <div className="report-print-keep rounded-xl border border-slate-200 bg-white p-4 lg:col-span-4 print:col-span-1 print:rounded-lg print:p-3 space-y-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">II. Cơ cấu Kênh xác nhận thu</h2>
                <div className="mt-2.5 space-y-2 text-xs">
                  {report.byMethod.map((m) => (
                    <div
                      key={m.method}
                      className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">{m.label}</p>
                        <p className="text-[11px] text-slate-500">{m.count} chứng từ thu</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-[#2f5d1e]">{vnd(m.amountVnd)}</p>
                        <p className="text-[11px] text-slate-500">{m.pct}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                  Biến động &amp; Ngoại lệ giao dịch
                </h3>
                {report.exceptionsByClassification.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Không ghi nhận giao dịch lệch chuẩn nào trong kỳ.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5 text-xs">
                    {report.exceptionsByClassification.map((ex) => (
                      <li
                        key={ex.classification}
                        className="flex items-center justify-between rounded bg-amber-50/70 px-2.5 py-1.5"
                      >
                        <span className="font-medium text-slate-800">
                          {exceptionClassLabels[ex.classification] ?? ex.classification} ({ex.count})
                        </span>
                        <span className="font-semibold text-amber-900">
                          {vnd(ex.totalAmountVnd)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  III. Bảng kê chi tiết chứng từ &amp; khoản phải thu ({filteredLedger.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Chi tiết từng phiếu thu và khoản phải thu kèm số tiền phải thu, thực thu và còn lại.
                </p>
              </div>
              <label className="relative min-w-[310px] print:hidden">
                <Search
                  size={14}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm mã khoản thu, phiếu thu, học viên, lớp..."
                  className="input-field w-full py-1.5 pl-8 text-xs"
                />
              </label>
            </div>

            {filteredLedger.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-xs text-slate-500">
                Không có chứng từ hoặc khoản phải thu nào khớp điều kiện lọc trong kỳ.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">Thời gian</th>
                      <th className="py-2 pr-3">Mã khoản thu</th>
                      <th className="py-2 pr-3">Số phiếu thu</th>
                      <th className="py-2 pr-3">Học viên</th>
                      <th className="py-2 pr-3">Lớp</th>
                      <th className="py-2 pr-3 text-right">Phải thu</th>
                      <th className="py-2 pr-3 text-right">Thực thu</th>
                      <th className="py-2 pr-3 text-right">Còn lại</th>
                      <th className="py-2 pr-3">Trạng thái</th>
                      <th className="py-2 text-right print:hidden">Chứng từ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLedger.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/70">
                        <td className="whitespace-nowrap py-2.5 pr-3 text-slate-600">
                          {new Date(row.at).toLocaleString('vi-VN', {
                            timeZone: 'Asia/Ho_Chi_Minh',
                            hour12: false,
                          })}
                        </td>
                        <td className="py-2.5 pr-3 font-mono font-semibold text-slate-800">
                          {row.receivableCode}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-[#2f5d1e]">
                          {row.receiptNumber ?? '—'}
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="font-semibold text-slate-900">{row.learnerName}</div>
                          <div className="text-[11px] text-slate-500">{row.learnerEmail}</div>
                        </td>
                        <td className="py-2.5 pr-3 font-medium">{row.classCode}</td>
                        <td className="py-2.5 pr-3 text-right font-medium">{vnd(row.amountVnd)}</td>
                        <td className="py-2.5 pr-3 text-right font-bold text-[#2f5d1e]">
                          {vnd(row.paidAmountVnd)}
                        </td>
                        <td className="py-2.5 pr-3 text-right text-slate-700">
                          {vnd(row.remainingVnd)}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              row.status === 'PAID'
                                ? 'bg-emerald-100 text-emerald-900'
                                : row.status === 'EXPIRED'
                                  ? 'bg-slate-200 text-slate-700'
                                  : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {financialStatusLabels[row.status] ?? row.status}
                          </span>
                        </td>
                        <td className="py-2.5 text-right print:hidden">
                          {row.receiptNumber && row.verificationMethod ? (
                            <button
                              type="button"
                              onClick={() =>
                                printCashierReceiptDocument({
                                  receiptNumber: row.receiptNumber!,
                                  issuedAt: row.at,
                                  amountVnd: row.paidAmountVnd,
                                  verificationMethod: row.verificationMethod!,
                                  learnerName: row.learnerName,
                                  learnerEmail: row.learnerEmail,
                                  classCode: row.classCode,
                                  className: row.className,
                                  receivableCode: row.receivableCode,
                                  gateway: row.gateway,
                                  providerTransactionId: row.providerTransactionId,
                                  cashierName: user?.fullName,
                                })
                              }
                              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <Printer size={12} aria-hidden="true" />
                              In phiếu
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-900">
                    <tr>
                      <td colSpan={5} className="py-2.5 pr-3">
                        Tổng cộng bảng kê ({filteredLedger.length} dòng)
                      </td>
                      <td className="py-2.5 pr-3 text-right">{vnd(totalsLedger.invoiced)}</td>
                      <td className="py-2.5 pr-3 text-right text-[#2f5d1e]">
                        {vnd(totalsLedger.paid)}
                      </td>
                      <td className="py-2.5 pr-3 text-right">{vnd(totalsLedger.remaining)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          <PrintableReportFooter
            leftName={user?.fullName ?? 'Thu ngân Smart English'}
            leftTitle="Thu ngân lập biểu"
            middleTitle="Kế toán trưởng"
            rightTitle="Giám đốc trung tâm"
          />
        </>
      )}
    </div>
  );
}
