import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { engagementApi } from '@/features/engagement/api';
import { paymentApi } from '@/features/payments/api';
import { datetimeLocalToIso, isoToDatetimeLocal } from '@/features/public-content/datetime';
import { ApiError } from '@/lib/api-client';
import { LiveClassPage } from '@/pages/LiveClassPage';
import { StudentPaymentPage } from '@/pages/StudentPaymentPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const payment = {
  id: 'p1',
  status: 'REJECTED',
  amountVnd: 1_200_000,
  referenceCode: 'SE-OLD',
  adminNote: 'Không tìm thấy giao dịch',
  createdAt: '2026-10-24T00:00:00Z',
};
const renderRoute = (node: React.ReactNode, path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={node} path={path.replace('e1', ':enrollmentId')} />
      </Routes>
    </MemoryRouter>,
  );

describe('M11 R2 product completeness', () => {
  it('shows rejection history and permits a fresh payment request', async () => {
    vi.spyOn(paymentApi, 'mine').mockResolvedValue({ data: [payment], bank: null });
    const create = vi.spyOn(paymentApi, 'create').mockResolvedValue({
      ...payment,
      status: 'PENDING',
      bank: { bankName: 'VCB', account: '123', accountName: 'SMART', transferPrefix: 'SE' },
    });
    renderRoute(<StudentPaymentPage />, '/student/enrollments/e1/payment');
    expect(await screen.findByText(/Không tìm thấy giao dịch/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo yêu cầu thanh toán mới' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith('e1'));
  });

  it('renders online join and a natural missing-link state', async () => {
    vi.spyOn(engagementApi, 'liveClass').mockResolvedValue({
      classOffering: {
        name: 'Lớp A',
        modality: 'HYBRID',
        scheduleSlots: [
          {
            id: 's1',
            dayOfWeek: 2,
            startTime: '1970-01-01T08:00:00Z',
            endTime: '1970-01-01T10:00:00Z',
            meetingUrl: 'https://meet.example/a',
          },
          {
            id: 's2',
            dayOfWeek: 4,
            startTime: '1970-01-01T08:00:00Z',
            endTime: '1970-01-01T10:00:00Z',
            meetingUrl: null,
          },
        ],
      },
    });
    renderRoute(<LiveClassPage />, '/student/enrollments/e1/live-class');
    expect(await screen.findByText(/Học kết hợp \(HYBRID\)/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vào phòng học' })).toHaveAttribute(
      'href',
      'https://meet.example/a',
    );
    expect(
      screen.getByText('Giảng viên/điều phối viên chưa cập nhật liên kết học trực tuyến.'),
    ).toBeInTheDocument();
  });

  it('distinguishes offline from network error and retries errors', async () => {
    const live = vi
      .spyOn(engagementApi, 'liveClass')
      .mockRejectedValueOnce(new ApiError(400, null));
    const first = renderRoute(<LiveClassPage />, '/student/enrollments/e1/live-class');
    expect(
      await screen.findByText('Lớp này không cấu hình phòng học trực tuyến.'),
    ).toBeInTheDocument();
    first.unmount();
    live.mockRejectedValueOnce(new ApiError(503, null)).mockResolvedValueOnce({
      classOffering: { name: 'Lớp A', modality: 'ONLINE', scheduleSlots: [] },
    });
    renderRoute(<LiveClassPage />, '/student/enrollments/e1/live-class');
    fireEvent.click(await screen.findByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText(/Học trực tuyến \(ONLINE\)/)).toBeInTheDocument();
  });

  it('round-trips the represented local minute without a UTC slice assumption', () => {
    const instant = '2026-06-15T08:30:00.000Z';
    const local = isoToDatetimeLocal(instant);
    expect(datetimeLocalToIso(local)).toBe(new Date(local).toISOString());
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(datetimeLocalToIso('')).toBeNull();
  });
});
