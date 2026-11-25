import { apiFetch } from '@/lib/api-client';
export type Decision = {
  id: string;
  state: string;
  lockVersion: number;
  proposedBy: string;
  reason: string;
  approvedBy?: string | null;
  decisionReason?: string | null;
};
export type Room = {
  id: string;
  code: string;
  name: string;
  location: string;
  capacity: number;
  capabilities: string[];
  status: string;
  createdBy: string;
  lockVersion: number;
};
export type Assignment = Decision & {
  classOfferingId: string;
  instructorId: string;
  effectiveFrom: string;
  effectiveTo: string;
  reservedUntil: string;
  instructor?: { id: string; fullName: string };
  replacesId?: string | null;
  replacement?: { effectiveFrom: string; state: string } | null;
  classOffering?: { id: string; code: string; name: string };
};
export type Version = Decision & {
  courseId: string;
  number: number;
  title: string;
  description: string;
  level: string;
  skillScope: string;
  standardPricingType: string | null;
  standardTuitionFeeVnd: number | null;
  effectiveFrom: string;
  approvedAt?: string | null;
  submittedAt?: string | null;
};
export type VersionContext = {
  offers: {
    id: string;
    code: string;
    status: string;
    updatedAt: string;
    approvedTuitionFeeVnd: number;
    versionId: string;
  }[];
  course: {
    id: string;
    title: string;
    description: string;
    level: string;
    skillScope: string;
    createdById: string;
  };
  canAuthor: boolean;
  legacyPrices: { id: string; code: string; name: string; tuitionFeeVnd: number | null }[];
  requiredApproval: {
    capability: string;
    scopeType: string;
    scopeId: string;
    independent: boolean;
  };
};
export type VersionHistory = {
  availability: string;
  events: {
    id: string;
    actor_id: string;
    kind: string;
    reason: string;
    po_reference: string | null;
    created_at: string;
    snapshot: Version;
  }[];
};
export type Session = Decision & {
  sourceTemplateStatus?: {
    kind: 'MANUAL' | 'CURRENT' | 'STALE' | 'MISSING';
    capturedUpdatedAt: string | null;
    currentUpdatedAt: string | null;
  };
  occurrenceId: string;
  revision: number;
  classOfferingId: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  modality: string;
  roomId: string | null;
  assignmentId: string | null;
  requiredCapabilities: string[];
  intent: string;
  room: { id: string; code: string; name: string; location: string } | null;
  instructor: { id: string; fullName: string } | null;
  classOffering: { id: string; code: string; name: string };
  warnings?: string[];
  history?: Session[];
  canApprove?: boolean;
};
export const planningApi = {
  get: <T>(path: string) => apiFetch<T>('/v2/academic/' + path),
  write: <T>(path: string, body: unknown, method = 'POST') =>
    apiFetch<T>('/v2/academic/' + path, { method, body: JSON.stringify(body) }),
};
export const academicState = (s: string) =>
  ({
    DRAFT: 'Nháp',
    PENDING_APPROVAL: 'Chờ học vụ độc lập duyệt',
    PUBLISHED: 'Đã duyệt',
    SUPERSEDED: 'Đã có phiên bản thay thế',
    CANCELLED: 'Đã hủy',
  })[s] ?? s;
export const capabilities = ['PROJECTOR', 'WHITEBOARD', 'SPEAKERS', 'COMPUTER', 'ACCESSIBLE'];
export const capabilityLabel = (s: string) =>
  ({
    PROJECTOR: 'Máy chiếu',
    WHITEBOARD: 'Bảng',
    SPEAKERS: 'Loa',
    COMPUTER: 'Máy tính',
    ACCESSIBLE: 'Lối tiếp cận phù hợp',
  })[s] ?? s;
export const schoolInput = (iso: string) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};
export const schoolDate = (iso: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
export const control = 'rounded-lg border border-slate-300 bg-white px-3 py-2';
export const sourceTemplateWarning = (s: Session) =>
  s.sourceTemplateStatus?.kind === 'STALE'
    ? ['PUBLISHED', 'SUPERSEDED', 'CANCELLED'].includes(s.state)
      ? 'Mẫu lịch tuần nguồn đã thay đổi. Buổi đã duyệt giữ nguyên snapshot; thay đổi giờ buổi cần một revision được duyệt riêng.'
      : 'Mẫu lịch tuần đã thay đổi sau khi sinh buổi. Giữ nguyên giờ buổi nháp; cần học vụ độc lập kiểm tra lại nguồn trước khi duyệt.'
    : s.sourceTemplateStatus?.kind === 'MISSING'
      ? 'Không tìm thấy mẫu nguồn; chưa thể duyệt buổi.'
      : '';
