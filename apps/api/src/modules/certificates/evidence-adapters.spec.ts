import { evaluateCompletion } from './completion-evaluator';
import type {
  AcademicApproval,
  ApprovedRule,
  CompletionCriterion,
  CompletionInput,
  CompletionPolicy,
  EvidenceReference,
} from './completion.contracts';
import { SERVER_READ_SNAPSHOT } from './evidence-adapter.contracts';
import type {
  AcademicResolution,
  DecisionProvenance,
  EvidenceAdapterContext,
  EvidenceAdapterResult,
  EvidenceIdentity,
  EvidenceProjection,
  ServerReadSnapshot,
  W03Projection,
  W06Projection,
  W07Projection,
} from './evidence-adapter.contracts';
import { normalizeW03, normalizeW06, normalizeW07 } from './evidence-adapters';

// Explicit OFFLINE synthetic facts. The symbol and these fixtures do NOT verify
// actual users, roles, source tables, policy decisions, grants or live revisions.
const ref = (id: string, revision = 'synthetic-v1'): EvidenceReference => ({ id, revision });
const at = '2026-01-01T00:00:00Z';
const identity: EvidenceIdentity = {
  learnerId: 'learner-A',
  enrollmentId: 'enrollment-A',
  classOfferingId: 'class-A',
  courseVersionId: 'course-version-A',
};
const cv = ref(identity.courseVersionId);
const approve = (id: string, actorId = 'academic-A'): AcademicApproval => ({
  decisionId: id,
  actorId,
  approvedAt: at,
});
const rule = (id: string): ApprovedRule => ({ ref: ref(id), approval: approve('approve-' + id) });
const gradeRule = rule('selected-final'),
  roundingRule = rule('approved-rounding');
const attendanceRule = rule('approved-attendance-calculation'),
  validityRule = rule('approved-validity-period');
