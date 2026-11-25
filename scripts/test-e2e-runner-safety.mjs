// Negative entrypoint tests: trap pg/AppModule imports; no database is ever opened here.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve('.local-storage/v2-wave01/consolidated-fix');
mkdirSync(root, { recursive: true });
const trap = resolve(root, 'import-trap.cjs');
writeFileSync(
  trap,
  "const M=require('module'),original=M._load;M._load=function(name,...args){if(name==='pg'||String(name).includes('app.module'))throw Error('FORBIDDEN_DATABASE_OR_APP_IMPORT');return original.call(this,name,...args);};",
);
const tests = [
  {
    name: 'legacy M07 CDP runner refuses arbitrary browser/backend before pg/CDP import',
    cmd: process.execPath,
    args: ['scripts/m07-browser-smoke.mjs'],
    value: null,
    browser: true,
  },
  {
    name: 'raw Jest repeats the original unsupported plural filter, with missing explicit target',
    cmd: process.execPath,
    args: [
      'node_modules/jest/bin/jest.js',
      '--config',
      'apps/api/test/jest-e2e.json',
      '--runInBand',
      '--testPathPatterns=wave01-authority',
    ],
    value: null,
  },
  {
    name: 'workspace npm test:e2e refuses missing target',
    cmd: process.env.ComSpec ?? 'cmd.exe',
    args: [
      '/d',
      '/s',
      '/c',
      'npm.cmd run test:e2e -w @smart-elearning/api -- --runTestsByPath test/health.e2e-spec.ts',
    ],
    value: null,
  },
  {
    name: 'direct Jest rejects the existing old DEV target before pg import',
    cmd: process.execPath,
    args: [
      'node_modules/jest/bin/jest.js',
      '--config',
      'apps/api/test/jest-e2e.json',
      '--runInBand',
      '--runTestsByPath',
      'apps/api/test/health.e2e-spec.ts',
    ],
    value: 'postgresql://x@127.0.0.1:5432/smart_elearning_dev',
  },
];
const result = [];
for (const t of tests) {
  const env = { ...process.env, NODE_OPTIONS: '--require=' + JSON.stringify(trap) };
  for (const k of ['DATABASE_URL', 'E2E_DATABASE_URL', 'WAVE01_PG_URL', 'BATCH04_PG_URL'])
    delete env[k];
  if (t.value) env.E2E_DATABASE_URL = t.value;
  const r = spawnSync(t.cmd, t.args, { env, encoding: 'utf8', timeout: 20000 });
  const log = (r.stdout ?? '') + (r.stderr ?? '');
  const pass =
    r.status !== 0 &&
    (t.browser
      ? /E2E_BROWSER_FIXTURE_REQUIRED/.test(log)
      : /E2E_TARGET_(REQUIRED|REJECTED)/.test(log)) &&
    !log.includes('FORBIDDEN_DATABASE_OR_APP_IMPORT');
  result.push({
    name: t.name,
    pass,
    exitCode: r.status,
    pgAndAppImportBlockedBeforeEvaluation: true,
  });
  writeFileSync(resolve(root, 'runner-reject-' + result.length + '.log'), log);
}
writeFileSync(resolve(root, 'runner-safety-results.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
if (result.some((r) => !r.pass)) process.exitCode = 1;
