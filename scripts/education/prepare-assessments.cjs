'use strict';
const fs=require('node:fs'),path=require('node:path');
const {connect,OUT}=require('./target.cjs');
const {login}=require('./local-client.cjs');
const {q}=require('./curriculum.cjs');
const {advanced}=require('./specialisations.cjs');
const primary=JSON.parse(fs.readFileSync(path.join(OUT,'primary-manifest.json'),'utf8'));
const file=path.join(OUT,'assessments-manifest.json');
const state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{assessments:[]};
const grammar=[
 [q('The receptionist usually _____ visitor details.',['verify','verifies','verifying','to verify'],1,'Receptionist số ít, hiện tại đơn dùng verifies.'),q('Mira did not _____ the revised schedule yesterday.',['received','receives','receive','receiving'],2,'Sau did not dùng nguyên mẫu receive.'),q('The interview is _____ Monday morning.',['in','at','on','during of'],2,'Một buổi cụ thể của ngày trong tuần dùng on Monday morning.'),q('The new procedure is explained _____.',['clear','clearly','clearness','clearing'],1,'Trạng từ clearly bổ nghĩa cho hành động explained.')],
 [q('If the portal _____ early, we will submit the form.',['reopens','will reopen','reopening','to reopen'],0,'Mệnh đề if dùng hiện tại đơn; mệnh đề chính dùng will.'),q('The damaged panels _____ replaced yesterday.',['was','were','have','are being to'],1,'Panels số nhiều và yesterday yêu cầu were replaced.'),q('Could you _____ the delivery window?',['confirm','to confirm','confirming','confirmed'],0,'Modal could đi với nguyên mẫu confirm.'),q('There is only _____ space near the side gate.',['a few','many','a little','an'],2,'Space trong nghĩa dung lượng không gian không đếm được, dùng a little.')],
 [q('We have not confirmed the layout _____.',['ago','yet','yesterday','last'],1,'Yet thích hợp trong câu phủ định hiện tại hoàn thành.'),q('The assistant _____ handles room bookings will reply.',['which','who','when','where'],1,'Assistant chỉ người nên dùng who.'),q('_____ the room is smaller, it has enough seats.',['Although','Because of','Despite of','Therefore'],0,'Although + mệnh đề diễn tả tương phản.'),q('The revised plan is _____ flexible than the original.',['most','more','much more the','flexibly'],1,'So sánh hơn với tính từ dài dùng more flexible than.')],
];
(async()=>{
 const {db}=await connect();try{await db.query('ROLLBACK');}finally{await db.end();}
 const {request}=await login('teacher@gmail.com');
 for(let i=0;i<3;i++){
  const s=state.assessments[i]??={questions:[]};state.assessments[i]=s;const save=()=>fs.writeFileSync(file,JSON.stringify(state,null,2));
  const items=advanced.slice(i*2,i*2+2).flatMap(a=>a.items.map(q=>({...q,prompt:a.text+'\n\n'+q.prompt}))).concat(grammar[i]);
  if(!s.test){s.test=await request('/api/instructor/courses/'+primary.courseId+'/tests','POST',{type:'IN_CLASS',lessonId:primary.weeks[3+i*4].lessons[2].id,title:`Đánh giá giai đoạn ${i+1} · Đọc hiểu và ứng dụng ngôn ngữ`,description:'12 câu nguyên bản, thời lượng 30 phút, tối đa 2 lượt. Phản hồi nhằm xác định chủ đề cần ôn; không quy đổi thành điểm TOEIC hoặc chứng chỉ. Không phải bài đánh giá đầu vào Placement.',maxAttempts:2,showResultAfterSubmit:true});save();}
  if(!s.test.lessonId){s.test=await request('/api/instructor/tests/'+s.test.id,'PATCH',{lessonId:primary.weeks[3+i*4].lessons[2].id});save();}
  for(let j=0;j<items.length;j++)if(!s.questions[j]){const q=items[j];s.questions[j]=await request('/api/instructor/courses/'+primary.courseId+'/questions','POST',{type:'SINGLE_CHOICE',toeicSkill:'READING',difficulty:i===2?'HARD':'MEDIUM',content:q.prompt,explanation:q.explanation,options:q.options.map((o,k)=>({content:o,isCorrect:k===q.correct}))});save();}
  if(!s.questionsAttached){await request('/api/instructor/tests/'+s.test.id+'/questions/batch','POST',{questionIds:s.questions.map(q=>q.id),points:1});s.questionsAttached=true;save();}
  if(!s.timed){const {db}=await connect(false);try{
    const r=await db.query(`UPDATE tests SET "timeLimitMinutes"=30,"updatedAt"=clock_timestamp() WHERE id=$1 AND status='DRAFT' AND purpose='IN_CLASS' AND "quizActivityId" IS NULL AND "courseId"=$2 AND NOT EXISTS(SELECT 1 FROM test_attempts WHERE "testId"=tests.id)`,[s.test.id,primary.courseId]);
    if(r.rowCount!==1)throw Error('NEW_UNATTEMPTED_DRAFT_TEST_REQUIRED');await db.query('COMMIT');s.timed=true;save();
  }catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}}
  if(!s.published){s.test=await request('/api/instructor/tests/'+s.test.id+'/publish','PATCH');s.published=true;save();}
  if(!s.assignment){const day=new Date(Date.UTC(2026,10,16+(3+i*4)*7+3)).toISOString().slice(0,10),due=new Date(day+'T00:00:00Z');due.setUTCDate(due.getUTCDate()+3);s.assignment=await request('/api/instructor/classes/'+primary.classId+'/assessments','POST',{testId:s.test.id,stage:'PERIODIC',openAt:day+'T20:30:00+07:00',closeAt:due.toISOString().slice(0,10)+'T23:59:00+07:00',maxAttemptsOverride:2,isActive:true});save();}
  console.log(`Đánh giá giai đoạn ${i+1}: 12 câu, 30 phút, 2 lượt, có lịch mở/đóng; không tạo lượt làm hoặc điểm.`);
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
