export const schoolZone = 'Asia/Ho_Chi_Minh';
export function schoolDay(iso: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: schoolZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  return ['year', 'month', 'day'].map((k) => parts.find((p) => p.type === k)!.value).join('-');
}
export const schoolMonth = () => schoolDay(new Date().toISOString()).slice(0, 7);
export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number),
    d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
export function monthCells(month: string) {
  const [y, m] = month.split('-').map(Number),
    start = new Date(Date.UTC(y, m - 1, 1)),
    offset = (start.getUTCDay() + 6) % 7,
    days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, i) => {
    const n = i - offset + 1;
    return n < 1 || n > days ? null : month + '-' + String(n).padStart(2, '0');
  });
}
export const schoolTime = (iso: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    timeZone: schoolZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
