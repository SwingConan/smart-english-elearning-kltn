import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  AssessmentStage,
  AssessmentStimulusType,
  CourseSkillScope,
  PrismaClient,
  QuestionDifficulty,
  QuestionResponseType,
  TestPurpose,
  TestStatus,
  ToeicSkill,
} from '../src/generated/prisma/client';

const contentRoot = resolve(__dirname, '../content/m08');
const readJson = <T>(name: string): T =>
  JSON.parse(readFileSync(resolve(contentRoot, name), 'utf8')) as T;

const stableUuid = (key: string) => {
  const hex = createHash('sha256').update(`smart-english:m08:${key}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
};

const legacyModuleIds = [
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000003',
] as const;
const legacyLessonIds = Array.from(
  { length: 8 },
  (_, index) => `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
);
const legacyResourceIds = Array.from(
  { length: 6 },
  (_, index) => `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
);
const legacyPracticeTestId = '80000000-0000-4000-8000-000000000003';
const legacyPracticeAssessmentId = 'f2000000-0000-4000-8000-000000000002';

interface CurriculumLesson {
  lessonKey: string;
  title: string;
  description: string;
  learningObjectives: string[];
  estimatedMinutes: number;
  focusSkills: Array<keyof typeof ToeicSkill>;
  focusTaskCodes: string[];
  practiceCode?: string;
  contentMarkdown: string;
}

interface CurriculumManifest {
  course: { slug: string; title: string; level: string; skillScope: keyof typeof CourseSkillScope };
  rules: { moduleCount: number; lessonCount: number; practiceLanding: Record<string, string> };
  modules: Array<{
    moduleKey: string;
    title: string;
    description: string;
    lessons: CurriculumLesson[];
  }>;
}

interface PracticeStimulus {
  type: keyof typeof AssessmentStimulusType;
  orderIndex: number;
  mediaKey?: string;
  textContent?: string;
  altText?: string;
  isProtected: boolean;
  seedAsLearnerStimulus?: boolean;
  excludeFromLearnerPayload?: boolean;
}

interface PracticeQuestion {
  contentKey: string;
  responseType: keyof typeof QuestionResponseType;
  questionText: string;
  options: Array<{ key: string; content: string }>;
  correctOptionKey: string;
  answerKeyVerified: boolean;
  difficultyBand: 'FOUNDATION' | 'CORE' | 'STRETCH';
  conciseEvidence?: string;
}

interface PracticeGroup {
  contentKey: string;
  taskCode: string;
  part: number;
  instructions: string;
  stimuli: PracticeStimulus[];
  questions: PracticeQuestion[];
}

interface PracticeManifest {
  target: { totalSelectedQuestions: number };
  groups: PracticeGroup[];
}

interface MediaManifest {
  assets: Array<{
    mediaKey: string;
    proposedRuntimePath: string;
    mimeType: string;
    runtimeDisposition: string;
    seedAsLearnerStimulus: boolean;
    excludeFromLearnerPayload: boolean;
  }>;
}

const practiceDefinitions = {
  L1_PHOTOGRAPH: { code: 'M08_PRACTICE_P1_V1', lesson: 'L04', title: 'Bài luyện sau bài học — Part 1', minutes: 10 },
  L2_QUESTION_RESPONSE: { code: 'M08_PRACTICE_P2_V1', lesson: 'L06', title: 'Bài luyện sau bài học — Part 2', minutes: 12 },
  L3_CONVERSATION: { code: 'M08_PRACTICE_P3_V1', lesson: 'L08', title: 'Bài luyện sau bài học — Part 3', minutes: 20 },
  L4_TALK: { code: 'M08_PRACTICE_P4_V1', lesson: 'L10', title: 'Bài luyện sau bài học — Part 4', minutes: 20 },
  R5_INCOMPLETE_SENTENCE: { code: 'M08_PRACTICE_P5_V1', lesson: 'L13', title: 'Bài luyện sau bài học — Part 5', minutes: 15 },
  R6_TEXT_COMPLETION: { code: 'M08_PRACTICE_P6_V1', lesson: 'L15', title: 'Bài luyện sau bài học — Part 6', minutes: 15 },
  R7_READING_COMPREHENSION: { code: 'M08_PRACTICE_P7_V1', lesson: 'L18', title: 'Bài luyện sau bài học — Part 7', minutes: 30 },
} as const;

const expectedQuestionCounts: Record<keyof typeof practiceDefinitions, number> = {
  L1_PHOTOGRAPH: 6,
  L2_QUESTION_RESPONSE: 10,
  L3_CONVERSATION: 12,
  L4_TALK: 12,
  R5_INCOMPLETE_SENTENCE: 16,
  R6_TEXT_COMPLETION: 8,
  R7_READING_COMPREHENSION: 18,
};

export function validateM08ContentPack(
  curriculum: CurriculumManifest,
  practice: PracticeManifest,
  media: MediaManifest,
): void {
  const lessons = curriculum.modules.flatMap((module) => module.lessons);
  if (curriculum.modules.length !== 9 || curriculum.rules.moduleCount !== 9) {
    throw new Error('M08 curriculum must contain exactly 9 modules.');
  }
  if (lessons.length !== 20 || curriculum.rules.lessonCount !== 20) {
    throw new Error('M08 curriculum must contain exactly 20 lessons.');
  }
  if (new Set(lessons.map((lesson) => lesson.lessonKey)).size !== 20) {
    throw new Error('M08 lesson keys must be unique.');
  }
  const questions = practice.groups.flatMap((group) => group.questions);
  if (questions.length !== 82 || practice.target.totalSelectedQuestions !== 82) {
    throw new Error('M08 practice pack must contain exactly 82 questions.');
  }
  if (questions.some((question) => !question.answerKeyVerified)) {
    throw new Error('M08 practice pack contains an unverified answer key.');
  }
  const contentKeys = questions.map((question) => question.contentKey);
  if (new Set(contentKeys).size !== contentKeys.length) {
    throw new Error('M08 practice question content keys must be unique.');
  }
  const transcriptStimuli = practice.groups
    .flatMap((group) => group.stimuli)
    .filter((stimulus) => stimulus.textContent && !stimulus.mediaKey && stimulus.type === 'TEXT');
  const listeningTranscripts = practice.groups
    .filter((group) => group.taskCode.startsWith('L'))
    .flatMap((group) => group.stimuli)
    .filter((stimulus) => stimulus.type === 'TEXT');
  if (listeningTranscripts.length !== 24 || listeningTranscripts.some((stimulus) => !stimulus.isProtected)) {
    throw new Error('All 24 Listening transcripts must remain protected.');
  }
  if (transcriptStimuli.length !== 30) {
    throw new Error('M08 pack must contain 24 protected transcripts and 6 Reading text stimuli.');
  }
  for (const [taskCode, expected] of Object.entries(expectedQuestionCounts)) {
    const actual = practice.groups
      .filter((group) => group.taskCode === taskCode)
      .reduce((sum, group) => sum + group.questions.length, 0);
    if (actual !== expected) throw new Error(`${taskCode} must contain ${expected} questions, received ${actual}.`);
  }
  const runtimeMedia = media.assets.filter((asset) => asset.seedAsLearnerStimulus);
  const audioCount = runtimeMedia.filter((asset) => asset.mimeType === 'audio/mpeg').length;
  const imageCount = runtimeMedia.filter((asset) => asset.mimeType === 'image/jpeg').length;
  if (audioCount !== 24 || imageCount !== 8) {
    throw new Error(`M08 runtime media must contain 24 MP3 and 8 JPEG assets, received ${audioCount}/${imageCount}.`);
  }
  if (media.assets.some((asset) => asset.runtimeDisposition === 'SOURCE_REFERENCE_ONLY' && asset.seedAsLearnerStimulus)) {
    throw new Error('Source-reference Reading images cannot be learner stimuli.');
  }
}

export function loadAndValidateM08ContentPack(): {
  moduleCount: number;
  lessonCount: number;
  questionCount: number;
  runtimeMediaCount: number;
} {
  const curriculum = readJson<CurriculumManifest>('M08_Canonical_Curriculum_Content_Manifest_v1.json');
  const practice = readJson<PracticeManifest>('M08_Test2_Practice_Content_Manifest_v1.json');
  const media = readJson<MediaManifest>('M08_Test2_Practice_Media_Manifest_v1.json');
  validateM08ContentPack(curriculum, practice, media);
  return {
    moduleCount: curriculum.modules.length,
    lessonCount: curriculum.modules.flatMap((module) => module.lessons).length,
    questionCount: practice.groups.flatMap((group) => group.questions).length,
    runtimeMediaCount: media.assets.filter((asset) => asset.seedAsLearnerStimulus).length,
  };
}

const difficultyMap = {
  FOUNDATION: QuestionDifficulty.EASY,
  CORE: QuestionDifficulty.MEDIUM,
  STRETCH: QuestionDifficulty.HARD,
} as const;

const groupTitles: Record<keyof typeof practiceDefinitions, string> = {
  L1_PHOTOGRAPH: 'Part 1 — Photographs',
  L2_QUESTION_RESPONSE: 'Part 2 — Question–Response',
  L3_CONVERSATION: 'Part 3 — Conversations',
  L4_TALK: 'Part 4 — Talks',
  R5_INCOMPLETE_SENTENCE: 'Part 5 — Incomplete Sentences',
  R6_TEXT_COMPLETION: 'Part 6 — Text Completion',
  R7_READING_COMPREHENSION: 'Part 7 — Reading Comprehension',
};

export async function seedM08(
  prisma: PrismaClient,
  context: { courseId: string; classOfferingId: string },
): Promise<void> {
  const curriculum = readJson<CurriculumManifest>('M08_Canonical_Curriculum_Content_Manifest_v1.json');
  const practice = readJson<PracticeManifest>('M08_Test2_Practice_Content_Manifest_v1.json');
  const mediaManifest = readJson<MediaManifest>('M08_Test2_Practice_Media_Manifest_v1.json');
  validateM08ContentPack(curriculum, practice, mediaManifest);

  await prisma.course.update({
    where: { id: context.courseId },
    data: {
      title: curriculum.course.title,
      level: curriculum.course.level,
      skillScope: CourseSkillScope[curriculum.course.skillScope],
    },
  });

  // The legacy seed distributes L01-L08 across three modules differently. Move those
  // rows out of the canonical order range first so cross-module upserts cannot collide.
  await prisma.lesson.updateMany({
    where: { id: { in: legacyLessonIds } },
    data: { orderIndex: { increment: 100 } },
  });

  const lessonIds = new Map<string, string>();
  let lessonSequence = 0;
  for (const [moduleIndex, module] of curriculum.modules.entries()) {
    const moduleId = legacyModuleIds[moduleIndex] ?? stableUuid(`module:${module.moduleKey}`);
    await prisma.module.upsert({
      where: { id: moduleId },
      update: { courseId: context.courseId, title: module.title, description: module.description, orderIndex: moduleIndex },
      create: { id: moduleId, courseId: context.courseId, title: module.title, description: module.description, orderIndex: moduleIndex },
    });
    for (const [lessonIndex, lesson] of module.lessons.entries()) {
      const lessonId = legacyLessonIds[lessonSequence] ?? stableUuid(`lesson:${lesson.lessonKey}`);
      lessonIds.set(lesson.lessonKey, lessonId);
      await prisma.lesson.upsert({
        where: { id: lessonId },
        update: {
          moduleId,
          title: lesson.title,
          description: lesson.description,
          orderIndex: lessonIndex,
          learningObjectives: lesson.learningObjectives,
          contentMarkdown: lesson.contentMarkdown,
          estimatedMinutes: lesson.estimatedMinutes,
          focusSkills: lesson.focusSkills.map((skill) => ToeicSkill[skill]),
          focusTaskCodes: lesson.focusTaskCodes,
        },
        create: {
          id: lessonId,
          moduleId,
          title: lesson.title,
          description: lesson.description,
          orderIndex: lessonIndex,
          learningObjectives: lesson.learningObjectives,
          contentMarkdown: lesson.contentMarkdown,
          estimatedMinutes: lesson.estimatedMinutes,
          focusSkills: lesson.focusSkills.map((skill) => ToeicSkill[skill]),
          focusTaskCodes: lesson.focusTaskCodes,
        },
      });
      lessonSequence += 1;
    }
  }

  await prisma.learningResource.deleteMany({ where: { id: { in: legacyResourceIds } } });

  const media = new Map(mediaManifest.assets.map((asset) => [asset.mediaKey, asset]));
  await prisma.test.update({
    where: { id: legacyPracticeTestId },
    data: {
      lessonId: null,
      title: 'Luyện tập / Thi thử tổng hợp (legacy)',
      description: 'Bài luyện tập độc lập được giữ lại để tương thích dữ liệu demo cũ.',
    },
  });
  await prisma.classAssessment.update({
    where: { id: legacyPracticeAssessmentId },
    data: { isActive: false },
  });
  for (const [taskCode, definition] of Object.entries(practiceDefinitions)) {
    const typedTaskCode = taskCode as keyof typeof practiceDefinitions;
    const testId = stableUuid(`test:${definition.code}`);
    const assessmentId = stableUuid(`class-assessment:${definition.code}`);
    const lessonId = lessonIds.get(definition.lesson);
    if (!lessonId) throw new Error(`Missing M08 landing lesson ${definition.lesson}.`);
    await prisma.test.upsert({
      where: { id: testId },
      update: {
        courseId: context.courseId,
        lessonId,
        purpose: TestPurpose.PRACTICE_MOCK,
        placementMode: null,
        title: definition.title,
        description: `Bài luyện Test 2 được liên kết với ${definition.lesson}.`,
        status: TestStatus.PUBLISHED,
        maxAttempts: 3,
        timeLimitMinutes: definition.minutes,
        showResultAfterSubmit: true,
      },
      create: {
        id: testId,
        courseId: context.courseId,
        lessonId,
        purpose: TestPurpose.PRACTICE_MOCK,
        placementMode: null,
        title: definition.title,
        description: `Bài luyện Test 2 được liên kết với ${definition.lesson}.`,
        status: TestStatus.PUBLISHED,
        maxAttempts: 3,
        timeLimitMinutes: definition.minutes,
        showResultAfterSubmit: true,
      },
    });

    const groups = practice.groups.filter((group) => group.taskCode === typedTaskCode);
    let questionOrder = 0;
    for (const [groupIndex, group] of groups.entries()) {
      const groupId = stableUuid(`group:${group.contentKey}`);
      await prisma.testQuestionGroup.upsert({
        where: { id: groupId },
        update: {
          testId,
          skill: typedTaskCode.startsWith('L') ? ToeicSkill.LISTENING : ToeicSkill.READING,
          orderIndex: groupIndex,
          title: groupTitles[typedTaskCode],
          instructions: group.instructions,
          taskCode: typedTaskCode,
        },
        create: {
          id: groupId,
          testId,
          skill: typedTaskCode.startsWith('L') ? ToeicSkill.LISTENING : ToeicSkill.READING,
          orderIndex: groupIndex,
          title: groupTitles[typedTaskCode],
          instructions: group.instructions,
          taskCode: typedTaskCode,
        },
      });
      for (const stimulus of group.stimuli) {
        if (stimulus.seedAsLearnerStimulus === false || stimulus.excludeFromLearnerPayload) continue;
        const asset = stimulus.mediaKey ? media.get(stimulus.mediaKey) : undefined;
        if (stimulus.mediaKey && (!asset || !asset.seedAsLearnerStimulus)) {
          throw new Error(`Missing learner-runtime M08 media ${stimulus.mediaKey}.`);
        }
        const storageKey = asset?.proposedRuntimePath.split('apps/api/assets/assessment/')[1];
        const stimulusId = stableUuid(`stimulus:${group.contentKey}:${stimulus.orderIndex}`);
        const stimulusData = {
            groupId,
            type: AssessmentStimulusType[stimulus.type],
            orderIndex: stimulus.orderIndex,
            textContent: stimulus.textContent,
            storageKey,
            mimeType: asset?.mimeType,
            altText: stimulus.altText,
            isProtected: stimulus.isProtected,
        };
        await prisma.assessmentStimulus.upsert({
          where: { id: stimulusId },
          update: stimulusData,
          create: { id: stimulusId, ...stimulusData },
        });
      }
      for (const question of group.questions) {
        const questionId = stableUuid(`question:${question.contentKey}`);
        await prisma.question.upsert({
          where: { id: questionId },
          update: {
            courseId: context.courseId,
            responseType: QuestionResponseType[question.responseType],
            difficulty: difficultyMap[question.difficultyBand],
            toeicSkill: typedTaskCode.startsWith('L') ? ToeicSkill.LISTENING : ToeicSkill.READING,
            content: question.questionText,
            explanation: question.conciseEvidence,
          },
          create: {
            id: questionId,
            courseId: context.courseId,
            responseType: QuestionResponseType[question.responseType],
            difficulty: difficultyMap[question.difficultyBand],
            toeicSkill: typedTaskCode.startsWith('L') ? ToeicSkill.LISTENING : ToeicSkill.READING,
            content: question.questionText,
            explanation: question.conciseEvidence,
          },
        });
        const optionIds = question.options.map((option) => stableUuid(`option:${question.contentKey}:${option.key}`));
        await prisma.questionOption.deleteMany({ where: { questionId, id: { notIn: optionIds } } });
        for (const [optionIndex, option] of question.options.entries()) {
          const optionId = optionIds[optionIndex];
          await prisma.questionOption.upsert({
            where: { id: optionId },
            update: { questionId, content: option.content, isCorrect: option.key === question.correctOptionKey, orderIndex: optionIndex },
            create: { id: optionId, questionId, content: option.content, isCorrect: option.key === question.correctOptionKey, orderIndex: optionIndex },
          });
        }
        const testQuestionId = stableUuid(`test-question:${definition.code}:${question.contentKey}`);
        const testQuestionData = {
            testId,
            questionId,
            groupId,
            orderIndex: questionOrder,
            points: 1,
        };
        await prisma.testQuestion.upsert({
          where: { id: testQuestionId },
          update: testQuestionData,
          create: { id: testQuestionId, ...testQuestionData },
        });
        questionOrder += 1;
      }
    }

    await prisma.classAssessment.upsert({
      where: { id: assessmentId },
      update: {
        classOfferingId: context.classOfferingId,
        testId,
        stage: AssessmentStage.PERIODIC,
        openAt: new Date('2026-09-01T00:00:00Z'),
        closeAt: new Date('2027-12-31T23:59:59Z'),
        maxAttemptsOverride: 3,
        isActive: true,
      },
      create: {
        id: assessmentId,
        classOfferingId: context.classOfferingId,
        testId,
        stage: AssessmentStage.PERIODIC,
        openAt: new Date('2026-09-01T00:00:00Z'),
        closeAt: new Date('2027-12-31T23:59:59Z'),
        maxAttemptsOverride: 3,
        isActive: true,
      },
    });
  }
}
