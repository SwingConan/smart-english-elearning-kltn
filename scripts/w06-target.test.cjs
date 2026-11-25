const { test } = require('node:test');
const assert = require('node:assert/strict');
const s = require('./lib/w06-target.cjs');
const receipt = {
  database: s.databases[0],
  oid: '12345',
  nonce: 'a'.repeat(64),
  freshCreated: true,
};
const good = {
  W06_RUN_INTENT: 'DEC047_DISPOSABLE_ONLY',
  W06_EXPECTED_DATABASE: receipt.database,
  E2E_DATABASE_URL: 'postgresql://wave01@127.0.0.1:55401/' + receipt.database + '?schema=public',
};
test('Stage A accepts only explicitly named new disposable target', () =>
  assert.equal(s.stageA(good, receipt).config.database, receipt.database));
test('exact new support-compatible target still needs receipt and rejects all URL options', () => {
  const name = s.databases.at(-1),
    r = { ...receipt, database: name },
    env = { ...good, W06_EXPECTED_DATABASE: name, E2E_DATABASE_URL: s.urlFor(name) };
  assert.equal(s.stageA(env, r).config.database, name);
  assert(!env.E2E_DATABASE_URL.includes('?'));
  assert.throws(() =>
    s.stageA({ ...env, E2E_DATABASE_URL: env.E2E_DATABASE_URL + '?schema=public' }, r),
  );
  assert.throws(() =>
    s.stageA({ ...env, W06_EXPECTED_DATABASE: 'v2_wave01_dev_test_w05a_arbitrary' }, r),
  );
});
for (const [name, patch] of Object.entries({
  missing: { E2E_DATABASE_URL: undefined },
  old: { E2E_DATABASE_URL: 'postgresql://wave01@localhost:5432/smart_elearning_dev' },
  production: { NODE_ENV: 'production' },
  alias: { DATABASE_URL: 'postgresql://different' },
  pg: { PGHOST: 'localhost' },
  populated: { W06_EXPECTED_DATABASE: 'v2_wave01_dev_test_m07_synthetic_dec046_20261102_a1' },
  intent: { W06_RUN_INTENT: undefined },
  query: { E2E_DATABASE_URL: good.E2E_DATABASE_URL + '&options=secret' },
  role: { E2E_DATABASE_URL: good.E2E_DATABASE_URL.replace('wave01@', 'postgres@') },
  encoded: { E2E_DATABASE_URL: good.E2E_DATABASE_URL.replace('127.0.0.1', 'localhost') },
})) {
  test('zero client construction: ' + name, async () => {
    let clients = 0;
    await assert.rejects(
      s.verify(
        { ...good, ...patch },
        {
          receipt,
          createClient: () => {
            clients++;
            throw Error('SOCKET');
          },
        },
      ),
    );
    assert.equal(clients, 0);
  });
}
test('creation receipt required before socket', () =>
  assert.throws(() => s.stageA(good, { ...receipt, oid: undefined })));
for (const [field, value] of Object.entries({
  database: 'smart_elearning_dev',
  oid: '999',
  role: 'postgres',
  sessionRole: 'postgres',
  schema: 'private',
  host: 'localhost',
  port: 5432,
  directory: 'C:/other',
  marker: 'NOT_DISPOSABLE',
})) {
  test('Stage B rejects ' + field + ' before business queries', async () => {
    const target = s.stageA(good, receipt),
      queries = [];
    const fake = {
      query: async (q) => {
        queries.push(q);
        if (q.includes('current_database()'))
          return {
            rows: [
              {
                database: receipt.database,
                oid: receipt.oid,
                role: 'wave01',
                sessionRole: 'wave01',
                schema: 'public',
                host: '127.0.0.1',
                port: 55401,
                directory: s.directory,
                marker: 'SMART_ENGLISH_DISPOSABLE_E2E_V1',
                [field]: value,
              },
            ],
          };
        return { rows: [] };
      },
    };
    await assert.rejects(s.stageB(fake, target), /IDENTITY_REJECTED/);
    assert(!queries.some((q) => q.includes('_prisma_migrations')));
    assert.equal(queries.at(-1), 'ROLLBACK');
  });
}
test('M07 source checkpoint remains exact28 after additive29', () => {
  const old = require('./lib/m07-checker-target.cjs').expectedMigrations();
  assert.equal(old.length, 28);
  assert.deepEqual(old, s.migrations(28));
});
