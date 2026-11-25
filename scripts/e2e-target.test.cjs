const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { endpoint, pin } = require('./lib/e2e-target.cjs');
const good = 'postgresql://wave01@127.0.0.1:55401/v2_wave01_dev_test_guard';
test('explicit pinned local target; alias pinning never reads dotenv', () => {
  const env = { E2E_DATABASE_URL: good };
  assert(endpoint(env).local);
  pin(env);
  for (const key of ['DATABASE_URL', 'WAVE01_PG_URL', 'BATCH04_PG_URL'])
    assert.equal(env[key], good);
});
for (const [name, env] of [
  ['missing target', {}],
  [
    'implicit dotenv/DATABASE_URL',
    { DATABASE_URL: 'postgresql://x@localhost:5432/smart_elearning_dev' },
  ],
  ['old DEV', { E2E_DATABASE_URL: 'postgresql://x@127.0.0.1:5432/smart_elearning_dev' }],
  ['unmarked name', { E2E_DATABASE_URL: 'postgresql://wave01@127.0.0.1:55401/v2_wave01_dev' }],
  ['remote host', { E2E_DATABASE_URL: good.replace('127.0.0.1', 'example.com') }],
  ['DNS localhost', { E2E_DATABASE_URL: good.replace('127.0.0.1', 'localhost') }],
  ['query host override', { E2E_DATABASE_URL: good + '?host=example.com' }],
  [
    'query options override',
    { E2E_DATABASE_URL: good + '?options=-c%20default_transaction_read_only=off' },
  ],
  ['foreign schema', { E2E_DATABASE_URL: good + '?schema=private' }],
  [
    'conflicting DATABASE_URL',
    { E2E_DATABASE_URL: good, DATABASE_URL: 'postgresql://x@localhost:5432/smart_elearning_dev' },
  ],
  [
    'conflicting BATCH04',
    { E2E_DATABASE_URL: good, BATCH04_PG_URL: 'postgresql://x@127.0.0.1:55404/se_sw_batch04_dev' },
  ],
  [
    'CI without runner',
    { E2E_DATABASE_URL: 'postgresql://ci_user@127.0.0.1:5432/smart_elearning_ci_e2e', CI: 'true' },
  ],
])
  test('rejects ' + name + ' before any connection', () =>
    assert.throws(() => endpoint(env), /E2E_/),
  );
test('CI only permits the separate disposable service database', () => {
  assert.equal(
    endpoint({
      E2E_DATABASE_URL: 'postgresql://ci_user@127.0.0.1:5432/smart_elearning_ci_e2e?schema=public',
      CI: 'true',
      GITHUB_ACTIONS: 'true',
    }).local,
    false,
  );
});
