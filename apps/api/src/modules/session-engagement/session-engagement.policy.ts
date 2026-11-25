import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
export function normalizeMeet(raw: string) {
  if (!/^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(raw))
    throw new BadRequestException(
      'Use a manual HTTPS meet.google.com meeting code without credentials or parameters',
    );
  const url = new URL(raw);
  if (url.hostname !== 'meet.google.com' || url.href !== raw)
    throw new BadRequestException('Invalid meeting URL');
  return url.href;
}
export function codeVerifier(windowId: string, epoch: number, code: string) {
  return createHash('sha256')
    .update(windowId + ':' + epoch + ':' + code)
    .digest('hex');
}
// Deterministic policy seam only. Production decisions are independently enforced in PostgreSQL.
export function attendanceStatus(now: number, start: number, end: number) {
  if (now < start || now >= end) return 'CLOSED';
  return now <= start + 600000 ? 'PRESENT' : 'LATE';
}
