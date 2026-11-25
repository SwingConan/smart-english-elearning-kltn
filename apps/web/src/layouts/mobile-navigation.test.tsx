import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import type { UserRole } from '@/features/auth/api';
import { ToastProvider } from '@/components/ui/Feedback';
import { ActorWorkspaceLayout } from './ActorWorkspaceLayout';
import { StudentLayout } from './StudentLayout';
import { AdminLayout } from './AdminLayout';
import { PublicLayout } from './PublicLayout';
import { PlacementExamLayout } from './PlacementExamLayout';
import { usePlacementHeaderStatus } from './placement-header-status';

const logout = vi.fn();
let navigate: ReturnType<typeof useNavigate>;
function Content() {
  const go = useNavigate();
  useEffect(() => {
    navigate = go;
  }, [go]);
  return <h1>Trang kiểm tra điều hướng</h1>;
}
type Shell = 'actor' | 'student' | 'admin' | 'public' | 'placement';
const names: Record<Shell, [string, string]> = {
  actor: ['Mở menu điều hướng', 'Đóng menu điều hướng'],
  student: ['Mở điều hướng học tập', 'Đóng điều hướng học tập'],
  admin: ['Mở điều hướng quản trị', 'Đóng điều hướng quản trị'],
  public: ['Mở menu', 'Đóng menu'],
  placement: ['Mở menu điều hướng', 'Đóng menu điều hướng'],
};
function show(shell: Shell, role: UserRole = 'STUDENT', signedIn = shell !== 'public') {
  const context: AuthContextValue = {
    user: signedIn
      ? {
          id: 'fixture',
          fullName: 'Test user',
          email: 'test@example.invalid',
          role,
          status: 'ACTIVE',
        }
      : null,
    isLoading: false,
    error: null,
    login: vi.fn(),
    register: vi.fn(),
    logout,
    refreshUser: vi.fn(),
  };
  const layout = {
    actor: <ActorWorkspaceLayout />,
    student: <StudentLayout />,
    admin: <AdminLayout />,
    public: <PublicLayout />,
    placement: <PlacementExamLayout />,
  }[shell];
  return render(
    <MemoryRouter initialEntries={['/workspace']}>
      <AuthContext.Provider value={context}>
        <ToastProvider>
          <Routes>
            <Route element={layout}>
              <Route path="*" element={<Content />} />
            </Route>
          </Routes>
        </ToastProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  logout.mockReset();
  vi.stubGlobal('fetch', vi.fn());
  Object.defineProperty(window, 'innerWidth', { value: 390, writable: true, configurable: true });
});
afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
  vi.unstubAllGlobals();
  Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
});

