import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

export class InvalidAssessmentStimulusMediaKeyError extends Error {}
export class AssessmentStimulusMediaUnavailableError extends Error {}

@Injectable()
export class AssessmentStimulusMediaStorage {
  private readonly root = resolveAssessmentStimulusMediaRoot();

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

  private resolveKey(key: string): string {
    if (!key || key.includes('..') || key.includes('\\') || key.startsWith('/')) {
      throw new InvalidAssessmentStimulusMediaKeyError('Invalid assessment stimulus media key.');
    }
    const path = resolve(this.root, ...key.split('/'));
    if (path !== this.root && !path.startsWith(`${this.root}${sep}`)) {
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
