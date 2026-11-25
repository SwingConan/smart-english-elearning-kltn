import { beforeEach, describe, expect, it } from 'vitest';
import { paymentRetry } from './receipt-retry';
describe('Private payment idempotency recovery', () => {
  beforeEach(() => sessionStorage.clear());
  it('preserves exact key across reconstructed components/reload for the same owner and digest', () => {
    const a = paymentRetry('owner', 'a'.repeat(64), sessionStorage);
    const b = paymentRetry('owner', 'a'.repeat(64), sessionStorage);
    expect(b.key).toBe(a.key);
    expect(b.existing).toBe(true);
    expect(sessionStorage.length).toBe(1);
  });
  it('does not pool keys across accounts or changed blob/request fingerprints', () => {
    const a = paymentRetry('owner', 'a'.repeat(64), sessionStorage);
    expect(paymentRetry('foreign', 'a'.repeat(64), sessionStorage).key).not.toBe(a.key);
    expect(paymentRetry('owner', 'b'.repeat(64), sessionStorage).key).not.toBe(a.key);
  });
  it('retains uncertain ACK state until explicitly acknowledged', () => {
    const a = paymentRetry('owner', 'a'.repeat(64), sessionStorage);
    expect(paymentRetry('owner', 'a'.repeat(64), sessionStorage).existing).toBe(true);
    a.acknowledge();
    expect(paymentRetry('owner', 'a'.repeat(64), sessionStorage).existing).toBe(false);
  });
  it('fails before a request when storage is unavailable or poisoned', () => {
    expect(() =>
      paymentRetry('owner', 'a'.repeat(64), {
        getItem: () => null,
        setItem: () => {
          throw Error('quota');
        },
      } as unknown as Storage),
    ).toThrow('RETRY_STORAGE_UNAVAILABLE');
    sessionStorage.setItem('smart-english:payment-retry:owner:' + 'a'.repeat(64), 'invalid');
    expect(() => paymentRetry('owner', 'a'.repeat(64), sessionStorage)).toThrow(
      'INVALID_RETRY_KEY',
    );
  });
  it('rejects missing owner or a raw non-hash signature', () => {
    expect(() => paymentRetry('', 'a'.repeat(64), sessionStorage)).toThrow();
    expect(() => paymentRetry('owner', 'TEST-raw-payment-data', sessionStorage)).toThrow();
  });
});
