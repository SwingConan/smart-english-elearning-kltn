'use strict';
const fs=require('node:fs'),path=require('node:path');
const {connect,OUT}=require('./target.cjs');
const {login}=require('./local-client.cjs');
const {profiles}=require('./specialisations.cjs');
const {units,programmeDescription}=require('./curriculum.cjs');
const file=path.join(OUT,'catalog-finalisation.json');
const state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{linked:[],versions:{}};
const save=()=>fs.writeFileSync(file,JSON.stringify(state,null,2));
(async()=>{
 const secondary=JSON.parse(fs.readFileSync(path.join(OUT,'secondary-manifest.json'),'utf8'));
 const {db}=await connect();let sessions,courses;
 try{
  sessions=(await db.query(`SELECT ts.id,ts."classOfferingId",ts."startsAt",co."courseId",u.email FROM teaching_sessions ts JOIN class_offerings co ON co.id=ts."classOfferingId" JOIN users u ON u.id=ts."instructorId" WHERE ts.state='PUBLISHED' AND ts."classOfferingId"<>$1`,['18653fb2-d42a-4aea-8313-a20e7f911daa'])).rows;
  courses=(await db.query('SELECT id,title,description,level,"skillScope","isPublished" FROM courses')).rows;
  await db.query('ROLLBACK');
 }finally{await db.end();}
 const clients=new Map();
 for(const session of sessions){
  if(state.linked.includes(session.id))continue;
  const w=secondary.classes[session.classOfferingId]?.weeks[0];if(!w)continue;
  if(!clients.has(session.email))clients.set(session.email,(await login(session.email)).request);const request=clients.get(session.email);
  const c='/api/v2/class-lms/classes/'+session.classOfferingId;
  for(const item of w.activities.slice(0,2)){
   const a=await request(c+'/activities/'+item.id);const date=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(session.startsAt));
   const draft=await request(c+'/sections/'+w.section.id+'/activities/'+a.id,'PATCH',{type:'LESSON',title:a.title,introduction:a.introduction,contentMarkdown:a.contentMarkdown+`\n## Buổi học liên quan\n[Buổi học ngày ${date}](/my/events/${session.id})\nBuổi học đã được duyệt. Nội dung mở theo ngày khả dụng; các buổi bổ sung chỉ trở thành lịch chính thức sau khi được duyệt độc lập.`,availableFrom:a.availableFrom,expectedLockVersion:a.lockVersion});
   await request(c+'/activities/'+a.id+'/publish','POST',{expectedLockVersion:draft.lockVersion});
  }
  state.linked.push(session.id);save();
 }
 const academic=(await login('academic@gmail.com')).request;
 for(const id of ['cdec25d1-9cee-4c1e-9df6-c1bf0b2e1df6','0709f6b3-9abd-4ffa-abcc-d7aa43a05b1c','0594d51b-4b5f-4969-8492-7f851746bc25'])if(!state.versions[id]){
  const c=courses.find(c=>c.id===id),sw=id==='0594d51b-4b5f-4969-8492-7f851746bc25';
  const description=sw?'Đề xuất chương trình Speaking & Writing công sở gồm 6 học phần: giới thiệu, sắp xếp cuộc họp, đơn hàng, hỗ trợ khách hàng, đối chiếu thông tin và kế hoạch tiếp theo. Mỗi học phần có mục tiêu, 3 bài học đầy đủ, tình huống nói 60–90 giây và email 120–150 từ với tiêu chí phản hồi. Bản biên soạn nguyên bản đã lưu trong bộ học liệu; chưa có lớp mở, phân công giảng viên hoặc giá được duyệt. Chưa phát hành.':programmeDescription()+' Chủ đề: '+units.map(u=>u.title).join('; ')+'.';
  state.versions[id]=await academic('/api/v2/academic/programs/'+id+'/versions','POST',{title:c.title,description,level:c.level,skillScope:c.skillScope,effectiveFrom:'2026-11-16T00:00:00+07:00',reason:'Bản biên soạn chương trình để học vụ rà soát học thuật độc lập. Không đặt giá khi chưa được duyệt; không mở lớp, không phát hành Placement hoặc cấp chứng chỉ.'});
  if(state.versions[id].state!=='DRAFT')throw Error('PROGRAMME_DRAFT_REQUIRED');save();
 }
 // Presentation metadata describes actual prepared scope. Approved CourseVersion,
 // class dates, enrolment, price and authority remain unchanged.
 const writable=await connect(false);
 try{
  for(const [id,p]of Object.entries(profiles))if(!courses.find(c=>c.id===id).description.includes('Lộ trình đã biên soạn gồm 6 học phần theo chủ đề'))await writable.db.query('UPDATE courses SET description=$2,"updatedAt"=clock_timestamp() WHERE id=$1',[id,`${courses.find(c=>c.id===id).description}\n\nLộ trình đã biên soạn gồm 6 học phần theo chủ đề, 18 bài học có nội dung, PDF đầy đủ, bài tập có ngày mở và hạn nộp. Trọng tâm: ${p.name.toLowerCase()}. Các buổi bổ sung đang là đề xuất để học vụ duyệt; lịch đã duyệt, giá và điều kiện ghi danh được giữ nguyên. Quiz mới chỉ phát hành sau khi được duyệt độc lập.`]);
  await writable.db.query('COMMIT');
 }catch(e){await writable.db.query('ROLLBACK');throw e;}finally{await writable.db.end();}
 console.log(JSON.stringify({publishedSessionsLinked:state.linked.length,newProgrammeDrafts:Object.keys(state.versions).length,approvedVersionsChanged:0}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
