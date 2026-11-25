import { createHash } from 'node:crypto';
import type { PrincipalRead } from './operations-authority.contracts';
import type {
  BusinessRole,
  GrantRead,
  GuardResult,
  Permission,
  ResourceScope,
  Revision,
} from './operations.contracts';
import { boundaryGuard, boundaryRef, equalRef } from './operations-authority-adapter';
import { mapW10Permission, w10RoleEligible } from './operations-permission-map';

/** Read projections of schema.prisma User, UserSession, PermissionGrant.
 * These are DATA, not repositories or authenticated principal contracts.
 * Dates are native Prisma row Dates; strings/client timestamps are not coerced.
 * No source import, service construction, query, local clock or I/O occurs here.
 */
export interface W01UserRow {
  readonly id: string;
  readonly role: string;
  readonly status: string;
}
export interface W01SessionRow {
  readonly sid: string;
  readonly sess: unknown;
  readonly expire: Date;
}
export interface W01GrantRow {
  readonly id: string;
  readonly userId: string;
  readonly capability: string;
  readonly scopeType: string;
  readonly scopeId: string | null;
  readonly requestedBy: string;
  readonly approvedBy: string | null;
  readonly approvedAt: Date | null;
  readonly effectiveAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly revokedBy: string | null;
  readonly reason: string;
  readonly revokeReason: string | null;
  readonly createdAt: Date;
}
export interface W01PinnedRow {
  readonly row: unknown;
  readonly selected: Revision;
  readonly current: Revision;
}
/** Required future server inputs, NOT implemented W01 APIs or trusted markers.
 * W01 has no canonical-person column or unified authority revision. Future
 * integration must independently verify person bindings, authenticated session,
 * approval actor's current authority, exact resource lookup, read consistency,
 * database origin and a fresh PG clock under a revocation-safe transaction.
 * All supplied inputs here, including POSTGRESQL_CLOCK, remain UNVERIFIED.
 */
export interface W01OfflineReadContext {
  readonly selectedEpoch: Revision;
  readonly currentEpoch: Revision;
  readonly clock: {
    readonly source: 'POSTGRESQL_CLOCK' | 'LOCAL_CLOCK' | 'UNKNOWN';
    readonly epochMs: number;
    readonly readRef: Revision;
  };
  readonly personBindings: readonly {
    readonly accountId: string;
    readonly personId: string;
    readonly ref: Revision;
    readonly readRef: Revision;
  }[];
}
export interface W01RowMapping<T> {
  readonly guard: GuardResult;
  readonly recordConsistency: 'CONSISTENT_OFFLINE' | 'INVALID' | 'INCOMPLETE';
  readonly projection: T | null;
  readonly provenance: 'UNVERIFIED_ROWS';
}
class InvalidRow extends Error {
  constructor(
    readonly reason: string,
    readonly denied = false,
  ) {
    super(reason);
  }
}
function requireRow(value: unknown, reason: string, denied = false): asserts value {
  if (!value) throw new InvalidRow(reason, denied);
}
const uuid = (x: unknown): x is string =>
  typeof x === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const text = (x: unknown): x is string => typeof x === 'string' && !!x.trim();
