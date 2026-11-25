'use strict';
const fs=require('node:fs'),path=require('node:path');
const {connect,OUT}=require('./target.cjs');
const {login}=require('./local-client.cjs');
const {profiles}=require('./specialisations.cjs');
const {units}=require('./curriculum.cjs');
const file=path.join(OUT,'catalog-schedules.json');
const state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{classes:{}};
const save=()=>fs.writeFileSync(file,JSON.stringify(state,null,2));
(async()=>{
 const {db}=await connect();let classes,reserved;
 try{
  classes=(await db.query(`SELECT co.*,a.id AS "assignmentId",a."instructorId" AS teacher,a."reservedUntil",u.email AS maker FROM class_offerings co JOIN courses c ON c.id=co."courseId" JOIN users u ON u.id=c."createdById" JOIN class_instructor_assignments a ON a."classOfferingId"=co.id AND a.state='PUBLISHED' WHERE co."courseId"=ANY($1::uuid[]) AND co."classStart" IS NOT NULL ORDER BY co."classStart",co.id`,[Object.keys(profiles)])).rows;
  reserved=(await db.query(`SELECT id,"classOfferingId","instructorId","roomId","startsAt","endsAt",state FROM teaching_sessions WHERE state IN ('PUBLISHED','PENDING_APPROVAL','DRAFT')`)).rows;
  await db.query('ROLLBACK');
 }finally{await db.end();}
 const clients=new Map();
 for(const c of classes){
  if(!clients.has(c.maker))clients.set(c.maker,(await login(c.maker)).request);const request=clients.get(c.maker);
  const data=state.classes[c.id]??={name:c.name,sessions:[],warnings:[]};state.classes[c.id]=data;
  const weekdays=c.name.includes('Cuối tuần')?[0,6]:c.name.includes('3-5-7')?[2,4,6]:c.name.includes('Thứ 7')?[1,3,5,6]:[1,3,5];
  const start=new Date(c.classStart.toISOString().slice(0,10)+'T00:00:00Z');const finish=new Date(c.classEnd);
  for(let week=0;week<6;week++){
   const from=new Date(start.getTime()+week*7*86400000),until=new Date(from.getTime()+7*86400000);
   let count=reserved.filter(s=>s.classOfferingId===c.id&&new Date(s.startsAt)>=from&&new Date(s.startsAt)<until).length;
   for(let offset=0;offset<7&&count<2;offset++){
    const day=new Date(from.getTime()+offset*86400000),date=day.toISOString().slice(0,10);
    if(!weekdays.includes(day.getUTCDay()))continue;
    if(reserved.some(s=>s.classOfferingId===c.id&&new Date(s.startsAt).toISOString().slice(0,10)===date))continue;
    for(const time of ['17:30','19:45']){
     const begins=new Date(date+'T'+time+':00+07:00'),ends=new Date(begins.getTime()+2*3600000);
     if(ends>finish||ends>new Date(c.reservedUntil)||begins<=new Date())continue;
     const room=c.modality==='ONLINE'?null:'d46150e1-88e4-4814-b508-da98a8ccd719';
     if(reserved.some(s=>(s.instructorId===c.teacher||(room&&s.roomId===room))&&new Date(s.startsAt)<ends&&new Date(s.endsAt)>begins))continue;
     const u=units[profiles[c.courseId].indexes[week]];
     const session=await request('/api/v2/academic/classes/'+c.id+'/sessions','POST',{startLocal:date+'T'+time,endLocal:date+'T'+(time==='17:30'?'19:30':'21:45'),timezone:'Asia/Ho_Chi_Minh',modality:c.modality==='ONLINE'?'ONLINE':'OFFLINE',...(room?{roomId:room}:{}),assignmentId:c.assignmentId,requiredCapabilities:room?['WHITEBOARD']:[],reason:`Đề xuất buổi ${count+1} tuần ${week+1}: ${u.title}. ${count===0?'Ngữ pháp, từ vựng và luyện có hướng dẫn.':'Đọc, nghe và bài áp dụng.'} Khung giờ đã đối chiếu lịch giảng viên/phòng hiện có; chờ duyệt độc lập, chưa xác nhận đã dạy.`});
     if(session.state!=='DRAFT')throw Error('DRAFT_REQUIRED');
     data.sessions.push(session);reserved.push(session);save();count++;break;
    }
   }
   if(count<2){data.warnings.push(`Tuần ${week+1}: chỉ có ${count}/2 khung giờ không xung đột trong giới hạn lớp; cần học vụ sắp xếp tiếp.`);save();}
  }
  console.log(`${c.name}: thêm ${data.sessions.length} buổi nháp, ${data.warnings.length} khoảng cần học vụ xem lại.`);
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
