import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ClassLmsService } from '../class-lms/class-lms.service';
import { AuthorizationService, type AuthorityActor } from '../authorization/authorization.service';
import { verifyUnifiedTarget } from '../operations/unified-runtime.guard';
import { SePayConfiguration } from './sepay.config';
import {
  classifySePayTransfer,
  parseSePayTransfer,
  sepaySha,
  sepayTransferHash,
  verifySePayHmac,
} from './sepay.policy';
type Tx = Prisma.TransactionClient;
type Order = {
  id: string;
  obligation_id: string;
  learner_id: string;
  class_id: string;
  payment_code: string;
  amount_vnd: bigint;
  bank_account_id: string;
  account_number: string;
  account_holder: string;
  bank_code: string;
  gateway: string;
  sub_account: string;
  receiver_fingerprint: string;
  created_at: Date;
};
@Injectable()
export class SePayService {
  constructor(
    private readonly db: PrismaService,
    private readonly lms: ClassLmsService,
    private readonly authority: AuthorizationService,
    private readonly config: SePayConfiguration,
  ) {}
  private async target(tx: Tx) {
    const binding = await verifyUnifiedTarget(tx);
    if (binding.oid !== '953322')
      throw new ServiceUnavailableException('SEPAY_INTEGRATED_IDENTITY_REQUIRED');
    await tx.$queryRaw`SELECT 1 FROM sepay_v2.assert_target()`;
  }
  private async run<T>(
    actor: AuthorityActor,
    fn: (tx: Tx, u: { id: string; role: string }) => Promise<T>,
  ) {
    return this.db.$transaction(
      async (tx) => {
        await this.target(tx);
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
        const u = await this.lms.context(tx, actor);
        await tx.$queryRaw`SELECT set_config('sepay_v2.actor',${u.id},true),set_config('sepay_v2.session',${actor.sessionId},true)`;
        return fn(tx, u);
      },
      { maxWait: 10000, timeout: 20000 },
    );
  }
  private async feeSources(tx: Tx, userId: string) {
    // Existing TEST W07 records never become live obligations by toggling provider mode.
    return tx.$queryRaw<{ id: string; classId: string; amountVnd: number; title: string }[]>`
      SELECT f.id,a."classId",f."amountVnd",a."termsTitle" AS title
      FROM public.w07_obligations f JOIN public.w07_applications a ON a.id=f."applicationId"
      JOIN sepay_v2.live_sources s ON s.obligation_id=f.id AND s.consent_version=a."consentVersion"
      JOIN public.w07_academic_decisions d ON d.id=f."decisionId" AND d.kind='APPROVE'
      JOIN public.class_offerings c ON c.id=a."classId"
      JOIN public.course_versions v ON v.id=f."courseVersionId"
      WHERE a."learnerId"=${userId}::uuid AND a.state='APPROVED' AND a."pricingType"='PAID'
        AND a."consentVersion" !~* '(TEST|SYNTHETIC)' AND f.currency='VND'
        AND f."amountVnd">0 AND f."amountVnd"=a."amountVnd"
        AND c."versionId"=f."courseVersionId" AND c."approvedPricingType"='PAID'
        AND c."approvedTuitionFeeVnd"=f."amountVnd" AND c."termsApprovedAt"=a."termsApprovedAt"
        AND public.w07_price(c.id) AND public.w07_open(c.id)
        AND d."reviewerId"<>a."learnerId"
        AND NOT EXISTS(SELECT 1 FROM public.w07_academic_decisions n WHERE n."applicationId"=a.id AND n.number>d.number)
        AND NOT EXISTS(SELECT 1 FROM public.w07_payment_events p WHERE p."obligationId"=f.id)
        AND NOT EXISTS(SELECT 1 FROM public.enrollments en WHERE en."learnerId"=a."learnerId" AND en."classOfferingId"=a."classId" AND en.status='ACTIVE')
      ORDER BY f."createdAt",f.id`;
  }
  async overview(actor: AuthorityActor) {
    await this.run(actor, async (_tx, u) => {
      if (!['STUDENT', 'CASHIER', 'SYSTEM_ADMIN'].includes(u.role)) throw new ForbiddenException();
    });
    let configuration: 'MISSING' | 'RECIPIENT_UNVERIFIED' | 'VERIFIED' = 'MISSING';
    try {
      const c = this.config.load();
      configuration = 'RECIPIENT_UNVERIFIED';
      await this.config.verifyRecipient(c);
      configuration = 'VERIFIED';
    } catch {
      /* no secret or provider body in product responses */
    }
    return this.run(actor, async (tx, u) => {
      if (!['STUDENT', 'CASHIER', 'SYSTEM_ADMIN'].includes(u.role)) throw new ForbiddenException();
      const sources = u.role === 'STUDENT' ? await this.feeSources(tx, u.id) : [];
      const rows =
        u.role === 'STUDENT'
          ? await tx.$queryRaw<
              Order[]
            >`SELECT * FROM sepay_v2.orders WHERE learner_id=${u.id}::uuid ORDER BY created_at DESC LIMIT 100`
          : [];
      const orders = await Promise.all(rows.map((r) => this.present(tx, r)));
      return {
        viewerId: u.id,
        role: u.role,
        configuration,
        eligibleObligations: sources,
        sourceState: sources.length ? 'AVAILABLE' : 'UNAVAILABLE',
        sourceReason: 'APPROVED_LIVE_W07_OBLIGATION_REQUIRED',
        orders,
        liveBankPaymentVerified: orders.some((order) => order.state === 'RECEIPT_CONFIRMED'),
        entitlement: 'UNCHANGED',
        manualRoute: '/admissions',
      };
    });
  }
  async create(
    actor: AuthorityActor,
    body: { obligationId: string; key: string; consentVersion: string },
  ) {
    if (body.consentVersion !== 'W07_SEPAY_PAYMENT_V1')
      throw new BadRequestException('SEPAY_PAYMENT_CONSENT_REQUIRED');
    // No network call / QR before proving that the principal owns a real eligible source.
    await this.run(actor, async (tx, u) => {
      if (u.role !== 'STUDENT') throw new ForbiddenException();
      if (!(await this.feeSources(tx, u.id)).some((x) => x.id === body.obligationId))
        throw new ConflictException('APPROVED_LIVE_W07_OBLIGATION_REQUIRED');
    });
    const cfg = this.config.load(),
      verified = await this.config.verifyRecipient(cfg);
    return this.run(actor, async (tx, u) => {
      if (u.role !== 'STUDENT') throw new ForbiddenException();
      const source = (await this.feeSources(tx, u.id)).find((x) => x.id === body.obligationId);
      if (!source) throw new ConflictException('APPROVED_LIVE_W07_OBLIGATION_REQUIRED');
      const existing = await tx.$queryRaw<
        Order[]
      >`SELECT * FROM sepay_v2.orders WHERE learner_id=${u.id}::uuid AND (obligation_id=${body.obligationId}::uuid OR idempotency_key=${body.key}::uuid)`;
      if (existing.length) {
        if (existing.length !== 1) throw new ConflictException('SEPAY_KEY_REUSED');
        if (existing[0].obligation_id !== body.obligationId)
          throw new ConflictException('SEPAY_KEY_REUSED');
        return this.present(tx, existing[0]);
      }
      const code = 'SEV2' + randomBytes(10).toString('hex').toUpperCase();
      const [order] = await tx.$queryRaw<
        Order[]
      >`INSERT INTO sepay_v2.orders(obligation_id,learner_id,class_id,payment_code,amount_vnd,bank_account_id,account_number,account_holder,bank_code,gateway,sub_account,receiver_fingerprint,consent_version,idempotency_key) VALUES(${source.id}::uuid,${u.id}::uuid,${source.classId}::uuid,${code},${source.amountVnd},${cfg.bankAccountId}::uuid,${cfg.accountNumber},${cfg.accountHolder},${cfg.bankCode},${cfg.gateway},${cfg.subAccount},${verified.fingerprint},${body.consentVersion},${body.key}::uuid) RETURNING *`;
      return this.present(tx, order);
    });
  }
  private async present(tx: Tx, order: Order) {
    const events = await tx.$queryRaw<
      { classification: string; decision: string | null; provider_verified: boolean }[]
    >`SELECT i.classification,r.decision,(p.id IS NOT NULL) AS provider_verified FROM sepay_v2.inbox i LEFT JOIN sepay_v2.reconciliations r ON r.inbox_id=i.id LEFT JOIN sepay_v2.provider_checks p ON p.inbox_id=i.id WHERE i.order_id=${order.id}::uuid ORDER BY i.received_at`;
    const issues = await tx.$queryRaw<
      { id: string }[]
    >`SELECT e.id FROM sepay_v2.exceptions e JOIN sepay_v2.inbox i ON i.id=e.inbox_id WHERE i.order_id=${order.id}::uuid LIMIT 1`;
    const paid =
      !issues.length &&
      events.length === 1 &&
      events[0].provider_verified &&
      events[0].classification === 'EXACT_MATCH_PENDING_RECONCILIATION' &&
      events[0].decision === 'CONFIRM_RECEIPT';
    const state = paid ? 'RECEIPT_CONFIRMED' : events.length ? 'NEEDS_RECONCILIATION' : 'PENDING';
    const qr = new URL('https://vietqr.app/img');
    qr.search = new URLSearchParams({
      acc: order.account_number,
      bank: order.bank_code,
      amount: String(order.amount_vnd),
      des: order.payment_code,
    }).toString();
    return {
      id: order.id,
      obligationId: order.obligation_id,
      code: order.payment_code,
      amountVnd: Number(order.amount_vnd),
      state,
      recipient: {
        accountNumber: order.account_number,
        accountHolder: order.account_holder,
        bankCode: order.bank_code,
      },
      qrUrl: state === 'PENDING' ? qr.href : null,
      createdAt: order.created_at,
      entitlement: 'UNCHANGED',
    };
  }
  async detail(actor: AuthorityActor, id: string) {
    return this.run(actor, async (tx, u) => {
      const [order] = await tx.$queryRaw<
        Order[]
      >`SELECT * FROM sepay_v2.orders WHERE id=${id}::uuid`;
      if (!order) throw new NotFoundException();
      if (
        u.role === 'STUDENT'
          ? order.learner_id !== u.id
          : u.role !== 'CASHIER' ||
            !(await this.authority.permits(
              u.id,
              'finance.verify',
              { type: 'CLASS', id: order.class_id },
              tx,
            ))
      )
        throw new NotFoundException();
      return this.present(tx, order);
    });
  }
  async webhook(raw: Buffer, timestamp: unknown, signature: unknown) {
    await this.db.$transaction((tx) => this.target(tx));
    const cfg = this.config.load();
    verifySePayHmac(raw, timestamp, signature, cfg.webhookSecret);
    const payload = parseSePayTransfer(raw),
      fingerprint = sepayTransferHash(payload);
    await this.config.verifyRecipient(cfg);
    await this.db.$transaction(
      async (tx) => {
        await this.target(tx);
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
        const [old] = await tx.$queryRaw<
          { id: string; payload_hash: string }[]
        >`SELECT id,payload_hash FROM sepay_v2.inbox WHERE bank_account_id=${cfg.bankAccountId}::uuid AND transaction_id=${payload.id}::bigint`;
        if (old) {
          if (old.payload_hash !== fingerprint)
            await tx.$executeRaw`INSERT INTO sepay_v2.exceptions(inbox_id,kind,incoming_hash) VALUES(${old.id}::uuid,'TRANSACTION_ID_CONFLICT',${fingerprint}) ON CONFLICT DO NOTHING`;
          return;
        }
        const [order] = payload.code
          ? await tx.$queryRaw<
              Order[]
            >`SELECT * FROM sepay_v2.orders WHERE payment_code=${payload.code} AND bank_account_id=${cfg.bankAccountId}::uuid`
          : [];
        let classification = classifySePayTransfer(
          payload,
          cfg,
          order
            ? {
                code: order.payment_code,
                amount: Number(order.amount_vnd),
                createdAt: order.created_at,
              }
            : undefined,
        );
        if (order && order.receiver_fingerprint !== this.config.fingerprint(cfg))
          classification = 'RECIPIENT_CONFIGURATION_CHANGED';
        if (
          order &&
          (
            await tx.$queryRaw<
              { id: string }[]
            >`SELECT id FROM sepay_v2.inbox WHERE order_id=${order.id}::uuid LIMIT 1`
          ).length
        )
          classification = 'ADDITIONAL_TRANSFER_REQUIRES_RECONCILIATION';
        // Wrong-recipient transactions are never exposed under a class inferred from the code.
        const scoped =
          order &&
          !['RECEIVER_MISMATCH', 'RECIPIENT_CONFIGURATION_CHANGED'].includes(classification);
        const [inbox] = await tx.$queryRaw<
          { id: string }[]
        >`INSERT INTO sepay_v2.inbox(bank_account_id,transaction_id,payload_hash,raw_hash,payload,order_id,class_id,classification) VALUES(${cfg.bankAccountId}::uuid,${payload.id}::bigint,${fingerprint},${sepaySha(raw)},${JSON.stringify(payload)}::jsonb,${scoped ? order.id : null}::uuid,${scoped ? order.class_id : null}::uuid,${classification}) RETURNING id`;
        if (classification !== 'EXACT_MATCH_PENDING_RECONCILIATION')
          await tx.$executeRaw`INSERT INTO sepay_v2.exceptions(inbox_id,kind) VALUES(${inbox.id}::uuid,${classification})`;
      },
      { maxWait: 10000, timeout: 15000 },
    );
    return { success: true };
  }
  async cashier(actor: AuthorityActor) {
    return this.run(actor, async (tx, u) => {
      if (u.role !== 'CASHIER') throw new ForbiddenException();
      const grants = await tx.$queryRaw<
        { scopeId: string }[]
      >`SELECT DISTINCT "scopeId" FROM permission_grants WHERE "userId"=${u.id}::uuid AND capability='finance.verify' AND "scopeType"='CLASS' AND "approvedBy" IS NOT NULL AND "approvedAt"<=timezone('UTC',clock_timestamp()) AND "effectiveAt"<=timezone('UTC',clock_timestamp()) AND "expiresAt">timezone('UTC',clock_timestamp()) AND "revokedAt" IS NULL`;
      const classes = [];
      for (const g of grants)
        if (
          await this.authority.permits(u.id, 'finance.verify', { type: 'CLASS', id: g.scopeId }, tx)
        )
          classes.push(g.scopeId);
      if (!classes.length)
        return {
          scope: 'UNAVAILABLE',
          reason: 'CURRENT_CLASS_FINANCE_VERIFY_REQUIRED',
          records: null,
          unmatched: 'BANK_ACCOUNT_SCOPE_NOT_APPROVED',
        };
      const rows = await tx.$queryRaw<
        {
          id: string;
          classification: string;
          received_at: Date;
          order_id: string;
          transaction_id: bigint;
          decision: string | null;
        }[]
      >(
        Prisma.sql`SELECT i.id,i.classification,i.received_at,i.order_id,i.transaction_id,r.decision FROM sepay_v2.inbox i LEFT JOIN sepay_v2.reconciliations r ON r.inbox_id=i.id WHERE i.class_id IN (${Prisma.join(classes.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY i.received_at DESC LIMIT 100`,
      );
      return {
        scope: 'AVAILABLE',
        reason: null,
        records: rows.map((x) => ({ ...x, transaction_id: String(x.transaction_id) })),
        unmatched: 'BANK_ACCOUNT_SCOPE_NOT_APPROVED',
      };
    });
  }
  async reconcile(
    actor: AuthorityActor,
    id: string,
    b: { decision: 'CONFIRM_RECEIPT' | 'HOLD'; reason: string },
  ) {
    return this.run(actor, async (tx, u) => {
      const [row] = await tx.$queryRaw<
        {
          id: string;
          class_id: string;
          order_id: string;
          classification: string;
          learner_id: string;
          academic_actor: string;
          payload: unknown;
          receiver_fingerprint: string;
        }[]
      >`SELECT i.id,i.class_id,i.order_id,i.classification,i.payload,o.learner_id,o.receiver_fingerprint,s.academic_actor FROM sepay_v2.inbox i JOIN sepay_v2.orders o ON o.id=i.order_id JOIN sepay_v2.live_sources s ON s.obligation_id=o.obligation_id WHERE i.id=${id}::uuid`;
      if (
        !row ||
        u.role !== 'CASHIER' ||
        u.id === row.learner_id ||
        u.id === row.academic_actor ||
        !(await this.authority.permits(
          u.id,
          'finance.verify',
          { type: 'CLASS', id: row.class_id },
          tx,
        ))
      )
        throw new NotFoundException();
      if (b.decision === 'CONFIRM_RECEIPT') {
        const issues = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM sepay_v2.exceptions WHERE inbox_id=${id}::uuid UNION ALL SELECT id FROM sepay_v2.inbox WHERE order_id=${row.order_id}::uuid AND id<>${id}::uuid`;
        if (row.classification !== 'EXACT_MATCH_PENDING_RECONCILIATION' || issues.length)
          throw new ConflictException('SEPAY_EXCEPTION_CANNOT_AUTO_SETTLE');
      }
      const [grant] = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM permission_grants WHERE "userId"=${u.id}::uuid AND capability='finance.verify' AND "scopeType"='CLASS' AND "scopeId"=${row.class_id} AND "approvedBy" IS NOT NULL AND "approvedAt"<=timezone('UTC',clock_timestamp()) AND "effectiveAt"<=timezone('UTC',clock_timestamp()) AND "expiresAt">timezone('UTC',clock_timestamp()) AND "revokedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 1`;
      if (!grant) throw new NotFoundException();
      const previous = await tx.$queryRaw<
        { decision: string; reason: string }[]
      >`SELECT decision,reason FROM sepay_v2.reconciliations WHERE inbox_id=${id}::uuid`;
      if (previous.length) {
        if (previous[0].decision !== b.decision || previous[0].reason !== b.reason)
          throw new ConflictException('SEPAY_RECONCILIATION_IMMUTABLE');
        return { state: 'RECORDED', entitlement: 'UNCHANGED' };
      }
      if (b.decision === 'CONFIRM_RECEIPT') {
        const configuration = this.config.load();
        if (this.config.fingerprint(configuration) !== row.receiver_fingerprint)
          throw new ConflictException('SEPAY_RECIPIENT_CHANGED');
        const payload = parseSePayTransfer(Buffer.from(JSON.stringify(row.payload)));
        const proof = await this.config.verifyTransfer(configuration, payload);
        await tx.$executeRaw`INSERT INTO sepay_v2.provider_checks(inbox_id,bank_account_id,transaction_uuid,actor_id,response_hash) VALUES(${id}::uuid,${configuration.bankAccountId}::uuid,${proof.transactionUuid}::uuid,${u.id}::uuid,${proof.responseHash})`;
      }
      await tx.$executeRaw`INSERT INTO sepay_v2.reconciliations(inbox_id,actor_id,grant_id,decision,reason) VALUES(${id}::uuid,${u.id}::uuid,${grant.id}::uuid,${b.decision},${b.reason})`;
      return { state: 'RECORDED', entitlement: 'UNCHANGED' };
    });
  }
  async contractCheck(
    actor: AuthorityActor,
    raw: Buffer,
    timestamp: unknown,
    signature: unknown,
    runId: string,
  ) {
    const secret = process.env.SEPAY_CONTRACT_SECRET;
    if (
      process.env.SEPAY_CONTRACT_CHECKS !== 'DEV_ONLY' ||
      !secret ||
      !/^[a-f0-9-]{36}$/i.test(runId)
    )
      throw new NotFoundException();
    verifySePayHmac(raw, timestamp, signature, secret);
    const p = parseSePayTransfer(raw),
      hash = sepayTransferHash(p);
    return this.run(actor, async (tx, u) => {
      if (
        u.role !== 'SYSTEM_ADMIN' ||
        !(await this.authority.permits(u.id, 'accounts.manage', { type: 'GLOBAL' }, tx))
      )
        throw new ForbiddenException();
      const [old] = await tx.$queryRaw<
        { payload_hash: string }[]
      >`SELECT payload_hash FROM sepay_v2.contract_checks WHERE run_id=${runId}::uuid AND transaction_id=${p.id}::bigint`;
      if (old && old.payload_hash !== hash) throw new ConflictException('SEPAY_TEST_ID_CONFLICT');
      if (!old)
        await tx.$executeRaw`INSERT INTO sepay_v2.contract_checks(run_id,transaction_id,payload_hash,actor_id) VALUES(${runId}::uuid,${p.id}::bigint,${hash},${u.id}::uuid)`;
      return {
        success: true,
        duplicate: !!old,
        origin: 'LOCAL_CONTRACT_CHECK_ONLY',
        bankTransaction: false,
      };
    });
  }
}
