import type { PublicCourse } from './types';

const COURSE_LEVEL_LABELS: Record<string, string> = {
  FOUNDATION: 'Nền tảng',
  BASIC: 'Cơ bản',
  INTERMEDIATE: 'Trung cấp',
  ADVANCING: 'Nâng cao',
};

export function courseLevelLabel(level: string): string {
  return COURSE_LEVEL_LABELS[level.toUpperCase()] ?? level;
}

export function courseLevelValue(value: string): string {
  const trimmedValue = value.trim();
  const normalizedValue = trimmedValue.toLocaleLowerCase('vi-VN');
  const knownLevel = Object.entries(COURSE_LEVEL_LABELS).find(
    ([code, label]) =>
      code.toLocaleLowerCase('vi-VN') === normalizedValue ||
      label.toLocaleLowerCase('vi-VN') === normalizedValue,
  );

  return knownLevel?.[0] ?? trimmedValue;
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
