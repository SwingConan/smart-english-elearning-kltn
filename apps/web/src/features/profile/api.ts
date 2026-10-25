import type { AuthUser } from '@/features/auth/api';
import { apiFetch } from '@/lib/api-client';
export interface ProfileView extends AuthUser {
  avatarUrl?: string | null;
  summary?: {
    activeClasses: number;
    completedClasses: number;
    certificates: number;
    teachingClasses: number;
  };
}
export const profileApi = {
  get: () => apiFetch<ProfileView>('/users/me/profile'),
  update: (input: { fullName: string; phoneNumber?: string | null }) =>
    apiFetch<AuthUser>('/users/me/profile', { method: 'PATCH', body: JSON.stringify(input) }),
  uploadAvatar: (file: File) => {
    const body = new FormData();
    body.append('file', file);
    return apiFetch<ProfileView>('/users/me/profile/avatar', { method: 'POST', body });
  },
  removeAvatar: () => apiFetch<ProfileView>('/users/me/profile/avatar', { method: 'DELETE' }),
};
