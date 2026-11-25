import { evaluateCompletion } from './completion-evaluator';
import type { CompletionEvidence, EvidenceReference } from './completion.contracts';
import { SERVER_READ_SNAPSHOT } from './evidence-adapter.contracts';
import type {
  EvidenceIdentity,
  EvidenceProjection,
  ServerReadSnapshot,
} from './evidence-adapter.contracts';
import { normalizeW03, normalizeW06, normalizeW07 } from './evidence-adapters';
import type {
  CompletionReadManifest,
  CompletionReadRequest,
  CompletionReadSession,
  ReadAuthorization,
  ScopedRead,
  ServerReadPrincipal,
  SourceSelection,
  TrustedCompletionReadResult,
  TrustedEvidenceRepositories,
  TrustedReadReason,
} from './trusted-evidence.contracts';

const text = (x: unknown): x is string => typeof x === 'string' && !!x.trim();
const ref = (x: EvidenceReference | null | undefined): x is EvidenceReference =>
  !!x && text(x.id) && text(x.revision);
const sameRef = (
  a: EvidenceReference | null | undefined,
  b: EvidenceReference | null | undefined,
) => ref(a) && ref(b) && a.id === b.id && a.revision === b.revision;
const sameIdentity = (a: EvidenceIdentity, b: EvidenceIdentity) =>
  !!a &&
  !!b &&
  (['learnerId', 'enrollmentId', 'classOfferingId', 'courseVersionId'] as const).every(
    (k) => text(a[k]) && a[k] === b[k],
  );

class ReadFailure extends Error {
  constructor(
    readonly status: 'PENDING' | 'REJECTED' | 'DENIED',
    readonly reason: TrustedReadReason,
  ) {
    super(reason);
  }
}
function requireRead(
  ok: unknown,
  status: ReadFailure['status'],
  reason: TrustedReadReason,
): asserts ok {
  if (!ok) throw new ReadFailure(status, reason);
}

/** Copy repository data at each read boundary without invoking getters, accepting
 * class instances, retaining mutable aliases or trusting serialized source markers.
 * Plain records from structuredClone/other VM realms are supported.
 */
function copyData<T>(value: T): T {
  const clone = (v: unknown, depth: number): unknown => {
    if (depth > 40) throw new ReadFailure('REJECTED', 'CONTRADICTORY_READ');
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    requireRead(!!v && typeof v === 'object', 'REJECTED', 'CONTRADICTORY_READ');
    const p = Object.getPrototypeOf(v);
    if (!Array.isArray(v) && p !== null) {
      const c = Object.getOwnPropertyDescriptor(p, 'constructor');
      requireRead(
        Object.getPrototypeOf(p) === null &&
          c &&
          'value' in c &&
          typeof c.value === 'function' &&
          Function.prototype.toString.call(c.value) === Function.prototype.toString.call(Object),
        'REJECTED',
        'CONTRADICTORY_READ',
      );
    }
    requireRead(
      Reflect.ownKeys(v).every((k) => typeof k === 'string'),
      'REJECTED',
      'CONTRADICTORY_READ',
    );
    const keys = Array.isArray(v)
      ? Array.from({ length: v.length }, (_, i) => String(i))
      : Object.keys(v);
    const output: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      const d = Object.getOwnPropertyDescriptor(v, key);
      requireRead(d && 'value' in d, 'REJECTED', 'CONTRADICTORY_READ');
      output[key] = clone(d.value, depth + 1);
    }
    return Array.isArray(v) ? keys.map((k) => output[k]) : output;
  };
  return clone(value, 0) as T;
}

function authorization(
  a: ReadAuthorization,
  principal: ServerReadPrincipal,
  request: CompletionReadRequest,
) {
  requireRead(a.state !== 'DENIED', 'DENIED', 'READ_DENIED');
  requireRead(
    a.state === 'AUTHORIZED' && ref(a.decisionRef) && ref(a.authorityRef) && text(a.authorityEpoch),
    'PENDING',
    'UNVERIFIED_AUTHORIZATION',
  );
  requireRead(
    a.principal?.id === principal.id &&
      a.principal?.sessionId === principal.sessionId &&
      sameIdentity(a.identity, request.identity),
    'DENIED',
    'READ_DENIED',
  );
}

function manifest(m: CompletionReadManifest, request: CompletionReadRequest) {
  requireRead(ref(m.ref) && ref(m.bindingPin) && ref(m.lineagePin), 'PENDING', 'INCOMPLETE_READ');
  requireRead(sameIdentity(m.identity, request.identity), 'REJECTED', 'SCOPE_MISMATCH');
  requireRead(
    sameRef(m.courseVersionPin, request.courseVersionPin) &&
      sameRef(m.policyPin, request.policyPin),
    'PENDING',
    'STALE_READ',
  );
  requireRead(
    Array.isArray(m.selections) &&
      m.selections.every(
        (s) =>
          text(s.criterionId) &&
          ['W03_GRADE', 'W06_ATTENDANCE', 'W07_ENTITLEMENT'].includes(s.kind) &&
          (s.sourcePin === null || ref(s.sourcePin)),
      ) &&
      new Set(m.selections.map((s) => s.criterionId)).size === m.selections.length,
    'REJECTED',
    'CONTRADICTORY_READ',
  );
}

