import { apiFetch } from '@/lib/api-client';
import type {
  AssessmentQuestion,
  AssessmentTestDetail,
  AssessmentTestQuestion,
  AssessmentTestSummary,
  QuestionInput,
  StudentAnswerSelection,
  StudentAttemptContent,
  StudentAttemptResult,
  StudentAttemptStart,
  StudentSubmission,
  StudentTestListItem,
  TestInput,
} from './types';

const segment = encodeURIComponent;

export const assessmentApi = {
  questions: {
    list: (courseId: string, signal?: AbortSignal): Promise<AssessmentQuestion[]> =>
      apiFetch(`/instructor/courses/${segment(courseId)}/questions`, { signal }),
    create: (courseId: string, input: QuestionInput): Promise<AssessmentQuestion> =>
      apiFetch(`/instructor/courses/${segment(courseId)}/questions`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    update: (questionId: string, input: QuestionInput): Promise<AssessmentQuestion> =>
      apiFetch(`/instructor/questions/${segment(questionId)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    delete: (questionId: string): Promise<{ message: string }> =>
      apiFetch(`/instructor/questions/${segment(questionId)}`, { method: 'DELETE' }),
  },
  tests: {
    list: (courseId: string, signal?: AbortSignal): Promise<AssessmentTestSummary[]> =>
      apiFetch(`/instructor/courses/${segment(courseId)}/tests`, { signal }),
    create: (courseId: string, input: TestInput): Promise<AssessmentTestDetail> =>
      apiFetch(`/instructor/courses/${segment(courseId)}/tests`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    get: (testId: string, signal?: AbortSignal): Promise<AssessmentTestDetail> =>
      apiFetch(`/instructor/tests/${segment(testId)}`, { signal }),
    update: (testId: string, input: Partial<TestInput>): Promise<AssessmentTestDetail> =>
      apiFetch(`/instructor/tests/${segment(testId)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    delete: (testId: string): Promise<{ message: string }> =>
      apiFetch(`/instructor/tests/${segment(testId)}`, { method: 'DELETE' }),
    publish: (testId: string): Promise<AssessmentTestDetail> =>
      apiFetch(`/instructor/tests/${segment(testId)}/publish`, { method: 'PATCH' }),
    unpublish: (testId: string): Promise<AssessmentTestDetail> =>
      apiFetch(`/instructor/tests/${segment(testId)}/unpublish`, { method: 'PATCH' }),
  },
  testQuestions: {
    add: (
      testId: string,
      questionId: string,
      points: number,
    ): Promise<AssessmentTestQuestion> =>
      apiFetch(`/instructor/tests/${segment(testId)}/questions`, {
        method: 'POST',
        body: JSON.stringify({ questionId, points }),
      }),
    update: (
      testId: string,
      testQuestionId: string,
      points: number,
    ): Promise<AssessmentTestQuestion> =>
      apiFetch(
        `/instructor/tests/${segment(testId)}/questions/${segment(testQuestionId)}`,
        { method: 'PATCH', body: JSON.stringify({ points }) },
      ),
    delete: (testId: string, testQuestionId: string): Promise<{ message: string }> =>
      apiFetch(
        `/instructor/tests/${segment(testId)}/questions/${segment(testQuestionId)}`,
        { method: 'DELETE' },
      ),
    reorder: (testId: string, orderedIds: string[]): Promise<AssessmentTestQuestion[]> =>
      apiFetch(`/instructor/tests/${segment(testId)}/questions/reorder`, {
        method: 'PATCH',
        body: JSON.stringify({ orderedIds }),
      }),
  },
};

export const studentAssessmentApi = {
  listTests: (enrollmentId: string, signal?: AbortSignal): Promise<StudentTestListItem[]> =>
    apiFetch(`/learning/enrollments/${segment(enrollmentId)}/tests`, { signal }),
  startOrResume: (enrollmentId: string, testId: string): Promise<StudentAttemptStart> =>
    apiFetch(
      `/learning/enrollments/${segment(enrollmentId)}/tests/${segment(testId)}/attempts`,
      { method: 'POST' },
    ),
  getAttempt: (
    enrollmentId: string,
    attemptId: string,
    signal?: AbortSignal,
  ): Promise<StudentAttemptContent> =>
    apiFetch(
      `/learning/enrollments/${segment(enrollmentId)}/attempts/${segment(attemptId)}`,
      { signal },
    ),
  saveAnswers: (
    enrollmentId: string,
    attemptId: string,
    answers: StudentAnswerSelection[],
  ): Promise<{ attemptId: string; answers: StudentAnswerSelection[] }> =>
    apiFetch(
      `/learning/enrollments/${segment(enrollmentId)}/attempts/${segment(attemptId)}/answers`,
      { method: 'PATCH', body: JSON.stringify({ answers }) },
    ),
  submit: (
    enrollmentId: string,
    attemptId: string,
    answers: StudentAnswerSelection[],
  ): Promise<StudentSubmission> =>
    apiFetch(
      `/learning/enrollments/${segment(enrollmentId)}/attempts/${segment(attemptId)}/submit`,
      { method: 'POST', body: JSON.stringify({ answers }) },
    ),
  getResult: (
    enrollmentId: string,
    attemptId: string,
    signal?: AbortSignal,
  ): Promise<StudentAttemptResult> =>
    apiFetch(
      `/learning/enrollments/${segment(enrollmentId)}/attempts/${segment(attemptId)}/result`,
      { signal },
    ),
};
