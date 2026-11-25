import { apiFetch } from '@/lib/api-client';

export type UserRole = 'STUDENT' | 'INSTRUCTOR' | 'COUNSELOR' | 'ACADEMIC_MANAGER' | 'CASHIER' | 'TEACHING_INSPECTOR' | 'SYSTEM_ADMIN' | 'ADMIN_COORDINATOR';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'LOCKED';

export type AcademicTrack = 'TRAINING' | 'STUDENT_AFFAIRS' | null;

export interface AcademicTrackScopes {
  programs: boolean;
  planning: boolean;
  approvals: boolean;
  sessionEngagement: boolean;
  inspection: boolean;
  consultations: boolean;
  placement: boolean;
  certificates: boolean;
  knowledge: boolean;
  supportReferrals: boolean;
  admissions: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  avatarUrl?: string;
  academicTrack?: AcademicTrack;
  academicScopes?: AcademicTrackScopes;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  fullName: string;
  termsAccepted: boolean;
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
