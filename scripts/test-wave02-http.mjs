// W02A + retained W01/S10 regressions, exact paths, no dotenv target or implicit seed/migration.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
await require('./lib/e2e-target.cjs').verify();
const { Client } = require('pg'),
  db = new Client({ connectionString: process.env.E2E_DATABASE_URL });
try {
  await db.connect();
  const {
    rows: [u],
  } = await db.query('SELECT count(*)::int AS count FROM users');
  if (u.count) throw Error('Use a NEW empty marked disposable DB; this runner never deletes users');
} finally {
  await db.end();
}
mkdirSync(resolve('.local-storage/v2-wave02/regression'), { recursive: true });
const result = spawnSync(
  process.execPath,
  [
    resolve('node_modules/jest/bin/jest.js'),
    '--config',
    'apps/api/test/jest-e2e.json',
    '--runInBand',
    '--runTestsByPath',
    'apps/api/test/wave02-academic.e2e-spec.ts',
    'apps/api/test/wave01-authority.e2e-spec.ts',
    'apps/api/test/wave01-timestamp.e2e-spec.ts',
    'apps/api/test/s10-postgres.e2e-spec.ts',
    'apps/api/test/se-sw-media.e2e-spec.ts',
    'apps/api/test/s10-server.e2e-spec.ts',
    '--testTimeout=30000',
    '--json',
    '--outputFile=.local-storage/v2-wave02/combined-http.json',
  ],
  {
    stdio: 'inherit',
    env: { ...process.env, WAVE01_EVIDENCE_ROOT: resolve('.local-storage/v2-wave02/regression') },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
