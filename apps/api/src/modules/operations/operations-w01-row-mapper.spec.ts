import type { Permission, ResourceScope, Revision } from './operations.contracts';
import { OperationsAuthorityAdapter } from './operations-authority-adapter';
import {
  mapW01GrantRow,
  mapW01PrincipalRows,
  w01ProjectionPin,
  type W01GrantRow,
  type W01OfflineReadContext,
  type W01PinnedRow,
  type W01SessionRow,
  type W01UserRow,
} from './operations-w01-row-mapper';

const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = 1793872800000; // synthetic supplied snapshot, never Date.now()/fake timers
const at = (delta: number) => new Date(now + delta);
const ref = (id: string): Revision => ({ id, revision: 'fixture-epoch-v1' });
const epoch = ref('synthetic-read');
const context = (): W01OfflineReadContext => ({
  selectedEpoch: { ...epoch },
  currentEpoch: { ...epoch },
  clock: { source: 'POSTGRESQL_CLOCK', epochMs: now, readRef: { ...epoch } },
  personBindings: [1, 2, 3].map((n) => ({
    accountId: uuid(n),
    personId: `person-${n}`,
    ref: ref(`person-binding-${n}`),
    readRef: { ...epoch },
  })),
});
const user = (): W01UserRow => ({ id: uuid(1), role: 'INSTRUCTOR', status: 'ACTIVE' });
const session = (): W01SessionRow => ({
  sid: 'synthetic-session-only',
  sess: { userId: uuid(1) },
  expire: at(60_000),
});
const grant = (): W01GrantRow => ({
  id: uuid(4),
  userId: uuid(1),
  capability: 'report.view',
  scopeType: 'CLASS',
  scopeId: uuid(5),
  requestedBy: uuid(2),
  approvedBy: uuid(3),
  approvedAt: at(-2_000),
  effectiveAt: at(-1_000),
  expiresAt: at(60_000),
  revokedAt: null,
  revokedBy: null,
  reason: 'Synthetic permission request',
  revokeReason: null,
  createdAt: at(-3_000),
});
function pin(kind: Parameters<typeof w01ProjectionPin>[0], row: unknown): W01PinnedRow {
  const p = w01ProjectionPin(kind, row) ?? ref('invalid-row');
  return { row, selected: { ...p }, current: { ...p } };
}
const principalInput = () => ({
  user: pin('USER', user()),
  session: pin('SESSION', session()),
  context: context(),
});
const grantInput = () => ({
  user: pin('USER', user()),
  grant: pin('GRANT', grant()),
  permission: 'report.view' as Permission,
  scope: { kind: 'CLASS', id: uuid(5) } as ResourceScope,
  context: context(),
});
const withGrant = (patch: Partial<W01GrantRow>) => ({
  ...grantInput(),
  grant: pin('GRANT', { ...grant(), ...patch }),
});
const refused = (r: ReturnType<typeof mapW01GrantRow> | ReturnType<typeof mapW01PrincipalRows>) => {
  expect(r.guard.runtimeAuthorized).toBe(false);
  expect(r.guard.assurance).toBe('OFFLINE_CONSISTENCY_ONLY');
  expect(r.guard.decision).not.toBe('CONDITIONS_MET_OFFLINE');
  expect(r.provenance).toBe('UNVERIFIED_ROWS');
};

