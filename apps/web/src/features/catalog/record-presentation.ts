import { demoText, isDemoEnvironment } from '@/features/demo/presentation';
// Presentation only. Never changes identity, approved terms, prices or permissions.
export function isTechnicalQaRecord(...values: (string | null | undefined)[]) {
  if (isDemoEnvironment()) return false;
  return values.some(
    (value) =>
      !!value &&
      /(?:\bW0[1-9][A-Z]?\b|\bVS03\b|\bWave0?1\b|QA[- ](?:DEC|Runtime|same-author)|\bsynthetic\b|\bfixture\b|\bDEV\b|Other owner private draft)/i.test(
        value,
      ),
  );
}

export function accountLabel(fullName: string) {
  if (isDemoEnvironment()) return demoText(fullName);
  return /^(?:Wave0?1 DEV |QA Runtime |CMS QA |VS03 |W02(?:B)? (?:Other|HVU))/.test(fullName)
    ? 'Tài khoản QA'
    : fullName;
}

export function classLabel(name: string, code?: string, courseTitle?: string) {
  return isTechnicalQaRecord(name, code, courseTitle) ? 'Lớp kiểm tra nội bộ · QA' : name;
}
