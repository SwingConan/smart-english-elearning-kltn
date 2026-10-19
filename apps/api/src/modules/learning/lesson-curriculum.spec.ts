import { BadRequestException } from '@nestjs/common';
import { ToeicSkill } from '../../generated/prisma/client';
import { normalizeAndValidateLessonCurriculum } from './lesson-curriculum';

const valid = {
  learningObjectives: ['  Understand the lesson  '],
  contentMarkdown: '  # Content  ',
  estimatedMinutes: 30,
  focusSkills: [ToeicSkill.LISTENING],
  focusTaskCodes: ['L1_PHOTOGRAPH'],
};

describe('lesson curriculum policy', () => {
  it('normalizes objectives/content and permits orientation lessons without task codes', () => {
    expect(normalizeAndValidateLessonCurriculum(valid)).toMatchObject({
      learningObjectives: ['Understand the lesson'],
      contentMarkdown: '# Content',
    });
    expect(normalizeAndValidateLessonCurriculum({
      ...valid,
      focusSkills: [],
      focusTaskCodes: [],
    }).focusTaskCodes).toEqual([]);
  });

  it.each([
    [[ToeicSkill.READING], ['L3_CONVERSATION']],
    [[ToeicSkill.LISTENING], ['R7_READING_COMPREHENSION']],
    [[ToeicSkill.LISTENING], ['ARBITRARY']],
    [[ToeicSkill.LISTENING], ['L1_PHOTOGRAPH', 'L1_PHOTOGRAPH']],
  ])('rejects incompatible or non-canonical task mappings', (focusSkills, focusTaskCodes) => {
    expect(() => normalizeAndValidateLessonCurriculum({
      ...valid,
      focusSkills,
      focusTaskCodes,
    })).toThrow(BadRequestException);
  });

  it('enforces the Markdown limit before normalization', () => {
    expect(() => normalizeAndValidateLessonCurriculum({
      ...valid,
      contentMarkdown: ' '.repeat(30_001),
    })).toThrow(BadRequestException);
  });
});
