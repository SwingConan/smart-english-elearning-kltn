// Only a NEW, empty, positively verified isolated26 target. No dotenv or implicit DB.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url),
  guard = require('./lib/e2e-target.cjs');
await guard.verify();
if (
  !/^\/v2_wave01_dev_test_w04b_[a-z0-9_]+$/.test(new URL(process.env.E2E_DATABASE_URL).pathname) ||
  process.env.W04B_ENABLED !== 'DEV_WORKFLOW'
)
  throw Error('W04B exact private target/opt-in required');
const { Client } = require('pg'),
  c = new Client({ connectionString: process.env.E2E_DATABASE_URL });
try {
  await c.connect();
  const { rows: h } = await c.query(
    'SELECT migration_name,checksum,finished_at FROM _prisma_migrations ORDER BY migration_name',
  );
  if (
    h.length !== 26 ||
    h.some(
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
    ) ||
    (await c.query('SELECT count(*)::int AS n FROM users')).rows[0].n
  )
    throw Error('NEW_EMPTY_EXACT26_REQUIRED');
} finally {
  await c.end();
}
const root = resolve('.local-storage/v2-wave04b');
mkdirSync(root, { recursive: true });
const r = spawnSync(
  process.execPath,
  [
    resolve('node_modules/jest/bin/jest.js'),
    '--config',
    resolve('apps/api/test/jest-e2e.json'),
    '--runInBand',
    '--runTestsByPath',
    resolve('apps/api/test/wave04b-workflow.e2e-spec.ts'),
    '--testTimeout=60000',
    '--json',
    '--outputFile=' + resolve(root, 'http-tests.json'),
  ],
  { env: process.env, cwd: process.cwd(), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
);
writeFileSync(resolve(root, 'http-tests.log'), (r.stdout ?? '') + (r.stderr ?? ''));
writeFileSync(
  resolve(root, 'http-tests-exit.json'),
  JSON.stringify({ code: r.status, at: new Date().toISOString() }, null, 2),
);
process.exitCode = r.status ?? 1;
