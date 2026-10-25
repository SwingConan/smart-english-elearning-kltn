import { apiFetch } from '@/lib/api-client';

export type UserRole = 'STUDENT' | 'INSTRUCTOR' | 'ADMIN_COORDINATOR';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'LOCKED';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  phoneNumber?: string | null;
  role: UserRole;
  status: UserStatus;
  avatarKey?: string | null;
  createdAt?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  fullName: string;
}

export interface ConfirmPasswordResetInput {
  token: string;
  newPassword: string;
}

export const authApi = {
  me: () => apiFetch<AuthUser>('/auth/me'),
  login: (input: LoginInput) =>
    apiFetch<AuthUser>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  register: (input: RegisterInput) =>
    apiFetch<AuthUser>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  logout: () => apiFetch<void>('/auth/logout', { method: 'POST' }),
  requestPasswordReset: (email: string) =>
    apiFetch<void>('/auth/password-reset/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  confirmPasswordReset: (input: ConfirmPasswordResetInput) =>
    apiFetch<void>('/auth/password-reset/confirm', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};
