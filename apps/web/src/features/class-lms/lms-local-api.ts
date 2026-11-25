import { apiFetch, apiUrl } from '@/lib/api-client';

export interface PromptAttachment {
  id: string;
  key: string;
  name: string;
  mimeType: string;
  bytes: number;
  sha256: string;
  uploadedAt: string;
}

export interface AssignmentConfig {
  activityId: string;
  maxFiles: number;
  maxFileSizeMb: number;
  allowFile: boolean;
  allowText: boolean;
  allowAudio: boolean;
  allowLate: boolean;
  allowResubmit: boolean;
  acceptedExtensions: string;
  promptUrl: string | null;
  promptFiles: PromptAttachment[];
  maxScore: number;
}

export interface UploadedSubmissionFile {
  id: string;
  name: string;
  mimeType: string;
  bytes: number;
  sha256: string | null;
  kind: 'ATTACHMENT' | 'AUDIO';
  createdAt: string;
  downloadUrl: string;
}

export interface LocalDirectGrade {
  score: number | null;
  maxScore: number;
  feedback: string;
  state: 'NOT_GRADED' | 'DRAFT' | 'PUBLISHED';
  gradedAt: string | null;
  publishedAt: string | null;
}

export interface StudentSubmission {
  id: string;
  revisionId: string;
  state: 'DRAFT' | 'SUBMITTED';
  text: string;
  files: UploadedSubmissionFile[];
  submittedAt: string | null;
  updatedAt: string;
  late: boolean;
  canEdit: boolean;
  lockReason: string | null;
  rubricGradingState: 'NOT_GRADED' | 'GRADING_IN_PROGRESS' | 'PENDING_PUBLICATION' | 'PUBLISHED';
  directGrade: LocalDirectGrade | null;
  learner?: { id: string; fullName: string; email?: string };
}

