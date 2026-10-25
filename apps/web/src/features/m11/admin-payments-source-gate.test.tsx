import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { paymentApi } from '@/features/payments/api';
import { AdminPaymentsPage } from '@/pages/AdminPaymentsPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('UC46 reconciliation workspace', () => {
  it('supports filters, responsive ledger, natural detail labels, verify and mandatory rejection', async () => {
    const payment = {
      id: 'payment-1',
      status: 'SUBMITTED',
      amountVnd: 1_200_000,
      referenceCode: 'SE-2026-001',
      payerReference: 'VCB-ABC',
      learnerNote: 'Đã chuyển khoản',
      createdAt: '2026-10-24T01:00:00.000Z',
      submittedAt: '2026-10-24T02:00:00.000Z',
      enrollment: {
        id: 'enrollment-1',
        status: 'ACTIVE',
        learner: { fullName: 'Nguyễn An', email: 'an@example.com' },
        classOffering: {
          id: 'class-1',
          code: 'TOEIC-A1',
          name: 'TOEIC Foundation',
          course: { title: 'TOEIC 4 kỹ năng' },
        },
      },
    };
    const admin = vi.spyOn(paymentApi, 'admin').mockResolvedValue({
      data: [payment],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    });
    vi.spyOn(paymentApi, 'filterOptions').mockResolvedValue([
      { id: 'class-1', code: 'TOEIC-A1', name: 'TOEIC Foundation' },
    ]);
    vi.spyOn(paymentApi, 'detail').mockResolvedValue(payment);
    const verify = vi.spyOn(paymentApi, 'verify').mockResolvedValue({
      ...payment,
      status: 'VERIFIED',
    });
    const reject = vi.spyOn(paymentApi, 'reject').mockResolvedValue({
      ...payment,
      status: 'REJECTED',
      adminNote: 'Không tìm thấy giao dịch',
    });
    const nativeConfirm = vi.spyOn(window, 'confirm');

    render(<AdminPaymentsPage />);

    expect(await screen.findByTestId('payment-ledger-table')).toBeInTheDocument();
    expect(screen.getByTestId('payment-ledger-cards')).toBeInTheDocument();
    expect(screen.getAllByText('Chuyển khoản ngân hàng').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Chờ đối soát').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('Tìm kiếm'), { target: { value: '  SE-2026-001  ' } });
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'SUBMITTED' } });
    await screen.findByRole('option', { name: 'TOEIC-A1 — TOEIC Foundation' });
    fireEvent.change(screen.getByLabelText('Lớp học'), { target: { value: 'class-1' } });
    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-10-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Áp dụng bộ lọc' }));
    await waitFor(() =>
      expect(admin).toHaveBeenLastCalledWith({
        search: 'SE-2026-001',
        status: 'SUBMITTED',
        classOfferingId: 'class-1',
        createdFrom: '2026-10-01',
        createdTo: '2026-10-31',
        page: 1,
        limit: 20,
      }),
    );

    fireEvent.click((await screen.findAllByRole('button', { name: 'Xem chi tiết' }))[0]);
    const detail = await screen.findByRole('dialog', { name: 'Chi tiết đối soát' });
    expect(within(detail).getByText('Đang học')).toBeInTheDocument();
    expect(detail).not.toHaveTextContent('ACTIVE');
    expect(detail).not.toHaveTextContent('PENDING_PAYMENT');
    expect(within(detail).getByText('VCB-ABC')).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole('button', { name: 'Đóng' }));

    fireEvent.click((await screen.findAllByRole('button', { name: 'Xác minh' }))[0]);
    expect(
      await screen.findByRole('dialog', { name: 'Xác nhận đã nhận thanh toán?' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xác minh thanh toán' }));
    await waitFor(() => expect(verify).toHaveBeenCalledWith('payment-1'));
    expect(nativeConfirm).not.toHaveBeenCalled();

    fireEvent.click((await screen.findAllByRole('button', { name: 'Từ chối' }))[0]);
    expect(screen.getByRole('button', { name: 'Xác nhận từ chối' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Lý do từ chối'), {
      target: { value: 'Không tìm thấy giao dịch' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận từ chối' }));
    await waitFor(() =>
      expect(reject).toHaveBeenCalledWith('payment-1', 'Không tìm thấy giao dịch'),
    );
  });
});
