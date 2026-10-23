import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api-client';
import { adminApi } from './api';
import {
  buildAccountRoleOption,
  buildClassCapacityOption,
  buildClassStatusOption,
  buildEnrollmentDailyOption,
  buildEnrollmentDemandOption,
} from './report-echarts';
import { reportPreset, validateReportPeriod, vietnamToday } from './reporting-period';
import type { AdminSystemReport } from './types';

vi.mock('@/components/charts/ReportEChart', () => ({
  ReportEChart: ({
    ariaLabel,
    onDataClick,
  }: {
    ariaLabel: string;
    onDataClick?: (data: unknown) => void;
  }) => {
    const data =
      ariaLabel === 'Sĩ số ACTIVE và sức chứa theo lớp'
        ? { classOfferingId: 'class-1' }
        : ariaLabel === 'Lớp học theo trạng thái'
          ? { status: 'OPEN' }
          : ariaLabel === 'Tài khoản theo vai trò'
            ? { role: 'STUDENT' }
            : ariaLabel === 'Nhu cầu ghi danh theo lớp'
              ? { classOfferingId: 'class-1' }
              : { date: '2026-10-23' };
    return (
      <button
        aria-label={`Mô phỏng ${ariaLabel}`}
        onClick={() => onDataClick?.(data)}
        type="button"
      >
        {ariaLabel}
      </button>
    );
  },
}));

const classRow = {
  id: 'class-1',
  code: 'C1',
  name: 'Lớp 1',
  status: 'OPEN' as const,
  course: { id: 'course-1', title: 'TOEIC nền tảng' },
  instructor: { id: 'instructor-1', fullName: 'Giảng viên A' },
  activeEnrollments: 10,
  maxStudents: 10,
  remainingSeats: 0,
  registrationState: 'FULL' as const,
  operationalReadiness: { isReady: true, missing: [] },
  classStart: '2026-11-01T00:00:00.000Z',
};

