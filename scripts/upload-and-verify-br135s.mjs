import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const FOLDER_ID = '10KIh8N8GmfScpvCVrxtlzs4A64AHWhjZ';
const LOCAL_DIR = 'docs/v2/v2-road-to-99-argon-wave05-ai-staging-br135s';

const files = fs.readdirSync(LOCAL_DIR);
console.log(`Found ${files.length} files to upload to Google Drive folder ${FOLDER_ID}...`);

for (const file of files) {
  if (file === 'GOOGLE_DRIVE_READBACK_MANIFEST_BR135S.json') continue;
  const filePath = path.join(LOCAL_DIR, file);
  console.log(`Uploading ${file}...`);
  try {
    const cmd = `gdrive mutate upload "${filePath}" --parent ${FOLDER_ID}`;
    const out = execSync(cmd, { encoding: 'utf8' });
    console.log(`Uploaded ${file}: ${out.trim()}`);
  } catch (err) {
    console.error(`Failed to upload ${file}:`, err.message);
  }
}

console.log('Performing readback check...');
const lsOut = execSync(`gdrive readonly ls ${FOLDER_ID} --json`, { encoding: 'utf8' });
const driveItems = JSON.parse(lsOut);
console.log(`Drive folder now contains ${driveItems.length} items.`);

const manifestPath = path.join(LOCAL_DIR, 'GOOGLE_DRIVE_READBACK_MANIFEST_BR135S.json');
fs.writeFileSync(manifestPath, JSON.stringify(driveItems, null, 2), 'utf8');

console.log('Uploading manifest...');
try {
  const cmd = `gdrive mutate upload "${manifestPath}" --parent ${FOLDER_ID}`;
  const out = execSync(cmd, { encoding: 'utf8' });
  console.log(`Uploaded manifest: ${out.trim()}`);
} catch (err) {
  console.error(`Failed to upload manifest:`, err.message);
}

const finalLsOut = execSync(`gdrive readonly ls ${FOLDER_ID} --json`, { encoding: 'utf8' });
const finalDriveItems = JSON.parse(finalLsOut);
console.log(`Final verified Drive items count: ${finalDriveItems.length}`);
fs.writeFileSync(manifestPath, JSON.stringify(finalDriveItems, null, 2), 'utf8');
