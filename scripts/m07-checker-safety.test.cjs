const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, readFileSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { pathToFileURL } = require('node:url');
const {
  validateM07Target,
  withM07ReadOnlyTarget,
  expectedMigrations,
} = require('./lib/m07-checker-target.cjs');
const database = 'v2_wave01_dev_test_m07_guard';
const good = 'postgresql://wave01@127.0.0.1:55401/' + database;
const valid = { E2E_DATABASE_URL: good, M07_EXPECTED_DATABASE: database };
const directory = resolve(__dirname, '../.local-storage/v2-wave01/postgres');
function fixture(change = {}) {
  const stats = { constructed: 0, connected: 0, ended: 0, business: 0, verified: 0, sql: [] };
  const identity = {
    database,
    role: 'wave01',
    sessionRole: 'wave01',
    schema: 'public',
    directory,
    host: '127.0.0.1',
    port: 55401,
    readOnly: 'on',
    marker: 'SMART_ENGLISH_DISPOSABLE_E2E_V1',
    ...change.identity,
  };
  const history =
    change.history ?? expectedMigrations().map((m) => ({ ...m, applied: true, rolledBack: false }));
  const createClient = (config) => {
    ++stats.constructed;
    assert.equal(config.host, '127.0.0.1');
    assert.equal(config.port, 55401);
    assert.equal(config.options, '-c search_path=public -c default_transaction_read_only=on');
    assert.equal(config.ssl, false);
    return {
      async connect() {
        ++stats.connected;
        if (change.connectFailure) throw Error('secret-driver-message');
      },
      async query(sql) {
        stats.sql.push(sql);
        if (sql.startsWith('SELECT current_database')) return { rows: [identity] };
        if (sql.includes('FROM _prisma_migrations')) return { rows: history };
        if (/^SELECT .* FROM users/.test(sql)) ++stats.business;
        return { rows: [] };
      },
      async end() {
        ++stats.ended;
      },
    };
  };
  return { stats, createClient };
}
for (const [name, env, argv] of [
  ['missing all explicit configuration', {}],
  [
    'DATABASE_URL-only implicit fallback',
    { DATABASE_URL: 'postgresql://secret@localhost:5432/smart_elearning_dev' },
  ],
  ['dotenv-shaped values without opt-in', { DATABASE_URL: good, M07_EXPECTED_DATABASE: database }],
  ['missing expected database identity', { E2E_DATABASE_URL: good }],
  [
    'old DEV URI/user',
    {
      ...valid,
      E2E_DATABASE_URL:
        'postgresql://smart_elearning_app:never-log-me@localhost:5432/smart_elearning_dev',
    },
  ],
  [
    'old DEV numeric loopback',
    {
      ...valid,
      E2E_DATABASE_URL: 'postgresql://smart_elearning_app@127.0.0.1:5432/smart_elearning_dev',
    },
  ],
  [
    'production-like URI',
    {
      ...valid,
      E2E_DATABASE_URL:
        'postgresql://prod:never-log-me@db.production.invalid:5432/smart_elearning_prod',
    },
  ],
  ['unauthorized host', { ...valid, E2E_DATABASE_URL: good.replace('127.0.0.1', '192.0.2.1') }],
  [
    'DNS localhost unsupported',
    { ...valid, E2E_DATABASE_URL: good.replace('127.0.0.1', 'localhost') },
  ],
  ['wrong port', { ...valid, E2E_DATABASE_URL: good.replace('55401', '55402') }],
  ['wrong database name', { ...valid, E2E_DATABASE_URL: good + '_other' }],
  ['wrong role', { ...valid, E2E_DATABASE_URL: good.replace('wave01@', 'postgres@') }],
  [
    'unapproved base DEV name',
    {
      ...valid,
      M07_EXPECTED_DATABASE: 'v2_wave01_dev',
      E2E_DATABASE_URL: good.replace(database, 'v2_wave01_dev'),
    },
  ],
  [
    'connection password unsupported',
    { ...valid, E2E_DATABASE_URL: good.replace('wave01@', 'wave01:never-log-me@') },
  ],
  ['query host override', { ...valid, E2E_DATABASE_URL: good + '?host=production.invalid' }],
  [
    'query options override',
    { ...valid, E2E_DATABASE_URL: good + '?options=-c%20default_transaction_read_only=off' },
  ],
  ['unexpected schema', { ...valid, E2E_DATABASE_URL: good + '?schema=private' }],
  [
    'duplicate parameters unsupported',
    { ...valid, E2E_DATABASE_URL: good + '?schema=public&schema=public' },
  ],
  [
    'conflicting DATABASE_URL',
    { ...valid, DATABASE_URL: 'postgresql://x@localhost:5432/smart_elearning_dev' },
  ],
  [
    'conflicting legacy alias',
    { ...valid, WAVE01_PG_URL: 'postgresql://x@localhost:5432/smart_elearning_dev' },
  ],
  ['libpq host inherited', { ...valid, PGHOST: 'production.invalid' }],
  ['libpq options inherited', { ...valid, PGOPTIONS: '-c default_transaction_read_only=off' }],
  ['production runtime', { ...valid, NODE_ENV: 'production' }],
  ['wrapper skip-guard argument', valid, ['--skip-guard']],
])
  test('Stage A: ' + name + ' causes ZERO connection attempts', async () => {
    const f = fixture();
    await assert.rejects(
      withM07ReadOnlyTarget(
        () => {
          ++f.stats.business;
        },
        { env, argv, createClient: f.createClient },
      ),
      /M07_/,
    );
    assert.deepEqual(
      [f.stats.constructed, f.stats.connected, f.stats.business, f.stats.sql.length],
      [0, 0, 0, 0],
    );
  });
