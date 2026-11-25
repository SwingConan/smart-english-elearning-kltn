import { UserRole } from '../../generated/prisma/client';
import { SUPPORT_CAPABILITIES } from '../support/support.policy';

export const BUSINESS_ROLES: UserRole[] = [
  'STUDENT',
  'INSTRUCTOR',
  'COUNSELOR',
  'ACADEMIC_MANAGER',
  'CASHIER',
  'TEACHING_INSPECTOR',
  'SYSTEM_ADMIN',
];
export const CAPABILITIES = [
  ...SUPPORT_CAPABILITIES,
  'consultation.profile.approve',
  'consultation.link.approve',
  'consultation.booking.review',
  'inspection.assign',
  'inspection.hours.review',
  'shift.review',
  'accounts.manage',
  'authority.approve',
  'class.read',
  'assessment.recovery.approve',
  'academic.schedule.approve',
  'academic.admission.approve',
  'finance.verify',
  'finance.adjust.propose',
  'finance.adjust.approve',
  'academic.meeting.approve',
  'academic.attendance.approve',
  'academic.program.approve',
  'academic.rubric.approve',
  'academic.grade.publish',
  'academic.quiz.approve',
  'academic.quiz.grade.publish',
  'knowledge.author',
  'knowledge.review',
  'knowledge.publish',
  'placement.source.author',
  'placement.source.approve',
  'placement.rubric.author',
  'placement.rubric.approve',
  'placement.grader.assign',
  'placement.result.publish',
  'placement.criteria.author',
  'placement.criteria.approve',
  'certificate.policy.approve',
  'certificate.review',
  'certificate.issue',
  'certificate.revoke',
] as const;
export type Capability = (typeof CAPABILITIES)[number];
export type Scope = { type: 'GLOBAL' | 'CLASS' | 'COURSE' | 'SUPPORT_TOPIC' | 'TEACHER'; id?: string };
export function eligible(role: UserRole, capability: string): boolean {
  if (['consultation.profile.approve','consultation.link.approve','consultation.booking.review'].includes(capability)) return role === 'ACADEMIC_MANAGER';
  if (['inspection.assign','inspection.hours.review','shift.review'].includes(capability))
    return role === 'ACADEMIC_MANAGER';
  if (['finance.verify', 'finance.adjust.propose', 'finance.adjust.approve'].includes(capability))
    return role === 'CASHIER';
  if (capability === 'support.referral.respond')
    return ['ACADEMIC_MANAGER', 'CASHIER', 'INSTRUCTOR'].includes(role);
  if (capability === 'support.application.review' || capability.startsWith('support.taxonomy.'))
    return role === 'ACADEMIC_MANAGER';
  if ((SUPPORT_CAPABILITIES as readonly string[]).includes(capability)) return role === 'COUNSELOR';
  if (capability === 'placement.source.author' || capability === 'placement.rubric.author')
    return role === 'INSTRUCTOR';
  if (
    (CAPABILITIES as readonly string[]).includes(capability) &&
    capability.startsWith('placement.')
  )
    return role === 'ACADEMIC_MANAGER';
  if (capability === 'knowledge.author')
    return ['INSTRUCTOR', 'ACADEMIC_MANAGER'].includes(role);
  if (capability === 'knowledge.review' || capability === 'knowledge.publish')
    return role === 'ACADEMIC_MANAGER';
  if (capability === 'accounts.manage' || capability === 'authority.approve')
    return role === 'SYSTEM_ADMIN';
  if (capability === 'assessment.recovery.approve') return role === 'ACADEMIC_MANAGER';
  if (
    [
      'certificate.policy.approve',
      'certificate.review',
      'certificate.issue',
      'certificate.revoke',
    ].includes(capability)
  )
    return role === 'ACADEMIC_MANAGER';
  if (
    capability === 'academic.schedule.approve' ||
    capability === 'academic.admission.approve' ||
    capability === 'academic.meeting.approve' ||
    capability === 'academic.attendance.approve' ||
    capability === 'academic.program.approve' ||
    capability === 'academic.rubric.approve' ||
    capability === 'academic.grade.publish' ||
    capability === 'academic.quiz.approve' ||
    capability === 'academic.quiz.grade.publish'
  )
    return role === 'ACADEMIC_MANAGER';
  if (capability === 'class.read')
    return ['ACADEMIC_MANAGER', 'COUNSELOR', 'TEACHING_INSPECTOR'].includes(role);
  return false;
}
export function inherent(role: UserRole, capability: string) {
  return (
    (role === 'SYSTEM_ADMIN' && capability === 'accounts.manage') ||
    (role === 'ACADEMIC_MANAGER' && capability === 'class.read')
  );
}
