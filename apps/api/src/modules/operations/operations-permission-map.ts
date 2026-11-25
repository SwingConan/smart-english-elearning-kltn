import type {
  BusinessRole,
  GrantRead,
  GuardResult,
  Permission,
  ResourceScope,
  StaffOrLearner,
} from './operations.contracts';
import {
  boundaryGuard,
  boundaryRef,
  copyBoundaryData,
  equalScope,
} from './operations-authority-adapter';
import { roleProjection } from './operations-foundation';

/** DEC069 eligibility only. This is NOT a W01 registry or a grant of authority. */
const roles: readonly BusinessRole[] = Object.freeze([
  'STUDENT',
  'INSTRUCTOR',
  'COUNSELOR',
  'ACADEMIC_MANAGER',
  'CASHIER',
  'TEACHING_INSPECTOR',
  'SYSTEM_ADMIN',
]);
export const W10_PERMISSION_ROLES: Readonly<Record<Permission, readonly BusinessRole[]>> =
  Object.freeze({
    'cms.draft': Object.freeze(['COUNSELOR'] as const),
    'cms.review': Object.freeze(['ACADEMIC_MANAGER'] as const),
    'cms.publish': Object.freeze(['ACADEMIC_MANAGER'] as const),
    'ops.config.change': Object.freeze(['SYSTEM_ADMIN'] as const),
    'ops.audit.read': Object.freeze(['SYSTEM_ADMIN'] as const),
    'report.view': roles,
    'report.export': roles,
  });

export function w10RoleEligible(role: unknown, permission: unknown): boolean {
  return (
    typeof permission === 'string' &&
    Object.hasOwn(W10_PERMISSION_ROLES, permission) &&
    typeof role === 'string' &&
    W10_PERMISSION_ROLES[permission as Permission].some((r) => r === role)
  );
}

export interface W10PermissionRequest {
  readonly subject: Pick<StaffOrLearner, 'principalId' | 'personId' | 'role'>;
  readonly permission: Permission;
  readonly scope: ResourceScope;
  readonly explicitGrant: GrantRead | null;
}
export interface W10PermissionMapping {
  readonly guard: GuardResult;
  readonly roleEligible: boolean;
  readonly explicitGrantMatched: boolean;
  /** A structural candidate only; it cannot be sent to W01 to authorize a call. */
  readonly proposedW01Scope: { readonly type: 'CLASS'; readonly id: string } | null;
  readonly currentRegistrySupported: false;
  readonly currentConstraintSupported: false;
}
const uuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const literal = (v: string) => !!v.trim() && !/[*/%]/.test(v);

/** Pure OFFLINE comparison, never an authenticated capability resolver.
 * Inspected W01: permission.policy.ts has no W10 capability; migration33's
 * grant_scope (unchanged in 34) rejects every scoped W10 capability. Generic
 * GLOBAL rows are deliberately never considered. Registration alone is unsafe.
 * No caller flag/marker can make an unsupported mapping trusted or supported.
 */
export function mapW10Permission(input: W10PermissionRequest): W10PermissionMapping {
  let roleEligible = false;
  let explicitGrantMatched = false;
  let proposedW01Scope: W10PermissionMapping['proposedW01Scope'] = null;
  const result = (decision: GuardResult['decision'], reason: string): W10PermissionMapping => ({
    guard: boundaryGuard(decision, reason),
    roleEligible,
    explicitGrantMatched,
    proposedW01Scope,
    currentRegistrySupported: false,
    currentConstraintSupported: false,
  });
  try {
    const { subject, permission, scope, explicitGrant: grant } = copyBoundaryData(input);
    roleEligible = w10RoleEligible(subject.role, permission);
    if (!roleEligible) return result('DENIED', 'ROLE_OR_CAPABILITY_DENIED');
    if (
      !literal(subject.principalId) ||
      !literal(subject.personId) ||
      !equalScope(scope, scope) ||
      !literal(scope.id)
    )
      return result('DENIED', 'EXACT_RESOURCE_REQUIRED');
    if (permission.startsWith('cms.')) {
      if (scope.kind !== 'CMS') return result('DENIED', 'ROLE_RESOURCE_DENIED');
    } else if (permission.startsWith('ops.')) {
      if (scope.kind !== 'TECHNICAL') return result('DENIED', 'ROLE_RESOURCE_DENIED');
    } else {
      const projection = roleProjection(subject.role);
      if (
        !projection?.scopeKinds.includes(scope.kind) ||
        (subject.role === 'STUDENT' && scope.id !== subject.principalId) ||
        (scope.kind === 'STAFF' && scope.id !== subject.personId)
      )
        return result('DENIED', 'ROLE_RESOURCE_DENIED');
    }
    if (
      !grant ||
      grant.principalId !== subject.principalId ||
      grant.permission !== permission ||
      !equalScope(grant.scope, scope)
    )
      return result('DENIED', 'EXPLICIT_EXACT_GRANT_REQUIRED');
    if (grant.state === 'REVOKED' || grant.validity === 'INVALID')
      return result('DENIED', 'GRANT_REVOKED_OR_INVALID');
    if (
      grant.state !== 'ACTIVE' ||
      grant.validity !== 'VALID' ||
      !boundaryRef(grant.ref) ||
      !boundaryRef(grant.decisionRef) ||
      !boundaryRef(grant.authorityRef) ||
      typeof grant.authorityEpoch !== 'string' ||
      !grant.authorityEpoch.trim()
    )
      return result('BLOCKED', 'GRANT_PROVENANCE_UNVERIFIED');
    explicitGrantMatched = true;
    if (scope.kind === 'CLASS') {
      if (!uuid(scope.id)) return result('DENIED', 'W01_CLASS_UUID_REQUIRED');
      proposedW01Scope = { type: 'CLASS', id: scope.id };
      return result('BLOCKED', 'W01_W10_REGISTRY_AND_CONSTRAINT_UNSUPPORTED');
    }
    // PROGRAM is not a Course ID. No trusted server relation lookup exists in
    // this batch. Even a caller-provided courseId/approved/trusted marker is inert.
    if (scope.kind === 'PROGRAM') return result('BLOCKED', 'PROGRAM_COURSE_LOOKUP_UNVERIFIED');
    return result('BLOCKED', 'RESOURCE_CONSTRAINT_UNSUPPORTED');
  } catch {
    return result('BLOCKED', 'MALFORMED_PERMISSION_INPUT');
  }
}
