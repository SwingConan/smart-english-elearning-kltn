import { IsIn, IsOptional, Matches } from 'class-validator';
export const REPORT_SOURCES = [
  'ALL',
  'LEARNING',
  'SUBMISSIONS',
  'PLACEMENT_RESULTS',
  'TEACHING',
  'GRADING',
  'SUPPORT',
  'CONSULTATION',
  'ACADEMIC',
  'FINANCE',
  'INSPECTION',
  'STAFF_SHIFT',
  'ACCOUNTS',
  'SECURITY_OPS',
  'CERTIFICATE',
  'CLASS_SCHEDULE',
  'ACADEMIC_DECISIONS',
  'AUTHORITY_EVENTS',
  'RUNTIME_PROBE',
  'TEACHING_CALENDAR',
] as const;
export class RoleReportQuery {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
  @IsOptional() @IsIn(REPORT_SOURCES) source?: (typeof REPORT_SOURCES)[number];
}
