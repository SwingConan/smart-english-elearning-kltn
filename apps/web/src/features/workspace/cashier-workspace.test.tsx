import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CashierWorkspaceDashboard } from './CashierWorkspaceDashboard';
import { SePayPaymentsPage } from '@/pages/SePayPaymentsPage';
import { AdmissionsWorkspacePage } from '@/pages/AdmissionsFinancePage';
import { CashierFinancialReport } from '@/features/operations/CashierFinancialReport';
import { numberToVietnameseWords } from '@/features/operations/cashier-financial-export';

vi.mock('@/components/charts/ReportEChart', () => ({
  ReportEChart: () => <div data-testid="mock-echart" />,
}));

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => mocks.fetch(...args),
  apiUrl: (p: string) => '/api' + p,
  ApiError: class extends Error {
    status: number;
    constructor(msg: string, status = 400) {
      super(msg);
      this.status = status;
    }
  },
}));

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({
    user: {
      id: 'cashier-1',
      email: 'cashier@gmail.com',
      fullName: 'Kế toán học phí Smart English',
      role: 'CASHIER',
      status: 'ACTIVE',
    },
    isLoading: false,
    refreshUser: vi.fn(),
  }),
}));

beforeEach(() => {
  mocks.fetch.mockReset();
});

afterEach(cleanup);

const buildCashierFixture = () => ({
  authority: {
    hasAnyActiveFinanceVerifyGrant: true,
    activeGrantsCount: 5,
    grantedClassIds: ['c1'],
  },
  sepay: {
    configured: true,
    bankCode: 'MB',
    gateway: 'MBBank',
    accountNumber: '9120320049999',
    accountHolder: 'LE HUU LOI',
  },
  summary: {
    realCollectedVnd: 1850000,
    testHarnessCollectedVnd: 2100000,
    totalReceivablesCount: 2,
    unpaidCount: 1,
    paidCount: 1,
    pendingExceptionsCount: 1,
    receiptsRealCount: 1,
    receiptsTestCount: 1,
  },
  receivables: [
    {
      id: 'rcv-1',
      receivableCode: 'RCV-20261114-001',
      amountVnd: 2000000,
      paidAmountVnd: 500000,
      status: 'PARTIAL',
      dueAt: null,
      paidAt: null,
      isTestHarness: false,
      learner: { id: 'stu-1', fullName: 'Nguyen Van A', email: 'hv.a@example.invalid' },
      classOffering: { id: 'c1', code: 'SE-550', name: 'TOEIC 550', maxStudents: 25 },
      enrollment: {
        id: 'enr-1',
        status: 'PENDING_PAYMENT',
        reservedUntil: '2026-11-14T12:00:00.000Z',
        entrySource: 'COURSE_CATALOG',
      },
      paymentOrders: [
        {
          id: 'ord-1',
          paymentCode: 'SETUABC123456',
          status: 'PENDING',
          expiresAt: '2026-11-14T12:00:00.000Z',
        },
      ],
      receipt: null,
    },
  ],
  transactions: [
    {
      id: 'tx-match',
      providerTransactionId: 'TX-MATCH-01',
      paymentCodeExtracted: 'SETU999999',
      amountVnd: 2100000,
      content: 'SETU999999 DEV_TEST_HARNESS',
      referenceCode: 'DEV-01',
      gateway: 'MBBank',
      transactionDate: '2026-11-14T01:00:00.000Z',
      classification: 'EXACT_MATCH',
      reconciliationState: 'AUTO_SETTLED',
      verificationSource: 'DEV_TEST_HARNESS',
      verifiedBankApi: false,
      isTestHarness: true,
      resolutionNote: null,
      resolvedAt: null,
      order: { id: 'ord-test', paymentCode: 'SETU999999', expectedAmountVnd: 2100000, status: 'PAID' },
      receivable: null,
      receipt: { id: 'rec-test', receiptNumber: 'PT-TEST-20261114-001', isTestHarness: true },
    },
    {
      id: 'tx-mismatch',
      providerTransactionId: 'TX-MISMATCH-02',
      paymentCodeExtracted: 'SETUABC123456',
      amountVnd: 500000,
      content: 'SETUABC123456',
      referenceCode: 'BANK-02',
      gateway: 'MBBank',
      transactionDate: '2026-11-14T01:05:00.000Z',
      classification: 'UNDERPAYMENT',
      reconciliationState: 'PENDING_CASHIER_REVIEW',
      verificationSource: 'SEPAY_WEBHOOK',
      verifiedBankApi: true,
      isTestHarness: false,
      resolutionNote: null,
      resolvedAt: null,
      order: { id: 'ord-1', paymentCode: 'SETUABC123456', expectedAmountVnd: 2000000, status: 'PENDING' },
      receivable: {
        id: 'rcv-1',
        receivableCode: 'RCV-20261114-001',
        amountVnd: 2000000,
        paidAmountVnd: 500000,
        status: 'PARTIAL',
        learner: { id: 'stu-1', fullName: 'Nguyen Van A', email: 'hv.a@example.invalid' },
        classOffering: { id: 'c1', code: 'SE-550', name: 'TOEIC 550' },
      },
      receipt: null,
    },
  ],
  receipts: [],
  reconciliationActions: [],
  historicalLegacy: {
    w07Applications: [],
    bankCheckOrders: [],
  },
});

