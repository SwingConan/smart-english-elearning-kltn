import { useAuth } from '@/features/auth/auth-context';
import { ActorWorkspaceLayout } from './ActorWorkspaceLayout';
import { PublicLayout } from './PublicLayout';

export function LearnerServiceLayout() {
  const { user } = useAuth();
  return user?.role === 'STUDENT' ? <ActorWorkspaceLayout /> : <PublicLayout />;
}
