import { evaluateCompletion } from './completion-evaluator';
import type { ApprovedRule, CompletionInput, EvidenceReference } from './completion.contracts';
import type {
  CertificateActorRead,
  CertificateIssuePreflight,
  CertificateReviewCheck,
  ScopedCompletionAssessment,
} from './certificate-review.contracts';
import {
  simulateCertificateIssuePreflight,
  simulateCertificateReviewEligibility,
} from './certificate-review-guards';
import { TrustedCompletionEvidenceReader } from './trusted-evidence-reader';

// All values below are synthetic. No real policy threshold, grant or review exists.
const ref = (id: string, revision = 'synthetic-1'): EvidenceReference => ({ id, revision });
const approval = (id: string) => ({
  decisionId: id,
  actorId: 'synthetic-academic',
  approvedAt: '2026-01-01T00:00:00Z',
});
const rule = (id: string): ApprovedRule => ({ ref: ref(id), approval: approval(id) });
const identity = {
  learnerId: 'learner-A',
  enrollmentId: 'enrollment-A',
  classOfferingId: 'class-A',
  courseVersionId: 'cv-A',
};
const scope = {
  enrollmentId: identity.enrollmentId,
  classOfferingId: identity.classOfferingId,
  courseVersionId: identity.courseVersionId,
};
const target = { identity, courseVersionPin: ref('cv-A'), policyPin: ref('policy-A') };
const selection = rule('grade-selection'),
  rounding = rule('rounding'),
  attendance = rule('attendance-calculation'),
  entitlement = rule('entitlement-validity');
