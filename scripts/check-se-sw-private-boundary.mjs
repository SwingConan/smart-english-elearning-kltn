import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve('.local-storage/se-sw-01');
const manifest = JSON.parse(readFileSync(resolve(root, 'private-manifest.json'), 'utf8'));
const trackedPrivate = execFileSync('git', ['ls-files', '--', '.local-storage'], {
  encoding: 'utf8',
}).trim();
if (trackedPrivate) throw new Error('Private directory contains tracked files.');
execFileSync('git', ['check-ignore', '--quiet', '.local-storage/se-sw-01/private-manifest.json']);
const paths = [
  'apps/api/prisma/schema.prisma',
  'apps/api/prisma/migrations/20261030010000_v2_s10_durable_recovery/migration.sql',
  'apps/api/src/infrastructure/session/session.middleware.ts',
  'apps/api/src/modules/placement/assessment-response.storage.ts',
  'apps/api/src/modules/placement/placement.module.ts',
  'apps/api/src/modules/placement/s10-durable.controller.ts',
  'apps/api/src/modules/placement/s10-durable.service.ts',
  'apps/api/src/modules/placement/s10-durable.service.spec.ts',
  'apps/api/test/s10-postgres.fixture.ts',
  'apps/api/test/s10-postgres.e2e-spec.ts',
  'apps/web/src/features/placement/durable-s10-session.ts',
  'apps/web/src/features/placement/durable-s10-session.test.ts',
  'apps/web/src/pages/S10RecoveryPage.tsx',
  'apps/web/src/App.tsx',
  'apps/web/src/layouts/AdminLayout.tsx',
  'scripts/test-s10-migration.mjs',
  'docs/v2/S10_DURABLE_BATCH_04.md',
  'docs/v2/S10_MIGRATION_ROLLBACK_BATCH_04.md',
  'package.json',
  'apps/api/src/modules/placement/placement.service.ts',
  'apps/api/src/modules/placement/placement.service.spec.ts',
  'apps/web/src/pages/PlacementExamPage.tsx',
  'apps/web/src/features/placement/placement.test.tsx',
  'apps/web/src/features/placement/AssessmentTextStimulus.tsx',
  'apps/web/src/features/placement/AssessmentTextStimulus.test.tsx',
  'apps/web/src/features/placement/information-table.ts',
  'scripts/se-sw-pilot.mjs',
  'scripts/se-sw-pilot.test.mjs',
  'scripts/check-se-sw-pilot.mjs',
  'scripts/build-se-sw-review.mjs',
  'scripts/check-se-sw-private-boundary.mjs',
  'docs/v2/SE_SW_01_PILOT_IMPLEMENTATION.md',
  'docs/v2/SE_SW_01_CONSOLIDATED_FIX_01.md',
  'apps/api/src/modules/placement/candidate-information-table.ts',
  'apps/api/src/modules/placement/candidate-information-table.spec.ts',
  'apps/api/src/modules/placement/pilot-task-policy.ts',
  'apps/api/src/modules/placement/placement.controller.ts',
  'apps/api/src/modules/assessments/assessment-student.service.ts',
  'apps/api/test/se-sw-media.fixture.ts',
  'apps/api/test/se-sw-media.e2e-spec.ts',
  'apps/web/src/features/placement/DoublePromptAnswer.tsx',
  'apps/web/src/features/placement/double-prompt-session.ts',
  'apps/web/src/features/placement/double-prompt-session.test.ts',
  'apps/web/src/features/placement/types.ts',
  'apps/api/src/modules/placement/s10-ledger.prototype.ts',
  'apps/api/src/modules/placement/s10-ledger.prototype.spec.ts',
  'apps/api/test/s10-server.fixture.ts',
  'apps/api/test/s10-server.e2e-spec.ts',
  'docs/v2/S10_SERVER_RECOVERY_ADR_BATCH_03.md',
  'docs/v2/S10_SERVER_CONTRACT_BATCH_03.md',
];
const needles = [
  ...manifest.assets.flatMap((a) => [a.sourceBrief, a.sourceScript]).filter(Boolean),
  ...manifest.questions.map((q) => q.promptText).filter((s) => s.length > 100),
  manifest.expectedFacts.S10.session,
];
for (const path of paths) {
  const content = readFileSync(path, 'utf8');
  if (needles.some((needle) => content.includes(needle)))
    throw new Error(`Private source text found in public deliverable: ${path}`);
}
const report = {
  pass: true,
  trackedPrivateFiles: 0,
  privateDirectoryIgnored: true,
  scannedDeliverables: paths,
  note: 'Scoped scan of this change, not a full historical secret audit. No private content staged or pushed.',
};
writeFileSync(
  resolve(root, 'private-boundary-report.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(
  `Private boundary passed: ${paths.length} code/document files scanned; zero tracked private files.`,
);
