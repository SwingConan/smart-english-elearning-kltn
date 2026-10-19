import {
  LessonProgressStatus,
  TestAttemptStatus,
  ToeicSkill,
} from '../../generated/prisma/client';
import { StudyRecommendationSelectionBasis } from './study-recommendation-rule-reason';

export const CANONICAL_TASK_ORDER = [
  'L1_PHOTOGRAPH',
  'L2_QUESTION_RESPONSE',
  'L3_CONVERSATION',
  'L4_TALK',
  'R5_INCOMPLETE_SENTENCE',
  'R6_TEXT_COMPLETION',
  'R7_READING_COMPREHENSION',
] as const;

export interface StudyRecommendationPolicyInput {
  code: string;
  weakThreshold: number;
  strongThreshold: number;
  minimumTaskQuestions: number;
  maxRecommendations: number;
}

export interface SkillEvidenceInput {
  skill: ToeicSkill;
  rawScore: number | null;
  maxRawScore: number | null;
  normalizedScore: number;
}

export interface TaskAnswerEvidenceInput {
  taskCode: string | null;
  skill: ToeicSkill;
  pointsAwarded: number | null;
  maxPoints: number;
}

export interface TaskEvidence {
  taskCode: string;
  skill: ToeicSkill;
  questionCount: number;
  awardedPoints: number;
  maxPoints: number;
  normalizedScore: number;
}

export interface LessonCandidate {
  id: string;
  title: string;
  focusSkills: ToeicSkill[];
  focusTaskCodes: string[];
  progressStatus: LessonProgressStatus;
  practiceAvailable: boolean;
  moduleOrder: number;
  lessonOrder: number;
}

export interface SelectedTarget {
  lesson: LessonCandidate;
  skillEvidence: SkillEvidenceInput;
  taskEvidence: TaskEvidence | null;
  basis: StudyRecommendationSelectionBasis;
}

export interface PracticeActionabilityInput {
  maxAttempts: number;
  assignment: {
    openAt: Date | null;
    closeAt: Date | null;
    maxAttemptsOverride: number | null;
    attempts: Array<{ status: TestAttemptStatus }>;
  };
}

export function isPracticeActionable(
  input: PracticeActionabilityInput,
  now = new Date(),
): boolean {
  const { assignment } = input;
  const maxAttempts = assignment.maxAttemptsOverride ?? input.maxAttempts;
  const hasInProgress = assignment.attempts.some(
    ({ status }) => status === TestAttemptStatus.IN_PROGRESS,
  );
  return (
    (!assignment.openAt || assignment.openAt <= now) &&
    (!assignment.closeAt || assignment.closeAt > now) &&
    (hasInProgress || assignment.attempts.length < maxAttempts)
  );
}

export function validateStudyRecommendationPolicy(
  policy: StudyRecommendationPolicyInput,
): StudyRecommendationPolicyInput {
  if (
    !policy.code ||
    !Number.isFinite(policy.weakThreshold) ||
    !Number.isFinite(policy.strongThreshold) ||
    policy.weakThreshold < 0 ||
    policy.weakThreshold >= policy.strongThreshold ||
    policy.strongThreshold > 100 ||
    !Number.isInteger(policy.minimumTaskQuestions) ||
    policy.minimumTaskQuestions < 1 ||
    policy.minimumTaskQuestions > 20 ||
    !Number.isInteger(policy.maxRecommendations) ||
    policy.maxRecommendations < 1 ||
    policy.maxRecommendations > 5
  ) {
    throw new Error('STUDY_RECOMMENDATION_POLICY_INVALID');
  }
  return policy;
}

export function analyzeSkillEvidence(
  rows: SkillEvidenceInput[],
  policy: StudyRecommendationPolicyInput,
) {
  validateStudyRecommendationPolicy(policy);
  const ordered = [...rows].sort(
    (left, right) =>
      left.normalizedScore - right.normalizedScore || left.skill.localeCompare(right.skill),
  );
  if (!ordered.length) {
    return { balanced: true, strongestSkill: null, weakestSkill: null, strengths: [], focus: [] };
  }
  const weakestScore = ordered[0].normalizedScore;
  const strongestScore = ordered[ordered.length - 1].normalizedScore;
  const balanced = weakestScore === strongestScore;
  const thresholdStrengths = ordered.filter(
    ({ normalizedScore }) => normalizedScore >= policy.strongThreshold,
  );
  const thresholdFocus = ordered.filter(
    ({ normalizedScore }) => normalizedScore <= policy.weakThreshold,
  );
  return {
    balanced,
    strongestSkill: balanced ? null : ordered[ordered.length - 1].skill,
    weakestSkill: balanced ? null : ordered[0].skill,
    strengths: thresholdStrengths.length
      ? thresholdStrengths.map((evidence) => ({ evidence, relative: false }))
      : [{ evidence: ordered[ordered.length - 1], relative: true }],
    focus: thresholdFocus.length
      ? thresholdFocus.map((evidence) => ({ evidence, maintenance: false }))
      : [{ evidence: ordered[0], maintenance: true }],
  };
}

