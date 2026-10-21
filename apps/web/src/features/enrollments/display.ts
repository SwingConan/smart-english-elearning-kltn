import type { EnrollmentStatus } from './types';

const vndFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
});

export const enrollmentStatusPresentation: Record<
  EnrollmentStatus,
  { label: string; className: string }
> = {
  ACTIVE: { label: 'Đang học', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  PENDING_PAYMENT: {
    label: 'Chờ thanh toán',
    className: 'bg-amber-50 text-amber-700 ring-amber-200',
  },
  COMPLETED: { label: 'Hoàn thành', className: 'bg-blue-50 text-blue-700 ring-blue-200' },
  DROPPED: { label: 'Đã rời lớp', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
  CANCELLED: { label: 'Đã hủy', className: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

export function enrollmentStatusLabel(status: EnrollmentStatus): string {
  return enrollmentStatusPresentation[status].label;
}

export function pricingLabel(pricingType: 'FREE' | 'PAID', tuitionFeeVnd: number | null): string {
  if (pricingType === 'FREE') return 'Miễn phí';
  return tuitionFeeVnd === null ? 'Học phí chưa cập nhật' : vndFormatter.format(tuitionFeeVnd);
}
