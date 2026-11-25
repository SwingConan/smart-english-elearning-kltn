'use strict';
const fs=require('node:fs'),path=require('node:path');
const {OUT,connect}=require('./target.cjs');
const {login}=require('./local-client.cjs');
const {lessons,units}=require('./curriculum.cjs');
(async()=>{
 const primary=JSON.parse(fs.readFileSync(path.join(OUT,'primary-manifest.json'),'utf8'));
 const library=JSON.parse(fs.readFileSync(path.join(OUT,'library-manifest.json'),'utf8'));
 const {db}=await connect();let instructor;
 try{instructor=(await db.query('SELECT email FROM users WHERE id=$1',['5c8e1949-afbb-407f-913c-f779a1cb256c'])).rows[0].email;await db.query('ROLLBACK');}finally{await db.end();}
 for(const config of [
  {email:'teacher@gmail.com',courseId:primary.courseId,first:primary.weeks.map(w=>w.module.id),oldModule:'a745560a-c09f-4261-b9b1-6a2fa28ba63f'},
  {email:instructor,courseId:'0709f6b3-9abd-4ffa-abcc-d7aa43a05b1c',first:library.modules.map(w=>w.module.id),oldModule:'9d399cd3-9f39-474e-b20f-ef1660f8c78d'},
 ]){
  const {request}=await login(config.email);const modules=await request('/api/instructor/courses/'+config.courseId+'/modules');
  await request('/api/instructor/courses/'+config.courseId+'/modules/reorder','PATCH',{orderedIds:[...config.first,...modules.filter(m=>!config.first.includes(m.id)).map(m=>m.id)]});
  const existing=await request('/api/instructor/modules/'+config.oldModule+'/lessons');
  for(const l of existing)if(l.contentMarkdown?.length<200||['Foreign lesson','Shared standard lesson'].includes(l.title)){
   const full=lessons(units[0],0)[0];
   await request('/api/instructor/lessons/'+l.id,'PATCH',{title:'Bài bổ trợ · Câu cơ bản trong môi trường công sở',description:'Củng cố cấu trúc câu và từ loại trước khi thực hành đọc, nghe và viết email.',learningObjectives:units[0].goals,contentMarkdown:full.markdown,estimatedMinutes:45,focusSkills:['READING'],focusTaskCodes:[],expectedUpdatedAt:l.updatedAt});
  }
 }
 console.log('Course libraries ordered by the 12-topic route; two old short lesson bodies expanded. Existing progress and immutable class publications retained.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
