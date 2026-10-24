import { apiFetch } from '@/lib/api-client';
export interface Payment {
  id: string;
  status: string;
  amountVnd: number;
  referenceCode: string;
  payerReference?: string | null;
  adminNote?: string | null;
  submittedAt?: string | null;
  createdAt: string;
  enrollment?: { learner?: { fullName: string; email: string }; classOffering?: { name: string } };
}
export interface BankInstructions {
  bankName: string;
  account: string;
  accountName: string;
  transferPrefix: string;
}
export const paymentApi = {
  mine: (enrollmentId: string) =>
    apiFetch<{ data: Payment[]; bank: BankInstructions | null }>(
      `/enrollments/${enrollmentId}/payments`,
    ),
  create: (enrollmentId: string) =>
    apiFetch<Payment & { bank: BankInstructions }>(`/enrollments/${enrollmentId}/payments`, {
      method: 'POST',
    }),
  submit: (
    enrollmentId: string,
    id: string,
    input: { payerReference?: string; learnerNote?: string },
  ) =>
    apiFetch<Payment>(`/enrollments/${enrollmentId}/payments/${id}/submitted`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  admin: () => apiFetch<{ data: Payment[] }>('/admin/payments'),
  verify: (id: string, adminNote?: string) =>
    apiFetch<Payment>(`/admin/payments/${id}/verify`, {
      method: 'POST',
      body: JSON.stringify({ adminNote }),
    }),
  reject: (id: string, reason: string) =>
    apiFetch<Payment>(`/admin/payments/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
};
