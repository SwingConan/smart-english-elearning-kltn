import type { RoleReportTrendDay } from './role-report-echarts';

export interface ExportableReportSource {
  code: string;
  label: string;
  count: number;
  pct: number;
  availabilityLabel: string;
  records: {
    atLabel: string;
    activityLabel: string;
    stateLabel: string;
    ref: string;
  }[];
}

export interface ExportableStateRow {
  stateLabel: string;
  count: number;
  pct: number;
}

export interface ExecutiveReportExportInput {
  dateLabel: string;
  isoDate: string;
  roleKey: string;
  roleLabel: string;
  viewerName: string;
  updatedAtLabel: string;
  filterLabel: string;
  totalRecords: number;
  completedCount: number;
  completedRate: number;
  narrativeBullets: string[];
  sources: ExportableReportSource[];
  stateRows: ExportableStateRow[];
  shiftRows: { label: string; count: number; pct: number }[];
}

export interface ExecutiveNarrative {
  headline: string;
  bullets: string[];
}

export function buildExecutiveNarrative(input: {
  dateLabel: string;
  isoDate: string;
  totalRecords: number;
  completedCount: number;
  completedRate: number;
  activeDomainCount: number;
  totalDomainCount: number;
  topSource?: { label: string; count: number; pct: number } | null;
  topGroupedActivity?: { label: string; count: number } | null;
  peakShift?: { label: string; count: number; pct: number } | null;
  pendingCount: number;
  trendDays: RoleReportTrendDay[] | null;
  isStudent?: boolean;
}): ExecutiveNarrative {
  const {
    dateLabel,
    isoDate,
    totalRecords,
    completedCount,
    completedRate,
    activeDomainCount,
    totalDomainCount,
    topSource,
    topGroupedActivity,
    peakShift,
    pendingCount,
    trendDays,
    isStudent = false,
  } = input;

  if (totalRecords === 0) {
    const avg7d =
      trendDays && trendDays.length > 0
        ? Math.round(trendDays.reduce((s, d) => s + d.total, 0) / trendDays.length)
        : null;
    return {
      headline: isStudent
        ? `Ngày ${dateLabel} bạn chưa có hoạt động học tập mới được ghi nhận.`
        : `Ngày ${dateLabel} chưa phát sinh hoạt động mới trong phạm vi phụ trách.`,
      bullets: [
        avg7d !== null
          ? `Trung bình 7 ngày gần nhất đạt ${avg7d} hoạt động/ngày; bạn có thể chuyển sang ngày trước để đối chiếu chi tiết.`
          : 'Chọn mốc ngày khác hoặc bấm "Hôm qua" để đối chiếu dữ liệu lịch sử.',
      ],
    };
  }

  let trendSentence = `Tổng cộng ghi nhận ${totalRecords} hoạt động trên ${activeDomainCount}/${totalDomainCount} phân hệ, tỷ lệ xác nhận / hoàn tất đạt ${completedRate}% (${completedCount}/${totalRecords} bản ghi).`;
  if (trendDays && trendDays.length >= 2) {
    const idx = trendDays.findIndex((d) => d.date === isoDate);
    const prev = idx > 0 ? trendDays[idx - 1] : trendDays[trendDays.length - 2];
    const avg = Math.round(trendDays.reduce((s, d) => s + d.total, 0) / trendDays.length);
    if (prev && prev.date !== isoDate) {
      const diff = totalRecords - prev.total;
      const compText =
        diff > 0
          ? `tăng +${diff} bản ghi so với ngày liền trước`
          : diff < 0
            ? `giảm ${Math.abs(diff)} bản ghi so với ngày liền trước`
            : 'tương đương ngày liền trước';
      trendSentence += ` Khối lượng ${compText} (trung bình 7 ngày: ${avg} bản ghi/ngày).`;
    }
  }

  const bullets: string[] = [trendSentence];

  if (topSource) {
    const focusPart = topGroupedActivity
      ? ` — nổi bật nhất là "${topGroupedActivity.label}" (${topGroupedActivity.count} lượt)`
      : '';
    bullets.push(
      isStudent
        ? `Hoạt động học tập tập trung vào "${topSource.label}" (${topSource.count} bản ghi, chiếm ${topSource.pct}% tổng phát sinh)${focusPart}.`
        : `Trọng tâm vận hành dồn vào phân hệ "${topSource.label}" (${topSource.count} bản ghi, chiếm ${topSource.pct}% tổng phát sinh)${focusPart}.`,
    );
  }

  if (peakShift && peakShift.count > 0) {
    bullets.push(
      `Khung giờ cao điểm: ${peakShift.label} với ${peakShift.count} hoạt động (${peakShift.pct}% tổng trong ngày).`,
    );
  }

  if (pendingCount > 0) {
    bullets.push(
      `Cần theo dõi: Hiện còn ${pendingCount} bản ghi ở trạng thái trung gian (đang mở, nháp hoặc chờ duyệt).`,
    );
  }

  return {
    headline: isStudent
      ? `Tổng quan học tập ngày ${dateLabel}: ${totalRecords} hoạt động · ${completedRate}% đã hoàn tất`
      : `Tổng quan điều hành ngày ${dateLabel}: ${totalRecords} hoạt động · ${completedRate}% đã xác nhận/hoàn tất`,
    bullets,
  };
}

