import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '@/features/auth/auth-context';
import { safeReturnUrl } from '@/features/auth/return-url';
import { ApiError } from '@/lib/api-client';

export function useAdminSessionExpiry() {
  const { refreshUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  return useCallback(
    async (error: unknown): Promise<boolean> => {
      if (!(error instanceof ApiError) || error.status !== 401) {
        return false;
      }

      await refreshUser();
      const returnUrl = safeReturnUrl(
        `${location.pathname}${location.search}${location.hash}`,
      );
      navigate(`/login?${new URLSearchParams({ returnUrl }).toString()}`, {
        replace: true,
      });
      return true;
    },
    [location.hash, location.pathname, location.search, navigate, refreshUser],
  );
}
