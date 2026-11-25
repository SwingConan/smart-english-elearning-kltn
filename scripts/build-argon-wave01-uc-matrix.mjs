import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  result.push(cur);
  return result;
}

function toCsvRow(fields) {
  return fields
    .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
    .join(',');
}

const DELTAS = {
  'UCV2-06': {
    wave01Scope: 'IN_SCOPE_PILLAR_2_PLACEMENT',
    statusBefore: 'BLOCKED',
    statusAfter: 'TECHNICAL_E2E_VERIFIED_PENDING_PO_RELEASE_GATES',
    backendStatus:
      'Verified E2E on disposable W04B DB: 200-item LR (P1=6,P2=25,P3=39,P4=30,P5=30,P6=16,P7=54) & 219-task FOUR_SKILLS (LR200 + Speaking11 + Writing8); fixed workflow.service.ts finish() taskIndex reset bug for multi-task Writing',
    frontendStatus:
      'Verified in headless Chrome (1440x900 & 390x844, 0 overflow): /workspace/placement & /placement/sittings/:attemptId with 80/20 right-hand navigator',
    evidenceEnvironment:
      'Argon Wave 01 disposable PostgreSQL DB + real NestJS API + real Chrome CDP',
    happyPathEvidence:
      'Full 200-item LR sitting + 219-task FOUR_SKILLS sitting (LISTENING->READING->BREAK->11 Speaking WAV recordings->8 Writing responses->SUBMITTED) + active 80/20 sitting browser capture',
    negativeRbacEvidence:
      'Unapproved timing/rubric blocked; foreign learner 404; global release flags remain false (MEDIA_QA_PASS=false, ACADEMIC_APPROVED=false, PUBLISHED=false)',
    whatRemains:
      'PO & Faculty academic/media sign-off (two independent media reviewers + academic approval) before flipping learnerPublishable/release flags in production',
    evidence:
      'apps/api/content/se-original-v1/*; apps/api/src/modules/placement/workflow.service.ts; apps/api/test/argon-wave01-learner-complete.e2e-spec.ts; docs/v2/v2-road-to-99-argon-wave01/EVIDENCE/ARGON_WAVE01_BACKEND_E2E_PROOFS.json',
  },
  'UCV2-07': {
    wave01Scope: 'IN_SCOPE_PILLAR_2_PLACEMENT',
    statusBefore: 'BLOCKED',
    statusAfter: 'TECHNICAL_E2E_VERIFIED_PENDING_PO_RELEASE_GATES',
    backendStatus:
      'Verified E2E on disposable W04B DB: LR & FOUR_SKILLS diagnostic evaluation release + positive class matching (MATCHED SE-LR class) & negative full-class exclusion (CLASS_FULL_OR_CAPACITY_UNVERIFIED)',
    frontendStatus:
      'Verified in headless Chrome (1440x900 & 390x844, 0 overflow): /placement/sittings/:attemptId/result for both LR 200 and FOUR_SKILLS 219',
    evidenceEnvironment:
      'Argon Wave 01 disposable PostgreSQL DB + real NestJS API + real Chrome CDP',
    happyPathEvidence:
      'LR 200 diagnostic PUBLISHED + MATCHED class with availableSeats=1 & seatGuaranteed=false; FOUR_SKILLS 219 diagnostic PUBLISHED across all 4 skills (L,R,S=66,W=56)',
    negativeRbacEvidence:
      'Full class (maxStudents=1, active enrollment=1) excluded with CLASS_FULL_OR_CAPACITY_UNVERIFIED; unpublished evaluations hidden from learner',
    whatRemains:
      'PO & HVU production calibration sign-off on official CourseVersion/CRITERIA thresholds',
    evidence:
      'apps/api/test/argon-wave01-learner-complete.e2e-spec.ts; docs/v2/v2-road-to-99-argon-wave01/EVIDENCE/ARGON_WAVE01_BACKEND_E2E_PROOFS.json',
  },
  'UCV2-18': {
    wave01Scope: 'IN_SCOPE_PILLAR_3_LEARNER_LMS',
    statusBefore: 'PARTIAL',
    statusAfter: 'PASS_DISPOSABLE_E2E',
    backendStatus:
      'Verified E2E: GET /api/v2/my/classes (4 enrolled classes) + GET /api/v2/my/calendar?month=2026-11 + W05B consultation calendar integration',
    frontendStatus:
      'Verified in headless Chrome (1440x900, 0 overflow): /my?month=2026-11 with ConsultationDay component & class calendar',
    evidenceEnvironment:
      'Argon Wave 01 disposable PostgreSQL DB + real NestJS API + real Chrome CDP',
    happyPathEvidence:
      'Enrolled learner loads 4 classes and 2026-11 monthly calendar with class sessions and 1:1 consultation bookings',
    negativeRbacEvidence:
      'Foreign class & foreign learner calendar events excluded by actor-scoped SQL queries',
    whatRemains:
      'Maintain regression coverage when future waves add new class cohorts',
    evidence:
      'apps/web/src/pages/MyDashboardPage.tsx; apps/api/test/argon-wave01-learner-complete.e2e-spec.ts; docs/v2/v2-road-to-99-argon-wave01/EVIDENCE/screenshots/12_lms_my_dashboard_calendar_desktop.png',
  },
  'UCV2-19': {
    wave01Scope: 'IN_SCOPE_PILLAR_3_LEARNER_LMS',
    statusBefore: 'PARTIAL',
    statusAfter: 'PASS_DISPOSABLE_E2E',
    backendStatus:
      'Verified E2E: Section & Lesson authoring/publication -> learner open (/open) & complete (/complete) with SQL progress readback',
    frontendStatus:
      'Verified in headless Chrome (1440x900, 0 overflow): /classroom/:classId rendering published Unit 1 section and 3 activities',
    evidenceEnvironment:
      'Argon Wave 01 disposable PostgreSQL DB + real NestJS API + real Chrome CDP',
    happyPathEvidence:
      'Unit 1 published with Lesson 1.1, Assignment 1.2, Quiz 1.3; learner opens and completes Lesson 1.1 (state=COMPLETED)',
    negativeRbacEvidence:
      'Foreign learner (otherLearner) receives HTTP 404 on /api/v2/class-lms/classes/:classId',
    whatRemains:
      'Maintain regression coverage across future content types',
    evidence:
      'apps/api/test/argon-wave01-learner-complete.e2e-spec.ts; docs/v2/v2-road-to-99-argon-wave01/EVIDENCE/screenshots/13_lms_classroom_sections_activities_desktop.png',
  },
  'UCV2-20': {
    wave01Scope: 'IN_SCOPE_PILLAR_3_LEARNER_LMS',
    statusBefore: 'PARTIAL',
    statusAfter: 'PASS_DISPOSABLE_E2E',
    backendStatus:
      'Verified E2E: Learner saves assignment draft (PUT /assignment/mine) and submits (POST /assignment/mine/submit) with immutable submission receipt',
    frontendStatus:
      'Verified in headless Chrome (1440x900, 0 overflow): /classroom/:classId/activities/:assignActId',
    evidenceEnvironment:
      'Argon Wave 01 disposable PostgreSQL DB + real NestJS API + real Chrome CDP',
    happyPathEvidence:
      'Learner drafts and submits workplace supplier follow-up email; GV grades againstHVU-approved 2-criterion rubric (9.00/10.00); HVU publishes',
    negativeRbacEvidence:
      'Unenrolled/foreign learner blocked (404); optimistic lockVersion enforced',
    whatRemains:
      'Maintain regression coverage',
    evidence:
      'apps/api/test/argon-wave01-learner-complete.e2e-spec.ts; docs/v2/v2-road-to-99-argon-wave01/EVIDENCE/screenshots/14_lms_assignment_submitted_graded_desktop.png',
  },
  'UCV2-21': {
    wave01Scope: 'IN_SCOPE_PILLAR_3_LEARNER_LMS',
    statusBefore: 'PARTIAL',
    statusAfter: 'PASS_DISPOSABLE_E2E',
    backendStatus:
      'Verified E2E: GV authors 4-item class quiz -> HVU approves source -> GV publishes -> Learner starts, answers 4 items (1/4 correct), marks item #2, submits -> HVU publishes result',
    frontendStatus:
      'Verified in headless Chrome (1440x900 & 390x844, 0 overflow): /classroom/:classId/quiz-attempts/:attemptId with verified 80/20 side-by-side right navigator on desktop and drawer button on mobile',
    evidenceEnvironment:
      'Argon Wave 01 disposable PostgreSQL DB + real NestJS API + real Chrome CDP',
    happyPathEvidence:
      '4-item quiz completed with receipt and published score 1/4; desktop 80/20 grid [data-testid="quiz-exam-grid"] verified side-by-side',
    negativeRbacEvidence:
      'Unapproved quiz source cannot be started; foreign learner denied (404)',
    whatRemains:
      'Maintain regression coverage',
    evidence:
      'apps/api/test/argon-wave01-learner-complete.e2e-spec.ts; docs/v2/v2-road-to-99-argon-wave01/EVIDENCE/screenshots/15_lms_quiz_attempt_80_20_navigator_desktop.png',
  },
  'UCV2-22': {
    wave01Scope: 'IN_SCOPE_PILLAR_3_LEARNER_LMS',
    statusBefore: 'PARTIAL',
    statusAfter: 'PASS_DISPOSABLE_E2E',
    backendStatus:
      'Verified E2E: Assignment gradebook (9.00/10.00) and Class Quiz gradebook (1/4) after independent HVU publication',
    frontendStatus:
      'Verified in headless Chrome (1440x900, 0 overflow): /classroom/:classId/gradebook',
    evidenceEnvironment:
      'Argon Wave 01 disposable PostgreSQL DB + real NestJS API + real Chrome CDP',
    happyPathEvidence:
      'Published assignment grade 9.00/10.00 and quiz grade 1/4 rendered accurately with criterion feedback; unpublished grades never converted to 0',
    negativeRbacEvidence:
      'Same-person rubric/grade approval blocked; foreign learner denied',
    whatRemains:
      'Maintain regression coverage',
    evidence:
      'apps/api/test/argon-wave01-learner-complete.e2e-spec.ts; docs/v2/v2-road-to-99-argon-wave01/EVIDENCE/screenshots/17_lms_gradebook_published_scores_desktop.png',
  },
  'UCV2-23': {
    wave01Scope: 'IN_SCOPE_PILLAR_3_LEARNER_LMS',
    statusBefore: 'PARTIAL',
    statusAfter: 'PASS_DISPOSABLE_E2E',
    backendStatus:
      'Verified E2E: GET /api/v2/class-lms/classes/:classId/progress returns 3 published activity entries, completion=POLICY_NOT_EVALUATED, certificateIssued=false',
    frontendStatus:
      'Verified in headless Chrome (1440x900, 0 overflow): /classroom/:classId/progress',
    evidenceEnvironment:
      'Argon Wave 01 disposable PostgreSQL DB + real NestJS API + real Chrome CDP',
    happyPathEvidence:
      'All 3 published activities (Lesson COMPLETED, Assignment SUBMITTED, Quiz SUBMITTED) displayed with honest completion state',
    negativeRbacEvidence:
      'No fabricated 0% or unapproved ETS score conversion',
    whatRemains:
      'Maintain regression coverage',
    evidence:
      'apps/api/test/argon-wave01-learner-complete.e2e-spec.ts; docs/v2/v2-road-to-99-argon-wave01/EVIDENCE/screenshots/18_lms_class_progress_desktop.png',
  },
  'UCV2-24': {
    wave01Scope: 'IN_SCOPE_PILLAR_3_LEARNER_LMS',
    statusBefore: 'PARTIAL',
    statusAfter: 'PASS_DISPOSABLE_E2E',
    backendStatus:
      'Verified E2E: GV authors WORD_FORMS tag + article -> HVU reviews & publishes -> 4 quiz questions linked & published -> GET /api/v2/knowledge/recommendations returns state=AVAILABLE (1/4 correct)',
    frontendStatus:
      'Verified in headless Chrome (1440x900, 0 overflow): /knowledge showing "Word Forms: 1/4 câu đúng — nên ôn kiến thức này"',
    evidenceEnvironment:
      'Argon Wave 01 disposable PostgreSQL DB + real NestJS API + real Chrome CDP',
    happyPathEvidence:
      'End-to-end recommendation from 4-item published quiz aggregate to published Knowledge Library article (slug: word-forms, notProficiency: true)',
    negativeRbacEvidence:
      'Unpublished links or <4 distinct questions do not trigger premature recommendation',
    whatRemains:
      'Expand faculty-authored knowledge articles in future waves',
    evidence:
      'apps/api/test/argon-wave01-learner-complete.e2e-spec.ts; docs/v2/v2-road-to-99-argon-wave01/EVIDENCE/screenshots/19_lms_knowledge_recommendations_desktop.png',
  },
  'UCV2-27': {
    wave01Scope: 'IN_SCOPE_PILLAR_1_W05B',
    statusBefore: 'BLOCKED',
    statusAfter: 'PASS_DISPOSABLE_E2E',
    backendStatus:
      'Verified E2E on disposable DB: Unenrolled learner (0 enrollments) browses approved profiles (/profiles) & slots (/slots?teacherId=...), holds slot (HOLD), submits topic (SUBMIT), views confirmed booking, reschedules, cancels',
    frontendStatus:
      'FIXED & VERIFIED: Resolved /teachers & composite-slot mismatch in ConsultationsPage.tsx; 7/7 unit tests PASS + headless Chrome (1440x900 & 390x844, 0 overflow) PASS',
    evidenceEnvironment:
      'Argon Wave 01 disposable PostgreSQL DB + real NestJS API + real Chrome CDP',
    happyPathEvidence:
      'Unenrolled learner completes free 1:1 booking without enrollment or payment; 400 available slots loaded via /v2/consultations/slots?teacherId=...; Asia/Ho_Chi_Minh enforced',
    negativeRbacEvidence:
      'Concurrent double-booking race returns HTTP 409; foreign learner SUBMIT tamper returns HTTP 404; future join link outside 15m window hidden from learner',
    whatRemains:
      'Ready for PO acceptance on disposable E2E; production cutover governed by W05B_ENABLED env flag',
    evidence:
      'apps/web/src/pages/ConsultationsPage.tsx; apps/web/src/pages/consultations.test.tsx; apps/api/test/argon-wave01-learner-complete.e2e-spec.ts; docs/v2/v2-road-to-99-argon-wave01/EVIDENCE/screenshots/01_w05b_learner_consultations_desktop.png',
  },
  'UCV2-28': {
    wave01Scope: 'IN_SCOPE_PILLAR_3_LEARNER_LMS',
    statusBefore: 'BLOCKED',
    statusAfter: 'TRUTHFUL_READINESS_VERIFIED_E2E',
    backendStatus:
      'Verified E2E: GET /api/v2/certificates/readiness returns assessment=PENDING_POLICY, certificates=null, issuanceAvailable=false, and 4 enrolled class readiness records',
    frontendStatus:
      'Verified in headless Chrome (1440x900, 0 overflow): /completion renders honest readiness banner and disabled certificate button without fabricating certificates',
    evidenceEnvironment:
      'Argon Wave 01 disposable PostgreSQL DB + real NestJS API + real Chrome CDP',
    happyPathEvidence:
      'Enrolled learner views all 4 enrollments on /completion with honest PENDING_POLICY status and link to each class progress page',
    negativeRbacEvidence:
      'No fake certificate issuance or fake 0 certificate count; blockers explicitly listed',
    whatRemains:
      'W09 certificate issuance persistence & completion policy approval remain in later HVU/W09 wave',
    evidence:
      'apps/api/test/argon-wave01-learner-complete.e2e-spec.ts; docs/v2/v2-road-to-99-argon-wave01/EVIDENCE/screenshots/20_lms_completion_readiness_desktop.png',
  },
  'UCV2-45': {
    wave01Scope: 'IN_SCOPE_PILLAR_2_PLACEMENT',
    statusBefore: 'BLOCKED',
    statusAfter: 'TECHNICAL_E2E_VERIFIED_PENDING_PO_RELEASE_GATES',
    backendStatus:
      'Verified E2E: Maker-checker authoring & independent approval of SOURCE_TIMING, RUBRIC, and CRITERIA policies + CourseVersion/ClassOffering matching verification',
    frontendStatus:
      'Verified in headless Chrome (1440x900, 0 overflow): /workspace/placement policy & readiness governance workspace',
    evidenceEnvironment:
      'Argon Wave 01 disposable PostgreSQL DB + real NestJS API + real Chrome CDP',
    happyPathEvidence:
      'GV authors SOURCE_TIMING & RUBRIC policies -> HVU approves; HVU Maker authors CRITERIA policy -> HVU Checker approves -> positive & negative class matching verified',
    negativeRbacEvidence:
      'Same-person policy approval blocked (403); unapproved CourseVersion rejected',
    whatRemains:
      'PO & HVU production policy sign-off',
    evidence:
      'apps/api/test/argon-wave01-learner-complete.e2e-spec.ts; docs/v2/v2-road-to-99-argon-wave01/EVIDENCE/screenshots/09_placement_hvu_readiness_policies_desktop.png',
  },
  'UCV2-57': {
    wave01Scope: 'IN_SCOPE_PILLAR_1_W05B',
    statusBefore: 'BLOCKED',
    statusAfter: 'PASS_DISPOSABLE_E2E',
    backendStatus:
      'Verified E2E on disposable DB: GV saves profile draft -> independent HVU approves -> GV adds 7 weekly availability rules -> GV confirms booking, proposes join link, requests reschedule -> HVU approves link & change request',
    frontendStatus:
      'FIXED & VERIFIED: ConsultationsPage.tsx aligned for GV (/workspace, /bookings, PROFILE_SAVE, AVAILABILITY_ADD, CONFIRM, LINK_PROPOSE, CHANGE_REQUEST) & HVU (ConsultationReview); verified in headless Chrome (1440x900, 0 overflow)',
    evidenceEnvironment:
      'Argon Wave 01 disposable PostgreSQL DB + real NestJS API + real Chrome CDP',
    happyPathEvidence:
      'Full GV + HVU maker-checker lifecycle verified with 25 immutable w05b_events and 35 w05b_outbox notifications in SQL readback',
    negativeRbacEvidence:
      'Self-approval blocked; optimistic concurrency version check enforced on w05b_bookings',
    whatRemains:
      'Ready for PO acceptance on disposable E2E; production cutover governed by W05B_ENABLED env flag',
    evidence:
      'apps/web/src/pages/ConsultationsPage.tsx; apps/web/src/pages/consultations-review.test.tsx; apps/api/test/argon-wave01-learner-complete.e2e-spec.ts; docs/v2/v2-road-to-99-argon-wave01/EVIDENCE/screenshots/06_w05b_teacher_workspace_desktop.png; docs/v2/v2-road-to-99-argon-wave01/EVIDENCE/screenshots/08_w05b_hvu_governance_desktop.png',
  },
};

