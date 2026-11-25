import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  const headers = rows[0];
  return rows
    .slice(1)
    .filter((r) => r.length > 1 && r[0])
    .map((r) => {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = r[idx] ?? '';
      });
      return obj;
    });
}

function escapeCsv(val) {
  const s = String(val ?? '');
  return `"${s.replace(/"/g, '""')}"`;
}

const wave01Csv = readFileSync(
  resolve('docs/v2/v2-road-to-99-argon-wave01/57_UC_DELTA_MATRIX.csv'),
  'utf8',
);
const wave01Rows = parseCsv(wave01Csv);

const WAVE02_UPDATES = {
  'UCV2-06': {
    wave02Target: 'WAVE01_RECONCILED_IN_WAVE02 (Part 2 3-option A/B/C & Part 7 10S+2D+3T)',
    statusAfterWave02: 'TECHNICAL_E2E_VERIFIED_PENDING_PO_RELEASE_GATES',
    routesEndpointsTables:
      '/placement, /placement/sittings/:attemptId | POST /api/v2/placement/workflow/attempts, POST .../commands, POST .../answers, POST .../recordings/:qid | PlacementSourceVersion, PlacementSitting, TestAttempt',
    automatedTestProof:
      'node scripts/build-original-placement-bank.mjs (passed=true, Part2=3 options A/B/C, Part7=10S+2D+3T=54 items); apps/api/test/argon-wave01-learner-complete.e2e-spec.ts',
    browserUiProof:
      'Wave 01 & Wave 02 verified 80/20 Placement Sitting UI (1440x900 & 390x844, 0 overflow)',
    remainingExternalBlocker:
      'PO & Faculty academic/media sign-off (MEDIA_QA_PASS=false, ACADEMIC_APPROVED=false, PUBLISHED=false preserved)',
  },
  'UCV2-25': {
    wave02Target: 'IN_SCOPE_PILLAR_A_AND_B_OFFICIAL_SESSIONS',
    statusAfterWave02: 'PASS_DISPOSABLE_E2E',
    routesEndpointsTables:
      '/classroom/:classId, /classroom/:classId/attendance | GET /api/v2/class-lms/classes/:classId, GET /api/v2/session-engagement/sessions/:id | TeachingSession, W06Meet, W06Window',
    automatedTestProof:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar A & B: officialSessions returned in class tree + approved Meet URL)',
    browserUiProof:
      '01-gv-classroom-sessions-and-sections-1440.png; 04-gv-session-engagement-meet-attendance-1440.png',
    remainingExternalBlocker: 'None for disposable E2E; real Google Meet host room creation is external to app',
  },
  'UCV2-26': {
    wave02Target: 'IN_SCOPE_PILLAR_B_LEARNER_CHECKIN_AND_CORRECTION',
    statusAfterWave02: 'PASS_DISPOSABLE_E2E',
    routesEndpointsTables:
      '/classroom/:classId/attendance, /sessions/:sessionId/engagement | POST /api/v2/session-engagement/sessions/:id/checkin, POST .../corrections | W06Window, W06Receipt, W06Correction, W06Rate',
    automatedTestProof:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar B: 20-hex code check-in PRESENT, duplicate check-in idempotency, attendance correction submitted & approved)',
    browserUiProof: '04-gv-session-engagement-meet-attendance-1440.png',
    remainingExternalBlocker: 'None',
  },
  'UCV2-27': {
    wave02Target: 'WAVE01_RECONCILED_IN_WAVE02 (W05B 09:00-17:00 <= 224 slots)',
    statusAfterWave02: 'PASS_DISPOSABLE_E2E',
    routesEndpointsTables:
      '/consultations, /my, /workspace/consultations | /api/v2/consultations/* | W05bProfile, W05bAvailabilityRule, W05bBooking',
    automatedTestProof:
      'Reconciled availability window 540..1020 (09:00-17:00, <= 224 slots in 14d window, within 400 cap) in apps/api/test/argon-wave01-learner-complete.e2e-spec.ts',
    browserUiProof: 'Wave 01 01_w05b_learner_consultations_desktop.png',
    remainingExternalBlocker: 'None',
  },
  'UCV2-28': {
    wave02Target: 'IN_SCOPE_PILLAR_D_LEARNER_COMPLETION_AND_CERTIFICATE_LOOKUP',
    statusAfterWave02: 'PASS_DISPOSABLE_E2E',
    routesEndpointsTables:
      '/completion, /certificates/lookup | GET /api/v2/certificates/readiness, GET /api/v2/certificates/lookup/:code | w09_completion_policies, w09_certificate_reviews, w09_certificates',
    automatedTestProof:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar D: learner readiness returns ISSUED certificate & satisfied W03/W06/W07 criteria; public lookup verifies ISSUED & REVOKED)',
    browserUiProof:
      '08-hv-completion-issued-certificate-1440.png; 09-certificate-lookup-verified-1440.png; 10-certificate-lookup-revoked-390.png',
    remainingExternalBlocker:
      'Production W09_ENABLED remains OFF until PO approves official CourseVersion completion thresholds',
  },
  'UCV2-29': {
    wave02Target: 'IN_SCOPE_PILLAR_A_GV_CLASSROOM_SESSIONS_AND_SECTIONS',
    statusAfterWave02: 'PASS_DISPOSABLE_E2E',
    routesEndpointsTables:
      '/classroom/:classId | GET /api/v2/class-lms/classes/:classId, POST .../sections, POST .../sections/:id/publish | ClassSection, TeachingSession, ClassInstructorAssignment',
    automatedTestProof:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar A: GV views assigned class, officialSessions, creates & publishes Section)',
    browserUiProof:
      '01-gv-classroom-sessions-and-sections-1440.png; 02-gv-activity-chooser-6-types-1440.png',
    remainingExternalBlocker: 'None',
  },
  'UCV2-30': {
    wave02Target: 'IN_SCOPE_PILLAR_A_GV_LESSON_AND_RESOURCE_ACTIVITIES',
    statusAfterWave02: 'PASS_DISPOSABLE_E2E',
    routesEndpointsTables:
      '/classroom/:classId | POST /api/v2/class-lms/classes/:classId/sections/:sectionId/activities, POST .../activities/:id/publish | ClassActivity, ClassActivityVersion',
    automatedTestProof:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar A: GV creates & publishes LESSON and RESOURCE activities via Activity Chooser)',
    browserUiProof:
      '02-gv-activity-chooser-6-types-1440.png; 03-gv-activity-chooser-6-types-390.png',
    remainingExternalBlocker: 'None',
  },
  'UCV2-31': {
    wave02Target: 'IN_SCOPE_PILLAR_A_GV_ASSIGNMENT_AUTHORING',
    statusAfterWave02: 'PASS_DISPOSABLE_E2E',
    routesEndpointsTables:
      '/classroom/:classId | POST /api/v2/class-lms/classes/:classId/sections/:sectionId/activities (ASSIGNMENT), POST /api/v2/assignment-grading/.../rubrics | ClassActivity, AssignmentRubric',
    automatedTestProof:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar A: GV creates & publishes ASSIGNMENT activity and Rubric)',
    browserUiProof: '02-gv-activity-chooser-6-types-1440.png',
    remainingExternalBlocker: 'None',
  },
  'UCV2-32': {
    wave02Target: 'IN_SCOPE_PILLAR_A_GV_ASSIGNMENT_GRADING_AND_FEEDBACK',
    statusAfterWave02: 'PASS_DISPOSABLE_E2E',
    routesEndpointsTables:
      '/classroom/:classId/activities/:activityId | POST /api/v2/assignment-grading/classes/:classId/activities/:activityId/submissions/:subId/grades, POST .../grades/:id/final, POST .../publish | AssignmentSubmission, AssignmentGrade',
    automatedTestProof:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar A: GV grades learner submission with rubric criteria & feedback, finalizes, HVU publishes -> 90%)',
    browserUiProof: '01-gv-classroom-sessions-and-sections-1440.png',
    remainingExternalBlocker: 'None',
  },
  'UCV2-33': {
    wave02Target: 'IN_SCOPE_PILLAR_A_GV_QUIZ_AND_KNOWLEDGE_TAG_AUTHORING',
    statusAfterWave02: 'PASS_DISPOSABLE_E2E',
    routesEndpointsTables:
      '/classroom/:classId/activities/:activityId | POST /api/v2/class-quiz/classes/:classId/activities/:activityId/sources, POST /api/v2/knowledge/links | ClassQuizSource, KnowledgeQuestionLink',
    automatedTestProof:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar A: GV creates 4-item QUIZ source, links KnowledgeTag & Article, HVU approves & publishes)',
    browserUiProof: '02-gv-activity-chooser-6-types-1440.png',
    remainingExternalBlocker: 'None',
  },
  'UCV2-34': {
    wave02Target: 'IN_SCOPE_PILLAR_A_GV_CLASS_PROGRESS_AND_GRADEBOOK',
    statusAfterWave02: 'PASS_DISPOSABLE_E2E',
    routesEndpointsTables:
      '/classroom/:classId/dashboard | GET /api/v2/class-lms/classes/:classId/dashboard, GET /api/v2/assignment-grading/classes/:classId/gradebook | TestAttempt, AssignmentGrade',
    automatedTestProof:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts; apps/api/src/modules/class-lms/class-progress.service.spec.ts (6/6 passed)',
    browserUiProof: '01-gv-classroom-sessions-and-sections-1440.png',
    remainingExternalBlocker: 'None',
  },
  'UCV2-35': {
    wave02Target: 'IN_SCOPE_PILLAR_A_AND_B_GV_PROPOSE_MEET_LINK',
    statusAfterWave02: 'PASS_DISPOSABLE_E2E',
    routesEndpointsTables:
      '/classroom/:classId/attendance?mode=meet, /sessions/:sessionId/engagement | POST /api/v2/session-engagement/sessions/:id/meet | W06Meet, TeachingSession',
    automatedTestProof:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar A & B: 6th Activity Chooser option ONLINE_SESSION routes to Meet proposal; GV proposes https://meet.google.com/abc-defg-hij)',
    browserUiProof:
      '02-gv-activity-chooser-6-types-1440.png; 04-gv-session-engagement-meet-attendance-1440.png',
    remainingExternalBlocker: 'None',
  },
  'UCV2-36': {
    wave02Target: 'IN_SCOPE_PILLAR_B_GV_SCHEDULE_EXCEPTION_LEAVE_RESCHEDULE_MAKEUP',
    statusAfterWave02: 'PASS_DISPOSABLE_E2E',
    routesEndpointsTables:
      '/sessions/:sessionId/engagement, /academic/session-engagement | POST /api/v2/session-engagement/sessions/:id/exceptions | W06Exception, TeachingSession',
    automatedTestProof:
      'apps/api/test/wave06-session-engagement.e2e-spec.ts (LEAVE/RESCHEDULE/MAKEUP exception request & independent HVU review preserving session history)',
    browserUiProof: '04-gv-session-engagement-meet-attendance-1440.png; 05-hvu-session-engagement-review-1440.png',
    remainingExternalBlocker: 'None',
  },
  'UCV2-37': {
    wave02Target: 'IN_SCOPE_PILLAR_A_AND_B_GV_OPEN_ATTENDANCE_ROTATE_CODE_ROSTER',
    statusAfterWave02: 'PASS_DISPOSABLE_E2E',
    routesEndpointsTables:
      '/classroom/:classId/attendance | POST /api/v2/session-engagement/sessions/:id/attendance, POST .../code, GET .../roster | W06Window, W06Receipt, W06Correction',
    automatedTestProof:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar B: GV opens attendance window, rotates 20-hex code, views roster with raw code redacted)',
    browserUiProof: '04-gv-session-engagement-meet-attendance-1440.png',
    remainingExternalBlocker: 'None',
  },
  'UCV2-39': {
    wave02Target: 'IN_SCOPE_PILLAR_B_HVU_OPEN_CLASS_OFFERING',
    statusAfterWave02: 'PASS_DISPOSABLE_E2E',
    routesEndpointsTables:
      '/workspace/academic | POST /api/v2/academic/classes, PATCH /api/v2/academic/classes/:id | ClassOffering, CourseVersion',
    automatedTestProof:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (seedWave08 + ClassOffering with CourseVersion and capacity)',
    browserUiProof: '05-hvu-session-engagement-review-1440.png',
    remainingExternalBlocker: 'None',
  },
  'UCV2-40': {
    wave02Target: 'IN_SCOPE_PILLAR_B_HVU_ASSIGN_INSTRUCTOR_AND_ROOM',
    statusAfterWave02: 'PASS_DISPOSABLE_E2E',
    routesEndpointsTables:
      '/workspace/academic | POST /api/v2/academic/classes/:id/assignments, POST .../submit, POST .../approve | ClassInstructorAssignment, Room',
    automatedTestProof:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (HVU Maker proposes & submits GV assignment, independent HVU Checker approves with eligibilityConfirmed=true)',
    browserUiProof: '01-gv-classroom-sessions-and-sections-1440.png',
    remainingExternalBlocker: 'None',
  },
  'UCV2-41': {
    wave02Target: 'IN_SCOPE_PILLAR_B_HVU_PUBLISH_TEACHING_SESSIONS',
    statusAfterWave02: 'PASS_DISPOSABLE_E2E',
    routesEndpointsTables:
      '/workspace/academic | POST /api/v2/academic/sessions/:id/submit, POST .../approve | TeachingSession',
    automatedTestProof:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (HVU Maker submits TeachingSession in Asia/Ho_Chi_Minh, independent HVU Checker approves -> state=PUBLISHED, intent=PUBLISH)',
    browserUiProof: '01-gv-classroom-sessions-and-sections-1440.png',
    remainingExternalBlocker: 'None',
  },
  'UCV2-42': {
    wave02Target: 'IN_SCOPE_PILLAR_B_HVU_APPROVE_SCHEDULE_EXCEPTIONS',
    statusAfterWave02: 'PASS_DISPOSABLE_E2E',
    routesEndpointsTables:
      '/academic/session-engagement | POST /api/v2/session-engagement/reviews/exception/:id | W06Exception, TeachingSession',
    automatedTestProof:
      'apps/api/test/wave06-session-engagement.e2e-spec.ts (Independent HVU reviews LEAVE/RESCHEDULE/MAKEUP with CAS & conflict check)',
    browserUiProof: '05-hvu-session-engagement-review-1440.png',
    remainingExternalBlocker: 'None',
  },
  'UCV2-43': {
    wave02Target: 'IN_SCOPE_PILLAR_B_HVU_APPROVE_GOOGLE_MEET_LINK',
    statusAfterWave02: 'PASS_DISPOSABLE_E2E',
    routesEndpointsTables:
      '/academic/session-engagement | GET/POST /api/v2/session-engagement/reviews/meet/:id | W06Meet, W06Outbox',
    automatedTestProof:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Independent HVU approves GV Meet link -> visible to enrolled HV, assigned GV, and assigned TT)',
    browserUiProof: '05-hvu-session-engagement-review-1440.png',
    remainingExternalBlocker: 'None',
  },
  'UCV2-44': {
    wave02Target: 'IN_SCOPE_PILLAR_B_HVU_ATTENDANCE_GOVERNANCE_AND_CORRECTION_REVIEW',
    statusAfterWave02: 'PASS_DISPOSABLE_E2E',
    routesEndpointsTables:
      '/academic/session-engagement | GET/POST /api/v2/session-engagement/reviews/correction/:id | W06Correction, W06Receipt',
    automatedTestProof:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Independent HVU approves learner attendance correction while preserving raw receipt immutability)',
    browserUiProof: '05-hvu-session-engagement-review-1440.png',
    remainingExternalBlocker: 'None',
  },
  'UCV2-46': {
    wave02Target: 'IN_SCOPE_PILLAR_D_W09_COMPLETION_POLICY_GOVERNANCE',
    statusAfterWave02: 'PASS_DISPOSABLE_E2E',
    routesEndpointsTables:
      '/workspace/certificates | GET /api/v2/certificates/workspace, POST /api/v2/certificates/policies, POST /api/v2/certificates/policies/:id/review | w09_completion_policies, w09_certificate_events',
    automatedTestProof:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar D: HVU Maker creates W09 policy with W03/W06/W07 criteria; self-approval blocked 403; independent HVU Checker approves 201)',
    browserUiProof: '07-hvu-certificates-workspace-1440.png',
    remainingExternalBlocker:
      'PO sign-off on production CourseVersion completion thresholds before enabling W09 in production',
  },
  'UCV2-47': {
    wave02Target: 'IN_SCOPE_PILLAR_D_W09_CERTIFICATE_REVIEW_ISSUANCE_REVOCATION_LOOKUP',
    statusAfterWave02: 'PASS_DISPOSABLE_E2E',
    routesEndpointsTables:
      '/workspace/certificates, /certificates/lookup | GET /api/v2/certificates/enrollments/:id/evaluate, POST /api/v2/certificates/reviews, POST /api/v2/certificates/issue, POST /api/v2/certificates/:id/revoke, GET /api/v2/certificates/lookup/:code | w09_certificate_reviews, w09_certificates, w09_certificate_events',
    automatedTestProof:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar D: W03+W06+W07 evaluation, ineligible learner blocked 409, maker-checker review->issue enforced 403/201, idempotent replay verified, revocation & lookup verified)',
    browserUiProof:
      '07-hvu-certificates-workspace-1440.png; 08-hv-completion-issued-certificate-1440.png; 09-certificate-lookup-verified-1440.png; 10-certificate-lookup-revoked-390.png',
    remainingExternalBlocker:
      'Production W09_ENABLED remains OFF; disposable certificates explicitly labeled TEST_DISPOSABLE',
  },
  'UCV2-48': {
    wave02Target: 'IN_SCOPE_PILLAR_C_HVU_DISPATCH_TEACHING_INSPECTOR',
    statusAfterWave02: 'PASS_DISPOSABLE_E2E',
    routesEndpointsTables:
      '/workspace/inspection | POST /api/v2/inspection/assignments | w08_assignment, w08_revision, w08_notification',
    automatedTestProof:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar C: HVU dispatches TT to valid session with approved Meet; concurrent overlapping shift dispatch returns [201, 409])',
    browserUiProof: '06-tt-inspection-workspace-1440.png',
    remainingExternalBlocker: 'None',
  },
  'UCV2-49': {
    wave02Target: 'IN_SCOPE_PILLAR_C_TT_VIEW_ASSIGNED_SHIFTS_AND_APPROVED_MEET',
    statusAfterWave02: 'PASS_DISPOSABLE_E2E',
    routesEndpointsTables:
      '/workspace/inspection | GET /api/v2/inspection, GET /api/v2/inspection/assignments/:id | w08_assignment',
    automatedTestProof:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar C: assigned TT sees approved Meet URL & shift details; foreign TT and ungranted HVU receive 404)',
    browserUiProof: '06-tt-inspection-workspace-1440.png',
    remainingExternalBlocker: 'None',
  },
  'UCV2-50': {
    wave02Target: 'IN_SCOPE_PILLAR_C_TT_OBSERVATION_SEGMENTS_AND_SUPERVISION_REPORT',
    statusAfterWave02: 'PASS_DISPOSABLE_E2E',
    routesEndpointsTables:
      '/workspace/inspection | POST /api/v2/inspection/assignments/:id/commands (START, STOP, REPORT, DISPUTE) | w08_segment, w08_report, w08_dispute',
    automatedTestProof:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar C: TT records server-clock START/STOP segment >=1s and submits REPORT with attestation TT-REPORTED; GV submits DISPUTE)',
    browserUiProof: '06-tt-inspection-workspace-1440.png',
    remainingExternalBlocker: 'None',
  },
  'UCV2-51': {
    wave02Target: 'IN_SCOPE_PILLAR_C_HVU_REVIEW_TEACHING_HOURS',
    statusAfterWave02: 'PASS_DISPOSABLE_E2E',
    routesEndpointsTables:
      '/workspace/inspection | POST /api/v2/inspection/assignments/:id/commands (REVIEW: APPROVE/PARTIAL/REJECT) | w08_decision',
    automatedTestProof:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar C: Independent HVU reviews TT-REPORTED evidence & GV dispute -> approves teaching hours without overwriting prior decision rows)',
    browserUiProof: '06-tt-inspection-workspace-1440.png',
    remainingExternalBlocker: 'None',
  },
  'UCV2-52': {
    wave02Target: 'IN_SCOPE_PILLAR_C_TT_SHIFT_CLOCK_IN_OUT_AND_CORRECTION',
    statusAfterWave02: 'PASS_DISPOSABLE_E2E',
    routesEndpointsTables:
      '/workspace/inspection | POST /api/v2/inspection/assignments/:id/commands (IN, OUT, CORRECTION, CORRECTION_REVIEW) | w08_clock, w08_correction, w08_correction_decision',
    automatedTestProof:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar C: TT clocks IN & OUT, submits WRONG_DEVICE correction, independent HVU reviews ACCEPT; GV cannot see TT personnel clocks)',
    browserUiProof: '06-tt-inspection-workspace-1440.png',
    remainingExternalBlocker: 'None',
  },
};

