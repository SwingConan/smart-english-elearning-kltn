import { apiFetch } from '@/lib/api-client';
import type {
  LessonSkillMapping,
  QuestionSkillMapping,
  Skill,
  SkillInput,
  SkillPrerequisiteMapping,
  SkillUpdate,
} from './types';

const segment = encodeURIComponent;

export const knowledgeModelApi = {
  skills: {
    list: (courseId: string, signal?: AbortSignal): Promise<Skill[]> =>
      apiFetch(`/instructor/courses/${segment(courseId)}/skills`, { signal }),
    create: (courseId: string, input: SkillInput): Promise<Skill> =>
      apiFetch(`/instructor/courses/${segment(courseId)}/skills`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    update: (skillId: string, input: SkillUpdate): Promise<Skill> =>
      apiFetch(`/instructor/skills/${segment(skillId)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    delete: (skillId: string): Promise<{ message: string }> =>
      apiFetch(`/instructor/skills/${segment(skillId)}`, { method: 'DELETE' }),
  },
  prerequisites: {
    list: (skillId: string): Promise<SkillPrerequisiteMapping> =>
      apiFetch(`/instructor/skills/${segment(skillId)}/prerequisites`),
    replace: (skillId: string, prerequisiteSkillIds: string[]): Promise<SkillPrerequisiteMapping> =>
      apiFetch(`/instructor/skills/${segment(skillId)}/prerequisites`, {
        method: 'PUT',
        body: JSON.stringify({ prerequisiteSkillIds }),
      }),
  },
  questionSkills: {
    list: (questionId: string): Promise<QuestionSkillMapping> =>
      apiFetch(`/instructor/questions/${segment(questionId)}/skills`),
    replace: (questionId: string, skillIds: string[]): Promise<QuestionSkillMapping> =>
      apiFetch(`/instructor/questions/${segment(questionId)}/skills`, {
        method: 'PUT',
        body: JSON.stringify({ skillIds }),
      }),
  },
  lessonSkills: {
    list: (lessonId: string): Promise<LessonSkillMapping> =>
      apiFetch(`/instructor/lessons/${segment(lessonId)}/skills`),
    replace: (lessonId: string, skillIds: string[]): Promise<LessonSkillMapping> =>
      apiFetch(`/instructor/lessons/${segment(lessonId)}/skills`, {
        method: 'PUT',
        body: JSON.stringify({ skillIds }),
      }),
  },
};
