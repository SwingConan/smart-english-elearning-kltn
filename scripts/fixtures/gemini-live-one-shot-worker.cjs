'use strict';
// Offline subprocess fixture only. It never imports the production runtime or pg/Nest.
const fs = require('node:fs');
const path = require('node:path');
const { runOneShot, pathsFor } = require('../lib/gemini-live-one-shot.cjs');
globalThis.fetch = async () => {
  throw Error('ALL_NATIVE_FETCH_BLOCKED_IN_OFFLINE_WORKER');
};
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const mode = process.argv[3] || 'ok';
const append = (kind) =>
  fs.appendFileSync(config.journal, JSON.stringify({ kind, pid: process.pid }) + '\n');
const runtime = {
  async resolvePrivateIdentity() {
    return {
      privateRoot: config.privateRoot,
      machineBinding: config.machineBinding || config.policy.machineBinding,
    };
  },
  async verifyDatabase({ registerCleanup }) {
    registerCleanup(async () => append('poolClosed'));
    if (config.barrier) {
      fs.writeFileSync(path.join(config.privateRoot, 'barrier.' + process.pid), 'ready', {
        flag: 'wx',
      });
      const start = Date.now();
      while (
        fs.readdirSync(config.privateRoot).filter((n) => n.startsWith('barrier.')).length < 2
      ) {
        if (Date.now() - start > 5000) throw Error('BARRIER_TIMEOUT');
        await new Promise((r) => setTimeout(r, 5));
      }
    }
    return config.snapshot;
  },
  async startBackend({ registerCleanup, dispatch, credential }) {
    const files = pathsFor(config.privateRoot, config.policy);
    const state = JSON.parse(fs.readFileSync(files.consumed, 'utf8'));
    if (state.state !== 'CONSUMED_NO_RETRY' || fs.existsSync(files.permit))
      throw Error('NOT_CONSUMED_BEFORE_SERVER');
    append('backendStartedAfterConsumed');
    if (mode === 'crash') process.exit(77); // Abrupt termination: no finally or normal cleanup.
    registerCleanup(async () => append('serverClosed'));
    if (mode === 'startupError') throw Error(credential.password + config.env.GEMINI_API_KEY);
    return { dispatch };
  },
  async remoteFetch() {
    append('fakeDispatch');
    if (mode === 'timeout') return new Promise(() => {});
    if (mode === 'transportError') throw Error(config.sensitiveCanaries.join('|'));
    return {
      status: 200,
      clone: () => ({
        json: async () => ({
          usageMetadata: {
            promptTokenCount: 2,
            candidatesTokenCount: 3,
            totalTokenCount: 5,
            secret: config.sensitiveCanaries[0],
          },
          rawResponse: config.sensitiveCanaries[1],
        }),
      }),
    };
  },
  async executeDiagnostic({ backend }) {
    const expectedTimeout = config.usePolicyTimeout
      ? config.policy.scope.timeoutMs
      : (config.timeoutMs ?? 25);
    if (config.env.PLACEMENT_AI_ADVISORY_TIMEOUT_MS !== String(expectedTimeout))
      throw Error('PROVIDER_AND_HELPER_TIMEOUT_MUST_MATCH');
    const request = () =>
      backend.dispatch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.requestModel || config.policy.scope.model)}:generateContent`,
        {
          method: 'POST',
          body:
            mode === 'privatePrompt'
              ? config.sensitiveCanaries[0]
              : '{"contents":[],"generationConfig":{}}',
        },
      );
    await request();
    if (mode === 'double') await request();
    if (mode === 'diagnosticError') throw Error(config.sensitiveCanaries.join('|'));
    return {
      httpStatus: 200,
      providerStatus: 'CONNECTED_UNVERIFIED',
      fallbackUsed: false,
      fallbackReason: null,
      reservedCalls: 1,
      cookie: config.sensitiveCanaries[2],
      rawPrompt: config.sensitiveCanaries[3],
    };
  },
};
runOneShot({
  approved: config.approved !== false,
  policy: config.policy,
  runtime,
  env: config.env,
  timeoutMs: config.usePolicyTimeout ? undefined : (config.timeoutMs ?? 25),
})
  .then((result) =>
    console.log(
      JSON.stringify({
        result,
        safeSwitches: {
          provider: config.env.PLACEMENT_AI_ADVISORY_PROVIDER,
          staging: config.env.PLACEMENT_AI_ADVISORY_STAGING_ENABLED,
          budget: config.env.PLACEMENT_AI_ADVISORY_DAILY_BUDGET_CALLS,
          liveVerified: config.env.PLACEMENT_AI_ADVISORY_LIVE_VERIFIED,
        },
      }),
    ),
  )
  .catch(() => {
    console.error('OFFLINE_WORKER_FAILED_REDACTED');
    process.exitCode = 1;
  });
