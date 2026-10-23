import { BadRequestException } from '@nestjs/common';
import { addCalendarDays, resolveReportPeriod, vietnamDate } from './admin-reporting-period';

describe('admin reporting period', () => {
  it('defaults to the last 30 Vietnam calendar days, including today', () => {
    expect(resolveReportPeriod({}, new Date('2026-10-23T16:59:59.000Z'))).toMatchObject({
      from: '2026-09-24',
      to: '2026-10-23',
      days: 30,
      start: new Date('2026-09-23T17:00:00.000Z'),
      endExclusive: new Date('2026-10-23T17:00:00.000Z'),
    });
    expect(resolveReportPeriod({}, new Date('2026-10-23T17:00:00.000Z'))).toMatchObject({
      from: '2026-09-25',
      to: '2026-10-24',
    });
  });

  it('accepts inclusive periods of one and ninety days', () => {
    expect(resolveReportPeriod({ from: '2026-01-01', to: '2026-01-01' }).days).toBe(1);
    expect(resolveReportPeriod({ from: '2026-01-01', to: '2026-01-07' }).days).toBe(7);
    expect(resolveReportPeriod({ from: '2026-01-01', to: '2026-01-30' }).days).toBe(30);
    expect(resolveReportPeriod({ from: '2026-01-01', to: '2026-03-31' }).days).toBe(90);
  });

  it.each([
    { from: '2026-01-01' },
    { to: '2026-01-01' },
    { from: '2026-01-02', to: '2026-01-01' },
    { from: '2026-02-30', to: '2026-03-01' },
    { from: '2026-1-01', to: '2026-01-02' },
    { from: '2026-01-01', to: '2026-04-01' },
  ])('rejects an invalid public period: %p', (input) => {
    expect(() => resolveReportPeriod(input)).toThrow(BadRequestException);
    try {
      resolveReportPeriod(input);
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'REPORT_PERIOD_INVALID',
      });
    }
  });

  it('handles leap years and Vietnam date boundaries without server-local assumptions', () => {
    expect(addCalendarDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addCalendarDays('2024-02-29', 1)).toBe('2024-03-01');
    expect(vietnamDate(new Date('2026-01-01T16:59:59.999Z'))).toBe('2026-01-01');
    expect(vietnamDate(new Date('2026-01-01T17:00:00.000Z'))).toBe('2026-01-02');
  });
});
