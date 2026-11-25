import { useEffect, useState, type ReactNode } from 'react';
import { apiFetch } from '@/lib/api-client';
import { ProtectedRoute } from './ProtectedRoute';
type Capabilities = {
  accountsManage: boolean;
  authorityApprove: boolean;
  classRead: boolean;
  recoveryApprove: boolean;
};
export function PermissionRoute({
  capability,
  children,
}: {
  capability?: keyof Capabilities;
  children: ReactNode;
}) {
  return (
    <ProtectedRoute>
      <Gate key={capability ?? 'disabled'} capability={capability}>
        {children}
      </Gate>
    </ProtectedRoute>
  );
}
function Gate({ capability, children }: { capability?: keyof Capabilities; children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'allow' | 'deny'>('loading');
  useEffect(() => {
    let active = true;
    void apiFetch<{ capabilities: Capabilities }>('/workspace')
      .then((data) => {
        if (active) setState(capability && data.capabilities[capability] ? 'allow' : 'deny');
      })
      .catch(() => {
        if (active) setState('deny');
      });
    return () => {
      active = false;
    };
  }, [capability]);
  if (state === 'loading') return <p role="status">Đang kiểm tra quyền…</p>;
  if (state === 'deny')
    return (
      <section>
        <h1>403 — Không có quyền truy cập</h1>
        <p>Chức năng chưa được cấp quyền trong Wave01.</p>
      </section>
    );
  return children;
}
