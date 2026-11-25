export const MANUAL_MEET_PATTERN = 'https://meet\\.google\\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}';
export const MANUAL_MEET_ERROR = 'Nhập link phòng dạng https://meet.google.com/xxx-xxxx-xxx, không kèm tham số, tài khoản hoặc ký tự thừa.';
export function isManualMeetUrl(value: string): boolean {
  return new RegExp('^' + MANUAL_MEET_PATTERN + '$').test(value);
}
