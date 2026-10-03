import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalAssessmentResponseStorage } from './assessment-response.storage';

describe('LocalAssessmentResponseStorage', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'assessment-response-storage-'));
    process.env.ASSESSMENT_RESPONSE_STORAGE_ROOT = root;
  });

  afterEach(async () => {
    delete process.env.ASSESSMENT_RESPONSE_STORAGE_ROOT;
    await rm(root, { recursive: true, force: true });
  });

  it('generates an owner-scoped key and round-trips response bytes', async () => {
    const storage = new LocalAssessmentResponseStorage();
    const stored = await storage.put(
      { learnerId: 'learner', attemptId: 'attempt', testQuestionId: 'question' },
      Buffer.from('audio fixture'),
      'audio/webm',
    );

    expect(stored.key).toMatch(/^learner\/attempt\/question\/[0-9a-f-]+\.webm$/);
    await expect(storage.read(stored.key)).resolves.toEqual(Buffer.from('audio fixture'));
    await storage.delete(stored.key);
    await expect(storage.read(stored.key)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each(['../escape.webm', '/absolute.webm', 'owner\\escape.webm'])(
    'rejects an unsafe client-independent storage key: %s',
    (key) => {
      const storage = new LocalAssessmentResponseStorage();
      expect(() => storage.read(key)).toThrow('Invalid assessment response storage key.');
    },
  );
});
