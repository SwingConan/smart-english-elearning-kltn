import type {
  AdminClassOffering,
  CourseSkillScope,
  OperationalReadinessReason,
} from './types';

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