describe('real mobile navigation components; offline context, no business requests', () => {
  it.each([
    ['STUDENT', 'Trang học tập'],
    ['INSTRUCTOR', 'Tổng quan giảng viên'],
    ['COUNSELOR', 'Tổng quan tư vấn'],
    ['ACADEMIC_MANAGER', 'Tổng quan học vụ'],
    ['CASHIER', 'Tổng quan thu ngân'],
    ['TEACHING_INSPECTOR', 'Tổng quan thanh tra'],
    ['SYSTEM_ADMIN', 'Tổng quan quản trị'],
  ] as const)(
    '%s opens scoped navigation, then Escape restores focus and background',
    (role, entry) => {
      const view = show('actor', role);
      const trigger = screen.getByRole('button', { name: names.actor[0] });
      fireEvent.click(trigger);
      const dialog = screen.getByRole('dialog', { name: 'Điều hướng không gian di động' });
      expect(within(dialog).getByRole('link', { name: entry })).toHaveAttribute(
        'href',
        '/workspace',
      );
      expect(within(dialog).getByRole('button', { name: names.actor[1] })).toHaveFocus();
      expect(view.container.inert).toBe(true);
      expect(document.body.style.overflow).toBe('hidden');
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
      expect(view.container.inert).toBe(false);
      expect(document.body.style.overflow).toBe('');
      expect(logout).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each(['actor', 'student', 'admin', 'public', 'placement'] as const)(
    '%s supports explicit close, backdrop, Tab, route and breakpoint cleanup',
    (shell) => {
      show(shell, shell === 'admin' ? 'ADMIN_COORDINATOR' : 'STUDENT');
      const [openName, closeName] = names[shell];
      const trigger = screen.getByRole('button', { name: openName });
      fireEvent.click(trigger);
      let dialog = screen.getByRole('dialog');
      const close = within(dialog).getByRole('button', { name: closeName });
      const last = [...dialog.querySelectorAll<HTMLElement>('*')].filter((el) =>
        el.matches('a[href],button:not(:disabled)'),
      );
      last[last.length - 1].focus();
      fireEvent.keyDown(last[last.length - 1], { key: 'Tab' });
      expect(close).toHaveFocus();
      fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
      expect(last[last.length - 1]).toHaveFocus();
      fireEvent.click(close);
      expect(trigger).toHaveFocus();
      fireEvent.click(trigger);
      fireEvent.click(document.querySelector('[data-drawer-backdrop]')!);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      fireEvent.click(trigger);
      dialog = screen.getByRole('dialog');
      fireEvent.click(within(dialog).getAllByRole('link')[0]);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      fireEvent.click(trigger);
      act(() => navigate('/profile?tab=account'));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      act(() => navigate(-1));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(document.body.style.overflow).toBe('');
      fireEvent.click(trigger);
      window.innerWidth = 1440;
      fireEvent(window, new Event('resize'));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(document.body.style.overflow).toBe('');
      window.innerWidth = 390;
      fireEvent(window, new Event('resize'));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(logout).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('keeps a nested public logout confirmation independent from the navigation drawer', () => {
    show('public', 'STUDENT', true);
    fireEvent.click(screen.getByRole('button', { name: 'Mở menu' }));
    const drawer = screen.getByRole('dialog', { name: 'Điều hướng di động' });
    fireEvent.click(within(drawer).getByText('Menu tài khoản').closest('summary')!);
    const logoutButton = within(drawer).getByRole('button', { name: 'Đăng xuất' });
    logoutButton.focus();
    fireEvent.click(logoutButton);
    const confirmation = screen.getByRole('dialog', { name: 'Kết thúc phiên đăng nhập?' });
    fireEvent.keyDown(within(confirmation).getByRole('button', { name: 'Ở lại' }), {
      key: 'Escape',
    });
    expect(drawer).toBeInTheDocument();
    expect(
      screen.queryByRole('dialog', { name: 'Kết thúc phiên đăng nhập?' }),
    ).not.toBeInTheDocument();
    expect(logoutButton).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    expect(logout).not.toHaveBeenCalled();
  });

  it.each(['STUDENT', 'INSTRUCTOR', 'SYSTEM_ADMIN'] as const)('keeps %s workspace links out of the public header and drawer', (role) => {
    const view = show('public', role, true);
    const header = view.container.querySelector('header')!;
    const destination = role === 'STUDENT' ? 'Vào trang học tập' : 'Vào không gian làm việc';
    expect(within(header).getByRole('link', { name: destination })).toHaveAttribute('href', '/workspace');
    expect(within(header).queryByRole('link', { name: 'Đăng nhập' })).not.toBeInTheDocument();
    expect(within(header).queryByRole('link', { name: 'Đăng ký' })).not.toBeInTheDocument();
    const allowed = ['/', '/catalog', '/placement', '/practice-tests', '/guide', '/news-events', '/about', '/workspace', '/profile'];
    for (const link of header.querySelectorAll('a')) expect(allowed).toContain(link.getAttribute('href'));
    fireEvent.click(within(header).getByText('Menu tài khoản').closest('summary')!);
    expect(within(header).getByRole('link', { name: 'Hồ sơ cá nhân' })).toHaveAttribute('href', '/profile');
    fireEvent.click(screen.getByRole('button', { name: 'Mở menu' }));
    const drawer = screen.getByRole('dialog', { name: 'Điều hướng di động' });
    expect(within(drawer).getByRole('link', { name: destination })).toHaveAttribute('href', '/workspace');
    for (const link of drawer.querySelectorAll('a')) expect(allowed).toContain(link.getAttribute('href'));
    expect(within(drawer).getByRole('link', { name: 'Tin tức & Sự kiện' })).toHaveAttribute('href', '/news-events');
    fireEvent.click(within(drawer).getByRole('link', { name: destination }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps guest sign-in and registration in both public navigation modes', () => {
    const view = show('public');
    const header = view.container.querySelector('header')!;
    expect(within(header).getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/login');
    expect(within(header).getByRole('link', { name: 'Đăng ký' })).toHaveAttribute('href', '/register');
    expect(within(header).queryByText('Menu tài khoản')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mở menu' }));
    const drawer = screen.getByRole('dialog');
    expect(within(drawer).getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/login');
    expect(within(drawer).getByRole('link', { name: 'Đăng ký' })).toHaveAttribute('href', '/register');
    expect(drawer.querySelectorAll('a')).toHaveLength(9);
  });

  it('hands admin logout to the existing confirmation with zero calls on cancel', () => {
    show('admin', 'ADMIN_COORDINATOR');
    const trigger = screen.getByRole('button', { name: names.admin[0] });
    fireEvent.click(trigger);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Đăng xuất' }));
    expect(
      screen.queryByRole('dialog', { name: 'Điều hướng quản trị trên thiết bị di động' }),
    ).not.toBeInTheDocument();
    const confirmation = screen.getByRole('dialog', { name: 'Kết thúc phiên đăng nhập?' });
    expect(within(confirmation).getByRole('button', { name: 'Ở lại' })).toHaveFocus();
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Ở lại' }));
    expect(trigger).toHaveFocus();
    expect(logout).not.toHaveBeenCalled();
  });

  it('restores pre-existing overflow and inert values on unmount', () => {
    const existing = document.createElement('div');
    existing.inert = true;
    document.body.append(existing);
    document.body.style.overflow = 'clip';
    const view = show('student');
    fireEvent.click(screen.getByRole('button', { name: names.student[0] }));
    view.unmount();
    expect(document.body.style.overflow).toBe('clip');
    expect(existing.inert).toBe(true);
    expect(view.container.inert).toBe(false);
    existing.remove();
  });

  it('PlacementExamLayout renders authoritative status badge instead of hardcoded Đang làm bài', () => {
    function StatusSetter({
      next,
    }: {
      next: 'IN_PROGRESS' | 'SUBMITTED_PENDING_REVIEW' | 'PUBLISHED' | null;
    }) {
      const { setStatus } = usePlacementHeaderStatus();
      useEffect(() => {
        setStatus(next);
      }, [next, setStatus]);
      return <p>Child route</p>;
    }
    const context: AuthContextValue = {
      user: {
        id: 'fixture',
        fullName: 'Test user',
        email: 'test@example.invalid',
        role: 'STUDENT',
        status: 'ACTIVE',
      },
      isLoading: false,
      error: null,
      login: vi.fn(),
      register: vi.fn(),
      logout,
      refreshUser: vi.fn(),
    };
    const { rerender } = render(
      <MemoryRouter initialEntries={['/placement/sittings/123/result']}>
        <AuthContext.Provider value={context}>
          <ToastProvider>
            <Routes>
              <Route element={<PlacementExamLayout />}>
                <Route path="*" element={<StatusSetter next={null} />} />
              </Route>
            </Routes>
          </ToastProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('placement-header-status-badge')).not.toBeInTheDocument();
    expect(screen.queryByText('Đang làm bài')).not.toBeInTheDocument();

    rerender(
      <MemoryRouter initialEntries={['/placement/sittings/123/result']}>
        <AuthContext.Provider value={context}>
          <ToastProvider>
            <Routes>
              <Route element={<PlacementExamLayout />}>
                <Route path="*" element={<StatusSetter next="PUBLISHED" />} />
              </Route>
            </Routes>
          </ToastProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('placement-header-status-badge')).toHaveTextContent(
      'Kết quả đã công bố',
    );
    expect(screen.queryByText('Đang làm bài')).not.toBeInTheDocument();

    rerender(
      <MemoryRouter initialEntries={['/placement/sittings/123/result']}>
        <AuthContext.Provider value={context}>
          <ToastProvider>
            <Routes>
              <Route element={<PlacementExamLayout />}>
                <Route path="*" element={<StatusSetter next="SUBMITTED_PENDING_REVIEW" />} />
              </Route>
            </Routes>
          </ToastProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('placement-header-status-badge')).toHaveTextContent(
      'Đã nộp — đang chờ chấm',
    );
    expect(screen.queryByText('Đang làm bài')).not.toBeInTheDocument();
  });
});
