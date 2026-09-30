import type { PublicCourse } from './types';

export function courseLevelLabel(level: string): string {
  return (
    {
      FOUNDATION: 'Nền tảng',
      BASIC: 'Cơ bản',
      INTERMEDIATE: 'Trung cấp',
      ADVANCING: 'Nâng cao',
    }[level.toUpperCase()] ?? level
  );
}

export function modalityLabel(modality: string): string {
  return (
    {
      ONLINE: 'Trực tuyến',
      OFFLINE: 'Trực tiếp',
      HYBRID: 'Kết hợp',
    }[modality] ?? modality
  );
}

export function skillScopeLabel(scope: PublicCourse['skillScope']): string {
  return {
    LR: 'Listening & Reading',
    FOUR_SKILLS: '4 kỹ năng',
    LISTENING: 'Listening',
    READING: 'Reading',
    SPEAKING: 'Speaking',
    WRITING: 'Writing',
  }[scope];
}