function escapeHtml(value: string | number): string {
  return String(value ?? '').replace(
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

function safeCsvCell(value: string | number): string {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) {
    text = "'" + text;
  }
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Generates a styled Excel workbook (.xls Spreadsheet HTML) that opens cleanly
 * in Microsoft Excel / LibreOffice Calc with green headers, borders, KPIs,
 * executive narrative, summary tables, and detailed activity log.
 */
export function downloadFormattedExcelReport(input: ExecutiveReportExportInput): string {
  const fileName = `smart-english-bao-cao-${input.roleKey.toLowerCase()}-${input.isoDate}.xls`;
  const detailRows = input.sources.flatMap((s) =>
    s.records.map((r) => ({ domain: s.label, ...r })),
  );

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" lang="vi">
<head>
<meta charset="UTF-8" />
<style>
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #1e293b; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 14px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 10px; vertical-align: middle; }
  .banner { background-color: #2f5d1e; color: #ffffff; font-size: 14pt; font-weight: bold; text-align: left; padding: 10px; }
  .subbanner { background-color: #e9f2e4; color: #2f5d1e; font-size: 10pt; font-weight: bold; }
  .section-head { background-color: #f1f5f9; color: #0f172a; font-weight: bold; font-size: 11pt; text-align: left; }
  .th { background-color: #76a35e; color: #ffffff; font-weight: bold; text-align: left; }
  .num { text-align: right; }
  .center { text-align: center; }
</style>
</head>
<body>
  <table>
    <tr><td colspan="5" class="banner">SMART ENGLISH LMS — BÁO CÁO HOẠT ĐỘNG TRONG NGÀY (${escapeHtml(input.dateLabel)})</td></tr>
    <tr>
      <td class="subbanner">Người lập báo cáo</td><td>${escapeHtml(input.viewerName)}</td>
      <td class="subbanner">Vai trò phụ trách</td><td colspan="2">${escapeHtml(input.roleLabel)}</td>
    </tr>
    <tr>
      <td class="subbanner">Phạm vi lọc</td><td>${escapeHtml(input.filterLabel)}</td>
      <td class="subbanner">Cập nhật lúc (GMT+7)</td><td colspan="2">${escapeHtml(input.updatedAtLabel)}</td>
    </tr>
    <tr>
      <td class="subbanner">Tổng phát sinh</td><td class="num"><strong>${input.totalRecords}</strong></td>
      <td class="subbanner">Xác nhận / Hoàn tất</td><td colspan="2"><strong>${input.completedCount}/${input.totalRecords} (${input.completedRate}%)</strong></td>
    </tr>
  </table>

  <table>
    <tr><td colspan="5" class="section-head">NHẬN ĐỊNH &amp; PHÂN TÍCH ĐIỀU HÀNH</td></tr>
    ${input.narrativeBullets.map((b) => `<tr><td colspan="5">• ${escapeHtml(b)}</td></tr>`).join('')}
  </table>

  <table>
    <tr><td colspan="4" class="section-head">I. TỔNG HỢP THEO PHÂN HỆ NGHIỆP VỤ</td></tr>
    <tr>
      <th class="th">Phân hệ nghiệp vụ</th>
      <th class="th num">Số bản ghi</th>
      <th class="th num">Tỷ trọng (%)</th>
      <th class="th">Trạng thái nguồn</th>
    </tr>
    ${input.sources
      .map(
        (s) => `<tr>
      <td>${escapeHtml(s.label)}</td>
      <td class="num">${s.count}</td>
      <td class="num">${s.pct}%</td>
      <td>${escapeHtml(s.availabilityLabel)}</td>
    </tr>`,
      )
      .join('')}
  </table>

  <table>
    <tr><td colspan="3" class="section-head">II. PHÂN BỔ THEO TRẠNG THÁI XỬ LÝ &amp; KHUNG GIỜ</td></tr>
    <tr>
      <th class="th">Trạng thái xử lý</th>
      <th class="th num">Số lượng</th>
      <th class="th num">Tỷ lệ (%)</th>
    </tr>
    ${input.stateRows
      .map(
        (st) => `<tr>
      <td>${escapeHtml(st.stateLabel)}</td>
      <td class="num">${st.count}</td>
      <td class="num">${st.pct}%</td>
    </tr>`,
      )
      .join('')}
  </table>

  <table>
    <tr><td colspan="3" class="section-head">III. PHÂN BỔ THEO KHUNG GIỜ HOẠT ĐỘNG (GMT+7)</td></tr>
    <tr>
      <th class="th">Khung giờ</th>
      <th class="th num">Số hoạt động</th>
      <th class="th num">Tỷ lệ (%)</th>
    </tr>
    ${input.shiftRows
      .map(
        (sh) => `<tr>
      <td>${escapeHtml(sh.label)}</td>
      <td class="num">${sh.count}</td>
      <td class="num">${sh.pct}%</td>
    </tr>`,
      )
      .join('')}
  </table>

  <table>
    <tr><td colspan="5" class="section-head">IV. BẢNG CHI TIẾT HOẠT ĐỘNG GHI NHẬN (${detailRows.length} DÒNG)</td></tr>
    <tr>
      <th class="th center">STT</th>
      <th class="th">Phân hệ</th>
      <th class="th">Thời gian (GMT+7)</th>
      <th class="th">Nội dung hoạt động</th>
      <th class="th">Trạng thái</th>
    </tr>
    ${detailRows
      .map(
        (r, i) => `<tr>
      <td class="center">${i + 1}</td>
      <td>${escapeHtml(r.domain)}</td>
      <td>${escapeHtml(r.atLabel)}</td>
      <td>${escapeHtml(r.activityLabel)}</td>
      <td>${escapeHtml(r.stateLabel)}</td>
    </tr>`,
      )
      .join('')}
  </table>
</body>
</html>`;

  const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  triggerDownload(blob, fileName);
  return fileName;
}

export function downloadExecutiveCsvReport(input: ExecutiveReportExportInput): string {
  const fileName = `smart-english-bao-cao-${input.roleKey.toLowerCase()}-${input.isoDate}.csv`;
  const rows: Array<Array<string | number>> = [
    ['TRUNG TÂM ANH NGỮ SMART ENGLISH — BÁO CÁO HOẠT ĐỘNG TRONG NGÀY'],
    ['Ngày báo cáo', input.dateLabel],
    ['Người lập báo cáo', input.viewerName],
    ['Vai trò', input.roleLabel],
    ['Cập nhật lúc (GMT+7)', input.updatedAtLabel],
    ['Tổng phát sinh', input.totalRecords],
    ['Tỷ lệ xác nhận / hoàn tất', `${input.completedRate}% (${input.completedCount}/${input.totalRecords})`],
    [],
    ['NHẬN ĐỊNH ĐIỀU HÀNH'],
    ...input.narrativeBullets.map((b) => [b]),
    [],
    ['I. TỔNG HỢP THEO PHÂN HỆ'],
    ['Phân hệ', 'Số bản ghi', 'Tỷ trọng (%)', 'Trạng thái nguồn'],
    ...input.sources.map((s) => [s.label, s.count, `${s.pct}%`, s.availabilityLabel]),
    [],
    ['II. PHÂN BỔ TRẠNG THÁI'],
    ['Trạng thái', 'Số lượng', 'Tỷ lệ (%)'],
    ...input.stateRows.map((st) => [st.stateLabel, st.count, `${st.pct}%`]),
    [],
    ['III. CHI TIẾT HOẠT ĐỘNG'],
    ['Phân hệ', 'Thời gian (GMT+7)', 'Nội dung hoạt động', 'Trạng thái', 'Mã tham chiếu'],
    ...input.sources.flatMap((s) =>
      s.records.map((r) => [s.label, r.atLabel, r.activityLabel, r.stateLabel, r.ref]),
    ),
  ];
  const csv = '\uFEFF' + rows.map((row) => row.map(safeCsvCell).join(',')).join('\r\n');
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), fileName);
  return fileName;
}
