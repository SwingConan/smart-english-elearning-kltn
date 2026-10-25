import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

export const USER_AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const USER_AVATAR_URL_PREFIX = '/api/user-assets/avatars/';
type Upload = { buffer: Buffer; mimetype: string; originalname: string; size: number };

export abstract class UserAvatarStorage {
  abstract put(file: Upload): Promise<{ key: string }>;
  abstract open(key: string): Promise<{
    stream: ReturnType<typeof createReadStream>;
    mimeType: string;
    sizeBytes: number;
  }>;
  abstract delete(key: string): Promise<void>;
}

const policies: Record<string, { extensions: string[]; valid: (buffer: Buffer) => boolean }> = {
  'image/jpeg': {
    extensions: ['.jpg', '.jpeg'],
    valid: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  'image/png': {
    extensions: ['.png'],
    valid: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
  },
  'image/webp': {
    extensions: ['.webp'],
    valid: (b) =>
      b.length >= 12 &&
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
};

@Injectable()
export class LocalUserAvatarStorage extends UserAvatarStorage {
  private readonly root = resolve(
    process.env.USER_AVATAR_STORAGE_ROOT ??
      resolve(process.cwd(), '.local-storage', 'user-avatars'),
  );

  async put(file: Upload) {
    if (!file.originalname || /[\\/]/.test(file.originalname) || file.originalname.includes('..')) {
      throw new BadRequestException('Tên tệp ảnh không hợp lệ.');
    }
    if (file.size <= 0 || file.size > USER_AVATAR_MAX_BYTES || file.buffer.length !== file.size) {
      throw new BadRequestException('Ảnh đại diện phải có dung lượng từ 1 byte đến 5 MB.');
    }
    const extension = extname(file.originalname).toLowerCase();
    const policy = policies[file.mimetype];
    if (!policy || !policy.extensions.includes(extension) || !policy.valid(file.buffer)) {
      throw new BadRequestException(
        'Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP có nội dung đúng định dạng.',
      );
    }
    const key = `${randomUUID()}${extension === '.jpeg' ? '.jpg' : extension}`;
    await mkdir(this.root, { recursive: true });
    await writeFile(this.path(key), file.buffer, { flag: 'wx' });
    return { key };
  }

  async open(key: string) {
    try {
      const path = this.path(key);
      const metadata = await stat(path);
      return { stream: createReadStream(path), mimeType: mimeType(key), sizeBytes: metadata.size };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new NotFoundException('Không tìm thấy ảnh đại diện.');
    }
  }

  async delete(key: string) {
    await rm(this.path(key), { force: true });
  }

  private path(key: string) {
    if (!/^[0-9a-f-]{36}\.(?:jpg|png|webp)$/i.test(key)) {
      throw new BadRequestException('Khóa ảnh đại diện không hợp lệ.');
    }
    const path = resolve(this.root, key);
    if (!path.startsWith(`${this.root}${sep}`))
      throw new BadRequestException('Khóa ảnh không hợp lệ.');
    return path;
  }
}

function mimeType(key: string) {
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}
