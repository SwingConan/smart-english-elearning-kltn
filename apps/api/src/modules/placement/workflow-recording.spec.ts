import { originalPcmDuration } from './workflow-recording';
const wav = () => {
  const b = Buffer.alloc(44 + 3200);
  b.write('RIFF');
  b.writeUInt32LE(b.length - 8, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(3200, 40);
  return b;
};
describe('W04B original PCM security', () => {
  it('measures genuine PCM bytes and rejects a renamed non-WAV', () => {
    expect(originalPcmDuration(wav())).toBe(100);
    expect(() => originalPcmDuration(Buffer.from('fake audio WAV'))).toThrow();
  });
  it.each([4, 24, 28, 32, 34, 40])(
    'rejects forged length/rate/alignment/duration header at %i',
    (at) => {
      const b = wav();
      b.writeUInt16LE(0, at);
      expect(() => originalPcmDuration(b)).toThrow();
    },
  );
});
