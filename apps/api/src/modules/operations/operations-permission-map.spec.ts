import type { BusinessRole, GrantRead, Permission, ResourceScope } from './operations.contracts';
import {
  mapW10Permission,
  w10RoleEligible,
  W10_PERMISSION_ROLES,
  type W10PermissionRequest,
} from './operations-permission-map';

const id = '10000000-0000-4000-8000-000000000001';
const ref = (id: string) => ({ id, revision: 'synthetic-v1' });
const request = (
  role: BusinessRole = 'INSTRUCTOR',
  permission: Permission = 'report.view',
  scope: ResourceScope = { kind: 'CLASS', id },
): W10PermissionRequest => ({
  subject: { principalId: 'account-A', personId: 'person-A', role },
  permission,
  scope,
  explicitGrant: {
    ref: ref('grant'),
    principalId: 'account-A',
    permission,
    scope: { ...scope },
    state: 'ACTIVE',
    validity: 'VALID',
    authorityEpoch: 'epoch-1',
    decisionRef: ref('decision'),
    authorityRef: ref('authority'),
  },
});
const granted = (r: W10PermissionRequest) => r.explicitGrant as GrantRead;
const neverRuntime = (r: ReturnType<typeof mapW10Permission>) => {
  expect(r.guard).toMatchObject({
    runtimeAuthorized: false,
    assurance: 'OFFLINE_CONSISTENCY_ONLY',
    requiresServerVerification: true,
  });
  expect(r.guard.decision).not.toBe('CONDITIONS_MET_OFFLINE');
  expect(r.currentRegistrySupported).toBe(false);
  expect(r.currentConstraintSupported).toBe(false);
};

