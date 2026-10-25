import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LocalPublicContentAssetStorage,
  PUBLIC_CONTENT_ASSET_MAX_BYTES,
} from './public-content-asset.storage';

describe('LocalPublicContentAssetStorage', () => {
  let root: string;
  let previousRoot: string | undefined;
  let storage: LocalPublicContentAssetStorage;

  beforeEach(async () => {
    previousRoot = process.env.PUBLIC_CONTENT_ASSET_STORAGE_ROOT;
    root = await mkdtemp(join(tmpdir(), 'm11-public-asset-'));
    process.env.PUBLIC_CONTENT_ASSET_STORAGE_ROOT = root;
    storage = new LocalPublicContentAssetStorage();
  });

  afterEach(async () => {
    if (previousRoot === undefined) delete process.env.PUBLIC_CONTENT_ASSET_STORAGE_ROOT;
    else process.env.PUBLIC_CONTENT_ASSET_STORAGE_ROOT = previousRoot;
    await rm(root, { recursive: true, force: true });
  });

  it('owns the full managed-image lifecycle', async () => {
    const buffer = Buffer.from('524946460000000057454250', 'hex');
    const stored = await storage.put({
      buffer,
      mimetype: 'image/webp',
      originalname: 'article.webp',
      size: buffer.length,
    });
    expect(stored).toMatchObject({ mimeType: 'image/webp', sizeBytes: buffer.length });
    await expect(storage.open(stored.key)).resolves.toMatchObject({
      mimeType: 'image/webp',
      sizeBytes: buffer.length,
    });
    await storage.delete(stored.key);
    await expect(storage.open(stored.key)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects signature spoofing, unsafe keys and oversized uploads', async () => {
    const spoofed = Buffer.from('not-a-real-image');
    await expect(
      storage.put({
        buffer: spoofed,
        mimetype: 'image/webp',
        originalname: 'article.webp',
        size: spoofed.length,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(storage.open('../../article.webp')).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      storage.put({
        buffer: Buffer.alloc(1),
        mimetype: 'image/jpeg',
        originalname: 'article.jpg',
        size: PUBLIC_CONTENT_ASSET_MAX_BYTES + 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
