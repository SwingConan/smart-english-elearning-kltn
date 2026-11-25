import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import {
  AUDIO_IDS,
  IMAGE_IDS,
  QUESTION_IDS,
  candidateQuestion,
  draftImportPlan,
  inspectPng,
  inspectWav,
  privateAssetPath,
  sha256,
  validatePilot,
} from './se-sw-pilot.mjs';

// Synthetic in-memory fixtures only; never written to the private production pack.
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(seed = 0, width = 640, height = 360) {
  const chunk = (type, body) => {
    const result = Buffer.alloc(body.length + 12);
    result.writeUInt32BE(body.length);
    result.write(type, 4);
    body.copy(result, 8);
    result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4);
    return result;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc((width * 3 + 1) * height, seed);
  for (let y = 0; y < height; y++) pixels[y * (width * 3 + 1)] = 0;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
function wav(seed = 1, silent = false) {
  const sampleRate = 16000,
    samples = sampleRate * 2,
    bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF');
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    bytes.writeInt16LE(
      silent ? 0 : Math.round(Math.sin(i * (0.1 + seed * 0.01)) * 4000),
      44 + i * 2,
    );
  return bytes;
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'se-sw-pilot-test-'));
  mkdirSync(join(root, 'media'));
  const questions = QUESTION_IDS.map((id, i) => ({
    questionId: id,
    skill: i < 11 ? 'SPEAKING' : 'WRITING',
    itemOrder: i + 1,
    promptText: 'Synthetic task',
    instructions: 'Synthetic instruction',
    responseType: i < 11 ? 'AUDIO_RESPONSE' : 'TEXT_RESPONSE',
    mediaAssetIds: [],
    ...(['S8', 'S9', 'S10'].includes(id) ? { informationSheetId: 'table' } : {}),
  }));
  const assets = [...IMAGE_IDS, ...AUDIO_IDS].map((id, i) => {
    const image = IMAGE_IDS.includes(id),
      fileName = `SE-SW-01_${id}_${image ? 'image' : 'question'}_v01.${image ? 'png' : 'wav'}`,
      bytes = image ? png(i + 1) : wav(i + 1),
      assetId = `asset-${id}`;
    writeFileSync(join(root, 'media', fileName), bytes);
    questions.find((q) => q.questionId === id).mediaAssetIds = [assetId];
    return {
      questionId: id,
      assetId,
      fileName,
      assetVersion: 'v01',
      kind: image ? 'IMAGE' : 'AUDIO',
      relativePath: `media/${fileName}`,
      storageKey: `authored/se-sw-01/v01/${fileName}`,
      sha256: sha256(bytes),
      bytes: bytes.length,
      ...(!image
        ? {
            sourceScript: 'Synthetic speech',
            sourceScriptSha256: sha256('Synthetic speech'),
            generationReceipt: { sourceScript: 'Synthetic speech', sha256: sha256(bytes) },
          }
        : {}),
    };
  });
  const manifest = {
    formCode: 'SE-SW-01',
    status: 'DRAFT',
    releaseAllowed: false,
    questions,
    assets,
    informationSheet: {
      kind: 'assessment-table',
      version: 1,
      caption: 'Synthetic schedule',
      columns: ['A', 'B', 'C', 'D'],
      rows: Array.from({ length: 5 }, () => ['x', 'y', 'z', 'w']),
    },
    qa: {
      issues: [{ code: 'W5_TEMPORAL_BEFORE', status: 'OPEN' }],
      mediaReview: { completed: false },
      s10ReplayLimit: null,
    },
  };
  return { root, manifest, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
function withFixture(fn) {
  const f = fixture();
  try {
    fn(f);
  } finally {
    f.cleanup();
  }
}

test('technical success remains unpublished with semantic/academic gates pending', () =>
  withFixture(({ root, manifest }) => {
    const result = validatePilot(manifest, root);
    assert.equal(result.mechanicalPass, true);
    assert.equal(result.assets.length, 13);
    assert.equal(result.gates.ACADEMIC_APPROVED, false);
    assert.equal(result.gates.PUBLISHED, false);
    assert.ok(result.blockers.includes('ACADEMIC_ISSUES_OPEN'));
    assert.ok(result.blockers.includes('S10_REPLAY_POLICY_PENDING'));
  }));
test('missing files and byte tampering fail the media gate', () =>
  withFixture(({ root, manifest }) => {
    rmSync(join(root, manifest.assets[0].relativePath));
    writeFileSync(join(root, manifest.assets[1].relativePath), Buffer.from('not a picture'));
    const result = validatePilot(manifest, root);
    assert.equal(result.mechanicalPass, false);
    assert.equal(result.errors.length, 2);
  }));
test('relabelled, duplicate and swapped question media are rejected', () =>
  withFixture(({ root, manifest }) => {
    manifest.assets[0].questionId = 'W8';
    manifest.assets[1].assetId = manifest.assets[2].assetId;
    assert.equal(validatePilot(manifest, root).mechanicalPass, false);
  }));
test('W5 flag cannot be removed and source script receipts cannot drift', () =>
  withFixture(({ root, manifest }) => {
    manifest.qa.issues = [];
    manifest.assets.find((a) => a.kind === 'AUDIO').sourceScript = 'Altered source';
    const result = validatePilot(manifest, root);
    assert.equal(result.mechanicalPass, false);
    assert.ok(result.errors.some((e) => e.includes('W5')));
    assert.ok(result.errors.some((e) => e.includes('Script hash')));
  }));
test('PNG decoding detects truncated data, invalid CRC, and wrong aspect ratio', () => {
  assert.equal(inspectPng(png()).width, 640);
  const bad = png();
  bad[bad.length - 1] ^= 1;
  assert.throws(() => inspectPng(bad), /CRC/);
  assert.throws(() => inspectPng(png().subarray(0, 50)));
  assert.throws(() => inspectPng(png(0, 640, 640)), /16:9/);
});
test('WAV checks real duration separately from answer windows and rejects silence/corruption', () => {
  assert.equal(inspectWav(wav()).durationSeconds, 2);
  assert.throws(() => inspectWav(wav(1, true)), /silent/);
  const bad = wav();
  bad.writeUInt32LE(123, 4);
  assert.throws(() => inspectWav(bad), /length/);
  assert.throws(() => inspectWav(Buffer.from('RIFFfake')));
});
test('private path resolution blocks traversal, Windows paths and symlink escape', () =>
  withFixture(({ root, manifest }) => {
    for (const key of [
      '../secret',
      'media/../secret',
      'C:/secret',
      'media/C:secret',
      'media\\secret',
      '/secret',
    ])
      assert.throws(() => privateAssetPath(root, key));
    const link = join(root, 'media', 'escape.png');
    // Windows directory junctions need no developer-mode privilege. Resolve the
    // link before inspecting media bytes, even if its filename has a PNG suffix.
    symlinkSync(tmpdir(), link, 'junction');
    try {
      assert.throws(() => privateAssetPath(root, 'media/escape.png'), /escapes/);
    } finally {
      unlinkSync(link);
    }
    assert.ok(privateAssetPath(root, manifest.assets[0].relativePath));
  }));
test('candidate projection and import plan exclude private evidence and never execute publication', () =>
  withFixture(({ manifest }) => {
    const q = manifest.questions[0];
    manifest.questions.find((q) => q.questionId === 'W1').requiredWords = ['synthetic', 'terms'];
    Object.assign(q, {
      sourceBrief: 'SECRET_BRIEF',
      correctFacts: 'SECRET_FACTS',
      scoringGuide: 'SECRET_SCORING',
      rubric: 'SECRET_RUBRIC',
      reviewedBy: 'SECRET_REVIEW',
    });
    assert.ok(!JSON.stringify(candidateQuestion(q)).includes('SECRET'));
    const plan = draftImportPlan(manifest);
    assert.equal(plan.executable, false);
    assert.equal(plan.status, 'DRAFT');
    assert.equal(plan.groups.length, 19);
    assert.ok(
      plan.groups.find((g) => g.questionId === 'W1').question.content.includes('synthetic / terms'),
    );
    assert.equal(
      plan.groups.find((g) => g.questionId === 'S10').question.content,
      'Listen to the question and answer in English.',
    );
    assert.ok(!JSON.stringify(plan).includes('SECRET'));
    manifest.informationSheet.expectedFacts = 'SECRET_TABLE_FACTS';
    manifest.informationSheet.sourceBrief = 'SECRET_TABLE_BRIEF';
    const safePlan = draftImportPlan(manifest);
    assert.ok(!JSON.stringify(safePlan).includes('SECRET_TABLE'));
    assert.equal(
      JSON.parse(plan.groups.find((g) => g.questionId === 'S10').stimuli[0].textContent).kind,
      'assessment-table',
    );
  }));
test('no form expansion, no publication, no forged academic claim accepted', () =>
  withFixture(({ root, manifest }) => {
    manifest.formCode = 'SE-SW-02';
    manifest.status = 'PUBLISHED';
    manifest.releaseAllowed = true;
    manifest.qa.academicApproval = { approved: true };
    const result = validatePilot(manifest, root);
    assert.equal(result.mechanicalPass, false);
    assert.equal(result.gates.PUBLISHED, false);
  }));
