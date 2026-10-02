import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

export interface StoredAssessmentResponse {
  key: string;
  bytes: number;
  mimeType: string;
}

export abstract class AssessmentResponseStorage {
  abstract put(
    owner: { learnerId: string; attemptId: string; testQuestionId: string },
    body: Buffer,
    mimeType: string,
  ): Promise<StoredAssessmentResponse>;
  abstract read(key: string): Promise<Buffer>;
  abstract open(key: string): ReturnType<typeof createReadStream>;
  abstract delete(key: string): Promise<void>;
}

@Injectable()
export class LocalAssessmentResponseStorage extends AssessmentResponseStorage {
  private readonly root = resolve(
    process.env.ASSESSMENT_RESPONSE_STORAGE_ROOT ??
      resolve(process.cwd(), '.local-storage/assessment-responses'),
  );

  async put(
    owner: { learnerId: string; attemptId: string; testQuestionId: string },
    body: Buffer,
    mimeType: string,
  ): Promise<StoredAssessmentResponse> {
    const extension =
      ({ 'audio/webm': '.webm', 'audio/ogg': '.ogg', 'audio/mp4': '.m4a', 'audio/mpeg': '.mp3' } as Record<string, string>)[mimeType] ?? '';
    const key = [owner.learnerId, owner.attemptId, owner.testQuestionId, `${randomUUID()}${extension}`].join('/');
    const path = this.resolveKey(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body, { flag: 'wx' });
    return { key, bytes: body.length, mimeType };
  }

  read(key: string): Promise<Buffer> {
    return readFile(this.resolveKey(key));
  }

  open(key: string) {
    return createReadStream(this.resolveKey(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }

  private resolveKey(key: string): string {
    if (!key || key.includes('..') || key.includes('\\') || key.startsWith('/')) {
      throw new Error('Invalid assessment response storage key.');
    }
    const path = resolve(this.root, ...key.split('/'));
    if (path !== this.root && !path.startsWith(`${this.root}${sep}`)) {
      throw new Error('Assessment response path escapes storage root.');
    }
    return path;
  }
}
