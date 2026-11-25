import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuth } from '@/features/auth/auth-context';

/** GET-only bound reads: old principal/path responses cannot remain on screen. */
export function useProductRead<T>(path: string) {
  const { user } = useAuth();
  const [tick, setTick] = useState(0);
  const key = `${user?.id ?? ''}:${path}:${tick}`;
  const [state, setState] = useState<{
    key: string;
    phase: 'READY' | 'DENIED' | 'ERROR';
    data?: T;
  }>();
  useEffect(() => {
    let active = true;
    if (!user) return;
    void apiFetch<T>(path)
      .then((data) => {
        if (active) setState({ key, phase: 'READY', data });
      })
      .catch((e) => {
        if (active)
          setState({
            key,
            phase: e instanceof ApiError && [401, 403, 404].includes(e.status) ? 'DENIED' : 'ERROR',
          });
      });
    return () => {
      active = false;
    };
  }, [path, key, user]);
  return {
    phase: !user ? 'DENIED' : state?.key === key ? state.phase : 'LOADING',
    data: state?.key === key ? state.data : undefined,
    reload: () => setTick((t) => t + 1),
  };
}

export interface ClassProgressSectionActivity {
  activityId: string;
  title: string;
  type: string;
  localKind: string | null;
  assessmentKind: string | null;
  state: string;
  isUpcoming: boolean;
  availableFrom: string | null;
  availableUntil: string | null;
  score: number | null;
  maxScore: number | null;
  passScore: number | null;
  passed: boolean | null;
  attendanceStatus: string | null;
  submittedAt: string | null;
  gradedAt: string | null;
  feedback: string;
}

export interface ClassProgressSection {
  sectionId: string;
  title: string;
  orderIndex: number;
  totalPublishedActivities: number;
  openActivitiesCount: number;
  upcomingActivitiesCount: number;
  completedOrSubmittedCount: number;
  publishedGradesCount: number;
  notStartedOpenCount: number;
  completionRatioPercent: number | null;
  activities: ClassProgressSectionActivity[];
}

export interface ClassProgressAssessmentBucket {
  label: string;
  totalOpen: number;
  completedOrSubmitted: number;
  publishedCount: number;
  pendingCount: number;
  averagePercent: number | null;
  insufficientData: boolean;
  items: Array<{
    activityId: string;
    title: string;
    state: string;
    score: number | null;
    maxScore: number | null;
    passed: boolean | null;
    gradedAt: string | null;
    feedback: string;
  }>;
}

export interface ClassProgress {
  class: { id: string; code: string; name: string };
  enrollmentId: string;
  courseVersionId: string | null;
  observedAt: string;
  completion: 'POLICY_NOT_EVALUATED';
  percentage: null;
  certificateIssued: boolean;
  q05Completion?: {
    enabled: boolean;
    hasPolicy: boolean;
    policyCode: string | null;
    policyTitle: string | null;
    isTestPolicy: boolean;
    latestReviewDecision: string | null;
    status: string;
    statusLabel: string;
    certificateCode: string | null;
    certificateState: string | null;
  };
  summary?: {
    totalActivities: number;
    completedOrSubmittedCount: number;
    publishedGradesCount: number;
    attendanceCheckedCount: number;
  };
  activityProgress?: {
    totalPublishedActivities: number;
    openActivitiesCount: number;
    upcomingActivitiesCount: number;
    completedOrSubmittedCount: number;
    completedCount: number;
    pendingGradingOrReleaseCount: number;
    inProgressCount: number;
    notStartedOpenCount: number;
    completionRatioPercent: number | null;
    formulaLabel: string;
    policyStatus: string;
    policyNote: string;
  };
  sections?: ClassProgressSection[];
  assessmentSummary?: {
    lessonsAndResources: {
      label: string;
      totalOpen: number;
      completed: number;
      inProgress: number;
      notStarted: number;
    };
    assignments: ClassProgressAssessmentBucket;
    quizzes: ClassProgressAssessmentBucket;
    regularExams: ClassProgressAssessmentBucket;
    midtermExams: ClassProgressAssessmentBucket;
    finalExams: ClassProgressAssessmentBucket;
    attendance: {
      label: string;
      totalOpen: number;
      checkedCount: number;
      presentCount: number;
      lateCount: number;
      insufficientData: boolean;
      items: Array<{
        activityId: string;
        title: string;
        state: string;
        attendanceStatus: string | null;
        checkedInAt: string | null;
      }>;
    };
  };
  competencyAnalysis?: {
    evaluatedAssessmentsCount: number;
    pendingResultsCount: number;
    hasEnoughData: boolean;
    insufficientDataReason: string | null;
    skillBreakdown: Array<{
      skill: string;
      label: string;
      status: 'STRONG' | 'MODERATE' | 'NEEDS_IMPROVEMENT' | 'INSUFFICIENT_DATA';
      percentage: number | null;
      earnedPoints: number;
      maxPoints: number;
      correctItems: number;
      totalItems: number;
    }>;
    strengths: Array<{
      skill: string;
      label: string;
      percentage: number;
      evidenceSummary: string;
    }>;
    weaknesses: Array<{
      skill: string;
      label: string;
      percentage: number;
      status: string;
      evidenceCount: number;
      evidenceSummary: string;
    }>;
    weaknessEvidence: Array<{
      id: string;
      sourceType: string;
      activityId: string | null;
      activityTitle: string;
      assessmentKind: string | null;
      gradedAt: string | null;
      skill: string;
      skillLabel: string;
      topicTag: string;
      prompt: string;
      learnerAnswer: string;
      correctAnswer: string | null;
      earnedPoints: number;
      maxPoints: number;
      explanation: string;
    }>;
    trendAnalysis: {
      status: 'IMPROVING' | 'DECLINING' | 'STABLE' | 'INSUFFICIENT_DATA';
      sampleCount: number;
      deltaPercent: number | null;
      message: string;
      samples: Array<{ label: string; at: string; percent: number }>;
    };
  };
  recommendations?: Array<{
    id: string;
    kind: 'CLASS_LESSON' | 'CLASS_RESOURCE' | 'KNOWLEDGE_ARTICLE' | 'NEXT_OPEN_ACTIVITY';
    title: string;
    subtitle: string;
    targetSkill: string | null;
    reason: string;
    href: string;
    accessible: true;
  }>;
  placementReference?: {
    hasPlacementAttempt: boolean;
    blendedIntoClassMetrics: false;
    separationNotice: string;
    latestAttempt: {
      attemptId: string;
      title: string;
      submittedAt: string | null;
      score: number | null;
      maxScore: number | null;
    } | null;
  };
  analysisMeta?: {
    mode: 'RULE_BASED';
    generatedFrom: string[];
    thresholdsNote: string;
  };
  aiAdvisory?: {
    status: 'DISABLED';
    provider: string;
    reason: string;
  };
  entries: {
    activityId: string;
    revisionId: string;
    revisionNumber: number;
    title: string;
    type: string;
    localKind?: string;
    assessmentKind?: string;
    attendanceStatus?: string;
    score?: number;
    maxScore?: number;
    state: string;
  }[];
}