describe('W10 S3B pure permission mapping (no registry activation)', () => {
  const roles: BusinessRole[] = [
    'STUDENT',
    'INSTRUCTOR',
    'COUNSELOR',
    'ACADEMIC_MANAGER',
    'CASHIER',
    'TEACHING_INSPECTOR',
    'SYSTEM_ADMIN',
  ];
  const eligibility: [Permission, readonly BusinessRole[]][] = [
    ['cms.draft', ['COUNSELOR']],
    ['cms.review', ['ACADEMIC_MANAGER']],
    ['cms.publish', ['ACADEMIC_MANAGER']],
    ['ops.config.change', ['SYSTEM_ADMIN']],
    ['ops.audit.read', ['SYSTEM_ADMIN']],
    ['report.view', roles],
    ['report.export', roles],
  ];
  it.each(
    eligibility.flatMap(([cap, allowed]) =>
      roles.map((role) => [cap, role, allowed.includes(role)] as const),
    ),
  )('%s role eligibility for %s is %s, independently of a grant', (cap, role, eligible) => {
    expect(w10RoleEligible(role, cap)).toBe(eligible);
    const mapped = mapW10Permission(request(role, cap));
    expect(mapped.roleEligible).toBe(eligible);
    neverRuntime(mapped);
  });
  it.each([
    ['cms.draft', 'COUNSELOR', 'CMS'],
    ['cms.review', 'ACADEMIC_MANAGER', 'CMS'],
    ['cms.publish', 'ACADEMIC_MANAGER', 'CMS'],
    ['ops.config.change', 'SYSTEM_ADMIN', 'TECHNICAL'],
    ['ops.audit.read', 'SYSTEM_ADMIN', 'TECHNICAL'],
  ] as const)(
    'eligible %s still needs scoped constraint and trusted authority',
    (cap, role, kind) => {
      const r = mapW10Permission(request(role, cap, { kind, id }));
      expect(r.explicitGrantMatched).toBe(true);
      expect(r.proposedW01Scope).toBeNull();
      expect(r.guard.reason).toBe('RESOURCE_CONSTRAINT_UNSUPPORTED');
      neverRuntime(r);
    },
  );
  it.each([
    ['STUDENT', 'LEARNER', 'account-A'],
    ['INSTRUCTOR', 'CLASS', id],
    ['COUNSELOR', 'SUPPORT_QUEUE', 'QUEUE_A'],
    ['ACADEMIC_MANAGER', 'PROGRAM', 'program-A'],
    ['CASHIER', 'LEDGER', 'ledger-A'],
    ['TEACHING_INSPECTOR', 'INSPECTION', 'inspection-A'],
    ['TEACHING_INSPECTOR', 'STAFF', 'person-A'],
    ['SYSTEM_ADMIN', 'TECHNICAL', 'settings-A'],
  ] as const)('report scope %s/%s never falls back to GLOBAL', (role, kind, scopeId) => {
    const r = mapW10Permission(request(role, 'report.view', { kind, id: scopeId }));
    expect(r.explicitGrantMatched).toBe(true);
    expect(r.guard.decision).toBe('BLOCKED');
    expect(r.proposedW01Scope).toEqual(kind === 'CLASS' ? { type: 'CLASS', id } : null);
    neverRuntime(r);
  });
  it('cannot inherit accounts.manage or class.read', () => {
    for (const cap of [
      'accounts.manage',
      'class.read',
      'authority.approve',
      'constructor',
      '__proto__',
    ]) {
      expect(w10RoleEligible('SYSTEM_ADMIN', cap)).toBe(false);
      expect(
        mapW10Permission({ ...request('SYSTEM_ADMIN'), permission: cap as Permission }).guard
          .decision,
      ).toBe('DENIED');
    }
  });
  it('legacy coordinator is not a V2 role', () => {
    expect(w10RoleEligible('ADMIN_COORDINATOR', 'report.view')).toBe(false);
  });
  it('eligible role without explicit grant is denied', () => {
    expect(mapW10Permission({ ...request(), explicitGrant: null }).guard.reason).toBe(
      'EXPLICIT_EXACT_GRANT_REQUIRED',
    );
  });
  it.each(['GLOBAL', 'SUPPORT_TOPIC', 'COURSE', 'TEACHER', '*'])(
    'rejects direct %s scope claims',
    (kind) => {
      const r = request();
      const bad = { kind, id } as ResourceScope;
      expect(
        mapW10Permission({ ...r, scope: bad, explicitGrant: { ...granted(r), scope: bad } }).guard
          .decision,
      ).toBe('DENIED');
    },
  );
  it.each(['', '*', 'class/*', '%', 'all*'])('rejects wildcard/empty resource %s', (scopeId) => {
    expect(
      mapW10Permission(request('INSTRUCTOR', 'report.view', { kind: 'CLASS', id: scopeId })).guard
        .decision,
    ).toBe('DENIED');
  });
  it('cannot widen from a class grant to program or another class', () => {
    const r = request('ACADEMIC_MANAGER');
    for (const scope of [
      { kind: 'PROGRAM', id },
      { kind: 'CLASS', id: id.replace(/1$/, '2') },
    ] as const) {
      expect(mapW10Permission({ ...r, scope }).guard.reason).toBe('EXPLICIT_EXACT_GRANT_REQUIRED');
    }
  });
  it('does not derive export from view, or view from export', () => {
    for (const [have, want] of [
      ['report.view', 'report.export'],
      ['report.export', 'report.view'],
    ] as const) {
      const r = request('INSTRUCTOR', have);
      expect(mapW10Permission({ ...r, permission: want }).guard.reason).toBe(
        'EXPLICIT_EXACT_GRANT_REQUIRED',
      );
    }
  });
  it.each([
    ['STUDENT', 'LEARNER', 'account-B'],
    ['TEACHING_INSPECTOR', 'STAFF', 'person-B'],
    ['INSTRUCTOR', 'PROGRAM', id],
    ['CASHIER', 'CLASS', id],
    ['COUNSELOR', 'TECHNICAL', id],
    ['SYSTEM_ADMIN', 'CMS', id],
  ] as const)('denies ownership/role scope mismatch %s/%s', (role, kind, scopeId) => {
    expect(mapW10Permission(request(role, 'report.view', { kind, id: scopeId })).guard.reason).toBe(
      'ROLE_RESOURCE_DENIED',
    );
  });
  it.each(['cms.review', 'ops.config.change'] as const)('denies wrong resource for %s', (cap) => {
    const role = cap === 'cms.review' ? 'ACADEMIC_MANAGER' : 'SYSTEM_ADMIN';
    expect(mapW10Permission(request(role, cap)).guard.reason).toBe('ROLE_RESOURCE_DENIED');
  });
  it.each([{ state: 'REVOKED' }, { validity: 'INVALID' }] as const)(
    'rejects revoked/expired grant %j',
    (patch) => {
      const r = request();
      expect(
        mapW10Permission({ ...r, explicitGrant: { ...granted(r), ...patch } }).guard.decision,
      ).toBe('DENIED');
    },
  );
  it.each([
    { state: 'UNKNOWN' },
    { validity: 'UNKNOWN' },
    { authorityEpoch: '' },
    { decisionRef: ref('') },
    { authorityRef: ref('') },
    { ref: ref('') },
  ] as const)('blocks incomplete grant provenance %j', (patch) => {
    const r = request();
    expect(
      mapW10Permission({ ...r, explicitGrant: { ...granted(r), ...patch } }).guard.reason,
    ).toBe('GRANT_PROVENANCE_UNVERIFIED');
  });
  it('rejects a grant for another principal', () => {
    const r = request();
    expect(
      mapW10Permission({ ...r, explicitGrant: { ...granted(r), principalId: 'other' } }).guard
        .decision,
    ).toBe('DENIED');
  });
  it('CLASS candidate needs a UUID and is still unsupported', () => {
    expect(
      mapW10Permission(request('INSTRUCTOR', 'report.view', { kind: 'CLASS', id: 'class-A' })).guard
        .reason,
    ).toBe('W01_CLASS_UUID_REQUIRED');
    expect(mapW10Permission(request()).guard.reason).toBe(
      'W01_W10_REGISTRY_AND_CONSTRAINT_UNSUPPORTED',
    );
  });
  it('PROGRAM caller-supplied course/trusted/approved claims cannot create a trusted lookup', () => {
    const claimed = {
      ...request('ACADEMIC_MANAGER', 'report.view', { kind: 'PROGRAM', id }),
      courseId: id,
      trusted: true,
      approved: true,
      runtimeAuthorized: true,
    };
    const r = mapW10Permission(claimed);
    expect(r.proposedW01Scope).toBeNull();
    expect(r.guard.reason).toBe('PROGRAM_COURSE_LOOKUP_UNVERIFIED');
    neverRuntime(r);
  });
  it('a fixture marker cannot activate W10 capabilities', () => {
    const claimed = {
      ...request(),
      provenance: 'VERIFIED_SERVER',
      currentConstraintSupported: true,
    };
    const r = mapW10Permission(claimed);
    neverRuntime(r);
  });
  it('getter data is not executed as an authority source', () => {
    const getter = jest.fn(() => 'INSTRUCTOR');
    const r = request();
    Object.defineProperty(r.subject, 'role', { get: getter });
    expect(mapW10Permission(r).guard.decision).toBe('BLOCKED');
    expect(getter).not.toHaveBeenCalled();
  });
  it('does not mutate inputs or expose mutable matrix entries', () => {
    const r = request(),
      before = JSON.stringify(r);
    mapW10Permission(r);
    expect(JSON.stringify(r)).toBe(before);
    expect(Object.isFrozen(W10_PERMISSION_ROLES)).toBe(true);
    expect(Object.values(W10_PERMISSION_ROLES).every(Object.isFrozen)).toBe(true);
  });
  it.each([null, undefined, {}, { subject: null }])('malformed input is fail closed: %j', (r) => {
    neverRuntime(mapW10Permission(r as unknown as W10PermissionRequest));
  });
});
