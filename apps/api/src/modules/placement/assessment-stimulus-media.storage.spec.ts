import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  AssessmentStimulusMediaStorage,
  AssessmentStimulusMediaUnavailableError,
  InvalidAssessmentStimulusMediaKeyError,
  resolveAssessmentStimulusMediaRoot,
} from './assessment-stimulus-media.storage';

describe('AssessmentStimulusMediaStorage', () => {
  const originalRoot = process.env.ASSESSMENT_STIMULUS_MEDIA_ROOT;

  afterEach(() => {
    if (originalRoot === undefined) delete process.env.ASSESSMENT_STIMULUS_MEDIA_ROOT;
    else process.env.ASSESSMENT_STIMULUS_MEDIA_ROOT = originalRoot;
  });

  it('finds the tracked media root from a compiled Nest module directory', () => {
    expect(
      resolveAssessmentStimulusMediaRoot(resolve(process.cwd(), 'dist/src/modules/placement')),
    ).toBe(resolve(process.cwd(), 'assets/assessment/m05'));
  });

  it('reads an actual committed M05 asset and rejects traversal', async () => {
    delete process.env.ASSESSMENT_STIMULUS_MEDIA_ROOT;
    const storage = new AssessmentStimulusMediaStorage();
    await expect(storage.read('test1/images/T1-L-P1-Q003.jpg')).resolves.toEqual(
      expect.any(Buffer),
    );
    await expect(storage.read('../package.json')).rejects.toBeInstanceOf(
      InvalidAssessmentStimulusMediaKeyError,
    );
  });

  it('reports a controlled unavailable-media error before a response stream is created', async () => {
    const emptyRoot = await mkdtemp(join(tmpdir(), 'm05-missing-media-'));
    process.env.ASSESSMENT_STIMULUS_MEDIA_ROOT = emptyRoot;
    const storage = new AssessmentStimulusMediaStorage();
    await expect(storage.read('test1/audio/missing.mp3')).rejects.toBeInstanceOf(
      AssessmentStimulusMediaUnavailableError,
    );
    await rm(emptyRoot, { recursive: true, force: true });
  });
});
