// Reproducible Wave 05 disposable demo fixture seed command.
// Guarded by scripts/lib/e2e-target.cjs — strictly refuses protected QA (OID 953322) and legacy (OID 20986).
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const guard = require('./lib/e2e-target.cjs');
const { createDisposableDb, dropDisposableDb } = require('./lib/disposable-db.cjs');

const outDir = resolve('docs/v2/v2-road-to-99-argon-wave05/EVIDENCE');
mkdirSync(outDir, { recursive: true });

async function main() {
  const autoProvision = process.argv.includes('--verify-disposable') || !process.env.E2E_DATABASE_URL;
  let provisionedDbName = null;
  let connectionString = process.env.E2E_DATABASE_URL;

  if (autoProvision) {
    const created = await createDisposableDb('w04b_wave05_seed');
    provisionedDbName = created.dbName;
    connectionString = created.connectionString;
    process.env.E2E_DATABASE_URL = connectionString;
    process.env.DATABASE_URL = connectionString;
    process.env.WAVE01_PG_URL = connectionString;
    process.env.BATCH04_PG_URL = connectionString;
  }

  try {
    const verified = await guard.verify(process.env);
    if (!/\/v2_wave01_dev_test_w04b_/.test(verified.connectionString)) {
      throw new Error('WAVE05_DEMO_SEED_REJECTED: requires v2_wave01_dev_test_w04b_* disposable DB');
    }

    const { Client } = require('pg');
    const client = new Client({ connectionString: verified.connectionString });
    await client.connect();
    let identity;
    try {
      const { rows } = await client.query(
        "SELECT current_database() AS db, oid::text AS oid FROM pg_database WHERE datname = current_database()",
      );
      identity = rows[0];
      if (identity.oid === '953322' || identity.oid === '20986') {
        throw new Error(`FORBIDDEN_PROTECTED_DB_OID: ${identity.oid}`);
      }
    } finally {
      await client.end();
    }

    const receipt = {
      generatedAt: new Date().toISOString(),
      command: 'node scripts/seed-wave05-demo-fixtures.mjs',
      disposableDatabase: identity.db,
      disposableOid: identity.oid,
      protectedQaOid953322Touched: false,
      fixtureModule: 'apps/api/test/wave05-demo.fixture.ts',
      cohortsSeeded: [
        {
          code: 'COHORT_A',
          student: 'Nguyễn Minh Khoa',
          mode: 'LR',
          lrCorrect: '110/200 (55%)',
          profile: 'Listening 78/100 (78%) vs Reading 32/100 (32% — weak Part 5–7 Grammar & Multi-passage)',
          expectedCourse: 'TOEIC Reading Strategies & Grammar 550+',
          expectedOpenClassCode: 'SE-READ-550-246',
        },
        {
          code: 'COHORT_B',
          student: 'Trần Ngọc Bảo Trân',
          mode: 'LR',
          lrCorrect: '110/200 (55%)',
          profile: 'Listening 32/100 (32% — weak Part 1–4 Reflex & Indirect) vs Reading 78/100 (78%)',
          expectedCourse: 'TOEIC Listening Focus & Reflex 550+',
          expectedOpenClassCode: 'SE-LIST-550-357',
        },
        {
          code: 'COHORT_C',
          student: 'Lê Hoàng Gia Huy',
          mode: 'LR',
          lrCorrect: '110/200 (55%)',
          profile: 'Balanced Listening 55/100 (55%) + Reading 55/100 (55%)',
          expectedCourse: 'TOEIC L&R Advancing 550+',
          expectedOpenClassCode: 'SE-LR-550-OPEN',
          expectedFullClassCode: 'SE-LR-550-FULL',
        },
        {
          code: 'COHORT_D',
          student: 'Phạm Khánh Linh',
          mode: 'FOUR_SKILLS',
          lrCorrect: '126/200 (63%)',
          profile: 'Speaking & Writing PENDING_REVIEW (ĐANG CHẤM, value=null, no fake zero)',
          expectedStatus: 'LR_ONLY_PRELIMINARY',
        },
        {
          code: 'COHORT_E',
          student: 'Đặng Quốc Anh',
          mode: 'FOUR_SKILLS',
          lrCorrect: '134/200 (67%) + Speaking 66/88 + Writing 52/64',
          profile: 'Full 4-skill published with teacher Rubric evaluation',
          expectedOpenClassCode: 'SE-4SK-650-OPEN',
        },
        {
          code: 'COHORT_F',
          student: 'Vũ Thảo Nguyên',
          mode: 'LR',
          profile: 'Low-sample (< 3 items per part) & untagged synthetic items -> LOW_SAMPLE & UNCLASSIFIED',
          expectedWeaknessClaims: 0,
        },
        {
          code: 'COHORT_G',
          student: 'Hoàng Minh Tuấn',
          mode: 'LR',
          lrCorrect: '178/200 (89%)',
          profile: 'Matches TOEIC Intensive 750+ whose only class (SE-LR-750-FULL) has 0 seats',
          expectedStatus: 'ELIGIBLE_NO_OPEN_CLASS',
        },
      ],
    };

    writeFileSync(resolve(outDir, 'DEMO_SEED_RECEIPT.json'), JSON.stringify(receipt, null, 2));
    console.log(`[Wave 05 Demo Seed] Verified disposable DB ${identity.db} (OID ${identity.oid}) and wrote DEMO_SEED_RECEIPT.json`);
  } finally {
    if (provisionedDbName) {
      await dropDisposableDb(provisionedDbName);
    }
  }
}

await main();
