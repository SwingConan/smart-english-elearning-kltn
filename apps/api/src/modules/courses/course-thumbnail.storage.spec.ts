import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  COURSE_THUMBNAIL_MAX_BYTES,
  LocalCourseThumbnailStorage,
} from './course-thumbnail.storage';

describe('LocalCourseThumbnailStorage', () => {
  let root: string;
  let storage: LocalCourseThumbnailStorage;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'course-thumbnails-'));
    process.env.COURSE_THUMBNAIL_STORAGE_ROOT = root;
    storage = new LocalCourseThumbnailStorage();
  });

  afterEach(async () => {
    delete process.env.COURSE_THUMBNAIL_STORAGE_ROOT;
    await rm(root, { recursive: true, force: true });
  });

  it.each([
    ['photo.jpg', 'image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xdb])],
    ['photo.png', 'image/png', Buffer.from('89504e470d0a1a0a', 'hex')],
    ['photo.webp', 'image/webp', Buffer.from('RIFF1234WEBP')],
  ])('stores and safely opens a valid %s image', async (originalname, mimetype, buffer) => {
    const stored = await storage.put({ originalname, mimetype, buffer, size: buffer.length });
    expect(stored.key).not.toContain(originalname);
    expect(await readFile(join(root, stored.key))).toEqual(buffer);
    const opened = await storage.open(stored.key);
    expect(opened.mimeType).toBe(mimetype);
    opened.stream.destroy();
  });

  it.each([
    ['icon.svg', 'image/svg+xml', Buffer.from('<svg/>')],
    ['animation.gif', 'image/gif', Buffer.from('GIF89a')],
    ['fake.png', 'image/png', Buffer.from('not png')],
    ['fake.jpg', 'image/png', Buffer.from('89504e470d0a1a0a', 'hex')],
    ['../escape.png', 'image/png', Buffer.from('89504e470d0a1a0a', 'hex')],
  ])(
    'rejects unsupported, mismatched, or suspicious input %s',
    async (originalname, mimetype, buffer) => {
      await expect(
        storage.put({ originalname, mimetype, buffer, size: buffer.length }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('rejects empty, oversized, and inconsistent uploads', async () => {
    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    await expect(
      storage.put({
        originalname: 'empty.png',
        mimetype: 'image/png',
        buffer: Buffer.alloc(0),
        size: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      storage.put({
        originalname: 'large.png',
        mimetype: 'image/png',
        buffer: png,
        size: COURSE_THUMBNAIL_MAX_BYTES + 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      storage.put({ originalname: 'wrong.png', mimetype: 'image/png', buffer: png, size: 9 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks traversal keys, reports missing files safely, and deletes only resolved keys', async () => {
    await expect(storage.open('../secret.png')).rejects.toBeInstanceOf(BadRequestException);
    await expect(storage.open('11111111-1111-4111-8111-111111111111.png')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(storage.delete('..\\secret.png')).rejects.toBeInstanceOf(BadRequestException);
  });
});
