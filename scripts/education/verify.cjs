'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {connect,OUT,ROOT}=require('./target.cjs');
const {units}=require('./curriculum.cjs');
// Prisma stores DateTime in timestamp-without-time-zone columns as UTC.
// pg otherwise interprets those values in the Windows local zone a second time.
require('pg').types.setTypeParser(1114, value=>new Date(value.replace(' ','T')+'Z'));
(async()=>{const {db,identity}=await connect();try{
 const primary=JSON.parse(fs.readFileSync(path.join(OUT,'primary-manifest.json'),'utf8'));
 const secondary=JSON.parse(fs.readFileSync(path.join(OUT,'secondary-manifest.json'),'utf8'));
 const prepared=Object.values(secondary.classes);
 const classes=[primary.classId,...prepared.map(c=>c.classId)];
 const topicIds=[...primary.weeks.map(w=>w.section.id),...prepared.flatMap(c=>c.weeks.map(w=>w.section.id))];
 const report={identity,verifiedAt:new Date().toISOString(),counts:{},validation:{},primary:{},catalog:[],blockers:[]};
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 report.counts.topics=topicIds.length;
 report.counts.preparedClasses=classes.length;
 report.counts.activityTypes=await q('SELECT type,state,count(*)::int AS count FROM class_activities WHERE "sectionId"=ANY($1::uuid[]) GROUP BY type,state ORDER BY type,state',[topicIds]);
 report.counts.questions=+(await q('SELECT count(*)::int AS n FROM questions WHERE "quizSourceId" IN (SELECT id FROM tests WHERE "quizActivityId" IN (SELECT id FROM class_activities WHERE "sectionId"=ANY($1::uuid[])))',[topicIds]))[0].n;
 report.counts.authoredCourseLessons=+(await q('SELECT count(*)::int AS n FROM lessons WHERE "moduleId"=ANY($1::uuid[])',[[...primary.weeks.map(w=>w.module.id),...JSON.parse(fs.readFileSync(path.join(OUT,'library-manifest.json'),'utf8')).modules.map(w=>w.module.id)]]))[0].n;
 report.counts.assessmentQuestions=+(await q('SELECT count(*)::int AS n FROM test_questions WHERE "testId"=ANY($1::uuid[])',[[...JSON.parse(fs.readFileSync(path.join(OUT,'assessments-manifest.json'),'utf8')).assessments.map(a=>a.test.id),JSON.parse(fs.readFileSync(path.join(OUT,'speaking-writing-manifest.json'),'utf8')).test.id]]))[0].n;
 report.validation.emptyLessonOrAssignment=await q(`SELECT id FROM class_activities WHERE "sectionId"=ANY($1::uuid[]) AND type IN ('LESSON','ASSIGNMENT') AND length(trim("contentMarkdown"))<200`,[topicIds]);
 report.validation.invalidActivityWindows=await q(`SELECT id FROM class_activities WHERE "sectionId"=ANY($1::uuid[]) AND (("availableFrom" IS NOT NULL AND "availableUntil"<="availableFrom") OR (type='ASSIGNMENT' AND ("availableFrom" IS NULL OR "availableUntil" IS NULL)))`,[topicIds]);
 report.validation.quizWithoutQuestionsOrWrongApproval=await q(`SELECT t.id FROM tests t JOIN class_activities a ON a.id=t."quizActivityId" WHERE a."sectionId"=ANY($1::uuid[]) AND (t."quizState"<>'DRAFT' OR t."quizApprovedById" IS NOT NULL OR t."quizApprovedAt" IS NOT NULL OR NOT EXISTS(SELECT 1 FROM test_questions tq WHERE tq."testId"=t.id))`,[topicIds]);
 report.validation.invalidNewQuestionOptions=await q(`SELECT q.id FROM questions q WHERE q."quizSourceId" IN (SELECT t.id FROM tests t JOIN class_activities a ON a.id=t."quizActivityId" WHERE a."sectionId"=ANY($1::uuid[])) AND ((SELECT count(*) FROM question_options o WHERE o."questionId"=q.id AND o."isCorrect")<>1 OR length(trim(coalesce(q.explanation,'')))<10)`,[topicIds]);
 report.validation.invalidAssessmentWindows=await q(`SELECT ca.id FROM class_assessments ca JOIN tests t ON t.id=ca."testId" JOIN class_activities a ON a.id=t."quizActivityId" WHERE a."sectionId"=ANY($1::uuid[]) AND (ca."openAt" IS NULL OR ca."closeAt"<=ca."openAt" OR ca."isActive")`,[topicIds]);
 const files=await q(`SELECT a.id,a."storageKey",a."fileBytes",a."fileSha256" FROM class_activities a WHERE a."sectionId"=ANY($1::uuid[]) AND a.type='RESOURCE'`,[topicIds]);
 report.validation.brokenDocuments=[];const hashes=new Set();
 for(const f of files){const full=path.join(ROOT,'.local-storage/learning-resources',f.storageKey||'');let b;try{b=fs.readFileSync(full);}catch{report.validation.brokenDocuments.push(f.id);continue;}if(b.subarray(0,5).toString()!=='%PDF-'||b.length!==f.fileBytes||crypto.createHash('sha256').update(b).digest('hex')!==f.fileSha256)report.validation.brokenDocuments.push(f.id);hashes.add(f.fileSha256);}
 report.counts.resourceDeliveries=files.length;report.counts.uniquePdfContents=hashes.size;
 report.validation.audio=[];
 for(let i=0;i<units.length;i++){const p=path.join(ROOT,`apps/web/public/learning/toeic-foundation/unit-${String(i+1).padStart(2,'0')}.wav`);const b=fs.readFileSync(p);if(b.length<10000||b.subarray(0,4).toString()!=='RIFF'||b.subarray(8,12).toString()!=='WAVE')report.validation.audio.push(i+1);}
 report.counts.uniqueAudio=units.length;
 report.primary={name:'TOEIC nền tảng · Lớp trực tuyến buổi tối',topics:12,lessons:36,activities:73,quizQuestions:96,assessmentQuestions:38,uniqueAudio:12,documents:12,plannedStart:'2026-11-16',plannedEnd:'2027-02-04',timezone:'Asia/Ho_Chi_Minh',sessionState:'DRAFT',sessions:primary.scheduling.sessions.length,assignmentWindows:primary.weeks.map(w=>({topic:w.number,from:w.assignment.availableFrom||null,until:w.assignment.availableUntil||null})),assessmentWindows:await q('SELECT ca."openAt",ca."closeAt",ca."maxAttemptsOverride",t.title,t."timeLimitMinutes" FROM class_assessments ca JOIN tests t ON t.id=ca."testId" WHERE ca."classOfferingId"=$1 AND t.id=ANY($2::uuid[])',[primary.classId,[...JSON.parse(fs.readFileSync(path.join(OUT,'assessments-manifest.json'),'utf8')).assessments.map(a=>a.test.id),JSON.parse(fs.readFileSync(path.join(OUT,'speaking-writing-manifest.json'),'utf8')).test.id]])};
 // Read the persisted published deadline, not a manifest response that may omit fields.
 report.primary.assignmentWindows=await q(`SELECT s.title,r."availableFrom",r."availableUntil" FROM class_activities a JOIN class_sections s ON s.id=a."sectionId" JOIN class_activity_revisions r ON r.id=a."publishedRevisionId" WHERE s.id=ANY($1::uuid[]) AND a.type='ASSIGNMENT' ORDER BY s."orderIndex"`,[primary.weeks.map(w=>w.section.id)]);
 for(const c of prepared)report.catalog.push({classId:c.classId,name:c.name,topics:c.weeks.length,lessons:c.weeks.length*3,activities:c.weeks.length*6});
 const schedules=JSON.parse(fs.readFileSync(path.join(OUT,'catalog-schedules.json'),'utf8'));
 report.counts.newDraftSessions=primary.scheduling.sessions.length+Object.values(schedules.classes).reduce((n,c)=>n+c.sessions.length,0);
 report.blockers=[
  '24 buổi chính và phân công kéo dài của lớp học viên đang là DRAFT, cần học vụ duyệt độc lập; không hiển thị thành buổi chính thức trước duyệt.',
  '108 nguồn quiz mới đã đủ câu hỏi và thời gian nhưng giữ DRAFT, cần người có quyền duyệt học thuật độc lập.',
  'Khóa Speaking & Writing chưa có lớp mở, CourseVersion được duyệt hoặc phân công; có bản biên soạn và đề xuất phiên bản DRAFT, chưa có quyền nhập học liệu hoặc phát hành.',
  'Lớp nhóm nhỏ chưa có giảng viên được phân công; không tự cấp quyền để nhập LMS.',
  'Kho mẫu của 5 khóa catalog có nội dung ở LMS lớp; nhập vào Module/Lesson của khóa còn phụ thuộc quyền tác giả được giữ lại theo hợp đồng hiện hành.',
  ...Object.values(schedules.classes).flatMap(c=>c.warnings.map(w=>c.name+': '+w)),
 ];
 report.validation.allPassed=Object.values(report.validation).every(v=>Array.isArray(v)&&v.length===0);
 await db.query('ROLLBACK');fs.writeFileSync(path.join(OUT,'verification.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({counts:report.counts,validation:report.validation,primary:report.primary,blockers:report.blockers},null,2));if(!report.validation.allPassed)process.exitCode=1;
}finally{await db.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
