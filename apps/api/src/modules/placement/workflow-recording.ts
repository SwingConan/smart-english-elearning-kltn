import { wavDurationMs } from './s10-durable.service';
export function originalPcmDuration(b: Buffer) {
  if (b.length < 44 || b.readUInt32LE(4) !== b.length - 8) throw Error('PCM_LENGTH');
  let format = false,
    data = false;
  for (let at = 12; at + 8 <= b.length;) {
    const size = b.readUInt32LE(at + 4),
      end = at + 8 + size;
    if (end > b.length) throw Error('PCM_CHUNK');
    const type = b.toString('ascii', at, at + 4);
    if (type === 'fmt ') {
      if (format || size < 16) throw Error('PCM_FORMAT');
      format = true;
      const channels = b.readUInt16LE(at + 10),
        rate = b.readUInt32LE(at + 12),
        byteRate = b.readUInt32LE(at + 16),
        align = b.readUInt16LE(at + 20),
        bits = b.readUInt16LE(at + 22);
      if (
        b.readUInt16LE(at + 8) !== 1 ||
        ![1, 2].includes(channels) ||
        rate < 8000 ||
        rate > 96000 ||
        bits !== 16 ||
        align !== channels * 2 ||
        byteRate !== rate * align
      )
        throw Error('PCM_HEADER');
    }
    if (type === 'data') {
      if (data || !size || size % 2) throw Error('PCM_DATA');
      data = true;
    }
    at = end + (size % 2);
  }
  if (!format || !data) throw Error('PCM_REQUIRED');
  return wavDurationMs(b);
}
