import type { PeriodAnalyticsReport } from './RolePeriodAnalyticsReport';

function escapeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const formulaSafe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  const escaped = formulaSafe.replace(/"/g, '""');
  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
}

function escapeHtml(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Exports a formula-safe UTF-8 CSV containing breakdown rows, totals, and detail ledger.
 */
export function exportPeriodReportCsv(report: PeriodAnalyticsReport): void {
  const lines: string[] = [];
  lines.push([escapeCsvCell(report.reportTitle)].join(','));
  lines.push(
    [
      escapeCsvCell(`Vai trò: ${report.roleLabel}`),
      escapeCsvCell(`Người lập: ${report.actor.fullName}`),
      escapeCsvCell(`Kỳ: ${report.filters.from} -> ${report.filters.to}`),
      escapeCsvCell(`Phạm vi: ${report.filters.scopeLabel}`),
    ].join(','),
  );
  lines.push('');

  lines.push(escapeCsvCell('I. CHỈ SỐ TỔNG QUAN'));
  lines.push(['Chỉ tiêu', 'Giá trị', 'Diễn giải'].map(escapeCsvCell).join(','));
  for (const kpi of report.kpis) {
    lines.push([kpi.label, kpi.value, kpi.sublabel].map(escapeCsvCell).join(','));
  }
  lines.push('');

  lines.push(escapeCsvCell(`II. ${report.breakdown.title.toUpperCase()}`));
  lines.push(report.breakdown.columns.map((c) => escapeCsvCell(c.label)).join(','));
  for (const row of report.breakdown.rows) {
    lines.push(
      report.breakdown.columns.map((c) => escapeCsvCell(row[c.key] ?? '')).join(','),
    );
  }
  lines.push(
    report.breakdown.columns
      .map((c) => escapeCsvCell(report.breakdown.totals[c.key] ?? ''))
      .join(','),
  );

  if (report.secondaryPanel && report.secondaryPanel.rows.length > 0) {
    lines.push('');
    lines.push(escapeCsvCell(`III. ${report.secondaryPanel.title.toUpperCase()}`));
    lines.push(report.secondaryPanel.columns.map((c) => escapeCsvCell(c.label)).join(','));
    for (const row of report.secondaryPanel.rows) {
      lines.push(
        report.secondaryPanel.columns.map((c) => escapeCsvCell(row[c.key] ?? '')).join(','),
      );
    }
  }

  lines.push('');
  lines.push(escapeCsvCell(`IV. ${report.ledger.title.toUpperCase()}`));
  lines.push(report.ledger.columns.map((c) => escapeCsvCell(c.label)).join(','));
  for (const row of report.ledger.rows) {
    lines.push(
      report.ledger.columns.map((c) => escapeCsvCell(row[c.key] ?? '')).join(','),
    );
  }

  const csvBody = `\uFEFF${lines.join('\r\n')}`;
  downloadBlob(
    new Blob([csvBody], { type: 'text/csv;charset=utf-8;' }),
    `${report.exportFilenameBase}.csv`,
  );
}

/**
 * Exports a styled HTML-spreadsheet (.xls) compatible with Excel, containing
 * KPI summary, breakdown table with totals, secondary table, and detailed ledger.
 */
export function exportPeriodReportExcel(report: PeriodAnalyticsReport): void {
  const breakdownColCount = Math.max(report.breakdown.columns.length, 4);

  const renderCells = (
    columns: Array<{ key: string; align?: 'left' | 'right' | 'center' }>,
    row: Record<string, string | number | null | undefined>,
    isTotal = false,
  ) =>
    columns
      .map((c) => {
        const align = c.align ?? 'left';
        const style = isTotal
          ? `font-weight:bold;background:#eef2ff;color:#1e1b4b;text-align:${align};border:1px solid #cbd5e1;padding:6px 8px;`
          : `text-align:${align};border:1px solid #e2e8f0;padding:6px 8px;`;
        return `<td style="${style}">${escapeHtml(row[c.key] ?? '—')}</td>`;
      })
      .join('');

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head>
<meta charset="UTF-8" />
<style>
  body { font-family: Arial, sans-serif; color: #0f172a; font-size: 11pt; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
  th { background: #1e293b; color: #ffffff; font-weight: bold; padding: 7px 8px; border: 1px solid #334155; }
  h2 { color: #1e1b4b; margin: 0 0 4px 0; }
  h3 { color: #334155; margin: 14px 0 6px 0; font-size: 11.5pt; }
</style>
</head>
<body>
  <table>
    <tr><td colspan="${breakdownColCount}" style="font-size:15pt;font-weight:bold;color:#1e1b4b;padding:8px 0;">${escapeHtml(report.reportTitle)}</td></tr>
    <tr><td colspan="${breakdownColCount}" style="color:#475569;padding:2px 0;">Vai trò: ${escapeHtml(report.roleLabel)} | Người lập: ${escapeHtml(report.actor.fullName)} | Kỳ báo cáo: ${escapeHtml(report.filters.from)} → ${escapeHtml(report.filters.to)} (${escapeHtml(report.timezone)})</td></tr>
    <tr><td colspan="${breakdownColCount}" style="color:#475569;padding:2px 0 10px 0;">Phạm vi lọc: ${escapeHtml(report.filters.scopeLabel)}</td></tr>
  </table>

  <h3>I. Chỉ số tổng quan</h3>
  <table>
    <thead>
      <tr>
        <th style="text-align:left;">Chỉ tiêu</th>
        <th style="text-align:right;">Giá trị</th>
        <th style="text-align:left;">Diễn giải</th>
      </tr>
    </thead>
    <tbody>
      ${report.kpis
        .map(
          (k) => `<tr>
            <td style="border:1px solid #e2e8f0;padding:6px 8px;font-weight:bold;">${escapeHtml(k.label)}</td>
            <td style="border:1px solid #e2e8f0;padding:6px 8px;text-align:right;font-weight:bold;color:#312e81;">${escapeHtml(k.value)}</td>
            <td style="border:1px solid #e2e8f0;padding:6px 8px;">${escapeHtml(k.sublabel)}</td>
          </tr>`,
        )
        .join('')}
    </tbody>
  </table>

  <h3>II. ${escapeHtml(report.breakdown.title)}</h3>
  <table>
    <thead>
      <tr>
        ${report.breakdown.columns
          .map((c) => `<th style="text-align:${c.align ?? 'left'};">${escapeHtml(c.label)}</th>`)
          .join('')}
      </tr>
    </thead>
    <tbody>
      ${report.breakdown.rows
        .map((row) => `<tr>${renderCells(report.breakdown.columns, row)}</tr>`)
        .join('')}
      <tr>${renderCells(report.breakdown.columns, report.breakdown.totals, true)}</tr>
    </tbody>
  </table>

  ${
    report.secondaryPanel && report.secondaryPanel.rows.length > 0
      ? `<h3>III. ${escapeHtml(report.secondaryPanel.title)}</h3>
  <table>
    <thead>
      <tr>
        ${report.secondaryPanel.columns
          .map((c) => `<th style="text-align:${c.align ?? 'left'};">${escapeHtml(c.label)}</th>`)
          .join('')}
      </tr>
    </thead>
    <tbody>
      ${report.secondaryPanel.rows
        .map((row) => `<tr>${renderCells(report.secondaryPanel!.columns, row)}</tr>`)
        .join('')}
    </tbody>
  </table>`
      : ''
  }

  <h3>Sổ chi tiết (${escapeHtml(report.ledger.rows.length)} dòng)</h3>
  <table>
    <thead>
      <tr>
        ${report.ledger.columns
          .map((c) => `<th style="text-align:${c.align ?? 'left'};">${escapeHtml(c.label)}</th>`)
          .join('')}
      </tr>
    </thead>
    <tbody>
      ${report.ledger.rows
        .map((row) => `<tr>${renderCells(report.ledger.columns, row)}</tr>`)
        .join('')}
    </tbody>
  </table>
</body>
</html>`;

  downloadBlob(
    new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' }),
    `${report.exportFilenameBase}.xls`,
  );
}
