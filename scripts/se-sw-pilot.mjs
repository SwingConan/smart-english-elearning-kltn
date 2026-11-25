import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { inflateSync } from 'node:zlib';

export const IMAGE_IDS = ['S3', 'S4', 'W1', 'W2', 'W3', 'W4', 'W5'];
export const AUDIO_IDS = ['S5', 'S6', 'S7', 'S8', 'S9', 'S10'];
export const QUESTION_IDS = [
  ...Array.from({ length: 11 }, (_, i) => `S${i + 1}`),
  ...Array.from({ length: 8 }, (_, i) => `W${i + 1}`),
];
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const requireValue = (condition, message) => {
  if (!condition) throw new Error(message);
};

export function privateAssetPath(root, key) {
  requireValue(
    typeof key === 'string' && /^media\/[A-Za-z0-9_.-]+$/.test(key),
    'Invalid private media path',
  );
  const canonicalRoot = realpathSync(root);
  const path = realpathSync(resolve(canonicalRoot, key));
  const rel = relative(canonicalRoot, path);
  requireValue(
    rel && !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel),
    'Media escapes private root',
  );
  return path;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function inspectPng(bytes) {
  requireValue(
    bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
    'PNG signature missing',
  );
  let position = 8,
    header,
    ended = false;
  const chunks = [];
  while (position + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(position);
    requireValue(position + size + 12 <= bytes.length, 'Truncated PNG chunk');
    const type = bytes.toString('ascii', position + 4, position + 8);
    const body = bytes.subarray(position + 8, position + 8 + size);
    requireValue(
      crc32(bytes.subarray(position + 4, position + 8 + size)) ===
        bytes.readUInt32BE(position + 8 + size),
      'PNG CRC mismatch',
    );
    if (!header) requireValue(type === 'IHDR', 'PNG header must be first');
    if (type === 'IHDR') {
      requireValue(!header && size === 13, 'Invalid PNG header');
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        color: body[9],
      };
      requireValue(
        header.width >= 640 &&
          header.width <= 8192 &&
          header.height >= 360 &&
          header.height <= 8192,
        'PNG dimensions outside pilot limits',
      );
      // Built-in imagegen returns near-16:9 rasters; tolerance is 0.5%, no silent crop.
      requireValue(
        Math.abs(header.width / header.height / (16 / 9) - 1) <= 0.005,
        'PNG must be landscape 16:9 (0.5% tolerance)',
      );
      requireValue(
        body[10] === 0 &&
          body[11] === 0 &&
          body[12] === 0 &&
          header.depth === 8 &&
          [2, 6].includes(header.color),
        'Unsupported PNG encoding',
      );
    }
    if (type === 'IDAT') chunks.push(body);
    position += size + 12;
    if (type === 'IEND') {
      requireValue(size === 0, 'Invalid PNG end');
      ended = true;
      break;
    }
  }
  requireValue(header && ended && position === bytes.length && chunks.length > 0, 'Incomplete PNG');
  const stride = header.width * (header.color === 2 ? 3 : 4) + 1;
  const pixels = inflateSync(Buffer.concat(chunks), { maxOutputLength: stride * header.height });
  requireValue(pixels.length === stride * header.height, 'PNG scanline size mismatch');
  for (let y = 0; y < header.height; y++)
    requireValue(pixels[y * stride] <= 4, 'Invalid PNG scanline filter');
  return { width: header.width, height: header.height, format: 'PNG', aspectRatioTolerance: 0.005 };
}

