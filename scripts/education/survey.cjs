'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { connect, OUT } = require('./target.cjs');

(async () => {
  const { db, identity } = await connect();
  try {
    const tables = ['courses','course_versions','class_offerings','class_instructor_assignments','teaching_sessions','class_schedule_slots','modules','lessons','learning_resources','class_sections','class_activities','class_activity_revisions','class_section_revisions','class_assessments','questions','question_options','tests','test_questions','assessment_stimuli','enrollments','lesson_progress','class_activity_progress','class_assignment_submissions','assignment_grades','test_attempts','w05b_profiles','w05b_availability','w05b_bookings','support_topics','support_requests','w07_applications','w07_obligations','permission_grants'];
    const result = { identity, capturedAt: new Date().toISOString(), schema: {}, counts: {}, data: {} };
    for (const table of tables) {
      result.schema[table] = (await db.query('SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position', ['public',table])).rows;
      result.counts[table] = +(await db.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n;
      if (!['questions','question_options','test_questions','assessment_stimuli','permission_grants'].includes(table)) result.data[table] = (await db.query(`SELECT * FROM "${table}"`)).rows;
    }
    result.data.actors = (await db.query('SELECT id,email,"fullName",role,status FROM users ORDER BY role,email')).rows;
    result.constraints = (await db.query(`SELECT c.relname AS table_name, con.conname, pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND con.contype IN ('c','u')`,[tables])).rows;
    result.triggers = (await db.query(`SELECT c.relname AS table_name, t.tgname, pg_get_triggerdef(t.oid) AS definition
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND NOT t.tgisinternal`,[tables])).rows;
    await db.query('ROLLBACK');
    fs.mkdirSync(OUT,{recursive:true});
    fs.writeFileSync(path.join(OUT,'survey.json'), JSON.stringify(result,null,2));
    console.log(JSON.stringify({ identity, counts: result.counts, student: result.data.actors.filter(a=>a.email==='student@gmail.com'),
      classes: result.data.class_offerings.map(c=>({id:c.id,courseId:c.courseId,name:c.name,status:c.status,instructorId:c.instructorId,classStart:c.classStart,classEnd:c.classEnd,totalSessions:c.totalSessions})),
      enrollments: result.data.enrollments.map(e=>({id:e.id,studentId:e.studentId,learnerId:e.learnerId,classOfferingId:e.classOfferingId,status:e.status})), sessions: result.data.teaching_sessions },null,2));
  } finally { await db.end(); }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
