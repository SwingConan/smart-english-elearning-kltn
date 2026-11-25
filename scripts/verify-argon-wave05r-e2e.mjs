import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { createDisposableDb, dropDisposableDb } = require('./lib/disposable-db.cjs');

const outDir = resolve('docs/v2/v2-road-to-99-argon-wave05r/EVIDENCE');
mkdirSync(outDir, { recursive: true });

async function runSuite(prefix, specRelPath, extraEnv = {}, outPrefix = prefix) {
  const { dbName, connectionString } = await createDisposableDb(prefix);
  console.log(`[Argon Wave 05R E2E] Created disposable DB: ${dbName}`);
  try {
    const env = {
      ...process.env,
      NODE_ENV: 'test',
      E2E_DATABASE_URL: connectionString,
      DATABASE_URL: connectionString,
      WAVE01_PG_URL: connectionString,
      BATCH04_PG_URL: connectionString,
      W04B_ENABLED: 'DEV_WORKFLOW',
      W05A_ENABLED: 'DEV_SUPPORT',
      W05B_ENABLED: 'DEV_DEC060',
      W06_ENABLED: 'DEV_DEC047',
      W07_ENABLED: 'DEV_DEC049',
      W08_ENABLED: 'DEV_DEC053',
      W09_ENABLED: 'DEV_W09',
      W10_REPORT_CSV_ENABLED: 'DEV_W10',
      REPORT_CENTER_TIME_ZONE: 'Asia/Ho_Chi_Minh',
      ...extraEnv,
    };
    const r = spawnSync(
      process.execPath,
      [
        resolve('node_modules/jest/bin/jest.js'),
        '--config',
        resolve('apps/api/test/jest-e2e.json'),
        '--runInBand',
        '--runTestsByPath',
        resolve(specRelPath),
        '--testTimeout=240000',
        '--json',
        `--outputFile=${resolve(outDir, `${outPrefix}-jest.json`)}`,
      ],
      {
        env,
        cwd: process.cwd(),
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    writeFileSync(resolve(outDir, `${outPrefix}-jest.log`), (r.stdout ?? '') + (r.stderr ?? ''));
    console.log(`[Argon Wave 05R E2E] Suite ${specRelPath} exited with code ${r.status}`);
    if (r.status !== 0) {
      console.error((r.stdout ?? '').slice(-4000));
      console.error((r.stderr ?? '').slice(-4000));
      throw new Error(`E2E suite failed: ${specRelPath} (exit ${r.status})`);
    }
    return { dbName, status: r.status };
  } finally {
    await dropDisposableDb(dbName);
    console.log(`[Argon Wave 05R E2E] Dropped disposable DB: ${dbName}`);
  }
}

await runSuite(
  'w04b_wave05r',
  'apps/api/test/argon-wave05-placement-diagnosis-ai-ux.e2e-spec.ts',
  {},
  'ARGON_WAVE05R_COMPLETE_E2E',
);
