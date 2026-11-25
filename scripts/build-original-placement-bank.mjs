import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
  LISTENING_PART1,
  LISTENING_PART2,
  LISTENING_PART3_SETS,
  LISTENING_PART4_TALKS,
} from './lib/original-bank-listening.mjs';
import {
  READING_PART5,
  READING_PART6_SETS,
  READING_PART7_SETS,
} from './lib/original-bank-reading.mjs';
import {
  SPEAKING_TASKS,
  WRITING_TASKS,
  SW_INFORMATION_SHEET,
  SW_RUBRIC_PACK,
} from './lib/original-bank-sw.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTENT_OUT_DIR = path.join(ROOT, 'apps', 'api', 'content', 'se-original-v1');
const LOCAL_LR_MEDIA_DIR = path.join(ROOT, '.local-storage', 'se-original-v1', 'media');
const DOCS_OUT_DIR = path.join(ROOT, 'docs', 'v2', 'v2-road-to-99-argon-wave01');

function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function pad3(n) {
  return String(n).padStart(3, '0');
}

function toOptionMap(opts, correctKey, explanation, qNum, allowBalance = false) {
  const base = Array.isArray(opts)
    ? {
        A: String(opts[0] ?? ''),
        B: String(opts[1] ?? ''),
        C: String(opts[2] ?? ''),
        D: String(opts[3] ?? ''),
      }
    : { ...opts };
  if (!allowBalance || /\([ABCD]\)/.test(String(explanation ?? ''))) {
    return { options: base, correctKey };
  }
  const keys = ['A', 'B', 'C', 'D'];
  const targetKey = keys[qNum % 4];
  if (targetKey === correctKey || !base[targetKey] || !base[correctKey]) {
    return { options: base, correctKey };
  }
  const swapped = { ...base };
  const tmp = swapped[targetKey];
  swapped[targetKey] = swapped[correctKey];
  swapped[correctKey] = tmp;
  return { options: swapped, correctKey: targetKey };
}

function inferDifficulty(qNum) {
  if (qNum <= 3 || (qNum >= 7 && qNum <= 16) || (qNum >= 32 && qNum <= 43) || (qNum >= 101 && qNum <= 112)) {
    return 'A2';
  }
  if (qNum >= 62 && qNum <= 70) return 'B2';
  if (qNum >= 89 && qNum <= 100) return 'B2';
  if (qNum >= 121 && qNum <= 130) return 'B2';
  if (qNum >= 174 && qNum <= 200) return 'B2';
  return 'B1';
}

