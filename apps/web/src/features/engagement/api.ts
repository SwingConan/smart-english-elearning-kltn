import { apiFetch } from '@/lib/api-client';
export interface Consultation {
  id: string;
  topic: string;
  status: string;
  requestedStartAt: string;
  confirmedStartAt?: string | null;
  durationMinutes: number;
  meetingUrl?: string | null;
  learnerNote?: string | null;
  instructorNote?: string | null;
  declineReason?: string | null;
  cancelledAt?: string | null;
  completedAt?: string | null;
  enrollment?: { learner: { fullName: string; email: string } };
}
export interface AttendanceSession {
  id: string;
  sessionDate: string;
  title?: string | null;
  _count?: { records: number };
  roster?: Array<{
    id: string;
    learner: { fullName: string; email: string };
    attendance: { status: string; note?: string | null } | null;
  }>;
}
export const engagementApi = {
  consultations: {
    mine: (enrollmentId: string) =>
      apiFetch<Consultation[]>(`/enrollments/${enrollmentId}/consultations`),
    create: (
      enrollmentId: string,
      input: {
        topic: string;
        learnerNote?: string;
        requestedStartAt: string;
        durationMinutes: number;
      },
    ) =>
      apiFetch<Consultation>(`/enrollments/${enrollmentId}/consultations`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    cancel: (enrollmentId: string, id: string) =>
      apiFetch<Consultation>(`/enrollments/${enrollmentId}/consultations/${id}/cancel`, {
        method: 'POST',
      }),
    instructor: (classId: string) =>
      apiFetch<Consultation[]>(`/instructor/classes/${classId}/consultations`),
    update: (classId: string, id: string, input: Record<string, unknown>) =>
      apiFetch<Consultation>(`/instructor/classes/${classId}/consultations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
  },
  attendance: {
    list: (classId: string) =>
      apiFetch<AttendanceSession[]>(`/instructor/classes/${classId}/attendance/sessions`),
    create: (classId: string, input: { sessionDate: string; title?: string }) =>
      apiFetch<AttendanceSession>(`/instructor/classes/${classId}/attendance/sessions`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    detail: (classId: string, id: string) =>
      apiFetch<AttendanceSession>(`/instructor/classes/${classId}/attendance/sessions/${id}`),
    records: (
      classId: string,
      id: string,
      records: Array<{ enrollmentId: string; status: string; note?: string }>,
    ) =>
      apiFetch(`/instructor/classes/${classId}/attendance/sessions/${id}/records`, {
        method: 'PUT',
        body: JSON.stringify({ records }),
      }),
  },
  liveClass: (enrollmentId: string) =>
    apiFetch<{
      classOffering: {
        name: string;
        modality: string;
        instructor?: { fullName: string } | null;
        scheduleSlots: Array<{
          id: string;
          dayOfWeek: number;
          startTime: string;
          endTime: string;
          meetingUrl?: string | null;
          locationText?: string | null;
        }>;
      };
    }>(`/virtual-classroom/enrollments/${enrollmentId}`),
};
