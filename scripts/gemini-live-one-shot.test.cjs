'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { runOneShot, pathsFor, hash } = require('./lib/gemini-live-one-shot.cjs');
const ROOT = path.resolve(__dirname, '..');
const WORKER = path.join(__dirname, 'fixtures/gemini-live-one-shot-worker.cjs');
const proofs = [];
function fixture() {
  const privateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'br136-oneshot-offline-'));
  const policy = {
    authorizationId: 'OFFLINE_TEST_ONE_PERMISSION',
    environmentId: 'OFFLINE_ENVIRONMENT',
    machineBinding: hash(randomUUID()),
    repositoryRoot: ROOT,
    scope: {
      database: 'v2_wave01_dev_test_w04b_wave05_br136_offline',
      oid: '700001',
      dataDirectory: path.join(privateRoot, 'fake-pg-data'),
      attemptId: randomUUID(),
      learnerId: randomUUID(),
      placementVersionId: randomUUID(),
      model: 'gemini-2.5-flash',
    },
  };
  const credential = {
    schemaVersion: 1,
    environmentId: policy.environmentId,
    credentialRevision: 'ROTATED_AFTER_HELPER_EXPOSURE',
    email: randomUUID() + '@example.invalid',
    password: randomUUID() + randomUUID(),
  };
  const legacy = randomUUID() + randomUUID();
  const p = pathsFor(privateRoot, policy);
  fs.writeFileSync(p.credential, JSON.stringify(credential));
  fs.writeFileSync(p.denylist, JSON.stringify({ schemaVersion: 1, sha256: [hash(legacy)] }));
  fs.writeFileSync(
    p.permit,
    JSON.stringify({
      schemaVersion: 1,
      approved: true,
      authorizationId: policy.authorizationId,
      environmentId: policy.environmentId,
      machineBinding: policy.machineBinding,
      scopeDigest: hash(JSON.stringify(policy.scope)),
      approvedAt: new Date(Date.now() - 1000).toISOString(),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    }),
  );
  const env = {
    GEMINI_API_KEY: randomUUID(),
    PLACEMENT_AI_ADVISORY_PROVIDER: 'NONE',
    PLACEMENT_AI_ADVISORY_STAGING_ENABLED: 'false',
    PLACEMENT_AI_ADVISORY_DAILY_BUDGET_CALLS: '0',
    PLACEMENT_AI_ADVISORY_LIVE_VERIFIED: 'false',
  };
  const config = {
    privateRoot,
    policy,
    snapshot: {
      identity: {
        db: policy.scope.database,
        oid: policy.scope.oid,
        marker: 'SMART_ENGLISH_DISPOSABLE_E2E_V1',
        directory: policy.scope.dataDirectory,
        host: '127.0.0.1',
        port: 55401,
        read_only: 'on',
      },
      owner: {
        id: policy.scope.learnerId,
        attemptId: policy.scope.attemptId,
        placementVersionId: policy.scope.placementVersionId,
        email: credential.email,
        role: 'STUDENT',
        status: 'ACTIVE',
      },
      nonSyntheticUsers: 0,
    },
    env,
    sensitiveCanaries: [credential.password, env.GEMINI_API_KEY, randomUUID(), randomUUID()],
    journal: path.join(privateRoot, 'journal.jsonl'),
  };
  const configFile = path.join(privateRoot, 'worker-private.json');
  return { privateRoot, policy, credential, legacy, p, config, configFile };
}
async function worker(f, mode = 'ok') {
  fs.writeFileSync(f.configFile, JSON.stringify(f.config));
  const output = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WORKER, f.configFile, mode], {
      cwd: ROOT,
      env: { NODE_ENV: 'test', NODE_OPTIONS: '' },
      windowsHide: true,
    });
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (b) => {
      stdout += b;
    });
    child.stderr.on('data', (b) => {
      stderr += b;
    });
    child.once('error', reject);
    child.once('close', (exit) => resolve({ stdout, stderr, exit }));
  });
  for (const secret of [
    f.credential.email,
    f.credential.password,
    f.legacy,
    ...f.config.sensitiveCanaries,
  ])
    assert.equal(
      (output.stdout + output.stderr).includes(secret),
      false,
      'secret must never appear in worker output',
    );
  if (output.exit === 77) return { crashed: true, exit: 77 };
  assert.equal(output.exit, 0);
  assert.equal(output.stderr, '');
  const parsed = JSON.parse(output.stdout);
  assert.deepEqual(parsed.safeSwitches, {
    provider: 'NONE',
    staging: 'false',
    budget: '0',
    liveVerified: 'false',
  });
  return parsed.result;
}
function journal(f) {
  return fs.existsSync(f.config.journal)
    ? fs
        .readFileSync(f.config.journal, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
}
function dispatchCount(f) {
  return journal(f).filter((r) => r.kind === 'fakeDispatch').length;
}
function proof(name, f, result) {
  proofs.push({
    name,
    result,
    fakeDispatchTotal: dispatchCount(f),
    consumedMarkerExists: fs.existsSync(f.p.consumed),
    unusedPermitExists: fs.existsSync(f.p.permit),
    spentPermitExists: fs.existsSync(f.p.spent),
    cleanup: journal(f)
      .map((r) => r.kind)
      .filter((k) => /Closed$/.test(k)),
    privateStateOutsideRepository: !f.privateRoot.startsWith(ROOT + path.sep),
    productionPermitUsed: false,
  });
}

test('no approval stops before reading private config or opening database', async () => {
  const env = {};
  const result = await runOneShot({
    approved: false,
    env,
    policy: {},
    runtime: new Proxy(
      {},
      {
        get() {
          throw Error('must not access runtime');
        },
      },
    ),
  });
  assert.equal(result.status, 'STOP_BEFORE_LIVE');
  assert.equal(result.providerDispatches, 0);
  assert.equal(result.permitConsumed, false);
  proofs.push({ name: 'no approval', result });
});
test('a newly approved model is bound to its permit; another model cannot dispatch', async () => {
  for (const wrongModel of [false, true]) {
    const f = fixture();
    f.policy.scope.model = 'gemini-3.5-flash-lite';
    f.policy.scope.timeoutMs = 30000;
    f.config.usePolicyTimeout = true;
    const permit = JSON.parse(fs.readFileSync(f.p.permit, 'utf8'));
    permit.scopeDigest = hash(JSON.stringify(f.policy.scope));
    fs.writeFileSync(f.p.permit, JSON.stringify(permit));
    if (wrongModel) f.config.requestModel = 'gemini-2.5-flash';
    const r = await worker(f);
    assert.equal(r.permitConsumed, true);
    assert.equal(dispatchCount(f), wrongModel ? 0 : 1);
    if (wrongModel) assert.equal(r.failureCode, 'PROVIDER_REQUEST_REJECTED');
    else assert.equal(r.status, 'CONNECTED_UNVERIFIED');
    proof(wrongModel ? 'unapproved model blocked' : 'approved migration model', f, r);
  }
});

test('missing fixture credential blocks before consuming a permit', async () => {
  const f = fixture();
  fs.renameSync(f.p.credential, f.p.credential + '.withheld');
  const r = await worker(f);
  assert.equal(r.failureCode, 'FIXTURE_CREDENTIAL_REQUIRED');
  assert.equal(dispatchCount(f), 0);
  assert.equal(fs.existsSync(f.p.consumed), false);
  proof('missing credential', f, r);
});
test('exposed legacy fixture credential is rejected without repeating its value', async () => {
  const f = fixture();
  f.credential.password = f.legacy;
  fs.writeFileSync(f.p.credential, JSON.stringify(f.credential));
  const r = await worker(f);
  assert.equal(r.failureCode, 'LEGACY_CREDENTIAL_REJECTED');
  assert.equal(dispatchCount(f), 0);
  proof('legacy credential blocked', f, r);
});
test('unrotated credential revision is rejected', async () => {
  const f = fixture();
  f.credential.credentialRevision = 'NOT_PROVISIONED';
  fs.writeFileSync(f.p.credential, JSON.stringify(f.credential));
  const r = await worker(f);
  assert.equal(r.failureCode, 'FIXTURE_CREDENTIAL_REJECTED');
  assert.equal(dispatchCount(f), 0);
  proof('rotation required', f, r);
});
test('missing independently issued approval file does not create or rearm one', async () => {
  const f = fixture();
  fs.renameSync(f.p.permit, f.p.permit + '.withheld');
  const r = await worker(f);
  assert.equal(r.failureCode, 'PERMIT_REQUIRED');
  assert.equal(fs.existsSync(f.p.permit), false);
  assert.equal(fs.existsSync(f.p.consumed), false);
  proof('permit missing', f, r);
});
test('different Windows machine binding is blocked', async () => {
  const f = fixture();
  f.config.machineBinding = hash(randomUUID());
  const r = await worker(f);
  assert.equal(r.failureCode, 'MACHINE_BINDING_REJECTED');
  assert.equal(dispatchCount(f), 0);
  proof('machine pin', f, r);
});
test('an expired or wrong-scope permit is rejected without consuming or dispatching', async () => {
  for (const change of [
    { expiresAt: new Date(Date.now() - 1000).toISOString() },
    { scopeDigest: hash(randomUUID()) },
    { approved: false },
  ]) {
    const f = fixture();
    const p = JSON.parse(fs.readFileSync(f.p.permit, 'utf8'));
    Object.assign(p, change);
    fs.writeFileSync(f.p.permit, JSON.stringify(p));
    const r = await worker(f);
    assert.equal(r.failureCode, 'PERMIT_REJECTED');
    assert.equal(dispatchCount(f), 0);
    assert.equal(fs.existsSync(f.p.consumed), false);
    proof('invalid permit', f, r);
  }
});
test('a pre-aborted run leaves the unused permission untouched', async () => {
  const f = fixture(),
    controller = new AbortController();
  controller.abort();
  const r = await runOneShot({
    approved: true,
    policy: f.policy,
    env: f.config.env,
    runtime: new Proxy(
      {},
      {
        get() {
          throw Error('must not initialize');
        },
      },
    ),
    signal: controller.signal,
  });
  assert.equal(r.failureCode, 'RUN_INTERRUPTED');
  assert.equal(r.permitConsumed, false);
  assert.equal(fs.existsSync(f.p.permit), true);
  proof('pre-aborted run', f, r);
});
for (const [label, patch] of [
  ['protected OID current', { oid: '953322' }],
  ['protected OID old', { oid: '20986' }],
  ['different OID', { oid: '700002' }],
  ['unknown OID', { oid: 'unknown' }],
  ['wrong marker', { marker: 'PRODUCTION' }],
  ['non-disposable name', { db: 'protected_qa' }],
  ['non-loopback', { host: '10.0.0.1' }],
  ['wrong data directory', { directory: 'C:/unknown' }],
  ['not read-only', { read_only: 'off' }],
])
  test('database guard blocks ' + label + ' with zero fake dispatch', async () => {
    const f = fixture();
    Object.assign(f.config.snapshot.identity, patch);
    const r = await worker(f);
    assert.equal(r.failureCode, 'DATABASE_REJECTED');
    assert.equal(dispatchCount(f), 0);
    assert.equal(fs.existsSync(f.p.consumed), false);
    assert.ok(journal(f).some((x) => x.kind === 'poolClosed'));
    proof(label, f, r);
  });
test('credential must belong to the exact synthetic attempt owner', async () => {
  const f = fixture();
  f.config.snapshot.owner.id = randomUUID();
  const r = await worker(f);
  assert.equal(r.failureCode, 'SYNTHETIC_OWNER_REJECTED');
  assert.equal(dispatchCount(f), 0);
  proof('owner mismatch', f, r);
});
test('first permitted offline process dispatches once and closes server/pool', async () => {
  const f = fixture(),
    r = await worker(f);
  assert.equal(r.status, 'CONNECTED_UNVERIFIED');
  assert.equal(r.permitConsumed, true);
  assert.equal(dispatchCount(f), 1);
  assert.equal(r.cleanupComplete, true);
  assert.equal(fs.existsSync(f.p.permit), false);
  assert.equal(fs.existsSync(f.p.spent), true);
  assert.ok(journal(f).some((x) => x.kind === 'backendStartedAfterConsumed'));
  assert.ok(journal(f).some((x) => x.kind === 'serverClosed'));
  assert.ok(journal(f).some((x) => x.kind === 'poolClosed'));
  assert.deepEqual(r.usage, { promptTokenCount: 2, candidatesTokenCount: 3, totalTokenCount: 5 });
  proof('first process', f, r);
});
test('process restart cannot reuse the consumed authorization', async () => {
  const f = fixture();
  await worker(f);
  const r = await worker(f);
  assert.equal(r.failureCode, 'PERMIT_ALREADY_CONSUMED');
  assert.equal(r.providerDispatches, 0);
  assert.equal(dispatchCount(f), 1);
  proof('restart replay', f, r);
});
test('two real child processes compete on the same outside-repo permit: total one dispatch', async () => {
  const f = fixture();
  f.config.barrier = true;
  const rs = await Promise.all([worker(f), worker(f)]);
  assert.equal(dispatchCount(f), 1);
  assert.equal(rs.filter((r) => r.permitConsumed).length, 1);
  assert.equal(
    rs.reduce((n, r) => n + r.providerDispatches, 0),
    1,
  );
  assert.equal(fs.readdirSync(f.privateRoot).filter((n) => n.startsWith('barrier.')).length, 2);
  proof('concurrent processes', f, rs);
});
for (const mode of ['timeout', 'transportError', 'diagnosticError', 'startupError'])
  test(mode + ' consumes authorization permanently and never retries', async () => {
    const f = fixture(),
      first = await worker(f, mode),
      replay = await worker(f);
    assert.equal(first.status, 'FAILED_NO_RETRY');
    assert.equal(first.permitConsumed, true);
    assert.equal(replay.failureCode, 'PERMIT_ALREADY_CONSUMED');
    assert.equal(replay.providerDispatches, 0);
    assert.equal(dispatchCount(f), mode === 'startupError' ? 0 : 1);
    assert.equal(first.cleanupComplete, true);
    assert.ok(journal(f).some((x) => x.kind === 'serverClosed'));
    assert.ok(journal(f).some((x) => x.kind === 'poolClosed'));
    proof(mode, f, { first, replay });
  });
test('a second request in the same process is blocked without another fake dispatch', async () => {
  const f = fixture(),
    r = await worker(f, 'double');
  assert.equal(r.failureCode, 'SECOND_PROVIDER_REQUEST_BLOCKED');
  assert.equal(dispatchCount(f), 1);
  proof('second dispatch denied', f, r);
});
test('raw private content cannot be sent as the provider prompt', async () => {
  const f = fixture(),
    r = await worker(f, 'privatePrompt');
  assert.equal(r.failureCode, 'PAYLOAD_PRIVACY_BLOCKED');
  assert.equal(dispatchCount(f), 0);
  assert.equal(r.permitConsumed, true);
  proof('prompt privacy', f, r);
});
test('abrupt process exit after durable claim prevents any dispatch after restart', async () => {
  const f = fixture(),
    first = await worker(f, 'crash'),
    replay = await worker(f);
  assert.equal(first.exit, 77);
  assert.equal(replay.failureCode, 'PERMIT_ALREADY_CONSUMED');
  assert.equal(dispatchCount(f), 0);
  proof('crash after claim', f, { first, replay });
});
test('partial/empty consumed marker fails closed after a crash', async () => {
  const f = fixture();
  fs.writeFileSync(f.p.consumed, '', { flag: 'wx' });
  const r = await worker(f);
  assert.equal(r.failureCode, 'PERMIT_ALREADY_CONSUMED');
  assert.equal(dispatchCount(f), 0);
  proof('partial marker', f, r);
});
test('spent approval history still blocks reuse if the primary marker is missing', async () => {
  const f = fixture();
  await worker(f);
  fs.renameSync(f.p.consumed, f.p.consumed + '.withheld');
  const r = await worker(f);
  assert.equal(r.failureCode, 'PERMIT_ALREADY_CONSUMED');
  assert.equal(dispatchCount(f), 1);
  proof('spent history retained', f, r);
});
test('changing CLI arguments cannot select a new state path or rearm identity', async () => {
  for (const arg of ['--reset', '--rearm', '--state-dir=elsewhere']) {
    const r = await new Promise((resolve, reject) => {
      const c = spawn(
        process.execPath,
        [
          path.join(ROOT, 'docs/v2/br136-local-key-configuration/LIVE_SMOKE_AFTER_APPROVAL.cjs'),
          arg,
        ],
        { cwd: ROOT, env: { NODE_ENV: 'test', NODE_OPTIONS: '' }, windowsHide: true },
      );
      let text = '';
      c.stdout.on('data', (b) => {
        text += b;
      });
      c.once('error', reject);
      c.once('close', (exit) => resolve({ exit, text }));
    });
    assert.equal(r.exit, 0);
    assert.equal(JSON.parse(r.text).status, 'STOP_BEFORE_LIVE');
    assert.equal(JSON.parse(r.text).providerDispatches, 0);
  }
  proofs.push({ name: 'no rearm CLI', status: 'PASS', providerDispatches: 0 });
});
for (const variant of ['valid', 'wrongOid', 'wrongMarker'])
  test('production runtime SQL precheck uses fake pg only: ' + variant, async () => {
    const Module = require('node:module');
    const originalLoad = Module._load;
    const { POLICY, createRuntime } = require('./lib/gemini-live-runtime.cjs');
    let ownerQueries = 0,
      closed = 0;
    const closers = [];
    class FakeClient {
      async connect() {}
      async end() {
        closed++;
      }
      async query(sql) {
        if (sql.includes('current_database()'))
          return {
            rows: [
              {
                db: POLICY.scope.database,
                oid: variant === 'wrongOid' ? '700002' : POLICY.scope.oid,
                marker: variant === 'wrongMarker' ? 'INVALID' : 'SMART_ENGLISH_DISPOSABLE_E2E_V1',
                host: '127.0.0.1',
                port: 55401,
                directory: POLICY.scope.dataDirectory,
                read_only: 'on',
              },
            ],
          };
        if (sql.includes('JOIN users')) {
          ownerQueries++;
          return { rows: [{}] };
        }
        if (sql.includes('count(*)')) return { rows: [{ n: 0 }] };
        return { rows: [] };
      }
    }
    Module._load = function (name, ...args) {
      return name === 'pg' ? { Client: FakeClient } : originalLoad.call(this, name, ...args);
    };
    try {
      const call = () =>
        createRuntime({}).verifyDatabase({
          policy: POLICY,
          registerCleanup: (f) => closers.push(f),
        });
      if (variant === 'valid') {
        await call();
        assert.equal(ownerQueries, 1);
      } else {
        await assert.rejects(call);
        assert.equal(ownerQueries, 0);
      }
    } finally {
      Module._load = originalLoad;
      for (const close of closers) await close();
    }
    assert.equal(closed, 1);
    proofs.push({
      name: 'production runtime guard ' + variant,
      fakePgOnly: true,
      ownerQueries,
      poolClosed: closed,
      providerDispatches: 0,
    });
  });
after(() => {
  const folder = path.join(ROOT, 'docs/v2/br136-live-helper-hardening');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(
    path.join(folder, 'OFFLINE_SCENARIOS.json'),
    JSON.stringify(
      {
        mode: 'FAKE_TRANSPORT_ONLY',
        productionPermissionCreated: false,
        productionPermissionConsumed: false,
        realGeminiRequests: 0,
        proofs,
      },
      null,
      2,
    ),
  );
});
