import { ToeicSkill } from '../../generated/prisma/client';
import { evaluatePlacement, requireSinglePolicy, selectNormalizedBand } from './evaluation.engine';
import { M04DomainError } from './m04-domain.error';

const bands = [
  { code: 'FOUNDATION', label: 'Nền tảng', minValue: 0, maxValue: 45, orderIndex: 0 },
  { code: 'DEVELOPING', label: 'Đang phát triển', minValue: 45, maxValue: 70, orderIndex: 1 },
  { code: 'ADVANCING', label: 'Nâng cao', minValue: 70, maxValue: 100, orderIndex: 2 },
];

describe('M04 evaluation engine', () => {
  it.each([
    [0, 'FOUNDATION'], [44.99, 'FOUNDATION'], [45, 'DEVELOPING'],
    [69.99, 'DEVELOPING'], [70, 'ADVANCING'], [100, 'ADVANCING'],
  ])('maps %s using locked interval semantics', (score, code) => {
    expect(selectNormalizedBand(score, bands).code).toBe(code);
  });

  it.each([
    [[{ ...bands[0], maxValue: 44 }, bands[1], bands[2]]],
    [[{ ...bands[0], maxValue: 50 }, bands[1], bands[2]]],
    [[bands[0], { ...bands[1], orderIndex: 0 }, bands[2]]],
    [[bands[0], bands[1], { ...bands[2], maxValue: 99 }]],
    [[]],
  ])('rejects invalid band configuration %#', (invalid) => {
    expect(() => selectNormalizedBand(50, invalid)).toThrow(M04DomainError);
  });

  it('rejects missing and duplicate active policies', () => {
    expect(() => requireSinglePolicy([])).toThrow('Chưa cấu hình');
    expect(() => requireSinglePolicy([1, 2])).toThrow('nhiều chính sách');
  });

  it.each([
    [60, 40, ToeicSkill.LISTENING, ToeicSkill.READING, 'IMBALANCED'],
    [40, 60, ToeicSkill.READING, ToeicSkill.LISTENING, 'IMBALANCED'],
    [50, 50, null, null, 'BALANCED'],
  ])('derives strongest/weakest/balance deterministically', (listening, reading, strongest, weakest, balance) => {
    const result = evaluatePlacement({
      score: 4,
      maxScore: 8,
      bands,
      skillScores: [
        { skill: ToeicSkill.LISTENING, normalizedScore: listening, status: 'FINAL' },
        { skill: ToeicSkill.READING, normalizedScore: reading, status: 'FINAL' },
      ],
    });
    expect(result).toMatchObject({ strongestSkill: strongest, weakestSkill: weakest, balanceState: balance });
    expect(result.overallNormalizedScore).toBe(50);
    expect(evaluatePlacement({ score: 4, maxScore: 8, bands, skillScores: [
      { skill: ToeicSkill.LISTENING, normalizedScore: listening, status: 'FINAL' },
      { skill: ToeicSkill.READING, normalizedScore: reading, status: 'FINAL' },
    ] })).toEqual(result);
  });

  it.each([
    [[{ skill: ToeicSkill.READING, normalizedScore: 50, status: 'FINAL' }]],
    [[{ skill: ToeicSkill.LISTENING, normalizedScore: 50, status: 'FINAL' }]],
    [[
      { skill: ToeicSkill.LISTENING, normalizedScore: 50, status: 'PROVISIONAL' },
      { skill: ToeicSkill.READING, normalizedScore: 50, status: 'FINAL' },
    ]],
  ])('rejects missing or non-final skill input %#', (skillScores) => {
    expect(() => evaluatePlacement({ score: 1, maxScore: 2, bands, skillScores })).toThrow(M04DomainError);
  });

  it('rejects zero max score', () => {
    expect(() => evaluatePlacement({ score: 0, maxScore: 0, bands, skillScores: [] })).toThrow(M04DomainError);
  });
});
