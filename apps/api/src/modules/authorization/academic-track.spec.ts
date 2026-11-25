import {
  resolveAcademicProfileFromGrants,
  STUDENT_AFFAIRS_TRACK_CAPABILITIES,
  TRAINING_TRACK_CAPABILITIES,
} from './academic-track';

describe('resolveAcademicProfileFromGrants', () => {
  it('resolves TRAINING track and training scopes when only training grants are active', () => {
    const profile = resolveAcademicProfileFromGrants(
      'ACADEMIC_MANAGER',
      TRAINING_TRACK_CAPABILITIES,
    );

    expect(profile.academicTrack).toBe('TRAINING');
    expect(profile.academicScopes).toEqual({
      programs: true,
      planning: true,
      approvals: true,
      sessionEngagement: true,
      inspection: true,
      consultations: true,
      placement: false,
      certificates: false,
      knowledge: false,
      supportReferrals: false,
      admissions: false,
    });
  });

  it('resolves STUDENT_AFFAIRS track and student affairs scopes when only student-affairs grants are active', () => {
    const profile = resolveAcademicProfileFromGrants(
      'ACADEMIC_MANAGER',
      STUDENT_AFFAIRS_TRACK_CAPABILITIES,
    );

    expect(profile.academicTrack).toBe('STUDENT_AFFAIRS');
    expect(profile.academicScopes).toEqual({
      programs: false,
      planning: false,
      approvals: false,
      sessionEngagement: false,
      inspection: false,
      consultations: false,
      placement: true,
      certificates: true,
      knowledge: true,
      supportReferrals: true,
      admissions: true,
    });
  });

  it('returns null track for combined grants (legacy compatibility) or non-academic roles', () => {
    const combined = resolveAcademicProfileFromGrants('ACADEMIC_MANAGER', [
      'academic.program.approve',
      'certificate.issue',
    ]);
    expect(combined.academicTrack).toBeNull();
    expect(combined.academicScopes.programs).toBe(true);
    expect(combined.academicScopes.certificates).toBe(true);

    const instructor = resolveAcademicProfileFromGrants(
      'INSTRUCTOR',
      TRAINING_TRACK_CAPABILITIES,
    );
    expect(instructor.academicTrack).toBeNull();
    expect(instructor.academicScopes.programs).toBe(false);
  });
});
