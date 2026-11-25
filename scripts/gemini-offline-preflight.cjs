'use strict';

// No file/network/database imports, no Nest bootstrap, and no access to any secret.
// PO may privately use Node --env-file=apps/api/.env; Codex must not run that command.
const SAFE_SWITCHES = Object.freeze({
  PLACEMENT_AI_ADVISORY_PROVIDER: 'NONE',
  PLACEMENT_AI_ADVISORY_STAGING_ENABLED: 'false',
  PLACEMENT_AI_ADVISORY_DAILY_BUDGET_CALLS: '0',
  PLACEMENT_AI_ADVISORY_LIVE_VERIFIED: 'false',
});

function inspectOfflineConfiguration(env) {
  const switches = Object.entries(SAFE_SWITCHES).map(([name, expected]) => {
    const supplied = env[name];
    const usesDefault = supplied === undefined || supplied === '';
    const safe = (usesDefault ? expected : supplied) === expected;
    return {
      name,
      status: safe ? 'PASS' : 'BLOCKED',
      effective: safe ? expected : 'REDACTED_UNSAFE_VALUE',
      source: usesDefault ? 'BACKEND_CODE_DEFAULT' : 'CURRENT_PROCESS',
    };
  });
  const model = env.GEMINI_ADVISORY_MODEL || 'gemini-2.5-flash';
  const modelHasSafeShape = /^[a-zA-Z0-9._-]{1,100}$/.test(model);
  const rawTimeout = env.PLACEMENT_AI_ADVISORY_TIMEOUT_MS;
  const timeout = rawTimeout === undefined || rawTimeout === '' ? 4500 : Number(rawTimeout);
  const timeoutValid = Number.isFinite(timeout) && timeout > 0;
  return {
    status:
      switches.every((s) => s.status === 'PASS') && modelHasSafeShape && timeoutValid
        ? 'PASS_OFFLINE_CONFIGURATION'
        : 'BLOCKED_UNSAFE_CONFIGURATION',
    scope: 'CURRENT_PROCESS_SAFE_FIELDS_ONLY',
    switches,
    modelMatchesHistoricalDefault: model === 'gemini-2.5-flash',
    modelShapeStatus: modelHasSafeShape ? 'PASS' : 'BLOCKED',
    timeoutMs: timeoutValid ? timeout : 'REDACTED_INVALID_VALUE',
    apiKeyInspection: 'NOT_PERFORMED',
    envFileReadByThisScript: false,
    networkRequests: 0,
    databaseConnections: 0,
    liveVerified: false,
    modelEntitlementVerified: false,
    freeTierStatus: 'PO_REPORTED_NOT_LIVE_VERIFIED',
  };
}

module.exports = { inspectOfflineConfiguration, SAFE_SWITCHES };

if (require.main === module) {
  if (process.argv.length !== 2) {
    // Never echo unexpected arguments: someone might accidentally pass a secret.
    process.stdout.write(JSON.stringify({ status: 'BLOCKED_UNEXPECTED_ARGUMENTS' }) + '\n');
    process.exitCode = 1;
  } else {
    const result = inspectOfflineConfiguration(process.env);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exitCode = result.status === 'PASS_OFFLINE_CONFIGURATION' ? 0 : 1;
  }
}
