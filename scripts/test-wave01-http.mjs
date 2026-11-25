// Explicit safe runner: never fall back to apps/api/.env or select the full legacy E2E suite.
import { Client } from 'pg';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const value = process.env.WAVE01_PG_URL;
if (!value) throw new Error('WAVE01_PG_URL must name a NEW empty isolated Wave01 DEV test DB');
const url = new URL(value);
if (
  url.hostname !== '127.0.0.1' ||
  url.port !== '55401' ||
  !/^\/v2_wave01_dev_test_[a-z0-9_]+$/.test(url.pathname)
)
  throw new Error('Unsupported target');
if (process.env.E2E_DATABASE_URL && process.env.E2E_DATABASE_URL !== value)
  throw new Error('E2E_TARGET_MISMATCH');
// Shared query-parameter/identity/marker verification precedes this runner's first client.
await require('./lib/e2e-target.cjs').verify({ ...process.env, E2E_DATABASE_URL: value });
const db = new Client({ connectionString: value });
await db.connect();
try {
  const {
    rows: [location],
  } = await db.query('SHOW data_directory');
  if (resolve(location.data_directory) !== resolve('.local-storage/v2-wave01/postgres'))
    throw new Error('Wrong cluster');
  const {
    rows: [users],
  } = await db.query('SELECT count(*)::int AS count FROM users');
  if (users.count !== 0)
    throw new Error(
      'Test DB must be empty of users. Create another disposable DB; this runner never deletes data.',
    );
} finally {
  await db.end();
}
const result = spawnSync(
  process.execPath,
  [
    resolve('node_modules/jest/bin/jest.js'),
    '--config',
    'apps/api/test/jest-e2e.json',
    '--runInBand',
    '--runTestsByPath',
    'apps/api/test/wave01-authority.e2e-spec.ts',
    'apps/api/test/wave01-timestamp.e2e-spec.ts',
    'apps/api/test/s10-postgres.e2e-spec.ts',
    'apps/api/test/se-sw-media.e2e-spec.ts',
    'apps/api/test/s10-server.e2e-spec.ts',
    '--testTimeout=30000',
    '--json',
    '--outputFile=.local-storage/v2-wave01/consolidated-fix/combined-http.json',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      E2E_DATABASE_URL: value,
      DATABASE_URL: value,
      BATCH04_PG_URL: value,
      WAVE01_EVIDENCE_ROOT: resolve('.local-storage/v2-wave01/consolidated-fix'),
    },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
