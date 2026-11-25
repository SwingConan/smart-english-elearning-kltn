import { apiFetch } from '@/lib/api-client';
import type { UserRole } from '@/features/auth/api';
import type { AcademicTrack, AcademicTrackScopes, UserRole } from '../auth/api';

export type Workspace = {
  role: UserRole;
  academicTrack?: AcademicTrack;
  capabilities: {
    accountsManage: boolean;
    authorityApprove: boolean;
    classRead: boolean;
    recoveryApprove: boolean;
    academic?: AcademicTrackScopes;
  };
};
export type WorkspaceClass = {
  id: string;
  code: string;
  name: string;
  status: string;
  course: { id: string; title: string; level: string };
  instructor: { id: string; fullName: string } | null;
  activeLearnerCount: number;
  enrollments?: { id: string; status: string; learner?: { id: string; fullName: string } }[];
};
export type Grant = {
  id: string;
  userId: string;
  capability: string;
  scopeType: string;
  scopeId: string | null;
  requestedBy: string;
  approvedBy: string | null;
  revokedAt: string | null;
  effectiveAt: string;
  expiresAt: string;
  reason: string;
};
export type RoleDecision = {
  id: string;
  userId: string;
  previousRole: UserRole;
  nextRole: UserRole;
  requestedBy: string;
  approvedBy: string | null;
  reason: string;
};
export type Audit = {
  id: string;
  actorId: string;
  action: string;
  objectType: string;
  objectId: string;
  decision: string;
  reason: string;
  createdAt: string;
};
export type AuthorityOverview = { grants: Grant[]; roles: RoleDecision[]; audit: Audit[] };
export type Account = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: string;
};
export const workspaceApi = {
  me: () => apiFetch<Workspace>('/workspace'),
  classes: () => apiFetch<{ data: WorkspaceClass[] }>('/workspace/classes'),
  detail: (id: string) => apiFetch<WorkspaceClass>('/workspace/classes/' + encodeURIComponent(id)),
  authority: () => apiFetch<AuthorityOverview>('/authority'),
  accounts: (search = '') =>
    apiFetch<{ data: Account[] }>(
      '/admin/accounts?limit=100' + (search ? '&search=' + encodeURIComponent(search) : ''),
    ),
  action: (path: string, body: unknown = {}) =>
    apiFetch('/authority/' + path, { method: 'POST', body: JSON.stringify(body) }),
};
