import { NotFoundException } from '@nestjs/common';
import { PlacementWorkflowService } from './workflow.service';
import { GeminiAdvisoryAdapter, type GeminiHttpTransport } from './gemini-advisory-provider';
import { quizDigest } from '../class-lms/quiz.service';
import type { AuthorityActor } from '../authorization/authorization.service';

function createMockPrismaService(state: {
  attempts: Map<string, any>;
  evaluations: Map<string, any[]>;
  knowledgeEntries: any[];
  courseVersions: any[];
  criteriaPolicy?: any;
}) {
  const mockTx: any = {
    $queryRaw: jest.fn().mockImplementation(async () => [
      {
        db: 'v2_wave01_dev_test_w04b_local',
        usr: 'wave01',
        dir: '.local-storage/v2-wave01/postgres',
        schema: 'public',
        marker: 'SMART_ENGLISH_DISPOSABLE_E2E_V1',
        port: 55401,
        host: '127.0.0.1',
      },
    ]),
    user: {
      findUniqueOrThrow: jest.fn().mockImplementation(async ({ where }) => {
        return { id: where.id, email: `${where.id}@example.invalid`, role: 'STUDENT' };
      }),
    },
    testAttempt: {
      findFirst: jest.fn().mockImplementation(async ({ where }) => {
        const a = state.attempts.get(where.id);
        if (!a) return null;
        if (where.learnerId && a.learnerId !== where.learnerId) return null;
        return a;
      }),
    },
    placementHumanEvaluation: {
      findMany: jest.fn().mockImplementation(async ({ where }) => {
        return state.evaluations.get(where.attemptId) || [];
      }),
    },
    testQuestion: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    placementWorkflowPolicy: {
      findFirst: jest.fn().mockImplementation(async () => {
        return state.criteriaPolicy || null;
      }),
    },
    classOffering: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    courseVersion: {
      findMany: jest.fn().mockImplementation(async () => state.courseVersions || []),
    },
    knowledgeEntry: {
      findMany: jest.fn().mockImplementation(async () => state.knowledgeEntries || []),
    },
  };

  const mockDb: any = {
    $transaction: jest.fn().mockImplementation(async (callback: any) => {
      return await callback(mockTx);
    }),
  };

  return { mockDb, mockTx };
}

