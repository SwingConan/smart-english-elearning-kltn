export interface CashierFinancialReportSummary {
  totalCollectedVnd: number;
  receiptsCount: number;
  sepayAutoCollectedVnd: number;
  sepayAutoCount: number;
  cashierManualCollectedVnd: number;
  cashierManualCount: number;
  totalInvoicedVnd: number;
  activeInvoicedVnd: number;
  receivablesCount: number;
  activeDebtVnd: number;
  activeDebtCount: number;
  expiredHoldVnd: number;
  expiredHoldCount: number;
  overpaidVnd: number;
  pendingExceptionsVnd: number;
  pendingExceptionsCount: number;
  recoveryRatePct: number;
}

export interface CashierDailyCashflowPoint {
  date: string;
  collectedVnd: number;
  invoicedVnd: number;
  receiptsCount: number;
  receivablesCount: number;
}

export interface CashierClassFinancialRow {
  classId: string;
  classCode: string;
  className: string;
  maxStudents: number;
  receivablesCount: number;
  invoicedVnd: number;
  activeInvoicedVnd: number;
  collectedVnd: number;
  activeDebtVnd: number;
  expiredHoldVnd: number;
  receiptsCount: number;
  sepayAutoVnd: number;
  cashierManualVnd: number;
  collectionRatePct: number;
}

export interface CashierMethodShareRow {
  method: string;
  label: string;
  count: number;
  amountVnd: number;
  pct: number;
}

export interface CashierExceptionSummaryRow {
  classification: string;
  count: number;
  pendingCount: number;
  totalAmountVnd: number;
}

export interface CashierFinancialLedgerRow {
  id: string;
  kind: 'RECEIPT' | 'RECEIVABLE';
  at: string;
  receivableCode: string;
  receiptNumber: string | null;
  learnerName: string;
  learnerEmail: string;
  classCode: string;
  className: string;
  amountVnd: number;
  paidAmountVnd: number;
  remainingVnd: number;
  verificationMethod: string | null;
  gateway: string | null;
  providerTransactionId: string | null;
  status: string;
}

export interface CashierFinancialReportData {
  authorized: boolean;
  window: {
    from: string;
    to: string;
    spanDays: number;
    timeZone: string;
  };
  filters: {
    classId: string;
    method: string;
  };
  classOptions: Array<{ id: string; code: string; name: string }>;
  summary: CashierFinancialReportSummary;
  dailySeries: CashierDailyCashflowPoint[];
  byClass: CashierClassFinancialRow[];
  byMethod: CashierMethodShareRow[];
  exceptionsByClassification: CashierExceptionSummaryRow[];
  ledgerRows: CashierFinancialLedgerRow[];
}

export interface PrintableReceiptInput {
  receiptNumber: string;
  issuedAt: string;
  amountVnd: number;
  verificationMethod: string;
  learnerName: string;
  learnerEmail: string;
  classCode: string;
  className: string;
  receivableCode: string;
  gateway?: string | null;
  providerTransactionId?: string | null;
  cashierName?: string;
}

export const financialStatusLabels: Record<string, string> = {
  PAID: 'Đã thu đủ',
  UNPAID: 'Chưa thanh toán',
  PARTIAL: 'Thu một phần',
  OVERPAID: 'Nộp dư',
  NEEDS_RECONCILIATION: 'Cần đối soát',
  EXPIRED: 'Quá hạn giữ chỗ',
};

export const financialMethodLabels: Record<string, string> = {
  SEPAY_AUTO_VERIFIED: 'SePay tự động',
  CASHIER_MANUAL_VERIFIED: 'Thu ngân thủ công',
};

const ONES = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const SCALES = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ'];

