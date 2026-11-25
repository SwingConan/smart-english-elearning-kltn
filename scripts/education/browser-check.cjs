'use strict';
const fs=require('node:fs'),path=require('node:path');
const {ROOT,OUT,connect}=require('./target.cjs');
const {credential,ORIGIN}=require('./local-client.cjs');
const state=JSON.parse(fs.readFileSync(path.join(OUT,'primary-manifest.json'),'utf8'));
const keep=process.argv.includes('--keep');
(async()=>{
 const {db}=await connect();try{await db.query('ROLLBACK');}finally{await db.end();}
 const {chromium}=require(path.join(ROOT,'.local-storage/se-sw-01/consolidated-fix-01/browser-tools/node_modules/playwright-core'));
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:false,args:['--disable-background-networking','--no-first-run']});
 const screenshots=path.join(OUT,'screenshots');fs.mkdirSync(screenshots,{recursive:true});
 const result={origin:ORIGIN,checks:{},screenshots:[],errors:[]};
 async function signIn(email,viewport){
  const c=credential(email),context=await browser.newContext({viewport,acceptDownloads:true}),page=await context.newPage();
  page.on('pageerror',e=>result.errors.push(e.message));
  await page.goto(ORIGIN+'/login');await page.locator('input[type=email]').fill(c.email);await page.locator('#login-password').fill(c.password);
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.waitForURL(u=>!u.pathname.endsWith('/login'),{timeout:30000});
  return {page,context};
 }
 async function shot(page,name){const file=path.join(screenshots,name+'.png');await page.screenshot({path:file});result.screenshots.push(file);}
 try{
  const {page,context}=await signIn('student@gmail.com',{width:1440,height:1000});
  await page.goto(ORIGIN+'/classroom/'+state.classId);await page.locator('summary').filter({hasText:'Lộ trình và cách học'}).waitFor();
  result.checks.learnerLms=true;await shot(page,'01-learner-lms');
  await page.goto(ORIGIN+'/classroom/'+state.classId+'/activities/'+state.overview.id);await page.getByRole('heading',{name:'Lộ trình TOEIC nền tảng 12 tuần',exact:true}).waitFor();await shot(page,'02-learning-programme');
  await page.goto(ORIGIN+'/classroom/'+state.classId+'/activities/'+state.weeks[0].activities[1].id);await page.locator('audio').waitFor();
  await page.waitForFunction(()=>{const audio=document.querySelector('audio');return audio&&Number.isFinite(audio.duration)&&audio.duration>10;});
  await page.locator('audio').evaluate(async audio=>{audio.muted=true;await audio.play();});
  await page.waitForFunction(()=>document.querySelector('audio').currentTime>0.25);
  result.checks.audio=await page.locator('audio').evaluate(audio=>{audio.pause();return {duration:audio.duration,decoded:true,currentTime:audio.currentTime};});await shot(page,'03-listening-lesson');
  await page.goto(ORIGIN+'/classroom/'+state.classId+'/activities/'+state.weeks[0].material.id);
  const downloaded=page.waitForEvent('download');await page.getByRole('link',{name:/Tải tài liệu:/}).click();const download=await downloaded;
  const downloadPath=path.join(OUT,'downloaded-handout.pdf');await download.saveAs(downloadPath);const pdf=fs.readFileSync(downloadPath);
  if(pdf.subarray(0,5).toString()!=='%PDF-'||pdf.length<10000)throw Error('REAL_PDF_DOWNLOAD_REQUIRED');result.checks.pdf={downloaded:true,bytes:pdf.length};
  await page.goto(ORIGIN+'/my?month=2026-11');await page.locator('[data-day="2026-11-13"]').getByRole('button',{name:/sự kiện khác/}).waitFor();await page.getByRole('button',{name:'Xem tất cả sự kiện ngày 2026-11-13',exact:true}).click();
  await page.getByRole('dialog').locator('li').first().waitFor();result.checks.calendarDayModal={events:await page.getByRole('dialog').locator('li').count()};if(result.checks.calendarDayModal.events<3)throw Error('MULTIPLE_DAY_EVENTS_REQUIRED');await shot(page,'04-learner-calendar-day');await page.keyboard.press('Escape');
  const response=await context.request.get(ORIGIN+'/api/v2/my/calendar?month=2026-11');const calendar=await response.json();
  result.checks.calendar={status:response.status(),events:calendar.data?.length,assignments:calendar.data?.filter(e=>e.source==='ASSIGNMENT').length,assessments:calendar.data?.filter(e=>e.source==='ASSESSMENT').length};
  await page.goto(ORIGIN+'/my/events/83365de5-bfbe-4e3a-8045-608053b9d58f');await page.getByRole('heading',{name:'Nội dung của buổi học',exact:true}).waitFor();result.checks.sessionLessonLinks=await page.locator('a[href*="/activities/"]').count();await shot(page,'05-session-content-links');
  await page.goto(ORIGIN+'/student/enrollments/'+state.enrollmentId+'/tests');await page.getByText('Thực hành Nói–Viết · Giới thiệu công việc và hỏi thông tin',{exact:true}).waitFor();result.checks.speakingWritingEntry=true;await shot(page,'06-assessment-list');
  const locked=await context.request.get(ORIGIN+'/api/v2/class-lms/classes/19325a6c-0afc-4022-a8c6-2f5ccc005e52');result.checks.pendingClassDenied=locked.status()===404||locked.status()===403;
  if(!result.checks.pendingClassDenied)throw Error('PENDING_PAYMENT_ENTITLEMENT_CHANGED');
  await page.setViewportSize({width:390,height:844});await page.goto(ORIGIN+'/my?month=2026-11');await page.locator('[data-day="2026-11-13"]').getByRole('button',{name:/sự kiện khác/}).waitFor();await page.getByRole('button',{name:'Xem tất cả sự kiện ngày 2026-11-13',exact:true}).click();await page.getByRole('dialog').locator('li').first().waitFor();
  result.checks.mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);await shot(page,'07-mobile-calendar');
  if(result.checks.mobileOverflow)throw Error('MOBILE_HORIZONTAL_OVERFLOW');await page.keyboard.press('Escape');await page.setViewportSize({width:1440,height:1000});
  const teacher=await signIn('teacher@gmail.com',{width:1440,height:1000});await teacher.page.goto(ORIGIN+'/classroom/'+state.classId);await teacher.page.locator('summary').filter({hasText:'Lộ trình và cách học'}).waitFor();await shot(teacher.page,'08-teacher-same-lms');
  const tree=await teacher.context.request.get(ORIGIN+'/api/v2/class-lms/classes/'+state.classId);const data=await tree.json();
  result.checks.teacher={status:tree.status(),editable:data.editable,sections:data.sections?.length,activities:data.sections?.reduce((sum,s)=>sum+s.activities.length,0)};
  if(!data.editable)throw Error('TEACHER_CURRENT_OWNERSHIP_REQUIRED');
  await teacher.page.goto(ORIGIN+'/instructor/classes/'+state.classId+'/assessments');await teacher.page.getByText('Thực hành Nói–Viết · Giới thiệu công việc và hỏi thông tin',{exact:true}).first().waitFor();await shot(teacher.page,'09-teacher-assessments');
  await page.goto(ORIGIN+'/classroom/'+state.classId);await page.locator('summary').filter({hasText:'Lộ trình và cách học'}).waitFor();await page.bringToFront();
  result.checks.browserComplete=true;
 }catch(e){result.failure=e.message;process.exitCode=1;}
 fs.writeFileSync(path.join(OUT,'browser-check.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 if(keep&&!result.failure){console.log('Local learner and instructor tabs remain open.');await new Promise(resolve=>browser.once('disconnected',resolve));}else await browser.close();
})().catch(e=>{console.error(e.message);process.exitCode=1;});