export function inspectWav(bytes) {
  requireValue(
    bytes.length >= 44 &&
      bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WAVE',
    'WAV signature missing',
  );
  requireValue(bytes.readUInt32LE(4) + 8 === bytes.length, 'WAV RIFF length mismatch');
  let fmt,
    data,
    position = 12;
  while (position + 8 <= bytes.length) {
    const type = bytes.toString('ascii', position, position + 4);
    const size = bytes.readUInt32LE(position + 4);
    requireValue(position + 8 + size <= bytes.length, 'Truncated WAV chunk');
    if (type === 'fmt ') {
      requireValue(!fmt && size >= 16, 'Invalid WAV fmt');
      fmt = {
        encoding: bytes.readUInt16LE(position + 8),
        channels: bytes.readUInt16LE(position + 10),
        sampleRate: bytes.readUInt32LE(position + 12),
        byteRate: bytes.readUInt32LE(position + 16),
        blockAlign: bytes.readUInt16LE(position + 20),
        bitsPerSample: bytes.readUInt16LE(position + 22),
      };
    }
    if (type === 'data') {
      requireValue(!data, 'Duplicate WAV data');
      data = bytes.subarray(position + 8, position + 8 + size);
    }
    position += 8 + size + (size % 2);
  }
  requireValue(position === bytes.length && fmt && data, 'Incomplete WAV');
  requireValue(
    fmt.encoding === 1 &&
      fmt.bitsPerSample === 16 &&
      [1, 2].includes(fmt.channels) &&
      fmt.sampleRate >= 16000 &&
      fmt.sampleRate <= 96000,
    'WAV must be PCM16 speech',
  );
  requireValue(
    fmt.blockAlign === fmt.channels * 2 &&
      fmt.byteRate === fmt.sampleRate * fmt.blockAlign &&
      data.length % fmt.blockAlign === 0,
    'Invalid WAV sample layout',
  );
  const durationSeconds = data.length / fmt.byteRate;
  // Prompt duration is separate from the learner response window.
  requireValue(
    durationSeconds >= 1 && durationSeconds <= 40,
    'Question audio duration outside 1–40 seconds',
  );
  let power = 0,
    nonzero = 0,
    clipped = 0;
  for (let i = 0; i < data.length; i += 2) {
    const value = data.readInt16LE(i);
    power += value * value;
    if (Math.abs(value) > 32) nonzero++;
    if (Math.abs(value) >= 32760) clipped++;
  }
  const samples = data.length / 2;
  const rms = Math.sqrt(power / samples) / 32768;
  requireValue(rms > 0.001 && nonzero / samples > 0.03, 'Audio is silent or lacks speech energy');
  requireValue(clipped / samples < 0.01, 'Audio clipping exceeds 1%');
  return {
    format: 'WAV/PCM16',
    channels: fmt.channels,
    sampleRate: fmt.sampleRate,
    bitsPerSample: 16,
    durationSeconds,
    rms,
    clippedFraction: clipped / samples,
  };
}

export function validateInformationSheet(sheet) {
  requireValue(
    sheet && sheet.kind === 'assessment-table' && sheet.version === 1,
    'Invalid information sheet',
  );
  requireValue(
    typeof sheet.caption === 'string' && sheet.caption.length > 0,
    'Table caption required',
  );
  requireValue(
    Array.isArray(sheet.columns) &&
      sheet.columns.length === 4 &&
      sheet.columns.every((c) => typeof c === 'string' && c.length > 0),
    'Table columns required',
  );
  requireValue(
    Array.isArray(sheet.rows) &&
      sheet.rows.length === 5 &&
      sheet.rows.every(
        (row) =>
          Array.isArray(row) &&
          row.length === sheet.columns.length &&
          row.every((c) => typeof c === 'string'),
      ),
    'Invalid information rows',
  );
}

export function candidateQuestion(question) {
  // Explicit projection: never spread private source, expected facts, rubric or review fields.
  return {
    questionId: question.questionId,
    contentVersion: question.contentVersion ?? 'v01',
    skill: question.skill,
    itemOrder: question.itemOrder,
    promptText: question.promptText,
    instructions: question.instructions,
    responseType: question.responseType,
    prepSeconds: question.prepSeconds,
    responseSeconds: question.responseSeconds,
    requiredWords: question.requiredWords ?? [],
    mediaAssetIds: question.mediaAssetIds ?? [],
    informationSheetId: question.informationSheetId ?? null,
  };
}

export function candidateInformationSheet(sheet) {
  validateInformationSheet(sheet);
  return {
    kind: 'assessment-table',
    version: 1,
    caption: sheet.caption,
    columns: sheet.columns.map((c) => c),
    rows: sheet.rows.map((row) => row.map((c) => c)),
  };
}

