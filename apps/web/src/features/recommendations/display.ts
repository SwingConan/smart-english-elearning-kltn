import type { AssessmentStage, ToeicSkill } from '@/features/assessments/types';

export const skillLabel: Record<ToeicSkill, string> = {
  LISTENING: 'Listening',
  READING: 'Reading',
  SPEAKING: 'Speaking',
  WRITING: 'Writing',
};

export const stageLabel: Record<AssessmentStage, string> = {
  PERIODIC: 'Thường kỳ',
  MIDTERM: 'Giữa kỳ',
  FINAL: 'Cuối kỳ',
};

const taskLabels: Record<string, string> = {
  L1_PHOTOGRAPH: 'Part 1 · Mô tả tranh',
  L2_QUESTION_RESPONSE: 'Part 2 · Hỏi đáp',
  L3_CONVERSATION: 'Part 3 · Hội thoại',
  L4_TALK: 'Part 4 · Bài nói',
  R5_INCOMPLETE_SENTENCE: 'Part 5 · Hoàn thành câu',
  R6_TEXT_COMPLETION: 'Part 6 · Hoàn thành đoạn văn',
  R7_READING_COMPREHENSION: 'Part 7 · Đọc hiểu',
};

export function taskCodeLabel(taskCode?: string): string | null {
  if (!taskCode) return null;
  return taskLabels[taskCode] ?? taskCode.replaceAll('_', ' ');
}

export function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value)}%`;
}

export function formatDate(value: string | null): string {
  if (!value) return 'Chưa có thời điểm nộp';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}
