// DEC-070 standalone additive QA lane. Default: read-only verification.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  { Client } = require('pg');
const root = path.resolve(__dirname, '../../../..'),
  known = ['001-dec070-cms.sql', '002-publication-replacement.sql'];
async function migrate(target, apply = false) {
  if (
    !/^v2_wave01_dev_test_w10_cms_complete02_[a-z0-9_]+$/.test(target.database) ||
    !/^\d+$/.test(target.oid) ||
    target.oid === '20986' ||
    target.physical !== '7702384118803149788'
  )
    throw Error('EXACT_CMS_QA_RECEIPT_REQUIRED');
  const c = new Client({
    host: '127.0.0.1',
    port: 55401,
    user: 'wave01',
    database: target.database,
    options: '-c timezone=UTC' + (apply ? '' : ' -c default_transaction_read_only=on'),
  });
  await c.connect();
  try {
    const i = (
      await c.query(
        "SELECT current_database() db,(SELECT oid::text FROM pg_database WHERE datname=current_database()) oid,current_user role,current_setting('data_directory') dir,inet_server_port() port,host(inet_server_addr()) host,(SELECT system_identifier::text FROM pg_control_system()) physical,shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker",
      )
    ).rows[0];
    if (
      i.db !== target.database ||
      i.oid !== target.oid ||
      i.role !== 'wave01' ||
      i.port !== 55401 ||
      i.host !== '127.0.0.1' ||
      i.physical !== target.physical ||
      i.marker !== 'SMART_ENGLISH_DISPOSABLE_E2E_V1' ||
      path.resolve(i.dir) !== path.join(root, '.local-storage/v2-wave01/postgres')
    )
      throw Error('CMS_DATABASE_IDENTITY_MISMATCH');
    const legacy = (
      await c.query(
        'SELECT migration_name,checksum FROM _prisma_migrations ORDER BY migration_name',
      )
    ).rows;
    const folder = path.join(root, 'apps/api/prisma/migrations'),
      names = fs
        .readdirSync(folder, { withFileTypes: true })
        .filter((x) => x.isDirectory())
        .map((x) => x.name)
        .sort()
        .slice(0, 32),
      expected = names.map((migration_name) => ({
        migration_name,
        checksum: crypto
          .createHash('sha256')
          .update(fs.readFileSync(path.join(folder, migration_name, 'migration.sql')))
          .digest('hex'),
      }));
    if (legacy.length !== 32 || JSON.stringify(legacy) !== JSON.stringify(expected))
      throw Error('ORIGINAL_32_PRISMA_LEDGER_REQUIRED');
    await c.query(apply ? 'BEGIN' : 'BEGIN READ ONLY');
    const added = [];
    try {
      if (apply) await c.query('SELECT pg_advisory_xact_lock(842030)');
      let installed = (await c.query("SELECT to_regnamespace('cms_v2') IS NOT NULL AS yes")).rows[0]
        .yes;
      if (installed) {
        const versions = (await c.query('SELECT version FROM cms_v2.migrations')).rows.map(
          (r) => r.version,
        );
        if (versions.some((v) => !known.includes(v + '.sql'))) throw Error('UNKNOWN_CMS_MIGRATION');
      }
      for (const file of known) {
        const sql = fs.readFileSync(path.join(__dirname, file), 'utf8'),
          version = file.slice(0, -4),
          checksum = crypto.createHash('sha256').update(sql).digest('hex'),
          row = installed
            ? (await c.query('SELECT checksum FROM cms_v2.migrations WHERE version=$1', [version]))
                .rows[0]
            : null;
        if (row) {
          if (row.checksum !== checksum) throw Error('CMS_CHECKSUM_MISMATCH:' + version);
          continue;
        }
        if (!apply) throw Error('CMS_MIGRATION_NOT_APPLIED:' + version);
        await c.query(sql);
        if (!installed) {
          await c.query(
            'INSERT INTO cms_v2.target_binding(singleton,database_name,database_oid,physical_id,authority) VALUES(true,$1,$2::oid,$3,$4)',
            [target.database, target.oid, target.physical, 'PO V2-DEC-070 / BR-V2-112'],
          );
          installed = true;
        }
        await c.query(
          'INSERT INTO cms_v2.migrations(version,checksum,authority) VALUES($1,$2,$3)',
          [version, checksum, 'PO V2-DEC-070 / BR-V2-112 standalone CMS lane'],
        );
        added.push(version);
      }
      await c.query('SELECT cms_v2.assert_target()');
      const after = (
        await c.query(
          'SELECT migration_name,checksum FROM _prisma_migrations ORDER BY migration_name',
        )
      ).rows;
      if (JSON.stringify(after) !== JSON.stringify(legacy)) throw Error('LEGACY_LEDGER_CHANGED');
      await c.query('COMMIT');
      return {
        database: i.db,
        oid: i.oid,
        mode: apply ? 'APPLY' : 'READ_ONLY_CHECK',
        added,
        prismaRows: 32,
        oldLedgerUnchanged: true,
        cmsVersions: known.map((f) => f.slice(0, -4)),
      };
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    }
  } finally {
    await c.end();
  }
}
module.exports = { migrate };
if (require.main === module) {
  const arg = process.argv.find((x) => x.startsWith('--target='));
  if (!arg) throw Error('Pass --target=<verified QA_TARGET.json>; optional --apply');
  const target = JSON.parse(fs.readFileSync(path.resolve(arg.slice(9))));
  migrate(target, process.argv.includes('--apply'))
    .then((r) => console.log(JSON.stringify(r)))
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    });
}
