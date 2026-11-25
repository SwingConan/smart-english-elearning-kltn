import { apiFetch } from '@/lib/api-client';
import type { RoadmapItem, RoomSummary } from '@/features/catalog/types';

export type Page<T> = { data: T[]; meta: { total: number; page: number; limit: number } };

export type CurriculumLesson = {
  id?: string;
  title: string;
  description?: string | null;
  orderIndex?: number;
  estimatedMinutes?: number | null;
};

export type CurriculumModule = {
  id?: string;
  title: string;
  description?: string | null;
  orderIndex: number;
  _count?: { lessons: number };
  lessons?: CurriculumLesson[];
};

export type Program = {
  id: string;
  title: string;
  slug: string;
  description: string;
  level: string;
  skillScope: string;
  defaultDurationWeeks?: number | null;
  defaultSessionsCount?: number | null;
  defaultPeriodsPerSession?: number | null;
  defaultPricingType?: 'FREE' | 'PAID' | null;
  defaultTuitionFeeVnd?: number | null;
  minutesPerPeriod?: number;
  isPublished: boolean;
  createdById: string;
  updatedAt: string;
  editable?: boolean;
  modules: CurriculumModule[];
  _count: { classOfferings: number };
};

export type AcademicClass = {
  id: string;
  courseId: string;
  code: string;
  name: string;
  status: string;
  modality: string;
  maxStudents: number | null;
  pricingType: string;
  tuitionFeeVnd: number | null;
  totalSessions?: number | null;
  totalPeriods?: number | null;
  periodsPerSession?: number | null;
  durationWeeks?: number | null;
  defaultRoomId?: string | null;
  defaultRoom?: RoomSummary | null;
  classStart?: string | null;
  classEnd?: string | null;
  updatedAt: string;
  activeLearnerCount: number;
  editable?: boolean;
  course: { id: string; title: string; createdById?: string };
  instructor: { id: string; fullName: string } | null;
  scheduleSlots: {
    id: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    roomId?: string | null;
    room?: RoomSummary | null;
    locationText: string | null;
    meetingUrl?: string | null;
  }[];
  roadmapItems?: RoadmapItem[];
  lmsSectionsCount?: number;
  minutesPerPeriod?: number;
  scheduleKind?: string;
  timezone?: string;
};

export type Roster = {
  data: {
    id: string;
    status: string;
    enrolledAt: string;
    learner?: { id: string; fullName: string };
  }[];
  meta: { total: number; page: number; limit: number };
  summary: Record<string, number>;
};

const base = '/v2/academic';

export const academicApi = {
  programs: (q = '') => apiFetch<Page<Program>>(base + '/programs' + q),
  program: (id: string) => apiFetch<Program>(base + '/programs/' + encodeURIComponent(id)),
  classes: (q = '') => apiFetch<Page<AcademicClass>>(base + '/classes' + q),
  classroom: (id: string) => apiFetch<AcademicClass>(base + '/classes/' + encodeURIComponent(id)),
  roster: (id: string, q = '') =>
    apiFetch<Roster>(base + '/classes/' + encodeURIComponent(id) + '/roster' + q),
  write: <T>(path: string, body: unknown, method = 'POST') =>
    apiFetch<T>(base + path, { method, body: JSON.stringify(body) }),
  saveCurriculum: (programId: string, modules: CurriculumModule[], reason?: string) =>
    apiFetch<Program>(base + '/programs/' + encodeURIComponent(programId) + '/curriculum', {
      method: 'PUT',
      body: JSON.stringify({ modules, reason }),
    }),
  publishProgram: (programId: string, isPublished: boolean, reason?: string) =>
    apiFetch<Program>(base + '/programs/' + encodeURIComponent(programId) + '/publish', {
      method: 'POST',
      body: JSON.stringify({ isPublished, reason }),
    }),
  setupClass: (classId: string, payload: Record<string, unknown>) =>
    apiFetch<AcademicClass>(base + '/classes/' + encodeURIComponent(classId) + '/setup', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  generateRoadmap: (classId: string, payload: Record<string, unknown>) =>
    apiFetch<AcademicClass>(base + '/classes/' + encodeURIComponent(classId) + '/roadmap/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  saveRoadmap: (
    classId: string,
    items: RoadmapItem[],
    syncTeachingSessions = true,
    reason?: string,
  ) =>
    apiFetch<AcademicClass>(base + '/classes/' + encodeURIComponent(classId) + '/roadmap', {
      method: 'PUT',
      body: JSON.stringify({ items, syncTeachingSessions, reason }),
    }),
  syncLmsSections: (classId: string, reason?: string) =>
    apiFetch<{ createdCount: number; totalSections: number }>(
      base + '/classes/' + encodeURIComponent(classId) + '/sync-lms-sections',
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      },
    ),
};
