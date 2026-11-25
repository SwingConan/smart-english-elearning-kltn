import type { UserRole } from '../../generated/prisma/client';

export type AcademicTrack = 'TRAINING' | 'STUDENT_AFFAIRS' | null;

export const TRAINING_TRACK_CAPABILITIES = [
  'academic.program.approve',
  'academic.schedule.approve',
  'academic.meeting.approve',
  'academic.attendance.approve',
  'academic.rubric.approve',
  'academic.grade.publish',
  'academic.quiz.approve',
  'academic.quiz.grade.publish',
  'assessment.recovery.approve',
  'inspection.assign',
  'inspection.hours.review',
  'shift.review',
  'consultation.profile.approve',
  'consultation.link.approve',
  'consultation.booking.review',
] as const;

export const STUDENT_AFFAIRS_TRACK_CAPABILITIES = [
  'certificate.policy.approve',
  'certificate.review',
  'certificate.issue',
  'certificate.revoke',
  'placement.source.approve',
  'placement.rubric.approve',
  'placement.grader.assign',
  'placement.result.publish',
  'placement.criteria.author',
  'placement.criteria.approve',
  'knowledge.author',
  'knowledge.review',
  'knowledge.publish',
  'support.application.review',
  'support.referral.respond',
  'support.taxonomy.author',
  'support.taxonomy.approve',
  'academic.admission.approve',
] as const;

export type AcademicTrackScopes = {
  programs: boolean;
  planning: boolean;
  approvals: boolean;
  sessionEngagement: boolean;
  inspection: boolean;
  consultations: boolean;
  placement: boolean;
  certificates: boolean;
  knowledge: boolean;
  supportReferrals: boolean;
  admissions: boolean;
};

export type AcademicTrackProfile = {
  academicTrack: AcademicTrack;
  academicScopes: AcademicTrackScopes;
};

const EMPTY_SCOPES: AcademicTrackScopes = {
  programs: false,
  planning: false,
  approvals: false,
  sessionEngagement: false,
  inspection: false,
  consultations: false,
  placement: false,
  certificates: false,
  knowledge: false,
  supportReferrals: false,
  admissions: false,
};

export function resolveAcademicProfileFromGrants(
  role: UserRole | string,
  grantedCapabilities: Iterable<string>,
): AcademicTrackProfile {
  if (role !== 'ACADEMIC_MANAGER') {
    return { academicTrack: null, academicScopes: { ...EMPTY_SCOPES } };
  }

  const caps = new Set(grantedCapabilities);
  const hasAny = (list: readonly string[]) => list.some((c) => caps.has(c));

  const hasTraining = hasAny(TRAINING_TRACK_CAPABILITIES);
  const hasStudentAffairs = hasAny(STUDENT_AFFAIRS_TRACK_CAPABILITIES);

  let academicTrack: AcademicTrack = null;
  if (hasTraining && !hasStudentAffairs) {
    academicTrack = 'TRAINING';
  } else if (hasStudentAffairs && !hasTraining) {
    academicTrack = 'STUDENT_AFFAIRS';
  }

  return {
    academicTrack,
    academicScopes: {
      programs: caps.has('academic.program.approve'),
      planning: caps.has('academic.schedule.approve'),
      approvals: caps.has('academic.program.approve') || caps.has('academic.schedule.approve'),
      sessionEngagement:
        caps.has('academic.meeting.approve') ||
        caps.has('academic.attendance.approve') ||
        caps.has('academic.schedule.approve'),
      inspection:
        caps.has('inspection.assign') ||
        caps.has('inspection.hours.review') ||
        caps.has('shift.review'),
      consultations:
        caps.has('consultation.profile.approve') ||
        caps.has('consultation.link.approve') ||
        caps.has('consultation.booking.review'),
      placement: hasAny([
        'placement.source.approve',
        'placement.rubric.approve',
        'placement.grader.assign',
        'placement.result.publish',
        'placement.criteria.author',
        'placement.criteria.approve',
      ]),
      certificates: hasAny([
        'certificate.policy.approve',
        'certificate.review',
        'certificate.issue',
        'certificate.revoke',
      ]),
      knowledge: hasAny(['knowledge.author', 'knowledge.review', 'knowledge.publish']),
      supportReferrals: hasAny([
        'support.referral.respond',
        'support.application.review',
        'support.taxonomy.author',
        'support.taxonomy.approve',
      ]),
      admissions: caps.has('academic.admission.approve'),
    },
  };
}
