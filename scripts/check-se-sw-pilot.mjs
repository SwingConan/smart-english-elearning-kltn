import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validatePilot } from './se-sw-pilot.mjs';

const root = resolve('.local-storage/se-sw-01');
try {
  const manifest = JSON.parse(readFileSync(resolve(root, 'private-manifest.json'), 'utf8'));
  const result = validatePilot(manifest, root);
  writeFileSync(resolve(root, 'validation-report.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        mechanicalPass: result.mechanicalPass,
        images: result.assets.filter((a) => a.format === 'PNG').length,
        audio: result.assets.filter((a) => a.format === 'WAV/PCM16').length,
        errors: result.errors,
        blockers: result.blockers,
        report: '.local-storage/se-sw-01/validation-report.json',
      },
      null,
      2,
    ),
  );
  if (!result.mechanicalPass) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
