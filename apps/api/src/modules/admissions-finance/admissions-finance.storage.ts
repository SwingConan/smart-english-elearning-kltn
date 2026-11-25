import { Injectable, NotFoundException } from '@nestjs/common';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { proofSha } from './admissions-finance.policy';
@Injectable()
export class W07ProofStorage {
  private file(key: string) {
    const root = process.env.W07_PROOF_ROOT,
      workspace = process.env.W07_WORKSPACE_ROOT;
    if (
      !root ||
      !workspace ||
      !resolve(root).startsWith(resolve(workspace, '.local-storage/v2-wave07') + sep) ||
      !/^[a-f0-9-]{36}\.(png|jpg|pdf)$/.test(key)
    )
      throw new NotFoundException('Private TEST proof unavailable');
    return resolve(root, key);
  }
  async put(data: Buffer, extension: string) {
    const key = randomUUID() + '.' + extension,
      p = this.file(key);
    await mkdir(resolve(p, '..'), { recursive: true });
    await writeFile(p, data, { flag: 'wx' });
    return key;
  }
  async read(key: string, sha256: string, bytes: number) {
    try {
      const b = await readFile(this.file(key));
      if (b.length !== bytes || proofSha(b) !== sha256) throw new Error('integrity');
      return b;
    } catch {
      throw new NotFoundException('Private TEST proof unavailable');
    }
  }
  async removeUncommitted(key: string) {
    await unlink(this.file(key)).catch(() => {});
  }
}
