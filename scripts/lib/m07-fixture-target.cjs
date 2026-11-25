const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const checker = require('./m07-checker-target.cjs');
const recipe = require('../fixtures/m07-synthetic-v1.cjs');
const root = path.resolve(__dirname, '../..'),
  receiptPath = path.join(root, '.local-storage/v2-m07-synthetic-dec046/provision.private.json');
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
const quote = (s) => '"' + s.replace(/"/g, '""') + '"';
function validateFixtureTarget(env = process.env, receipt) {
  const target = checker.validateM07Target(env);
  if (
    env.M07_FIXTURE_MODE !== 'DEC046_SYNTHETIC_ONLY' ||
    target.config.database !== recipe.database
  )
    throw Error('M07_FIXTURE_EXACT_NEW_TARGET_REQUIRED');
  const manifestHash = hash(JSON.stringify(recipe.manifest()));
  if (
    !receipt ||
    receipt.version !== recipe.version ||
    receipt.database !== recipe.database ||
    ![manifestHash, recipe.manifest().bootstrapManifestSha256].includes(receipt.manifestHash) ||
    !/^\d+$/.test(String(receipt.oid)) ||
    !/^[a-f0-9]{64}$/.test(receipt.nonce ?? '') ||
    receipt.freshCreated !== true
  )
    throw Error('M07_FIXTURE_CREATION_RECEIPT_REQUIRED');
  return { ...target, manifestHash, receipt };
}
async function verifyFixtureIdentity(db, target, readOnly = 'on') {
  const {
    rows: [x],
  } = await db.query(
    `SELECT current_database() AS database,current_user AS role,session_user AS "sessionRole",current_schema() AS schema,current_setting('data_directory') AS directory,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('transaction_read_only') AS "readOnly",oid::text AS oid,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()`,
  );
  if (
    !x ||
    x.database !== target.config.database ||
    x.role !== 'wave01' ||
    x.sessionRole !== 'wave01' ||
    x.schema !== 'public' ||
    x.host !== '127.0.0.1' ||
    x.port !== 55401 ||
    x.readOnly !== readOnly ||
    x.marker !== 'SMART_ENGLISH_DISPOSABLE_E2E_V1' ||
    path.resolve(x.directory) !== path.resolve(target.directory) ||
    x.oid !== String(target.receipt.oid)
  )
    throw Error('M07_FIXTURE_SERVER_IDENTITY_REJECTED');
  const { rows } = await db.query(
    'SELECT migration_name AS name,checksum,finished_at IS NOT NULL AS applied,rolled_back_at IS NOT NULL AS "rolledBack" FROM _prisma_migrations ORDER BY migration_name',
  );
  if (
    rows.length !== 28 ||
    rows.some(
      (r, i) =>
        r.name !== target.migrations[i].name ||
        r.checksum !== target.migrations[i].checksum ||
        !r.applied ||
        r.rolledBack,
    )
  )
    throw Error('M07_FIXTURE_MIGRATIONS_REJECTED');
  return { ...x, migrations: 28, checksumsMatch: true };
}
async function tableHashes(db, excludeReceipt) {
  const { rows: tables } = await db.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations' ORDER BY tablename",
  );
  const out = {};
  for (const { tablename: t } of tables) {
    const where = excludeReceipt && t === 'domain_audit_events' ? ' WHERE id<>$1 AND id<>$2' : '';
    const { rows } = await db.query(
      'SELECT row_to_json(x)::text AS row FROM (SELECT * FROM ' +
        quote(t) +
        where +
        ') x ORDER BY row_to_json(x)::text',
      where ? [recipe.id('initialization-receipt'), recipe.id('semantic-revision-r02')] : [],
    );
    out[t] = { rows: rows.length, sha256: hash(rows.map((x) => x.row).join('\n')) };
  }
  return out;
}
async function finalizeKnownBootstrap(client, target, plan, recorded, rowHash, nonceHash) {
  if (recorded.rowHash !== rowHash || recorded.nonceHash !== nonceHash)
    throw Error('M07_FIXTURE_BOOTSTRAP_DRIFT');
  for (const f of plan.files) {
    const base = path.resolve(root, f.relativeRoot),
      file = path.resolve(base, f.key);
    if (
      !file.startsWith(path.join(base, 'synthetic_test_only') + path.sep) ||
      !fs.existsSync(file) ||
      hash(fs.readFileSync(file)) !== hash(f.body)
    )
      throw Error('M07_FIXTURE_FILE_DRIFT_NO_REPAIR');
  }
  let inserted = 0,
    updated = 0;
  const fields = {
    tests: ['status'],
    test_questions: ['points'],
    test_answers: ['pointsAwarded'],
    attempt_skill_scores: ['rawScore', 'normalizedScore'],
  };
  for (const operation of plan.operations.filter((x) => x.row && fields[x.table])) {
    const row = operation.row;
    if (operation.key.startsWith('extra-')) {
      if (!['test_questions', 'test_answers'].includes(operation.table))
        throw Error('M07_FIXTURE_REVISION_INSERT_FORBIDDEN');
      const payload = {
          ...row,
          createdAt: plan.time,
          ...(operation.table === 'test_answers' ? { updatedAt: plan.time } : {}),
        },
        names = Object.keys(payload);
      await client.query(
        'INSERT INTO ' +
          quote(operation.table) +
          ' (' +
          names.map(quote).join(',') +
          ') VALUES (' +
          names.map((_, i) => '$' + (i + 1)).join(',') +
          ')',
        names.map((k) => payload[k]),
      );
      inserted++;
    } else {
      const keys = fields[operation.table],
        values = keys.map((k) => row[k]);
      const result = await client.query(
        'UPDATE ' +
          quote(operation.table) +
          ' SET ' +
          keys.map((k, i) => quote(k) + '=$' + (i + 1)).join(',') +
          ' WHERE id=$' +
          (keys.length + 1) +
          ' AND (' +
          keys.map((k, i) => quote(k) + ' IS DISTINCT FROM $' + (i + 1)).join(' OR ') +
          ')',
        [...values, row.id],
      );
      updated += result.rowCount;
    }
  }
  const after = await tableHashes(client, true),
    afterHash = hash(JSON.stringify(after));
  await client.query(
    'INSERT INTO domain_audit_events(id,"actorId",action,"objectType","objectId",decision,reason,"createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,clock_timestamp())',
    [
      recipe.id('semantic-revision-r02'),
      plan.identities.staff[0],
      'SYNTHETIC_M07_SEMANTIC_R02',
      'SYNTHETIC_TEST_ONLY',
      target.manifestHash,
      'SYNTHETIC_ONLY',
      JSON.stringify({ revision: 2, nonceHash, from: rowHash, rowHash: afterHash }),
    ],
  );
  return {
    semanticRevision: 'r02',
    inserted,
    updated,
    rows: after,
    rowHash: afterHash,
    bootstrapAuditRetained: true,
  };
}
async function initializeFixture({
  env = process.env,
  receipt,
  createClient,
  onEvidence = () => {},
} = {}) {
  // Stage A stays offline, including receipt validation before importing pg.
  checker.validateM07Target(env);
  const target = validateFixtureTarget(
      env,
      receipt ?? JSON.parse(fs.readFileSync(receiptPath, 'utf8')),
    ),
    plan = recipe.manifest();
  const client = createClient
    ? createClient(target.config)
    : new (require('pg').Client)({
        ...target.config,
        options: target.config.options + ' -c timezone=UTC',
      });
  let begun = false;
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    begun = true;
    const identity = await verifyFixtureIdentity(client, target);
    await onEvidence({ stage: 'B-readonly', identity });
    await client.query('ROLLBACK');
    begun = false;
    await client.query('BEGIN READ WRITE');
    begun = true;
    await client.query('SELECT pg_advisory_xact_lock(2046007)');
    await verifyFixtureIdentity(client, target, 'off');
    const {
      rows: [previous],
    } = await client.query('SELECT * FROM domain_audit_events WHERE id=$1', [
      recipe.id('initialization-receipt'),
    ]);
    const before = await tableHashes(client, true),
      rowHash = hash(JSON.stringify(before)),
      nonceHash = hash(target.receipt.nonce);
    if (previous) {
      let selectedReceipt = previous;
      if (previous.objectId === plan.bootstrapManifestSha256) {
        const {
          rows: [revision],
        } = await client.query('SELECT * FROM domain_audit_events WHERE id=$1', [
          recipe.id('semantic-revision-r02'),
        ]);
        if (revision) selectedReceipt = revision;
        else {
          if (previous.objectType !== 'SYNTHETIC_TEST_ONLY')
            throw Error('M07_FIXTURE_BOOTSTRAP_SCOPE');
          const result = await finalizeKnownBootstrap(
            client,
            target,
            plan,
            JSON.parse(previous.reason),
            rowHash,
            nonceHash,
          );
          await verifyFixtureIdentity(client, target, 'off');
          await client.query('COMMIT');
          begun = false;
          return { ...result, idempotentNoOp: false, manifestHash: target.manifestHash, identity };
        }
      }
      const recorded = JSON.parse(selectedReceipt.reason);
      if (
        selectedReceipt.objectId !== target.manifestHash ||
        selectedReceipt.objectType !== 'SYNTHETIC_TEST_ONLY' ||
        recorded.nonceHash !== nonceHash ||
        recorded.rowHash !== rowHash
      )
        throw Error('M07_FIXTURE_DRIFT_NO_REPAIR');
      for (const f of plan.files) {
        const base = path.resolve(root, f.relativeRoot),
          file = path.resolve(base, f.key);
        if (
          !file.startsWith(path.join(base, 'synthetic_test_only') + path.sep) ||
          !fs.existsSync(file) ||
          hash(fs.readFileSync(file)) !== hash(f.body)
        )
          throw Error('M07_FIXTURE_FILE_DRIFT_NO_REPAIR');
      }
      await client.query('ROLLBACK');
      begun = false;
      return {
        idempotentNoOp: true,
        manifestHash: target.manifestHash,
        identity,
        rows: before,
        rowHash,
      };
    }
    if (Object.values(before).some((t) => t.rows !== 0))
      throw Error('M07_FIXTURE_NONEMPTY_TARGET_FORBIDDEN');
    const { rows: metadata } = await client.query(
      "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'",
    );
    const columns = {};
    for (const x of metadata) (columns[x.table_name] ??= new Set()).add(x.column_name);
    const allowed = new Set(Object.keys(plan.byTable));
    for (const operation of plan.operations) {
      if (!allowed.has(operation.table)) throw Error('M07_FIXTURE_TABLE_FORBIDDEN');
      const row = { ...(operation.row ?? operation.transition) };
      if (operation.row) {
        for (const k of ['createdAt', 'updatedAt'])
          if (columns[operation.table].has(k) && row[k] === undefined) row[k] = plan.time;
      }
      const names = Object.keys(row);
      if (names.some((k) => !columns[operation.table].has(k)))
        throw Error('M07_FIXTURE_COLUMN_INVALID');
      if (operation.transition) {
        if (
          operation.table !== 'course_versions' ||
          !['PENDING_APPROVAL', 'PUBLISHED'].includes(row.state)
        )
          throw Error('M07_FIXTURE_TRANSITION_FORBIDDEN');
        const keys = names.filter((k) => k !== 'id');
        await client.query(
          'UPDATE ' +
            quote(operation.table) +
            ' SET ' +
            keys.map((k, i) => quote(k) + '=$' + (i + 1)).join(',') +
            ' WHERE id=$' +
            (keys.length + 1),
          [...keys.map((k) => row[k]), row.id],
        );
      } else
        await client.query(
          'INSERT INTO ' +
            quote(operation.table) +
            ' (' +
            names.map(quote).join(',') +
            ') VALUES (' +
            names.map((_, i) => '$' + (i + 1)).join(',') +
            ')',
          names.map((k) => row[k]),
        );
    }
    // Only create the new owned synthetic file; never overwrite an existing object.
    for (const f of plan.files) {
      const base = path.resolve(root, f.relativeRoot),
        file = path.resolve(base, f.key);
      if (!file.startsWith(path.join(base, 'synthetic_test_only') + path.sep))
        throw Error('M07_FIXTURE_FILE_PATH');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (fs.existsSync(file)) {
        if (hash(fs.readFileSync(file)) !== hash(f.body)) throw Error('M07_FIXTURE_FILE_CONFLICT');
      } else fs.writeFileSync(file, f.body, { flag: 'wx' });
    }
    const after = await tableHashes(client, true),
      afterHash = hash(JSON.stringify(after));
    const reason = JSON.stringify({ version: recipe.version, nonceHash, rowHash: afterHash });
    await client.query(
      'INSERT INTO domain_audit_events(id,"actorId",action,"objectType","objectId",decision,reason,"createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        recipe.id('initialization-receipt'),
        plan.identities.staff[0],
        'SYNTHETIC_M07_INITIALIZED',
        'SYNTHETIC_TEST_ONLY',
        target.manifestHash,
        'SYNTHETIC_ONLY',
        reason,
        plan.time,
      ],
    );
    await verifyFixtureIdentity(client, target, 'off');
    await client.query('COMMIT');
    begun = false;
    return {
      idempotentNoOp: false,
      manifestHash: target.manifestHash,
      identity,
      rows: after,
      rowHash: afterHash,
      insertedRows: Object.values(plan.byTable).reduce((a, b) => a + b, 0),
      receiptRows: 1,
      operations: plan.operations.length,
    };
  } catch (error) {
    if (begun) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}
module.exports = {
  validateFixtureTarget,
  verifyFixtureIdentity,
  initializeFixture,
  tableHashes,
  receiptPath,
  hash,
  quote,
};
