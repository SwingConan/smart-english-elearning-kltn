import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { ApiError } from '@/lib/api-client';
import { AuthProvider } from './AuthContext';
import { useAuth } from './auth-context';
import { AuthUser, authApi } from './api';
import { ProtectedRoute } from './ProtectedRoute';
import { RoleRoute } from './RoleRoute';
import { safeReturnUrl } from './return-url';
import { AuthNavigation } from './AuthNavigation';
import { ToastProvider } from '@/components/ui/Feedback';

const student: AuthUser = {
  id: 'user-1',
  email: 'learner@example.test',
  fullName: 'Test Learner',
  role: 'STUDENT',
  status: 'ACTIVE',
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AuthProvider', () => {
  it('loads the current user and clears it after backend logout succeeds', async () => {
    vi.spyOn(authApi, 'me').mockResolvedValueOnce(student);
    vi.spyOn(authApi, 'logout').mockResolvedValueOnce(undefined);

    function SessionProbe() {
      const { user, isLoading, logout } = useAuth();
      if (isLoading) return <p>loading</p>;
      return (
        <div>
          <span>{user?.fullName ?? 'guest'}</span>
          <button onClick={() => void logout()} type="button">
            logout
          </button>
        </div>
      );
    }

    render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    );

    expect(await screen.findByText(student.fullName)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'logout' }));
    expect(await screen.findByText('guest')).toBeInTheDocument();
    expect(authApi.logout).toHaveBeenCalledOnce();
  });

  it('treats a 401 from the initial me request as a normal guest state', async () => {
    vi.spyOn(authApi, 'me').mockRejectedValueOnce(new ApiError(401, null));

    function GuestProbe() {
      const { user, isLoading, error } = useAuth();
      return <p>{isLoading ? 'loading' : `${user ? 'user' : 'guest'}:${error ?? 'no-error'}`}</p>;
    }

    render(
      <AuthProvider>
        <GuestProbe />
      </AuthProvider>,
    );
    expect(await screen.findByText('guest:no-error')).toBeInTheDocument();
  });
});

describe('AuthNavigation', () => {
  it('confirms logout, exposes a loading state, and announces completion', async () => {
    vi.spyOn(authApi, 'me').mockResolvedValueOnce(student);
    let finishLogout!: () => void;
    const logout = vi.spyOn(authApi, 'logout').mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishLogout = resolve;
        }),
    );

    render(
      <MemoryRouter>
        <AuthProvider>
          <ToastProvider>
            <AuthNavigation />
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Đăng xuất' }));
    const dialog = screen.getByRole('dialog', { name: 'Kết thúc phiên đăng nhập?' });
    expect(logout).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Đăng xuất' }));
    expect(within(dialog).getByRole('button', { name: 'Đang đăng xuất…' })).toBeDisabled();
    finishLogout();

    expect(await screen.findByText('Phiên đăng nhập đã kết thúc an toàn.')).toBeInTheDocument();
    expect(logout).toHaveBeenCalledOnce();
  });
});

describe('LoginPage', () => {
  it('lets the learner reveal and hide the password', async () => {
    vi.spyOn(authApi, 'me').mockRejectedValueOnce(new ApiError(401, null));
    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );
    const password = await screen.findByLabelText('Mật khẩu');
    expect(password).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
    expect(password).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Ẩn mật khẩu' }));
    expect(password).toHaveAttribute('type', 'password');
  });

  it('logs in and honors a safe internal returnUrl', async () => {
    vi.spyOn(authApi, 'me').mockRejectedValueOnce(new ApiError(401, null));
    vi.spyOn(authApi, 'login').mockResolvedValueOnce(student);

    render(
      <MemoryRouter initialEntries={['/login?returnUrl=/student']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/student" element={<h1>Student destination</h1>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: student.email },
    });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), {
      target: { value: 'valid-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByRole('heading', { name: 'Student destination' })).toBeInTheDocument();
    expect(authApi.login).toHaveBeenCalledWith({
      email: student.email,
      password: 'valid-password',
    });
  });

  it('shows a friendly invalid-credentials message', async () => {
    vi.spyOn(authApi, 'me').mockRejectedValueOnce(new ApiError(401, null));
    vi.spyOn(authApi, 'login').mockRejectedValueOnce(new ApiError(401, null));

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: student.email } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email hoặc mật khẩu không đúng');
  });

  it('rejects external or protocol-relative return URLs', () => {
    expect(safeReturnUrl('//evil.example')).toBe('/');
    expect(safeReturnUrl('https://evil.example')).toBe('/');
    expect(safeReturnUrl('/catalog?level=A1')).toBe('/catalog?level=A1');
  });
});

