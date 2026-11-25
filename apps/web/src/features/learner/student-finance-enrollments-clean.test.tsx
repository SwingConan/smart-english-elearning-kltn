import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import { ToastProvider } from '@/components/ui/Feedback';
import { IuhStudentShell } from '@/features/class-lms/IuhLmsShell';
import { MyEnrollmentsPage } from '@/pages/MyEnrollmentsPage';
import { StudentFinancePage } from './StudentFinancePage';
import { SePayPaymentsPage } from '@/pages/SePayPaymentsPage';
import { enrollmentApi } from '@/features/enrollments/api';
import { apiFetch } from '@/lib/api-client';
import type { EnrollmentView } from '@/features/enrollments/types';
import type { UnifiedFinanceResponse } from './UnifiedStudentFinancePanel';

vi.mock('@/lib/api-client', async (original) => ({
  ...(await original<typeof import('@/lib/api-client')>()),
  apiFetch: vi.fn(),
}));

const studentAuth: AuthContextValue = {
  user: {
    id: 'stu-1',
    fullName: 'Học viên Smart English',
    email: 'student@example.invalid',
    role: 'STUDENT',
    status: 'ACTIVE',
  },
  isLoading: false,
  error: null,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
};

function renderWithAuth(node: React.ReactNode, initialEntry = '/student/finance') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthContext.Provider value={studentAuth}>
        <ToastProvider>{node}</ToastProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Student navigation, enrollments cards, and redesigned finance UI', () => {
  it('removes Knowledge Library 404 links and Dịch vụ & Thư viện label from student shell', () => {
    renderWithAuth(
      <IuhStudentShell displayUserName="Học viên Smart English" onLogoutRequest={vi.fn()}>
        <div>Nội dung</div>
      </IuhStudentShell>,
    );

    expect(screen.getByRole('button', { name: /Dịch vụ học viên/i })).toBeInTheDocument();
    expect(screen.queryByText(/Dịch vụ & Thư viện/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Thư viện kiến thức TOEIC/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Dịch vụ học viên/i }));
    expect(screen.queryByText(/Thư viện kiến thức TOEIC/i)).not.toBeInTheDocument();
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).not.toBe('/student/library');
    }
  });

  it('hides noisy internal UUID/wave codes on MyEnrollmentsPage cards while keeping class details readable', async () => {
    const enrollments: EnrollmentView[] = [
      {
        id: 'enr-1',
        status: 'ACTIVE',
        enrolledAt: '2026-11-10T09:00:00.000Z',
        classOffering: {
          id: 'cls-1',
          code: 'W01-4f057faf-9d1d-46c2-8764-94a311a9d7a1-1',
          name: 'TOEIC nền tảng - Lớp trực tuyến buổi tối',
          status: 'IN_PROGRESS',
          pricingType: 'PAID',
          tuitionFeeVnd: 1500000,
          modality: 'ONLINE',
          classStart: null,
          classEnd: null,
          instructor: { id: 'inst-1', fullName: 'Nguyễn Thu Hà' },
          scheduleSlots: [
            {
              id: 'slot-1',
              dayOfWeek: 2,
              startTime: '1970-01-01T18:30:00.000Z',
              endTime: '1970-01-01T20:00:00.000Z',
              locationText: null,
            },
          ],
          course: {
            id: 'crs-1',
            title: 'TOEIC nền tảng',
            slug: 'toeic-nen-tang',
            level: 'A2',
            skillScope: 'LISTENING_READING',
            thumbnailUrl: null,
          },
        },
        progress: { totalLessons: 37, completedLessons: 0, progressPercent: 0 },
      },
    ];

    vi.spyOn(enrollmentApi, 'listMine').mockResolvedValueOnce(enrollments);
    renderWithAuth(<MyEnrollmentsPage />, '/student/enrollments');

    expect(await screen.findByText('TOEIC nền tảng - Lớp trực tuyến buổi tối')).toBeInTheDocument();
    expect(screen.getByText(/Giảng viên: Nguyễn Thu Hà/)).toBeInTheDocument();
    expect(screen.queryByText(/W01-4f057faf/)).not.toBeInTheDocument();
  });

  it('renders clean StudentFinancePage without dev jargon, duplicates, or raw enum tokens and supports filters', async () => {
    const futureIso = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const unified: UnifiedFinanceResponse = {
      serverTime: new Date().toISOString(),
      sepay: {
        configured: true,
        bankCode: 'MBBank',
        gateway: 'MBBank',
        accountNumberMasked: '***890',
        accountNumber: '0987654890',
        accountHolder: 'SMART ENGLISH',
        callbackPath: '/api/v2/payments/sepay/webhook',
      },
      summary: {
        totalReceivables: 2,
        unpaidOrHeldCount: 1,
        paidCount: 1,
        exceptionCount: 0,
        expiredCount: 0,
      },
      receivables: [
        {
          id: 'rec-paid',
          receivableCode: 'RCV-20261114-3DBB86',
          enrollmentId: 'enr-paid',
          enrollmentStatus: 'ACTIVE',
          reservedUntil: null,
          seatReleasedAt: null,
          releaseReason: null,
          entrySource: 'DIRECT_CATALOG',
          placementAttemptId: null,
          classOffering: {
            id: 'cls-paid',
            code: 'SE-LIST-550-500K',
            name: 'TOEIC Listening Focus 550+ — Tối 3-5-7',
            status: 'OPEN',
            maxStudents: 25,
            course: {
              id: 'crs-paid',
              title: 'TOEIC 550+ — Phản xạ nghe công sở',
              slug: 'toeic-550-listening',
              level: 'B1',
            },
          },
          amountVnd: 500000,
          paidAmountVnd: 500000,
          remainingVnd: 0,
          currency: 'VND',
          status: 'PAID',
          dueAt: null,
          paidAt: '2026-11-14T10:20:11.000Z',
          isTestHarness: true,
          activeOrder: null,
          latestOrder: null,
          receipt: {
            id: 'pt-1',
            receiptNumber: 'PT-20261114-9862A811',
            amountVnd: 500000,
            currency: 'VND',
            verificationMethod: 'SEPAY_AUTO_VERIFIED',
            isTestHarness: true,
            issuedAt: '2026-11-14T10:20:11.000Z',
          },
          transactions: [
            {
              id: 'tx-1',
              providerTransactionId: '0efbb8ff-e025-33f1-8885-0affe370528c',
              amountVnd: 500000,
              classification: 'EXACT_MATCH',
              reconciliationState: 'AUTO_SETTLED',
              verificationSource: 'SEPAY',
              verifiedBankApi: true,
              isTestHarness: true,
              content: 'SETU1234',
              transactionDate: '2026-11-14T10:20:11.000Z',
              resolutionNote: null,
            },
          ],
        },
        {
          id: 'rec-hold',
          receivableCode: 'RCV-20261115-HOLD01',
          enrollmentId: 'enr-hold',
          enrollmentStatus: 'PENDING_PAYMENT',
          reservedUntil: futureIso,
          seatReleasedAt: null,
          releaseReason: null,
          entrySource: 'PLACEMENT_MATCH',
          placementAttemptId: 'att-1',
          classOffering: {
            id: 'cls-hold',
            code: 'SE-450-EVENING',
            name: 'TOEIC nền tảng 450+ · Lớp buổi tối',
            status: 'OPEN',
            maxStudents: 25,
            course: {
              id: 'crs-hold',
              title: 'TOEIC nền tảng 450+',
              slug: 'toeic-450',
              level: 'A2',
            },
          },
          amountVnd: 1500000,
          paidAmountVnd: 0,
          remainingVnd: 1500000,
          currency: 'VND',
          status: 'UNPAID',
          dueAt: futureIso,
          paidAt: null,
          isTestHarness: false,
          activeOrder: {
            id: 'ord-1',
            paymentCode: 'SETU998877',
            expectedAmountVnd: 1500000,
            currency: 'VND',
            bankCode: 'MBBank',
            accountNumber: '0987654890',
            accountName: 'SMART ENGLISH',
            qrUrl: 'https://img.vietqr.io/image/MB-0987654890-compact2.png',
            status: 'PENDING',
            expiresAt: futureIso,
            remainingSeconds: 600,
          },
          latestOrder: null,
          receipt: null,
          transactions: [],
        },
      ],
      historicalLegacyW07: [
        {
          id: 'leg-1',
          classCode: 'SE-LIST-550-357',
          className: 'TOEIC Listening Focus 550+ — Tối 3-5-7 (Ca 18:30)',
          state: 'APPROVED',
          amountVnd: 1850000,
          createdAt: '2026-11-10T00:00:00.000Z',
          historicalOnly: true,
          note: 'Hồ sơ W07 lịch sử',
        },
      ],
    };

    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === '/v2/my/finance') {
        return {
          data: [
            {
              id: 'adm-dup',
              state: 'APPROVED',
              amountVnd: 500000,
              createdAt: '2026-11-10T00:00:00.000Z',
              demonstration: true,
              class: {
                id: 'cls-paid',
                name: 'TOEIC Listening Focus 550+ — Tối 3-5-7',
                code: 'SE-LIST-550-500K',
              },
              obligation: null,
              evidence: [],
            },
          ],
          unified,
        } as never;
      }
      return unified as never;
    });

    vi.spyOn(enrollmentApi, 'listMine').mockResolvedValueOnce([
      {
        id: 'enr-hold',
        status: 'PENDING_PAYMENT',
        enrolledAt: '2026-11-15T00:00:00.000Z',
        classOffering: {
          id: 'cls-hold',
          code: 'SE-450-EVENING',
          name: 'TOEIC nền tảng 450+ · Lớp buổi tối',
          status: 'OPEN',
          pricingType: 'PAID',
          tuitionFeeVnd: 1500000,
          modality: 'ONLINE',
          classStart: null,
          classEnd: null,
          instructor: null,
          scheduleSlots: [],
          course: {
            id: 'crs-hold',
            title: 'TOEIC nền tảng 450+',
            slug: 'toeic-450',
            level: 'A2',
            skillScope: 'LISTENING_READING',
            thumbnailUrl: null,
          },
        },
        progress: { totalLessons: 10, completedLessons: 0, progressPercent: 0 },
      },
    ]);

    renderWithAuth(<StudentFinancePage />);

    expect(await screen.findByRole('heading', { name: 'Học phí & Thanh toán' })).toBeInTheDocument();
    expect(screen.getByText('SETU998877')).toBeInTheDocument();
    expect(
      screen.getByText(/Chuyển khoản ngân hàng \(SePay xác nhận tự động\)/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Đối soát tự động thành công/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Vào lớp học ngay/ })).toHaveAttribute(
      'href',
      '/classroom/cls-paid',
    );

    // Ensure no leaked internal/dev strings or duplicate pending section
    const bodyText = document.body.textContent ?? '';
    expect(bodyText).not.toMatch(/Kiểm thử DEV|TEST HARNESS|Q01 \+ Q07|SEPAY_AUTO_VERIFIED|AUTO_SETTLED|Hồ sơ W07|MÔ PHỎNG TEST/);
    expect(screen.queryByRole('heading', { name: 'Hồ sơ học phí' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Đăng ký lớp khác đang chờ hoàn tất/)).not.toBeInTheDocument();

    // Filter tabs work
    fireEvent.click(screen.getByRole('tab', { name: /Đã thanh toán \(1\)/ }));
    await waitFor(() => {
      expect(screen.queryByText('SETU998877')).not.toBeInTheDocument();
    });
    expect(screen.getByText(/PT-20261114-9862A811/)).toBeInTheDocument();
  });

  it('hides DEV TEST HARNESS on /payments/sepay by default for students', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      unified: {
        serverTime: new Date().toISOString(),
        sepay: {
          configured: false,
          bankCode: null,
          gateway: null,
          accountNumberMasked: null,
          accountNumber: null,
          accountHolder: null,
          callbackPath: '/api/v2/payments/sepay/webhook',
        },
        summary: {
          totalReceivables: 0,
          unpaidOrHeldCount: 0,
          paidCount: 0,
          exceptionCount: 0,
          expiredCount: 0,
        },
        receivables: [],
        historicalLegacyW07: [],
      },
    } as never);

    renderWithAuth(<SePayPaymentsPage />, '/payments/sepay');
    expect(await screen.findByText(/Bạn chưa có khoản học phí nào/i)).toBeInTheDocument();
    expect(screen.queryByText(/DEV TEST HARNESS/i)).not.toBeInTheDocument();
  });
});
