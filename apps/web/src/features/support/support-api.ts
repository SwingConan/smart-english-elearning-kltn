import { apiFetch } from '@/lib/api-client';
export const supportBase = '/v2/support';
export type Topic = {
  id: string;
  code: string;
  title: string;
  version: number;
  caps?: string[];
  routes?: string[];
  authorId?: string;
  approvedById?: string | null;
};
export type SupportConfig = {
  role: string;
  topics: Topic[];
  taxonomyAuthor: boolean;
  taxonomyApprove: boolean;
  taxonomy: Topic[];
};
export type TicketAttachment = {
  id: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
};
export type TicketSummary = {
  createdAt?: string;
  id: string;
  reference: string;
  title?: string;
  state: string;
  lockVersion: number;
  topic: { title: string };
  assigned?: boolean;
  attachmentCount?: number;
};
export type Application = {
  id: string;
  number: number;
  state: string;
  lockVersion: number;
  needs: string;
  target: string;
  snapshot: unknown;
  reviewReason: string | null;
};
export type Referral = {
  id: string;
  category: string;
  summary: string;
  state: string;
  response: string | null;
  specialistId?: string;
  lockVersion: number;
};
export type TechnicalEscalation = {
  id: string;
  incidentCategory: string;
  summary: string;
  affectedRoute: string | null;
  affectedAccountEmail: string | null;
  status: string;
  resolutionNote: string | null;
  assignedAdminId: string | null;
  assignedAdminName: string | null;
  resolvedByName: string | null;
  respondedAt: string | null;
  createdAt: string;
};
export type TicketDetail = TicketSummary & {
  description: string;
  topic: { id: string; code: string; title: string; routes: string[] };
  identity?: {
    learnerId: string | null;
    learnerName?: string | null;
    learnerEmail?: string | null;
    guestName: string | null;
    claimedContact: string | null;
    contactVerified: boolean;
    contactBasis: string;
  };
  messages: { id: string; body: string; visibility: string; from: string; createdAt: string }[];
  events: { id: string; label: string; createdAt: string; reason?: string }[];
  consents: { id: string; purpose: string; granted: boolean }[];
  referrals: Referral[];
  applications: Application[];
  technicalEscalations?: TechnicalEscalation[];
  attachments?: TicketAttachment[];
};
export const supportGet = <T>(path: string) => apiFetch<T>(supportBase + path);
export const supportPost = <T>(path: string, body: unknown) =>
  apiFetch<T>(supportBase + path, { method: 'POST', body: JSON.stringify(body) });
export const supportUpload = <T>(path: string, files: File[]) => {
  const form = new FormData();
  for (const file of files) form.append('files', file);
  return apiFetch<T>(supportBase + path, { method: 'POST', body: form });
};