for (const [name, identity] of [
  ['marker', { marker: 'incorrect-positive-marker' }],
  ['schema', { schema: 'private' }],
  ['database', { database: database + '_other' }],
  ['role', { role: 'postgres' }],
  ['session role', { sessionRole: 'postgres' }],
  ['directory', { directory: resolve('unexpected') }],
  ['host', { host: '192.0.2.1' }],
  ['port', { port: 5432 }],
  ['read-only', { readOnly: 'off' }],
])
  test('Stage B mock: wrong ' + name + ' permits ZERO business queries/writes', async () => {
    const f = fixture({ identity });
    await assert.rejects(
      withM07ReadOnlyTarget(async (db) => db.query('SELECT id FROM users'), {
        env: valid,
        createClient: f.createClient,
      }),
      /M07_SERVER_IDENTITY_REJECTED/,
    );
    assert.deepEqual([f.stats.connected, f.stats.ended, f.stats.business], [1, 1, 0]);
    assert(!f.stats.sql.some((s) => s.includes('FROM _prisma_migrations')));
    assert.equal(f.stats.sql.at(-1), 'ROLLBACK');
  });
for (const mutation of ['missing', 'checksum', 'unfinished', 'rolledBack'])
  test('Stage B migration ' + mutation + ' permits ZERO business queries', async () => {
    const history = expectedMigrations().map((m) => ({ ...m, applied: true, rolledBack: false }));
    if (mutation === 'missing') history.pop();
    else if (mutation === 'checksum') history[0].checksum = '0'.repeat(64);
    else if (mutation === 'unfinished') history[0].applied = false;
    else history[0].rolledBack = true;
    const f = fixture({ history });
    await assert.rejects(
      withM07ReadOnlyTarget(async (db) => db.query('SELECT id FROM users'), {
        env: valid,
        createClient: f.createClient,
      }),
      /M07_DATABASE_MIGRATIONS_REJECTED/,
    );
    assert.deepEqual([f.stats.connected, f.stats.ended, f.stats.business], [1, 1, 0]);
  });
