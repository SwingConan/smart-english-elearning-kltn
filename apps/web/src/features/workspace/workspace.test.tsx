import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import type { UserRole } from '@/features/auth/api';
import { workspaceApi } from './api';
const roles: UserRole[] = [
  'STUDENT',
  'INSTRUCTOR',
  'COUNSELOR',
  'ACADEMIC_MANAGER',
  'CASHIER',
  'TEACHING_INSPECTOR',
  'SYSTEM_ADMIN',
  'ADMIN_COORDINATOR',
];
const expectedHeadings: Record<UserRole, string> = {
  STUDENT: 'Trang học tập',
  INSTRUCTOR: 'Tổng quan giảng dạy',
  COUNSELOR: 'Tổng quan tư vấn',
  ACADEMIC_MANAGER: 'Tổng quan học vụ',
  CASHIER: 'Tổng quan thu ngân',
  TEACHING_INSPECTOR: 'Tổng quan thanh tra',
  SYSTEM_ADMIN: 'Tổng quan hệ thống',
  ADMIN_COORDINATOR: 'Tài khoản chờ xác nhận',
};
const classroom = {
  id: 'class-one',
  code: 'DEV-01',
  name: 'Scoped DEV class',
  course: { id: 'course', title: 'Synthetic English', level: 'A2' },
  instructor: { id: 'teacher', fullName: 'DEV teacher' },
  status: 'IN_PROGRESS',
  activeLearnerCount: 3,
};
const state = (role: UserRole) => ({
  role,
  capabilities: {
    accountsManage: role === 'SYSTEM_ADMIN',
    authorityApprove: false,
    classRead: role === 'ACADEMIC_MANAGER',
    recoveryApprove: false,
  },
});
function renderApp(role: UserRole, route = '/workspace') {
  const context: AuthContextValue = {
    user: {
      id: 'self',
      fullName: 'DEV user',
      email: 'dev@example.invalid',
      role,
      status: 'ACTIVE',
    },
    isLoading: false,
    error: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(state(role)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ),
  );
  vi.spyOn(workspaceApi, 'me').mockResolvedValue(state(role));
  vi.spyOn(workspaceApi, 'classes').mockResolvedValue({
    data: ['STUDENT', 'INSTRUCTOR', 'ACADEMIC_MANAGER'].includes(role) ? [classroom] : [],
  });
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthContext.Provider value={context}>
        <App />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('Wave01 actual App routes (no permission gate mock)', () => {
  it.each(['INSTRUCTOR', 'ACADEMIC_MANAGER'] as const)('%s menu points to existing staff authoring and assessment routes', async (role) => {
    renderApp(role);
    await screen.findByRole('heading', { name: expectedHeadings[role] });
    if (role === 'ACADEMIC_MANAGER') {
      expect(screen.getByRole('link', { name: 'Biên soạn kiến thức TOEIC' })).toHaveAttribute('href', '/knowledge/workspace');
    } else {
      expect(screen.queryByRole('link', { name: 'Biên soạn kiến thức TOEIC' })).not.toBeInTheDocument();
    }
    expect(screen.getByRole('link', {name:role==='INSTRUCTOR'?'Đề thi & Chấm đầu vào':'Điều phối đầu vào'})).toHaveAttribute('href','/workspace/placement');
    expect(screen.queryByRole('link',{name:'Thư viện kiến thức TOEIC'})).not.toBeInTheDocument();
  });
  it.each(roles)('%s gets a truthful role workspace', async (role) => {
    renderApp(role);
    expect(
      await screen.findByRole('heading', { name: expectedHeadings[role] }),
    ).toBeInTheDocument();
    if (['STUDENT', 'INSTRUCTOR', 'ACADEMIC_MANAGER'].includes(role))
      expect(await screen.findByText(/DEV-01 · Scoped DEV class/)).toBeInTheDocument();
    if (['COUNSELOR', 'CASHIER', 'TEACHING_INSPECTOR'].includes(role))
      expect(
        await screen.findByText(/Mở mục công việc tương ứng để thực hiện/),
      ).toBeInTheDocument();
    if (role === 'ADMIN_COORDINATOR')
      expect(await screen.findByText(/chưa được cấp quyền quản trị mới/)).toBeInTheDocument();
  });
  it.each(roles)('%s cannot force the legacy admin business UI route', async (role) => {
    renderApp(role, '/admin/courses');
    expect(await screen.findByText(/403/)).toBeInTheDocument();
  });
  it('QT has account UI but no S10 entry; HVU without explicit grant has no S10 entry', async () => {
    const qt = renderApp('SYSTEM_ADMIN');
    expect(
      await screen.findByRole('link', { name: 'Quản lý tài khoản, đề xuất và audit' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Duyệt khôi phục S10' })).not.toBeInTheDocument();
    qt.unmount();
    renderApp('ACADEMIC_MANAGER');
    expect(
      await screen.findByRole('heading', { name: 'Lớp trong phạm vi được phép' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Duyệt khôi phục S10' })).not.toBeInTheDocument();
  });
  it('foreign class denial never displays a cached class/roster', async () => {
    vi.spyOn(workspaceApi, 'detail').mockRejectedValue(new Error('404'));
    renderApp('STUDENT', '/workspace/classes/foreign');
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tìm thấy lớp');
    expect(screen.queryByText('DEV teacher')).not.toBeInTheDocument();
  });
  it('QT can propose a role with a reason; no approval button for the maker', async () => {
    vi.spyOn(workspaceApi, 'accounts').mockResolvedValue({
      data: [
        {
          id: 'target',
          email: 'target@example.invalid',
          fullName: 'DEV target',
          role: 'COUNSELOR',
          status: 'ACTIVE',
        },
      ],
    });
    vi.spyOn(workspaceApi, 'authority').mockResolvedValue({
      grants: [],
      roles: [
        {
          id: 'decision',
          userId: 'target',
          previousRole: 'COUNSELOR',
          nextRole: 'ACADEMIC_MANAGER',
          requestedBy: 'self',
          approvedBy: null,
          reason: 'Needs separate approval',
        },
      ],
      audit: [],
    });
    const action = vi.spyOn(workspaceApi, 'action').mockResolvedValue({});
    renderApp('SYSTEM_ADMIN', '/workspace/authority');
    await screen.findByRole('heading', { name: 'Tài khoản và phân quyền' });
    await screen.findByRole('button', { name: 'Chọn tài khoản' });
    fireEvent.click(screen.getByRole('button', { name: 'Chọn tài khoản' }));
    fireEvent.change(screen.getByLabelText('Lý do thay đổi'), {
      target: { value: 'Synthetic independent approval reason' },
    });
    fireEvent.change(screen.getByLabelText('Vai trò đề xuất'), {
      target: { value: 'ACADEMIC_MANAGER' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đề xuất vai trò' }));
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith('roles', {
        userId: 'target',
        nextRole: 'ACADEMIC_MANAGER',
        reason: 'Synthetic independent approval reason',
      }),
    );
    expect(screen.queryByRole('button', { name: 'Duyệt vai trò' })).not.toBeInTheDocument();
  });
});
