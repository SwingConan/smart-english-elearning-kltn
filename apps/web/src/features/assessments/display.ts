import type { QuestionDifficulty, QuestionType, TestStatus, TestType } from './types';

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
