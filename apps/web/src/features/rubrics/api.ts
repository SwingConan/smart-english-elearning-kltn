import { apiFetch } from '@/lib/api-client';
export interface Rubric {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  createdById?: string | null;
  criteria: Array<{
    id?: string;
    code?: string;
    name: string;
    description?: string | null;
    maxScore: number | string;
    weight: number | string;
  }>;
}
export const rubricApi = {
  list: () => apiFetch<Rubric[]>('/instructor/rubrics'),
  get: (id: string) => apiFetch<Rubric & { canEdit: boolean }>(`/instructor/rubrics/${id}`),
  create: (input: Omit<Rubric, 'id' | 'isActive' | 'createdById'>) =>
    apiFetch<Rubric>('/instructor/rubrics', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: Omit<Rubric, 'id' | 'isActive' | 'createdById'>) =>
    apiFetch<Rubric>(`/instructor/rubrics/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  deactivate: (id: string) =>
    apiFetch<Rubric>(`/instructor/rubrics/${id}/deactivate`, { method: 'POST' }),
  reactivate: (id: string) =>
    apiFetch<Rubric>(`/instructor/rubrics/${id}/reactivate`, { method: 'POST' }),
};
