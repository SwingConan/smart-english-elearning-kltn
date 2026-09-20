import { apiFetch } from '@/lib/api-client';

export type UserRole = 'STUDENT' | 'INSTRUCTOR' | 'ADMIN_COORDINATOR';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'LOCKED';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  fullName: string;
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
};
