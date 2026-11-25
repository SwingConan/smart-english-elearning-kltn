import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import {
  classifySePayTransfer,
  parseSePayTransfer,
  sepayBankIsActive,
  sepayTransferHash,
  verifySePayHmac,
} from './sepay.policy';

describe('SePay authenticated transport and conservative receipt classification', () => {
  it('accepts the observed active representations without treating inactive or unknown as active', () => {
    for (const active of [1, '1']) expect(sepayBankIsActive(active)).toBe(true);
    for (const inactive of [0, '0', true, false, null, undefined, '', 'true', '01', ' 1'])
      expect(sepayBankIsActive(inactive)).toBe(false);
  });
  const secret = 'local-contract-only-key-'.repeat(3),
    now = Date.parse('2026-11-08T01:00:00+07:00'),
    timestamp = String(now / 1000);
  const transfer = {
    id: 101,
    gateway: 'ContractBank',
    transactionDate: '2026-11-08 01:00:00',
    accountNumber: 'TESTONLY01',
    subAccount: '',
    code: 'SEV2ABC',
    content: 'SEV2ABC nội dung gốc',
    transferType: 'in',
    transferAmount: 100000,
    referenceCode: 'CONTRACT-REFERENCE',
    description: '',
  };
  const receiver = {
    accountNumber: transfer.accountNumber,
    gateway: transfer.gateway,
    subAccount: '',
  };
  const signature = (b: Buffer, t = timestamp) =>
    'sha256=' +
    createHmac('sha256', secret)
      .update(t + '.')
      .update(b)
      .digest('hex');
  it('verifies the original UTF-8 bytes including whitespace', () => {
    const raw = Buffer.from(JSON.stringify(transfer, null, 2));
    expect(() => verifySePayHmac(raw, timestamp, signature(raw), secret, now)).not.toThrow();
    expect(() =>
      verifySePayHmac(
        Buffer.from(JSON.stringify(transfer)),
        timestamp,
        signature(raw),
        secret,
        now,
      ),
    ).toThrow(UnauthorizedException);
  });
  it('rejects a tampered amount even when all JSON fields remain valid', () => {
    const raw = Buffer.from(JSON.stringify(transfer)),
      changed = Buffer.from(JSON.stringify({ ...transfer, transferAmount: 1 }));
    expect(() => verifySePayHmac(changed, timestamp, signature(raw), secret, now)).toThrow(
      UnauthorizedException,
    );
  });
  it('rejects stale and future signed replay outside the documented five minutes', () => {
    for (const drift of [-301, 301]) {
      const time = String(Number(timestamp) + drift),
        raw = Buffer.from(JSON.stringify(transfer));
      expect(() => verifySePayHmac(raw, time, signature(raw, time), secret, now)).toThrow(
        UnauthorizedException,
      );
    }
  });
  it('does not accept a missing secret or an API-key-style signature', () => {
    const raw = Buffer.from('{}');
    expect(() => verifySePayHmac(raw, timestamp, 'Apikey test', secret, now)).toThrow(
      UnauthorizedException,
    );
    expect(() => verifySePayHmac(raw, timestamp, signature(raw), '', now)).toThrow(
      UnauthorizedException,
    );
  });
  it.each([0, -1, 1.5, '100000', Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid amount %s',
    (amount) => {
      expect(() =>
        parseSePayTransfer(Buffer.from(JSON.stringify({ ...transfer, transferAmount: amount }))),
      ).toThrow(BadRequestException);
    },
  );
  it('rejects a normalized invalid calendar date', () => {
    expect(() =>
      parseSePayTransfer(
        Buffer.from(JSON.stringify({ ...transfer, transactionDate: '2026-02-30 10:00:00' })),
      ),
    ).toThrow(BadRequestException);
  });
  it.each([null, undefined, ''])('accepts nullish/empty optional provider fields: %s', optional => {
    const raw = Buffer.from(JSON.stringify({ ...transfer, subAccount: optional, description: optional }));
    const original = Buffer.from(raw);
    verifySePayHmac(raw, timestamp, signature(raw), secret, now);
    const parsed = parseSePayTransfer(raw);
    expect(parsed.subAccount).toBe('');
    expect(parsed.description).toBe('');
    expect(raw.equals(original)).toBe(true);
    expect(sepayTransferHash(parsed)).toBe(sepayTransferHash(parseSePayTransfer(Buffer.from(JSON.stringify(transfer)))));
  });
  it.each([0, false, {}, []])('keeps non-string optional values invalid: %s', optional => {
    expect(() => parseSePayTransfer(Buffer.from(JSON.stringify({ ...transfer, subAccount: optional })))).toThrow('SEPAY_INVALID_subAccount');
  });
  it('retains a real virtual account and rejects it for an unconfigured receiver', () => {
    const parsed = parseSePayTransfer(Buffer.from(JSON.stringify({ ...transfer, subAccount: 'SYNTHETIC_VA' })));
    expect(parsed.subAccount).toBe('SYNTHETIC_VA');
    expect(classifySePayTransfer(parsed, receiver, { code: transfer.code, amount: transfer.transferAmount, createdAt: new Date(now - 1000) })).toBe('RECEIVER_MISMATCH');
  });
  it.each([null, undefined, ''])('normalizes an absent provider code without inventing a reference: %s', code => {
    const parsed = parseSePayTransfer(Buffer.from(JSON.stringify({ ...transfer, code })));
    expect(parsed.code).toBeNull();
    expect(classifySePayTransfer(parsed, receiver, { code: transfer.code, amount: transfer.transferAmount, createdAt: new Date(now - 1000) })).toBe('UNMATCHED_CODE');
  });
  it('deduplicates semantic retries with reordered keys and balance enrichment', () => {
    const a = parseSePayTransfer(Buffer.from(JSON.stringify(transfer))),
      b = parseSePayTransfer(
        Buffer.from(
          JSON.stringify({
            accumulated: 999,
            ...Object.fromEntries(Object.entries(transfer).reverse()),
          }),
        ),
      );
    expect(sepayTransferHash(a)).toEqual(sepayTransferHash(b));
    expect(sepayTransferHash({ ...a, transferAmount: 2 })).not.toEqual(sepayTransferHash(a));
  });
  const payload = () => parseSePayTransfer(Buffer.from(JSON.stringify(transfer)));
  const order = { code: transfer.code, amount: 100000, createdAt: new Date(now - 1000) };
  it('never credits outgoing, wrong receiver or missing order codes', () => {
    expect(classifySePayTransfer({ ...payload(), transferType: 'out' }, receiver, order)).toBe(
      'OUTGOING_NOT_CREDITED',
    );
    expect(classifySePayTransfer({ ...payload(), accountNumber: 'OTHER' }, receiver, order)).toBe(
      'RECEIVER_MISMATCH',
    );
    expect(classifySePayTransfer({ ...payload(), code: null }, receiver, order)).toBe(
      'UNMATCHED_CODE',
    );
  });
  it('keeps short/over/exact receipts pending independent reconciliation', () => {
    expect(classifySePayTransfer({ ...payload(), transferAmount: 99999 }, receiver, order)).toBe(
      'UNDERPAYMENT',
    );
    expect(classifySePayTransfer({ ...payload(), transferAmount: 100001 }, receiver, order)).toBe(
      'OVERPAYMENT',
    );
    expect(classifySePayTransfer(payload(), receiver, order)).toBe(
      'EXACT_MATCH_PENDING_RECONCILIATION',
    );
  });
  it('rejects a historical payment matched to a newer order or missing bank reference', () => {
    expect(
      classifySePayTransfer(payload(), receiver, { ...order, createdAt: new Date(now + 1000) }),
    ).toBe('BEFORE_ORDER');
    expect(classifySePayTransfer({ ...payload(), referenceCode: '' }, receiver, order)).toBe(
      'BANK_REFERENCE_MISSING',
    );
  });
});
