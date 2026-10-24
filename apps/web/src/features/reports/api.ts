import { apiFetch } from '@/lib/api-client';

export type ReportSkill = 'LISTENING' | 'READING' | 'SPEAKING' | 'WRITING';
export interface LearningReport {
  enrollment: {
    id: string;
    status: string;
    classOffering: { id: string; name: string; code: string };
    course: { id: string; title: string };
  };
  modules: Array<{
    id: string;
    title: string;
    orderIndex: number;
    lessons: Array<{
      id: string;
      title: string;
      orderIndex: number;
      status: string;
      completedAt?: string | null;
    }>;
  }>;
  assessments: Array<{
    id: string;
    status: string;
    score?: number | null;
    maxScore?: number | null;
    startedAt: string;
    submittedAt?: string | null;
    resultState: 'FINAL' | 'PENDING_REVIEW' | 'IN_PROGRESS';
    test: { id: string; title: string; purpose: string };
    classAssessment?: { id: string; stage: string } | null;
    skillScores: Array<{
      skill: ReportSkill;
      normalizedScore?: number | null;
      estimatedToeicScore?: number | null;
      status: 'PROVISIONAL' | 'FINAL';
      source: string;
    }>;
  }>;
  skillTrend: Array<{
    attemptId: string;
    submittedAt?: string | null;
    skill: ReportSkill;
    normalizedScore?: number | null;
    estimatedToeicScore?: number | null;
    status: 'PROVISIONAL' | 'FINAL';
    source: string;
  }>;
  attendance: {
    totalSessions: number;
    markedSessions: number;
    attendedSessions: number;
    coverageComplete: boolean;
    percent: number | null;
  };
  completion: {
    eligible: boolean;
    unmet: string[];
    policy: {
      minLessonCompletionPercent: number;
      minAttendancePercent: number | null;
      requireFinalAssessment: boolean;
    };
    evidence: {
      lesson: { total: number; completed: number; percent: number };
      attendance: LearningReport['attendance'];
      finalAssessment: { activeCount: number; satisfied: boolean };
    };
  };
  recommendations: Array<{
    id: string;
    title: string;
    actionText: string;
    targetType: string;
    lessonId?: string | null;
    resourceId?: string | null;
  }>;
}

export const reportApi = {
  get: (enrollmentId: string) =>
    apiFetch<LearningReport>(`/learning/enrollments/${enrollmentId}/report`),
};
