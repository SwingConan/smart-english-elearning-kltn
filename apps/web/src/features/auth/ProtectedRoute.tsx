import { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './auth-context';

export function ProtectedRoute({ children }: { children?: ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <p role="status">Đang kiểm tra phiên đăng nhập...</p>;
  }

  if (!user) {
    const returnUrl = `${location.pathname}${location.search}${location.hash}`;
    const query = new URLSearchParams({ returnUrl });
    return <Navigate to={`/login?${query.toString()}`} replace />;
  }

  return children ?? <Outlet />;
}
