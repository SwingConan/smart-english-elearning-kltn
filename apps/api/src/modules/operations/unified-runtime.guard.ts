import { ServiceUnavailableException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
export async function verifyUnifiedTarget(tx: Prisma.TransactionClient) {
  const raw = process.env.E2E_DATABASE_URL;
  if (
    process.env.V2_UNIFIED_RUNTIME !== 'DEV_UNIFIED_01' ||
    process.env.NODE_ENV === 'production' ||
    !raw ||
    raw !== process.env.DATABASE_URL
  )
    throw new ServiceUnavailableException('UNIFIED_VERIFIED_QA_REQUIRED');
  const url = new URL(raw);
  if (
    url.hostname !== '127.0.0.1' ||
    url.port !== '55401' ||
    url.username !== 'wave01' ||
    !/^\/v2_wave01_dev_test_w04b_unified_runtime01_[a-z0-9_]+$/.test(url.pathname) ||
    url.pathname.slice(1) !== process.env.V2_UNIFIED_DATABASE
  )
    throw new ServiceUnavailableException('UNIFIED_TARGET_IDENTITY_REQUIRED');
  await tx.$queryRaw`SELECT 1 FROM runtime_v2.assert_target()`;
  const [binding] = await tx.$queryRaw<
    {
      oid: string;
      physical: string;
      datasetSha256: string;
      database: string;
      schema: string;
      checkedAt: Date;
    }[]
  >`SELECT b.database_oid::text AS oid,b.physical_id AS physical,b.dataset_sha256 AS "datasetSha256",current_database() AS database,current_schema() AS schema,clock_timestamp() AS "checkedAt" FROM runtime_v2.binding b WHERE singleton`;
  if (
    !binding ||
    binding.oid !== process.env.V2_UNIFIED_OID ||
    binding.physical !== process.env.V2_UNIFIED_PHYSICAL ||
    binding.datasetSha256 !== process.env.V2_UNIFIED_DATASET_SHA256
  )
    throw new ServiceUnavailableException('UNIFIED_TARGET_IDENTITY_REQUIRED');
  return binding;
}
