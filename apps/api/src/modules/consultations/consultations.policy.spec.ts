import { BUSINESS_ROLES,eligible,inherent } from '../authorization/permission.policy';
describe('DEC059 consultation approval scope classifier',()=>{
 for(const role of BUSINESS_ROLES)for(const capability of ['consultation.profile.approve','consultation.link.approve','consultation.booking.review']){
  it(role+' '+capability+' requires scoped independent HVU grant',()=>{
   expect(eligible(role,capability)).toBe(role==='ACADEMIC_MANAGER');
   expect(inherent(role,capability)).toBe(false);
  });
 }
 it('does not authorize an unknown consultation capability',()=>expect(eligible('ACADEMIC_MANAGER','consultation.superuser')).toBe(false));
});
