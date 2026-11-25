'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const ROOT = path.resolve(__dirname, '..');
const STATE = path.join(ROOT, '.local-storage/vps-runtime');
const EXPECTED_DB = 'v2_wave01_dev_test_w04b_br136_demo_20261111_42db33';
const EXPECTED_MARKER = 'SMART_ENGLISH_DISPOSABLE_E2E_V1';

fs.mkdirSync(STATE, { recursive: true });

(async () => {
  const url = (process.env.DATABASE_URL || '').trim();
  if (!url) {
    throw new Error('DATABASE_URL is required in apps/api/.env');
  }

  const webOrigin = (process.env.WEB_ORIGIN || 'https://smartenglishcenter.site')
    .trim()
    .replace(/\/+$/, '');

  const db = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  let verifiedOid = '';
  try {
    await db.connect();
    await db.query('BEGIN READ ONLY');
    const { rows } = await db.query(
      "SELECT current_database() AS db, oid::text AS oid, shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = current_database()",
    );
    const info = rows[0];
    if (!info || info.db !== EXPECTED_DB || info.marker !== EXPECTED_MARKER) {
      throw new Error(
        `Database identity mismatch: got db=${info?.db} marker=${info?.marker}`,
      );
    }
    verifiedOid = info.oid;
    await db.query('SELECT 1 FROM br136_bank_check.assert_target()');
    await db.query('ROLLBACK');
  } finally {
    await db.end();
  }

  // Ensure SePay callbackUrl matches the active HTTPS domain if config file is present
  const sepayFile = path.join(
    ROOT,
    '.local-storage/v2-w07-sepay-fullstack-01/sepay-config.private.json',
  );
  if (fs.existsSync(sepayFile) && webOrigin.startsWith('https://')) {
    try {
      const cfg = JSON.parse(fs.readFileSync(sepayFile, 'utf8'));
      const desiredCallback = `${webOrigin}/api/v2/payments/sepay/webhook`;
      if (cfg && typeof cfg === 'object' && cfg.callbackUrl !== desiredCallback) {
        cfg.callbackUrl = desiredCallback;
        fs.writeFileSync(sepayFile, JSON.stringify(cfg, null, 2), { mode: 0o600 });
      }
    } catch {
      // Leave existing file untouched if unreadable
    }
  }

  const hasGeminiKey = Boolean((process.env.GEMINI_API_KEY || '').trim());

  Object.assign(process.env, {
    DATABASE_URL: url,
    E2E_DATABASE_URL: url,
    WAVE01_PG_URL: url,
    BATCH04_PG_URL: url,
    NODE_ENV: 'development',
    VPS_DEPLOY_APPROVED: 'SMART_ENGLISH_VPS_2026',
    WEB_ORIGIN: webOrigin,
    TRUST_PROXY: 'loopback',
    REPORT_CENTER_TIME_ZONE: process.env.REPORT_CENTER_TIME_ZONE || 'Asia/Ho_Chi_Minh',
    EMAIL_PROVIDER: (process.env.EMAIL_PROVIDER || 'console').trim(),

    W04B_ENABLED: 'DEV_WORKFLOW',
    W05A_ENABLED: 'DEV_SUPPORT',
    W05B_ENABLED: 'DEV_DEC060',
    W06_ENABLED: 'DEV_DEC047',
    W07_ENABLED: 'DEV_DEC049',
    W07_RUN_INTENT: 'DEC049_DISPOSABLE_ONLY',
    W07_EXPECTED_DATABASE: EXPECTED_DB,
    W07_VERIFIED_OID: verifiedOid,
    W07_WORKSPACE_ROOT: ROOT,
    W07_PROOF_ROOT: path.join(ROOT, '.local-storage/v2-wave07/proofs'),
    W08_ENABLED: 'DEV_DEC053',
    W09_ENABLED: 'DEV_W09',
    PLACEMENT_INTERNAL_RELEASE: 'PO_INTERNAL_20261113',

    ASSESSMENT_STIMULUS_AUTHORED_ROOT: path.join(ROOT, '.local-storage/v2-wave01/dev-media'),
    ASSESSMENT_STIMULUS_MEDIA_ROOT: path.join(ROOT, '.local-storage/v2-wave01/dev-media'),
    ASSESSMENT_RESPONSE_STORAGE_ROOT: path.join(ROOT, '.local-storage/v2-wave01/dev-responses'),
    TOEIC_PRACTICE_MEDIA_ROOT: path.join(ROOT, '.local-storage/toeic-practice-media'),
    LMS_LOCAL_FILES_ROOT: path.join(ROOT, '.local-storage/lms-local-files'),
    LEARNING_RESOURCE_STORAGE_ROOT: path.join(ROOT, '.local-storage/learning-resources'),
    COURSE_THUMBNAIL_STORAGE_ROOT: path.join(ROOT, '.local-storage/course-thumbnails'),
    SEPAY_CONFIG_FILE: sepayFile,

    PLACEMENT_AI_ADVISORY_PROVIDER: hasGeminiKey ? 'GEMINI' : 'NONE',
    PLACEMENT_AI_ADVISORY_STAGING_ENABLED: hasGeminiKey ? 'true' : 'false',
    PLACEMENT_AI_ADVISORY_LIVE_VERIFIED: hasGeminiKey ? 'true' : 'false',
    PLACEMENT_AI_ADVISORY_DAILY_BUDGET_CALLS: hasGeminiKey
      ? String(Math.max(1, Number(process.env.PLACEMENT_AI_ADVISORY_DAILY_BUDGET_CALLS) || 200))
      : '0',
    GEMINI_ADVISORY_MODEL: (process.env.GEMINI_ADVISORY_MODEL || 'gemini-2.5-flash').trim(),
    PLACEMENT_AI_ADVISORY_TIMEOUT_MS: String(
      Math.max(1000, Number(process.env.PLACEMENT_AI_ADVISORY_TIMEOUT_MS) || 30000),
    ),
  });

  for (const key of ['V2_UNIFIED_RUNTIME', 'SEPAY_CONTRACT_CHECKS']) {
    process.env[key] = '';
  }
  for (const key of ['W06_RUN_INTENT', 'W07_CF_RUN_INTENT']) {
    delete process.env[key];
  }

  for (const dir of [
    process.env.ASSESSMENT_STIMULUS_MEDIA_ROOT,
    process.env.ASSESSMENT_RESPONSE_STORAGE_ROOT,
    process.env.TOEIC_PRACTICE_MEDIA_ROOT,
    process.env.LMS_LOCAL_FILES_ROOT,
    process.env.LEARNING_RESOURCE_STORAGE_ROOT,
    process.env.COURSE_THUMBNAIL_STORAGE_ROOT,
    process.env.W07_PROOF_ROOT,
  ]) {
    if (dir) fs.mkdirSync(dir, { recursive: true });
  }

  const distEntry = path.join(ROOT, 'apps/api/dist/src/app.module.js');
  if (!fs.existsSync(distEntry)) {
    throw new Error('Compiled API not found at apps/api/dist/src/app.module.js. Run npm run build first.');
  }

  const { NestFactory } = require('@nestjs/core');
  const { ConfigService } = require('@nestjs/config');
  const { AppModule } = require('../apps/api/dist/src/app.module.js');
  const { configureHttpApplication } = require('../apps/api/dist/src/app.setup.js');
  const { GeminiAdvisoryAdapter } = require('../apps/api/dist/src/modules/placement/gemini-advisory-provider.js');
  const { PlacementWorkflowService } = require('../apps/api/dist/src/modules/placement/workflow.service.js');

  PlacementWorkflowService.configureSharedGeminiAdvisoryAdapter(new GeminiAdvisoryAdapter());

  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableShutdownHooks();

  app.use((req, res, next) => {
    res.setHeader('X-Smart-English-Environment', 'demo');
    if (req.url === '/api/demo/environment' && req.method === 'GET') {
      return res.json({ mode: 'demo', label: 'Smart English Center' });
    }
    if (req.url === '/api/v2/payments/sepay/webhook') {
      res.once('finish', () => {
        try {
          fs.appendFileSync(
            path.join(STATE, 'WEBHOOK_DELIVERIES.jsonl'),
            JSON.stringify({
              at: new Date().toISOString(),
              httpStatus: res.statusCode,
              signaturePresent:
                typeof req.headers['x-sepay-signature'] === 'string' &&
                req.headers['x-sepay-signature'].length > 0,
              timestampPresent:
                typeof req.headers['x-sepay-timestamp'] === 'string' &&
                req.headers['x-sepay-timestamp'].length > 0,
            }) + '\n',
          );
        } catch {}
      });
    }
    next();
  });

  const config = app.get(ConfigService);
  const port = Number(config.get('PORT') || 3000);
  configureHttpApplication(app, config);

  await app.listen(port, '127.0.0.1');
  console.log(
    JSON.stringify({
      status: 'VPS_BACKEND_READY',
      pid: process.pid,
      port,
      webOrigin,
      database: EXPECTED_DB,
      oid: verifiedOid,
      geminiEnabled: hasGeminiKey,
    }),
  );

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    try {
      await app.close();
    } finally {
      process.exit(0);
    }
  };
  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());
})().catch((err) => {
  console.error('VPS_BACKEND_STARTUP_FAILED:', err && err.stack ? err.stack : err);
  process.exit(1);
});
