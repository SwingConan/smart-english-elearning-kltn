const { test } = require('node:test'),
  assert = require('node:assert/strict');
const recipe = require('./fixtures/m07-synthetic-v1.cjs'),
  guard = require('./lib/m07-fixture-target.cjs'),
  checker = require('./lib/m07-checker-target.cjs');
const url = 'postgresql://wave01@127.0.0.1:55401/' + recipe.database;
const good = {
  E2E_DATABASE_URL: url,
  M07_EXPECTED_DATABASE: recipe.database,
  M07_FIXTURE_MODE: 'DEC046_SYNTHETIC_ONLY',
};
const receipt = {
  version: recipe.version,
  database: recipe.database,
  manifestHash: guard.hash(JSON.stringify(recipe.manifest())),
  oid: '12345',
  nonce: 'a'.repeat(64),
  freshCreated: true,
};
for (const [name, env, r] of [
  ['missing', {}, receipt],
  ['DATABASE_URL inherited only', { DATABASE_URL: url }, receipt],
  [
    'old DEV',
    {
      ...good,
      E2E_DATABASE_URL: 'postgresql://smart_elearning_app@localhost:5432/smart_elearning_dev',
    },
    receipt,
  ],
  [
    'production host',
    { ...good, E2E_DATABASE_URL: url.replace('127.0.0.1', 'production.invalid') },
    receipt,
  ],
  [
    'populated prior wave target',
    {
      ...good,
      E2E_DATABASE_URL:
        'postgresql://wave01@127.0.0.1:55401/v2_wave01_dev_test_w04a_w05a_s10dev_browser02',
      M07_EXPECTED_DATABASE: 'v2_wave01_dev_test_w04a_w05a_s10dev_browser02',
    },
    receipt,
  ],
  [
    'restore is never a writable fixture',
    {
      ...good,
      E2E_DATABASE_URL: url.replace(recipe.database, recipe.restoreDatabase),
      M07_EXPECTED_DATABASE: recipe.restoreDatabase,
    },
    receipt,
  ],
  [
    'conflicting alias',
    { ...good, DATABASE_URL: 'postgresql://x@localhost:5432/smart_elearning_dev' },
    receipt,
  ],
  ['wrong user', { ...good, E2E_DATABASE_URL: url.replace('wave01@', 'postgres@') }, receipt],
  ['missing explicit writer mode', { ...good, M07_FIXTURE_MODE: '' }, receipt],
  ['wrong receipt digest', good, { ...receipt, manifestHash: '0'.repeat(64) }],
  ['not a fresh creation receipt', good, { ...receipt, freshCreated: false }],
])
  test('writer rejects ' + name + ' with ZERO client/connection attempts', async () => {
    let attempted = 0;
    await assert.rejects(
      guard.initializeFixture({
        env,
        receipt: r,
        createClient: () => {
          attempted++;
          throw Error('NETWORK_NOT_ALLOWED');
        },
      }),
    );
    assert.equal(attempted, 0);
  });
for (const mutation of ['marker', 'role', 'oid', 'migration'])
  test('writer Stage B mocked ' + mutation + ' rejects before any INSERT', async () => {
    let connects = 0,
      ends = 0;
    const sql = [];
    const target = guard.validateFixtureTarget(good, receipt);
    const identity = {
      database: recipe.database,
      role: 'wave01',
      sessionRole: 'wave01',
      schema: 'public',
      directory: target.directory,
      host: '127.0.0.1',
      port: 55401,
      readOnly: 'on',
      oid: '12345',
      marker: 'SMART_ENGLISH_DISPOSABLE_E2E_V1',
    };
    if (mutation !== 'migration') identity[mutation] = 'incorrect';
    await assert.rejects(
      guard.initializeFixture({
        env: good,
        receipt,
        createClient: () => ({
          async connect() {
            connects++;
          },
          async query(text) {
            sql.push(text);
            if (text.includes('current_database()')) return { rows: [identity] };
            if (text.includes('_prisma_migrations')) return { rows: [] };
            return { rows: [] };
          },
          async end() {
            ends++;
          },
        }),
      }),
    );
    assert.deepEqual([connects, ends], [1, 1]);
    assert(!sql.some((s) => /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)/i.test(s)));
    assert(!sql.some((s) => s.includes('FROM domain_audit_events')));
  });
