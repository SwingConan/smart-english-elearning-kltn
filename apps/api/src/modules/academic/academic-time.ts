import { BadRequestException } from '@nestjs/common';

const formatters = new Map<string, Intl.DateTimeFormat>();
export function zoneFormatter(zone: string) {
  try {
    if (!formatters.has(zone))
      formatters.set(
        zone,
        new Intl.DateTimeFormat('en-CA', {
          timeZone: zone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }),
      );
    return formatters.get(zone)!;
  } catch {
    throw new BadRequestException('Invalid IANA timezone');
  }
}
export function localMinute(date: Date, zone: string) {
  const p = Object.fromEntries(
    zoneFormatter(zone)
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function resolveLocal(value: string, zone: string, offset?: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new BadRequestException('Expected local YYYY-MM-DDTHH:mm');
  const base = new Date(value + 'Z');
  if (!Number.isFinite(base.getTime()) || base.toISOString().slice(0, 16) !== value)
    throw new BadRequestException('Invalid local date/time');
  zoneFormatter(zone);
  const candidates: { date: Date; offset: string }[] = [];
  // Future school schedules: all contemporary IANA offsets are multiples of 15 minutes.
  for (let minutes = -840; minutes <= 840; minutes += 15) {
    const d = new Date(base.getTime() - minutes * 60000);
    if (localMinute(d, zone) === value)
      candidates.push({
        date: d,
        offset:
          (minutes < 0 ? '-' : '+') +
          String(Math.floor(Math.abs(minutes) / 60)).padStart(2, '0') +
          ':' +
          String(Math.abs(minutes) % 60).padStart(2, '0'),
      });
  }
  const selected = offset ? candidates.filter((c) => c.offset === offset) : candidates;
  if (selected.length !== 1)
    throw new BadRequestException({
      code: 'LOCAL_TIME_UNRESOLVED',
      message: 'Nonexistent or ambiguous local time; choose a valid explicit offset',
      validOffsets: candidates.map((c) => c.offset),
    });
  return selected[0].date;
}
export function dateOnly(value: string) {
  const d = new Date(value + 'T00:00:00Z');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(d.getTime()) ||
    d.toISOString().slice(0, 10) !== value
  )
    throw new BadRequestException('Invalid calendar date');
  return d;
}