const manifestKey = (m: CompletionReadManifest) =>
  JSON.stringify([
    m.ref.id,
    m.ref.revision,
    m.bindingPin.id,
    m.bindingPin.revision,
    m.lineagePin.id,
    m.lineagePin.revision,
    m.policyPin.id,
    m.policyPin.revision,
    m.courseVersionPin.id,
    m.courseVersionPin.revision,
    [...m.selections]
      .sort((a, b) => a.criterionId.localeCompare(b.criterionId))
      .map((s) => [s.criterionId, s.kind, s.sourcePin?.id ?? null, s.sourcePin?.revision ?? null]),
  ]);

function valueOf<T>(read: ScopedRead<T>, head: CompletionReadManifest, pin: EvidenceReference): T {
  requireRead(
    sameRef(read.manifestRef, head.ref) && sameRef(read.revisionRef, pin),
    'PENDING',
    'STALE_READ',
  );
  requireRead(
    read.completeness === 'COMPLETE' && read.value !== null,
    'PENDING',
    'INCOMPLETE_READ',
  );
  return read.value;
}

const failed = (
  status: ReadFailure['status'],
  reason: TrustedReadReason,
): TrustedCompletionReadResult => ({
  status,
  reason,
  assessment: null,
  manifestRef: null,
  diagnostics: [],
  assurance: 'OFFLINE_REPOSITORY_CONTRACT_ONLY',
  runtimeVerified: false,
  serverIntegrationRequired: true,
});

/** Composition over server-owned read ports. No concrete source service/ORM,
 * network, timer, retry, policy default, trust-by-marker or certificate operation.
 */
export class TrustedCompletionEvidenceReader {
  constructor(private readonly repositories: TrustedEvidenceRepositories) {}

