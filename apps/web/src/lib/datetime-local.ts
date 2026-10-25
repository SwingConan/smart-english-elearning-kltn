const MINUTE_MS = 60_000;

export function toDateTimeLocalValue(
  iso: string,
  timezoneOffsetMinutes = new Date(iso).getTimezoneOffset(),
): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return '';
  return new Date(instant.getTime() - timezoneOffsetMinutes * MINUTE_MS).toISOString().slice(0, 16);
}

export function fromDateTimeLocalValue(localValue: string, timezoneOffsetMinutes?: number): string {
  if (timezoneOffsetMinutes === undefined) {
    const instant = new Date(localValue);
    if (Number.isNaN(instant.getTime())) throw new Error('Invalid datetime-local value');
    return instant.toISOString();
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localValue);
  if (!match) throw new Error('Invalid datetime-local value');
  const [, year, month, day, hour, minute] = match;
  const wallClockUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
  return new Date(wallClockUtc + timezoneOffsetMinutes * MINUTE_MS).toISOString();
}
