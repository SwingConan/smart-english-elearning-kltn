import { describe, expect, it } from 'vitest';
import { formatVietnamReportDate, formatVietnamReportDateTime } from './report-display-format';

describe('report display date formatting', () => {
  it('formats report dates and timestamps deterministically in Vietnam time', () => {
    expect(formatVietnamReportDate('2026-08-31T17:00:00.000Z')).toBe('01/09/2026');
    expect(formatVietnamReportDateTime('2026-08-31T17:02:03.000Z')).toBe('01/09/2026 00:02:03');
  });

  it('returns a safe placeholder for invalid input', () => {
    expect(formatVietnamReportDate('not-a-date')).toBe('—');
    expect(formatVietnamReportDateTime('not-a-date')).toBe('—');
  });
});
