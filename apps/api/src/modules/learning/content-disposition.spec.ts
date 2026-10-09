import { contentDisposition } from './content-disposition';

describe('contentDisposition', () => {
  it('provides an ASCII fallback and RFC 5987 UTF-8 filename', () => {
    expect(contentDisposition('attachment', 'Cẩm nang học tập.pdf')).toBe(
      'attachment; filename="Cam nang hoc tap.pdf"; filename*=UTF-8\'\'C%E1%BA%A9m%20nang%20h%E1%BB%8Dc%20t%E1%BA%ADp.pdf',
    );
  });

  it('removes header and path control characters', () => {
    const header = contentDisposition('inline', '../bad\r\n"name.pdf');
    expect(header).not.toMatch(/[\r\n]/);
    expect(header).not.toContain('../');
    expect(header).toContain('filename=".._bad___name.pdf"');
  });
});
