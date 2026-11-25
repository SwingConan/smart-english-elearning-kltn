import { apiFetch } from '@/lib/api-client';
export type LearnerFinance = {
  id: string;
  state: string;
  amountVnd: number | null;
  createdAt: string;
  demonstration: boolean;
  class: { id: string; name: string; code: string };
  obligation: {
    dueVnd: number;
    paidVnd: number;
    remainingVnd: number;
    dueAt: string | null;
    state: string;
  } | null;
  evidence: { id: string; amountVnd: number; createdAt: string; state: string }[];
};
export const learnerFinance = (id?: string) =>
  apiFetch<{ data: LearnerFinance[] }>('/v2/my/finance' + (id ? '/' + encodeURIComponent(id) : ''));
