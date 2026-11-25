import type { AcademicTrack, AuthUser, UserRole } from './api';
export const businessRoleLabels: Record<UserRole, string> = {
  STUDENT: 'HV · Học viên',
  INSTRUCTOR: 'GV · Giảng viên',
  COUNSELOR: 'TV · Tư vấn',
  ACADEMIC_MANAGER: 'HVU · Học vụ',
  CASHIER: 'TN · Thu ngân',
  TEACHING_INSPECTOR: 'TT · Thanh tra',
  SYSTEM_ADMIN: 'QT · Quản trị kỹ thuật',
  ADMIN_COORDINATOR: 'Legacy · Chờ xác nhận vai trò',
};

export function academicTrackLabel(track?: AcademicTrack): string {
  if (track === 'TRAINING') return 'Quản lý Đào tạo';
  if (track === 'STUDENT_AFFAIRS') return 'Quản lý Học vụ Học viên';
  return 'Học vụ';
}

export function resolveBusinessRoleLabel(user?: Pick<AuthUser, 'role' | 'academicTrack'> | null): string {
  if (!user) return '';
  if (user.role === 'ACADEMIC_MANAGER') {
    if (user.academicTrack === 'TRAINING') return 'ĐT · Quản lý Đào tạo';
    if (user.academicTrack === 'STUDENT_AFFAIRS') return 'HVH · Quản lý Học vụ Học viên';
  }
  return businessRoleLabels[user.role];
}

export function workspaceLanding(_role: UserRole): string {
  return '/workspace';
}
