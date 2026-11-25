'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {ROOT,connect}=require('./education/target.cjs');
const {credential,ORIGIN}=require('./education/local-client.cjs');
const directory=path.join(ROOT,'.local-storage/student-services');fs.mkdirSync(directory,{recursive:true});
async function snapshot(){const {db}=await connect();try{const state={};for(const table of ['support_tickets','support_messages','support_events','permission_grants','w05b_bookings','w05b_changes','w05b_commands','w05b_reports','test_attempts','assignment_grades']){const rows=(await db.query(`SELECT row_to_json(t)::text AS value FROM "${table}" t`)).rows.map(r=>r.value).sort();state[table]={count:rows.length,hash:crypto.createHash('sha256').update(rows.join('\n')).digest('hex')};}await db.query('ROLLBACK');return state;}finally{await db.end();}}
(async()=>{
 const before=await snapshot();
 const {chromium}=require(path.join(ROOT,'.local-storage/se-sw-01/consolidated-fix-01/browser-tools/node_modules/playwright-core'));
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:false,args:['--no-first-run','--disable-background-networking']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),c=credential('student@gmail.com');
 const proof={origin:ORIGIN,checks:{},pageErrors:[],businessWrites:[],screenshots:[]};
 page.on('pageerror',e=>proof.pageErrors.push(e.message));page.on('request',r=>{if(!['GET','HEAD','OPTIONS'].includes(r.method())&&r.url().includes('/api/')&&!r.url().endsWith('/api/auth/login'))proof.businessWrites.push({method:r.method(),path:new URL(r.url()).pathname});});
 const shot=async name=>{const file=path.join(directory,name+'.png');await page.screenshot({path:file});proof.screenshots.push(file);};
 try{
  await page.goto(ORIGIN+'/login');await page.locator('input[type=email]').fill(c.email);await page.locator('#login-password').fill(c.password);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.waitForURL(u=>!u.pathname.endsWith('/login'));
  await page.goto(ORIGIN+'/placement');await page.getByRole('heading',{name:'Đánh giá trình độ',exact:true}).waitFor();await page.getByText('Bài đánh giá chính thức chưa mở',{exact:true}).waitFor();await page.getByRole('link',{name:'Mở bài kiểm tra',exact:true}).first().waitFor();proof.checks.placement={availableLinks:await page.getByRole('link',{name:'Mở bài kiểm tra',exact:true}).count(),historyEmpty:await page.getByText('Bạn chưa có lần đánh giá đầu vào nào được ghi nhận.',{exact:true}).isVisible(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)};await shot('01-assessments-desktop');
  await page.goto(ORIGIN+'/consultations');await page.getByRole('heading',{name:'Lịch hẹn của tôi',exact:true}).waitFor();await page.getByRole('button',{name:'Hủy lịch',exact:true}).waitFor();proof.checks.consultations={absenceHidden:await page.getByRole('button',{name:'Báo vắng',exact:true}).count()===0,reasonHidden:await page.getByLabel('Lý do',{exact:true}).count()===0};
  await page.getByLabel('Giảng viên',{exact:true}).selectOption({index:1});await page.getByLabel('Thời gian tư vấn',{exact:true}).locator('option').nth(1).waitFor({state:'attached'});await page.getByLabel('Thời gian tư vấn',{exact:true}).selectOption({index:1});await shot('02-consultations-desktop');
  await page.getByRole('button',{name:'Hủy lịch',exact:true}).click();await page.getByRole('dialog').waitFor();proof.checks.consultations.cancelModal=await page.getByRole('dialog').getByLabel('Lý do',{exact:true}).isVisible();proof.checks.consultations.confirmDisabled=await page.getByRole('dialog').getByRole('button',{name:'Xác nhận hủy',exact:true}).isDisabled();await shot('03-consultation-action-modal');await page.getByRole('dialog').getByRole('button',{name:'Quay lại',exact:true}).click();
  await page.goto(ORIGIN+'/support');await page.getByLabel('Nội dung yêu cầu',{exact:true}).waitFor();await page.getByRole('link',{name:'Xem phiếu và phản hồi',exact:true}).first().waitFor();proof.checks.support={formVisible:true,ticketLinks:await page.getByRole('link',{name:'Xem phiếu và phản hồi',exact:true}).count(),expiredHandlingExplained:await page.getByText(/Quyền xử lý của nhân sự hỗ trợ đã hết hạn/).isVisible()};await shot('04-support-desktop');
  await page.getByRole('link',{name:'Xem phiếu và phản hồi',exact:true}).first().click();await page.getByRole('heading',{name:'Trao đổi',exact:true}).waitFor();proof.checks.support.ownedTicketOpened=true;await shot('05-owned-ticket');
  for(const [route,name,ready]of [['/placement','06-assessments-mobile','Đánh giá trình độ'],['/consultations','07-consultations-mobile','Đặt lịch tư vấn 1:1'],['/support','08-support-mobile','Hỗ trợ học viên']]){
    await page.setViewportSize({width:390,height:844});await page.goto(ORIGIN+route);await page.getByRole('heading',{name:ready,exact:true}).waitFor();
    if(route==='/support')await page.getByLabel('Nội dung yêu cầu',{exact:true}).waitFor();else if(route==='/consultations')await page.getByRole('button',{name:'Hủy lịch',exact:true}).waitFor();else await page.getByRole('link',{name:'Mở bài kiểm tra',exact:true}).first().waitFor();
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);proof.checks[route+'Mobile']={overflow};if(overflow)throw Error('MOBILE_OVERFLOW '+route);await shot(name);
  }
  const availability=await context.request.get(ORIGIN+'/api/v2/support/availability');proof.checks.support.api={status:availability.status(),...await availability.json()};
  const history=await context.request.get(ORIGIN+'/api/v2/placement/history');proof.checks.historyApiStatus=history.status();
  const anonymous=await browser.newContext();const denied=await anonymous.request.get(ORIGIN+'/api/v2/support/tickets');proof.checks.anonymousDenied=denied.status()===401;await anonymous.close();
  const after=await snapshot();proof.changedTables=Object.keys(before).filter(t=>JSON.stringify(before[t])!==JSON.stringify(after[t]));if(proof.changedTables.length||proof.businessWrites.length||proof.pageErrors.length)throw Error('UNEXPECTED_WRITE_OR_PAGE_ERROR');
  await page.setViewportSize({width:1440,height:1000});await page.goto(ORIGIN+'/support');await page.getByLabel('Nội dung yêu cầu',{exact:true}).waitFor();
  proof.complete=true;
 }catch(e){proof.failure=e.message;try{await shot('failure');}catch{}process.exitCode=1;}
 fs.writeFileSync(path.join(directory,'browser.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));
 if(process.argv.includes('--keep')&&proof.complete){console.log('Local student Support page remains open.');await new Promise(resolve=>browser.once('disconnected',resolve));}else await browser.close();
})().catch(e=>{console.error(e.message);process.exitCode=1;});
