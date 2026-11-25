import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  ClassOfferingStatus,
  EnrollmentStatus,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthorizationService } from '../authorization/authorization.service';
import {
  SePayConfiguration,
  type SePayConfig,
} from '../admissions-finance/sepay.config';
import {
  parseSePayTransfer,
  sepaySha,
  sepayTransferHash,
  verifySePayHmac,
  type SePayTransfer,
} from '../admissions-finance/sepay.policy';
import {
  SEAT_HOLD_MS,
  TUITION_PAYMENT_CODE_REGEX,
  countOccupiedSeats,
  enableUnifiedEnrollmentTriggerBypass,
  releaseExpiredSeatHolds,
} from './tuition-seat-hold';

type Tx = Prisma.TransactionClient;
type TuitionTransferPayload = Omit<SePayTransfer, 'id'> & { id: string | number };

export type CashierResolutionDecision =
  | 'CONFIRM_MATCH_AND_ACTIVATE'
  | 'MARK_PARTIAL_KEEP_PENDING'
  | 'MARK_REFUND_NEEDED'
  | 'REJECT_UNMATCHED';

export interface ReconcileTransferInput {
  rawBody: Buffer;
  signatureHeader?: string;
  timestampHeader?: string;
  mode: 'LIVE_WEBHOOK' | 'DEV_TEST_HARNESS';
  harnessActorUserId?: string;
}

