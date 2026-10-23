import type { AdminSystemReport } from './types';

const BOM = '\uFEFF';

export function serializeAdminReportCsv(report: AdminSystemReport): string {
  const rows: Array<Array<string | number>> = [
    ['BÁO CÁO HỆ THỐNG'],
    ['METADATA'],
    ['generatedAt', report.generatedAt],
    ['from', report.activity.period.from],
    ['to', report.activity.period.to],
    ['days', report.activity.period.days],
    ['timezone', report.activity.period.timeZone],
    [],
    ['TỔNG QUAN HIỆN TẠI'],
    ['Nhóm', 'Chỉ số', 'Giá trị'],
    ['Tài khoản', 'Tổng', report.snapshot.accounts.total],
    ['Tài khoản', 'Học viên', report.snapshot.accounts.byRole.STUDENT],
    ['Tài khoản', 'Giảng viên', report.snapshot.accounts.byRole.INSTRUCTOR],
    ['Tài khoản', 'Điều phối/Admin', report.snapshot.accounts.byRole.ADMIN_COORDINATOR],
    ['Tài khoản', 'ACTIVE', report.snapshot.accounts.byStatus.ACTIVE],
    ['Tài khoản', 'INACTIVE', report.snapshot.accounts.byStatus.INACTIVE],
    ['Tài khoản', 'LOCKED', report.snapshot.accounts.byStatus.LOCKED],
    ['Khóa học', 'Tổng', report.snapshot.courses.total],
    ['Khóa học', 'Đã xuất bản', report.snapshot.courses.published],
    ['Khóa học', 'Bản nháp', report.snapshot.courses.draft],
    ['Lớp học', 'Tổng', report.snapshot.classes.total],
    ...Object.entries(report.snapshot.classes.byStatus).map(([key, value]) => [
      'Vòng đời lớp học',
      key,
      value,
    ]),
    ['Sẵn sàng lớp nháp', 'READY', report.snapshot.classes.draftReadiness.ready],
    ['Sẵn sàng lớp nháp', 'NOT_READY', report.snapshot.classes.draftReadiness.notReady],
    ...Object.entries(report.snapshot.classes.openRegistration).map(([key, value]) => [
      'Đăng ký lớp OPEN',
      key,
      value,
    ]),
    ['Ghi danh', 'Tổng', report.snapshot.enrollments.total],
    ...Object.entries(report.snapshot.enrollments.byStatus).map(([key, value]) => [
      'Trạng thái ghi danh',
      key,
      value,
    ]),
    ['Cần chú ý', 'DRAFT chưa sẵn sàng', report.attention.draftNotReady],
    ['Cần chú ý', 'OPEN đã đầy', report.attention.openFull],
    ['Cần chú ý', 'PENDING_PAYMENT', report.attention.pendingPayment],
    [],
    ['HOẠT ĐỘNG THEO NGÀY'],
    ['date', 'newEnrollments', 'submittedAssessments', 'lessonCompletions'],
    ...report.activity.daily.map((row) => [
      row.date,
      row.newEnrollments,
      row.submittedAssessments,
      row.lessonCompletions,
    ]),
  ];

  return BOM + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function adminReportCsvFilename(report: AdminSystemReport): string {
  return `system-report-${report.activity.period.from}-to-${report.activity.period.to}.csv`;
}

export function downloadAdminReportCsv(report: AdminSystemReport): void {
  const blob = new Blob([serializeAdminReportCsv(report)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = adminReportCsvFilename(report);
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