const applicabilityRule = rule('approved-effective-policy');
const criteria: readonly CompletionCriterion[] = [
  {
    id: 'writing',
    kind: 'W03_GRADE',
    mandatory: true,
    threshold: { minimum: 3, scale: 'synthetic-scale' },
    selectionRule: gradeRule,
    roundingRule,
    exemptionRule: null,
  },
  {
    id: 'attendance',
    kind: 'W06_ATTENDANCE',
    mandatory: true,
    calculationRule: attendanceRule,
    exemptionRule: null,
  },
  { id: 'entitlement', kind: 'W07_ENTITLEMENT', mandatory: true, validityRule },
];
const policy: CompletionPolicy = {
  ref: ref('policy-A'),
  courseVersionRef: cv,
  state: 'APPROVED',
  approval: approve('approve-policy'),
  applicabilityRule,
  applicability: 'APPLICABLE',
  criteria,
};
const base = { identity, courseVersionRef: cv, policyRef: policy.ref };
const grade: W03Projection = {
  ...base,
  ref: ref('grade-A'),
  source: 'W03_ASSIGNMENT',
  activityRevisionRef: ref('submitted-activity-revision'),
  state: 'PUBLISHED',
  confirmedAt: at,
  publishedAt: at,
  publishedById: 'publisher-A',
  publicationDecisionRef: ref('publication-A'),
  makerIds: ['teacher-A'],
  value: 4,
  scale: 'synthetic-scale',
};
const correction1 = {
  ref: ref('correction-1'),
  learnerId: identity.learnerId,
  windowRef: ref('window-A'),
  state: 'APPROVED',
  baseVersion: 0,
  revision: 1,
  beforeStatus: 'LATE',
  requestedStatus: 'NOT_RECORDED',
  makerId: 'teacher-A',
  reviewerId: 'reviewer-A',
  reviewedAt: at,
  decisionRef: ref('correction-decision-1'),
};
const correction2 = {
  ...correction1,
  ref: ref('correction-2'),
  baseVersion: 1,
  revision: 2,
  beforeStatus: 'NOT_RECORDED',
  requestedStatus: 'PRESENT',
  decisionRef: ref('correction-decision-2'),
};
const attendance: W06Projection = {
  ...base,
  ref: ref('attendance-projection'),
  source: 'W06_LEARNER_ATTENDANCE',
  historyComplete: true,
  sessions: [
    {
      ref: ref('official-session-A'),
      classOfferingId: identity.classOfferingId,
      courseVersionRef: cv,
      state: 'PUBLISHED',
      windowRef: ref('window-A'),
      receipt: {
        ref: ref('receipt-A'),
        learnerId: identity.learnerId,
        windowRef: ref('window-A'),
        state: 'ACCEPTED',
        status: 'LATE',
        acceptedAt: at,
      },
      corrections: [correction2, correction1],
    },
  ],
};
const entitlement: W07Projection = {
  ...base,
  ref: ref('entitlement-A'),
  source: 'W07_ENTITLEMENT',
  entitlementOutcome: 'ACTIVE',
  entitlementEnrollmentId: identity.enrollmentId,
  enrollmentStatus: 'ACTIVE',
  application: {
    ref: ref('application-A'),
    learnerId: identity.learnerId,
    classOfferingId: identity.classOfferingId,
    courseVersionRef: cv,
    state: 'APPROVED',
    academicDecisionRef: ref('admission-decision-A'),
  },
};
const d = (
  target: EvidenceReference,
  purpose: DecisionProvenance['purpose'],
  id: string,
  actorId = 'academic-A',
): DecisionProvenance => ({
  ref: ref(id),
  subjectRef: target,
  purpose,
  scope: ['POLICY', 'RULE', 'COURSE_VERSION'].includes(purpose) ? 'COURSE_VERSION' : 'CLASS',
  scopeId: ['POLICY', 'RULE', 'COURSE_VERSION'].includes(purpose)
    ? identity.courseVersionId
    : identity.classOfferingId,
  state: 'APPROVED',
  actorId,
  decidedAt: at,
  authorityRef: ref('independently-checked-authority-' + id),
});
const decisions = [
  d(cv, 'COURSE_VERSION', 'approve-cv'),
  d(policy.ref, 'POLICY', 'approve-policy'),
  ...[gradeRule, roundingRule, attendanceRule, validityRule, applicabilityRule].map((r) =>
    d(r.ref, 'RULE', r.approval.decisionId),
  ),
  d(grade.ref, 'W03_PUBLICATION', 'publication-A', 'publisher-A'),
  d(correction1.ref, 'W06_CORRECTION', 'correction-decision-1', 'reviewer-A'),
  d(correction2.ref, 'W06_CORRECTION', 'correction-decision-2', 'reviewer-A'),
  d(entitlement.application.ref, 'W07_ADMISSION', 'admission-decision-A', 'admissions-A'),
];
const resolutions: AcademicResolution[] = [
  {
    ref: ref('grade-resolution'),
    kind: 'W03_GRADE',
    criterionId: 'writing',
    identity,
    policyRef: policy.ref,
    ruleRefs: [gradeRule.ref, roundingRule.ref],
    sourceRefs: [grade.ref, grade.activityRevisionRef, grade.publicationDecisionRef!],
    outcome: 'RESOLVED',
    normalizedValue: grade.value,
    scale: grade.scale,
  },
  {
    ref: ref('attendance-resolution'),
    kind: 'W06_ATTENDANCE',
    criterionId: 'attendance',
    identity,
    policyRef: policy.ref,
    ruleRefs: [attendanceRule.ref],
    sourceRefs: [
      attendance.ref,
      attendance.sessions[0].ref,
      ref('window-A'),
      ref('receipt-A'),
      correction1.ref,
      correction2.ref,
    ],
    outcome: 'SATISFIED',
    normalizedValue: null,
    scale: null,
  },
  {
    ref: ref('entitlement-resolution'),
    kind: 'W07_ENTITLEMENT',
    criterionId: 'entitlement',
    identity,
    policyRef: policy.ref,
    ruleRefs: [validityRule.ref],
    sourceRefs: [
      entitlement.ref,
      entitlement.application.ref,
      entitlement.application.academicDecisionRef!,
    ],
    outcome: 'VALID',
    normalizedValue: null,
    scale: null,
  },
];
function setup<T extends EvidenceProjection>(source: T, criterionId: string) {
  return {
    source: structuredClone(source),
    context: {
      identity: structuredClone(identity),
      policy: structuredClone(policy),
      policyPin: structuredClone(policy.ref),
      courseVersionPin: structuredClone(cv),
      criterionId,
      sourcePin: structuredClone(source.ref),
      snapshot: {
        [SERVER_READ_SNAPSHOT]: true as const,
        identity: structuredClone(identity),
        policyRef: structuredClone(policy.ref),
        courseVersionRef: structuredClone(cv),
        enrollment: {
          id: identity.enrollmentId,
          learnerId: identity.learnerId,
          classOfferingId: identity.classOfferingId,
        },
        records: [structuredClone(source)],
        decisions: structuredClone(decisions),
        resolutions: structuredClone(resolutions),
      },
    } satisfies EvidenceAdapterContext,
  };
}
type Case<T extends EvidenceProjection> = { source: T; context: EvidenceAdapterContext };
function captured<T extends EvidenceProjection>(f: Case<T>, source: T): Case<T> {
  return {
    source,
    context: {
      ...f.context,
      snapshot: { ...f.context.snapshot!, records: [structuredClone(source)] },
    },
  };
}
function snapshot<T extends EvidenceProjection>(
  f: Case<T>,
  change: Partial<ServerReadSnapshot>,
): Case<T> {
  return { ...f, context: { ...f.context, snapshot: { ...f.context.snapshot!, ...change } } };
}
function expectBlocked(r: EvidenceAdapterResult) {
  expect(r.status).not.toBe('NORMALIZED');
  expect(r.evidence).toBeNull();
}
const adapters = [
  { name: 'W03', source: grade, criterion: 'writing', run: normalizeW03 },
  { name: 'W06', source: attendance, criterion: 'attendance', run: normalizeW06 },
  { name: 'W07', source: entitlement, criterion: 'entitlement', run: normalizeW07 },
];