export interface AssignmentWorkspace {
  editable: boolean;
  activity: {
    id: string;
    title: string;
    introduction: string;
    contentMarkdown: string;
    state: 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
    availableFrom: string | null;
    availableUntil: string | null;
    publishedRevisionId: string | null;
  };
  config: AssignmentConfig;
  submissionWindow?: { canEdit: boolean; late: boolean; lockReason: string | null };
  mySubmission?: StudentSubmission | null;
  stats?: { enrolledCount: number; submittedCount: number; gradedCount: number };
  submissions?: StudentSubmission[];
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export function formatRemainingTime(dueIso: string | null): { text: string; overdue: boolean } | null {
  if (!dueIso) return null;
  const diffMs = new Date(dueIso).getTime() - Date.now();
  if (!Number.isFinite(diffMs)) return null;
  if (diffMs <= 0) {
    const pastMins = Math.abs(Math.floor(diffMs / 60000));
    const days = Math.floor(pastMins / 1440);
    const hours = Math.floor((pastMins % 1440) / 60);
    if (days > 0) return { text: `Đã quá hạn ${days} ngày ${hours} giờ`, overdue: true };
    if (hours > 0) return { text: `Đã quá hạn ${hours} giờ ${pastMins % 60} phút`, overdue: true };
    return { text: `Đã quá hạn ${Math.max(1, pastMins)} phút`, overdue: true };
  }
  const mins = Math.floor(diffMs / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  if (days > 0) return { text: `Còn ${days} ngày ${hours} giờ`, overdue: false };
  if (hours > 0) return { text: `Còn ${hours} giờ ${mins % 60} phút`, overdue: false };
  return { text: `Còn ${Math.max(1, mins)} phút`, overdue: false };
}

export const lmsLocalApi = {
  getWorkspace: (classId: string, activityId: string) =>
    apiFetch<AssignmentWorkspace>(
      `/v2/lms-local/classes/${classId}/activities/${activityId}/assignment`,
    ),

  updateConfig: (
    classId: string,
    activityId: string,
    body: {
      maxFiles?: number;
      maxFileSizeMb?: number;
      allowFile?: boolean;
      allowText?: boolean;
      allowAudio?: boolean;
      allowLate?: boolean;
      allowResubmit?: boolean;
      acceptedExtensions?: string;
      promptUrl?: string | null;
      maxScore?: number;
      availableFrom?: string | null;
      availableUntil?: string | null;
      syncPublishedDates?: boolean;
    },
  ) =>
    apiFetch<AssignmentConfig>(
      `/v2/lms-local/classes/${classId}/activities/${activityId}/assignment/config`,
      { method: 'PUT', body: JSON.stringify(body) },
    ),

  uploadPromptFile: (classId: string, activityId: string, file: File) => {
    const fd = new FormData();
    fd.set('file', file);
    return apiFetch<AssignmentConfig>(
      `/v2/lms-local/classes/${classId}/activities/${activityId}/prompt-files`,
      { method: 'POST', body: fd },
    );
  },

  deletePromptFile: (classId: string, activityId: string, fileId: string) =>
    apiFetch<AssignmentConfig>(
      `/v2/lms-local/classes/${classId}/activities/${activityId}/prompt-files/${fileId}`,
      { method: 'DELETE' },
    ),

  saveSubmission: (
    classId: string,
    activityId: string,
    payload: {
      text?: string;
      mode?: 'SUBMIT' | 'DRAFT';
      removeFileIds?: string[];
      files?: File[];
    },
  ) => {
    const fd = new FormData();
    if (payload.text !== undefined) fd.set('text', payload.text);
    fd.set('mode', payload.mode ?? 'SUBMIT');
    if (payload.removeFileIds && payload.removeFileIds.length > 0) {
      fd.set('removeFileIds', JSON.stringify(payload.removeFileIds));
    }
    for (const file of payload.files ?? []) {
      fd.append('files', file);
    }
    return apiFetch<AssignmentWorkspace>(
      `/v2/lms-local/classes/${classId}/activities/${activityId}/submissions/mine`,
      { method: 'POST', body: fd },
    );
  },

  gradeSubmission: (
    classId: string,
    activityId: string,
    submissionId: string,
    payload: { score?: number | null; feedback?: string; publish?: boolean },
  ) =>
    apiFetch<LocalDirectGrade>(
      `/v2/lms-local/classes/${classId}/activities/${activityId}/submissions/${submissionId}/grade`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),

  promptFileUrl: (classId: string, activityId: string, fileId: string) =>
    apiUrl(`/v2/lms-local/classes/${classId}/activities/${activityId}/prompt-files/${fileId}`),

  submissionFileUrl: (classId: string, activityId: string, fileId: string) =>
    apiUrl(`/v2/lms-local/classes/${classId}/activities/${activityId}/files/${fileId}`),

  submissionsZipUrl: (classId: string, activityId: string) =>
    apiUrl(`/v2/lms-local/classes/${classId}/activities/${activityId}/submissions/zip`),

  getActivityKinds: (classId: string) =>
    apiFetch<{
      kinds: Record<string, { kind: LocalActivityKind; meta: Record<string, any> }>;
    }>(`/v2/lms-local/classes/${classId}/activity-kinds`),

  uploadQuizMedia: (classId: string, file: File) => {
    const fd = new FormData();
    fd.set('file', file);
    return apiFetch<QuizMediaItem>(`/v2/lms-local/classes/${classId}/quiz-media`, {
      method: 'POST',
      body: fd,
    });
  },

  createLocalQuiz: (classId: string, sectionId: string, payload: SaveLocalQuizPayload) =>
    apiFetch<{ activityId: string; state: 'DRAFT' | 'PUBLISHED' }>(
      `/v2/lms-local/classes/${classId}/sections/${sectionId}/local-quiz`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),

  updateLocalQuiz: (classId: string, activityId: string, payload: SaveLocalQuizPayload) =>
    apiFetch<{ activityId: string; state: 'DRAFT' | 'PUBLISHED' }>(
      `/v2/lms-local/classes/${classId}/activities/${activityId}/local-quiz`,
      { method: 'PUT', body: JSON.stringify(payload) },
    ),

  getQuizWorkspace: (classId: string, activityId: string) =>
    apiFetch<LocalQuizWorkspace>(
      `/v2/lms-local/classes/${classId}/activities/${activityId}/local-quiz`,
    ),

  startQuizAttempt: (classId: string, activityId: string) =>
    apiFetch<LocalQuizWorkspace>(
      `/v2/lms-local/classes/${classId}/activities/${activityId}/local-quiz/start`,
      { method: 'POST', body: JSON.stringify({}) },
    ),

  submitQuizAttempt: (
    classId: string,
    activityId: string,
    attemptId: string,
    payload: {
      answers: Array<{ questionId: string; selectedOptionId?: string | null; textAnswer?: string | null }>;
      submit: boolean;
    },
  ) =>
    apiFetch<LocalQuizWorkspace>(
      `/v2/lms-local/classes/${classId}/activities/${activityId}/local-quiz/attempts/${attemptId}/submit`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),

  gradeQuizEssay: (
    classId: string,
    activityId: string,
    attemptId: string,
    payload: {
      scoresByQuestionId?: Record<string, { score: number; comment?: string }>;
      teacherFeedback?: string;
      publishGrade?: boolean;
    },
  ) =>
    apiFetch<LocalQuizWorkspace>(
      `/v2/lms-local/classes/${classId}/activities/${activityId}/local-quiz/attempts/${attemptId}/grade`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),

  getQuestionBank: (
    classId: string,
    params?: { search?: string; type?: 'ALL' | 'MCQ' | 'ESSAY'; skill?: string; limit?: number },
  ) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.type && params.type !== 'ALL') qs.set('type', params.type);
    if (params?.skill && params.skill !== 'ALL') qs.set('skill', params.skill);
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return apiFetch<QuestionBankResponse>(
      `/v2/lms-local/classes/${classId}/question-bank${q ? `?${q}` : ''}`,
    );
  },

