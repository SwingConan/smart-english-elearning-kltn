import { describe, expect, it } from 'vitest';
import { pcmWav } from './microphone-capture';
describe('PCM encoding only — not a physical microphone test', () => {
  it('rejects capture without samples rather than manufacturing silence', () => {
    expect(() => pcmWav([], 48000)).toThrow('chưa thu được');
  });
  it('encodes the supplied samples with matching duration and bounded PCM16 values', async () => {
    const blob = pcmWav([new Float32Array([-2, 0, 2])], 48000);
    const bytes = await new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(blob);
    });
    const view = new DataView(bytes);
    expect(blob.type).toBe('audio/wav');
    expect(bytes.byteLength).toBe(50);
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getInt16(44, true)).toBe(-32768);
    expect(view.getInt16(48, true)).toBe(32767);
  });
});