const outHeaders = [
  'UC_ID',
  'Name',
  'Actor',
  'Wave01_Before_Status',
  'Wave02_Target',
  'Wave02_After_Status',
  'Routes_Endpoints_Tables',
  'Automated_Test_Proof',
  'Browser_UI_Proof',
  'Remaining_External_Blocker',
];

const outRows = wave01Rows.map((r) => {
  const id = r.id;
  const upd = WAVE02_UPDATES[id];
  const beforeStatus = r.statusAfterWave01 || r.statusBeforeWave01 || 'PARTIAL';
  if (upd) {
    return {
      UC_ID: id,
      Name: r.name,
      Actor: r.actors,
      Wave01_Before_Status: beforeStatus,
      Wave02_Target: upd.wave02Target,
      Wave02_After_Status: upd.statusAfterWave02,
      Routes_Endpoints_Tables: upd.routesEndpointsTables,
      Automated_Test_Proof: upd.automatedTestProof,
      Browser_UI_Proof: upd.browserUiProof,
      Remaining_External_Blocker: upd.remainingExternalBlocker,
    };
  }
  return {
    UC_ID: id,
    Name: r.name,
    Actor: r.actors,
    Wave01_Before_Status: beforeStatus,
    Wave02_Target: 'OUT_OF_WAVE02_SCOPE_PRESERVED',
    Wave02_After_Status: beforeStatus,
    Routes_Endpoints_Tables: `${r.route} | ${r.api.slice(0, 180)} | ${r.actualDataSource}`,
    Automated_Test_Proof: r.evidence,
    Browser_UI_Proof: r.frontendStatus,
    Remaining_External_Blocker: r.externalDependency || r.whatRemains,
  };
});

