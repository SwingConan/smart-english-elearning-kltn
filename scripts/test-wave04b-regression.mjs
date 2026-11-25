// W04B regression26: global last-approver invariants run on a DISTINCT empty marked DB.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url),
  guard = require('./lib/e2e-target.cjs');
await guard.verify();
const secondary = process.env.W04A_AUTHORITY_DATABASE_URL;
if (!secondary || secondary === process.env.E2E_DATABASE_URL)
  throw Error('Distinct explicit W04A_AUTHORITY_DATABASE_URL required');
if (process.env.W04A_PREVIEW_ENABLED !== 'DEV_PREVIEW_ONLY')
  throw Error('Explicit private DEV preview opt-in required for legacy protocol regressions');
const secondaryEnv = {
  ...process.env,
  E2E_DATABASE_URL: secondary,
  DATABASE_URL: secondary,
  WAVE01_PG_URL: secondary,
  BATCH04_PG_URL: secondary,
};
await guard.verify(secondaryEnv);
const { Client } = require('pg');
for (const url of [process.env.E2E_DATABASE_URL, secondary]) {
  const c = new Client({ connectionString: url });
  try {
    await c.connect();
    const {
      rows: [u],
    } = await c.query('SELECT count(*)::int AS n FROM users');
    const { rows: m } = await c.query(
      'SELECT migration_name,checksum,finished_at FROM _prisma_migrations ORDER BY migration_name',
    );
    if (
      u.n ||
      m.length !== 26 ||
      m.some(
        (x) =>
          !x.finished_at ||
          x.checksum !==
            createHash('sha256')
              .update(
                readFileSync(
                  resolve('apps/api/prisma/migrations', x.migration_name, 'migration.sql'),
                ),
              )
              .digest('hex'),
      )
    )
      throw Error('Use TWO NEW EMPTY marked26-history DBs with exact checksums');
  } finally {
    await c.end();
  }
}
const root = resolve('.local-storage/v2-wave04b/regression-suite');
for (const d of ['w01', 'w02a', 'w02b', 'w02bcf', 'w03a', 'w03ba', 'w03bb', 'w03bc'])
  mkdirSync(resolve(root, 'regression', d), { recursive: true });
const env = {
  ...process.env,
  W04A_EVIDENCE_ROOT: root,
  W03A_CF_EVIDENCE_ROOT: root,
  W03BC_EVIDENCE_ROOT: resolve(root, 'regression/w03bc'),
  W03BA_EVIDENCE_ROOT: resolve(root, 'regression/w03ba'),
  W03BB_EVIDENCE_ROOT: resolve(root, 'regression/w03bb'),
  WAVE03A_EVIDENCE_ROOT: resolve(root, 'regression/w03a'),
  W02B_CF_EVIDENCE_ROOT: resolve(root, 'regression/w02bcf'),
  WAVE02B_EVIDENCE_ROOT: resolve(root, 'regression/w02b'),
  WAVE02_EVIDENCE_ROOT: resolve(root, 'regression/w02a'),
  WAVE01_EVIDENCE_ROOT: resolve(root, 'regression/w01'),
};
const suites = [
  'wave04a-placement',
  'wave03bd-catalog-replay',
  'wave03bd-knowledge',
  'wave03bc-quiz',
  'wave03bb-grading',
  'wave03ba-assignment',
  'wave03a-consolidated',
  'wave03a-class-lms',
  'wave02b-consolidated',
  'wave02b-planning',
  'wave02-academic',
  'wave01-timestamp',
  's10-postgres',
  's10-server',
  'se-sw-media',
];
const results = [];
for (const [name, tests, e] of [
  ['main', suites, env],
  ['authority', ['wave01-authority'], { ...env, ...secondaryEnv }],
]) {
  const file = resolve(root, 'combined-' + name + '.json'),
    r = spawnSync(
      process.execPath,
      [
        resolve('node_modules/jest/bin/jest.js'),
        '--config',
        'apps/api/test/jest-e2e.json',
        '--runInBand',
        '--runTestsByPath',
        ...tests.map((x) => 'apps/api/test/' + x + '.e2e-spec.ts'),
        '--testTimeout=60000',
        '--json',
        '--outputFile=' + file,
      ],
      { env: e, stdio: 'inherit' },
    );
  if (r.error) throw r.error;
  if (r.status !== 0) {
    process.exitCode = r.status ?? 1;
    throw Error('STOP failed ' + name + ' regression; preserve logs/JSON, do not infer a pass');
  }
  results.push(JSON.parse(readFileSync(file, 'utf8')));
}
const merged = {
  ...results[0],
  testResults: results.flatMap((x) => x.testResults),
  isolatedGlobalAuthorityTarget: secondary,
  mainTarget: process.env.E2E_DATABASE_URL,
};
for (const n of [
  'numFailedTestSuites',
  'numFailedTests',
  'numPassedTestSuites',
  'numPassedTests',
  'numPendingTests',
  'numPendingTestSuites',
  'numRuntimeErrorTestSuites',
  'numTodoTests',
  'numTotalTestSuites',
  'numTotalTests',
])
  merged[n] = results.reduce((a, x) => a + (x[n] ?? 0), 0);
writeFileSync(resolve(root, 'combined-http.json'), JSON.stringify(merged));
console.log(
  'PASS merged ' +
    merged.numPassedTests +
    ' HTTP/PG cases; global authority invariants isolated without weakening assertions',
);