describe('RegisterPage', () => {
  it('forwards a sanitized Placement returnUrl to Login after registration', async () => {
    vi.spyOn(authApi, 'me').mockRejectedValueOnce(new ApiError(401, null));
    vi.spyOn(authApi, 'register').mockResolvedValueOnce(student);

    function LocationProbe() {
      const location = useLocation();
      return (
        <p data-testid="location">
          {location.pathname}
          {location.search}
        </p>
      );
    }

    render(
      <MemoryRouter initialEntries={['/register?returnUrl=/placement']}>
        <AuthProvider>
          <LocationProbe />
          <Routes>
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    fireEvent.change(await screen.findByLabelText('Họ và tên'), {
      target: { value: student.fullName },
    });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: student.email } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'valid-password' } });
    fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu'), {
      target: { value: 'valid-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng ký' }));

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/login?registered=1&returnUrl=%2Fplacement',
      ),
    );
  });

  it('registers without authenticating and redirects to the login success state', async () => {
    vi.spyOn(authApi, 'me').mockRejectedValueOnce(new ApiError(401, null));
    vi.spyOn(authApi, 'register').mockResolvedValueOnce(student);

    render(
      <MemoryRouter initialEntries={['/register']}>
        <AuthProvider>
          <Routes>
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText('Họ và tên'), {
      target: { value: student.fullName },
    });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: student.email } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'valid-password' } });
    fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu'), {
      target: { value: 'valid-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng ký' }));

    expect(
      await screen.findByText('Đăng ký tài khoản thành công. Vui lòng đăng nhập.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(authApi.register).toHaveBeenCalledOnce();
  });

  it('validates password confirmation before calling the API', async () => {
    vi.spyOn(authApi, 'me').mockRejectedValueOnce(new ApiError(401, null));
    const register = vi.spyOn(authApi, 'register');

    render(
      <MemoryRouter>
        <AuthProvider>
          <RegisterPage />
        </AuthProvider>
      </MemoryRouter>,
    );
    fireEvent.change(await screen.findByLabelText('Họ và tên'), {
      target: { value: student.fullName },
    });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: student.email } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'valid-password' } });
    fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu'), {
      target: { value: 'different-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng ký' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Mật khẩu xác nhận không khớp');
    expect(register).not.toHaveBeenCalled();
  });
});

describe('route guards', () => {
  it('redirects a guest to login with the current internal location', async () => {
    vi.spyOn(authApi, 'me').mockRejectedValueOnce(new ApiError(401, null));

    render(
      <MemoryRouter initialEntries={['/student/profile?tab=account']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/student/profile"
              element={
                <ProtectedRoute>
                  <h1>Private</h1>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
  });

  it('allows the configured role and renders 403 for another role', async () => {
    vi.spyOn(authApi, 'me').mockResolvedValue(student);

    const { rerender } = render(
      <MemoryRouter>
        <AuthProvider>
          <RoleRoute allowedRoles={['STUDENT']}>
            <h1>Allowed</h1>
          </RoleRoute>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Allowed' })).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <AuthProvider>
          <RoleRoute allowedRoles={['ADMIN_COORDINATOR']}>
            <h1>Admin</h1>
          </RoleRoute>
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/403/)).toBeInTheDocument());
  });
});
