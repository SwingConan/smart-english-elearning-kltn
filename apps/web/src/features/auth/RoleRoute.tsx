import { ReactNode } from 'react';
import { Outlet } from 'react-router';
import { UserRole } from './api';
import { useAuth } from './auth-context';
import { ProtectedRoute } from './ProtectedRoute';

interface RoleRouteProps {
  allowedRoles: UserRole[];
  children?: ReactNode;
}

export function RoleRoute({ allowedRoles, children }: RoleRouteProps) {
  return (
    <ProtectedRoute>
      <RoleGate allowedRoles={allowedRoles}>{children}</RoleGate>
    </ProtectedRoute>
  );
}

function RoleGate({ allowedRoles, children }: RoleRouteProps) {
  const { user } = useAuth();

  if (!user || !allowedRoles.includes(user.role)) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-xl font-semibold">403 — Không có quyền truy cập</h1>
        <p className="mt-2 text-sm text-slate-700">
          Tài khoản của bạn không có quyền xem khu vực này.
        </p>
      </section>
    );
  }

  return children ?? <Outlet />;
}
