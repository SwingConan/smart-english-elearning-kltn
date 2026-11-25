import { integerVnd, proofSha, validateTestProof } from './admissions-finance.policy';
import { BUSINESS_ROLES, eligible, inherent } from '../authorization/permission.policy';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7z8AAAAASUVORK5CYII=',
  'base64',
);
describe('W07 DEC049 integer money/private TEST proof/role segregation', () => {
  it.each(['1', '1000000', '2147483647'])('accepts exact integer VND %s', (raw) =>
    expect(integerVnd(raw)).toBe(Number(raw)),
  );
  it.each(['0', '-1', '1.5', '1.0', '1e3', 'NaN', 'Infinity', '2147483648', '01', ' 1', '100 VND'])(
    'rejects noncanonical VND %s',
    (raw) => expect(() => integerVnd(raw)).toThrow(),
  );
  it('validates genuine PNG signature/dimensions/end and returns safe extension', () =>
    expect(
      validateTestProof({
        buffer: png,
        size: png.length,
        mimetype: 'image/png',
        originalname: 'SYNTHETIC_TEST.png',
      }),
    ).toEqual({ extension: 'png', mimeType: 'image/png' }));
  it.each(['../../receipt.png', 'x\\receipt.png', 'proof..png', 'receipt.pdf', 'receipt.svg'])(
    'rejects filename/type mismatch %s',
    (originalname) =>
      expect(() =>
        validateTestProof({ buffer: png, size: png.length, mimetype: 'image/png', originalname }),
      ).toThrow(),
  );
  it('rejects MIME spoof, empty/oversized, appended script and executable', () => {
    for (const f of [
      { buffer: png, size: png.length, mimetype: 'application/pdf', originalname: 'test.pdf' },
      { buffer: Buffer.alloc(0), size: 0, mimetype: 'image/png', originalname: 'test.png' },
      { buffer: png, size: 6 * 1024 * 1024, mimetype: 'image/png', originalname: 'test.png' },
      {
        buffer: Buffer.concat([png, Buffer.from('<script>')]),
        size: png.length + 8,
        mimetype: 'image/png',
        originalname: 'test.png',
      },
      {
        buffer: Buffer.from('MZ-executable'),
        size: 13,
        mimetype: 'image/png',
        originalname: 'test.png',
      },
    ])
      expect(() => validateTestProof(f)).toThrow();
  });
  it('accepts a passive PDF but rejects active actions', () => {
    const b = Buffer.from('%PDF-1.4\nSYNTHETIC TEST ONLY\n%%EOF');
    expect(
      validateTestProof({
        buffer: b,
        size: b.length,
        mimetype: 'application/pdf',
        originalname: 'TEST.pdf',
      }).extension,
    ).toBe('pdf');
    const a = Buffer.from('%PDF-1.4\n/JavaScript (TEST)\n%%EOF');
    expect(() =>
      validateTestProof({
        buffer: a,
        size: a.length,
        mimetype: 'application/pdf',
        originalname: 'TEST.pdf',
      }),
    ).toThrow();
  });
  it('checksum binds immutable raw binary', () => {
    expect(proofSha(png)).toMatch(/^[a-f0-9]{64}$/);
    expect(proofSha(png)).not.toBe(proofSha(Buffer.concat([png, Buffer.from('x')])));
  });
  it.each(BUSINESS_ROLES)('%s cannot inherit W07 authority', (role) => {
    expect(eligible(role, 'academic.admission.approve')).toBe(role === 'ACADEMIC_MANAGER');
    for (const cap of ['finance.verify', 'finance.adjust.propose', 'finance.adjust.approve']) {
      expect(eligible(role, cap)).toBe(role === 'CASHIER');
      expect(inherent(role, cap)).toBe(false);
    }
    expect(inherent(role, 'academic.admission.approve')).toBe(false);
  });
});
