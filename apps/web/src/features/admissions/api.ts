import { apiFetch } from '@/lib/api-client';
export const admissionsBase = '/v2/admissions-finance/';
export const readAdmission = <T>(path: string) => apiFetch<T>(admissionsBase + path);
export const W07Consent = 'W07_SYNTHETIC_ADMISSION_V1';
export type Offer = {
  id: string;
  code: string;
  name: string;
  course: string;
  amountVnd: number | null;
  pricingType: string | null;
  versionId: string | null;
  ready: boolean;
  consentVersion?: string;
  remainingSeats: number | null;
};
export type ApplicationRow = {
  id: string;
  state: string;
  number: number;
  lockVersion?: number;
  amountVnd: number | null;
  blockReason: string | null;
  class: { code: string; name: string };
  learner?: { fullName: string };
};
export type Detail = {
  synthetic: boolean;
  application: {
    id: string;
    state: string;
    number: number;
    lockVersion: number;
    amountVnd: number | null;
    pricingType: string | null;
    versionId: string | null;
    versionNumber: number | null;
    termsTitle: string | null;
    termsApprovedAt: string | null;
    blockReason: string | null;
    referralId: string | null;
    referralNumber: number | null;
    consentedAt: string;
    consentVersion: string;
    createdAt: string;
  };
  class: { id: string; code: string; name: string };
  learner: { fullName: string };
  permissions: {
    academic: boolean;
    finance: boolean;
    own: boolean;
    verify: boolean;
    proposeAdjustment: boolean;
    checkAdjustment: boolean;
  };
  obligation: {
    id: string;
    dueAt: string | null;
    duePolicy: string;
    currency: string;
    dueVnd: number;
    paidVnd: number;
    remainingVnd: number;
    creditPendingVnd: string;
    state: string;
    realSettlement: false;
  } | null;
  evidence: {
    id: string;
    amountVnd: number;
    status: string;
    createdAt: string;
    bytes: number;
    mimeType: string;
    sourceRef?: string;
    sha256?: string;
    downloadable: boolean;
  }[];
  events: {
    id: string;
    kind: string;
    amountVnd: number;
    excessVnd: number;
    parentId: string | null;
    reason: string;
    createdAt: string;
    synthetic: true;
  }[];
  adjustments: {
    id: string;
    eventId: string;
    makerId: string;
    kind: string;
    amountVnd: number;
    reason: string;
    evidence: string;
    state: string;
    blockReason: string | null;
    decision: { id: string; decision: string; reason: string } | null;
  }[];
  entitlements: {
    id: string;
    outcome: string;
    reasonCode: string;
    enrollmentId: string | null;
    previousStatus: string | null;
    createdAt: string;
  }[];
  cases: {
    id: string;
    kind: string;
    state: string;
    blockReason: string | null;
    targetClassId: string | null;
    reason: string;
    createdAt: string;
  }[];
  decisions: { id: string; kind: string; number: number; reason: string; createdAt: string }[];
};
export function vnd(value: number | string | null | undefined) {
  return value === null || value === undefined
    ? 'Chưa xác định'
    : new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
        maximumFractionDigits: 0,
      }).format(BigInt(value));
}
export const admissionLabels: Record<string, string> = {
  SUBMITTED: 'Chờ học vụ xét duyệt',
  BLOCKED_REVIEW: 'Cần xem xét hồ sơ',
  APPROVED: 'Hồ sơ đã được duyệt',
  REJECTED: 'Đã từ chối',
  CANCELLED: 'Đã hủy hồ sơ',
  PENDING_REVIEW: 'Đang chờ đối soát',
  PENDING_CAPACITY: 'Chờ sắp xếp lớp',
  ACTIVE: 'Đã kích hoạt lớp học',
  VERIFY: 'Đã xác minh chứng từ',
  REJECT: 'Từ chối chứng từ',
  REVERSAL: 'Bút toán điều chỉnh hoàn trả',
  REFUND: 'Yêu cầu hoàn phí · đang xử lý',
  ADJUSTMENT: 'Yêu cầu điều chỉnh học phí',
  PARTIAL_TEST: 'Đã thanh toán một phần · chưa kích hoạt lớp',
  SETTLED_TEST: 'Đã thanh toán đủ · chờ kích hoạt lớp',
  UNPAID: 'Chưa thanh toán',
  CREDIT_PENDING: 'Khoản thừa chờ đối soát',
  APPROVE: 'Đã duyệt',
  WITHDRAW: 'Rút hồ sơ',
  TRANSFER: 'Đề nghị chuyển lớp',
};
export const admissionLabel = (s: string) => admissionLabels[s] ?? s;