@Injectable()
export class TuitionPaymentService {
  private readonly sepayConfigHelper = new SePayConfiguration();
  private readonly lastBankSyncByLearner = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly authority: AuthorizationService,
  ) {}

  loadSePayConfigSafe(): SePayConfig | null {
    try {
      return this.sepayConfigHelper.load();
    } catch {
      return null;
    }
  }

  private yyyymmdd(d: Date): string {
    return d.toISOString().slice(0, 10).replace(/-/g, '');
  }

  private generatePaymentCode(): string {
    return `SETU${randomBytes(7).toString('hex').toUpperCase()}`;
  }

  private generateReceivableCode(now: Date): string {
    return `RCV-${this.yyyymmdd(now)}-${randomBytes(3).toString('hex').toUpperCase()}`;
  }

  private generateReceiptNumber(isTestHarness: boolean, now: Date): string {
    const prefix = isTestHarness ? 'PT-TEST-' : 'PT-';
    return `${prefix}${this.yyyymmdd(now)}-${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private buildQrUrl(
    config: SePayConfig | null,
    amountVnd: number,
    paymentCode: string,
  ): string | null {
    if (!config) return null;
    const bank = encodeURIComponent(config.bankCode || config.gateway);
    const acc = encodeURIComponent(config.accountNumber);
    const addInfo = encodeURIComponent(paymentCode);
    const accName = encodeURIComponent(config.accountHolder);
    return `https://img.vietqr.io/image/${bank}-${acc}-compact2.png?amount=${amountVnd}&addInfo=${addInfo}&accountName=${accName}`;
  }

  private async runTx<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842041)`;
            await enableUnifiedEnrollmentTriggerBypass(tx);
            return work(tx);
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 15000,
            timeout: 30000,
          },
        );
      } catch (error) {
        if (error instanceof HttpException) throw error;
        const code = (error as { code?: string } | null)?.code;
        if (code === 'P2034' && attempt < maxAttempts) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException('Could not complete tuition transaction safely; please retry');
  }

  /**
   * Idempotently ensures a PENDING_PAYMENT enrollment has a TuitionReceivable and an active
   * 15-minute TuitionPaymentOrder with bank/VietQR details.
   */
  async createOrResumeCheckoutOrder(
    tx: Tx,
    params: {
      enrollmentId: string;
      learnerId: string;
      classOfferingId: string;
      tuitionFeeVnd: number;
      now: Date;
      expiresAt: Date;
      isTestHarness?: boolean;
      entrySource?: string;
    },
  ) {
    const config = this.loadSePayConfigSafe();
    let receivable = await tx.tuitionReceivable.findUnique({
      where: { enrollmentId: params.enrollmentId },
    });

    if (!receivable) {
      receivable = await tx.tuitionReceivable.create({
        data: {
          enrollmentId: params.enrollmentId,
          learnerId: params.learnerId,
          classOfferingId: params.classOfferingId,
          receivableCode: this.generateReceivableCode(params.now),
          amountVnd: params.tuitionFeeVnd,
          paidAmountVnd: 0,
          currency: 'VND',
          status: 'UNPAID',
          dueAt: params.expiresAt,
          isTestHarness: params.isTestHarness ?? false,
        },
      });
    } else if (
      receivable.status === 'EXPIRED' ||
      receivable.status === 'CANCELLED' ||
      (receivable.paidAmountVnd === 0 &&
        receivable.status !== 'PAID' &&
        receivable.amountVnd !== params.tuitionFeeVnd)
    ) {
      receivable = await tx.tuitionReceivable.update({
        where: { id: receivable.id },
        data: {
          amountVnd:
            receivable.paidAmountVnd === 0 && receivable.status !== 'PAID'
              ? params.tuitionFeeVnd
              : receivable.amountVnd,
          status: receivable.paidAmountVnd > 0 ? 'PARTIAL' : 'UNPAID',
          dueAt: params.expiresAt,
        },
      });
    }

    const expectedAmount = Math.max(receivable.amountVnd - receivable.paidAmountVnd, 0);
    const existingActiveOrder = await tx.tuitionPaymentOrder.findFirst({
      where: {
        enrollmentId: params.enrollmentId,
        status: 'ACTIVE_HOLD',
        expiresAt: { gt: params.now },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (
      existingActiveOrder &&
      existingActiveOrder.expectedAmountVnd === expectedAmount &&
      (!config || Boolean(existingActiveOrder.qrUrl))
    ) {
      return { receivable, order: existingActiveOrder, created: false };
    }

    await tx.tuitionPaymentOrder.updateMany({
      where: {
        enrollmentId: params.enrollmentId,
        status: 'ACTIVE_HOLD',
      },
      data: {
        status: 'EXPIRED',
        releasedAt: params.now,
      },
    });

    const paymentCode = this.generatePaymentCode();
    const order = await tx.tuitionPaymentOrder.create({
      data: {
        receivableId: receivable.id,
        enrollmentId: params.enrollmentId,
        learnerId: params.learnerId,
        classOfferingId: params.classOfferingId,
        paymentCode,
        expectedAmountVnd: expectedAmount,
        currency: 'VND',
        bankCode: config?.bankCode ?? 'MB',
        accountNumber: config?.accountNumber ?? null,
        accountName: config?.accountHolder ?? null,
        qrUrl: this.buildQrUrl(config, expectedAmount, paymentCode),
        status: 'ACTIVE_HOLD',
        expiresAt: params.expiresAt,
        isTestHarness: params.isTestHarness ?? false,
      },
    });

    await tx.tuitionReconciliationAction.create({
      data: {
        receivableId: receivable.id,
        orderId: order.id,
        actorId: params.learnerId,
        action: 'SEAT_HOLD_CREATED',
        previousState: null,
        nextState: 'ACTIVE_HOLD',
        note: `15-minute seat hold created via ${params.entrySource ?? 'DIRECT_CHECKOUT'}.`,
        metadata: {
          paymentCode,
          expectedAmountVnd: expectedAmount,
          expiresAt: params.expiresAt.toISOString(),
        },
      },
    });

    return { receivable, order, created: true };
  }

  async getLearnerFinanceOverview(userId: string) {
    await this.syncPendingOrdersFromBankApi(userId);
    await this.runTx(async (tx) => {
      await releaseExpiredSeatHolds(tx, undefined, new Date());
    });

    const now = new Date();
    const config = this.loadSePayConfigSafe();

    const [receivables, historicalApps] = await Promise.all([
      this.prisma.tuitionReceivable.findMany({
        where: { learnerId: userId },
        orderBy: { createdAt: 'desc' },
        include: {
          enrollment: {
            select: {
              id: true,
              status: true,
              reservedUntil: true,
              seatReleasedAt: true,
              releaseReason: true,
              entrySource: true,
              placementAttemptId: true,
              enrolledAt: true,
            },
          },
          classOffering: {
            select: {
              id: true,
              code: true,
              name: true,
              status: true,
              maxStudents: true,
              tuitionFeeVnd: true,
              approvedTuitionFeeVnd: true,
              course: { select: { id: true, title: true, slug: true, level: true } },
            },
          },
          paymentOrders: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
          receipt: {
            select: {
              id: true,
              receiptNumber: true,
              amountVnd: true,
              currency: true,
              verificationMethod: true,
              isTestHarness: true,
              issuedAt: true,
            },
          },
          transactions: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              providerTransactionId: true,
              amountVnd: true,
              classification: true,
              reconciliationState: true,
              verificationSource: true,
              verifiedBankApi: true,
              isTestHarness: true,
              content: true,
              transactionDate: true,
              resolutionNote: true,
            },
          },
        },
      }),
      this.prisma.w07Application.findMany({
        where: { learnerId: userId },
        orderBy: { createdAt: 'desc' },
        include: {
          class: { select: { id: true, code: true, name: true } },
          w07ObligationApplication: {
            select: {
              id: true,
              amountVnd: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

    const mappedReceivables = receivables.map((rec) => {
      const latestOrder = rec.paymentOrders[0] ?? null;
      const activeOrder =
        rec.paymentOrders.find(
          (o) => o.status === 'ACTIVE_HOLD' && o.expiresAt.getTime() > now.getTime(),
        ) ?? null;
      const remainingSeconds = activeOrder
        ? Math.max(0, Math.floor((activeOrder.expiresAt.getTime() - now.getTime()) / 1000))
        : 0;

      return {
        id: rec.id,
        receivableCode: rec.receivableCode,
        enrollmentId: rec.enrollmentId,
        enrollmentStatus: rec.enrollment.status,
        reservedUntil: rec.enrollment.reservedUntil,
        seatReleasedAt: rec.enrollment.seatReleasedAt,
        releaseReason: rec.enrollment.releaseReason,
        entrySource: rec.enrollment.entrySource,
        placementAttemptId: rec.enrollment.placementAttemptId,
        classOffering: rec.classOffering,
        amountVnd: rec.amountVnd,
        paidAmountVnd: rec.paidAmountVnd,
        remainingVnd: Math.max(0, rec.amountVnd - rec.paidAmountVnd),
        currency: rec.currency,
        status: rec.status,
        dueAt: rec.dueAt,
        paidAt: rec.paidAt,
        isTestHarness: rec.isTestHarness,
        activeOrder: activeOrder
          ? {
              ...activeOrder,
              remainingSeconds,
            }
          : null,
        latestOrder: latestOrder
          ? {
              ...latestOrder,
              remainingSeconds:
                latestOrder.status === 'ACTIVE_HOLD'
                  ? Math.max(
                      0,
                      Math.floor((latestOrder.expiresAt.getTime() - now.getTime()) / 1000),
                    )
                  : 0,
            }
          : null,
        receipt: rec.receipt,
        transactions: rec.transactions,
      };
    });

    return {
      serverTime: now.toISOString(),
      sepay: {
        configured: Boolean(config),
        bankCode: config?.bankCode ?? null,
        gateway: config?.gateway ?? null,
        accountNumberMasked: config
          ? `${'*'.repeat(Math.max(0, config.accountNumber.length - 4))}${config.accountNumber.slice(-4)}`
          : null,
        accountNumber: config?.accountNumber ?? null,
        accountHolder: config?.accountHolder ?? null,
        callbackPath: '/api/v2/payments/sepay/webhook',
      },
      summary: {
        totalReceivables: mappedReceivables.length,
        unpaidOrHeldCount: mappedReceivables.filter(
          (r) => r.status === 'UNPAID' || r.status === 'PARTIAL',
        ).length,
        paidCount: mappedReceivables.filter((r) => r.status === 'PAID').length,
        exceptionCount: mappedReceivables.filter(
          (r) => r.status === 'OVERPAID' || r.status === 'NEEDS_RECONCILIATION',
        ).length,
        expiredCount: mappedReceivables.filter((r) => r.status === 'EXPIRED').length,
      },
      receivables: mappedReceivables,
      historicalLegacyW07: historicalApps.map((app) => ({
        id: app.id,
        classCode: app.class.code,
        className: app.class.name,
        state: app.state,
        amountVnd: app.w07ObligationApplication[0]?.amountVnd ?? app.amountVnd,
        createdAt: app.createdAt,
        historicalOnly: true,
        note: 'Hồ sơ W07 lịch sử (chỉ đọc; không chuyển đổi sang ghi danh mới).',
      })),
    };
  }

  async getOrderForLearner(userId: string, orderId: string) {
    await this.syncPendingOrdersFromBankApi(userId);
    await this.runTx(async (tx) => {
      await releaseExpiredSeatHolds(tx, undefined, new Date());
    });

    const order = await this.prisma.tuitionPaymentOrder.findFirst({
      where: { id: orderId, learnerId: userId },
      include: {
        receivable: {
          include: {
            receipt: true,
          },
        },
        enrollment: true,
        classOffering: {
          select: {
            id: true,
            code: true,
            name: true,
            maxStudents: true,
            status: true,
            course: { select: { title: true, slug: true } },
          },
        },
        transactions: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!order) {
      throw new NotFoundException('Tuition payment order not found');
    }
    const now = new Date();
    return {
      ...order,
      remainingSeconds:
        order.status === 'ACTIVE_HOLD'
          ? Math.max(0, Math.floor((order.expiresAt.getTime() - now.getTime()) / 1000))
          : 0,
    };
  }

  async retryHoldForEnrollment(userId: string, enrollmentId: string) {
    return this.runTx(async (tx) => {
      const now = new Date();
      const enrollment = await tx.enrollment.findFirst({
        where: { id: enrollmentId, learnerId: userId },
        select: {
          id: true,
          learnerId: true,
          classOfferingId: true,
          status: true,
          reservedUntil: true,
          entrySource: true,
          receivable: { select: { id: true, status: true, amountVnd: true } },
        },
      });
      if (!enrollment) {
        throw new NotFoundException('Enrollment not found');
      }
      if (enrollment.status === EnrollmentStatus.ACTIVE) {
        throw new ConflictException('Enrollment is already ACTIVE');
      }

      await tx.$queryRaw`SELECT id FROM class_offerings WHERE id = ${enrollment.classOfferingId}::uuid FOR UPDATE`;
      await releaseExpiredSeatHolds(tx, enrollment.classOfferingId, now);

      const offering = await tx.classOffering.findUnique({
        where: { id: enrollment.classOfferingId },
        include: { course: { select: { isPublished: true, title: true } } },
      });
      if (!offering || offering.status !== ClassOfferingStatus.OPEN || !offering.course.isPublished) {
        throw new ConflictException('Class is no longer open for registration');
      }
      if (offering.enrollmentStart && offering.enrollmentStart > now) {
        throw new ConflictException('Class registration window has not started');
      }
      if (offering.enrollmentEnd && offering.enrollmentEnd < now) {
        throw new ConflictException('Class registration window has ended');
      }

      const freshEnrollment = await tx.enrollment.findUniqueOrThrow({
        where: { id: enrollment.id },
      });

      if (freshEnrollment.status === EnrollmentStatus.CANCELLED) {
        if (offering.maxStudents !== null) {
          const { occupiedCount } = await countOccupiedSeats(tx, offering.id, now, freshEnrollment.id);
          if (occupiedCount >= offering.maxStudents) {
            throw new ConflictException('Class has reached maximum capacity; no seat left to re-hold');
          }
        }
      }

      const expiresAt =
        freshEnrollment.status === EnrollmentStatus.PENDING_PAYMENT &&
        freshEnrollment.reservedUntil &&
        freshEnrollment.reservedUntil > now
          ? freshEnrollment.reservedUntil
          : new Date(now.getTime() + SEAT_HOLD_MS);

      await tx.enrollment.update({
        where: { id: freshEnrollment.id },
        data: {
          status: EnrollmentStatus.PENDING_PAYMENT,
          reservedUntil: expiresAt,
          seatReleasedAt: null,
          releaseReason: null,
        },
      });

      const tuitionFee = offering.approvedTuitionFeeVnd ?? offering.tuitionFeeVnd ?? 0;
      const checkout = await this.createOrResumeCheckoutOrder(tx, {
        enrollmentId: freshEnrollment.id,
        learnerId: userId,
        classOfferingId: offering.id,
        tuitionFeeVnd: tuitionFee,
        now,
        expiresAt,
        entrySource: freshEnrollment.entrySource ?? 'RETRY_HOLD',
      });

      return {
        enrollmentId: freshEnrollment.id,
        status: EnrollmentStatus.PENDING_PAYMENT,
        reservedUntil: expiresAt,
        order: checkout.order,
        receivable: checkout.receivable,
      };
    });
  }

  private extractTuitionCode(transfer: { code: string | null; content: string }): string | null {
    if (transfer.code && TUITION_PAYMENT_CODE_REGEX.test(transfer.code)) {
      const m = transfer.code.match(TUITION_PAYMENT_CODE_REGEX);
      return m ? m[1].toUpperCase() : null;
    }
    const contentMatch = transfer.content.match(TUITION_PAYMENT_CODE_REGEX);
    if (contentMatch) return contentMatch[1].toUpperCase();
    if (transfer.code) return transfer.code.trim().toUpperCase();
    return null;
  }

  /**
   * Read-only bank API fallback sync: checks SePay v2 transactions for any pending ACTIVE_HOLD
   * orders belonging to the learner so real transfers settle immediately even when webhooks miss/lag.
   */
  async syncPendingOrdersFromBankApi(learnerId: string, enrollmentId?: string): Promise<void> {
    const config = this.loadSePayConfigSafe();
    if (!config || !config.enabled || !this.prisma.tuitionPaymentOrder?.findMany) {
      return;
    }

    const pendingOrders = await this.prisma.tuitionPaymentOrder.findMany({
      where: {
        learnerId,
        ...(enrollmentId ? { enrollmentId } : {}),
        status: 'ACTIVE_HOLD',
        isTestHarness: false,
        receivable: { status: { not: 'PAID' } },
      },
      select: { id: true, paymentCode: true, createdAt: true },
    });

    if (pendingOrders.length === 0) {
      return;
    }

    const nowMs = Date.now();
    const lastSync = this.lastBankSyncByLearner.get(learnerId) ?? 0;
    if (nowMs - lastSync < 2000) {
      return;
    }
    this.lastBankSyncByLearner.set(learnerId, nowMs);

    try {
      const url = new URL('https://userapi.sepay.vn/v2/transactions');
      url.search = new URLSearchParams({
        bank_account_id: config.bankAccountId,
        transfer_type: 'in',
        per_page: '10',
      }).toString();

      const response = await fetch(url, {
        headers: { Authorization: 'Bearer ' + config.apiToken, Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return;

      const rawText = await response.text();
      if (rawText.length > 262144) return;

      const payload = JSON.parse(rawText) as {
        status?: unknown;
        data?: Array<Record<string, unknown>>;
      };
      if (payload.status !== 'success' || !Array.isArray(payload.data)) {
        return;
      }

      const orderByCode = new Map(pendingOrders.map((o) => [o.paymentCode.toUpperCase(), o]));

      for (const row of payload.data) {
        if (
          typeof row.id !== 'string' ||
          row.bank_account_id !== config.bankAccountId ||
          row.account_number !== config.accountNumber ||
          row.bank_brand_name !== config.gateway ||
          row.transfer_type !== 'in' ||
          Boolean(row.va)
        ) {
          continue;
        }
        const amountIn = Number(row.amount_in);
        const amountOut = Number(row.amount_out ?? 0);
        if (!Number.isInteger(amountIn) || amountIn <= 0 || amountOut !== 0) {
          continue;
        }
        const content = typeof row.transaction_content === 'string' ? row.transaction_content : '';
        const codeField = typeof row.code === 'string' ? row.code : null;
        const extracted = this.extractTuitionCode({
          code: codeField,
          content,
        });
        if (!extracted) continue;

        const targetOrder = orderByCode.get(extracted);
        if (!targetOrder) continue;

        const txDateStr =
          typeof row.transaction_date === 'string' ? row.transaction_date : '';
        const parsedTxTime = Date.parse(txDateStr.replace(' ', 'T') + '+07:00');
        if (Number.isFinite(parsedTxTime) && parsedTxTime < targetOrder.createdAt.getTime() - 90_000) {
          continue;
        }

        const transfer: TuitionTransferPayload = {
          id: row.id,
          gateway: config.gateway,
          transactionDate: txDateStr,
          accountNumber: config.accountNumber,
          subAccount: typeof row.sub_account === 'string' ? row.sub_account : '',
          code: codeField,
          content,
          transferType: 'in',
          transferAmount: amountIn,
          referenceCode: typeof row.reference_number === 'string' ? row.reference_number : '',
          description: typeof row.description === 'string' ? row.description : content,
        };
        const rawJson = JSON.parse(JSON.stringify(row)) as Prisma.InputJsonValue;
        const rawBuf = Buffer.from(JSON.stringify(row), 'utf8');
        await this.processVerifiedTransferTx({
          config,
          transfer,
          verifiedBankApi: true,
          verificationSource: 'SEPAY_BANK_API_READBACK',
          isTestHarness: false,
          rawHash: sepaySha(rawBuf),
          semanticHash: sepayTransferHash(transfer as SePayTransfer),
          rawJson,
        });
      }
    } catch {
      // Bank readback fallback must never fail caller endpoints; webhook & manual retry remain intact.
    }
  }

  /**
   * Processes incoming SePay transfer webhook or isolated DEV synthetic harness test transfer.
   * Real webhook mode MUST verify HMAC AND verify via SePay bank API readback before settling.
   */
  async reconcileIncomingTransfer(input: ReconcileTransferInput) {
    const isTestHarness = input.mode === 'DEV_TEST_HARNESS';
    if (isTestHarness && process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('DEV_TEST_HARNESS_DISABLED_IN_PRODUCTION');
    }

    const config = this.loadSePayConfigSafe();
    if (!isTestHarness) {
      if (!config) {
        throw new ConflictException('SEPAY_NOT_CONFIGURED_FOR_LIVE_SETTLEMENT');
      }
      verifySePayHmac(
        input.rawBody,
        input.signatureHeader,
        input.timestampHeader,
        config.webhookSecret,
      );
    }

    const transfer = parseSePayTransfer(input.rawBody);

    let verifiedBankApi = false;
    if (!isTestHarness && config) {
      await this.sepayConfigHelper.verifyTransfer(config, transfer);
      verifiedBankApi = true;
    }

    const rawHash = sepaySha(input.rawBody);
    const semanticHash = sepayTransferHash(transfer);
    const rawJson = JSON.parse(input.rawBody.toString('utf8')) as Prisma.InputJsonValue;

    return this.processVerifiedTransferTx({
      config,
      transfer,
      verifiedBankApi,
      verificationSource: isTestHarness
        ? 'DEV_SYNTHETIC_HARNESS'
        : 'SEPAY_WEBHOOK_AND_BANK_API',
      isTestHarness,
      rawHash,
      semanticHash,
      rawJson,
      harnessActorUserId: input.harnessActorUserId,
    });
  }

  private async processVerifiedTransferTx(input: {
    config: SePayConfig | null;
    transfer: TuitionTransferPayload;
    verifiedBankApi: boolean;
    verificationSource: string;
    isTestHarness: boolean;
    rawHash: string;
    semanticHash: string;
    rawJson: Prisma.InputJsonValue;
    harnessActorUserId?: string;
  }) {
    const { config, transfer, verifiedBankApi, verificationSource, isTestHarness, rawHash, semanticHash, rawJson } =
      input;
    const bankAccountId = config?.bankAccountId ?? 'UNCONFIGURED_LOCAL_BANK';
    const providerTxId = String(transfer.id);
    const extractedCode = this.extractTuitionCode(transfer);
    const txDate = new Date(transfer.transactionDate.replace(' ', 'T') + '+07:00');

    return this.runTx(async (tx) => {
      const now = new Date();
      await releaseExpiredSeatHolds(tx, undefined, now);

      let existingTx = await tx.sePayTuitionTransaction.findUnique({
        where: {
          bankAccountId_providerTransactionId: {
            bankAccountId,
            providerTransactionId: providerTxId,
          },
        },
        include: {
          receipt: true,
        },
      });

      if (!existingTx && transfer.referenceCode.trim() && typeof tx.sePayTuitionTransaction.findFirst === 'function') {
        existingTx = await tx.sePayTuitionTransaction.findFirst({
          where: {
            bankAccountId,
            referenceCode: transfer.referenceCode.trim(),
          },
          include: {
            receipt: true,
          },
        });
      }

      if (existingTx) {
        if (existingTx.semanticHash === semanticHash || existingTx.reconciliationState === 'AUTO_SETTLED') {
          return {
            duplicate: true,
            classification: existingTx.classification,
            reconciliationState: existingTx.reconciliationState,
            transactionId: existingTx.id,
            receiptNumber: existingTx.receipt?.receiptNumber ?? null,
            isTestHarness: existingTx.isTestHarness,
          };
        }

        await tx.tuitionReconciliationAction.create({
          data: {
            transactionId: existingTx.id,
            receivableId: existingTx.receivableId,
            orderId: existingTx.orderId,
            actorId: input.harnessActorUserId ?? null,
            action: 'DUPLICATE_TX_PAYLOAD_CONFLICT',
            previousState: existingTx.reconciliationState,
            nextState: existingTx.reconciliationState,
            note: `Duplicate providerTransactionId=${providerTxId} arrived with differing semantic payload.`,
            metadata: { rawHash, semanticHash },
          },
        });

        return {
          duplicate: true,
          payloadConflict: true,
          classification: 'DUPLICATE_TX',
          reconciliationState: existingTx.reconciliationState,
          transactionId: existingTx.id,
          receiptNumber: existingTx.receipt?.receiptNumber ?? null,
          isTestHarness: existingTx.isTestHarness,
        };
      }

      const receiverMatches =
        !config ||
        (transfer.accountNumber === config.accountNumber &&
          transfer.gateway === config.gateway &&
          (transfer.subAccount ?? '') === config.subAccount);

      const matchedOrder = extractedCode
        ? await tx.tuitionPaymentOrder.findUnique({
            where: { paymentCode: extractedCode },
            include: {
              receivable: { include: { receipt: true } },
              enrollment: true,
              classOffering: true,
            },
          })
        : null;

      if (matchedOrder) {
        await tx.$queryRaw`SELECT id FROM class_offerings WHERE id = ${matchedOrder.classOfferingId}::uuid FOR UPDATE`;
        await releaseExpiredSeatHolds(tx, matchedOrder.classOfferingId, now);
      }

      // Reload after possible expiry sweep inside lock
      const order = matchedOrder
        ? await tx.tuitionPaymentOrder.findUniqueOrThrow({
            where: { id: matchedOrder.id },
            include: {
              receivable: { include: { receipt: true } },
              enrollment: true,
              classOffering: true,
            },
          })
        : null;

      let classification = 'EXACT_MATCH';
      let reconciliationState = 'AUTO_SETTLED';

      if (!receiverMatches) {
        classification = 'RECEIVER_MISMATCH';
        reconciliationState = 'PENDING_CASHIER_REVIEW';
      } else if (transfer.transferType !== 'in') {
        classification = 'WRONG_TYPE';
        reconciliationState = 'PENDING_CASHIER_REVIEW';
      } else if (!order) {
        classification = 'UNMATCHED_CODE';
        reconciliationState = 'PENDING_CASHIER_REVIEW';
      } else if (order.receivable.status === 'PAID' || order.receivable.receipt) {
        classification = 'DUPLICATE_TX';
        reconciliationState = 'PENDING_CASHIER_REVIEW';
      } else if (transfer.transferAmount < order.expectedAmountVnd) {
        classification = 'UNDERPAYMENT';
        reconciliationState = 'PENDING_CASHIER_REVIEW';
      } else if (transfer.transferAmount > order.expectedAmountVnd) {
        classification = 'OVERPAYMENT';
        reconciliationState = 'PENDING_CASHIER_REVIEW';
      } else {
        const orderExpired =
          order.status === 'EXPIRED' ||
          order.status === 'CANCELLED' ||
          order.expiresAt <= now ||
          order.enrollment.status === EnrollmentStatus.CANCELLED;

        const maxStudents = order.classOffering.maxStudents;
        const { occupiedCount } = await countOccupiedSeats(
          tx,
          order.classOfferingId,
          now,
          order.enrollmentId,
        );
        const isClassFull = maxStudents !== null && occupiedCount >= maxStudents;

        if (isClassFull) {
          classification = 'CLASS_FULL';
          reconciliationState = 'PENDING_CASHIER_REVIEW';
        } else if (orderExpired) {
          classification = 'EXPIRED_HOLD';
          reconciliationState = 'PENDING_CASHIER_REVIEW';
        }
      }

      const createdTx = await tx.sePayTuitionTransaction.create({
        data: {
          provider: 'SEPAY',
          bankAccountId,
          providerTransactionId: providerTxId,
          orderId: order?.id ?? null,
          receivableId: order?.receivableId ?? null,
          paymentCodeExtracted: extractedCode,
          amountVnd: transfer.transferAmount,
          currency: 'VND',
          transferType: transfer.transferType,
          content: transfer.content,
          referenceCode: transfer.referenceCode || null,
          gateway: transfer.gateway,
          transactionDate: txDate,
          classification,
          reconciliationState,
          verificationSource,
          verifiedBankApi,
          isTestHarness,
          rawHash,
          semanticHash,
          rawPayload: rawJson,
        },
      });

      if (reconciliationState === 'AUTO_SETTLED' && order) {
        const receiptNumber = this.generateReceiptNumber(isTestHarness, now);
        await tx.tuitionPaymentOrder.update({
          where: { id: order.id },
          data: { status: 'PAID', paidAt: now },
        });
        await tx.tuitionReceivable.update({
          where: { id: order.receivableId },
          data: {
            paidAmountVnd: order.receivable.amountVnd,
            status: 'PAID',
            paidAt: now,
            isTestHarness: isTestHarness || order.receivable.isTestHarness,
          },
        });
        await tx.enrollment.update({
          where: { id: order.enrollmentId },
          data: {
            status: EnrollmentStatus.ACTIVE,
            reservedUntil: null,
            seatReleasedAt: null,
            releaseReason: null,
            isTestHarness: isTestHarness || order.enrollment.isTestHarness,
          },
        });
        const receipt = await tx.tuitionReceipt.create({
          data: {
            receiptNumber,
            receivableId: order.receivableId,
            orderId: order.id,
            transactionId: createdTx.id,
            learnerId: order.learnerId,
            classOfferingId: order.classOfferingId,
            amountVnd: transfer.transferAmount,
            currency: 'VND',
            verificationMethod: isTestHarness
              ? 'DEV_SYNTHETIC_TEST_HARNESS'
              : 'SEPAY_AUTO_VERIFIED',
            isTestHarness,
            issuedAt: now,
          },
        });
        await tx.tuitionReconciliationAction.create({
          data: {
            transactionId: createdTx.id,
            receivableId: order.receivableId,
            orderId: order.id,
            actorId: input.harnessActorUserId ?? null,
            action: isTestHarness ? 'DEV_HARNESS_SETTLED' : 'SEPAY_AUTO_SETTLED',
            previousState: order.receivable.status,
            nextState: 'PAID',
            note: `Exact transfer ${transfer.transferAmount} VND reconciled; issued ${receiptNumber} and activated enrollment.`,
            metadata: { isTestHarness, verifiedBankApi },
          },
        });

        return {
          duplicate: false,
          classification,
          reconciliationState,
          transactionId: createdTx.id,
          receivableId: order.receivableId,
          enrollmentId: order.enrollmentId,
          enrollmentStatus: EnrollmentStatus.ACTIVE,
          receiptNumber: receipt.receiptNumber,
          isTestHarness,
        };
      }

      // Exception path -> notify receivable status safely WITHOUT marking PAID or ACTIVE
      if (order) {
        const nextRecStatus =
          classification === 'OVERPAYMENT'
            ? 'OVERPAID'
            : classification === 'UNDERPAYMENT' ||
                classification === 'EXPIRED_HOLD' ||
                classification === 'CLASS_FULL'
              ? 'NEEDS_RECONCILIATION'
              : order.receivable.status;

        if (nextRecStatus !== order.receivable.status && order.receivable.status !== 'PAID') {
          await tx.tuitionReceivable.update({
            where: { id: order.receivableId },
            data: { status: nextRecStatus },
          });
        }
        if (order.status === 'ACTIVE_HOLD' && classification !== 'DUPLICATE_TX') {
          await tx.tuitionPaymentOrder.update({
            where: { id: order.id },
            data: { status: 'EXCEPTION_HOLD' },
          });
        }
      }

      await tx.tuitionReconciliationAction.create({
        data: {
          transactionId: createdTx.id,
          receivableId: order?.receivableId ?? null,
          orderId: order?.id ?? null,
          actorId: input.harnessActorUserId ?? null,
          action: `EXCEPTION_RECORDED_${classification}`,
          previousState: order?.receivable.status ?? null,
          nextState: 'PENDING_CASHIER_REVIEW',
          note: `Queued for cashier review (${classification}): amount=${transfer.transferAmount}, extractedCode=${extractedCode ?? 'NONE'}.`,
          metadata: { isTestHarness, verifiedBankApi },
        },
      });

      return {
        duplicate: false,
        classification,
        reconciliationState,
        transactionId: createdTx.id,
        receivableId: order?.receivableId ?? null,
        enrollmentId: order?.enrollmentId ?? null,
        enrollmentStatus: order?.enrollment.status ?? null,
        receiptNumber: null,
        isTestHarness,
      };
    });
  }

  async getCashierWorkspace(
    actorId: string,
    filter?: { search?: string; state?: string; scope?: 'ALL' | 'REAL' | 'TEST' },
  ) {
    await this.runTx(async (tx) => {
      await releaseExpiredSeatHolds(tx, undefined, new Date());
    });

    const now = new Date();
    const config = this.loadSePayConfigSafe();
    const search = filter?.search?.trim().toLowerCase() ?? '';
    const scope = filter?.scope ?? 'ALL';

    const [
      grants,
      receivables,
      receipts,
      transactions,
      actions,
      legacyApps,
      legacyBankChecks,
    ] = await Promise.all([
      this.prisma.permissionGrant.findMany({
        where: {
          userId: actorId,
          capability: 'finance.verify',
          approvedBy: { not: null },
          approvedAt: { lte: now },
          revokedAt: null,
          effectiveAt: { lte: now },
          expiresAt: { gt: now },
        },
        select: { id: true, scopeType: true, scopeId: true, expiresAt: true },
      }),
      this.prisma.tuitionReceivable.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          learner: { select: { id: true, fullName: true, email: true } },
          classOffering: { select: { id: true, code: true, name: true, maxStudents: true } },
          enrollment: { select: { id: true, status: true, reservedUntil: true, entrySource: true } },
          paymentOrders: { orderBy: { createdAt: 'desc' }, take: 2 },
          receipt: true,
        },
      }),
      this.prisma.tuitionReceipt.findMany({
        orderBy: { issuedAt: 'desc' },
        include: {
          learner: { select: { id: true, fullName: true, email: true } },
          classOffering: { select: { id: true, code: true, name: true } },
          receivable: { select: { id: true, receivableCode: true } },
          transaction: { select: { id: true, providerTransactionId: true, gateway: true, verificationSource: true } },
        },
      }),
      this.prisma.sePayTuitionTransaction.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          order: { select: { id: true, paymentCode: true, expectedAmountVnd: true, status: true, expiresAt: true } },
          receivable: {
            select: {
              id: true,
              receivableCode: true,
              amountVnd: true,
              paidAmountVnd: true,
              status: true,
              learner: { select: { id: true, fullName: true, email: true } },
              classOffering: { select: { id: true, code: true, name: true } },
            },
          },
          receipt: { select: { id: true, receiptNumber: true, isTestHarness: true } },
        },
      }),
      this.prisma.tuitionReconciliationAction.findMany({
        orderBy: { createdAt: 'desc' },
        take: 40,
        include: {
          actor: { select: { id: true, fullName: true, email: true } },
        },
      }),
      this.prisma.w07Application.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          learner: { select: { fullName: true, email: true } },
          class: { select: { code: true, name: true } },
          w07ObligationApplication: { select: { id: true, amountVnd: true } },
        },
      }),
      this.prisma.$queryRaw<
        { id: string; payment_code: string; amount_vnd: number; status: string; created_at: Date }[]
      >`SELECT id::text, payment_code, amount_vnd, status, created_at FROM br136_bank_check.bank_check_orders ORDER BY created_at DESC LIMIT 10`.catch(
        () => [],
      ),
    ]);

    const matchesScope = (isTest: boolean) =>
      scope === 'ALL' || (scope === 'REAL' && !isTest) || (scope === 'TEST' && isTest);

    const filteredReceivables = receivables.filter((r) => {
      if (!matchesScope(r.isTestHarness)) return false;
      if (filter?.state && filter.state !== 'ALL' && r.status !== filter.state) return false;
      if (!search) return true;
      return (
        r.receivableCode.toLowerCase().includes(search) ||
        r.learner.fullName.toLowerCase().includes(search) ||
        r.learner.email.toLowerCase().includes(search) ||
        r.classOffering.code.toLowerCase().includes(search) ||
        r.paymentOrders.some((o) => o.paymentCode.toLowerCase().includes(search))
      );
    });

    const filteredTransactions = transactions.filter((t) => {
      if (!matchesScope(t.isTestHarness)) return false;
      if (!search) return true;
      return (
        t.providerTransactionId.toLowerCase().includes(search) ||
        (t.paymentCodeExtracted ?? '').toLowerCase().includes(search) ||
        t.content.toLowerCase().includes(search) ||
        (t.receivable?.learner.email.toLowerCase().includes(search) ?? false)
      );
    });

    const filteredReceipts = receipts.filter((rc) => {
      if (!matchesScope(rc.isTestHarness)) return false;
      if (!search) return true;
      return (
        rc.receiptNumber.toLowerCase().includes(search) ||
        rc.learner.email.toLowerCase().includes(search) ||
        rc.classOffering.code.toLowerCase().includes(search)
      );
    });

    const realCollectedVnd = receipts
      .filter((r) => !r.isTestHarness)
      .reduce((sum, r) => sum + r.amountVnd, 0);
    const testHarnessCollectedVnd = receipts
      .filter((r) => r.isTestHarness)
      .reduce((sum, r) => sum + r.amountVnd, 0);

    return {
      authority: {
        hasAnyActiveFinanceVerifyGrant: grants.length > 0,
        activeGrantsCount: grants.length,
        grantedClassIds: grants
          .filter((g) => g.scopeType === 'CLASS' && g.scopeId)
          .map((g) => g.scopeId as string),
      },
      sepay: {
        configured: Boolean(config),
        bankCode: config?.bankCode ?? null,
        gateway: config?.gateway ?? null,
        accountNumber: config?.accountNumber ?? null,
        accountHolder: config?.accountHolder ?? null,
      },
      summary: {
        realCollectedVnd,
        testHarnessCollectedVnd,
        totalReceivablesCount: receivables.length,
        unpaidCount: receivables.filter((r) => r.status === 'UNPAID' || r.status === 'PARTIAL').length,
        paidCount: receivables.filter((r) => r.status === 'PAID').length,
        pendingExceptionsCount: transactions.filter(
          (t) => t.reconciliationState === 'PENDING_CASHIER_REVIEW',
        ).length,
        receiptsRealCount: receipts.filter((r) => !r.isTestHarness).length,
        receiptsTestCount: receipts.filter((r) => r.isTestHarness).length,
      },
      receivables: filteredReceivables,
      transactions: filteredTransactions,
      receipts: filteredReceipts,
      reconciliationActions: actions,
      historicalLegacy: {
        w07Applications: legacyApps.map((a) => ({
          id: a.id,
          learnerEmail: a.learner.email,
          learnerName: a.learner.fullName,
          classCode: a.class.code,
          state: a.state,
          amountVnd: a.w07ObligationApplication[0]?.amountVnd ?? a.amountVnd,
          createdAt: a.createdAt,
        })),
        bankCheckOrders: legacyBankChecks,
      },
    };
  }

  private async resolveActiveFinanceGrantId(
    tx: Tx,
    actorId: string,
    classOfferingId?: string | null,
    now: Date = new Date(),
  ): Promise<string | null> {
    if (classOfferingId) {
      const scoped = await tx.permissionGrant.findFirst({
        where: {
          userId: actorId,
          capability: 'finance.verify',
          scopeType: 'CLASS',
          scopeId: classOfferingId,
          approvedBy: { not: null },
          approvedAt: { lte: now },
          revokedAt: null,
          effectiveAt: { lte: now },
          expiresAt: { gt: now },
        },
        select: { id: true },
      });
      return scoped?.id ?? null;
    }

    const anyActive = await tx.permissionGrant.findFirst({
      where: {
        userId: actorId,
        capability: 'finance.verify',
        approvedBy: { not: null },
        approvedAt: { lte: now },
        revokedAt: null,
        effectiveAt: { lte: now },
        expiresAt: { gt: now },
      },
      select: { id: true },
    });
    return anyActive?.id ?? null;
  }

  async resolveCashierException(
    actorId: string,
    txId: string,
    input: {
      decision: CashierResolutionDecision;
      receivableId?: string;
      note: string;
    },
  ) {
    const note = input.note?.trim() ?? '';
    if (note.length < 5) {
      throw new BadRequestException('Cashier resolution note must be at least 5 characters');
    }

    return this.runTx(async (tx) => {
      const now = new Date();
      await releaseExpiredSeatHolds(tx, undefined, now);

      const bankTx = await tx.sePayTuitionTransaction.findUnique({
        where: { id: txId },
        include: { receipt: true },
      });
      if (!bankTx) {
        throw new NotFoundException('SePay tuition transaction not found');
      }
      if (bankTx.reconciliationState !== 'PENDING_CASHIER_REVIEW') {
        throw new ConflictException(
          `Transaction is already in state ${bankTx.reconciliationState}`,
        );
      }

      const targetReceivableId = input.receivableId ?? bankTx.receivableId;

      if (
        input.decision === 'CONFIRM_MATCH_AND_ACTIVATE' ||
        input.decision === 'MARK_PARTIAL_KEEP_PENDING'
      ) {
        if (!targetReceivableId) {
          throw new BadRequestException('Target receivableId is required to match this transaction');
        }
        const receivable = await tx.tuitionReceivable.findUnique({
          where: { id: targetReceivableId },
          include: { enrollment: true, classOffering: true, receipt: true },
        });
        if (!receivable) {
          throw new NotFoundException('Target tuition receivable not found');
        }
        if (receivable.receipt) {
          throw new ConflictException('Receivable already has an issued receipt');
        }

        const permitted = await this.authority.permits(
          actorId,
          'finance.verify',
          { type: 'CLASS', id: receivable.classOfferingId },
          tx,
        );
        const grantId = await this.resolveActiveFinanceGrantId(
          tx,
          actorId,
          receivable.classOfferingId,
          now,
        );
        if (!permitted || !grantId) {
          throw new ForbiddenException({
            code: 'AUTHORITY_DENIED',
            message: 'Active finance.verify authority for this class is required',
          });
        }

        await tx.$queryRaw`SELECT id FROM class_offerings WHERE id = ${receivable.classOfferingId}::uuid FOR UPDATE`;
        await releaseExpiredSeatHolds(tx, receivable.classOfferingId, now);

        const newTotalPaid = receivable.paidAmountVnd + bankTx.amountVnd;

        if (input.decision === 'MARK_PARTIAL_KEEP_PENDING') {
          await tx.sePayTuitionTransaction.update({
            where: { id: bankTx.id },
            data: {
              receivableId: receivable.id,
              reconciliationState: 'RESOLVED_CONFIRMED',
              resolutionNote: note,
              resolvedById: actorId,
              resolvedGrantId: grantId,
              resolvedAt: now,
            },
          });
          await tx.tuitionReceivable.update({
            where: { id: receivable.id },
            data: {
              paidAmountVnd: newTotalPaid,
              status: newTotalPaid >= receivable.amountVnd ? 'NEEDS_RECONCILIATION' : 'PARTIAL',
            },
          });
          await tx.tuitionReconciliationAction.create({
            data: {
              transactionId: bankTx.id,
              receivableId: receivable.id,
              orderId: bankTx.orderId,
              actorId,
              grantId,
              action: 'CASHIER_MARKED_PARTIAL',
              previousState: bankTx.reconciliationState,
              nextState: 'RESOLVED_CONFIRMED',
              note,
              metadata: { paidAmountVnd: newTotalPaid, targetAmountVnd: receivable.amountVnd },
            },
          });
          return {
            transactionId: bankTx.id,
            reconciliationState: 'RESOLVED_CONFIRMED',
            receivableStatus: 'PARTIAL',
            enrollmentStatus: receivable.enrollment.status,
            receiptNumber: null,
          };
        }

        // CONFIRM_MATCH_AND_ACTIVATE: must meet full tuition AND seat capacity
        if (newTotalPaid < receivable.amountVnd) {
          throw new ConflictException(
            `Cannot activate enrollment with partial payment (${newTotalPaid}/${receivable.amountVnd} VND)`,
          );
        }

        const maxStudents = receivable.classOffering.maxStudents;
        const { occupiedCount } = await countOccupiedSeats(
          tx,
          receivable.classOfferingId,
          now,
          receivable.enrollmentId,
        );
        if (maxStudents !== null && occupiedCount >= maxStudents) {
          throw new ConflictException(
            'Class is full (CLASS_FULL_CANNOT_ACTIVATE); resolve via refund instead',
          );
        }

        const receiptNumber = this.generateReceiptNumber(bankTx.isTestHarness, now);

        await tx.sePayTuitionTransaction.update({
          where: { id: bankTx.id },
          data: {
            receivableId: receivable.id,
            reconciliationState: 'RESOLVED_CONFIRMED',
            resolutionNote: note,
            resolvedById: actorId,
            resolvedGrantId: grantId,
            resolvedAt: now,
          },
        });
        await tx.tuitionReceivable.update({
          where: { id: receivable.id },
          data: {
            paidAmountVnd: newTotalPaid,
            status: newTotalPaid > receivable.amountVnd ? 'OVERPAID' : 'PAID',
            paidAt: now,
            isTestHarness: bankTx.isTestHarness || receivable.isTestHarness,
          },
        });
        if (bankTx.orderId) {
          await tx.tuitionPaymentOrder.update({
            where: { id: bankTx.orderId },
            data: { status: 'PAID', paidAt: now },
          });
        }
        await tx.enrollment.update({
          where: { id: receivable.enrollmentId },
          data: {
            status: EnrollmentStatus.ACTIVE,
            reservedUntil: null,
            seatReleasedAt: null,
            releaseReason: null,
            isTestHarness: bankTx.isTestHarness || receivable.enrollment.isTestHarness,
          },
        });
        const receipt = await tx.tuitionReceipt.create({
          data: {
            receiptNumber,
            receivableId: receivable.id,
            orderId: bankTx.orderId,
            transactionId: bankTx.id,
            learnerId: receivable.learnerId,
            classOfferingId: receivable.classOfferingId,
            amountVnd: bankTx.amountVnd,
            currency: 'VND',
            issuedById: actorId,
            verificationMethod: bankTx.isTestHarness
              ? 'DEV_SYNTHETIC_TEST_HARNESS'
              : 'CASHIER_RECONCILED',
            isTestHarness: bankTx.isTestHarness,
            issuedAt: now,
          },
        });
        await tx.tuitionReconciliationAction.create({
          data: {
            transactionId: bankTx.id,
            receivableId: receivable.id,
            orderId: bankTx.orderId,
            actorId,
            grantId,
            action: 'CASHIER_CONFIRMED_AND_ACTIVATED',
            previousState: bankTx.reconciliationState,
            nextState: 'RESOLVED_CONFIRMED',
            note,
            metadata: { receiptNumber, isTestHarness: bankTx.isTestHarness },
          },
        });

        return {
          transactionId: bankTx.id,
          reconciliationState: 'RESOLVED_CONFIRMED',
          receivableStatus: newTotalPaid > receivable.amountVnd ? 'OVERPAID' : 'PAID',
          enrollmentStatus: EnrollmentStatus.ACTIVE,
          receiptNumber: receipt.receiptNumber,
        };
      }

      // MARK_REFUND_NEEDED or REJECT_UNMATCHED
      let scopedClassId: string | null = null;
      if (targetReceivableId) {
        const rec = await tx.tuitionReceivable.findUnique({
          where: { id: targetReceivableId },
          select: { classOfferingId: true },
        });
        scopedClassId = rec?.classOfferingId ?? null;
      }

      const grantId = await this.resolveActiveFinanceGrantId(tx, actorId, scopedClassId, now);
      if (!grantId) {
        throw new ForbiddenException({
          code: 'AUTHORITY_DENIED',
          message: 'Active finance.verify authority is required to resolve cashier exceptions',
        });
      }

      const nextTxState =
        input.decision === 'MARK_REFUND_NEEDED'
          ? 'RESOLVED_REFUND_NEEDED'
          : 'RESOLVED_REJECTED';

      await tx.sePayTuitionTransaction.update({
        where: { id: bankTx.id },
        data: {
          reconciliationState: nextTxState,
          resolutionNote: note,
          resolvedById: actorId,
          resolvedGrantId: grantId,
          resolvedAt: now,
        },
      });
      if (bankTx.orderId) {
        await tx.tuitionPaymentOrder.updateMany({
          where: { id: bankTx.orderId, status: { in: ['ACTIVE_HOLD', 'EXCEPTION_HOLD'] } },
          data: { status: 'CANCELLED', releasedAt: now },
        });
      }
      await tx.tuitionReconciliationAction.create({
        data: {
          transactionId: bankTx.id,
          receivableId: targetReceivableId,
          orderId: bankTx.orderId,
          actorId,
          grantId,
          action:
            input.decision === 'MARK_REFUND_NEEDED'
              ? 'CASHIER_MARKED_REFUND_NEEDED'
              : 'CASHIER_REJECTED_UNMATCHED',
          previousState: bankTx.reconciliationState,
          nextState: nextTxState,
          note,
        },
      });

      return {
        transactionId: bankTx.id,
        reconciliationState: nextTxState,
        receiptNumber: null,
      };
    });
  }

  async getCashierFinancialReport(
    actorId: string,
    query?: { from?: string; to?: string; preset?: string; classId?: string; method?: string },
  ) {
    await this.runTx(async (tx) => {
      await releaseExpiredSeatHolds(tx, undefined, new Date());
    });

    const now = new Date();
    const toVnDate = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
    const todayVn = toVnDate(now);

    const grants = await this.prisma.permissionGrant.findMany({
      where: {
        userId: actorId,
        capability: 'finance.verify',
        approvedBy: { not: null },
        approvedAt: { lte: now },
        revokedAt: null,
        effectiveAt: { lte: now },
        expiresAt: { gt: now },
      },
      select: { id: true, scopeType: true, scopeId: true, expiresAt: true },
    });

    if (grants.length === 0) {
      throw new ForbiddenException({
        code: 'AUTHORITY_DENIED',
        message: 'Active finance.verify authority is required to view financial reports',
      });
    }

    let fromDate = query?.from?.trim() || `${todayVn.slice(0, 8)}01`;
    let toDate = query?.to?.trim() || todayVn;

    if (query?.preset === 'ALL') {
      const [minRec, minRcpt] = await Promise.all([
        this.prisma.tuitionReceivable.findFirst({
          where: { isTestHarness: false },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        }),
        this.prisma.tuitionReceipt.findFirst({
          where: { isTestHarness: false },
          orderBy: { issuedAt: 'asc' },
          select: { issuedAt: true },
        }),
      ]);
      const candidates = [minRec?.createdAt, minRcpt?.issuedAt].filter((d): d is Date => Boolean(d));
      if (candidates.length > 0) {
        const earliest = new Date(Math.min(...candidates.map((d) => d.getTime())));
        fromDate = toVnDate(earliest);
      } else {
        fromDate = `${todayVn.slice(0, 8)}01`;
      }
      toDate = todayVn;
    }

    const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!isoDateRe.test(fromDate) || !isoDateRe.test(toDate)) {
      throw new BadRequestException('Invalid date format; expected YYYY-MM-DD');
    }
    const startUtc = new Date(`${fromDate}T00:00:00+07:00`);
    const toStartUtc = new Date(`${toDate}T00:00:00+07:00`);
    if (Number.isNaN(startUtc.getTime()) || Number.isNaN(toStartUtc.getTime())) {
      throw new BadRequestException('Invalid calendar date');
    }
    if (startUtc.getTime() > toStartUtc.getTime()) {
      throw new BadRequestException('from date must be on or before to date');
    }
    const spanDays = Math.round((toStartUtc.getTime() - startUtc.getTime()) / 86_400_000) + 1;
    if (spanDays > 366) {
      throw new BadRequestException('Financial report range cannot exceed 366 days');
    }
    const endExclusiveUtc = new Date(toStartUtc.getTime() + 86_400_000);

    const classFilter = query?.classId && query.classId !== 'ALL' ? query.classId : undefined;
    const methodFilter = query?.method && query.method !== 'ALL' ? query.method : undefined;

    const [receivables, receipts, transactions, classRows] = await Promise.all([
      this.prisma.tuitionReceivable.findMany({
        where: {
          isTestHarness: false,
          createdAt: { gte: startUtc, lt: endExclusiveUtc },
          ...(classFilter ? { classOfferingId: classFilter } : {}),
        },
        include: {
          learner: { select: { id: true, fullName: true, email: true } },
          classOffering: { select: { id: true, code: true, name: true, maxStudents: true } },
          receipt: {
            select: {
              id: true,
              receiptNumber: true,
              verificationMethod: true,
              issuedAt: true,
              amountVnd: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.tuitionReceipt.findMany({
        where: {
          isTestHarness: false,
          issuedAt: { gte: startUtc, lt: endExclusiveUtc },
          ...(classFilter ? { classOfferingId: classFilter } : {}),
          ...(methodFilter ? { verificationMethod: methodFilter } : {}),
        },
        include: {
          learner: { select: { id: true, fullName: true, email: true } },
          classOffering: { select: { id: true, code: true, name: true, maxStudents: true } },
          receivable: { select: { id: true, receivableCode: true, amountVnd: true, status: true } },
          transaction: {
            select: {
              id: true,
              providerTransactionId: true,
              gateway: true,
              verificationSource: true,
            },
          },
        },
        orderBy: { issuedAt: 'desc' },
      }),
      this.prisma.sePayTuitionTransaction.findMany({
        where: {
          isTestHarness: false,
          transactionDate: { gte: startUtc, lt: endExclusiveUtc },
          ...(classFilter ? { receivable: { classOfferingId: classFilter } } : {}),
        },
        include: {
          receivable: {
            select: {
              id: true,
              receivableCode: true,
              classOffering: { select: { id: true, code: true, name: true } },
            },
          },
        },
        orderBy: { transactionDate: 'desc' },
      }),
      this.prisma.tuitionReceivable.findMany({
        where: { isTestHarness: false },
        distinct: ['classOfferingId'],
        select: {
          classOffering: { select: { id: true, code: true, name: true } },
        },
      }),
    ]);

    const totalCollectedVnd = receipts.reduce((sum, r) => sum + r.amountVnd, 0);
    const sepayAutoReceipts = receipts.filter((r) => r.verificationMethod === 'SEPAY_AUTO_VERIFIED');
    const cashierManualReceipts = receipts.filter(
      (r) => r.verificationMethod !== 'SEPAY_AUTO_VERIFIED',
    );
    const sepayAutoCollectedVnd = sepayAutoReceipts.reduce((sum, r) => sum + r.amountVnd, 0);
    const cashierManualCollectedVnd = cashierManualReceipts.reduce((sum, r) => sum + r.amountVnd, 0);

    const totalInvoicedVnd = receivables.reduce((sum, r) => sum + r.amountVnd, 0);
    const activeReceivables = receivables.filter((r) => r.status !== 'EXPIRED');
    const activeInvoicedVnd = activeReceivables.reduce((sum, r) => sum + r.amountVnd, 0);
    const collectedAgainstPeriodReceivablesVnd = activeReceivables.reduce(
      (sum, r) => sum + Math.min(r.amountVnd, r.paidAmountVnd),
      0,
    );
    const activeDebtRows = receivables.filter((r) =>
      ['UNPAID', 'PARTIAL', 'NEEDS_RECONCILIATION'].includes(r.status),
    );
    const activeDebtVnd = activeDebtRows.reduce(
      (sum, r) => sum + Math.max(0, r.amountVnd - r.paidAmountVnd),
      0,
    );
    const expiredRows = receivables.filter((r) => r.status === 'EXPIRED');
    const expiredHoldVnd = expiredRows.reduce((sum, r) => sum + r.amountVnd, 0);
    const overpaidVnd = receivables.reduce(
      (sum, r) => sum + Math.max(0, r.paidAmountVnd - r.amountVnd),
      0,
    );
    const pendingExceptionRows = transactions.filter(
      (t) => t.reconciliationState === 'PENDING_CASHIER_REVIEW',
    );
    const pendingExceptionsVnd = pendingExceptionRows.reduce((sum, t) => sum + t.amountVnd, 0);

    const recoveryRatePct =
      activeInvoicedVnd > 0
        ? Math.min(100, Math.round((collectedAgainstPeriodReceivablesVnd / activeInvoicedVnd) * 100))
        : totalCollectedVnd > 0
          ? 100
          : 0;

    // Daily trend series in GMT+7
    const dayMap = new Map<
      string,
      { date: string; collectedVnd: number; invoicedVnd: number; receiptsCount: number; receivablesCount: number }
    >();
    if (spanDays <= 90) {
      for (let idx = 0; idx < spanDays; idx += 1) {
        const dStr = toVnDate(new Date(startUtc.getTime() + idx * 86_400_000));
        dayMap.set(dStr, {
          date: dStr,
          collectedVnd: 0,
          invoicedVnd: 0,
          receiptsCount: 0,
          receivablesCount: 0,
        });
      }
    }
    const ensureDay = (dStr: string) => {
      let entry = dayMap.get(dStr);
      if (!entry) {
        entry = {
          date: dStr,
          collectedVnd: 0,
          invoicedVnd: 0,
          receiptsCount: 0,
          receivablesCount: 0,
        };
        dayMap.set(dStr, entry);
      }
      return entry;
    };
    for (const rc of receipts) {
      const entry = ensureDay(toVnDate(rc.issuedAt));
      entry.collectedVnd += rc.amountVnd;
      entry.receiptsCount += 1;
    }
    for (const rec of receivables) {
      const entry = ensureDay(toVnDate(rec.createdAt));
      entry.invoicedVnd += rec.amountVnd;
      entry.receivablesCount += 1;
    }
    const dailySeries = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));

    // Class breakdown
    const classAgg = new Map<
      string,
      {
        classId: string;
        classCode: string;
        className: string;
        maxStudents: number;
        receivablesCount: number;
        invoicedVnd: number;
        activeInvoicedVnd: number;
        collectedVnd: number;
        activeDebtVnd: number;
        expiredHoldVnd: number;
        receiptsCount: number;
        sepayAutoVnd: number;
        cashierManualVnd: number;
      }
    >();
    const ensureClass = (c: {
      id: string;
      code: string;
      name: string;
      maxStudents: number | null;
    }) => {
      let row = classAgg.get(c.id);
      if (!row) {
        row = {
          classId: c.id,
          classCode: c.code,
          className: c.name,
          maxStudents: c.maxStudents ?? 0,
          receivablesCount: 0,
          invoicedVnd: 0,
          activeInvoicedVnd: 0,
          collectedVnd: 0,
          activeDebtVnd: 0,
          expiredHoldVnd: 0,
          receiptsCount: 0,
          sepayAutoVnd: 0,
          cashierManualVnd: 0,
        };
        classAgg.set(c.id, row);
      }
      return row;
    };
    for (const r of receivables) {
      const agg = ensureClass(r.classOffering);
      agg.receivablesCount += 1;
      agg.invoicedVnd += r.amountVnd;
      if (r.status === 'EXPIRED') {
        agg.expiredHoldVnd += r.amountVnd;
      } else {
        agg.activeInvoicedVnd += r.amountVnd;
        if (['UNPAID', 'PARTIAL', 'NEEDS_RECONCILIATION'].includes(r.status)) {
          agg.activeDebtVnd += Math.max(0, r.amountVnd - r.paidAmountVnd);
        }
      }
    }
    for (const rc of receipts) {
      const agg = ensureClass(rc.classOffering);
      agg.collectedVnd += rc.amountVnd;
      agg.receiptsCount += 1;
      if (rc.verificationMethod === 'SEPAY_AUTO_VERIFIED') {
        agg.sepayAutoVnd += rc.amountVnd;
      } else {
        agg.cashierManualVnd += rc.amountVnd;
      }
    }
    const byClass = [...classAgg.values()]
      .map((c) => ({
        ...c,
        collectionRatePct:
          c.activeInvoicedVnd > 0
            ? Math.min(100, Math.round((c.collectedVnd / c.activeInvoicedVnd) * 100))
            : c.collectedVnd > 0
              ? 100
              : 0,
      }))
      .sort((a, b) => b.collectedVnd - a.collectedVnd || b.invoicedVnd - a.invoicedVnd);

    // Channel breakdown
    const byMethod = [
      {
        method: 'SEPAY_AUTO_VERIFIED',
        label: 'Chuyển khoản SePay tự động',
        count: sepayAutoReceipts.length,
        amountVnd: sepayAutoCollectedVnd,
        pct: totalCollectedVnd > 0 ? Math.round((sepayAutoCollectedVnd / totalCollectedVnd) * 100) : 0,
      },
      {
        method: 'CASHIER_MANUAL_VERIFIED',
        label: 'Thu ngân đối soát thủ công',
        count: cashierManualReceipts.length,
        amountVnd: cashierManualCollectedVnd,
        pct:
          totalCollectedVnd > 0 ? Math.round((cashierManualCollectedVnd / totalCollectedVnd) * 100) : 0,
      },
    ];

    // Non-auto-settled transactions summary
    const exceptionMap = new Map<
      string,
      { classification: string; count: number; pendingCount: number; totalAmountVnd: number }
    >();
    for (const t of transactions) {
      if (t.classification === 'EXACT_MATCH' && t.reconciliationState === 'AUTO_SETTLED') continue;
      const cur = exceptionMap.get(t.classification) ?? {
        classification: t.classification,
        count: 0,
        pendingCount: 0,
        totalAmountVnd: 0,
      };
      cur.count += 1;
      if (t.reconciliationState === 'PENDING_CASHIER_REVIEW') cur.pendingCount += 1;
      cur.totalAmountVnd += t.amountVnd;
      exceptionMap.set(t.classification, cur);
    }

    // Unified accounting statement rows: one row per receipt or non-receipted receivable in period
    const receiptIdsIncluded = new Set<string>();
    type LedgerRow = {
      id: string;
      kind: 'RECEIPT' | 'RECEIVABLE';
      at: string;
      receivableCode: string;
      receiptNumber: string | null;
      learnerName: string;
      learnerEmail: string;
      classCode: string;
      className: string;
      amountVnd: number;
      paidAmountVnd: number;
      remainingVnd: number;
      verificationMethod: string | null;
      gateway: string | null;
      providerTransactionId: string | null;
      status: string;
    };
    const ledgerRows: LedgerRow[] = [];
    for (const rc of receipts) {
      receiptIdsIncluded.add(rc.id);
      ledgerRows.push({
        id: `rcpt:${rc.id}`,
        kind: 'RECEIPT',
        at: rc.issuedAt.toISOString(),
        receivableCode: rc.receivable.receivableCode,
        receiptNumber: rc.receiptNumber,
        learnerName: rc.learner.fullName,
        learnerEmail: rc.learner.email,
        classCode: rc.classOffering.code,
        className: rc.classOffering.name,
        amountVnd: rc.receivable.amountVnd,
        paidAmountVnd: rc.amountVnd,
        remainingVnd: Math.max(0, rc.receivable.amountVnd - rc.amountVnd),
        verificationMethod: rc.verificationMethod,
        gateway: rc.transaction?.gateway ?? 'MB',
        providerTransactionId: rc.transaction?.providerTransactionId ?? null,
        status: 'PAID',
      });
    }
    if (!methodFilter) {
      for (const r of receivables) {
        if (r.receipt && receiptIdsIncluded.has(r.receipt.id)) continue;
        ledgerRows.push({
          id: `rcv:${r.id}`,
          kind: 'RECEIVABLE',
          at: r.createdAt.toISOString(),
          receivableCode: r.receivableCode,
          receiptNumber: r.receipt?.receiptNumber ?? null,
          learnerName: r.learner.fullName,
          learnerEmail: r.learner.email,
          classCode: r.classOffering.code,
          className: r.classOffering.name,
          amountVnd: r.amountVnd,
          paidAmountVnd: r.paidAmountVnd,
          remainingVnd: r.status === 'EXPIRED' ? 0 : Math.max(0, r.amountVnd - r.paidAmountVnd),
          verificationMethod: r.receipt?.verificationMethod ?? null,
          gateway: null,
          providerTransactionId: null,
          status: r.status,
        });
      }
    }
    ledgerRows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return {
      authorized: true,
      window: {
        from: fromDate,
        to: toDate,
        spanDays,
        timeZone: 'Asia/Ho_Chi_Minh',
      },
      filters: {
        classId: classFilter ?? 'ALL',
        method: methodFilter ?? 'ALL',
      },
      classOptions: classRows
        .map((c) => c.classOffering)
        .sort((a, b) => a.code.localeCompare(b.code)),
      summary: {
        totalCollectedVnd,
        receiptsCount: receipts.length,
        sepayAutoCollectedVnd,
        sepayAutoCount: sepayAutoReceipts.length,
        cashierManualCollectedVnd,
        cashierManualCount: cashierManualReceipts.length,
        totalInvoicedVnd,
        activeInvoicedVnd,
        receivablesCount: receivables.length,
        activeDebtVnd,
        activeDebtCount: activeDebtRows.length,
        expiredHoldVnd,
        expiredHoldCount: expiredRows.length,
        overpaidVnd,
        pendingExceptionsVnd,
        pendingExceptionsCount: pendingExceptionRows.length,
        recoveryRatePct,
      },
      dailySeries,
      byClass,
      byMethod,
      exceptionsByClassification: [...exceptionMap.values()],
      ledgerRows,
    };
  }
}