  async assess(
    principal: ServerReadPrincipal,
    request: CompletionReadRequest,
  ): Promise<TrustedCompletionReadResult> {
    let session: CompletionReadSession | null = null;
    let answer: TrustedCompletionReadResult;
    try {
      // Explicit whitelist: no source payload, fixture flags or client S2 snapshot is forwarded.
      const p = { id: principal.id, sessionId: principal.sessionId };
      const q: CompletionReadRequest = {
        identity: {
          learnerId: request.identity.learnerId,
          enrollmentId: request.identity.enrollmentId,
          classOfferingId: request.identity.classOfferingId,
          courseVersionId: request.identity.courseVersionId,
        },
        courseVersionPin: {
          id: request.courseVersionPin.id,
          revision: request.courseVersionPin.revision,
        },
        policyPin: { id: request.policyPin.id, revision: request.policyPin.revision },
      };
      requireRead(
        text(p.id) &&
          text(p.sessionId) &&
          sameIdentity(q.identity, q.identity) &&
          ref(q.policyPin) &&
          ref(q.courseVersionPin) &&
          q.courseVersionPin.id === q.identity.courseVersionId,
        'REJECTED',
        'INVALID_REQUEST',
      );
      const access = copyData(await this.repositories.access.authorizeRead(p, q));
      authorization(access, p, q);
      session = await this.repositories.openRead(copyData(access), copyData(q));
      const head = copyData(await session.readManifest());
      manifest(head, q);
      const binding = valueOf(
        copyData(await session.scope.readBinding(copyData(head))),
        head,
        head.bindingPin,
      );
      requireRead(
        sameIdentity(binding.identity, q.identity) &&
          binding.enrollment.id === q.identity.enrollmentId &&
          binding.enrollment.learnerId === q.identity.learnerId &&
          binding.enrollment.classOfferingId === q.identity.classOfferingId &&
          binding.classOffering.id === q.identity.classOfferingId,
        'REJECTED',
        'SCOPE_MISMATCH',
      );
      requireRead(
        sameRef(binding.classOffering.courseVersionRef, q.courseVersionPin) &&
          sameRef(binding.courseVersion.ref, q.courseVersionPin),
        'PENDING',
        'STALE_READ',
      );
      const policy = valueOf(
        copyData(await session.policies.readPolicy(copyData(head))),
        head,
        head.policyPin,
      );
      const lineage = valueOf(
        copyData(await session.lineage.readLineage(copyData(head))),
        head,
        head.lineagePin,
      );
      const base = {
        scope: {
          enrollmentId: q.identity.enrollmentId,
          classOfferingId: q.identity.classOfferingId,
          courseVersionId: q.identity.courseVersionId,
        },
        courseVersion: binding.courseVersion,
        courseVersionPin: q.courseVersionPin,
        policy,
        policyPin: q.policyPin,
        evidencePins: {},
        evidence: [],
        exemptions: [],
      };
      const precheck = evaluateCompletion(base);
      requireRead(precheck.criteria.length > 0, 'PENDING', 'POLICY_UNRESOLVED');
      requireRead(
        head.selections.length === policy.criteria.length &&
          policy.criteria.every((c) =>
            head.selections.some((s) => s.criterionId === c.id && s.kind === c.kind),
          ),
        'REJECTED',
        'CONTRADICTORY_READ',
      );
      const records: EvidenceProjection[] = [];
      for (const selection of head.selections) {
        if (selection.sourcePin === null) continue;
        const read = copyData(await this.readSource(session, head, selection));
        const source = valueOf(read, head, selection.sourcePin);
        requireRead(sameRef(source.ref, selection.sourcePin), 'PENDING', 'STALE_READ');
        requireRead(sameIdentity(source.identity, q.identity), 'REJECTED', 'SCOPE_MISMATCH');
        records.push(source);
      }
      // Re-authorize and re-read current heads before releasing ANY assessment.
      const endAccess = copyData(
        await this.repositories.access.authorizeRead(copyData(p), copyData(q)),
      );
      authorization(endAccess, p, q);
      requireRead(
        sameRef(access.decisionRef, endAccess.decisionRef) &&
          sameRef(access.authorityRef, endAccess.authorityRef) &&
          access.authorityEpoch === endAccess.authorityEpoch,
        'PENDING',
        'STALE_READ',
      );
      const endHead = copyData(await session.readManifest());
      manifest(endHead, q);
      requireRead(manifestKey(head) === manifestKey(endHead), 'PENDING', 'STALE_READ');

      // Marker is constructed internally, not accepted as proof from any repository/DTO.
      const snapshot: ServerReadSnapshot = {
        [SERVER_READ_SNAPSHOT]: true,
        identity: q.identity,
        policyRef: q.policyPin,
        courseVersionRef: q.courseVersionPin,
        enrollment: binding.enrollment,
        records,
        decisions: lineage.decisions,
        resolutions: lineage.resolutions,
      };
      const evidence: CompletionEvidence[] = [],
        pins: Record<string, EvidenceReference> = Object.create(null);
      const diagnostics: {
        criterionId: string;
        reason: import('./evidence-adapter.contracts').AdapterReason;
      }[] = [];
      for (const selection of head.selections) {
        if (!selection.sourcePin) continue;
        const source = records.find((r) => sameRef(r.ref, selection.sourcePin))!;
        const normalize =
          selection.kind === 'W03_GRADE'
            ? normalizeW03
            : selection.kind === 'W06_ATTENDANCE'
              ? normalizeW06
              : normalizeW07;
        const normalized = normalize(source, {
          identity: q.identity,
          policy,
          policyPin: q.policyPin,
          courseVersionPin: q.courseVersionPin,
          criterionId: selection.criterionId,
          sourcePin: selection.sourcePin,
          snapshot,
        });
        requireRead(normalized.status !== 'REJECTED', 'REJECTED', 'SOURCE_REJECTED');
        diagnostics.push({ criterionId: selection.criterionId, reason: normalized.reason });
        pins[selection.criterionId] = selection.sourcePin;
        if (normalized.evidence) evidence.push(normalized.evidence);
      }
      answer = {
        status: 'ASSESSED',
        reason: 'ASSESSED',
        assessment: evaluateCompletion({ ...base, evidencePins: pins, evidence }),
        manifestRef: { ...head.ref },
        diagnostics,
        assurance: 'OFFLINE_REPOSITORY_CONTRACT_ONLY',
        runtimeVerified: false,
        serverIntegrationRequired: true,
      };
    } catch (error) {
      answer =
        error instanceof ReadFailure
          ? failed(error.status, error.reason)
          : failed('PENDING', 'READ_BOUNDARY_FAILURE');
    } finally {
      if (session) {
        try {
          await session.close();
        } catch {
          answer = failed('PENDING', 'READ_BOUNDARY_FAILURE');
        }
      }
    }
    return answer!;
  }

  private readSource(
    session: CompletionReadSession,
    head: CompletionReadManifest,
    selection: SourceSelection,
  ): Promise<ScopedRead<EvidenceProjection>> {
    const h = copyData(head),
      s = copyData(selection);
    if (s.kind === 'W03_GRADE') return session.w03.readPublishedGrade(h, s);
    if (s.kind === 'W06_ATTENDANCE') return session.w06.readOfficialAttendance(h, s);
    return session.w07.readEntitlement(h, s);
  }
}
