const { Client } = require('pg');
const { resolve } = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { readFileSync, readdirSync, writeFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const root = resolve(__dirname, '..'),
  out = resolve(root, 'docs/v2/br136');
const marker = 'SMART_ENGLISH_DISPOSABLE_E2E_V1';
function assertIdentity(i, name) {
  if (
    !/^[1-9][0-9]*$/.test(String(i.oid)) ||
    ['953322', '20986'].includes(String(i.oid)) ||
    !/^v2_wave01_dev_test_w04b_wave05_br136_[a-z0-9_]+$/.test(name) ||
    i.db !== name ||
    i.marker !== marker ||
    i.host !== '127.0.0.1' ||
    Number(i.port) !== 55401 ||
    resolve(i.directory) !== resolve(root, '.local-storage/v2-wave01/postgres')
  )
    throw Error('BR136_DISPOSABLE_IDENTITY_REJECTED');
}
module.exports = { assertIdentity };
if (require.main === module)
  (async () => {
    const evidence = {
      status: 'BLOCKED',
      protectedQaFreshVerification: false,
      retained: true,
      migrations: [],
      guardRejections: [],
    };
    const name =
      'v2_wave01_dev_test_w04b_wave05_br136_' +
      Date.now().toString(36) +
      '_' +
      randomUUID().slice(0, 6);
    const url = 'postgresql://wave01@127.0.0.1:55401/' + name;
    const admin = new Client({
      connectionString: 'postgresql://wave01@127.0.0.1:55401/postgres',
      connectionTimeoutMillis: 3000,
    });
    let db;
    try {
      await admin.connect();
      await admin.query('BEGIN READ ONLY');
      const i = (
        await admin.query(
          "SELECT current_setting('data_directory') AS directory,host(inet_server_addr()) AS host,inet_server_port() AS port",
        )
      ).rows[0];
      if (
        resolve(i.directory) !== resolve(root, '.local-storage/v2-wave01/postgres') ||
        i.host !== '127.0.0.1' ||
        i.port !== 55401
      )
        throw Error('CLUSTER_REJECTED');
      await admin.query('COMMIT');
      await admin.query('CREATE DATABASE ' + name);
      await admin.query('COMMENT ON DATABASE ' + name + " IS '" + marker + "'");
      db = new Client({ connectionString: url, connectionTimeoutMillis: 3000 });
      await db.connect();
      await db.query('BEGIN READ ONLY');
      const identity = (
        await db.query(
          "SELECT current_database() AS db,oid::text AS oid,shobj_description(oid,'pg_database') AS marker,current_setting('data_directory') AS directory,host(inet_server_addr()) AS host,inet_server_port() AS port FROM pg_database WHERE datname=current_database()",
        )
      ).rows[0];
      assertIdentity(identity, name);
      evidence.identity = identity;
      for (const oid of ['953322', '20986']) {
        let rejected = false;
        try {
          assertIdentity({ ...identity, oid }, name);
        } catch {
          rejected = true;
        }
        if (!rejected) throw Error('GUARD_REGRESSION');
        evidence.guardRejections.push({ oid, rejected });
      }
      for (const variant of [
        { oid: 'unknown' },
        { marker: 'wrong' },
        { db: 'v2_wave01_dev' },
        { directory: 'C:/unknown' },
      ]) {
        let rejected = false;
        try {
          assertIdentity({ ...identity, ...variant }, name);
        } catch {
          rejected = true;
        }
        if (!rejected) throw Error('GUARD_REGRESSION');
        evidence.guardRejections.push({ variant, rejected });
      }
      await db.query('COMMIT');
      for (const dir of readdirSync(resolve(root, 'apps/api/prisma/migrations'))
        .filter((n) => /^\d/.test(n))
        .sort()) {
        const sql = readFileSync(resolve(root, 'apps/api/prisma/migrations', dir, 'migration.sql'));
        await db.query(sql.toString('utf8'));
        evidence.migrations.push({
          name: dir,
          sha256: createHash('sha256').update(sql).digest('hex'),
        });
      }
      evidence.status = 'VERIFIED_DISPOSABLE_MIGRATED';
      writeFileSync(resolve(out, 'DB-proof.json'), JSON.stringify(evidence, null, 2));
      const args = [
        resolve(root, 'node_modules/jest/bin/jest.js'),
        '--config',
        resolve(root, 'apps/api/test/jest-e2e.json'),
        '--runInBand',
        '--runTestsByPath',
        resolve(root, 'apps/api/test/br136-advisory-http.e2e-spec.ts'),
        '--testTimeout=240000',
        '--json',
        '--outputFile=' + resolve(out, 'HTTP-jest.json'),
      ];
      const env = {
        ...process.env,
        NODE_ENV: 'test',
        E2E_DATABASE_URL: url,
        DATABASE_URL: url,
        WAVE01_PG_URL: url,
        BATCH04_PG_URL: url,
        GEMINI_API_KEY: 'BR136_FAKE_NOT_A_REAL_KEY',
        PLACEMENT_AI_ADVISORY_PROVIDER: 'NONE',
        PLACEMENT_AI_ADVISORY_STAGING_ENABLED: 'false',
        PLACEMENT_AI_ADVISORY_DAILY_BUDGET_CALLS: '0',
        PLACEMENT_AI_ADVISORY_LIVE_VERIFIED: 'false',
        W04B_ENABLED: 'DEV_WORKFLOW',
        W05A_ENABLED: 'DEV_SUPPORT',
        W05B_ENABLED: 'DEV_DEC060',
        W06_ENABLED: 'DEV_DEC047',
        W07_ENABLED: 'DEV_DEC049',
        W08_ENABLED: 'DEV_DEC053',
        W09_ENABLED: 'DEV_W09',
        W10_REPORT_CSV_ENABLED: 'DEV_W10',
        REPORT_CENTER_TIME_ZONE: 'Asia/Ho_Chi_Minh',
      };
      const r = spawnSync(process.execPath, args, {
        cwd: root,
        env,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
      });
      writeFileSync(resolve(out, 'HTTP.log'), (r.stdout || '') + (r.stderr || ''));
      evidence.command = [process.execPath, ...args];
      evidence.exit = r.status;
      evidence.status = r.status === 0 ? 'PASS' : 'FAIL';
      console.log(JSON.stringify({ database: identity, exit: r.status }));
      process.exitCode = r.status ?? 1;
    } catch (e) {
      evidence.error = { code: e.code, message: e.message };
      console.error(evidence.error);
      process.exitCode = 1;
    } finally {
      if (db) await db.end();
      await admin.end();
      writeFileSync(resolve(out, 'DB-proof.json'), JSON.stringify(evidence, null, 2));
    }
  })();
