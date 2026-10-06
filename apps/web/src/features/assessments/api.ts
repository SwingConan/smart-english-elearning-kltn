import { apiFetch, apiUrl } from '@/lib/api-client';
import type {
  AssessmentQuestion,
  AssessmentTestDetail,
  AssessmentTestQuestion,
  AssessmentTestSummary,
  ClassAssessmentWorkspace,
  GradingDetail,
  GradingQueue,
  QuestionInput,
  StudentAnswerSelection,
  StudentAttemptContent,
  StudentAttemptResult,
  StudentAttemptStart,
  StudentSubmission,
  StudentTestListItem,
  TestInput,
  RubricSummary,
  AssessmentTestGroup,
  ToeicSkill,
  QuestionPage,
  QuestionQuery,
  QuestionImportPreview,
} from './types';

const segment = encodeURIComponent;

export const assessmentApi = {
  rubrics: {
    list: (signal?: AbortSignal): Promise<RubricSummary[]> => apiFetch('/instructor/rubrics', { signal }),
    get: (rubricId: string, signal?: AbortSignal): Promise<RubricSummary> => apiFetch(`/instructor/rubrics/${segment(rubricId)}`, { signal }),
  },
  questions: {
    page: (courseId: string, query: QuestionQuery = {}, signal?: AbortSignal): Promise<QuestionPage> => {
      const params = new URLSearchParams();
      Object.entries(query).forEach(([key, value]) => { if (value !== undefined && value !== '') params.set(key, String(value)); });
      return apiFetch(`/instructor/courses/${segment(courseId)}/questions?${params}`, { signal });
    },
    list: async (courseId: string, signal?: AbortSignal): Promise<AssessmentQuestion[]> =>
      (await assessmentApi.questions.page(courseId, { pageSize: 100 }, signal)).items,
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
    previewImport: (courseId: string, file: File): Promise<QuestionImportPreview> => {
      const body = new FormData();
      body.append('file', file);
      return apiFetch(`/instructor/courses/${segment(courseId)}/questions/import-preview`, { method: 'POST', body });
    },
    confirmImport: (courseId: string, rows: QuestionInput[]): Promise<{ importedCount: number; questionIds: string[] }> =>
      apiFetch(`/instructor/courses/${segment(courseId)}/questions/import-confirm`, { method: 'POST', body: JSON.stringify({ rows }) }),
    downloadTemplate: async (courseId: string): Promise<void> => {
      const response = await fetch(apiUrl(`/instructor/courses/${segment(courseId)}/questions/import-template`), { credentials: 'include' });
      if (!response.ok) throw new Error('Download failed');
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'question-import-template.xlsx';
      anchor.click();
      URL.revokeObjectURL(url);
    },
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
  groups: {
    create: (testId: string, input: { skill: ToeicSkill; title?: string | null; instructions?: string | null; preparationSeconds?: number | null; responseSeconds?: number | null; recommendedSeconds?: number | null; maxRecordingSeconds?: number | null }): Promise<AssessmentTestGroup> => apiFetch(`/instructor/tests/${segment(testId)}/groups`, { method: 'POST', body: JSON.stringify(input) }),
    update: (testId: string, groupId: string, input: { skill: ToeicSkill; title?: string | null; instructions?: string | null; preparationSeconds?: number | null; responseSeconds?: number | null; recommendedSeconds?: number | null; maxRecordingSeconds?: number | null }): Promise<AssessmentTestGroup> => apiFetch(`/instructor/tests/${segment(testId)}/groups/${segment(groupId)}`, { method: 'PATCH', body: JSON.stringify(input) }),
    delete: (testId: string, groupId: string): Promise<{ message: string }> => apiFetch(`/instructor/tests/${segment(testId)}/groups/${segment(groupId)}`, { method: 'DELETE' }),
    reorder: (testId: string, orderedGroupIds: string[]): Promise<AssessmentTestGroup[]> => apiFetch(`/instructor/tests/${segment(testId)}/groups/reorder`, { method: 'PATCH', body: JSON.stringify({ orderedGroupIds }) }),
    addText: (testId: string, groupId: string, textContent: string) => apiFetch(`/instructor/tests/${segment(testId)}/groups/${segment(groupId)}/stimuli/text`, { method: 'POST', body: JSON.stringify({ textContent }) }),
    upload: (testId: string, groupId: string, file: File, altText = '') => { const body = new FormData(); body.append('file', file); body.append('altText', altText); return apiFetch(`/instructor/tests/${segment(testId)}/groups/${segment(groupId)}/stimuli/upload`, { method: 'POST', body }); },
    deleteStimulus: (testId: string, groupId: string, stimulusId: string) => apiFetch(`/instructor/tests/${segment(testId)}/groups/${segment(groupId)}/stimuli/${segment(stimulusId)}`, { method: 'DELETE' }),
    reorderStimuli: (testId: string, groupId: string, orderedStimulusIds: string[]) => apiFetch(`/instructor/tests/${segment(testId)}/groups/${segment(groupId)}/stimuli/reorder`, { method: 'PATCH', body: JSON.stringify({ orderedStimulusIds }) }),
  },
  testQuestions: {
    add: (
      testId: string,
      questionId: string,
      points: number,
      groupId?: string,
    ): Promise<AssessmentTestQuestion> =>
      apiFetch(`/instructor/tests/${segment(testId)}/questions`, {
        method: 'POST',
        body: JSON.stringify({ questionId, points, groupId }),
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
    moveGroup: (testId: string, testQuestionId: string, groupId: string | null): Promise<AssessmentTestQuestion> =>
      apiFetch(`/instructor/tests/${segment(testId)}/questions/${segment(testQuestionId)}/group`, { method: 'PATCH', body: JSON.stringify({ groupId }) }),
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
  uploadAudio: (
    enrollmentId: string,
    attemptId: string,
    testQuestionId: string,
    audio: Blob,
  ): Promise<{ playbackUrl: string; state: 'UPLOADED' }> => {
    const formData = new FormData();
    formData.append('file', audio, 'response.webm');
    return apiFetch(
      `/learning/enrollments/${segment(enrollmentId)}/attempts/${segment(attemptId)}/answers/${segment(testQuestionId)}/audio`,
      { method: 'POST', body: formData },
    );
  },
};

export interface ClassAssessmentInput {
  testId: string;
  stage: 'PERIODIC' | 'MIDTERM' | 'FINAL';
  openAt?: string | null;
  closeAt?: string | null;
  maxAttemptsOverride?: number | null;
  isActive?: boolean;
}

export interface GradeAnswerInput {
  expectedUpdatedAt?: string | null;
  criteria: Array<{ rubricCriterionId: string; score: string; feedback?: string | null }>;
  feedback?: string | null;
  finalize: boolean;
  editFinal?: boolean;
}

export const classAssessmentApi = {
  list: (classOfferingId: string, signal?: AbortSignal): Promise<ClassAssessmentWorkspace> =>
    apiFetch(`/instructor/classes/${segment(classOfferingId)}/assessments`, { signal }),
  create: (classOfferingId: string, input: ClassAssessmentInput): Promise<unknown> =>
    apiFetch(`/instructor/classes/${segment(classOfferingId)}/assessments`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  update: (
    classOfferingId: string,
    classAssessmentId: string,
    input: Partial<ClassAssessmentInput>,
  ): Promise<unknown> =>
    apiFetch(
      `/instructor/classes/${segment(classOfferingId)}/assessments/${segment(classAssessmentId)}`,
      { method: 'PATCH', body: JSON.stringify(input) },
    ),
  gradingQueue: (
    classOfferingId: string,
    classAssessmentId: string,
    signal?: AbortSignal,
  ): Promise<GradingQueue> =>
    apiFetch(
      `/instructor/classes/${segment(classOfferingId)}/assessments/${segment(classAssessmentId)}/grading`,
      { signal },
    ),
  gradingDetail: (
    classOfferingId: string,
    classAssessmentId: string,
    attemptId: string,
    signal?: AbortSignal,
  ): Promise<GradingDetail> =>
    apiFetch(
      `/instructor/classes/${segment(classOfferingId)}/assessments/${segment(classAssessmentId)}/attempts/${segment(attemptId)}/grading`,
      { signal },
    ),
  gradeAnswer: (
    classOfferingId: string,
    classAssessmentId: string,
    attemptId: string,
    testQuestionId: string,
    input: GradeAnswerInput,
  ): Promise<unknown> =>
    apiFetch(
      `/instructor/classes/${segment(classOfferingId)}/assessments/${segment(classAssessmentId)}/attempts/${segment(attemptId)}/answers/${segment(testQuestionId)}/evaluation`,
      { method: 'PUT', body: JSON.stringify(input) },
    ),
};
