import type { AdminSystemReport } from './types';
import { formatVietnamReportDate, formatVietnamReportDateTime } from './report-display-format';

const BOM = '\uFEFF';

export function serializeAdminReportCsv(report: AdminSystemReport): string {
  const rows: Array<Array<string | number>> = [
    ['BÁO CÁO HỆ THỐNG'],
    ['THÔNG TIN BÁO CÁO'],
    ['Thời điểm tạo báo cáo', formatVietnamReportDateTime(report.generatedAt)],
    ['Từ ngày', formatVietnamReportDate(report.period.from)],
    ['Đến ngày', formatVietnamReportDate(report.period.to)],
    ['Số ngày', report.period.days],
    ['Múi giờ', 'Giờ Việt Nam (UTC+7)'],
    [],
    ['CẦN XỬ LÝ'],
    ['Hàng đợi', 'Số lượng'],
    ['Lớp nháp chưa sẵn sàng', report.actionQueues.draftNotReady],
    ['Lớp đang mở đã đủ sĩ số', report.actionQueues.openFull],
    ['Đăng ký có phí đang chờ xử lý', report.actionQueues.pendingPayment],
    ['Bài Speaking/Writing chờ giảng viên duyệt', report.actionQueues.gradingBacklog],
    [],
    ['VẬN HÀNH LỚP'],
    ['Tổng lớp vận hành', report.classes.capacity.totalOperationalClasses],
    ['Số lớp chi tiết trong tệp', report.classes.capacity.items.length],
    [
      'Danh sách chi tiết',
      report.classes.capacity.truncated
        ? `${report.classes.capacity.items.length} lớp ưu tiên; xem Báo cáo hệ thống để mở danh sách đầy đủ`
        : 'Đầy đủ danh sách lớp vận hành',
    ],
    [
      'Mã lớp',
      'Tên lớp',
      'Khóa học',
      'Giảng viên',
      'Trạng thái',
      'Sĩ số đang học',
      'Sức chứa',
      'Còn chỗ',
      'Tình trạng đăng ký',
      'Ngày bắt đầu',
    ],
    ...report.classes.capacity.items.map((item) => [
      item.code,
      item.name,
      item.course.title,
      item.instructor?.fullName ?? 'Chưa phân công',
      classStatus(item.status),
      item.activeEnrollments,
      item.maxStudents ?? 'Không giới hạn cấu hình',
      item.remainingSeats ?? 'Không giới hạn cấu hình',
      registrationState(item.registrationState),
      item.classStart ? formatVietnamReportDate(item.classStart) : 'Chưa cấu hình',
    ]),
    [],
    ['TRẠNG THÁI LỚP'],
    ['Trạng thái', 'Số lượng'],
    ['Lớp nháp', report.classes.byStatus.DRAFT],
    ['Đang mở', report.classes.byStatus.OPEN],
    ['Đang diễn ra', report.classes.byStatus.IN_PROGRESS],
    ['Đã hoàn thành', report.classes.byStatus.COMPLETED],
    ['Đã hủy', report.classes.byStatus.CANCELLED],
    [],
    ['TÀI KHOẢN'],
    ['Nhóm', 'Chỉ số', 'Giá trị'],
    ['Vai trò', 'Học viên', report.accounts.byRole.STUDENT],
    ['Vai trò', 'Giảng viên', report.accounts.byRole.INSTRUCTOR],
    ['Vai trò', 'Điều phối/Admin', report.accounts.byRole.ADMIN_COORDINATOR],
    ['Trạng thái', 'Đang hoạt động', report.accounts.byStatus.ACTIVE],
    ['Trạng thái', 'Tạm ngưng', report.accounts.byStatus.INACTIVE],
    ['Trạng thái', 'Đã khóa', report.accounts.byStatus.LOCKED],
    [],
    ['KHÓA HỌC'],
    ['Tổng', report.courses.total],
    ['Đã xuất bản', report.courses.published],
    ['Bản nháp', report.courses.draft],
    [],
    ['NHU CẦU GHI DANH THEO LỚP'],
    ['Mã lớp', 'Tên lớp', 'Khóa học', 'Ghi danh mới'],
    ...report.enrollmentDemand.byClass.map((row) => [
      row.classCode,
      row.className,
      row.courseTitle,
      row.count,
    ]),
    [],
    ['NHU CẦU GHI DANH THEO NGÀY'],
    ['Ngày', 'Ghi danh mới'],
    ...report.enrollmentDemand.daily.map((row) => [formatVietnamReportDate(row.date), row.count]),
  ];
  return BOM + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function adminReportCsvFilename(report: AdminSystemReport): string {
  return `system-report-${report.period.from}-to-${report.period.to}.csv`;
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

function classStatus(status: string) {
  return (
    (
      {
        DRAFT: 'Lớp nháp',
        OPEN: 'Đang mở',
        IN_PROGRESS: 'Đang diễn ra',
        COMPLETED: 'Đã hoàn thành',
        CANCELLED: 'Đã hủy',
      } as Record<string, string>
    )[status] ?? status
  );
}

function registrationState(state: string) {
  return (
    (
      {
        AVAILABLE: 'Còn chỗ',
        FULL: 'Đã đủ sĩ số',
        UPCOMING: 'Sắp mở đăng ký',
        CLOSED: 'Đã đóng đăng ký',
      } as Record<string, string>
    )[state] ?? state
  );
}
