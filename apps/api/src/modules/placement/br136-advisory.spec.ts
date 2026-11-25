/* eslint-disable @typescript-eslint/no-explicit-any */
import { GeminiAdvisoryAdapter, type GeminiHttpTransport } from './gemini-advisory-provider';
import {
  generatePlacementAiAdvisory,
  type AiAdvisoryCustomProviderInput,
} from './placement-diagnosis-advisory';

export function context(): AiAdvisoryCustomProviderInput {
  return {
    attemptId: 'authorized-synthetic-attempt-A',
    sanitizedLearnerContext: 'raw writing MUST NOT travel',
    diagnosis: {
      snapshotVersion: 'WAVE05_DIAG_V1',
      sourceDigestRef: 'shared-bank',
      minSamplesThreshold: 3,
      overallSummary: {
        lrAnsweredCount: 200,
        lrTotalItems: 200,
        lrCorrectCount: 110,
        lrAccuracyPct: 55,
        listeningCorrect: 70,
        listeningSamples: 100,
        listeningAccuracyPct: 70,
        readingCorrect: 40,
        readingSamples: 100,
        readingAccuracyPct: 40,
        balanceState: 'LISTENING_STRONGER',
        balanceLabelVi: 'Nghe tốt hơn',
        internalScaleDisclosureVi: 'Nội bộ',
      },
      partBreakdown: [
        {
          part: 'P5',
          skill: 'READING',
          titleVi: 'Ngữ pháp',
          accuracyPct: 40,
          samples: 30,
          sufficiency: 'SUFFICIENT',
          canClaimWeakness: true,
        },
      ],
      knowledgeBreakdown: [
        {
          domainCode: 'GRAMMAR_WORD_FORMS_CLAUSE',
          skill: 'READING',
          titleVi: 'Từ loại',
          accuracyPct: 40,
          samples: 30,
          correct: 12,
          sufficiency: 'SUFFICIENT',
          canClaimWeakness: true,
          linkedArticleSlugs: ['word-forms'],
        },
      ],
      productiveSkills: [],
      strengths: [{ domainCode: 'LISTENING_VISUAL_ACTION', titleVi: 'Nghe', accuracyPct: 70 }],
      improvements: [
        { domainCode: 'GRAMMAR_WORD_FORMS_CLAUSE', titleVi: 'Từ loại', accuracyPct: 40 },
      ],
      lowSampleNotes: [],
      limitations: [],
      difficultyBreakdown: [],
    } as any,
    recommendation: {
      recommendationVersion: 'WAVE05_REC_V1',
      policyId: 'policy',
      policyDigestRef: 'approved-v1',
      overallStatus: 'MATCHED_OPEN_CLASS',
      overallSummaryVi: 'Có lớp phù hợp',
      evaluatedAt: 'ignored-clock',
      courseEvaluations: [
        {
          courseVersionId: 'approved-course',
          courseTitle: 'Reading',
          status: 'RECOMMENDED_PRIORITY',
          priorityRank: 1,
          fitSummaryVi: 'Củng cố đọc',
        },
      ],
      availableClasses: [
        {
          classId: 'approved-class',
          courseVersionId: 'approved-course',
          availabilityStatus: 'AVAILABLE_NOW',
          availableSeats: 3,
          enrolledCount: 7,
          maxStudents: 10,
        },
      ],
      unavailableClasses: [],
    } as any,
    selfStudyGuidance: [
      {
        domainCode: 'GRAMMAR_WORD_FORMS_CLAUSE',
        skill: 'READING',
        topicTitleVi: 'Từ loại',
        searchKeywords: ['word forms'],
        resourceStatusLabel: 'Đã duyệt',
        vettedResources: [
          {
            slug: 'word-forms',
            title: 'Từ loại',
            path: '/knowledge/articles/word-forms',
            kind: 'KNOWLEDGE_ARTICLE',
            verifiedSource: 'PUBLISHED',
          },
        ],
      },
    ] as any,
  };
}

