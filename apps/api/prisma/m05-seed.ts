import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  AssessmentStimulusType,
  PlacementMode,
  PrismaClient,
  QuestionDifficulty,
  QuestionResponseType,
  TestPurpose,
  TestStatus,
  ToeicSkill,
} from '../src/generated/prisma/client';

export const M05_FOUR_SKILLS_TEST_ID = '80000000-0000-4000-8000-000000000021';

const learnerFacingTaskTitles: Record<string, string> = {
  L1_PHOTOGRAPH: 'Part 1 — Mô tả hình ảnh',
  L2_QUESTION_RESPONSE: 'Part 2 — Hỏi và đáp',
  L3_CONVERSATION: 'Part 3 — Hội thoại',
  L4_TALK: 'Part 4 — Bài nói ngắn',
  R5_INCOMPLETE_SENTENCE: 'Part 5 — Hoàn thành câu',
  R6_TEXT_COMPLETION: 'Part 6 — Hoàn thành đoạn văn',
  R7_READING_COMPREHENSION: 'Part 7 — Đọc hiểu',
  S_READ_ALOUD: 'Speaking — Đọc thành tiếng',
  S_DESCRIBE_PICTURE: 'Speaking — Mô tả hình ảnh',
  S_OPINION: 'Speaking — Trình bày ý kiến',
  W_WRITTEN_REQUEST: 'Writing — Phản hồi yêu cầu',
  W_OPINION: 'Writing — Trình bày quan điểm',
};

interface StimulusSeed {
  type: keyof typeof AssessmentStimulusType;
  orderIndex: number;
  textContent?: string;
  mediaKey?: string;
  altText?: string;
  isProtected: boolean;
}
interface QuestionSeed {
  contentKey: string;
  responseType: keyof typeof QuestionResponseType;
  content?: string;
  options?: Array<{ key: string; content: string }>;
  correctOptionKey?: string;
}
interface GroupSeed {
  contentKey: string;
  taskCode: string;
  instructions?: string;
  instructionsVi?: string;
  stimuli: StimulusSeed[];
  questions?: QuestionSeed[];
  responseType?: keyof typeof QuestionResponseType;
  rubricCode?: string;
  preparationSeconds?: number;
  responseSeconds?: number;
  recommendedSeconds?: number;
  maxRecordingSeconds?: number;
}
interface MediaSeed {
  mediaKey: string;
  proposedRuntimePath: string;
  mimeType: string;
}
interface RubricSeed {
  code: string;
  name: string;
  description?: string;
  criteria: Array<{
    code: string;
    name: string;
    description?: string;
    orderIndex: number;
    maxScore: number;
    weight: number;
  }>;
}

const contentRoot = resolve(__dirname, '../content/m05');
const readJson = <T>(name: string): T =>
  JSON.parse(readFileSync(resolve(contentRoot, name), 'utf8')) as T;