  getUnifiedClassResults: (classId: string) =>
    apiFetch<UnifiedClassResults>(`/v2/lms-local/classes/${classId}/unified-results`),

  createLocalAttendance: (classId: string, sectionId: string, payload: SaveLocalAttendancePayload) =>
    apiFetch<{ activityId: string; state: 'DRAFT' | 'PUBLISHED' }>(
      `/v2/lms-local/classes/${classId}/sections/${sectionId}/local-attendance`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),

  updateLocalAttendance: (
    classId: string,
    activityId: string,
    payload: SaveLocalAttendancePayload,
  ) =>
    apiFetch<{ activityId: string; state: 'DRAFT' | 'PUBLISHED' }>(
      `/v2/lms-local/classes/${classId}/activities/${activityId}/local-attendance`,
      { method: 'PUT', body: JSON.stringify(payload) },
    ),

  getAttendanceWorkspace: (classId: string, activityId: string) =>
    apiFetch<LocalAttendanceWorkspace>(
      `/v2/lms-local/classes/${classId}/activities/${activityId}/local-attendance`,
    ),

  checkInAttendance: (
    classId: string,
    activityId: string,
    payload: { code?: string; note?: string },
  ) =>
    apiFetch<LocalAttendanceWorkspace>(
      `/v2/lms-local/classes/${classId}/activities/${activityId}/local-attendance/check-in`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),

  markAttendance: (
    classId: string,
    activityId: string,
    payload: { enrollmentId: string; status: 'PRESENT' | 'LATE' | 'NOT_RECORDED'; note?: string },
  ) =>
    apiFetch<LocalAttendanceWorkspace>(
      `/v2/lms-local/classes/${classId}/activities/${activityId}/local-attendance/mark`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),
};

export type LocalActivityKind = 'LOCAL_QUIZ' | 'LOCAL_ATTENDANCE';
export type AssessmentKind = 'QUIZ' | 'REGULAR' | 'MIDTERM' | 'FINAL';
export type QuizReleaseMode =
  | 'AUTO_ON_SUBMIT'
  | 'INSTRUCTOR_PUBLISH'
  | 'ACADEMIC_APPROVAL_REQUIRED';

export const ASSESSMENT_KIND_LABELS: Record<AssessmentKind, string> = {
  QUIZ: 'Quiz luyện tập',
  REGULAR: 'Kiểm tra thường kỳ',
  MIDTERM: 'Kiểm tra giữa kỳ',
  FINAL: 'Kiểm tra cuối kỳ',
};

export interface QuestionBankItem {
  id: string;
  source: 'COURSE_BANK' | 'CLASS_QUIZ';
  sourceLabel: string;
  type: 'MCQ' | 'ESSAY';
  toeicSkill: string;
  difficulty: string;
  prompt: string;
  explanation: string;
  points: number;
  options: Array<{ id: string; text: string }>;
  correctOptionId: string | null;
}

export interface QuestionBankResponse {
  totalCourseQuestions: number;
  items: QuestionBankItem[];
}

export interface UnifiedActivityColumn {
  activityId: string;
  sectionId: string;
  sectionTitle: string;
  sectionOrder: number;
  orderIndex: number;
  title: string;
  baseType: string;
  localKind: string | null;
  assessmentKind: AssessmentKind | null;
  kindLabel: string;
  state: string;
  availableFrom: string | null;
  availableUntil: string | null;
  maxScore: number | null;
  passScore: number | null;
  releaseMode: QuizReleaseMode | null;
}

