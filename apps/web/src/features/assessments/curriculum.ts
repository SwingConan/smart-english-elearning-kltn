import { instructorApi } from '@/features/instructor/api';

export interface LessonChoice {
  id: string;
  label: string;
}

export async function loadCourseLessons(
  courseId: string,
  signal?: AbortSignal,
): Promise<LessonChoice[]> {
  const modules = await instructorApi.modules.list(courseId, signal);
  const lessonGroups = await Promise.all(
    modules.map(async (module) => ({
      module,
      lessons: await instructorApi.lessons.list(module.id, signal),
    })),
  );

  return lessonGroups.flatMap(({ module, lessons }) =>
    lessons.map((lesson) => ({ id: lesson.id, label: `${module.title} — ${lesson.title}` })),
  );
}