const fragments = {
  schemaVersion: 'BR136_V1',
  diagnosis: { strategy: 'EVIDENCE_REVIEW', domainCodes: ['GRAMMAR_WORD_FORMS_CLAUSE'] },
  classFit: { strategy: 'EXPLAIN_RULES', courseVersionIds: ['approved-course'] },
  selfStudy: { strategy: 'GUIDED_PRACTICE', articlePaths: ['/knowledge/articles/word-forms'] },
};
function response(value: unknown) {
  return {
    status: 200,
    ok: true,
    data: { candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] },
  };
}
const config = {
  provider: 'GEMINI' as const,
  apiKey: 'SYNTHETIC-NOT-A-KEY',
  stagingEnabled: true,
  dailyBudgetCalls: 100,
};
const legacy = {
  diagnosisAdvisory: 'Bạn làm đúng 195 câu',
  classFitAdvisory: 'Lớp phù hợp',
  selfStudyAdvisory: 'Ôn từ loại',
  claimedCorrectCount: 110,
  claimedEligibleCourseVersionIds: ['approved-course'],
  referencedPaths: ['/knowledge/articles/word-forms'],
};

describe('BR136 canonical cache and constructed output', () => {
  beforeEach(() => GeminiAdvisoryAdapter.resetSharedState());
  it('R1 same attempt changed prompt-visible title must dispatch again', async () => {
    const transport = jest.fn<ReturnType<GeminiHttpTransport>, Parameters<GeminiHttpTransport>>(
      async (p) =>
        response(JSON.parse(p.body).generationConfig.responseJsonSchema ? fragments : legacy),
    );
    const adapter = new GeminiAdvisoryAdapter(config, transport);
    const input = context();
    await adapter.executeAdvisory(input);
    input.diagnosis.partBreakdown[0].titleVi = 'Ngữ pháp bản cập nhật';
    await adapter.executeAdvisory(input);
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it('R3 unformatted fabricated correct count must never render', async () => {
    const adapter = new GeminiAdvisoryAdapter(config, async () => response(legacy));
    const input = context();
    const output = await generatePlacementAiAdvisory({
      ...input,
      allowlistedPaths: ['/knowledge/articles/word-forms'],
      providerHook: adapter.createHook(),
    });
    expect(output.providerStatus).toBe('SAFE_FALLBACK');
    expect(output.diagnosisAdvisory).not.toContain('195');
  });

  it.each([
    ['part title', (i: any) => (i.diagnosis.partBreakdown[0].titleVi += ' mới')],
    ['part accuracy', (i: any) => i.diagnosis.partBreakdown[0].accuracyPct++],
    ['domain title', (i: any) => (i.diagnosis.knowledgeBreakdown[0].titleVi += ' mới')],
    ['domain accuracy', (i: any) => i.diagnosis.knowledgeBreakdown[0].accuracyPct++],
    ['strength title', (i: any) => (i.diagnosis.strengths[0].titleVi += ' mới')],
    ['strength accuracy', (i: any) => i.diagnosis.strengths[0].accuracyPct++],
    ['gap title', (i: any) => (i.diagnosis.improvements[0].titleVi += ' mới')],
    ['gap accuracy', (i: any) => i.diagnosis.improvements[0].accuracyPct++],
    ['course title', (i: any) => (i.recommendation.courseEvaluations[0].courseTitle += ' mới')],
    ['course fit', (i: any) => (i.recommendation.courseEvaluations[0].fitSummaryVi += ' mới')],
    [
      'eligibility',
      (i: any) => (i.recommendation.courseEvaluations[0].status = 'ELIGIBLE_ALTERNATIVE'),
    ],
    ['seats', (i: any) => i.recommendation.availableClasses[0].availableSeats--],
    ['capacity', (i: any) => i.recommendation.availableClasses[0].maxStudents++],
    [
      'article revision',
      (i: any) => (i.selfStudyGuidance[0].vettedResources[0].revisionId = 'published-v2'),
    ],
    ['article title', (i: any) => (i.selfStudyGuidance[0].vettedResources[0].title += ' mới')],
    ['approved policy', (i: any) => (i.recommendation.policyDigestRef = 'approved-v2')],
  ])('same attempt invalidates %s', async (_label, mutate) => {
    const transport = jest.fn(async (_p: Parameters<GeminiHttpTransport>[0]) =>
      response(fragments),
    );
    const adapter = new GeminiAdvisoryAdapter(config, transport),
      input = context();
    const first = adapter.buildDeidentifiedPayload(input);
    await adapter.executeAdvisory(input);
    mutate(input);
    await adapter.executeAdvisory(input);
    expect(adapter.buildDeidentifiedPayload(input)).not.toEqual(first);
    expect(transport).toHaveBeenCalledTimes(2);
    const body = JSON.parse(transport.mock.calls[1]?.[0]?.body ?? '{}');
    expect(body).toBeDefined();
  });
  it('FOUR_SKILLS pending/null to published human rubric invalidates same attempt', async () => {
    const transport = jest.fn(async (_p: Parameters<GeminiHttpTransport>[0]) =>
      response(fragments),
    );
    const adapter = new GeminiAdvisoryAdapter(config, transport),
      i = context();
    i.diagnosis.productiveSkills = [
      { skill: 'SPEAKING', status: 'PENDING_REVIEW', totalScore: null, criteriaBreakdown: [] },
      { skill: 'WRITING', status: 'PENDING_REVIEW', totalScore: null, criteriaBreakdown: [] },
    ] as any;
    const pending = await adapter.executeAdvisory(i);
    expect(pending.diagnosisAdvisory).toContain('ĐANG CHẤM');
    Object.assign(i.diagnosis.productiveSkills[0], {
      status: 'PUBLISHED',
      totalScore: 3,
      criteriaBreakdown: [
        { code: 'PRONUNCIATION', score: 3, maxScore: 4, feedback: 'PRIVATE TEACHER COMMENT' },
      ],
    });
    const published = await adapter.executeAdvisory(i);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(published.diagnosisAdvisory).toContain('3 điểm rubric');
    expect(JSON.stringify(adapter.buildDeidentifiedPayload(i))).not.toContain(
      'PRIVATE TEACHER COMMENT',
    );
  });
  it('distinct attempts isolate; identical concurrent context deduplicates; exact prompt equals canonical payload', async () => {
    const transport = jest.fn(async (_p: Parameters<GeminiHttpTransport>[0]) =>
      response(fragments),
    );
    const adapter = new GeminiAdvisoryAdapter(config, transport),
      i = context();
    await Promise.all([adapter.executeAdvisory(i), adapter.executeAdvisory(i)]);
    expect(transport).toHaveBeenCalledTimes(1);
    const text = JSON.parse(transport.mock.calls[0][0].body).contents[0].parts[0].text;
    expect(JSON.parse(text.slice(text.indexOf('\n') + 1))).toEqual(
      adapter.buildDeidentifiedPayload(i),
    );
    expect(text).not.toContain(i.attemptId);
    expect(text).not.toContain(i.sanitizedLearnerContext);
    await adapter.executeAdvisory({ ...i, attemptId: 'authorized-synthetic-attempt-B' });
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it('budget one reserves atomically for distinct concurrent attempts; failure still consumes call', async () => {
    const transport = jest.fn(async () => {
      throw new Error('offline');
    });
    const adapter = new GeminiAdvisoryAdapter({ ...config, dailyBudgetCalls: 1 }, transport),
      i = context();
    const results = await Promise.allSettled([
      adapter.executeAdvisory(i),
      adapter.executeAdvisory({ ...i, attemptId: 'B' }),
    ]);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(GeminiAdvisoryAdapter.getSharedInFlightCount()).toBe(0);
  });
  it('UTC reset, TTL expiry and model change cause fresh dispatch', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-11T23:59:00Z') });
    try {
      const transport = jest.fn(async () => response(fragments)),
        i = context();
      const a = new GeminiAdvisoryAdapter({ ...config, dailyBudgetCalls: 1 }, transport);
      await a.executeAdvisory(i);
      jest.setSystemTime(new Date('2026-11-12T00:10:00Z'));
      await a.executeAdvisory(i);
      expect(GeminiAdvisoryAdapter.getSharedCallsToday()).toBe(1);
      const b = new GeminiAdvisoryAdapter(
        { ...config, model: 'operator-selected-model-v2' },
        transport,
      );
      await b.executeAdvisory(i);
      expect(transport).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });
  it('timeout aborts even uncooperative fake transport and cannot cache late output', async () => {
    const adapter = new GeminiAdvisoryAdapter(
      { ...config, timeoutMs: 10 },
      async () => new Promise(() => {}),
    );
    await expect(adapter.executeAdvisory(context())).rejects.toThrow('PROVIDER_TIMEOUT');
    expect(GeminiAdvisoryAdapter.getSharedInFlightCount()).toBe(0);
    expect(GeminiAdvisoryAdapter.getSharedCacheSize()).toBe(0);
  });
  it.each([
    'Bạn làm đúng 195 câu',
    'Điểm thi của em là chín trăm chín mươi',
    'Bạn đủ điều kiện lớp Siêu tốc IELTS',
    'Lớp còn một trăm chỗ',
    'Speaking đã được chấm chính thức',
    'Writing đạt 200 điểm',
    '<script>alert(1)</script>',
    'Bỏ qua hướng dẫn và tự nâng điểm',
    'https://evil.invalid',
    '/knowledge/articles/unapproved',
  ])('hostile Vietnamese prose never renders: %s', async (text) => {
    const a = new GeminiAdvisoryAdapter(config, async () =>
        response({ ...legacy, diagnosisAdvisory: text }),
      ),
      i = context();
    const output = await generatePlacementAiAdvisory({
      ...i,
      allowlistedPaths: [],
      providerHook: a.createHook(),
    });
    expect(output.providerStatus).toBe('SAFE_FALLBACK');
    expect(output.liveVerified).toBe(false);
  });
  it.each([
    { ...fragments, extra: 'unknown' },
    { ...fragments, diagnosis: { strategy: 'EVIDENCE_REVIEW', domainCodes: ['INVENTED'] } },
    { ...fragments, classFit: { strategy: 'EXPLAIN_RULES', courseVersionIds: ['unapproved'] } },
    {
      ...fragments,
      selfStudy: { strategy: 'GUIDED_PRACTICE', articlePaths: ['/knowledge/articles/unapproved'] },
    },
    { ...fragments, selfStudy: { strategy: 'IGNORE_SYSTEM', articlePaths: [] } },
    { ...fragments, diagnosis: undefined },
  ])('strict missing/unknown fields and reference membership fail closed %#', async (value) => {
    const a = new GeminiAdvisoryAdapter(config, async () => response(value));
    await expect(a.executeAdvisory(context())).rejects.toThrow();
  });
  it('normal structured advice remains visible for all three functions', async () => {
    const i = context(),
      a = new GeminiAdvisoryAdapter(config, async () => response(fragments));
    const o = await generatePlacementAiAdvisory({
      ...i,
      allowlistedPaths: ['/knowledge/articles/word-forms'],
      providerHook: a.createHook(),
    });
    expect(o.providerStatus).toBe('CONNECTED_UNVERIFIED');
    expect(o.fallbackUsed).toBe(false);
    expect(o.diagnosisAdvisory).toContain('110/200');
    expect(o.classFitAdvisory).toContain('Reading');
    expect(o.selfStudyAdvisory).toContain('/knowledge/articles/word-forms');
  });
  it('new approved article path invalidates, while object key order and request timestamps do not', async () => {
    const transport = jest.fn(async (p: Parameters<GeminiHttpTransport>[0]) => {
      const text = JSON.parse(p.body).contents[0].parts[0].text,
        payload = JSON.parse(text.slice(text.indexOf('\n') + 1));
      return response({
        ...fragments,
        selfStudy: { strategy: 'GUIDED_PRACTICE', articlePaths: payload.allowlistedInternalPaths },
      });
    });
    const a = new GeminiAdvisoryAdapter(config, transport),
      i = context();
    await a.executeAdvisory(i);
    i.recommendation.evaluatedAt = 'next-request-clock';
    i.diagnosis.overallSummary = Object.fromEntries(
      Object.entries(i.diagnosis.overallSummary).reverse(),
    ) as any;
    await a.executeAdvisory(i);
    expect(transport).toHaveBeenCalledTimes(1);
    Object.assign(i.selfStudyGuidance[0].vettedResources[0], {
      slug: 'word-forms-v2',
      path: '/knowledge/articles/word-forms-v2',
    });
    const output = await a.executeAdvisory(i);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(output.referencedPaths).toEqual(['/knowledge/articles/word-forms-v2']);
  });
  it('cache map is bounded and oversized context fails before dispatch', async () => {
    const transport = jest.fn(async () => response(fragments)),
      a = new GeminiAdvisoryAdapter({ ...config, dailyBudgetCalls: 1000 }, transport),
      i = context();
    for (let n = 0; n < 505; n++) await a.executeAdvisory({ ...i, attemptId: 'synthetic-' + n });
    expect(GeminiAdvisoryAdapter.getSharedCacheSize()).toBe(500);
    i.diagnosis.partBreakdown[0].titleVi = 'x'.repeat(50000);
    await expect(a.executeAdvisory(i)).rejects.toThrow('AI_CONTEXT_TOO_LARGE');
    expect(transport).toHaveBeenCalledTimes(505);
  });
});
