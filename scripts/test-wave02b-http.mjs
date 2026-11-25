// Exact-path regression runner; explicit identity-verified empty disposable DB only.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
await require('./lib/e2e-target.cjs').verify();
const { Client } = require('pg'),
  db = new Client({ connectionString: process.env.E2E_DATABASE_URL });
try {
  await db.connect();
  const {
    rows: [r],
  } = await db.query('SELECT count(*)::int AS n FROM users');
  if (r.n) throw Error('Use a NEW empty marked disposable DB; no implicit cleanup or seed');
} finally {
  await db.end();
}
mkdirSync('.local-storage/v2-wave02b/regression', { recursive: true });
const tests = [
  'wave02b-planning',
  'wave02-academic',
  'wave01-authority',
  'wave01-timestamp',
  's10-postgres',
  's10-server',
  'se-sw-media',
].map((n) => 'apps/api/test/' + n + '.e2e-spec.ts');
const r = spawnSync(
  process.execPath,
  [
    resolve('node_modules/jest/bin/jest.js'),
    '--config',
    'apps/api/test/jest-e2e.json',
    '--runInBand',
    '--runTestsByPath',
    ...tests,
    '--testTimeout=30000',
    '--json',
    '--outputFile=.local-storage/v2-wave02b/combined-http.json',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      WAVE01_EVIDENCE_ROOT: resolve('.local-storage/v2-wave02b/regression'),
      WAVE02_EVIDENCE_ROOT: resolve('.local-storage/v2-wave02b/regression'),
    },
  },
);
if (r.error) throw r.error;
process.exitCode = r.status ?? 1;
