import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';

export class InvalidAssessmentStimulusMediaKeyError extends Error {}
export class AssessmentStimulusMediaUnavailableError extends Error {}

@Injectable()
export class AssessmentStimulusMediaStorage {
  private readonly root = resolveAssessmentStimulusMediaRoot();
  private readonly authoredRoot = resolve(
    process.env.ASSESSMENT_STIMULUS_AUTHORED_ROOT ??
      resolve(process.cwd(), '.local-storage', 'assessment-stimuli'),
  );

  async read(key: string): Promise<Buffer> {
    const path = this.resolveKey(key);
    try {
      return await readFile(path);
    } catch (error: unknown) {
      const cause = error instanceof Error ? ` ${error.message}` : '';
      throw new AssessmentStimulusMediaUnavailableError(
        `Assessment stimulus media is unavailable for key ${key}.${cause}`,
      );
    }
  }

  async put(buffer: Buffer, extension: string): Promise<string> {
    const key = `authored/${randomUUID()}.${extension}`;
    const path = this.resolveKey(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, buffer, { flag: 'wx' });
    return key;
  }

  async delete(key: string): Promise<void> {
    if (!key.startsWith('authored/')) return;
    await rm(this.resolveKey(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }

  private resolveKey(key: string): string {
    if (!key || key.includes('..') || key.includes('\\') || key.startsWith('/')) {
      throw new InvalidAssessmentStimulusMediaKeyError('Invalid assessment stimulus media key.');
    }
    const selectedRoot = key.startsWith('authored/') ? this.authoredRoot : this.root;
    const relativeKey = key.startsWith('authored/') ? key.slice('authored/'.length) : key;
    const path = resolve(selectedRoot, ...relativeKey.split('/'));
    if (path !== selectedRoot && !path.startsWith(`${selectedRoot}${sep}`)) {
      throw new InvalidAssessmentStimulusMediaKeyError(
        'Assessment stimulus media path escapes its configured root.',
      );
    }
    return path;
  }
}

export function resolveAssessmentStimulusMediaRoot(startDirectory = __dirname): string {
  const configured = process.env.ASSESSMENT_STIMULUS_MEDIA_ROOT;
  if (configured) return resolve(configured);

  let directory = resolve(startDirectory);
  while (true) {
    const packageJson = resolve(directory, 'package.json');
    if (existsSync(packageJson)) {
      try {
        const manifest = JSON.parse(readFileSync(packageJson, 'utf8')) as { name?: string };
        if (manifest.name === '@smart-elearning/api') {
          return resolve(directory, 'assets/assessment/m05');
        }
      } catch {
        // Continue walking so a malformed unrelated package manifest cannot select the media root.
      }
    }
    const parent = dirname(directory);
    if (parent === directory) {
      throw new AssessmentStimulusMediaUnavailableError(
        'Unable to locate the API package root for assessment stimulus media.',
      );
    }
    directory = parent;
  }
}
