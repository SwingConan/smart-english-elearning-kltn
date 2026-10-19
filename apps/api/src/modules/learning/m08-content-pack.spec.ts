import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadAndValidateM08ContentPack } from '../../../prisma/m08-seed';

const contentRoot = resolve(__dirname, '../../../content/m08');

describe('M08 canonical curriculum and practice pack', () => {
  it('locks the authoritative manifest hashes', () => {
    const fixtures = [
      ['M08_Canonical_Curriculum_Content_Manifest_v1.json', '6321879525FCCEEB0466FF7710BAFA013F981206245DCD71F2A4C8FCDA7D8D4C'],
      ['M08_Test2_Practice_Content_Manifest_v1.json', '64FDD32FDC36304BDAC013875A5B3E2601DC90DF994AD992825CE98305AC28F3'],
      ['M08_Test2_Practice_Media_Manifest_v1.json', '8C78DE879AF29860815CAF9F717FCDC0A550B5A7895C2FC16A61924D34CC7598'],
    ] as const;
    for (const [name, expected] of fixtures) {
      const digest = createHash('sha256').update(readFileSync(resolve(contentRoot, name))).digest('hex');
      expect(digest.toUpperCase()).toBe(expected);
    }
  });

  it('contains exactly the approved curriculum, question, and runtime media counts', () => {
    expect(loadAndValidateM08ContentPack()).toEqual({
      moduleCount: 9,
      lessonCount: 20,
      questionCount: 82,
      runtimeMediaCount: 32,
    });
  });
});
