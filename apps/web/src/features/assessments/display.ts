import type {
  AssessmentStage,
  QuestionDifficulty,
  QuestionType,
  TestPurpose,
  TestStatus,
  TestType,
} from './types';

export const questionTypeLabel: Record<QuestionType, string> = {
  SINGLE_CHOICE: 'Một đáp án',
  TRUE_FALSE: 'Đúng / Sai',
  MULTIPLE_CHOICE: 'Nhiều đáp án',
};

export const difficultyLabel: Record<QuestionDifficulty, string> = {
  EASY: 'Dễ',
  MEDIUM: 'Trung bình',
  HARD: 'Khó',
};

export const testTypeLabel: Record<TestType, string> = {
  PLACEMENT: 'Xếp lớp',
  QUIZ: 'Bài kiểm tra',
};

export const testStatusLabel: Record<TestStatus, string> = {
  DRAFT: 'Bản nháp',
  PUBLISHED: 'Đã xuất bản',
};

export function assessmentTypeLabel(
  purpose: TestPurpose,
  stage: AssessmentStage | null | undefined,
): string {
  if (purpose === 'PRACTICE_MOCK') return 'Luyện tập / Thi thử';
  if (purpose === 'PLACEMENT') return 'Kiểm tra đầu vào';
  return stage
    ? {
        PERIODIC: 'Kiểm tra thường kỳ',
        MIDTERM: 'Kiểm tra giữa kỳ',
        FINAL: 'Kiểm tra cuối kỳ',
      }[stage]
    : 'Bài kiểm tra trên lớp';
}
