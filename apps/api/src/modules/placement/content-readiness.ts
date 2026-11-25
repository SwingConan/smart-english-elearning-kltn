import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

type Task = {
  skill: string;
  rubricCode: string;
  instructionsVi?: string;
  stimuli: { mediaKey?: string }[];
};
type LrGroup = {
  questions: { content: string; correctOptionKey: string; options: { key: string }[] }[];
};
export async function inspectM05Content(root = process.cwd()) {
  const content = resolve(root, 'apps/api/content/m05');
  const read = async <T>(name: string): Promise<T> =>
    JSON.parse(await readFile(resolve(content, name), 'utf8')) as T;
  const [lr, speaking, writing, media, rubrics] = await Promise.all([
    read<{ sections: { skill: string; groups: LrGroup[] }[] }>(
      'M05_Test1_LR_Content_Manifest.json',
    ),
    read<{ tasks: Task[] }>('M05_Speaking_Content_Pack.json'),
    read<{ tasks: Task[] }>('M05_Writing_Content_Pack.json'),
    read<{
      assets: { mediaKey: string; proposedRuntimePath: string; bytes: number; sha256: string }[];
    }>('M05_Media_Manifest.json'),
    read<{ rubrics: { code: string }[] }>('M05_Rubric_Pack.json'),
  ]);
  const required: Record<string, number> = {
    LISTENING: 100,
    READING: 100,
    SPEAKING: 11,
    WRITING: 8,
  };
  const available = Object.fromEntries(
    Object.keys(required).map((skill) => [
      skill,
      skill === 'SPEAKING'
        ? speaking.tasks.length
        : skill === 'WRITING'
          ? writing.tasks.length
          : lr.sections
              .filter((s) => s.skill === skill)
              .flatMap((s) => s.groups)
              .reduce((n, g) => n + g.questions.length, 0),
    ]),
  );
  const questions = lr.sections.flatMap((s) => s.groups.flatMap((g) => g.questions));
  const rubricCodes = new Set(rubrics.rubrics.map((r) => r.code));
  const mediaRoot = resolve(root, 'apps/api/assets/assessment');
  const assets = await Promise.all(
    media.assets.map(async (asset) => {
      const file = resolve(root, asset.proposedRuntimePath);
      if (!file.startsWith(mediaRoot + sep))
        return { mediaKey: asset.mediaKey, state: 'INVALID_PATH' };
      try {
        const bytes = await readFile(file);
        return {
          mediaKey: asset.mediaKey,
          state:
            bytes.length === asset.bytes &&
            createHash('sha256').update(bytes).digest('hex') === asset.sha256
              ? 'VERIFIED'
              : 'HASH_MISMATCH',
        };
      } catch {
        return { mediaKey: asset.mediaKey, state: 'MISSING' };
      }
    }),
  );
  return {
    publicationAllowed: false as const,
    required,
    available,
    missing: Object.fromEntries(
      Object.entries(required).map(([skill, n]) => [skill, Math.max(0, n - available[skill])]),
    ),
    objectiveQuestions: questions.length,
    invalidObjectiveKeys: questions.filter(
      (q) => !q.content.trim() || !q.options.some((o) => o.key === q.correctOptionKey),
    ).length,
    missingTaskRubrics: [...speaking.tasks, ...writing.tasks].filter(
      (t) => !rubricCodes.has(t.rubricCode),
    ).length,
    assets,
    fullFormMediaMissingCount: null,
    blockers: [
      'FULL_LENGTH_SOURCE_MAPPING_REQUIRED',
      'CURRENT_ACADEMIC_TIMING_RUBRIC_APPROVAL_REQUIRED',
      'CURRENT_SOURCE_MEDIA_RIGHTS_REQUIRED',
      'TWO_INDEPENDENT_MEDIA_REVIEWERS_REQUIRED',
    ],
  };
}
