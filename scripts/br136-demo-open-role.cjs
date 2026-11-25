'use strict';
// Private local convenience: genuine UI login, never role/session bypass.
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const launcherState=path.join(ROOT,'.local-storage/br136-launcher/managed.json');
let origin='http://127.0.0.1:5173';
if(fs.existsSync(launcherState)&&JSON.parse(fs.readFileSync(launcherState,'utf8')).status==='RUNNING')origin='http://127.0.0.1:3040';
const ROLES=['STUDENT','INSTRUCTOR','COUNSELOR','ACADEMIC_MANAGER','CASHIER','TEACHING_INSPECTOR','SYSTEM_ADMIN'];
const role=process.argv[2];
const entry=process.argv[3]||'home';
if(process.argv.length>4||!ROLES.includes(role)||!['home','placement','bank','practice','productive','grading','finance','calendar','meet'].includes(entry)){console.error('CHOOSE_ROLE_AND_OPTIONAL_ENTRY: '+ROLES.join(', ')+' | home, placement, bank, practice, productive, grading, finance, calendar, meet');process.exit(1);}
(async()=>{
 const {Client}=require('pg'),db=new Client({connectionString:'postgresql://wave01@127.0.0.1:55401/v2_wave01_dev_test_w04b_br136_demo_20261111_42db33'});
 let active;
 try{await db.connect();await db.query('BEGIN READ ONLY');await db.query('SELECT br136_bank_check.assert_target()');active=new Set((await db.query('SELECT id FROM users WHERE role=$1 AND status=$2',[role,'ACTIVE'])).rows.map(r=>r.id));await db.query('ROLLBACK');}finally{await db.end();}
 const {windowsPrivateIdentity}=require('./lib/gemini-live-runtime.cjs');
 const map=JSON.parse(fs.readFileSync(path.join(windowsPrivateIdentity().privateRoot,'fixture-demo-accounts.json'),'utf8'));
 const fixtureFile=path.join(ROOT,'.local-storage/br136-working-demo/learning-fixture.private.json');
 const fixture=fs.existsSync(fixtureFile)?JSON.parse(fs.readFileSync(fixtureFile,'utf8')):{};
 const primary=map.primaryActors?.[role];
 const preferred=role==='STUDENT'?(['placement','bank'].includes(entry)?'5c0adc3b-c075-4f03-8832-563140c983e9':primary||fixture.handsOnStudentId||fixture.studentId):role==='INSTRUCTOR'?primary||fixture.teacherId:role==='SYSTEM_ADMIN'?primary||fixture.scopeApproverId:role==='ACADEMIC_MANAGER'?(entry==='meet'?fixture.liveDataScheduleReviewerId:primary||fixture.profileReviewerId):primary;
 const credential=map.accounts.find(a=>a.role===role&&a.id===preferred&&active.has(a.id))||map.accounts.find(a=>a.role===role&&active.has(a.id));if(!credential)throw Error('PRIVATE_ACTIVE_ACCOUNT_REQUIRED');
 const {chromium}=require(path.join(ROOT,'.local-storage/se-sw-01/consolidated-fix-01/browser-tools/node_modules/playwright-core'));
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:false,args:['--no-first-run','--disable-background-networking']});
 const context=await browser.newContext({viewport:null}),page=await context.newPage();
 await page.goto(origin+'/login');await page.locator('input[type=email]').fill(credential.email);await page.locator('#login-password').fill(credential.password);
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.waitForURL(u=>!u.pathname.endsWith('/login'));
 let route=(role==='STUDENT'||role==='INSTRUCTOR')&&fixture.classId?'/classroom/'+fixture.classId:role==='ACADEMIC_MANAGER'?'/consultations':role==='SYSTEM_ADMIN'?'/workspace/authority':role==='CASHIER'?'/workspace/admissions':role==='TEACHING_INSPECTOR'?'/workspace/inspection':role==='COUNSELOR'?'/workspace/support':'/workspace';
 if(entry==='placement'&&role==='STUDENT')route='/placement/sittings/4aef2763-0edd-4bd7-984d-c8d3057300d3/result';
 else if(entry==='bank'&&role==='STUDENT')route='/payments/sepay';
 else if(entry==='practice'&&role==='STUDENT')route='/student/enrollments/'+fixture.enrollmentId+'/tests?focus='+fixture.usableTestId;
 else if(entry==='productive'&&role==='STUDENT')route='/student/enrollments/'+fixture.enrollmentId+'/tests?focus='+fixture.productiveTestId;
 else if(entry==='productive'&&role==='INSTRUCTOR')route='/instructor/classes/'+fixture.classId+'/assessments/'+fixture.productiveAssessmentId+'/attempts/'+fixture.productiveAttemptId+'/grading';
 else if(entry==='grading'&&role==='INSTRUCTOR')route='/classroom/'+fixture.classId+'/activities/'+fixture.assignment.id+'/grading';
 else if(entry==='finance'&&['STUDENT','ACADEMIC_MANAGER','CASHIER'].includes(role))route='/admissions/'+fixture.usableApplicationId;
 else if(entry==='calendar'&&['STUDENT','INSTRUCTOR'].includes(role))route='/my';
 else if(entry==='meet'&&['STUDENT','INSTRUCTOR'].includes(role))route='/my/events/'+fixture.liveDataSessionId;
 else if(entry==='meet'&&role==='ACADEMIC_MANAGER')route='/academic/session-engagement';
 else if(entry!=='home')throw Error('ENTRY_ROLE_MISMATCH');
 await page.goto(origin+route);
 console.log(JSON.stringify({status:'LOCAL_DEMO_ROLE_OPENED',role,secretsPrinted:false,databaseOid:'1313121',scope:'LINKED_LOCAL_DEMO_ENTRY'}));
 await new Promise(resolve=>browser.once('disconnected',resolve));
})().catch(()=>{console.error('LOCAL_DEMO_ROLE_OPEN_BLOCKED_REDACTED');process.exitCode=1;});
