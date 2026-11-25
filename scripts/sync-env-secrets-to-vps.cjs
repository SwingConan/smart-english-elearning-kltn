'use strict';

// Safely extracts ONLY Gemini & SMTP keys from local apps/api/.env into a temporary
// staging script to merge onto the VPS without printing any secret values to stdout.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const localEnvPath = path.join(ROOT, 'apps/api/.env');
const outPath = path.join(ROOT, '.local-storage/vps-deploy/env-addons.private');

if (!fs.existsSync(localEnvPath)) {
  console.error('Missing local apps/api/.env');
  process.exit(1);
}

const ALLOWED_KEYS = new Set([
  'GEMINI_API_KEY',
  'GEMINI_ADVISORY_MODEL',
  'PLACEMENT_AI_ADVISORY_PROVIDER',
  'PLACEMENT_AI_ADVISORY_STAGING_ENABLED',
  'PLACEMENT_AI_ADVISORY_LIVE_VERIFIED',
  'PLACEMENT_AI_ADVISORY_DAILY_BUDGET_CALLS',
  'PLACEMENT_AI_ADVISORY_TIMEOUT_MS',
  'EMAIL_PROVIDER',
  'EMAIL_FROM',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASSWORD',
]);

const rawLines = fs.readFileSync(localEnvPath, 'utf8').split(/\r?\n/);
const picked = new Map();

for (const line of rawLines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq <= 0) continue;
  const key = trimmed.slice(0, eq).trim();
  let val = trimmed.slice(eq + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (ALLOWED_KEYS.has(key) && val.length > 0) {
    picked.set(key, val);
  }
}

// Ensure live-verified is true when GEMINI_API_KEY is present
if (picked.has('GEMINI_API_KEY')) {
  picked.set('PLACEMENT_AI_ADVISORY_PROVIDER', 'GEMINI');
  picked.set('PLACEMENT_AI_ADVISORY_STAGING_ENABLED', 'true');
  picked.set('PLACEMENT_AI_ADVISORY_LIVE_VERIFIED', 'true');
  if (!picked.has('PLACEMENT_AI_ADVISORY_DAILY_BUDGET_CALLS')) {
    picked.set('PLACEMENT_AI_ADVISORY_DAILY_BUDGET_CALLS', '200');
  }
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
const serialized = [...picked.entries()]
  .map(([k, v]) => `${k}="${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
  .join('\n') + '\n';

fs.writeFileSync(outPath, serialized, { encoding: 'utf8', mode: 0o600 });
console.log(
  `Prepared ${picked.size} settings (Gemini=${picked.has('GEMINI_API_KEY')}, SMTP=${picked.get('EMAIL_PROVIDER') === 'smtp'})`,
);
