import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/features/auth/AuthContext';
import { authApi } from '@/features/auth/api';
import { paymentApi } from '@/features/payments/api';
import { profileApi } from '@/features/profile/api';
import { ProfilePage } from '@/pages/ProfilePage';
import { StudentPaymentPage } from '@/pages/StudentPaymentPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('M11 profile and payment mutations', () => {
  it('loads, saves, and refreshes the authenticated profile', async () => {
    const currentUser = {
      id: 'learner-1',
      email: 'learner@example.com',
      fullName: 'Nguyễn An',
      phoneNumber: '0901000000',
      role: 'STUDENT' as const,
      status: 'ACTIVE' as const,
    };
    vi.spyOn(authApi, 'me').mockResolvedValue(currentUser);
    vi.spyOn(profileApi, 'get').mockResolvedValue(currentUser);
    const update = vi.spyOn(profileApi, 'update').mockResolvedValue({
      ...currentUser,
      fullName: 'Nguyễn An Mới',
    });

    render(
      <MemoryRouter>
        <AuthProvider>
          <ProfilePage />
        </AuthProvider>
      </MemoryRouter>,
    );

    const name = await screen.findByLabelText('Họ và tên');
    fireEvent.change(name, { target: { value: 'Nguyễn An Mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        fullName: 'Nguyễn An Mới',
        phoneNumber: '0901000000',
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Hồ sơ đã được cập nhật.');
    expect(authApi.me).toHaveBeenCalledTimes(2);
  });

  it('creates a server-priced payment and submits its bank reference without activating locally', async () => {
    const payment = {
      id: 'payment-1',
      status: 'PENDING',
      amountVnd: 2_500_000,
      referenceCode: 'SE-ABC123',
      createdAt: '2026-10-24T00:00:00.000Z',
    };
    const bank = {
      bankName: 'Vietcombank',
      account: '0123456789',
      accountName: 'SMART ENGLISH',
      transferPrefix: 'SE',
    };
    const enrollment = {
      id: 'enrollment-1',
      status: 'PENDING_PAYMENT',
      pricingTypeSnapshot: 'PAID',
      tuitionFeeVndSnapshot: 2_500_000,
      classOffering: {
        id: 'class-1',
        code: 'C01',
        name: 'Lớp TOEIC',
        course: { id: 'course-1', title: 'TOEIC 650' },
      },
    };
    const mine = vi
      .spyOn(paymentApi, 'mine')
      .mockResolvedValueOnce({ data: [], bank, enrollment })
      .mockResolvedValue({ data: [payment], bank, enrollment });
    vi.spyOn(paymentApi, 'create').mockResolvedValue({ ...payment, bank });
    const submit = vi.spyOn(paymentApi, 'submit').mockResolvedValue({
      ...payment,
      status: 'SUBMITTED',
    });

    render(
      <MemoryRouter initialEntries={['/student/enrollments/enrollment-1/payment']}>
        <Routes>
          <Route
            element={<StudentPaymentPage />}
            path="/student/enrollments/:enrollmentId/payment"
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Tạo yêu cầu thanh toán' }));
    expect(await screen.findByText('2.500.000 ₫')).toBeInTheDocument();
    expect(screen.getByText('PENDING')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Mã giao dịch ngân hàng'), {
      target: { value: 'VCB-9988' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đã chuyển khoản' }));

    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith('enrollment-1', 'payment-1', {
        payerReference: 'VCB-9988',
      }),
    );
    expect(mine).toHaveBeenCalledWith('enrollment-1');
  });
});