describe.each(adapters)(
  'W09-DF-S2 $name consistency and provenance boundary',
  ({ source, criterion, run }) => {
    it('normalizes a synthetic server snapshot without claiming independent verification', () => {
      const f = setup(source, criterion),
        r = run(f.source, f.context);
      expect(r.status).toBe('NORMALIZED');
      expect(r.evidence?.ref).toEqual(source.ref);
      expect(r.assurance).toBe('OFFLINE_CONSISTENCY_ONLY');
      expect(r.serverIntegrationRequired).toBe(true);
    });
    it('rejects client approval claims without a server snapshot, including a JSON marker lookalike', () => {
      const f = setup(source, criterion);
      expectBlocked(run(f.source, { ...f.context, snapshot: null }));
      const fake = {
        ...JSON.parse(JSON.stringify(f.context.snapshot)),
        SERVER_READ_SNAPSHOT: true,
      } as ServerReadSnapshot;
      expect(run(f.source, { ...f.context, snapshot: fake }).reason).toBe('UNVERIFIED_PROVENANCE');
    });
    it.each(['learnerId', 'enrollmentId', 'classOfferingId', 'courseVersionId'] as const)(
      'rejects foreign %s',
      (key) => {
        const f = setup(source, criterion);
        expect(
          run({ ...f.source, identity: { ...identity, [key]: 'foreign' } }, f.context).reason,
        ).toBe('IDENTITY_MISMATCH');
      },
    );
    it('rejects inconsistent enrollment binding and forged row contents under the same source pin', () => {
      const f = setup(source, criterion),
        bad = snapshot(f, {
          enrollment: { ...f.context.snapshot!.enrollment, learnerId: 'foreign' },
        });
      expect(run(bad.source, bad.context).reason).toBe('IDENTITY_MISMATCH');
      expect(run({ ...f.source, extraClientApproval: true }, f.context).reason).toBe(
        'SOURCE_CONTRADICTION',
      );
    });
    it('blocks stale source, policy, CourseVersion and rule-resolution pins', () => {
      const f = setup(source, criterion);
      for (const key of ['sourcePin', 'policyPin', 'courseVersionPin'] as const)
        expect(run(f.source, { ...f.context, [key]: ref('stale') }).reason).toBe('STALE_REVISION');
      const bad = snapshot(f, {
        resolutions: f.context.snapshot!.resolutions.map((r) => ({
          ...r,
          sourceRefs: [ref('old-source')],
        })),
      });
      expect(run(bad.source, bad.context).reason).toBe('STALE_REVISION');
    });
    it('requires independently supplied CourseVersion/policy/rule decisions and authorization references', () => {
      const f = setup(source, criterion);
      for (const purpose of ['COURSE_VERSION', 'POLICY', 'RULE']) {
        const bad = snapshot(f, {
          decisions: f.context.snapshot!.decisions.filter((d) => d.purpose !== purpose),
        });
        expectBlocked(run(bad.source, bad.context));
      }
      const missing = snapshot(f, { decisions: [] });
      expectBlocked(run(missing.source, missing.context));
      const rejected = snapshot(f, {
        decisions: f.context.snapshot!.decisions.map((d) =>
          d.purpose === 'POLICY' ? { ...d, state: 'REJECTED' } : d,
        ),
      });
      expect(run(rejected.source, rejected.context).reason).toBe('DECISION_REJECTED');
      const unproved = snapshot(f, {
        decisions: f.context.snapshot!.decisions.map((d) => ({ ...d, authorityRef: ref('') })),
      });
      expectBlocked(run(unproved.source, unproved.context));
    });
    it('keeps absent, draft, unknown-effective policy and unresolved academic rules pending', () => {
      const f = setup(source, criterion);
      for (const p of [
        null,
        { ...policy, state: 'DRAFT' as const },
        { ...policy, applicability: 'UNKNOWN' as const },
      ])
        expect(run(f.source, { ...f.context, policy: p }).reason).toBe('POLICY_UNRESOLVED');
      const bad = snapshot(f, { resolutions: [] });
      expect(run(bad.source, bad.context).reason).toBe('RULE_UNRESOLVED');
    });
    it('does not accept a raw role/APPROVED flag in place of an independent decision or its scope', () => {
      const f = setup(source, criterion);
      const bad = snapshot(f, {
        decisions: f.context.snapshot!.decisions.map((d) =>
          d.purpose === 'COURSE_VERSION' ? { ...d, scopeId: 'another-course-version' } : d,
        ),
      });
      expect(run(bad.source, bad.context).reason).toBe('IDENTITY_MISMATCH');
      const stripped = snapshot(f, { records: [] });
      expect(run(stripped.source, stripped.context).reason).toBe('UNVERIFIED_PROVENANCE');
    });
    it('rejects contradictory duplicate records/decisions/resolutions instead of choosing one', () => {
      const f = setup(source, criterion);
      for (const change of [
        { records: [f.source, f.source] },
        { decisions: [...f.context.snapshot!.decisions, f.context.snapshot!.decisions[0]] },
        {
          resolutions: [
            ...f.context.snapshot!.resolutions,
            f.context.snapshot!.resolutions.find((r) => r.criterionId === criterion)!,
          ],
        },
      ]) {
        const bad = snapshot(f, change);
        expect(run(bad.source, bad.context).reason).toBe('SOURCE_CONTRADICTION');
      }
    });
    it.each([null, {}, [], { ref: null }, { value: Number.NaN }])(
      'does not normalize incomplete input %#',
      (bad) => {
        const f = setup(source, criterion);
        expectBlocked(run(bad, f.context));
      },
    );
    it('rejects cyclic/accessor projections without executing the accessor', () => {
      const f = setup(source, criterion),
        cyclic: Record<string, unknown> = {};
      cyclic.self = cyclic;
      expect(run(cyclic, f.context).reason).toBe('MALFORMED_SOURCE');
      let reads = 0;
      const getter = Object.defineProperty({}, 'identity', {
        enumerable: true,
        get: () => {
          reads++;
          return identity;
        },
      });
      expect(run(getter, f.context).reason).toBe('MALFORMED_SOURCE');
      expect(reads).toBe(0);
    });
    it('accepts structured-cloned plain records but rejects class-instance projections', () => {
      const f = setup(source, criterion);
      expect(run(f.source, f.context).status).toBe('NORMALIZED');
      class CustomProjection {}
      expect(run(Object.assign(new CustomProjection(), f.source), f.context).reason).toBe(
        'MALFORMED_SOURCE',
      );
    });
    it('does not mutate frozen source/context or retain mutable output references', () => {
      const f = setup(source, criterion),
        before = JSON.stringify(f);
      function freeze(x: object) {
        Object.freeze(x);
        for (const value of Object.values(x)) if (value && typeof value === 'object') freeze(value);
      }
      freeze(f);
      const a = run(f.source, f.context),
        b = run(f.source, f.context);
      expect(a).toEqual(b);
      expect(JSON.stringify(f)).toBe(before);
      expect(a.evidence?.ref).not.toBe(f.source.ref);
    });
  },
);