export interface UnifiedAssignmentCell {
  activityId: string;
  submissionId: string | null;
  submissionState: 'NOT_SUBMITTED' | 'DRAFT' | 'SUBMITTED';
  submittedAt: string | null;
  score: number | null;
  maxScore: number;
  gradeState: 'NOT_GRADED' | 'DRAFT' | 'PENDING_PUBLICATION' | 'PUBLISHED';
  gradeSource: 'LOCAL_DIRECT' | 'CORE_RUBRIC' | null;
  feedback: string;
  gradedAt: string | null;
}

export interface UnifiedQuizCell {
  activityId: string;
  assessmentKind: AssessmentKind;
  attemptCount: number;
  latestAttemptId: string | null;
  attemptStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED';
  submittedAt: string | null;
  gradingStatus: 'NOT_SUBMITTED' | 'AUTO_GRADED' | 'PENDING_MANUAL_GRADE' | 'GRADED';
  gradePublished: boolean;
  score: number | null;
  maxScore: number | null;
  passScore: number | null;
  passed: boolean | null;
  teacherFeedback: string;
  gradedAt: string | null;
}

export interface UnifiedAttendanceCell {
  activityId: string;
  status: 'PRESENT' | 'LATE' | 'NOT_RECORDED';
  checkedInAt: string | null;
  note: string;
}

export interface UnifiedStudentRow {
  enrollmentId: string;
  learnerId: string;
  fullName: string;
  email: string;
  assignments: Record<string, UnifiedAssignmentCell>;
  quizzes: Record<string, UnifiedQuizCell>;
  attendance: Record<string, UnifiedAttendanceCell>;
  stats: {
    submittedAssignments: number;
    publishedAssignmentGrades: number;
    submittedQuizzes: number;
    publishedQuizGrades: number;
    attendancePresentCount: number;
    attendanceLateCount: number;
    attendanceTotalCount: number;
    completedActivitiesCount: number;
  };
}

export interface UnifiedFormalAssessmentItem {
  id: string;
  testId: string;
  title: string;
  stage: string;
  quizState: string | null;
  isActive: boolean;
  openAt: string | null;
  closeAt: string | null;
  submittedAttempts: number;
  myLatestAttempt?: {
    id: string;
    status: string;
    submittedAt: string | null;
    totalScore: number | null;
    gradingState: string | null;
  } | null;
}

export interface UnifiedClassResults {
  class: {
    id: string;
    code: string;
    name: string;
    courseId: string;
    courseTitle: string;
  };
  editable: boolean;
  activityColumns: UnifiedActivityColumn[];
  studentRows: UnifiedStudentRow[];
  formalAssessments: UnifiedFormalAssessmentItem[];
  draftCoreQuizCount: number;
  summary: {
    totalActivities: number;
    publishedActivities: number;
    assignmentsCount: number;
    quizzesCount: number;
    regularExamCount: number;
    midtermCount: number;
    finalCount: number;
    attendanceCount: number;
    awaitingAssignmentGrades: number;
    awaitingManualQuizGrades: number;
    formalAssessmentCount: number;
    draftCoreQuizCount: number;
  };
  policyNotes: string[];
}

export interface QuizMediaItem {
  id: string;
  kind: 'IMAGE' | 'AUDIO';
  name: string;
  mimeType: string;
  bytes: number;
  url: string;
}

export interface LocalQuizQuestion {
  id: string;
  orderIndex?: number;
  type: 'MCQ' | 'ESSAY';
  prompt: string;
  points: number;
  options: Array<{ id: string; text: string }>;
  correctOptionId?: string | null;
  explanation?: string;
  groupId?: string | null;
  groupTitle?: string;
  media?: QuizMediaItem[];
}

export interface SaveLocalQuizPayload {
  title: string;
  introduction?: string;
  assessmentKind?: AssessmentKind;
  releaseMode?: QuizReleaseMode;
  openAt?: string | null;
  closeAt?: string | null;
  durationMinutes?: number;
  maxAttempts?: number;
  shuffleQuestions?: boolean;
  autoReleaseObjective?: boolean;
  passScore?: number;
  publish?: boolean;
  questions: Array<{
    id?: string;
    type: 'MCQ' | 'ESSAY';
    prompt: string;
    points: number;
    options?: Array<{ id?: string; text: string }>;
    correctOptionId?: string | null;
    explanation?: string;
    groupId?: string | null;
    groupTitle?: string;
    media?: QuizMediaItem[];
  }>;
}

