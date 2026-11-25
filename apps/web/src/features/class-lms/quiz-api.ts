import { apiFetch } from '@/lib/api-client';
export type QuizSource = {
  id: string;
  title: string;
  version: number;
  state: 'DRAFT' | 'APPROVED';
  lockVersion: number;
  sourceHash?: string | null;
  questionCount?: number;
  approvedAt: string | null;
  openAt: string;
  closeAt: string;
  durationMinutes: number;
  questions: {
    id: string;
    content: string;
    points: number;
    explanation?: string;
    options: { id: string; content: string; isCorrect?: boolean }[];
  }[];
};
export type QuizResult = { earned: number; max: number; percentage: number; publishedAt: string };
export type QuizAttempt = {
  id: string;
  activityId: string;
  source: QuizSource;
  state: 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';
  lockVersion: number;
  startedAt: string;
  deadline: string;
  serverNow: string;
  marked: string[];
  answers: { questionId: string; optionId: string | null }[];
  receipt: string | null;
  submittedAt: string | null;
  gradeState: string | null;
  result: QuizResult | null;
};
export type QuizAuthor = {
  sources: QuizSource[];
  attempts: {
    id: string;
    learnerName: string;
    version: number;
    state: string;
    submittedAt: string;
    earned: number;
    max: number;
    gradeState: string;
  }[];
};
export type QuizInbox = {
  sources: (QuizSource & { classId: string; activityId: string; canApprove: boolean })[];
  attempts: {
    id: string;
    classId: string;
    title: string;
    learnerName: string;
    version: number;
    lockVersion: number;
    earned: number;
    max: number;
    submittedAt: string;
    canPublish: boolean;
  }[];
};
export const quizPath = (c: string, p: string) => '/v2/class-quiz/classes/' + c + '/' + p;
export const quizGet = <T>(c: string, p: string) => apiFetch<T>(quizPath(c, p));
export const quizWrite = <T>(c: string, p: string, b: object, method = 'POST') =>
  apiFetch<T>(quizPath(c, p), { method, body: JSON.stringify(b) });
export function remainingSeconds(deadline: string, serverNow: string, elapsedMs: number) {
  return Math.max(0, Math.ceil((Date.parse(deadline) - Date.parse(serverNow) - elapsedMs) / 1000));
}
export function quizQuestionState(id: string, answers: QuizAttempt['answers'], marked: string[]) {
  return {
    answered: !!answers.find((a) => a.questionId === id)?.optionId,
    marked: marked.includes(id),
  };
}
