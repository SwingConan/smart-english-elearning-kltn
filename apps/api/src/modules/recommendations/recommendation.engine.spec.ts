import { CriterionRuleMode, ToeicSkill } from '../../generated/prisma/client';
import { matchCourseProfiles, RecommendationProfileInput } from './recommendation.engine';
import { parseRuleReason } from './rule-reason';

const scores = new Map([
  [ToeicSkill.LISTENING, 60],
  [ToeicSkill.READING, 50],
]);
const profile = (
  override: Partial<RecommendationProfileInput> = {},
): RecommendationProfileInput => ({
  id: 'profile-1',
  courseId: 'course-b',
  coursePublished: true,
  active: true,
  ruleMode: CriterionRuleMode.ALL,
  priority: 100,
  criteria: [
    { skill: ToeicSkill.LISTENING, minNormalizedScore: 45, maxNormalizedScore: 60 },
    { skill: ToeicSkill.READING, minNormalizedScore: 45, maxNormalizedScore: 70 },
  ],
  ...override,
});
const run = (profiles: RecommendationProfileInput[], skillScores = scores) =>
  matchCourseProfiles({
    profiles,
    skillScores,
    evaluationPolicyCode: 'M04_PLACEMENT_LR_NORMALIZED_V1',
    evaluationLevel: 'DEVELOPING',
  });

describe('M04 recommendation engine', () => {
  it('matches ALL only when every normalized criterion passes, including boundaries', () => {
    expect(run([profile()])).toHaveLength(1);
    expect(run([profile()], new Map([[ToeicSkill.LISTENING, 44.99], [ToeicSkill.READING, 50]]))).toHaveLength(0);
  });

  it('matches ANY when one criterion passes and rejects when none pass', () => {
    const any = profile({ ruleMode: CriterionRuleMode.ANY });
    expect(run([any], new Map([[ToeicSkill.LISTENING, 60], [ToeicSkill.READING, 100]]))).toHaveLength(1);
    expect(run([any], new Map([[ToeicSkill.LISTENING, 10], [ToeicSkill.READING, 100]]))).toHaveLength(0);
  });

  it('rejects empty criteria, missing skills, inactive profiles and unpublished courses', () => {
    expect(run([profile({ criteria: [] })])).toHaveLength(0);
    expect(run([profile()], new Map([[ToeicSkill.LISTENING, 60]]))).toHaveLength(0);
    expect(run([profile({ active: false })])).toHaveLength(0);
    expect(run([profile({ coursePublished: false })])).toHaveLength(0);
  });

  it('ignores estimated TOEIC fields as a matching source', () => {
    expect(run([profile({ criteria: [{
      skill: ToeicSkill.LISTENING,
      minNormalizedScore: null,
      maxNormalizedScore: null,
      minEstimatedToeicScore: 200,
      maxEstimatedToeicScore: 495,
    }] })])).toHaveLength(0);
  });

  it('orders by priority then stable Course ID and assigns PRIMARY/SUPPLEMENTARY', () => {
    const result = run([
      profile({ id: 'p3', courseId: 'course-c', priority: 100 }),
      profile({ id: 'p2', courseId: 'course-b', priority: 50 }),
      profile({ id: 'p1', courseId: 'course-a', priority: 50 }),
    ]);
    expect(result.map(({ courseId, kind }) => [courseId, kind])).toEqual([
      ['course-a', 'PRIMARY'],
      ['course-b', 'SUPPLEMENTARY'],
      ['course-c', 'SUPPLEMENTARY'],
    ]);
    expect(run([profile()])).toEqual(run([profile()]));
  });

  it('produces and validates typed ruleReason v1 with safe malformed fallback', () => {
    const reason = run([profile()])[0].reason;
    expect(parseRuleReason(reason)).toEqual(reason);
    expect(parseRuleReason({ ...reason, schemaVersion: 2 })).toBeNull();
    expect(parseRuleReason({ schemaVersion: 1 })).toBeNull();
  });
});