export interface LocalQuizAttemptAnswer {
  questionId: string;
  type?: 'MCQ' | 'ESSAY';
  prompt?: string;
  points?: number;
  groupId?: string | null;
  groupTitle?: string;
  media?: QuizMediaItem[];
  selectedOptionId?: string | null;
  selectedOptionText?: string | null;
  textAnswer?: string | null;
  correctOptionId?: string | null;
  correctOptionText?: string | null;
  isCorrect?: boolean | null;
  autoEarned?: number;
  explanation?: string;
}

export interface LocalQuizAttempt {
  id: string;
  attemptNumber: number;
  status: 'IN_PROGRESS' | 'SUBMITTED';
  startedAt: string;
  deadlineAt: string;
  submittedAt: string | null;
  autoScore: number;
  manualScore: number;
  totalScore: number;
  maxScore: number;
  objectiveMax: number;
  essayMax: number;
  hasEssay: boolean;
  gradingStatus: 'AUTO_GRADED' | 'PENDING_MANUAL_GRADE' | 'GRADED';
  gradePublished?: boolean;
  gradePublishedAt?: string | null;
  scoreVisible?: boolean;
  answers: LocalQuizAttemptAnswer[];
  manualGrades: Record<string, { score: number; comment: string }>;
  teacherFeedback: string;
  gradedAt: string | null;
  learner?: { id: string; fullName: string; email?: string };
}

export interface LocalQuizWorkspace {
  editable: boolean;
  serverNow: string;
  activity: {
    id: string;
    sectionId: string;
    sectionTitle: string;
    sectionPublished: boolean;
    title: string;
    introduction: string;
    state: 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
    availableFrom: string | null;
    availableUntil: string | null;
    revisionNumber: number;
  };
  config: {
    assessmentKind?: AssessmentKind;
    releaseMode?: QuizReleaseMode;
    durationMinutes: number;
    maxAttempts: number;
    shuffleQuestions: boolean;
    autoReleaseObjective: boolean;
    passScore: number;
  };
  summary: {
    questionCount: number;
    mcqCount: number;
    essayCount: number;
    totalPoints: number;
    objectivePoints: number;
    essayPoints: number;
  };
  questions: LocalQuizQuestion[];
  windowStatus?: 'UPCOMING' | 'OPEN' | 'CLOSED';
  canStartNew?: boolean;
  activeAttempt?: LocalQuizAttempt | null;
  myAttempts?: LocalQuizAttempt[];
  stats?: {
    enrolledCount: number;
    submittedCount: number;
    pendingEssayCount: number;
    pendingPublishCount?: number;
  };
  attempts?: LocalQuizAttempt[];
}

export interface SaveLocalAttendancePayload {
  title: string;
  introduction?: string;
  sessionTitle?: string;
  sessionDateLabel?: string;
  checkInStartAt: string;
  checkInEndAt: string;
  lateAfterMinutes?: number;
  requireCode?: boolean;
  checkInCode?: string;
  publish?: boolean;
}

export interface LocalAttendanceWorkspace {
  editable: boolean;
  serverNow: string;
  windowStatus: 'UPCOMING' | 'OPEN' | 'CLOSED';
  activity: {
    id: string;
    sectionId: string;
    sectionTitle: string;
    sectionPublished: boolean;
    title: string;
    introduction: string;
    state: 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
    availableFrom: string | null;
    availableUntil: string | null;
    revisionNumber: number;
  };
  config: {
    sessionTitle: string;
    sessionDateLabel: string;
    checkInStartAt: string;
    checkInEndAt: string;
    lateAfterMinutes: number;
    requireCode: boolean;
    checkInCode?: string;
  };
  summary?: {
    totalEnrolled: number;
    presentCount: number;
    lateCount: number;
    notRecordedCount: number;
  };
  roster?: Array<{
    enrollmentId: string;
    learnerId: string;
    fullName: string;
    email: string;
    status: 'PRESENT' | 'LATE' | 'NOT_RECORDED';
    checkedInAt: string | null;
    note: string;
  }>;
  myRecord?: {
    status: 'PRESENT' | 'LATE';
    checkedInAt: string;
    note: string;
  } | null;
}

export function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function datetimeLocalToIso(localValue: string): string | null {
  if (!localValue || !localValue.trim()) return null;
  const d = new Date(localValue);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
