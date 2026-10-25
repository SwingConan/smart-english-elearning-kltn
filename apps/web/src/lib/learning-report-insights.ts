import type { LearningReport, ReportSkill } from '@/features/reports/api';

export interface CurrentSkillResult {
  skill: ReportSkill;
  score: number;
  previousScore: number | null;
  delta: number | null;
  submittedAt: string | null;
}

export interface SkillInsights {
  current: CurrentSkillResult[];
  strongest: CurrentSkillResult | null;
  weakest: CurrentSkillResult | null;
  improving: CurrentSkillResult | null;
  declining: CurrentSkillResult | null;
  latestChange: CurrentSkillResult | null;
}

export function deriveSkillInsights(rows: LearningReport['skillTrend']): SkillInsights {
  const skills: ReportSkill[] = ['LISTENING', 'READING', 'SPEAKING', 'WRITING'];
  const current = skills.flatMap((skill) => {
    const finalRows = rows
      .filter(
        (row) =>
          row.skill === skill &&
          row.status === 'FINAL' &&
          row.normalizedScore !== null &&
          row.normalizedScore !== undefined,
      )
      .sort(
        (left, right) =>
          new Date(left.submittedAt ?? 0).getTime() - new Date(right.submittedAt ?? 0).getTime(),
      );
    const latest = finalRows.at(-1);
    if (!latest || latest.normalizedScore === null || latest.normalizedScore === undefined)
      return [];
    const previous = finalRows.at(-2);
    const previousScore = previous?.normalizedScore ?? null;
    return [
      {
        skill,
        score: latest.normalizedScore,
        previousScore,
        delta: previousScore === null ? null : latest.normalizedScore - previousScore,
        submittedAt: latest.submittedAt ?? null,
      },
    ];
  });

  const strongest = current.length
    ? current.reduce((best, item) => (item.score > best.score ? item : best))
    : null;
  const weakest = current.length
    ? current.reduce((lowest, item) => (item.score < lowest.score ? item : lowest))
    : null;
  const comparable = current.filter(
    (item): item is CurrentSkillResult & { delta: number } => item.delta !== null,
  );
  const improving =
    comparable.filter((item) => item.delta > 0).sort((a, b) => b.delta - a.delta)[0] ?? null;
  const declining =
    comparable.filter((item) => item.delta < 0).sort((a, b) => a.delta - b.delta)[0] ?? null;
  const latestChange =
    comparable
      .slice()
      .sort(
        (left, right) =>
          new Date(right.submittedAt ?? 0).getTime() - new Date(left.submittedAt ?? 0).getTime(),
      )[0] ?? null;

  return { current, strongest, weakest, improving, declining, latestChange };
}
