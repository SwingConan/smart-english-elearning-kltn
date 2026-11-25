import { normalizeMeet, codeVerifier, attendanceStatus } from './session-engagement.policy';
import { BUSINESS_ROLES, eligible, inherent } from '../authorization/permission.policy';
describe('DEC047 W06 policy seams', () => {
  it('normalizes only exact manual Meet URL', () =>
    expect(normalizeMeet('https://meet.google.com/abc-defg-hij')).toBe(
      'https://meet.google.com/abc-defg-hij',
    ));
  it.each([
    'http://meet.google.com/abc-defg-hij',
    'https://meet.google.com.evil.invalid/abc-defg-hij',
    'https://meet.google.com@evil.invalid/abc-defg-hij',
    'https://user@meet.google.com/abc-defg-hij',
    'https://MEET.google.com/abc-defg-hij',
    'https://meet.google.com/abc-defg-hij?token=secret',
    'https://meet.google.com/%61bc-defg-hij',
    'javascript:alert(1)',
    'https://meet.google.com/abc-defg-hij#secret',
    ' https://meet.google.com/abc-defg-hij',
    'https://meet.google.com:443/abc-defg-hij',
  ])('rejects unsafe URL %s', (s) => expect(() => normalizeMeet(s)).toThrow());
  it('binds verifier to window, epoch and exact code', () => {
    const x = codeVerifier('window', 1, 'CODE');
    expect(x).toMatch(/^[a-f0-9]{64}$/);
    expect(x).not.toBe(codeVerifier('foreign', 1, 'CODE'));
    expect(x).not.toBe(codeVerifier('window', 2, 'CODE'));
    expect(x).not.toBe(codeVerifier('window', 1, 'code'));
  });
  it.each([
    [-1, 'CLOSED'],
    [0, 'PRESENT'],
    [599999, 'PRESENT'],
    [600000, 'PRESENT'],
    [600001, 'LATE'],
    [1199999, 'LATE'],
    [1200000, 'CLOSED'],
    [1200001, 'CLOSED'],
  ])('deterministic ms seam %s: %s', (n, status) =>
    expect(attendanceStatus(Number(n), 0, 1200000)).toBe(status),
  );
  it.each(BUSINESS_ROLES)('%s never inherits academic approval', (role) => {
    for (const cap of ['academic.meeting.approve', 'academic.attendance.approve']) {
      expect(eligible(role, cap)).toBe(role === 'ACADEMIC_MANAGER');
      expect(inherent(role, cap)).toBe(false);
    }
  });
});