export function validatePilot(manifest, root) {
  const errors = [],
    assets = [];
  const check = (fn) => {
    try {
      fn();
    } catch (e) {
      errors.push(e.message);
    }
  };
  check(() => {
    requireValue(
      manifest.formCode === 'SE-SW-01' &&
        manifest.status === 'DRAFT' &&
        manifest.releaseAllowed === false,
      'Only unpublished SE-SW-01 pilot is accepted',
    );
    requireValue(
      manifest.questions?.length === 19 &&
        QUESTION_IDS.every((id, index) => manifest.questions[index].questionId === id),
      'Expected ordered 11S + 8W questions',
    );
    requireValue(
      manifest.questions.every(
        (q, i) =>
          q.itemOrder === i + 1 &&
          typeof q.promptText === 'string' &&
          q.promptText.trim() &&
          q.skill === (i < 11 ? 'SPEAKING' : 'WRITING') &&
          q.responseType === (i < 11 ? 'AUDIO_RESPONSE' : 'TEXT_RESPONSE'),
      ),
      'Invalid candidate question metadata',
    );
    requireValue(manifest.assets?.length === 13, 'Expected 13 media bindings');
    requireValue(
      new Set(manifest.assets.map((a) => a.assetId)).size === 13 &&
        new Set(manifest.assets.map((a) => a.fileName)).size === 13,
      'Duplicate asset ID or filename',
    );
    requireValue(
      new Set(manifest.assets.map((a) => a.sha256)).size === 13,
      'Duplicate or missing asset hashes',
    );
    for (const id of [...IMAGE_IDS, ...AUDIO_IDS]) {
      const asset = manifest.assets.filter((a) => a.questionId === id);
      requireValue(
        asset.length === 1 && asset[0].kind === (IMAGE_IDS.includes(id) ? 'IMAGE' : 'AUDIO'),
        `Invalid media binding ${id}`,
      );
      requireValue(
        manifest.questions.find((q) => q.questionId === id).mediaAssetIds?.join() ===
          asset[0].assetId,
        `Question asset mismatch ${id}`,
      );
    }
    requireValue(
      manifest.questions
        .filter((q) => q.informationSheetId)
        .map((q) => q.questionId)
        .join() === 'S8,S9,S10',
      'Information table must bind S8–S10',
    );
    requireValue(
      manifest.qa?.issues?.some((i) => i.code === 'W5_TEMPORAL_BEFORE'),
      'W5 academic flag must remain recorded',
    );
    validateInformationSheet(manifest.informationSheet);
  });
  for (const asset of manifest.assets ?? [])
    check(() => {
      const { questionId: id, fileName, assetVersion, kind } = asset;
      requireValue(/^v\d{2}$/.test(assetVersion), `Invalid version ${id}`);
      requireValue(
        fileName ===
          `SE-SW-01_${id}_${kind === 'IMAGE' ? 'image' : 'question'}_${assetVersion}.${kind === 'IMAGE' ? 'png' : 'wav'}`,
        `Invalid filename ${id}`,
      );
      requireValue(asset.relativePath === `media/${fileName}`, `Path binding mismatch ${id}`);
      requireValue(
        asset.storageKey === `authored/se-sw-01/${assetVersion}/${fileName}`,
        `Storage binding mismatch ${id}`,
      );
      const bytes = readFileSync(privateAssetPath(root, asset.relativePath));
      requireValue(
        bytes.length === asset.bytes &&
          /^[a-f0-9]{64}$/.test(asset.sha256) &&
          sha256(bytes) === asset.sha256,
        `Byte/hash mismatch ${id}`,
      );
      const inspection = kind === 'IMAGE' ? inspectPng(bytes) : inspectWav(bytes);
      if (kind === 'AUDIO') {
        requireValue(
          sha256(asset.sourceScript) === asset.sourceScriptSha256,
          `Script hash mismatch ${id}`,
        );
        requireValue(
          asset.generationReceipt?.sourceScript === asset.sourceScript &&
            asset.generationReceipt?.sha256 === asset.sha256,
          `TTS input receipt mismatch ${id}`,
        );
      }
      assets.push({
        questionId: id,
        assetId: asset.assetId,
        sha256: asset.sha256,
        bytes: bytes.length,
        ...inspection,
      });
    });
  const assetsGenerated = errors.length === 0 && assets.length === 13;
  const blockers = [];
  if (!assetsGenerated) blockers.push('MEDIA_VALIDATION_FAILED');
  // Offline records are review evidence only; this tool never authorizes publication.
  if (!manifest.qa?.mediaReview?.completed) blockers.push('TWO_PERSON_MEDIA_REVIEW_PENDING');
  if (manifest.qa?.issues?.some((i) => i.status !== 'RESOLVED'))
    blockers.push('ACADEMIC_ISSUES_OPEN');
  if (!Number.isInteger(manifest.qa?.s10ReplayLimit) || manifest.qa.s10ReplayLimit < 1)
    blockers.push('S10_REPLAY_POLICY_PENDING');
  if (!manifest.qa?.ttsDistributionRights?.approved)
    blockers.push('TTS_DISTRIBUTION_RIGHTS_PENDING');
  blockers.push('ACADEMIC_SIGNOFF_PENDING', 'PUBLICATION_NOT_AUTHORIZED');
  return {
    formCode: manifest.formCode,
    mechanicalPass: assetsGenerated,
    errors,
    assets,
    blockers,
    gates: {
      DRAFT: true,
      ASSETS_GENERATED: assetsGenerated,
      MEDIA_QA_PASS: false,
      ACADEMIC_APPROVED: false,
      PUBLISHED: false,
    },
    note: 'Technical validation and synthesis receipts do not verify spoken words or semantic scene fidelity. No database or publication mutation.',
  };
}

