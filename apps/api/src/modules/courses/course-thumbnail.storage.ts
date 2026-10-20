import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

export const COURSE_THUMBNAIL_MAX_BYTES = 5 * 1024 * 1024;
export const COURSE_THUMBNAIL_URL_PREFIX = '/api/course-assets/';

type UploadFile = { buffer: Buffer; mimetype: string; originalname: string; size: number };
type StoredThumbnail = { key: string; mimeType: string; bytes: number };
type OpenedThumbnail = {
  stream: ReturnType<typeof createReadStream>;
  mimeType: string;
  sizeBytes: number;
};

export abstract class CourseThumbnailStorage {
  abstract put(file: UploadFile): Promise<StoredThumbnail>;
  abstract open(key: string): Promise<OpenedThumbnail>;
  abstract delete(key: string): Promise<void>;
}

const IMAGE_POLICIES: Record<
  string,
  { extensions: string[]; signature: (buffer: Buffer) => boolean }
> = {
  'image/jpeg': {
    extensions: ['.jpg', '.jpeg'],
    signature: (buffer) =>
      buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  'image/png': {
    extensions: ['.png'],
    signature: (buffer) =>
      buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
  },
  'image/webp': {
    extensions: ['.webp'],
    signature: (buffer) =>
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP',
  },
};

@Injectable()
export class LocalCourseThumbnailStorage extends CourseThumbnailStorage {
  private readonly root = resolve(
    process.env.COURSE_THUMBNAIL_STORAGE_ROOT ??
      resolve(process.cwd(), '.local-storage', 'course-thumbnails'),
  );

  async put(file: UploadFile): Promise<StoredThumbnail> {
    if (
      !file.originalname ||
      file.originalname.includes('/') ||
      file.originalname.includes('\\') ||
      file.originalname.includes('..')
    ) {
      throw new BadRequestException('Tên tệp ảnh không hợp lệ.');
    }
    if (
      file.size <= 0 ||
      file.size > COURSE_THUMBNAIL_MAX_BYTES ||
      file.buffer.length !== file.size
    ) {
      throw new BadRequestException('Ảnh đại diện phải có dung lượng từ 1 byte đến 5 MB.');
    }

    const extension = extname(file.originalname).toLowerCase();
    const policy = IMAGE_POLICIES[file.mimetype];
    if (!policy || !policy.extensions.includes(extension)) {
      throw new BadRequestException('Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP đúng định dạng.');
    }
    if (!policy.signature(file.buffer)) {
      throw new BadRequestException('Nội dung tệp không khớp với định dạng ảnh đã khai báo.');
    }

    const key = `${randomUUID()}${extension === '.jpeg' ? '.jpg' : extension}`;
    const path = this.resolveKey(key);
    await mkdir(this.root, { recursive: true });
    await writeFile(path, file.buffer, { flag: 'wx' });
    return { key, mimeType: file.mimetype, bytes: file.size };
  }

  async open(key: string): Promise<OpenedThumbnail> {
    const path = this.resolveKey(key);
    try {
      const metadata = await stat(path);
      return {
        stream: createReadStream(path),
        mimeType: mimeTypeForKey(key),
        sizeBytes: metadata.size,
      };
    } catch {
      throw new NotFoundException('Không tìm thấy ảnh đại diện khóa học.');
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }

  private resolveKey(key: string): string {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i.test(
        key,
      )
    ) {
      throw new BadRequestException('Khóa ảnh đại diện không hợp lệ.');
    }
    const path = resolve(this.root, key);
    if (!path.startsWith(`${this.root}${sep}`)) {
      throw new BadRequestException('Khóa ảnh đại diện không hợp lệ.');
    }
    return path;
  }
}

export function managedCourseThumbnailKey(url: string | null | undefined): string | null {
  if (!url?.startsWith(COURSE_THUMBNAIL_URL_PREFIX)) return null;
  const key = url.slice(COURSE_THUMBNAIL_URL_PREFIX.length);
  return key && !key.includes('/') && !key.includes('\\') ? key : null;
}

function mimeTypeForKey(key: string): string {
  if (key.toLowerCase().endsWith('.png')) return 'image/png';
  if (key.toLowerCase().endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}
