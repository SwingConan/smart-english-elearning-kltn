import type { EnrollmentStatus } from './types';

const vndFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
});

export function enrollmentStatusLabel(status: EnrollmentStatus): string {
  return {
    ACTIVE: 'Đang hoạt động',
    PENDING_PAYMENT: 'Chờ thanh toán',
    COMPLETED: 'Hoàn thành',
    DROPPED: 'Đã rút',
    CANCELLED: 'Đã hủy',
  }[status];
}

export function pricingLabel(pricingType: 'FREE' | 'PAID', tuitionFeeVnd: number | null): string {
  if (pricingType === 'FREE') return 'Miễn phí';
  return tuitionFeeVnd === null ? 'Học phí chưa cập nhật' : vndFormatter.format(tuitionFeeVnd);
}
