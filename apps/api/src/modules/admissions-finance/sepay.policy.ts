import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export type SePayTransfer = {
  id: number;
  gateway: string;
  transactionDate: string;
  accountNumber: string;
  subAccount: string;
  code: string | null;
  content: string;
  transferType: 'in' | 'out';
  transferAmount: number;
  referenceCode: string;
  description: string;
};
// The LIVE provider returns this flag as either JSON 1 or the string "1".
// Do not use truthiness: "0", true and other strings are not active evidence.
export const sepayBankIsActive = (value: unknown): boolean => value === 1 || value === '1';
export function verifySePayHmac(
  raw: Buffer,
  timestamp: unknown,
  signature: unknown,
  secret: string,
  now = Date.now(),
) {
  if (
    !Buffer.isBuffer(raw) ||
    raw.length === 0 ||
    raw.length > 65536 ||
    typeof timestamp !== 'string' ||
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(Math.floor(now / 1000) - Number(timestamp)) > 300 ||
    typeof signature !== 'string' ||
    !/^sha256=[a-fA-F0-9]{64}$/.test(signature) ||
    secret.length < 32
  )
    throw new UnauthorizedException('SEPAY_SIGNATURE_REQUIRED');
  const expected = createHmac('sha256', secret)
    .update(timestamp + '.')
    .update(raw)
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex')))
    throw new UnauthorizedException('SEPAY_SIGNATURE_REQUIRED');
}
export function parseSePayTransfer(raw: Buffer): SePayTransfer {
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new BadRequestException('SEPAY_INVALID_JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('SEPAY_INVALID_PAYLOAD');
  const text = (key: string, max: number, empty = false) => {
    const v = value[key];
    // Optional provider text fields may be null/absent when not applicable.
    // Normalize only after HMAC verification; required identity fields stay strict.
    if (empty && v == null) return '';
    if (
      typeof v !== 'string' ||
      v.length > max ||
      (!empty && !v.trim()) ||
      [...v].some((c) => c.charCodeAt(0) < 32)
    )
      throw new BadRequestException('SEPAY_INVALID_' + key);
    return v;
  };
  if (
    !Number.isSafeInteger(value.id) ||
    Number(value.id) < 1 ||
    !Number.isSafeInteger(value.transferAmount) ||
    Number(value.transferAmount) < 1 ||
    !['in', 'out'].includes(String(value.transferType))
  )
    throw new BadRequestException('SEPAY_INVALID_TRANSACTION');
  const date = text('transactionDate', 19);
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(date))
    throw new BadRequestException('SEPAY_INVALID_BANK_DATE');
  const parsed = new Date(date.replace(' ', 'T') + '+07:00');
  if (
    !Number.isFinite(parsed.getTime()) ||
    new Date(parsed.getTime() + 7 * 3600000).toISOString().slice(0, 19).replace('T', ' ') !== date
  )
    throw new BadRequestException('SEPAY_INVALID_BANK_DATE');
  return {
    id: Number(value.id),
    gateway: text('gateway', 100),
    transactionDate: date,
    accountNumber: text('accountNumber', 64),
    subAccount: text('subAccount', 64, true),
    code: value.code == null || value.code === '' ? null : text('code', 64, true),
    content: text('content', 4000),
    transferType: value.transferType as 'in' | 'out',
    transferAmount: Number(value.transferAmount),
    referenceCode: text('referenceCode', 200, true),
    description: text('description', 4000, true),
  };
}
export const sepaySha = (raw: Buffer | string) => createHash('sha256').update(raw).digest('hex');
// Stable semantic fingerprint: retry JSON key order/whitespace and balance enrichment
// do not create another bank transaction. Identity/amount/reference changes conflict.
export const sepayTransferHash = (p: SePayTransfer) =>
  sepaySha(
    JSON.stringify({
      id: p.id,
      gateway: p.gateway,
      transactionDate: p.transactionDate,
      accountNumber: p.accountNumber,
      subAccount: p.subAccount,
      code: p.code,
      content: p.content,
      transferType: p.transferType,
      transferAmount: p.transferAmount,
      referenceCode: p.referenceCode,
    }),
  );
export function classifySePayTransfer(
  p: SePayTransfer,
  receiver: {
    accountNumber: string;
    gateway: string;
    subAccount: string;
  },
  order?: { code: string; amount: number; createdAt: Date },
) {
  if (p.transferType !== 'in') return 'OUTGOING_NOT_CREDITED';
  if (
    p.accountNumber !== receiver.accountNumber ||
    p.gateway !== receiver.gateway ||
    p.subAccount !== receiver.subAccount
  )
    return 'RECEIVER_MISMATCH';
  if (!p.code || !order || p.code !== order.code) return 'UNMATCHED_CODE';
  if (!p.referenceCode.trim()) return 'BANK_REFERENCE_MISSING';
  if (
    new Date(p.transactionDate.replace(' ', 'T') + '+07:00').getTime() <
    Math.floor(order.createdAt.getTime() / 1000) * 1000
  )
    return 'BEFORE_ORDER';
  if (p.transferAmount < order.amount) return 'UNDERPAYMENT';
  if (p.transferAmount > order.amount) return 'OVERPAYMENT';
  return 'EXACT_MATCH_PENDING_RECONCILIATION';
}
