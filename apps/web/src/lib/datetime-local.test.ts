import { describe, expect, it } from 'vitest';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from './datetime-local';

describe('datetime-local conversion', () => {
  it('round-trips an instant in a deterministic UTC+7 browser timezone', () => {
    const offsetMinutes = -7 * 60;
    const instant = '2026-11-01T03:00:45.000Z';
    const localValue = toDateTimeLocalValue(instant, offsetMinutes);

    expect(localValue).toBe('2026-11-01T10:00');
    expect(fromDateTimeLocalValue(localValue, offsetMinutes)).toBe('2026-11-01T03:00:00.000Z');
  });

  it('handles a timezone behind UTC without depending on the CI timezone', () => {
    const offsetMinutes = 5 * 60;
    const instant = '2026-11-01T03:00:00.000Z';

    expect(toDateTimeLocalValue(instant, offsetMinutes)).toBe('2026-10-31T22:00');
    expect(fromDateTimeLocalValue('2026-10-31T22:00', offsetMinutes)).toBe(instant);
  });
});
