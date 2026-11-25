'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const PUBLIC_CODES = new Set([
  'PRIVATE_CONFIGURATION_REQUIRED',
  'PRIVATE_PATH_REJECTED',
  'MACHINE_BINDING_REJECTED',
  'FIXTURE_CREDENTIAL_REQUIRED',
  'FIXTURE_CREDENTIAL_REJECTED',
  'LEGACY_CREDENTIAL_REJECTED',
  'PERMIT_REQUIRED',
  'PERMIT_REJECTED',
  'PERMIT_ALREADY_CONSUMED',
  'PERMIT_IO_FAILED',
  'DATABASE_REJECTED',
  'SYNTHETIC_OWNER_REJECTED',
  'UNSAFE_INITIAL_CONFIGURATION',
  'API_KEY_REQUIRED',
  'PROVIDER_NOT_ARMED',
  'SECOND_PROVIDER_REQUEST_BLOCKED',
  'PROVIDER_REQUEST_REJECTED',
  'PAYLOAD_PRIVACY_BLOCKED',
  'PROVIDER_TIMEOUT',
  'PROVIDER_TRANSPORT_FAILED',
  'ONE_DISPATCH_NOT_OBSERVED',
  'RUN_INTERRUPTED',
]);
function fail(code) {
  const e = new Error(code);
  e.publicCode = code;
  throw e;
}
function safeOff(env) {
  Object.assign(env, {
    PLACEMENT_AI_ADVISORY_PROVIDER: 'NONE',
    PLACEMENT_AI_ADVISORY_STAGING_ENABLED: 'false',
    PLACEMENT_AI_ADVISORY_DAILY_BUDGET_CALLS: '0',
    PLACEMENT_AI_ADVISORY_LIVE_VERIFIED: 'false',
  });
}
function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}
function readJson(file, code) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384) fail(code);
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    fail(code);
  }
}
function normalized(p) {
  return path.resolve(p).toLowerCase();
}
function validatePrivateDirectory(privateRoot, repositoryRoot) {
  try {
    const root = normalized(privateRoot),
      repo = normalized(repositoryRoot);
    const stat = fs.lstatSync(privateRoot);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      root === repo ||
      root.startsWith(repo + path.sep) ||
      normalized(fs.realpathSync(privateRoot)) !== root
    )
      fail('PRIVATE_PATH_REJECTED');
  } catch {
    fail('PRIVATE_PATH_REJECTED');
  }
}
function pathsFor(privateRoot, policy) {
  if (!/^[A-Z0-9_-]{1,90}$/.test(policy.authorizationId)) fail('PERMIT_REJECTED');
  return {
    credential: path.join(privateRoot, 'fixture-credentials.json'),
    denylist: path.join(privateRoot, 'legacy-credential-denylist.json'),
    permit: path.join(privateRoot, policy.authorizationId + '.permit.json'),
    consumed: path.join(privateRoot, policy.authorizationId + '.consumed.json'),
    spent: path.join(privateRoot, policy.authorizationId + '.spent-permit.json'),
  };
}
function checkNotConsumed(paths) {
  if (fs.existsSync(paths.consumed) || fs.existsSync(paths.spent)) fail('PERMIT_ALREADY_CONSUMED');
}
function readCredential(paths, policy) {
  const c = readJson(paths.credential, 'FIXTURE_CREDENTIAL_REQUIRED');
  const denied = readJson(paths.denylist, 'FIXTURE_CREDENTIAL_REJECTED');
  if (
    c.schemaVersion !== 1 ||
    c.environmentId !== policy.environmentId ||
    c.credentialRevision !== 'ROTATED_AFTER_HELPER_EXPOSURE' ||
    typeof c.email !== 'string' ||
    !/^[^\s@]+@example\.invalid$/.test(c.email) ||
    typeof c.password !== 'string' ||
    !c.password.trim() ||
    c.password.length > 512 ||
    /[\r\n\0]/.test(c.password) ||
    denied.schemaVersion !== 1 ||
    !Array.isArray(denied.sha256) ||
    !denied.sha256.length ||
    !denied.sha256.every((v) => /^[a-f0-9]{64}$/.test(v))
  )
    fail('FIXTURE_CREDENTIAL_REJECTED');
  if (denied.sha256.includes(hash(c.password))) fail('LEGACY_CREDENTIAL_REJECTED');
  return c;
}
function readPermit(paths, policy, machineBinding, now = Date.now()) {
  checkNotConsumed(paths);
  const p = readJson(paths.permit, 'PERMIT_REQUIRED');
  const issued = Date.parse(p.approvedAt),
    expires = Date.parse(p.expiresAt);
  if (
    p.schemaVersion !== 1 ||
    p.approved !== true ||
    p.authorizationId !== policy.authorizationId ||
    p.environmentId !== policy.environmentId ||
    p.machineBinding !== machineBinding ||
    p.scopeDigest !== hash(JSON.stringify(policy.scope)) ||
    !Number.isFinite(issued) ||
    !Number.isFinite(expires) ||
    issued > now ||
    expires <= now ||
    expires - issued > 86400000
  )
    fail('PERMIT_REJECTED');
  return p;
}
function validateDatabase(snapshot, policy, credential) {
  const i = snapshot?.identity,
    s = policy.scope;
  if (
    !i ||
    !/^[1-9][0-9]*$/.test(String(i.oid)) ||
    ['953322', '20986'].includes(String(i.oid)) ||
    String(i.oid) !== s.oid ||
    i.db !== s.database ||
    !/^v2_wave01_dev_test_w04b_wave05_br136_[a-z0-9_]+$/.test(i.db) ||
    i.marker !== 'SMART_ENGLISH_DISPOSABLE_E2E_V1' ||
    i.host !== '127.0.0.1' ||
    Number(i.port) !== 55401 ||
    normalized(i.directory) !== normalized(s.dataDirectory) ||
    i.read_only !== 'on'
  )
    fail('DATABASE_REJECTED');
  const o = snapshot.owner;
  if (
    !o ||
    o.id !== s.learnerId ||
    o.attemptId !== s.attemptId ||
    o.placementVersionId !== s.placementVersionId ||
    o.email !== credential.email ||
    o.role !== 'STUDENT' ||
    o.status !== 'ACTIVE' ||
    snapshot.nonSyntheticUsers !== 0
  )
    fail('SYNTHETIC_OWNER_REJECTED');
}
function consumePermit(paths, policy, machineBinding) {
  const permit = readPermit(paths, policy, machineBinding);
  let fd,
    acquired = false;
  const lease = {
    schemaVersion: 1,
    authorizationId: policy.authorizationId,
    environmentId: policy.environmentId,
    machineBinding,
    scopeDigest: hash(JSON.stringify(policy.scope)),
    state: 'CONSUMED_NO_RETRY',
    claimId: randomUUID(),
    pid: process.pid,
    consumedAt: new Date().toISOString(),
    expiresAt: permit.expiresAt,
  };
  try {
    // O_EXCL is the cross-process arbitration point. An empty/partial file also blocks replay.
    fd = fs.openSync(paths.consumed, 'wx', 0o600);
    acquired = true;
    fs.writeFileSync(fd, JSON.stringify(lease));
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    // Preserve approval history; remove the unused permit name, never recreate it.
    fs.renameSync(paths.permit, paths.spent);
    return lease;
  } catch (e) {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
    if (acquired) {
      const blocked = new Error('PERMIT_IO_FAILED');
      blocked.publicCode = 'PERMIT_IO_FAILED';
      blocked.consumedByThisProcess = true;
      throw blocked;
    }
    if (e.code === 'EEXIST' || fs.existsSync(paths.consumed) || fs.existsSync(paths.spent))
      fail('PERMIT_ALREADY_CONSUMED');
    fail('PERMIT_IO_FAILED');
  }
}
function verifyLease(paths, lease) {
  const persisted = readJson(paths.consumed, 'PERMIT_REJECTED');
  if (
    persisted.claimId !== lease.claimId ||
    persisted.state !== 'CONSUMED_NO_RETRY' ||
    !fs.existsSync(paths.spent) ||
    fs.existsSync(paths.permit) ||
    Date.parse(lease.expiresAt) <= Date.now()
  )
    fail('PERMIT_REJECTED');
}
function safeUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  return Object.fromEntries(
    ['promptTokenCount', 'candidatesTokenCount', 'totalTokenCount']
      .filter((k) => Number.isSafeInteger(usage[k]) && usage[k] >= 0)
      .map((k) => [k, usage[k]]),
  );
}
function safeDiagnostic(value) {
  const statuses = ['NOT_CONFIGURED', 'SAFE_FALLBACK', 'CONNECTED_UNVERIFIED'];
  const reasons = [
    'INVALID_AI_OUTPUT_SCHEMA',
    'AI_PROVIDER_TIMEOUT',
    'SCORE_OR_ELIGIBILITY_MUTATION_BLOCKED',
    'UNVERIFIED_EXTERNAL_URL_BLOCKED',
    'AI_PROVIDER_ERROR',
    'DAILY_BUDGET_EXCEEDED',
    'PROVIDER_RATE_LIMITED_429',
    'NO_EXTERNAL_AI_KEY_CONFIGURED',
  ];
  return {
    diagnosticHttpStatus: Number.isInteger(value?.httpStatus) ? value.httpStatus : null,
    providerStatus: statuses.includes(value?.providerStatus) ? value.providerStatus : null,
    fallbackUsed: typeof value?.fallbackUsed === 'boolean' ? value.fallbackUsed : null,
    fallbackReason:
      value?.fallbackReason == null
        ? null
        : reasons.includes(value.fallbackReason)
          ? value.fallbackReason
          : 'REDACTED_UNRECOGNIZED_REASON',
    reservedCalls: Number.isSafeInteger(value?.reservedCalls) ? value.reservedCalls : null,
  };
}
async function runOneShot({
  approved,
  policy,
  runtime,
  env = process.env,
  timeoutMs = policy.scope?.timeoutMs ?? 4500,
  signal,
}) {
  const result = {
    status: 'STOP_BEFORE_LIVE',
    providerDispatches: 0,
    permitConsumed: false,
    providerHttpStatus: null,
    liveVerified: false,
    usage: null,
    cleanupComplete: true,
    cleanupFailures: 0,
  };
  const cleanup = [];
  const controller = new AbortController();
  const registerCleanup = (f) => cleanup.push(f);
  let armed = false,
    lease,
    paths,
    credential;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    if (!approved) return result;
    if (controller.signal.aborted) fail('RUN_INTERRUPTED');
    const { inspectOfflineConfiguration } = require('../gemini-offline-preflight.cjs');
    if (inspectOfflineConfiguration(env).status !== 'PASS_OFFLINE_CONFIGURATION')
      fail('UNSAFE_INITIAL_CONFIGURATION');
    if (!env.GEMINI_API_KEY?.trim()) fail('API_KEY_REQUIRED');
    const local = await runtime.resolvePrivateIdentity();
    if (local.machineBinding !== policy.machineBinding) fail('MACHINE_BINDING_REJECTED');
    validatePrivateDirectory(local.privateRoot, policy.repositoryRoot);
    paths = pathsFor(local.privateRoot, policy);
    checkNotConsumed(paths);
    credential = readCredential(paths, policy);
    readPermit(paths, policy, local.machineBinding);
    const snapshot = await runtime.verifyDatabase({ policy, credential, registerCleanup });
    validateDatabase(snapshot, policy, credential);
    if (controller.signal.aborted) fail('RUN_INTERRUPTED');
    lease = consumePermit(paths, policy, local.machineBinding);
    result.permitConsumed = true;
    const dispatch = async (input, options = {}) => {
      if (!armed) fail('PROVIDER_NOT_ARMED');
      verifyLease(paths, lease);
      if (result.providerDispatches !== 0) fail('SECOND_PROVIDER_REQUEST_BLOCKED');
      const url = typeof input === 'string' ? input : input?.url;
      if (
        url !==
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(policy.scope.model)}:generateContent` ||
        options.method !== 'POST'
      )
        fail('PROVIDER_REQUEST_REJECTED');
      const body = String(options.body || '');
      if (
        [credential.email, credential.password, env.GEMINI_API_KEY, policy.scope.attemptId].some(
          (v) => v && body.includes(v),
        ) ||
        /textResponse|selectedOptionIds|audioStorageKey|password|cookie/.test(body)
      )
        fail('PAYLOAD_PRIVACY_BLOCKED');
      result.providerDispatches++;
      const deadline = new AbortController();
      let timer;
      try {
        const response = await Promise.race([
          Promise.resolve().then(() =>
            runtime.remoteFetch(input, {
              ...options,
              signal: AbortSignal.any(
                [controller.signal, deadline.signal, options.signal].filter(Boolean),
              ),
            }),
          ),
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              deadline.abort();
              const e = new Error('PROVIDER_TIMEOUT');
              e.publicCode = 'PROVIDER_TIMEOUT';
              reject(e);
            }, timeoutMs);
          }),
        ]);
        result.providerHttpStatus = Number.isInteger(response.status) ? response.status : null;
        try {
          result.usage = safeUsage((await response.clone().json()).usageMetadata);
        } catch {}
        return response;
      } catch (e) {
        if (e.publicCode === 'PROVIDER_TIMEOUT') throw e;
        fail('PROVIDER_TRANSPORT_FAILED');
      } finally {
        clearTimeout(timer);
      }
    };
    const backend = await runtime.startBackend({
      policy,
      credential,
      registerCleanup,
      dispatch,
      signal: controller.signal,
    });
    if (controller.signal.aborted) fail('RUN_INTERRUPTED');
    armed = true;
    Object.assign(env, {
      GEMINI_ADVISORY_MODEL: policy.scope.model,
      PLACEMENT_AI_ADVISORY_TIMEOUT_MS: String(timeoutMs),
      PLACEMENT_AI_ADVISORY_PROVIDER: 'GEMINI',
      PLACEMENT_AI_ADVISORY_STAGING_ENABLED: 'true',
      PLACEMENT_AI_ADVISORY_DAILY_BUDGET_CALLS: '1',
      PLACEMENT_AI_ADVISORY_LIVE_VERIFIED: 'false',
    });
    const diagnostic = await runtime.executeDiagnostic({
      backend,
      policy,
      signal: controller.signal,
    });
    Object.assign(result, safeDiagnostic(diagnostic));
    if (result.providerDispatches !== 1 || result.reservedCalls !== 1)
      fail('ONE_DISPATCH_NOT_OBSERVED');
    result.status =
      result.providerStatus === 'CONNECTED_UNVERIFIED'
        ? 'CONNECTED_UNVERIFIED'
        : 'SAFE_FALLBACK_NO_RETRY';
  } catch (e) {
    if (e.consumedByThisProcess) result.permitConsumed = true;
    result.status = result.permitConsumed ? 'FAILED_NO_RETRY' : 'BLOCKED';
    result.failureCode = PUBLIC_CODES.has(e.publicCode) ? e.publicCode : 'REDACTED_FAILURE';
  } finally {
    armed = false;
    safeOff(env);
    controller.abort();
    signal?.removeEventListener('abort', abort);
    for (const close of cleanup.reverse()) {
      let timer;
      try {
        await Promise.race([
          Promise.resolve().then(close),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('CLEANUP_TIMEOUT')), 10000);
          }),
        ]);
      } catch {
        result.cleanupFailures++;
        result.cleanupComplete = false;
      } finally {
        clearTimeout(timer);
      }
    }
    result.providerOffAfterRun = env.PLACEMENT_AI_ADVISORY_PROVIDER === 'NONE';
    result.stagingOffAfterRun = env.PLACEMENT_AI_ADVISORY_STAGING_ENABLED === 'false';
    result.budgetZeroAfterRun = env.PLACEMENT_AI_ADVISORY_DAILY_BUDGET_CALLS === '0';
  }
  return result;
}
module.exports = { runOneShot, validateDatabase, pathsFor, hash };