describe('W03 finalized/publication source semantics', () => {
  it.each(['REVIEWED_FINAL', 'DRAFT', 'PROVISIONAL', 'UNKNOWN'])(
    'does not promote assignment %s to PUBLISHED',
    (state) => {
      const f = setup(grade, 'writing'),
        bad = captured(f, { ...f.source, state });
      expect(normalizeW03(bad.source, bad.context).reason).toBe('NOT_PUBLISHED_FINAL');
    },
  );
  it.each([
    'confirmedAt',
    'publishedAt',
    'publishedById',
    'publicationDecisionRef',
    'value',
  ] as const)('requires %s', (key) => {
    const f = setup(grade, 'writing'),
      bad = captured(f, { ...f.source, [key]: null });
    expectBlocked(normalizeW03(bad.source, bad.context));
  });
  it('uses released quiz evidence, not a SUBMITTED attempt alone', () => {
    const f = setup({ ...grade, source: 'W03_QUIZ' as const, state: 'SUBMITTED' }, 'writing');
    expect(normalizeW03(f.source, f.context).status).toBe('NORMALIZED');
    const bad = captured(f, { ...f.source, publishedAt: null });
    expectBlocked(normalizeW03(bad.source, bad.context));
  });
  it('rejects a forged score, wrong publisher, self-publication and inconsistent finalization times', () => {
    const f = setup(grade, 'writing');
    expect(normalizeW03({ ...f.source, value: 999 }, f.context).reason).toBe(
      'SOURCE_CONTRADICTION',
    );
    for (const patch of [
      { publishedById: 'other' },
      { makerIds: ['publisher-A'] },
      { confirmedAt: '2027-01-01T00:00:00Z' },
    ]) {
      const bad = captured(f, { ...f.source, ...patch });
      expectBlocked(normalizeW03(bad.source, bad.context));
    }
  });
  it('retains a real graded zero and never substitutes a missing score', () => {
    const f = setup(grade, 'writing'),
      zero = captured(f, { ...f.source, value: 0 });
    const z = snapshot(zero, {
      resolutions: zero.context.snapshot!.resolutions.map((r) =>
        r.kind === 'W03_GRADE' ? { ...r, normalizedValue: 0 } : r,
      ),
    });
    expect(normalizeW03(z.source, z.context).evidence).toMatchObject({ value: 0 });
    const missing = captured(z, { ...z.source, value: null });
    expectBlocked(normalizeW03(missing.source, missing.context));
  });
});

