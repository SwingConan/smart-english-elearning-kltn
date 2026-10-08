export const classStatusPresentation: Record<string, { label: string; className: string }> = {
  OPEN: { label: 'Đang mở đăng ký', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  IN_PROGRESS: { label: 'Đang học', className: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  COMPLETED: {
    label: 'Đã kết thúc',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  CANCELLED: { label: 'Đã hủy', className: 'border-rose-200 bg-rose-50 text-rose-700' },
  DRAFT: { label: 'Bản nháp', className: 'border-slate-300 bg-white text-slate-600' },
};

export function classStatus(status: string) {
  return (
    classStatusPresentation[status] ?? {
      label: 'Chưa xác định',
      className: 'border-slate-300 bg-white text-slate-600',
    }
  );
}
