import { safeSupportText, supportTransition } from './support.policy';
describe('W05A support boundary policy', () => {
  it.each(['password: secret', 'mật khẩu=abc', 'CCCD: 123456789012', '4111 1111 1111 1111'])(
    'rejects sensitive form text %s',
    (x) => expect(() => safeSupportText(x)).toThrow(),
  );
  it('keeps authored text as text without HTML execution or invented sanitization', () =>
    expect(safeSupportText('  <b>Needs course advice</b>  ')).toBe('<b>Needs course advice</b>'));
  it.each([
    ['NEW', 'CLOSED'],
    ['CLOSED', 'IN_PROGRESS'],
    ['WAITING_CUSTOMER', 'TRIAGED'],
  ])('rejects jump %s to%s', (a, b) => expect(() => supportTransition(a, b, false)).toThrow());
  it('permits reasoned closed reopen, never learner triage or resolution', () => {
    expect(() => supportTransition('CLOSED', 'REOPENED', true)).not.toThrow();
    expect(() => supportTransition('NEW', 'IN_PROGRESS', true)).toThrow();
  });
});
