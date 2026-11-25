import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { startWave01App } from './wave01-postgres.fixture';
import { AssessmentStimulusMediaStorage } from '../src/modules/placement/assessment-stimulus-media.storage';
import {
  placementGraphInclude,
  placementSnapshot,
} from '../src/modules/placement/integration.service';
import { placementSourceDigest } from '../src/modules/placement/source-eligibility';
export async function seedPlacementPreview(
  dev: Awaited<ReturnType<typeof startWave01App>>,
  mode: 'LR' | 'FOUR_SKILLS',
) {
  await createRequire(__filename)('../../../scripts/lib/e2e-target.cjs').verify();
  if (!/\/v2_wave01_dev_test_w04a_/.test(process.env.E2E_DATABASE_URL ?? ''))
    throw Error('PRIVATE_W04A_TARGET_REQUIRED');
  const test = await dev.prisma.test.create({
    data: {
      purpose: 'PLACEMENT',
      placementMode: mode,
      status: 'DRAFT',
      title: 'DEV Placement ' + mode + ' — ungraded technical preview',
      timeLimitMinutes: null,
    },
  });
  const groups = [];
  const assets = [];
  for (const [index, skill, code, type] of [
    [0, 'READING', 'P5', 'SINGLE_CHOICE'],
    [1, 'READING', 'P7', 'SINGLE_CHOICE'],
    ...(mode === 'FOUR_SKILLS'
      ? [
          [2, 'SPEAKING', 'SE_SW_01_S10_V01', 'AUDIO_RESPONSE'],
          [3, 'WRITING', 'DEV_WRITING', 'TEXT_RESPONSE'],
        ]
      : []),
  ] as const) {
    const g = await dev.prisma.testQuestionGroup.create({
      data: {
        testId: test.id,
        skill: skill as 'READING' | 'SPEAKING' | 'WRITING',
        orderIndex: Number(index),
        taskCode: String(code),
        title: 'Private DEV ' + skill,
        instructions: 'Ungraded technical preview, not full-length exam content.',
        ...(skill === 'SPEAKING' ? { responseSeconds: 30, maxRecordingSeconds: 30 } : {}),
      },
    });
    const question = await dev.prisma.question.create({
      data: {
        responseType: type as 'SINGLE_CHOICE' | 'AUDIO_RESPONSE' | 'TEXT_RESPONSE',
        difficulty: 'EASY',
        toeicSkill: skill as 'READING' | 'SPEAKING' | 'WRITING',
        content:
          skill === 'WRITING'
            ? 'DEV: write an original short announcement.'
            : skill === 'SPEAKING'
              ? 'DEV protocol task: listen twice, then record30 seconds.'
              : 'Original DEV practice: choose a word form for the technical preview ' +
                index +
                '.',
        explanation: 'INTERNAL_PREVIEW_KEY_NEVER_LEARNER',
        ...(type === 'SINGLE_CHOICE'
          ? {
              options: {
                create: [
                  { content: 'Original option one', isCorrect: true, orderIndex: 0 },
                  { content: 'Original option two', isCorrect: false, orderIndex: 1 },
                ],
              },
            }
          : {}),
      },
    });
    const tq = await dev.prisma.testQuestion.create({
      data: { testId: test.id, groupId: g.id, questionId: question.id, orderIndex: Number(index) },
    });
    if (skill === 'SPEAKING') {
      const bytes = await readFile(
        resolve('.local-storage/se-sw-01/media/SE-SW-01_S10_question_v01.wav'),
      );
      const key = await dev.app.get(AssessmentStimulusMediaStorage).put(bytes, 'wav');
      const a = await dev.prisma.assessmentStimulus.create({
        data: {
          groupId: g.id,
          type: 'AUDIO',
          storageKey: key,
          mimeType: 'audio/wav',
          orderIndex: 0,
        },
      });
      assets.push({
        id: a.id,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        rights: 'PENDING',
        reviewers: [],
      });
    }
    groups.push({ group: g, question, tq });
  }
  const snapshot = placementSnapshot(
    await dev.prisma.test.findUniqueOrThrow({
      where: { id: test.id },
      include: placementGraphInclude,
    }),
  );
  const v = await dev.prisma.placementSourceVersion.create({
    data: {
      testId: test.id,
      mode,
      version: 1,
      purpose: 'DEV_PREVIEW',
      snapshot,
      sourceHash: placementSourceDigest(snapshot),
      provenance: {
        synthetic: true,
        source: 'Private original DEV protocol fixture ' + randomUUID(),
        rights: { status: 'PENDING', evidence: 'No release license claim' },
        academic: { status: 'PENDING' },
        assets,
      },
    },
  });
  return { version: v, groups, snapshot };
}
