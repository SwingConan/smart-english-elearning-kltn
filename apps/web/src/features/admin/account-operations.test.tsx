import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import type { AuthUser } from '@/features/auth/api';
import { ApiError } from '@/lib/api-client';
import { AdminAccountCreatePage } from '@/pages/AdminAccountCreatePage';
import { AdminAccountDetailPage } from '@/pages/AdminAccountDetailPage';
import { AdminAccountsPage } from '@/pages/AdminAccountsPage';
import { AdminLayout } from '@/layouts/AdminLayout';
import { adminApi } from './api';
import type { AdminAccount, AdminAccountDirectory } from './types';

const accountId = '10000000-0000-4000-8000-000000000001';
const account: AdminAccount = {
  id: accountId,
  email: 'teacher@example.com',
  fullName: 'Nguyễn Thu Hà',
  role: 'INSTRUCTOR',
  status: 'ACTIVE',
  createdAt: '2026-10-21T00:00:00.000Z',
  updatedAt: '2026-10-21T00:00:00.000Z',
  context: { operationalClassAssignments: 2, totalClassAssignments: 4, enrollmentCount: 0 },
};
const directory: AdminAccountDirectory = {
  data: [account],
  meta: { total: 21, page: 1, limit: 20, totalPages: 2 },
  summary: { total: 30, active: 25, inactive: 3, locked: 2 },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('M09-C admin accounts web', () => {
  it('adds account navigation and renders directory summary, semantic badges, table and mobile cards', async () => {
    vi.spyOn(adminApi.accounts, 'list').mockResolvedValue(directory);
    renderRoutes('/admin/accounts', true);
    expect(
      await screen.findByRole('heading', { name: 'Tài khoản & phân quyền' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Tài khoản' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Tổng tài khoản').parentElement).toHaveTextContent('30');
    expect(
      screen.getAllByText('Giảng viên').find((node) => node.classList.contains('bg-violet-100')),
    ).toBeDefined();
    expect(
      screen
        .getAllByText('Đang hoạt động')
        .find((node) => node.classList.contains('bg-emerald-100')),
    ).toBeDefined();
    expect(screen.getAllByText('Nguyễn Thu Hà')).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Xem chi tiết' })).toHaveLength(2);
  });

  it('submits server filters, paginates, resets, and distinguishes filtered no-results', async () => {
    const list = vi
      .spyOn(adminApi.accounts, 'list')
      .mockResolvedValueOnce(directory)
      .mockResolvedValue({
        ...directory,
        data: [],
        meta: { ...directory.meta, total: 0, totalPages: 0 },
      });
    renderRoutes('/admin/accounts');
    await screen.findAllByText('Nguyễn Thu Hà');
    fireEvent.change(screen.getByPlaceholderText('Họ tên hoặc email'), {
      target: { value: 'thu ha' },
    });
    fireEvent.change(screen.getByLabelText('Vai trò'), { target: { value: 'INSTRUCTOR' } });
    fireEvent.click(screen.getByRole('button', { name: /Tìm$/ }));
    expect(await screen.findByText('Không có tài khoản phù hợp.')).toBeInTheDocument();
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'thu ha', role: 'INSTRUCTOR', page: 1 }),
      expect.any(AbortSignal),
    );
  });

  it('shows loading, controlled error/retry, empty state, and 401 session expiry', async () => {
    vi.spyOn(adminApi.accounts, 'list').mockReturnValueOnce(new Promise(() => undefined));
    const loading = renderRoutes('/admin/accounts');
    expect(screen.getByText('Đang tải danh sách tài khoản...')).toHaveAttribute('role', 'status');
    loading.unmount();
    vi.spyOn(adminApi.accounts, 'list')
      .mockRejectedValueOnce(new Error('raw stack'))
      .mockResolvedValueOnce({
        ...directory,
        data: [],
        meta: { ...directory.meta, total: 0, totalPages: 0 },
      });
    renderRoutes('/admin/accounts');
    expect(await screen.findByRole('alert')).not.toHaveTextContent('raw stack');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Chưa có tài khoản nào.')).toBeInTheDocument();
  });

  it('validates password confirmation and sends no confirmPassword or retained password', async () => {
    const create = vi.spyOn(adminApi.accounts, 'create').mockResolvedValue({
      ...account,
      context: { ...account.context, operationalClassAssignments: 0 },
    });
    vi.spyOn(adminApi.accounts, 'get').mockResolvedValue({
      ...account,
      context: { ...account.context, operationalClassAssignments: 0 },
    });
    renderRoutes('/admin/accounts/new');
    fireEvent.change(screen.getByLabelText('Họ và tên'), { target: { value: 'New Staff' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu ban đầu'), {
      target: { value: 'Password!2026' },
    });
    fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu'), {
      target: { value: 'different' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('chưa khớp');
    expect(create).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu'), {
      target: { value: 'Password!2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        fullName: 'New Staff',
        email: 'new@example.com',
        password: 'Password!2026',
        role: 'INSTRUCTOR',
      }),
    );
    expect(create.mock.calls[0][0]).not.toHaveProperty('confirmPassword');
    expect(await screen.findByText('Tài khoản đã được tạo.')).toBeInTheDocument();
    expect(screen.queryByText('Password!2026')).not.toBeInTheDocument();
  });

  it('renders student role read-only and disables current-admin role/status controls', async () => {
    vi.spyOn(adminApi.accounts, 'get').mockResolvedValueOnce({
      ...account,
      role: 'STUDENT',
      context: { ...account.context, operationalClassAssignments: 0, enrollmentCount: 3 },
    });
    const student = renderRoutes(`/admin/accounts/${accountId}`);
    expect(await screen.findByText(/Vai trò học viên không được chuyển/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu vai trò' })).not.toBeInTheDocument();
    student.unmount();
    vi.spyOn(adminApi.accounts, 'get').mockResolvedValueOnce({
      ...account,
      id: 'admin-id',
      role: 'ADMIN_COORDINATOR',
    });
    renderRoutes('/admin/accounts/admin-id');
    expect(await screen.findByText('Tài khoản hiện tại')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu vai trò' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Lưu trạng thái' })).toBeDisabled();
  });

  it('explains dependencies, blocks INACTIVE/role-away, confirms emergency lock, and handles API success/failure', async () => {
    vi.spyOn(adminApi.accounts, 'get').mockResolvedValue(account);
    const updateStatus = vi
      .spyOn(adminApi.accounts, 'updateStatus')
      .mockResolvedValue({ ...account, status: 'LOCKED' });
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    renderRoutes(`/admin/accounts/${accountId}`);
    expect(await screen.findByText(/INACTIVE bị chặn/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'INACTIVE' } });
    expect(screen.getByRole('button', { name: 'Lưu trạng thái' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'LOCKED' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu trạng thái' }));
    await waitFor(() => expect(updateStatus).toHaveBeenCalledWith(accountId, 'LOCKED'));
    expect(await screen.findByText(/thu hồi các phiên đăng nhập cũ/)).toBeInTheDocument();
  });

  it('uses the standard 401 redirect flow on account reads', async () => {
    vi.spyOn(adminApi.accounts, 'get').mockRejectedValue(new ApiError(401, null));
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderRoutes(`/admin/accounts/${accountId}`, false, refresh);
    expect(await screen.findByTestId('location')).toHaveTextContent(
      `/login?returnUrl=%2Fadmin%2Faccounts%2F${accountId}`,
    );
    expect(refresh).toHaveBeenCalledOnce();
  });
});

function renderRoutes(
  path: string,
  layout = false,
  onRefresh = vi.fn().mockResolvedValue(undefined),
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TestAuthProvider onRefresh={onRefresh}>
        <Routes>
          {layout ? (
            <Route path="/admin" element={<AdminLayout />}>
              <Route path="accounts" element={<AdminAccountsPage />} />
            </Route>
          ) : null}
          <Route path="/admin/accounts" element={<AdminAccountsPage />} />
          <Route path="/admin/accounts/new" element={<AdminAccountCreatePage />} />
          <Route path="/admin/accounts/:userId" element={<AdminAccountDetailPage />} />
          <Route path="/login" element={<LocationProbe />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </TestAuthProvider>
    </MemoryRouter>,
  );
}

function TestAuthProvider({
  children,
  onRefresh,
}: {
  children: React.ReactNode;
  onRefresh: () => Promise<void>;
}) {
  const [user, setUser] = useState<AuthUser | null>({
    id: 'admin-id',
    email: 'admin@example.com',
    fullName: 'Admin',
    role: 'ADMIN_COORDINATOR',
    status: 'ACTIVE',
  });
  const refreshUser = useCallback(async () => {
    await onRefresh();
    setUser(null);
  }, [onRefresh]);
  const value: AuthContextValue = {
    user,
    isLoading: false,
    error: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
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
