// ONLY new disposable DBs in the verified Wave01 loopback cluster; no .env fallback.
import { Client } from 'pg';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
const endpoint = process.env.WAVE01_PG_URL;
if (!endpoint) throw new Error('Explicit WAVE01_PG_URL required');
const parsed = new URL(endpoint);
if (
  parsed.hostname !== '127.0.0.1' ||
  parsed.port !== '55401' ||
  parsed.pathname !== '/v2_wave01_dev'
)
  throw new Error('Not Wave01 isolated DEV');
const adminUrl = new URL(endpoint);
adminUrl.pathname = '/postgres';
const admin = new Client({ connectionString: adminUrl.toString() });
await admin.connect();
const {
  rows: [location],
} = await admin.query('SHOW data_directory');
if (resolve(location.data_directory) !== resolve('.local-storage/v2-wave01/postgres'))
  throw new Error('Unexpected data_directory');
const root = resolve('.local-storage/v2-wave01/migrations-' + Date.now());
mkdirSync(root);
const bin = 'C:/Program Files/PostgreSQL/14/bin';
const migrations = resolve('apps/api/prisma/migrations');
const names = readdirSync(migrations)
  .filter((n) => /^\d/.test(n))
  .sort();
if (names.length !== 16) throw new Error('Review migration history before running: expected 16');
const env = {
  ...process.env,
  SHADOW_DATABASE_URL: 'postgresql://wave01@127.0.0.1:55401/v2_wave01_shadow',
};
function deploy(dbName, config, log) {
  const url = new URL(endpoint);
  url.pathname = '/' + dbName;
  const output = execFileSync(
    process.execPath,
    [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--config', config],
    { env: { ...env, DATABASE_URL: url.toString() }, encoding: 'utf8' },
  );
  writeFileSync(resolve(root, log + '.log'), output);
  return url.toString();
}
async function newDb(name) {
  if (!/^v2_wave01_migration_[a-z0-9_]+$/.test(name)) throw new Error('Unsafe DB name');
  await admin.query('CREATE DATABASE ' + name);
  return name;
}
async function snapshot(db, tables) {
  const result = {};
  for (const table of tables) {
    const { rows } = await db.query('SELECT * FROM ' + table + ' ORDER BY 1');
    result[table] = {
      rows: rows.length,
      sha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex'),
    };
  }
  return result;
}
const results = [];
for (const history of [14, 15]) {
  const name = await newDb('v2_wave01_migration_' + history + '_' + Date.now());
  const prefix = resolve(root, 'history' + history);
  mkdirSync(prefix);
  for (const entry of [...names.slice(0, history), 'migration_lock.toml'])
    cpSync(resolve(migrations, entry), resolve(prefix, entry), { recursive: true });
  const config = resolve(root, 'history' + history + '.config.ts');
  writeFileSync(
    config,
    "import {defineConfig} from 'prisma/config'; export default defineConfig({schema:" +
      JSON.stringify(resolve('apps/api/prisma/schema.prisma')) +
      ',migrations:{path:' +
      JSON.stringify(prefix) +
      '},datasource:{url:process.env.DATABASE_URL!}});',
  );
  const url = deploy(name, config, history + '-before');
  const db = new Client({ connectionString: url });
  await db.connect();
  const ids = Array.from({ length: 10 }, () => randomUUID());
  await db.query(
    "INSERT INTO users(id,email,\"passwordHash\",\"fullName\",role,\"updatedAt\") VALUES ($1,$2,'disabled','Synthetic legacy','ADMIN_COORDINATOR',now()),($3,$4,'disabled','Synthetic learner','STUDENT',now())",
    [ids[0], ids[0] + '@example.invalid', ids[1], ids[1] + '@example.invalid'],
  );
  await db.query(
    "INSERT INTO user_sessions(sid,sess,expire) VALUES ($1,$2,now()+interval '1 day')",
    [ids[2], JSON.stringify({ userId: ids[0] })],
  );
  const tables = ['users', 'user_sessions'];
  if (history === 15) {
    await db.query(
      "INSERT INTO tests(id,purpose,\"placementMode\",title,\"updatedAt\") VALUES ($1,'PLACEMENT','FOUR_SKILLS','Synthetic S10',now())",
      [ids[3]],
    );
    await db.query(
      "INSERT INTO questions(id,\"responseType\",difficulty,\"toeicSkill\",content,\"updatedAt\") VALUES ($1,'AUDIO_RESPONSE','EASY','SPEAKING','Synthetic only',now())",
      [ids[4]],
    );
    await db.query(
      'INSERT INTO test_questions(id,"testId","questionId","orderIndex") VALUES ($1,$2,$3,0)',
      [ids[5], ids[3], ids[4]],
    );
    await db.query(
      'INSERT INTO test_attempts(id,"testId","learnerId","attemptNumber","updatedAt") VALUES ($1,$2,$3,1,now())',
      [ids[6], ids[3], ids[1]],
    );
    await db.query('INSERT INTO exam_recovery_permissions("userId","grantedBy") VALUES ($1,$2)', [
      ids[0],
      ids[1],
    ]);
    await db.query(
      'INSERT INTO exam_task_progress(id,"attemptId","testQuestionId","learnerId",epoch,"contentVersion","assetVersion","mediaSha256","mediaStorageKey","mediaDurationMs","updatedAt") VALUES ($1,$2,$3,$4,$5,\'v01\',\'v01\',$6,\'synthetic/private.wav\',100,now())',
      [ids[7], ids[6], ids[5], ids[1], ids[8], 'a'.repeat(64)],
    );
    await db.query(
      'INSERT INTO exam_task_events(id,"progressId","actorId",action,accepted,revision) VALUES ($1,$2,$3,\'SYNTHETIC_EXISTING\',true,0)',
      [ids[9], ids[7], ids[0]],
    );
    tables.push(
      'tests',
      'questions',
      'test_questions',
      'test_attempts',
      'exam_recovery_permissions',
      'exam_task_progress',
      'exam_task_events',
      'exam_task_receipts',
      'exam_task_uploads',
    );
  }
  const before = await snapshot(db, tables);
  const dump = resolve(root, history + '-before.private.dump');
  execFileSync(bin + '/pg_dump.exe', [
    '-h',
    '127.0.0.1',
    '-p',
    '55401',
    '-U',
    parsed.username,
    '-d',
    name,
    '-Fc',
    '-f',
    dump,
  ]);
  deploy(name, resolve('apps/api/prisma.config.ts'), history + '-after');
  const after = await snapshot(db, tables);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Existing rows changed');
  const {
    rows: [unmapped],
  } = await db.query('SELECT role FROM users WHERE id=$1', [ids[0]]);
  if (unmapped.role !== 'ADMIN_COORDINATOR') throw new Error('Unexpected automatic legacy mapping');
  const {
    rows: [grant],
  } = await db.query('SELECT count(*)::int AS n FROM permission_grants');
  if (grant.n !== 0) throw new Error('Unexpected automatic grant');
  const restoredName = await newDb(name + '_restore');
  execFileSync(bin + '/pg_restore.exe', [
    '-h',
    '127.0.0.1',
    '-p',
    '55401',
    '-U',
    parsed.username,
    '-d',
    restoredName,
    '--exit-on-error',
    dump,
  ]);
  const restoredUrl = new URL(endpoint);
  restoredUrl.pathname = '/' + restoredName;
  const restored = new Client({ connectionString: restoredUrl.toString() });
  await restored.connect();
  if (JSON.stringify(await snapshot(restored, tables)) !== JSON.stringify(before))
    throw new Error('Restore hash mismatch');
  await restored.end();
  await db.end();
  results.push({
    history,
    name,
    restoreDatabase: restoredName,
    pass: true,
    preservation: before,
    legacyUnmapped: true,
    zeroAutomaticGrants: true,
    backupRestoreVerified: true,
  });
}
const freshName = await newDb('v2_wave01_migration_fresh_' + Date.now());
const fresh = new Client({
  connectionString: deploy(freshName, resolve('apps/api/prisma.config.ts'), 'fresh'),
});
await fresh.connect();
const {
  rows: [count],
} = await fresh.query(
  'SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL',
);
if (count.n !== 16) throw new Error('Fresh migration count mismatch');
await fresh.end();
await admin.end();
const result = {
  pass: true,
  server: 'PostgreSQL 14.13 loopback:55401',
  fresh: { database: freshName, migrations: count.n },
  upgrades: results,
  productionTargetUsed: false,
};
writeFileSync(
  resolve('.local-storage/v2-wave01/migration-result.json'),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result));
