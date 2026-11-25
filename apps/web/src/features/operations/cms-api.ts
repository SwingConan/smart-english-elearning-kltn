import { ApiError, apiFetch } from '@/lib/api-client';
import { cmsStates } from './model';
export const cmsStateLabels: Record<string, string> = { ...cmsStates, APPROVED: 'Đã duyệt' };
export type CmsAction =
  'edit' | 'revise' | 'submit' | 'approve' | 'reject' | 'publish' | 'withdraw';
export const cmsActionLabels: Record<CmsAction, string> = {
  edit: 'Lưu chỉnh sửa',
  revise: 'Tạo revision mới',
  submit: 'Gửi duyệt',
  approve: 'Duyệt nội dung',
  reject: 'Từ chối nội dung',
  publish: 'Công bố nội dung',
  withdraw: 'Thu hồi công bố',
};
export interface CmsDashboard {
  viewerId: string;
  viewerPersonId: string;
  role: string;
  state: 'READY';
  checkedAt: string;
  scopes: { id: string; name: string; policyRef: string; canCreate: boolean }[];
  contents: {
    id: string;
    scopeId: string;
    slug: string;
    headRevision: string;
    lockVersion: number;
    number: number;
    title: string;
    state: string;
    publishedRevisionId: string | null;
  }[];
  truncated: boolean;
}
export interface CmsDetail {
  id: string;
  contentId: string;
  scopeId: string;
  slug: string;
  number: number;
  title: string;
  body: string;
  sourceReference: string;
  policyRef: string;
  bodySha256: string;
  authorUser: string;
  authorPerson: string;
  createdAt: string;
  state: string;
  stateAt: string;
  lockVersion: number;
  headRevision: string;
  publishedRevisionId: string | null;
  authors: string[];
  viewerId: string;
  viewerPersonId: string;
  isAuthor: boolean;
  allowedActions: CmsAction[];
  history: { id: string; number: number; title: string; state: string; createdAt: string }[];
  events: {
    id: string;
    number: number;
    state: string;
    actorUser: string;
    actorPerson: string;
    reason: string;
    at: string;
  }[];
  audit:
    | {
        id: string;
        action: string;
        revisionId: string;
        actorUser: string;
        actorPerson: string;
        reason: string;
        at: string;
      }[]
    | null;
}
export interface CmsPublication {
  slug: string;
  revisionId: string;
  revision: number;
  title: string;
  body: string;
  sourceReference: string;
  policyRef: string;
  bodySha256: string;
  publishedAt: string;
}
export interface CmsPublications {
  state: 'AVAILABLE';
  items: CmsPublication[];
  truncated: boolean;
  checkedAt: string;
}
export const cmsTime = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value));
export function cmsMessage(error: unknown) {
  if (error instanceof ApiError) {
    const body = error.body as { message?: unknown };
    if (error.status === 409)
      return 'Nội dung hoặc trạng thái đã thay đổi. Đọc lại revision trước khi thử lại.';
    if (typeof body?.message === 'string') return body.message;
    if (Array.isArray(body?.message)) return body.message.join(' ');
  }
  return 'Không thực hiện được yêu cầu. Kiểm tra kết nối rồi đọc lại nội dung.';
}
export const cmsCreate = (payload: unknown) =>
  apiFetch<CmsDetail>('/v2/operations/cms/drafts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
export const cmsCommand = (id: string, action: CmsAction, payload: unknown) =>
  apiFetch<CmsDetail>(`/v2/operations/cms/revisions/${encodeURIComponent(id)}/${action}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
