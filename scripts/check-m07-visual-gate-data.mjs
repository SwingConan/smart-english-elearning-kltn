import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import readXlsxFile from 'read-excel-file/node';

const envText = readFileSync(resolve('apps/api/.env'), 'utf8');
const envValue = (name) => {
  const line = envText.split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  if (!line) return undefined;
  return line.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '');
};
const connectionString = process.env.DATABASE_URL ?? envValue('DATABASE_URL');
if (!connectionString) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString });
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};
const one = async (text, params = []) => (await pool.query(text, params)).rows[0];

try {
  const accounts = await pool.query(
    `SELECT email, "fullName", role::text FROM users WHERE email = ANY($1::text[]) ORDER BY email`,
    [['instructor.demo@smart-elearning.local', 'student.demo@smart-elearning.local']],
  );
  expect(accounts.rowCount === 2, 'Required demo accounts are missing');
  expect(accounts.rows.some((row) => row.email === 'instructor.demo@smart-elearning.local' && row.role === 'INSTRUCTOR'), 'Instructor demo account is invalid');
  expect(accounts.rows.some((row) => row.email === 'student.demo@smart-elearning.local' && row['fullName'] === 'Nguyễn Minh Anh'), 'Primary learner account is invalid');

  const catalog = await one(`
    SELECT count(*)::int classes, count(DISTINCT co."courseId")::int courses,
      array_agg(DISTINCT CASE WHEN co.status::text = 'CANCELLED' THEN 'CLOSED' ELSE co.status::text END) statuses
    FROM class_offerings co JOIN users u ON u.id = co."instructorId"
    WHERE u.email = 'instructor.demo@smart-elearning.local'`);
  expect(catalog.classes >= 10, `Instructor classes expected >=10, got ${catalog.classes}`);
  expect(catalog.courses === 5, `Instructor courses expected 5, got ${catalog.courses}`);
  for (const status of ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CLOSED'])
    expect(catalog.statuses.includes(status), `Teaching catalog is missing ${status}`);
  const duplicateSlots = await one(`
    SELECT count(*)::int count FROM (
      SELECT "classOfferingId", "dayOfWeek", "startTime", "endTime", coalesce("locationText", ''), count(*)
      FROM class_schedule_slots GROUP BY 1,2,3,4,5 HAVING count(*) > 1
    ) duplicates`);
  expect(duplicateSlots.count === 0, `Duplicate schedule slots found: ${duplicateSlots.count}`);

  const primary = await one(`
    SELECT co.id, co.name, co.status::text, c.id "courseId", c.title
    FROM class_offerings co JOIN courses c ON c.id = co."courseId"
    WHERE co.code = 'TOEIC-LR-2609-EVE'`);
  expect(primary?.name === 'TOEIC L&R Foundation — Tối T3/T5', 'Primary class identity is invalid');
  expect(primary?.title === 'TOEIC Workplace Foundations', 'Primary Course identity is invalid');
  expect(primary?.status === 'IN_PROGRESS', 'Primary class must remain IN_PROGRESS');
  if (!primary) throw new Error('Primary class not found');

  const curriculum = await one(`
    SELECT count(DISTINCT m.id)::int modules, count(DISTINCT l.id)::int lessons
    FROM modules m LEFT JOIN lessons l ON l."moduleId" = m.id WHERE m."courseId" = $1`,
    [primary.courseId],
  );
  expect(curriculum.modules >= 3, `Primary Course modules expected >=3, got ${curriculum.modules}`);
  expect(curriculum.lessons >= 8, `Primary Course lessons expected >=8, got ${curriculum.lessons}`);

  const learners = await one(`
    SELECT count(*)::int count FROM enrollments
    WHERE "classOfferingId" = $1 AND status::text = 'ACTIVE'`,
    [primary.id],
  );
  expect(learners.count === 11, `Primary class active learners expected 11, got ${learners.count}`);
  const progress = await one(`
    WITH progress AS (
      SELECT e.id,
        round(100.0 * count(lp.id) FILTER (WHERE lp.status::text = 'COMPLETED') / $2)::int percentage,
        max(coalesce(lp."completedAt", lp."lastAccessedAt", e."enrolledAt")) latest
      FROM enrollments e LEFT JOIN lesson_progress lp ON lp."enrollmentId" = e.id
      WHERE e."classOfferingId" = $1 AND e.status::text = 'ACTIVE' GROUP BY e.id
    ) SELECT
      count(*) FILTER (WHERE percentage < 25)::int b1,
      count(*) FILTER (WHERE percentage >= 25 AND percentage < 50)::int b2,
      count(*) FILTER (WHERE percentage >= 50 AND percentage < 75)::int b3,
      count(*) FILTER (WHERE percentage >= 75 AND percentage < 100)::int b4,
      count(*) FILTER (WHERE percentage = 100)::int b5,
      count(*) FILTER (WHERE latest < '2026-09-30T00:00:00Z')::int stale,
      count(*) FILTER (WHERE latest >= '2026-10-01T00:00:00Z')::int recent
    FROM progress`,
    [primary.id, curriculum.lessons],
  );
  const buckets = [progress.b1, progress.b2, progress.b3, progress.b4, progress.b5];
  expect(JSON.stringify(buckets) === JSON.stringify([2, 2, 3, 2, 2]), `Progress buckets expected 2/2/3/2/2, got ${buckets.join('/')}`);
  expect(progress.stale >= 3, `Stale learners expected >=3, got ${progress.stale}`);
  expect(progress.recent >= 5, `Recent learners expected >=5, got ${progress.recent}`);

  const resources = await pool.query(`
    SELECT lr.title, lr.type::text, lr.url, lr."storageKey", lr."originalFileName", lr."mimeType", lr."isDownloadable", l.title "lessonTitle"
    FROM learning_resources lr JOIN lessons l ON l.id = lr."lessonId" JOIN modules m ON m.id = l."moduleId"
    WHERE m."courseId" = $1 AND lr.title = ANY($2::text[]) ORDER BY lr.title`, [primary.courseId, [
      'Cẩm nang học tập của lớp',
      'M07 Demo — Video YouTube trong bài học',
      'Tài nguyên TOEIC tham khảo',
    ]]);
  expect(resources.rowCount === 3, `Required resources expected 3, got ${resources.rowCount}`);
  const stored = resources.rows.find((row) => row.title === 'Cẩm nang học tập của lớp');
  const youtube = resources.rows.find((row) => row.title === 'M07 Demo — Video YouTube trong bài học');
  const external = resources.rows.find((row) => row.title === 'Tài nguyên TOEIC tham khảo');
  expect(stored?.type === 'DOCUMENT' && stored.storageKey && stored.originalFileName && stored.mimeType && stored.isDownloadable, 'Protected stored document metadata is invalid');
  if (stored?.storageKey) {
    const objectPath = resolve('apps/api/.local-storage/learning-resources', stored.storageKey);
    expect(existsSync(objectPath) && statSync(objectPath).size > 0, 'Protected stored document object is missing or empty');
  }
  expect(youtube?.type === 'VIDEO' && /^https:\/\/(www\.)?youtube\.com\/watch\?v=/.test(youtube.url ?? ''), 'Trusted YouTube resource is invalid');
  expect(external?.type === 'LINK' && /^https:\/\//.test(external.url ?? ''), 'External resource is invalid');

  const bank = await pool.query(`
    SELECT q."toeicSkill"::text skill, q."responseType"::text type, count(*)::int count,
      count(*) FILTER (WHERE q."rubricId" IS NOT NULL AND r."isActive")::int "activeRubricCount"
    FROM questions q LEFT JOIN rubrics r ON r.id = q."rubricId"
    WHERE q."courseId" = $1 AND q.content LIKE 'M07-VG-%'
    GROUP BY 1,2 ORDER BY 1,2`, [primary.courseId]);
  const bankKey = new Map(bank.rows.map((row) => [`${row.skill}:${row.type}`, row]));
  const expectedBank = [
    ['LISTENING:SINGLE_CHOICE', 24],
    ['READING:SINGLE_CHOICE', 24],
    ['SPEAKING:AUDIO_RESPONSE', 16],
    ['WRITING:TEXT_RESPONSE', 16],
  ];
  const bankTotal = bank.rows.reduce((sum, row) => sum + row.count, 0);
  expect(bankTotal === 80, `M07 Question Bank expected 80, got ${bankTotal}`);
  for (const [key, count] of expectedBank) expect(bankKey.get(key)?.count === count, `${key} expected ${count}, got ${bankKey.get(key)?.count ?? 0}`);
  expect(bankKey.get('SPEAKING:AUDIO_RESPONSE')?.activeRubricCount === 16, 'Speaking questions require active rubrics');
  expect(bankKey.get('WRITING:TEXT_RESPONSE')?.activeRubricCount === 16, 'Writing questions require active rubrics');

  const draft = await one(`
    SELECT t.id, t.title, t.purpose::text, t.status::text,
      count(DISTINCT tqg.id)::int groups, count(DISTINCT tqg.skill)::int skills,
      count(DISTINCT ast.id)::int stimuli, count(DISTINCT ta.id)::int attempts
    FROM tests t LEFT JOIN test_question_groups tqg ON tqg."testId" = t.id
    LEFT JOIN assessment_stimuli ast ON ast."groupId" = tqg.id
    LEFT JOIN test_attempts ta ON ta."testId" = t.id
    WHERE t.title = 'VG-R3 — Đề demo hướng dẫn' GROUP BY t.id`);
  expect(draft?.purpose === 'IN_CLASS' && draft?.status === 'DRAFT', 'Safe draft purpose/status is invalid');
  expect(draft?.groups === 4 && draft?.skills === 4 && draft?.stimuli >= 1 && draft?.attempts === 0, 'Safe draft structure/history is invalid');

  const assessmentRows = await pool.query(`
    SELECT ca.id, ca.stage::text, ca."openAt", ca."closeAt", t.title
    FROM class_assessments ca JOIN tests t ON t.id = ca."testId"
    WHERE ca."classOfferingId" = $1 AND t.title = ANY($2::text[])`, [primary.id, [
      'Kiểm tra thường kỳ 01', 'Kiểm tra giữa kỳ', 'Kiểm tra cuối kỳ',
    ]]);
  const assessments = new Map(assessmentRows.rows.map((row) => [row.title, row]));
  expect(assessments.size === 3, `Required assessments expected 3, got ${assessments.size}`);

  const gradingManifest = async (assessmentId) => one(`
    WITH latest AS (
      SELECT DISTINCT ON (ta."learnerId") ta.id, ta."learnerId", ta."attemptNumber"
      FROM test_attempts ta WHERE ta."classAssessmentId" = $1 AND ta.status::text = 'SUBMITTED'
      ORDER BY ta."learnerId", ta."attemptNumber" DESC
    ), states AS (
      SELECT l.id, l."learnerId",
        count(DISTINCT ans.id)::int productive,
        count(DISTINCT ans.id) FILTER (WHERE ae.status::text = 'REVIEWED_FINAL' AND ae.source::text = 'INSTRUCTOR')::int finalized
      FROM latest l JOIN test_answers ans ON ans."attemptId" = l.id
      JOIN test_questions tq ON tq.id = ans."testQuestionId" JOIN questions q ON q.id = tq."questionId"
      LEFT JOIN answer_evaluations ae ON ae."testAnswerId" = ans.id
      WHERE q."toeicSkill"::text IN ('SPEAKING','WRITING') GROUP BY l.id, l."learnerId"
    ) SELECT count(*)::int submitted,
      count(*) FILTER (WHERE finalized = productive)::int final,
      count(*) FILTER (WHERE finalized > 0 AND finalized < productive)::int partial,
      count(*) FILTER (WHERE finalized = 0)::int waiting
    FROM states`, [assessmentId]);
  const periodic = await gradingManifest(assessments.get('Kiểm tra thường kỳ 01')?.id);
  const midterm = await gradingManifest(assessments.get('Kiểm tra giữa kỳ')?.id);
  const finalAttempts = await one(`SELECT count(*)::int count FROM test_attempts WHERE "classAssessmentId" = $1`, [assessments.get('Kiểm tra cuối kỳ')?.id]);
  expect(JSON.stringify([periodic.submitted, periodic.final, periodic.partial, periodic.waiting]) === JSON.stringify([8, 6, 1, 1]), `Periodic expected 8/6/1/1, got ${periodic.submitted}/${periodic.final}/${periodic.partial}/${periodic.waiting}`);
  expect(JSON.stringify([midterm.submitted, midterm.final, midterm.partial, midterm.waiting]) === JSON.stringify([7, 5, 1, 1]), `Midterm expected 7/5/1/1 latest learner states, got ${midterm.submitted}/${midterm.final}/${midterm.partial}/${midterm.waiting}`);
  expect(finalAttempts.count === 0 && new Date(assessments.get('Kiểm tra cuối kỳ')?.openAt) > new Date('2026-10-07T00:00:00Z'), 'Final assessment must be upcoming with zero submissions');

  const trend = await one(`
    WITH latest AS (
      SELECT DISTINCT ON (ta."classAssessmentId", ta."learnerId") ta.id, ta."classAssessmentId", ta."learnerId"
      FROM test_attempts ta JOIN class_assessments ca ON ca.id = ta."classAssessmentId"
      WHERE ca."classOfferingId" = $1 AND ta.status::text = 'SUBMITTED'
      ORDER BY ta."classAssessmentId", ta."learnerId", ta."attemptNumber" DESC
    ), complete AS (
      SELECT l."classAssessmentId", l."learnerId", count(DISTINCT ass."skill") FILTER (WHERE ass.status::text = 'FINAL') skills
      FROM latest l LEFT JOIN attempt_skill_scores ass ON ass."attemptId" = l.id GROUP BY 1,2
    ) SELECT count(*)::int count FROM (
      SELECT "classAssessmentId" FROM complete WHERE skills = 4 GROUP BY 1 HAVING count(*) >= 5
    ) x`, [primary.id]);
  expect(trend.count >= 2, `Trend-bearing assessments expected >=2, got ${trend.count}`);

  const primaryStory = await pool.query(`
    SELECT t.title, ta."attemptNumber", ass."skill"::text, ass.status::text, ass."normalizedScore"::float8 score
    FROM test_attempts ta JOIN users u ON u.id = ta."learnerId" JOIN class_assessments ca ON ca.id = ta."classAssessmentId"
    JOIN tests t ON t.id = ca."testId" JOIN attempt_skill_scores ass ON ass."attemptId" = ta.id
    WHERE u.email = 'student.demo@smart-elearning.local' AND ca."classOfferingId" = $1
    ORDER BY t.title, ta."attemptNumber", ass."skill"`, [primary.id]);
  const scoresFor = (title, attemptNumber) => new Map(primaryStory.rows.filter((row) => row.title === title && row.attemptNumber === attemptNumber).map((row) => [row.skill, row]));
  const periodicScores = scoresFor('Kiểm tra thường kỳ 01', 1);
  const midtermFirst = scoresFor('Kiểm tra giữa kỳ', 1);
  const midtermSecond = scoresFor('Kiểm tra giữa kỳ', 2);
  for (const [skill, value] of Object.entries({ LISTENING: 84, READING: 78, SPEAKING: 74, WRITING: 70 }))
    expect(periodicScores.get(skill)?.status === 'FINAL' && periodicScores.get(skill)?.score === value, `Primary Periodic ${skill} expected FINAL ${value}`);
  expect(midtermFirst.size === 2 && !midtermFirst.has('SPEAKING') && !midtermFirst.has('WRITING'), 'Primary Midterm attempt #1 must retain pending productive work without premature skill scores');
  for (const [skill, value] of Object.entries({ LISTENING: 88, READING: 82, SPEAKING: 78, WRITING: 76 }))
    expect(midtermSecond.get(skill)?.status === 'FINAL' && midtermSecond.get(skill)?.score === value, `Primary Midterm #2 ${skill} expected FINAL ${value}`);

  const stateNames = await pool.query(`
    WITH latest AS (
      SELECT DISTINCT ON (ta."learnerId") ta.id, ta."learnerId"
      FROM test_attempts ta WHERE ta."classAssessmentId" = $1 AND ta.status::text = 'SUBMITTED'
      ORDER BY ta."learnerId", ta."attemptNumber" DESC
    ), states AS (
      SELECT l.id, l."learnerId", count(DISTINCT ans.id)::int productive,
        count(DISTINCT ans.id) FILTER (WHERE ae.status::text = 'REVIEWED_FINAL' AND ae.source::text = 'INSTRUCTOR')::int finalized
      FROM latest l JOIN test_answers ans ON ans."attemptId" = l.id
      JOIN test_questions tq ON tq.id = ans."testQuestionId" JOIN questions q ON q.id = tq."questionId"
      LEFT JOIN answer_evaluations ae ON ae."testAnswerId" = ans.id
      WHERE q."toeicSkill"::text IN ('SPEAKING','WRITING') GROUP BY l.id,l."learnerId"
    ) SELECT u."fullName", CASE WHEN finalized = productive THEN 'FINAL' WHEN finalized = 0 THEN 'WAITING' ELSE 'PARTIAL' END state
      FROM states s JOIN users u ON u.id = s."learnerId" ORDER BY state, u."fullName"`, [assessments.get('Kiểm tra giữa kỳ')?.id]);
  expect(stateNames.rows.some((row) => row.state === 'WAITING'), 'Midterm WAITING example is missing');
  expect(stateNames.rows.some((row) => row.state === 'PARTIAL'), 'Midterm PARTIAL example is missing');
  expect(stateNames.rows.some((row) => row.state === 'FINAL'), 'Midterm FINAL example is missing');

  const fixtureDirectory = resolve('scripts/fixtures/m07');
  const warningPath = resolve(fixtureDirectory, 'M07_MANUAL_GATE_IMPORT_WARNING_ONLY.xlsx');
  const errorPath = resolve(fixtureDirectory, 'M07_MANUAL_GATE_IMPORT_ERROR.xlsx');
  expect(existsSync(warningPath) && existsSync(errorPath), 'Both XLSX fixtures must exist');
  if (existsSync(warningPath) && existsSync(errorPath)) {
    const warningWorkbook = await readXlsxFile(warningPath);
    const errorWorkbook = await readXlsxFile(errorPath);
    const warningRows = Array.isArray(warningWorkbook[0]?.data) ? warningWorkbook[0].data : warningWorkbook;
    const errorRows = Array.isArray(errorWorkbook[0]?.data) ? errorWorkbook[0].data : errorWorkbook;
    expect(warningRows.length === 3 && JSON.stringify(warningRows[1]) === JSON.stringify(warningRows[2]), 'WARNING_ONLY XLSX must contain duplicate valid rows');
    expect(errorRows.length === 2 && errorRows[1][0] === 'WRITING' && !errorRows[1][10], 'ERROR XLSX must contain a productive row without rubric');
  }
  const scaleLeak = await one(`SELECT count(*)::int count FROM questions WHERE content LIKE 'M07-SCALE-%'`);
  expect(scaleLeak.count === 0, `Scale-fixture leak expected 0, got ${scaleLeak.count}`);

  if (failures.length) {
    console.error('M07 Visual Gate data manifest FAIL');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log('M07 Visual Gate data manifest PASS');
    console.log('');
    console.log(`Classes: ${catalog.classes}`);
    console.log(`Courses: ${catalog.courses}`);
    console.log(`Class statuses: ${['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CLOSED'].join(' / ')}`);
    console.log(`Primary class active learners: ${learners.count}`);
    console.log(`Progress buckets: ${buckets.join(' / ')}`);
    console.log(`Question Bank: ${bankTotal} (24 Listening / 24 Reading / 16 Speaking / 16 Writing)`);
    console.log(`Periodic: ${periodic.submitted} submitted / ${periodic.final} final / ${periodic.partial} partial / ${periodic.waiting} waiting`);
    console.log(`Midterm: ${midterm.submitted} learners submitted / ${midterm.final} final / ${midterm.partial} partial / ${midterm.waiting} waiting`);
    console.log(`Trend-bearing assessments: ${trend.count}`);
    console.log('Draft test: VG-R3 — Đề demo hướng dẫn');
    console.log('Resources: stored + YouTube + external');
    console.log('XLSX fixtures: 2');
    console.log(`Scale-fixture leak: ${scaleLeak.count}`);
    console.log(`Midterm states: ${stateNames.rows.map((row) => `${row['fullName']}=${row.state}`).join(', ')}`);
  }
} finally {
  await pool.end();
}
