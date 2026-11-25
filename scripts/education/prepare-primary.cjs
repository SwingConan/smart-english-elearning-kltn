'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {connect,OUT}=require('./target.cjs');
const {login}=require('./local-client.cjs');
const {units,lessons,programmeDescription}=require('./curriculum.cjs');
const file=path.join(OUT,'primary-manifest.json');
const state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{courseId:'cdec25d1-9cee-4c1e-9df6-c1bf0b2e1df6',classId:'18653fb2-d42a-4aea-8313-a20e7f911daa',weeks:[],scheduling:{}};
const save=()=>fs.writeFileSync(file,JSON.stringify(state,null,2));
const day=(week,offset=0)=>new Date(Date.UTC(2026,10,16+week*7+offset)).toISOString().slice(0,10);
const local=(date,time)=>date+'T'+time+':00+07:00';
async function prepare() {
  const {db,identity}=await connect();
  let teacherEmail;
  try{
    const active=(await db.query(`SELECT e.id,co."instructorId",u.email FROM enrollments e JOIN users s ON s.id=e."learnerId" JOIN class_offerings co ON co.id=e."classOfferingId" JOIN users u ON u.id=co."instructorId" WHERE s.email='student@gmail.com' AND e.status='ACTIVE' AND co.id=$1`,[state.classId])).rows;
    if(active.length!==1)throw Error('PRIMARY_ACTIVE_ENROLLMENT_REQUIRED');
    teacherEmail=active[0].email;state.enrollmentId=active[0].id;state.identity=identity;
    const assignment=(await db.query(`SELECT id FROM class_instructor_assignments WHERE "classOfferingId"=$1 AND "instructorId"=$2 AND state='PUBLISHED' AND "effectiveFrom"<=clock_timestamp() AND "reservedUntil">clock_timestamp()`,[state.classId,active[0].instructorId])).rows;
    if(!assignment.length)throw Error('CURRENT_APPROVED_TEACHER_RESERVATION_REQUIRED');
    await db.query('ROLLBACK');
  }finally{await db.end();}
  const {request}=await login(teacherEmail);
  const c='/api/v2/class-lms/classes/'+state.classId;
  state.openedAt??=new Date().toISOString();save();
  for(const [i,u] of units.entries()) {
    const w=state.weeks[i]??={number:i+1,title:u.title,activities:[],lessons:[]};state.weeks[i]=w;
    const intro=`${u.goals.join(' ')} Hai buổi chính dự kiến: ${day(i)} và ${day(i,3)}, 18:30–20:30 (giờ Việt Nam), chờ duyệt lịch độc lập. Nội dung tự học mở theo mốc trên từng hoạt động. Bài tập nộp trước 23:59 ngày ${day(i,6)}. ${i===0?'Buổi định hướng đã duyệt ngày 13/11 được giữ nguyên.':''}`;
    if(!w.module){w.module=await request('/api/instructor/courses/'+state.courseId+'/modules','POST',{title:`Học phần ${i+1} · ${u.title}`,description:intro});save();}
    const content=lessons(u,i);
    for(const [j,l] of content.entries())if(!w.lessons[j]){w.lessons[j]=await request('/api/instructor/modules/'+w.module.id+'/lessons','POST',{title:l.title,description:u.goals[j]??u.goals[0],learningObjectives:u.goals,focusSkills:l.skills,focusTaskCodes:[],estimatedMinutes:l.minutes,contentMarkdown:l.markdown});save();}
    if(!w.section){w.section=await request(c+'/sections','POST',{title:`Học phần ${i+1} · ${u.title}`,introduction:intro});save();}
    if(!w.section.publishedRevisionId){const p=await request(c+'/sections/'+w.section.id+'/publish','POST',{expectedLockVersion:w.section.lockVersion});w.section={...w.section,...p,publishedRevisionId:p.revisionId};save();}
    const release=i===0?state.openedAt:local(day(i),'08:00');
    for(const [j,l] of content.entries()) {
      if(!w.activities[j]){w.activities[j]=await request(c+'/sections/'+w.section.id+'/activities','POST',{type:'LESSON',title:l.title,introduction:u.goals[j]??u.goals[0],contentMarkdown:l.markdown,availableFrom:release});save();}
      if(w.activities[j].state!=='PUBLISHED'){const a=w.activities[j];w.activities[j]=await request(c+'/activities/'+a.id+'/publish','POST',{expectedLockVersion:a.lockVersion});save();}
    }
    if(!w.resource){
      const pdf=fs.readFileSync(path.join(OUT,'assets',`hoc-phan-${String(i+1).padStart(2,'0')}.pdf`));
      const form=new FormData();form.append('file',new Blob([pdf],{type:'application/pdf'}),`hoc-phan-${String(i+1).padStart(2,'0')}.pdf`);form.append('title',`Phiếu học tập và hướng dẫn tự luyện · ${u.title}`);form.append('isDownloadable','true');
      w.resource=await request('/api/instructor/lessons/'+w.lessons[1].id+'/resources/upload','POST',form);save();
    }
    if(!w.material){w.material=await request(c+'/sections/'+w.section.id+'/activities','POST',{type:'RESOURCE',title:`Tài liệu PDF · ${u.title}`,introduction:'Bài giảng, văn bản đọc, lời thoại nghe, ví dụ, bài áp dụng và hướng dẫn tự đối chiếu. Tải PDF để học ngoại tuyến.',availableFrom:release});save();}
    if(!w.material.file){const form=new FormData();form.append('file',new Blob([fs.readFileSync(path.join(OUT,'assets',`hoc-phan-${String(i+1).padStart(2,'0')}.pdf`))],{type:'application/pdf'}),`hoc-phan-${String(i+1).padStart(2,'0')}.pdf`);form.append('expectedLockVersion',String(w.material.lockVersion));w.material=await request(c+'/activities/'+w.material.id+'/file','POST',form);save();}
    if(w.material.state!=='PUBLISHED'){w.material={...w.material,...await request(c+'/activities/'+w.material.id+'/publish','POST',{expectedLockVersion:w.material.lockVersion})};save();}
    if(!w.assignment){w.assignment=await request(c+'/sections/'+w.section.id+'/activities','POST',{type:'ASSIGNMENT',title:`Bài tập áp dụng · ${u.title}`,introduction:'Nộp văn bản trực tiếp hoặc tệp PDF/TXT. Giáo viên phản hồi theo yêu cầu nhiệm vụ; chưa nộp không được ghi nhận đã hoàn thành.',contentMarkdown:`# Yêu cầu bài nộp\n${u.assignment}\n## Tự luyện nói đi kèm\n${u.speaking}\nPhần nói là tự luyện; hoạt động này nhận văn bản/tài liệu, không yêu cầu tải audio khi chức năng chưa hỗ trợ.\n## Trước khi nộp\nĐối chiếu nội dung với đề, kiểm tra ngữ pháp trọng tâm và số từ. Không sao chép bài tham khảo.\n## Tiêu chí phản hồi\nĐáp ứng yêu cầu 40%; bố cục và rõ ý 25%; chính xác ngôn ngữ 25%; từ vựng 10%. Chưa có điểm cho đến khi giảng viên đánh giá và kết quả được công bố hợp lệ.`,availableFrom:release,availableUntil:local(day(i,6),'23:59')});save();}
    if(w.assignment.state!=='PUBLISHED'){w.assignment=await request(c+'/activities/'+w.assignment.id+'/publish','POST',{expectedLockVersion:w.assignment.lockVersion});save();}
    if(!w.quiz){w.quiz=await request(c+'/sections/'+w.section.id+'/activities','POST',{type:'QUIZ',title:`Kiểm tra ngắn · ${u.title}`,introduction:'8 câu trắc nghiệm có lời giải; chỉ mở sau khi nguồn được duyệt độc lập.',contentMarkdown:''});save();}
    if(!w.quizSource){w.quizSource=await request('/api/v2/class-quiz/classes/'+state.classId+'/activities/'+w.quiz.id+'/sources','POST',{idempotencyKey:randomUUID(),expectedVersion:0,title:`Kiểm tra học phần ${i+1} · ${u.title}`,openAt:local(day(i,3),'20:30'),closeAt:local(day(i,6),'23:59'),durationMinutes:20,questions:u.quiz.map(q=>({content:`Văn bản tham khảo:\n${u.reading}\n\n${q.prompt}`,explanation:q.explanation,points:1,options:q.options.map((o,j)=>({content:o,isCorrect:j===q.correct}))}))});save();}
    console.log(`Học phần ${i+1}: 3 bài học, PDF, bài tập có hạn nộp; quiz 8 câu giữ DRAFT.`);
  }
  state.description=programmeDescription();save();
}
prepare().catch(e=>{console.error(e.message);process.exitCode=1;});