const csvLines = [
  outHeaders.map(escapeCsv).join(','),
  ...outRows.map((row) => outHeaders.map((h) => escapeCsv(row[h])).join(',')),
];

writeFileSync(
  resolve('docs/v2/v2-road-to-99-argon-wave02/57_UC_DELTA_MATRIX.csv'),
  csvLines.join('\n') + '\n',
  'utf8',
);

const mdLines = [
  '# Ma Trận Đối Chiếu 57 Use Case — ROAD99 Argon Wave 02 (`57_UC_DELTA_MATRIX.md`)',
  '',
  '- **Ngày cập nhật**: `2026-11-09`',
  '- **Phạm vi Wave 02**: Giảng viên Session + 6-Type Activity Chooser chuẩn LMS IUH (`UCV2-29..37`), Học vụ Lịch học chính thức & Google Meet & Điểm danh (`UCV2-25, 26, 35, 36, 37, 39..44`), Thanh tra buổi học & Xác minh giờ giảng `W08` (`UCV2-48..52`), Chuẩn hoàn thành & Chứng chỉ có quản trị `W09` (`UCV2-28, 46, 47`), kèm khắc phục 3 điểm nhỏ tồn đọng từ Wave 01 (`UCV2-06`, `UCV2-27`).',
  '- **Tổng số Use Case**: `57` (`UCV2-01` .. `UCV2-57`).',
  '',
  '| UC_ID | Tên Use Case | Actor | Trạng thái sau Wave 01 | Mục tiêu Wave 02 | Trạng thái sau Wave 02 | Routes / Endpoints / Bảng | Bằng chứng Test Tự động | Bằng chứng Browser UI | Blocker Bên ngoài / Ghi chú |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...outRows.map((row) =>
    [
      `\`${row.UC_ID}\``,
      row.Name.replace(/\|/g, '\\|'),
      row.Actor.replace(/\|/g, '\\|'),
      `\`${row.Wave01_Before_Status}\``,
      `\`${row.Wave02_Target}\``,
      `\`${row.Wave02_After_Status}\``,
      row.Routes_Endpoints_Tables.replace(/\|/g, '/'),
      row.Automated_Test_Proof.replace(/\|/g, '/'),
      row.Browser_UI_Proof.replace(/\|/g, '/'),
      row.Remaining_External_Blocker.replace(/\|/g, '/'),
    ]
      .map((c) => ` ${c} `)
      .join('|')
      .replace(/^/, '|')
      .replace(/$/, '|'),
  ),
  '',
];

writeFileSync(
  resolve('docs/v2/v2-road-to-99-argon-wave02/57_UC_DELTA_MATRIX.md'),
  mdLines.join('\n'),
  'utf8',
);

console.log(`Generated 57_UC_DELTA_MATRIX.csv and 57_UC_DELTA_MATRIX.md with ${outRows.length} rows.`);
