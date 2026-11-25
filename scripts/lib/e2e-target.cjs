// Shared fail-closed boundary. Never read dotenv; never seed/delete/migrate here.
const { resolve } = require('node:path');
const root = resolve(__dirname, '../..');
function endpoint(env = process.env) {
  if (!env.E2E_DATABASE_URL)
    throw new Error('E2E_TARGET_REQUIRED: explicit E2E_DATABASE_URL; .env fallback is forbidden');
  let url;
  try {
    url = new URL(env.E2E_DATABASE_URL);
  } catch {
    throw new Error('E2E_TARGET_INVALID');
  }
  if (
    url.protocol !== 'postgresql:' ||
    url.hostname !== '127.0.0.1' ||
    url.hash ||
    [...url.searchParams].some(([k, v]) => k !== 'schema' || v !== 'public')
  )
    throw new Error('E2E_TARGET_REJECTED: only pinned loopback PostgreSQL with public schema');
  const local =
    url.port === '55401' &&
    /^\/v2_wave01_dev_test_[a-z0-9_]+$/.test(url.pathname) &&
    url.username === 'wave01';
  const ci =
    env.GITHUB_ACTIONS === 'true' &&
    env.CI === 'true' &&
    url.port === '5432' &&
    url.pathname === '/smart_elearning_ci_e2e' &&
    url.username === 'ci_user';
  if (!local && !ci)
    throw new Error('E2E_TARGET_REJECTED: not a disposable local/CI test database');
  for (const key of ['DATABASE_URL', 'WAVE01_PG_URL', 'BATCH04_PG_URL']) {
    if (env[key] && env[key] !== env.E2E_DATABASE_URL)
      throw new Error('E2E_TARGET_MISMATCH: ' + key);
  }
  return {
    connectionString: env.E2E_DATABASE_URL,
    local,
    directory: local
      ? resolve(root, '.local-storage/v2-wave01/postgres')
      : '/var/lib/postgresql/data',
  };
}
function pin(env = process.env) {
  const target = endpoint(env);
  env.DATABASE_URL = target.connectionString;
  env.NODE_ENV = 'test';
  if (target.local) {
    env.WAVE01_PG_URL = target.connectionString;
    env.BATCH04_PG_URL = target.connectionString;
  }
  return target;
}
async function verify(env = process.env) {
  const target = endpoint(env); // Validation happens BEFORE constructing any pg connection.
  const { Client } = require('pg');
  const db = new Client({
    connectionString: target.connectionString,
    connectionTimeoutMillis: 3000,
  });
  try {
    await db.connect();
    await db.query('BEGIN READ ONLY');
    const {
      rows: [identity],
    } = await db.query(
      "SELECT current_database() AS db, current_schema() AS schema, current_setting('data_directory') AS directory, host(inet_server_addr()) AS host, current_setting('transaction_read_only') AS read_only",
    );
    const dirOk = target.local
      ? resolve(identity.directory) === resolve(target.directory)
      : String(identity.directory || '').startsWith('/var/lib/postgresql');
    const hostOk = target.local ? identity.host === '127.0.0.1' : Boolean(identity.host);
    if (
      identity.db !== new URL(target.connectionString).pathname.slice(1) ||
      identity.schema !== 'public' ||
      !dirOk ||
      !hostOk ||
      identity.read_only !== 'on'
    )
      throw new Error('E2E_CLUSTER_IDENTITY_REJECTED');
    const {
      rows: [marker],
    } = await db.query(
      "SELECT description FROM pg_shdescription WHERE objoid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND classoid='pg_database'::regclass",
    );
    if (marker?.description !== 'SMART_ENGLISH_DISPOSABLE_E2E_V1')
      throw new Error('E2E_DISPOSABLE_MARKER_REQUIRED');
    await db.query('COMMIT');
  } finally {
    await db.end();
  }
  pin(env);
  return target;
}
module.exports = { endpoint, pin, verify };
