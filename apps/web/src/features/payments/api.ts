import { apiFetch } from '@/lib/api-client';

export type PaymentStatus = 'PENDING' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'CANCELLED';
export interface Payment {
  id: string;
  status: string;
  amountVnd: number;
  referenceCode: string;
  payerReference?: string | null;
  learnerNote?: string | null;
  adminNote?: string | null;
  submittedAt?: string | null;
  verifiedAt?: string | null;
  createdAt: string;
  enrollment?: {
    id?: string;
    status?: string;
    learner: { fullName: string; email: string };
    classOffering?: { id: string; name: string; code: string; course: { title: string } };
  };
}
export interface BankInstructions {
  bankName: string;
  account: string;
  accountName: string;
  transferPrefix: string;
}
export interface PaymentQuery {
  status?: PaymentStatus;
  classOfferingId?: string;
  search?: string;
  createdFrom?: string;
  createdTo?: string;
  page?: number;
  limit?: number;
}
const queryString = (query: PaymentQuery) => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  return params.toString();
};
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
  admin: (query: PaymentQuery = {}) =>
    apiFetch<{
      data: Payment[];
      meta?: { total: number; page: number; limit: number; totalPages: number };
    }>(`/admin/payments?${queryString(query)}`),
  detail: (id: string) => apiFetch<Payment>(`/admin/payments/${id}`),
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
