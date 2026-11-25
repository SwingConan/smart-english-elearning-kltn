// DEC049: offline Stage A, then read-only Stage B BEFORE importing an application pool.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const directory = path.resolve(root, '.local-storage/v2-wave01/postgres');
const databases = [
  'pre',
  'api',
  'chrome',
  'restore',
  'reg_w01',
  'reg_w02',
  'reg_s10',
  'api02',
  'chrome02',
  'reg_w02_serial',
].map((x) => 'v2_wave01_dev_test_w07_cf01_20261103_' + x + '_a1');
const supportDatabase = 'v2_wave01_dev_test_w05a_w07_cf01_20261103_reg_a1';
const referralDatabase = 'v2_wave01_dev_test_w05a_w07_cf01_20261103_ref_a1';
databases.push(supportDatabase, referralDatabase);
const urlFor = (name) =>
  'postgresql://wave01@127.0.0.1:55401/' +
  name +
  ([supportDatabase, referralDatabase].includes(name) ? '' : '?schema=public');
const hash = (x) => crypto.createHash('sha256').update(x).digest('hex');
function migrations(count = 31) {
  const dir = path.join(root, 'apps/api/prisma/migrations');
  const names = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((x) => x.isDirectory())
    .map((x) => x.name)
    .sort();
  if (names[28] !== '20261103010000_v2_wave06_sessions' || names.length < count)
    throw Error('W07_SOURCE_MIGRATIONS_REQUIRED');
  return names.slice(0, count).map((name) => ({
    name,
    checksum: hash(fs.readFileSync(path.join(dir, name, 'migration.sql'))),
  }));
}
function stageA(env = process.env, receipt) {
  if (env.W07_CF_RUN_INTENT !== 'CF01_NEW_DISPOSABLE_ONLY')
    throw Error('CF01_EXPLICIT_NEW_TARGET_REQUIRED');
  if (env.NODE_ENV === 'production' || env.W07_RUN_INTENT !== 'DEC049_DISPOSABLE_ONLY')
    throw Error('W07_EXPLICIT_INTENT_REQUIRED');
  if (Object.keys(env).some((k) => /^PG/i.test(k) && env[k])) throw Error('W07_PG_ENV_FORBIDDEN');
  const raw = env.E2E_DATABASE_URL;
  if (!raw || !databases.includes(env.W07_EXPECTED_DATABASE))
    throw Error('W07_NEW_EXACT_DATABASE_REQUIRED');
  const expected = urlFor(env.W07_EXPECTED_DATABASE);
  if (raw !== expected) throw Error('W07_EXACT_URL_REQUIRED');
  for (const k of ['DATABASE_URL', 'WAVE01_PG_URL', 'BATCH04_PG_URL'])
    if (env[k] && env[k] !== raw) throw Error('W07_ALIAS_MISMATCH');
  if (
    !receipt ||
    receipt.database !== env.W07_EXPECTED_DATABASE ||
    receipt.freshCreated !== true ||
    !/^\d+$/.test(String(receipt.oid)) ||
    !/^[a-f0-9]{64}$/.test(receipt.nonce || '')
  )
    throw Error('W07_CREATION_RECEIPT_REQUIRED');
  return {
    receipt,
    directory,
    config: {
      host: '127.0.0.1',
      port: 55401,
      user: 'wave01',
      password: '',
      database: receipt.database,
      ssl: false,
      connectionTimeoutMillis: 3000,
      options: '-c search_path=public',
      application_name: 'W07_DEC049_VERIFIED',
    },
  };
}
async function identity(db, target) {
  const {
    rows: [x],
  } = await db.query(
    `SELECT current_database() AS database,current_user AS role,session_user AS "sessionRole",current_schema() AS schema,current_setting('data_directory') AS directory,host(inet_server_addr()) AS host,inet_server_port() AS port,oid::text AS oid,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()`,
  );
  if (
    !x ||
    x.database !== target.receipt.database ||
    x.oid !== String(target.receipt.oid) ||
    x.role !== 'wave01' ||
    x.sessionRole !== 'wave01' ||
    x.schema !== 'public' ||
    x.host !== '127.0.0.1' ||
    x.port !== 55401 ||
    path.resolve(x.directory) !== target.directory ||
    x.marker !== 'SMART_ENGLISH_DISPOSABLE_E2E_V1'
  )
    throw Error('W07_STAGE_B_IDENTITY_REJECTED');
  return x;
}
async function stageB(db, target, count = 31, empty = false) {
  await db.query('BEGIN READ ONLY');
  try {
    const x = await identity(db, target),
      expected = migrations(count);
    const { rows } = await db.query(
      'SELECT migration_name AS name,checksum,finished_at IS NOT NULL AS applied,rolled_back_at IS NOT NULL AS rollback FROM _prisma_migrations ORDER BY migration_name',
    );
    if (
      rows.length !== count ||
      rows.some(
        (r, i) =>
          r.name !== expected[i].name ||
          r.checksum !== expected[i].checksum ||
          !r.applied ||
          r.rollback,
      )
    )
      throw Error('W07_STAGE_B_MIGRATIONS_REJECTED');
    if (empty) {
      const { rows: tables } = await db.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations'",
      );
      for (const { tablename } of tables) {
        const {
          rows: [n],
        } = await db.query(
          'SELECT count(*)::int AS n FROM "' + tablename.replaceAll('"', '""') + '"',
        );
        if (n.n !== 0) throw Error('W07_PREEXISTING_BUSINESS_DATA');
      }
    }
    await db.query('COMMIT');
    return { ...x, migrations: count, checksumsMatch: true, emptyVerified: empty };
  } catch (e) {
    await db.query('ROLLBACK');
    throw e;
  }
}
async function verify(env = process.env, options = {}) {
  const receipt = options.receipt || JSON.parse(fs.readFileSync(env.W07_RECEIPT_PATH, 'utf8'));
  const target = stageA(env, receipt); // before pg import/client construction
  const db = options.createClient
    ? options.createClient(target.config)
    : new (require('pg').Client)(target.config);
  try {
    await db.connect();
    const verified = await stageB(
      db,
      target,
      options.count || Number(env.W07_CF_MIGRATIONS || 31),
      options.empty || false,
    );
    env.W07_VERIFIED_OID = verified.oid;
    env.W07_WORKSPACE_ROOT = root;
    return verified;
  } finally {
    await db.end();
  }
}
module.exports = {
  root,
  directory,
  databases,
  hash,
  migrations,
  stageA,
  stageB,
  identity,
  verify,
  urlFor,
};
