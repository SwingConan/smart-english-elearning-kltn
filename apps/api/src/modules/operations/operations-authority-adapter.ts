import type {
  AuthorityAccessResult,
  AuthorityOpenResult,
  OperationsAuthorityContext,
  OperationsAuthorityPort,
  PrincipalRead,
} from './operations-authority.contracts';
import type {
  GrantRead,
  GuardResult,
  Permission,
  ResourceScope,
  Revision,
} from './operations.contracts';
import { roleProjection } from './operations-foundation';

export const boundaryGuard = (decision: GuardResult['decision'], reason: string): GuardResult => ({
  decision,
  reason,
  assurance: 'OFFLINE_CONSISTENCY_ONLY',
  runtimeAuthorized: false,
  requiresServerVerification: true,
});
export const boundaryRef = (r: Revision | null | undefined): r is Revision =>
  !!r &&
  typeof r.id === 'string' &&
  !!r.id.trim() &&
  typeof r.revision === 'string' &&
  !!r.revision.trim();
export const equalRef = (a: Revision | null | undefined, b: Revision | null | undefined) =>
  boundaryRef(a) && boundaryRef(b) && a.id === b.id && a.revision === b.revision;
export const equalScope = (a: ResourceScope, b: ResourceScope) =>
  !!a &&
  !!b &&
  typeof a.id === 'string' &&
  !!a.id.trim() &&
  a.id === b.id &&
  a.kind === b.kind &&
  [
    'LEARNER',
    'CLASS',
    'PROGRAM',
    'SUPPORT_QUEUE',
    'LEDGER',
    'INSPECTION',
    'STAFF',
    'TECHNICAL',
    'CMS',
  ].includes(a.kind);

/** Defensive data copy at every read boundary. No getters, classes, symbols,
 * mutable aliases or error details accepted as source facts. Other VM plain
 * records (Jest structuredClone) are supported without trusting a marker.
 */
export function copyBoundaryData<T>(value: T): T {
  function copy(v: unknown, depth: number): unknown {
    if (depth > 40) throw Error('BAD_BOUNDARY_DATA');
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (!v || typeof v !== 'object') throw Error('BAD_BOUNDARY_DATA');
    const proto = Object.getPrototypeOf(v);
    if (!Array.isArray(v) && proto !== null) {
      const c = Object.getOwnPropertyDescriptor(proto, 'constructor');
      if (
        Object.getPrototypeOf(proto) !== null ||
        !c ||
        !('value' in c) ||
        typeof c.value !== 'function' ||
        Function.prototype.toString.call(c.value) !== Function.prototype.toString.call(Object)
      )
        throw Error('BAD_BOUNDARY_DATA');
    }
    if (Reflect.ownKeys(v).some((k) => typeof k !== 'string')) throw Error('BAD_BOUNDARY_DATA');
    const keys = Array.isArray(v)
      ? Array.from({ length: v.length }, (_, i) => String(i))
      : Object.keys(v);
    const result: Record<string, unknown> = Object.create(null);
    for (const k of keys) {
      const d = Object.getOwnPropertyDescriptor(v, k);
      if (!d || !('value' in d)) throw Error('BAD_BOUNDARY_DATA');
      result[k] = copy(d.value, depth + 1);
    }
    return Array.isArray(v) ? keys.map((k) => result[k]) : result;
  }
  return copy(value, 0) as T;
}

const roles = [
  'STUDENT',
  'INSTRUCTOR',
  'COUNSELOR',
  'ACADEMIC_MANAGER',
  'CASHIER',
  'TEACHING_INSPECTOR',
  'SYSTEM_ADMIN',
];
const permissions: readonly Permission[] = [
  'cms.draft',
  'cms.review',
  'cms.publish',
  'ops.config.change',
  'ops.audit.read',
  'report.view',
  'report.export',
];
const validPrincipal = (p: PrincipalRead | null): p is PrincipalRead =>
  !!p &&
  boundaryRef(p.ref) &&
  !!p.principal &&
  typeof p.principal.principalId === 'string' &&
  !!p.principal.principalId.trim() &&
  typeof p.principal.personId === 'string' &&
  !!p.principal.personId.trim() &&
  roles.includes(p.principal.role) &&
  boundaryRef(p.principal.sessionRef) &&
  p.principal.sessionState === 'AUTHENTICATED' &&
  p.accountState === 'ACTIVE' &&
  typeof p.authorityEpoch === 'string' &&
  !!p.authorityEpoch.trim();
