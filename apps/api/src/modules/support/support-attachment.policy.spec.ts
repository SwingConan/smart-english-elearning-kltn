import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  MAX_ATTACHMENT_BYTES,
  resolveAttachmentPath,
  validateSupportAttachment,
} from './support-attachment.policy';

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

const JPG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9,
]);

const WEBP_BYTES = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x10, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP'),
  Buffer.from('VP8 '),
]);

const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');

const DOCX_BYTES = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.alloc(16, 0),
  Buffer.from('[Content_Types].xmlword/document.xml'),
]);

describe('support-attachment.policy', () => {
  it('accepts genuine PNG, JPG, WEBP, PDF and DOCX attachments', () => {
    expect(
      validateSupportAttachment({
        buffer: PNG_BYTES,
        size: PNG_BYTES.length,
        mimetype: 'image/png',
        originalname: 'screen.png',
      }).mimeType,
    ).toBe('image/png');

    expect(
      validateSupportAttachment({
        buffer: JPG_BYTES,
        size: JPG_BYTES.length,
        mimetype: 'image/jpeg',
        originalname: 'photo.jpg',
      }).mimeType,
    ).toBe('image/jpeg');

    expect(
      validateSupportAttachment({
        buffer: WEBP_BYTES,
        size: WEBP_BYTES.length,
        mimetype: 'image/webp',
        originalname: 'banner.webp',
      }).mimeType,
    ).toBe('image/webp');

    expect(
      validateSupportAttachment({
        buffer: PDF_BYTES,
        size: PDF_BYTES.length,
        mimetype: 'application/pdf',
        originalname: 'schedule.pdf',
      }).mimeType,
    ).toBe('application/pdf');

    expect(
      validateSupportAttachment({
        buffer: DOCX_BYTES,
        size: DOCX_BYTES.length,
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        originalname: 'request.docx',
      }).extension,
    ).toBe('docx');
  });

  it('rejects spoofed extensions, executable payloads, and oversized files', () => {
    expect(() =>
      validateSupportAttachment({
        buffer: Buffer.from('MZfake-exe'),
        size: 10,
        mimetype: 'image/png',
        originalname: 'malware.png',
      }),
    ).toThrow(BadRequestException);

    const oversized = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1);
    expect(() =>
      validateSupportAttachment({
        buffer: oversized,
        size: oversized.length,
        mimetype: 'application/pdf',
        originalname: 'big.pdf',
      }),
    ).toThrow(BadRequestException);
  });

  it('blocks path traversal in stored keys', () => {
    expect(() => resolveAttachmentPath('../secret.png')).toThrow(NotFoundException);
    expect(() => resolveAttachmentPath('not-a-uuid/file.png')).toThrow(NotFoundException);
  });
});
