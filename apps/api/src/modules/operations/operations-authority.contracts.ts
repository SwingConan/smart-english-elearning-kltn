import type {
  GrantRead,
  GuardResult,
  Permission,
  ResourceScope,
  Revision,
  ScopedAccess,
  StaffOrLearner,
} from './operations.contracts';

declare const contextBrand: unique symbol;
/** Opaque in-process binding, NOT proof of authentication. Only its issuing adapter can use it. */
export interface OperationsAuthorityContext {
  readonly [contextBrand]: true;
}
export interface PrincipalRead {
  readonly ref: Revision;
  readonly principal: StaffOrLearner;
  readonly accountState: 'ACTIVE' | 'INACTIVE' | 'UNKNOWN';
  readonly authorityEpoch: string;
}
/** NEW required integration ports, not existing W01 APIs. Bind per authenticated
 * server request. readPrincipal has no caller user/role parameter. S2 supplies no
 * concrete W01/Nest/DB implementation and cannot declare a provider VERIFIED.
 */
export interface OperationsAuthorityPort {
  readonly mode: 'UNIMPLEMENTED' | 'IN_MEMORY_ONLY';
  readPrincipal(): Promise<PrincipalRead | null>;
  readGrant(
    principalId: string,
    permission: Permission,
    scope: ResourceScope,
  ): Promise<GrantRead | null>;
}
export interface AuthorityOpenResult {
  readonly guard: GuardResult;
  readonly context: OperationsAuthorityContext | null;
}
export interface AuthorityAccessResult {
  readonly guard: GuardResult;
  readonly access: ScopedAccess | null;
}