describe('W10 S3B W01 row consistency is never runtime provenance', () => {
  it('valid User/UserSession shapes give only an UNKNOWN session candidate', () => {
    const r = mapW01PrincipalRows(principalInput());
    refused(r);
    expect(r.recordConsistency).toBe('CONSISTENT_OFFLINE');
    expect(r.projection?.principal).toMatchObject({
      principalId: uuid(1),
      personId: 'person-1',
      sessionState: 'UNKNOWN',
    });
    expect(r.guard.reason).toBe('SERVER_PRINCIPAL_PROVENANCE_UNVERIFIED');
  });
  it('consistent grant candidate stays UNKNOWN and current constraints stay BLOCKED', () => {
    const r = mapW01GrantRow(grantInput());
    refused(r);
    expect(r.recordConsistency).toBe('CONSISTENT_OFFLINE');
    expect(r.projection).toMatchObject({
      principalId: uuid(1),
      state: 'UNKNOWN',
      validity: 'UNKNOWN',
      scope: { kind: 'CLASS', id: uuid(5) },
    });
    expect(r.guard.reason).toBe('W01_W10_REGISTRY_AND_CONSTRAINT_UNSUPPORTED');
  });
  it('a separate export row can be consistent but never inherits runtime authority', () => {
    const r = mapW01GrantRow({
      ...withGrant({ capability: 'report.export' }),
      permission: 'report.export',
    });
    expect(r.projection?.permission).toBe('report.export');
    expect(r.projection?.validity).toBe('UNKNOWN');
    refused(r);
  });
  it('row data cannot become a verified principal through the existing S2 adapter', async () => {
    const p = mapW01PrincipalRows(principalInput()),
      g = mapW01GrantRow(grantInput());
    const adapter = new OperationsAuthorityAdapter({
      mode: 'IN_MEMORY_ONLY',
      readPrincipal: () => Promise.resolve(p.projection),
      readGrant: () => Promise.resolve(g.projection),
    });
    expect((await adapter.open()).context).toBeNull();
  });
  it('a nominally authenticated synthetic S2 principal cannot promote the UNKNOWN grant', async () => {
    const p = mapW01PrincipalRows(principalInput()).projection!;
    const g = mapW01GrantRow(grantInput()).projection;
    const adapter = new OperationsAuthorityAdapter({
      mode: 'IN_MEMORY_ONLY',
      readPrincipal: () =>
        Promise.resolve({ ...p, principal: { ...p.principal, sessionState: 'AUTHENTICATED' } }),
      readGrant: () => Promise.resolve(g),
    });
    const opened = await adapter.open();
    expect(opened.guard.runtimeAuthorized).toBe(false);
    const read = await adapter.readAccess(opened.context!, 'report.view', grantInput().scope);
    expect(read.access).toBeNull();
    expect(read.guard.reason).toBe('GRANT_PROVENANCE_UNAVAILABLE');
  });
  it.each(['USER', 'SESSION', 'GRANT'] as const)(
    'missing/null %s rows are not evidence',
    (kind) => {
      for (const row of [null, undefined, {}, []]) expect(w01ProjectionPin(kind, row)).toBeNull();
    },
  );
  it.each(['id', 'role', 'status'] as const)('User requires actual %s projection field', (key) => {
    const row = { ...user() } as Record<string, unknown>;
    delete row[key];
    expect(
      mapW01PrincipalRows({ ...principalInput(), user: pin('USER', row) }).projection,
    ).toBeNull();
  });
  it.each(['INACTIVE', 'LOCKED'])('non-active %s account is denied', (status) => {
    const u = pin('USER', { ...user(), status });
    expect(mapW01PrincipalRows({ ...principalInput(), user: u }).guard.reason).toBe(
      'ACCOUNT_INACTIVE',
    );
    expect(mapW01GrantRow({ ...grantInput(), user: u }).guard.reason).toBe('GRANT_ACCOUNT_DENIED');
  });
  it('legacy coordinator does not become a seven-role principal', () => {
    expect(
      mapW01PrincipalRows({
        ...principalInput(),
        user: pin('USER', { ...user(), role: 'ADMIN_COORDINATOR' }),
      }).projection,
    ).toBeNull();
  });
  it.each([-1, 0, 1])(
    'session expiry half-open seam %+i ms uses only supplied snapshot',
    (delta) => {
      const r = mapW01PrincipalRows({
        ...principalInput(),
        session: pin('SESSION', { ...session(), expire: at(delta) }),
      });
      expect(r.projection !== null).toBe(delta > 0);
      refused(r);
    },
  );
  it('session userId is checked rather than client identity fields', () => {
    const row = { ...session(), sess: { userId: uuid(7), role: 'SYSTEM_ADMIN', approved: true } };
    expect(
      mapW01PrincipalRows({ ...principalInput(), session: pin('SESSION', row) }).guard.reason,
    ).toBe('SESSION_WRONG_ACCOUNT_OR_EXPIRED');
  });
  it.each(['LOCAL_CLOCK', 'UNKNOWN'] as const)(
    'rejects %s clock for grant and principal',
    (source) => {
      const c = context(),
        ctx = { ...c, clock: { ...c.clock, source } };
      expect(mapW01GrantRow({ ...grantInput(), context: ctx }).guard.reason).toBe(
        'SERVER_CLOCK_UNVERIFIED',
      );
      expect(mapW01PrincipalRows({ ...principalInput(), context: ctx }).projection).toBeNull();
    },
  );
  it.each([NaN, Infinity, -1, now + 0.5])('rejects malformed supplied epoch %s', (epochMs) => {
    const c = context();
    expect(
      mapW01GrantRow({ ...grantInput(), context: { ...c, clock: { ...c.clock, epochMs } } })
        .projection,
    ).toBeNull();
  });
  it('clock read must be bound to the selected authority snapshot', () => {
    const c = context();
    expect(
      mapW01PrincipalRows({
        ...principalInput(),
        context: { ...c, clock: { ...c.clock, readRef: ref('other') } },
      }).guard.reason,
    ).toBe('SERVER_CLOCK_UNVERIFIED');
  });
  it('stale authority epoch prevents both projections', () => {
    const c = { ...context(), currentEpoch: ref('changed-epoch') };
    expect(mapW01GrantRow({ ...grantInput(), context: c }).guard.reason).toBe(
      'AUTHORITY_EPOCH_STALE',
    );
    expect(mapW01PrincipalRows({ ...principalInput(), context: c }).projection).toBeNull();
  });
  it.each(['user', 'session'] as const)(
    'selected/current %s pin mismatch blocks principal',
    (key) => {
      const i = principalInput();
      expect(
        mapW01PrincipalRows({ ...i, [key]: { ...i[key], current: ref('changed') } }).guard.reason,
      ).toBe('ROW_REVISION_STALE');
    },
  );
  it.each(['user', 'grant'] as const)('selected/current %s pin mismatch blocks grant', (key) => {
    const i = grantInput();
    expect(
      mapW01GrantRow({ ...i, [key]: { ...i[key], current: ref('changed') } }).guard.reason,
    ).toBe('ROW_REVISION_STALE');
  });
  it('changing a grant row without changing selected/current pins is rejected', () => {
    const i = grantInput();
    expect(
      mapW01GrantRow({ ...i, grant: { ...i.grant, row: { ...grant(), expiresAt: at(120_000) } } })
        .guard.reason,
    ).toBe('ROW_CONTENT_PIN_MISMATCH');
  });
  it('changing a session row without changing its pin is rejected', () => {
    const i = principalInput();
    expect(
      mapW01PrincipalRows({
        ...i,
        session: { ...i.session, row: { ...session(), expire: at(120_000) } },
      }).guard.reason,
    ).toBe('ROW_CONTENT_PIN_MISMATCH');
  });
  it('missing canonical person never falls back to account ID', () => {
    const c = { ...context(), personBindings: [] };
    expect(mapW01PrincipalRows({ ...principalInput(), context: c }).projection).toBeNull();
    expect(mapW01GrantRow({ ...grantInput(), context: c }).projection).toBeNull();
  });
  it('ambiguous canonical-person bindings are blocked', () => {
    const c = context();
    expect(
      mapW01PrincipalRows({
        ...principalInput(),
        context: { ...c, personBindings: [...c.personBindings, c.personBindings[0]] },
      }).projection,
    ).toBeNull();
  });
  it('stale canonical-person binding is blocked', () => {
    const c = context();
    expect(
      mapW01PrincipalRows({
        ...principalInput(),
        context: {
          ...c,
          personBindings: c.personBindings.map((b) => ({ ...b, readRef: ref('stale') })),
        },
      }).projection,
    ).toBeNull();
  });
  it.each([1, 2])(
    'two accounts of one person cannot independently approve (approver shares person %i)',
    (n) => {
      const c = context();
      const ctx = {
        ...c,
        personBindings: c.personBindings.map((b) =>
          b.accountId === uuid(3) ? { ...b, personId: `person-${n}` } : b,
        ),
      };
      expect(mapW01GrantRow({ ...grantInput(), context: ctx }).guard.reason).toBe(
        'INDEPENDENT_GRANT_PEOPLE_REQUIRED',
      );
    },
  );
  it.each([1, 2])('approver cannot equal account %i', (n) => {
    expect(mapW01GrantRow(withGrant({ approvedBy: uuid(n) })).guard.reason).toBe(
      'INDEPENDENT_GRANT_ACCOUNTS_REQUIRED',
    );
  });
  it('requester cannot be recipient', () => {
    expect(mapW01GrantRow(withGrant({ requestedBy: uuid(1) })).guard.reason).toBe(
      'INDEPENDENT_GRANT_ACCOUNTS_REQUIRED',
    );
  });
  it.each([-1, 0, 1])('grant effectiveAt %+i ms seam uses supplied snapshot', (delta) => {
    const r = mapW01GrantRow(withGrant({ effectiveAt: at(delta) }));
    expect(r.projection !== null).toBe(delta <= 0);
    refused(r);
  });
  it.each([-1, 0, 1])('grant expiresAt %+i ms seam is exclusive', (delta) => {
    const r = mapW01GrantRow(withGrant({ expiresAt: at(delta) }));
    expect(r.projection !== null).toBe(delta > 0);
    refused(r);
  });
  it('revocation is rejected even when requested grant was formerly approved', () => {
    expect(
      mapW01GrantRow(
        withGrant({ revokedAt: at(-1), revokedBy: uuid(3), revokeReason: 'Synthetic revoke' }),
      ).guard.reason,
    ).toBe('GRANT_REVOKED');
  });
  it.each([
    { approvedBy: null, approvedAt: null },
    { approvedBy: uuid(3), approvedAt: null },
    { approvedBy: null, approvedAt: at(-1) },
    { revokedAt: at(-1) },
    { revokeReason: 'orphan reason' },
    { revokedBy: uuid(3) },
  ])('missing or contradictory approval/revocation fails closed %j', (patch) => {
    expect(mapW01GrantRow(withGrant(patch)).projection).toBeNull();
  });
  it.each([
    { approvedAt: at(1) },
    { createdAt: at(1) },
    { approvedAt: at(-4_000) },
    { expiresAt: at(-1_000) },
    { effectiveAt: at(60_000) },
  ])('impossible/future temporal evidence fails closed %j', (patch) => {
    expect(mapW01GrantRow(withGrant(patch)).projection).toBeNull();
  });
  it.each([
    { capability: 'accounts.manage' },
    { capability: 'report.export' },
    { userId: uuid(8) },
    { scopeType: 'GLOBAL', scopeId: null },
    { scopeType: 'COURSE' },
    { scopeId: uuid(8) },
    { scopeId: '*' },
  ])('exact grant/principal/resource is required %j', (patch) => {
    expect(mapW01GrantRow(withGrant(patch)).projection).toBeNull();
  });
  it('invalid role cannot launder a scoped grant', () => {
    const u = pin('USER', { ...user(), role: 'CASHIER' });
    expect(mapW01GrantRow({ ...grantInput(), user: u }).guard.reason).toBe('ROLE_RESOURCE_DENIED');
  });
  it.each(['approvedAt', 'createdAt', 'expiresAt', 'effectiveAt'] as const)(
    'native %s Date is required; no string/client clock coercion',
    (key) => {
      const row = { ...grant(), [key]: at(0).toISOString() };
      expect(w01ProjectionPin('GRANT', row)).toBeNull();
    },
  );
  it('invalid native Date is rejected', () => {
    expect(w01ProjectionPin('SESSION', { ...session(), expire: new Date(NaN) })).toBeNull();
  });
  it('no getters are evaluated while extracting W01 fields', () => {
    const row = { ...grant() },
      getter = jest.fn(() => uuid(3));
    Object.defineProperty(row, 'approvedBy', { get: getter });
    expect(w01ProjectionPin('GRANT', row)).toBeNull();
    expect(getter).not.toHaveBeenCalled();
  });
  it('malformed/private exception values are not exposed', () => {
    const row = {
      ...session(),
      expire: {
        getTime: () => {
          throw Error('secret');
        },
      },
    };
    const r = mapW01PrincipalRows({ ...principalInput(), session: pin('SESSION', row) });
    expect(JSON.stringify(r)).not.toContain('secret');
    expect(r.projection).toBeNull();
  });
  it('projection omits reason, full session payload and mutable Date aliases', () => {
    const i = grantInput(),
      before = JSON.stringify(i),
      r = mapW01GrantRow(i);
    expect(JSON.stringify(i)).toBe(before);
    expect(JSON.stringify(r)).not.toContain('Synthetic permission request');
    const p = mapW01PrincipalRows(principalInput());
    expect(JSON.stringify(p)).not.toContain('cookie');
    const revision = r.projection!.ref.revision;
    (i.grant.current as { revision: string }).revision = 'mutated-after-read';
    expect(r.projection!.ref.revision).toBe(revision);
  });
  it('a POSTGRESQL_CLOCK/verified marker cannot promote row origin to runtime trust', () => {
    const r = mapW01GrantRow({
      ...grantInput(),
      trusted: true,
      approved: true,
      runtimeAuthorized: true,
    } as Parameters<typeof mapW01GrantRow>[0]);
    refused(r);
    expect(r.guard.decision).toBe('BLOCKED');
  });
  it.each([null, undefined, {}])('malformed outer input is safely blocked %j', (value) => {
    refused(mapW01GrantRow(value as Parameters<typeof mapW01GrantRow>[0]));
    refused(mapW01PrincipalRows(value as Parameters<typeof mapW01PrincipalRows>[0]));
  });
});
