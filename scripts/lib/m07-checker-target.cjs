// M07-only boundary. Stage A is offline; Stage B holds one read-only connection.
// Never read dotenv, create a role/database, migrate, seed or repair data here.
const { readdirSync, readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { resolve } = require('node:path');
const { endpoint } = require('./e2e-target.cjs');
const root = resolve(__dirname, '../..');
const marker = 'SMART_ENGLISH_DISPOSABLE_E2E_V1';
class M07SafetyError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
const reject = (code) => {
  throw new M07SafetyError(code);
};
function expectedMigrations() {
  const directory = resolve(root, 'apps/api/prisma/migrations');
  const names = readdirSync(directory, { withFileTypes: true })
    .filter((x) => x.isDirectory())
    .map((x) => x.name)
    .sort();
  // Frozen DEC046 checkpoint, not a moving latest-schema target. DB remains exact28.
  if (names.length < 28 || names[27] !== '20261102020000_v2_s10_armed_capture')
    reject('M07_SOURCE_MIGRATION_IDENTITY_REQUIRED');
  return names.slice(0,28).map((name) => ({
    name,
    checksum: createHash('sha256')
      .update(readFileSync(resolve(directory, name, 'migration.sql')))
      .digest('hex'),
  }));
}
function validateM07Target(env = process.env, argv = []) {
  // Stage A: all checks precede driver import, client construction and networking.
  if (argv.length) reject('M07_UNSUPPORTED_ARGUMENTS');
  if (env.NODE_ENV === 'production') reject('M07_PRODUCTION_FORBIDDEN');
  if (!env.E2E_DATABASE_URL) reject('M07_EXPLICIT_TARGET_REQUIRED');
  if (!/^v2_wave01_dev_test_[a-z0-9_]+$/.test(env.M07_EXPECTED_DATABASE ?? ''))
    reject('M07_EXPLICIT_DATABASE_IDENTITY_REQUIRED');
  if (Object.keys(env).some((k) => /^PG/i.test(k) && env[k]))
    reject('M07_UNSUPPORTED_PG_CONFIGURATION');
  let target, url;
  try {
    target = endpoint(env);
    url = new URL(target.connectionString);
  } catch {
    reject('M07_TARGET_REJECTED');
  }
  if (!target.local || url.password || url.pathname !== '/' + env.M07_EXPECTED_DATABASE)
    reject('M07_TARGET_REJECTED');
  if (url.search && url.search !== '?schema=public')
    reject('M07_UNSUPPORTED_CONNECTION_CONFIGURATION');
  const migrations = expectedMigrations();
  // Explicit fields prevent libpq environment defaults from selecting a target.
  const config = Object.freeze({
    host: '127.0.0.1',
    port: 55401,
    database: env.M07_EXPECTED_DATABASE,
    user: 'wave01',
    password: '',
    ssl: false,
    connectionTimeoutMillis: 3000,
    statement_timeout: 15000,
    query_timeout: 20000,
    application_name: 'smart-english-m07-readonly-checker',
    options: '-c search_path=public -c default_transaction_read_only=on',
  });
  return Object.freeze({ config, directory: target.directory, migrations });
}
async function withM07ReadOnlyTarget(
  checks,
  { env = process.env, argv = [], createClient, onVerified = () => {} } = {},
) {
  const target = validateM07Target(env, argv);
  // No driver is imported until Stage A has accepted the complete target.
  const makeClient = createClient ?? ((config) => new (require('pg').Client)(config));
  let db,
    connected = false;
  try {
    db = makeClient(target.config);
    await db.connect();
    connected = true;
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    // Stage B: catalog/settings only, before any M07 business-data query.
    const {
      rows: [identity],
    } = await db.query(`SELECT current_database() AS database,
      current_user AS role, session_user AS "sessionRole", current_schema() AS schema,
      current_setting('data_directory') AS directory, host(inet_server_addr()) AS host,
      inet_server_port() AS port, current_setting('transaction_read_only') AS "readOnly",
      shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') AS marker`);
    if (
      !identity ||
      identity.database !== target.config.database ||
      identity.role !== 'wave01' ||
      identity.sessionRole !== 'wave01' ||
      identity.schema !== 'public' ||
      identity.host !== '127.0.0.1' ||
      identity.port !== 55401 ||
      identity.readOnly !== 'on' ||
      identity.marker !== marker ||
      resolve(identity.directory ?? '') !== resolve(target.directory)
    )
      reject('M07_SERVER_IDENTITY_REJECTED');
    const { rows: history } = await db.query(`SELECT migration_name AS name, checksum,
      finished_at IS NOT NULL AS applied, rolled_back_at IS NOT NULL AS "rolledBack"
      FROM _prisma_migrations ORDER BY migration_name`);
    if (
      history.length !== target.migrations.length ||
      history.some(
        (x, i) =>
          x.name !== target.migrations[i].name ||
          x.checksum !== target.migrations[i].checksum ||
          x.applied !== true ||
          x.rolledBack !== false,
      )
    )
      reject('M07_DATABASE_MIGRATIONS_REJECTED');
    await onVerified({
      stage: 'B',
      ...identity,
      migrationCount: history.length,
      migrationChecksumsMatch: true,
      businessQueriesStarted: false,
    });
    // The checked connection/transaction itself executes every SELECT; no pool
    // creates an unchecked sibling connection. PostgreSQL also enforces read-only.
    const readOnly = Object.freeze({
      query: (text, params) => {
        if (typeof text !== 'string' || !/^\s*(SELECT|WITH)\b/i.test(text))
          reject('M07_BUSINESS_QUERY_REQUIRES_SELECT');
        return db.query(text, params);
      },
    });
    const result = await checks(readOnly);
    await db.query('ROLLBACK'); // Checker has no durable writes to commit.
    connected = false;
    return result;
  } catch (error) {
    if (connected) await db.query('ROLLBACK').catch(() => {});
    if (error instanceof M07SafetyError) throw error;
    // Never forward driver messages/stack/configuration containing credentials.
    throw new M07SafetyError('M07_CHECKER_EXECUTION_FAILED');
  } finally {
    if (db) await db.end().catch(() => {});
  }
}
module.exports = { validateM07Target, withM07ReadOnlyTarget, expectedMigrations, M07SafetyError };
