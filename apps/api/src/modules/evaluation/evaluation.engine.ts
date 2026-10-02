import { ToeicSkill } from '../../generated/prisma/client';
import { M04DomainError } from './m04-domain.error';

export interface NormalizedBand {
  code: string;
  label: string;
  minValue: number;
  maxValue: number;
  orderIndex: number;
  skill?: ToeicSkill | null;
}

export interface EvaluationSkillInput {
  skill: ToeicSkill;
  normalizedScore: number;
  status: string;
  rawScore?: number | null;
  maxRawScore?: number | null;
}

export function requireSinglePolicy<T>(policies: T[]): T {
  if (policies.length === 0) {
    throw new M04DomainError(
      'EVALUATION_POLICY_NOT_CONFIGURED',
      'Chưa cấu hình chính sách đánh giá nội bộ cho bài kiểm tra này.',
    );
  }
  if (policies.length > 1) {
    throw new M04DomainError(
      'EVALUATION_POLICY_AMBIGUOUS',
      'Có nhiều chính sách đánh giá đang hoạt động cho cùng một bài kiểm tra.',
    );
  }
  return policies[0];
}

export function selectNormalizedBand(score: number, inputBands: NormalizedBand[]) {
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new M04DomainError('EVALUATION_INPUT_INVALID', 'Tỷ lệ kết quả phải nằm trong khoảng 0–100.');
  }
  const bands = [...inputBands].sort(
    (left, right) => left.orderIndex - right.orderIndex || left.code.localeCompare(right.code),
  );
  if (!bands.length) invalidBands();
  if (new Set(bands.map(({ orderIndex }) => orderIndex)).size !== bands.length) invalidBands();
  bands.forEach((band, index) => {
    if (
      band.skill != null ||
      !Number.isFinite(band.minValue) ||
      !Number.isFinite(band.maxValue) ||
      band.minValue < 0 ||
      band.maxValue > 100 ||
      band.minValue >= band.maxValue ||
      (index === 0 && band.minValue !== 0) ||
      (index > 0 && bands[index - 1].maxValue !== band.minValue) ||
      (index === bands.length - 1 && band.maxValue !== 100)
    ) {
      invalidBands();
    }
  });
  const matches = bands.filter(
    (band, index) =>
      score >= band.minValue &&
      (score < band.maxValue || (index === bands.length - 1 && score <= band.maxValue)),
  );
  if (matches.length !== 1) invalidBands();
  return matches[0];
}

export function evaluatePlacement(input: {
  score: number | null;
  maxScore: number | null;
  skillScores: EvaluationSkillInput[];
  bands: NormalizedBand[];
}) {
  if (
    input.score === null ||
    input.maxScore === null ||
    !Number.isFinite(input.score) ||
    !Number.isFinite(input.maxScore) ||
    input.maxScore <= 0
  ) {
    throw new M04DomainError('EVALUATION_INPUT_INVALID', 'Kết quả bài kiểm tra không đủ dữ liệu để đánh giá.');
  }
  const listening = requireFinalSkill(input.skillScores, ToeicSkill.LISTENING);
  const reading = requireFinalSkill(input.skillScores, ToeicSkill.READING);
  const overallNormalizedScore = roundScore((input.score / input.maxScore) * 100);
  const band = selectNormalizedBand(overallNormalizedScore, input.bands);
  const strongestSkill =
    listening.normalizedScore === reading.normalizedScore
      ? null
      : listening.normalizedScore > reading.normalizedScore
        ? ToeicSkill.LISTENING
        : ToeicSkill.READING;
  const weakestSkill =
    strongestSkill === null
      ? null
      : strongestSkill === ToeicSkill.LISTENING
        ? ToeicSkill.READING
        : ToeicSkill.LISTENING;
  const balanceState = strongestSkill === null ? 'BALANCED' : 'IMBALANCED';
  const summary = summaryFor(band.code, weakestSkill);

  return {
    overallNormalizedScore,
    band,
    strongestSkill,
    weakestSkill,
    balanceState,
    summary,
  } as const;
}

function requireFinalSkill(scores: EvaluationSkillInput[], skill: ToeicSkill) {
  const matches = scores.filter((score) => score.skill === skill && score.status === 'FINAL');
  if (matches.length !== 1 || !Number.isFinite(matches[0].normalizedScore)) {
    throw new M04DomainError(
      'EVALUATION_INPUT_INVALID',
      `Kết quả ${skill === ToeicSkill.LISTENING ? 'Listening' : 'Reading'} chưa hoàn tất.`,
    );
  }
  return matches[0];
}

function summaryFor(levelCode: string, weakestSkill: ToeicSkill | null): string {
  const levelSummary =
    levelCode === 'FOUNDATION'
      ? 'Bạn đang xây dựng nền tảng Listening và Reading.'
      : levelCode === 'DEVELOPING'
        ? 'Bạn đã có nền tảng và đang phát triển kỹ năng Listening và Reading.'
        : 'Bạn thể hiện năng lực Listening và Reading nội bộ ở mức nâng cao.';
  if (weakestSkill === null) {
    return levelCode === 'FOUNDATION'
      ? `${levelSummary} Cả hai kỹ năng đều cần được củng cố từ nền tảng.`
      : `${levelSummary} Kết quả Listening và Reading hiện tương đương.`;
  }
  return `${levelSummary} ${weakestSkill === ToeicSkill.LISTENING ? 'Listening' : 'Reading'} là kỹ năng nên được ưu tiên tiếp theo.`;
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function invalidBands(): never {
  throw new M04DomainError(
    'EVALUATION_POLICY_INVALID',
    'Các khoảng đánh giá nội bộ đang bị thiếu, chồng lấn hoặc không hợp lệ.',
  );
}