async function main() {
  const srcPath = resolve('docs/v2/v2-road-to-99-f0-f1/57_UC_E2E_GAP_MATRIX.csv');
  const raw = await readFile(srcPath, 'utf8');
  const lines = raw.trim().split(/\r?\n/);
  const header = parseCsvLine(lines[0]);

  const outHeader = [
    ...header.slice(0, 16),
    'statusBeforeWave01',
    'statusAfterWave01',
    'wave01Scope',
    ...header.slice(17),
  ];

  const outRows = [toCsvRow(outHeader)];
  const mdRows = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const ucId = row[0];
    const d = DELTAS[ucId];
    const statusBefore = d ? d.statusBefore : row[16];
    const statusAfter = d ? d.statusAfter : row[16];
    const wave01Scope = d ? d.wave01Scope : 'OUT_OF_WAVE01_SCOPE_UNCHANGED';

    if (d) {
      row[8] = d.backendStatus;
      row[9] = d.frontendStatus;
      row[11] = d.evidenceEnvironment;
      row[12] = d.happyPathEvidence;
      row[13] = d.negativeRbacEvidence;
      row[15] = d.whatRemains;
      row[18] = '2026-11-09';
      row[19] = d.evidence;
    }

    const merged = [
      ...row.slice(0, 16),
      statusBefore,
      statusAfter,
      wave01Scope,
      ...row.slice(17),
    ];
    outRows.push(toCsvRow(merged));
    mdRows.push({
      id: ucId,
      name: row[1],
      actors: row[2],
      priority: row[3],
      route: row[6],
      wave01Scope,
      statusBefore,
      statusAfter,
      happyPathEvidence: row[12],
      negativeRbacEvidence: row[13],
      whatRemains: row[15],
    });
  }

  const outCsvPath = resolve('docs/v2/v2-road-to-99-argon-wave01/57_UC_DELTA_MATRIX.csv');
  await writeFile(outCsvPath, outRows.join('\n') + '\n', 'utf8');

  const inScopeRows = mdRows.filter((r) => r.wave01Scope !== 'OUT_OF_WAVE01_SCOPE_UNCHANGED');
  const md = [
    '# ROAD99 — Argon Wave 01 — 57-UC Delta Matrix',
    '',
    '- **Baseline Checkpoint**: `docs/v2/v2-road-to-99-f0-f1/57_UC_E2E_GAP_MATRIX.csv`',
    '- **Wave 01 Target UCs (13 UCs)**: `UCV2-06`, `UCV2-07`, `UCV2-18`, `UCV2-19`, `UCV2-20`, `UCV2-21`, `UCV2-22`, `UCV2-23`, `UCV2-24`, `UCV2-27`, `UCV2-28`, `UCV2-45`, `UCV2-57`',
    '- **Out-of-Scope UCs (44 UCs)**: Preserved unchanged from F0+F1 checkpoint (`OUT_OF_WAVE01_SCOPE_UNCHANGED`).',
    '',
    '## 1. Wave 01 Target UCs (13 UCs) — Detailed Delta',
    '',
    '| UC | Tên Use Case | Actors | Scope | Before Wave 01 | After Wave 01 | Happy-Path Evidence | Negative / RBAC Evidence | What Remains |',
    '|---|---|---|---|---|---|---|---|---|',
    ...inScopeRows.map(
      (r) =>
        `| \`${r.id}\` | ${r.name} | ${r.actors} | \`${r.wave01Scope}\` | \`${r.statusBefore}\` | \`${r.statusAfter}\` | ${r.happyPathEvidence} | ${r.negativeRbacEvidence} | ${r.whatRemains} |`,
    ),
    '',
    '## 2. All 57 UCs Summary Table',
    '',
    '| UC | Tên Use Case | Priority | Wave 01 Scope | Before | After |',
    '|---|---|---|---|---|---|',
    ...mdRows.map(
      (r) =>
        `| \`${r.id}\` | ${r.name} | \`${r.priority}\` | \`${r.wave01Scope}\` | \`${r.statusBefore}\` | \`${r.statusAfter}\` |`,
    ),
    '',
  ].join('\n');

  const outMdPath = resolve('docs/v2/v2-road-to-99-argon-wave01/57_UC_DELTA_MATRIX.md');
  await writeFile(outMdPath, md, 'utf8');
  console.log(`Wrote ${outCsvPath} and ${outMdPath} (${mdRows.length} UCs, ${inScopeRows.length} in Wave 01 scope).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
