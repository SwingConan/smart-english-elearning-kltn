import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api-client';
import { adminApi } from './api';
import * as reportExport from './report-export';
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
    expect(await screen.findByRole('heading', { name: 'Tình hình vận hành' })).toBeInTheDocument();
    const snapshotHeading = screen.getByRole('heading', { name: 'Tổng quan hiện tại' });
    const activityHeading = screen.getByRole('heading', {
      name: 'Hoạt động trong khoảng thời gian đã chọn',
    });
    expect(
      snapshotHeading.compareDocumentPosition(activityHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'P' &&
          element.textContent ===
            'Tổng quan hiện tại phản ánh trạng thái tại thời điểm tải báo cáo. Bộ lọc ngày chỉ ảnh hưởng đến hoạt động trong khoảng thời gian đã chọn.',
      ),
    ).toBeInTheDocument();

    const activeCard = screen
      .getByRole('heading', { name: 'Ghi danh đang hiệu lực' })
      .closest('article');
    expect(activeCard).not.toBeNull();
    expect(within(activeCard!).getByText('4')).toBeInTheDocument();
    expect(
      within(activeCard!).getByText('Chỉ tính các ghi danh đang có hiệu lực.'),
    ).toBeInTheDocument();

    const pendingCard = screen
      .getByRole('heading', { name: 'Chờ xử lý đăng ký có phí' })
      .closest('article');
    expect(pendingCard).not.toBeNull();
    expect(within(pendingCard!).getByText('1')).toBeInTheDocument();
    expect(
      within(pendingCard!).getByText(/không đồng nghĩa đã thanh toán hoặc giữ chỗ/),
    ).toBeInTheDocument();
    expect(within(pendingCard!).getByRole('link', { name: /Xem lớp học/ })).toHaveAttribute(
      'href',
      '/admin/class-offerings',
    );

    expect(screen.getByText('Lớp nháp chưa sẵn sàng')).toBeInTheDocument();
    expect(screen.getAllByText(/chưa được xem là đã thanh toán/)).toHaveLength(2);
    expect(screen.getByRole('link', { name: /Lớp nháp chưa sẵn sàng/ })).toHaveAttribute(
      'href',
      '/admin/class-offerings',
    );
    expect(
      screen.getByRole('link', {
        name: /Đăng ký có phí đang chờ xử lýYêu cầu đăng ký có phí đang chờ được xử lý/,
      }),
    ).toHaveAttribute('href', '/admin/class-offerings');
    expect(screen.getByRole('row', { name: '2026-09-24 0 0 0' })).toBeInTheDocument();
  });

  it('renders accessible snapshot charts and an activity trend that retains zero days', async () => {
    vi.spyOn(adminApi.reports, 'system').mockResolvedValue(report);
    renderAdmin('/admin/reports');
    await screen.findByRole('heading', { name: 'Tình hình vận hành' });

    expect(screen.getByRole('img', { name: 'Lớp học theo trạng thái' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Ghi danh theo trạng thái' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Tài khoản theo vai trò' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Tài khoản theo trạng thái' })).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Tỷ lệ khóa học đã xuất bản và bản nháp' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: 'Biểu đồ hoạt động từ 2026-09-24 đến 2026-10-23, gồm đầy đủ 2 ngày',
      }),
    ).toBeInTheDocument();

    const lifecycleCard = screen
      .getByRole('heading', { name: 'Lớp học theo trạng thái' })
      .closest('article');
    expect(lifecycleCard).not.toBeNull();
    expect(within(lifecycleCard!).getByText('Đang mở')).toBeInTheDocument();
    expect(within(lifecycleCard!).getByText('2')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-date="2026-09-24"]')).toHaveLength(3);
    expect(document.querySelector('[data-date="2026-09-24"][data-value="0"]')).toBeInTheDocument();
  });

  it('applies 7/30/90-day presets as explicit inclusive ranges', async () => {
    const request = vi.spyOn(adminApi.reports, 'system').mockResolvedValue(report);
    renderAdmin('/admin/reports');
    await screen.findByRole('heading', { name: 'Tình hình vận hành' });
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
    await screen.findByRole('heading', { name: 'Tình hình vận hành' });
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
    await screen.findByRole('heading', { name: 'Tình hình vận hành' });
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
    expect(
      await screen.findByText(
        'Không ghi nhận hoạt động thuộc ba nhóm này trong khoảng thời gian đã chọn.',
      ),
    ).toBeInTheDocument();
  });

  it('retains the report and selected dates after a refresh failure, then retries the same query', async () => {
    let resolveRetry!: (value: AdminSystemReport) => void;
    const retryResult = new Promise<AdminSystemReport>((resolve) => {
      resolveRetry = resolve;
    });
    const request = vi
      .spyOn(adminApi.reports, 'system')
      .mockResolvedValueOnce(report)
      .mockRejectedValueOnce(new Error('refresh secret'))
      .mockReturnValueOnce(retryResult);
    renderAdmin('/admin/reports');
    await screen.findByRole('heading', { name: 'Tình hình vận hành' });

    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-10-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không thể cập nhật. Dữ liệu gần nhất vẫn được giữ lại.',
    );
    expect(screen.getByRole('row', { name: '2026-10-23 2 3 4' })).toBeInTheDocument();
    expect(screen.getByLabelText('Từ ngày')).toHaveValue('2026-10-01');
    expect(screen.getByLabelText('Đến ngày')).toHaveValue('2026-10-20');

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(screen.getByText('Đang cập nhật...')).toHaveAttribute('role', 'status');
    expect(request).toHaveBeenLastCalledWith(
      { from: '2026-10-01', to: '2026-10-20' },
      expect.any(AbortSignal),
    );

    resolveRetry(report);
    await waitFor(() => expect(screen.queryByText('Đang cập nhật...')).not.toBeInTheDocument());
  });

  it('refreshes the selected query, exports the loaded report, and invokes browser print', async () => {
    const request = vi.spyOn(adminApi.reports, 'system').mockResolvedValue(report);
    const exportReport = vi
      .spyOn(reportExport, 'downloadAdminReportCsv')
      .mockImplementation(() => undefined);
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    renderAdmin('/admin/reports');
    await screen.findByRole('heading', { name: 'Tình hình vận hành' });

    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-10-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
    await waitFor(() =>
      expect(request).toHaveBeenLastCalledWith(
        { from: '2026-10-01', to: '2026-10-20' },
        expect.any(AbortSignal),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Làm mới' }));
    await waitFor(() =>
      expect(request).toHaveBeenLastCalledWith(
        { from: '2026-10-01', to: '2026-10-20' },
        expect.any(AbortSignal),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Xuất CSV' }));
    expect(exportReport).toHaveBeenCalledWith(report);
    fireEvent.click(screen.getByRole('button', { name: 'In / Lưu PDF' }));
    expect(print).toHaveBeenCalledOnce();
  });

  it('keeps the daily table bounded on screen and omits unsupported metric headings', async () => {
    vi.spyOn(adminApi.reports, 'system').mockResolvedValue(report);
    renderAdmin('/admin/reports');
    await screen.findByRole('heading', { name: 'Chi tiết theo ngày' });

    expect(document.querySelector('.report-daily-scroll')).toHaveClass(
      'max-h-[30rem]',
      'overflow-auto',
    );
    for (const unsupported of [
      'Doanh thu',
      'Lợi nhuận',
      'Tỷ lệ chuyển đổi',
      'Điểm tương tác',
      'Dự báo bỏ học',
      'AI insight',
      'BKT mastery',
      'Tăng trưởng học tập',
    ]) {
      expect(screen.queryByRole('heading', { name: unsupported })).not.toBeInTheDocument();
    }
  });

  it('uses plain-language Vietnamese instead of implementation labels', async () => {
    vi.spyOn(adminApi.reports, 'system').mockResolvedValue(report);
    renderAdmin('/admin/reports');
    await screen.findByRole('heading', { name: 'Tình hình vận hành' });

    const visibleText = document.body.textContent ?? '';
    for (const required of [
      'Lớp học theo trạng thái',
      'Ghi danh theo trạng thái',
      'Tài khoản theo vai trò và trạng thái',
      'Bài đánh giá đã nộp',
      'Giờ Việt Nam (UTC+7)',
      'Cách đọc báo cáo',
    ]) {
      expect(visibleText).toContain(required);
    }
    for (const technical of [
      'UC43',
      'Enrollment.enrolledAt',
      'Bài assessment đã nộp',
      'Bức tranh vận hành',
      'Cơ cấu tài khoản',
      'Cơ cấu trạng thái ghi danh',
      'Vòng đời lớp học',
      'PENDING_PAYMENT',
    ]) {
      expect(visibleText).not.toContain(technical);
    }
  });

  it('shows a safe error and retries', async () => {
    vi.spyOn(adminApi.reports, 'system')
      .mockRejectedValueOnce(new Error('database secret'))
      .mockResolvedValueOnce(report);
    renderAdmin('/admin/reports');
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải báo cáo hệ thống');
    expect(screen.queryByText('database secret')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('heading', { name: 'Tình hình vận hành' })).toBeInTheDocument();
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
