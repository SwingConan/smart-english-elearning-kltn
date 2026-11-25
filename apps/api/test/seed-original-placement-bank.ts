import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { startWave01App } from './wave01-postgres.fixture';
import { AssessmentStimulusMediaStorage } from '../src/modules/placement/assessment-stimulus-media.storage';
import {
  placementGraphInclude,
  placementSnapshot,
} from '../src/modules/placement/integration.service';
import {
  placementEligibility,
  placementSourceDigest,
  type PlacementProvenance,
} from '../src/modules/placement/source-eligibility';

export async function seedOriginalPlacementBank(
  dev: Awaited<ReturnType<typeof startWave01App>>,
  mode: 'LR' | 'FOUR_SKILLS',
  genericSpeakingForFastWorkflow = false,
) {
  await createRequire(__filename)('../../../scripts/lib/e2e-target.cjs').verify();
  if (!/\/v2_wave01_dev_test_w04b_/.test(process.env.E2E_DATABASE_URL ?? '')) {
    throw new Error('PRIVATE_W04B_TARGET_REQUIRED');
  }

  const contentDir = path.resolve(__dirname, '../content/se-original-v1');
  const repoRoot = path.resolve(__dirname, '../../..');
  const lrManifest = JSON.parse(
    fs.readFileSync(path.join(contentDir, 'SE_LR_200_Manifest.json'), 'utf8'),
  );
  const swManifest = JSON.parse(
    fs.readFileSync(path.join(contentDir, 'SE_SW_19_Manifest.json'), 'utf8'),
  );
  const mediaManifest = JSON.parse(
    fs.readFileSync(path.join(contentDir, 'SE_Media_Manifest.json'), 'utf8'),
  );
  const assetById = new Map<string, any>(
    mediaManifest.assets.map((a: any) => [a.assetId, a]),
  );

  const storage = dev.app.get(AssessmentStimulusMediaStorage);

  const test = await dev.prisma.test.create({
    data: {
      purpose: 'PLACEMENT',
      placementMode: mode,
      status: 'DRAFT',
      title: `Smart English Original ${mode} Placement Bank (SE-ORIG-V1)`,
      timeLimitMinutes: null,
    },
  });

  const groups: Array<{
    group: any;
    questions: Array<{ question: any; tq: any }>;
  }> = [];
  const provenanceAssets: NonNullable<PlacementProvenance['assets']> = [];

  let groupOrder = 0;
  let globalQuestionOrder = 0;

  for (const g of lrManifest.groups) {
    const groupRow = await dev.prisma.testQuestionGroup.create({
      data: {
        testId: test.id,
        skill: g.skill as 'LISTENING' | 'READING',
        orderIndex: groupOrder++,
        taskCode: g.taskCode,
        title: g.title,
        instructions: g.instructions,
      },
    });

    let stimOrder = 0;
    for (const aid of g.mediaAssetIds ?? []) {
      const asset = assetById.get(aid);
      const bytes = fs.readFileSync(path.join(repoRoot, asset.relativePath));
      const ext = asset.kind === 'IMAGE' ? 'png' : 'wav';
      const storageKey = await storage.put(bytes, ext);
      const stim = await dev.prisma.assessmentStimulus.create({
        data: {
          groupId: groupRow.id,
          type: asset.kind as 'IMAGE' | 'AUDIO',
          storageKey,
          mimeType: asset.mimeType,
          textContent: asset.transcriptText ?? null,
          orderIndex: stimOrder++,
        },
      });
      provenanceAssets.push({
        id: stim.id,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        rights: 'PENDING',
        reviewers: [],
      });
    }

    if (g.passage) {
      await dev.prisma.assessmentStimulus.create({
        data: {
          groupId: groupRow.id,
          type: 'TEXT',
          mimeType: 'text/plain',
          textContent: g.passage,
          orderIndex: stimOrder++,
        },
      });
    }

    const groupQuestions: Array<{ question: any; tq: any }> = [];
    for (const q of g.questions) {
      const question = await dev.prisma.question.create({
        data: {
          responseType: 'SINGLE_CHOICE',
          difficulty: q.difficulty === 'A2' ? 'EASY' : q.difficulty === 'B2' ? 'HARD' : 'MEDIUM',
          toeicSkill: g.skill as 'LISTENING' | 'READING',
          content: q.stem,
          explanation: q.explanationVi,
          options: {
            create: (['A', 'B', 'C', 'D'] as const)
              .filter((k) => typeof q.options[k] === 'string' && q.options[k].length > 0)
              .map((k, optIdx) => ({
                content: q.options[k],
                isCorrect: q.correctKey === k,
                orderIndex: optIdx,
              })),
          },
        },
      });
      const tq = await dev.prisma.testQuestion.create({
        data: {
          testId: test.id,
          groupId: groupRow.id,
          questionId: question.id,
          orderIndex: globalQuestionOrder++,
        },
      });
      groupQuestions.push({ question, tq });
    }
    groups.push({ group: groupRow, questions: groupQuestions });
  }

  if (mode === 'FOUR_SKILLS') {
    for (const s of swManifest.speakingTasks) {
      const groupRow = await dev.prisma.testQuestionGroup.create({
        data: {
          testId: test.id,
          skill: 'SPEAKING',
          orderIndex: groupOrder++,
          taskCode:
            genericSpeakingForFastWorkflow && s.groupTaskCode === 'SE_SW_01_S10_V01'
              ? 'S10_PROPOSE_SOLUTION'
              : s.groupTaskCode,
          title: `Speaking ${s.questionId} (${s.taskCode})`,
          instructions: s.instructions,
          preparationSeconds: s.prepSeconds,
          responseSeconds: s.responseSeconds,
          recommendedSeconds: s.responseSeconds,
          maxRecordingSeconds: s.responseSeconds,
        },
      });

      let stimOrder = 0;
      for (const aid of s.mediaAssetIds ?? []) {
        const asset = assetById.get(aid);
        const bytes = fs.readFileSync(path.join(repoRoot, asset.relativePath));
        const ext = asset.kind === 'IMAGE' ? 'png' : 'wav';
        const storageKey = await storage.put(bytes, ext);
        const stim = await dev.prisma.assessmentStimulus.create({
          data: {
            groupId: groupRow.id,
            type: asset.kind as 'IMAGE' | 'AUDIO',
            storageKey,
            mimeType: asset.mimeType,
            textContent: asset.transcriptText ?? null,
            orderIndex: stimOrder++,
          },
        });
        provenanceAssets.push({
          id: stim.id,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          rights: 'PENDING',
          reviewers: [],
        });
      }

      if (s.informationSheetId) {
        await dev.prisma.assessmentStimulus.create({
          data: {
            groupId: groupRow.id,
            type: 'TEXT',
            mimeType: 'application/json',
            textContent: JSON.stringify(swManifest.informationSheet),
            altText: swManifest.informationSheet.caption,
            orderIndex: stimOrder++,
          },
        });
      }

      const question = await dev.prisma.question.create({
        data: {
          responseType: 'AUDIO_RESPONSE',
          difficulty: s.difficulty === 'A2' ? 'EASY' : s.difficulty === 'B2' ? 'HARD' : 'MEDIUM',
          toeicSkill: 'SPEAKING',
          content: s.promptText,
          explanation: s.anchorSample,
        },
      });
      const tq = await dev.prisma.testQuestion.create({
        data: {
          testId: test.id,
          groupId: groupRow.id,
          questionId: question.id,
          orderIndex: globalQuestionOrder++,
        },
      });
      groups.push({ group: groupRow, questions: [{ question, tq }] });
    }

    for (const w of swManifest.writingTasks) {
      const groupRow = await dev.prisma.testQuestionGroup.create({
        data: {
          testId: test.id,
          skill: 'WRITING',
          orderIndex: groupOrder++,
          taskCode: w.groupTaskCode,
          title: `Writing ${w.questionId} (${w.taskCode})`,
          instructions: w.instructions,
          preparationSeconds: w.prepSeconds,
          responseSeconds: w.responseSeconds,
          recommendedSeconds: w.responseSeconds,
        },
      });

      let stimOrder = 0;
      for (const aid of w.mediaAssetIds ?? []) {
        const asset = assetById.get(aid);
        const bytes = fs.readFileSync(path.join(repoRoot, asset.relativePath));
        const storageKey = await storage.put(bytes, 'png');
        const stim = await dev.prisma.assessmentStimulus.create({
          data: {
            groupId: groupRow.id,
            type: 'IMAGE',
            storageKey,
            mimeType: asset.mimeType,
            orderIndex: stimOrder++,
          },
        });
        provenanceAssets.push({
          id: stim.id,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          rights: 'PENDING',
          reviewers: [],
        });
      }

      const question = await dev.prisma.question.create({
        data: {
          responseType: 'TEXT_RESPONSE',
          difficulty: w.difficulty === 'A2' ? 'EASY' : w.difficulty === 'B2' ? 'HARD' : 'MEDIUM',
          toeicSkill: 'WRITING',
          content: w.promptText,
          explanation: w.anchorSample,
        },
      });
      const tq = await dev.prisma.testQuestion.create({
        data: {
          testId: test.id,
          groupId: groupRow.id,
          questionId: question.id,
          orderIndex: globalQuestionOrder++,
        },
      });
      groups.push({ group: groupRow, questions: [{ question, tq }] });
    }
  }

  const snapshot = placementSnapshot(
    await dev.prisma.test.findUniqueOrThrow({
      where: { id: test.id },
      include: placementGraphInclude,
    }),
  );

  const productionProvenance: PlacementProvenance = {
    synthetic: false,
    source: 'SMART_ENGLISH_ORIGINAL_V1',
    rights: {
      status: 'PENDING',
      evidence: 'Original Smart English authored bank; release sign-off pending',
    },
    academic: { status: 'PENDING' },
    assets: provenanceAssets,
  };

  const eligibility = placementEligibility(snapshot, productionProvenance);

  const devWorkflowProvenance: PlacementProvenance = {
    ...productionProvenance,
    synthetic: true,
  };

  const version = await dev.prisma.placementSourceVersion.create({
    data: {
      testId: test.id,
      mode,
      version: 1,
      purpose: 'DEV_PREVIEW',
      snapshot,
      sourceHash: placementSourceDigest(snapshot),
      provenance: devWorkflowProvenance as any,
    },
  });

  return { version, groups, snapshot, eligibility };
}
