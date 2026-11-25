const { Client } = require('pg');
const { createHash, randomUUID } = require('node:crypto');
const { readdirSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const ROOT = resolve(__dirname, '../..');
const MIGRATIONS_DIR = resolve(ROOT, 'apps/api/prisma/migrations');
const FORBIDDEN_DBS = new Set([
  'postgres',
  'template0',
  'template1',
  'v2_wave01_dev',
  'v2_wave01_dev_test_w04b_unified_runtime01_20261107',
]);

async function createDisposableDb(prefix = 'w04b_argon', maxMigrations = null) {
  const suffix = `${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`.toLowerCase();
  const dbName = `v2_wave01_dev_test_${prefix}_${suffix}`;
  if (
    FORBIDDEN_DBS.has(dbName) ||
    !/^v2_wave01_dev_test_[a-z0-9_]+$/.test(dbName)
  ) {
    throw new Error(`Unsafe disposable DB name: ${dbName}`);
  }

  const admin = new Client({
    connectionString: 'postgresql://wave01@127.0.0.1:55401/postgres',
  });
  await admin.connect();
  try {
    const {
      rows: [loc],
    } = await admin.query('SHOW data_directory');
    if (resolve(loc.data_directory) !== resolve(ROOT, '.local-storage/v2-wave01/postgres')) {
      throw new Error(`Unexpected postgres data_directory: ${loc.data_directory}`);
    }
    await admin.query(`CREATE DATABASE ${dbName}`);
    await admin.query(
      `COMMENT ON DATABASE ${dbName} IS 'SMART_ENGLISH_DISPOSABLE_E2E_V1'`,
    );
  } finally {
    await admin.end();
  }

  const connectionString = `postgresql://wave01@127.0.0.1:55401/${dbName}`;
  const db = new Client({ connectionString });
  await db.connect();
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id" VARCHAR(36) PRIMARY KEY NOT NULL,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMPTZ,
        "migration_name" VARCHAR(255) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMPTZ,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      );
    `);

    const allDirs = readdirSync(MIGRATIONS_DIR)
      .filter((name) => /^\d/.test(name))
      .sort();
    const selectedDirs = maxMigrations ? allDirs.slice(0, maxMigrations) : allDirs;

    for (const dir of selectedDirs) {
      const sqlPath = resolve(MIGRATIONS_DIR, dir, 'migration.sql');
      const sqlBuf = readFileSync(sqlPath);
      const checksum = createHash('sha256').update(sqlBuf).digest('hex');
      const startedAt = new Date();
      await db.query(sqlBuf.toString('utf8'));
      await db.query(
        `INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
         VALUES ($1, $2, now(), $3, NULL, NULL, $4, 1)`,
        [randomUUID(), checksum, dir, startedAt],
      );
    }
  } finally {
    await db.end();
  }

  return { dbName, connectionString };
}

async function dropDisposableDb(dbName) {
  if (
    !dbName ||
    FORBIDDEN_DBS.has(dbName) ||
    !/^v2_wave01_dev_test_[a-z0-9_]+$/.test(dbName)
  ) {
    throw new Error(`Refusing to drop non-disposable DB: ${dbName}`);
  }
  const admin = new Client({
    connectionString: 'postgresql://wave01@127.0.0.1:55401/postgres',
  });
  await admin.connect();
  try {
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName],
    );
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
  } finally {
    await admin.end();
  }
}

module.exports = { createDisposableDb, dropDisposableDb };
