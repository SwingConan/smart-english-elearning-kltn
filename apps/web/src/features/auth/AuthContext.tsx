import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { AuthUser, authApi, LoginInput, RegisterInput } from './api';
import { AuthContext, AuthContextValue } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // An older session read must never restore a logged-out/replaced principal.
  const generation = useRef({ value: 0 });

  const refreshUser = useCallback(async () => {
    const current = ++generation.current.value;
    setIsLoading(true);
    setError(null);
    try {
      const next = await authApi.me();
      if (current === generation.current.value) setUser(next);
    } catch (requestError: unknown) {
      if (current !== generation.current.value) return;
      setUser(null);
      if (!(requestError instanceof ApiError && requestError.status === 401)) {
        setError('Không thể kết nối máy chủ. Vui lòng thử lại.');
      }
    } finally {
      if (current === generation.current.value) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isActive = true;
    const epoch = generation.current;
    const current = ++epoch.value;

    void authApi
      .me()
      .then((authenticatedUser) => {
        if (isActive && current === generation.current.value) {
          setUser(authenticatedUser);
          setError(null);
        }
      })
      .catch((requestError: unknown) => {
        if (isActive && current === generation.current.value) {
          setUser(null);
          if (!(requestError instanceof ApiError && requestError.status === 401)) {
            setError('Không thể kết nối máy chủ. Vui lòng thử lại.');
          }
        }
      })
      .finally(() => {
        if (isActive && current === generation.current.value) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
      epoch.value++;
    };
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const current = ++generation.current.value;
    try {
      const authenticatedUser = await authApi.login(input);
      if (current === generation.current.value) {
        setUser(authenticatedUser);
        setError(null);
      }
      return authenticatedUser;
    } finally {
      if (current === generation.current.value) setIsLoading(false);
    }
  }, []);

  const register = useCallback((input: RegisterInput) => {
    return authApi.register(input);
  }, []);

  const logout = useCallback(async () => {
    const current = ++generation.current.value;
    try {
      await authApi.logout();
      if (current === generation.current.value) {
        setUser(null);
        setError(null);
        setIsLoading(false);
      }
    } catch (requestError: unknown) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        if (current === generation.current.value) {
          setUser(null);
          setError(null);
          setIsLoading(false);
        }
        return;
      }
      throw requestError;
    } finally {
      if (current === generation.current.value) setIsLoading(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, error, login, register, logout, refreshUser }),
    [user, isLoading, error, login, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
