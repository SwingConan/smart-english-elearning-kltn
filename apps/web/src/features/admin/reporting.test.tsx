import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api-client';
import { adminApi } from './api';
import { reportPreset, validateReportPeriod, vietnamToday } from './reporting-period';
import type { AdminSystemReport } from './types';

const report: AdminSystemReport = {
  generatedAt: '2026-10-23T05:00:00.000Z',
  snapshot: {
    accounts: {
      total: 9,
      byRole: { STUDENT: 6, INSTRUCTOR: 2, ADMIN_COORDINATOR: 1 },
      byStatus: { ACTIVE: 7, INACTIVE: 1, LOCKED: 1 },
    },
    courses: { total: 4, published: 3, draft: 1 },
    classes: {
      total: 5,
      byStatus: { DRAFT: 1, OPEN: 2, IN_PROGRESS: 1, COMPLETED: 1, CANCELLED: 0 },
      draftReadiness: { ready: 0, notReady: 1 },
      openRegistration: { AVAILABLE: 1, FULL: 1, UPCOMING: 0, CLOSED: 0 },
    },
    enrollments: {
      total: 7,
      byStatus: { ACTIVE: 4, PENDING_PAYMENT: 1, COMPLETED: 1, DROPPED: 1, CANCELLED: 0 },
    },
  },
  attention: { draftNotReady: 1, openFull: 1, pendingPayment: 1 },
  activity: {
    period: { from: '2026-09-24', to: '2026-10-23', days: 30, timeZone: 'Asia/Ho_Chi_Minh' },
    totals: { newEnrollments: 2, submittedAssessments: 3, lessonCompletions: 4 },
    daily: [
      { date: '2026-09-24', newEnrollments: 0, submittedAssessments: 0, lessonCompletions: 0 },
      { date: '2026-10-23', newEnrollments: 2, submittedAssessments: 3, lessonCompletions: 4 },
    ],
  },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('admin system reporting', () => {
  it('redirects /admin to reports and places the report first in navigation', async () => {
    vi.spyOn(adminApi.reports, 'system').mockResolvedValue(report);
    renderAdmin('/admin');
    expect(await screen.findByRole('heading', { name: 'Báo cáo hệ thống' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/reports');
    const navigation = screen.getByRole('navigation', { name: 'Điều hướng quản trị' });
    expect(navigation.querySelector('a')?.textContent).toContain('Báo cáo hệ thống');
  });

  it('announces initial loading and requests the backend default period', () => {
    const request = vi
      .spyOn(adminApi.reports, 'system')
      .mockReturnValue(new Promise(() => undefined));
    renderAdmin('/admin/reports');
    expect(screen.getByText('Đang tải báo cáo hệ thống...')).toHaveAttribute('role', 'status');
    expect(request).toHaveBeenCalledWith({}, expect.any(AbortSignal));
  });

  it('renders snapshot, attention, drill-throughs, notes, and zero activity rows', async () => {
    vi.spyOn(adminApi.reports, 'system').mockResolvedValue(report);
    renderAdmin('/admin/reports');
    expect(await screen.findByText('Tài khoản theo vai trò')).toBeInTheDocument();
    expect(screen.getByText('Lớp nháp chưa sẵn sàng')).toBeInTheDocument();
    expect(screen.getByText(/Ảnh chụp tổng quan phản ánh/)).toBeInTheDocument();
    expect(screen.getByText(/không suy diễn thanh toán thành công/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Xem chi tiết' })).toHaveLength(7);
    expect(screen.getByRole('link', { name: /Lớp nháp chưa sẵn sàng/ })).toHaveAttribute(
      'href',
      '/admin/class-offerings',
    );
    expect(screen.getByRole('row', { name: '2026-09-24 0 0 0' })).toBeInTheDocument();
  });

  it('applies 7/30/90-day presets as explicit inclusive ranges', async () => {
    const request = vi.spyOn(adminApi.reports, 'system').mockResolvedValue(report);
    renderAdmin('/admin/reports');
    await screen.findByText('Tài khoản theo vai trò');
    for (const days of [7, 30, 90] as const) {
      fireEvent.click(screen.getByRole('button', { name: `${days} ngày` }));
      await waitFor(() =>
        expect(request).toHaveBeenLastCalledWith(reportPreset(days), expect.any(AbortSignal)),
      );
    }
  });

  it('rejects invalid custom ranges without sending a request', async () => {
    const request = vi.spyOn(adminApi.reports, 'system').mockResolvedValue(report);
    renderAdmin('/admin/reports');
    await screen.findByText('Tài khoản theo vai trò');
    request.mockClear();
    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-10-23' } });
    fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-10-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Ngày bắt đầu không được sau');
    expect(request).not.toHaveBeenCalled();
  });

  it('submits a valid custom range', async () => {
    const request = vi.spyOn(adminApi.reports, 'system').mockResolvedValue(report);
    renderAdmin('/admin/reports');
    await screen.findByText('Tài khoản theo vai trò');
    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-10-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
    await waitFor(() =>
      expect(request).toHaveBeenLastCalledWith(
        { from: '2026-10-01', to: '2026-10-20' },
        expect.any(AbortSignal),
      ),
    );
  });

  it('shows an explicit all-zero activity notice', async () => {
    vi.spyOn(adminApi.reports, 'system').mockResolvedValue({
      ...report,
      activity: {
        ...report.activity,
        totals: { newEnrollments: 0, submittedAssessments: 0, lessonCompletions: 0 },
      },
    });
    renderAdmin('/admin/reports');
    expect(await screen.findByText('Không có hoạt động trong khoảng đã chọn.')).toBeInTheDocument();
  });

  it('shows a safe error and retries', async () => {
    vi.spyOn(adminApi.reports, 'system')
      .mockRejectedValueOnce(new Error('database secret'))
      .mockResolvedValueOnce(report);
    renderAdmin('/admin/reports');
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải báo cáo hệ thống');
    expect(screen.queryByText('database secret')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Tài khoản theo vai trò')).toBeInTheDocument();
  });

  it('uses the standard expired-session flow', async () => {
    vi.spyOn(adminApi.reports, 'system').mockRejectedValueOnce(new ApiError(401, null));
    const refreshUser = vi.fn().mockResolvedValue(undefined);
    renderAdmin('/admin/reports', refreshUser);
    await waitFor(() => expect(refreshUser).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        `/login?returnUrl=${encodeURIComponent('/admin/reports')}`,
      ),
    );
  });
});

describe('report period utilities', () => {
  it('uses Vietnam calendar boundaries for presets', () => {
    expect(vietnamToday(new Date('2026-10-23T17:00:00.000Z'))).toBe('2026-10-24');
    expect(reportPreset(7, new Date('2026-10-23T17:00:00.000Z'))).toEqual({
      from: '2026-10-18',
      to: '2026-10-24',
    });
  });

  it('validates completeness, ordering, and the inclusive 90-day maximum', () => {
    expect(validateReportPeriod('', '2026-01-01')).toMatch(/chọn đủ/);
    expect(validateReportPeriod('2026-02-30', '2026-03-01')).toMatch(/chọn đủ/);
    expect(validateReportPeriod('2026-02-02', '2026-02-01')).toMatch(/không được sau/);
    expect(validateReportPeriod('2026-01-01', '2026-04-01')).toMatch(/90 ngày/);
    expect(validateReportPeriod('2026-01-01', '2026-03-31')).toBeNull();
  });
});

function renderAdmin(path: string, refreshUser = vi.fn().mockResolvedValue(undefined)) {
  const value: AuthContextValue = {
    user: {
      id: 'admin',
      email: 'admin@example.test',
      fullName: 'Admin',
      role: 'ADMIN_COORDINATOR',
      status: 'ACTIVE',
    },
    isLoading: false,
    error: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser,
  };
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext.Provider value={value}>
        <App />
        <LocationProbe />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}
