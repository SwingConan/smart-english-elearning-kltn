'use strict';
const fs=require('node:fs'),path=require('node:path');
const {connect,OUT}=require('./target.cjs');
const {login}=require('./local-client.cjs');
const {units}=require('./curriculum.cjs');
const file=path.join(OUT,'primary-manifest.json');
(async()=>{
  const state=JSON.parse(fs.readFileSync(file,'utf8'));const save=()=>fs.writeFileSync(file,JSON.stringify(state,null,2));
  const {db}=await connect();let maker;
  try{maker=(await db.query('SELECT u.email FROM class_offerings co JOIN courses c ON c.id=co."courseId" JOIN users u ON u.id=c."createdById" WHERE co.id=$1',[state.classId])).rows[0].email;await db.query('ROLLBACK');}finally{await db.end();}
  const {request}=await login(maker);
  if(!state.scheduling.assignment){state.scheduling.assignment=await request('/api/v2/academic/classes/'+state.classId+'/assignments','POST',{instructorId:'a0b638ef-8efa-43c2-a9cd-e66144c7d1eb',effectiveFrom:'2026-11-16T00:00:00+07:00',effectiveTo:'2027-02-05T23:59:00+07:00',reason:'Đề xuất phân công cho lộ trình TOEIC nền tảng 12 tuần, 24 buổi chính thứ Hai và thứ Năm 18:30–20:30. Chờ người có thẩm quyền kiểm tra và duyệt độc lập; không thay phân công đã duyệt.'});save();}
  state.scheduling.sessions??=[];
  for(let i=0;i<24;i++)if(!state.scheduling.sessions[i]){
    const week=Math.floor(i/2),date=new Date(Date.UTC(2026,10,16+week*7+(i%2?3:0))).toISOString().slice(0,10);
    const u=units[week];
    const session=await request('/api/v2/academic/classes/'+state.classId+'/sessions','POST',{startLocal:date+'T18:30',endLocal:date+'T20:30',timezone:'Asia/Ho_Chi_Minh',modality:'ONLINE',assignmentId:state.scheduling.assignment.id,requiredCapabilities:[],reason:`Buổi ${i+1} · Học phần ${week+1}: ${u.title}. Nội dung: ${i%2?'Đọc, nghe, vận dụng và giao bài':'Ngữ pháp, từ vựng và luyện có hướng dẫn'}. Lịch dự kiến chờ duyệt độc lập, không xác nhận đã dạy hoặc tạo Google Meet.`});
    if(session.state!=='DRAFT'||session.approvedBy||session.approvedAt)throw Error('DRAFT_SESSION_REQUIRED');
    state.scheduling.sessions[i]=session;save();
  }
  console.log(JSON.stringify({plannedSessions:state.scheduling.sessions.length,state:'DRAFT',from:state.scheduling.sessions[0].startsAt,to:state.scheduling.sessions.at(-1).endsAt,approvedSessionsChanged:0}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
