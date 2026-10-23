import type { AdminSystemReport } from './types';

const BOM = '\uFEFF';

export function serializeAdminReportCsv(report: AdminSystemReport): string {
  const rows: Array<Array<string | number>> = [
    ['BÁO CÁO HỆ THỐNG'],
    ['THÔNG TIN BÁO CÁO'],
    ['Thời điểm tạo báo cáo', report.generatedAt],
    ['Từ ngày', report.activity.period.from],
    ['Đến ngày', report.activity.period.to],
    ['Số ngày', report.activity.period.days],
    ['Múi giờ', 'Giờ Việt Nam (UTC+7)'],
    [],
    ['TỔNG QUAN HIỆN TẠI'],
    ['Nhóm', 'Chỉ số', 'Giá trị'],
    ['Tài khoản', 'Tổng', report.snapshot.accounts.total],
    ['Tài khoản', 'Học viên', report.snapshot.accounts.byRole.STUDENT],
    ['Tài khoản', 'Giảng viên', report.snapshot.accounts.byRole.INSTRUCTOR],
    ['Tài khoản', 'Điều phối/Admin', report.snapshot.accounts.byRole.ADMIN_COORDINATOR],
    ['Tài khoản', 'Đang hoạt động', report.snapshot.accounts.byStatus.ACTIVE],
    ['Tài khoản', 'Tạm ngưng', report.snapshot.accounts.byStatus.INACTIVE],
    ['Tài khoản', 'Đã khóa', report.snapshot.accounts.byStatus.LOCKED],
    ['Khóa học', 'Tổng', report.snapshot.courses.total],
    ['Khóa học', 'Đã xuất bản', report.snapshot.courses.published],
    ['Khóa học', 'Bản nháp', report.snapshot.courses.draft],
    ['Lớp học', 'Tổng', report.snapshot.classes.total],
    ['Lớp học theo trạng thái', 'Lớp nháp', report.snapshot.classes.byStatus.DRAFT],
    ['Lớp học theo trạng thái', 'Đang mở', report.snapshot.classes.byStatus.OPEN],
    ['Lớp học theo trạng thái', 'Đang diễn ra', report.snapshot.classes.byStatus.IN_PROGRESS],
    ['Lớp học theo trạng thái', 'Đã hoàn thành', report.snapshot.classes.byStatus.COMPLETED],
    ['Lớp học theo trạng thái', 'Đã hủy', report.snapshot.classes.byStatus.CANCELLED],
    ['Mức độ sẵn sàng của lớp nháp', 'Sẵn sàng mở', report.snapshot.classes.draftReadiness.ready],
    [
      'Mức độ sẵn sàng của lớp nháp',
      'Chưa sẵn sàng',
      report.snapshot.classes.draftReadiness.notReady,
    ],
    [
      'Tình trạng đăng ký của lớp đang mở',
      'Còn chỗ',
      report.snapshot.classes.openRegistration.AVAILABLE,
    ],
    [
      'Tình trạng đăng ký của lớp đang mở',
      'Đã đủ sĩ số',
      report.snapshot.classes.openRegistration.FULL,
    ],
    [
      'Tình trạng đăng ký của lớp đang mở',
      'Sắp mở đăng ký',
      report.snapshot.classes.openRegistration.UPCOMING,
    ],
    [
      'Tình trạng đăng ký của lớp đang mở',
      'Đã đóng đăng ký',
      report.snapshot.classes.openRegistration.CLOSED,
    ],
    ['Ghi danh', 'Tổng', report.snapshot.enrollments.total],
    ['Ghi danh theo trạng thái', 'Đang hiệu lực', report.snapshot.enrollments.byStatus.ACTIVE],
    [
      'Ghi danh theo trạng thái',
      'Chờ xử lý đăng ký có phí',
      report.snapshot.enrollments.byStatus.PENDING_PAYMENT,
    ],
    ['Ghi danh theo trạng thái', 'Đã hoàn tất', report.snapshot.enrollments.byStatus.COMPLETED],
    ['Ghi danh theo trạng thái', 'Đã ngừng học', report.snapshot.enrollments.byStatus.DROPPED],
    ['Ghi danh theo trạng thái', 'Đã hủy', report.snapshot.enrollments.byStatus.CANCELLED],
    ['Cần chú ý', 'Lớp nháp chưa sẵn sàng', report.attention.draftNotReady],
    ['Cần chú ý', 'Lớp đang mở đã đủ sĩ số', report.attention.openFull],
    ['Cần chú ý', 'Đăng ký có phí đang chờ xử lý', report.attention.pendingPayment],
    [],
    ['HOẠT ĐỘNG THEO NGÀY'],
    ['Ngày', 'Ghi danh mới', 'Bài đánh giá đã nộp', 'Bài học đã hoàn tất'],
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
