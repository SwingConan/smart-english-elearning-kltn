import { createHash } from 'node:crypto';
export type Activity = {
  id: string;
  at: string;
  label: string;
  state: string;
  revision: string;
  resource: string;
};
export type Source = {
  code: string;
  wave: string;
  state: 'AVAILABLE' | 'UNAVAILABLE';
  reason: string | null;
  authority: string | null;
  completeness: 'SOURCE_WINDOW' | 'PARTIAL' | 'UNKNOWN';
  records: Activity[] | null;
};
export const ref = (id: string) => createHash('sha256').update(id).digest('hex').slice(0, 12);
export const unavailable = (code: string, wave: string, reason: string): Source => ({
  code,
  wave,
  state: 'UNAVAILABLE',
  reason,
  authority: null,
  completeness: 'UNKNOWN',
  records: null,
});
export const available = (
  code: string,
  wave: string,
  authority: string,
  records: Activity[],
): Source => ({
  code,
  wave,
  state: 'AVAILABLE',
  reason: null,
  authority,
  completeness: records.length > 200 ? 'PARTIAL' : 'SOURCE_WINDOW',
  records: records.slice(0, 200),
});
