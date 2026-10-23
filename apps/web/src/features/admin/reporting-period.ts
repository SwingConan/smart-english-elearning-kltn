export interface ReportPeriodInput {
  from?: string;
  to?: string;
}

export function vietnamToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    numberingSystem: 'latn',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function reportPreset(days: 7 | 30 | 90, now = new Date()): Required<ReportPeriodInput> {
  const to = vietnamToday(now);
  return { from: addDays(to, -(days - 1)), to };
}

export function validateReportPeriod(from: string, to: string): string | null {
  if (!isDate(from) || !isDate(to)) return 'Vui lòng chọn đủ ngày bắt đầu và kết thúc.';
  if (from > to) return 'Ngày bắt đầu không được sau ngày kết thúc.';
  if (dayDistance(from, to) + 1 > 90) return 'Khoảng báo cáo không được vượt quá 90 ngày.';
  return null;
}

function addDays(value: string, amount: number): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function dayDistance(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