describe('W06 official learner attendance and correction precedence', () => {
  it.each(['TEACHER_HOURS', 'MEET_CLICK'] as const)(
    'rejects %s as attendance evidence',
    (source) => {
      const f = setup(attendance, 'attendance'),
        bad = captured(f, { ...f.source, source });
      expect(normalizeW06(bad.source, bad.context).reason).toBe('UNSUPPORTED_SOURCE');
    },
  );
  it('replays the complete approved chain, sorted by revision, without changing the raw receipt', () => {
    const f = setup(attendance, 'attendance'),
      r = normalizeW06(f.source, f.context);
    expect(r.status).toBe('NORMALIZED');
    expect(r.effectiveAttendance[0]).toMatchObject({
      status: 'PRESENT',
      version: 2,
      correctionRef: correction2.ref,
    });
    expect(f.source.sessions[0].receipt?.status).toBe('LATE');
  });
  it('does not let a newer pending/rejected correction override the last approved revision', () => {
    const f = setup(attendance, 'attendance');
    const sessions = [
      {
        ...f.source.sessions[0],
        corrections: [
          ...f.source.sessions[0].corrections,
          {
            ...correction2,
            ref: ref('pending'),
            state: 'PENDING_APPROVAL',
            revision: null,
            reviewerId: null,
            reviewedAt: null,
            decisionRef: null,
          },
          { ...correction2, ref: ref('rejected'), state: 'REJECTED', revision: null },
        ],
      },
    ];
    const bad = captured(f, { ...f.source, sessions });
    expect(normalizeW06(bad.source, bad.context).effectiveAttendance[0].version).toBe(2);
  });
  it('keeps provisional receipts and incomplete correction histories pending', () => {
    const f = setup(attendance, 'attendance');
    const partial = captured(f, { ...f.source, historyComplete: false });
    expect(normalizeW06(partial.source, partial.context).reason).toBe(
      'INCOMPLETE_CORRECTION_HISTORY',
    );
    const gap = captured(f, {
      ...f.source,
      sessions: [{ ...f.source.sessions[0], corrections: [correction2] }],
    });
    expect(normalizeW06(gap.source, gap.context).reason).toBe('INCOMPLETE_CORRECTION_HISTORY');
    const provisional = captured(f, {
      ...f.source,
      sessions: [
        {
          ...f.source.sessions[0],
          receipt: { ...f.source.sessions[0].receipt!, state: 'PROVISIONAL' },
        },
      ],
    });
    expectBlocked(normalizeW06(provisional.source, provisional.context));
  });
  it('rejects competing correction revisions, invalid before-state and same maker/reviewer', () => {
    const f = setup(attendance, 'attendance');
    for (const corrections of [
      [correction1, { ...correction1, ref: ref('conflicting') }],
      [{ ...correction1, beforeStatus: 'PRESENT' }],
      [{ ...correction1, makerId: 'reviewer-A' }],
    ]) {
      const bad = captured(f, {
        ...f.source,
        sessions: [{ ...f.source.sessions[0], corrections }],
      });
      expect(normalizeW06(bad.source, bad.context).reason).toBe('CORRECTION_CONFLICT');
    }
  });
  it('rejects reuse of one immutable correction ID across different revisions', () => {
    const f = setup(attendance, 'attendance');
    const bad = captured(f, {
      ...f.source,
      sessions: [
        {
          ...f.source.sessions[0],
          corrections: [
            correction1,
            { ...correction2, ref: { ...correction2.ref, id: correction1.ref.id } },
          ],
        },
      ],
    });
    expect(normalizeW06(bad.source, bad.context).reason).toBe('CORRECTION_CONFLICT');
  });
  it('blocks absent correction authorization, draft/foreign sessions and wrong learner/window links', () => {
    const f = setup(attendance, 'attendance');
    const noDecisions = snapshot(f, {
      decisions: f.context.snapshot!.decisions.filter((d) => d.purpose !== 'W06_CORRECTION'),
    });
    expectBlocked(normalizeW06(noDecisions.source, noDecisions.context));
    for (const session of [
      { ...attendance.sessions[0], state: 'DRAFT' },
      { ...attendance.sessions[0], classOfferingId: 'foreign' },
      {
        ...attendance.sessions[0],
        receipt: { ...attendance.sessions[0].receipt!, learnerId: 'foreign' },
      },
      {
        ...attendance.sessions[0],
        corrections: [{ ...correction1, windowRef: ref('other-window') }],
      },
    ]) {
      const bad = captured(f, { ...f.source, sessions: [session] });
      expectBlocked(normalizeW06(bad.source, bad.context));
    }
  });
  it('rejects malformed/null sessions and contradictory pending correction metadata', () => {
    const f = setup(attendance, 'attendance');
    const malformed = captured(f, { ...f.source, sessions: [null] } as unknown as W06Projection);
    expect(normalizeW06(malformed.source, malformed.context).reason).toBe('MALFORMED_SOURCE');
    const bad = captured(f, {
      ...f.source,
      sessions: [
        {
          ...f.source.sessions[0],
          corrections: [
            ...f.source.sessions[0].corrections,
            {
              ...correction2,
              ref: ref('contradictory-pending'),
              state: 'PENDING_APPROVAL',
              revision: null,
            },
          ],
        },
      ],
    });
    expect(normalizeW06(bad.source, bad.context).reason).toBe('SOURCE_CONTRADICTION');
  });
  it('does not infer SATISFIED from attendance status without an approved resolved calculation', () => {
    const f = setup(attendance, 'attendance');
    const unknown = snapshot(f, {
      resolutions: f.context.snapshot!.resolutions.map((r) =>
        r.kind === 'W06_ATTENDANCE' ? { ...r, outcome: 'UNKNOWN' } : r,
      ),
    });
    expect(normalizeW06(unknown.source, unknown.context).reason).toBe('RULE_UNRESOLVED');
  });
});

