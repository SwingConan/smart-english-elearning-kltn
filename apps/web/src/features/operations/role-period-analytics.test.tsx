import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import type { AuthUser as PublicUser } from '@/features/auth/api';
import { RoleReportsPage } from './RoleReportsPage';
import type { PeriodAnalyticsReport } from './RolePeriodAnalyticsReport';

vi.mock('@/components/charts/ReportEChart', () => ({
  ReportEChart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div data-testid="mock-echart" aria-label={ariaLabel} />
  ),
}));

const sampleReport = (role: PeriodAnalyticsReport['role']): PeriodAnalyticsReport => ({
  role,
  roleLabel:
    role === 'COUNSELOR'
      ? 'Tư vấn viên & Chăm sóc học viên'
      : role === 'ACADEMIC_MANAGER'
        ? 'Quản lý Học vụ & Đào tạo'
        : role === 'INSTRUCTOR'
          ? 'Giảng viên phụ trách'
          : 'Học viên',
  reportTitle: `Báo cáo tổng hợp ${role}`,
  reportSubtitle: 'Mô tả phân tích số liệu thực tế trong kỳ.',
  generatedAt: '2026-11-16T09:00:00.000Z',
  timezone: 'Asia/Ho_Chi_Minh',
  actor: { id: 'u-1', fullName: 'Nguyễn Văn Demo', role },
  filters: {
    preset: 'THIS_MONTH',
    from: '2026-11-01',
    to: '2026-11-16',
    scopeId: null,
    scopeLabel: 'Tất cả phạm vi',
    scopeSelectLabel: 'Phạm vi lọc',
    scopeOptions: [{ id: 'scope-a', label: 'A — Phạm vi A' }],
  },
  kpis: [
    { id: 'k1', label: 'Chỉ số 1', value: 18, sublabel: 'Chi tiết 1', tone: 'indigo' },
    { id: 'k2', label: 'Chỉ số 2', value: '85%', sublabel: 'Chi tiết 2', tone: 'emerald' },
    { id: 'k3', label: 'Chỉ số 3', value: '2.5h', sublabel: 'Chi tiết 3', tone: 'sky' },
    { id: 'k4', label: 'Chỉ số 4', value: 7, sublabel: 'Chi tiết 4', tone: 'amber' },
  ],
  executiveSummary: ['Nhận định điều hành số 1.', 'Nhận định điều hành số 2.'],
  charts: {
    trend: {
      title: 'Diễn biến trong kỳ',
      subtitle: 'Theo mốc ngày',
      labels: ['01/11', '02/11'],
      series: [{ name: 'Chuỗi A', type: 'bar', color: '#4f46e5', data: [3, 5] }],
    },
    distribution: {
      title: 'Cơ cấu phân bổ',
      subtitle: 'Theo nhóm',
      kind: 'pie',
      items: [{ name: 'Nhóm 1', value: 10, color: '#4f46e5' }],
    },
  },
  breakdown: {
    title: 'Bảng phân rã chi tiết',
    subtitle: 'Tổng hợp theo nhóm',
    columns: [
      { key: 'code', label: 'Mã' },
      { key: 'count', label: 'Số lượng', align: 'right' },
    ],
    rows: [{ code: 'M1', count: 18 }],
    totals: { code: 'TỔNG CỘNG', count: 18 },
  },
  secondaryPanel: {
    title: 'Bảng tổng hợp phụ',
    subtitle: 'Dữ liệu bổ trợ',
    columns: [
      { key: 'name', label: 'Hạng mục' },
      { key: 'val', label: 'Giá trị', align: 'right' },
    ],
    rows: [{ name: 'Mục A', val: 4 }],
  },
  ledger: {
    title: 'Sổ chi tiết bản ghi',
    subtitle: 'Chi tiết giao dịch',
    columns: [
      { key: 'ref', label: 'Mã tham chiếu' },
      { key: 'summary', label: 'Nội dung' },
    ],
    rows: [
      {
        id: 'row-1',
        ref: 'REF-001',
        summary: 'Hỗ trợ học phí TOEIC',
        href: '/workspace/support/tickets/row-1',
        hrefLabel: 'Xem chi tiết',
      },
      {
        id: 'row-2',
        ref: '=SUM(A1)',
        summary: 'Mục khác cần kiểm tra',
        href: null,
      },
    ],
  },
  exportFilenameBase: 'bao-cao-demo',
});

function authCtx(role: PublicUser['role']): AuthContextValue {
  return {
    user: {
      id: 'u-1',
      email: `${role.toLowerCase()}@gmail.com`,
      fullName: 'Nguyễn Văn Demo',
      role,
      status: 'ACTIVE',
    },
    isLoading: false,
    error: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  };
}

describe('RolePeriodAnalyticsReport & RoleReportsPage multi-role', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v2/operations/role-reports/period-analytics')) {
          return new Response(JSON.stringify(sampleReport('COUNSELOR')), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(
          JSON.stringify({
            role: 'COUNSELOR',
            window: { date: '2026-11-16', startAt: '2026-11-15T17:00:00Z', endExclusive: '2026-11-16T17:00:00Z', timeZone: 'Asia/Ho_Chi_Minh' },
            sources: [],
            metrics: { label: 'Số lượng', value: 0 },
            formalReportAuthorized: false,
            csv: { available: false, reason: 'Chưa cấp quyền' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    'COUNSELOR',
    'ACADEMIC_MANAGER',
    'INSTRUCTOR',
    'STUDENT',
    'TEACHING_INSPECTOR',
    'SYSTEM_ADMIN',
  ] as const)(
    'renders period report tab and switches to daily activity tab for %s',
    async (role) => {
      render(
        <AuthContext.Provider value={authCtx(role)}>
          <MemoryRouter initialEntries={['/workspace/reports']}>
            <Routes>
              <Route path="/workspace/reports" element={<RoleReportsPage />} />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>,
      );

      expect(await screen.findByText('Báo cáo tổng hợp COUNSELOR')).toBeInTheDocument();
      expect(screen.getAllByTestId('mock-echart')).toHaveLength(2);
      expect(screen.getByText('TỔNG CỘNG')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Xem chi tiết' })).toHaveAttribute(
        'href',
        '/workspace/support/tickets/row-1',
      );

      const searchInput = screen.getByLabelText('Tìm trong sổ chi tiết');
      fireEvent.change(searchInput, { target: { value: 'học phí' } });
      expect(screen.getByText('REF-001')).toBeInTheDocument();
      expect(screen.queryByText('=SUM(A1)')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '7 ngày' }));
      await waitFor(() => {
        const calls = vi.mocked(fetch).mock.calls.map((c) => String(c[0]));
        expect(calls.some((u) => u.includes('preset=LAST_7D'))).toBe(true);
      });

      fireEvent.click(screen.getByRole('button', { name: 'Xuất Excel (.xls)' }));
      fireEvent.click(screen.getByRole('button', { name: 'Xuất CSV' }));
      expect(URL.createObjectURL).toHaveBeenCalledTimes(2);

      fireEvent.click(screen.getByRole('button', { name: 'Nhật ký hoạt động trong ngày' }));
      expect(await screen.findByRole('heading', { name: 'Báo cáo hoạt động trong ngày' })).toBeInTheDocument();
    },
  );
});