test('verified Stage B runs SELECT on the SAME read-only client; no Pool or second connection', async () => {
  const f = fixture();
  const result = await withM07ReadOnlyTarget(
    async (db) => {
      assert.equal(f.stats.verified, 1);
      await db.query('SELECT id FROM users');
      assert.throws(
        () => db.query('INSERT INTO users DEFAULT VALUES'),
        /M07_BUSINESS_QUERY_REQUIRES_SELECT/,
      );
      return 'checked';
    },
    {
      env: { ...valid, DATABASE_URL: good, WAVE01_PG_URL: good, BATCH04_PG_URL: good },
      createClient: f.createClient,
      onVerified: (info) => {
        ++f.stats.verified;
        assert.equal(info.migrationCount, 28);
        assert.equal(info.businessQueriesStarted, false);
      },
    },
  );
  assert.equal(result, 'checked');
  assert.deepEqual(
    [f.stats.constructed, f.stats.connected, f.stats.business, f.stats.ended],
    [1, 1, 1, 1],
  );
  assert.equal(f.stats.sql[0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(f.stats.sql.at(-1), 'ROLLBACK');
});
test('driver errors are redacted and connection is closed', async () => {
  const f = fixture({ connectFailure: true });
  await assert.rejects(
    withM07ReadOnlyTarget(() => {}, { env: valid, createClient: f.createClient }),
    (e) =>
      e.message === 'M07_CHECKER_EXECUTION_FAILED' && !String(e).includes('secret-driver-message'),
  );
  assert.equal(f.stats.ended, 1);
});
test('imported checker cannot expose unguarded business function or bypass guard through injected wrapper', async () => {
  const checker = await import(
    pathToFileURL(resolve(__dirname, 'check-m07-visual-gate-data.mjs')).href
  );
  assert.equal(checker.checkM07Data, undefined);
  const f = fixture();
  const errors = [],
    original = console.error;
  try {
    console.error = (message) => errors.push(message);
    assert.equal(await checker.runM07Checker({ env: {}, createClient: f.createClient }), 1);
  } finally {
    console.error = original;
  }
  assert.equal(f.stats.constructed, 0);
  assert.deepEqual(errors, ['M07_EXPLICIT_TARGET_REQUIRED']);
});
for (const entry of [
  'scripts/check-m07-visual-gate-data.mjs',
  'scripts/run-m07-visual-gate-data.mjs',
]) {
  for (const kind of ['missing', 'old', 'bypass'])
    test(
      entry + ' direct process ' + kind + ': no pg import, dotenv read or socket attempt',
      () => {
        const dir = mkdtempSync(resolve(tmpdir(), 'm07-safety-')),
          stats = resolve(dir, 'stats.json'),
          trap = resolve(dir, 'trap.cjs');
        writeFileSync(
          trap,
          `const fs=require('fs'),M=require('module'),net=require('net');const counts={driverImports:0,dotenvReads:0,networkAttempts:0};const load=M._load;M._load=function(n,...a){if(n==='pg'){++counts.driverImports;throw Error('UNEXPECTED_DRIVER_IMPORT')}return load.call(this,n,...a)};const read=fs.readFileSync;fs.readFileSync=function(p,...a){if(String(p).replace(/\\\\/g,'/').endsWith('apps/api/.env')){++counts.dotenvReads;throw Error('UNEXPECTED_DOTENV_READ')}return read.call(this,p,...a)};net.Socket.prototype.connect=function(){++counts.networkAttempts;throw Error('UNEXPECTED_NETWORK_ATTEMPT')};process.on('exit',()=>fs.writeFileSync(${JSON.stringify(stats)},JSON.stringify(counts)));`,
        );
        const env = { ...process.env };
        for (const k of Object.keys(env))
          if (
            /^PG/i.test(k) ||
            [
              'E2E_DATABASE_URL',
              'DATABASE_URL',
              'WAVE01_PG_URL',
              'BATCH04_PG_URL',
              'M07_EXPECTED_DATABASE',
              'NODE_OPTIONS',
            ].includes(k)
          )
            delete env[k];
        env.DATABASE_URL =
          'postgresql://smart_elearning_app:never-log-me@localhost:5432/smart_elearning_dev';
        if (kind === 'old') {
          env.E2E_DATABASE_URL = env.DATABASE_URL;
          env.M07_EXPECTED_DATABASE = database;
        }
        if (kind === 'bypass') {
          Object.assign(env, valid);
          delete env.DATABASE_URL;
        }
        const child = spawnSync(
          process.execPath,
          ['--require', trap, entry, ...(kind === 'bypass' ? ['--skip-guard'] : [])],
          { env, encoding: 'utf8', timeout: 15000, windowsHide: true },
        );
        assert.equal(child.status, 1);
        assert.match(child.stderr, /M07_/);
        assert(!child.stderr.includes('never-log-me'));
        assert.deepEqual(JSON.parse(readFileSync(stats, 'utf8')), {
          driverImports: 0,
          dotenvReads: 0,
          networkAttempts: 0,
        });
      },
    );
}
test('npm entrypoint routes to guarded launcher; original bucket expectation is unchanged', () => {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'));
  assert.equal(
    pkg.scripts['check:m07-visual-gate-data'],
    'node scripts/run-m07-visual-gate-data.mjs',
  );
  const source = readFileSync(resolve(__dirname, 'check-m07-visual-gate-data.mjs'), 'utf8');
  assert.match(source, /JSON\.stringify\(\[2, 2, 3, 2, 2\]\)/);
  assert(!source.includes('apps/api/.env'));
  assert(!source.includes("from 'pg'"));
});
