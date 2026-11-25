export function pcmWav(chunks: Float32Array[], sampleRate: number): Blob {
  const count = chunks.reduce((n, c) => n + c.length, 0);
  if (!count) throw new Error('Microphone chưa thu được mẫu âm thanh.');
  const buffer = new ArrayBuffer(44 + count * 2),
    view = new DataView(buffer);
  const text = (at: number, value: string) =>
    [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + count * 2, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, count * 2, true);
  let offset = 44;
  for (const chunk of chunks)
    for (const sample of chunk) {
      const bounded = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, bounded * (bounded < 0 ? 32768 : 32767), true);
      offset += 2;
    }
  return new Blob([buffer], { type: 'audio/wav' });
}