function readThreeDigits(n: number, fullPrefix: boolean): string {
  const hundreds = Math.floor(n / 100);
  const tens = Math.floor((n % 100) / 10);
  const units = n % 10;
  const parts: string[] = [];

  if (hundreds > 0 || fullPrefix) {
    parts.push(`${ONES[hundreds]} trăm`);
  }
  if (tens > 1) {
    parts.push(`${ONES[tens]} mươi`);
    if (units === 1) parts.push('mốt');
    else if (units === 4) parts.push('tư');
    else if (units === 5) parts.push('lăm');
    else if (units > 0) parts.push(ONES[units]);
  } else if (tens === 1) {
    parts.push('mười');
    if (units === 5) parts.push('lăm');
    else if (units > 0) parts.push(ONES[units]);
  } else if (units > 0) {
    if (parts.length > 0 || fullPrefix) parts.push('lẻ');
    parts.push(ONES[units]);
  }
  return parts.join(' ');
}

export function numberToVietnameseWords(amountVnd: number): string {
  const amount = Math.max(0, Math.round(amountVnd));
  if (amount === 0) return 'Không đồng chẵn';

  const groups: number[] = [];
  let rem = amount;
  while (rem > 0) {
    groups.push(rem % 1000);
    rem = Math.floor(rem / 1000);
  }

  const chunks: string[] = [];
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    const val = groups[i];
    if (val === 0) continue;
    const prefixNeeded = i < groups.length - 1 && chunks.length > 0;
    const text = readThreeDigits(val, prefixNeeded);
    const scale = SCALES[i] ? ` ${SCALES[i]}` : '';
    chunks.push(`${text}${scale}`);
  }
  const joined = chunks.join(' ').trim();
  return joined.charAt(0).toUpperCase() + joined.slice(1) + ' đồng chẵn';
}

function escapeHtml(value: string | number | null | undefined): string {
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

function safeCsvCell(value: string | number | null | undefined): string {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) {
    text = "'" + text;
  }
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function formatVnDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : isoDate;
}

