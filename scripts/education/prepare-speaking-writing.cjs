'use strict';
const fs=require('node:fs'),path=require('node:path');
const {connect,OUT}=require('./target.cjs');
const {login}=require('./local-client.cjs');
const primary=JSON.parse(fs.readFileSync(path.join(OUT,'primary-manifest.json'),'utf8'));
const file=path.join(OUT,'speaking-writing-manifest.json');
const state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{groups:[],questions:[]};
const save=()=>fs.writeFileSync(file,JSON.stringify(state,null,2));
(async()=>{
 const rubricId='9834cb47-e9ec-4a30-979b-45dd8037afa9';
 const {db}=await connect();try{const r=(await db.query('SELECT id FROM rubrics WHERE id=$1 AND "isActive" AND "assignmentActivityId" IS NULL',[rubricId])).rows;if(r.length!==1)throw Error('EXISTING_ACTIVE_FORMATIVE_RUBRIC_REQUIRED');await db.query('ROLLBACK');}finally{await db.end();}
 const {request}=await login('teacher@gmail.com');
 if(!state.test){state.test=await request('/api/instructor/courses/'+primary.courseId+'/tests','POST',{type:'IN_CLASS',lessonId:primary.weeks[0].lessons[2].id,title:'Thực hành Nói–Viết · Giới thiệu công việc và hỏi thông tin',description:'Ghi âm tối đa 60 giây và viết email 80–100 từ. Hai tiêu chí phản hồi hiện có: đáp ứng nhiệm vụ và ngôn ngữ rõ ý. Giảng viên nghe/đọc và đánh giá thực tế; chưa có điểm FINAL khi chưa được xác nhận. Không phải Placement hay chứng chỉ.',maxAttempts:2,showResultAfterSubmit:false});save();}
 const tasks=[
  {skill:'SPEAKING',type:'AUDIO_RESPONSE',title:'Giới thiệu tại buổi định hướng',instructions:'Chuẩn bị 45 giây, ghi âm tối đa 60 giây. Nói bằng giọng của chính bạn; không tải giọng TTS thay cho bài nói.',prompt:'You are joining an office team. Introduce yourself using a first name or a study name, say which department you would like to work in, describe two tasks you can do, and ask one question about the first-day schedule. Speak for 45–60 seconds. If you are role-playing, say so. Do not share an address, a password or other sensitive information.',criteria:'Giảng viên kiểm tra bài ghi âm thật có đủ phần giới thiệu, hai nhiệm vụ và một câu hỏi; lời nói có dễ hiểu không. Phản hồi theo rubric formative hiện có, không tự quy đổi TOEIC. Không dùng bản thu giọng tổng hợp làm bằng chứng năng lực nói.'},
  {skill:'WRITING',type:'TEXT_RESPONSE',title:'Email hỏi thông tin buổi đầu',instructions:'Viết 80–100 từ bằng tiếng Anh. Tự soạn bài và kiểm tra trước khi gửi; không sao chép bài tham khảo.',prompt:'Write an email to the orientation coordinator. Introduce your department, mention two tasks you will practise, and ask where to collect your computer account information. Include a subject, a polite greeting and a closing. Use 80–100 words. Do not include a real password or claim qualifications you do not have.',criteria:'Giảng viên đối chiếu đủ các yêu cầu, bố cục email và độ rõ ý; kiểm tra cấu trúc câu và từ vựng công sở. Điểm/feedback chỉ có sau khi bài nộp được người có quyền đánh giá theo quy trình.'},
 ];
 for(const [i,t]of tasks.entries()){
  if(!state.groups[i]){state.groups[i]=await request('/api/instructor/tests/'+state.test.id+'/groups','POST',{skill:t.skill,title:t.title,instructions:t.instructions,preparationSeconds:i===0?45:0,responseSeconds:i===0?60:600,recommendedSeconds:i===0?105:600,...(i===0?{maxRecordingSeconds:60}:{})});save();}
  if(!state.questions[i]){state.questions[i]=await request('/api/instructor/courses/'+primary.courseId+'/questions','POST',{type:t.type,toeicSkill:t.skill,difficulty:'EASY',content:t.prompt,explanation:t.criteria,rubricId});save();}
  if(!state.groups[i].attached){await request('/api/instructor/tests/'+state.test.id+'/questions','POST',{questionId:state.questions[i].id,points:2,groupId:state.groups[i].id});state.groups[i].attached=true;save();}
 }
 if(!state.timed){const {db}=await connect(false);try{const r=await db.query(`UPDATE tests SET "timeLimitMinutes"=15 WHERE id=$1 AND status='DRAFT' AND "courseId"=$2 AND NOT EXISTS(SELECT 1 FROM test_attempts WHERE "testId"=tests.id)`,[state.test.id,primary.courseId]);if(r.rowCount!==1)throw Error('NEW_UNATTEMPTED_DRAFT_REQUIRED');await db.query('COMMIT');state.timed=true;save();}catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}}
 if(!state.published){state.test=await request('/api/instructor/tests/'+state.test.id+'/publish','PATCH');state.published=true;save();}
 if(!state.assessment){state.assessment=await request('/api/instructor/classes/'+primary.classId+'/assessments','POST',{testId:state.test.id,stage:'PERIODIC',openAt:primary.openedAt,closeAt:'2026-11-22T23:59:00+07:00',maxAttemptsOverride:2,isActive:true});save();}
 console.log('Speaking/Writing formative practice ready: genuine recording and text response, existing active rubric, 15 minutes, 2 attempts; no attempts or grades created.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
