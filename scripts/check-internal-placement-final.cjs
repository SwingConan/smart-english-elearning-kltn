'use strict';
const fs=require('node:fs'),path=require('node:path');
const {ROOT,OUT,connect}=require('./education/target.cjs');
const {credential,ORIGIN}=require('./education/local-client.cjs');
const {chromium}=require(path.join(ROOT,'.local-storage/se-sw-01/consolidated-fix-01/browser-tools/node_modules/playwright-core'));
const assert=(v,m)=>{if(!v)throw Error(m);};
(async()=>{
 const proof=JSON.parse(fs.readFileSync(path.join(OUT,'internal-placement-browser.json'),'utf8'));
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:false,args:['--disable-gpu','--no-first-run','--disable-background-networking']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}}),c=credential('student@gmail.com');
  const auth=await context.request.post(ORIGIN+'/api/auth/login',{headers:{origin:ORIGIN},data:{email:c.email,password:c.password}});assert(auth.ok(),'LOGIN_FAILED');
  const page=await context.newPage();page.on('pageerror',e=>proof.errors.push(e.message));
  const resultResponse=await context.request.get(ORIGIN+'/api/v2/placement/workflow/attempts/'+proof.attemptId+'/diagnostic');assert(resultResponse.ok(),'RESULT_API_FAILED');const result=await resultResponse.json();
  await page.goto(ORIGIN+'/placement/sittings/'+proof.attemptId+'/result');await page.getByText(result.label,{exact:true}).waitFor();
  proof.checks.loadedResultMobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);await page.screenshot({path:path.join(OUT,'internal-placement-result-mobile-loaded.png'),fullPage:true});
  await page.goto(ORIGIN+'/placement');await page.locator('input[type=radio][value=FOUR_SKILLS]').check();const goals=page.locator('input[type=number]');await goals.nth(0).fill('650');await goals.nth(1).fill('140');await goals.nth(2).fill('140');
  await page.getByRole('button',{name:/Bắt đầu làm bài|Tiếp tục làm bài/}).click();await page.waitForURL(/\/placement\/sittings\/[a-f0-9-]+$/);const fourId=page.url().split('/').pop();
  const examResponse=await context.request.get(ORIGIN+'/api/v2/placement/workflow/attempts/'+fourId);assert(examResponse.ok(),'FOUR_START_FAILED');const exam=await examResponse.json();assert(exam.mode==='FOUR_SKILLS'&&exam.phase==='LISTENING','FOUR_PHASE_INVALID');
  await page.getByRole('button',{name:/Lưu câu trả lời/}).waitFor();await page.screenshot({path:path.join(OUT,'internal-placement-four-skills-exam-mobile.png')});proof.checks.fourSkillsStarted={attemptId:fourId,phase:exam.phase,goals:exam.goals,actualSpeakingNotFabricated:true};
  proof.checks.fourExamMobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(OUT,'internal-placement-four-skills-exam-desktop.png')});
  const {db}=await connect();try{
   await db.query("SELECT set_config('app.placement_internal_release','PO_INTERNAL_20261113',true)");const release=(await db.query('SELECT * FROM placement_internal_releases WHERE "sourceId"=$1',['be3b7a9e-b047-473e-8741-d5511a017d72'])).rows[0];const source=(await db.query('SELECT snapshot FROM placement_source_versions WHERE id=$1',[release.sourceId])).rows[0].snapshot;
   let verified=0;for(const skill of ['SPEAKING','WRITING']){const groups=source.groups.filter(g=>g.skill===skill);for(let i=0;i<groups.length;i++){const t=release.timing.tasks.find(t=>t.groupId===groups[i].id);const seconds=(await db.query(`SELECT w04b_window(jsonb_populate_record(NULL::placement_sittings,$1::jsonb)) AS seconds`,[JSON.stringify({phase:skill,taskIndex:i,policyId:release.policyId})])).rows[0].seconds;assert(seconds===t.preparationSeconds+t.playbackSeconds+t.responseSeconds,'TASK_TIMING_MISMATCH');verified++;}}
   proof.checks.swTaskWindowsVerified=verified;
   const rows=(await db.query('SELECT skill,"graderId","rubricId","assignmentId",body FROM placement_human_evaluations WHERE "attemptId"=$1',[proof.attemptId])).rows;assert(rows.length===1&&rows[0].skill==='LR'&&!rows[0].graderId&&!rows[0].rubricId&&!rows[0].assignmentId,'FALSE_HUMAN_GRADE');
   assert((await db.query('SELECT count(*)::int AS n FROM placement_result_releases r JOIN placement_human_evaluations e ON e.id=r."evaluationId" WHERE e."attemptId"=$1',[proof.attemptId])).rows[0].n===0,'FALSE_ACADEMIC_PUBLICATION');proof.checks.noForgedTeacherOrAcademicApproval=true;
  }finally{await db.end();}
  assert(!proof.checks.loadedResultMobileOverflow&&!proof.checks.fourExamMobileOverflow&&!proof.errors.length,'UI_ERROR_OR_OVERFLOW');
  fs.writeFileSync(path.join(OUT,'internal-placement-browser.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof.checks));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