test('manifest deterministic, synthetic, unique and restricted to allowed source tables', () => {
  const a = recipe.manifest(),
    b = recipe.manifest();
  assert.deepEqual(a, b);
  assert(a.operations.every((x) => x.classification === 'SYNTHETIC_TEST_ONLY'));
  const rows = a.operations.filter((x) => x.row);
  assert.equal(new Set(rows.map((x) => x.row.id)).size, rows.length);
  assert(
    !rows.some((x) => /placement|support|exam_task|payment|counsel|user_sessions/.test(x.table)),
  );
  assert(
    rows
      .filter((x) => x.table === 'users')
      .every((x) => x.row.passwordHash === '!SYNTHETIC_TEST_ONLY_NO_LOGIN'),
  );
});
test('actual planned progress rows produce 49/88 and unchanged2/2/3/2/2 buckets', () => {
  const m = recipe.manifest(),
    enroll = m.operations.filter((x) => x.table === 'enrollments'),
    progress = m.operations.filter((x) => x.table === 'lesson_progress');
  assert.equal(enroll.length, 11);
  assert.equal(progress.length, 88);
  const counts = enroll.map(
    (e) =>
      progress.filter((x) => x.row.enrollmentId === e.row.id && x.row.status === 'COMPLETED')
        .length,
  );
  assert.equal(
    counts.reduce((a, b) => a + b),
    49,
  );
  const buckets = [0, 0, 0, 0, 0];
  for (const n of counts) {
    const percent = Math.round((100 * n) / 8);
    buckets[percent === 100 ? 4 : Math.floor(percent / 25)]++;
  }
  assert.deepEqual(buckets, [2, 2, 3, 2, 2]);
});
test('all answer choices/question links and attempt enrollments are class-local', () => {
  const m = recipe.manifest(),
    rows = m.operations.filter((x) => x.row);
  const by = new Map(rows.map((x) => [x.row.id, x]));
  for (const x of rows.filter((x) => x.table === 'test_answers')) {
    const a = by.get(x.row.attemptId).row,
      q = by.get(x.row.testQuestionId).row;
    assert.equal(a.testId, q.testId);
    const e = by.get(a.enrollmentId).row,
      ca = by.get(a.classAssessmentId).row;
    assert.equal(e.learnerId, a.learnerId);
    assert.equal(e.classOfferingId, ca.classOfferingId);
    for (const oid of x.row.selectedOptionIds)
      assert.equal(by.get(oid).row.questionId, q.questionId);
  }
});
test('checker readonly guard still refuses unsupported live writer mode bypass without constructing client', async () => {
  let n = 0;
  await assert.rejects(
    checker.withM07ReadOnlyTarget(() => {}, {
      env: { ...good, E2E_DATABASE_URL: 'postgresql://x@localhost:5432/smart_elearning_dev' },
      createClient: () => {
        n++;
      },
    }),
  );
  assert.equal(n, 0);
});
test('submitted synthetic attempts use published test states and objective scores derive from weighted saved answers', () => {
  const m = recipe.manifest(),
    ops = m.operations.filter((x) => x.row),
    by = new Map(ops.map((x) => [x.row.id, x.row]));
  for (const attempt of ops.filter((x) => x.table === 'test_attempts').map((x) => x.row)) {
    assert.equal(by.get(attempt.testId).status, 'PUBLISHED');
    for (const skill of ['LISTENING', 'READING']) {
      const answers = ops
        .filter(
          (x) =>
            x.table === 'test_answers' &&
            x.row.attemptId === attempt.id &&
            by.get(by.get(x.row.testQuestionId).questionId).toeicSkill === skill,
        )
        .map((x) => x.row);
      const maximum = answers.reduce((n, x) => n + by.get(x.testQuestionId).points, 0),
        earned = answers.reduce(
          (n, x) =>
            n +
            (x.selectedOptionIds.length === 1 && by.get(x.selectedOptionIds[0]).isCorrect
              ? by.get(x.testQuestionId).points
              : 0),
          0,
        );
      assert.equal(maximum, 100);
      assert.equal(
        answers.reduce((n, x) => n + Number(x.pointsAwarded), 0),
        earned,
      );
      const score = ops.find(
        (x) =>
          x.table === 'attempt_skill_scores' &&
          x.row.attemptId === attempt.id &&
          x.row.skill === skill,
      ).row;
      assert.equal(Number(score.rawScore), earned);
      assert.equal(Number(score.normalizedScore), (100 * earned) / maximum);
    }
  }
});
for (const mutation of ['row-hash', 'nonce-hash'])
  test(
    'known-bootstrap semantic revision rejects changed ' + mutation + ' before writes',
    async () => {
      const target = guard.validateFixtureTarget(good, receipt);
      let readOnly = 'on',
        writes = 0;
      await assert.rejects(
        guard.initializeFixture({
          env: good,
          receipt,
          createClient: () => ({
            async connect() {},
            async end() {},
            async query(sql, params) {
              if (sql.startsWith('BEGIN READ WRITE')) readOnly = 'off';
              if (sql.includes('current_database()'))
                return {
                  rows: [
                    {
                      database: recipe.database,
                      role: 'wave01',
                      sessionRole: 'wave01',
                      schema: 'public',
                      directory: target.directory,
                      host: '127.0.0.1',
                      port: 55401,
                      readOnly,
                      oid: '12345',
                      marker: 'SMART_ENGLISH_DISPOSABLE_E2E_V1',
                    },
                  ],
                };
              if (sql.includes('FROM _prisma_migrations'))
                return {
                  rows: checker
                    .expectedMigrations()
                    .map((x) => ({ ...x, applied: true, rolledBack: false })),
                };
              if (sql.startsWith('SELECT * FROM domain_audit_events'))
                return {
                  rows:
                    params[0] === recipe.id('initialization-receipt')
                      ? [
                          {
                            objectId: recipe.manifest().bootstrapManifestSha256,
                            objectType: 'SYNTHETIC_TEST_ONLY',
                            reason: JSON.stringify({
                              nonceHash:
                                mutation === 'nonce-hash' ? 'incorrect' : guard.hash(receipt.nonce),
                              rowHash: mutation === 'row-hash' ? 'incorrect' : guard.hash('{}'),
                            }),
                          },
                        ]
                      : [],
                };
              if (/^\s*(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)/i.test(sql)) writes++;
              return { rows: [] };
            },
          }),
        }),
        /M07_FIXTURE_BOOTSTRAP_DRIFT/,
      );
      assert.equal(writes, 0);
    },
  );
