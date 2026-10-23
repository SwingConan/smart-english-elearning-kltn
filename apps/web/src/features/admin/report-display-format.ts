const VIETNAM_REPORT_TIME_ZONE = 'Asia/Ho_Chi_Minh';

type ReportDateInput = string | number | Date;

const reportDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: VIETNAM_REPORT_TIME_ZONE,
});

const reportDateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZone: VIETNAM_REPORT_TIME_ZONE,
});

export function formatVietnamReportDate(value: ReportDateInput): string {
  const parts = reportParts(reportDateFormatter, value);
  return parts ? `${parts.day}/${parts.month}/${parts.year}` : '—';
}

export function formatVietnamReportDateTime(value: ReportDateInput): string {
  const parts = reportParts(reportDateTimeFormatter, value);
  return parts
    ? `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`
    : '—';
}

function reportParts(formatter: Intl.DateTimeFormat, value: ReportDateInput) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  ) as Record<Intl.DateTimeFormatPartTypes, string>;
}
