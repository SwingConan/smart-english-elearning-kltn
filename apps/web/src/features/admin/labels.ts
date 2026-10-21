import type {
  AccountRole,
  AccountStatus,
  AdminClassOffering,
  CourseSkillScope,
  OperationalReadinessReason,
} from './types';

export function accountRoleLabel(role: AccountRole): string {
  return { STUDENT: 'Học viên', INSTRUCTOR: 'Giảng viên', ADMIN_COORDINATOR: 'Điều phối viên' }[
    role
  ];
}

export function accountStatusLabel(status: AccountStatus): string {
  return { ACTIVE: 'Đang hoạt động', INACTIVE: 'Ngưng hoạt động', LOCKED: 'Đã khóa' }[status];
}

export function accountRoleBadgeClass(role: AccountRole): string {
  return {
    STUDENT: 'bg-sky-100 text-sky-800',
    INSTRUCTOR: 'bg-violet-100 text-violet-800',
    ADMIN_COORDINATOR: 'bg-indigo-100 text-indigo-800',
  }[role];
}

export function accountStatusBadgeClass(status: AccountStatus): string {
  return {
    ACTIVE: 'bg-emerald-100 text-emerald-800',
    INACTIVE: 'bg-amber-100 text-amber-800',
    LOCKED: 'bg-rose-100 text-rose-800',
  }[status];
}

export function courseSkillScopeLabel(scope: CourseSkillScope): string {
  return {
    LISTENING: 'Nghe',
    READING: 'Đọc',
    LR: 'Nghe & Đọc',
    SPEAKING: 'Nói',
    WRITING: 'Viết',
    FOUR_SKILLS: 'Bốn kỹ năng',
  }[scope];
}

export function statusLabel(status: AdminClassOffering['status']): string {
  return {
    DRAFT: 'Bản nháp',
    OPEN: 'Đang mở',
    IN_PROGRESS: 'Đang học',
    COMPLETED: 'Hoàn thành',
    CANCELLED: 'Đã hủy',
  }[status];
}

export function modalityLabel(modality: AdminClassOffering['modality']): string {
  return {
    ONLINE: 'Trực tuyến',
    OFFLINE: 'Trực tiếp',
    HYBRID: 'Kết hợp',
  }[modality];
}

export function readinessReasonLabel(reason: OperationalReadinessReason): string {
  return {
    COURSE_UNPUBLISHED: 'Khóa học đã xuất bản',
    INSTRUCTOR_MISSING: 'Đã phân công giảng viên',
    INSTRUCTOR_INACTIVE: 'Giảng viên đang hoạt động',
    SCHEDULE_MISSING: 'Đã có ít nhất một lịch học',
    SCHEDULE_DESTINATION_MISSING: 'Mỗi lịch học có địa điểm hoặc đường dẫn trực tuyến',
    CLASS_DATES_MISSING: 'Ngày bắt đầu và kết thúc lớp hợp lệ',
  }[reason];
}
