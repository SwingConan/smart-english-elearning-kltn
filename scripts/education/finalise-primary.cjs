'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {OUT}=require('./target.cjs');
const {login}=require('./local-client.cjs');
const {units,lessons,programmeDescription}=require('./curriculum.cjs');
const file=path.join(OUT,'primary-manifest.json');
(async()=>{
 const state=JSON.parse(fs.readFileSync(file,'utf8'));const save=()=>fs.writeFileSync(file,JSON.stringify(state,null,2));
 const {request}=await login('teacher@gmail.com'),c='/api/v2/class-lms/classes/'+state.classId;
 for(const [i,w]of state.weeks.entries()) {
  const u=units[i],content=lessons(u,i);
  for(const [j,l]of content.entries()){
   const linked=i===0?l.markdown+'\n## Buổi học liên quan\n[Buổi định hướng ngày 13/11 · 18:30–19:15](/my/events/83365de5-bfbe-4e3a-8045-608053b9d58f)\nBuổi định hướng đã được duyệt. Hai buổi chính của học phần theo lịch dự kiến ghi trong lộ trình; chưa coi là lịch được xác nhận.':l.markdown;
   const a=await request(c+'/activities/'+w.activities[j].id);
   if(a.contentMarkdown!==linked){
    const draft=await request(c+'/sections/'+w.section.id+'/activities/'+a.id,'PATCH',{type:'LESSON',title:l.title,introduction:u.goals[j]||u.goals[0],contentMarkdown:linked,availableFrom:a.availableFrom,expectedLockVersion:a.lockVersion});
    w.activities[j]={...draft,...await request(c+'/activities/'+a.id+'/publish','POST',{expectedLockVersion:draft.lockVersion})};save();
   }
   if(!w.bankReviewed){w.lessons[j]=await request('/api/instructor/lessons/'+w.lessons[j].id,'PATCH',{contentMarkdown:l.markdown,expectedUpdatedAt:w.lessons[j].updatedAt});save();}
  }
  w.bankReviewed=true;save();
  if(!w.quizReviewed){w.quizSource=await request('/api/v2/class-quiz/classes/'+state.classId+'/activities/'+w.quiz.id+'/sources/'+w.quizSource.id,'PUT',{idempotencyKey:randomUUID(),expectedVersion:w.quizSource.version,expectedLockVersion:w.quizSource.lockVersion,title:w.quizSource.title,openAt:w.quizSource.openAt,closeAt:w.quizSource.closeAt,durationMinutes:20,questions:u.quiz.map(q=>({content:`Văn bản tham khảo:\n${u.reading}\n\n${q.prompt}`,explanation:q.explanation,points:1,options:q.options.map((o,j)=>({content:o,isCorrect:j===q.correct}))}))});w.quizReviewed=true;save();}
  if(!w.pdfReviewed){
   const pdf=fs.readFileSync(path.join(OUT,'assets',`hoc-phan-${String(i+1).padStart(2,'0')}.pdf`));
   const form=new FormData();form.append('file',new Blob([pdf],{type:'application/pdf'}),`hoc-phan-${String(i+1).padStart(2,'0')}.pdf`);form.append('replaceResourceId',w.resource.id);form.append('expectedUpdatedAt',w.resource.updatedAt);form.append('title',`Phiếu học tập và hướng dẫn tự luyện · ${u.title}`);form.append('isDownloadable','true');
   w.resource=await request('/api/instructor/lessons/'+w.lessons[1].id+'/resources/upload','POST',form);save();
   const a=await request(c+'/activities/'+w.material.id),upload=new FormData();upload.append('file',new Blob([pdf],{type:'application/pdf'}),`hoc-phan-${String(i+1).padStart(2,'0')}.pdf`);upload.append('expectedLockVersion',String(a.lockVersion));
   const updated=await request(c+'/activities/'+a.id+'/file','POST',upload);w.material={...updated,...await request(c+'/activities/'+a.id+'/publish','POST',{expectedLockVersion:updated.lockVersion})};w.pdfReviewed=true;save();
  }
 }
 let tree=await request(c);
 const old=tree.sections.find(s=>s.id==='2f4e08ec-9fd2-4257-bf56-e4c4fb902170');
 if(old&&old.title.startsWith('[')){
  const updated=await request(c+'/sections/'+old.id,'PATCH',{title:'Thư viện bổ trợ và bài đã lưu',introduction:'Các hoạt động trước đây cùng bài nộp và kết quả được giữ nguyên. Lộ trình chính gồm 12 học phần; lịch bổ sung chỉ có hiệu lực sau khi được duyệt.',expectedLockVersion:old.lockVersion});
  await request(c+'/sections/'+old.id+'/publish','POST',{expectedLockVersion:updated.lockVersion});
 }
 if(!state.overviewSection){state.overviewSection=await request(c+'/sections','POST',{title:'Lộ trình và cách học',introduction:programmeDescription()});save();const r=await request(c+'/sections/'+state.overviewSection.id+'/publish','POST',{expectedLockVersion:state.overviewSection.lockVersion});state.overviewSection={...state.overviewSection,...r};save();}
 if(!state.overview){
  const rows=state.weeks.map((w,i)=>{const pair=state.scheduling.sessions.slice(i*2,i*2+2);const date=s=>new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(s));return `## Học phần ${i+1} · ${w.title}\nBuổi chính dự kiến: ${pair.map(s=>date(s.startsAt)).join(' và ')}, 18:30–20:30. Trạng thái: nháp, chờ duyệt học vụ độc lập.\n${i===0?w.activities.map((a,j)=>`- [${lessons(units[i],i)[j].title}](/classroom/${state.classId}/activities/${a.id})`).join('\n'):'- Nội dung mở từ 08:00 thứ Hai của tuần học tương ứng; xem mốc mở và hạn nộp trên Lịch tháng.'}\n- Bài tập: ${units[i].assignment}\n- Hạn nộp: 23:59 Chủ nhật của tuần tương ứng; mốc chính xác được lưu trên hoạt động.\n- Quiz ngắn: 8 câu, 20 phút, 1 lượt; chưa phát hành, chờ duyệt độc lập.`;}).join('\n');
  state.overview=await request(c+'/sections/'+state.overviewSection.id+'/activities','POST',{type:'LESSON',title:'Lộ trình TOEIC nền tảng 12 tuần',introduction:'Phân biệt lịch chính thức, lịch dự kiến, tự học và đánh giá; mở đúng bài theo tiến trình.',availableFrom:state.openedAt,contentMarkdown:`# Chào mừng đến với chương trình TOEIC nền tảng\n${programmeDescription()}\n## Bắt đầu học\nĐọc bài ngữ pháp, làm bài đọc–nghe, luyện nói và viết, rồi nộp bài áp dụng riêng của mình. Tải PDF để ghi chú; audio nguyên bản có thể nghe và tải trong bài.\n## Ngày giờ và trạng thái\nToàn bộ ngày giờ theo Việt Nam. Buổi định hướng 13/11, 18:30–19:15 đã được duyệt, giữ nguyên nội dung và giảng viên. 24 buổi chính từ 16/11/2026 đến 04/02/2027 đang ở bản nháp để học vụ kiểm tra; chưa coi là lịch chính thức. Ngày mở bài và hạn nộp bài tập là mốc tự học do giảng viên cấu hình.\n## Đánh giá\nCó ba đánh giá giai đoạn 12 câu/30 phút/2 lượt: mở tối 10/12, 07/01 và 04/02, đóng 23:59 Chủ nhật tiếp theo. Các quiz ngắn đang chờ duyệt độc lập. Không mở khóa Placement chưa phê duyệt. Không có điểm hoặc chứng chỉ tự tạo.\n${rows}\n## Cần hỗ trợ\nTrao đổi trong lớp hoặc dùng mục Tư vấn/hỗ trợ. Nếu hoạt động chưa đến ngày mở, chuẩn bị tài liệu tuần trước và xem ngày mở trên lịch; không cần đăng ký lại hoặc thanh toán lại khi lớp đã có quyền học.`});save();state.overview={...state.overview,...await request(c+'/activities/'+state.overview.id+'/publish','POST',{expectedLockVersion:state.overview.lockVersion})};save();
 }
 tree=await request(c);
 const ordered=[state.overviewSection.id,...state.weeks.map(w=>w.section.id),...tree.sections.filter(s=>s.id!==state.overviewSection.id&&!state.weeks.some(w=>w.section.id===s.id)).map(s=>s.id)];
 await request(c+'/sections/reorder','POST',{items:ordered.map(id=>({id,expectedLockVersion:tree.sections.find(s=>s.id===id).lockVersion}))});
 console.log('Primary programme reviewed, documents refreshed, orientation linked to three lessons, overview published.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
