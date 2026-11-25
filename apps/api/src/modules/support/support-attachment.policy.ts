import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

export const MAX_TICKET_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const STORED_KEY_RE = /^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(png|jpg|webp|pdf|docx)$/;

export type UploadedSupportFile = {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
};

export function sanitizeSupportFileName(raw: string, extension: string): string {
  const leaf = raw.split(/[\\/]/).pop() ?? '';
  const cleaned = [...leaf]
    .map((ch) => (ch.charCodeAt(0) < 32 ? '_' : ch))
    .join('')
    .replace(/[*?"<>|:]/g, '_')
    .trim()
    .slice(0, 180);
  if (!cleaned) return `tep-dinh-kem.${extension}`;
  return cleaned;
}

export function validateSupportAttachment(file: UploadedSupportFile) {
  if (
    !file ||
    !Buffer.isBuffer(file.buffer) ||
    file.size < 1 ||
    file.size > MAX_ATTACHMENT_BYTES ||
    file.size !== file.buffer.length ||
    !file.originalname ||
    /\0/.test(file.originalname)
  ) {
    throw new BadRequestException(
      'Tệp đính kèm không hợp lệ hoặc vượt quá giới hạn 10 MB mỗi tệp.',
    );
  }

  const b = file.buffer;
  const mime = (file.mimetype || '').toLowerCase().trim();
  const ext = (file.originalname.split('.').pop() ?? '').toLowerCase().trim();
  const sha256 = createHash('sha256').update(b).digest('hex');

  if (
    mime === 'image/png' &&
    ext === 'png' &&
    b.length >= 24 &&
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) &&
    b.subarray(12, 16).toString('latin1') === 'IHDR'
  ) {
    return {
      extension: 'png',
      mimeType: 'image/png',
      originalName: sanitizeSupportFileName(file.originalname, 'png'),
      byteSize: file.size,
      sha256,
    };
  }

  if (
    (mime === 'image/jpeg' || mime === 'image/jpg') &&
    (ext === 'jpg' || ext === 'jpeg') &&
    b.length >= 12 &&
    b[0] === 0xff &&
    b[1] === 0xd8 &&
    b[2] === 0xff &&
    b.includes(Buffer.from([0xff, 0xd9]))
  ) {
    return {
      extension: 'jpg',
      mimeType: 'image/jpeg',
      originalName: sanitizeSupportFileName(file.originalname, 'jpg'),
      byteSize: file.size,
      sha256,
    };
  }

  if (
    mime === 'image/webp' &&
    ext === 'webp' &&
    b.length >= 16 &&
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return {
      extension: 'webp',
      mimeType: 'image/webp',
      originalName: sanitizeSupportFileName(file.originalname, 'webp'),
      byteSize: file.size,
      sha256,
    };
  }

  if (
    mime === 'application/pdf' &&
    ext === 'pdf' &&
    b.length >= 16 &&
    b.subarray(0, 5).toString('latin1') === '%PDF-'
  ) {
    return {
      extension: 'pdf',
      mimeType: 'application/pdf',
      originalName: sanitizeSupportFileName(file.originalname, 'pdf'),
      byteSize: file.size,
      sha256,
    };
  }

  if (
    ext === 'docx' &&
    (mime === DOCX_MIME || mime === 'application/octet-stream' || mime === 'application/zip') &&
    b.length >= 30 &&
    b[0] === 0x50 &&
    b[1] === 0x4b &&
    b[2] === 0x03 &&
    b[3] === 0x04 &&
    (b.includes('[Content_Types].xml') || b.includes('word/'))
  ) {
    return {
      extension: 'docx',
      mimeType: DOCX_MIME,
      originalName: sanitizeSupportFileName(file.originalname, 'docx'),
      byteSize: file.size,
      sha256,
    };
  }

  throw new BadRequestException(
    'Chỉ hỗ trợ ảnh PNG, JPG, WEBP và tài liệu PDF, DOCX đúng định dạng.',
  );
}

export function attachmentStorageRoot(): string {
  const custom = process.env.SUPPORT_ATTACHMENT_ROOT?.trim();
  if (custom) return resolve(custom);
  return resolve(__dirname, '../../../../../.local-storage/support-attachments');
}

export function resolveAttachmentPath(storedKey: string): string {
  if (!STORED_KEY_RE.test(storedKey)) {
    throw new NotFoundException('Support attachment unavailable');
  }
  const root = attachmentStorageRoot();
  const full = resolve(root, storedKey);
  if (!full.startsWith(root + sep)) {
    throw new NotFoundException('Support attachment unavailable');
  }
  return full;
}

export async function writeAttachmentFile(storedKey: string, data: Buffer): Promise<void> {
  const full = resolveAttachmentPath(storedKey);
  await mkdir(resolve(full, '..'), { recursive: true });
  await writeFile(full, data, { flag: 'wx' });
}

export async function readAttachmentFile(
  storedKey: string,
  expectedBytes: number,
  expectedSha256: string,
): Promise<Buffer> {
  try {
    const full = resolveAttachmentPath(storedKey);
    const data = await readFile(full);
    const sha = createHash('sha256').update(data).digest('hex');
    if (data.length !== expectedBytes || sha !== expectedSha256) {
      throw new Error('Attachment integrity mismatch');
    }
    return data;
  } catch {
    throw new NotFoundException('Support attachment unavailable');
  }
}

export async function removeAttachmentFileQuietly(storedKey: string): Promise<void> {
  try {
    await unlink(resolveAttachmentPath(storedKey));
  } catch {
    // Best-effort rollback cleanup on disk failure
  }
}

export function buildSupportContentDisposition(
  mode: 'inline' | 'attachment',
  fileName: string,
): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(fileName);
  return `${mode}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