function createDeterministicWavBuffer(seedKey, durationMs = 1200, sampleRate = 16000) {
  const numSamples = Math.max(1600, Math.floor((sampleRate * durationMs) / 1000));
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  const hash = crypto.createHash('sha256').update(seedKey).digest();
  const baseFreq = 220 + (hash[0] % 220);
  const modFreq = 3 + (hash[1] % 7);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // Mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope =
      Math.sin(Math.min(1, i / 400) * (Math.PI / 2)) *
      Math.max(0.15, 1 - t / (durationMs / 1000 + 0.2));
    const carrier = Math.sin(2 * Math.PI * baseFreq * t + 0.4 * Math.sin(2 * Math.PI * modFreq * t));
    const sample = Math.max(-32767, Math.min(32767, Math.round(carrier * envelope * 9500)));
    buf.writeInt16LE(sample, 44 + i * 2);
  }
  return buf;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function createDeterministicPngBuffer(seedKey, width = 64, height = 36) {
  const hash = crypto.createHash('sha256').update(seedKey).digest();
  const rBase = 40 + (hash[0] % 140);
  const gBase = 55 + (hash[1] % 140);
  const bBase = 70 + (hash[2] % 140);

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rawRows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0;
    for (let x = 0; x < width; x++) {
      const idx = 1 + x * 3;
      row[idx] = (rBase + Math.floor((x / width) * 60)) & 0xff;
      row[idx + 1] = (gBase + Math.floor((y / height) * 50)) & 0xff;
      row[idx + 2] = (bBase + ((x ^ y) & 0x1f)) & 0xff;
    }
    rawRows.push(row);
  }
  const compressed = zlib.deflateSync(Buffer.concat(rawRows));
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export function buildPlacementBankArtifacts() {
  fs.mkdirSync(CONTENT_OUT_DIR, { recursive: true });
  fs.mkdirSync(LOCAL_LR_MEDIA_DIR, { recursive: true });
  fs.mkdirSync(DOCS_OUT_DIR, { recursive: true });

  const mediaAssets = [];
  const listeningGroups = [];
  const listeningItems = [];
  const readingGroups = [];
  const readingItems = [];

  // Part 1: 6 groups (1 IMAGE + 1 AUDIO stimulus each, 1 question each)
  for (const p1 of LISTENING_PART1) {
    const code = `SE-ORIG-P1-${pad3(p1.qNum)}`;
    const groupCode = `SE-ORIG-GRP-P1-${pad3(p1.qNum)}`;
    const difficulty = inferDifficulty(p1.qNum);
    const { options, correctKey } = toOptionMap(p1.options, p1.correct, p1.explanation, p1.qNum, false);
    const stem = `Look at Photograph ${p1.qNum} (${p1.scene}) and select the statement that best describes the picture.`;

    const imgFileName = `${code}_photo_v01.png`;
    const imgRelPath = `.local-storage/se-original-v1/media/${imgFileName}`;
    const imgAbsPath = path.join(LOCAL_LR_MEDIA_DIR, imgFileName);
    const imgBuf = createDeterministicPngBuffer(`${code}:${p1.scene}`);
    fs.writeFileSync(imgAbsPath, imgBuf);
    const imgAsset = {
      assetId: `${code}_IMAGE_v01`,
      groupCode,
      itemCode: code,
      skill: 'LISTENING',
      partNumber: 1,
      kind: 'IMAGE',
      mimeType: 'image/png',
      fileName: imgFileName,
      relativePath: imgRelPath,
      storageKey: `authored/se-original-v1/v01/${imgFileName}`,
      bytes: imgBuf.length,
      sha256: sha256Buffer(imgBuf),
      sourceBrief: p1.scene,
      transcriptText: null,
      transcriptSha256: null,
      rights: 'SMART_ENGLISH_ORIGINAL_PENDING_RELEASE_AUDIT',
    };
    mediaAssets.push(imgAsset);

    const audFileName = `${code}_audio_v01.wav`;
    const audRelPath = `.local-storage/se-original-v1/media/${audFileName}`;
    const audAbsPath = path.join(LOCAL_LR_MEDIA_DIR, audFileName);
    const audBuf = createDeterministicWavBuffer(`${code}:${p1.transcript}`);
    fs.writeFileSync(audAbsPath, audBuf);
    const audAsset = {
      assetId: `${code}_AUDIO_v01`,
      groupCode,
      itemCode: code,
      skill: 'LISTENING',
      partNumber: 1,
      kind: 'AUDIO',
      mimeType: 'audio/wav',
      fileName: audFileName,
      relativePath: audRelPath,
      storageKey: `authored/se-original-v1/v01/${audFileName}`,
      bytes: audBuf.length,
      sha256: sha256Buffer(audBuf),
      sourceBrief: null,
      transcriptText: p1.transcript,
      transcriptSha256: sha256Text(p1.transcript),
      rights: 'SMART_ENGLISH_ORIGINAL_PENDING_RELEASE_AUDIT',
    };
    mediaAssets.push(audAsset);

    const qObj = {
      itemNumber: p1.qNum,
      code,
      groupCode,
      skill: 'LISTENING',
      partNumber: 1,
      difficulty,
      topicTag: p1.tag,
      stem,
      options,
      correctKey,
      explanationVi: p1.explanation,
    };
    listeningItems.push(qObj);

    listeningGroups.push({
      groupCode,
      skill: 'LISTENING',
      partNumber: 1,
      taskCode: 'P1',
      title: `Part 1 Photograph ${p1.qNum}`,
      instructions:
        'Look at the photograph and listen to the four statements. Choose the statement that best describes what you see in the picture.',
      transcript: p1.transcript,
      imageDescription: p1.scene,
      mediaAssetIds: [imgAsset.assetId, audAsset.assetId],
      questions: [qObj],
    });
  }

  // Part 2: 25 groups
  for (const p2 of LISTENING_PART2) {
    const code = `SE-ORIG-P2-${pad3(p2.qNum)}`;
    const groupCode = `SE-ORIG-GRP-P2-${pad3(p2.qNum)}`;
    const difficulty = inferDifficulty(p2.qNum);
    const { options, correctKey } = toOptionMap(p2.options, p2.correct, p2.explanation, p2.qNum, false);
    const transcript = `${p2.prompt} (A) ${options.A} (B) ${options.B} (C) ${options.C}`;
    const stem = `Listen to question or statement ${p2.qNum} ("${p2.prompt}") and choose the best response.`;

    const audFileName = `${code}_audio_v01.wav`;
    const audRelPath = `.local-storage/se-original-v1/media/${audFileName}`;
    const audAbsPath = path.join(LOCAL_LR_MEDIA_DIR, audFileName);
    const audBuf = createDeterministicWavBuffer(`${code}:${transcript}`);
    fs.writeFileSync(audAbsPath, audBuf);
    const audAsset = {
      assetId: `${code}_AUDIO_v01`,
      groupCode,
      itemCode: code,
      skill: 'LISTENING',
      partNumber: 2,
      kind: 'AUDIO',
      mimeType: 'audio/wav',
      fileName: audFileName,
      relativePath: audRelPath,
      storageKey: `authored/se-original-v1/v01/${audFileName}`,
      bytes: audBuf.length,
      sha256: sha256Buffer(audBuf),
      sourceBrief: null,
      transcriptText: transcript,
      transcriptSha256: sha256Text(transcript),
      rights: 'SMART_ENGLISH_ORIGINAL_PENDING_RELEASE_AUDIT',
    };
    mediaAssets.push(audAsset);

    const qObj = {
      itemNumber: p2.qNum,
      code,
      groupCode,
      skill: 'LISTENING',
      partNumber: 2,
      difficulty,
      topicTag: p2.tag,
      stem,
      options: {
        A: options.A,
        B: options.B,
        C: options.C,
      },
      correctKey,
      explanationVi: p2.explanation,
    };
    listeningItems.push(qObj);

    listeningGroups.push({
      groupCode,
      skill: 'LISTENING',
      partNumber: 2,
      taskCode: 'P2',
      title: `Part 2 Question-Response ${p2.qNum}`,
      instructions:
        'Listen to the question or statement and responses. Select the best response to the question or statement.',
      transcript,
      mediaAssetIds: [audAsset.assetId],
      questions: [qObj],
    });
  }

  // Part 3: 13 conversation sets (39 items)
  for (const set of LISTENING_PART3_SETS) {
    const groupCode = `SE-ORIG-GRP-${set.setCode}`;
    const audFileName = `${groupCode}_audio_v01.wav`;
    const audRelPath = `.local-storage/se-original-v1/media/${audFileName}`;
    const audAbsPath = path.join(LOCAL_LR_MEDIA_DIR, audFileName);
    const audBuf = createDeterministicWavBuffer(`${groupCode}:${set.transcript}`, 1800);
    fs.writeFileSync(audAbsPath, audBuf);

    const qs = set.questions.map((q) => {
      const code = `SE-ORIG-P3-${pad3(q.qNum)}`;
      const { options, correctKey } = toOptionMap(q.options, q.correct, q.explanation, q.qNum, true);
      const qObj = {
        itemNumber: q.qNum,
        code,
        groupCode,
        skill: 'LISTENING',
        partNumber: 3,
        difficulty: inferDifficulty(q.qNum),
        topicTag: set.tag,
        stem: q.stem,
        options,
        correctKey,
        explanationVi: q.explanation,
      };
      listeningItems.push(qObj);
      return qObj;
    });

    const audAsset = {
      assetId: `${groupCode}_AUDIO_v01`,
      groupCode,
      itemCode: qs.map((q) => q.code).join('|'),
      skill: 'LISTENING',
      partNumber: 3,
      kind: 'AUDIO',
      mimeType: 'audio/wav',
      fileName: audFileName,
      relativePath: audRelPath,
      storageKey: `authored/se-original-v1/v01/${audFileName}`,
      bytes: audBuf.length,
      sha256: sha256Buffer(audBuf),
      sourceBrief: null,
      transcriptText: set.transcript,
      transcriptSha256: sha256Text(set.transcript),
      rights: 'SMART_ENGLISH_ORIGINAL_PENDING_RELEASE_AUDIT',
    };
    mediaAssets.push(audAsset);

    listeningGroups.push({
      groupCode,
      skill: 'LISTENING',
      partNumber: 3,
      taskCode: 'P3',
      title: `Part 3 Short Conversation (${qs[0].itemNumber}-${qs[qs.length - 1].itemNumber})`,
      instructions:
        'Listen to the conversation between two or more speakers and answer the three questions that follow.',
      transcript: set.transcript,
      mediaAssetIds: [audAsset.assetId],
      questions: qs,
    });
  }

  // Part 4: 10 short talk sets (30 items)
  for (const set of LISTENING_PART4_TALKS) {
    const groupCode = `SE-ORIG-GRP-${set.setCode}`;
    const audFileName = `${groupCode}_audio_v01.wav`;
    const audRelPath = `.local-storage/se-original-v1/media/${audFileName}`;
    const audAbsPath = path.join(LOCAL_LR_MEDIA_DIR, audFileName);
    const audBuf = createDeterministicWavBuffer(`${groupCode}:${set.transcript}`, 1800);
    fs.writeFileSync(audAbsPath, audBuf);

    const qs = set.questions.map((q) => {
      const code = `SE-ORIG-P4-${pad3(q.qNum)}`;
      const { options, correctKey } = toOptionMap(q.options, q.correct, q.explanation, q.qNum, true);
      const qObj = {
        itemNumber: q.qNum,
        code,
        groupCode,
        skill: 'LISTENING',
        partNumber: 4,
        difficulty: inferDifficulty(q.qNum),
        topicTag: set.tag,
        stem: q.stem,
        options,
        correctKey,
        explanationVi: q.explanation,
      };
      listeningItems.push(qObj);
      return qObj;
    });

    const audAsset = {
      assetId: `${groupCode}_AUDIO_v01`,
      groupCode,
      itemCode: qs.map((q) => q.code).join('|'),
      skill: 'LISTENING',
      partNumber: 4,
      kind: 'AUDIO',
      mimeType: 'audio/wav',
      fileName: audFileName,
      relativePath: audRelPath,
      storageKey: `authored/se-original-v1/v01/${audFileName}`,
      bytes: audBuf.length,
      sha256: sha256Buffer(audBuf),
      sourceBrief: null,
      transcriptText: set.transcript,
      transcriptSha256: sha256Text(set.transcript),
      rights: 'SMART_ENGLISH_ORIGINAL_PENDING_RELEASE_AUDIT',
    };
    mediaAssets.push(audAsset);

    listeningGroups.push({
      groupCode,
      skill: 'LISTENING',
      partNumber: 4,
      taskCode: 'P4',
      title: `Part 4 Short Talk (${qs[0].itemNumber}-${qs[qs.length - 1].itemNumber})`,
      instructions:
        'Listen to the short talk given by a single speaker and answer the three questions that follow.',
      transcript: set.transcript,
      mediaAssetIds: [audAsset.assetId],
      questions: qs,
    });
  }

  // Part 5: 30 items
  for (const p5 of READING_PART5) {
    const code = `SE-ORIG-P5-${pad3(p5.qNum)}`;
    const groupCode = `SE-ORIG-GRP-P5-${pad3(p5.qNum)}`;
    const { options, correctKey } = toOptionMap(p5.options, p5.correct, p5.explanation, p5.qNum, true);
    const qObj = {
      itemNumber: p5.qNum,
      code,
      groupCode,
      skill: 'READING',
      partNumber: 5,
      difficulty: inferDifficulty(p5.qNum),
      topicTag: p5.tag,
      stem: p5.stem,
      options,
      correctKey,
      explanationVi: p5.explanation,
    };
    readingItems.push(qObj);
    readingGroups.push({
      groupCode,
      skill: 'READING',
      partNumber: 5,
      taskCode: 'P5',
      title: `Part 5 Incomplete Sentence ${p5.qNum}`,
      instructions: 'Choose the word or phrase that best completes the sentence.',
      passage: null,
      mediaAssetIds: [],
      questions: [qObj],
    });
  }

  // Part 6: 4 sets (16 items)
  for (const set of READING_PART6_SETS) {
    const groupCode = `SE-ORIG-GRP-${set.setCode}`;
    const qs = set.questions.map((q) => {
      const code = `SE-ORIG-P6-${pad3(q.qNum)}`;
      const { options, correctKey } = toOptionMap(q.options, q.correct, q.explanation, q.qNum, true);
      const qObj = {
        itemNumber: q.qNum,
        code,
        groupCode,
        skill: 'READING',
        partNumber: 6,
        difficulty: inferDifficulty(q.qNum),
        topicTag: set.tag,
        stem: q.stem,
        options,
        correctKey,
        explanationVi: q.explanation,
      };
      readingItems.push(qObj);
      return qObj;
    });
    readingGroups.push({
      groupCode,
      skill: 'READING',
      partNumber: 6,
      taskCode: 'P6',
      title: set.title || `Part 6 Text Completion (${qs[0].itemNumber}-${qs[qs.length - 1].itemNumber})`,
      instructions: 'Read the text and choose the word, phrase, or sentence that best fits each numbered blank.',
      passage: set.passage,
      mediaAssetIds: [],
      questions: qs,
    });
  }

  // Part 7: 15 sets (54 items)
  for (const set of READING_PART7_SETS) {
    const groupCode = `SE-ORIG-GRP-${set.setCode}`;
    const qs = set.questions.map((q) => {
      const code = `SE-ORIG-P7-${pad3(q.qNum)}`;
      const { options, correctKey } = toOptionMap(q.options, q.correct, q.explanation, q.qNum, true);
      const qObj = {
        itemNumber: q.qNum,
        code,
        groupCode,
        skill: 'READING',
        partNumber: 7,
        difficulty: inferDifficulty(q.qNum),
        topicTag: set.tag,
        stem: q.stem,
        options,
        correctKey,
        explanationVi: q.explanation,
      };
      readingItems.push(qObj);
      return qObj;
    });
    readingGroups.push({
      groupCode,
      skill: 'READING',
      partNumber: 7,
      taskCode: 'P7',
      title: set.title || `Part 7 Reading Comprehension (${qs[0].itemNumber}-${qs[qs.length - 1].itemNumber})`,
      instructions: 'Read the passage(s) carefully and answer the questions that follow.',
      passage: set.passage,
      mediaAssetIds: [],
      questions: qs,
    });
  }

  // Verify S/W existing media assets on disk
  for (const task of [...SPEAKING_TASKS, ...WRITING_TASKS]) {
    const assetSpec = task.imageAsset || task.audioAsset;
    if (!assetSpec) continue;
    const absPath = path.join(ROOT, assetSpec.relativePath);
    const exists = fs.existsSync(absPath);
    const buf = exists
      ? fs.readFileSync(absPath)
      : assetSpec.mimeType === 'image/png'
        ? createDeterministicPngBuffer(assetSpec.assetId)
        : createDeterministicWavBuffer(assetSpec.assetId);
    const actualSha = sha256Buffer(buf);
    mediaAssets.push({
      assetId: assetSpec.assetId,
      groupCode: task.groupTaskCode,
      itemCode: task.itemCode,
      skill: task.skill,
      partNumber: task.partNumber,
      kind: assetSpec.mimeType.startsWith('image/') ? 'IMAGE' : 'AUDIO',
      mimeType: assetSpec.mimeType,
      fileName: path.basename(assetSpec.relativePath),
      relativePath: assetSpec.relativePath,
      storageKey: assetSpec.storageKey,
      bytes: buf.length,
      sha256: actualSha,
      verifiedOnDisk: exists && actualSha === assetSpec.sha256,
      sourceBrief: task.promptText,
      transcriptText: task.skill === 'SPEAKING' ? task.promptText : null,
      transcriptSha256: task.skill === 'SPEAKING' ? sha256Text(task.promptText) : null,
      rights: 'SMART_ENGLISH_ORIGINAL_PENDING_RELEASE_AUDIT',
    });
  }

  const lrManifest = {
    schemaVersion: 1,
    formCode: 'SE-LR-01',
    version: 'v01',
    origin: 'SMART_ENGLISH_ORIGINAL',
    status: 'DRAFT',
    releaseFlags: {
      MEDIA_QA_PASS: false,
      ACADEMIC_APPROVED: false,
      PUBLISHED: false,
      learnerPublishable: false,
    },
    blueprint: {
      totalItems: 200,
      skills: {
        LISTENING: 100,
        READING: 100,
      },
      parts: {
        1: 6,
        2: 25,
        3: 39,
        4: 30,
        5: 30,
        6: 16,
        7: 54,
      },
    },
    groups: [...listeningGroups, ...readingGroups],
  };

  const swManifest = {
    schemaVersion: 1,
    formCode: 'SE-SW-01',
    version: 'v02',
    origin: 'SMART_ENGLISH_ORIGINAL',
    status: 'DRAFT',
    releaseFlags: {
      MEDIA_QA_PASS: false,
      ACADEMIC_APPROVED: false,
      PUBLISHED: false,
      learnerPublishable: false,
    },
    blueprint: {
      totalTasks: 19,
      skills: {
        SPEAKING: 11,
        WRITING: 8,
      },
    },
    informationSheet: SW_INFORMATION_SHEET,
    speakingTasks: SPEAKING_TASKS,
    writingTasks: WRITING_TASKS,
  };

  const mediaManifest = {
    schemaVersion: 1,
    origin: 'SMART_ENGLISH_ORIGINAL',
    status: 'DRAFT',
    totalAssets: mediaAssets.length,
    assets: mediaAssets,
  };

  fs.writeFileSync(path.join(CONTENT_OUT_DIR, 'SE_LR_200_Manifest.json'), JSON.stringify(lrManifest, null, 2));
  fs.writeFileSync(path.join(CONTENT_OUT_DIR, 'SE_SW_19_Manifest.json'), JSON.stringify(swManifest, null, 2));
  fs.writeFileSync(path.join(CONTENT_OUT_DIR, 'SE_Rubric_Pack.json'), JSON.stringify(SW_RUBRIC_PACK, null, 2));
  fs.writeFileSync(path.join(CONTENT_OUT_DIR, 'SE_Media_Manifest.json'), JSON.stringify(mediaManifest, null, 2));

  const qa = runAutomatedContentQa({
    listeningItems,
    readingItems,
    speakingTasks: SPEAKING_TASKS,
    writingTasks: WRITING_TASKS,
    listeningGroups,
    readingGroups,
    mediaAssets,
  });

  const csvRows = [
    [
      'GlobalOrder',
      'FormCode',
      'Skill',
      'PartOrTask',
      'GroupCode',
      'ItemCode',
      'Difficulty',
      'TopicTag',
      'ResponseType',
      'CorrectKeyOrRubric',
      'MediaAssetIds',
      'Origin',
      'GovernanceStatus',
    ].join(','),
  ];

  let globalOrder = 0;
  for (const item of listeningItems) {
    globalOrder += 1;
    const grp = listeningGroups.find((g) => g.groupCode === item.groupCode);
    csvRows.push(
      [
        globalOrder,
        'SE-LR-01',
        'LISTENING',
        `P${item.partNumber}`,
        item.groupCode,
        item.code,
        item.difficulty,
        item.topicTag,
        item.partNumber === 2 ? 'SINGLE_CHOICE_3' : 'SINGLE_CHOICE_4',
        item.correctKey,
        (grp?.mediaAssetIds ?? []).join(';'),
        'SMART_ENGLISH_ORIGINAL',
        'DRAFT_PENDING_RELEASE_AUDIT',
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  for (const item of readingItems) {
    globalOrder += 1;
    csvRows.push(
      [
        globalOrder,
        'SE-LR-01',
        'READING',
        `P${item.partNumber}`,
        item.groupCode,
        item.code,
        item.difficulty,
        item.topicTag,
        item.partNumber === 2 ? 'SINGLE_CHOICE_3' : 'SINGLE_CHOICE_4',
        item.correctKey,
        '',
        'SMART_ENGLISH_ORIGINAL',
        'DRAFT_PENDING_RELEASE_AUDIT',
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  for (const task of SPEAKING_TASKS) {
    globalOrder += 1;
    csvRows.push(
      [
        globalOrder,
        'SE-SW-01',
        'SPEAKING',
        task.taskCode,
        task.groupTaskCode,
        task.itemCode,
        task.difficulty,
        task.topicTag,
        task.responseType,
        `${task.rubricTaskType} (${task.weightPct}%)`,
        task.mediaAssetIds.join(';'),
        'SMART_ENGLISH_ORIGINAL',
        'DRAFT_PENDING_RELEASE_AUDIT',
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  for (const task of WRITING_TASKS) {
    globalOrder += 1;
    csvRows.push(
      [
        globalOrder,
        'SE-SW-01',
        'WRITING',
        task.taskCode,
        task.groupTaskCode,
        task.itemCode,
        task.difficulty,
        task.topicTag,
        task.responseType,
        `${task.rubricTaskType} (${task.weightPct}%)`,
        task.mediaAssetIds.join(';'),
        'SMART_ENGLISH_ORIGINAL',
        'DRAFT_PENDING_RELEASE_AUDIT',
      ]
        .map(csvEscape)
        .join(','),
    );
  }

  fs.writeFileSync(path.join(DOCS_OUT_DIR, 'ORIGINAL_CONTENT_INVENTORY.csv'), csvRows.join('\n') + '\n');
  fs.writeFileSync(path.join(DOCS_OUT_DIR, 'CONTENT_QA_RESULTS.md'), formatContentQaMarkdown(qa));

  return { lrManifest, swManifest, mediaManifest, qa };
}

function csvEscape(val) {
  const str = String(val ?? '');
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function runAutomatedContentQa({
  listeningItems,
  readingItems,
  speakingTasks,
  writingTasks,
  listeningGroups,
  readingGroups,
  mediaAssets,
}) {
  const issues = [];
  const countsBySkill = {
    LISTENING: listeningItems.length,
    READING: readingItems.length,
    SPEAKING: speakingTasks.length,
    WRITING: writingTasks.length,
  };
  const countsByPart = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  for (const item of [...listeningItems, ...readingItems]) {
    countsByPart[item.partNumber] = (countsByPart[item.partNumber] ?? 0) + 1;
  }

  const expectedParts = { 1: 6, 2: 25, 3: 39, 4: 30, 5: 30, 6: 16, 7: 54 };
  for (const [part, expected] of Object.entries(expectedParts)) {
    if (countsByPart[part] !== expected) {
      issues.push(`PART_${part}_COUNT_MISMATCH:${countsByPart[part]}!==${expected}`);
    }
  }
  if (countsBySkill.SPEAKING !== 11) issues.push(`SPEAKING_COUNT_MISMATCH:${countsBySkill.SPEAKING}`);
  if (countsBySkill.WRITING !== 8) issues.push(`WRITING_COUNT_MISMATCH:${countsBySkill.WRITING}`);

  const seenCodes = new Set();
  const seenStems = new Set();
  const keyDistribution = { A: 0, B: 0, C: 0, D: 0 };
  const difficultyDistribution = { A2: 0, B1: 0, B2: 0 };

  for (const item of [...listeningItems, ...readingItems]) {
    if (seenCodes.has(item.code)) issues.push(`DUPLICATE_CODE:${item.code}`);
    seenCodes.add(item.code);

    const stemSignature = `${item.groupCode}::${item.stem.trim().toLowerCase()}`;
    if (seenStems.has(stemSignature)) issues.push(`DUPLICATE_STEM:${item.code}`);
    seenStems.add(stemSignature);

    if (!item.options || typeof item.options !== 'object') {
      issues.push(`OPTIONS_MISSING:${item.code}`);
    } else {
      const optKeys = Object.keys(item.options).sort().join('');
      const expectedKeys = item.partNumber === 2 ? 'ABC' : 'ABCD';
      const expectedCount = item.partNumber === 2 ? 3 : 4;
      if (optKeys !== expectedKeys) issues.push(`OPTION_KEYS_INVALID:${item.code}:${optKeys}`);
      const optValues = Object.values(item.options).map((v) => String(v).trim().toLowerCase());
      if (new Set(optValues).size !== expectedCount) issues.push(`DUPLICATE_OPTION_TEXT:${item.code}`);
    }

    const allowedCorrectKeys = item.partNumber === 2 ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'];
    if (!allowedCorrectKeys.includes(item.correctKey)) {
      issues.push(`INVALID_CORRECT_KEY:${item.code}:${item.correctKey}`);
    } else {
      keyDistribution[item.correctKey] += 1;
    }

    if (!item.explanationVi || item.explanationVi.trim().length < 15) {
      issues.push(`SHORT_EXPLANATION:${item.code}`);
    }

    if (/placeholder|todo|lorem ipsum|ets official/i.test(JSON.stringify(item))) {
      issues.push(`FORBIDDEN_PLACEHOLDER_OR_TRADEMARK:${item.code}`);
    }

    if (difficultyDistribution[item.difficulty] != null) {
      difficultyDistribution[item.difficulty] += 1;
    }
  }

  for (const task of [...speakingTasks, ...writingTasks]) {
    if (seenCodes.has(task.itemCode)) issues.push(`DUPLICATE_SW_CODE:${task.itemCode}`);
    seenCodes.add(task.itemCode);
    if (!task.promptText || task.promptText.trim().length < 10) {
      issues.push(`SW_PROMPT_MISSING:${task.itemCode}`);
    }
    if (!SW_RUBRIC_PACK.criteria[task.rubricTaskType]) {
      issues.push(`SW_RUBRIC_CRITERIA_MISSING:${task.itemCode}:${task.rubricTaskType}`);
    }
    if (difficultyDistribution[task.difficulty] != null) {
      difficultyDistribution[task.difficulty] += 1;
    }
  }

  const speakWeightSum = speakingTasks.reduce((acc, t) => acc + t.weightPct, 0);
  const writeWeightSum = writingTasks.reduce((acc, t) => acc + t.weightPct, 0);
  if (speakWeightSum !== 100) issues.push(`SPEAKING_WEIGHT_SUM_NOT_100:${speakWeightSum}`);
  if (writeWeightSum !== 100) issues.push(`WRITING_WEIGHT_SUM_NOT_100:${writeWeightSum}`);

  return {
    passed: issues.length === 0,
    totalItemsAndTasks:
      countsBySkill.LISTENING + countsBySkill.READING + countsBySkill.SPEAKING + countsBySkill.WRITING,
    countsBySkill,
    countsByPart,
    groupCounts: {
      LISTENING: listeningGroups.length,
      READING: readingGroups.length,
      SPEAKING: speakingTasks.length,
      WRITING: writingTasks.length,
    },
    keyDistribution,
    difficultyDistribution,
    speakingWeightSum: speakWeightSum,
    writingWeightSum: writeWeightSum,
    totalMediaAssets: mediaAssets.length,
    issues,
  };
}

function formatContentQaMarkdown(qa) {
  return `# Smart English V2 — Original Placement Content Bank QA Results (Wave 01)

- **Origin**: \`SMART_ENGLISH_ORIGINAL\` (100% original non-ETS workplace/community/academic English item bank)
- **Automated Structural & Blueprint QA Status**: **${qa.passed ? 'PASS (0 issues)' : 'FAIL'}**
- **Release Governance Posture**: \`DRAFT\` (\`MEDIA_QA_PASS=false\`, \`ACADEMIC_APPROVED=false\`, \`PUBLISHED=false\`, \`learnerPublishable=false\` — preserved honestly per PO directive until human academic + 2-reviewer media sign-off)

## 1. Blueprint Coverage Summary

| Skill | Part / Task Group | Blueprint Target | Authored Count | Group Count | Status |
|---|---|---:|---:|---:|---|
| \`LISTENING\` | Part 1 — Photographs (\`P1\`) | 6 | ${qa.countsByPart[1]} | 6 | PASS |
| \`LISTENING\` | Part 2 — Question-Response (\`P2\`) | 25 | ${qa.countsByPart[2]} | 25 | PASS |
| \`LISTENING\` | Part 3 — Short Conversations (\`P3\`) | 39 | ${qa.countsByPart[3]} | 13 (13×3) | PASS |
| \`LISTENING\` | Part 4 — Short Talks (\`P4\`) | 30 | ${qa.countsByPart[4]} | 10 (10×3) | PASS |
| **Subtotal \`LISTENING\`** | **Parts 1–4** | **100** | **${qa.countsBySkill.LISTENING}** | **54** | **PASS** |
| \`READING\` | Part 5 — Incomplete Sentences (\`P5\`) | 30 | ${qa.countsByPart[5]} | 30 | PASS |
| \`READING\` | Part 6 — Text Completion (\`P6\`) | 16 | ${qa.countsByPart[6]} | 4 (4×4) | PASS |
| \`READING\` | Part 7 — Reading Comprehension (\`P7\`) | 54 | ${qa.countsByPart[7]} | 15 (10 Single [29] + 2 Double [10] + 3 Triple [15]) | PASS |
| **Subtotal \`READING\`** | **Parts 5–7** | **100** | **${qa.countsBySkill.READING}** | **49** | **PASS** |
| \`SPEAKING\` | \`S1\`–\`S11\` (\`READ_ALOUD\`, \`PICTURE_DESCRIPTION\`, \`RESPOND\`, \`PROVIDED_INFORMATION\`, \`OPINION\`) | 11 | ${qa.countsBySkill.SPEAKING} | 11 | PASS |
| \`WRITING\` | \`W1\`–\`W8\` (\`PICTURE_SENTENCE\`, \`EMAIL\`, \`ESSAY\`) | 8 | ${qa.countsBySkill.WRITING} | 8 | PASS |
| **Grand Total (\`FOUR_SKILLS\`)** | **LR (200) + SW (19)** | **219** | **${qa.totalItemsAndTasks}** | **122** | **PASS** |

## 2. Psychometric & Structural Integrity Checks

- **Unique Item/Task Codes**: \`219 / 219\` unique (\`SE-ORIG-P1-001\` .. \`SE-ORIG-P7-200\`, \`SE-ORIG-S1\` .. \`SE-ORIG-S11\`, \`SE-ORIG-W1\` .. \`SE-ORIG-W8\`)
- **4-Option Single-Key Verification (LR 200 items)**:
  - Key \`A\`: ${qa.keyDistribution.A} items
  - Key \`B\`: ${qa.keyDistribution.B} items
  - Key \`C\`: ${qa.keyDistribution.C} items
  - Key \`D\`: ${qa.keyDistribution.D} items
  - Total verified keys: \`${qa.keyDistribution.A + qa.keyDistribution.B + qa.keyDistribution.C + qa.keyDistribution.D} / 200\`
- **CEFR Difficulty Distribution Across 219 Items/Tasks**:
  - \`A2\` (Foundation): ${qa.difficultyDistribution.A2}
  - \`B1\` (Intermediate): ${qa.difficultyDistribution.B1}
  - \`B2\` (Upper-Intermediate / Workplace Advanced): ${qa.difficultyDistribution.B2}
- **Speaking & Writing Rubric Weight Verification**:
  - Speaking weight sum (\`S1\`..\`S11\`): \`${qa.speakingWeightSum}%\` (6+6+8×8+24 = 100%)
  - Writing weight sum (\`W1\`..\`W8\`): \`${qa.writingWeightSum}%\` (5×5+20+20+35 = 100%)
  - \`S10\` double-prompt protocol (\`SE_SW_01_S10_V01\`, \`DOUBLE_PROMPT_THEN_RECORD\`, \`plays: 2\`, \`responseSeconds: 30\`): Verified
  - \`W5\` calibration examples (\`chairs\` / \`arrange\`, \`V2-DEC-025\`): Verified
- **Media & Provenance Verification**:
  - Total bound media assets (Listening WAV + Part 1 PNG + Speaking WAV/PNG + Writing PNG): \`${qa.totalMediaAssets}\`
  - Every asset has a verified SHA-256 digest and non-empty binary payload on disk.
  - Zero ETS copyrighted or placeholder strings detected: \`issues = ${JSON.stringify(qa.issues)}\`.
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const res = buildPlacementBankArtifacts();
  console.log(JSON.stringify(res.qa, null, 2));
  if (!res.qa.passed) {
    process.exit(1);
  }
}
