import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateLessonDto } from './create-lesson.dto';

describe('CreateLessonDto', () => {
  it('trims objectives and accepts the canonical curriculum contract', async () => {
    const dto = plainToInstance(CreateLessonDto, {
      title: ' Part 1 ',
      learningObjectives: ['  Identify the subject  '],
      contentMarkdown: '# Lesson',
      estimatedMinutes: 25,
      focusSkills: ['LISTENING'],
      focusTaskCodes: ['L1_PHOTOGRAPH'],
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.title).toBe('Part 1');
    expect(dto.learningObjectives).toEqual(['Identify the subject']);
  });

  it('rejects invalid objective, duration, Markdown and arbitrary/duplicate task codes', async () => {
    const dto = plainToInstance(CreateLessonDto, {
      title: 'Lesson',
      learningObjectives: Array.from({ length: 9 }, () => ''),
      contentMarkdown: 'x'.repeat(30_001),
      estimatedMinutes: 4,
      focusTaskCodes: ['CUSTOM_TASK', 'CUSTOM_TASK'],
    });
    const properties = (await validate(dto)).map(({ property }) => property);
    expect(properties).toEqual(expect.arrayContaining([
      'learningObjectives',
      'contentMarkdown',
      'estimatedMinutes',
      'focusTaskCodes',
    ]));
  });
});
