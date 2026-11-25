import { resolve } from 'node:path';
import type { Prisma } from '../../generated/prisma/client';
// Deliberately not an authentication shortcut: callers must separately verify current actor/session.
export async function privatePlacementPreviewEnabled(tx: Prisma.TransactionClient) {
  if (
    process.env.NODE_ENV === 'production' ||
    (process.env.W04A_PREVIEW_ENABLED !== 'DEV_PREVIEW_ONLY' &&
      process.env.W04B_ENABLED !== 'DEV_WORKFLOW') ||
    !process.env.E2E_DATABASE_URL ||
    process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL
  )
    return false;
  try {
    const vpsApproved = process.env.VPS_DEPLOY_APPROVED === 'SMART_ENGLISH_VPS_2026';
    const u = new URL(process.env.E2E_DATABASE_URL);
    const allowedPort = u.port === '55401' || (vpsApproved && (u.port === '5432' || u.port === ''));
    if (
      u.hostname !== '127.0.0.1' ||
      !allowedPort ||
      (!(
        /^\/v2_wave01_dev_test_w04a_[a-z0-9_]+$/.test(u.pathname) &&
        process.env.W04A_PREVIEW_ENABLED === 'DEV_PREVIEW_ONLY'
      ) &&
        !(
          /^\/v2_wave01_dev_test_w04b_[a-z0-9_]+$/.test(u.pathname) &&
          process.env.W04B_ENABLED === 'DEV_WORKFLOW'
        ))
    )
      return false;
    const [i] = await tx.$queryRaw<
      {
        db: string;
        usr: string;
        dir: string;
        schema: string;
        marker: string;
        port: number;
        host: string;
      }[]
    >`SELECT current_database() AS db,current_user AS usr,current_setting('data_directory') AS dir,current_schema() AS schema,inet_server_port() AS port,host(inet_server_addr()) AS host,shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') AS marker`;
    const expectedPort = Number(u.port || '5432');
    const dirOk = vpsApproved
      ? Boolean(i?.dir)
      : !!i && resolve(i.dir) === resolve('.local-storage/v2-wave01/postgres');
    return (
      !!i &&
      i.db === u.pathname.slice(1) &&
      i.usr === 'wave01' &&
      i.schema === 'public' &&
      i.host === '127.0.0.1' &&
      (vpsApproved ? i.port === expectedPort : i.port === 55401) &&
      dirOk &&
      i.marker === 'SMART_ENGLISH_DISPOSABLE_E2E_V1'
    );
  } catch {
    return false;
  }
}
