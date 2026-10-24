import { apiFetch } from '@/lib/api-client';
import { apiUrl } from '@/lib/api-client';
export interface Certificate {
  id: string;
  certificateNumber: string;
  learnerNameSnapshot: string;
  learnerEmailSnapshot?: string;
  courseTitleSnapshot: string;
  classNameSnapshot: string;
  classCodeSnapshot: string;
  issuedAt: string;
  revokedAt?: string | null;
}
export interface CertificateAdminQuery {
  search?: string;
  status?: 'VALID' | 'REVOKED';
  issuedFrom?: string;
  issuedTo?: string;
  page?: number;
  limit?: number;
}
export interface Readiness {
  eligible: boolean;
  unmet: string[];
  evidence: {
    lesson: { percent: number; completed: number; total: number };
    attendance: { percent: number | null; coverageComplete: boolean };
    finalAssessment: { satisfied: boolean };
  };
  completion?: { certificate?: Certificate | null } | null;
}
export const certificateApi = {
  readiness: (enrollmentId: string) =>
    apiFetch<Readiness>(`/certificates/enrollments/${enrollmentId}/completion`),
  evaluate: (enrollmentId: string) =>
    apiFetch<Readiness>(`/certificates/enrollments/${enrollmentId}/evaluate`, { method: 'POST' }),
  mine: () => apiFetch<Certificate[]>('/certificates/my'),
  downloadUrl: (id: string) => apiUrl(`/certificates/${id}/download`),
  admin: (query: CertificateAdminQuery = {}) => {
    const params = new URLSearchParams();
    if (query.search) params.set('search', query.search);
    if (query.status) params.set('status', query.status);
    if (query.issuedFrom) params.set('issuedFrom', query.issuedFrom);
    if (query.issuedTo) params.set('issuedTo', query.issuedTo);
    params.set('page', String(query.page ?? 1));
    params.set('limit', String(query.limit ?? 20));
    return apiFetch<{ data: Certificate[]; meta: { total: number; totalPages: number } }>(
      `/admin/certificates?${params.toString()}`,
    );
  },
  revoke: (id: string, reason: string) =>
    apiFetch<Certificate>(`/admin/certificates/${id}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  policy: (classId: string) =>
    apiFetch<{
      minLessonCompletionPercent: number;
      minAttendancePercent: number | null;
      requireFinalAssessment: boolean;
    }>(`/admin/class-offerings/${classId}/completion-policy`),
  savePolicy: (
    classId: string,
    input: {
      minLessonCompletionPercent: number;
      minAttendancePercent: number | null;
      requireFinalAssessment: boolean;
    },
  ) =>
    apiFetch(`/admin/class-offerings/${classId}/completion-policy`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
};
