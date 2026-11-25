import type {
  AcademicApproval,
  ApprovedRule,
  CompletionCriterion,
  CompletionPolicy,
  EvidenceReference,
} from './completion.contracts';
import type {
  AcademicResolution,
  DecisionProvenance,
  EvidenceIdentity,
  EvidenceProjection,
  W03Projection,
  W06Projection,
  W07Projection,
} from './evidence-adapter.contracts';
import { SERVER_READ_SNAPSHOT } from './evidence-adapter.contracts';
import type {
  CompletionReadManifest,
  CompletionReadRequest,
  CompletionReadSession,
  EnrollmentEvidenceBinding,
  ReadAuthorization,
  ScopedRead,
  ServerReadPrincipal,
  TrustedEvidenceRepositories,
} from './trusted-evidence.contracts';
import { TrustedCompletionEvidenceReader } from './trusted-evidence-reader';

// Independent synthetic fixture definitions copied from the S2 example data only.
// No spec import, ORM, application module, actual grant or real academic defaults.
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

const principal: ServerReadPrincipal = {
  id: identity.learnerId,
  sessionId: 'owned-synthetic-session',
};
const request = (): CompletionReadRequest =>
  structuredClone({ identity, courseVersionPin: cv, policyPin: policy.ref });
const envelope = <T>(
  head: CompletionReadManifest,
  pin: EvidenceReference,
  value: T,
): ScopedRead<T> => ({
  manifestRef: structuredClone(head.ref),
  revisionRef: structuredClone(pin),
  completeness: 'COMPLETE',
  value: structuredClone(value),
});

class MemoryRepositories implements TrustedEvidenceRepositories {
  readonly calls: string[] = [];
  opens = 0;
  closes = 0;
  authReads = 0;
  manifests = 0;
  closeThrows = false;
  denied = false;
  authorizationValue: ReadAuthorization = {
    state: 'AUTHORIZED',
    principal,
    identity,
    decisionRef: ref('read-authority-decision'),
    authorityRef: ref('independent-read-authority'),
    authorityEpoch: 'scope-epoch-1',
  };
  head: CompletionReadManifest = {
    ref: ref('snapshot', 'epoch-1'),
    identity,
    courseVersionPin: cv,
    policyPin: policy.ref,
    bindingPin: ref('enrollment-class-binding'),
    lineagePin: ref('policy-approval-resolution-lineage'),
    selections: [
      { criterionId: 'writing', kind: 'W03_GRADE', sourcePin: grade.ref },
      { criterionId: 'attendance', kind: 'W06_ATTENDANCE', sourcePin: attendance.ref },
      { criterionId: 'entitlement', kind: 'W07_ENTITLEMENT', sourcePin: entitlement.ref },
    ],
  };
  binding: EnrollmentEvidenceBinding = {
    identity,
    enrollment: {
      id: identity.enrollmentId,
      learnerId: identity.learnerId,
      classOfferingId: identity.classOfferingId,
    },
    classOffering: { id: identity.classOfferingId, courseVersionRef: cv },
    courseVersion: { ref: cv, state: 'APPROVED', approval: approve('approve-cv') },
  };
  policy = structuredClone(policy);
  lineage = structuredClone({ decisions, resolutions });
  sources: Record<string, EvidenceProjection> = structuredClone({
    writing: grade,
    attendance,
    entitlement,
  });
  modifyRead?: (name: string, value: ScopedRead<unknown>) => ScopedRead<unknown>;
  afterRead?: (name: string) => void;
  readonly access = {
    authorizeRead: async (
      actor: ServerReadPrincipal,
      target: CompletionReadRequest,
    ): Promise<ReadAuthorization> => {
      this.calls.push('authorize');
      this.authReads++;
      // In-memory owned access table, not flags/roles passed in the request.
      const owned =
        actor.id === principal.id &&
        actor.sessionId === principal.sessionId &&
        JSON.stringify(target.identity) === JSON.stringify(identity);
      const value = structuredClone({
        ...this.authorizationValue,
        state: this.denied || !owned ? ('DENIED' as const) : this.authorizationValue.state,
      });
      this.afterRead?.('authorize-' + this.authReads);
      return value;
    },
  };
  bump() {
    this.head = {
      ...this.head,
      ref: { ...this.head.ref, revision: this.head.ref.revision + '-changed' },
    };
  }
  private read<T>(name: string, pin: EvidenceReference, value: T): Promise<ScopedRead<T>> {
    this.calls.push(name);
    const read = envelope(this.head, pin, value);
    const changed = this.modifyRead?.(name, read) ?? read;
    this.afterRead?.(name);
    return Promise.resolve(changed as ScopedRead<T>);
  }
  async openRead(
    _access: ReadAuthorization,
    _request: CompletionReadRequest,
  ): Promise<CompletionReadSession> {
    this.opens++;
    this.calls.push('open');
    return {
      readManifest: async () => {
        this.manifests++;
        this.calls.push('manifest');
        const value = structuredClone(this.head);
        this.afterRead?.('manifest-' + this.manifests);
        return value;
      },
      scope: { readBinding: () => this.read('binding', this.head.bindingPin, this.binding) },
      policies: { readPolicy: () => this.read('policy', this.head.policyPin, this.policy) },
      lineage: { readLineage: () => this.read('lineage', this.head.lineagePin, this.lineage) },
      w03: {
        readPublishedGrade: (_head, selection) =>
          this.read(
            'grade',
            selection.sourcePin!,
            this.sources[selection.criterionId] as W03Projection,
          ),
      },
      w06: {
        readOfficialAttendance: (_head, selection) =>
          this.read(
            'attendance',
            selection.sourcePin!,
            this.sources[selection.criterionId] as W06Projection,
          ),
      },
      w07: {
        readEntitlement: (_head, selection) =>
          this.read(
            'entitlement',
            selection.sourcePin!,
            this.sources[selection.criterionId] as W07Projection,
          ),
      },
      close: async () => {
        this.closes++;
        this.calls.push('close');
        if (this.closeThrows) throw Error('private-close-detail');
      },
    };
  }
}

