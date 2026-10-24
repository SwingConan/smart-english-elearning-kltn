import { parseTrustedProxies } from './app.setup';

describe('trusted proxy configuration', () => {
  it('disables proxy trust when no allowlist is configured', () => {
    expect(parseTrustedProxies(undefined)).toBe(false);
    expect(parseTrustedProxies('  ')).toBe(false);
  });

  it('accepts explicit proxy IPs, CIDRs, and safe proxy-addr names', () => {
    expect(parseTrustedProxies('loopback, 10.20.0.0/16, 2001:db8::1')).toEqual([
      'loopback',
      '10.20.0.0/16',
      '2001:db8::1',
    ]);
  });

  it.each(['true', '1', '*', '0.0.0.0/0', '::/0', 'proxy.example.com', 'loopback,'])(
    'rejects unsafe or ambiguous proxy trust value %s',
    (value) => {
      expect(() => parseTrustedProxies(value)).toThrow('TRUST_PROXY must be');
    },
  );
});
