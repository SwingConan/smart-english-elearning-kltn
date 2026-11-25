import {
  GeminiAdvisoryAdapter,
  defaultGoogleGeminiTransport,
  type GeminiHttpTransport,
} from './gemini-advisory-provider';
import {
  generatePlacementAiAdvisory,
  type AiAdvisoryCustomProviderInput,
  type PlacementStructuredDiagnosis,
  type PlacementStructuredRecommendation,
  type SelfStudyGuidanceItem,
} from './placement-diagnosis-advisory';

function buildMockAdvisoryInput(): {
  input: AiAdvisoryCustomProviderInput;
  allowlistedPaths: string[];
} {
  const diagnosis: PlacementStructuredDiagnosis = {
    snapshotVersion: 'WAVE05_DIAG_V1',
    sourceDigestRef: 'digest-7e3ba094548f',
    minSamplesThreshold: 3,
    overallSummary: {
      lrAnsweredCount: 200,
      lrTotalItems: 200,
      lrCorrectCount: 110,
      lrAccuracyPct: 55,
      listeningCorrect: 78,
      listeningSamples: 100,
      listeningAccuracyPct: 78,
      readingCorrect: 32,
      readingSamples: 100,
      readingAccuracyPct: 32,
      balanceState: 'LISTENING_STRONGER',
      balanceLabelVi: 'Năng lực Nghe vượt trội hơn Đọc hiểu',
      internalScaleDisclosureVi: 'Thang điểm nội bộ 0–200 câu đúng',
    },
    partBreakdown: [
      {
        part: 'P1',
        partNumber: 1,
        skill: 'LISTENING',
        titleVi: 'Part 1 — Hình ảnh',
        descriptionVi: 'Mô tả tranh',
        samples: 6,
        answered: 6,
        correct: 5,
        accuracyPct: 83,
        minSamplesRequired: 3,
        sufficiency: 'SUFFICIENT',
        statusLabel: 'Đạt yêu cầu',
        canClaimWeakness: false,
      },
      {
        part: 'P5',
        partNumber: 5,
        skill: 'READING',
        titleVi: 'Part 5 — Điền câu',
        descriptionVi: 'Ngữ pháp từ vựng',
        samples: 30,
        answered: 30,
        correct: 10,
        accuracyPct: 33,
        minSamplesRequired: 3,
        sufficiency: 'SUFFICIENT',
        statusLabel: 'Cần cải thiện',
        canClaimWeakness: true,
      },
    ],
    knowledgeBreakdown: [
      {
        domainCode: 'GRAMMAR_WORD_FORMS_CLAUSE',
        skill: 'READING',
        partScope: 'Part 5',
        titleVi: 'Từ loại và Cấu trúc Mệnh đề',
        descriptionVi: 'Nhận diện từ loại',
        samples: 15,
        answered: 15,
        correct: 4,
        accuracyPct: 27,
        minSamplesRequired: 3,
        sufficiency: 'SUFFICIENT',
        statusLabel: 'Yếu',
        canClaimWeakness: true,
        observedTopicTags: ['word-forms', 'clauses'],
        linkedArticleSlugs: ['toeic-part5-word-forms'],
      },
    ],
    difficultyBreakdown: [],
    productiveSkills: [],
    strengths: [
      {
        rank: 1,
        kind: 'STRENGTH',
        domainCode: 'LISTENING_VISUAL_ACTION',
        partScope: 'Part 1',
        skill: 'LISTENING',
        titleVi: 'Nhận diện hành động tranh',
        correct: 5,
        samples: 6,
        accuracyPct: 83,
        evidenceBadge: 'Đạt 83%',
        pedagogicalSummary: 'Phản xạ tốt với hình ảnh',
        actionableStep: 'Duy trì luyện nghe hàng ngày',
      },
    ],
    improvements: [
      {
        rank: 1,
        kind: 'IMPROVEMENT_PRIORITY',
        domainCode: 'GRAMMAR_WORD_FORMS_CLAUSE',
        partScope: 'Part 5',
        skill: 'READING',
        titleVi: 'Từ loại và Cấu trúc Mệnh đề',
        correct: 4,
        samples: 15,
        accuracyPct: 27,
        evidenceBadge: 'Đạt 27%',
        pedagogicalSummary: 'Hay nhầm đuôi danh từ/tính từ',
        actionableStep: 'Học lại bảng hậu tố từ loại',
      },
    ],
    lowSampleNotes: [],
    limitations: [],
  };

  const recommendation: PlacementStructuredRecommendation = {
    recommendationVersion: 'WAVE05_REC_V1',
    policyId: 'policy-crit-v1',
    policyDigestRef: 'digest-crit-v1',
    evaluatedAt: new Date().toISOString(),
    overallStatus: 'MATCHED_OPEN_CLASS',
    overallStatusLabelVi: 'Đã khớp lớp mở phù hợp',
    overallSummaryVi: 'Khớp khóa học TOEIC Reading 550+',
    courseEvaluations: [
      {
        courseVersionId: 'ver-read-550',
        courseId: 'course-read-550',
        courseTitle: 'TOEIC Reading Strategies & Grammar 550+',
        courseSlug: 'toeic-reading-550',
        level: 'INTERMEDIATE',
        skillScope: 'READING',
        status: 'RECOMMENDED_PRIORITY',
        statusBadgeVi: 'Ưu tiên số 1',
        priorityRank: 1,
        fitSummaryVi: 'Khớp hoàn toàn với năng lực đọc 32%',
        ruleTraces: [],
        openClassCount: 1,
        unavailableClassCount: 0,
      },
    ],
    availableClasses: [],
    unavailableClasses: [],
  };

  const selfStudyGuidance: SelfStudyGuidanceItem[] = [
    {
      domainCode: 'GRAMMAR_WORD_FORMS_CLAUSE',
      partScope: 'Part 5',
      skill: 'READING',
      topicTitleVi: 'Từ loại và Cấu trúc Mệnh đề',
      observedEvidence: 'Đạt 4/15 câu (27%)',
      focusSummaryVi: 'Cần ôn tập bảng nhận diện từ loại',
      searchKeywords: ['word forms', 'noun suffixes'],
      resourceStatus: 'VETTED_AVAILABLE',
      resourceStatusLabel: 'Có học liệu kiểm chứng',
      vettedResources: [
        {
          slug: 'toeic-part5-word-forms',
          title: 'Hệ thống Từ loại TOEIC Part 5',
          path: '/knowledge/articles/toeic-part5-word-forms',
          kind: 'KNOWLEDGE_ARTICLE',
          verifiedSource: 'Smart English Academic V2',
        },
      ],
    },
  ];

  const allowlistedPaths = ['/knowledge/articles/toeic-part5-word-forms'];

  return {
    input: {
      diagnosis,
      recommendation,
      selfStudyGuidance,
      sanitizedLearnerContext: 'Em muốn cải thiện kỹ năng đọc Part 5.',
    },
    allowlistedPaths,
  };
}

