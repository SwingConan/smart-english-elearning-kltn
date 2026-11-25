import { resolve } from 'node:path';
import {
  placementEligibility,
  PLACEMENT_BLUEPRINT,
  type PlacementSnapshot,
} from './source-eligibility';
import { privatePlacementPreviewEnabled } from './placement-preview.guard';
import type { Prisma } from '../../generated/prisma/client';
const snapshot = (): PlacementSnapshot => ({
  testId: 't',
  mode: 'LR',
  title: 'Private incomplete source',
  allQuestionIds: ['tq'],
  groups: [
    {
      id: 'g',
      skill: 'READING',
      taskCode: 'P5',
      title: null,
      instructions: null,
      stimulusText: null,
      audioUrl: null,
      preparationSeconds: null,
      responseSeconds: null,
      recommendedSeconds: null,
      maxRecordingSeconds: null,
      stimuli: [],
      questions: [
        {
          id: 'tq',
          questionId: 'q',
          content: 'Original private question',
          responseType: 'SINGLE_CHOICE',
          skill: 'READING',
          orderIndex: 0,
          points: 1,
          explanation: 'PRIVATE',
          options: [
            { id: 'a', content: 'one', orderIndex: 0, isCorrect: true },
            { id: 'b', content: 'two', orderIndex: 1, isCorrect: false },
          ],
        },
      ],
    },
  ],
});
describe('W04A full-source boundary, not a synthetic full bank', () => {
  it('keeps exact PO blueprint200 LR plus11/8, without manufacturing a bank', () => {
    expect(Object.values(PLACEMENT_BLUEPRINT.LISTENING).reduce((a, b) => a + b, 0)).toBe(100);
    expect(Object.values(PLACEMENT_BLUEPRINT.READING).reduce((a, b) => a + b, 0)).toBe(100);
    expect(PLACEMENT_BLUEPRINT.SPEAKING + PLACEMENT_BLUEPRINT.WRITING).toBe(19);
  });
  it('cannot publish an incomplete source even with declared goals and metadata', () => {
    const r = placementEligibility(snapshot(), {
      source: 'Original',
      rights: { status: 'CLEARED', evidence: 'Declared only' },
      academic: { status: 'APPROVED', reviewerId: 'reviewer' },
    });
    expect(r.learnerPublishable).toBe(false);
    expect(r.fullBlueprintAndEvidenceReady).toBe(false);
    expect(r.reasons).toContain('FULL_LR_200_REQUIRED');
  });
  it('checks orphan question membership rather than trusting displayed group count', () => {
    const s = snapshot();
    s.allQuestionIds.push('orphan');
    expect(placementEligibility(s, {}).reasons).toContain('UNASSIGNED_OR_FOREIGN_QUESTIONS');
  });
  it('rejects missing or multiple keys, empty content and wrong Part', () => {
    const s = snapshot();
    s.groups[0].questions[0].options.forEach((x) => (x.isCorrect = true));
    s.groups[0].taskCode = 'P2';
    expect(placementEligibility(s, {}).reasons).toEqual(
      expect.arrayContaining(['ANSWER_KEY_INVALID', 'MISSING_OR_WRONG_PART']),
    );
  });
  it('does not trust an asset with fewer than two distinct real reviewers', () => {
    const s = snapshot();
    s.groups[0].stimuli = [
      {
        id: 'asset',
        type: 'IMAGE',
        orderIndex: 0,
        textContent: null,
        storageKey: 'authored/file.png',
        mimeType: 'image/png',
        altText: null,
        isProtected: false,
      },
    ];
    const reviewer = {
      id: 'same',
      status: 'PASS',
      human: true,
      reviewedAt: '2026-11-01T00:00:00Z',
    };
    expect(
      placementEligibility(s, {
        assets: [
          {
            id: 'asset',
            sha256: 'a'.repeat(64),
            rights: 'CLEARED',
            reviewers: [reviewer, reviewer],
          },
        ],
      }).reasons,
    ).toContain('TWO_MEDIA_REVIEWERS_PENDING');
  });
  it('requires actual media evidence and source rights, not title/status alone', () => {
    const s = snapshot();
    s.groups[0].audioUrl = 'https://tracking.invalid/file.wav';
    expect(placementEligibility(s, {}).reasons).toEqual(
      expect.arrayContaining([
        'INVALID_CONTENT_OR_EXTERNAL_MEDIA',
        'SOURCE_RIGHTS_PENDING',
        'ACADEMIC_REVIEW_PENDING',
      ]),
    );
  });
  it('never treats a synthetic source as learner publishable', () => {
    expect(placementEligibility(snapshot(), { synthetic: true }).reasons).toContain(
      'SYNTHETIC_NOT_PUBLISHABLE',
    );
  });
});
describe('W04A preview fence validates all identity dimensions', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });
  const valid = () => {
    process.env.NODE_ENV = 'test';
    process.env.W04A_PREVIEW_ENABLED = 'DEV_PREVIEW_ONLY';
    process.env.E2E_DATABASE_URL =
      'postgresql://wave01@127.0.0.1:55401/v2_wave01_dev_test_w04a_unit';
    process.env.DATABASE_URL = process.env.E2E_DATABASE_URL;
  };
  function tx(override: Record<string, unknown> = {}) {
    const fn = jest
      .fn()
      .mockResolvedValue([
        {
          db: 'v2_wave01_dev_test_w04a_unit',
          usr: 'wave01',
          dir: resolve('.local-storage/v2-wave01/postgres'),
          schema: 'public',
          port: 55401,
          host: '127.0.0.1',
          marker: 'SMART_ENGLISH_DISPOSABLE_E2E_V1',
          ...override,
        },
      ]);
    return { $queryRaw: fn } as unknown as Prisma.TransactionClient;
  }
  it('rejects production before querying a DB', async () => {
    valid();
    process.env.NODE_ENV = 'production';
    const t = tx();
    expect(await privatePlacementPreviewEnabled(t)).toBe(false);
    expect(t.$queryRaw).not.toHaveBeenCalled();
  });
  it('rejects old DEV URL without connecting', async () => {
    valid();
    process.env.E2E_DATABASE_URL = 'postgresql://x@localhost:5432/smart_elearning_dev';
    process.env.DATABASE_URL = process.env.E2E_DATABASE_URL;
    const t = tx();
    expect(await privatePlacementPreviewEnabled(t)).toBe(false);
    expect(t.$queryRaw).not.toHaveBeenCalled();
  });
  it.each([
    { marker: 'wrong' },
    { usr: 'other' },
    { schema: 'other' },
    { dir: 'C:/untrusted' },
    { host: '10.0.0.1' },
    { port: 5432 },
    { db: 'wrong' },
  ])('rejects mismatched identity %j', async (bad) => {
    valid();
    expect(await privatePlacementPreviewEnabled(tx(bad))).toBe(false);
  });
  it('requires explicit pinned identity and opt-in together', async () => {
    valid();
    expect(await privatePlacementPreviewEnabled(tx())).toBe(true);
    delete process.env.W04A_PREVIEW_ENABLED;
    expect(await privatePlacementPreviewEnabled(tx())).toBe(false);
  });
});
