import { BadRequestException } from '@nestjs/common';

export const REPORT_TIME_ZONE = 'Asia/Ho_Chi_Minh';
export const MAX_REPORT_DAYS = 90;
const DAY_MS = 86_400_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface ResolvedReportPeriod {
  from: string;
  to: string;
  days: number;
  timeZone: typeof REPORT_TIME_ZONE;
  start: Date;
  endExclusive: Date;
}

export function resolveReportPeriod(
  input: { from?: string; to?: string },
  now = new Date(),
): ResolvedReportPeriod {
  if (Boolean(input.from) !== Boolean(input.to)) invalidPeriod();

  const to = input.to ?? vietnamDate(now);
  const from = input.from ?? addCalendarDays(to, -29);
  if (!isCalendarDate(from) || !isCalendarDate(to) || from > to) invalidPeriod();

  const days = calendarDayDistance(from, to) + 1;
  if (days > MAX_REPORT_DAYS) invalidPeriod();

  return {
    from,
    to,
    days,
    timeZone: REPORT_TIME_ZONE,
    start: vietnamDayStart(from),
    endExclusive: vietnamDayStart(addCalendarDays(to, 1)),
  };
}

export function vietnamDate(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    numberingSystem: 'latn',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function addCalendarDays(value: string, amount: number): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
}

export function enumerateCalendarDays(from: string, to: string): string[] {
  const output: string[] = [];
  for (let current = from; current <= to; current = addCalendarDays(current, 1)) {
    output.push(current);
  }
  return output;
}

function isCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function vietnamDayStart(value: string): Date {
  return new Date(`${value}T00:00:00+07:00`);
}

function calendarDayDistance(from: string, to: string): number {
  const asUtc = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((asUtc(to) - asUtc(from)) / DAY_MS);
}

function invalidPeriod(): never {
  throw new BadRequestException({
    code: 'REPORT_PERIOD_INVALID',
    message: 'from/to must be valid YYYY-MM-DD dates spanning at most 90 inclusive days',
  });
}
