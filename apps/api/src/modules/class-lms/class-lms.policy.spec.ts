import { safeClassResourceUrl, schoolMonthBounds } from './class-lms.policy';
describe('W03A resource links and school-month range', () => {
  it('accepts only external HTTPS links, rejects script/credential/local targets', () => {
    expect(safeClassResourceUrl('https://example.com/english?q=1')).toBe(
      'https://example.com/english?q=1',
    );
    for (const s of [
      'javascript:alert(1)',
      'http://example.com',
      'data:text/html,x',
      'https://user:pass@example.com',
      'https://localhost',
      'https://intranet.local/x',
      'https://127.0.0.1/x',
      'https://[::1]/x',
    ])
      expect(() => safeClassResourceUrl(s)).toThrow();
  });
  it('uses school-zone January start in previous UTC year, with exclusive end', () => {
    const r = schoolMonthBounds('2027-01');
    expect(r.from.toISOString()).toBe('2026-12-31T17:00:00.000Z');
    expect(r.until.toISOString()).toBe('2027-01-31T17:00:00.000Z');
  });
  it('handles leap February with actual Gregorian bounds', () => {
    const r = schoolMonthBounds('2028-02');
    expect((r.until.getTime() - r.from.getTime()) / 86400000).toBe(29);
  });
  it('rejects unbounded/invalid month input', () => {
    for (const s of ['2027-13', '2027-00', '1999-12', '2027-1', '2027-01T00:00Z'])
      expect(() => schoolMonthBounds(s)).toThrow();
  });
});
