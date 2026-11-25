const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { writeFileSync } = require('node:fs');
const root = resolve(__dirname, '..'),
  out = resolve(root, 'docs/v2/br136');
const jobs = process.argv.includes('--target')
  ? [
      [
        'GREEN',
        'apps/api',
        [
          'node_modules/jest/bin/jest.js',
          '--config',
          'apps/api/jest.config.cjs',
          '--runInBand',
          '--testPathPattern=br136-advisory|gemini-advisory-provider|gemini-workflow-integration|placement-diagnostic-real-flow|placement-diagnosis-advisory',
          '--json',
          '--outputFile=' + resolve(out, 'GREEN.json'),
        ],
      ],
    ]
  : [
      [
        'API-full',
        'apps/api',
        [
          'node_modules/jest/bin/jest.js',
          '--config',
          'apps/api/jest.config.cjs',
          '--runInBand',
          '--json',
          '--outputFile=' + resolve(out, 'API-full.json'),
        ],
      ],
      [
        'Web-full',
        'apps/web',
        [
          'node_modules/vitest/vitest.mjs',
          'run',
          '--maxWorkers=1',
          '--reporter=json',
          '--outputFile=' + resolve(out, 'Web-full.json'),
        ],
      ],
      [
        'API-typecheck',
        'apps/api',
        ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.json'],
      ],
      ['Web-typecheck', 'apps/web', ['node_modules/typescript/bin/tsc', '-b', '--pretty', 'false']],
      ['API-build', 'apps/api', ['node_modules/@nestjs/cli/bin/nest.js', 'build']],
      ['Web-build', 'apps/web', ['node_modules/vite/bin/vite.js', 'build']],
      [
        'API-lint',
        'apps/api',
        ['node_modules/eslint/bin/eslint.js', '{src,test,prisma}/**/*.ts', 'prisma.config.ts'],
      ],
      ['Web-lint', 'apps/web', ['node_modules/eslint/bin/eslint.js', '.']],
    ];
const results = [];
for (const [name, cwd, relative] of jobs) {
  const args = relative.map((v, i) =>
    i === 0 || v === 'apps/api/jest.config.cjs' ? resolve(root, v) : v,
  );
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    GEMINI_API_KEY: 'BR136_FAKE_NOT_A_REAL_KEY',
    PLACEMENT_AI_ADVISORY_PROVIDER: 'NONE',
    PLACEMENT_AI_ADVISORY_STAGING_ENABLED: 'false',
    PLACEMENT_AI_ADVISORY_DAILY_BUDGET_CALLS: '0',
    PLACEMENT_AI_ADVISORY_LIVE_VERIFIED: 'false',
  };
  const start = new Date().toISOString();
  const r = spawnSync(process.execPath, args, {
    cwd: resolve(root, cwd),
    env,
    encoding: 'utf8',
    maxBuffer: 40 * 1024 * 1024,
  });
  writeFileSync(resolve(out, name + '.log'), (r.stdout || '') + (r.stderr || ''));
  results.push({
    name,
    command: [process.execPath, ...args],
    cwd: resolve(root, cwd),
    start,
    end: new Date().toISOString(),
    exit: r.status,
    error: r.error?.message,
  });
  writeFileSync(
    resolve(
      out,
      process.argv.includes('--target') ? 'target-commands.json' : 'regression-commands.json',
    ),
    JSON.stringify(results, null, 2),
  );
  console.log(name + ': exit ' + r.status);
}
process.exitCode = results.some((r) => r.exit !== 0) ? 1 : 0;