const assess = (repo: MemoryRepositories, actor = principal, target = request()) =>
  new TrustedCompletionEvidenceReader(repo).assess(actor, target);

describe('W09-DF-S3A server-owned read contracts (controlled in-memory repositories only)', () => {
  it('composes scoped readers → unchanged S2 normalizers → unchanged S1 evaluator', async () => {
    const repo = new MemoryRepositories(),
      r = await assess(repo);
    expect(r.status).toBe('ASSESSED');
    expect(r.assessment?.state).toBe('ELIGIBLE_FOR_REVIEW');
    expect(r.diagnostics.map((x) => x.reason)).toEqual(['NORMALIZED', 'NORMALIZED', 'NORMALIZED']);
    expect(r.runtimeVerified).toBe(false);
    expect(r.assurance).toBe('OFFLINE_REPOSITORY_CONTRACT_ONLY');
    expect(r.serverIntegrationRequired).toBe(true);
    expect(repo.calls).toEqual([
      'authorize',
      'open',
      'manifest',
      'binding',
      'policy',
      'lineage',
      'grade',
      'attendance',
      'entitlement',
      'authorize',
      'manifest',
      'close',
    ]);
    expect(repo.closes).toBe(1);
    expect(r).not.toHaveProperty('certificate');
  });

  it.each([
    { id: 'foreign', sessionId: principal.sessionId },
    { id: principal.id, sessionId: 'expired-or-foreign-session' },
  ])('denies unauthorized principal/session before opening any source read', async (actor) => {
    const repo = new MemoryRepositories(),
      r = await assess(repo, actor);
    expect(r.status).toBe('DENIED');
    expect(r.assessment).toBeNull();
    expect(repo.calls).toEqual(['authorize']);
    expect(repo.opens).toBe(0);
    expect(repo.closes).toBe(0);
  });
  it.each(['learnerId', 'enrollmentId', 'classOfferingId', 'courseVersionId'] as const)(
    'denies unauthorized requested %s',
    async (key) => {
      const repo = new MemoryRepositories(),
        q = request();
      const r = await assess(repo, principal, {
        ...q,
        identity: { ...q.identity, [key]: 'foreign' },
      });
      expect(r.assessment).toBeNull();
      expect(repo.opens).toBe(0);
    },
  );
  it('does not forward raw approvals, role flags, source data or markers from a request', async () => {
    const repo = new MemoryRepositories();
    repo.denied = true;
    const q = {
      ...request(),
      approved: true,
      role: 'SYSTEM_ADMIN',
      source: grade,
      assurance: 'OFFLINE_CONSISTENCY_ONLY',
      [SERVER_READ_SNAPSHOT]: true,
    };
    const r = await assess(repo, principal, q);
    expect(r.status).toBe('DENIED');
    expect(repo.opens).toBe(0);
  });
  it('does not treat fixture approved:true or a marker as an authorization decision', async () => {
    const repo = new MemoryRepositories();
    repo.authorizationValue = { ...repo.authorizationValue, state: 'UNKNOWN' };
    expect((await assess(repo)).reason).toBe('UNVERIFIED_AUTHORIZATION');
    expect(repo.opens).toBe(0);
    const other = new MemoryRepositories();
    other.authorizationValue = { approved: true } as unknown as ReadAuthorization;
    expect((await assess(other)).assessment).toBeNull();
    expect(other.opens).toBe(0);
  });
  it('rejects a repository authorization bound to another principal/scope', async () => {
    const repo = new MemoryRepositories();
    repo.authorizationValue = {
      ...repo.authorizationValue,
      principal: { ...principal, id: 'foreign' },
    };
    expect((await assess(repo)).status).toBe('DENIED');
    expect(repo.opens).toBe(0);
  });
  it('does not accept an S2 NORMALIZED result as an authoritative W03 source row', async () => {
    const repo = new MemoryRepositories();
    repo.sources.writing = {
      status: 'NORMALIZED',
      assurance: 'OFFLINE_CONSISTENCY_ONLY',
      approved: true,
      evidence: grade,
    } as unknown as W03Projection;
    expect((await assess(repo)).assessment).toBeNull();
    expect(repo.closes).toBe(1);
  });

  it('checks exact enrollment/class/CourseVersion joins beyond an authorized request', async () => {
    for (const binding of [
      {
        ...new MemoryRepositories().binding,
        enrollment: { ...new MemoryRepositories().binding.enrollment, learnerId: 'foreign' },
      },
      {
        ...new MemoryRepositories().binding,
        classOffering: { id: 'other-class', courseVersionRef: cv },
      },
      {
        ...new MemoryRepositories().binding,
        classOffering: { id: identity.classOfferingId, courseVersionRef: ref('other-version') },
      },
    ]) {
      const repo = new MemoryRepositories();
      repo.binding = binding;
      const r = await assess(repo);
      expect(r.assessment).toBeNull();
      expect(repo.closes).toBe(1);
    }
  });
  it.each(['binding', 'policy', 'lineage', 'grade', 'attendance', 'entitlement'])(
    'blocks incomplete %s reads even with a complete-looking value',
    async (name) => {
      const repo = new MemoryRepositories();
      repo.modifyRead = (n, v) => (n === name ? { ...v, completeness: 'INCOMPLETE' } : v);
      const r = await assess(repo);
      expect(r.reason).toBe('INCOMPLETE_READ');
      expect(r.assessment).toBeNull();
      expect(repo.closes).toBe(1);
    },
  );
  it.each(['binding', 'policy', 'lineage', 'grade', 'attendance', 'entitlement'])(
    'blocks wrong revision envelope on %s',
    async (name) => {
      const repo = new MemoryRepositories();
      repo.modifyRead = (n, v) => (n === name ? { ...v, revisionRef: ref('stale') } : v);
      expect((await assess(repo)).reason).toBe('STALE_READ');
      expect(repo.closes).toBe(1);
    },
  );
  it('blocks source envelopes from another snapshot even when source pins agree', async () => {
    const repo = new MemoryRepositories();
    repo.modifyRead = (n, v) =>
      n === 'attendance' ? { ...v, manifestRef: ref('other-snapshot') } : v;
    expect((await assess(repo)).reason).toBe('STALE_READ');
  });
  it('represents an authoritatively missing grade as pending, never a passing default', async () => {
    const repo = new MemoryRepositories();
    repo.head = {
      ...repo.head,
      selections: repo.head.selections.map((s) =>
        s.kind === 'W03_GRADE' ? { ...s, sourcePin: null } : s,
      ),
    };
    const r = await assess(repo);
    expect(r.status).toBe('ASSESSED');
    expect(r.assessment?.state).toBe('PENDING_EVIDENCE');
    expect(repo.calls).not.toContain('grade');
  });
  it('does not promote an unpublished assignment or unreleased quiz', async () => {
    for (const source of [
      { ...grade, state: 'REVIEWED_FINAL' },
      { ...grade, source: 'W03_QUIZ' as const, state: 'SUBMITTED', publishedAt: null },
    ]) {
      const repo = new MemoryRepositories();
      repo.sources.writing = source;
      const r = await assess(repo);
      expect(r.assessment?.state).toBe('PENDING_EVIDENCE');
      expect(r.diagnostics).toContainEqual({
        criterionId: 'writing',
        reason: 'NOT_PUBLISHED_FINAL',
      });
    }
  });
  it('rejects conflicting publication lineage rather than trusting raw PUBLISHED', async () => {
    const repo = new MemoryRepositories();
    repo.sources.writing = { ...grade, publishedById: 'forged-publisher' };
    expect((await assess(repo)).reason).toBe('SOURCE_REJECTED');
  });
  it('keeps missing independent approval/authority provenance pending', async () => {
    const repo = new MemoryRepositories();
    repo.lineage.decisions = [];
    expect((await assess(repo)).assessment?.state).toBe('PENDING_EVIDENCE');
  });
  it('preserves a real graded zero as mandatory failure, not as pending/ungraded', async () => {
    const repo = new MemoryRepositories();
    repo.sources.writing = { ...grade, value: 0 };
    repo.lineage.resolutions = repo.lineage.resolutions.map((r) =>
      r.kind === 'W03_GRADE' ? { ...r, normalizedValue: 0 } : r,
    );
    expect((await assess(repo)).assessment?.state).toBe('NOT_ELIGIBLE');
  });
  it('does not invent an applicable approved academic policy', async () => {
    const repo = new MemoryRepositories();
    repo.policy = { ...repo.policy, applicability: 'UNKNOWN' };
    expect((await assess(repo)).reason).toBe('POLICY_UNRESOLVED');
    const other = new MemoryRepositories();
    other.binding = {
      ...other.binding,
      courseVersion: { ...other.binding.courseVersion, state: 'DRAFT' },
    };
    expect((await assess(other)).reason).toBe('POLICY_UNRESOLVED');
  });

  it('reads a complete W06 correction chain and keeps the raw receipt unchanged', async () => {
    const repo = new MemoryRepositories(),
      before = JSON.stringify(repo.sources.attendance);
    const r = await assess(repo);
    expect(r.assessment?.criteria.find((c) => c.criterionId === 'attendance')?.status).toBe(
      'SATISFIED',
    );
    expect(JSON.stringify(repo.sources.attendance)).toBe(before);
    const partial = new MemoryRepositories();
    partial.sources.attendance = {
      ...attendance,
      sessions: [{ ...attendance.sessions[0], corrections: [correction2] }],
    };
    expect((await assess(partial)).assessment?.state).toBe('PENDING_EVIDENCE');
  });
  it('rejects competing correction revisions and ignores no missing predecessor', async () => {
    const repo = new MemoryRepositories();
    repo.sources.attendance = {
      ...attendance,
      sessions: [
        {
          ...attendance.sessions[0],
          corrections: [correction1, { ...correction1, ref: ref('competing') }],
        },
      ],
    };
    expect((await assess(repo)).reason).toBe('SOURCE_REJECTED');
  });
  it('rejects mismatched entitlement links and does not infer historical validity', async () => {
    const repo = new MemoryRepositories();
    repo.sources.entitlement = { ...entitlement, entitlementEnrollmentId: 'foreign' };
    expect((await assess(repo)).reason).toBe('SOURCE_REJECTED');
    const unresolved = new MemoryRepositories();
    unresolved.lineage.resolutions = unresolved.lineage.resolutions.filter(
      (r) => r.kind !== 'W07_ENTITLEMENT',
    );
    expect((await assess(unresolved)).assessment?.state).toBe('PENDING_EVIDENCE');
  });
  it.each(['grade', 'attendance', 'entitlement'])(
    'detects source-head changes after %s read',
    async (name) => {
      const repo = new MemoryRepositories();
      repo.afterRead = (n) => {
        if (n === name) repo.bump();
      };
      const r = await assess(repo);
      expect(r.reason).toBe('STALE_READ');
      expect(r.assessment).toBeNull();
      expect(repo.closes).toBe(1);
    },
  );
  it('checks changed source pins/lineage even if a broken provider reuses the manifest ref', async () => {
    const repo = new MemoryRepositories();
    repo.afterRead = (n) => {
      if (n === 'entitlement') repo.head = { ...repo.head, lineagePin: ref('different-lineage') };
    };
    expect((await assess(repo)).reason).toBe('STALE_READ');
  });
  it('requires an ABA-changing manifest token even when selected source pins return to their old values', async () => {
    const repo = new MemoryRepositories();
    repo.afterRead = (n) => {
      if (n === 'entitlement')
        repo.head = { ...repo.head, ref: { ...repo.head.ref, revision: 'epoch-after-ABA' } };
    };
    expect((await assess(repo)).reason).toBe('STALE_READ');
  });
  it('rechecks session/grant authorization before returning an assessment', async () => {
    const revoked = new MemoryRepositories();
    revoked.afterRead = (n) => {
      if (n === 'entitlement') revoked.denied = true;
    };
    const r = await assess(revoked);
    expect(r.status).toBe('DENIED');
    expect(r.assessment).toBeNull();
    expect(revoked.closes).toBe(1);
    const changed = new MemoryRepositories();
    changed.afterRead = (n) => {
      if (n === 'entitlement')
        changed.authorizationValue = { ...changed.authorizationValue, authorityEpoch: 'new-epoch' };
    };
    expect((await assess(changed)).reason).toBe('STALE_READ');
  });
  it('rejects duplicate/foreign manifest selections instead of pooling criteria', async () => {
    for (const selections of [
      [...new MemoryRepositories().head.selections, new MemoryRepositories().head.selections[0]],
      new MemoryRepositories().head.selections.slice(1),
      new MemoryRepositories().head.selections.map((s) =>
        s.kind === 'W03_GRADE' ? { ...s, kind: 'W06_ATTENDANCE' as const } : s,
      ),
    ]) {
      const repo = new MemoryRepositories();
      repo.head = { ...repo.head, selections };
      expect((await assess(repo)).assessment).toBeNull();
      expect(repo.closes).toBe(1);
    }
  });
  it('does not retain mutable aliases to repository envelopes while reading other sources', async () => {
    const repo = new MemoryRepositories();
    repo.afterRead = (n) => {
      if (n === 'grade') (repo.sources.writing as { value: number }).value = 999;
    };
    // This violates the provider's revision contract, so no assertion of actual DB
    // freshness is possible. Copied source values still cannot change behind S2.
    const r = await assess(repo);
    expect(r.assessment?.state).toBe('ELIGIBLE_FOR_REVIEW');
    expect(r.runtimeVerified).toBe(false);
    expect(r.assessment?.criteria[0].reason).toBe('GRADE_MEETS_THRESHOLD');
  });
  it('fails closed and releases the handle on reader exceptions without leaking private errors', async () => {
    const repo = new MemoryRepositories();
    repo.modifyRead = () => {
      throw Error('private-database-or-credential-detail');
    };
    const r = await assess(repo);
    expect(r.reason).toBe('READ_BOUNDARY_FAILURE');
    expect(r.assessment).toBeNull();
    expect(repo.closes).toBe(1);
    expect(JSON.stringify(r)).not.toContain('private-');
  });
  it('does not publish an assessment if closing the scoped read fails', async () => {
    const repo = new MemoryRepositories();
    repo.closeThrows = true;
    const r = await assess(repo);
    expect(r.reason).toBe('READ_BOUNDARY_FAILURE');
    expect(r.assessment).toBeNull();
  });
});