const completion = (): CompletionInput => ({
  scope,
  courseVersion: {
    ref: target.courseVersionPin,
    state: 'APPROVED',
    approval: approval('cv-approval'),
  },
  courseVersionPin: target.courseVersionPin,
  policyPin: target.policyPin,
  policy: {
    ref: target.policyPin,
    courseVersionRef: target.courseVersionPin,
    state: 'APPROVED',
    approval: approval('policy-approval'),
    applicabilityRule: rule('applicability'),
    applicability: 'APPLICABLE',
    criteria: [
      {
        id: 'grade',
        mandatory: true,
        kind: 'W03_GRADE',
        threshold: { minimum: 3, scale: 'SYNTHETIC_ONLY' },
        selectionRule: selection,
        roundingRule: rounding,
        exemptionRule: null,
      },
      {
        id: 'attendance',
        mandatory: true,
        kind: 'W06_ATTENDANCE',
        calculationRule: attendance,
        exemptionRule: null,
      },
      { id: 'entitlement', mandatory: true, kind: 'W07_ENTITLEMENT', validityRule: entitlement },
    ],
  },
  evidencePins: {
    grade: ref('grade'),
    attendance: ref('attendance'),
    entitlement: ref('entitlement'),
  },
  evidence: [
    {
      ref: ref('grade'),
      scope,
      criterionId: 'grade',
      kind: 'W03_GRADE',
      state: 'PUBLISHED',
      finalized: true,
      publication: approval('publication'),
      selectionRuleRef: selection.ref,
      roundingRuleRef: rounding.ref,
      value: 4,
      scale: 'SYNTHETIC_ONLY',
    },
    {
      ref: ref('attendance'),
      scope,
      criterionId: 'attendance',
      kind: 'W06_ATTENDANCE',
      state: 'OFFICIAL_CONFIRMED',
      sessionRefs: [ref('session')],
      receiptRefs: [ref('receipt')],
      corrections: [],
      calculationRuleRef: attendance.ref,
      outcome: 'SATISFIED',
    },
    {
      ref: ref('entitlement'),
      scope,
      criterionId: 'entitlement',
      kind: 'W07_ENTITLEMENT',
      state: 'AUTHORIZED',
      authorizationRef: ref('entitlement-decision'),
      validityRuleRef: entitlement.ref,
      outcome: 'VALID',
    },
  ],
  exemptions: [],
});
const read = (): ScopedCompletionAssessment => ({
  request: target,
  result: {
    status: 'ASSESSED',
    reason: 'ASSESSED',
    assessment: evaluateCompletion(completion()),
    manifestRef: ref('manifest'),
    diagnostics: ['grade', 'attendance', 'entitlement'].map((criterionId) => ({
      criterionId,
      reason: 'NORMALIZED',
    })),
    assurance: 'OFFLINE_REPOSITORY_CONTRACT_ONLY',
    runtimeVerified: false,
    serverIntegrationRequired: true,
  },
});
const staff = (
  principalId: string,
  capability: 'certificate.review' | 'certificate.issue',
): CertificateActorRead => ({
  identity: {
    principalId,
    personId: 'person-' + principalId,
    role: 'ACADEMIC_MANAGER',
    sessionRef: ref('session-' + principalId),
  },
  sessionState: 'AUTHENTICATED',
  authorization: 'AUTHORIZED',
  grant: {
    ref: ref('grant-' + principalId),
    principalId,
    capability,
    classOfferingId: identity.classOfferingId,
    state: 'ACTIVE',
    validity: 'VALID',
    authorityEpoch: 'epoch-1',
    decision: {
      ref: ref('grant-decision-' + principalId),
      authorityRef: ref('grant-authority'),
      requestedByPersonId: 'grant-requester',
      approvedByPersonId: 'independent-grant-approver',
    },
  },
});
type Mutable<T> = { -readonly [K in keyof T]: T[K] };
function reviewInput(): Mutable<CertificateReviewCheck> {
  const c = completion(),
    actor = staff('reviewer', 'certificate.review');
  return structuredClone({
    target,
    candidate: read(),
    actorAtSelection: actor,
    actorNow: actor,
    current: {
      assessment: read(),
      courseVersion: c.courseVersion,
      policy: c.policy,
      academicRules: 'RESOLVED',
      holds: {
        ref: ref('hold-read'),
        identity,
        policyRef: target.policyPin,
        manifestRef: ref('manifest'),
        governingRule: rule('approved-synthetic-hold-semantics'),
        completeness: 'COMPLETE',
        conflicts: 'NONE',
      },
    },
  });
}
function issueInput(): Mutable<CertificateIssuePreflight> {
  const input = reviewInput(),
    issuer = staff('issuer', 'certificate.issue'),
    reviewer = staff('reviewer', 'certificate.review');
  return structuredClone({
    ...input,
    actorAtSelection: issuer,
    actorNow: issuer,
    priorReview: {
      ref: ref('prior-synthetic-review'),
      state: 'APPROVED',
      target,
      manifestRef: ref('manifest'),
      reviewerAtDecision: reviewer,
    },
    reviewerNow: reviewer,
  });
}
function freeze(value: unknown) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
}

