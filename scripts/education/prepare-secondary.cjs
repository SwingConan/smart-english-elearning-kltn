'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {connect,OUT,ROOT}=require('./target.cjs');
const {login}=require('./local-client.cjs');
const {units,lessons}=require('./curriculum.cjs');
const {profiles,advanced,profileLessons}=require('./specialisations.cjs');
const file=path.join(OUT,'secondary-manifest.json');
const state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{classes:{},blocked:[]};
const save=()=>fs.writeFileSync(file,JSON.stringify(state,null,2));
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
(async()=>{
 const {db}=await connect();let offerings;
 try{offerings=(await db.query(`SELECT co.*,u.email AS "teacherEmail",ia.id AS "currentAssignmentId",ia."instructorId" AS "assignedInstructorId",c.title AS "courseTitle"
 FROM class_offerings co JOIN courses c ON c.id=co."courseId"
 LEFT JOIN LATERAL (SELECT * FROM class_instructor_assignments a WHERE a."classOfferingId"=co.id AND a.state IN ('PUBLISHED','SUPERSEDED') AND a."effectiveFrom"<=clock_timestamp() AND a."reservedUntil">clock_timestamp() ORDER BY a."effectiveFrom" DESC LIMIT 1) ia ON true
 LEFT JOIN users u ON u.id=coalesce(ia."instructorId",CASE WHEN NOT EXISTS(SELECT 1 FROM class_instructor_assignments a WHERE a."classOfferingId"=co.id) THEN co."instructorId" END)
 WHERE co.status<>'DRAFT' AND co.id<>'18653fb2-d42a-4aea-8313-a20e7f911daa' ORDER BY co."courseId",co.id`)).rows;
 await db.query('ROLLBACK');}finally{await db.end();}
 const {chromium}=require(path.join(ROOT,'.local-storage/se-sw-01/consolidated-fix-01/browser-tools/node_modules/playwright-core'));
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-background-networking','--no-first-run']});
 try{
  const page=await browser.newPage();
  const clients=new Map();
  for(const o of offerings){
   if(!o.teacherEmail){state.blocked.push({classId:o.id,reason:'Không có phân công giảng viên hiện hành; không tự cấp quyền.'});save();continue;}
   if(!clients.has(o.teacherEmail))clients.set(o.teacherEmail,(await login(o.teacherEmail)).request);
   const request=clients.get(o.teacherEmail),profile=profiles[o.courseId]||{name:'TOEIC nền tảng',focus:'FOUNDATION',indexes:units.map((_,i)=>i)};
   const c='/api/v2/class-lms/classes/'+o.id;
   const cls=state.classes[o.id]??={classId:o.id,courseId:o.courseId,name:o.name,weeks:[],openedAt:new Date().toISOString()};state.classes[o.id]=cls;
   for(let i=0;i<profile.indexes.length;i++){
    const index=profile.indexes[i],u=units[index],content=profile.focus==='FOUNDATION'?lessons(u,index):profileLessons(profile,i);
    const w=cls.weeks[i]??={number:i+1,title:u.title,activities:[]};cls.weeks[i]=w;
    const recordedStart=new Date(o.classStart||'2026-11-16T00:00:00Z').toISOString().slice(0,10);
    const base=profile.focus==='FOUNDATION'&&recordedStart<'2026-11-16'?'2026-11-16':recordedStart;
    const first=new Date(base+'T00:00:00Z');first.setUTCDate(first.getUTCDate()+i*7);
    const opening=first.toISOString().slice(0,10),due=new Date(first);due.setUTCDate(due.getUTCDate()+6);
    const release=profile.focus==='FOUNDATION'&&i===0?cls.openedAt:opening+'T08:00:00+07:00';
    // Existing class intervals determine the dates. Spread six topics within their actual window.
    if(o.classEnd&&new Date(due)>new Date(o.classEnd)){due.setTime(new Date(o.classEnd).getTime());due.setUTCHours(16,59,0,0);}
    const deadline=due.toISOString().slice(0,10)+'T23:59:00+07:00';
    if(new Date(deadline)<=new Date(release))throw Error('TOPIC_WINDOW_OUTSIDE_CLASS: '+o.id);
    const intro=`${profile.name}. ${u.goals.join(' ')} Tự học theo mốc hoạt động; các buổi bổ sung cần học vụ duyệt trước khi thành lịch chính thức.`;
    if(!w.section){w.section=await request(c+'/sections','POST',{title:`Học phần ${i+1} · ${u.title}`,introduction:intro});save();}
    if(!w.section.revisionId){w.section={...w.section,...await request(c+'/sections/'+w.section.id+'/publish','POST',{expectedLockVersion:w.section.lockVersion})};save();}
    for(const [j,l]of content.entries()){
     if(!w.activities[j]){w.activities[j]=await request(c+'/sections/'+w.section.id+'/activities','POST',{type:'LESSON',title:l.title,introduction:u.goals[j]||u.goals[0],contentMarkdown:l.markdown,availableFrom:release});save();}
     if(w.activities[j].state!=='PUBLISHED'){w.activities[j]={...w.activities[j],...await request(c+'/activities/'+w.activities[j].id+'/publish','POST',{expectedLockVersion:w.activities[j].lockVersion})};save();}
    }
    const pdfPath=path.join(OUT,'assets',`${profile.focus.toLowerCase()}-${i+1}.pdf`);
    if(!fs.existsSync(pdfPath)){
     const html=`<!doctype html><html lang="vi"><meta charset="utf-8"><style>@page{size:A4;margin:18mm}body{font:11pt/1.55 Arial,sans-serif;color:#172033}h1,h2{color:#3730a3}section{break-before:page}p{white-space:pre-wrap}</style><h1>Smart English · ${escape(profile.name)}</h1><h2>${escape(u.title)}</h2>${content.map((l,j)=>`<${j?'section':'div'}><h2>${escape(l.title)}</h2><p>${escape(l.markdown.replace(/\x60\x60\x60audio[\s\S]*?\x60\x60\x60/g,'Audio nguyên bản: mở bài học trực tuyến để nghe hoặc tải WAV.'))}</p></${j?'section':'div'}>`).join('')}<p>Nội dung nguyên bản để học tập. Ngày diễn ra trong tình huống không phải lịch lớp; xem hoạt động trong LMS để biết ngày mở và hạn nộp thật.</p></html>`;
     await page.setContent(html);await page.pdf({path:pdfPath,format:'A4',printBackground:true});
    }
    if(!w.material){w.material=await request(c+'/sections/'+w.section.id+'/activities','POST',{type:'RESOURCE',title:`Tài liệu tự học · ${u.title}`,introduction:`PDF đầy đủ bài giảng, ngữ liệu và hoạt động ${profile.name.toLowerCase()}.`,availableFrom:release});save();}
    if(!w.material.file){const form=new FormData();form.append('file',new Blob([fs.readFileSync(pdfPath)],{type:'application/pdf'}),`tai-lieu-hoc-phan-${i+1}.pdf`);form.append('expectedLockVersion',String(w.material.lockVersion));w.material={...w.material,...await request(c+'/activities/'+w.material.id+'/file','POST',form)};save();}
    if(w.material.state!=='PUBLISHED'){w.material={...w.material,...await request(c+'/activities/'+w.material.id+'/publish','POST',{expectedLockVersion:w.material.lockVersion})};save();}
    if(!w.assignment){w.assignment=await request(c+'/sections/'+w.section.id+'/activities','POST',{type:'ASSIGNMENT',title:`Bài tập vận dụng · ${u.title}`,introduction:'Nộp văn bản hoặc tài liệu PDF/TXT; lịch và trạng thái bài nộp do hệ thống quản lý.',contentMarkdown:`# Nhiệm vụ\n${profile.focus==='INTENSIVE'||profile.focus==='READING'?`Đọc tình huống ${advanced[i].title} trong bài học, viết tóm tắt 100–130 từ và giải thích bốn đáp án bằng dẫn chứng. Nêu hai phương án nhiễu và lý do loại. Không khẳng định các kế hoạch trong bài đã xảy ra.`:u.assignment}\n## Thực hành giao tiếp\n${u.speaking}\nPhần nói là tự luyện; bài nộp nhận văn bản, không yêu cầu tệp ghi âm chưa được hỗ trợ.\n## Tiêu chí\nĐủ yêu cầu 40%; tổ chức và dẫn chứng 25%; chính xác ngôn ngữ 25%; từ vựng 10%. Không có điểm cho đến khi được chấm và công bố theo quy trình.`,availableFrom:release,availableUntil:deadline});save();}
    if(w.assignment.state!=='PUBLISHED'){w.assignment={...w.assignment,...await request(c+'/activities/'+w.assignment.id+'/publish','POST',{expectedLockVersion:w.assignment.lockVersion})};save();}
    if(!w.quiz){w.quiz=await request(c+'/sections/'+w.section.id+'/activities','POST',{type:'QUIZ',title:`Ôn tập học phần · ${u.title}`,introduction:'Nguồn câu hỏi có đáp án và giải thích, chờ duyệt độc lập trước khi phát hành.',contentMarkdown:''});save();}
    if(!w.quizSource){const items=(profile.focus==='INTENSIVE'||profile.focus==='READING')?[...advanced[i].items,...u.quiz.slice(0,2)]:u.quiz;
     w.quizSource=await request('/api/v2/class-quiz/classes/'+o.id+'/activities/'+w.quiz.id+'/sources','POST',{idempotencyKey:randomUUID(),expectedVersion:0,title:`Ôn tập ${profile.name} · ${u.title}`,openAt:opening+'T08:00:00+07:00',closeAt:deadline,durationMinutes:20,questions:items.map(q=>({content:`${profile.focus==='INTENSIVE'||profile.focus==='READING'?advanced[i].text:u.reading}\n\n${q.prompt}`,explanation:q.explanation,points:1,options:q.options.map((v,j)=>({content:v,isCorrect:j===q.correct}))}))});save();}
   }
   console.log(`${o.name}: ${cls.weeks.length} học phần có nội dung, bài tập và PDF; quiz giữ nháp.`);
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
