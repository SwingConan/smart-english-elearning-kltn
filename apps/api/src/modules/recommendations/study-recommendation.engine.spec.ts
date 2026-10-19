import { LessonProgressStatus, ToeicSkill } from '../../generated/prisma/client';
import {
  analyzeSkillEvidence,
  buildSevenDayPlan,
  groupTaskEvidence,
  LessonCandidate,
  selectRecommendationTargets,
  StudyRecommendationPolicyInput,
  validateStudyRecommendationPolicy,
} from './study-recommendation.engine';
import { parseStudyRecommendationRuleReason } from './study-recommendation-rule-reason';

const policy: StudyRecommendationPolicyInput = {
  code: 'M08_STUDY_REC_V1',
  weakThreshold: 60,
  strongThreshold: 80,
  minimumTaskQuestions: 2,
  maxRecommendations: 3,
};

const skills = [
  { skill: ToeicSkill.LISTENING, rawScore: 4, maxRawScore: 10, normalizedScore: 40 },
  { skill: ToeicSkill.READING, rawScore: 9, maxRawScore: 10, normalizedScore: 90 },
];

const lesson = (overrides: Partial<LessonCandidate> = {}): LessonCandidate => ({
  id: overrides.id ?? 'lesson-1',
  title: 'Lesson',
  focusSkills: [ToeicSkill.LISTENING],
  focusTaskCodes: ['L2_QUESTION_RESPONSE'],
  progressStatus: LessonProgressStatus.NOT_STARTED,
  practiceAvailable: false,
  moduleOrder: 0,
  lessonOrder: 0,
  ...overrides,
});

