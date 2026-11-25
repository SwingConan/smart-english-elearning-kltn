'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {ROOT,OUT,connect}=require('./education/target.cjs');
const {credential,ORIGIN}=require('./education/local-client.cjs');
const {protectedState}=require('./education/protected.cjs');
const {chromium}=require(path.join(ROOT,'.local-storage/se-sw-01/consolidated-fix-01/browser-tools/node_modules/playwright-core'));
const file=path.join(OUT,'internal-placement-browser.json');
const assert=(value,message)=>{if(!value)throw Error(message);};
async function state(){const{db}=await connect();try{return await protectedState(db);}finally{await db.end();}}
(async()=>{
 const before=await state(),c=credential('student@gmail.com');
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:false,args:['--no-first-run','--disable-gpu','--disable-background-networking']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
 const proof={origin:ORIGIN,learner:c.email,checks:{},errors:[],testNotice:'Browser functional verification; two independent trial answers, no answer-key lookup, no claim about learner ability.'};
 page.on('pageerror',e=>proof.errors.push(e.message));page.on('dialog',d=>void d.accept());
 const json=async(url,method='GET',body)=>{const r=await context.request.fetch(ORIGIN+'/api'+url,{method,headers:{origin:ORIGIN},...(body?{data:body}:{})});assert(r.ok(),`${method} ${url}: ${r.status()} ${(await r.text()).slice(0,400)}`);return r.json();};
 try{
  await page.goto(ORIGIN+'/login');await page.locator('input[type=email]').fill(c.email);await page.locator('#login-password').fill(c.password);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.waitForURL(u=>!u.pathname.endsWith('/login'));
  await page.goto(ORIGIN+'/placement');await page.getByRole('button',{name:'Bắt đầu làm bài',exact:true}).waitFor();
  const config=await json('/v2/placement/config');assert(config.fullExamEnabled&&config.sources.length===2,'BOTH_FULL_BANKS_REQUIRED');proof.checks.config=config.sources.map(s=>({mode:s.mode,itemCount:s.itemCount}));
  await page.locator('input[type=number]').first().fill('650');await page.screenshot({path:path.join(OUT,'internal-placement-entry-desktop.png')});
  await page.getByRole('button',{name:'Bắt đầu làm bài',exact:true}).click();await page.waitForURL(/\/placement\/sittings\/[a-f0-9-]+$/);
  const attemptId=page.url().split('/').pop();proof.attemptId=attemptId;
  let exam=await json('/v2/placement/workflow/attempts/'+attemptId);
  if(exam.phase==='LISTENING'){
  assert(exam.groups.reduce((n,g)=>n+g.questions.length,0)===100,'LISTENING_100_REQUIRED');
  assert(!JSON.stringify(exam).includes('isCorrect')&&!JSON.stringify(exam).includes('explanation'),'ANSWER_KEY_LEAK');
  const first=exam.groups[0],audio=first.stimuli.find(s=>s.type==='AUDIO'),image=first.stimuli.find(s=>s.type==='IMAGE');
  for(const stimulus of [audio,image]){assert(stimulus?.mediaUrl,'FIRST_QUESTION_MEDIA_MISSING');const response=await context.request.get(ORIGIN+stimulus.mediaUrl);assert(response.ok(),'MEDIA_HTTP_FAILED');assert((await response.body()).length>100,'MEDIA_EMPTY');}
  await page.locator('input[type=radio]').first().check();
  const saved=page.waitForResponse(r=>r.url().endsWith('/answers')&&r.request().method()==='POST');await page.getByRole('button',{name:'Lưu câu trả lời',exact:true}).click();assert((await saved).ok(),'ANSWER_SAVE_FAILED');
  await page.reload();await page.getByRole('button',{name:'Lưu câu trả lời',exact:true}).waitFor();assert(await page.locator('input[type=radio]').first().isChecked(),'ANSWER_NOT_RESTORED');proof.checks.answerPersisted=true;
  await page.screenshot({path:path.join(OUT,'internal-placement-listening-desktop.png')});
  const next=page.waitForResponse(r=>r.url().endsWith('/commands')&&r.request().method()==='POST');await page.getByRole('button',{name:'Kết thúc phần / bài hiện tại',exact:true}).click();assert((await next).ok(),'LISTENING_TRANSITION_FAILED');
  }else if(exam.phase==='READING'&&fs.existsSync(file)){
    const previous=JSON.parse(fs.readFileSync(file,'utf8'));if(previous.attemptId===attemptId)Object.assign(proof.checks,previous.checks);
  }
  await page.getByText('Đọc hiểu',{exact:true}).first().waitFor();exam=await json('/v2/placement/workflow/attempts/'+attemptId);assert(exam.phase==='READING'&&exam.groups.reduce((n,g)=>n+g.questions.length,0)===100,'READING_100_REQUIRED');
  await page.locator('input[type=radio]').first().check();const readSave=page.waitForResponse(r=>r.url().endsWith('/answers')&&r.request().method()==='POST');await page.getByRole('button',{name:'Lưu câu trả lời',exact:true}).click();assert((await readSave).ok(),'READING_SAVE_FAILED');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(OUT,'internal-placement-reading-mobile.png')});proof.checks.examMobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  const submit=page.waitForResponse(r=>r.url().endsWith('/commands')&&r.request().method()==='POST');await page.getByRole('button',{name:'Kết thúc phần / bài hiện tại',exact:true}).click();assert((await submit).ok(),'SUBMISSION_FAILED');
  exam=await json('/v2/placement/workflow/attempts/'+attemptId);assert(exam.phase==='SUBMITTED'&&exam.receipt,'SAVED_SUBMISSION_RECEIPT_REQUIRED');
  const result=await json('/v2/placement/workflow/attempts/'+attemptId+'/diagnostic');assert(result.skillResults.every(s=>s.value!==null)&&result.officialToeicScore===null,'INTERNAL_REAL_COUNTS_REQUIRED');proof.checks.result=result.skillResults.map(s=>({skill:s.skill,value:s.value,samples:s.samples}));
  await page.getByRole('link',{name:'Trạng thái kết quả',exact:true}).click();await page.getByRole('heading',{name:'Kết quả đánh giá năng lực đầu vào',exact:true}).waitFor();await page.screenshot({path:path.join(OUT,'internal-placement-result-mobile.png')});proof.checks.resultMobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  const history=await json('/v2/placement/history');assert(history.some(h=>h.attemptId===attemptId&&h.status==='SUBMITTED'),'OWN_HISTORY_MISSING');proof.checks.historySaved=true;
  const teacher=credential('teacher@gmail.com'),other=await browser.newContext();const auth=await other.request.post(ORIGIN+'/api/auth/login',{headers:{origin:ORIGIN},data:{email:teacher.email,password:teacher.password}});assert(auth.ok(),'TEACHER_LOGIN_FAILED');const forbidden=await other.request.get(ORIGIN+'/api/v2/placement/workflow/attempts/'+attemptId);assert([403,404].includes(forbidden.status()),'FOREIGN_ATTEMPT_EXPOSED');proof.checks.foreignAttemptDenied=true;await other.close();
  await page.goto(ORIGIN+'/placement');await page.locator('input[type=radio][value=FOUR_SKILLS]').check();assert(await page.locator('input[type=number]').count()===3,'FOUR_SKILL_GOALS_MISSING');await page.screenshot({path:path.join(OUT,'internal-placement-four-skills-mobile.png')});proof.checks.entryMobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  const after=await state();proof.protectedChanges=Object.keys(before).filter(k=>JSON.stringify(before[k])!==JSON.stringify(after[k]));assert(proof.protectedChanges.every(k=>['attempts','answers'].includes(k)),'UNRELATED_BUSINESS_DATA_CHANGED');assert(!proof.errors.length,'BROWSER_ERRORS');assert(!proof.checks.examMobileOverflow&&!proof.checks.resultMobileOverflow&&!proof.checks.entryMobileOverflow,'MOBILE_OVERFLOW');
  fs.writeFileSync(file,JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
 }catch(e){proof.failure=e.message;fs.writeFileSync(file,JSON.stringify(proof,null,2));await page.screenshot({path:path.join(OUT,'internal-placement-failure.png')}).catch(()=>{});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
