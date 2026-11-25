// Exact CF01 + retained W01/W02/W03A/Placement regressions on a NEW verified20-history DB.
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
    } = await db.query('SELECT count(*)::int AS n FROM users'),
    {
      rows: [m],
    } = await db.query(
      'SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL',
    );
  if (u.n || m.n !== 20) throw Error('Use a NEW empty marked disposable20-history DB');
} finally {
  await db.end();
}
const root = resolve('.local-storage/v2-wave03a-cf01');
for (const d of ['w01', 'w02a', 'w02b', 'w02bcf', 'w03a'])
  mkdirSync(resolve(root, 'regression', d), { recursive: true });
const tests = [
  'wave03a-consolidated',
  'wave03a-class-lms',
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
      W03A_CF_EVIDENCE_ROOT: root,
      WAVE03A_EVIDENCE_ROOT: resolve(root, 'regression/w03a'),
      W02B_CF_EVIDENCE_ROOT: resolve(root, 'regression/w02bcf'),
      WAVE02B_EVIDENCE_ROOT: resolve(root, 'regression/w02b'),
      WAVE02_EVIDENCE_ROOT: resolve(root, 'regression/w02a'),
      WAVE01_EVIDENCE_ROOT: resolve(root, 'regression/w01'),
    },
  },
);
if (r.error) throw r.error;
process.exitCode = r.status ?? 1;
