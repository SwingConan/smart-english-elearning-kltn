import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';

export interface StoredLearningResource {
  key: string;
  bytes: number;
  mimeType: string;
  originalFileName: string;
}

export abstract class LearningResourceStorage {
  abstract put(file: { buffer: Buffer; mimetype: string; originalname: string; size: number }): Promise<StoredLearningResource>;
  abstract open(key: string): ReturnType<typeof createReadStream>;
  abstract stat(key: string): Promise<{ sizeBytes: number }>;
  abstract delete(key: string): Promise<void>;
}

const ALLOWED_DOCUMENTS: Record<string, { mime: string; signature?: (body: Buffer) => boolean }> = {
  '.pdf': { mime: 'application/pdf', signature: (body) => body.subarray(0, 5).toString() === '%PDF-' },
  '.docx': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', signature: isZip },
  '.pptx': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', signature: isZip },
  '.xlsx': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', signature: isZip },
  '.txt': { mime: 'text/plain', signature: (body) => !body.includes(0) },
};

@Injectable()
export class LocalLearningResourceStorage extends LearningResourceStorage {
  private readonly root = resolve(
    process.env.LEARNING_RESOURCE_STORAGE_ROOT ?? resolve(process.cwd(), '.local-storage/learning-resources'),
  );

  async put(file: { buffer: Buffer; mimetype: string; originalname: string; size: number }): Promise<StoredLearningResource> {
    if (!file.originalname || file.originalname.includes('/') || file.originalname.includes('\\') || file.originalname.includes('..')) {
      throw new BadRequestException('Tên tệp không hợp lệ.');
    }
    if (file.size <= 0 || file.size > 20 * 1024 * 1024 || file.buffer.length !== file.size) {
      throw new BadRequestException('Tài liệu phải có dung lượng từ 1 byte đến 20 MB.');
    }
    const extension = extname(file.originalname).toLowerCase();
    const policy = ALLOWED_DOCUMENTS[extension];
    if (!policy || policy.mime !== file.mimetype) {
      throw new BadRequestException('Định dạng, phần mở rộng hoặc MIME của tài liệu không khớp.');
    }
    if (policy.signature && !policy.signature(file.buffer)) {
      throw new BadRequestException('Nội dung tệp không khớp với định dạng đã khai báo.');
    }
    const key = `${randomUUID()}${extension}`;
    const path = this.resolveKey(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.buffer, { flag: 'wx' });
    return { key, bytes: file.size, mimeType: file.mimetype, originalFileName: file.originalname };
  }

  open(key: string) {
    return createReadStream(this.resolveKey(key));
  }

  async stat(key: string): Promise<{ sizeBytes: number }> {
    const metadata = await stat(this.resolveKey(key));
    return { sizeBytes: metadata.size };
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }

  private resolveKey(key: string): string {
    if (!key || key.includes('..') || key.includes('\\') || key.startsWith('/')) {
      throw new BadRequestException('Khóa lưu trữ tài liệu không hợp lệ.');
    }
    const path = resolve(this.root, ...key.split('/'));
    if (path !== this.root && !path.startsWith(`${this.root}${sep}`)) {
      throw new BadRequestException('Đường dẫn tài liệu vượt khỏi vùng lưu trữ.');
    }
    return path;
  }
}

function isZip(body: Buffer): boolean {
  return body.length >= 4 && body[0] === 0x50 && body[1] === 0x4b && [0x03, 0x05, 0x07].includes(body[2]);
}
