import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const required = [
  'package.json',
  'apps/web/package.json',
  'apps/web/src/main.tsx',
  'apps/api/package.json',
  'apps/api/src/main.ts',
  'apps/api/src/app.module.ts',
  'apps/api/prisma/schema.prisma',
  'apps/api/prisma.config.ts',
  'docs/MODULE_MAP.md',
];

const missing = required.filter((item) => !fs.existsSync(path.resolve(item)));
if (missing.length > 0) {
  console.error('Missing required skeleton files:');
  for (const item of missing) console.error(`- ${item}`);
  process.exit(1);
}

const rootPackage = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (!rootPackage.workspaces?.includes('apps/*')) {
  console.error('Root package.json must include apps/* workspace.');
  process.exit(1);
}

console.log('Project skeleton structure: OK');
console.log('Next: npm install -> package-lock.json -> local quality gates.');
