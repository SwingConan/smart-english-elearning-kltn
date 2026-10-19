export const TOEIC_SKILLS = ['LISTENING', 'READING', 'SPEAKING', 'WRITING'] as const;
export type ToeicSkill = (typeof TOEIC_SKILLS)[number];

export const LESSON_TASK_CODES = [
  'L1_PHOTOGRAPH',
  'L2_QUESTION_RESPONSE',
  'L3_CONVERSATION',
  'L4_TALK',
  'R5_INCOMPLETE_SENTENCE',
  'R6_TEXT_COMPLETION',
  'R7_READING_COMPREHENSION',
] as const;
export type LessonTaskCode = (typeof LESSON_TASK_CODES)[number];

export const SKILL_LABELS: Record<ToeicSkill, string> = {
  LISTENING: 'Listening',
  READING: 'Reading',
  SPEAKING: 'Speaking',
  WRITING: 'Writing',
};

export const TASK_CODE_LABELS: Record<LessonTaskCode, string> = {
  L1_PHOTOGRAPH: 'Part 1 · Photographs',
  L2_QUESTION_RESPONSE: 'Part 2 · Question–Response',
  L3_CONVERSATION: 'Part 3 · Conversations',
  L4_TALK: 'Part 4 · Talks',
  R5_INCOMPLETE_SENTENCE: 'Part 5 · Incomplete Sentences',
  R6_TEXT_COMPLETION: 'Part 6 · Text Completion',
  R7_READING_COMPREHENSION: 'Part 7 · Reading Comprehension',
};

export function lessonCurriculumError(input: {
  learningObjectives: string[];
  contentMarkdown: string;
  estimatedMinutes: number | null;
  focusSkills: ToeicSkill[];
  focusTaskCodes: LessonTaskCode[];
}): string | null {
  const objectives = input.learningObjectives.map((item) => item.trim());
  if (objectives.length > 8) return 'Chỉ được nhập tối đa 8 mục tiêu bài học.';
  if (objectives.some((item) => item.length < 1 || item.length > 300)) {
    return 'Mỗi mục tiêu phải có từ 1 đến 300 ký tự.';
  }
  if (input.contentMarkdown.length > 30_000) return 'Nội dung Markdown tối đa 30.000 ký tự.';
  if (
    input.estimatedMinutes !== null &&
    (input.estimatedMinutes < 5 || input.estimatedMinutes > 180)
  ) {
    return 'Thời lượng ước tính phải từ 5 đến 180 phút.';
  }
  if (
    input.focusTaskCodes.some((code) => code.startsWith('L')) &&
    !input.focusSkills.includes('LISTENING')
  ) {
    return 'Task Listening yêu cầu chọn kỹ năng Listening.';
  }
  if (
    input.focusTaskCodes.some((code) => code.startsWith('R')) &&
    !input.focusSkills.includes('READING')
  ) {
    return 'Task Reading yêu cầu chọn kỹ năng Reading.';
  }
  return null;
}
