import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalUserAvatarStorage, USER_AVATAR_MAX_BYTES } from './user-avatar.storage';

describe('LocalUserAvatarStorage', () => {
  let root: string;
  let previousRoot: string | undefined;
  let storage: LocalUserAvatarStorage;

  beforeEach(async () => {
    previousRoot = process.env.USER_AVATAR_STORAGE_ROOT;
    root = await mkdtemp(join(tmpdir(), 'm11-avatar-'));
    process.env.USER_AVATAR_STORAGE_ROOT = root;
    storage = new LocalUserAvatarStorage();
  });

  afterEach(async () => {
    if (previousRoot === undefined) delete process.env.USER_AVATAR_STORAGE_ROOT;
    else process.env.USER_AVATAR_STORAGE_ROOT = previousRoot;
    await rm(root, { recursive: true, force: true });
  });

  it('stores, opens and deletes a signature-valid managed image', async () => {
    const buffer = Buffer.from('89504e470d0a1a0a00000000', 'hex');
    const stored = await storage.put({
      buffer,
      mimetype: 'image/png',
      originalname: 'avatar.png',
      size: buffer.length,
    });

    expect(stored.key).toMatch(/^[0-9a-f-]{36}\.png$/);
    await expect(storage.open(stored.key)).resolves.toMatchObject({
      mimeType: 'image/png',
      sizeBytes: buffer.length,
    });
    await storage.delete(stored.key);
    await expect(storage.open(stored.key)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects MIME spoofing, unsafe names, invalid keys and oversized files', async () => {
    const spoofed = Buffer.from('not-a-real-png');
    await expect(
      storage.put({
        buffer: spoofed,
        mimetype: 'image/png',
        originalname: 'avatar.png',
        size: spoofed.length,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      storage.put({
        buffer: Buffer.from([0xff, 0xd8, 0xff]),
        mimetype: 'image/jpeg',
        originalname: '../avatar.jpg',
        size: 3,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(storage.open('../avatar.png')).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      storage.put({
        buffer: Buffer.alloc(1),
        mimetype: 'image/png',
        originalname: 'avatar.png',
        size: USER_AVATAR_MAX_BYTES + 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
