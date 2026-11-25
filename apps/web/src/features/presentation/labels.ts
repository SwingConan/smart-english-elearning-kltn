import type { UserRole } from '@/features/auth/api';

// Display names only. Role codes, routes and server authorization stay authoritative.
export const roleNames: Record<UserRole, string> = {
  STUDENT: 'Học viên',
  INSTRUCTOR: 'Giảng viên',
  COUNSELOR: 'Nhân viên tư vấn',
  ACADEMIC_MANAGER: 'Quản lý học vụ',
  CASHIER: 'Thu ngân',
  TEACHING_INSPECTOR: 'Thanh tra giảng dạy',
  SYSTEM_ADMIN: 'Quản trị hệ thống',
  ADMIN_COORDINATOR: 'Tài khoản cũ · Chờ xác nhận vai trò',
};

export const workspaceTitles: Record<UserRole, string> = {
  STUDENT: 'Trang học tập',
  INSTRUCTOR: 'Tổng quan giảng dạy',
  COUNSELOR: 'Tổng quan tư vấn',
  ACADEMIC_MANAGER: 'Tổng quan học vụ',
  CASHIER: 'Tổng quan thu ngân',
  TEACHING_INSPECTOR: 'Tổng quan thanh tra',
  SYSTEM_ADMIN: 'Tổng quan hệ thống',
  ADMIN_COORDINATOR: 'Tài khoản chờ xác nhận',
};

// Each map describes one entity. In particular, OPEN is not an enrollment or payment state.
export function classStateLabel(state: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Bản nháp',
    OPEN: 'Đang mở lớp',
    IN_PROGRESS: 'Đang học',
    COMPLETED: 'Đã kết thúc',
    CANCELLED: 'Đã hủy',
  };
  return labels[state] ?? state;
}

export function enrollmentStateLabel(state: string): string {
  const labels: Record<string, string> = {
    PENDING_PAYMENT: 'Chờ thanh toán',
    ACTIVE: 'Đang theo học',
    COMPLETED: 'Đã hoàn thành',
    CANCELLED: 'Đã hủy ghi danh',
    REJECTED: 'Không được chấp nhận',
  };
  return labels[state] ?? state;
}

export function sourceAvailabilityLabel(state: string): string {
  const labels: Record<string, string> = {
    AVAILABLE: 'Có dữ liệu để đối chiếu',
    UNAVAILABLE: 'Chưa khả dụng',
    UNVERIFIED: 'Chưa được xác minh',
    UNKNOWN: 'Chưa xác định',
    PENDING: 'Chờ xác minh',
  };
  return labels[state] ?? state;
}

export function consultationBookingLabel(state: string): string {
  const labels: Record<string, string> = {
    HOLD: 'Đang giữ chỗ',
    PENDING_GV: 'Chờ giảng viên xác nhận',
    CONFIRMED: 'Đã xác nhận lịch hẹn',
    REJECTED: 'Giảng viên đã từ chối',
    EXPIRED: 'Đã hết hạn',
    CANCELLED: 'Đã hủy lịch',
    SUPERSEDED: 'Đã thay bằng lịch mới',
  };
  return labels[state] ?? state;
}

export function consultationReviewLabel(state: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Bản nháp',
    PENDING: 'Chờ duyệt độc lập',
    APPROVED: 'Đã duyệt',
    REJECTED: 'Đã từ chối',
  };
  return labels[state] ?? state;
}
