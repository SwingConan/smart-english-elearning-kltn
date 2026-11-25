import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import type { UserRole } from '@/features/auth/api';
import { ToastProvider } from '@/components/ui/Feedback';
import { ActorWorkspaceLayout } from './ActorWorkspaceLayout';
import { StudentLayout } from './StudentLayout';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function show(role: UserRole) {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unit offline')));
  const auth: AuthContextValue = {
    user: {
      id: 'unit-learner',
      fullName: 'Học viên kiểm tra',
      email: 'unit@example.invalid',
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
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={auth}>
        <ToastProvider>
          {role === 'STUDENT' ? <StudentLayout /> : <ActorWorkspaceLayout />}
        </ToastProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

it('keeps DEC-007 learner top navigation and learning links without management controls', () => {
  show('STUDENT');
  const header = within(screen.getByRole('banner'));
  expect(header.getByText('Không gian học tập')).toBeInTheDocument();
  expect(header.getByRole('link', { name: 'Khóa học của tôi' })).toHaveAttribute(
    'href',
    '/student/enrollments',
  );
  expect(header.getByRole('link', { name: 'Lịch tháng' })).toHaveAttribute('href', '/my/');
  expect(header.getByRole('link', { name: 'Thư viện kiến thức' })).toHaveAttribute(
    'href',
    '/knowledge',
  );
  // The accepted learner-specific menu can coexist with the required friendly header.
  expect(screen.getByRole('navigation', { name: 'Điều hướng học tập' })).toBeInTheDocument();
  for (const link of screen.getAllByRole('link')) {
    expect(link.getAttribute('href')).not.toMatch(
      /^\/(?:academic|admin)(?:\/|$)|^\/workspace\/(?:authority|inspection|support)(?:\/|$)/,
    );
  }
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
});

it.each([
  ['INSTRUCTOR', '/my/'],
  ['COUNSELOR', '/workspace/support'],
  ['ACADEMIC_MANAGER', '/academic'],
  ['CASHIER', '/payments/sepay'],
  ['TEACHING_INSPECTOR', '/workspace/inspection'],
  ['SYSTEM_ADMIN', '/workspace/authority'],
] as const)('keeps the DEC-008 %s management navigation scoped to its role', (role, href) => {
  show(role);
  const sidebar = within(screen.getByRole('complementary'));
  expect(sidebar.getAllByRole('link').some((link) => link.getAttribute('href') === href)).toBe(
    true,
  );
  expect(screen.queryByRole('link', { name: 'Khóa học của tôi' })).not.toBeInTheDocument();
  if (role !== 'SYSTEM_ADMIN') {
    expect(
      sidebar.queryByRole('link', { name: 'Tài khoản và phân quyền' }),
    ).not.toBeInTheDocument();
  }
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
});
