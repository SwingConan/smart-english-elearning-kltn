import { HttpException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';

export async function s10ProtocolEnabled(tx: Prisma.TransactionClient): Promise<boolean> {
  if (process.env.S10_ARMED_ENABLED !== 'DEV_DEC045') return false;
  const url = new URL(process.env.DATABASE_URL ?? 'postgresql://disabled');
  if (
    url.hostname !== '127.0.0.1' ||
    url.port !== '55401' ||
    !/^\/v2_wave01_dev_test_/.test(url.pathname)
  )
    throw new HttpException({ code: 'S10_DEV_IDENTITY_REQUIRED' }, 503);
  const [identity] = await tx.$queryRaw<Array<{ ok: boolean }>>`
    SELECT current_user='wave01' AND current_schema()='public'
      AND replace(current_setting('data_directory'),chr(92),'/')=${
        process
          .cwd()
          .replace(/\\/g, '/')
          .replace(/\/apps\/api$/, '') + '/.local-storage/v2-wave01/postgres'
      }
      AND shobj_description(oid,'pg_database')='SMART_ENGLISH_DISPOSABLE_E2E_V1' AS ok
    FROM pg_database WHERE datname=current_database()`;
  if (!identity?.ok || (process.env.S10_GRANT_SECRET?.length ?? 0) < 32)
    throw new HttpException({ code: 'S10_DEV_CONFIGURATION_REQUIRED' }, 503);
  return true;
}

export async function s10NewAttemptProtocol(tx: Prisma.TransactionClient): Promise<number> {
  if (!(await s10ProtocolEnabled(tx))) return 1;
  await tx.$queryRaw`SELECT set_config('app.s10_enable','DEC045',true)`;
  return 2;
}