const report: AdminSystemReport = {
  generatedAt: '2026-10-23T05:00:00.000Z',
  period: { from: '2026-09-24', to: '2026-10-23', days: 30, timeZone: 'Asia/Ho_Chi_Minh' },
  actionQueues: { draftNotReady: 1, openFull: 1, pendingPayment: 1, gradingBacklog: 2 },
  accounts: {
    total: 9,
    byRole: { STUDENT: 6, INSTRUCTOR: 2, ADMIN_COORDINATOR: 1 },
    byStatus: { ACTIVE: 7, INACTIVE: 1, LOCKED: 1 },
  },
  courses: { total: 4, published: 3, draft: 1 },
  classes: {
    total: 5,
    byStatus: { DRAFT: 1, OPEN: 2, IN_PROGRESS: 1, COMPLETED: 1, CANCELLED: 0 },
    capacity: { totalOperationalClasses: 3, items: [classRow], truncated: false },
  },
  enrollmentDemand: {
    totalNewEnrollments: 2,
    byClass: [
      {
        classOfferingId: 'class-1',
        classCode: 'C1',
        className: 'Lớp 1',
        courseId: 'course-1',
        courseTitle: 'TOEIC nền tảng',
        count: 2,
      },
    ],
    daily: [
      { date: '2026-09-24', count: 0 },
      { date: '2026-10-23', count: 2 },
    ],
  },
};

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('admin decision reporting', () => {
  it('redirects /admin to reports and renders the rebaselined decision surface', async () => {
    vi.spyOn(adminApi.reports, 'system').mockResolvedValue(report);
    renderAdmin('/admin');
    expect(await screen.findByRole('heading', { name: 'Báo cáo hệ thống' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/reports');
    expect(screen.getByRole('heading', { name: 'Cần xử lý' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Vận hành lớp' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nhu cầu ghi danh' })).toBeInTheDocument();
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('Bài đánh giá đã nộp');
    expect(text).not.toContain('Bài học hoàn tất');
    expect(text).not.toContain('Chi tiết theo ngày');
  });

  it('opens exact class, pending-payment, and grading queues with server queries', async () => {
    vi.spyOn(adminApi.reports, 'system').mockResolvedValue(report);
    const classes = vi.spyOn(adminApi.reports, 'classes').mockResolvedValue({
      data: [classRow],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
    const enrollments = vi
      .spyOn(adminApi.reports, 'enrollments')
      .mockResolvedValue({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } });
    const backlog = vi
      .spyOn(adminApi.reports, 'gradingBacklog')
      .mockResolvedValue({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } });
    renderAdmin('/admin/reports');
    await screen.findByRole('heading', { name: 'Cần xử lý' });

    fireEvent.click(screen.getByRole('button', { name: /Lớp nháp chưa sẵn sàng/ }));
    await waitFor(() =>
      expect(classes).toHaveBeenCalledWith(
        { status: 'DRAFT', readiness: 'NOT_READY', page: 1, limit: 10 },
        expect.any(AbortSignal),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Đóng chi tiết' }));

    fireEvent.click(screen.getByRole('button', { name: /Đăng ký có phí đang chờ xử lý/ }));
    await waitFor(() =>
      expect(enrollments).toHaveBeenCalledWith(
        { status: 'PENDING_PAYMENT', page: 1, limit: 10 },
        expect.any(AbortSignal),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Đóng chi tiết' }));

    fireEvent.click(
      screen.getAllByRole('button', { name: /Bài Speaking\/Writing chờ giảng viên duyệt/ })[0],
    );
    await waitFor(() =>
      expect(backlog).toHaveBeenCalledWith({ page: 1, limit: 10 }, expect.any(AbortSignal)),
    );
  });

  it('maps chart/status interactions to exact backend filters', async () => {
    vi.spyOn(adminApi.reports, 'system').mockResolvedValue(report);
    const classes = vi
      .spyOn(adminApi.reports, 'classes')
      .mockResolvedValue({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } });
    const accounts = vi.spyOn(adminApi.accounts, 'list').mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
      summary: { total: 0, active: 0, inactive: 0, locked: 0 },
    });
    const enrollments = vi
      .spyOn(adminApi.reports, 'enrollments')
      .mockResolvedValue({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } });
    renderAdmin('/admin/reports');
    await screen.findByRole('heading', { name: 'Vận hành lớp' });

    fireEvent.click(screen.getByRole('button', { name: 'Mô phỏng Lớp học theo trạng thái' }));
    await waitFor(() =>
      expect(classes).toHaveBeenCalledWith(
        { status: 'OPEN', page: 1, limit: 10 },
        expect.any(AbortSignal),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Đóng chi tiết' }));

    fireEvent.click(screen.getByRole('button', { name: 'Mô phỏng Tài khoản theo vai trò' }));
    await waitFor(() =>
      expect(accounts).toHaveBeenCalledWith(
        { role: 'STUDENT', page: 1, limit: 10 },
        expect.any(AbortSignal),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Đóng chi tiết' }));

    fireEvent.click(screen.getByRole('button', { name: 'Mô phỏng Nhu cầu ghi danh theo lớp' }));
    await waitFor(() =>
      expect(enrollments).toHaveBeenCalledWith(
        {
          from: report.period.from,
          to: report.period.to,
          classOfferingId: 'class-1',
          page: 1,
          limit: 10,
        },
        expect.any(AbortSignal),
      ),
    );
  });

  it('applies period presets only through the enrollment-demand report period', async () => {
    const request = vi.spyOn(adminApi.reports, 'system').mockResolvedValue(report);
    renderAdmin('/admin/reports');
    await screen.findByRole('heading', { name: 'Nhu cầu ghi danh' });
    fireEvent.click(screen.getByRole('button', { name: '7 ngày' }));
    await waitFor(() =>
      expect(request).toHaveBeenLastCalledWith(
        expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
        expect.any(AbortSignal),
      ),
    );
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

describe('report ECharts option builders', () => {
  it('enables aria/tooltips and retains exact IDs for clicks', () => {
    const capacity = buildClassCapacityOption(report.classes.capacity.items) as {
      aria: { show: boolean };
      tooltip: unknown;
      series: Array<{ data: Array<{ classOfferingId: string }> }>;
    };
    const status = buildClassStatusOption(report) as {
      tooltip: unknown;
      series: Array<{ data: Array<{ status: string }> }>;
    };
    const roles = buildAccountRoleOption(report) as {
      tooltip: unknown;
      series: Array<{ data: Array<{ role: string }> }>;
    };
    const demand = buildEnrollmentDemandOption(report) as {
      tooltip: unknown;
      series: Array<{ data: Array<{ classOfferingId: string }> }>;
    };
    const daily = buildEnrollmentDailyOption(report) as {
      tooltip: unknown;
      series: Array<{ data: Array<{ date: string }> }>;
    };
    expect(capacity.aria.show).toBe(true);
    expect(capacity.tooltip).toBeTruthy();
    expect(capacity.series[0].data[0].classOfferingId).toBe('class-1');
    expect(status.series[0].data.some((item) => item.status === 'OPEN')).toBe(true);
    expect(roles.series[0].data.some((item) => item.role === 'STUDENT')).toBe(true);
    expect(demand.series[0].data[0].classOfferingId).toBe('class-1');
    expect(daily.series[0].data[1].date).toBe('2026-10-23');
  });
});

describe('report period utilities', () => {
  it('uses Vietnam calendar boundaries and validates 90 days', () => {
    expect(vietnamToday(new Date('2026-10-23T17:00:00.000Z'))).toBe('2026-10-24');
    expect(reportPreset(7, new Date('2026-10-23T17:00:00.000Z'))).toEqual({
      from: '2026-10-18',
      to: '2026-10-24',
    });
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
