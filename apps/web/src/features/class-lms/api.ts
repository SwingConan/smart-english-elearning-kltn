import { apiFetch } from '@/lib/api-client';
export type ClassCard = {
  id: string;
  code: string;
  name: string;
  course: { title: string; level: string };
  lastAccessedAt: string | null;
};
export type Activity = {
  id: string;
  sectionId?: string;
  type: 'LESSON' | 'RESOURCE' | 'ASSIGNMENT' | 'QUIZ';
  title: string;
  introduction: string;
  contentMarkdown?: string;
  resourceUrl: string | null;
  file: { name: string; mimeType: string; bytes: number; sha256: string | null } | null;
  state: 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
  lockVersion?: number;
  revisionId: string | null;
  revisionNumber: number;
  progress: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  submissionState?: 'DRAFT' | 'SUBMITTED' | null;
  submissionOpen?: boolean;
  availableFrom: string | null;
  availableUntil: string | null;
  editable?: boolean;
};
export type Section = {
  publishedMetadata?: { title: string; introduction: string; number: number } | null;
  hasDraftChanges?: boolean;
  id: string;
  title: string;
  introduction: string;
  lockVersion: number;
  activities: Activity[];
};
export type OfficialTeachingSessionNode = {
  id: string;
  occurrenceId?: string;
  revision: number;
  startsAt: string;
  endsAt: string;
  timezone: string;
  modality: 'OFFLINE' | 'ONLINE' | 'HYBRID';
  room: { id: string; code: string; name: string } | null;
  approvedMeetUrl?: string | null;
  attendanceWindowState?: 'OPEN' | 'CLOSED' | null;
};
export type ClassTree = {
  sessionEngagementEnabled?: boolean;
  officialSessions?: OfficialTeachingSessionNode[];
  class: { id: string; code: string; name: string; modality?: 'ONLINE' | 'OFFLINE' | 'HYBRID' };
  editable: boolean;
  sections: Section[];
};
export type CalendarEvent = {
  relatedActivities?: { id: string; title: string; availableFrom: string | null; actionUrl: string }[];
  attendance?: { configured: boolean; state: string; status?: string };
  id: string;
  source:
    | 'TEACHING_SESSION'
    | 'LESSON'
    | 'RESOURCE'
    | 'ASSIGNMENT'
    | 'QUIZ'
    | 'REGULAR'
    | 'MIDTERM'
    | 'FINAL'
    | 'ATTENDANCE'
    | 'ASSESSMENT';
  title?: string;
  deadline?: string | null;
  availableFrom?: string | null;
  status?: 'NOT_STARTED' | 'SUBMITTED' | 'OVERDUE' | 'COMPLETED';
  submittedAt?: string | null;
  actionUrl?: string;
  actionLabel?: string;
  actionNote?: string | null;
  meetUrl?: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  modality: string;
  revision: number;
  classOffering: { id: string; code: string; name: string; course: { title: string } };
  room: { code: string; name: string; location: string } | null;
  instructor: { fullName: string } | null;
};
export const classLmsApi = {
  get: <T>(c: string, p = '') => apiFetch<T>('/v2/class-lms/classes/' + c + (p ? '/' + p : '')),
  write: <T>(c: string, p: string, b: unknown, method = 'POST') =>
    apiFetch<T>('/v2/class-lms/classes/' + c + '/' + p, { method, body: JSON.stringify(b) }),
};
export const field = 'w-full rounded-lg border border-slate-300 bg-white p-3';
export const button =
  'inline-flex items-center justify-center rounded-lg border border-indigo-200 bg-white px-4 py-2 font-semibold text-indigo-800 disabled:cursor-not-allowed disabled:opacity-50';
export const activityState = {
  DRAFT: 'Nháp',
  PUBLISHED: 'Đã xuất bản trong lớp',
  HIDDEN: 'Đang ẩn',
};
export const progressLabel = {
  NOT_STARTED: 'Chưa bắt đầu',
  IN_PROGRESS: 'Đang học',
  COMPLETED: 'Đã hoàn thành phiên bản này',
};
