import { ConflictException, ForbiddenException } from '@nestjs/common';
import { EnrollmentStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuthorizationService } from '../authorization/authorization.service';
import { TuitionPaymentService } from './tuition-payment.service';
import { releaseExpiredSeatHolds } from './tuition-seat-hold';

describe('TuitionSeatHold & TuitionPaymentService (Q01 + Q07)', () => {
  const now = new Date('2026-11-14T05:00:00.000Z');
  const classId = '10000000-0000-4000-8000-000000000001';
  const learnerId = '20000000-0000-4000-8000-000000000002';
  const enrollmentId = '30000000-0000-4000-8000-000000000003';
  const receivableId = '40000000-0000-4000-8000-000000000004';
  const orderId = '50000000-0000-4000-8000-000000000005';
  const paymentCode = 'SETUABCD1234567890';
  const cashierId = '60000000-0000-4000-8000-000000000006';
  const grantId = '70000000-0000-4000-8000-000000000007';

  const vnDateStr = '2026-11-14 12:00:00';

  function buildPayload(overrides: Record<string, unknown> = {}) {
    return Buffer.from(
      JSON.stringify({
        id: 777001,
        gateway: 'MBBank',
        transactionDate: vnDateStr,
        accountNumber: '0344527824',
        subAccount: '',
        code: paymentCode,
        content: `${paymentCode} HOC PHI`,
        transferType: 'in',
        transferAmount: 2100000,
        referenceCode: 'REF-001',
        description: 'Tuition transfer',
        ...overrides,
      }),
      'utf8',
    );
  }

  function makeHarnessService() {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([{ id: classId }]),
      enrollment: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn().mockResolvedValue({ id: enrollmentId, status: EnrollmentStatus.ACTIVE }),
      },
      tuitionPaymentOrder: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      tuitionReceivable: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      sePayTuitionTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'tx-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      tuitionReceipt: {
        create: jest.fn().mockResolvedValue({ receiptNumber: 'PT-TEST-20261114-AAAA' }),
      },
      tuitionReconciliationAction: {
        create: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      permissionGrant: {
        findFirst: jest.fn().mockResolvedValue({ id: grantId }),
      },
    };

    const prisma = {
      $transaction: jest.fn((cb: (c: typeof tx) => Promise<unknown>) => cb(tx)),
    } as unknown as PrismaService;

    const authority = {
      permits: jest.fn().mockResolvedValue(true),
    } as unknown as AuthorizationService;

    const service = new TuitionPaymentService(prisma, authority);
    jest.spyOn(service, 'loadSePayConfigSafe').mockReturnValue({
      version: 1,
      enabled: true,
      apiToken: 'token',
      webhookSecret: 'a'.repeat(40),
      bankAccountId: '88888888-8888-4888-8888-888888888888',
      accountNumber: '0344527824',
      accountHolder: 'SMART ENGLISH',
      bankCode: 'MB',
      gateway: 'MBBank',
      subAccount: '',
      callbackUrl: 'https://example.test/api/v2/payments/sepay/webhook',
      operatorVerifiedRecipient: true,
    });

    const baseOrder = {
      id: orderId,
      receivableId,
      enrollmentId,
      learnerId,
      classOfferingId: classId,
      paymentCode,
      expectedAmountVnd: 2100000,
      status: 'ACTIVE_HOLD',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      receivable: {
        id: receivableId,
        amountVnd: 2100000,
        paidAmountVnd: 0,
        status: 'UNPAID',
        receipt: null,
      },
      enrollment: {
        id: enrollmentId,
        status: EnrollmentStatus.PENDING_PAYMENT,
        isTestHarness: false,
      },
      classOffering: {
        id: classId,
        maxStudents: 1,
      },
    };

    tx.tuitionPaymentOrder.findUnique.mockResolvedValue(baseOrder);
    tx.tuitionPaymentOrder.findUniqueOrThrow.mockResolvedValue(baseOrder);

    return { service, tx, authority, baseOrder };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('releases expired 15m seat holds atomically and logs audit action', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      enrollment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: enrollmentId,
            classOfferingId: classId,
            reservedUntil: new Date(now.getTime() - 1000),
            receivable: { id: receivableId, status: 'UNPAID', paidAmountVnd: 0 },
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      tuitionPaymentOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      tuitionReceivable: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      tuitionReconciliationAction: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };

    const count = await releaseExpiredSeatHolds(tx as never, classId, now);
    expect(count).toBe(1);
    expect(tx.enrollment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CANCELLED',
          releaseReason: 'HOLD_EXPIRED',
        }),
      }),
    );
    expect(tx.tuitionPaymentOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'EXPIRED' }) }),
    );
    expect(tx.tuitionReceivable.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EXPIRED' } }),
    );
  });

  it('auto-settles exact transfer within 15m hold, issues unique receipt, and activates enrollment', async () => {
    const { service, tx } = makeHarnessService();
    const res = await service.reconcileIncomingTransfer({
      rawBody: buildPayload({ transferAmount: 2100000 }),
      mode: 'DEV_TEST_HARNESS',
    });

    expect(res).toMatchObject({
      classification: 'EXACT_MATCH',
      reconciliationState: 'AUTO_SETTLED',
      enrollmentStatus: EnrollmentStatus.ACTIVE,
      isTestHarness: true,
    });
    expect(tx.tuitionReceipt.create).toHaveBeenCalledTimes(1);
    expect(tx.enrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: EnrollmentStatus.ACTIVE, reservedUntil: null }),
      }),
    );
  });

  it('queues UNDERPAYMENT for cashier review without activating LMS or issuing receipt', async () => {
    const { service, tx } = makeHarnessService();
    const res = await service.reconcileIncomingTransfer({
      rawBody: buildPayload({ transferAmount: 500000 }),
      mode: 'DEV_TEST_HARNESS',
    });

    expect(res).toMatchObject({
      classification: 'UNDERPAYMENT',
      reconciliationState: 'PENDING_CASHIER_REVIEW',
      receiptNumber: null,
    });
    expect(tx.tuitionReceipt.create).not.toHaveBeenCalled();
    expect(tx.enrollment.update).not.toHaveBeenCalled();
    expect(tx.tuitionReceivable.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'NEEDS_RECONCILIATION' } }),
    );
  });

  it('queues OVERPAYMENT, UNMATCHED_CODE, EXPIRED_HOLD, and CLASS_FULL without auto-activating', async () => {
    // 1. Overpayment
    const h1 = makeHarnessService();
    const r1 = await h1.service.reconcileIncomingTransfer({
      rawBody: buildPayload({ transferAmount: 2500000 }),
      mode: 'DEV_TEST_HARNESS',
    });
    expect(r1.classification).toBe('OVERPAYMENT');
    expect(h1.tx.tuitionReceipt.create).not.toHaveBeenCalled();

    // 2. Unmatched code
    const h2 = makeHarnessService();
    h2.tx.tuitionPaymentOrder.findUnique.mockResolvedValue(null);
    const r2 = await h2.service.reconcileIncomingTransfer({
      rawBody: buildPayload({ code: 'SETUWRONG9999999', content: 'SETUWRONG9999999' }),
      mode: 'DEV_TEST_HARNESS',
    });
    expect(r2.classification).toBe('UNMATCHED_CODE');
    expect(h2.tx.enrollment.update).not.toHaveBeenCalled();

    // 3. Expired hold (>15m late transfer)
    const h3 = makeHarnessService();
    const expiredOrder = {
      ...h3.baseOrder,
      status: 'EXPIRED',
      expiresAt: new Date(Date.now() - 60 * 1000),
      enrollment: { id: enrollmentId, status: EnrollmentStatus.CANCELLED, isTestHarness: false },
    };
    h3.tx.tuitionPaymentOrder.findUnique.mockResolvedValue(expiredOrder);
    h3.tx.tuitionPaymentOrder.findUniqueOrThrow.mockResolvedValue(expiredOrder);
    const r3 = await h3.service.reconcileIncomingTransfer({
      rawBody: buildPayload({ transferAmount: 2100000 }),
      mode: 'DEV_TEST_HARNESS',
    });
    expect(r3.classification).toBe('EXPIRED_HOLD');
    expect(h3.tx.enrollment.update).not.toHaveBeenCalled();

    // 4. Class already full when late/valid tx arrives
    const h4 = makeHarnessService();
    h4.tx.enrollment.count.mockResolvedValue(1); // maxStudents is 1 -> full!
    const r4 = await h4.service.reconcileIncomingTransfer({
      rawBody: buildPayload({ transferAmount: 2100000 }),
      mode: 'DEV_TEST_HARNESS',
    });
    expect(r4.classification).toBe('CLASS_FULL');
    expect(h4.tx.enrollment.update).not.toHaveBeenCalled();
  });

  it('deduplicates replayed webhook idempotently by (bankAccountId, providerTransactionId)', async () => {
    const { service, tx } = makeHarnessService();
    const raw = buildPayload({ transferAmount: 2100000 });
    // First call would compute semanticHash; capture what create gets or simulate exact replay check
    const first = await service.reconcileIncomingTransfer({ rawBody: raw, mode: 'DEV_TEST_HARNESS' });
    expect(first.duplicate).toBe(false);

    const createdArg = tx.sePayTuitionTransaction.create.mock.calls[0][0].data;
    tx.sePayTuitionTransaction.findUnique.mockResolvedValue({
      id: 'tx-1',
      classification: createdArg.classification,
      reconciliationState: createdArg.reconciliationState,
      semanticHash: createdArg.semanticHash,
      isTestHarness: true,
      receipt: { receiptNumber: 'PT-TEST-20261114-AAAA' },
    });

    const replay = await service.reconcileIncomingTransfer({ rawBody: raw, mode: 'DEV_TEST_HARNESS' });
    expect(replay.duplicate).toBe(true);
    expect(tx.sePayTuitionTransaction.create).toHaveBeenCalledTimes(1);
    expect(tx.tuitionReceipt.create).toHaveBeenCalledTimes(1);
  });

  it('requires active finance.verify grant and full capacity when cashier confirms exception', async () => {
    const { service, tx, authority } = makeHarnessService();
    tx.sePayTuitionTransaction.findUnique.mockResolvedValue({
      id: 'tx-exc-1',
      receivableId,
      orderId,
      amountVnd: 2100000,
      reconciliationState: 'PENDING_CASHIER_REVIEW',
      isTestHarness: true,
      receipt: null,
    });
    tx.tuitionReceivable.findUnique.mockResolvedValue({
      id: receivableId,
      enrollmentId,
      learnerId,
      classOfferingId: classId,
      amountVnd: 2100000,
      paidAmountVnd: 0,
      status: 'NEEDS_RECONCILIATION',
      isTestHarness: true,
      enrollment: { id: enrollmentId, status: EnrollmentStatus.PENDING_PAYMENT, isTestHarness: true },
      classOffering: { id: classId, maxStudents: 1 },
      receipt: null,
    });

    // Denied if no finance.verify grant
    (authority.permits as jest.Mock).mockResolvedValueOnce(false);
    await expect(
      service.resolveCashierException(cashierId, 'tx-exc-1', {
        decision: 'CONFIRM_MATCH_AND_ACTIVATE',
        note: 'Verified bank slip',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Denied if class full
    (authority.permits as jest.Mock).mockResolvedValueOnce(true);
    tx.enrollment.count.mockResolvedValueOnce(1);
    await expect(
      service.resolveCashierException(cashierId, 'tx-exc-1', {
        decision: 'CONFIRM_MATCH_AND_ACTIVATE',
        note: 'Verified bank slip',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    // Succeeds when grant active and seat free
    (authority.permits as jest.Mock).mockResolvedValueOnce(true);
    tx.enrollment.count.mockResolvedValueOnce(0);
    const resolved = await service.resolveCashierException(cashierId, 'tx-exc-1', {
      decision: 'CONFIRM_MATCH_AND_ACTIVATE',
      note: 'Verified MB transfer after expired hold with open seat',
    });
    expect(resolved).toMatchObject({
      reconciliationState: 'RESOLVED_CONFIRMED',
      enrollmentStatus: EnrollmentStatus.ACTIVE,
    });
  });

  it('aggregates cashier financial report in VND and fails closed without finance.verify grant', async () => {
    const mockTx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([]),
      enrollment: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      tuitionPaymentOrder: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      tuitionReceivable: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      tuitionReconciliationAction: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const mockPrisma = {
      $transaction: jest.fn((cb: (c: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
      permissionGrant: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      tuitionReceivable: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      tuitionReceipt: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      sePayTuitionTransaction: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new TuitionPaymentService(
      mockPrisma as unknown as PrismaService,
      { permits: jest.fn() } as unknown as AuthorizationService,
    );

    await expect(
      service.getCashierFinancialReport(cashierId, { from: '2026-11-01', to: '2026-11-16' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    mockPrisma.permissionGrant.findMany.mockResolvedValueOnce([
      { id: grantId, scopeType: 'CLASS', scopeId: classId, expiresAt: new Date(Date.now() + 86_400_000) },
    ]);
    mockPrisma.tuitionReceivable.findMany
      .mockResolvedValueOnce([
        {
          id: 'rcv-1',
          receivableCode: 'RCV-20261114-01',
          amountVnd: 500000,
          paidAmountVnd: 500000,
          status: 'PAID',
          createdAt: new Date('2026-11-14T05:14:00.000Z'),
          classOffering: { id: classId, code: 'SE-550', name: 'TOEIC 550', maxStudents: 25 },
          learner: { id: learnerId, fullName: 'Hoc vien A', email: 'a@example.test' },
          receipt: {
            id: 'rcpt-1',
            receiptNumber: 'PT-20261114-0001',
            verificationMethod: 'SEPAY_AUTO_VERIFIED',
            issuedAt: new Date('2026-11-14T05:20:00.000Z'),
            amountVnd: 500000,
          },
        },
        {
          id: 'rcv-2',
          receivableCode: 'RCV-20261114-02',
          amountVnd: 1850000,
          paidAmountVnd: 0,
          status: 'EXPIRED',
          createdAt: new Date('2026-11-14T06:00:00.000Z'),
          classOffering: { id: classId, code: 'SE-550', name: 'TOEIC 550', maxStudents: 25 },
          learner: { id: learnerId, fullName: 'Hoc vien A', email: 'a@example.test' },
          receipt: null,
        },
        {
          id: 'rcv-3',
          receivableCode: 'RCV-20261115-03',
          amountVnd: 1200000,
          paidAmountVnd: 400000,
          status: 'PARTIAL',
          createdAt: new Date('2026-11-15T03:00:00.000Z'),
          classOffering: { id: classId, code: 'SE-550', name: 'TOEIC 550', maxStudents: 25 },
          learner: { id: learnerId, fullName: 'Hoc vien B', email: 'b@example.test' },
          receipt: null,
        },
      ])
      .mockResolvedValueOnce([{ classOffering: { id: classId, code: 'SE-550', name: 'TOEIC 550' } }]);

    mockPrisma.tuitionReceipt.findMany.mockResolvedValueOnce([
      {
        id: 'rcpt-1',
        receiptNumber: 'PT-20261114-0001',
        amountVnd: 500000,
        verificationMethod: 'SEPAY_AUTO_VERIFIED',
        issuedAt: new Date('2026-11-14T05:20:00.000Z'),
        learner: { id: learnerId, fullName: 'Hoc vien A', email: 'a@example.test' },
        classOffering: { id: classId, code: 'SE-550', name: 'TOEIC 550', maxStudents: 25 },
        receivable: { id: 'rcv-1', receivableCode: 'RCV-20261114-01', amountVnd: 500000, status: 'PAID' },
        transaction: { id: 'tx-1', providerTransactionId: 'SEPAY-01', gateway: 'MB', verificationSource: 'SEPAY_WEBHOOK' },
      },
    ]);

    mockPrisma.sePayTuitionTransaction.findMany.mockResolvedValueOnce([
      {
        id: 'tx-exc',
        amountVnd: 400000,
        classification: 'UNDERPAYMENT',
        reconciliationState: 'PENDING_CASHIER_REVIEW',
        transactionDate: new Date('2026-11-15T03:05:00.000Z'),
        receivable: null,
      },
    ]);

    const rep = await service.getCashierFinancialReport(cashierId, {
      from: '2026-11-14',
      to: '2026-11-16',
    });

    expect(rep.summary).toMatchObject({
      totalCollectedVnd: 500000,
      receiptsCount: 1,
      sepayAutoCollectedVnd: 500000,
      activeInvoicedVnd: 1700000,
      activeDebtVnd: 800000,
      activeDebtCount: 1,
      expiredHoldVnd: 1850000,
      expiredHoldCount: 1,
      pendingExceptionsVnd: 400000,
      pendingExceptionsCount: 1,
    });
    expect(rep.byClass).toHaveLength(1);
    expect(rep.byClass[0]).toMatchObject({
      classCode: 'SE-550',
      collectedVnd: 500000,
      activeDebtVnd: 800000,
      expiredHoldVnd: 1850000,
    });
    expect(rep.dailySeries.map((d) => d.date)).toEqual(['2026-11-14', '2026-11-15', '2026-11-16']);
    expect(rep.ledgerRows).toHaveLength(3);
  });
});