export function draftImportPlan(manifest) {
  return {
    executable: false,
    status: 'DRAFT',
    formCode: manifest.formCode,
    warning:
      'Review mapping only. This is an S/W supplement, never a complete FOUR_SKILLS test without audited LR200. No seed or publish operation.',
    runtimeRequirements: {
      informationReading: { questionIds: ['S8', 'S9', 'S10'], sharedSeconds: 45 },
      pictureSentences: { questionIds: ['W1', 'W2', 'W3', 'W4', 'W5'], sharedSeconds: 480 },
      s10ReplayLimit: manifest.qa?.s10ReplayLimit ?? null,
      status: 'PENDING_RUNTIME_POLICY_AND_ACADEMIC_REVIEW',
    },
    groups: manifest.questions.map((q, index) => ({
      questionId: q.questionId,
      skill: q.skill,
      taskCode:
        manifest.formCode === 'SE-SW-01' && q.questionId === 'S10'
          ? 'SE_SW_01_S10_V01'
          : manifest.formCode === 'SE-SW-01' && q.questionId === 'W5' && q.contentVersion === 'v02'
            ? 'SE_SW_01_W5_V02'
            : q.taskCode,
      contentVersion: q.contentVersion ?? 'v01',
      orderIndex: index,
      instructions: q.instructions,
      preparationSeconds: q.prepSeconds,
      responseSeconds: q.responseSeconds,
      maxRecordingSeconds: q.skill === 'SPEAKING' ? q.responseSeconds : null,
      question: {
        content: q.requiredWords?.length
          ? `${q.promptText}\nRequired words/phrases: ${q.requiredWords.join(' / ')}`
          : q.mediaAssetIds.some(
                (id) => manifest.assets.find((a) => a.assetId === id)?.kind === 'AUDIO',
              )
            ? 'Listen to the question and answer in English.'
            : q.promptText,
        toeicSkill: q.skill,
        responseType: q.responseType,
      },
      stimuli: [
        ...(q.informationSheetId
          ? [
              {
                type: 'TEXT',
                textContent: JSON.stringify(candidateInformationSheet(manifest.informationSheet)),
                isProtected: false,
              },
            ]
          : []),
        ...q.mediaAssetIds
          .map((id) => manifest.assets.find((a) => a.assetId === id))
          .map((a) => ({
            type: a.kind,
            storageKey: a.storageKey,
            mimeType: a.kind === 'IMAGE' ? 'image/png' : 'audio/wav',
            altText: `${q.questionId} stimulus`,
            isProtected: false,
          })),
      ].map((s, orderIndex) => ({ ...s, orderIndex })),
    })),
  };
}
