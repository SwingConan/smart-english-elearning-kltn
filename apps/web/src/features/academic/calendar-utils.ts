/**
 * GMT+7 (`Asia/Ho_Chi_Minh`) calendar & weekly timetable helpers for Academic UI.
 */

export const WEEKDAY_NAMES_MONDAY_FIRST = [
  'Thứ 2',
  'Thứ 3',
  'Thứ 4',
  'Thứ 5',
  'Thứ 6',
  'Thứ 7',
  'Chủ nhật',
] as const;

export const WEEKDAY_SHORT_MONDAY_FIRST = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] as const;

export interface TimeBand {
  key: 'morning' | 'afternoon' | 'evening';
  label: string;
  rangeLabel: string;
}

export const DAY_TIME_BANDS: readonly TimeBand[] = [
  { key: 'morning', label: 'Ca Sáng', rangeLabel: '07:00 – 12:00' },
  { key: 'afternoon', label: 'Ca Chiều', rangeLabel: '12:00 – 17:30' },
  { key: 'evening', label: 'Ca Tối', rangeLabel: 'Từ 17:30' },
] as const;

/** Resolve an ISO timestamp into `YYYY-MM-DD` in Vietnam timezone (`Asia/Ho_Chi_Minh`). */
export function vnDateKey(iso: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Current calendar date key (`YYYY-MM-DD`) in Vietnam timezone. */
export function vnTodayKey(): string {
  return vnDateKey(new Date().toISOString());
}

/** 24-hour time label (`HH:mm`) in Vietnam timezone. */
export function vnTimeOnly(iso: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

/** Hour + minute (`HH:mm`) directly from an ISO string in GMT+7 for sorting & band grouping. */
export function vnHourMinute(iso: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${parts.hour}:${parts.minute}`;
}

/** Map a `HH:mm` start time string to `morning` / `afternoon` / `evening`. */
export function timeToBand(hhmm: string): TimeBand['key'] {
  const [hStr, mStr] = hhmm.split(':');
  const mins = Number(hStr || 0) * 60 + Number(mStr || 0);
  if (mins < 12 * 60) return 'morning';
  if (mins < 17 * 60 + 30) return 'afternoon';
  return 'evening';
}

/** Shift a `YYYY-MM-DD` key cleanly by `days` using UTC noon arithmetic. */
export function shiftDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0)).toISOString().slice(0, 10);
}

/** Find Monday (`YYYY-MM-DD`) of the ISO week containing `dateKey`. */
export function weekMondayKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const utcDay = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
  const offset = utcDay === 0 ? -6 : 1 - utcDay;
  return shiftDateKey(dateKey, offset);
}

/** Build the 7 `YYYY-MM-DD` keys starting on `mondayKey`. */
export function weekDateKeys(mondayKey: string): string[] {
  return Array.from({ length: 7 }, (_, idx) => shiftDateKey(mondayKey, idx));
}

/** Shift a `YYYY-MM` month key cleanly by `months`. */
export function shiftMonthKey(monthKey: string, months: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + months, 1, 12, 0, 0)).toISOString().slice(0, 7);
}

/** Build Monday-first grid cells (`YYYY-MM-DD | null`) for `YYYY-MM`. */
export function monthGridCells(monthKey: string): (string | null)[] {
  const [y, m] = monthKey.split('-').map(Number);
  const firstDay = new Date(Date.UTC(y, m - 1, 1, 12, 0, 0));
  const lastDay = new Date(Date.UTC(y, m, 0, 12, 0, 0));
  const leadingNulls = firstDay.getUTCDay() === 0 ? 6 : firstDay.getUTCDay() - 1;
  const totalDays = lastDay.getUTCDate();
  const cells: (string | null)[] = Array.from({ length: leadingNulls }, () => null);
  for (let day = 1; day <= totalDays; day += 1) {
    cells.push(`${monthKey}-${String(day).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

/** Format `YYYY-MM-DD` as `DD/MM`. */
export function formatShortVnDate(dateKey: string): string {
  const [, m, d] = dateKey.split('-');
  return `${d}/${m}`;
}

/** Format `YYYY-MM-DD` as `DD/MM/YYYY`. */
export function formatVnDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-');
  return `${d}/${m}/${y}`;
}

/** Format `YYYY-MM` as `Tháng MM/YYYY`. */
export function formatVnMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-');
  return `Tháng ${Number(m)}/${y}`;
}

/** Format `YYYY-MM-DD` as full Vietnamese weekday + date. */
export function formatFullVnDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'UTC',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)));
}

/**
 * Choose the initial week anchor (Monday `YYYY-MM-DD`):
 * - current week if it already has sessions
 * - otherwise week of earliest upcoming session (`>= todayKey`)
 * - otherwise week of latest available session
 * - fallback to today's week
 */
export function pickInitialWeekMonday(dateKeys: string[], todayKey: string): string {
  if (!dateKeys.length) return weekMondayKey(todayKey);
  const currentMonday = weekMondayKey(todayKey);
  const currentSunday = shiftDateKey(currentMonday, 6);
  if (dateKeys.some((k) => k >= currentMonday && k <= currentSunday)) {
    return currentMonday;
  }
  const sorted = [...dateKeys].sort();
  const upcoming = sorted.find((k) => k >= todayKey);
  return weekMondayKey(upcoming ?? sorted[0]);
}
