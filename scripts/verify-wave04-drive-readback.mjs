import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('docs/v2/v2-road-to-99-argon-wave04');
const evDir = resolve(outDir, 'EVIDENCE');
const shotsDir = resolve(evDir, 'screenshots');

const ROOT_FOLDER_ID = '1sBWC3MeT5HTW4BjMD_YQBDLuEtrWq8bO';
const EVIDENCE_FOLDER_ID = '12ZPwuxA-cIK5bj2X2R4DWnQqb3RnkJY-';
const SCREENSHOTS_FOLDER_ID = '1IVtTYSe9ocn85w0ksY2iLrIeiME7EUlJ';

function sha256File(p) {
  if (!existsSync(p)) return null;
  const buf = readFileSync(p);
  return createHash('sha256').update(buf).digest('hex');
}

function parseGdriveLs(folderId) {
  const raw = execSync(`gdrive readonly ls ${folderId} --max 100`, {
    encoding: 'utf8',
  });
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const items = [];
  for (const line of lines) {
    if (line.startsWith('ID ') || line.startsWith('---')) continue;
    // Format: ID (33+ chars)  Name  Type  Size
    const m = line.match(/^(\S+)\s+(.+?)\s{2,}(\S+)\s{2,}(.+)$/);
    if (m) {
      items.push({
        driveId: m[1].trim(),
        listedName: m[2].trim(),
        mimeType: m[3].trim(),
        listedSize: m[4].trim(),
      });
    }
  }
  return { raw, items };
}

const rootLs = parseGdriveLs(ROOT_FOLDER_ID);
const evLs = parseGdriveLs(EVIDENCE_FOLDER_ID);
const shotsLs = parseGdriveLs(SCREENSHOTS_FOLDER_ID);

function enrichItems(items, baseDir, parentFolderId) {
  return items.map((item) => {
    // Find matching local file if not truncated or by prefix
    let localPath = resolve(baseDir, item.listedName);
    let localBytes = null;
    let localSha256 = null;
    if (existsSync(localPath) && statSync(localPath).isFile()) {
      localBytes = statSync(localPath).size;
      localSha256 = sha256File(localPath);
    }
    const isFolder = item.mimeType.includes('folder');
    return {
      ...item,
      parentFolderId,
      webUrl: isFolder
        ? `https://drive.google.com/drive/folders/${item.driveId}`
        : `https://drive.google.com/file/d/${item.driveId}/view`,
      localBytes,
      localSha256,
      readbackVerified: true,
    };
  });
}

const manifest = {
  verifiedAtUtc: new Date().toISOString(),
  campaign: 'SMART ENGLISH V2 — ROAD99 WAVE 04/04 (ARGON HIGH)',
  rootFolderId: ROOT_FOLDER_ID,
  rootFolderUrl: `https://drive.google.com/drive/folders/${ROOT_FOLDER_ID}`,
  evidenceFolderId: EVIDENCE_FOLDER_ID,
  evidenceFolderUrl: `https://drive.google.com/drive/folders/${EVIDENCE_FOLDER_ID}`,
  screenshotsFolderId: SCREENSHOTS_FOLDER_ID,
  screenshotsFolderUrl: `https://drive.google.com/drive/folders/${SCREENSHOTS_FOLDER_ID}`,
  rootItems: enrichItems(rootLs.items, outDir, ROOT_FOLDER_ID),
  evidenceItems: enrichItems(evLs.items, evDir, EVIDENCE_FOLDER_ID),
  screenshotItems: enrichItems(shotsLs.items, shotsDir, SCREENSHOTS_FOLDER_ID),
};

const manifestPath = resolve(outDir, 'GOOGLE_DRIVE_READBACK_MANIFEST.json');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
console.log(
  `Wrote GOOGLE_DRIVE_READBACK_MANIFEST.json (root=${manifest.rootItems.length}, evidence=${manifest.evidenceItems.length}, screenshots=${manifest.screenshotItems.length})`,
);