describe('Cashier actor UI contracts (UC 1 & UC 2)', () => {
  it('computes dynamic metrics from API records and separates REAL revenue from TEST harness', async () => {
    mocks.fetch.mockImplementation((url: string) => {
      if (url.startsWith('/v2/payments/sepay/cashier')) {
        return Promise.resolve(buildCashierFixture());
      }
      return Promise.resolve({ sources: [] });
    });

    render(
      <MemoryRouter>
        <CashierWorkspaceDashboard />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/1\.850\.000 đ/)).toBeInTheDocument();
    expect(screen.getAllByText(/2\.100\.000 đ/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('1 phiếu thu thật')).toBeInTheDocument();
    expect(screen.getByText('TX #TX-MISMATCH-02')).toBeInTheDocument();
    expect(screen.getByText(/500\.000 đ \/ 2\.000\.000 đ/)).toBeInTheDocument();
  });

  it('SePay Cashier enforces audit reason length and submits reconciliation decision', async () => {
    mocks.fetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url.startsWith('/v2/payments/sepay/cashier')) {
        return Promise.resolve(buildCashierFixture());
      }
      if (url.includes('/reconcile') && init?.method === 'POST') {
        return Promise.resolve({ reconciliationState: 'RESOLVED_CONFIRMED', receiptNumber: null });
      }
      return Promise.resolve({});
    });

    render(
      <MemoryRouter initialEntries={['/payments/sepay']}>
        <Routes>
          <Route path="/payments/sepay" element={<SePayPaymentsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('TX #TX-MATCH-01')).toBeInTheDocument();
    expect(screen.getByText('TX #TX-MISMATCH-02')).toBeInTheDocument();

    const partialBtn = screen.getByRole('button', { name: /Ghi nhận thu một phần/i });
    fireEvent.click(partialBtn);
    expect(await screen.findByText(/tối thiểu 5 ký tự/i)).toBeInTheDocument();
    expect(mocks.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/reconcile'),
      expect.anything(),
    );

    const noteInput = screen.getByPlaceholderText(/Đã đối chiếu sao kê MB/i);
    fireEvent.change(noteInput, { target: { value: 'Da doi chieu thieu tien, giu cho nop bo sung' } });
    fireEvent.click(partialBtn);

    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        '/v2/payments/sepay/transactions/tx-mismatch/reconcile',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            decision: 'MARK_PARTIAL_KEEP_PENDING',
            reason: 'Da doi chieu thieu tien, giu cho nop bo sung',
          }),
        }),
      ),
    );
  });

  it('AdmissionsWorkspacePage fails closed for Cashier without fake receipts or obligations', async () => {
    mocks.fetch.mockRejectedValue(new Error('Authenticated synthetic DEV identity required'));
    render(
      <MemoryRouter initialEntries={['/workspace/admissions#receipts']}>
        <Routes>
          <Route path="/workspace/admissions" element={<AdmissionsWorkspacePage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      await screen.findByText(/Bạn chưa có quyền mở trang này hoặc quyền đã hết hiệu lực/),
    ).toBeInTheDocument();
    expect(screen.getByText('Phiếu thu & Chứng từ đã ghi nhận')).toBeInTheDocument();
  });

  it('CashierFinancialReport renders real VND KPIs, class breakdown, ledger totals, and Vietnamese currency words', async () => {
    expect(numberToVietnameseWords(500000)).toBe('Năm trăm nghìn đồng chẵn');
    expect(numberToVietnameseWords(1850000)).toBe('Một triệu tám trăm năm mươi nghìn đồng chẵn');

    mocks.fetch.mockImplementation((url: string) => {
      if (url.startsWith('/v2/payments/sepay/cashier/financial-report')) {
        return Promise.resolve({
          authorized: true,
          window: { from: '2026-11-01', to: '2026-11-16', spanDays: 16, timeZone: 'Asia/Ho_Chi_Minh' },
          filters: { classId: 'ALL', method: 'ALL' },
          classOptions: [{ id: 'cls-1', code: 'SE-LIST-550-500K', name: 'TOEIC 550' }],
          summary: {
            totalCollectedVnd: 500000,
            receiptsCount: 1,
            sepayAutoCollectedVnd: 500000,
            sepayAutoCount: 1,
            cashierManualCollectedVnd: 0,
            cashierManualCount: 0,
            totalInvoicedVnd: 2350000,
            activeInvoicedVnd: 500000,
            receivablesCount: 2,
            activeDebtVnd: 0,
            activeDebtCount: 0,
            expiredHoldVnd: 1850000,
            expiredHoldCount: 1,
            overpaidVnd: 0,
            pendingExceptionsVnd: 0,
            pendingExceptionsCount: 0,
            recoveryRatePct: 100,
          },
          dailySeries: [
            { date: '2026-11-14', collectedVnd: 500000, invoicedVnd: 2350000, receiptsCount: 1, receivablesCount: 2 },
          ],
          byClass: [
            {
              classId: 'cls-1',
              classCode: 'SE-LIST-550-500K',
              className: 'TOEIC 550',
              maxStudents: 30,
              receivablesCount: 1,
              invoicedVnd: 500000,
              activeInvoicedVnd: 500000,
              collectedVnd: 500000,
              activeDebtVnd: 0,
              expiredHoldVnd: 0,
              receiptsCount: 1,
              sepayAutoVnd: 500000,
              cashierManualVnd: 0,
              collectionRatePct: 100,
            },
          ],
          byMethod: [
            { method: 'SEPAY_AUTO_VERIFIED', label: 'Chuyển khoản SePay tự động', count: 1, amountVnd: 500000, pct: 100 },
            { method: 'CASHIER_MANUAL_VERIFIED', label: 'Thu ngân đối soát thủ công', count: 0, amountVnd: 0, pct: 0 },
          ],
          exceptionsByClassification: [],
          ledgerRows: [
            {
              id: 'rcpt:1',
              kind: 'RECEIPT',
              at: '2026-11-14T05:20:00.000Z',
              receivableCode: 'RCV-20261114-3E8D86',
              receiptNumber: 'PT-20261114-9EA1A011',
              learnerName: 'Hoc vien Smart English',
              learnerEmail: 'student@gmail.com',
              classCode: 'SE-LIST-550-500K',
              className: 'TOEIC 550',
              amountVnd: 500000,
              paidAmountVnd: 500000,
              remainingVnd: 0,
              verificationMethod: 'SEPAY_AUTO_VERIFIED',
              gateway: 'MB',
              providerTransactionId: '0efbb8ff',
              status: 'PAID',
            },
          ],
        });
      }
      return Promise.resolve({});
    });

    render(
      <MemoryRouter>
        <CashierFinancialReport />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: /Báo cáo tài chính & Đối soát doanh thu/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Năm trăm nghìn đồng chẵn/)).toBeInTheDocument();
    expect(screen.getByText('PT-20261114-9EA1A011')).toBeInTheDocument();
    expect(screen.getByText('1.850.000 đ')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Toàn kỳ' }));
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/v2/payments/sepay/cashier/financial-report?preset=ALL'),
      ),
    );
  });
});