function formatDateTimeVn(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false,
  });
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadCashierFinancialExcel(
  report: CashierFinancialReportData,
  viewerName: string,
  filterLabel: string,
): string {
  const { from, to } = report.window;
  const fileName = `smart-english-bao-cao-tai-chinh-${from}_den_${to}.xls`;
  const s = report.summary;

  const totalClassInvoiced = report.byClass.reduce((acc, c) => acc + c.invoicedVnd, 0);
  const totalClassCollected = report.byClass.reduce((acc, c) => acc + c.collectedVnd, 0);
  const totalClassDebt = report.byClass.reduce((acc, c) => acc + c.activeDebtVnd, 0);
  const totalClassExpired = report.byClass.reduce((acc, c) => acc + c.expiredHoldVnd, 0);

  const totalLedgerInvoiced = report.ledgerRows.reduce((acc, r) => acc + r.amountVnd, 0);
  const totalLedgerPaid = report.ledgerRows.reduce((acc, r) => acc + r.paidAmountVnd, 0);
  const totalLedgerRemaining = report.ledgerRows.reduce((acc, r) => acc + r.remainingVnd, 0);

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" lang="vi">
<head>
<meta charset="UTF-8" />
<style>
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; color: #1e293b; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 14px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 9px; vertical-align: middle; }
  .banner { background-color: #2f5d1e; color: #ffffff; font-size: 13pt; font-weight: bold; padding: 10px; }
  .subbanner { background-color: #e9f2e4; color: #2f5d1e; font-weight: bold; }
  .section-head { background-color: #f1f5f9; color: #0f172a; font-weight: bold; font-size: 11pt; }
  .th { background-color: #76a35e; color: #ffffff; font-weight: bold; text-align: left; }
  .num { text-align: right; mso-number-format: "#,##0"; }
  .pct { text-align: right; }
  .center { text-align: center; }
  .total-row { background-color: #f8fafc; font-weight: bold; color: #0f172a; }
</style>
</head>
<body>
  <table>
    <tr><td colspan="6" class="banner">TRUNG TÂM ANH NGỮ SMART ENGLISH — BÁO CÁO TÀI CHÍNH &amp; BẢNG KÊ THU HỌC PHÍ</td></tr>
    <tr>
      <td class="subbanner">Kỳ báo cáo (GMT+7)</td><td>${escapeHtml(formatVnDate(from))} – ${escapeHtml(formatVnDate(to))}</td>
      <td class="subbanner">Người lập báo cáo</td><td>${escapeHtml(viewerName)}</td>
      <td class="subbanner">Bộ lọc áp dụng</td><td>${escapeHtml(filterLabel)}</td>
    </tr>
  </table>

  <table>
    <tr><td colspan="4" class="section-head">I. CHỈ SỐ TÀI CHÍNH TRONG KỲ</td></tr>
    <tr>
      <th class="th">Chỉ tiêu</th>
      <th class="th num">Giá trị (VND)</th>
      <th class="th num">Số lượng</th>
      <th class="th">Ghi chú nghiệp vụ</th>
    </tr>
    <tr>
      <td>Tổng thực thu học phí (Phiếu thu hợp lệ)</td>
      <td class="num">${s.totalCollectedVnd}</td>
      <td class="num">${s.receiptsCount} phiếu thu</td>
      <td>${escapeHtml(numberToVietnameseWords(s.totalCollectedVnd))}</td>
    </tr>
    <tr>
      <td>  • Qua cổng SePay tự động</td>
      <td class="num">${s.sepayAutoCollectedVnd}</td>
      <td class="num">${s.sepayAutoCount} giao dịch</td>
      <td>Đối soát khớp tự động</td>
    </tr>
    <tr>
      <td>  • Thu ngân xác nhận thủ công</td>
      <td class="num">${s.cashierManualCollectedVnd}</td>
      <td class="num">${s.cashierManualCount} giao dịch</td>
      <td>Xử lý ngoại lệ có kiểm toán</td>
    </tr>
    <tr>
      <td>Tổng phải thu phát sinh hiệu lực</td>
      <td class="num">${s.activeInvoicedVnd}</td>
      <td class="num">${s.receivablesCount - s.expiredHoldCount} hồ sơ</td>
      <td>Tỷ lệ thu hồi: ${s.recoveryRatePct}%</td>
    </tr>
    <tr>
      <td>Công nợ còn phải thu (Chưa thu / Một phần)</td>
      <td class="num">${s.activeDebtVnd}</td>
      <td class="num">${s.activeDebtCount} khoản</td>
      <td>Cần theo dõi thu tiếp</td>
    </tr>
    <tr>
      <td>Khoản giữ chỗ quá hạn 15 phút (Đã hủy)</td>
      <td class="num">${s.expiredHoldVnd}</td>
      <td class="num">${s.expiredHoldCount} khoản</td>
      <td>Tự động giải phóng chỗ trong lớp</td>
    </tr>
    <tr>
      <td>Giao dịch ngoại lệ đang chờ xử lý</td>
      <td class="num">${s.pendingExceptionsVnd}</td>
      <td class="num">${s.pendingExceptionsCount} giao dịch</td>
      <td>Chờ Thu ngân kiểm tra sao kê</td>
    </tr>
  </table>

  <table>
    <tr><td colspan="7" class="section-head">II. TỔNG HỢP DOANH THU &amp; CÔNG NỢ THEO LỚP HỌC</td></tr>
    <tr>
      <th class="th">Mã lớp</th>
      <th class="th">Tên lớp</th>
      <th class="th num">Phải thu phát sinh (đ)</th>
      <th class="th num">Thực thu (đ)</th>
      <th class="th num">Còn phải thu (đ)</th>
      <th class="th num">Quá hạn giữ chỗ (đ)</th>
      <th class="th pct">Tỷ lệ thu (%)</th>
    </tr>
    ${report.byClass
      .map(
        (c) => `<tr>
      <td>${escapeHtml(c.classCode)}</td>
      <td>${escapeHtml(c.className)}</td>
      <td class="num">${c.invoicedVnd}</td>
      <td class="num">${c.collectedVnd}</td>
      <td class="num">${c.activeDebtVnd}</td>
      <td class="num">${c.expiredHoldVnd}</td>
      <td class="pct">${c.collectionRatePct}%</td>
    </tr>`,
      )
      .join('')}
    <tr class="total-row">
      <td colspan="2">TỔNG CỘNG</td>
      <td class="num">${totalClassInvoiced}</td>
      <td class="num">${totalClassCollected}</td>
      <td class="num">${totalClassDebt}</td>
      <td class="num">${totalClassExpired}</td>
      <td class="pct">${s.recoveryRatePct}%</td>
    </tr>
  </table>

  <table>
    <tr><td colspan="12" class="section-head">III. BẢNG KÊ CHI TIẾT CHỨNG TỪ &amp; KHOẢN PHẢI THU (${report.ledgerRows.length} DÒNG)</td></tr>
    <tr>
      <th class="th center">STT</th>
      <th class="th">Thời gian (GMT+7)</th>
      <th class="th">Mã khoản thu</th>
      <th class="th">Số phiếu thu</th>
      <th class="th">Học viên</th>
      <th class="th">Email</th>
      <th class="th">Lớp</th>
      <th class="th num">Phải thu (đ)</th>
      <th class="th num">Thực thu (đ)</th>
      <th class="th num">Còn lại (đ)</th>
      <th class="th">Kênh xác nhận</th>
      <th class="th">Trạng thái</th>
    </tr>
    ${report.ledgerRows
      .map(
        (r, i) => `<tr>
      <td class="center">${i + 1}</td>
      <td>${escapeHtml(formatDateTimeVn(r.at))}</td>
      <td>${escapeHtml(r.receivableCode)}</td>
      <td>${escapeHtml(r.receiptNumber ?? '—')}</td>
      <td>${escapeHtml(r.learnerName)}</td>
      <td>${escapeHtml(r.learnerEmail)}</td>
      <td>${escapeHtml(r.classCode)}</td>
      <td class="num">${r.amountVnd}</td>
      <td class="num">${r.paidAmountVnd}</td>
      <td class="num">${r.remainingVnd}</td>
      <td>${escapeHtml(r.verificationMethod ? (financialMethodLabels[r.verificationMethod] ?? r.verificationMethod) : 'Chưa thanh toán')}</td>
      <td>${escapeHtml(financialStatusLabels[r.status] ?? r.status)}</td>
    </tr>`,
      )
      .join('')}
    <tr class="total-row">
      <td colspan="7">TỔNG CỘNG BẢNG KÊ</td>
      <td class="num">${totalLedgerInvoiced}</td>
      <td class="num">${totalLedgerPaid}</td>
      <td class="num">${totalLedgerRemaining}</td>
      <td colspan="2"></td>
    </tr>
  </table>
</body>
</html>`;

  const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  triggerDownload(blob, fileName);
  return fileName;
}

export function downloadCashierFinancialCsv(report: CashierFinancialReportData): string {
  const { from, to } = report.window;
  const fileName = `smart-english-bang-ke-tai-chinh-${from}_den_${to}.csv`;
  const rows: Array<Array<string | number>> = [
    ['TRUNG TAM ANH NGU SMART ENGLISH - BANG KE TAI CHINH'],
    ['Ky bao cao', `${formatVnDate(from)} - ${formatVnDate(to)}`],
    ['Tong thuc thu (VND)', report.summary.totalCollectedVnd],
    ['Cong no con phai thu (VND)', report.summary.activeDebtVnd],
    [],
    [
      'STT',
      'Thoi gian (GMT+7)',
      'Ma khoan thu',
      'So phieu thu',
      'Hoc vien',
      'Email',
      'Ma lop',
      'Phai thu (VND)',
      'Thuc thu (VND)',
      'Con lai (VND)',
      'Kenh xac nhan',
      'Trang thai',
    ],
    ...report.ledgerRows.map((r, i) => [
      i + 1,
      formatDateTimeVn(r.at),
      r.receivableCode,
      r.receiptNumber ?? '',
      r.learnerName,
      r.learnerEmail,
      r.classCode,
      r.amountVnd,
      r.paidAmountVnd,
      r.remainingVnd,
      r.verificationMethod
        ? (financialMethodLabels[r.verificationMethod] ?? r.verificationMethod)
        : 'Chưa thanh toán',
      financialStatusLabels[r.status] ?? r.status,
    ]),
  ];
  const csv = '\uFEFF' + rows.map((row) => row.map(safeCsvCell).join(',')).join('\r\n');
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), fileName);
  return fileName;
}

function getReceiptDatePartsVn(iso: string): { day: string; month: string; year: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { day: '--', month: '--', year: '----' };
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(d);
  const pick = (t: string) => parts.find((p) => p.type === t)?.value ?? '--';
  return { day: pick('day'), month: pick('month'), year: pick('year') };
}

export function printCashierReceiptDocument(receipt: PrintableReceiptInput): void {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');

  const dateParts = getReceiptDatePartsVn(receipt.issuedAt);
  const methodText =
    financialMethodLabels[receipt.verificationMethod] ?? receipt.verificationMethod;
  const txRefText = receipt.providerTransactionId
    ? ` · Ngân hàng ${escapeHtml(receipt.gateway ?? 'MB')} · Mã GD #${escapeHtml(receipt.providerTransactionId.slice(0, 10).toUpperCase())}`
    : '';

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8" />
<title>Phiếu thu ${escapeHtml(receipt.receiptNumber)}</title>
<style>
  @page { size: A5 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; font-size: 11.5px; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .outer { border: 2px solid #2f5d1e; border-radius: 6px; padding: 4px; }
  .sheet { border: 1px solid #94a3b8; border-radius: 4px; padding: 14px 18px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 8px; }
  .org { font-weight: 700; color: #2f5d1e; font-size: 13px; text-transform: uppercase; }
  .org-sub { color: #475569; font-size: 10.5px; margin-top: 2px; }
  .form-meta { text-align: right; font-size: 10.5px; color: #334155; }
  .form-meta strong { color: #0f172a; }
  .title-wrap { text-align: center; margin: 10px 0 8px; }
  .title { font-size: 17px; font-weight: 800; letter-spacing: 0.6px; color: #e66f2b; text-transform: uppercase; }
  .date-line { font-size: 11px; font-style: italic; color: #475569; margin-top: 2px; }
  .copy-tag { display: inline-block; margin-top: 4px; padding: 1px 8px; border: 1px solid #b9d4ab; background: #f4f9f1; color: #2f5d1e; font-size: 10px; font-weight: 700; border-radius: 99px; }
  .grid { width: 100%; border-collapse: collapse; margin: 8px 0 10px; }
  .grid td { padding: 4.5px 6px; border-bottom: 1px dotted #cbd5e1; vertical-align: top; }
  .grid td.label { width: 175px; color: #475569; font-weight: 600; }
  .amount-box { display: inline-block; padding: 2px 10px; border: 1px solid #86efac; background: #f0fdf4; border-radius: 4px; font-size: 14px; font-weight: 800; color: #166534; }
  .signs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 14px; text-align: center; }
  .sign-title { font-weight: 700; font-size: 11px; text-transform: uppercase; }
  .sign-sub { font-size: 10px; color: #64748b; font-style: italic; margin-top: 1px; }
  .sign-space { height: 40px; }
  .sign-name { font-size: 11px; font-weight: 600; color: #0f172a; }
  .footer-note { margin-top: 8px; border-top: 1px solid #e2e8f0; padding-top: 5px; font-size: 9.5px; color: #64748b; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="outer">
  <div class="sheet">
    <div class="top">
      <div>
        <div class="org">TRUNG TÂM ANH NGỮ SMART ENGLISH</div>
        <div class="org-sub">Bộ phận Tài chính &amp; Thu học phí · Hệ thống Smart English LMS</div>
      </div>
      <div class="form-meta">
        <div><strong>Mẫu số: 01-TT</strong></div>
        <div>Số phiếu: <strong>${escapeHtml(receipt.receiptNumber)}</strong></div>
        <div>Mã khoản thu: <strong>${escapeHtml(receipt.receivableCode)}</strong></div>
      </div>
    </div>

    <div class="title-wrap">
      <div class="title">PHIẾU THU HỌC PHÍ</div>
      <div class="date-line">Ngày ${dateParts.day} tháng ${dateParts.month} năm ${dateParts.year}</div>
      <span class="copy-tag">Chứng từ hợp lệ · Giao học viên &amp; lưu đối soát</span>
    </div>

    <table class="grid">
      <tr>
        <td class="label">Họ và tên người nộp tiền:</td>
        <td><strong>${escapeHtml(receipt.learnerName)}</strong> · Email: ${escapeHtml(receipt.learnerEmail)}</td>
      </tr>
      <tr>
        <td class="label">Lớp học đăng ký:</td>
        <td><strong>${escapeHtml(receipt.classCode)}</strong> — ${escapeHtml(receipt.className)}</td>
      </tr>
      <tr>
        <td class="label">Lý do nộp tiền:</td>
        <td>Thu học phí lớp ${escapeHtml(receipt.classCode)} theo khoản phải thu ${escapeHtml(receipt.receivableCode)}</td>
      </tr>
      <tr>
        <td class="label">Số tiền thực thu:</td>
        <td><span class="amount-box">${escapeHtml(receipt.amountVnd.toLocaleString('vi-VN'))} đ</span></td>
      </tr>
      <tr>
        <td class="label">Viết bằng chữ:</td>
        <td><em>${escapeHtml(numberToVietnameseWords(receipt.amountVnd))}</em></td>
      </tr>
      <tr>
        <td class="label">Kèm theo / Kênh xác nhận:</td>
        <td>${escapeHtml(methodText)}${txRefText} · Giờ ghi nhận: ${escapeHtml(formatDateTimeVn(receipt.issuedAt))} (GMT+7)</td>
      </tr>
    </table>

    <div class="signs">
      <div>
        <div class="sign-title">Người nộp tiền</div>
        <div class="sign-sub">(Ký, ghi rõ họ tên)</div>
        <div class="sign-space"></div>
        <div class="sign-name">${escapeHtml(receipt.learnerName)}</div>
      </div>
      <div>
        <div class="sign-title">Thu ngân lập phiếu</div>
        <div class="sign-sub">(Ký, ghi rõ họ tên)</div>
        <div className="sign-space"></div>
        <div class="sign-name">${escapeHtml(receipt.cashierName ?? 'Thu ngân Smart English')}</div>
      </div>
      <div>
        <div class="sign-title">Kế toán trưởng</div>
        <div class="sign-sub">(Ký, đóng dấu xác nhận)</div>
        <div class="sign-space"></div>
        <div class="sign-name"></div>
      </div>
    </div>

    <div class="footer-note">
      <span>Chứng từ trích xuất tự động từ hệ thống Smart English LMS.</span>
      <span>Mọi tra soát vui lòng đối chiếu Số phiếu &amp; Mã khoản thu.</span>
    </div>
  </div>
  </div>
</body>
</html>`;

  document.body.appendChild(iframe);
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      window.setTimeout(() => {
        iframe.remove();
      }, 1500);
    }
  };
  iframe.srcdoc = html;
}