describe('W07 admission provenance without invented effective-time policy', () => {
  it.each(['PENDING_CAPACITY', 'BLOCKED_REVIEW', 'UNKNOWN'])(
    'keeps %s entitlement pending',
    (entitlementOutcome) => {
      const f = setup(entitlement, 'entitlement'),
        bad = captured(f, { ...f.source, entitlementOutcome, entitlementEnrollmentId: null });
      expectBlocked(normalizeW07(bad.source, bad.context));
    },
  );
  it('rejects a blocked event that contradictorily claims an activated enrollment link', () => {
    const f = setup(entitlement, 'entitlement');
    const bad = captured(f, { ...f.source, entitlementOutcome: 'BLOCKED_REVIEW' });
    expect(normalizeW07(bad.source, bad.context).reason).toBe('SOURCE_CONTRADICTION');
  });
  it('rejects foreign enrollment/application/decision and missing admission provenance', () => {
    const f = setup(entitlement, 'entitlement');
    for (const raw of [
      { ...f.source, entitlementEnrollmentId: 'foreign' },
      { ...f.source, application: { ...f.source.application, learnerId: 'foreign' } },
      { ...f.source, application: { ...f.source.application, academicDecisionRef: null } },
    ]) {
      const bad = captured(f, raw);
      expectBlocked(normalizeW07(bad.source, bad.context));
    }
    const rejected = snapshot(f, {
      decisions: f.context.snapshot!.decisions.map((d) =>
        d.purpose === 'W07_ADMISSION' ? { ...d, state: 'REJECTED' } : d,
      ),
    });
    expect(normalizeW07(rejected.source, rejected.context).reason).toBe('DECISION_REJECTED');
    const self = snapshot(f, {
      decisions: f.context.snapshot!.decisions.map((d) =>
        d.purpose === 'W07_ADMISSION' ? { ...d, actorId: identity.learnerId } : d,
      ),
    });
    expectBlocked(normalizeW07(self.source, self.context));
  });
  it('does not decide ACTIVE-at-issue versus historical validity from enrollment status', () => {
    const f = setup(entitlement, 'entitlement'),
      historical = captured(f, { ...f.source, enrollmentStatus: 'COMPLETED' });
    const missing = snapshot(historical, { resolutions: [] });
    expectBlocked(normalizeW07(missing.source, missing.context));
    // Both outcomes are explicit synthetic validity-rule resolutions, not S2 policy choices.
    for (const outcome of ['VALID', 'INVALID'] as const) {
      const resolved = snapshot(historical, {
        resolutions: historical.context.snapshot!.resolutions.map((r) =>
          r.kind === 'W07_ENTITLEMENT' ? { ...r, outcome } : r,
        ),
      });
      expect(normalizeW07(resolved.source, resolved.context).evidence).toMatchObject({ outcome });
    }
  });
});