function field(value: unknown, key: string): unknown {
  requireRow(value && typeof value === 'object' && !Array.isArray(value), 'ROW_SHAPE_INVALID');
  const d = Object.getOwnPropertyDescriptor(value, key);
  requireRow(d && 'value' in d, 'ROW_FIELD_MISSING_OR_ACCESSOR');
  return d.value;
}
function instant(value: unknown): number {
  // Intrinsic rejects strings, invalid Dates and objects with deceptive getTime.
  const ms = Date.prototype.getTime.call(value);
  requireRow(Number.isSafeInteger(ms), 'ROW_DATE_INVALID');
  return ms;
}
function userData(row: unknown) {
  const id = field(row, 'id'),
    role = field(row, 'role'),
    status = field(row, 'status');
  requireRow(uuid(id) && text(role) && text(status), 'USER_ROW_INVALID');
  requireRow(w10RoleEligible(role, 'report.view'), 'BUSINESS_ROLE_INVALID', true);
  requireRow(['ACTIVE', 'INACTIVE', 'LOCKED'].includes(status), 'ACCOUNT_STATE_UNKNOWN');
  return { id, role: role as BusinessRole, status: status as 'ACTIVE' | 'INACTIVE' | 'LOCKED' };
}
function sessionData(row: unknown) {
  const sid = field(row, 'sid'),
    userId = field(field(row, 'sess'), 'userId');
  requireRow(text(sid) && uuid(userId), 'SESSION_ROW_INVALID');
  return { sid, userId, expire: instant(field(row, 'expire')) };
}
function grantData(row: unknown) {
  const id = field(row, 'id'),
    userId = field(row, 'userId'),
    requestedBy = field(row, 'requestedBy');
  const approvedBy = field(row, 'approvedBy'),
    revokedBy = field(row, 'revokedBy');
  const capability = field(row, 'capability'),
    scopeType = field(row, 'scopeType'),
    scopeId = field(row, 'scopeId');
  requireRow(uuid(id) && uuid(userId) && uuid(requestedBy), 'GRANT_ID_INVALID');
  requireRow(
    (approvedBy === null || uuid(approvedBy)) && (revokedBy === null || uuid(revokedBy)),
    'GRANT_ACTOR_INVALID',
  );
  requireRow(
    text(capability) && text(scopeType) && (scopeId === null || text(scopeId)),
    'GRANT_SCOPE_INVALID',
  );
  const reason = field(row, 'reason'),
    revokeReason = field(row, 'revokeReason');
  requireRow(
    text(reason) &&
      reason.length <= 500 &&
      (revokeReason === null || (text(revokeReason) && revokeReason.length <= 500)),
    'GRANT_REASON_INVALID',
  );
  const approvedAt = field(row, 'approvedAt'),
    revokedAt = field(row, 'revokedAt');
  requireRow((approvedBy === null) === (approvedAt === null), 'APPROVAL_CONTRADICTORY');
  requireRow(
    (revokedBy === null) === (revokedAt === null) &&
      (revokedAt === null) === (revokeReason === null),
    'REVOCATION_CONTRADICTORY',
  );
  return {
    id,
    userId,
    capability,
    scopeType,
    scopeId,
    requestedBy,
    approvedBy,
    approvedAt: approvedAt === null ? null : instant(approvedAt),
    effectiveAt: instant(field(row, 'effectiveAt')),
    expiresAt: instant(field(row, 'expiresAt')),
    revokedAt: revokedAt === null ? null : instant(revokedAt),
    revokedBy,
    createdAt: instant(field(row, 'createdAt')),
  };
}
type RowKind = 'USER' | 'SESSION' | 'GRANT';
const data = (kind: RowKind, row: unknown) => {
  if (kind === 'USER') return userData(row);
  if (kind === 'SESSION') return sessionData(row);
  if (kind === 'GRANT') return grantData(row);
  throw new InvalidRow('ROW_KIND_INVALID');
};
/** Content digest of just the authority projection, NOT a database revision or
 * signature. W01 has no revision column here. Never fabricate provenance from
 * createdAt or an approved:true flag. Reasons, cookies and other PII are omitted.
 */
export function w01ProjectionPin(kind: RowKind, row: unknown): Revision | null {
  try {
    const d = data(kind, row);
    return {
      id: 'sid' in d ? d.sid : d.id,
      revision: createHash('sha256')
        .update(JSON.stringify([kind, d]))
        .digest('hex'),
    };
  } catch {
    return null;
  }
}
function pinned(kind: RowKind, input: W01PinnedRow) {
  requireRow(input && equalRef(input.selected, input.current), 'ROW_REVISION_STALE');
  const d = data(kind, input.row);
  requireRow(
    equalRef(input.current, w01ProjectionPin(kind, input.row)),
    'ROW_CONTENT_PIN_MISMATCH',
  );
  return d;
}
function clock(context: W01OfflineReadContext): number {
  requireRow(
    context && equalRef(context.selectedEpoch, context.currentEpoch),
    'AUTHORITY_EPOCH_STALE',
  );
  const c = context.clock;
  requireRow(
    c && c.source === 'POSTGRESQL_CLOCK' && equalRef(c.readRef, context.currentEpoch),
    'SERVER_CLOCK_UNVERIFIED',
  );
  requireRow(Number.isSafeInteger(c.epochMs) && c.epochMs >= 0, 'SERVER_CLOCK_INVALID');
  return c.epochMs;
}
function person(context: W01OfflineReadContext, accountId: string): string {
  requireRow(Array.isArray(context.personBindings), 'CANONICAL_PERSON_MISSING');
  const bindings = context.personBindings.filter((b) => b && b.accountId === accountId);
  requireRow(bindings.length === 1, 'CANONICAL_PERSON_MISSING_OR_AMBIGUOUS');
  const b = bindings[0];
  requireRow(
    text(b.personId) && boundaryRef(b.ref) && equalRef(b.readRef, context.currentEpoch),
    'CANONICAL_PERSON_BINDING_UNVERIFIED',
  );
  return b.personId;
}
function failure<T>(e: unknown): W01RowMapping<T> {
  const denied = e instanceof InvalidRow && e.denied;
  return {
    guard: boundaryGuard(
      denied ? 'DENIED' : 'BLOCKED',
      e instanceof InvalidRow ? e.reason : 'MALFORMED_W01_ROW_INPUT',
    ),
    recordConsistency: denied ? 'INVALID' : 'INCOMPLETE',
    projection: null,
    provenance: 'UNVERIFIED_ROWS',
  };
}

