import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { engagementApi } from '@/features/engagement/api';
import { paymentApi } from '@/features/payments/api';
import { publicContentApi } from '@/features/public-content/api';
import { AdminPaymentsPage } from '@/pages/AdminPaymentsPage';
import { AdminPublicContentPage } from '@/pages/AdminPublicContentPage';
import { InstructorAttendancePage } from '@/pages/InstructorAttendancePage';
import { StudentPaymentPage } from '@/pages/StudentPaymentPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('M11 Source Gate R3 edge remediation', () => {
  it('sends explicit clear intent and refreshes an attendance row to unmarked', async () => {
    vi.spyOn(engagementApi.attendance, 'list').mockResolvedValue([
      { id: 'session-1', sessionDate: '2026-10-25T00:00:00Z', title: 'Buổi sáng' },
    ]);
    vi.spyOn(engagementApi.attendance, 'slots').mockResolvedValue([]);
    const detail = vi.spyOn(engagementApi.attendance, 'detail');
    detail
      .mockResolvedValueOnce({
        id: 'session-1',
        sessionDate: '2026-10-25T00:00:00Z',
        title: 'Buổi sáng',
        roster: [
          {
            id: 'enrollment-a',
            learner: { fullName: 'Nguyễn An', email: 'an@example.com' },
            attendance: { status: 'PRESENT', note: 'Đúng giờ' },
          },
          {
            id: 'enrollment-b',
            learner: { fullName: 'Trần Bình', email: 'binh@example.com' },
            attendance: { status: 'ABSENT', note: null },
          },
        ],
      })
      .mockResolvedValueOnce({
        id: 'session-1',
        sessionDate: '2026-10-25T00:00:00Z',
        title: 'Buổi sáng',
        roster: [
          {
            id: 'enrollment-a',
            learner: { fullName: 'Nguyễn An', email: 'an@example.com' },
            attendance: null,
          },
          {
            id: 'enrollment-b',
            learner: { fullName: 'Trần Bình', email: 'binh@example.com' },
            attendance: { status: 'ABSENT', note: null },
          },
        ],
      });
    const records = vi.spyOn(engagementApi.attendance, 'records').mockResolvedValue({});
    render(
      <MemoryRouter initialEntries={['/instructor/classes/class-1/attendance']}>
        <Routes>
          <Route
            path="/instructor/classes/:classOfferingId/attendance"
            element={<InstructorAttendancePage />}
          />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Buổi sáng/ }));
    fireEvent.change(await screen.findByLabelText('Trạng thái của Nguyễn An'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu điểm danh' }));
    await waitFor(() =>
      expect(records).toHaveBeenCalledWith(
        'class-1',
        'session-1',
        [expect.objectContaining({ enrollmentId: 'enrollment-b', status: 'ABSENT' })],
        ['enrollment-a'],
      ),
    );
    await waitFor(() => expect(screen.getByLabelText('Trạng thái của Nguyễn An')).toHaveValue(''));
  });

  it('offers authoritative class B even when the current payment page only contains class A', async () => {
    const admin = vi.spyOn(paymentApi, 'admin').mockResolvedValue({
      data: [
        {
          id: 'payment-a',
          status: 'SUBMITTED',
          amountVnd: 900_000,
          referenceCode: 'SE-A',
          createdAt: '2026-10-25T00:00:00Z',
          enrollment: {
            learner: { fullName: 'Nguyễn An', email: 'an@example.com' },
            classOffering: {
              id: 'class-a',
              code: 'A01',
              name: 'Lớp A',
              course: { title: 'TOEIC' },
            },
          },
        },
      ],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    });
    vi.spyOn(paymentApi, 'filterOptions').mockResolvedValue([
      { id: 'class-a', code: 'A01', name: 'Lớp A' },
      { id: 'class-b', code: 'B02', name: 'Lớp B' },
    ]);
    render(<AdminPaymentsPage />);
    const classFilter = await screen.findByLabelText('Lớp học');
    expect(screen.getByRole('option', { name: 'B02 — Lớp B' })).toBeInTheDocument();
    fireEvent.change(classFilter, { target: { value: 'class-b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lọc' }));
    await waitFor(() =>
      expect(admin).toHaveBeenLastCalledWith(
        expect.objectContaining({ classOfferingId: 'class-b', page: 1, limit: 20 }),
      ),
    );
  });

  it('renders immutable enrollment context before any payment exists', async () => {
    vi.spyOn(paymentApi, 'mine').mockResolvedValue({
      data: [],
      bank: null,
      enrollment: {
        id: 'enrollment-1',
        status: 'PENDING_PAYMENT',
        pricingTypeSnapshot: 'PAID',
        tuitionFeeVndSnapshot: 1_350_000,
        classOffering: {
          id: 'class-1',
          code: 'T650',
          name: 'TOEIC Buổi tối',
          course: { id: 'course-1', title: 'TOEIC 650+' },
        },
      },
    });
    render(
      <MemoryRouter initialEntries={['/student/enrollments/enrollment-1/payment']}>
        <Routes>
          <Route
            path="/student/enrollments/:enrollmentId/payment"
            element={<StudentPaymentPage />}
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText(/TOEIC 650\+ · T650 — TOEIC Buổi tối/)).toBeInTheDocument();
    expect(screen.getByText('Học phí cố định: 1.350.000 ₫')).toBeInTheDocument();
    expect(screen.getByText('Chưa có yêu cầu thanh toán.')).toBeInTheDocument();
  });

  it('selects, switches, and clears controlled public-content covers', async () => {
    vi.spyOn(publicContentApi, 'admin').mockResolvedValue([]);
    render(<AdminPublicContentPage />);
    const key = await screen.findByLabelText('Ảnh minh họa có sẵn');
    const url = screen.getByLabelText('Ảnh HTTPS');
    expect(screen.getByRole('option', { name: 'Luyện nghe' })).toHaveValue('listening');
    fireEvent.change(key, { target: { value: 'listening' } });
    expect(key).toHaveValue('listening');
    expect(url).toHaveValue('');
    fireEvent.change(url, { target: { value: 'https://example.com/cover.webp' } });
    expect(key).toHaveValue('');
    expect(url).toHaveValue('https://example.com/cover.webp');
    fireEvent.change(url, { target: { value: '' } });
    expect(key).toHaveValue('');
    expect(url).toHaveValue('');
  });
});
