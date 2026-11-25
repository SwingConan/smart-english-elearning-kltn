import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const BANK_DIR = path.join(ROOT, 'apps', 'api', 'content', 'toeic-mock-v1');

const DEMO_DB_URL =
  'postgresql://wave01@127.0.0.1:55401/v2_wave01_dev_test_w04b_br136_demo_20261111_42db33';

function deterministicUuid(prefixHex, a, b = 0) {
  const hexA = a.toString(16).padStart(4, '0');
  const hexB = b.toString(16).padStart(12, '0');
  return `${prefixHex}-0000-4000-${hexA}-${hexB}`;
}

async function seedOneDatabase(dbUrl, bankFiles) {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  const dbLabel = new URL(dbUrl).pathname.replace(/^\//, '');
  console.log(`\n=== Seeding ${bankFiles.length} tests into DB: ${dbLabel} ===`);

  try {
    await client.query(`ALTER TABLE test_attempts ADD COLUMN IF NOT EXISTS "practiceState" JSONB`);

    for (const file of bankFiles) {
      const bank = JSON.parse(fs.readFileSync(file, 'utf8'));
      const testNum = bank.testNumber;
      const testId = bank.id;
      const prefix8 = `910000${String(testNum).padStart(2, '0')}`; // 8 hex chars

      await client.query('BEGIN');
      try {
        await client.query(
          `
          INSERT INTO tests (
            id, purpose, title, description, status, "maxAttempts",
            "timeLimitMinutes", "showResultAfterSubmit", "createdAt", "updatedAt"
          ) VALUES (
            $1, 'PRACTICE_MOCK', $2, $3, 'PUBLISHED', 999, $4, true, NOW(), NOW()
          )
          ON CONFLICT (id) DO UPDATE SET
            purpose = 'PRACTICE_MOCK',
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            status = 'PUBLISHED',
            "maxAttempts" = 999,
            "timeLimitMinutes" = EXCLUDED."timeLimitMinutes",
            "showResultAfterSubmit" = true,
            "courseId" = NULL,
            "lessonId" = NULL,
            "updatedAt" = NOW()
          `,
          [testId, bank.title, bank.description, bank.timeLimitMinutes ?? 120],
        );

        // Detach/re-seed groups cleanly for idempotent refresh of content/crops/explanations
        // Keep existing TestAttempt & TestAnswer if testQuestions already match deterministic IDs!
        const existingGroupIdsRes = await client.query(
          `SELECT id FROM test_question_groups WHERE "testId" = $1`,
          [testId],
        );
        const existingGroupIds = existingGroupIdsRes.rows.map((r) => r.id);

        for (const grp of bank.groups) {
          const groupId = deterministicUuid(prefix8, 0x8100, grp.groupOrder);
          const skill = grp.skill; // 'LISTENING' | 'READING'
          await client.query(
            `
            INSERT INTO test_question_groups (
              id, "testId", skill, "orderIndex", title, instructions,
              "audioUrl", "taskCode", "createdAt", "updatedAt"
            ) VALUES (
              $1, $2, $3::"ToeicSkill", $4, $5, $6, $7, $8, NOW(), NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
              skill = EXCLUDED.skill,
              "orderIndex" = EXCLUDED."orderIndex",
              title = EXCLUDED.title,
              instructions = EXCLUDED.instructions,
              "audioUrl" = EXCLUDED."audioUrl",
              "taskCode" = EXCLUDED."taskCode",
              "updatedAt" = NOW()
            `,
            [
              groupId,
              testId,
              skill,
              grp.groupOrder,
              grp.title,
              grp.instructions,
              grp.audioKey ?? null,
              grp.taskCode,
            ],
          );

          await client.query(`DELETE FROM assessment_stimuli WHERE "groupId" = $1`, [groupId]);
          for (let imgIdx = 0; imgIdx < (grp.imageKeys ?? []).length; imgIdx++) {
            const imgKey = grp.imageKeys[imgIdx];
            const stimId = deterministicUuid(prefix8, 0x8200 + grp.groupOrder, imgIdx + 1);
            await client.query(
              `
              INSERT INTO assessment_stimuli (
                id, "groupId", type, "orderIndex", "storageKey", "mimeType", "altText", "isProtected", "createdAt", "updatedAt"
              ) VALUES (
                $1, $2, 'IMAGE', $3, $4, 'image/webp', $5, false, NOW(), NOW()
              )
              `,
              [stimId, groupId, imgIdx + 1, imgKey, `${grp.title} — Hình ${imgIdx + 1}`],
            );
          }

          for (const q of grp.questions) {
            const qNum = q.qNum;
            const questionId = deterministicUuid(prefix8, 0x8500, qNum);
            const tqId = deterministicUuid(prefix8, 0x8600, qNum);
            const diff = qNum <= 15 || (qNum >= 101 && qNum <= 112) ? 'EASY' : qNum >= 175 ? 'HARD' : 'MEDIUM';

            await client.query(
              `
              INSERT INTO questions (
                id, "responseType", difficulty, "toeicSkill", content, explanation, "createdAt", "updatedAt"
              ) VALUES (
                $1, 'MULTIPLE_CHOICE', $2::"QuestionDifficulty", $3::"ToeicSkill", $4, $5, NOW(), NOW()
              )
              ON CONFLICT (id) DO UPDATE SET
                "toeicSkill" = EXCLUDED."toeicSkill",
                difficulty = EXCLUDED.difficulty,
                content = EXCLUDED.content,
                explanation = EXCLUDED.explanation,
                "updatedAt" = NOW()
              `,
              [questionId, diff, skill, q.text, q.explanation ?? null],
            );

            const optEntries = Object.entries(q.options); // A, B, C, (D)
            for (let oIdx = 0; oIdx < optEntries.length; oIdx++) {
              const [letter, optText] = optEntries[oIdx];
              const optId = deterministicUuid(prefix8, 0x8800 + oIdx, qNum);
              const isCorrect = letter === q.correctOption;
              await client.query(
                `
                INSERT INTO question_options (
                  id, "questionId", content, "isCorrect", "orderIndex", "createdAt", "updatedAt"
                ) VALUES (
                  $1, $2, $3, $4, $5, NOW(), NOW()
                )
                ON CONFLICT (id) DO UPDATE SET
                  content = EXCLUDED.content,
                  "isCorrect" = EXCLUDED."isCorrect",
                  "orderIndex" = EXCLUDED."orderIndex",
                  "updatedAt" = NOW()
                `,
                [optId, questionId, optText, isCorrect, oIdx + 1],
              );
            }

            await client.query(
              `
              INSERT INTO test_questions (
                id, "testId", "questionId", "groupId", "orderIndex", points, "createdAt"
              ) VALUES (
                $1, $2, $3, $4, $5, 1, NOW()
              )
              ON CONFLICT (id) DO UPDATE SET
                "groupId" = EXCLUDED."groupId",
                "orderIndex" = EXCLUDED."orderIndex",
                points = 1
              `,
              [tqId, testId, questionId, groupId, qNum],
            );
          }
        }

        // Remove any stale groups above bank.groups.length if test re-seeded
        const keepGroupIds = bank.groups.map((grp) => deterministicUuid(prefix8, 0x8100, grp.groupOrder));
        const obsoleteGroups = existingGroupIds.filter((id) => !keepGroupIds.includes(id));
        if (obsoleteGroups.length > 0) {
          await client.query(`DELETE FROM test_question_groups WHERE id = ANY($1::uuid[])`, [
            obsoleteGroups,
          ]);
        }

        await client.query('COMMIT');
        console.log(`  Seeded Test ${testNum}: ${bank.groups.length} groups / ${bank.totalQuestions} questions`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    await client.end();
  }
}

async function main() {
  if (!fs.existsSync(BANK_DIR)) {
    throw new Error(`Missing bank directory: ${BANK_DIR}`);
  }
  const files = fs
    .readdirSync(BANK_DIR)
    .filter((f) => /^test-[1-6]\.json$/i.test(f))
    .sort()
    .map((f) => path.join(BANK_DIR, f));

  if (files.length === 0) {
    throw new Error(`No test-*.json files found in ${BANK_DIR}`);
  }

  const urls = Array.from(
    new Set([process.env.DATABASE_URL, DEMO_DB_URL].filter(Boolean)),
  );
  for (const url of urls) {
    try {
      await seedOneDatabase(url, files);
    } catch (err) {
      console.error(`Failed seeding DB (${url.split('/').slice(-1)[0]}):`, err.message);
      throw err;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
