import { BadRequestException } from '@nestjs/common';
import { ToeicSkill } from '../../generated/prisma/client';

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

export interface LessonCurriculumFields {
  learningObjectives: string[];
  contentMarkdown: string | null;
  estimatedMinutes: number | null;
  focusSkills: ToeicSkill[];
  focusTaskCodes: string[];
}

export function normalizeAndValidateLessonCurriculum(
  fields: LessonCurriculumFields,
): LessonCurriculumFields {
  if (fields.contentMarkdown && fields.contentMarkdown.length > 30_000) {
    throw new BadRequestException('Lesson Markdown content cannot exceed 30000 characters');
  }

  const normalized = {
    ...fields,
    learningObjectives: fields.learningObjectives.map((objective) => objective.trim()),
    contentMarkdown: fields.contentMarkdown?.trim() || null,
    focusTaskCodes: [...fields.focusTaskCodes],
    focusSkills: [...fields.focusSkills],
  };

  if (normalized.learningObjectives.length > 8) {
    throw new BadRequestException('A lesson can have at most 8 learning objectives');
  }
  if (
    normalized.learningObjectives.some(
      (objective) => objective.length < 1 || objective.length > 300,
    )
  ) {
    throw new BadRequestException('Each learning objective must contain 1 to 300 characters');
  }
  if (
    normalized.estimatedMinutes !== null &&
    (!Number.isInteger(normalized.estimatedMinutes) ||
      normalized.estimatedMinutes < 5 ||
      normalized.estimatedMinutes > 180)
  ) {
    throw new BadRequestException('Estimated study time must be between 5 and 180 minutes');
  }
  if (new Set(normalized.focusTaskCodes).size !== normalized.focusTaskCodes.length) {
    throw new BadRequestException('TOEIC task codes must be unique');
  }
  if (
    normalized.focusTaskCodes.some(
      (code) => !LESSON_TASK_CODES.includes(code as LessonTaskCode),
    )
  ) {
    throw new BadRequestException('Lesson contains an unsupported TOEIC task code');
  }
  if (
    normalized.focusTaskCodes.some((code) => code.startsWith('L')) &&
    !normalized.focusSkills.includes(ToeicSkill.LISTENING)
  ) {
    throw new BadRequestException('Listening task codes require the LISTENING focus skill');
  }
  if (
    normalized.focusTaskCodes.some((code) => code.startsWith('R')) &&
    !normalized.focusSkills.includes(ToeicSkill.READING)
  ) {
    throw new BadRequestException('Reading task codes require the READING focus skill');
  }

  return normalized;
}
