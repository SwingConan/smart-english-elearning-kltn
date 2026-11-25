// Focused CF + exact retained regressions. No implicit migration, reset or seed.
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
    rows: [r],
  } = await db.query('SELECT count(*)::int AS n FROM users');
  if (r.n) throw Error('Use a NEW empty marked disposable18-history DB; no cleanup here');
} finally {
  await db.end();
}
const root = resolve('.local-storage/v2-wave02b-cf01');
mkdirSync(resolve(root, 'regression'), { recursive: true });
for (const dir of ['w01', 'w02a', 'w02b'])
  mkdirSync(resolve(root, 'regression', dir), { recursive: true });
const tests = [
  'wave02b-consolidated',
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
    '--testTimeout=60000',
    '--json',
    '--outputFile=' + resolve(root, 'combined-http.json'),
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      W02B_CF_EVIDENCE_ROOT: root,
      WAVE01_EVIDENCE_ROOT: resolve(root, 'regression/w01'),
      WAVE02_EVIDENCE_ROOT: resolve(root, 'regression/w02a'),
      WAVE02B_EVIDENCE_ROOT: resolve(root, 'regression/w02b'),
    },
  },
);
if (r.error) throw r.error;
process.exitCode = r.status ?? 1;