describe('PlacementWorkflowService.diagnostic() Real Entrypoint & Per-Attempt Isolation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.W04B_ENABLED = 'DEV_WORKFLOW';
    process.env.W04B_DIAGNOSTICS = 'DEV_TRACE';
    process.env.E2E_DATABASE_URL =
      'postgresql://wave01:dummy@127.0.0.1:55401/v2_wave01_dev_test_w04b_local';
    process.env.DATABASE_URL = process.env.E2E_DATABASE_URL;
    process.env.W04B_ALLOW_PRODUCTION_RELEASE = 'true';
    process.env.PLACEMENT_AI_ADVISORY_PROVIDER = 'GEMINI';
    process.env.PLACEMENT_AI_ADVISORY_STAGING_ENABLED = 'true';
    process.env.GEMINI_API_KEY = 'mock-test-secret-key';
    process.env.PLACEMENT_AI_ADVISORY_DAILY_BUDGET_CALLS = '10';

    GeminiAdvisoryAdapter.resetSharedState();
    PlacementWorkflowService.resetSharedAdapter();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    GeminiAdvisoryAdapter.resetSharedState();
    PlacementWorkflowService.resetSharedAdapter();
  });

  it('PRE-FIX REGRESSION TEST (A): Two distinct attempts with SAME sourceDigestRef must NOT share cached advice', async () => {
    let transportCalls = 0;
    const mockTransport: GeminiHttpTransport = async (params) => {
      transportCalls++;
      return {
        status: 200,
        ok: true,
        data: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      schemaVersion: 'BR136_V1',
                      diagnosis: { strategy: 'EVIDENCE_REVIEW', domainCodes: [] },
                      classFit: { strategy: 'EXPLAIN_RULES', courseVersionIds: [] },
                      selfStudy: { strategy: 'GUIDED_PRACTICE', articlePaths: [] },
                    }),
                  },
                ],
              },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 150, totalTokenCount: 450 },
        },
      };
    };

    GeminiAdvisoryAdapter.getSharedInstance(
      {
        provider: 'GEMINI',
        stagingEnabled: true,
        apiKey: 'mock-key',
        dailyBudgetCalls: 10,
      },
      mockTransport,
    );

    const timingBody = { tasks: [] };
    const timingDigest = quizDigest(timingBody);

    const snapshot = {
      testId: 'test-form-1',
      allQuestionIds: ['q1'],
      mode: 'LR' as const,
      title: 'Placement LR Test',
      groups: [
        {
          id: 'g-lr',
          skill: 'LISTENING',
          taskCode: 'P1',
          title: 'Part 1 Photographs',
          instructions: 'Listen and choose',
          stimulusText: null,
          audioUrl: null,
          preparationSeconds: null,
          responseSeconds: null,
          recommendedSeconds: null,
          maxRecordingSeconds: null,
          stimuli: [],
          questions: [
            {
              id: 'q1',
              orderIndex: 1,
              points: 1,
              questionId: 'qid-1',
              content: 'What is shown in the image?',
              responseType: 'SINGLE_CHOICE',
              skill: 'LISTENING',
              explanation: null,
              options: [
                { id: 'opt-1', content: 'A', orderIndex: 1, isCorrect: true },
                { id: 'opt-2', content: 'B', orderIndex: 2, isCorrect: false },
              ],
            },
          ],
        },
      ],
    };

    const criteriaBody = {
      evidence: 'Vetted criteria',
      rules: [
        {
          skill: 'READING',
          scale: 'INTERNAL_RAW_COUNT',
          minSamples: 1,
          min: 10,
          max: 100,
          courseVersionIds: ['ver-read-550'],
          priorityRank: 1,
        },
      ],
    };

    const state = {
      attempts: new Map<string, any>([
        [
          'attempt-A',
          {
            id: 'attempt-A',
            learnerId: 'student-A',
            placementVersionId: 'ver-src-common',
            placementSitting: {
              policy: {
                approvedAt: new Date('2026-11-01T00:00:00.000Z'),
                body: timingBody,
                digest: timingDigest,
                sourceId: 'ver-src-common',
              },
            },
            answers: [
              {
                testQuestionId: 'q1',
                selectedOptionIds: ['opt-1'],
                textResponse: 'Mục tiêu học viên A: cải thiện Nghe',
              },
            ],
          },
        ],
        [
          'attempt-B',
          {
            id: 'attempt-B',
            learnerId: 'student-B',
            placementVersionId: 'ver-src-common',
            placementSitting: {
              policy: {
                approvedAt: new Date('2026-11-01T00:00:00.000Z'),
                body: timingBody,
                digest: timingDigest,
                sourceId: 'ver-src-common',
              },
            },
            answers: [
              {
                testQuestionId: 'q1',
                selectedOptionIds: ['opt-1'],
                textResponse: 'Mục tiêu học viên B: cải thiện Đọc',
              },
            ],
          },
        ],
      ]),
      evaluations: new Map<string, any[]>([
        [
          'attempt-A',
          [
            {
              id: 'eval-lr-A',
              skill: 'LR',
              release: { id: 'rel-A', reason: 'Release A' },
              body: {
                parts: [
                  { skill: 'LISTENING', part: 'P1', samples: 100, correct: 70 },
                  { skill: 'READING', part: 'P5', samples: 100, correct: 40 },
                ],
              },
            },
          ],
        ],
        [
          'attempt-B',
          [
            {
              id: 'eval-lr-B',
              skill: 'LR',
              release: { id: 'rel-B', reason: 'Release B' },
              body: {
                parts: [
                  { skill: 'LISTENING', part: 'P1', samples: 100, correct: 70 },
                  { skill: 'READING', part: 'P5', samples: 100, correct: 40 },
                ],
              },
            },
            // Student B has a PUBLISHED Speaking evaluation, whereas Student A does NOT!
            {
              id: 'eval-spk-B',
              skill: 'SPEAKING',
              release: { id: 'rel-spk-B', reason: 'Graded speaking' },
              body: {
                total: 3.5,
                samples: 11,
                scale: 'INTERNAL_RUBRIC_4',
              },
            },
          ],
        ],
      ]),
      courseVersions: [
        {
          id: 'ver-read-550',
          title: 'TOEIC Reading 550+',
          course: { slug: 'toeic-reading-550' },
          offerings: [],
        },
      ],
      criteriaPolicy: {
        id: 'crit-1',
        kind: 'CRITERIA',
        mode: 'LR',
        approvedById: 'admin-1',
        digest: quizDigest(criteriaBody),
        approvedAt: new Date(),
        body: criteriaBody,
      },
      knowledgeEntries: [
        {
          slug: 'toeic-part5-word-forms',
          publishedRevision: {
            title: 'Từ loại Part 5',
            skills: ['READING'],
            part: 'Part 5',
          },
        },
      ],
    };

    const { mockDb } = createMockPrismaService(state);
    const mockLms: any = {
      context: jest.fn().mockImplementation(async (tx, actor) => ({
        id: actor.id,
        role: 'STUDENT',
        email: `${actor.id}@example.invalid`,
      })),
      now: jest.fn().mockResolvedValue(new Date('2026-11-11T10:00:00.000Z')),
    };
    const mockAuthority: any = { audit: jest.fn().mockResolvedValue(undefined) };
    const mockIntegration: any = {
      source: jest.fn().mockResolvedValue({
        id: 'ver-src-common',
        purpose: 'DEV_PREVIEW',
        provenance: { synthetic: true },
        sourceHash: 'hash-common-snapshot-digest', // Same snapshot digest for both attempts!
        mode: 'LR',
        testId: 'test-form-1',
        version: '1.0.0',
        s: snapshot,
      }),
    };
    const mockResponses: any = { put: jest.fn(), read: jest.fn() };
    const mockMedia: any = { read: jest.fn() };

    const workflowService = new PlacementWorkflowService(
      mockDb,
      mockLms,
      mockAuthority,
      mockIntegration,
      mockResponses,
      mockMedia,
    );

    const actorA: AuthorityActor = { id: 'student-A', sessionId: 'sess-A' };
    const actorB: AuthorityActor = { id: 'student-B', sessionId: 'sess-B' };

    // Student A diagnostic call
    const resA = await workflowService.diagnostic(actorA, 'attempt-A');
    expect(resA.attemptId).toBe('attempt-A');
    expect(transportCalls).toBe(1);

    // Student B diagnostic call (different attempt, different productive skill!)
    const resB = await workflowService.diagnostic(actorB, 'attempt-B');
    expect(resB.attemptId).toBe('attempt-B');

    // REQUIRED BEHAVIOR: Both students must NOT share cache. Transport calls MUST be 2!
    expect(transportCalls).toBe(2);
    expect((resA as any).aiAdvisory?.providerStatus).toBe('CONNECTED_UNVERIFIED');
    expect((resB as any).aiAdvisory?.providerStatus).toBe('CONNECTED_UNVERIFIED');
  });

  it('PRE-FIX REGRESSION TEST (B): Student B accessing Student A attempt must 404/403 with 0 transport calls', async () => {
    let transportCalls = 0;
    const mockTransport: GeminiHttpTransport = async () => {
      transportCalls++;
      return { status: 200, ok: true, data: {} };
    };

    GeminiAdvisoryAdapter.getSharedInstance(
      { provider: 'GEMINI', stagingEnabled: true, apiKey: 'mock-key', dailyBudgetCalls: 10 },
      mockTransport,
    );

    const timingBody = { tasks: [] };
    const state = {
      attempts: new Map<string, any>([
        [
          'attempt-A',
          {
            id: 'attempt-A',
            learnerId: 'student-A',
            placementVersionId: 'ver-src-1',
            placementSitting: {
              policy: {
                approvedAt: new Date(),
                body: timingBody,
                digest: quizDigest(timingBody),
                sourceId: 'ver-src-1',
              },
            },
            answers: [],
          },
        ],
      ]),
      evaluations: new Map<string, any[]>(),
      courseVersions: [],
      knowledgeEntries: [],
    };

    const { mockDb } = createMockPrismaService(state);
    const mockLms: any = {
      context: jest.fn().mockImplementation(async (tx, actor) => ({
        id: actor.id,
        role: 'STUDENT',
        email: `${actor.id}@example.invalid`,
      })),
      now: jest.fn().mockResolvedValue(new Date()),
    };
    const mockAuthority: any = { audit: jest.fn() };
    const mockIntegration: any = { source: jest.fn() };
    const mockResponses: any = { put: jest.fn(), read: jest.fn() };
    const mockMedia: any = { read: jest.fn() };

    const workflowService = new PlacementWorkflowService(
      mockDb,
      mockLms,
      mockAuthority,
      mockIntegration,
      mockResponses,
      mockMedia,
    );

    const actorB: AuthorityActor = { id: 'student-B', sessionId: 'sess-B' };

    // Foreign actor Student B requests Student A's attempt
    await expect(workflowService.diagnostic(actorB, 'attempt-A')).rejects.toThrow(
      NotFoundException,
    );
    expect(transportCalls).toBe(0);
  });

  it('SEMANTIC DEFENSE (C): Fabricated LR score in free Vietnamese text triggers SAFE_FALLBACK', async () => {
    let transportCalls = 0;
    const mockTransport: GeminiHttpTransport = async () => {
      transportCalls++;
      return {
        status: 200,
        ok: true,
        data: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      diagnosisAdvisory: 'Chúc mừng bạn đã trả lời đúng 195/200 câu hỏi bài thi.',
                      classFitAdvisory: 'Khóa học phù hợp.',
                      selfStudyAdvisory: 'Lộ trình học tập.',
                      claimedEligibleCourseVersionIds: ['ver-read-550'],
                      referencedPaths: [],
                    }),
                  },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        },
      };
    };

    GeminiAdvisoryAdapter.getSharedInstance(
      { provider: 'GEMINI', stagingEnabled: true, apiKey: 'mock-key', dailyBudgetCalls: 10 },
      mockTransport,
    );

    const timingBody = { tasks: [] };
    const timingDigest = quizDigest(timingBody);
    const snapshot = {
      testId: 'test-form-1',
      allQuestionIds: ['q1'],
      mode: 'LR' as const,
      title: 'Placement LR Test',
      groups: [
        {
          id: 'g-lr',
          skill: 'LISTENING',
          taskCode: 'P1',
          title: 'Part 1',
          instructions: '',
          stimulusText: null,
          audioUrl: null,
          preparationSeconds: null,
          responseSeconds: null,
          recommendedSeconds: null,
          maxRecordingSeconds: null,
          stimuli: [],
          questions: [
            {
              id: 'q1',
              orderIndex: 1,
              points: 1,
              questionId: 'qid-1',
              content: 'Stem',
              responseType: 'SINGLE_CHOICE',
              skill: 'LISTENING',
              explanation: null,
              options: [{ id: 'opt-1', content: 'A', orderIndex: 1, isCorrect: true }],
            },
          ],
        },
      ],
    };

    const criteriaBody = {
      evidence: 'Vetted',
      rules: [
        {
          skill: 'READING',
          scale: 'INTERNAL_RAW_COUNT',
          minSamples: 1,
          min: 10,
          max: 100,
          courseVersionIds: ['ver-read-550'],
          priorityRank: 1,
        },
      ],
    };

    const state = {
      attempts: new Map<string, any>([
        [
          'attempt-hallucinate-score',
          {
            id: 'attempt-hallucinate-score',
            learnerId: 'student-H',
            placementVersionId: 'ver-src-1',
            placementSitting: {
              policy: {
                approvedAt: new Date(),
                body: timingBody,
                digest: timingDigest,
                sourceId: 'ver-src-1',
              },
            },
            answers: [{ testQuestionId: 'q1', selectedOptionIds: ['opt-1'], textResponse: '' }],
          },
        ],
      ]),
      evaluations: new Map<string, any[]>([
        [
          'attempt-hallucinate-score',
          [
            {
              id: 'eval-lr-H',
              skill: 'LR',
              release: { id: 'rel-H', reason: 'Release H' },
              body: { parts: [{ skill: 'LISTENING', part: 'P1', samples: 1, correct: 1 }] },
            },
          ],
        ],
      ]),
      courseVersions: [
        {
          id: 'ver-read-550',
          title: 'TOEIC Reading 550+',
          course: { slug: 'toeic-reading-550' },
          offerings: [],
        },
      ],
      criteriaPolicy: {
        id: 'crit-1',
        kind: 'CRITERIA',
        mode: 'LR',
        approvedById: 'admin-1',
        digest: quizDigest(criteriaBody),
        approvedAt: new Date(),
        body: criteriaBody,
      },
      knowledgeEntries: [],
    };

    const { mockDb } = createMockPrismaService(state);
    const mockLms: any = {
      context: jest.fn().mockImplementation(async (tx, actor) => ({
        id: actor.id,
        role: 'STUDENT',
        email: `${actor.id}@example.invalid`,
      })),
      now: jest.fn().mockResolvedValue(new Date()),
    };
    const mockAuthority: any = { audit: jest.fn() };
    const mockIntegration: any = {
      source: jest.fn().mockResolvedValue({
        id: 'ver-src-1',
        purpose: 'DEV_PREVIEW',
        provenance: { synthetic: true },
        sourceHash: 'hash-src-1',
        mode: 'LR',
        testId: 'test-form-1',
        version: '1.0.0',
        s: snapshot,
      }),
    };

    const service = new PlacementWorkflowService(
      mockDb,
      mockLms,
      mockAuthority,
      mockIntegration,
      null as any,
      null as any,
    );

    const actorH: AuthorityActor = { id: 'student-H', sessionId: 'sess-H' };
    const res = await service.diagnostic(actorH, 'attempt-hallucinate-score');

    expect(transportCalls).toBe(1);
    expect(res.aiAdvisory?.fallbackUsed).toBe(true);
    expect(res.aiAdvisory?.fallbackReason).toBe('SCORE_OR_ELIGIBILITY_MUTATION_BLOCKED');
  });

  it('SEMANTIC DEFENSE (D): Fabricated courseVersionId in free text triggers SAFE_FALLBACK', async () => {
    let transportCalls = 0;
    const mockTransport: GeminiHttpTransport = async () => {
      transportCalls++;
      return {
        status: 200,
        ok: true,
        data: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      diagnosisAdvisory: 'Năng lực đạt mức trung bình.',
                      classFitAdvisory:
                        'Bạn đủ điều kiện đăng ký ngay khóa học ver-unauthorized-990.',
                      selfStudyAdvisory: 'Lộ trình học tập.',
                      claimedCorrectCount: 1,
                      referencedPaths: [],
                    }),
                  },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        },
      };
    };

    GeminiAdvisoryAdapter.getSharedInstance(
      { provider: 'GEMINI', stagingEnabled: true, apiKey: 'mock-key', dailyBudgetCalls: 10 },
      mockTransport,
    );

    const timingBody = { tasks: [] };
    const timingDigest = quizDigest(timingBody);
    const snapshot = {
      testId: 'test-form-1',
      allQuestionIds: ['q1'],
      mode: 'LR' as const,
      title: 'Placement LR Test',
      groups: [
        {
          id: 'g-lr',
          skill: 'LISTENING',
          taskCode: 'P1',
          title: 'Part 1',
          instructions: '',
          stimulusText: null,
          audioUrl: null,
          preparationSeconds: null,
          responseSeconds: null,
          recommendedSeconds: null,
          maxRecordingSeconds: null,
          stimuli: [],
          questions: [
            {
              id: 'q1',
              orderIndex: 1,
              points: 1,
              questionId: 'qid-1',
              content: 'Stem',
              responseType: 'SINGLE_CHOICE',
              skill: 'LISTENING',
              explanation: null,
              options: [{ id: 'opt-1', content: 'A', orderIndex: 1, isCorrect: true }],
            },
          ],
        },
      ],
    };

    const criteriaBody = {
      evidence: 'Vetted',
      rules: [
        {
          skill: 'READING',
          scale: 'INTERNAL_RAW_COUNT',
          minSamples: 1,
          min: 10,
          max: 100,
          courseVersionIds: ['ver-read-550'],
          priorityRank: 1,
        },
      ],
    };

    const state = {
      attempts: new Map<string, any>([
        [
          'attempt-hallucinate-course',
          {
            id: 'attempt-hallucinate-course',
            learnerId: 'student-C',
            placementVersionId: 'ver-src-1',
            placementSitting: {
              policy: {
                approvedAt: new Date(),
                body: timingBody,
                digest: timingDigest,
                sourceId: 'ver-src-1',
              },
            },
            answers: [{ testQuestionId: 'q1', selectedOptionIds: ['opt-1'], textResponse: '' }],
          },
        ],
      ]),
      evaluations: new Map<string, any[]>([
        [
          'attempt-hallucinate-course',
          [
            {
              id: 'eval-lr-C',
              skill: 'LR',
              release: { id: 'rel-C', reason: 'Release C' },
              body: { parts: [{ skill: 'LISTENING', part: 'P1', samples: 1, correct: 1 }] },
            },
          ],
        ],
      ]),
      courseVersions: [
        {
          id: 'ver-read-550',
          title: 'TOEIC Reading 550+',
          course: { slug: 'toeic-reading-550' },
          offerings: [],
        },
      ],
      criteriaPolicy: {
        id: 'crit-1',
        kind: 'CRITERIA',
        mode: 'LR',
        approvedById: 'admin-1',
        digest: quizDigest(criteriaBody),
        approvedAt: new Date(),
        body: criteriaBody,
      },
      knowledgeEntries: [],
    };

    const { mockDb } = createMockPrismaService(state);
    const mockLms: any = {
      context: jest.fn().mockImplementation(async (tx, actor) => ({
        id: actor.id,
        role: 'STUDENT',
        email: `${actor.id}@example.invalid`,
      })),
      now: jest.fn().mockResolvedValue(new Date()),
    };
    const mockAuthority: any = { audit: jest.fn() };
    const mockIntegration: any = {
      source: jest.fn().mockResolvedValue({
        id: 'ver-src-1',
        purpose: 'DEV_PREVIEW',
        provenance: { synthetic: true },
        sourceHash: 'hash-src-1',
        mode: 'LR',
        testId: 'test-form-1',
        version: '1.0.0',
        s: snapshot,
      }),
    };

    const service = new PlacementWorkflowService(
      mockDb,
      mockLms,
      mockAuthority,
      mockIntegration,
      null as any,
      null as any,
    );

    const actorC: AuthorityActor = { id: 'student-C', sessionId: 'sess-C' };
    const res = await service.diagnostic(actorC, 'attempt-hallucinate-course');

    expect(transportCalls).toBe(1);
    expect(res.aiAdvisory?.fallbackUsed).toBe(true);
    expect(res.aiAdvisory?.fallbackReason).toBe('INVALID_AI_OUTPUT_SCHEMA');
  });

  it('SEMANTIC DEFENSE (E): Fabricated Speaking/Writing score when unassessed triggers SAFE_FALLBACK', async () => {
    let transportCalls = 0;
    const mockTransport: GeminiHttpTransport = async () => {
      transportCalls++;
      return {
        status: 200,
        ok: true,
        data: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      diagnosisAdvisory: 'Kết quả Speaking đạt 190 điểm, phản xạ lưu loát.',
                      classFitAdvisory: 'Khóa học phù hợp.',
                      selfStudyAdvisory: 'Lộ trình tự học.',
                      claimedCorrectCount: 1,
                      claimedEligibleCourseVersionIds: ['ver-read-550'],
                      referencedPaths: [],
                    }),
                  },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        },
      };
    };

    GeminiAdvisoryAdapter.getSharedInstance(
      { provider: 'GEMINI', stagingEnabled: true, apiKey: 'mock-key', dailyBudgetCalls: 10 },
      mockTransport,
    );

    const timingBody = { tasks: [] };
    const timingDigest = quizDigest(timingBody);
    const snapshot = {
      testId: 'test-form-1',
      allQuestionIds: ['q1'],
      mode: 'LR' as const,
      title: 'Placement LR Test',
      groups: [
        {
          id: 'g-lr',
          skill: 'LISTENING',
          taskCode: 'P1',
          title: 'Part 1',
          instructions: '',
          stimulusText: null,
          audioUrl: null,
          preparationSeconds: null,
          responseSeconds: null,
          recommendedSeconds: null,
          maxRecordingSeconds: null,
          stimuli: [],
          questions: [
            {
              id: 'q1',
              orderIndex: 1,
              points: 1,
              questionId: 'qid-1',
              content: 'Stem',
              responseType: 'SINGLE_CHOICE',
              skill: 'LISTENING',
              explanation: null,
              options: [{ id: 'opt-1', content: 'A', orderIndex: 1, isCorrect: true }],
            },
          ],
        },
      ],
    };

    const criteriaBody = {
      evidence: 'Vetted',
      rules: [
        {
          skill: 'READING',
          scale: 'INTERNAL_RAW_COUNT',
          minSamples: 1,
          min: 10,
          max: 100,
          courseVersionIds: ['ver-read-550'],
          priorityRank: 1,
        },
      ],
    };

    const state = {
      attempts: new Map<string, any>([
        [
          'attempt-hallucinate-spk',
          {
            id: 'attempt-hallucinate-spk',
            learnerId: 'student-S',
            placementVersionId: 'ver-src-1',
            placementSitting: {
              policy: {
                approvedAt: new Date(),
                body: timingBody,
                digest: timingDigest,
                sourceId: 'ver-src-1',
              },
            },
            answers: [{ testQuestionId: 'q1', selectedOptionIds: ['opt-1'], textResponse: '' }],
          },
        ],
      ]),
      evaluations: new Map<string, any[]>([
        [
          'attempt-hallucinate-spk',
          [
            // LR is published, but SPEAKING is NOT assessed
            {
              id: 'eval-lr-S',
              skill: 'LR',
              release: { id: 'rel-S', reason: 'Release S' },
              body: { parts: [{ skill: 'LISTENING', part: 'P1', samples: 1, correct: 1 }] },
            },
          ],
        ],
      ]),
      courseVersions: [
        {
          id: 'ver-read-550',
          title: 'TOEIC Reading 550+',
          course: { slug: 'toeic-reading-550' },
          offerings: [],
        },
      ],
      criteriaPolicy: {
        id: 'crit-1',
        kind: 'CRITERIA',
        mode: 'LR',
        approvedById: 'admin-1',
        digest: quizDigest(criteriaBody),
        approvedAt: new Date(),
        body: criteriaBody,
      },
      knowledgeEntries: [],
    };

    const { mockDb } = createMockPrismaService(state);
    const mockLms: any = {
      context: jest.fn().mockImplementation(async (tx, actor) => ({
        id: actor.id,
        role: 'STUDENT',
        email: `${actor.id}@example.invalid`,
      })),
      now: jest.fn().mockResolvedValue(new Date()),
    };
    const mockAuthority: any = { audit: jest.fn() };
    const mockIntegration: any = {
      source: jest.fn().mockResolvedValue({
        id: 'ver-src-1',
        purpose: 'DEV_PREVIEW',
        provenance: { synthetic: true },
        sourceHash: 'hash-src-1',
        mode: 'LR',
        testId: 'test-form-1',
        version: '1.0.0',
        s: snapshot,
      }),
    };

    const service = new PlacementWorkflowService(
      mockDb,
      mockLms,
      mockAuthority,
      mockIntegration,
      null as any,
      null as any,
    );

    const actorS: AuthorityActor = { id: 'student-S', sessionId: 'sess-S' };
    const res = await service.diagnostic(actorS, 'attempt-hallucinate-spk');

    expect(transportCalls).toBe(1);
    expect(res.aiAdvisory?.fallbackUsed).toBe(true);
    expect(res.aiAdvisory?.fallbackReason).toBe('SCORE_OR_ELIGIBILITY_MUTATION_BLOCKED');
  });

  it('CACHE EFFICIENCY (F): Repeated diagnostic call on SAME attempt reuses cached advice (transport = 1)', async () => {
    let transportCalls = 0;
    const mockTransport: GeminiHttpTransport = async () => {
      transportCalls++;
      return {
        status: 200,
        ok: true,
        data: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      schemaVersion: 'BR136_V1',
                      diagnosis: { strategy: 'EVIDENCE_REVIEW', domainCodes: [] },
                      classFit: { strategy: 'EXPLAIN_RULES', courseVersionIds: [] },
                      selfStudy: { strategy: 'GUIDED_PRACTICE', articlePaths: [] },
                    }),
                  },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        },
      };
    };

    GeminiAdvisoryAdapter.getSharedInstance(
      { provider: 'GEMINI', stagingEnabled: true, apiKey: 'mock-key', dailyBudgetCalls: 10 },
      mockTransport,
    );

    const timingBody = { tasks: [] };
    const timingDigest = quizDigest(timingBody);
    const snapshot = {
      testId: 'test-form-1',
      allQuestionIds: ['q1'],
      mode: 'LR' as const,
      title: 'Placement LR Test',
      groups: [
        {
          id: 'g-lr',
          skill: 'LISTENING',
          taskCode: 'P1',
          title: 'Part 1',
          instructions: '',
          stimulusText: null,
          audioUrl: null,
          preparationSeconds: null,
          responseSeconds: null,
          recommendedSeconds: null,
          maxRecordingSeconds: null,
          stimuli: [],
          questions: [
            {
              id: 'q1',
              orderIndex: 1,
              points: 1,
              questionId: 'qid-1',
              content: 'Stem',
              responseType: 'SINGLE_CHOICE',
              skill: 'LISTENING',
              explanation: null,
              options: [{ id: 'opt-1', content: 'A', orderIndex: 1, isCorrect: true }],
            },
          ],
        },
      ],
    };

    const criteriaBody = {
      evidence: 'Vetted',
      rules: [
        {
          skill: 'READING',
          scale: 'INTERNAL_RAW_COUNT',
          minSamples: 1,
          min: 10,
          max: 100,
          courseVersionIds: ['ver-read-550'],
          priorityRank: 1,
        },
      ],
    };

    const state = {
      attempts: new Map<string, any>([
        [
          'attempt-cache-reuse',
          {
            id: 'attempt-cache-reuse',
            learnerId: 'student-R',
            placementVersionId: 'ver-src-1',
            placementSitting: {
              policy: {
                approvedAt: new Date(),
                body: timingBody,
                digest: timingDigest,
                sourceId: 'ver-src-1',
              },
            },
            answers: [{ testQuestionId: 'q1', selectedOptionIds: ['opt-1'], textResponse: '' }],
          },
        ],
      ]),
      evaluations: new Map<string, any[]>([
        [
          'attempt-cache-reuse',
          [
            {
              id: 'eval-lr-R',
              skill: 'LR',
              release: { id: 'rel-R', reason: 'Release R' },
              body: {
                parts: [
                  { skill: 'LISTENING', part: 'P1', samples: 100, correct: 70 },
                  { skill: 'READING', part: 'P5', samples: 100, correct: 40 },
                ],
              },
            },
          ],
        ],
      ]),
      courseVersions: [
        {
          id: 'ver-read-550',
          title: 'TOEIC Reading 550+',
          course: { slug: 'toeic-reading-550' },
          offerings: [],
        },
      ],
      criteriaPolicy: {
        id: 'crit-1',
        kind: 'CRITERIA',
        mode: 'LR',
        approvedById: 'admin-1',
        digest: quizDigest(criteriaBody),
        approvedAt: new Date(),
        body: criteriaBody,
      },
      knowledgeEntries: [],
    };

    const { mockDb } = createMockPrismaService(state);
    const mockLms: any = {
      context: jest.fn().mockImplementation(async (tx, actor) => ({
        id: actor.id,
        role: 'STUDENT',
        email: `${actor.id}@example.invalid`,
      })),
      now: jest.fn().mockResolvedValue(new Date()),
    };
    const mockAuthority: any = { audit: jest.fn() };
    const mockIntegration: any = {
      source: jest.fn().mockResolvedValue({
        id: 'ver-src-1',
        purpose: 'DEV_PREVIEW',
        provenance: { synthetic: true },
        sourceHash: 'hash-src-1',
        mode: 'LR',
        testId: 'test-form-1',
        version: '1.0.0',
        s: snapshot,
      }),
    };

    const service = new PlacementWorkflowService(
      mockDb,
      mockLms,
      mockAuthority,
      mockIntegration,
      null as any,
      null as any,
    );

    const actorR: AuthorityActor = { id: 'student-R', sessionId: 'sess-R' };

    // Call 1: cold cache -> transportCalls = 1
    const res1 = await service.diagnostic(actorR, 'attempt-cache-reuse');
    expect(transportCalls).toBe(1);
    expect(res1.aiAdvisory?.providerStatus).toBe('CONNECTED_UNVERIFIED');

    // Call 2 on SAME attempt: warm cache -> transportCalls remains 1!
    const res2 = await service.diagnostic(actorR, 'attempt-cache-reuse');
    expect(transportCalls).toBe(1);
    expect(res2.aiAdvisory?.diagnosisAdvisory).toBe(res1.aiAdvisory?.diagnosisAdvisory);
  });
});
