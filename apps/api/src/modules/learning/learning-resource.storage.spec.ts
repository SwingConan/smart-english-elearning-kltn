import { BadRequestException } from '@nestjs/common';
import { LocalLearningResourceStorage } from './learning-resource.storage';

describe('LocalLearningResourceStorage', () => {
  const storage = new LocalLearningResourceStorage();

  it.each(['../secret.txt', '..\\secret.txt', '/secret.txt'])('rejects unsafe names: %s', async (originalname) => {
    const buffer = Buffer.from('safe text');
    await expect(storage.put({ buffer, size: buffer.length, mimetype: 'text/plain', originalname })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects oversize metadata before writing', async () => {
    await expect(storage.put({ buffer: Buffer.from('x'), size: 20 * 1024 * 1024 + 1, mimetype: 'text/plain', originalname: 'large.txt' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects MIME/extension and content signature mismatches', async () => {
    await expect(storage.put({ buffer: Buffer.from('plain'), size: 5, mimetype: 'application/pdf', originalname: 'fake.txt' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(storage.put({ buffer: Buffer.from('plain'), size: 5, mimetype: 'application/pdf', originalname: 'fake.pdf' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects path traversal keys on delivery', () => {
    expect(() => storage.open('../secret.txt')).toThrow(BadRequestException);
  });
});
