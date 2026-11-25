import { apiFetch } from '@/lib/api-client';
export type WorkflowPolicy = {
  id: string;
  kind: string;
  mode: string;
  sourceId: string | null;
  body?: Record<string, unknown>;
  authorId?: string;
  approvedById?: string | null;
  approved?: boolean;
};
export type WorkflowConfig = {
  internalAssessment?: boolean;
  role: string;
  permissions: Record<string, boolean>;
  privateDev: true;
  realExamEnabled: false;
  policies: WorkflowPolicy[];
  sources: {
    id: string;
    mode: string;
    title: string;
    itemCount: number;
    sourceHash?: string;
    taskReferences?: unknown[];
  }[];
  graders?: { id: string; fullName: string }[];
};
export type Sitting = {
  internalAssessment?: boolean;
  awaitingUpload?: boolean;
  attemptId: string;
  phase: string;
  taskIndex: number;
  phaseStartedAt: string;
  deadline: string | null;
  serverTime: string;
  lockVersion: number;
  receipt: string | null;
  blockedReason: string | null;
  mode: string;
  title: string;
  marked: string[];
  groups: {
    id: string;
    skill: string;
    title: string | null;
    taskCode: string;
    instructions: string | null;
    stimulusText: string | null;
    window: { preparationSeconds: number; playbackSeconds: number; responseSeconds: number } | null;
    stimuli: { id: string; type: string; textContent: string | null; mediaUrl: string | null }[];
    questions: {
      testQuestionId: string;
      content: string;
      responseType: string;
      options: { id: string; content: string }[];
      selectedOptionIds: string[];
      textResponse: string | null;
      audioUploaded: boolean;
      recordingState?: string | null;
    }[];
  }[];
};
export type WorkflowReview = {
  internalAssessment?: boolean;
  mode: string;
  attemptId: string;
  attemptRef?: string;
  learnerName?: string | null;
  submittedAt?: string | null;
  sourceTitle?: string | null;
  state: string;
  currentAssignment?: {
    id: string;
    number: number;
    graderId: string;
    graderName: string;
    assignedAt: string;
    reason: string;
  } | null;
  swTaskCounts?: {
    speaking: number;
    writing: number;
  };
  tasks: {
    groupId: string;
    questionId: string;
    skill: string;
    prompt: string;
    text: string | null;
    recordingUrl: string | null;
  }[];
  rubrics: WorkflowPolicy[];
  evaluations: {
    id: string;
    skill: string;
    number: number;
    graderId: string | null;
    body: Record<string, unknown>;
    release: unknown;
  }[];
};
export type WorkflowDiagnostic = {
  internalAssessment?: boolean;
  attemptId?: string;
  attemptRef?: string;
  mode?: string;
  state: string;
  label: string;
  goals: Record<string, number | null>;
  skillResults: {
    skill: string;
    status: string;
    value: number | null;
    samples: number | null;
    scale: string | null;
  }[];
  parts: { part: string; skill: string; correct: number; samples: number }[];
  matching: {
    status: string;
    asOf?: string;
    reasons: string[];
    classes: {
      id: string;
      name: string;
      code?: string;
      availableSeats: number;
      rationale: string[];
      schedule?: { startsAt: string; endsAt: string; modality: string }[];
    }[];
  };
  diagnosis?: {
    snapshotVersion: string;
    sourceDigestRef: string;
    minSamplesThreshold: number;
    overallSummary: {
      lrAnsweredCount: number;
      lrTotalItems: number;
      lrCorrectCount: number | null;
      lrAccuracyPct: number | null;
      listeningCorrect: number | null;
      listeningSamples: number;
      listeningAccuracyPct: number | null;
      readingCorrect: number | null;
      readingSamples: number;
      readingAccuracyPct: number | null;
      balanceState: string;
      balanceLabelVi: string;
      internalScaleDisclosureVi: string;
    };
    partBreakdown: {
      part: string;
      partNumber: number | null;
      skill: string;
      titleVi: string;
      descriptionVi: string;
      samples: number;
      answered: number;
      correct: number;
      wrong?: number;
      unanswered?: number;
      answeredAccuracyPct?: number | null;
      accuracyPct: number | null;
      minSamplesRequired: number;
      sufficiency: string;
      statusLabel: string;
      canClaimWeakness: boolean;
    }[];
    knowledgeBreakdown: {
      domainCode: string;
      skill: string;
      partScope: string;
      titleVi: string;
      descriptionVi: string;
      samples: number;
      answered: number;
      correct: number;
      wrong?: number;
      unanswered?: number;
      answeredAccuracyPct?: number | null;
      accuracyPct: number | null;
      minSamplesRequired: number;
      sufficiency: string;
      statusLabel: string;
      canClaimWeakness: boolean;
      observedTopicTags: string[];
      linkedArticleSlugs: string[];
    }[];
    difficultyBreakdown: {
      bandCode: string;
      titleVi: string;
      samples: number;
      answered: number;
      correct: number;
      accuracyPct: number | null;
      sufficiency: string;
      statusLabel: string;
    }[];
    productiveSkills: {
      skill: 'SPEAKING' | 'WRITING';
      status: 'PUBLISHED' | 'PENDING_REVIEW' | 'NOT_ASSESSED';
      statusLabel: string;
      totalScore: number | null;
      maxPossibleScore: number | null;
      taskCount: number;
      scaleLabel: string | null;
      criteriaBreakdown: {
        taskGroupId: string;
        taskTitle: string;
        code: string;
        score: number;
        maxScore: number | null;
        feedbackText: string;
      }[];
      pendingNotice: string | null;
    }[];
    strengths: {
      rank: number;
      kind: 'STRENGTH' | 'IMPROVEMENT_PRIORITY';
      domainCode: string;
      partScope: string;
      skill: string;
      titleVi: string;
      correct: number;
      samples: number;
      accuracyPct: number;
      evidenceBadge: string;
      pedagogicalSummary: string;
      actionableStep: string;
    }[];
    improvements: {
      rank: number;
      kind: 'STRENGTH' | 'IMPROVEMENT_PRIORITY';
      domainCode: string;
      partScope: string;
      skill: string;
      titleVi: string;
      correct: number;
      samples: number;
      accuracyPct: number;
      evidenceBadge: string;
      pedagogicalSummary: string;
      actionableStep: string;
    }[];
    lowSampleNotes: string[];
    limitations: string[];
  };
  recommendation?: {
    recommendationVersion: string;
    policyId: string | null;
    policyDigestRef: string | null;
    evaluatedAt: string;
    overallStatus: string;
    overallStatusLabelVi: string;
    overallSummaryVi: string;
    courseEvaluations: {
      courseVersionId: string;
      courseId: string;
      courseTitle: string;
      courseSlug: string;
      level: string;
      skillScope: string;
      courseDescription?: string | null;
      matchedDiagnosisPointsVi?: string[];
      status: string;
      statusBadgeVi: string;
      priorityRank: number;
      fitSummaryVi: string;
      ruleTraces: {
        skill: string;
        part: string | null;
        domainCode: string | null;
        observedValue: number | null;
        observedSamples: number | null;
        requiredMin: number;
        requiredMax: number;
        requiredMinSamples: number;
        scale: string;
        matched: boolean;
        traceTextVi: string;
      }[];
      openClassCount: number;
      unavailableClassCount: number;
    }[];
    availableClasses: {
      classId: string;
      classCode: string;
      className: string;
      courseVersionId: string;
      courseTitle: string;
      courseSlug: string;
      courseLevel?: string;
      courseSkillScope?: string;
      courseDescription?: string | null;
      matchedDiagnosisPointsVi?: string[];
      modality: string;
      pricingType: string;
      tuitionFeeVnd: number | null;
      maxStudents: number | null;
      enrolledCount: number;
      availableSeats: number;
      availabilityStatus: string;
      availabilityBadgeVi: string;
      scheduleSummaryVi: string[];
      fitReasonsVi: string[];
      unavailabilityReasonCode: string | null;
      unavailabilityReasonVi: string | null;
    }[];
    unavailableClasses: {
      classId: string;
      classCode: string;
      className: string;
      courseVersionId: string;
      courseTitle: string;
      courseSlug: string;
      courseLevel?: string;
      courseSkillScope?: string;
      courseDescription?: string | null;
      matchedDiagnosisPointsVi?: string[];
      modality: string;
      pricingType: string;
      tuitionFeeVnd: number | null;
      maxStudents: number | null;
      enrolledCount: number;
      availableSeats: number;
      availabilityStatus: string;
      availabilityBadgeVi: string;
      scheduleSummaryVi: string[];
      fitReasonsVi: string[];
      unavailabilityReasonCode: string | null;
      unavailabilityReasonVi: string | null;
    }[];
  };
  selfStudyGuidance?: {
    domainCode: string;
    partScope: string;
    skill: string;
    topicTitleVi: string;
    observedEvidence: string;
    focusSummaryVi: string;
    searchKeywords: string[];
    resourceStatus: 'VETTED_AVAILABLE' | 'NO_VETTED_LINK';
    resourceStatusLabel: string;
    vettedResources: {
      slug: string;
      title: string;
      path: string;
      kind: string;
      verifiedSource: string;
    }[];
  }[];
  aiProviderReady?: boolean;
  aiAdvisory?: {
    providerStatus: string;
    liveVerified: boolean;
    fallbackUsed: boolean;
    fallbackReason: string | null;
    modeBadge: string;
    disclosureVi: string;
    diagnosisAdvisory: string;
    classFitAdvisory: string;
    selfStudyAdvisory: string;
  };
};
const root = '/v2/placement/workflow';
export const workflow = {
  get: <T>(path: string, signal?: AbortSignal) => apiFetch<T>(root + path, { signal }),
  post: <T>(path: string, b: unknown) =>
    apiFetch<T>(root + path, { method: 'POST', body: JSON.stringify(b) }),
  config: () => apiFetch<WorkflowConfig>(root + '/config'),
};