describe('M08-B deterministic study recommendation engine', () => {
  it('accepts the default policy and rejects invalid ranges', () => {
    expect(validateStudyRecommendationPolicy(policy)).toEqual(policy);
    expect(() => validateStudyRecommendationPolicy({ ...policy, weakThreshold: 80 })).toThrow(
      'STUDY_RECOMMENDATION_POLICY_INVALID',
    );
    expect(() => validateStudyRecommendationPolicy({ ...policy, minimumTaskQuestions: 0 })).toThrow();
    expect(() => validateStudyRecommendationPolicy({ ...policy, maxRecommendations: 6 })).toThrow();
  });

  it('selects absolute strengths and weak focus deterministically', () => {
    const result = analyzeSkillEvidence(skills, policy);
    expect(result.strongestSkill).toBe(ToeicSkill.READING);
    expect(result.weakestSkill).toBe(ToeicSkill.LISTENING);
    expect(result.strengths).toEqual([{ evidence: skills[1], relative: false }]);
    expect(result.focus).toEqual([{ evidence: skills[0], maintenance: false }]);
  });

  it('reports a balanced tie while retaining deterministic relative evidence', () => {
    const tied = skills.map((row) => ({ ...row, normalizedScore: 70 }));
    const result = analyzeSkillEvidence(tied, policy);
    expect(result).toMatchObject({ balanced: true, strongestSkill: null, weakestSkill: null });
    expect(result.strengths[0]).toMatchObject({ relative: true });
    expect(result.focus[0]).toMatchObject({ maintenance: true });
  });

  it('uses relative strength and maintenance focus when thresholds are not crossed', () => {
    const result = analyzeSkillEvidence(
      skills.map((row, index) => ({ ...row, normalizedScore: 70 + index * 5 })),
      policy,
    );
    expect(result.strengths[0]).toMatchObject({ relative: true });
    expect(result.focus[0]).toMatchObject({ maintenance: true });
  });

  it('groups finalized task answers and enforces the minimum question count', () => {
    const result = groupTaskEvidence(
      [
        { taskCode: 'L2_QUESTION_RESPONSE', skill: ToeicSkill.LISTENING, pointsAwarded: 0, maxPoints: 1 },
        { taskCode: 'L2_QUESTION_RESPONSE', skill: ToeicSkill.LISTENING, pointsAwarded: 1, maxPoints: 1 },
        { taskCode: 'L1_PHOTOGRAPH', skill: ToeicSkill.LISTENING, pointsAwarded: 1, maxPoints: 1 },
        { taskCode: 'R5_INCOMPLETE_SENTENCE', skill: ToeicSkill.READING, pointsAwarded: null, maxPoints: 1 },
      ],
      [ToeicSkill.LISTENING, ToeicSkill.READING],
      2,
    );
    expect(result).toEqual([
      expect.objectContaining({ taskCode: 'L2_QUESTION_RESPONSE', questionCount: 2, normalizedScore: 50 }),
    ]);
  });

  it('sorts equal task evidence by max points and canonical task order', () => {
    const result = groupTaskEvidence(
      [
        { taskCode: 'L2_QUESTION_RESPONSE', skill: ToeicSkill.LISTENING, pointsAwarded: 1, maxPoints: 2 },
        { taskCode: 'L2_QUESTION_RESPONSE', skill: ToeicSkill.LISTENING, pointsAwarded: 1, maxPoints: 2 },
        { taskCode: 'L1_PHOTOGRAPH', skill: ToeicSkill.LISTENING, pointsAwarded: 0.5, maxPoints: 1 },
        { taskCode: 'L1_PHOTOGRAPH', skill: ToeicSkill.LISTENING, pointsAwarded: 0.5, maxPoints: 1 },
      ],
      [ToeicSkill.LISTENING],
      2,
    );
    expect(result.map(({ taskCode }) => taskCode)).toEqual(['L2_QUESTION_RESPONSE', 'L1_PHOTOGRAPH']);
  });

  it('prefers a task-matching lesson with accessible practice then curriculum order', () => {
    const taskEvidence = [{
      taskCode: 'L2_QUESTION_RESPONSE', skill: ToeicSkill.LISTENING,
      questionCount: 2, awardedPoints: 1, maxPoints: 2, normalizedScore: 50,
    }];
    const targets = selectRecommendationTargets({
      policy,
      skillEvidence: skills,
      taskEvidence,
      lessons: [
        lesson({ id: 'earlier', lessonOrder: 0 }),
        lesson({ id: 'practice', lessonOrder: 2, practiceAvailable: true }),
      ],
    });
    expect(targets[0]).toMatchObject({ lesson: { id: 'practice' }, basis: 'TASK_WEAKNESS' });
  });

  it('falls back to an unfinished skill lesson and avoids duplicate targets', () => {
    const targets = selectRecommendationTargets({
      policy,
      skillEvidence: skills,
      taskEvidence: [],
      lessons: [
        lesson({ id: 'done', progressStatus: LessonProgressStatus.COMPLETED }),
        lesson({ id: 'open', lessonOrder: 1 }),
      ],
    });
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ lesson: { id: 'open' }, basis: 'SKILL_FALLBACK' });
  });

  it('returns no target rather than inventing content', () => {
    expect(selectRecommendationTargets({ policy, skillEvidence: skills, taskEvidence: [], lessons: [] })).toEqual([]);
  });

  it('builds a deterministic seven-day plan using only real target paths', () => {
    const plan = buildSevenDayPlan([
      { id: 'r1', lessonPath: '/lessons/l1', lessonTitle: 'L1', practicePath: '/practice/p1' },
      { id: 'r2', lessonPath: '/lessons/l2', lessonTitle: 'L2', practicePath: null },
    ]);
    expect(plan).toHaveLength(7);
    expect(plan[0]).toMatchObject({ day: 1, path: '/lessons/l1' });
    expect(plan[2]).toMatchObject({ day: 3, path: '/practice/p1' });
    expect(plan[5]).toMatchObject({ day: 6, path: '/lessons/l2' });
  });

  it('fails safe for malformed or unknown rule reasons', () => {
    expect(parseStudyRecommendationRuleReason({ schemaVersion: 2 })).toBeNull();
    expect(parseStudyRecommendationRuleReason({ schemaVersion: 1, policy: {} })).toBeNull();
  });
});
