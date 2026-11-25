import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
export const W07_CAPS = [
  'academic.admission.approve',
  'finance.verify',
  'finance.adjust.propose',
  'finance.adjust.approve',
] as const;
export const W07_CONSENT = 'W07_SYNTHETIC_ADMISSION_V1';
export function integerVnd(raw: string): number {
  if (!/^[1-9]\d{0,9}$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > 2147483647)
    throw new BadRequestException('VND must be a positive integer within the database range');
  return Number(raw);
}
export const proofSha = (data: Buffer) => createHash('sha256').update(data).digest('hex');
export function validateTestProof(file: {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
}) {
  if (
    !file ||
    file.size < 1 ||
    file.size > 5 * 1024 * 1024 ||
    file.size !== file.buffer.length ||
    /[\\/]|\.\./.test(file.originalname) ||
    [...file.originalname].some((c) => c.charCodeAt(0) < 32)
  )
    throw new BadRequestException('Invalid private TEST proof file (maximum5MB)');
  const b = file.buffer,
    ext = file.originalname.toLowerCase().split('.').pop();
  if (
    file.mimetype === 'image/png' &&
    ext === 'png' &&
    b.length >= 45 &&
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    b.subarray(12, 16).toString() === 'IHDR' &&
    b.readUInt32BE(16) > 0 &&
    b.readUInt32BE(16) <= 4096 &&
    b.readUInt32BE(20) > 0 &&
    b.readUInt32BE(20) <= 4096 &&
    b.subarray(-8, -4).toString() === 'IEND'
  )
    return { extension: 'png', mimeType: 'image/png' };
  if (
    file.mimetype === 'image/jpeg' &&
    ['jpg', 'jpeg'].includes(ext ?? '') &&
    b.length >= 12 &&
    b[0] === 255 &&
    b[1] === 216 &&
    b[2] === 255 &&
    b.at(-2) === 255 &&
    b.at(-1) === 217
  )
    return { extension: 'jpg', mimeType: 'image/jpeg' };
  if (
    file.mimetype === 'application/pdf' &&
    ext === 'pdf' &&
    b.subarray(0, 5).toString() === '%PDF-' &&
    b.subarray(-1024).toString('latin1').trimEnd().endsWith('%%EOF') &&
    !/\/(JavaScript|JS\b|Launch|EmbeddedFile|OpenAction)\b/i.test(b.toString('latin1'))
  )
    return { extension: 'pdf', mimeType: 'application/pdf' };
  throw new BadRequestException(
    'MIME, extension and file signature must match PNG/JPEG or a passive PDF; SVG/HTML/executables are not accepted',
  );
}
