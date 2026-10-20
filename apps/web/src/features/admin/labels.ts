import type { AdminClassOffering } from './types';

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