describe('W09-DF-S4A pure certificate review and future issuer guards', () => {
  it('accepts a structurally complete S1/S3A basis for offline review simulation only', () => {
    const r = simulateCertificateReviewEligibility(reviewInput());
    expect(r).toEqual({
      action: 'REVIEW',
      decision: 'SIMULATED_ELIGIBLE',
      reason: 'SIMULATED_ELIGIBLE',
      assurance: 'OFFLINE_AUTHORIZATION_SIMULATION_ONLY',
      runtimeAuthorized: false,
      requiresServerVerification: true,
    });
    expect(r).not.toHaveProperty('reviewDecision');
    expect(r).not.toHaveProperty('certificate');
  });
  it('does not require choosing an issuer before a reviewer can check eligibility', () => {
    expect(simulateCertificateReviewEligibility(reviewInput()).decision).toBe('SIMULATED_ELIGIBLE');
  });
  it('permits only a simulated future preflight with distinct reviewer/issuer and current grants', () => {
    const r = simulateCertificateIssuePreflight(issueInput());
    expect(r.action).toBe('ISSUE_PREFLIGHT');
    expect(r.decision).toBe('SIMULATED_ELIGIBLE');
    expect(r.runtimeAuthorized).toBe(false);
    expect(r).not.toHaveProperty('certificateId');
    expect(r).not.toHaveProperty('issued');
  });
  it.each([
    'SYSTEM_ADMIN',
    'INSTRUCTOR',
    'STUDENT',
    'CASHIER',
    'COUNSELOR',
    'TEACHING_INSPECTOR',
    'ADMIN_COORDINATOR',
    'UNKNOWN',
  ])('denies implicit review permission for %s', (role) => {
    const x = reviewInput();
    x.actorNow = { ...x.actorNow, identity: { ...x.actorNow.identity, role } };
    expect(simulateCertificateReviewEligibility(x).reason).toBe('ROLE_DENIED');
  });
  it.each(['learnerId', 'enrollmentId', 'classOfferingId', 'courseVersionId'] as const)(
    'rejects foreign %s in the assessment binding',
    (key) => {
      const x = reviewInput();
      x.candidate = {
        ...x.candidate,
        request: {
          ...x.candidate.request,
          identity: { ...x.candidate.request.identity, [key]: 'foreign' },
        },
      };
      expect(simulateCertificateReviewEligibility(x).reason).toBe('SCOPE_MISMATCH');
    },
  );
  it('rejects a mismatched assessment enrollment even when its envelope claims the correct scope', () => {
    const x = reviewInput();
    const a = x.current.assessment.result.assessment!;
    x.current = {
      ...x.current,
      assessment: {
        ...x.current.assessment,
        result: {
          ...x.current.assessment.result,
          assessment: { ...a, scope: { ...a.scope, enrollmentId: 'foreign' } },
        },
      },
    };
    expect(simulateCertificateReviewEligibility(x).reason).toBe('SCOPE_MISMATCH');
  });
  it.each(['DRAFT', 'REVOKED', 'UNKNOWN'] as const)('blocks an unapproved %s policy', (state) => {
    const x = reviewInput();
    x.current = { ...x.current, policy: { ...x.current.policy!, state } };
    expect(simulateCertificateReviewEligibility(x).reason).toBe('POLICY_UNRESOLVED');
  });
  it('blocks missing policy, unknown applicability, missing authority and unknown academic rules', () => {
    const inputs = [reviewInput(), reviewInput(), reviewInput(), reviewInput()];
    inputs[0].current = { ...inputs[0].current, policy: null };
    inputs[1].current = {
      ...inputs[1].current,
      policy: { ...inputs[1].current.policy!, applicability: 'UNKNOWN' },
    };
    inputs[2].current = {
      ...inputs[2].current,
      policy: { ...inputs[2].current.policy!, approval: null },
    };
    inputs[3].current = { ...inputs[3].current, academicRules: 'UNKNOWN' };
    for (const x of inputs)
      expect(simulateCertificateReviewEligibility(x).reason).toBe('POLICY_UNRESOLVED');
  });
  it('does not invent a grade threshold or attendance denominator rule', () => {
    for (const kind of ['W03_GRADE', 'W06_ATTENDANCE'] as const) {
      const x = reviewInput(),
        p = x.current.policy!;
      x.current = {
        ...x.current,
        policy: {
          ...p,
          criteria: p.criteria.map((c) =>
            c.kind === kind
              ? c.kind === 'W03_GRADE'
                ? { ...c, threshold: null }
                : { ...c, calculationRule: null }
              : c,
          ),
        },
      };
      expect(simulateCertificateReviewEligibility(x).reason).toBe('POLICY_UNRESOLVED');
    }
  });
  it('does not invent entitlement timing', () => {
    const x = reviewInput(),
      p = x.current.policy!;
    x.current = {
      ...x.current,
      policy: {
        ...p,
        criteria: p.criteria.map((c) =>
          c.kind === 'W07_ENTITLEMENT' ? { ...c, validityRule: null } : c,
        ),
      },
    };
    expect(simulateCertificateReviewEligibility(x).reason).toBe('POLICY_UNRESOLVED');
  });
  it('blocks unapproved CourseVersion or changed policy revision', () => {
    const x = reviewInput();
    x.current = { ...x.current, courseVersion: { ...x.current.courseVersion!, state: 'DRAFT' } };
    expect(simulateCertificateReviewEligibility(x).reason).toBe('POLICY_UNRESOLVED');
    const y = reviewInput();
    y.current = { ...y.current, policy: { ...y.current.policy!, ref: ref('policy-A', 'changed') } };
    expect(simulateCertificateReviewEligibility(y).reason).toBe('POLICY_UNRESOLVED');
  });
  it.each(['PENDING', 'REJECTED', 'DENIED'] as const)('blocks S3A %s result', (status) => {
    const x = reviewInput();
    x.candidate = { ...x.candidate, result: { ...x.candidate.result, status, assessment: null } };
    expect(simulateCertificateReviewEligibility(x).reason).toBe('EVIDENCE_UNAVAILABLE');
  });
  it('consumes an actual denied S3A reader result without promoting it to review permission', async () => {
    const openRead = jest.fn(() => {
      throw Error('must not open');
    });
    const reader = new TrustedCompletionEvidenceReader({
      access: {
        authorizeRead: async () => ({
          state: 'DENIED',
          principal: { id: 'staff', sessionId: 'session' },
          identity,
          decisionRef: ref('denied'),
          authorityRef: ref('authority'),
          authorityEpoch: '1',
        }),
      },
      openRead,
    });
    const denied = await reader.assess({ id: 'staff', sessionId: 'session' }, target);
    const x = reviewInput();
    x.candidate = { request: target, result: denied };
    expect(simulateCertificateReviewEligibility(x).reason).toBe('EVIDENCE_UNAVAILABLE');
    expect(openRead).not.toHaveBeenCalled();
  });
  it('preserves a real mandatory graded failure and pending evidence', () => {
    for (const state of ['NOT_ELIGIBLE', 'PENDING_EVIDENCE'] as const) {
      const x = reviewInput();
      x.candidate = {
        ...x.candidate,
        result: { ...x.candidate.result, assessment: { ...x.candidate.result.assessment!, state } },
      };
      expect(simulateCertificateReviewEligibility(x).decision).toBe('BLOCKED');
    }
  });
  it('rejects forged ELIGIBLE state with a pending mandatory criterion', () => {
    const x = reviewInput(),
      a = x.candidate.result.assessment!;
    x.candidate = {
      ...x.candidate,
      result: {
        ...x.candidate.result,
        assessment: {
          ...a,
          criteria: a.criteria.map((c, i) => (i === 0 ? { ...c, status: 'PENDING' } : c)),
        },
      },
    };
    expect(simulateCertificateReviewEligibility(x).reason).toBe('CONTRADICTORY_ASSESSMENT');
  });
  it('does not approve an exemption from a summary alone', () => {
    const x = reviewInput(),
      a = x.candidate.result.assessment!;
    x.candidate = {
      ...x.candidate,
      result: {
        ...x.candidate.result,
        assessment: {
          ...a,
          criteria: a.criteria.map((c, i) =>
            i === 0 ? { ...c, status: 'NOT_APPLICABLE', reason: 'APPROVED_EXEMPTION' } : c,
          ),
        },
      },
    };
    expect(simulateCertificateReviewEligibility(x).reason).toBe('EXEMPTION_UNVERIFIED');
  });
  it('detects changed source manifest/ABA token', () => {
    const x = reviewInput();
    x.current = {
      ...x.current,
      assessment: {
        ...x.current.assessment,
        result: { ...x.current.assessment.result, manifestRef: ref('manifest', 'after-ABA') },
      },
    };
    expect(simulateCertificateReviewEligibility(x).reason).toBe('STALE_EVIDENCE');
  });
  it('detects a changed source revision even when a provider incorrectly reuses its manifest', () => {
    const x = reviewInput(),
      r = x.current.assessment.result;
    x.current = {
      ...x.current,
      assessment: {
        ...x.current.assessment,
        result: {
          ...r,
          assessment: {
            ...r.assessment!,
            criteria: r.assessment!.criteria.map((c, i) =>
              i === 0 ? { ...c, evidenceRef: ref('grade', 'new') } : c,
            ),
          },
        },
      },
    };
    expect(simulateCertificateReviewEligibility(x).reason).toBe('STALE_EVIDENCE');
  });
  it('allows criterion ordering differences without pooling source identities', () => {
    const x = reviewInput(),
      r = x.current.assessment.result;
    x.current = {
      ...x.current,
      assessment: {
        ...x.current.assessment,
        result: {
          ...r,
          assessment: { ...r.assessment!, criteria: [...r.assessment!.criteria].reverse() },
        },
      },
    };
    expect(simulateCertificateReviewEligibility(x).decision).toBe('SIMULATED_ELIGIBLE');
  });
  it.each(['UNKNOWN', 'PRESENT'] as const)('blocks %s holds', (conflicts) => {
    const x = reviewInput();
    x.current = { ...x.current, holds: { ...x.current.holds, conflicts } };
    expect(simulateCertificateReviewEligibility(x).decision).toBe('BLOCKED');
  });
  it('requires an approved hold rule, complete read and same scope/manifest', () => {
    const xs = [reviewInput(), reviewInput(), reviewInput(), reviewInput()];
    xs[0].current = { ...xs[0].current, holds: { ...xs[0].current.holds, governingRule: null } };
    xs[1].current = {
      ...xs[1].current,
      holds: { ...xs[1].current.holds, completeness: 'INCOMPLETE' },
    };
    xs[2].current = {
      ...xs[2].current,
      holds: { ...xs[2].current.holds, identity: { ...identity, classOfferingId: 'foreign' } },
    };
    xs[3].current = {
      ...xs[3].current,
      holds: { ...xs[3].current.holds, manifestRef: ref('stale') },
    };
    for (const x of xs)
      expect(simulateCertificateReviewEligibility(x).decision).not.toBe('SIMULATED_ELIGIBLE');
  });
  it.each(['EXPIRED', 'UNKNOWN'] as const)('blocks %s sessions', (sessionState) => {
    const x = reviewInput();
    x.actorNow = { ...x.actorNow, sessionState };
    expect(simulateCertificateReviewEligibility(x).decision).not.toBe('SIMULATED_ELIGIBLE');
  });
  it('denies missing grants, denied authorization and an issue grant used for review', () => {
    const xs = [reviewInput(), reviewInput(), reviewInput()];
    xs[0].actorNow = { ...xs[0].actorNow, grant: null };
    xs[1].actorNow = { ...xs[1].actorNow, authorization: 'DENIED' };
    xs[2].actorNow = {
      ...xs[2].actorNow,
      grant: { ...xs[2].actorNow.grant!, capability: 'certificate.issue' },
    };
    for (const x of xs) expect(simulateCertificateReviewEligibility(x).decision).toBe('DENIED');
  });
  it('denies cross-class or foreign-principal grants', () => {
    for (const change of [{ classOfferingId: 'foreign' }, { principalId: 'foreign' }]) {
      const x = reviewInput();
      x.actorNow = { ...x.actorNow, grant: { ...x.actorNow.grant!, ...change } };
      expect(simulateCertificateReviewEligibility(x).reason).toBe('GRANT_DENIED');
    }
  });
  it.each(['REVOKED', 'UNKNOWN'] as const)('fails closed for %s current grant', (state) => {
    const x = reviewInput();
    x.actorNow = { ...x.actorNow, grant: { ...x.actorNow.grant!, state } };
    expect(simulateCertificateReviewEligibility(x).decision).not.toBe('SIMULATED_ELIGIBLE');
  });
  it.each(['INVALID', 'UNKNOWN'] as const)('fails closed for %s grant validity', (validity) => {
    const x = reviewInput();
    x.actorNow = { ...x.actorNow, grant: { ...x.actorNow.grant!, validity } };
    expect(simulateCertificateReviewEligibility(x).decision).not.toBe('SIMULATED_ELIGIBLE');
  });
  it('blocks a changed authorization epoch or grant revision', () => {
    for (const change of [
      { authorityEpoch: 'revoked-and-regranted' },
      { ref: ref('grant-reviewer', 'new') },
    ]) {
      const x = reviewInput();
      x.actorNow = { ...x.actorNow, grant: { ...x.actorNow.grant!, ...change } };
      expect(simulateCertificateReviewEligibility(x).reason).toBe('AUTHORIZATION_CHANGED');
    }
  });
  it('denies self-approved permission grants and missing authority lineage', () => {
    const x = reviewInput();
    x.actorNow = {
      ...x.actorNow,
      grant: {
        ...x.actorNow.grant!,
        decision: {
          ...x.actorNow.grant!.decision,
          approvedByPersonId: x.actorNow.identity.personId,
        },
      },
    };
    expect(simulateCertificateReviewEligibility(x).decision).toBe('DENIED');
    const y = reviewInput();
    y.actorNow = {
      ...y.actorNow,
      grant: {
        ...y.actorNow.grant!,
        decision: { ...y.actorNow.grant!.decision, authorityRef: ref('') },
      },
    };
    expect(simulateCertificateReviewEligibility(y).reason).toBe('GRANT_UNVERIFIED');
  });
  it('requires a prior approved review for future issuer preflight', () => {
    const x = issueInput();
    x.priorReview = null;
    expect(simulateCertificateIssuePreflight(x).reason).toBe('REVIEW_REQUIRED');
    for (const state of ['PENDING', 'REJECTED'] as const) {
      const y = issueInput();
      y.priorReview = { ...y.priorReview!, state };
      expect(simulateCertificateIssuePreflight(y).reason).toBe('REVIEW_REQUIRED');
    }
  });
  it('rejects stale or foreign prior review', () => {
    const x = issueInput();
    x.priorReview = { ...x.priorReview!, manifestRef: ref('old') };
    expect(simulateCertificateIssuePreflight(x).reason).toBe('STALE_REVIEW');
    const y = issueInput();
    y.priorReview = {
      ...y.priorReview!,
      target: { ...target, identity: { ...identity, learnerId: 'foreign' } },
    };
    expect(simulateCertificateIssuePreflight(y).reason).toBe('STALE_REVIEW');
  });
  it('blocks a reviewer whose grant has since been revoked', () => {
    const x = issueInput();
    x.reviewerNow = { ...x.reviewerNow!, grant: { ...x.reviewerNow!.grant!, state: 'REVOKED' } };
    expect(simulateCertificateIssuePreflight(x).decision).toBe('DENIED');
  });
  it('denies same-account review+issue even with distinct role grants', () => {
    const x = issueInput(),
      reviewer = staff('issuer', 'certificate.review');
    x.reviewerNow = reviewer;
    x.priorReview = { ...x.priorReview!, reviewerAtDecision: reviewer };
    expect(simulateCertificateIssuePreflight(x).reason).toBe('SAME_PERSON_REVIEW_AND_ISSUE');
  });
  it('denies different accounts belonging to the same actual person', () => {
    const x = issueInput(),
      reviewer = {
        ...x.reviewerNow!,
        identity: { ...x.reviewerNow!.identity, personId: x.actorNow.identity.personId },
      };
    x.reviewerNow = reviewer;
    x.priorReview = { ...x.priorReview!, reviewerAtDecision: reviewer };
    expect(simulateCertificateIssuePreflight(x).reason).toBe('SAME_PERSON_REVIEW_AND_ISSUE');
  });
  it('does not authenticate approved:true or a client asserted SERVER_VERIFIED marker', () => {
    const x = {
      ...reviewInput(),
      approved: true,
      serverVerified: true,
      verification: 'SERVER_VERIFIED',
    };
    expect(simulateCertificateReviewEligibility(x).runtimeAuthorized).toBe(false);
    const y = reviewInput();
    y.candidate = {
      ...y.candidate,
      result: {
        ...y.candidate.result,
        runtimeVerified: true,
      } as unknown as ScopedCompletionAssessment['result'],
    };
    expect(simulateCertificateReviewEligibility(y).reason).toBe('EVIDENCE_UNAVAILABLE');
  });
  it('is deterministic and preserves all input objects', () => {
    const x = issueInput(),
      before = JSON.stringify(x);
    freeze(x);
    expect(simulateCertificateIssuePreflight(x)).toEqual(simulateCertificateIssuePreflight(x));
    expect(JSON.stringify(x)).toBe(before);
  });
  it.each([0, null])(
    'uses a real S1 grade %s result without converting pending to zero or review permission',
    (value) => {
      const source = completion();
      const evaluated = evaluateCompletion({
        ...source,
        evidence: source.evidence.map((e) => (e.kind === 'W03_GRADE' ? { ...e, value } : e)),
      });
      expect(evaluated.state).toBe(value === null ? 'PENDING_EVIDENCE' : 'NOT_ELIGIBLE');
      const x = reviewInput();
      x.candidate = { ...x.candidate, result: { ...x.candidate.result, assessment: evaluated } };
      expect(simulateCertificateReviewEligibility(x).decision).toBe('BLOCKED');
    },
  );
  it('rejects contradictory pass reasons even when both read envelopes repeat the forgery', () => {
    const x = reviewInput(),
      a = x.candidate.result.assessment!;
    const forged = {
      ...a,
      criteria: a.criteria.map((c, i) =>
        i === 0 ? { ...c, reason: 'GRADE_BELOW_THRESHOLD' as const } : c,
      ),
    };
    x.candidate = { ...x.candidate, result: { ...x.candidate.result, assessment: forged } };
    x.current = {
      ...x.current,
      assessment: {
        ...x.current.assessment,
        result: { ...x.current.assessment.result, assessment: forged },
      },
    };
    expect(simulateCertificateReviewEligibility(x).reason).toBe('CONTRADICTORY_ASSESSMENT');
  });
  it('rejects missing source references and repeated criterion identities', () => {
    for (const repeat of [false, true]) {
      const x = reviewInput(),
        a = x.candidate.result.assessment!;
      x.candidate = {
        ...x.candidate,
        result: {
          ...x.candidate.result,
          assessment: {
            ...a,
            criteria: repeat
              ? [...a.criteria, a.criteria[0]]
              : a.criteria.map((c, i) => (i === 0 ? { ...c, evidenceRef: null } : c)),
          },
        },
      };
      expect(simulateCertificateReviewEligibility(x).reason).toBe('CONTRADICTORY_ASSESSMENT');
    }
  });
  it('blocks changed canonical person or session revisions without trusting account continuity', () => {
    const person = reviewInput();
    person.actorNow = {
      ...person.actorNow,
      identity: { ...person.actorNow.identity, personId: 'new-person' },
    };
    expect(simulateCertificateReviewEligibility(person).reason).toBe('AUTHORIZATION_CHANGED');
    const session = reviewInput();
    session.actorNow = {
      ...session.actorNow,
      identity: { ...session.actorNow.identity, sessionRef: ref('session-reviewer', 'new') },
    };
    expect(simulateCertificateReviewEligibility(session).reason).toBe('AUTHORIZATION_CHANGED');
  });
  it('blocks unknown authorization even if the rest of the grant looks valid', () => {
    const x = reviewInput();
    x.actorNow = { ...x.actorNow, authorization: 'UNKNOWN' };
    expect(simulateCertificateReviewEligibility(x).reason).toBe('GRANT_UNVERIFIED');
  });
  it('does not substitute an empty or different policy criterion set for the evaluated set', () => {
    const x = reviewInput(),
      p = x.current.policy!;
    x.current = { ...x.current, policy: { ...p, criteria: p.criteria.slice(1) } };
    expect(simulateCertificateReviewEligibility(x).reason).toBe('CONTRADICTORY_ASSESSMENT');
  });
  it('fails closed for malformed data without throwing or exposing private input', () => {
    for (const value of [null, {}, { privateSecret: 'must-not-leak' }]) {
      const r = simulateCertificateReviewEligibility(value as unknown as CertificateReviewCheck);
      expect(r.decision).toBe('BLOCKED');
      expect(r.runtimeAuthorized).toBe(false);
      expect(JSON.stringify(r)).not.toContain('must-not-leak');
    }
  });
});