function makeGeminiSuccessResponse(candidateJson: Record<string, any>) {
  return {
    status: 200,
    ok: true,
    data: {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify(candidateJson),
              },
            ],
          },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: {
        promptTokenCount: 300,
        candidatesTokenCount: 150,
        totalTokenCount: 450,
      },
    },
  };
}

describe('Gemini AI Advisory Provider Adapter (Offline & Mock Verification)', () => {
  it('operator emergency stop blocks cached advice without another dispatch', async () => {
    let enabled = true;
    const transport = jest.fn(async () => makeGeminiSuccessResponse({
      schemaVersion: 'BR136_V1',
      diagnosis: { strategy: 'EVIDENCE_REVIEW', domainCodes: [] },
      classFit: { strategy: 'EXPLAIN_RULES', courseVersionIds: [] },
      selfStudy: { strategy: 'GUIDED_PRACTICE', articlePaths: [] },
    }));
    const adapter = new GeminiAdvisoryAdapter({ provider: 'GEMINI', apiKey: 'OFFLINE_FAKE_KEY',
      stagingEnabled: true, dailyBudgetCalls: 2, operationGuard: () => {
        if (!enabled) throw Error('OPERATOR_AI_DISABLED');
      } }, transport);
    const { input } = buildMockAdvisoryInput();
    await adapter.executeAdvisory(input, 'operator-stop-cache-test');
    enabled = false;
    await expect(adapter.executeAdvisory(input, 'operator-stop-cache-test')).rejects.toThrow('OPERATOR_AI_DISABLED');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  beforeEach(() => {
    GeminiAdvisoryAdapter.resetSharedState();
  });

  it('1. Default Zero-Key Mode (provider NONE): zero network calls, returns NOT_CONFIGURED deterministic output', async () => {
    const transportCalls: any[] = [];
    const mockTransport: GeminiHttpTransport = async (params) => {
      transportCalls.push(params);
      return makeGeminiSuccessResponse({});
    };

    const adapter = new GeminiAdvisoryAdapter(
      {
        provider: 'NONE',
        apiKey: undefined,
        dailyBudgetCalls: 0,
        stagingEnabled: false,
      },
      mockTransport,
    );

    const { input, allowlistedPaths } = buildMockAdvisoryInput();
    const result = await generatePlacementAiAdvisory({
      diagnosis: input.diagnosis,
      recommendation: input.recommendation,
      selfStudyGuidance: input.selfStudyGuidance,
      allowlistedPaths,
      providerHook: adapter.createHook(),
    });

    expect(transportCalls).toHaveLength(0);
    expect(result.providerStatus).toBe('SAFE_FALLBACK'); // Hook throws PROVIDER_DISABLED -> falls back safely
    expect(result.fallbackReason).toBe('AI_PROVIDER_ERROR');
    expect(result.diagnosisAdvisory).toContain('Tổng kết Nghe – Đọc');
  });

  it('2. Missing API key or disabled staging gate: refuses outbound calls, falls back safely', async () => {
    const transportCalls: any[] = [];
    const mockTransport: GeminiHttpTransport = async (params) => {
      transportCalls.push(params);
      return makeGeminiSuccessResponse({});
    };

    // Staging disabled
    const adapter1 = new GeminiAdvisoryAdapter(
      {
        provider: 'GEMINI',
        apiKey: 'fake-key-for-test',
        dailyBudgetCalls: 10,
        stagingEnabled: false,
      },
      mockTransport,
    );

    const { input, allowlistedPaths } = buildMockAdvisoryInput();
    const result1 = await generatePlacementAiAdvisory({
      diagnosis: input.diagnosis,
      recommendation: input.recommendation,
      selfStudyGuidance: input.selfStudyGuidance,
      allowlistedPaths,
      providerHook: adapter1.createHook(),
    });
    expect(transportCalls).toHaveLength(0);
    expect(result1.providerStatus).toBe('SAFE_FALLBACK');

    // Missing key
    const adapter2 = new GeminiAdvisoryAdapter(
      {
        provider: 'GEMINI',
        apiKey: '',
        dailyBudgetCalls: 10,
        stagingEnabled: true,
      },
      mockTransport,
    );
    const result2 = await generatePlacementAiAdvisory({
      diagnosis: input.diagnosis,
      recommendation: input.recommendation,
      selfStudyGuidance: input.selfStudyGuidance,
      allowlistedPaths,
      providerHook: adapter2.createHook(),
    });
    expect(transportCalls).toHaveLength(0);
    expect(result2.providerStatus).toBe('SAFE_FALLBACK');
  });

  it('3. Valid Mocked Gemini Response: validates schema, checks immutability, returns CONNECTED_UNVERIFIED', async () => {
    let capturedRequest: any = null;
    const mockTransport: GeminiHttpTransport = async (params) => {
      capturedRequest = params;
      return makeGeminiSuccessResponse({
        schemaVersion: 'BR136_V1',
        diagnosis: { strategy: 'EVIDENCE_REVIEW', domainCodes: [] },
        classFit: { strategy: 'EXPLAIN_RULES', courseVersionIds: [] },
        selfStudy: { strategy: 'GUIDED_PRACTICE', articlePaths: [] },
      });
    };

    const adapter = new GeminiAdvisoryAdapter(
      {
        provider: 'GEMINI',
        apiKey: 'fake-test-key-mock',
        model: 'gemini-2.5-flash',
        dailyBudgetCalls: 10,
        stagingEnabled: true,
        liveVerified: false,
      },
      mockTransport,
    );

    const { input, allowlistedPaths } = buildMockAdvisoryInput();
    const result = await generatePlacementAiAdvisory({
      diagnosis: input.diagnosis,
      recommendation: input.recommendation,
      selfStudyGuidance: input.selfStudyGuidance,
      allowlistedPaths,
      providerHook: adapter.createHook(),
    });

    expect(result.providerStatus).toBe('CONNECTED_UNVERIFIED');
    expect(result.liveVerified).toBe(false);
    expect(result.fallbackUsed).toBe(false);
    expect(result.modeBadge).toContain('AI hỗ trợ giải thích');
    expect(result.diagnosisAdvisory).toContain('110/200');
    expect(result.safetyChecks.schemaValidated).toBe(true);
    expect(result.safetyChecks.scoreImmutabilityVerified).toBe(true);
    expect(result.safetyChecks.urlAllowlistVerified).toBe(true);

    // Verify request endpoint and headers
    expect(capturedRequest.endpoint).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    );
    expect(capturedRequest.headers['x-goog-api-key']).toBe('fake-test-key-mock');
  });

  it('uses the documented 2.5 migration target without deprecated sampling parameters', async () => {
    let capturedRequest: any;
    const adapter = new GeminiAdvisoryAdapter(
      {
        provider: 'GEMINI',
        apiKey: 'offline-migration-test-key',
        model: 'gemini-3.5-flash-lite',
        dailyBudgetCalls: 1,
        stagingEnabled: true,
        liveVerified: false,
      },
      async (params) => {
        capturedRequest = params;
        return makeGeminiSuccessResponse({
          schemaVersion: 'BR136_V1',
          diagnosis: { strategy: 'EVIDENCE_REVIEW', domainCodes: [] },
          classFit: { strategy: 'EXPLAIN_RULES', courseVersionIds: [] },
          selfStudy: { strategy: 'GUIDED_PRACTICE', articlePaths: [] },
        });
      },
    );
    const { input, allowlistedPaths } = buildMockAdvisoryInput();
    const result = await generatePlacementAiAdvisory({
      ...input,
      allowlistedPaths,
      providerHook: adapter.createHook(),
    });
    expect(result.providerStatus).toBe('CONNECTED_UNVERIFIED');
    expect(result.fallbackUsed).toBe(false);
    expect(capturedRequest.endpoint).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
    );
    const generation = JSON.parse(capturedRequest.body).generationConfig;
    expect(generation).not.toHaveProperty('temperature');
    expect(generation).not.toHaveProperty('topP');
    expect(generation).not.toHaveProperty('topK');
    expect(generation.responseMimeType).toBe('application/json');
    expect(generation.responseJsonSchema).toBeDefined();
    expect(generation.maxOutputTokens).toBe(1024);
    expect(result.safetyChecks.schemaValidated).toBe(true);
    expect(result.liveVerified).toBe(false);
  });

  it('4. Minimal De-identified Payload: verifies NO student PII, NO audio, NO answer keys sent in request', async () => {
    let capturedBodyText = '';
    const mockTransport: GeminiHttpTransport = async (params) => {
      capturedBodyText = params.body;
      return makeGeminiSuccessResponse({
        schemaVersion: 'BR136_V1',
        diagnosis: { strategy: 'EVIDENCE_REVIEW', domainCodes: [] },
        classFit: { strategy: 'EXPLAIN_RULES', courseVersionIds: [] },
        selfStudy: { strategy: 'GUIDED_PRACTICE', articlePaths: [] },
      });
    };

    const adapter = new GeminiAdvisoryAdapter(
      {
        provider: 'GEMINI',
        apiKey: 'fake-test-key-mock',
        dailyBudgetCalls: 10,
        stagingEnabled: true,
      },
      mockTransport,
    );

    const { input, allowlistedPaths } = buildMockAdvisoryInput();
    await generatePlacementAiAdvisory({
      diagnosis: input.diagnosis,
      recommendation: input.recommendation,
      selfStudyGuidance: input.selfStudyGuidance,
      allowlistedPaths,
      providerHook: adapter.createHook(),
    });

    expect(capturedBodyText).toBeTruthy();
    // PII check
    expect(capturedBodyText).not.toContain('fullName');
    expect(capturedBodyText).not.toContain('email');
    expect(capturedBodyText).not.toContain('phoneNumber');
    expect(capturedBodyText).not.toContain('selectedOptionId');
    expect(capturedBodyText).not.toContain('correctKey');
    expect(capturedBodyText).not.toContain('audioBlob');
  });

  it('5. Invalid JSON or Malformed Schema from Gemini: triggers SAFE_FALLBACK', async () => {
    const mockTransport: GeminiHttpTransport = async () => ({
      status: 200,
      ok: true,
      data: {
        candidates: [
          {
            content: {
              parts: [{ text: 'Đây không phải JSON hợp lệ!' }],
            },
          },
        ],
      },
    });

    const adapter = new GeminiAdvisoryAdapter(
      {
        provider: 'GEMINI',
        apiKey: 'fake-test-key-mock',
        dailyBudgetCalls: 10,
        stagingEnabled: true,
      },
      mockTransport,
    );

    const { input, allowlistedPaths } = buildMockAdvisoryInput();
    const result = await generatePlacementAiAdvisory({
      diagnosis: input.diagnosis,
      recommendation: input.recommendation,
      selfStudyGuidance: input.selfStudyGuidance,
      allowlistedPaths,
      providerHook: adapter.createHook(),
    });

    expect(result.providerStatus).toBe('SAFE_FALLBACK');
    expect(result.fallbackReason).toBe('INVALID_AI_OUTPUT_SCHEMA');
    expect(result.diagnosisAdvisory).toContain('Tổng kết Nghe – Đọc');
  });

  it('6. Rate Limit (HTTP 429) & Server Error (HTTP 500): triggers SAFE_FALLBACK with 0 retries', async () => {
    let callCount = 0;
    const mockTransport429: GeminiHttpTransport = async () => {
      callCount++;
      return { status: 429, ok: false, data: { error: 'Resource exhausted' } };
    };

    const adapter = new GeminiAdvisoryAdapter(
      {
        provider: 'GEMINI',
        apiKey: 'fake-test-key-mock',
        dailyBudgetCalls: 10,
        stagingEnabled: true,
      },
      mockTransport429,
    );

    const { input, allowlistedPaths } = buildMockAdvisoryInput();
    const result = await generatePlacementAiAdvisory({
      diagnosis: input.diagnosis,
      recommendation: input.recommendation,
      selfStudyGuidance: input.selfStudyGuidance,
      allowlistedPaths,
      providerHook: adapter.createHook(),
    });

    expect(callCount).toBe(1); // Exact 1 call, zero retry
    expect(result.providerStatus).toBe('SAFE_FALLBACK');
    expect(result.fallbackReason).toBe('PROVIDER_RATE_LIMITED_429');
  });

  it('7. Timeout (AbortController): triggers SAFE_FALLBACK when response exceeds timeoutMs', async () => {
    const mockTransportDelayed: GeminiHttpTransport = async ({ signal }) => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve(
            makeGeminiSuccessResponse({
              diagnosisAdvisory: 'Too late',
              classFitAdvisory: 'Too late',
              selfStudyAdvisory: 'Too late',
            }),
          );
        }, 300);

        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    };

    const adapter = new GeminiAdvisoryAdapter(
      {
        provider: 'GEMINI',
        apiKey: 'fake-test-key-mock',
        timeoutMs: 50, // 50ms timeout
        dailyBudgetCalls: 10,
        stagingEnabled: true,
      },
      mockTransportDelayed,
    );

    const { input, allowlistedPaths } = buildMockAdvisoryInput();
    const result = await generatePlacementAiAdvisory({
      diagnosis: input.diagnosis,
      recommendation: input.recommendation,
      selfStudyGuidance: input.selfStudyGuidance,
      allowlistedPaths,
      providerHook: adapter.createHook(),
      timeoutMs: 50,
    });

    expect(result.providerStatus).toBe('SAFE_FALLBACK');
  });

  it('8. Hallucinated External URL: rejected and falls back safely', async () => {
    const mockTransport: GeminiHttpTransport = async () =>
      makeGeminiSuccessResponse({
        diagnosisAdvisory: 'Nhận xét bình thường.',
        classFitAdvisory: 'Lớp học phù hợp.',
        selfStudyAdvisory: 'Xem tài liệu tại https://external-unverified-blog.com/tips.',
      });

    const adapter = new GeminiAdvisoryAdapter(
      {
        provider: 'GEMINI',
        apiKey: 'fake-test-key-mock',
        dailyBudgetCalls: 10,
        stagingEnabled: true,
      },
      mockTransport,
    );

    const { input, allowlistedPaths } = buildMockAdvisoryInput();
    const result = await generatePlacementAiAdvisory({
      diagnosis: input.diagnosis,
      recommendation: input.recommendation,
      selfStudyGuidance: input.selfStudyGuidance,
      allowlistedPaths,
      providerHook: adapter.createHook(),
    });

    expect(result.providerStatus).toBe('SAFE_FALLBACK');
    expect(result.fallbackReason).toBe('UNVERIFIED_EXTERNAL_URL_BLOCKED');
  });

  it('9. Score Mutation or Forbidden Claims: rejected and falls back safely', async () => {
    // Attempting to mutate score
    const mockTransportScoreMutation: GeminiHttpTransport = async () =>
      makeGeminiSuccessResponse({
        diagnosisAdvisory: 'Bạn đã đạt điểm tối đa.',
        classFitAdvisory: 'Lớp phù hợp.',
        selfStudyAdvisory: 'Tự học tốt.',
        claimedCorrectCount: 199, // Actual is 110!
      });

    const adapter1 = new GeminiAdvisoryAdapter(
      {
        provider: 'GEMINI',
        apiKey: 'fake-test-key-mock',
        dailyBudgetCalls: 10,
        stagingEnabled: true,
      },
      mockTransportScoreMutation,
    );

    const { input, allowlistedPaths } = buildMockAdvisoryInput();
    const result1 = await generatePlacementAiAdvisory({
      diagnosis: input.diagnosis,
      recommendation: input.recommendation,
      selfStudyGuidance: input.selfStudyGuidance,
      allowlistedPaths,
      providerHook: adapter1.createHook(),
    });

    expect(result1.providerStatus).toBe('SAFE_FALLBACK');
    expect(result1.fallbackReason).toBe('SCORE_OR_ELIGIBILITY_MUTATION_BLOCKED');

    // Attempting fake ETS claim
    const mockTransportEtsClaim: GeminiHttpTransport = async () =>
      makeGeminiSuccessResponse({
        diagnosisAdvisory: 'Chúc mừng bạn đạt Điểm TOEIC chính thức: 850.',
        classFitAdvisory: 'Lớp phù hợp.',
        selfStudyAdvisory: 'Tự học tốt.',
      });

    const adapter2 = new GeminiAdvisoryAdapter(
      {
        provider: 'GEMINI',
        apiKey: 'fake-test-key-mock',
        dailyBudgetCalls: 10,
        stagingEnabled: true,
      },
      mockTransportEtsClaim,
    );

    const result2 = await generatePlacementAiAdvisory({
      diagnosis: input.diagnosis,
      recommendation: input.recommendation,
      selfStudyGuidance: input.selfStudyGuidance,
      allowlistedPaths,
      providerHook: adapter2.createHook(),
    });

    expect(result2.providerStatus).toBe('SAFE_FALLBACK');
    expect(result2.fallbackReason).toBe('SCORE_OR_ELIGIBILITY_MUTATION_BLOCKED');
  });

  it('10. In-Memory Deduplication Cache: second identical call returns cached result without hitting transport', async () => {
    let transportInvocationCount = 0;
    const mockTransport: GeminiHttpTransport = async () => {
      transportInvocationCount++;
      return makeGeminiSuccessResponse({
        schemaVersion: 'BR136_V1',
        diagnosis: { strategy: 'EVIDENCE_REVIEW', domainCodes: [] },
        classFit: { strategy: 'EXPLAIN_RULES', courseVersionIds: [] },
        selfStudy: { strategy: 'GUIDED_PRACTICE', articlePaths: [] },
      });
    };

    const adapter = new GeminiAdvisoryAdapter(
      {
        provider: 'GEMINI',
        apiKey: 'fake-test-key-mock',
        dailyBudgetCalls: 10,
        stagingEnabled: true,
      },
      mockTransport,
    );

    const { input } = buildMockAdvisoryInput();

    // Call 1
    const res1 = await adapter.executeAdvisory(input, 'attempt-unique-123');
    expect(transportInvocationCount).toBe(1);
    expect(res1.diagnosisAdvisory).toContain('110/200');

    // Call 2 with identical attemptId
    const res2 = await adapter.executeAdvisory(input, 'attempt-unique-123');
    expect(transportInvocationCount).toBe(1); // Cached, no second transport call!
    expect(res2.diagnosisAdvisory).toContain('110/200');
  });

  it('11. Daily Budget Enforcement: stops network calls after dailyBudgetCalls reached', async () => {
    let transportCalls = 0;
    const mockTransport: GeminiHttpTransport = async () => {
      transportCalls++;
      return makeGeminiSuccessResponse({
        schemaVersion: 'BR136_V1',
        diagnosis: { strategy: 'EVIDENCE_REVIEW', domainCodes: [] },
        classFit: { strategy: 'EXPLAIN_RULES', courseVersionIds: [] },
        selfStudy: { strategy: 'GUIDED_PRACTICE', articlePaths: [] },
      });
    };

    const adapter = new GeminiAdvisoryAdapter(
      {
        provider: 'GEMINI',
        apiKey: 'fake-test-key-mock',
        dailyBudgetCalls: 2, // Budget = 2
        stagingEnabled: true,
      },
      mockTransport,
    );

    const { input } = buildMockAdvisoryInput();

    // Call 1
    await adapter.executeAdvisory(input, 'attempt-1');
    expect(transportCalls).toBe(1);

    // Call 2
    await adapter.executeAdvisory(input, 'attempt-2');
    expect(transportCalls).toBe(2);

    // Call 3: Exceeds budget!
    await expect(adapter.executeAdvisory(input, 'attempt-3')).rejects.toThrow(
      'DAILY_BUDGET_EXCEEDED',
    );
    expect(transportCalls).toBe(2); // Transport was NOT called a 3rd time
  });

  it('12. Security Guards: default transport rejects non-Google endpoints (SSRF) and blocks unmocked test calls', async () => {
    // SSRF guard
    await expect(
      defaultGoogleGeminiTransport({
        endpoint: 'https://evil-server.example.com/api',
        headers: {},
        body: '{}',
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('SSRF_GUARD_REJECTED_NON_GOOGLE_ENDPOINT');

    // Test environment outbound deny guard
    await expect(
      defaultGoogleGeminiTransport({
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/test:generateContent',
        headers: {},
        body: '{}',
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('TEST_ENVIRONMENT_OUTBOUND_BLOCKED');
  });
});
