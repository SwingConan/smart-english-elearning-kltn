import type { AuthUser } from '@/features/auth/api';
import { apiFetch } from '@/lib/api-client';
export const profileApi = {
  get: () => apiFetch<AuthUser>('/users/me/profile'),
  update: (input: { fullName: string; phoneNumber?: string | null }) =>
    apiFetch<AuthUser>('/users/me/profile', { method: 'PATCH', body: JSON.stringify(input) }),
};
