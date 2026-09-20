import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ApiError } from '@/lib/api-client';
import { AuthUser, authApi, LoginInput, RegisterInput } from './api';
import { AuthContext, AuthContextValue } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshUser = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setUser(await authApi.me());
    } catch (requestError: unknown) {
      setUser(null);
      if (!(requestError instanceof ApiError && requestError.status === 401)) {
        setError('Không thể kết nối máy chủ. Vui lòng thử lại.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isActive = true;

    void authApi
      .me()
      .then((authenticatedUser) => {
        if (isActive) {
          setUser(authenticatedUser);
          setError(null);
        }
      })
      .catch((requestError: unknown) => {
        if (isActive) {
          setUser(null);
          if (!(requestError instanceof ApiError && requestError.status === 401)) {
            setError('Không thể kết nối máy chủ. Vui lòng thử lại.');
          }
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const authenticatedUser = await authApi.login(input);
    setUser(authenticatedUser);
    setError(null);
    return authenticatedUser;
  }, []);

  const register = useCallback((input: RegisterInput) => {
    return authApi.register(input);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
      setUser(null);
      setError(null);
    } catch (requestError: unknown) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        setUser(null);
        setError(null);
        return;
      }
      throw requestError;
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, error, login, register, logout, refreshUser }),
    [user, isLoading, error, login, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