const principalKey = (p: PrincipalRead) =>
  JSON.stringify([
    p.ref.id,
    p.ref.revision,
    p.principal.principalId,
    p.principal.personId,
    p.principal.role,
    p.principal.sessionRef.id,
    p.principal.sessionRef.revision,
    p.principal.sessionState,
    p.accountState,
    p.authorityEpoch,
  ]);
const grantKey = (g: GrantRead) =>
  JSON.stringify([
    g.ref.id,
    g.ref.revision,
    g.principalId,
    g.permission,
    g.scope.kind,
    g.scope.id,
    g.state,
    g.validity,
    g.authorityEpoch,
    g.decisionRef.id,
    g.decisionRef.revision,
    g.authorityRef.id,
    g.authorityRef.revision,
  ]);
interface Binding {
  principal: PrincipalRead;
  grants: Map<string, GrantRead>;
}

/** Contexts are request-local selectors, not transferable authorization. Ports
 * have no real implementation here; IN_MEMORY_ONLY never sets runtime authority.
 */
export class OperationsAuthorityAdapter {
  readonly #bindings = new WeakMap<OperationsAuthorityContext, Binding>();
  constructor(private readonly port: OperationsAuthorityPort | null) {}
  async open(): Promise<AuthorityOpenResult> {
    if (this.port?.mode !== 'IN_MEMORY_ONLY')
      return {
        guard: boundaryGuard('BLOCKED', 'AUTHORITY_INTEGRATION_UNAVAILABLE'),
        context: null,
      };
    try {
      const p = copyBoundaryData(await this.port.readPrincipal());
      if (!validPrincipal(p))
        return { guard: boundaryGuard('DENIED', 'SERVER_PRINCIPAL_UNAVAILABLE'), context: null };
      const c = Object.freeze(Object.create(null)) as OperationsAuthorityContext;
      this.#bindings.set(c, { principal: p, grants: new Map() });
      return {
        guard: boundaryGuard('CONDITIONS_MET_OFFLINE', 'PRINCIPAL_BOUND_OFFLINE'),
        context: c,
      };
    } catch {
      return { guard: boundaryGuard('BLOCKED', 'AUTHORITY_READ_FAILED'), context: null };
    }
  }
  async readAccess(
    context: OperationsAuthorityContext,
    permission: Permission,
    scope: ResourceScope,
  ): Promise<AuthorityAccessResult> {
    const b = this.#bindings.get(context);
    if (!b || this.port?.mode !== 'IN_MEMORY_ONLY')
      return { guard: boundaryGuard('DENIED', 'UNBOUND_CONTEXT'), access: null };
    try {
      if (!permissions.includes(permission) || !equalScope(scope, scope))
        return { guard: boundaryGuard('DENIED', 'REQUEST_SCOPE_INVALID'), access: null };
      const s = { kind: scope.kind, id: scope.id };
      const g = copyBoundaryData(
        await this.port.readGrant(b.principal.principal.principalId, permission, s),
      );
      const p = copyBoundaryData(await this.port.readPrincipal());
      if (!validPrincipal(p) || principalKey(p) !== principalKey(b.principal)) {
        this.#bindings.delete(context);
        return { guard: boundaryGuard('DENIED', 'PRINCIPAL_CHANGED_OR_EXPIRED'), access: null };
      }
      if (
        !g ||
        g.principalId !== p.principal.principalId ||
        g.permission !== permission ||
        !equalScope(g.scope, s) ||
        g.state === 'REVOKED' ||
        g.validity === 'INVALID'
      )
        return { guard: boundaryGuard('DENIED', 'CURRENT_GRANT_DENIED'), access: null };
      // Apply unchanged S1 role/ownership constraints before any academic/CMS read,
      // not merely when a later projection would discard unauthorized data.
      if (permission.startsWith('cms.')) {
        const expected = permission === 'cms.draft' ? 'COUNSELOR' : 'ACADEMIC_MANAGER';
        if (p.principal.role !== expected)
          return { guard: boundaryGuard('DENIED', 'ROLE_DENIED'), access: null };
        if (s.kind !== 'CMS')
          return { guard: boundaryGuard('DENIED', 'ROLE_RESOURCE_SCOPE_DENIED'), access: null };
      } else if (permission.startsWith('ops.')) {
        if (p.principal.role !== 'SYSTEM_ADMIN')
          return { guard: boundaryGuard('DENIED', 'ROLE_DENIED'), access: null };
        if (s.kind !== 'TECHNICAL')
          return { guard: boundaryGuard('DENIED', 'ROLE_RESOURCE_SCOPE_DENIED'), access: null };
      } else {
        const projection = roleProjection(p.principal.role);
        if (
          !projection ||
          !projection.scopeKinds.includes(s.kind) ||
          (p.principal.role === 'STUDENT' && s.id !== p.principal.principalId) ||
          (s.kind === 'STAFF' && s.id !== p.principal.personId)
        )
          return { guard: boundaryGuard('DENIED', 'ROLE_RESOURCE_SCOPE_DENIED'), access: null };
      }
      if (
        g.state !== 'ACTIVE' ||
        g.validity !== 'VALID' ||
        !boundaryRef(g.ref) ||
        !boundaryRef(g.decisionRef) ||
        !boundaryRef(g.authorityRef) ||
        typeof g.authorityEpoch !== 'string' ||
        !g.authorityEpoch.trim()
      )
        return { guard: boundaryGuard('BLOCKED', 'GRANT_PROVENANCE_UNAVAILABLE'), access: null };
      const k = JSON.stringify([permission, s.kind, s.id]),
        selected = b.grants.get(k);
      if (selected && grantKey(selected) !== grantKey(g)) {
        this.#bindings.delete(context);
        return { guard: boundaryGuard('DENIED', 'GRANT_CHANGED'), access: null };
      }
      if (!selected) b.grants.set(k, copyBoundaryData(g));
      return {
        guard: boundaryGuard('CONDITIONS_MET_OFFLINE', 'GRANT_BOUND_OFFLINE'),
        access: copyBoundaryData({
          actor: p.principal,
          selectedGrant: selected ?? g,
          currentGrant: g,
          scope: s,
        }),
      };
    } catch {
      this.#bindings.delete(context);
      return { guard: boundaryGuard('BLOCKED', 'AUTHORITY_READ_FAILED'), access: null };
    }
  }
  async revalidate(context: OperationsAuthorityContext): Promise<GuardResult> {
    const b = this.#bindings.get(context);
    if (!b || this.port?.mode !== 'IN_MEMORY_ONLY')
      return boundaryGuard('DENIED', 'UNBOUND_CONTEXT');
    try {
      const p = copyBoundaryData(await this.port.readPrincipal());
      if (!validPrincipal(p) || principalKey(p) !== principalKey(b.principal)) {
        this.#bindings.delete(context);
        return boundaryGuard('DENIED', 'PRINCIPAL_CHANGED_OR_EXPIRED');
      }
      for (const g of [...b.grants.values()]) {
        const r = await this.readAccess(context, g.permission, g.scope);
        if (!r.access) return r.guard;
      }
      return boundaryGuard('CONDITIONS_MET_OFFLINE', 'CURRENT_AUTHORITY_CONSISTENT_OFFLINE');
    } catch {
      this.#bindings.delete(context);
      return boundaryGuard('BLOCKED', 'AUTHORITY_READ_FAILED');
    }
  }
}
