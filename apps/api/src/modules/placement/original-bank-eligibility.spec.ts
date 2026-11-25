import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  placementEligibility,
  placementSourceDigest,
  type PlacementProvenance,
  type PlacementSnapshot,
} from './source-eligibility';

describe('Smart English V2 Original Placement Bank (SE-LR-01 200 items + SE-SW-01 19 tasks)', () => {
  const contentDir = path.resolve(__dirname, '../../../content/se-original-v1');
  const lrManifest = JSON.parse(
    fs.readFileSync(path.join(contentDir, 'SE_LR_200_Manifest.json'), 'utf8'),
  );
  const swManifest = JSON.parse(
    fs.readFileSync(path.join(contentDir, 'SE_SW_19_Manifest.json'), 'utf8'),
  );
  const mediaManifest = JSON.parse(
    fs.readFileSync(path.join(contentDir, 'SE_Media_Manifest.json'), 'utf8'),
  );

  interface MediaManifestAsset {
    assetId: string;
    kind: string;
    mimeType: string;
    storageKey: string;
    transcriptText?: string | null;
    sourceBrief?: string | null;
    sha256: string;
  }
  interface LrManifestQuestion {
    code: string;
    stem: string;
    explanationVi: string;
    options: Record<string, string | undefined>;
    correctKey: string;
  }

  const assetById = new Map<string, MediaManifestAsset>(
    (mediaManifest.assets as MediaManifestAsset[]).map((a) => [a.assetId, a]),
  );

  function buildSnapshot(mode: 'LR' | 'FOUR_SKILLS'): {
    snapshot: PlacementSnapshot;
    provenance: PlacementProvenance;
  } {
    const provenanceAssets: NonNullable<PlacementProvenance['assets']> = [];
    const groups: PlacementSnapshot['groups'] = [];
    const allQuestionIds: string[] = [];

    for (const g of lrManifest.groups) {
      const stimuli: PlacementSnapshot['groups'][number]['stimuli'] = [];
      let stimIdx = 0;
      for (const aid of g.mediaAssetIds ?? []) {
        const asset = assetById.get(aid)!;
        const stimId = `stim-${g.groupCode}-${stimIdx}`;
        stimuli.push({
          id: stimId,
          orderIndex: stimIdx,
          type: asset.kind,
          mimeType: asset.mimeType,
          storageKey: asset.storageKey,
          textContent: asset.transcriptText ?? null,
          altText: asset.sourceBrief ?? null,
          isProtected: false,
        });
        provenanceAssets.push({
          id: stimId,
          sha256: asset.sha256,
          rights: 'PENDING',
          reviewers: [],
        });
        stimIdx += 1;
      }

      if (g.passage) {
        stimuli.push({
          id: `stim-${g.groupCode}-passage`,
          orderIndex: stimIdx,
          type: 'TEXT',
          mimeType: 'text/plain',
          storageKey: null,
          textContent: g.passage,
          altText: null,
          isProtected: false,
        });
      }

      const questions = (g.questions as LrManifestQuestion[]).map((q, qIdx: number) => {
        const tqId = `tq-${q.code}`;
        allQuestionIds.push(tqId);
        return {
          id: tqId,
          questionId: `q-${q.code}`,
          orderIndex: qIdx,
          points: 1,
          content: q.stem,
          responseType: 'SINGLE_CHOICE',
          skill: g.skill,
          explanation: q.explanationVi,
          options: (['A', 'B', 'C', 'D'] as const)
            .filter((k) => typeof q.options[k] === 'string' && q.options[k]!.length > 0)
            .map((k, optIdx) => ({
              id: `opt-${q.code}-${k}`,
              orderIndex: optIdx,
              content: q.options[k] ?? '',
              isCorrect: q.correctKey === k,
            })),
        };
      });

      groups.push({
        id: `grp-${g.groupCode}`,
        skill: g.skill,
        taskCode: g.taskCode,
        title: g.title,
        instructions: g.instructions,
        stimulusText: g.passage ?? g.transcript ?? null,
        audioUrl: null,
        preparationSeconds: null,
        responseSeconds: null,
        recommendedSeconds: null,
        maxRecordingSeconds: null,
        stimuli,
        questions,
      });
    }

    if (mode === 'FOUR_SKILLS') {
      for (const s of swManifest.speakingTasks) {
        const stimuli: PlacementSnapshot['groups'][number]['stimuli'] = [];
        let stimIdx = 0;
        for (const aid of s.mediaAssetIds ?? []) {
          const asset = assetById.get(aid)!;
          const stimId = `stim-${s.itemCode}-${stimIdx}`;
          stimuli.push({
            id: stimId,
            orderIndex: stimIdx,
            type: asset.kind,
            mimeType: asset.mimeType,
            storageKey: asset.storageKey,
            textContent: asset.transcriptText ?? null,
            altText: asset.sourceBrief ?? null,
            isProtected: false,
          });
          provenanceAssets.push({
            id: stimId,
            sha256: asset.sha256,
            rights: 'PENDING',
            reviewers: [],
          });
          stimIdx += 1;
        }
        if (s.informationSheetId) {
          stimuli.push({
            id: `stim-${s.itemCode}-table`,
            orderIndex: stimIdx,
            type: 'TEXT',
            mimeType: 'application/json',
            storageKey: null,
            textContent: JSON.stringify(swManifest.informationSheet),
            altText: swManifest.informationSheet.caption,
            isProtected: false,
          });
        }
        const tqId = `tq-${s.itemCode}`;
        allQuestionIds.push(tqId);
        groups.push({
          id: `grp-${s.itemCode}`,
          skill: 'SPEAKING',
          taskCode: s.groupTaskCode,
          title: `Speaking ${s.questionId} (${s.taskCode})`,
          instructions: s.instructions,
          stimulusText: s.promptText,
          audioUrl: null,
          preparationSeconds: s.prepSeconds,
          responseSeconds: s.responseSeconds,
          recommendedSeconds: s.responseSeconds,
          maxRecordingSeconds: s.responseSeconds,
          stimuli,
          questions: [
            {
              id: tqId,
              questionId: `q-${s.itemCode}`,
              orderIndex: 0,
              points: 1,
              content: s.promptText,
              responseType: 'AUDIO_RESPONSE',
              skill: 'SPEAKING',
              explanation: s.anchorSample,
              options: [],
            },
          ],
        });
      }

      for (const w of swManifest.writingTasks) {
        const stimuli: PlacementSnapshot['groups'][number]['stimuli'] = [];
        let stimIdx = 0;
        for (const aid of w.mediaAssetIds ?? []) {
          const asset = assetById.get(aid)!;
          const stimId = `stim-${w.itemCode}-${stimIdx}`;
          stimuli.push({
            id: stimId,
            orderIndex: stimIdx,
            type: asset.kind,
            mimeType: asset.mimeType,
            storageKey: asset.storageKey,
            textContent: null,
            altText: asset.sourceBrief ?? null,
            isProtected: false,
          });
          provenanceAssets.push({
            id: stimId,
            sha256: asset.sha256,
            rights: 'PENDING',
            reviewers: [],
          });
          stimIdx += 1;
        }
        const tqId = `tq-${w.itemCode}`;
        allQuestionIds.push(tqId);
        groups.push({
          id: `grp-${w.itemCode}`,
          skill: 'WRITING',
          taskCode: w.groupTaskCode,
          title: `Writing ${w.questionId} (${w.taskCode})`,
          instructions: w.instructions,
          stimulusText: w.promptText,
          audioUrl: null,
          preparationSeconds: w.prepSeconds,
          responseSeconds: w.responseSeconds,
          recommendedSeconds: w.responseSeconds,
          maxRecordingSeconds: null,
          stimuli,
          questions: [
            {
              id: tqId,
              questionId: `q-${w.itemCode}`,
              orderIndex: 0,
              points: 1,
              content: w.promptText,
              responseType: 'TEXT_RESPONSE',
              skill: 'WRITING',
              explanation: w.anchorSample,
              options: [],
            },
          ],
        });
      }
    }

    const snapshot: PlacementSnapshot = {
      testId: `se-orig-${mode.toLowerCase()}`,
      allQuestionIds,
      title: `Smart English Original ${mode} Placement Bank`,
      mode,
      groups,
    };

    const provenance: PlacementProvenance = {
      synthetic: false,
      source: 'SMART_ENGLISH_ORIGINAL_V1',
      rights: { status: 'PENDING', evidence: 'Original Smart English authored bank; release sign-off pending' },
      academic: { status: 'PENDING' },
      assets: provenanceAssets,
    };

    return { snapshot, provenance };
  }

  it('validates full 200-item LR original bank blueprint with zero structural/key/media errors and honest pending release gates', () => {
    const { snapshot, provenance } = buildSnapshot('LR');
    const eligibility = placementEligibility(snapshot, provenance);
    expect(eligibility.counts).toEqual({
      LISTENING: 100,
      READING: 100,
    });
    expect(eligibility.parts).toEqual({
      1: 6,
      2: 25,
      3: 39,
      4: 30,
      5: 30,
      6: 16,
      7: 54,
    });
    expect(eligibility.learnerPublishable).toBe(false);
    expect(eligibility.reasons).toEqual([
      'ASSET_RIGHTS_PENDING',
      'TWO_MEDIA_REVIEWERS_PENDING',
      'SOURCE_RIGHTS_PENDING',
      'ACADEMIC_REVIEW_PENDING',
    ]);
    expect(placementSourceDigest(snapshot)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('validates full 219-task FOUR_SKILLS original bank blueprint (LR 200 + S 11 + W 8) including S10 protocol and media hashes', () => {
    const { snapshot, provenance } = buildSnapshot('FOUR_SKILLS');
    const eligibility = placementEligibility(snapshot, provenance);
    expect(eligibility.counts).toEqual({
      LISTENING: 100,
      READING: 100,
      SPEAKING: 11,
      WRITING: 8,
    });
    expect(eligibility.parts).toEqual({
      1: 6,
      2: 25,
      3: 39,
      4: 30,
      5: 30,
      6: 16,
      7: 54,
    });
    expect(eligibility.learnerPublishable).toBe(false);
    expect(eligibility.reasons).toEqual([
      'ASSET_RIGHTS_PENDING',
      'TWO_MEDIA_REVIEWERS_PENDING',
      'SOURCE_RIGHTS_PENDING',
      'ACADEMIC_REVIEW_PENDING',
    ]);
    expect(placementSourceDigest(snapshot)).toMatch(/^[a-f0-9]{64}$/);
  });
});
