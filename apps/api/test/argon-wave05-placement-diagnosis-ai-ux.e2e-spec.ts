/* eslint-disable @typescript-eslint/no-explicit-any */
import * as request from 'supertest';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { startWave01App } from './wave01-postgres.fixture';
import { seedArgonWave05Demo } from './wave05-demo.fixture';
import { PlacementWorkflowService } from '../src/modules/placement/workflow.service';
import { runArgonWave05BrowserVerification } from './argon-wave05-browser-capture';

describe('Argon Wave 05 — Evidence-Backed Placement Diagnosis, Explainable Class Recommendation, AI Advisory & Teacher-Ready UX', () => {
  let d: Awaited<ReturnType<typeof startWave01App>>;
  let demo: Awaited<ReturnType<typeof seedArgonWave05Demo>>;
  let apiPort = 0;
  const pBase = '/api/v2/placement/workflow';
  const proofs: Record<string, unknown> = {};

  beforeAll(async () => {
    process.env.W04B_ENABLED = 'DEV_WORKFLOW';
    process.env.W05A_ENABLED = 'DEV_SUPPORT';
    process.env.W05B_ENABLED = 'DEV_DEC060';
    process.env.W06_ENABLED = 'DEV_DEC047';
    process.env.W07_ENABLED = 'DEV_DEC049';
    process.env.W08_ENABLED = 'DEV_DEC053';
    process.env.W09_ENABLED = 'DEV_W09';
    process.env.W10_REPORT_CSV_ENABLED = 'DEV_W10';

    d = await startWave01App();
    await d.app.listen(0, '127.0.0.1');
    apiPort = (d.app.getHttpServer().address() as AddressInfo).port;
    demo = await seedArgonWave05Demo(d);
  }, 180000);

  afterAll(async () => {
    d?.app?.get(PlacementWorkflowService)?.setAiAdvisoryProviderHookForTest(null);
    const outDir = resolve(__dirname, '../../../docs/v2/v2-road-to-99-argon-wave05r/EVIDENCE');
    await mkdir(outDir, { recursive: true });
    await writeFile(resolve(outDir, 'WAVE05R_E2E_PROOFS.json'), JSON.stringify(proofs, null, 2));
    if (d?.app) await d.app.close();
  });

  it('Block 1 — Safety, Release Gate Invariants, RBAC & Answer-Key Non-Leakage', async () => {
    const [dbIdentity] = await d.prisma.$queryRaw<
      Array<{ db: string; oid: string }>
    >`SELECT current_database() AS db, oid::text AS oid FROM pg_database WHERE datname = current_database()`;
    expect(dbIdentity.db).toMatch(/^v2_wave01_dev_test_w04b_/);
    expect(dbIdentity.oid).not.toBe('953322');
    expect(dbIdentity.oid).not.toBe('20986');

    // Original bank release flags must remain false
    expect(demo.banks.lrBank.eligibility.learnerPublishable).toBe(false);
    expect(demo.banks.fourBank.eligibility.learnerPublishable).toBe(false);

    // Guest 401
    await request(d.app.getHttpServer())
      .get(`${pBase}/attempts/${demo.attempts.cohortAAttemptId}/diagnostic`)
      .expect(401);

    // Cross-owner 404 (Cohort B cannot read Cohort A's diagnostic)
    const agB = demo.agents.get(demo.cohorts.hvCohortB.id)!;
    await agB.get(`${pBase}/attempts/${demo.attempts.cohortAAttemptId}/diagnostic`).expect(404);

    // Public catalog returns exactly 6 published realistic courses and 0 unpublished QA fixtures
    const catalogRes = await request(d.app.getHttpServer()).get('/api/courses').expect(200);
    expect(catalogRes.body.data).toHaveLength(6);
    expect(
      catalogRes.body.data.every((c: { title: string }) => !/Internal QA Fixture/i.test(c.title)),
    ).toBe(true);

    proofs.block1_safety_and_catalog = {
      disposableDb: dbIdentity,
      lrLearnerPublishable: demo.banks.lrBank.eligibility.learnerPublishable,
      fourLearnerPublishable: demo.banks.fourBank.eligibility.learnerPublishable,
      publicCatalogCourseCount: catalogRes.body.data.length,
      publicCatalogCourses: catalogRes.body.data.map((c: any) => ({
        id: c.id,
        title: c.title,
        classOfferingsCount: c.classOfferings?.length ?? 0,
      })),
    };
  });

  it('Block 2 — Teacher-Critique Proof: Identical Total LR Score (110/200) Produces Distinct Evidence-Backed Diagnoses & Distinct Class Recommendations (Cohort A vs Cohort B vs Cohort C)', async () => {
    const agA = demo.agents.get(demo.cohorts.hvCohortA.id)!;
    const agB = demo.agents.get(demo.cohorts.hvCohortB.id)!;
    const agC = demo.agents.get(demo.cohorts.hvCohortC.id)!;

    const diagA = (
      await agA.get(`${pBase}/attempts/${demo.attempts.cohortAAttemptId}/diagnostic`).expect(200)
    ).body;
    const diagB = (
      await agB.get(`${pBase}/attempts/${demo.attempts.cohortBAttemptId}/diagnostic`).expect(200)
    ).body;
    const diagC = (
      await agC.get(`${pBase}/attempts/${demo.attempts.cohortCAttemptId}/diagnostic`).expect(200)
    ).body;

    // Verify no answer keys or internal preview markers leak in any diagnostic JSON
    for (const payload of [diagA, diagB, diagC]) {
      expect(JSON.stringify(payload)).not.toMatch(
        /isCorrect|selectedOptionIds|explanation|INTERNAL_PREVIEW_KEY/,
      );
      expect(payload.parts).toHaveLength(7); // Canonical P1..P7
    }

    // All 3 cohorts have the exact same total LR score: 110/200 (55%)
    expect(diagA.diagnosis.overallSummary.lrCorrectCount).toBe(110);
    expect(diagB.diagnosis.overallSummary.lrCorrectCount).toBe(110);
    expect(diagC.diagnosis.overallSummary.lrCorrectCount).toBe(110);
    expect(diagA.diagnosis.overallSummary.lrTotalItems).toBe(200);
    expect(diagA.diagnosis.overallSummary.lrAccuracyPct).toBe(55);
    expect(diagB.diagnosis.overallSummary.lrAccuracyPct).toBe(55);
    expect(diagC.diagnosis.overallSummary.lrAccuracyPct).toBe(55);

    // Skill-level contrast: Cohort A (78 L / 32 R), Cohort B (32 L / 78 R), Cohort C (55 L / 55 R)
    expect(diagA.diagnosis.overallSummary.listeningAccuracyPct).toBe(78);
    expect(diagA.diagnosis.overallSummary.readingAccuracyPct).toBe(32);
    expect(diagB.diagnosis.overallSummary.listeningAccuracyPct).toBe(32);
    expect(diagB.diagnosis.overallSummary.readingAccuracyPct).toBe(78);
    expect(diagC.diagnosis.overallSummary.listeningAccuracyPct).toBe(55);
    expect(diagC.diagnosis.overallSummary.readingAccuracyPct).toBe(55);

    // Distinct weaknesses: Cohort A has READING improvements; Cohort B has LISTENING improvements
    expect(diagA.diagnosis.improvements.length).toBeGreaterThan(0);
    expect(diagA.diagnosis.improvements.every((i: any) => i.skill === 'READING')).toBe(true);
    expect(diagB.diagnosis.improvements.length).toBeGreaterThan(0);
    expect(diagB.diagnosis.improvements.every((i: any) => i.skill === 'LISTENING')).toBe(true);

    // Distinct class recommendations from approved CRITERIA policy:
    // Cohort A -> TOEIC Reading & Grammar 550+ (SE-READ-550-246)
    expect(diagA.matching.status).toBe('MATCHED');
    expect(diagA.matching.reasons).toEqual([]);
    expect(diagA.matching.classes.map((c: any) => c.code)).toEqual(['SE-READ-550-246']);
    expect(diagA.recommendation.overallStatusLabelVi).toBe('Đã tìm thấy 1 lớp đang mở phù hợp');
    expect(diagA.recommendation.availableClasses[0].courseTitle).toContain(
      'TOEIC Reading Strategies & Grammar 550+',
    );

    // Cohort B -> TOEIC Listening Focus 550+ (SE-LIST-550-357)
    expect(diagB.matching.status).toBe('MATCHED');
    expect(diagB.matching.reasons).toEqual([]);
    expect(diagB.matching.classes.map((c: any) => c.code)).toEqual(['SE-LIST-550-357']);
    expect(diagB.recommendation.overallStatusLabelVi).toBe('Đã tìm thấy 1 lớp đang mở phù hợp');
    expect(diagB.recommendation.availableClasses[0].courseTitle).toContain(
      'TOEIC Listening Focus & Reflex 550+',
    );

    // Cohort C -> TOEIC L&R Advancing 550+ open class (SE-LR-550-OPEN) + full class (SE-LR-550-FULL) in unavailableClasses
    expect(diagC.matching.status).toBe('MATCHED');
    expect(diagC.matching.reasons).toEqual([]);
    expect(diagC.matching.classes.map((c: any) => c.code)).toEqual(['SE-LR-550-OPEN']);
    expect(diagC.recommendation.overallStatusLabelVi).toBe('Đã tìm thấy 1 lớp đang mở phù hợp');
    expect(diagC.recommendation.unavailableClasses.map((c: any) => c.classCode)).toContain(
      'SE-LR-550-FULL',
    );
    expect(diagC.recommendation.unavailableClasses[0].availabilityStatus).toBe('WAITLIST_OR_FULL');

    // Wave 05R P2-UX-04: Distinct per-attempt identifier (attemptRef) vs shared exam version digest (sourceDigestRef)
    expect(diagA.attemptRef).toMatch(/^[0-9A-F]{8}$/);
    expect(diagB.attemptRef).toMatch(/^[0-9A-F]{8}$/);
    expect(diagC.attemptRef).toMatch(/^[0-9A-F]{8}$/);
    expect(new Set([diagA.attemptRef, diagB.attemptRef, diagC.attemptRef]).size).toBe(3);
    expect(diagA.diagnosis.sourceDigestRef).toBe(diagB.diagnosis.sourceDigestRef);
    expect(diagB.diagnosis.sourceDigestRef).toBe(diagC.diagnosis.sourceDigestRef);

    // Self-study guidance: Cohort A links vetted Part 5-6 article AND reports NO_VETTED_ARTICLE for unlinked domain
    const vettedA = diagA.selfStudyGuidance.find(
      (g: any) => g.resourceStatus === 'VETTED_AVAILABLE',
    );
    const unlinkedA = diagA.selfStudyGuidance.find(
      (g: any) => g.resourceStatus === 'NO_VETTED_LINK',
    );
    expect(vettedA).toBeDefined();
    expect(vettedA.vettedResources[0].path).toBe(
      '/knowledge/articles/toeic-part5-word-forms-and-clause-structure',
    );
    expect(unlinkedA).toBeDefined();
    expect(unlinkedA.resourceStatusLabel).toBe('Chưa có tài liệu được xác thực cho chủ đề này');

    proofs.block2_teacher_critique_contrasting_cohorts = {
      cohortA: {
        attemptId: demo.attempts.cohortAAttemptId,
        attemptRef: diagA.attemptRef,
        sourceDigestRef: diagA.diagnosis.sourceDigestRef,
        matchingReasons: diagA.matching.reasons,
        student: demo.cohorts.hvCohortA.fullName,
        overallSummary: diagA.diagnosis.overallSummary,
        topStrengths: diagA.diagnosis.strengths.map((s: any) => s.domainCode),
        topImprovements: diagA.diagnosis.improvements.map((i: any) => ({
          domainCode: i.domainCode,
          evidenceBadge: i.evidenceBadge,
        })),
        recommendedClassCodes: diagA.matching.classes.map((c: any) => c.code),
        selfStudyStatuses: diagA.selfStudyGuidance.map((g: any) => ({
          domainCode: g.domainCode,
          resourceStatus: g.resourceStatus,
          paths: g.vettedResources.map((r: any) => r.path),
        })),
      },
      cohortB: {
        attemptId: demo.attempts.cohortBAttemptId,
        attemptRef: diagB.attemptRef,
        sourceDigestRef: diagB.diagnosis.sourceDigestRef,
        matchingReasons: diagB.matching.reasons,
        student: demo.cohorts.hvCohortB.fullName,
        overallSummary: diagB.diagnosis.overallSummary,
        topStrengths: diagB.diagnosis.strengths.map((s: any) => s.domainCode),
        topImprovements: diagB.diagnosis.improvements.map((i: any) => ({
          domainCode: i.domainCode,
          evidenceBadge: i.evidenceBadge,
        })),
        recommendedClassCodes: diagB.matching.classes.map((c: any) => c.code),
      },
      cohortC: {
        attemptId: demo.attempts.cohortCAttemptId,
        attemptRef: diagC.attemptRef,
        sourceDigestRef: diagC.diagnosis.sourceDigestRef,
        matchingReasons: diagC.matching.reasons,
        student: demo.cohorts.hvCohortC.fullName,
        overallSummary: diagC.diagnosis.overallSummary,
        recommendedOpenClassCodes: diagC.matching.classes.map((c: any) => c.code),
        unavailableClassCodes: diagC.recommendation.unavailableClasses.map((c: any) => ({
          code: c.classCode,
          availabilityStatus: c.availabilityStatus,
          unavailabilityReasonCode: c.unavailabilityReasonCode,
        })),
      },
    };
  });

  it('Block 3 — Completeness & Productive Skills Rubric Proof (Cohort D Pending S/W vs Cohort E Finalized S/W)', async () => {
    const agD = demo.agents.get(demo.cohorts.hvCohortD.id)!;
    const agE = demo.agents.get(demo.cohorts.hvCohortE.id)!;

    const diagD = (
      await agD.get(`${pBase}/attempts/${demo.attempts.cohortDAttemptId}/diagnostic`).expect(200)
    ).body;
    const diagE = (
      await agE.get(`${pBase}/attempts/${demo.attempts.cohortEAttemptId}/diagnostic`).expect(200)
    ).body;

    // Cohort D: LR published (126/200), Speaking & Writing PENDING_REVIEW with null value (never 0)
    const spkD = diagD.skillResults.find((s: any) => s.skill === 'SPEAKING');
    const wrtD = diagD.skillResults.find((s: any) => s.skill === 'WRITING');
    expect(spkD.status).toBe('PENDING_REVIEW');
    expect(spkD.value).toBeNull();
    expect(wrtD.status).toBe('PENDING_REVIEW');
    expect(wrtD.value).toBeNull();
    expect(diagD.matching.status).toBe('INSUFFICIENT');
    expect(diagD.matching.classes).toEqual([]);
    expect(diagD.recommendation.overallStatus).toBe('LR_ONLY_PRELIMINARY');

    // Cohort E: All 4 skills PUBLISHED, Rubric breakdown populated, 4-skill class recommended
    const spkE = diagE.skillResults.find((s: any) => s.skill === 'SPEAKING');
    const wrtE = diagE.skillResults.find((s: any) => s.skill === 'WRITING');
    expect(spkE.status).toBe('PUBLISHED');
    expect(spkE.value).toBe(66);
    expect(wrtE.status).toBe('PUBLISHED');
    expect(wrtE.value).toBe(52);
    expect(diagE.diagnosis.productiveSkills).toHaveLength(2);
    expect(diagE.diagnosis.productiveSkills[0].criteriaBreakdown.length).toBeGreaterThan(0);
    expect(diagE.matching.status).toBe('MATCHED');
    expect(diagE.matching.classes.map((c: any) => c.code)).toEqual(['SE-4SK-650-OPEN']);

    proofs.block3_productive_skills_pending_vs_finalized = {
      cohortD_pending: {
        attemptId: demo.attempts.cohortDAttemptId,
        skillResults: diagD.skillResults,
        matchingStatus: diagD.matching.status,
        recommendationStatus: diagD.recommendation.overallStatus,
      },
      cohortE_finalized: {
        attemptId: demo.attempts.cohortEAttemptId,
        skillResults: diagE.skillResults,
        matchingStatus: diagE.matching.status,
        recommendedClassCodes: diagE.matching.classes.map((c: any) => c.code),
        productiveCriteriaCount: diagE.diagnosis.productiveSkills.map((p: any) => ({
          skill: p.skill,
          totalScore: p.totalScore,
          criteriaRows: p.criteriaBreakdown.length,
        })),
      },
    };
  });

  it('Block 4 — Edge Cases Proof: Low-Sample (< 3 items) & Unclassified Tags (Cohort F) + Eligible Course With No Open Seats (Cohort G)', async () => {
    const agF = demo.agents.get(demo.cohorts.hvCohortF.id)!;
    const agG = demo.agents.get(demo.cohorts.hvCohortG.id)!;

    const diagF = (
      await agF.get(`${pBase}/attempts/${demo.attempts.cohortFAttemptId}/diagnostic`).expect(200)
    ).body;
    const diagG = (
      await agG.get(`${pBase}/attempts/${demo.attempts.cohortGAttemptId}/diagnostic`).expect(200)
    ).body;

    // Cohort F: < 3 samples per part -> LOW_SAMPLE; untagged items -> UNCLASSIFIED_TAG; 0 false weakness claims
    expect(diagF.diagnosis.partBreakdown.every((p: any) => p.sufficiency === 'LOW_SAMPLE')).toBe(
      true,
    );
    expect(
      diagF.diagnosis.knowledgeBreakdown.some((k: any) => k.domainCode === 'UNCLASSIFIED'),
    ).toBe(true);
    expect(diagF.diagnosis.improvements).toEqual([]);
    expect(diagF.diagnosis.lowSampleNotes.length).toBeGreaterThan(0);

    // Cohort G: Eligible for TOEIC Intensive 750+ (178/200), but its only class (SE-LR-750-FULL) is full -> NO_ELIGIBLE_CLASS + ELIGIBLE_COURSE_NO_OPEN_CLASS
    expect(diagG.matching.status).toBe('NO_ELIGIBLE_CLASS');
    expect(diagG.matching.classes).toEqual([]);
    expect(diagG.matching.reasons).toEqual(['CLASS_FULL_OR_CAPACITY_UNVERIFIED']);
    expect(diagG.matching.reasons).not.toContain('APPROVED_INTERNAL_RULE_NOT_MET');
    expect(diagG.recommendation.overallStatus).toBe('ELIGIBLE_COURSE_NO_OPEN_CLASS');
    expect(diagG.recommendation.overallStatusLabelVi).toBe(
      'Đủ điều kiện chương trình nhưng hiện chưa có lớp còn chỗ',
    );
    expect(diagG.recommendation.unavailableClasses.map((c: any) => c.classCode)).toContain(
      'SE-LR-750-FULL',
    );

    proofs.block4_low_sample_and_no_open_class = {
      cohortF_lowSample: {
        attemptId: demo.attempts.cohortFAttemptId,
        partSufficiencies: diagF.diagnosis.partBreakdown.map((p: any) => ({
          part: p.part,
          samples: p.samples,
          sufficiency: p.sufficiency,
        })),
        knowledgeDomains: diagF.diagnosis.knowledgeBreakdown.map((k: any) => ({
          domainCode: k.domainCode,
          sufficiency: k.sufficiency,
          canClaimWeakness: k.canClaimWeakness,
        })),
        claimedWeaknessesCount: diagF.diagnosis.improvements.length,
      },
      cohortG_noOpenClass: {
        attemptId: demo.attempts.cohortGAttemptId,
        matchingStatus: diagG.matching.status,
        matchingReasons: diagG.matching.reasons,
        recommendationStatus: diagG.recommendation.overallStatus,
        unavailableClasses: diagG.recommendation.unavailableClasses.map((c: any) => ({
          code: c.classCode,
          availabilityStatus: c.availabilityStatus,
          unavailabilityReasonCode: c.unavailabilityReasonCode,
        })),
      },
    };
  });

  it('Block 5 — AI Advisory Provider Matrix: Zero-Key Deterministic Mode, Stubbed Connected Provider, Hallucinated URL Rejection, Score/Course Mutation Guard & Timeout Fallback', async () => {
    const agA = demo.agents.get(demo.cohorts.hvCohortA.id)!;
    const svc = d.app.get(PlacementWorkflowService);

    // 1. Default Zero-Key Mode (NOT_CONFIGURED)
    svc.setAiAdvisoryProviderHookForTest(null);
    const zeroKeyDiag = (
      await agA.get(`${pBase}/attempts/${demo.attempts.cohortAAttemptId}/diagnostic`).expect(200)
    ).body;
    expect(zeroKeyDiag.aiAdvisory.providerStatus).toBe('NOT_CONFIGURED');
    expect(zeroKeyDiag.aiAdvisory.modeBadge).toBe('Hệ thống phân tích / giải thích theo dữ liệu');

    // 2. Connected Valid Stub Provider (CONNECTED_UNVERIFIED)
    svc.setAiAdvisoryProviderHookForTest(async () => ({
      providerName: 'gemini-2.5-flash-stub',
      diagnosisAdvisory:
        'Kết quả 110/200 câu đúng cho thấy kỹ năng Nghe hiểu (78%) là điểm tựa vững chắc, trong khi Đọc hiểu (32%) cần ưu tiên củng cố ngữ pháp Part 5 và đọc hiểu đoạn văn Part 6–7.',
      classFitAdvisory:
        'Khóa TOEIC Reading Strategies & Grammar 550+ hoàn toàn khớp với nhu cầu cải thiện ngữ pháp từ loại và mệnh đề của bạn, hiện có lớp tối 2-4-6 còn chỗ trống.',
      selfStudyAdvisory:
        'Hãy bắt đầu ôn tập bài viết Hệ thống Từ loại, Thì động từ & Cấu trúc Mệnh đề TOEIC Part 5–6 tại /knowledge/articles/toeic-part5-word-forms-and-clause-structure.',
      citedSlugs: ['toeic-part5-word-forms-and-clause-structure'],
    }));
    const validStubDiag = (
      await agA.get(`${pBase}/attempts/${demo.attempts.cohortAAttemptId}/diagnostic`).expect(200)
    ).body;
    expect(validStubDiag.aiAdvisory.providerStatus).toBe('CONNECTED_UNVERIFIED');
    expect(validStubDiag.aiAdvisory.modeBadge).toContain('AI hỗ trợ giải thích');
    expect(validStubDiag.matching.classes.map((c: any) => c.code)).toEqual(['SE-READ-550-246']);

    // 3. Hallucinated External Link Rejected -> SAFE_FALLBACK
    svc.setAiAdvisoryProviderHookForTest(async () => ({
      providerName: 'gemini-2.5-flash-stub',
      diagnosisAdvisory:
        'Kỹ năng Nghe đạt 78% và Đọc đạt 32%, cần tập trung ôn tập ngữ pháp Part 5.',
      classFitAdvisory:
        'Gợi ý theo học khóa TOEIC Reading Strategies & Grammar 550+ để tăng điểm đọc hiểu.',
      selfStudyAdvisory:
        'Xem thêm tài liệu ngoài hệ thống tại https://unverified-toeic-blog.example.com/part5.',
      citedSlugs: [],
    }));
    const badLinkDiag = (
      await agA.get(`${pBase}/attempts/${demo.attempts.cohortAAttemptId}/diagnostic`).expect(200)
    ).body;
    expect(badLinkDiag.aiAdvisory.providerStatus).toBe('SAFE_FALLBACK');
    expect(badLinkDiag.aiAdvisory.fallbackReason).toBe('UNVERIFIED_EXTERNAL_URL_BLOCKED');

    // 4. Conflicting Score / Non-Eligible Course Mutation Rejected -> SAFE_FALLBACK
    svc.setAiAdvisoryProviderHookForTest(async () => ({
      diagnosisAdvisory:
        'Chúc mừng bạn đã đạt 990 điểm tuyệt đối trong bài kiểm tra năng lực đầu vào.',
      classFitAdvisory:
        'Bạn được tuyển thẳng vào khóa TOEIC Listening Focus & Reflex 550+ mà không cần xét điều kiện.',
      selfStudyAdvisory: 'Ôn tập thêm từ khóa TOEIC Part 5 word forms và mệnh đề quan hệ.',
      claimedCorrectCount: 200,
    }));
    const mutatedScoreDiag = (
      await agA.get(`${pBase}/attempts/${demo.attempts.cohortAAttemptId}/diagnostic`).expect(200)
    ).body;
    expect(mutatedScoreDiag.aiAdvisory.providerStatus).toBe('SAFE_FALLBACK');
    expect(mutatedScoreDiag.aiAdvisory.fallbackReason).toBe(
      'SCORE_OR_ELIGIBILITY_MUTATION_BLOCKED',
    );
    // Deterministic class match and scores remain untouched
    expect(mutatedScoreDiag.matching.classes.map((c: any) => c.code)).toEqual(['SE-READ-550-246']);
    expect(mutatedScoreDiag.diagnosis.overallSummary.lrCorrectCount).toBe(110);

    // 5. Provider Error / Timeout -> SAFE_FALLBACK
    svc.setAiAdvisoryProviderHookForTest(async () => {
      throw new Error('PROVIDER_RATE_LIMITED_429');
    });
    const errorFallbackDiag = (
      await agA.get(`${pBase}/attempts/${demo.attempts.cohortAAttemptId}/diagnostic`).expect(200)
    ).body;
    expect(errorFallbackDiag.aiAdvisory.providerStatus).toBe('SAFE_FALLBACK');
    expect(errorFallbackDiag.aiAdvisory.fallbackReason).toBe('AI_PROVIDER_ERROR');

    // Restore zero-key deterministic mode
    svc.setAiAdvisoryProviderHookForTest(null);

    proofs.block5_ai_advisory_provider_matrix = {
      zeroKeyStatus: zeroKeyDiag.aiAdvisory.providerStatus,
      validStubStatus: validStubDiag.aiAdvisory.providerStatus,
      hallucinatedLinkFallback: badLinkDiag.aiAdvisory.fallbackReason,
      mutatedScoreFallback: mutatedScoreDiag.aiAdvisory.fallbackReason,
      providerErrorFallback: errorFallbackDiag.aiAdvisory.fallbackReason,
    };
  });

  it('Block 6 — Historical Attempt Snapshot Immutability & Criteria Policy Version Evolution', async () => {
    const agA = demo.agents.get(demo.cohorts.hvCohortA.id)!;
    const maker = demo.agents.get(demo.academic.id)!;
    const checker = demo.agents.get(demo.planningApprover.id)!;
    const reason = 'Wave 05 criteria policy version evolution verification';

    const beforeDiag = (
      await agA.get(`${pBase}/attempts/${demo.attempts.cohortAAttemptId}/diagnostic`).expect(200)
    ).body;
    const originalSourceDigestRef = beforeDiag.diagnosis.sourceDigestRef;
    const originalPolicyId = beforeDiag.recommendation.policyId;

    // Author and approve CRITERIA v2 where balancedProg is ALSO eligible as an alternative for Reading 0..60 & Listening 50..100
    const v1Policy = await d.prisma.placementWorkflowPolicy.findUniqueOrThrow({
      where: { id: demo.policies.lrCriteriaPolicyId },
    });
    const v1Body = v1Policy.body as any;
    const v2Body = {
      evidence: 'Wave 05 CRITERIA v2 — adds alternative general LR course for broad L/R range',
      rules: [
        ...v1Body.rules.filter(
          (r: any) => !r.courseVersionIds.includes(demo.programs.balancedProg.version.id),
        ),
        {
          skill: 'LISTENING',
          scale: 'INTERNAL_RAW_COUNT',
          minSamples: 50,
          min: 45,
          max: 100,
          courseVersionIds: [demo.programs.balancedProg.version.id],
        },
        {
          skill: 'READING',
          scale: 'INTERNAL_RAW_COUNT',
          minSamples: 50,
          min: 25,
          max: 65,
          courseVersionIds: [demo.programs.balancedProg.version.id],
        },
      ],
    };

    const v2Res = (
      await maker
        .post(`${pBase}/policies`)
        .send({
          idempotencyKey: randomUUID(),
          kind: 'CRITERIA',
          mode: 'LR',
          body: v2Body,
          reason,
        })
        .expect(201)
    ).body;
    await checker
      .post(`${pBase}/policies/${v2Res.id}/approve`)
      .send({ idempotencyKey: randomUUID(), reason })
      .expect(201);

    const afterV2Diag = (
      await agA.get(`${pBase}/attempts/${demo.attempts.cohortAAttemptId}/diagnostic`).expect(200)
    ).body;

    // Attempt snapshot digest and scores remain 100% immutable
    expect(afterV2Diag.diagnosis.sourceDigestRef).toBe(originalSourceDigestRef);
    expect(afterV2Diag.diagnosis.overallSummary.lrCorrectCount).toBe(110);
    // Policy version updated to v2, and primary priority remains Reading Strategies (4 matched rules with domain + part) while Balanced is secondary alternative (2 matched rules)
    expect(afterV2Diag.recommendation.policyId).toBe(v2Res.id);
    expect(afterV2Diag.recommendation.policyId).not.toBe(originalPolicyId);
    expect(afterV2Diag.recommendation.availableClasses[0].classCode).toBe('SE-READ-550-246');

    // Re-publish CRITERIA v1 as latest approved policy so Cohort A, B, C browser screenshots reflect strict v1 separation
    const v3Restore = (
      await maker
        .post(`${pBase}/policies`)
        .send({
          idempotencyKey: randomUUID(),
          kind: 'CRITERIA',
          mode: 'LR',
          body: v1Body,
          reason,
        })
        .expect(201)
    ).body;
    await checker
      .post(`${pBase}/policies/${v3Restore.id}/approve`)
      .send({ idempotencyKey: randomUUID(), reason })
      .expect(201);

    proofs.block6_policy_version_evolution = {
      originalSourceDigestRef,
      afterV2SourceDigestRef: afterV2Diag.diagnosis.sourceDigestRef,
      v1PolicyId: originalPolicyId,
      v2PolicyId: afterV2Diag.recommendation.policyId,
      v2CourseEvaluations: afterV2Diag.recommendation.courseEvaluations.map((ce: any) => ({
        courseTitle: ce.courseTitle,
        status: ce.status,
        ruleCount: ce.ruleTraces.length,
      })),
    };
  });

  it('Block 7 — Real Chrome CDP Browser Verification Across Desktop, Tablet & Mobile Viewports', async () => {
    const browserManifest = await runArgonWave05BrowserVerification({
      apiPort,
      password: demo.password,
      actors: {
        cohortAEmail: demo.cohorts.hvCohortA.email,
        cohortBEmail: demo.cohorts.hvCohortB.email,
        cohortCEmail: demo.cohorts.hvCohortC.email,
        cohortDEmail: demo.cohorts.hvCohortD.email,
        cohortEEmail: demo.cohorts.hvCohortE.email,
        cohortFEmail: demo.cohorts.hvCohortF.email,
        cohortGEmail: demo.cohorts.hvCohortG.email,
        primaryLearnerEmail: demo.learner.email,
        teacherEmail: demo.teacher.email,
        hvuMakerEmail: demo.academic.email,
        hvuCheckerEmail: demo.planningApprover.email,
      },
      ids: {
        cohortAAttemptId: demo.attempts.cohortAAttemptId,
        cohortBAttemptId: demo.attempts.cohortBAttemptId,
        cohortCAttemptId: demo.attempts.cohortCAttemptId,
        cohortDAttemptId: demo.attempts.cohortDAttemptId,
        cohortEAttemptId: demo.attempts.cohortEAttemptId,
        cohortFAttemptId: demo.attempts.cohortFAttemptId,
        cohortGAttemptId: demo.attempts.cohortGAttemptId,
        classReadingOpenId: demo.classes.classReadingOpen.id,
        readingCourseSlug: demo.programs.readingProg.course.slug,
      },
    });

    expect(browserManifest.totalCaptures).toBe(23);
    expect(browserManifest.zeroHorizontalOverflowAllCaptures).toBe(true);
    expect(browserManifest.api5xxResponses).toEqual([]);

    proofs.block7_browser_verification = {
      totalCaptures: browserManifest.totalCaptures,
      zeroHorizontalOverflowAllCaptures: browserManifest.zeroHorizontalOverflowAllCaptures,
      consoleErrorsCount: browserManifest.consoleErrorsCount,
      api5xxCount: browserManifest.api5xxResponses.length,
    };
  }, 180000);
});
