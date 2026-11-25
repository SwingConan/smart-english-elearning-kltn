'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const POLICY = Object.freeze({
  authorizationId: 'BR136_GEMINI_LIVE_20261111_03',
  environmentId: 'BR136_WINDOWS_LOCAL_1308549',
  machineBinding: 'bf7d89b2fe7b6ac161c09b9222dcc1ce463346cf6ef18a93d64e82f5217d39b8',
  repositoryRoot: ROOT,
  scope: Object.freeze({
    database: 'v2_wave01_dev_test_w04b_wave05_br136_mwbr6h8o_0bcbcd',
    oid: '1308549',
    dataDirectory: path.join(ROOT, '.local-storage/v2-wave01/postgres'),
    attemptId: '4aef2763-0edd-4bd7-984d-c8d3057300d3',
    learnerId: '5c0adc3b-c075-4f03-8832-563140c983e9',
    placementVersionId: '27107a91-0a38-4e7b-b6da-d659f68a7138',
    model: 'gemini-3.5-flash-lite',
    timeoutMs: 30000,
  }),
});
function windowsPrivateIdentity() {
  if (process.platform !== 'win32') throw Error('WINDOWS_REQUIRED');
  const script = String.raw`$ErrorActionPreference='Stop'; $i=[Security.Principal.WindowsIdentity]::GetCurrent(); $k=[Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SOFTWARE\Microsoft\Cryptography'); $g=[string]$k.GetValue('MachineGuid'); $k.Close(); $s=[Security.Cryptography.SHA256]::Create(); $h=-join ($s.ComputeHash([Text.Encoding]::UTF8.GetBytes($g+'|'+$i.User.Value))|ForEach-Object {$_.ToString('x2')}); $s.Dispose(); @{machineBinding=$h;privateRoot=(Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'SmartEnglish\BR136\GeminiLiveOneShot')}|ConvertTo-Json -Compress`;
  return JSON.parse(
    execFileSync(
      'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { encoding: 'utf8', windowsHide: true, timeout: 10000 },
    ),
  );
}
function createRuntime(env = process.env) {
  const nativeFetch = globalThis.fetch;
  return {
    resolvePrivateIdentity: async () => windowsPrivateIdentity(),
    async verifyDatabase({ policy, registerCleanup }) {
      const { Client } = require('pg');
      const client = new Client({
        connectionString: 'postgresql://wave01@127.0.0.1:55401/' + policy.scope.database,
        connectionTimeoutMillis: 3000,
      });
      registerCleanup(() => client.end());
      await client.connect();
      await client.query('BEGIN READ ONLY');
      const identity = (
        await client.query(
          "SELECT current_database() AS db,oid::text AS oid,shobj_description(oid,'pg_database') AS marker,current_setting('data_directory') AS directory,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('transaction_read_only') AS read_only FROM pg_database WHERE datname=current_database()",
        )
      ).rows[0];
      require('../run-br136-http.cjs').assertIdentity(identity, policy.scope.database);
      if (String(identity.oid) !== policy.scope.oid || identity.read_only !== 'on') {
        const error = new Error('DATABASE_REJECTED');
        error.publicCode = 'DATABASE_REJECTED';
        throw error;
      }
      const owner = (
        await client.query(
          'SELECT u.id,u.email,u.role,u.status,t.id AS "attemptId",t."placementVersionId" FROM test_attempts t JOIN users u ON u.id=t."learnerId" WHERE t.id=$1 AND t."learnerId"=$2',
          [policy.scope.attemptId, policy.scope.learnerId],
        )
      ).rows[0];
      const nonSyntheticUsers = (
        await client.query(
          "SELECT count(*)::int AS n FROM users WHERE email NOT LIKE '%@example.invalid'",
        )
      ).rows[0].n;
      await client.query('ROLLBACK');
      return { identity, owner, nonSyntheticUsers };
    },
    remoteFetch: (input, options) => nativeFetch(input, options),
    async startBackend({ policy, credential, registerCleanup, dispatch, signal }) {
      if (fs.realpathSync(process.cwd()) !== fs.realpathSync(ROOT))
        throw Error('ROOT_CWD_REQUIRED');
      const url = 'postgresql://wave01@127.0.0.1:55401/' + policy.scope.database;
      Object.assign(env, {
        DATABASE_URL: url,
        E2E_DATABASE_URL: url,
        WAVE01_PG_URL: url,
        BATCH04_PG_URL: url,
        NODE_ENV: 'development',
        W04B_ENABLED: 'DEV_WORKFLOW',
        ASSESSMENT_STIMULUS_AUTHORED_ROOT: path.join(ROOT, '.local-storage/v2-wave01/dev-media'),
        ASSESSMENT_RESPONSE_STORAGE_ROOT: path.join(ROOT, '.local-storage/v2-wave01/dev-responses'),
      });
      for (const n of ['W06_ENABLED', 'W07_ENABLED', 'W08_ENABLED', 'W09_ENABLED']) env[n] = '';
      for (const n of ['W06_RUN_INTENT', 'W07_RUN_INTENT', 'W07_CF_RUN_INTENT']) delete env[n];
      const backend = { origin: null, cookies: null };
      globalThis.fetch = (input, options = {}) => {
        const target = new URL(typeof input === 'string' ? input : input.url);
        if (target.origin === 'https://generativelanguage.googleapis.com')
          return dispatch(input, options);
        if (target.origin !== backend.origin) throw Error('UNAPPROVED_FETCH_DESTINATION');
        return nativeFetch(input, {
          ...options,
          signal: AbortSignal.any([
            AbortSignal.timeout(Math.max(15000, (policy.scope.timeoutMs ?? 4500) + 5000)),
            signal,
          ]),
        });
      };
      registerCleanup(() => {
        globalThis.fetch = nativeFetch;
        backend.cookies = null;
      });
      require('ts-node').register({
        transpileOnly: true,
        project: path.join(ROOT, 'apps/api/tsconfig.json'),
      });
      const { NestFactory } = require('@nestjs/core'),
        { ConfigService } = require('@nestjs/config');
      const { AppModule } = require(path.join(ROOT, 'apps/api/src/app.module.ts'));
      const { configureHttpApplication } = require(path.join(ROOT, 'apps/api/src/app.setup.ts'));
      const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
      registerCleanup(() => app.close());
      configureHttpApplication(app, app.get(ConfigService));
      await app.listen(0, '127.0.0.1');
      backend.origin = 'http://127.0.0.1:' + app.getHttpServer().address().port;
      const login = await fetch(backend.origin + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: credential.email, password: credential.password }),
      });
      if (login.status !== 200) throw Error('FIXTURE_LOGIN_FAILED');
      backend.cookies = login.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .join('; ');
      if (!backend.cookies) throw Error('FIXTURE_COOKIE_REQUIRED');
      return backend;
    },
    async executeDiagnostic({ backend, policy }) {
      const response = await fetch(
        backend.origin +
          '/api/v2/placement/workflow/attempts/' +
          policy.scope.attemptId +
          '/advisory',
        { method: 'POST', headers: { Cookie: backend.cookies, 'Content-Type': 'application/json' }, body: '{}' },
      );
      const data = await response.json();
      const { GeminiAdvisoryAdapter } = require(
        path.join(ROOT, 'apps/api/src/modules/placement/gemini-advisory-provider.ts'),
      );
      return {
        httpStatus: response.status,
        providerStatus: data.aiAdvisory?.providerStatus,
        fallbackUsed: data.aiAdvisory?.fallbackUsed,
        fallbackReason: data.aiAdvisory?.fallbackReason,
        reservedCalls: GeminiAdvisoryAdapter.getSharedCallsToday(),
      };
    },
  };
}
async function main(argv = process.argv.slice(2)) {
  const { runOneShot } = require('./gemini-live-one-shot.cjs');
  const approved = argv.length === 1 && argv[0] === '--approved-one-synthetic-live';
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  let result;
  try {
    result = await runOneShot({
      approved,
      policy: POLICY,
      runtime: approved ? createRuntime() : null,
      signal: controller.signal,
    });
  } catch {
    result = {
      status: 'BLOCKED',
      failureCode: 'REDACTED_FAILURE',
      providerDispatches: 0,
      liveVerified: false,
    };
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = [
    'STOP_BEFORE_LIVE',
    'CONNECTED_UNVERIFIED',
    'SAFE_FALLBACK_NO_RETRY',
  ].includes(result.status)
    ? 0
    : 1;
  return result;
}
module.exports = { POLICY, createRuntime, windowsPrivateIdentity, main };
