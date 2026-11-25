import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthContext';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { ProtectedRoute } from './ProtectedRoute';
import { useAuth } from './auth-context';
import { authApi, type AuthUser } from './api';
const oldUser: AuthUser = {
  id: 'old',
  fullName: 'Old principal',
  email: 'old@example.invalid',
  role: 'STUDENT',
  status: 'ACTIVE',
};
const nextUser: AuthUser = { ...oldUser, id: 'new', fullName: 'New principal' };
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function Probe() {
  const a = useAuth();
  return (
    <>
      <p>{a.user?.fullName ?? 'guest'}</p>
      <p>{a.isLoading ? 'busy' : 'idle'}</p>
      <button onClick={() => void a.refreshUser()}>refresh</button>
      <button onClick={() => void a.logout()}>logout</button>
      <button
        onClick={() => void a.login({ email: 'new@example.invalid', password: 'synthetic-only' })}
      >
        login
      </button>
    </>
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('Session generation ordering', () => {
  it('discards protected component state when a different principal logs in', async () => {
    vi.spyOn(authApi, 'me').mockResolvedValue(oldUser);
    vi.spyOn(authApi, 'login').mockResolvedValue(nextUser);
    function Snapshot() {
      const { user } = useAuth();
      const [owner] = useState(user?.id);
      return <p>snapshot:{owner}</p>;
    }
    render(
      <MemoryRouter>
        <AuthProvider>
          <Probe />
          <ProtectedRoute>
            <Snapshot />
          </ProtectedRoute>
        </AuthProvider>
      </MemoryRouter>,
    );
    await screen.findByText('snapshot:old');
    fireEvent.click(screen.getByText('login'));
    await screen.findByText('snapshot:new');
    expect(screen.queryByText('snapshot:old')).not.toBeInTheDocument();
  });
  it('does not restore a principal from refresh that finishes after logout', async () => {
    const late = deferred<AuthUser>();
    vi.spyOn(authApi, 'me').mockResolvedValueOnce(oldUser).mockReturnValueOnce(late.promise);
    vi.spyOn(authApi, 'logout').mockResolvedValue(undefined);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByText('Old principal');
    fireEvent.click(screen.getByText('refresh'));
    fireEvent.click(screen.getByText('logout'));
    await screen.findByText('guest');
    await act(async () => late.resolve(oldUser));
    expect(screen.getByText('guest')).toBeInTheDocument();
    expect(screen.getByText('idle')).toBeInTheDocument();
  });
  it('does not let bootstrap me overwrite a newer login', async () => {
    const late = deferred<AuthUser>();
    vi.spyOn(authApi, 'me').mockReturnValue(late.promise);
    vi.spyOn(authApi, 'login').mockResolvedValue(nextUser);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    fireEvent.click(screen.getByText('login'));
    await screen.findByText('New principal');
    await act(async () => late.resolve(oldUser));
    expect(screen.queryByText('Old principal')).not.toBeInTheDocument();
  });
  it('keeps the latest refresh when earlier refresh completes last', async () => {
    const old = deferred<AuthUser>(),
      fresh = deferred<AuthUser>();
    vi.spyOn(authApi, 'me')
      .mockResolvedValueOnce(oldUser)
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(fresh.promise);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByText('Old principal');
    fireEvent.click(screen.getByText('refresh'));
    fireEvent.click(screen.getByText('refresh'));
    await act(async () => fresh.resolve(nextUser));
    await screen.findByText('New principal');
    await act(async () => old.resolve(oldUser));
    await waitFor(() => expect(screen.getByText('New principal')).toBeInTheDocument());
  });
});
