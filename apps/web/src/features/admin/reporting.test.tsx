import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  formatReportDate,
} from './report-echarts';
import { reportPreset, validateReportPeriod, vietnamToday } from './reporting-period';
import type { AdminReportClassRow, AdminSystemReport } from './types';

vi.mock('@/components/charts/ReportEChart', () => ({
  ReportEChart: ({
    ariaLabel,
    onDataClick,
  }: {
    ariaLabel: string;
    onDataClick?: (data: unknown) => void;
  }) => {
    if (ariaLabel === 'Ghi danh mới theo ngày') {
      return (
        <>
          <button
            aria-label="Mô phỏng ghi danh ngày 0"
            onClick={() => onDataClick?.({ date: '2026-09-24', value: 0 })}
            type="button"
          >
            {ariaLabel}
          </button>
          <button
            aria-label="Mô phỏng ghi danh ngày có phát sinh"
            onClick={() => onDataClick?.({ date: '2026-10-23', value: 2 })}
            type="button"
          >
            {ariaLabel}
          </button>
        </>
      );
    }
    const data =
      ariaLabel === 'Sĩ số đang học và sức chứa theo lớp'
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
  classStart: '2026-10-31T18:00:00.000Z',
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
    expect(document.body.textContent).toContain('Cập nhật 23/10/2026 12:00:00');
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('Bài đánh giá đã nộp');
    expect(text).not.toContain('Bài học hoàn tất');
    expect(text).not.toContain('Chi tiết theo ngày');
    expect(text).not.toContain('Theo dõi hàng đợi chấm Speaking/Writing');
    expect(text).not.toContain('Sĩ số ACTIVE');
    expect(
      screen.getByRole('button', { name: 'Mô phỏng Sĩ số đang học và sức chứa theo lớp' }),
    ).toBeInTheDocument();
    expect(screen.getByText('24/09/2026 – 23/10/2026')).toBeInTheDocument();
    expect(screen.getByText('23/10/2026')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('2026-09-24 – 2026-10-23');
  });

  it('uses natural wording when there are no operational classes', async () => {
    vi.spyOn(adminApi.reports, 'system').mockResolvedValue({
      ...report,
      classes: {
        ...report.classes,
        capacity: { totalOperationalClasses: 0, items: [], truncated: false },
      },
    });
    renderAdmin('/admin/reports');
    expect(await screen.findByText('Chưa có lớp đang mở hoặc đang diễn ra.')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Chưa có lớp OPEN hoặc IN_PROGRESS.');
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

  it('shows every backend readiness reason only for not-ready draft classes', async () => {
    vi.spyOn(adminApi.reports, 'system').mockResolvedValue(report);
    const draftNotReady: AdminReportClassRow = {
      ...classRow,
      status: 'DRAFT' as const,
      operationalReadiness: {
        isReady: false,
        missing: ['INSTRUCTOR_MISSING', 'SCHEDULE_MISSING', 'CLASS_DATES_MISSING'],
      },
    };
    const classes = vi
      .spyOn(adminApi.reports, 'classes')
      .mockResolvedValueOnce({
        data: [draftNotReady],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      })
      .mockResolvedValueOnce({
        data: [
          {
            ...draftNotReady,
            operationalReadiness: { isReady: true, missing: [] },
          },
        ],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      })
      .mockResolvedValueOnce({
        data: [classRow],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      });
    renderAdmin('/admin/reports');
    await screen.findByRole('heading', { name: 'Cần xử lý' });

    fireEvent.click(screen.getByRole('button', { name: /Lớp nháp chưa sẵn sàng/ }));
    expect(await screen.findByText('Chưa sẵn sàng vì:')).toBeInTheDocument();
    expect(screen.getByText('Chưa phân công giảng viên')).toBeInTheDocument();
    expect(screen.getByText('Chưa có lịch học')).toBeInTheDocument();
    expect(
      screen.getByText('Ngày bắt đầu/kết thúc lớp chưa được cấu hình đầy đủ hoặc chưa hợp lệ'),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('INSTRUCTOR_MISSING');
    expect(document.body.textContent).not.toContain('SCHEDULE_MISSING');
    expect(document.body.textContent).not.toContain('CLASS_DATES_MISSING');
    expect(screen.getByPlaceholderText('Tìm theo tên hoặc mã lớp')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Mở vận hành lớp/ })).toHaveAttribute(
      'href',
      '/admin/class-offerings/class-1/operations',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Đóng chi tiết' }));

    fireEvent.click(screen.getByRole('button', { name: /Lớp nháp chưa sẵn sàng/ }));
    const readyDraftDrawer = screen.getByRole('dialog');
    await within(readyDraftDrawer).findByText('C1 · Lớp 1');
    expect(within(readyDraftDrawer).queryByText('Chưa sẵn sàng vì:')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng chi tiết' }));

    fireEvent.click(screen.getByRole('button', { name: /Lớp đang mở đã đủ sĩ số/ }));
    const openFullDrawer = screen.getByRole('dialog');
    await within(openFullDrawer).findByText('C1 · Lớp 1');
    expect(within(openFullDrawer).queryByText('Chưa sẵn sàng vì:')).not.toBeInTheDocument();
    expect(classes).toHaveBeenLastCalledWith(
      { status: 'OPEN', registrationState: 'FULL', page: 1, limit: 10 },
      expect.any(AbortSignal),
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

  it('maps visible keyboard fallbacks to the same exact backend filters', async () => {
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

    fireEvent.click(
      within(screen.getByLabelText('Danh sách sĩ số lớp')).getByRole('button', {
        name: /C1 · Lớp 1/,
      }),
    );
    expect(screen.getByText('Sĩ số đang học')).toBeInTheDocument();
    expect(screen.getByText('01/11/2026')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Sĩ số ACTIVE');
    fireEvent.click(screen.getByRole('button', { name: 'Đóng chi tiết' }));

    fireEvent.click(
      within(screen.getByLabelText('Mở danh sách lớp theo trạng thái')).getByRole('button', {
        name: 'Đang mở: 2',
      }),
    );
    await waitFor(() =>
      expect(classes).toHaveBeenCalledWith(
        { status: 'OPEN', page: 1, limit: 10 },
        expect.any(AbortSignal),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Đóng chi tiết' }));

    fireEvent.click(
      within(screen.getByLabelText('Mở danh sách tài khoản theo vai trò')).getByRole('button', {
        name: 'Học viên: 6',
      }),
    );
    await waitFor(() =>
      expect(accounts).toHaveBeenCalledWith(
        { role: 'STUDENT', page: 1, limit: 10 },
        expect.any(AbortSignal),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Đóng chi tiết' }));

    fireEvent.click(
      within(screen.getByLabelText('Mở ghi danh theo lớp')).getByRole('button', {
        name: /C1.*Lớp 1.*TOEIC nền tảng.*2/,
      }),
    );
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
    fireEvent.click(screen.getByRole('button', { name: 'Đóng chi tiết' }));

    fireEvent.click(
      within(screen.getByLabelText('Mở ghi danh theo ngày có phát sinh')).getByRole('button', {
        name: /23\/10\/2026.*2 ghi danh/,
      }),
    );
    await waitFor(() =>
      expect(enrollments).toHaveBeenCalledWith(
        { from: '2026-10-23', to: '2026-10-23', page: 1, limit: 10 },
        expect.any(AbortSignal),
      ),
    );
  });

  it('makes zero-day chart data non-actionable and keeps non-zero chart/fallback parity', async () => {
    vi.spyOn(adminApi.reports, 'system').mockResolvedValue(report);
    const enrollments = vi
      .spyOn(adminApi.reports, 'enrollments')
      .mockResolvedValue({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } });
    renderAdmin('/admin/reports');
    await screen.findByRole('heading', { name: 'Ghi danh mới theo ngày' });

    fireEvent.click(screen.getByRole('button', { name: 'Mô phỏng ghi danh ngày 0' }));
    expect(enrollments).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mô phỏng ghi danh ngày có phát sinh' }));
    await waitFor(() =>
      expect(enrollments).toHaveBeenCalledWith(
        { from: '2026-10-23', to: '2026-10-23', page: 1, limit: 10 },
        expect.any(AbortSignal),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Đóng chi tiết' }));

    fireEvent.click(
      within(screen.getByLabelText('Mở ghi danh theo ngày có phát sinh')).getByRole('button', {
        name: /23\/10\/2026.*2 ghi danh/,
      }),
    );
    await waitFor(() => expect(enrollments).toHaveBeenCalledTimes(2));
    expect(enrollments).toHaveBeenLastCalledWith(
      { from: '2026-10-23', to: '2026-10-23', page: 1, limit: 10 },
      expect.any(AbortSignal),
    );
  });

  it('opens the exact operational full-list scope when capacity is truncated', async () => {
    vi.spyOn(adminApi.reports, 'system').mockResolvedValue({
      ...report,
      classes: {
        ...report.classes,
        capacity: { ...report.classes.capacity, totalOperationalClasses: 13, truncated: true },
      },
    });
    const classes = vi.spyOn(adminApi.reports, 'classes').mockResolvedValue({
      data: [classRow],
      meta: { page: 1, limit: 10, total: 13, totalPages: 2 },
    });
    renderAdmin('/admin/reports');

    fireEvent.click(await screen.findByRole('button', { name: 'Xem toàn bộ 13 lớp vận hành' }));
    await waitFor(() =>
      expect(classes).toHaveBeenCalledWith(
        { scope: 'OPERATIONAL', page: 1, limit: 10 },
        expect.any(AbortSignal),
      ),
    );
    expect(await screen.findByText('13 kết quả')).toBeInTheDocument();
  });

  it('reruns repeated drawer searches exactly once, resets later pages, and retries errors', async () => {
    vi.spyOn(adminApi.reports, 'system').mockResolvedValue(report);
    const classes = vi.spyOn(adminApi.reports, 'classes').mockImplementation(async (query) => ({
      data: [classRow],
      meta: { page: query?.page ?? 1, limit: 10, total: 11, totalPages: 2 },
    }));
    renderAdmin('/admin/reports');
    await screen.findByRole('heading', { name: 'Vận hành lớp' });
    fireEvent.click(screen.getByRole('button', { name: /Lớp nháp chưa sẵn sàng/ }));
    await waitFor(() => expect(classes).toHaveBeenCalledTimes(1));

    const dialog = screen.getByRole('dialog');
    const input = within(dialog).getByPlaceholderText('Tìm theo tên hoặc mã lớp');
    const submit = within(dialog).getByRole('button', { name: 'Tìm' });
    fireEvent.change(input, { target: { value: '  C1  ' } });
    fireEvent.click(submit);
    await waitFor(() => expect(classes).toHaveBeenCalledTimes(2));
    expect(classes).toHaveBeenLastCalledWith(
      { status: 'DRAFT', readiness: 'NOT_READY', search: 'C1', page: 1, limit: 10 },
      expect.any(AbortSignal),
    );

    fireEvent.click(submit);
    await waitFor(() => expect(classes).toHaveBeenCalledTimes(3));
    expect(within(dialog).queryByText('Đang tải dữ liệu...')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(submit);
    await waitFor(() => expect(classes).toHaveBeenCalledTimes(4));
    fireEvent.click(submit);
    await waitFor(() => expect(classes).toHaveBeenCalledTimes(5));
    expect(classes).toHaveBeenLastCalledWith(
      { status: 'DRAFT', readiness: 'NOT_READY', page: 1, limit: 10 },
      expect.any(AbortSignal),
    );

    fireEvent.click(within(dialog).getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(classes).toHaveBeenCalledTimes(6));
    expect(classes).toHaveBeenLastCalledWith(
      { status: 'DRAFT', readiness: 'NOT_READY', page: 2, limit: 10 },
      expect.any(AbortSignal),
    );
    fireEvent.click(submit);
    await waitFor(() => expect(classes).toHaveBeenCalledTimes(7));
    expect(classes).toHaveBeenLastCalledWith(
      { status: 'DRAFT', readiness: 'NOT_READY', page: 1, limit: 10 },
      expect.any(AbortSignal),
    );

    classes.mockRejectedValueOnce(new Error('temporary failure'));
    fireEvent.click(submit);
    expect(await within(dialog).findByText('Không thể tải danh sách.')).toBeInTheDocument();
    expect(classes).toHaveBeenCalledTimes(8);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(classes).toHaveBeenCalledTimes(9));
    expect(within(dialog).queryByText('Không thể tải danh sách.')).not.toBeInTheDocument();
  });

  it('renders a truthful zero-day fallback without creating day controls', async () => {
    vi.spyOn(adminApi.reports, 'system').mockResolvedValue({
      ...report,
      enrollmentDemand: {
        totalNewEnrollments: 0,
        byClass: [],
        daily: report.enrollmentDemand.daily.map((item) => ({ ...item, count: 0 })),
      },
    });
    renderAdmin('/admin/reports');
    expect(
      await screen.findByText('Không có ngày phát sinh ghi danh trong kỳ.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Mở ghi danh theo ngày có phát sinh')).not.toBeInTheDocument();
  });

  it('uses safe Admin links and Vietnamese primary labels in report drawers', async () => {
    vi.spyOn(adminApi.reports, 'system').mockResolvedValue(report);
    vi.spyOn(adminApi.accounts, 'list').mockResolvedValue({
      data: [
        {
          id: 'account-1',
          email: 'learner@example.test',
          fullName: 'Học viên Một',
          role: 'STUDENT',
          status: 'INACTIVE',
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
          context: { operationalClassAssignments: 0, totalClassAssignments: 0, enrollmentCount: 1 },
        },
      ],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      summary: { total: 1, active: 0, inactive: 1, locked: 0 },
    });
    vi.spyOn(adminApi.reports, 'enrollments').mockResolvedValue({
      data: [
        {
          id: 'enrollment-1',
          status: 'PENDING_PAYMENT',
          enrolledAt: '2026-10-23T02:00:00.000Z',
          learner: { id: 'account-1', fullName: 'Học viên Một', email: 'learner@example.test' },
          classOffering: { id: 'class-1', code: 'C1', name: 'Lớp 1' },
          course: { id: 'course-1', title: 'TOEIC nền tảng' },
        },
      ],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
    vi.spyOn(adminApi.reports, 'gradingBacklog').mockResolvedValue({
      data: [
        {
          attemptId: 'attempt-1',
          submittedAt: '2026-10-23T01:00:00.000Z',
          gradingState: 'PARTIALLY_REVIEWED',
          pendingProductiveAnswers: 1,
          totalProductiveAnswers: 2,
          learner: { id: 'account-1', fullName: 'Học viên Một', email: 'learner@example.test' },
          classOffering: { id: 'class-1', code: 'C1', name: 'Lớp 1' },
          course: { id: 'course-1', title: 'TOEIC nền tảng' },
          instructor: { id: 'instructor-1', fullName: 'Giảng viên Một' },
          assessment: { id: 'assessment-1', title: 'Bài giữa kỳ', stage: 'MIDTERM' },
        },
      ],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
    renderAdmin('/admin/reports');
    await screen.findByRole('heading', { name: 'Vận hành lớp' });

    fireEvent.click(
      within(screen.getByLabelText('Mở danh sách tài khoản theo vai trò')).getByRole('button', {
        name: 'Học viên: 6',
      }),
    );
    expect(await screen.findByText('Tạm ngưng')).toBeInTheDocument();
    expect(screen.getByText('Vai trò: Học viên')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng chi tiết' }));

    fireEvent.click(screen.getByRole('button', { name: /Đăng ký có phí đang chờ xử lý/ }));
    expect(await screen.findByText('Chờ xử lý đăng ký có phí')).toBeInTheDocument();
    expect(screen.getByText(/TOEIC nền tảng · 23\/10\/2026 09:00:00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng chi tiết' }));

    fireEvent.click(
      screen.getByRole('button', { name: /Bài Speaking\/Writing chờ giảng viên duyệt/ }),
    );
    const adminLink = await screen.findByRole('link', { name: /Mở vận hành lớp/ });
    expect(adminLink).toHaveAttribute('href', '/admin/class-offerings/class-1/operations');
    expect(document.querySelector('a[href^="/instructor/"][href*="/grading"]')).toBeNull();
    expect(screen.getByText(/Bài giữa kỳ · C1 · Lớp 1/)).toBeInTheDocument();
    expect(screen.getByText(/Còn 1\/2 câu Speaking\/Writing cần duyệt/)).toBeInTheDocument();
    expect(screen.getByText(/Giảng viên Một/)).toBeInTheDocument();
    expect(screen.getByText(/Nộp 23\/10\/2026 08:00:00/)).toBeInTheDocument();
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
      tooltip: {
        confine: boolean;
        renderMode: string;
        extraCssText: string;
        formatter: (input: unknown) => string;
      };
      xAxis: { name: string };
      series: Array<{ data: Array<{ classOfferingId: string }> }>;
    };
    const status = buildClassStatusOption(report) as {
      tooltip: unknown;
      series: Array<{ data: Array<{ status: string }> }>;
    };
    const roles = buildAccountRoleOption(report) as {
      tooltip: unknown;
      legend: { show: boolean; type?: string };
      series: Array<{ data: Array<{ role: string }> }>;
    };
    const demand = buildEnrollmentDemandOption(report) as {
      tooltip: {
        confine: boolean;
        renderMode: string;
        extraCssText: string;
        formatter: (input: unknown) => string;
      };
      yAxis: { data: string[] };
      series: Array<{ data: Array<{ classOfferingId: string }> }>;
    };
    const daily = buildEnrollmentDailyOption(report) as {
      tooltip: { formatter: (input: unknown) => string };
      xAxis: { axisLabel: { formatter: (value: string) => string } };
      series: Array<{
        type: string;
        smooth?: boolean;
        lineStyle?: unknown;
        areaStyle?: unknown;
        data: Array<{ date: string; value: number }>;
      }>;
    };
    expect(capacity.aria.show).toBe(true);
    expect(capacity.tooltip.confine).toBe(true);
    expect(capacity.tooltip.renderMode).toBe('html');
    expect(capacity.tooltip.extraCssText).toMatch(/max-width/);
    expect(capacity.tooltip.extraCssText).toMatch(/overflow-wrap:\s*anywhere/);
    const capacityTooltip = capacity.tooltip.formatter([{ data: { classOfferingId: 'class-1' } }]);
    expect(capacityTooltip).toContain('Bắt đầu: 01/11/2026');
    expect(capacityTooltip).not.toContain('Bắt đầu: 31/10/2026');
    expect(capacity.xAxis.name).toBe('Học viên đang học');
    expect(capacity.series[0].data[0].classOfferingId).toBe('class-1');
    expect(status.series[0].data.some((item) => item.status === 'OPEN')).toBe(true);
    expect(roles.legend.show).toBe(false);
    expect(roles.legend.type).toBeUndefined();
    expect(roles.series[0].data.some((item) => item.role === 'STUDENT')).toBe(true);
    expect(demand.yAxis.data).toEqual(['C1']);
    expect(demand.series[0].data[0].classOfferingId).toBe('class-1');
    expect(demand.tooltip.confine).toBe(true);
    expect(demand.tooltip.renderMode).toBe('html');
    expect(demand.tooltip.extraCssText).toMatch(/max-width/);
    expect(demand.tooltip.extraCssText).toMatch(/white-space:\s*normal/);
    expect(demand.tooltip.extraCssText).toMatch(/overflow-wrap:\s*anywhere/);
    const demandTooltip = demand.tooltip.formatter({
      data: { row: report.enrollmentDemand.byClass[0] },
    });
    expect(demandTooltip).toContain('<strong>C1</strong><br/>Lớp 1');
    expect(demandTooltip).toContain('TOEIC nền tảng');
    expect(demandTooltip).toContain('<strong>2</strong> ghi danh mới');

    const unsafeRow = {
      ...report.enrollmentDemand.byClass[0],
      classCode: '<C1>',
      className: 'Lớp & "Một"',
      courseTitle: "TOEIC <Nền tảng> 'A'",
    };
    const escapedDemand = buildEnrollmentDemandOption({
      ...report,
      enrollmentDemand: { ...report.enrollmentDemand, byClass: [unsafeRow] },
    }) as { tooltip: { formatter: (input: unknown) => string } };
    const escapedTooltip = escapedDemand.tooltip.formatter({ data: { row: unsafeRow } });
    expect(escapedTooltip).toContain('&lt;C1&gt;');
    expect(escapedTooltip).toContain('Lớp &amp; &quot;Một&quot;');
    expect(escapedTooltip).toContain('TOEIC &lt;Nền tảng&gt; &#39;A&#39;');
    expect(escapedTooltip).not.toContain('<Nền tảng>');
    expect(daily.series[0]).not.toHaveProperty('lineStyle');
    expect(daily.series[0]).not.toHaveProperty('areaStyle');
    expect(daily.series[0]).not.toHaveProperty('smooth');
    expect(daily.series[0].type).toBe('bar');
    expect(daily.series[0].data).toHaveLength(report.enrollmentDemand.daily.length);
    expect(daily.series[0].data[0]).toEqual({ date: '2026-09-24', value: 0 });
    expect(daily.series[0].data[1].date).toBe('2026-10-23');
    expect(daily.xAxis.axisLabel.formatter('2026-10-23')).toBe('23/10');
    expect(daily.tooltip.formatter([{ data: { date: '2026-10-23', value: 2 } }])).toContain(
      '23/10/2026',
    );
    expect(formatReportDate('not-an-iso-date')).toBe('not-an-iso-date');
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
