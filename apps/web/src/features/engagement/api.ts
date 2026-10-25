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
export interface ConsultationMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  sender: { id: string; fullName: string; role: string; avatarKey?: string | null };
}
export interface StudentConsultationThread {
  id: string;
  unreadCount: number;
  messages: ConsultationMessage[];
  appointments: Consultation[];
  enrollment: {
    id: string;
    status: string;
    classOffering: {
      id: string;
      name: string;
      code: string;
      instructor?: { id: string; fullName: string; avatarKey?: string | null } | null;
    };
  };
}
export interface ConsultationInboxItem {
  enrollmentId: string;
  status: string;
  unreadCount: number;
  learner: { id: string; fullName: string; email: string; avatarKey?: string | null };
  lastMessage?: { body: string; createdAt: string; senderId: string } | null;
  appointment?: {
    id: string;
    status: string;
    requestedStartAt: string;
    confirmedStartAt?: string | null;
  } | null;
}
export interface InstructorConsultationThread {
  id: string;
  messages: ConsultationMessage[];
  appointments: Consultation[];
  enrollment: {
    id: string;
    status: string;
    learner: { id: string; fullName: string; email: string; avatarKey?: string | null };
  };
}
export interface ScheduleSlot {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  meetingAvailable?: boolean;
  meetingUrl?: string | null;
  locationText?: string | null;
}
export interface AttendanceRecord {
  status: string;
  note?: string | null;
  source?: string;
  checkedInAt?: string | null;
}
export interface AttendanceSession {
  id: string;
  sessionDate: string;
  title?: string | null;
  note?: string | null;
  scheduleSlotId?: string | null;
  scheduleSlot?: ScheduleSlot | null;
  opensAt?: string | null;
  closesAt?: string | null;
  closedAt?: string | null;
  selfCheckInEnabled?: boolean;
  accessCodeEnabled?: boolean;
  state?: string;
  record?: AttendanceRecord | null;
  _count?: { records: number };
  roster?: Array<{
    id: string;
    learner: { fullName: string; email: string };
    attendance: AttendanceRecord | null;
  }>;
}
export interface LiveOccurrence {
  id: string;
  scheduleSlotId: string;
  date: string;
  dayOfWeek: number;
  startAt: string;
  endAt: string;
  status: 'UPCOMING' | 'LIVE' | 'ENDED' | 'NO_LINK';
  modality: string;
  locationText?: string | null;
  meetingAvailable: boolean;
  joinUrl?: string | null;
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
    studentThread: (enrollmentId: string) =>
      apiFetch<StudentConsultationThread>(`/enrollments/${enrollmentId}/consultation-thread`),
    sendStudentMessage: (enrollmentId: string, body: string) =>
      apiFetch<ConsultationMessage>(`/enrollments/${enrollmentId}/consultation-thread/messages`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
    markStudentRead: (enrollmentId: string) =>
      apiFetch<{ read: true }>(`/enrollments/${enrollmentId}/consultation-thread/read`, {
        method: 'POST',
      }),
    inbox: (classId: string) =>
      apiFetch<ConsultationInboxItem[]>(`/instructor/classes/${classId}/consultation-inbox`),
    instructorThread: (classId: string, enrollmentId: string) =>
      apiFetch<InstructorConsultationThread>(
        `/instructor/classes/${classId}/consultation-inbox/${enrollmentId}`,
      ),
    sendInstructorMessage: (classId: string, enrollmentId: string, body: string) =>
      apiFetch<ConsultationMessage>(
        `/instructor/classes/${classId}/consultation-inbox/${enrollmentId}/messages`,
        { method: 'POST', body: JSON.stringify({ body }) },
      ),
    markInstructorRead: (classId: string, enrollmentId: string) =>
      apiFetch<{ read: true }>(
        `/instructor/classes/${classId}/consultation-inbox/${enrollmentId}/read`,
        { method: 'POST' },
      ),
  },
  attendance: {
    list: (classId: string) =>
      apiFetch<AttendanceSession[]>(`/instructor/classes/${classId}/attendance/sessions`),
    slots: (classId: string) =>
      apiFetch<ScheduleSlot[]>(`/instructor/classes/${classId}/attendance/sessions/schedule-slots`),
    create: (
      classId: string,
      input: {
        sessionDate: string;
        scheduleSlotId?: string;
        title?: string;
        note?: string;
        opensAt?: string;
        closesAt?: string;
        selfCheckInEnabled?: boolean;
        accessCode?: string;
      },
    ) =>
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
      clearEnrollmentIds: string[] = [],
    ) =>
      apiFetch(`/instructor/classes/${classId}/attendance/sessions/${id}/records`, {
        method: 'PUT',
        body: JSON.stringify({ records, clearEnrollmentIds }),
      }),
    close: (classId: string, id: string) =>
      apiFetch<AttendanceSession>(
        `/instructor/classes/${classId}/attendance/sessions/${id}/close`,
        { method: 'POST' },
      ),
    studentHistory: (enrollmentId: string) =>
      apiFetch<AttendanceSession[]>(`/enrollments/${enrollmentId}/attendance`),
    openSession: (enrollmentId: string) =>
      apiFetch<AttendanceSession | null>(`/enrollments/${enrollmentId}/attendance/open-session`),
    checkIn: (enrollmentId: string, sessionId: string, accessCode?: string) =>
      apiFetch<{ idempotent: boolean; record: AttendanceRecord }>(
        `/enrollments/${enrollmentId}/attendance/${sessionId}/check-in`,
        { method: 'POST', body: JSON.stringify({ accessCode: accessCode || undefined }) },
      ),
  },
  liveClass: (enrollmentId: string) =>
    apiFetch<{
      serverNow?: string;
      classOffering: {
        name: string;
        modality: string;
        instructor?: { fullName: string } | null;
        scheduleSlots: ScheduleSlot[];
      };
      occurrences?: LiveOccurrence[];
    }>(`/virtual-classroom/enrollments/${enrollmentId}`),
};
