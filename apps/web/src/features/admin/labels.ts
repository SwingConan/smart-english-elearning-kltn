import type { AdminClassOffering, CourseSkillScope } from './types';

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
