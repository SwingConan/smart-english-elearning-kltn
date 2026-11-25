/* eslint-disable @typescript-eslint/no-explicit-any */
import * as request from 'supertest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startWave01App } from './wave01-postgres.fixture';
import { seedArgonWave05Demo } from './wave05-demo.fixture';
import { seedPlacementWorkflowSource } from './wave04b.fixture';
import {
  GeminiAdvisoryAdapter,
  type GeminiHttpTransport,
} from '../src/modules/placement/gemini-advisory-provider';
import { PlacementWorkflowService } from '../src/modules/placement/workflow.service';

const base = '/api/v2/placement/workflow',
  reason = 'BR136 disposable synthetic human review evidence only';
describe('BR136 authenticated HTTP with real disposable PostgreSQL; fake Gemini transport only', () => {
  let d: Awaited<ReturnType<typeof startWave01App>>,
    demo: Awaited<ReturnType<typeof seedArgonWave05Demo>>;
  const proof: any = {
    protectedQaFreshVerification: false,
    realGeminiCalls: 0,
    requests: [],
    http: [],
    locks: [],
  };
  let dispatches = 0;
  let fetchSpy: jest.SpyInstance;
  const ag = (u: { id: string }) => demo.agents.get(u.id)!;
  const diagnostic = (a: any, id: string) => a.get(`${base}/attempts/${id}/diagnostic`);
  const transport: GeminiHttpTransport = async (p) => {
    dispatches++;
    const db = new Client({ connectionString: process.env.E2E_DATABASE_URL });
    await db.connect();
    try {
      await db.query('BEGIN READ ONLY');
      const locks = (
        await db.query(
          "SELECT locktype,mode,granted,objid::text,virtualtransaction FROM pg_locks WHERE locktype='advisory' AND objid=842030 AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND granted",
        )
      ).rows;
      expect(locks.length).toBeGreaterThan(0);
      proof.locks.push(locks);
      await db.query('COMMIT');
    } finally {
      await db.end();
    }
    const text = JSON.parse(p.body).contents[0].parts[0].text;
    const payload = JSON.parse(text.slice(text.indexOf('\n') + 1));
    // Capture only actual deidentified payload, never auth headers or student originals.
    proof.requests.push(payload);
    const fragments = {
      schemaVersion: 'BR136_V1',
      diagnosis: {
        strategy: 'EVIDENCE_REVIEW',
        domainCodes: payload.knowledgeBreakdown
          .filter((k: any) => k.canClaimWeakness)
          .slice(0, 2)
          .map((k: any) => k.domainCode),
      },
      classFit: {
        strategy: 'EXPLAIN_RULES',
        courseVersionIds: payload.eligibleCourseVersions
          .slice(0, 1)
          .map((c: any) => c.courseVersionId),
      },
      selfStudy: {
        strategy: 'GUIDED_PRACTICE',
        articlePaths: payload.allowlistedInternalPaths.slice(0, 2),
      },
    };
    return {
      status: 200,
      ok: true,
      data: { candidates: [{ content: { parts: [{ text: JSON.stringify(fragments) }] } }] },
    };
  };
  function enable(budget = 50) {
    GeminiAdvisoryAdapter.resetSharedState();
    PlacementWorkflowService.resetSharedAdapter();
    process.env.PLACEMENT_AI_ADVISORY_PROVIDER = 'GEMINI';
    const adapter = new GeminiAdvisoryAdapter(
      {
        provider: 'GEMINI',
        apiKey: 'BR136_FAKE_NOT_A_REAL_KEY',
        stagingEnabled: true,
        dailyBudgetCalls: budget,
        liveVerified: false,
      },
      transport,
    );
    GeminiAdvisoryAdapter.getSharedInstance(
      {
        provider: 'GEMINI',
        apiKey: 'BR136_FAKE_NOT_A_REAL_KEY',
        stagingEnabled: true,
        dailyBudgetCalls: budget,
        liveVerified: false,
      },
      transport,
    );
    d.app.get(PlacementWorkflowService).setGeminiAdvisoryAdapterForTest(adapter);
  }
  beforeAll(async () => {
    // Absolute outbound block. Native Nest HTTP and PostgreSQL remain real.
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw Error('BR136_ALL_REAL_PROVIDER_FETCH_BLOCKED');
    });
    d = await startWave01App();
    demo = await seedArgonWave05Demo(d);
  }, 240000);
  afterAll(async () => {
    proof.dispatches = dispatches;
    proof.nativeFetchCalls = fetchSpy?.mock.calls.length ?? 0;
    await writeFile(
      resolve(__dirname, '../../../docs/v2/br136/HTTP-proof.json'),
      JSON.stringify(proof, null, 2),
    );
    fetchSpy?.mockRestore();
    await d?.app.close();
  });
  it('default provider OFF, guest/missing/foreign/wrong-role rejected before provider; real release gates false', async () => {
    const id = demo.attempts.cohortAAttemptId;
    await request(d.app.getHttpServer()).get(`${base}/attempts/${id}/diagnostic`).expect(401);
    await diagnostic(ag(demo.cohorts.hvCohortB), id).expect(404);
    await diagnostic(ag(demo.teacher), id).expect(404);
    await diagnostic(ag(demo.cohorts.hvCohortA), randomUUID()).expect(404);
    const off = (await diagnostic(ag(demo.cohorts.hvCohortA), id).expect(200)).body;
    expect(off.aiAdvisory.providerStatus).toBe('NOT_CONFIGURED');
    expect(dispatches).toBe(0);
    expect(demo.banks.fourBank.eligibility.learnerPublishable).toBe(false);
    const config = (
      await ag(demo.cohorts.hvCohortA)
        .get(base + '/config')
        .expect(200)
    ).body;
    expect(config.releaseFlags).toEqual({
      MEDIA_QA_PASS: false,
      ACADEMIC_APPROVED: false,
      PUBLISHED: false,
    });
    proof.http.push({
      guest: 401,
      foreign: 404,
      wrongRole: 404,
      missing: 404,
      offStatus: off.aiAdvisory.providerStatus,
      releaseFlags: config.releaseFlags,
      dispatches,
    });
  });
  it('two authorized learners same source/same total use separate cache, exact reload deduplicates; foreign consumes zero', async () => {
    enable();
    const before = dispatches;
    const a = (
      await diagnostic(ag(demo.cohorts.hvCohortA), demo.attempts.cohortAAttemptId).expect(200)
    ).body;
    const b = (
      await diagnostic(ag(demo.cohorts.hvCohortB), demo.attempts.cohortBAttemptId).expect(200)
    ).body;
    expect(a.diagnosis.sourceDigestRef).toBe(b.diagnosis.sourceDigestRef);
    expect(a.diagnosis.overallSummary.lrCorrectCount).toBe(110);
    expect(b.diagnosis.overallSummary.lrCorrectCount).toBe(110);
    expect(dispatches - before).toBe(2);
    expect(a.aiAdvisory.providerStatus).toBe('CONNECTED_UNVERIFIED');
    expect(b.aiAdvisory.providerStatus).toBe('CONNECTED_UNVERIFIED');
    expect(a.aiAdvisory.diagnosisAdvisory).not.toBe(b.aiAdvisory.diagnosisAdvisory);
    expect(a.aiAdvisory.selfStudyAdvisory).not.toBe(b.aiAdvisory.selfStudyAdvisory);
    await diagnostic(ag(demo.cohorts.hvCohortA), demo.attempts.cohortAAttemptId).expect(200);
    await diagnostic(ag(demo.cohorts.hvCohortB), demo.attempts.cohortAAttemptId).expect(404);
    expect(dispatches - before).toBe(2);
    proof.http.push({
      sameSource: true,
      sameLrCorrect: 110,
      dispatchDelta: 2,
      reloadDelta: 0,
      foreignDelta: 0,
      outputs: [a.aiAdvisory, b.aiAdvisory],
    });
  });
  it('same FOUR_SKILLS attempt teacher reviews originals, scores rubric, independent publication invalidates cache', async () => {
    enable();
    const id = demo.attempts.cohortDAttemptId,
      learner = ag(demo.cohorts.hvCohortD),
      teacher = ag(demo.teacher),
      checker = ag(demo.planningApprover);
    const before = dispatches;
    const pending = (await diagnostic(learner, id).expect(200)).body;
    expect(pending.mode).toBe('FOUR_SKILLS');
    expect(pending.diagnosis.productiveSkills.every((s: any) => s.totalScore === null)).toBe(true);
    await teacher.get(`${base}/attempts/${id}/review`).expect(200);
    const rubric = await d.prisma.placementWorkflowPolicy.findFirstOrThrow({
      where: {
        kind: 'RUBRIC',
        sourceId: demo.banks.fourBank.version.id,
        approvedAt: { not: null },
      },
    });
    const publications = [];
    for (const skill of ['SPEAKING', 'WRITING']) {
      const groups = demo.banks.fourBank.groups.filter((g: any) => g.group.skill === skill);
      if (skill === 'SPEAKING')
        for (const g of groups)
          await teacher
            .get(`${base}/attempts/${id}/recordings/${g.questions[0].tq.id}`)
            .expect(200);
      const scores = Object.fromEntries(
        groups.map((g: any) => [
          g.group.id,
          ['TASK_FULFILLMENT', 'LANGUAGE_DELIVERY'].map((code) => ({
            code,
            score: 3,
            evidence: 'Synthetic original evidence reviewed by assigned instructor',
            feedback: 'PRIVATE_BR136_TEACHER_COMMENT_DO_NOT_TRANSMIT',
          })),
        ]),
      );
      const result = (
        await teacher
          .post(`${base}/attempts/${id}/evaluations`)
          .send({
            idempotencyKey: randomUUID(),
            skill,
            rubricId: rubric.id,
            expectedNumber: 0,
            scores,
            originalEvidenceReviewed: true,
            reason,
          })
          .expect(201)
      ).body;
      expect(result.state).toBe('REVIEWED_FINAL');
      await teacher
        .post(`${base}/evaluations/${result.id}/publish`)
        .send({ idempotencyKey: randomUUID(), reason })
        .expect(403);
      await checker
        .post(`${base}/evaluations/${result.id}/publish`)
        .send({ idempotencyKey: randomUUID(), reason })
        .expect(201);
      publications.push({
        skill,
        evaluationId: result.id,
        reviewedFinal: true,
        independentPublication: true,
      });
    }
    const published = (await diagnostic(learner, id).expect(200)).body;
    expect(
      published.diagnosis.productiveSkills.every(
        (s: any) => s.status === 'PUBLISHED' && s.totalScore > 0,
      ),
    ).toBe(true);
    expect(dispatches - before).toBe(2);
    expect(published.aiAdvisory.providerStatus).toBe('CONNECTED_UNVERIFIED');
    expect(published.aiAdvisory.diagnosisAdvisory).not.toBe(pending.aiAdvisory.diagnosisAdvisory);
    proof.http.push({
      sameAttempt: id,
      mode: pending.mode,
      pending: pending.diagnosis.productiveSkills,
      published: published.diagnosis.productiveSkills.map((s: any) => ({
        skill: s.skill,
        status: s.status,
        totalScore: s.totalScore,
      })),
      publications,
      dispatchDelta: 2,
    });
  });
  it('expired synthetic Speaking window blocks review and exposes no unpublished scores', async () => {
    process.env.PLACEMENT_AI_ADVISORY_PROVIDER = 'NONE';
    d.app.get(PlacementWorkflowService).setGeminiAdvisoryAdapterForTest(null);
    PlacementWorkflowService.resetSharedAdapter();
    const before = dispatches,
      source = await seedPlacementWorkflowSource(d, 'FOUR_SKILLS', true);
    const teacher = ag(demo.teacher),
      checker = ag(demo.planningApprover),
      learner = ag(demo.contenders[0]);
    const p = (
      await teacher
        .post(base + '/policies')
        .send({
          idempotencyKey: randomUUID(),
          kind: 'SOURCE_TIMING',
          mode: 'FOUR_SKILLS',
          sourceId: source.version.id,
          body: {
            sourceHash: source.version.sourceHash,
            evidence: reason,
            tasks: source.groups
              .filter((g) => ['SPEAKING', 'WRITING'].includes(g.group.skill))
              .map((g) => ({
                groupId: g.group.id,
                preparationSeconds: 0,
                playbackSeconds: 0,
                responseSeconds: 1,
                uploadSeconds: 0,
              })),
          },
          reason,
        })
        .expect(201)
    ).body;
    await checker
      .post(`${base}/policies/${p.id}/approve`)
      .send({ idempotencyKey: randomUUID(), reason })
      .expect(201);
    const id = (
      await learner
        .post(base + '/attempts')
        .send({
          idempotencyKey: randomUUID(),
          sourceVersionId: source.version.id,
          policyId: p.id,
          mode: 'FOUR_SKILLS',
          goalLR: 650,
          goalSpeaking: 0,
          goalWriting: 0,
        })
        .expect(201)
    ).body.attemptId;
    let sitting = (await learner.get(`${base}/attempts/${id}`).expect(200)).body;
    for (let n = 0; n < 2; n++)
      sitting = (
        await learner
          .post(`${base}/attempts/${id}/commands`)
          .send({
            idempotencyKey: randomUUID(),
            expectedLockVersion: sitting.lockVersion,
            action: 'NEXT',
          })
          .expect(201)
      ).body;
    expect(sitting.phase).toBe('SPEAKING');
    await new Promise((r) =>
      setTimeout(r, Math.max(0, Date.parse(sitting.deadline) - Date.now() + 40)),
    );
    const expired = (await learner.get(`${base}/attempts/${id}`).expect(200)).body;
    expect(expired.phase).toBe('BLOCKED_REVIEW');
    const diag = (await diagnostic(learner, id).expect(200)).body;
    expect(diag.diagnosis.productiveSkills.every((s: any) => s.totalScore === null)).toBe(true);
    expect(diag.matching.classes).toEqual([]);
    expect(dispatches).toBe(before);
    proof.http.push({
      expiredAttempt: id,
      phase: expired.phase,
      pendingScoresNull: true,
      classes: [],
      dispatchDelta: 0,
    });
  });
  it('budget one across authenticated distinct HTTP requests; expired cookie rejects before provider; PII-free actual payload', async () => {
    enable(1);
    const before = dispatches;
    const rs = await Promise.all([
      diagnostic(ag(demo.cohorts.hvCohortA), demo.attempts.cohortAAttemptId),
      diagnostic(ag(demo.cohorts.hvCohortB), demo.attempts.cohortBAttemptId),
    ]);
    expect(rs.map((r) => r.status)).toEqual([200, 200]);
    expect(dispatches - before).toBe(1);
    expect(rs.map((r) => r.body.aiAdvisory.providerStatus).sort()).toEqual([
      'CONNECTED_UNVERIFIED',
      'SAFE_FALLBACK',
    ]);
    await d.prisma
      .$executeRaw`UPDATE user_sessions SET expire=now()-interval '1 minute' WHERE sess->>'userId'=${demo.cohorts.hvCohortA.id}`;
    await diagnostic(ag(demo.cohorts.hvCohortA), demo.attempts.cohortAAttemptId).expect(401);
    expect(dispatches - before).toBe(1);
    const wire = JSON.stringify(proof.requests);
    expect(wire).not.toMatch(
      /PRIVATE_BR136_TEACHER_COMMENT|textResponse|audioStorageKey|isCorrect|selectedOptionIds|password|cookie|@example.invalid/,
    );
    for (const id of Object.values(demo.attempts)) expect(wire).not.toContain(id);
    expect(fetchSpy).not.toHaveBeenCalled();
    proof.http.push({
      budget: 1,
      dispatchDelta: 1,
      expiredCookie: 401,
      actualPayloadPrivacy: true,
      nativeFetchCalls: 0,
    });
  });
});
