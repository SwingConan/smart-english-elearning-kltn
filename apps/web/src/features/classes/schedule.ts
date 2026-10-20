export const WEEKDAY_OPTIONS = [
  { value: 1, label: 'T2', longLabel: 'Thứ Hai' },
  { value: 2, label: 'T3', longLabel: 'Thứ Ba' },
  { value: 3, label: 'T4', longLabel: 'Thứ Tư' },
  { value: 4, label: 'T5', longLabel: 'Thứ Năm' },
  { value: 5, label: 'T6', longLabel: 'Thứ Sáu' },
  { value: 6, label: 'T7', longLabel: 'Thứ Bảy' },
  { value: 7, label: 'CN', longLabel: 'Chủ nhật' },
] as const;

export function weekdayLabel(dayOfWeek: number): string {
  return WEEKDAY_OPTIONS.find(({ value }) => value === dayOfWeek)?.label ?? `Ngày ${dayOfWeek}`;
}
