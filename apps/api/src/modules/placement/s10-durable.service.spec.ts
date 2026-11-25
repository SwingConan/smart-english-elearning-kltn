import { randomUUID } from 'node:crypto';
import { validateDurableCommand, wavDurationMs } from './s10-durable.service';
describe('durable S10 protocol input', () => {
  const valid = () => ({
    action: 'CLAIM',
    key: randomUUID(),
    epoch: null,
    revision: 0,
    tabId: randomUUID(),
    token: randomUUID(),
  });
  it('accepts only bounded command identities and rejects private/unknown fields', () => {
    expect(validateDurableCommand(valid()).action).toBe('CLAIM');
    for (const command of [
      null,
      [],
      { ...valid(), protocolVersion: 99 },
      { ...valid(), action: 'RESET' },
      { ...valid(), key: 'x'.repeat(5000) },
      { ...valid(), revision: -1 },
      { ...valid(), revision: 1.5 },
      { ...valid(), digest: 'fake' },
      { ...valid(), nonce: 'fake' },
    ])
      expect(() => validateDurableCommand(command)).toThrow();
  });
  it('reads PCM WAV duration from chunks; rejects fake or truncated WAV', () => {
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
    expect(wavDurationMs(b)).toBe(100);
    expect(() => wavDurationMs(Buffer.from('not WAV'))).toThrow();
    expect(() => wavDurationMs(b.subarray(0, 80))).toThrow();
    b.writeUInt16LE(3, 20);
    expect(() => wavDurationMs(b)).toThrow();
  });
});