export function mapW01PrincipalRows(input: {
  readonly user: W01PinnedRow;
  readonly session: W01PinnedRow;
  readonly context: W01OfflineReadContext;
}): W01RowMapping<PrincipalRead> {
  try {
    const now = clock(input.context);
    pinned('USER', input.user);
    pinned('SESSION', input.session);
    const u = userData(input.user.row),
      s = sessionData(input.session.row);
    requireRow(u.status === 'ACTIVE', 'ACCOUNT_INACTIVE', true);
    requireRow(s.userId === u.id && s.expire > now, 'SESSION_WRONG_ACCOUNT_OR_EXPIRED', true);
    const personId = person(input.context, u.id);
    return {
      guard: boundaryGuard('BLOCKED', 'SERVER_PRINCIPAL_PROVENANCE_UNVERIFIED'),
      recordConsistency: 'CONSISTENT_OFFLINE',
      provenance: 'UNVERIFIED_ROWS',
      projection: {
        ref: { ...input.user.current },
        principal: {
          principalId: u.id,
          personId,
          role: u.role,
          sessionRef: { ...input.session.current },
          // Even well-shaped row/fixture data is not an authenticated session.
          sessionState: 'UNKNOWN',
        },
        accountState: u.status,
        authorityEpoch: input.context.currentEpoch.revision,
      },
    };
  } catch (e) {
    return failure(e);
  }
}

export function mapW01GrantRow(input: {
  readonly user: W01PinnedRow;
  readonly grant: W01PinnedRow;
  readonly permission: Permission;
  readonly scope: ResourceScope;
  readonly context: W01OfflineReadContext;
}): W01RowMapping<GrantRead> {
  try {
    const now = clock(input.context);
    pinned('USER', input.user);
    pinned('GRANT', input.grant);
    const u = userData(input.user.row),
      g = grantData(input.grant.row);
    requireRow(u.status === 'ACTIVE' && g.userId === u.id, 'GRANT_ACCOUNT_DENIED', true);
    requireRow(
      g.capability === input.permission &&
        g.scopeType === 'CLASS' &&
        input.scope.kind === 'CLASS' &&
        g.scopeId === input.scope.id,
      'EXACT_W10_GRANT_SCOPE_REQUIRED',
      true,
    );
    requireRow(g.expiresAt > g.effectiveAt && g.createdAt <= now, 'GRANT_INTERVAL_INVALID', true);
    requireRow(g.revokedAt === null, 'GRANT_REVOKED', true);
    requireRow(g.effectiveAt <= now && now < g.expiresAt, 'GRANT_NOT_EFFECTIVE_OR_EXPIRED', true);
    requireRow(g.approvedBy && g.approvedAt !== null, 'GRANT_APPROVAL_MISSING');
    requireRow(
      g.createdAt <= g.approvedAt && g.approvedAt <= now,
      'GRANT_APPROVAL_TIME_INVALID',
      true,
    );
    const accountIds = [g.userId, g.requestedBy, g.approvedBy];
    requireRow(new Set(accountIds).size === 3, 'INDEPENDENT_GRANT_ACCOUNTS_REQUIRED', true);
    const people = accountIds.map((id) => person(input.context, id));
    requireRow(new Set(people).size === 3, 'INDEPENDENT_GRANT_PEOPLE_REQUIRED', true);
    const candidate: GrantRead = {
      ref: { ...input.grant.current },
      principalId: u.id,
      permission: input.permission,
      scope: { kind: input.scope.kind, id: input.scope.id },
      state: 'ACTIVE',
      validity: 'VALID',
      authorityEpoch: input.context.currentEpoch.revision,
      // References locate unverified data only; neither is authenticated approval lineage.
      decisionRef: { ...input.grant.current },
      authorityRef: { ...input.context.currentEpoch },
    };
    const mapping = mapW10Permission({
      subject: { principalId: u.id, personId: people[0], role: u.role },
      permission: input.permission,
      scope: input.scope,
      explicitGrant: candidate,
    });
    if (!mapping.explicitGrantMatched || !mapping.proposedW01Scope) {
      return {
        guard: mapping.guard,
        recordConsistency: 'INVALID',
        projection: null,
        provenance: 'UNVERIFIED_ROWS',
      };
    }
    return {
      guard: mapping.guard,
      recordConsistency: 'CONSISTENT_OFFLINE',
      provenance: 'UNVERIFIED_ROWS',
      // Deliberate downgrade: S2 must not accept rows as active verified grants.
      projection: { ...candidate, state: 'UNKNOWN', validity: 'UNKNOWN' },
    };
  } catch (e) {
    return failure(e);
  }
}
