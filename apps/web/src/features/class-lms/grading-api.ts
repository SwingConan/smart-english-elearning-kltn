import { apiFetch } from '@/lib/api-client';
export type Criterion = { id: string; name: string; description: string; maxScore: string };
export type AssignmentRubric = {
  id: string;
  name: string;
  description: string;
  version: number;
  state: 'DRAFT' | 'PUBLISHED';
  lockVersion: number;
  approvedAt: string | null;
  criteria: Criterion[];
};
export type Grade = {
  id: string;
  submissionId: string;
  number: number;
  state: 'DRAFT' | 'REVIEWED_FINAL' | 'PUBLISHED';
  lockVersion: number;
  reason: string;
  feedback: string;
  confirmedAt: string | null;
  publishedAt: string | null;
  rubric: AssignmentRubric;
  scores: { criterionId: string; score: string; feedback: string }[];
  earned: string | null;
  max: string;
  percent: string | null;
};
export type SubmittedWork = {
  id: string;
  text: string;
  learnerName: string;
  submittedAt: string;
  source: {
    id: string;
    title: string;
    introduction: string;
    contentMarkdown: string;
    version: number;
  };
  file: { name: string; mimeType: string; bytes: number; sha256: string } | null;
  grades: Grade[];
};
export type GradingQueue = { rubrics: AssignmentRubric[]; submissions: SubmittedWork[] };
export type CheckerInbox = {
  classes: { id: string; code: string; name: string }[];
  rubrics: { classId: string; activityId: string; canPublish: boolean; rubric: AssignmentRubric }[];
  grades: {
    classId: string;
    activityId: string;
    canPublish: boolean;
    submission: SubmittedWork;
    grade: Grade;
  }[];
  truncated: boolean;
};
export type Gradebook = {
  entries: {
    submissionId: string;
    activityId: string;
    title: string;
    status: 'NOT_GRADED' | 'GRADING_IN_PROGRESS' | 'PENDING_PUBLICATION' | 'PUBLISHED';
    result: Grade | null;
    history: Grade[];
  }[];
};
export const gradingPath = (c: string, a: string, p = '') =>
  '/v2/assignment-grading/classes/' + c + '/activities/' + a + (p ? '/' + p : '');
export const gradingApi = {
  queue: (c: string, a: string) => apiFetch<GradingQueue>(gradingPath(c, a, 'queue')),
  inbox: () => apiFetch<CheckerInbox>('/v2/assignment-grading/checker'),
  book: (c: string) => apiFetch<Gradebook>('/v2/assignment-grading/classes/' + c + '/gradebook'),
};
export const gradingState = {
  DRAFT: 'Bản chấm nháp',
  REVIEWED_FINAL: 'GV đã xác nhận · Chờ học vụ công bố',
  PUBLISHED: 'Đã công bố',
};
