import { apiFetch } from '@/lib/api-client';
export interface LearningReport {
  enrollment: { status: string; classOffering: { name: string }; course: { title: string } };
  modules: Array<{
    id: string;
    title: string;
    lessons: Array<{ id: string; title: string; status: string }>;
  }>;
  assessments: Array<{ id: string; resultState: string; test: { title: string } }>;
  attendance: { totalSessions: number; markedSessions: number; percent: number | null };
  completion: { eligible: boolean; unmet: string[] };
  recommendations: Array<{ id: string; title: string; actionText: string }>;
}
export const reportApi = {
  get: (enrollmentId: string) =>
    apiFetch<LearningReport>(`/learning/enrollments/${enrollmentId}/report`),
};