const stableUuid = (key: string) => {
  const hex = createHash('sha256').update(`smart-english:m05:${key}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
};

export async function seedM05(prisma: PrismaClient, courseId: string): Promise<void> {
  const lr = readJson<{ sections: Array<{ skill: keyof typeof ToeicSkill; groups: GroupSeed[] }> }>(
    'M05_Test1_LR_Content_Manifest.json',
  );
  const speaking = readJson<{ tasks: GroupSeed[] }>('M05_Speaking_Content_Pack.json');
  const writing = readJson<{ tasks: GroupSeed[] }>('M05_Writing_Content_Pack.json');
  const rubricPack = readJson<{ rubrics: RubricSeed[] }>('M05_Rubric_Pack.json');
  const mediaPack = readJson<{ assets: MediaSeed[] }>('M05_Media_Manifest.json');
  const media = new Map(mediaPack.assets.map((asset) => [asset.mediaKey, asset]));
  const rubricIds = new Map<string, string>();

  for (const rubric of rubricPack.rubrics) {
    const rubricId = stableUuid(`rubric:${rubric.code}`);
    rubricIds.set(rubric.code, rubricId);
    await prisma.rubric.upsert({
      where: { id: rubricId },
      update: { name: rubric.name, description: rubric.description, isActive: true },
      create: { id: rubricId, name: rubric.name, description: rubric.description, isActive: true },
    });
    for (const criterion of rubric.criteria) {
      const id = stableUuid(`rubric:${rubric.code}:${criterion.code}`);
      await prisma.rubricCriterion.upsert({
        where: { id },
        update: { ...criterion, rubricId },
        create: { id, rubricId, ...criterion },
      });
    }
  }

  await prisma.test.upsert({
    where: { id: M05_FOUR_SKILLS_TEST_ID },
    update: {
      courseId,
      purpose: TestPurpose.PLACEMENT,
      placementMode: PlacementMode.FOUR_SKILLS,
      title: 'Kiểm tra đầu vào 4 kỹ năng — Core',
      description: 'Bài kiểm tra nội bộ Listening, Reading, Speaking và Writing.',
      status: TestStatus.PUBLISHED,
      maxAttempts: 10,
      timeLimitMinutes: 45,
      showResultAfterSubmit: true,
    },
    create: {
      id: M05_FOUR_SKILLS_TEST_ID,
      courseId,
      purpose: TestPurpose.PLACEMENT,
      placementMode: PlacementMode.FOUR_SKILLS,
      title: 'Kiểm tra đầu vào 4 kỹ năng — Core',
      description: 'Bài kiểm tra nội bộ Listening, Reading, Speaking và Writing.',
      status: TestStatus.PUBLISHED,
      maxAttempts: 10,
      timeLimitMinutes: 45,
      showResultAfterSubmit: true,
    },
  });

  const groups: Array<GroupSeed & { skill: ToeicSkill }> = [
    ...lr.sections.flatMap((section) =>
      section.groups.map((group) => ({ ...group, skill: ToeicSkill[section.skill] })),
    ),
    ...speaking.tasks.map((task) => ({ ...task, skill: ToeicSkill.SPEAKING })),
    ...writing.tasks.map((task) => ({ ...task, skill: ToeicSkill.WRITING })),
  ];
  let questionOrder = 0;
  for (const [groupOrder, group] of groups.entries()) {
    const groupId = stableUuid(`group:${group.contentKey}`);
    const learnerInstructions = group.instructions ?? group.instructionsVi;
    const learnerFacingTitle = learnerFacingTaskTitles[group.taskCode];
    if (!learnerFacingTitle) throw new Error(`Missing learner-facing title for ${group.taskCode}`);
    await prisma.testQuestionGroup.upsert({
      where: { id: groupId },
      update: {
        testId: M05_FOUR_SKILLS_TEST_ID,
        skill: group.skill,
        orderIndex: groupOrder,
        title: learnerFacingTitle,
        instructions: learnerInstructions,
        taskCode: group.taskCode,
        preparationSeconds: group.preparationSeconds,
        responseSeconds: group.responseSeconds,
        recommendedSeconds: group.recommendedSeconds,
        maxRecordingSeconds: group.maxRecordingSeconds,
      },
      create: {
        id: groupId,
        testId: M05_FOUR_SKILLS_TEST_ID,
        skill: group.skill,
        orderIndex: groupOrder,
        title: learnerFacingTitle,
        instructions: learnerInstructions,
        taskCode: group.taskCode,
        preparationSeconds: group.preparationSeconds,
        responseSeconds: group.responseSeconds,
        recommendedSeconds: group.recommendedSeconds,
        maxRecordingSeconds: group.maxRecordingSeconds,
      },
    });
    for (const stimulus of group.stimuli) {
      const asset = stimulus.mediaKey ? media.get(stimulus.mediaKey) : undefined;
      if (stimulus.mediaKey && !asset) throw new Error(`Missing M05 media ${stimulus.mediaKey}`);
      const storageKey = asset?.proposedRuntimePath.split('apps/api/assets/assessment/m05/')[1];
      const id = stableUuid(`stimulus:${group.contentKey}:${stimulus.orderIndex}`);
      await prisma.assessmentStimulus.upsert({
        where: { id },
        update: {
          groupId,
          type: AssessmentStimulusType[stimulus.type],
          orderIndex: stimulus.orderIndex,
          textContent: stimulus.textContent,
          storageKey,
          mimeType: asset?.mimeType,
          altText: stimulus.altText,
          isProtected: stimulus.isProtected,
        },
        create: {
          id,
          groupId,
          type: AssessmentStimulusType[stimulus.type],
          orderIndex: stimulus.orderIndex,
          textContent: stimulus.textContent,
          storageKey,
          mimeType: asset?.mimeType,
          altText: stimulus.altText,
          isProtected: stimulus.isProtected,
        },
      });
    }

    const questions: QuestionSeed[] =
      group.questions ??
      [{
        contentKey: group.contentKey,
        responseType: group.responseType ?? 'TEXT_RESPONSE',
        content: learnerInstructions ?? group.taskCode,
      }];
    for (const question of questions) {
      const questionId = stableUuid(`question:${question.contentKey}`);
      const testQuestionId = stableUuid(`test-question:${question.contentKey}`);
      const rubricId = group.rubricCode ? rubricIds.get(group.rubricCode) : undefined;
      if (group.rubricCode && !rubricId) throw new Error(`Missing M05 rubric ${group.rubricCode}`);
      await prisma.question.upsert({
        where: { id: questionId },
        update: {
          courseId,
          responseType: QuestionResponseType[question.responseType],
          difficulty: QuestionDifficulty.MEDIUM,
          toeicSkill: group.skill,
          content: question.content ?? learnerInstructions ?? group.taskCode,
          rubricId,
        },
        create: {
          id: questionId,
          courseId,
          responseType: QuestionResponseType[question.responseType],
          difficulty: QuestionDifficulty.MEDIUM,
          toeicSkill: group.skill,
          content: question.content ?? learnerInstructions ?? group.taskCode,
          rubricId,
        },
      });
      for (const [optionOrder, option] of (question.options ?? []).entries()) {
        const optionId = stableUuid(`option:${question.contentKey}:${option.key}`);
        await prisma.questionOption.upsert({
          where: { id: optionId },
          update: {
            questionId,
            content: option.content,
            isCorrect: option.key === question.correctOptionKey,
            orderIndex: optionOrder,
          },
          create: {
            id: optionId,
            questionId,
            content: option.content,
            isCorrect: option.key === question.correctOptionKey,
            orderIndex: optionOrder,
          },
        });
      }
      await prisma.testQuestion.upsert({
        where: { id: testQuestionId },
        update: {
          testId: M05_FOUR_SKILLS_TEST_ID,
          questionId,
          groupId,
          orderIndex: questionOrder,
          points: group.skill === ToeicSkill.LISTENING || group.skill === ToeicSkill.READING ? 1 : 0,
        },
        create: {
          id: testQuestionId,
          testId: M05_FOUR_SKILLS_TEST_ID,
          questionId,
          groupId,
          orderIndex: questionOrder,
          points: group.skill === ToeicSkill.LISTENING || group.skill === ToeicSkill.READING ? 1 : 0,
        },
      });
      questionOrder += 1;
    }
  }
}
