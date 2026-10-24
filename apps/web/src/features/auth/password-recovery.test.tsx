import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { authApi } from './api';
import { navigateAfterPasswordReset } from './hard-navigation';

vi.mock('./hard-navigation', () => ({ navigateAfterPasswordReset: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('ForgotPasswordPage', () => {
  it('renders the product copy and validates required and malformed email locally', async () => {
    const requestReset = vi.spyOn(authApi, 'requestPasswordReset');
    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Quên mật khẩu' })).toBeInTheDocument();
    expect(screen.getByText(/Nếu tài khoản phù hợp/)).toBeInTheDocument();
    expect(screen.queryByText('Vui lòng nhập email.')).not.toBeInTheDocument();
    fireEvent.blur(screen.getByLabelText('Email'));
    expect(screen.queryByText('Vui lòng nhập email.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi hướng dẫn' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Vui lòng nhập email');

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi hướng dẫn' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nhập email đúng định dạng');
    expect(requestReset).not.toHaveBeenCalled();
  });

  it('locks double-submit while loading and shows the exact generic success', async () => {
    let finish!: () => void;
    vi.spyOn(authApi, 'requestPasswordReset').mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' User@Example.com ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi hướng dẫn' }));
    expect(screen.getByRole('button', { name: 'Gửi hướng dẫn…' })).toBeDisabled();
    expect(authApi.requestPasswordReset).toHaveBeenCalledWith('User@Example.com');
    finish();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Nếu email này được liên kết với một tài khoản có thể khôi phục, hướng dẫn đặt lại mật khẩu đã được gửi. Vui lòng kiểm tra hộp thư và thư rác.',
    );
  });

  it('shows a neutral retry-later state for 429', async () => {
    vi.spyOn(authApi, 'requestPasswordReset').mockRejectedValueOnce(new ApiError(429, null));
    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi hướng dẫn' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Vui lòng thử lại sau');
    expect(screen.getByRole('alert')).not.toHaveTextContent(/tồn tại|bị khóa/i);
  });
});

describe('ResetPasswordPage', () => {
  it('shows the generic missing-token state with both recovery actions', () => {
    render(
      <MemoryRouter>
        <ResetPasswordPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('không hợp lệ hoặc đã hết hạn');
    expect(screen.getByRole('link', { name: 'Yêu cầu liên kết mới' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    expect(screen.getByRole('link', { name: 'Quay lại đăng nhập' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('validates minimum, maximum, and confirmation without exposing the raw token', async () => {
    window.history.replaceState(null, '', '/reset-password#token=secret-reset-token');
    const confirm = vi.spyOn(authApi, 'confirmPasswordReset');
    render(
      <MemoryRouter>
        <ResetPasswordPage />
      </MemoryRouter>,
    );
    expect(screen.queryByText('secret-reset-token')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Mật khẩu mới'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu mới'), {
      target: { value: 'different' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));
    expect(await screen.findByText('Mật khẩu phải có ít nhất 8 ký tự.')).toBeInTheDocument();
    expect(screen.getByText('Mật khẩu xác nhận chưa khớp.')).toBeInTheDocument();

    const tooLong = 'x'.repeat(129);
    fireEvent.change(screen.getByLabelText('Mật khẩu mới'), { target: { value: tooLong } });
    fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu mới'), {
      target: { value: tooLong },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));
    expect(await screen.findByText('Mật khẩu không được vượt quá 128 ký tự.')).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('maps every public 400 to the generic invalid-link state', async () => {
    window.history.replaceState(null, '', '/reset-password#token=test-token');
    vi.spyOn(authApi, 'confirmPasswordReset').mockRejectedValueOnce(
      new ApiError(400, { internal: 'expired' }),
    );
    render(
      <MemoryRouter>
        <ResetPasswordPage />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText('Mật khẩu mới'), { target: { value: 'new-password' } });
    fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu mới'), {
      target: { value: 'new-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('không hợp lệ hoặc đã hết hạn');
    expect(screen.queryByText('expired')).not.toBeInTheDocument();
  });

  it('captures the fragment token, clears it from history, and still posts it on success', async () => {
    window.history.replaceState(null, '', '/reset-password?source=email#token=test-token');
    vi.spyOn(authApi, 'confirmPasswordReset').mockResolvedValueOnce(undefined);
    render(
      <MemoryRouter>
        <ResetPasswordPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(window.location.hash).toBe(''));
    expect(window.location.pathname).toBe('/reset-password');
    expect(window.location.search).toBe('?source=email');
    fireEvent.change(screen.getByLabelText('Mật khẩu mới'), { target: { value: 'new-password' } });
    fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu mới'), {
      target: { value: 'new-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));
    await waitFor(() => expect(navigateAfterPasswordReset).toHaveBeenCalledOnce());
    expect(authApi.confirmPasswordReset).toHaveBeenCalledWith({
      token: 'test-token',
      newPassword: 'new-password',
    });
  });
});
