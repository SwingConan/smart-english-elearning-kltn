import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, unlink, rmdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';

export type OriginalAudioResult = {
  status: 'VALID' | 'REJECTED';
  code: string | null;
  codec: string | null;
  sampleRate: number | null;
  sampleCount: number | null;
  channels: number | null;
  decoderIdentity: string;
};
const digest = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const run = (exe: string, args: string[], max: number): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const child = spawn(exe, args, {
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];
    let size = 0,
      errors = 0,
      finished = false;
    const fail = () => {
      if (!finished) {
        finished = true;
        child.kill();
        clearTimeout(timer);
        reject(new Error('DECODER_FAILED'));
      }
    };
    const timer = setTimeout(fail, 8000);
    child.stdout.on('data', (b: Buffer) => {
      size += b.length;
      if (size > max) fail();
      else chunks.push(b);
    });
    child.stderr.on('data', (b: Buffer) => {
      errors += b.length;
      if (errors > 65536) fail();
    });
    child.on('error', fail);
    child.on('close', (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (code !== 0 || errors) reject(new Error('DECODER_FAILED'));
      else resolve(Buffer.concat(chunks));
    });
  });
export class S10OriginalAudioValidator {
  ready() {
    return this.configured();
  }
  private tools?: Promise<{ probe: string; decoder: string; identity: string }>;
  private configured() {
    return (this.tools ??= (async () => {
      const probe = process.env.S10_FFPROBE_PATH ?? '',
        decoder = process.env.S10_FFMPEG_PATH ?? '';
      if (!isAbsolute(probe) || !isAbsolute(decoder)) throw new Error('S10_DECODER_UNAVAILABLE');
      const hashes = await Promise.all(
        [probe, decoder].map(async (p) => digest(await readFile(p))),
      );
      if (
        hashes[0] !== process.env.S10_FFPROBE_SHA256 ||
        hashes[1] !== process.env.S10_FFMPEG_SHA256
      )
        throw new Error('S10_DECODER_UNAVAILABLE');
      return { probe, decoder, identity: 'ffprobe+ffmpeg:' + hashes.join(':') };
    })());
  }
  async validate(bytes: Buffer): Promise<OriginalAudioResult> {
    const tools = await this.configured();
    const result: OriginalAudioResult = {
      status: 'REJECTED',
      code: 'AUDIO_CORRUPT',
      codec: null,
      sampleRate: null,
      sampleCount: null,
      channels: null,
      decoderIdentity: tools.identity,
    };
    const dir = await mkdtemp(join(tmpdir(), 'smart-english-s10-'));
    try {
      const file = join(dir, 'original.webm');
      await writeFile(file, bytes, { flag: 'wx', mode: 0o600 });
      const info = JSON.parse(
        (
          await run(
            tools.probe,
            [
              '-v',
              'error',
              '-protocol_whitelist',
              'file,pipe',
              '-format_whitelist',
              'matroska,webm',
              '-i',
              file,
              '-show_entries',
              'stream=codec_name,sample_rate,channels,codec_type:frame=nb_samples',
              '-show_streams',
              '-show_frames',
              '-of',
              'json',
            ],
            4 * 1024 * 1024,
          )
        ).toString(),
      ) as {
        streams?: Array<{
          codec_name: string;
          codec_type: string;
          sample_rate: string;
          channels: number;
        }>;
        frames?: Array<{ nb_samples?: number }>;
      };
      const stream = info.streams?.[0];
      if (
        info.streams?.length !== 1 ||
        stream?.codec_type !== 'audio' ||
        stream.codec_name !== 'opus' ||
        Number(stream.sample_rate) !== 48000 ||
        ![1, 2].includes(stream.channels)
      ) {
        result.code = 'AUDIO_CODEC_UNSUPPORTED';
        return result;
      }
      const pcm = await run(
        tools.decoder,
        [
          '-v',
          'error',
          '-xerror',
          '-err_detect',
          'explode',
          '-protocol_whitelist',
          'file,pipe',
          '-format_whitelist',
          'matroska,webm',
          '-i',
          file,
          '-map',
          '0:a:0',
          '-f',
          'f32le',
          '-acodec',
          'pcm_f32le',
          'pipe:1',
        ],
        14 * 1024 * 1024,
      );
      const count = pcm.length / (4 * stream.channels),
        frames = (info.frames ?? []).reduce((n, f) => n + Number(f.nb_samples ?? 0), 0);
      Object.assign(result, {
        codec: 'opus',
        sampleRate: 48000,
        channels: stream.channels,
        sampleCount: Number.isSafeInteger(count) ? count : null,
      });
      if (!Number.isSafeInteger(count) || count !== frames || !count)
        result.code = 'AUDIO_SAMPLES_INVALID';
      else if (count < 48000 * 30 || count > 48000 * 35)
        result.code = 'AUDIO_DURATION_OUTSIDE_30_35';
      else {
        result.status = 'VALID';
        result.code = null;
      }
      return result;
    } catch {
      return result;
    } finally {
      await unlink(join(dir, 'original.webm')).catch(() => undefined);
      await rmdir(dir);
    }
  }
}
