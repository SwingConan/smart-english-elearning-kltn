import { BadRequestException } from '@nestjs/common';
export function safeClassResourceUrl(value: string) {
  try {
    const u = new URL(value),
      h = u.hostname.toLowerCase();
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      !h.includes('.') ||
      h.endsWith('.local') ||
      h.endsWith('.localhost') ||
      h.startsWith('[') ||
      /^\d+(?:\.\d+){3}$/.test(h)
    )
      throw Error();
    return u.href;
  } catch {
    throw new BadRequestException(
      'Use an external HTTPS resource URL without credentials or local address',
    );
  }
}
export function schoolMonthBounds(month: string) {
  if (!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(month))
    throw new BadRequestException('Invalid school month');
  const [year, m] = month.split('-').map(Number);
  return {
    from: new Date(Date.UTC(year, m - 1, 1) - 7 * 3600000),
    until: new Date(Date.UTC(year, m, 1) - 7 * 3600000),
  };
}
