function cleanFileName(value: string): string {
  return [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 || '\\/"'.includes(character) ? '_' : character;
    })
    .join('')
    .trim()
    .slice(0, 240) || 'document';
}

export function contentDisposition(disposition: 'attachment' | 'inline', originalName: string): string {
  const safeUtf8 = cleanFileName(originalName);
  const asciiFallback = safeUtf8
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/[\\/"]/g, '_') || 'document';
  const encoded = encodeURIComponent(safeUtf8).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
