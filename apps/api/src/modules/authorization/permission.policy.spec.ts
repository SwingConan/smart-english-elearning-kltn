import { BUSINESS_ROLES, CAPABILITIES, eligible, inherent } from './permission.policy';
describe('V2 role segregation', () => {
  it.each(BUSINESS_ROLES)('%s requires explicit center knowledge grants, never role inheritance',(role)=>{
    for(const cap of ['knowledge.author','knowledge.review','knowledge.publish']){
      expect(eligible(role,cap)).toBe(
        cap === 'knowledge.author'
          ? ['INSTRUCTOR', 'ACADEMIC_MANAGER'].includes(role)
          : role === 'ACADEMIC_MANAGER',
      );
      expect(inherent(role,cap)).toBe(false);
    }
  });
  it('has exactly seven primary business roles; legacy compatibility has no capabilities', () => {
    expect(new Set(BUSINESS_ROLES).size).toBe(7);
    for (const capability of CAPABILITIES) {
      expect(eligible('ADMIN_COORDINATOR', capability)).toBe(false);
      expect(inherent('ADMIN_COORDINATOR', capability)).toBe(false);
    }
  });
  it.each(BUSINESS_ROLES)('%s cannot acquire recovery approval outside HVU', (role) => {
    expect(eligible(role, 'assessment.recovery.approve')).toBe(role === 'ACADEMIC_MANAGER');
    expect(inherent(role, 'assessment.recovery.approve')).toBe(false);
  });
  it.each(BUSINESS_ROLES)('%s defaults stay within approved read/account slice', (role) => {
    expect(inherent(role, 'accounts.manage')).toBe(role === 'SYSTEM_ADMIN');
    expect(inherent(role, 'class.read')).toBe(role === 'ACADEMIC_MANAGER');
    expect(eligible(role, 'unrecognized.capability')).toBe(false);
  });
  it.each(BUSINESS_ROLES)(
    '%s needs explicit scoped academic grants, never inherent approval',
    (role) => {
      for (const cap of [
        'academic.program.approve',
        'academic.schedule.approve',
        'academic.rubric.approve',
        'academic.grade.publish',
        'academic.quiz.approve',
        'academic.quiz.grade.publish',
      ]) {
        expect(eligible(role, cap)).toBe(role === 'ACADEMIC_MANAGER');
        expect(inherent(role, cap)).toBe(false);
      }
    },
  );
});
