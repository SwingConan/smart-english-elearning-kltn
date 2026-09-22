/* eslint-disable react-refresh/only-export-components */
import { useCallback, useState, type ReactNode } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import type { AuthUser } from '@/features/auth/api';

export function renderAssessmentRoute(
  element: ReactNode,
  path: string,
  route: string,
  options: { includeLogin?: boolean; refreshUser?: () => Promise<void>; role?: AuthUser['role'] } = {},
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AssessmentAuthProvider refreshUser={options.refreshUser} role={options.role}>
        <Routes>
          <Route path={route} element={element} />
          {options.includeLogin && (
            <Route path="/login" element={<><span>Login page</span><LocationProbe /></>} />
          )}
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </AssessmentAuthProvider>
    </MemoryRouter>,
  );
}

export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function AssessmentAuthProvider({
  children,
  refreshUser = vi.fn().mockResolvedValue(undefined),
  role = 'STUDENT',
}: {
  children: ReactNode;
  refreshUser?: () => Promise<void>;
  role?: AuthUser['role'];
}) {
  const [user, setUser] = useState<AuthUser | null>({
    id: `${role.toLowerCase()}-id`,
    email: `${role.toLowerCase()}@example.test`,
    fullName: role,
    role,
    status: 'ACTIVE',
  });
  const refresh = useCallback(async () => {
    await refreshUser();
    setUser(null);
  }, [refreshUser]);
  const value: AuthContextValue = {
    user,
    isLoading: false,
    error: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: refresh,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}
