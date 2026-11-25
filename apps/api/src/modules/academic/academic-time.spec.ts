import { localMinute, resolveLocal } from './academic-time';
describe('Academic local wall time to authoritative UTC', () => {
  it('keeps school-local time independent of process TZ', () => {
    for (const tz of ['UTC', 'America/New_York', 'Asia/Bangkok']) {
      const old = process.env.TZ;
      process.env.TZ = tz;
      try {
        const d = resolveLocal('2027-01-04T18:00', 'Asia/Ho_Chi_Minh');
        expect(d.toISOString()).toBe('2027-01-04T11:00:00.000Z');
        expect(localMinute(d, 'Asia/Ho_Chi_Minh')).toBe('2027-01-04T18:00');
      } finally {
        if (old === undefined) delete process.env.TZ;
        else process.env.TZ = old;
      }
    }
  });
  it('rejects spring DST gap and invalid dates/zones', () => {
    expect(() => resolveLocal('2027-03-14T02:30', 'America/New_York')).toThrow();
    expect(() => resolveLocal('2027-02-30T09:00', 'Asia/Ho_Chi_Minh')).toThrow();
    expect(() => resolveLocal('2027-01-01T09:00', 'Invalid/Zone')).toThrow();
  });
  it('rejects ambiguous fall DST unless correct offset selected', () => {
    expect(() => resolveLocal('2027-11-07T01:30', 'America/New_York')).toThrow();
    expect(resolveLocal('2027-11-07T01:30', 'America/New_York', '-04:00').toISOString()).toBe(
      '2027-11-07T05:30:00.000Z',
    );
    expect(resolveLocal('2027-11-07T01:30', 'America/New_York', '-05:00').toISOString()).toBe(
      '2027-11-07T06:30:00.000Z',
    );
    expect(() => resolveLocal('2027-11-07T01:30', 'America/New_York', '+07:00')).toThrow();
  });
});
