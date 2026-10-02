import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const contentRoot = resolve(root, 'apps/api/content/m05');
const readJson = (name) => JSON.parse(readFileSync(resolve(contentRoot, name), 'utf8'));
const fail = (message) => { throw new Error(`M05 manifest invalid: ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };

const knownAnswers = new Map([
  [3, 'B'], [7, 'C'], [32, 'A'], [33, 'C'], [34, 'B'], [71, 'A'], [72, 'C'],
  [73, 'B'], [101, 'B'], [102, 'C'], [131, 'B'], [132, 'A'], [147, 'A'],
  [148, 'C'], [191, 'D'], [194, 'A'],
]);

export function validateM05Pack({ lr, speaking, writing, rubricPack, mediaManifest }, verifyAssets = true) {
  const mediaKeys = mediaManifest.assets.map((asset) => asset.mediaKey);
  assert(new Set(mediaKeys).size === mediaKeys.length, 'duplicate mediaKey in media manifest');
  const media = new Map(mediaManifest.assets.map((asset) => [asset.mediaKey, asset]));
  const rubrics = new Map(rubricPack.rubrics.map((rubric) => [rubric.code, rubric]));
  assert(rubrics.size === rubricPack.rubrics.length, 'duplicate rubric code');
  const contentKeys = new Set();
  const referencedMedia = new Set();
  const addKey = (key) => {
    assert(typeof key === 'string' && key.length > 0, 'missing contentKey');
    assert(!contentKeys.has(key), `duplicate contentKey ${key}`);
    contentKeys.add(key);
  };
  const validateStimuli = (owner, stimuli) => {
    assert(Array.isArray(stimuli), `invalid stimuli collection in ${owner}`);
    const indexes = stimuli.map((stimulus) => stimulus.orderIndex);
    assert(new Set(indexes).size === indexes.length, `duplicate stimulus orderIndex in ${owner}`);
    assert(indexes.every((value, index) => value === index), `non-contiguous stimulus order in ${owner}`);
    for (const stimulus of stimuli) {
      assert(['TEXT', 'IMAGE', 'AUDIO'].includes(stimulus.type), `bad stimulus type in ${owner}`);
      if (stimulus.type === 'TEXT') {
        assert(typeof stimulus.textContent === 'string' && stimulus.textContent.length > 0, `TEXT payload missing in ${owner}`);
        assert(!stimulus.mediaKey, `TEXT has mediaKey in ${owner}`);
      } else {
        assert(typeof stimulus.mediaKey === 'string', `mediaKey missing in ${owner}`);
        assert(media.has(stimulus.mediaKey), `unknown mediaKey ${stimulus.mediaKey}`);
        referencedMedia.add(stimulus.mediaKey);
      }
    }
  };

  const bySkill = new Map();
  for (const section of lr.sections) {
    const selected = [];
    for (const group of section.groups) {
      addKey(group.contentKey);
      validateStimuli(group.contentKey, group.stimuli);
      for (const question of group.questions) {
        addKey(question.contentKey);
        selected.push(question.sourceNumber);
        const optionKeys = question.options.map((option) => option.key);
        assert(new Set(optionKeys).size === optionKeys.length, `duplicate option key in ${question.contentKey}`);
        assert(optionKeys.includes(question.correctOptionKey), `answer not in options for ${question.contentKey}`);
        assert(knownAnswers.get(question.sourceNumber) === question.correctOptionKey, `approved answer mismatch for Q${question.sourceNumber}`);
      }
    }
    assert(new Set(selected).size === selected.length, `duplicate source number in ${section.skill}`);
    bySkill.set(section.skill, selected);
  }
  assert(bySkill.get('LISTENING')?.length === 8, 'Listening selected count must be 8');
  assert(bySkill.get('READING')?.length === 8, 'Reading selected count must be 8');

  for (const task of [...speaking.tasks, ...writing.tasks]) {
    addKey(task.contentKey);
    assert(rubrics.has(task.rubricCode), `missing rubric ${task.rubricCode}`);
    validateStimuli(task.contentKey, task.stimuli);
  }
  for (const rubric of rubrics.values()) {
    assert(Array.isArray(rubric.criteria) && rubric.criteria.length > 0, `empty rubric ${rubric.code}`);
    const orders = rubric.criteria.map((criterion) => criterion.orderIndex);
    assert(new Set(orders).size === orders.length, `duplicate criterion order in ${rubric.code}`);
    assert(orders.every((value, index) => value === index), `invalid criterion order in ${rubric.code}`);
    const weight = rubric.criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
    assert(Math.abs(weight - 1) < 1e-9, `rubric weights do not sum to 1 in ${rubric.code}`);
  }
  assert([...referencedMedia].every((key) => media.has(key)), 'referenced media assets are absent');
  if (verifyAssets) {
    for (const asset of media.values()) {
      const path = resolve(root, asset.proposedRuntimePath);
      assert(existsSync(path), `static asset missing: ${asset.proposedRuntimePath}`);
      const body = readFileSync(path);
      assert(body.length === asset.bytes, `byte count mismatch: ${asset.mediaKey}`);
      assert(createHash('sha256').update(body).digest('hex') === asset.sha256, `SHA-256 mismatch: ${asset.mediaKey}`);
    }
  }
  return { speaking: speaking.tasks.length, writing: writing.tasks.length, rubrics: rubrics.size, assets: media.size };
}

const pack = {
  lr: readJson('M05_Test1_LR_Content_Manifest.json'),
  speaking: readJson('M05_Speaking_Content_Pack.json'),
  writing: readJson('M05_Writing_Content_Pack.json'),
  rubricPack: readJson('M05_Rubric_Pack.json'),
  mediaManifest: readJson('M05_Media_Manifest.json'),
};
const counts = validateM05Pack(pack);
const malformed = structuredClone(pack);
malformed.lr.sections[0].groups[0].questions[0].correctOptionKey = 'NOT_AN_OPTION';
let malformedRejected = false;
try {
  validateM05Pack(malformed, false);
} catch (error) {
  malformedRejected = error instanceof Error && error.message.includes('answer not in options');
}
assert(malformedRejected, 'malformed regression fixture was unexpectedly accepted');

console.log(`M05 manifest valid: 8 Listening, 8 Reading, ${counts.speaking} Speaking, ${counts.writing} Writing, ${counts.rubrics} rubrics, ${counts.assets} assets; malformed fixture rejected.`);
