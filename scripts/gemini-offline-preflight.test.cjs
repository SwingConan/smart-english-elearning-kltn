const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve, join } = require('node:path');
const { inspectOfflineConfiguration, SAFE_SWITCHES } = require('./gemini-offline-preflight.cjs');
const script = resolve(__dirname, 'gemini-offline-preflight.cjs');

test('empty environment matches current backend offline defaults without key inspection', () => {
  const r = inspectOfflineConfiguration({});
  assert.equal(r.status, 'PASS_OFFLINE_CONFIGURATION');
  assert.equal(r.modelMatchesHistoricalDefault, true);
  assert.equal(r.timeoutMs, 4500);
  assert.equal(r.apiKeyInspection, 'NOT_PERFORMED');
  assert.equal(r.envFileReadByThisScript, false);
  assert.equal(r.liveVerified, false);
  assert.equal(r.modelEntitlementVerified, false);
});

test('four explicit safe switches pass', () => {
  const r = inspectOfflineConfiguration(SAFE_SWITCHES);
  assert.equal(r.status, 'PASS_OFFLINE_CONFIGURATION');
  assert.ok(r.switches.every((s) => s.source === 'CURRENT_PROCESS'));
});

for (const [name, value] of [
  ['PLACEMENT_AI_ADVISORY_PROVIDER', 'GEMINI'],
  ['PLACEMENT_AI_ADVISORY_STAGING_ENABLED', 'true'],
  ['PLACEMENT_AI_ADVISORY_DAILY_BUDGET_CALLS', '1'],
  ['PLACEMENT_AI_ADVISORY_LIVE_VERIFIED', 'true'],
  ['PLACEMENT_AI_ADVISORY_DAILY_BUDGET_CALLS', 'NaN'],
  ['PLACEMENT_AI_ADVISORY_DAILY_BUDGET_CALLS', '-1'],
]) {
  test(`unsafe switch fails closed without echo: ${name} case ${value}`, () => {
    const r = inspectOfflineConfiguration({ ...SAFE_SWITCHES, [name]: value });
    assert.equal(r.status, 'BLOCKED_UNSAFE_CONFIGURATION');
    assert.equal(r.switches.find((s) => s.name === name).effective, 'REDACTED_UNSAFE_VALUE');
  });
}

test('does not even access secret fields or enumerate the environment', () => {
  const allowed = new Set([
    ...Object.keys(SAFE_SWITCHES),
    'GEMINI_ADVISORY_MODEL',
    'PLACEMENT_AI_ADVISORY_TIMEOUT_MS',
  ]);
  const env = new Proxy(
    {},
    {
      ownKeys() {
        throw Error('environment enumeration forbidden');
      },
      get(_target, name) {
        assert.ok(allowed.has(name), 'access outside nonsecret allowlist');
        return undefined;
      },
    },
  );
  assert.equal(inspectOfflineConfiguration(env).status, 'PASS_OFFLINE_CONFIGURATION');
});

test('misplaced sensitive-looking values are redacted instead of logged', () => {
  const canary = 'SYNTHETIC_SECRET_CANARY_DO_NOT_ECHO';
  const r = inspectOfflineConfiguration({
    PLACEMENT_AI_ADVISORY_PROVIDER: canary,
    GEMINI_ADVISORY_MODEL: canary + '/unsafe',
    PLACEMENT_AI_ADVISORY_TIMEOUT_MS: canary,
  });
  assert.equal(r.status, 'BLOCKED_UNSAFE_CONFIGURATION');
  assert.ok(!JSON.stringify(r).includes(canary));
});

for (const timeout of ['-1', 'Infinity', 'abc']) {
  test(`invalid timeout is blocked: ${timeout}`, () => {
    assert.equal(
      inspectOfflineConfiguration({ PLACEMENT_AI_ADVISORY_TIMEOUT_MS: timeout }).status,
      'BLOCKED_UNSAFE_CONFIGURATION',
    );
  });
}

test('key in synthetic env file is never output; CLI loads same safe switches privately', () => {
  const folder = mkdtempSync(join(tmpdir(), 'gemini-preflight-synthetic-'));
  const envFile = join(folder, 'synthetic.env');
  const canary = 'SYNTHETIC_NOT_A_REAL_KEY_DO_NOT_ECHO';
  writeFileSync(
    envFile,
    Object.entries(SAFE_SWITCHES)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + `\nGEMINI_API_KEY=${canary}\n`,
  );
  const r = spawnSync(process.execPath, [`--env-file=${envFile}`, script], {
    cwd: folder,
    env: { NODE_ENV: 'test', NODE_OPTIONS: '' },
    encoding: 'utf8',
  });
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).status, 'PASS_OFFLINE_CONFIGURATION');
  assert.ok(!(r.stdout + r.stderr).includes(canary));
  assert.equal(readFileSync(envFile, 'utf8').includes(canary), true);
  // Retain the synthetic-only file; no deletion or inspection of actual .env files.
});

test('existing process switches override file values, matching backend env priority', () => {
  const folder = mkdtempSync(join(tmpdir(), 'gemini-preflight-priority-'));
  const envFile = join(folder, 'synthetic.env');
  writeFileSync(envFile, 'PLACEMENT_AI_ADVISORY_PROVIDER=NONE\n');
  const r = spawnSync(process.execPath, [`--env-file=${envFile}`, script], {
    cwd: folder,
    env: { NODE_ENV: 'test', NODE_OPTIONS: '', PLACEMENT_AI_ADVISORY_PROVIDER: 'GEMINI' },
    encoding: 'utf8',
  });
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).status, 'BLOCKED_UNSAFE_CONFIGURATION');
});

test('unknown CLI arguments are rejected without echoing their content', () => {
  const canary = 'SYNTHETIC_ARGUMENT_DO_NOT_ECHO';
  const r = spawnSync(process.execPath, [script, canary], {
    env: { NODE_ENV: 'test', NODE_OPTIONS: '' },
    encoding: 'utf8',
  });
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).status, 'BLOCKED_UNEXPECTED_ARGUMENTS');
  assert.ok(!(r.stdout + r.stderr).includes(canary));
});

test('example declares exactly the backend Gemini names and safe defaults', () => {
  const text = readFileSync(resolve(__dirname, '../apps/api/.env.example'), 'utf8');
  const entries = Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((s) => /^(GEMINI_|PLACEMENT_AI_ADVISORY_)/.test(s))
      .map((s) => [s.slice(0, s.indexOf('=')), s.slice(s.indexOf('=') + 1)]),
  );
  assert.deepEqual(
    Object.keys(entries).sort(),
    [
      ...Object.keys(SAFE_SWITCHES),
      'GEMINI_API_KEY',
      'GEMINI_ADVISORY_MODEL',
      'PLACEMENT_AI_ADVISORY_TIMEOUT_MS',
    ].sort(),
  );
  for (const [k, v] of Object.entries(SAFE_SWITCHES)) assert.equal(entries[k], v);
  assert.equal(entries.GEMINI_API_KEY, '');
  assert.equal(entries.GEMINI_ADVISORY_MODEL, 'gemini-2.5-flash');
  assert.equal(entries.PLACEMENT_AI_ADVISORY_TIMEOUT_MS, '4500');
});
