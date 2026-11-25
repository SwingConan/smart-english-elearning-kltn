'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {connect,OUT}=require('./target.cjs');
async function protectedState(db) {
  const result={};
  const sources={
    course_versions:"SELECT * FROM course_versions WHERE state IN ('PUBLISHED','SUPERSEDED','CANCELLED')", enrollments:'SELECT * FROM enrollments',
    submissions:'SELECT * FROM class_assignment_submissions', grades:'SELECT * FROM assignment_grades', rubric_scores:'SELECT * FROM rubric_criterion_scores',
    attempts:'SELECT * FROM test_attempts', answers:'SELECT * FROM test_answers', answer_evaluations:'SELECT * FROM answer_evaluations', skill_scores:'SELECT * FROM attempt_skill_scores',
    obligations:'SELECT * FROM w07_obligations', applications:'SELECT * FROM w07_applications', payment_events:'SELECT * FROM w07_payment_events', payment_evidence:'SELECT * FROM w07_payment_evidence', allocations:'SELECT * FROM w07_allocations', entitlements:'SELECT * FROM w07_entitlements',
    bank_orders:'SELECT * FROM br136_bank_check.orders',bank_receipts:'SELECT * FROM br136_bank_check.receipts',
    certificates:'SELECT * FROM w09_certificates',certificate_events:'SELECT * FROM w09_certificate_events',attendance_receipts:'SELECT * FROM w06_receipts',inspection:'SELECT * FROM w08_report',
    published_sessions:"SELECT * FROM teaching_sessions WHERE state IN ('PUBLISHED','SUPERSEDED','CANCELLED')",
    published_assignments:"SELECT * FROM class_instructor_assignments WHERE state IN ('PUBLISHED','SUPERSEDED','CANCELLED')",
    placement_tests:"SELECT * FROM tests WHERE purpose='PLACEMENT'",
    actor_roles:'SELECT id,email,role,status FROM users',authority:'SELECT * FROM permission_grants',
    class_business:'SELECT id,"courseId","instructorId",status,"pricingType","tuitionFeeVnd","versionId","approvedPricingType","approvedTuitionFeeVnd","termsApprovedAt","classStart","classEnd","enrollmentStart","enrollmentEnd" FROM class_offerings',
  };
  for(const [key,sql] of Object.entries(sources)) {
    const rows=(await db.query(sql)).rows.map(r=>JSON.stringify(r)).sort();
    result[key]={count:rows.length,sha256:crypto.createHash('sha256').update(rows.join('\n')).digest('hex')};
  }
  return result;
}
if(require.main===module)(async()=>{const {db,identity}=await connect();try{
  fs.mkdirSync(OUT,{recursive:true});
  const file=path.join(OUT,'protected-before.json');
  const state=await protectedState(db);await db.query('ROLLBACK');
  if(process.argv.includes('--check')) {
    const before=JSON.parse(fs.readFileSync(file,'utf8')).state;
    const changes=Object.keys(before).filter(k=>JSON.stringify(before[k])!==JSON.stringify(state[k]));
    fs.writeFileSync(path.join(OUT,'protected-after.json'),JSON.stringify({identity,state,changes},null,2));
    console.log(JSON.stringify({protectedTables:Object.keys(state).length,changes}));
    if(changes.length)process.exitCode=1;
  }else {fs.writeFileSync(file,JSON.stringify({identity,state},null,2),{flag:'wx'});console.log('Protected baseline saved; no business mutations.');}
}finally{await db.end()}})().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={protectedState};
