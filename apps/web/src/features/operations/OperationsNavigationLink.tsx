import { Link } from 'react-router';
import { useAuth } from '@/features/auth/auth-context';
import { sectionsFor } from './model';

export function OperationsNavigationLink() {
  const { user } = useAuth();
  if (!user || user.status !== 'ACTIVE' || !sectionsFor(user.role).length) return null;
  return <Link to="/workspace/operations">Vận hành & báo cáo</Link>;
}
