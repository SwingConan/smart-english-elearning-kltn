import { ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { ClassLmsService } from '../class-lms/class-lms.service';
import type { AuthorityActor } from '../authorization/authorization.service';
import { SePayConfiguration } from './sepay.config';
import { classifySePayTransfer, parseSePayTransfer, sepaySha, sepayTransferHash, verifySePayHmac } from './sepay.policy';

const DATABASE = 'v2_wave01_dev_test_w04b_br136_demo_20261111_42db33';
const OWNER = '5c0adc3b-c075-4f03-8832-563140c983e9';
// Some operator accounts have no SePay company code-recognition pattern.
// Resolve one complete server-shaped reference; independent bank readback still
// compares the ORIGINAL provider payload, including its null code.
export function resolveBankCheckCode(p: { code: string | null; content: string }) {
  if (p.code) return p.code;
  const found = [...p.content.matchAll(/(?:^|[^A-Z0-9])(SEV2[A-F0-9]{20})(?=$|[^A-Z0-9])/g)];
  return found.length === 1 ? found[0][1] : null;
}
type Tx = Prisma.TransactionClient;
type BankOrder = {
  id: string; learner_id: string; payment_code: string; amount_vnd: number;
  bank_account_id: string; account_number: string; account_holder: string;
  bank_code: string; gateway: string; sub_account: string; receiver_fingerprint: string;
  created_at: Date; paid?: boolean;
};

@Injectable()
export class SePayBankCheckService {
  constructor(private readonly db: PrismaService, private readonly lms: ClassLmsService, private readonly config: SePayConfiguration) {}

  isDemoTarget() {
    try {
      const vpsApproved = process.env.VPS_DEPLOY_APPROVED === 'SMART_ENGLISH_VPS_2026';
      const url = new URL(process.env.DATABASE_URL || '');
      const portOk = url.port === '55401' || (vpsApproved && (url.port === '5432' || url.port === ''));
      return process.env.NODE_ENV !== 'production' && url.hostname === '127.0.0.1'
        && portOk && url.username === 'wave01' && url.pathname === '/' + DATABASE;
    } catch { return false; }
  }
  private async target(tx: Tx) {
    if (!this.isDemoTarget()) throw new ServiceUnavailableException('BR136_BANK_CHECK_TARGET_REQUIRED');
    await tx.$queryRaw`SELECT 1 FROM br136_bank_check.assert_target()`;
  }
  private async run<T>(work: (tx: Tx) => Promise<T>) {
    return this.db.$transaction(async tx => {
      await this.target(tx);
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(136202611)`;
      return work(tx);
    }, { maxWait: 5000, timeout: 10000 });
  }
  private async owner(tx: Tx, actor: AuthorityActor) {
    const u = await this.lms.context(tx, actor);
    if (u.id !== OWNER || u.role !== 'STUDENT') throw new ForbiddenException('BANK_CHECK_DESIGNATED_SYNTHETIC_OWNER_REQUIRED');
  }
  private present(row: BankOrder) {
    const qr = new URL('https://vietqr.app/img');
    qr.search = new URLSearchParams({ acc: row.account_number, bank: row.bank_code, amount: String(row.amount_vnd), des: row.payment_code }).toString();
    return {
      id: row.id, obligationId: '', code: row.payment_code, amountVnd: row.amount_vnd,
      state: row.paid ? 'RECEIPT_CONFIRMED' : 'PENDING', qrUrl: row.paid ? null : qr.toString(),
      recipient: { accountNumber: row.account_number, accountHolder: row.account_holder, bankCode: row.bank_code },
      purpose: 'NON_ACADEMIC_BANK_CONNECTION_CHECK', entitlement: 'UNCHANGED',
    };
  }
  async overview(actor: AuthorityActor) {
    const orders = await this.run(async tx => {
      await this.owner(tx, actor);
      return tx.$queryRaw<BankOrder[]>`SELECT o.*,EXISTS(SELECT 1 FROM br136_bank_check.receipts r WHERE r.order_id=o.id) AS paid FROM br136_bank_check.orders o WHERE o.learner_id=${actor.id}::uuid AND NOT EXISTS(SELECT 1 FROM br136_bank_check.cancellations c WHERE c.order_id=o.id) ORDER BY o.created_at`;
    });
    let configuration = 'RECIPIENT_UNVERIFIED';
    try { await this.config.verifyRecipient(this.config.load()); configuration = 'VERIFIED'; } catch { /* fail closed */ }
    return { viewerId: actor.id, configuration, eligibleObligations: [], orders: orders.map(o => this.present(o)),
      sourceReason: 'NON_ACADEMIC_BANK_CONNECTION_CHECK', bankConnectionCheck: true, testAmountVnd: 10000,
      liveBankPaymentVerified: orders.some(o => o.paid), entitlement: 'UNCHANGED', providerReadback: this.config.lastTransferCheck };
  }
  async create(actor: AuthorityActor, key: string) {
    await this.run(tx => this.owner(tx, actor));
    const c = this.config.load();
    await this.config.verifyRecipient(c);
    return this.run(async tx => {
      await this.owner(tx, actor);
      let [row] = await tx.$queryRaw<BankOrder[]>`SELECT o.*,EXISTS(SELECT 1 FROM br136_bank_check.receipts r WHERE r.order_id=o.id) AS paid FROM br136_bank_check.orders o WHERE NOT EXISTS(SELECT 1 FROM br136_bank_check.cancellations c WHERE c.order_id=o.id)`;
      if (!row) {
        const code = 'SEV2' + randomBytes(10).toString('hex').toUpperCase();
        [row] = await tx.$queryRaw<BankOrder[]>`INSERT INTO br136_bank_check.orders(purpose,learner_id,payment_code,amount_vnd,bank_account_id,account_number,account_holder,bank_code,gateway,sub_account,receiver_fingerprint,idempotency_key) VALUES('NON_ACADEMIC_BANK_CONNECTION_CHECK',${actor.id}::uuid,${code},10000,${c.bankAccountId}::uuid,${c.accountNumber},${c.accountHolder},${c.bankCode},${c.gateway},${c.subAccount},${this.config.fingerprint(c)},${key}::uuid) RETURNING *`;
      }
      return this.present(row);
    });
  }
  async detail(actor: AuthorityActor, id: string) {
    const data = await this.overview(actor);
    const order = data.orders.find(o => o.id === id);
    if (!order) throw new NotFoundException();
    return order;
  }
  async webhook(raw: Buffer, time: unknown, signature: unknown) {
    const c = this.config.load();
    verifySePayHmac(raw, time, signature, c.webhookSecret);
    const p = parseSePayTransfer(raw), fingerprint = sepayTransferHash(p);
    const resolvedCode = resolveBankCheckCode(p);
    const state = await this.run(async tx => {
      const [receipt] = await tx.$queryRaw<{ semantic_hash: string }[]>`SELECT semantic_hash FROM br136_bank_check.receipts WHERE bank_account_id=${c.bankAccountId}::uuid AND provider_transaction_id=${p.id}`;
      if (receipt) {
        if (receipt.semantic_hash !== fingerprint) throw new ConflictException('BANK_CHECK_DUPLICATE_CONFLICT');
        return { duplicate: true, order: null };
      }
      const [order] = await tx.$queryRaw<BankOrder[]>`SELECT o.* FROM br136_bank_check.orders o WHERE payment_code=${resolvedCode || ''} AND NOT EXISTS(SELECT 1 FROM br136_bank_check.cancellations c WHERE c.order_id=o.id)`;
      return { duplicate: false, order };
    });
    if (state.duplicate) return { success: true };
    const order = state.order;
    if (!order || order.bank_account_id !== c.bankAccountId || order.receiver_fingerprint !== this.config.fingerprint(c)
      || classifySePayTransfer({ ...p, code: resolvedCode }, { accountNumber: order.account_number, gateway: order.gateway, subAccount: order.sub_account }, { code: order.payment_code, amount: order.amount_vnd, createdAt: order.created_at }) !== 'EXACT_MATCH_PENDING_RECONCILIATION') return { success: true };
    // Actual read-only bank API evidence is mandatory; a signed payload alone cannot settle.
    const verified = await this.config.verifyTransfer(c, p);
    await this.run(async tx => {
      await tx.$executeRaw`INSERT INTO br136_bank_check.receipts(order_id,bank_account_id,provider_transaction_id,provider_transaction_uuid,semantic_hash,raw_hash,provider_response_hash) VALUES(${order.id}::uuid,${c.bankAccountId}::uuid,${p.id},${verified.transactionUuid}::uuid,${fingerprint},${sepaySha(raw)},${verified.responseHash}) ON CONFLICT DO NOTHING`;
      const [receipt] = await tx.$queryRaw<{ semantic_hash: string; order_id: string }[]>`SELECT semantic_hash,order_id FROM br136_bank_check.receipts WHERE bank_account_id=${c.bankAccountId}::uuid AND provider_transaction_id=${p.id}`;
      if (!receipt || receipt.order_id !== order.id || receipt.semantic_hash !== fingerprint) throw new ConflictException('BANK_CHECK_DUPLICATE_CONFLICT');
    });
    return { success: true };
  }
}