export function groupTaskEvidence(
  answers: TaskAnswerEvidenceInput[],
  targetSkills: ToeicSkill[],
  minimumTaskQuestions: number,
): TaskEvidence[] {
  const targetSet = new Set(targetSkills);
  const grouped = new Map<string, Omit<TaskEvidence, 'normalizedScore'>>();
  for (const answer of answers) {
    if (
      !answer.taskCode ||
      !targetSet.has(answer.skill) ||
      answer.pointsAwarded === null ||
      answer.maxPoints <= 0
    ) {
      continue;
    }
    const current = grouped.get(answer.taskCode) ?? {
      taskCode: answer.taskCode,
      skill: answer.skill,
      questionCount: 0,
      awardedPoints: 0,
      maxPoints: 0,
    };
    current.questionCount += 1;
    current.awardedPoints += answer.pointsAwarded;
    current.maxPoints += answer.maxPoints;
    grouped.set(answer.taskCode, current);
  }
  const canonicalIndex = new Map<string, number>(
    CANONICAL_TASK_ORDER.map((code, index) => [code, index]),
  );
  return [...grouped.values()]
    .filter(({ questionCount }) => questionCount >= minimumTaskQuestions)
    .map((evidence) => ({
      ...evidence,
      normalizedScore: roundPercent((evidence.awardedPoints / evidence.maxPoints) * 100),
    }))
    .sort(
      (left, right) =>
        left.normalizedScore - right.normalizedScore ||
        right.maxPoints - left.maxPoints ||
        (canonicalIndex.get(left.taskCode) ?? Number.MAX_SAFE_INTEGER) -
          (canonicalIndex.get(right.taskCode) ?? Number.MAX_SAFE_INTEGER) ||
        left.taskCode.localeCompare(right.taskCode),
    );
}

export function selectRecommendationTargets(input: {
  policy: StudyRecommendationPolicyInput;
  skillEvidence: SkillEvidenceInput[];
  taskEvidence: TaskEvidence[];
  lessons: LessonCandidate[];
}): SelectedTarget[] {
  const policy = validateStudyRecommendationPolicy(input.policy);
  const analysis = analyzeSkillEvidence(input.skillEvidence, policy);
  const skillByCode = new Map(input.skillEvidence.map((row) => [row.skill, row]));
  const selected: SelectedTarget[] = [];
  const used = new Set<string>();
  const orderedLessons = [...input.lessons].sort(compareLessons);

  for (const task of input.taskEvidence) {
    if (selected.length >= policy.maxRecommendations) break;
    const candidates = orderedLessons
      .filter((lesson) => lesson.focusTaskCodes.includes(task.taskCode) && !used.has(lesson.id))
      .sort((left, right) => Number(right.practiceAvailable) - Number(left.practiceAvailable) || compareLessons(left, right));
    const lesson = candidates[0];
    const skillEvidence = skillByCode.get(task.skill);
    if (!lesson || !skillEvidence) continue;
    selected.push({ lesson, skillEvidence, taskEvidence: task, basis: 'TASK_WEAKNESS' });
    used.add(lesson.id);
  }

  for (const focus of analysis.focus) {
    if (selected.length >= policy.maxRecommendations) break;
    if (selected.some(({ skillEvidence }) => skillEvidence.skill === focus.evidence.skill)) continue;
    const lesson = orderedLessons
      .filter(
        (candidate) =>
          candidate.focusSkills.includes(focus.evidence.skill) && !used.has(candidate.id),
      )
      .sort(
        (left, right) =>
          progressRank(left.progressStatus) - progressRank(right.progressStatus) ||
          compareLessons(left, right),
      )[0];
    if (!lesson) continue;
    selected.push({
      lesson,
      skillEvidence: focus.evidence,
      taskEvidence: null,
      basis: focus.maintenance ? 'MAINTENANCE' : 'SKILL_FALLBACK',
    });
    used.add(lesson.id);
  }
  return selected;
}

export interface ScheduleRecommendationInput {
  id: string;
  lessonPath: string;
  lessonTitle: string;
  practicePath: string | null;
}

export function buildSevenDayPlan(recommendations: ScheduleRecommendationInput[]) {
  if (!recommendations.length) return [];
  const first = recommendations[0];
  const second = recommendations[1] ?? first;
  return [
    planDay(1, `Học ${first.lessonTitle}`, first.lessonPath),
    planDay(2, `Tóm tắt và tự kiểm tra ${first.lessonTitle}`, null),
    planDay(
      3,
      first.practicePath
        ? `Làm bài luyện ${first.lessonTitle}`
        : `Ôn lại ${first.lessonTitle}`,
      first.practicePath ?? first.lessonPath,
    ),
    planDay(4, 'Ôn nhẹ hoặc nghỉ', null),
    planDay(5, `Học ${second.lessonTitle}`, second.lessonPath),
    planDay(
      6,
      second.practicePath
        ? `Làm bài luyện ${second.lessonTitle}`
        : `Ôn lại ${second.lessonTitle}`,
      second.practicePath ?? second.lessonPath,
    ),
    planDay(7, `Xem lại lỗi sai và ôn ${first.lessonTitle}`, first.lessonPath),
  ];
}

function planDay(day: number, title: string, path: string | null) {
  return { day, title, path };
}

function compareLessons(left: LessonCandidate, right: LessonCandidate): number {
  return left.moduleOrder - right.moduleOrder || left.lessonOrder - right.lessonOrder || left.id.localeCompare(right.id);
}

function progressRank(status: LessonProgressStatus): number {
  return status === LessonProgressStatus.COMPLETED ? 1 : 0;
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}