export interface CompletionReadiness {
  assessment: 'PENDING_POLICY' | 'EVALUATED' | 'ISSUED';
  certificates: any[] | null;
  issuanceAvailable: boolean;
  certificateRecordsVerified?: boolean;
  enrollments: {
    enrollmentId: string;
    enrollmentStatus?: string;
    classId?: string;
    classCode?: string;
    className?: string;
    courseVersionId?: string | null;
    lmsProgress?: {
      completedActivities: number;
      totalActivities: number;
      progressPercent: number;
    } | null;
    class?: { id: string; code: string; name: string; courseVersionId: string | null };
    assessment: string;
    statusLabel?: string;
    missingEvidence?: string[];
    policy?: {
      id: string;
      code: string;
      version: number;
      title: string;
      description?: string;
      state: string;
      isTestPolicy?: boolean;
    } | null;
    evaluation?: {
      overall: string;
      criteria: {
        criterionId: string;
        domain: string;
        label?: string;
        component?: string | null;
        scale?: string;
        observedNumericValue?: number | null;
        minNumericValue?: number | null;
        missingReason?: string | null;
        required: boolean;
        status: string;
        reasonCode: string;
      }[];
    } | null;
    evidenceSummary?: {
      w03?: {
        publishedAssignmentGrades: number;
        publishedQuizAttempts: number;
        avgGradePercent: number | null;
        componentAverages?: Record<string, number | null>;
      };
      w06?: {
        totalOpenedSessions: number;
        attendedSessions: number;
        attendanceRatePercent: number | null;
      };
    } | null;
    certificate?: {
      id: string;
      certificateCode: string;
      state: 'ISSUED' | 'REVOKED';
      isTestPolicy: boolean;
      issuedAt: string;
      revokedAt?: string | null;
      revokeReason?: string | null;
      immutableSnapshot?: any;
    } | null;
  }[];
}

export interface OperationsReadiness {
  viewerId: string;
  role: string;
  mode: 'INTEGRATION_BLOCKED';
  health: 'UNKNOWN';
  runtimeAuthorized: false;
  publicationAvailable: false;
  exportAvailable: false;
  missingCapabilities: string[];
  sources: { domain: string; state: string; reason: string }[];
}

export const progressLabels: Record<string, string> = {
  NOT_STARTED: 'Chưa làm / Chưa bắt đầu',
  IN_PROGRESS: 'Đang làm',
  COMPLETED: 'Đã hoàn thành hoạt động',
  DRAFT: 'Bản nháp của bạn',
  SUBMITTED: 'Đã nộp',
  PENDING_REVIEW: 'Chờ chấm bài',
  PENDING_RELEASE: 'Chờ công bố kết quả',
  PUBLISHED: 'Kết quả đã công bố',
};