for (const mode of ['missing', 'old', 'foreign-id-argument'])
  test('actual writer CLI ' + mode + ' imports no pg and opens no socket', () => {
    const fs = require('fs'),
      path = require('path'),
      os = require('os'),
      cp = require('child_process'),
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm07-fixture-negative-')),
      stats = path.join(dir, 'stats.json'),
      trap = path.join(dir, 'trap.cjs');
    fs.writeFileSync(
      trap,
      `const fs=require('fs'),M=require('module'),net=require('net'),counts={pg:0,socket:0};const load=M._load;M._load=function(n,...a){if(n==='pg'){counts.pg++;throw Error('DRIVER_FORBIDDEN')}return load.call(this,n,...a)};net.Socket.prototype.connect=function(){counts.socket++;throw Error('SOCKET_FORBIDDEN')};process.on('exit',()=>fs.writeFileSync(${JSON.stringify(stats)},JSON.stringify(counts)));`,
    );
    const env = { ...process.env };
    for (const k of Object.keys(env))
      if (
        /^PG/i.test(k) ||
        [
          'DATABASE_URL',
          'E2E_DATABASE_URL',
          'WAVE01_PG_URL',
          'BATCH04_PG_URL',
          'M07_EXPECTED_DATABASE',
          'M07_FIXTURE_MODE',
          'NODE_OPTIONS',
        ].includes(k)
      )
        delete env[k];
    if (mode === 'old')
      Object.assign(env, good, {
        E2E_DATABASE_URL: 'postgresql://smart_elearning_app@localhost:5432/smart_elearning_dev',
      });
    if (mode === 'foreign-id-argument') Object.assign(env, good);
    const result = cp.spawnSync(
      process.execPath,
      [
        '--require',
        trap,
        'scripts/initialize-m07-synthetic.cjs',
        ...(mode === 'foreign-id-argument'
          ? ['--class-id', '00000000-0000-4000-8000-000000000001']
          : []),
      ],
      { env, encoding: 'utf8', windowsHide: true, timeout: 15000 },
    );
    assert.equal(result.status, 1);
    assert.deepEqual(JSON.parse(fs.readFileSync(stats)), { pg: 0, socket: 0 });
  });
