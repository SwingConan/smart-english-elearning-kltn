'use strict';
const fs=require('node:fs'),path=require('node:path');
const {connect,OUT,ROOT}=require('./target.cjs');
const {login}=require('./local-client.cjs');
const {units,lessons}=require('./curriculum.cjs');
const {profiles,profileLessons}=require('./specialisations.cjs');
const file=path.join(OUT,'library-manifest.json');
const state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{modules:[]};
const save=()=>fs.writeFileSync(file,JSON.stringify(state,null,2));
(async()=>{
 const {db}=await connect();let email;try{email=(await db.query('SELECT email FROM users WHERE id=$1',['5c8e1949-afbb-407f-913c-f779a1cb256c'])).rows[0].email;await db.query('ROLLBACK');}finally{await db.end();}
 const {request}=await login(email),course='0709f6b3-9abd-4ffa-abcc-d7aa43a05b1c';
 for(const [i,u]of units.entries()){
  const m=state.modules[i]??={lessons:[]};state.modules[i]=m;
  if(!m.module){m.module=await request('/api/instructor/courses/'+course+'/modules','POST',{title:`Học phần ${i+1} · ${u.title}`,description:u.goals.join(' ')});save();}
  for(const [j,l]of lessons(u,i).entries())if(!m.lessons[j]){m.lessons[j]=await request('/api/instructor/modules/'+m.module.id+'/lessons','POST',{title:l.title,description:u.goals[j],learningObjectives:u.goals,focusSkills:l.skills,focusTaskCodes:[],estimatedMinutes:l.minutes,contentMarkdown:l.markdown});save();}
  if(!m.resource){const form=new FormData();form.append('file',new Blob([fs.readFileSync(path.join(OUT,'assets',`hoc-phan-${String(i+1).padStart(2,'0')}.pdf`))],{type:'application/pdf'}),`hoc-phan-${String(i+1).padStart(2,'0')}.pdf`);form.append('title',`Phiếu học tập · ${u.title}`);form.append('isDownloadable','true');m.resource=await request('/api/instructor/lessons/'+m.lessons[1].id+'/resources/upload','POST',form);save();}
 }
 const pending={};
 for(const [id,p]of Object.entries(profiles))pending[id]={title:p.name,modules:p.indexes.map((index,i)=>({title:units[index].title,objectives:units[index].goals,lessons:profileLessons(p,i)})),reason:'Nội dung đã có ở LMS lớp được phân công. Kho mẫu khóa học chưa có giảng viên sở hữu hợp lệ vì instructorId của lớp mở chưa được thiết lập theo hợp đồng giữ quyền tác giả; không sửa ownership để nhập mẫu.'};
 const sw={name:'Speaking & Writing công sở',focus:'FOUR_SKILLS',indexes:[0,2,4,5,10,11]};
 pending['0594d51b-4b5f-4969-8492-7f851746bc25']={title:sw.name,modules:sw.indexes.map((index,i)=>({title:units[index].title,objectives:units[index].goals,lessons:profileLessons(sw,i)})),reason:'Chưa có lớp mở, CourseVersion được duyệt hoặc phân công giảng viên. Giữ bản biên soạn để học vụ xử lý; không tạo quyền, giá hoặc lớp đã duyệt giả.'};
 const directory=path.join(ROOT,'apps/api/content/toeic-curriculum-v1');fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'authored-programmes.json'),JSON.stringify({version:1,timezone:'Asia/Ho_Chi_Minh',provenance:'Nội dung nguyên bản, chưa phải phê duyệt học thuật',programmes:pending},null,2));
 console.log('Course library: 12 modules, 36 complete lessons, 12 PDFs added under retained teaching ownership. Other course templates saved for authorised import; no ownership changed.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
