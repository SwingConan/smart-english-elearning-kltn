import { ServiceUnavailableException } from '@nestjs/common';
import { readFileSync, statSync } from 'node:fs';
import { resolve, sep, isAbsolute } from 'node:path';
import { Injectable } from '@nestjs/common';
import { sepayBankIsActive, sepaySha, type SePayTransfer } from './sepay.policy';

export type SePayConfig = {
  version: 1;
  enabled: boolean;
  apiToken: string;
  webhookSecret: string;
  bankAccountId: string;
  accountNumber: string;
  accountHolder: string;
  bankCode: string;
  gateway: string;
  subAccount: string;
  callbackUrl: string;
  operatorVerifiedRecipient: boolean;
};
const unavailable = () => new ServiceUnavailableException('SEPAY_OPERATOR_CONFIGURATION_REQUIRED');
@Injectable()
export class SePayConfiguration {
  // Operator diagnostics contain field names/status only, never bank values or bodies.
  lastTransferCheck: { stage: string; httpStatus?: number; mismatchedFields?: string[] } | null = null;
  async verifyTransfer(c: SePayConfig, p: SePayTransfer) {
    this.lastTransferCheck = { stage: 'REQUESTED' };
    if (!p.referenceCode.trim() || p.transferType !== 'in')
      throw new ServiceUnavailableException('SEPAY_BANK_TRANSACTION_READBACK_REQUIRED');
    const url = new URL('https://userapi.sepay.vn/v2/transactions');
    url.search = new URLSearchParams({
      bank_account_id: c.bankAccountId,
      reference_number: p.referenceCode,
      transfer_type: 'in',
      per_page: '2',
    }).toString();
    try {
      const response = await fetch(url, {
        headers: { Authorization: 'Bearer ' + c.apiToken, Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
      this.lastTransferCheck = { stage: 'HTTP_RESPONSE', httpStatus: response.status };
      if (!response.ok) throw new Error('Provider unavailable');
      const raw = await response.text();
      if (raw.length > 65536) throw new Error('Bounded response required');
      const data = JSON.parse(raw) as {
        status: string;
        data: Record<string, unknown>[];
        meta?: { pagination?: { has_more?: boolean } };
      };
      if (
        data.status !== 'success' ||
        !Array.isArray(data.data) ||
        data.data.length !== 1 ||
        data.meta?.pagination?.has_more === true
      )
        throw new Error('Unique bank transaction required');
      const t = data.data[0];
      const checks = {
        transactionUuid: typeof t.id === 'string' && /^[a-f0-9-]{36}$/i.test(t.id),
        bankAccountId: t.bank_account_id === c.bankAccountId,
        accountNumber: t.account_number === c.accountNumber,
        reference: t.reference_number === p.referenceCode,
        content: t.transaction_content === p.content,
        code: t.code === p.code,
        date: t.transaction_date === p.transactionDate,
        amountIn: t.amount_in === p.transferAmount,
        amountOut: t.amount_out === 0,
        direction: t.transfer_type === 'in',
        gateway: t.bank_brand_name === p.gateway,
        noVirtualAccount: !t.va,
      };
      const mismatchedFields = Object.entries(checks).filter(([,ok]) => !ok).map(([key]) => key);
      this.lastTransferCheck = { stage: mismatchedFields.length ? 'FIELD_MISMATCH' : 'MATCHED', httpStatus: response.status, mismatchedFields };
      if (mismatchedFields.length)
        throw new Error('Bank transaction mismatch');
      return { transactionUuid: t.id as string, responseHash: sepaySha(JSON.stringify(t)) };
    } catch {
      throw new ServiceUnavailableException('SEPAY_BANK_TRANSACTION_READBACK_REQUIRED');
    }
  }
  load(): SePayConfig {
    const file = process.env.SEPAY_CONFIG_FILE;
    if (!file || !isAbsolute(file) || !/\.private\.json$/i.test(file)) throw unavailable();
    const privateRoot = resolve(process.cwd(), '.local-storage');
    if (!resolve(file).startsWith(privateRoot + sep)) throw unavailable();
    try {
      if (statSync(file).size > 16384) throw unavailable();
      const c = JSON.parse(readFileSync(file, 'utf8')) as SePayConfig;
      if (
        c.version !== 1 ||
        c.enabled !== true ||
        c.operatorVerifiedRecipient !== true ||
        typeof c.apiToken !== 'string' ||
        c.apiToken.length < 16 ||
        typeof c.webhookSecret !== 'string' ||
        c.webhookSecret.length < 32 ||
        !/^[a-f0-9-]{36}$/i.test(c.bankAccountId) ||
        !/^[a-zA-Z0-9]{4,64}$/.test(c.accountNumber) ||
        !c.accountHolder?.trim() ||
        !/^[a-zA-Z0-9]{2,20}$/.test(c.bankCode) ||
        !c.gateway?.trim() ||
        typeof c.subAccount !== 'string'
      )
        throw unavailable();
      const url = new URL(c.callbackUrl);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.port ||
        url.search ||
        url.hash ||
        url.hostname === 'localhost' ||
        /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) ||
        url.pathname !== '/api/v2/payments/sepay/webhook'
      )
        throw unavailable();
      return c;
    } catch {
      throw unavailable();
    }
  }
  fingerprint(c: SePayConfig) {
    return sepaySha(
      JSON.stringify([
        c.bankAccountId,
        c.accountNumber,
        c.accountHolder,
        c.bankCode,
        c.gateway,
        c.subAccount,
      ]),
    );
  }
  async verifyRecipient(c: SePayConfig) {
    try {
      const response = await fetch('https://userapi.sepay.vn/v2/bank-accounts/' + c.bankAccountId, {
        headers: { Authorization: 'Bearer ' + c.apiToken, Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw unavailable();
      const raw = await response.text();
      if (raw.length > 65536) throw unavailable();
      const data = JSON.parse(raw) as { status: string; data: Record<string, unknown> };
      const bank = data.data;
      const name = (x: string) => x.normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase();
      if (
        data.status !== 'success' ||
        !bank ||
        bank.id !== c.bankAccountId ||
        !sepayBankIsActive(bank.active) ||
        bank.account_number !== c.accountNumber ||
        typeof bank.account_holder_name !== 'string' ||
        name(bank.account_holder_name) !== name(c.accountHolder) ||
        bank.bank_code !== c.bankCode
      )
        throw unavailable();
      // VA validation is not inferred from the main bank account response.
      if (c.subAccount) throw new ServiceUnavailableException('SEPAY_VA_VERIFICATION_REQUIRED');
      return { fingerprint: this.fingerprint(c), verifiedAt: new Date() };
    } catch {
      throw new ServiceUnavailableException('SEPAY_RECIPIENT_VERIFICATION_UNAVAILABLE');
    }
  }
}
