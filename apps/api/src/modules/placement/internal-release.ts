import type { Prisma } from '../../generated/prisma/client';
import { privatePlacementPreviewEnabled } from './placement-preview.guard';
import { validateTiming, type TimingPolicy } from './workflow.policy';
import type { PlacementSnapshot } from './source-eligibility';

export const INTERNAL_RELEASE = 'PO_INTERNAL_20261113';
const ALLOWED_INTERNAL_ORIGINS = new Set([
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3040',
  'https://oink-crazed-frosting.ngrok-free.dev',
  'https://smartenglishcenter.site',
  'https://www.smartenglishcenter.site',
]);
export type InternalPlacementRelease = {
  sourceId: string;
  sourceHash: string;
  policyId: string;
  timing: TimingPolicy;
  decision: { authority: string; scope: string; statement: string };
};

// This authorization is separate from historical academic/media reviews. It never
// publishes a source or grants staff capabilities, and is limited to the pinned local DB
// and approved Smart English demo origins behind the local/public gateway.
export async function internalPlacementEnabled(tx: Prisma.TransactionClient) {
  if (
    process.env.PLACEMENT_INTERNAL_RELEASE !== INTERNAL_RELEASE ||
    !ALLOWED_INTERNAL_ORIGINS.has(process.env.WEB_ORIGIN ?? '') ||
    !(await privatePlacementPreviewEnabled(tx))
  )
    return false;
  await tx.$queryRaw`SELECT 1 AS verified FROM br136_bank_check.assert_target()`;
  const rows = await tx.$queryRaw<{ present: boolean }[]>`
    SELECT to_regclass('public.placement_internal_releases') IS NOT NULL AS present`;
  return rows[0]?.present === true;
}

export async function internalPlacementRelease(
  tx: Prisma.TransactionClient,
  sourceId: string,
  allowArchived = false,
) {
  if (!(await internalPlacementEnabled(tx))) return null;
  const rows = allowArchived
    ? await tx.$queryRaw<InternalPlacementRelease[]>`
        SELECT "sourceId", "sourceHash", "policyId", timing, decision
        FROM placement_internal_releases WHERE "sourceId"=${sourceId}::uuid
          AND "decisionId"=${INTERNAL_RELEASE}
        ORDER BY active DESC, "authorizedAt" DESC LIMIT 1`
    : await tx.$queryRaw<InternalPlacementRelease[]>`
        SELECT "sourceId", "sourceHash", "policyId", timing, decision
        FROM placement_internal_releases WHERE "sourceId"=${sourceId}::uuid
          AND "decisionId"=${INTERNAL_RELEASE} AND active=true`;
  const release = rows[0];
  return release?.decision.authority === 'PO_USER_CONFIRMATION' &&
    release.decision.scope === 'SMART_ENGLISH_INTERNAL_LOCALHOST'
    ? release
    : null;
}

export function releasedTiming(
  release: InternalPlacementRelease | null,
  source: { sourceHash: string; s: PlacementSnapshot },
  policyId: string,
  fallback: TimingPolicy,
) {
  if (!release) return fallback;
  if (
    release.sourceHash !== source.sourceHash ||
    release.policyId !== policyId ||
    !validateTiming(source.s, release.timing, source.sourceHash)
  )
    throw new Error('INTERNAL_RELEASE_SOURCE_OR_TIMING_CHANGED');
  return release.timing;
}