describe('S2 output interoperability with the unchanged S1 evaluator', () => {
  it('produces S1 evidence for synthetic valid/pending/failing cases without issuance', () => {
    const g = setup(grade, 'writing'),
      a = setup(attendance, 'attendance'),
      e = setup(entitlement, 'entitlement');
    const evidence = [
      normalizeW03(g.source, g.context),
      normalizeW06(a.source, a.context),
      normalizeW07(e.source, e.context),
    ].flatMap((r) => (r.evidence ? [r.evidence] : []));
    const input: CompletionInput = {
      scope: identity,
      courseVersion: { ref: cv, state: 'APPROVED', approval: approve('approve-cv') },
      courseVersionPin: cv,
      policy,
      policyPin: policy.ref,
      evidencePins: {
        writing: grade.ref,
        attendance: attendance.ref,
        entitlement: entitlement.ref,
      },
      evidence,
      exemptions: [],
    };
    expect(evaluateCompletion(input).state).toBe('ELIGIBLE_FOR_REVIEW');
    expect(evaluateCompletion({ ...input, evidence: evidence.slice(1) }).state).toBe(
      'PENDING_EVIDENCE',
    );
    expect(
      evaluateCompletion({
        ...input,
        evidence: evidence.map((r) => (r.kind === 'W03_GRADE' ? { ...r, value: 0 } : r)),
      }).state,
    ).toBe('NOT_ELIGIBLE');
  });
});
