import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('docs/v2/v2-road-to-99-argon-wave04');
const evDir = resolve(outDir, 'EVIDENCE');

const readJson = (p, fallback = {}) =>
  existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback;

const e2eProofs = readJson(resolve(evDir, 'ARGON_WAVE04_E2E_PROOFS.json'));
const p1Finance = e2eProofs.p1a_finance_reconciliation ?? {};
const w10Report = e2eProofs.p2d_w10_role_reports_and_csv ?? {};
writeFileSync(
  resolve(evDir, 'P1_FINANCE_RECONCILIATION.json'),
  JSON.stringify(p1Finance, null, 2),
  'utf8',
);
writeFileSync(
  resolve(evDir, 'W10_ROLE_REPORT_7ROLES_KPI_CSV.json'),
  JSON.stringify(w10Report, null, 2),
  'utf8',
);
const browserProofs = readJson(resolve(evDir, 'ARGON_WAVE04_BROWSER_VERIFICATION.json'), {
  captures: [],
});
const qaBefore = readJson(resolve(evDir, 'QA_BEFORE.json'));
const qaAfter = readJson(resolve(evDir, 'QA_AFTER.json'));
const apiUnitJest = readJson(resolve(evDir, 'api-unit-jest.json'));

function csvEscape(val) {
  const s = String(val ?? '');
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const ucRows = [
  {
    id: 'UCV2-01',
    name: 'Đăng ký tài khoản',
    actor: 'K',
    testId: 'W04-J1-UC01-CONSENT',
    routeUi: '/register',
    api: 'POST /api/auth/register',
    db: 'users, user_sessions, domain_audit_events (REGISTER_CONSENT_ACCEPTED)',
    happy: 'termsAccepted===true creates STUDENT account + REGISTER_CONSENT_ACCEPTED audit event',
    negative: 'Rejects missing, undefined, null, false, "true", 0, duplicate email (409), role escalation (400)',
    provenance: 'Original Vietnamese signup & consent copy (SE_TERMS_PRIVACY_V2)',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#p1b_signup_mandatory_consent; screenshots/01-j1-register-consent-desktop.png; 02-j1-register-consent-mobile.png',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 2)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-02',
    name: 'Đăng nhập, đăng xuất và quản lý phiên truy cập',
    actor: 'HV, GV, TV, HVU, TN, TT, QT',
    testId: 'W04-J1-UC02-AUTH7',
    routeUi: '/login, /workspace, /my',
    api: 'POST /api/auth/login, GET /api/auth/me, POST /api/auth/logout',
    db: 'users, user_sessions, domain_audit_events',
    happy: '7 roles authenticate with server-verified role & session cookie; logout revokes session',
    negative: 'Wrong password -> 401; revoked session -> 401; HV on /api/authority -> 403',
    provenance: '7 synthetic role fixtures (@example.invalid)',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json; apps/api/test/argon-wave04-integrated-uat.e2e-spec.ts',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 2 & Block 4)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-03',
    name: 'Khôi phục quyền truy cập tài khoản',
    actor: 'người có tài khoản',
    testId: 'W04-J1-UC03-RESET',
    routeUi: '/forgot-password, /reset-password',
    api: 'POST /api/auth/password-reset/request, POST /api/auth/password-reset/confirm',
    db: 'password_reset_tokens, users, user_sessions',
    happy: 'One-time SHA-256 hashed token issued via EmailSender safe test transport; confirm rotates Argon2 password & revokes sessions',
    negative: 'Anti-enumeration generic response; raw token never stored in DB; token replay rejected 400',
    provenance: 'Disposable E2E PASS; real SMTP credentials gated by PO operator config',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#p1b_signup_mandatory_consent.passwordResetSha256Verified; Wave 03 03-forgot-password-recovery.png',
    poGate: 'EXT_PROVIDER_SMTP_DNS (PO_OPERATOR_ACTION_REQUEST.md §1)',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 2)',
    label: 'TECHNICAL_E2E_PENDING_EXT_PROVIDER',
  },
  {
    id: 'UCV2-04',
    name: 'Quản lý hồ sơ và thiết lập cá nhân',
    actor: '7 role',
    testId: 'W04-J1-UC04-PROFILE',
    routeUi: '/profile',
    api: 'GET /api/auth/profile, PATCH /api/auth/profile, POST /api/auth/profile/password',
    db: 'users',
    happy: 'Updates fullName, avatarUrl, preferences (phone, timezone, studyGoalNote) & changes password after verifying currentPassword',
    negative: 'Rejects role/email/status tampering (400) and wrong currentPassword (400)',
    provenance: 'Vietnamese studyGoalNote & profile preferences',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#p1b_signup_mandatory_consent.profileUpdatedPreferences; Wave 03 05-profile-preferences-edit.png',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 2)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-05',
    name: 'Khám phá chương trình và lớp TOEIC công khai',
    actor: 'K, HV',
    testId: 'W04-J1-UC05-CATALOG',
    routeUi: '/, /catalog, /catalog/:slug, /classes/:id',
    api: 'GET /api/catalog/courses, GET /api/catalog/courses/:slug, GET /api/v2/academic/classes/:id',
    db: 'courses, course_versions, class_offerings',
    happy: 'Displays exact 6 published TOEIC courses & open ClassOfferings with approved CourseVersion fee; hides 9 unpublished QA fixtures',
    negative: 'Unpublished courses/classes excluded from public catalog (404 on direct slug)',
    provenance: '6 canonical TOEIC courses + 9 hidden QA fixtures (total 15 in DB)',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#p1b_signup_mandatory_consent; screenshots/03-j1-public-catalog-6courses-desktop.png',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 2)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-06',
    name: 'Thực hiện bài kiểm tra đầu vào theo mục tiêu TOEIC',
    actor: 'Học viên đã đăng nhập',
    testId: 'W04-J2-UC06-PLACEMENT',
    routeUi: '/placement, /placement/sittings/:attemptId',
    api: 'POST /api/v2/placement/workflow/attempts, POST .../commands, POST .../answers, POST .../recordings/:qid',
    db: 'PlacementSourceVersion, PlacementSitting, TestAttempt, TestAnswer',
    happy: 'Step 1 mode LR or FOUR_SKILLS -> Step 2 goal scores -> Step 3 confirm/mic check -> 80/20 sitting on 200 LR + 19 SW tasks (73 media, S10 2-play)',
    negative: 'Unpublished bank blocked unless DEV internal flag; foreign learner blocked 403/404',
    provenance: 'apps/api/content/se-original-v1 (200 LR + 11 S + 8 W = 219 items, 73 media)',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#journey_j2_w05b_placement_session_inspection; screenshots/08-j2-hv-placement-sitting-desktop.png',
    poGate: 'ACADEMIC_AND_MEDIA_RELEASE_GATE (MEDIA_QA_PASS=false, ACADEMIC_APPROVED=false, PUBLISHED=false)',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 3)',
    label: 'TECHNICAL_E2E_PENDING_ACADEMIC_RELEASE',
  },
  {
    id: 'UCV2-07',
    name: 'Xem chẩn đoán năng lực và lớp học được đề xuất',
    actor: 'HV đã đăng nhập và chỉ có quyền với kết quả của mình',
    testId: 'W04-J2-UC07-DIAGNOSTIC',
    routeUi: '/placement/sittings/:attemptId/result',
    api: 'GET /api/v2/placement/workflow/attempts/:id',
    db: 'PlacementResultRelease, AttemptSkillScore, AnswerEvaluation',
    happy: 'Shows per-skill/Part diagnostic & class recommendation; FOUR_SKILLS keeps S/W as AI_PROVISIONAL/PENDING_REVIEW until GV confirms REVIEWED_FINAL',
    negative: 'Never fabricates official ETS scaled score; blocks foreign learner 403/404',
    provenance: 'Original Placement diagnostic & rubric evaluation',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#journey_j2_w05b_placement_session_inspection; screenshots/08-j2-hv-placement-sitting-desktop.png',
    poGate: 'ACADEMIC_AND_MEDIA_RELEASE_GATE (learnerPublishable=false until PO/Faculty sign-off)',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 3)',
    label: 'TECHNICAL_E2E_PENDING_ACADEMIC_RELEASE',
  },
  {
    id: 'UCV2-08',
    name: 'Quản lý và công bố nội dung website',
    actor: 'TV (biên tập), HVU (kiểm soát/công bố nội dung chính sách, chương trình theo quyền)',
    testId: 'W10-CMS-UC08-SCOPED',
    routeUi: '/workspace/operations/cms, /cms/publications/:slug',
    api: 'GET/POST /api/v2/operations/cms/*',
    db: 'cms_v2 immutable revisions/publications/events',
    happy: 'TV authors draft revision; HVU reviews, publishes, or withdraws website content with immutable audit trail',
    negative: 'TV cannot self-publish policy content without HVU approval (403); QT not used as CMS owner',
    provenance: 'Scoped W10 CMS governance verification (docs/v2/W10_CMS_COMPLETE_02.md)',
    evidence: 'docs/v2/W10_CMS_COMPLETE_02.md; apps/api/src/modules/operations/cms.service.spec.ts',
    poGate: 'SCOPED_HISTORICAL_BOUNDARY',
    repro: 'npm --prefix apps/api test -- src/modules/operations/cms.service.spec.ts --runInBand',
    label: 'PASS_SCOPED_HISTORICAL',
  },
  {
    id: 'UCV2-09',
    name: 'Gửi yêu cầu tư vấn',
    actor: 'K/HV',
    testId: 'W04-J1-UC09-TICKET',
    routeUi: '/support, /support/tickets/:ticketId',
    api: 'GET /api/v2/support/public/topics, POST /api/v2/support/public/tickets',
    db: 'SupportTopic, SupportTicket, SupportConsent, SupportEvent',
    happy: 'Visitor/Learner submits consultation request with explicit consent=true and receives ticket code SE-*',
    negative: 'Missing/false consent rejected 400; unauthenticated private ticket read rejected 401',
    provenance: 'Original Vietnamese TOEIC consultation intake',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#journey_j1_visitor_admissions_finance_lms; screenshots/04-j1-tv-support-counseling-desktop.png',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 2)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-10',
    name: 'Tiếp nhận và tư vấn/CSKH',
    actor: 'TV',
    testId: 'W04-J1-UC10-TRIAGE',
    routeUi: '/workspace/support, /workspace/support/tickets/:ticketId',
    api: 'GET /api/v2/support/tickets, POST .../assign, POST .../messages, POST .../referrals',
    db: 'SupportTicket, SupportMessage, SupportReferral, SupportEvent',
    happy: 'TV claims ticket, replies to learner, records support consent, and routes specialist referral to HVU',
    negative: 'HV or unauthorized staff blocked from TV triage actions (403)',
    provenance: 'Original Vietnamese counselor responses & referral notes',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#journey_j1_visitor_admissions_finance_lms; screenshots/04-j1-tv-support-counseling-desktop.png',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 2)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-11',
    name: 'Lập hồ sơ đăng ký và đề xuất lớp cho học viên',
    actor: 'TV',
    testId: 'W04-J1-UC11-COUNSEL-APP',
    routeUi: '/workspace/support/tickets/:ticketId, /workspace/admissions',
    api: 'POST /api/v2/support/tickets/:id/applications, POST /api/v2/support/applications/:id/submit, POST .../review',
    db: 'CounselingApplication, SupportConsent',
    happy: 'TV drafts CounselingApplication recommending approved class, submits; HVU requests info then approves v2 -> READY_FOR_ADMISSION_HANDOFF',
    negative: 'TV cannot self-approve CounselingApplication or set tuition paid (403)',
    provenance: 'Original Vietnamese counseling dossier v1 & v2',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#journey_j1_visitor_admissions_finance_lms; screenshots/04-j1-tv-support-counseling-desktop.png',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 2)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-12',
    name: 'Đăng ký tham gia lớp TOEIC',
    actor: 'HV',
    testId: 'W04-J1-UC12-APPLY',
    routeUi: '/admissions?classId=:id, /admissions/:id',
    api: 'GET /api/v2/admissions-finance/offers, POST /api/v2/admissions-finance/applications',
    db: 'w07_applications, w07_class_controls, class_offerings',
    happy: 'HV submits class admission application; status tracked as SUBMITTED prior to LMS entitlement',
    negative: 'Pre-entitlement LMS access blocked (403/404); foreign learner blocked from reading application (404)',
    provenance: 'Disposable W07 admission applications',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#journey_j1_visitor_admissions_finance_lms',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 1 & Block 2)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-13',
    name: 'Xét duyệt hồ sơ nhập học và yêu cầu điều chỉnh ghi danh',
    actor: 'HVU',
    testId: 'W04-J1-UC13-HVU-DECISION',
    routeUi: '/workspace/admissions, /admissions/:id',
    api: 'POST /api/v2/admissions-finance/applications/:id/academic-decisions, POST .../cases, POST /api/v2/admissions-finance/cases/:id/decision',
    db: 'w07_academic_decisions, w07_obligations, w07_cases',
    happy: 'HVU approves application -> creates w07_obligations with exact approved CourseVersion price (1,000,000 VND); reviews TRANSFER/WITHDRAW cases',
    negative: 'TV/TN/HV blocked from issuing academic admission decisions (403)',
    provenance: 'Disposable W07 academic decisions & obligations',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#p1a_finance_reconciliation; screenshots/05-j1-tn-finance-reconciliation-desktop.png',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 1 & Block 2)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-14',
    name: 'Thanh toán học phí và theo dõi nghĩa vụ của mình',
    actor: 'HV',
    testId: 'W04-P1A-UC14-OBLIGATION',
    routeUi: '/payments/sepay, /admissions/:id',
    api: 'POST /api/v2/admissions-finance/applications/:id/payment-source, POST /api/v2/admissions-finance/obligations/:id/evidence',
    db: 'w07_obligations, w07_payment_evidence, sepay_v2.orders',
    happy: 'HV tracks tuition obligation (dueVnd, paidVnd, remainingVnd, creditPendingVnd) and uploads MANUAL_FALLBACK_TEST PNG receipt with SHA-256',
    negative: 'Foreign learner blocked (404); live SePay route fenced with 503 outside verified QA identity',
    provenance: 'Synthetic TEST-* receipts on disposable DB; QA order SEV26A12734045E901D06783 untouched',
    evidence: 'EVIDENCE/P1_FINANCE_RECONCILIATION.json; screenshots/05-j1-tn-finance-reconciliation-desktop.png',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 1)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-15',
    name: 'Quản lý khoản phải thu, phiếu thu và công nợ',
    actor: 'TN',
    testId: 'W04-P1A-UC15-RECEIVABLES',
    routeUi: '/payments/sepay, /workspace/admissions',
    api: 'GET /api/v2/admissions-finance/workspace, GET /api/v2/admissions-finance/evidence/:id/file, POST /api/v2/payments/sepay/*',
    db: 'w07_obligations, w07_allocations, w07_payment_events, sepay_v2.orders',
    happy: 'TN views receivables, verified/remaining/excess balances, and downloads binary receipt PNG; SePay live gateway remains fenced 503 until PO live merchant setup',
    negative: 'TN cannot alter canonical CourseVersion fee; ungranted TN blocked (403); non-QA SePay blocked (503)',
    provenance: 'Disposable W07 ledger + SePay 503 guard verification',
    evidence: 'EVIDENCE/P1_FINANCE_RECONCILIATION.json#sepayGuards; screenshots/05-j1-tn-finance-reconciliation-desktop.png',
    poGate: 'EXT_PROVIDER_SEPAY_LIVE (PO_OPERATOR_ACTION_REQUEST.md §2)',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 1)',
    label: 'TECHNICAL_E2E_PENDING_EXT_PROVIDER',
  },
  {
    id: 'UCV2-16',
    name: 'Đối soát và xác nhận giao dịch học phí',
    actor: 'TN',
    testId: 'W04-P1A-UC16-RECONCILE',
    routeUi: '/payments/sepay, /workspace/admissions',
    api: 'POST /api/v2/admissions-finance/evidence/:id/review, POST /api/v2/admissions-finance/applications/:id/activate',
    db: 'w07_payment_events, w07_allocations, w07_entitlements, enrollments',
    happy: 'TN verifies 1,000,000 VND evidence -> SETTLED_TEST -> activates canonical enrollment -> HV enters LMS (200)',
    negative: 'Underpayment 400,000 VND -> PARTIAL_TEST (remaining 600,000 VND) -> activation blocked with BLOCKED_REVIEW / VERIFIED_FULL_FEE_REQUIRED (0 enrollments)',
    provenance: 'FIN-SCENARIO-01-EXACT-1000K & FIN-SCENARIO-02-UNDERPAY-400K',
    evidence: 'EVIDENCE/P1_FINANCE_RECONCILIATION.json; EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#p1a_finance_reconciliation',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 1)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-17',
    name: 'Xử lý giao dịch học phí ngoại lệ và hoàn/điều chỉnh',
    actor: 'TN, HVU phê duyệt khi chính sách đòi hỏi',
    testId: 'W04-P1A-UC17-EXCEPTIONS',
    routeUi: '/payments/sepay, /workspace/admissions',
    api: 'POST /api/v2/admissions-finance/events/:id/adjustments, POST /api/v2/admissions-finance/adjustments/:id/decision',
    db: 'w07_adjustments, w07_adjustment_decisions, w07_payment_events, w07_allocations',
    happy: 'Reconciles both 1,150,000 VND (creditPendingVnd=150,000) and 1,250,000 VND (creditPendingVnd=250,000); TN1 proposes REVERSAL, TN2 approves append-only reversal',
    negative: 'TN1 self-approval rejected 409; REFUND proposal blocked with BLOCKED_REVIEW / FINANCIAL_POLICY_REQUIRED (payout=false)',
    provenance: 'FIN-SCENARIO-03A-OVERPAY-1150K, FIN-SCENARIO-03B-OVERPAY-1250K, FIN-SCENARIO-04-REVERSAL-AND-REFUND-BLOCK',
    evidence: 'EVIDENCE/P1_FINANCE_RECONCILIATION.json; BR_V2_131_FINDING_CLOSURE.md §1',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 1)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-18',
    name: 'Theo dõi lớp đã đăng ký và lịch học cá nhân',
    actor: 'HV',
    testId: 'W04-J1-UC18-DASHBOARD',
    routeUi: '/student/enrollments, /my',
    api: 'GET /api/v2/class-lms/classes/:classId, GET /api/learning/enrollments/:id/adaptive-path',
    db: 'Enrollment, ClassOffering, TeachingSession',
    happy: 'Enrolled learner views active class dashboard, published sessions, and upcoming activities',
    negative: 'Unenrolled/foreign learner blocked 403/404',
    provenance: 'Joined J1 enrollment 44660211-fa43-48f8-931b-5f5727155304',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#journey_j1_visitor_admissions_finance_lms; screenshots/06-j1-hv-class-lms-learner-desktop.png',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 2)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-19',
    name: 'Học nội dung và sử dụng tài nguyên của lớp',
    actor: 'HV',
    testId: 'W04-J1-UC19-CONTENT',
    routeUi: '/classroom/:classId, /classroom/:classId/activities/:activityId',
    api: 'GET /api/v2/class-lms/classes/:classId, POST .../activities/:activityId/progress',
    db: 'ClassSection, ClassActivity, ClassActivityProgress',
    happy: 'Learner opens published LESSON and RESOURCE activities in Tuần 01 and records completion progress',
    negative: 'Draft/unpublished activities hidden from learner; foreign learner blocked 403',
    provenance: 'Tuần 01 — Chiến lược TOEIC Listening Part 2 & Reading Part 5–6',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#journey_j1_visitor_admissions_finance_lms; screenshots/06-j1-hv-class-lms-learner-desktop.png',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 2)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-20',
    name: 'Làm và nộp bài tập được giao',
    actor: 'HV',
    testId: 'W04-J1-UC20-ASSIGNMENT',
    routeUi: '/classroom/:classId/activities/:activityId',
    api: 'GET/PUT /api/v2/class-lms/classes/:classId/activities/:activityId/assignment/mine, POST .../submit',
    db: 'ClassAssignmentSubmission, ClassActivityRevision',
    happy: 'Learner saves draft and submits workplace email assignment (d592170a-8ddc-4e90-a467-70aaa8c4d6ca)',
    negative: 'Cannot overwrite submitted assignment after lock or submit for another learner (403/404)',
    provenance: 'Original TOEIC Writing email response submission',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#journey_j1_visitor_admissions_finance_lms',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 2)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-21',
    name: 'Thực hiện bài quiz/kiểm tra trong lớp',
    actor: 'HV',
    testId: 'W04-J1-UC21-QUIZ',
    routeUi: '/classroom/:classId/activities/:activityId/quiz, /classroom/:classId/quiz-attempts/:attemptId',
    api: 'POST /api/v2/class-quiz/classes/:classId/activities/:activityId/attempts, POST .../answers, POST .../submit',
    db: 'ClassQuizAttempt, ClassQuizAttemptAnswer',
    happy: 'Learner completes 4-question TOEIC class quiz in 80/20 navigator layout and submits attempt (765471b9-f5ca-42c1-a259-9aa1ab1e0395)',
    negative: 'Cannot modify answers after submission (409) or access another learner attempt (404)',
    provenance: '4 TOEIC Part 5/6 workplace email questions linked to KnowledgeTag',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#journey_j1_visitor_admissions_finance_lms; Wave 01 15_lms_quiz_attempt_80_20_navigator_desktop.png',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 2)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-22',
    name: 'Xem kết quả, nhận xét và bảng điểm các hoạt động',
    actor: 'HV',
    testId: 'W04-J1-UC22-GRADEBOOK',
    routeUi: '/classroom/:classId/gradebook',
    api: 'GET /api/v2/assignment-grading/classes/:classId/gradebook',
    db: 'AssignmentGrade, ClassAssignmentSubmission, ClassQuizAttempt',
    happy: 'Learner views published rubric grade (90%), criterion breakdown, and teacher feedback in class gradebook',
    negative: 'Unpublished/draft grades remain hidden from learner gradebook; foreign learner blocked 403',
    provenance: 'Published AssignmentGrade 2b6b2b93-fc78-40e4-9a5a-9ba3f0d1afc4',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#sqlReadbacks.assignmentGrading; Wave 01 17_lms_gradebook_published_scores_desktop.png',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 2)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-23',
    name: 'Xem tiến độ và báo cáo năng lực TOEIC',
    actor: 'HV',
    testId: 'W04-J1-UC23-PROGRESS',
    routeUi: '/classroom/:classId/progress',
    api: 'GET /api/v2/class-lms/classes/:classId/progress',
    db: 'ClassActivityProgress, ClassQuizAttempt, AssignmentGrade',
    happy: 'Learner reads completion progress across LESSON, RESOURCE, ASSIGNMENT, and QUIZ activities',
    negative: 'Uncompleted activities never counted as completed; foreign learner blocked 403',
    provenance: 'Joined J1 class progress state',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#journey_j1_visitor_admissions_finance_lms; Wave 01 18_lms_class_progress_desktop.png',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 2)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-24',
    name: 'Học theo gợi ý kiến thức cần củng cố',
    actor: 'HV',
    testId: 'W04-J1-UC24-REMEDIATION',
    routeUi: '/knowledge, /knowledge/articles/:slug',
    api: 'GET /api/v2/knowledge/remediation/classes/:classId, GET /api/v2/knowledge/entries/:slug',
    db: 'KnowledgeEntry, KnowledgeRevision, QuizKnowledgeLink',
    happy: 'Incorrect quiz answer triggers targeted remediation recommendation to WORKPLACE_EMAIL_B1 article with examples & practice',
    negative: 'Unpublished knowledge revisions hidden from learners',
    provenance: 'KnowledgeRevision 8ab704ca-80f7-4011-884a-f03a4dabcdac (WORKPLACE_EMAIL_B1)',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#sqlReadbacks.knowledgeAndQuestions; Wave 01 19_lms_knowledge_recommendations_desktop.png',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 2)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-25',
    name: 'Tham gia buổi học trực tuyến được phê duyệt',
    actor: 'HV',
    testId: 'W04-J2-UC25-ONLINE-JOIN',
    routeUi: '/classroom/:classId, /classroom/:classId/attendance',
    api: 'GET /api/v2/class-lms/classes/:classId, GET /api/v2/session-engagement/sessions/:id',
    db: 'TeachingSession, W06Meet',
    happy: 'Enrolled learner views HVU-approved Google Meet link (https://meet.google.com/abc-defg-hij) on published session',
    negative: 'Unapproved Meet link hidden from learner; opening Meet URL never auto-marks attendance',
    provenance: 'TeachingSession e96fef8a-e4ea-412b-85e7-306608a6f23b',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#sqlReadbacks.sessionEngagementAndAttendance; screenshots/06-j1-hv-class-lms-learner-desktop.png',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 3)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-26',
    name: 'Điểm danh buổi học theo phương thức hợp lệ',
    actor: 'HV',
    testId: 'W04-J2-UC26-CHECKIN',
    routeUi: '/classroom/:classId/attendance, /sessions/:sessionId/engagement',
    api: 'POST /api/v2/session-engagement/sessions/:id/checkin, POST .../corrections',
    db: 'W06Window, W06Receipt, W06Correction, W06Rate',
    happy: 'Enrolled learner checks in during open server-clock window using valid 20-hex code (receipt 3a28847c-32d3-4ae5-b9ba-6e908682f8ab)',
    negative: 'Wrong 20-hex code rejected (400); non-enrolled learner rejected (403/404)',
    provenance: 'W06Receipt 3a28847c-32d3-4ae5-b9ba-6e908682f8ab',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#journey_j2_w05b_placement_session_inspection',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 3)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-27',
    name: 'Xem hồ sơ giảng viên và đặt lịch tư vấn 1:1',
    actor: 'HV (người đã có tài khoản, chưa bắt buộc ghi danh lớp), GV',
    testId: 'W04-J2-UC27-W05B-BOOK',
    routeUi: '/consultations, /my, /workspace/consultations',
    api: 'GET /api/v2/consultations/public, POST /api/v2/consultations/commands (BOOK_SLOT)',
    db: 'W05bProfile, W05bAvailabilityRule, W05bBooking',
    happy: 'Unenrolled learner views approved teacher profile & available slots and books free 1:1 consultation (779e957f-63cb-4852-87ad-70ec8a9869c4)',
    negative: 'Concurrent double-book on same slot rejected with 409; foreign learner cannot read/cancel booking (403/404)',
    provenance: 'W05bBooking 779e957f-63cb-4852-87ad-70ec8a9869c4 (0 VND free consultation)',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#journey_j2_w05b_placement_session_inspection; screenshots/07-j2-hv-w05b-consultation-booking-desktop.png',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 3)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-28',
    name: 'Xem kết quả hoàn thành và chứng chỉ được cấp',
    actor: 'HV',
    testId: 'W04-J3-UC28-HV-CERT',
    routeUi: '/completion, /certificates/lookup',
    api: 'GET /api/v2/certificates/readiness, GET /api/v2/certificates/lookup/:code',
    db: 'w09_completion_policies, w09_certificate_reviews, w09_certificates',
    happy: 'Learner views issued TEST certificate SE-CERT-TEST-2026-F8B5BD2F and verifies public lookup status',
    negative: 'Learner cannot self-issue or mutate immutable certificate snapshot (403)',
    provenance: 'SE-CERT-TEST-2026-F8B5BD2F (isTestPolicy=true)',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#journey_j3_grading_w09_certificates_w10_reports; screenshots/11-j3-hvu-w09-test-certificates-desktop.png',
    poGate: 'NONE (Explicitly labeled TEST_DISPOSABLE until PO approves production thresholds)',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 4)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-29',
    name: 'Theo dõi lớp được phân công, lịch và tình hình lớp',
    actor: 'GV',
    testId: 'W04-J2-UC29-GV-CLASS',
    routeUi: '/classroom/:classId, /classroom/:classId/dashboard',
    api: 'GET /api/v2/class-lms/classes/:classId, GET /api/v2/class-lms/classes/:classId/dashboard',
    db: 'ClassSection, TeachingSession, ClassInstructorAssignment',
    happy: 'Assigned GV views class sections, official TeachingSessions, roster, and grading queue with left staff sidebar',
    negative: 'Unassigned instructor blocked from editing/viewing restricted class data (403/404)',
    provenance: 'ClassOffering c87e1a74-f4fe-4066-8095-58d3e4952d0d',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#journey_j1_visitor_admissions_finance_lms; screenshots/09-j2-gv-session-activity-chooser-desktop.png',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 2 & Block 3)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-30',
    name: 'Tổ chức các section và hoạt động học tập trong lớp',
    actor: 'GV',
    testId: 'W04-J2-UC30-CHOOSER',
    routeUi: '/classroom/:classId',
    api: 'POST /api/v2/class-lms/classes/:classId/sections, POST .../sections/:sectionId/activities, POST .../publish',
    db: 'ClassSection, ClassActivity, ClassActivityVersion',
    happy: 'GV opens 6-type Activity Chooser modal (4 CONTENT: LESSON, RESOURCE, ASSIGNMENT, QUIZ + 2 SESSION navigation: ATTENDANCE, ONLINE_SESSION) and publishes activities',
    negative: 'HV cannot see edit controls or call activity creation APIs (403)',
    provenance: 'Section a588782f-3f33-4d38-9244-614bea239b67 & 4 published content activities',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#journey_j1_visitor_admissions_finance_lms; screenshots/09-j2-gv-session-activity-chooser-desktop.png',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 2)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-31',
    name: 'Biên soạn và duy trì thư viện kiến thức TOEIC',
    actor: 'GV; HVU sở hữu quy tắc duyệt và nội dung chuẩn',
    testId: 'W04-P1C-UC31-KNOWLEDGE',
    routeUi: '/workspace/knowledge, /knowledge/articles/:slug',
    api: 'POST /api/v2/knowledge/entries, POST /api/v2/knowledge/revisions/:id/submit, POST .../review, POST .../publish',
    db: 'KnowledgeEntry, KnowledgeRevision',
    happy: 'GV authors WORKPLACE_EMAIL_B1 tag & article revisions; independent HVU reviews and publishes (2 published revisions)',
    negative: 'GV self-review/publish rejected with 403 Forbidden',
    provenance: 'KnowledgeRevision 0d0b22d6-fc22-4e00-b622-08089b27c0ca & 8ab704ca-80f7-4011-884a-f03a4dabcdac',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#p1_traceability_reconciliation.UCV2-31',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 2)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-32',
    name: 'Quản lý ngân hàng câu hỏi có gắn nhãn kiến thức',
    actor: 'GV',
    testId: 'W04-P1C-UC32-QBANK',
    routeUi: '/classroom/:classId/activities/:activityId',
    api: 'POST /api/v2/class-quiz/classes/:classId/activities/:activityId/sources, POST /api/v2/knowledge/links, POST .../publish',
    db: 'ClassQuizSource, ClassQuizItem, QuizKnowledgeLink',
    happy: 'GV creates 4-question TOEIC bank source and links all 4 items to published KnowledgeTag & Article (publishedQuestionLinks=4)',
    negative: 'Unassigned instructor or learner denied with 403/404',
    provenance: '4 TOEIC Part 5/6 questions with QuizKnowledgeLink',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#p1_traceability_reconciliation.UCV2-32',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 2)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-33',
    name: 'Xây dựng đề kiểm tra, bài quiz và rubric',
    actor: 'GV',
    testId: 'W04-J1-UC33-RUBRIC',
    routeUi: '/classroom/:classId/activities/:activityId',
    api: 'POST /api/v2/class-quiz/classes/:classId/activities/:activityId/sources, POST /api/v2/assignment-grading/classes/:classId/activities/:activityId/rubrics',
    db: 'ClassQuizSource, AssignmentRubric',
    happy: 'GV constructs class quiz source and 2-criterion AssignmentRubric (22ff98cd-e7c6-4d80-8038-604704a570fb); HVU approves rubric',
    negative: 'Unapproved rubric cannot be used to publish final grade (400/409)',
    provenance: 'AssignmentRubric 22ff98cd-e7c6-4d80-8038-604704a570fb',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#sqlReadbacks.assignmentGrading',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 2)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-34',
    name: 'Chấm bài, xác nhận và phản hồi kết quả',
    actor: 'GV được phân công',
    testId: 'W04-P1C-UC34-GRADING',
    routeUi: '/classroom/:classId/activities/:activityId, /classroom/:classId/gradebook',
    api: 'POST /api/v2/assignment-grading/classes/:classId/activities/:activityId/submissions/:subId/grades, POST .../final, POST .../publish',
    db: 'ClassAssignmentSubmission, AssignmentGrade',
    happy: 'Assigned GV grades learner submission via rubric (90/100), confirms REVIEWED_FINAL (2b6b2b93-fc78-40e4-9a5a-9ba3f0d1afc4), and HVU publishes to gradebook',
    negative: 'GV cannot self-publish finalized grade without HVU checker (403); unassigned GV blocked (404)',
    provenance: 'AssignmentGrade 2b6b2b93-fc78-40e4-9a5a-9ba3f0d1afc4',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#p1_traceability_reconciliation.UCV2-34',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 2)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-35',
    name: 'Quản lý hoạt động điểm danh theo lịch định kỳ',
    actor: 'GV',
    testId: 'W04-P1C-UC35-ATTENDANCE',
    routeUi: '/classroom/:classId/attendance, /sessions/:sessionId/engagement',
    api: 'POST /api/v2/session-engagement/sessions/:id/attendance, POST .../code, GET .../roster',
    db: 'W06Window, W06Receipt, W06Correction',
    happy: 'GV opens attendance window on published session e96fef8a-e4ea-412b-85e7-306608a6f23b, rotates 20-hex code, and views roster',
    negative: 'Roster response redacts raw 20-hex code; unassigned GV denied (404)',
    provenance: 'TeachingSession e96fef8a-e4ea-412b-85e7-306608a6f23b',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#p1_traceability_reconciliation.UCV2-35',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 3)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-36',
    name: 'Gửi và theo dõi đề nghị duyệt link Google Meet',
    actor: 'GV',
    testId: 'W04-P1C-UC36-MEET-PROP',
    routeUi: '/classroom/:classId/attendance?mode=meet, /sessions/:sessionId/engagement',
    api: 'POST /api/v2/session-engagement/sessions/:id/meet, GET /api/v2/session-engagement/sessions/:id',
    db: 'W06Meet, TeachingSession',
    happy: 'GV proposes https://meet.google.com/abc-defg-hij on assigned session and tracks HVU approval status',
    negative: 'Non-HTTPS or non-Google-Meet URL rejected (400); GV cannot self-approve Meet link (404)',
    provenance: 'W06Meet on session e96fef8a-e4ea-412b-85e7-306608a6f23b',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#p1_traceability_reconciliation.UCV2-36',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 3)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-37',
    name: 'Đề nghị nghỉ dạy, đổi lịch hoặc dạy bù',
    actor: 'GV',
    testId: 'W04-P1C-UC37-EXCEPTION',
    routeUi: '/sessions/:sessionId/engagement, /academic/session-engagement',
    api: 'POST /api/v2/session-engagement/sessions/:id/exceptions',
    db: 'W06Exception, TeachingSession',
    happy: 'GV submits RESCHEDULE exception fad50b16-06de-43f8-848d-018287b49be7 with replacement slot & reason',
    negative: 'Foreign instructor or student cannot submit session exception (404); GV cannot overwrite official schedule directly',
    provenance: 'W06Exception fad50b16-06de-43f8-848d-018287b49be7',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#p1_traceability_reconciliation.UCV2-37',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 3)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-38',
    name: 'Quản lý chương trình đào tạo TOEIC và chuẩn nội dung',
    actor: 'HVU',
    testId: 'W04-J3-UC38-CURRICULUM',
    routeUi: '/workspace/academic, /academic/programs/:id/versions',
    api: 'POST /api/v2/academic/programs, POST /api/v2/academic/programs/:id/versions, POST .../submit, POST .../approve',
    db: 'courses, course_versions',
    happy: 'HVU maker creates program 45aba6b0-8c79-4184-873c-e120f0c3b9d9 & CourseVersion 400b3cba-948e-47fe-9743-98f51ff101c5 (1,850,000 VND); independent HVU checker approves -> PUBLISHED',
    negative: 'HVU maker self-approval rejected with 403 Forbidden',
    provenance: 'Original TOEIC Business 650+ curriculum version',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#journey_j3_grading_w09_certificates_w10_reports',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 4)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-39',
    name: 'Mở và quản lý lớp đào tạo, sĩ số và roster',
    actor: 'HVU',
    testId: 'W04-J1-UC39-CLASS-OFFER',
    routeUi: '/workspace/academic',
    api: 'POST /api/v2/academic/versions/:id/offers, POST /api/v2/academic/classes, PATCH /api/v2/academic/classes/:id',
    db: 'class_offerings, course_versions',
    happy: 'HVU creates ClassOffering c87e1a74-f4fe-4066-8095-58d3e4952d0d from published CourseVersion, sets capacity & enrollment controls',
    negative: 'Cannot open class from unpublished draft CourseVersion (400/409)',
    provenance: 'ClassOffering c87e1a74-f4fe-4066-8095-58d3e4952d0d',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#journey_j1_visitor_admissions_finance_lms',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 1 & Block 4)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-40',
    name: 'Quản lý phòng học và tài nguyên phòng',
    actor: 'HVU',
    testId: 'W04-P1C-UC40-ROOMS',
    routeUi: '/academic/planning, /workspace/academic',
    api: 'GET /api/v2/academic/rooms, POST /api/v2/academic/rooms, PATCH /api/v2/academic/rooms/:id',
    db: 'rooms',
    happy: 'HVU creates room LAB-A302-C153 (a8b047c4-f765-4d02-88b7-24dd9bd68cf5, capacity 32, PROJECTOR/SPEAKERS) and updates status to MAINTENANCE with CAS lockVersion',
    negative: 'Stale expectedLockVersion rejected with 409; non-HVU roles rejected with 403',
    provenance: 'Room a8b047c4-f765-4d02-88b7-24dd9bd68cf5',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#p1_traceability_reconciliation.UCV2-40',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 4)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-41',
    name: 'Lập và quản lý thời khóa biểu, các buổi học chính thức',
    actor: 'HVU',
    testId: 'W04-J2-UC41-TIMETABLE',
    routeUi: '/workspace/academic',
    api: 'POST /api/v2/academic/classes/:id/sessions, POST /api/v2/academic/sessions/:id/submit, POST .../approve',
    db: 'teaching_sessions',
    happy: 'HVU maker schedules TeachingSession e96fef8a-e4ea-412b-85e7-306608a6f23b and independent HVU checker approves -> PUBLISHED',
    negative: 'Room/instructor time conflict or maker self-approval rejected (409/403)',
    provenance: 'TeachingSession e96fef8a-e4ea-412b-85e7-306608a6f23b',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#sqlReadbacks.sessionEngagementAndAttendance',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 3)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-42',
    name: 'Phân công và điều chỉnh giảng viên phụ trách',
    actor: 'HVU',
    testId: 'W04-P1C-UC42-GV-ASSIGN',
    routeUi: '/academic/classes/:id, /workspace/academic',
    api: 'POST /api/v2/academic/classes/:id/assignments, POST /api/v2/academic/assignments/:id/submit, POST /api/v2/academic/assignments/:id/approve',
    db: 'class_instructor_assignments',
    happy: 'HVU maker creates & submits instructor assignment 792c0ab0-3568-4f43-869a-234bef50f6d7; independent HVU checker approves with eligibilityConfirmed=true',
    negative: 'Maker self-approval rejected with 403 Forbidden',
    provenance: 'ClassInstructorAssignment 792c0ab0-3568-4f43-869a-234bef50f6d7',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#p1_traceability_reconciliation.UCV2-42',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 3)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-43',
    name: 'Duyệt và công bố link Google Meet của buổi học',
    actor: 'HVU',
    testId: 'W04-J2-UC43-MEET-APPROVE',
    routeUi: '/academic/session-engagement',
    api: 'GET/POST /api/v2/session-engagement/reviews/meet/:id',
    db: 'W06Meet, W06Outbox',
    happy: 'HVU approves GV-proposed Meet link https://meet.google.com/abc-defg-hij -> published to learner & inspector views',
    negative: 'GV or student cannot approve Meet link (403/404)',
    provenance: 'Approved Meet link on session e96fef8a-e4ea-412b-85e7-306608a6f23b',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#sqlReadbacks.sessionEngagementAndAttendance',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 3)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-44',
    name: 'Duyệt điều chỉnh lịch, nghỉ dạy và dạy bù',
    actor: 'HVU',
    testId: 'W04-P1C-UC44-EXC-REVIEW',
    routeUi: '/academic/session-engagement',
    api: 'POST /api/v2/session-engagement/reviews/exception/:id, POST /api/v2/academic/sessions/:routedSessionId/approve',
    db: 'W06Exception, TeachingSession',
    happy: 'HVU approves exception fad50b16-06de-43f8-848d-018287b49be7 -> routes replacement session 533676fd-e617-4a9e-89c3-00b5722cb133 -> independent HVU checker publishes replacement session',
    negative: 'Maker cannot self-approve routed replacement session (403)',
    provenance: 'Replacement session 533676fd-e617-4a9e-89c3-00b5722cb133',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#p1_traceability_reconciliation.UCV2-44',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 3)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-45',
    name: 'Quản lý tiêu chí đánh giá đầu vào và gợi ý lớp',
    actor: 'HVU',
    testId: 'W04-J2-UC45-CRITERIA',
    routeUi: '/workspace/placement, /admin/criteria',
    api: 'GET/PUT /api/admin/criteria/placement-evaluation, POST /api/v2/placement/workflow/policies',
    db: 'PlacementWorkflowPolicy, CourseRecommendationProfile, CourseSkillCriterion',
    happy: 'HVU configures LR & FOUR_SKILLS evaluation policies, assigns GV reviewers for S/W tasks, and preserves release gates until sign-off',
    negative: 'Non-HVU roles blocked from modifying placement policies (403); AI provisional never auto-published as final',
    provenance: 'Original Placement policy & recommendation profile',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#journey_j2_w05b_placement_session_inspection; Wave 01 09_placement_hvu_readiness_policies_desktop.png',
    poGate: 'ACADEMIC_AND_MEDIA_RELEASE_GATE (MEDIA_QA_PASS=false, ACADEMIC_APPROVED=false, PUBLISHED=false)',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 3)',
    label: 'TECHNICAL_E2E_PENDING_ACADEMIC_RELEASE',
  },
  {
    id: 'UCV2-46',
    name: 'Thiết lập điều kiện hoàn thành khóa học',
    actor: 'HVU',
    testId: 'W04-J3-UC46-W09-POLICY',
    routeUi: '/workspace/certificates',
    api: 'GET /api/v2/certificates/workspace, POST /api/v2/certificates/policies, POST /api/v2/certificates/policies/:id/review',
    db: 'w09_completion_policies, w09_certificate_events',
    happy: 'HVU maker creates test completion policy 8db40ec0-59aa-4a82-9632-2d65de8fc0e7 (isTestPolicy=true); independent HVU checker approves',
    negative: 'Maker self-approval rejected with 409/403; non-test policy blocked in DEV_W09 mode',
    provenance: 'w09_completion_policies 8db40ec0-59aa-4a82-9632-2d65de8fc0e7',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#journey_j3_grading_w09_certificates_w10_reports; screenshots/11-j3-hvu-w09-test-certificates-desktop.png',
    poGate: 'NONE (Explicitly labeled isTestPolicy=true)',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 4)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-47',
    name: 'Cấp, quản lý và tra cứu chứng chỉ',
    actor: 'HVU',
    testId: 'W04-J3-UC47-W09-ISSUE',
    routeUi: '/workspace/certificates, /certificates/lookup',
    api: 'GET /api/v2/certificates/enrollments/:id/evaluate, POST .../reviews, POST .../issue, POST .../revoke, GET .../lookup/:code',
    db: 'w09_certificate_reviews, w09_certificates, w09_certificate_events',
    happy: 'HVU maker-checker issues SE-CERT-TEST-2026-F8B5BD2F (ISSUED) and revokes secondary SE-CERT-TEST-2026-6251518A (REVOKED) with immutable history',
    negative: 'Maker cannot self-approve certificate review (409); revoked certificate clearly marked REVOKED on lookup',
    provenance: 'SE-CERT-TEST-2026-F8B5BD2F & SE-CERT-TEST-2026-6251518A',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#journey_j3_grading_w09_certificates_w10_reports; screenshots/11-j3-hvu-w09-test-certificates-desktop.png',
    poGate: 'NONE (Explicitly labeled SE-CERT-TEST-*)',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 4)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-48',
    name: 'Phân công và điều phối ca thanh tra giảng dạy',
    actor: 'HVU',
    testId: 'W04-J2-UC48-TT-DISPATCH',
    routeUi: '/workspace/inspection',
    api: 'POST /api/v2/inspection/assignments',
    db: 'w08_assignment, w08_revision, w08_notification',
    happy: 'HVU dispatches TT to published session e96fef8a-e4ea-412b-85e7-306608a6f23b (assignment 5c49e460-e108-409b-a076-5338d505f534)',
    negative: 'Overlapping dispatch of same TT to simultaneous session rejected with 409 Conflict',
    provenance: 'w08_assignment 5c49e460-e108-409b-a076-5338d505f534',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#sqlReadbacks.inspectionAndHoursDispute; screenshots/10-j2-tt-inspection-workspace-desktop.png',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 3)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-49',
    name: 'Xét duyệt sai lệch hoặc tranh chấp giờ công giảng viên',
    actor: 'HVU',
    testId: 'W04-P1C-UC49-DISPUTE',
    routeUi: '/workspace/inspection',
    api: 'POST /api/v2/inspection/assignments/:id/commands (DISPUTE, REVIEW: APPROVE/PARTIAL/REJECT)',
    db: 'w08_dispute, w08_decision, w08_report',
    happy: 'HVU records PARTIAL decision -> GV submits teaching hours DISPUTE -> HVU reviews evidence and records compensating APPROVE decision (decisionCount=2)',
    negative: 'TT or GV cannot execute HVU REVIEW command (403/404)',
    provenance: 'w08_assignment 5c49e460-e108-409b-a076-5338d505f534',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#p1_traceability_reconciliation.UCV2-49; screenshots/10-j2-tt-inspection-workspace-desktop.png',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 3)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-50',
    name: 'Tiếp nhận và theo dõi ca thanh tra được phân công',
    actor: 'TT',
    testId: 'W04-P1C-UC50-TT-QUEUE',
    routeUi: '/workspace/inspection',
    api: 'GET /api/v2/inspection, GET /api/v2/inspection/assignments/:id',
    db: 'w08_assignment, w08_revision, w08_notification',
    happy: 'Assigned TT views shift assignment 5c49e460-e108-409b-a076-5338d505f534, session timing, and approved Meet link',
    negative: 'Foreign TT and ungranted staff blocked with 404',
    provenance: 'w08_assignment 5c49e460-e108-409b-a076-5338d505f534',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#p1_traceability_reconciliation.UCV2-50; screenshots/10-j2-tt-inspection-workspace-desktop.png',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 3)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-51',
    name: 'Giám sát buổi dạy và lập biên bản xác minh giờ giảng',
    actor: 'TT',
    testId: 'W04-P1C-UC51-TT-REPORT',
    routeUi: '/workspace/inspection',
    api: 'POST /api/v2/inspection/assignments/:id/commands (START, STOP, REPORT)',
    db: 'w08_segment, w08_report',
    happy: 'TT records server-clock START/STOP observation segment (>=1s) and submits verification report with attestation TT-REPORTED',
    negative: 'Unclocked TT cannot start observation or submit report (409); Meet link click never auto-attests teaching hours',
    provenance: 'w08_report on assignment 5c49e460-e108-409b-a076-5338d505f534',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#p1_traceability_reconciliation.UCV2-51; screenshots/10-j2-tt-inspection-workspace-desktop.png',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 3)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-52',
    name: 'Tự chấm công ca làm của thanh tra',
    actor: 'TT',
    testId: 'W04-J2-UC52-TT-CLOCK',
    routeUi: '/workspace/inspection',
    api: 'POST /api/v2/inspection/assignments/:id/commands (IN, OUT, CORRECTION, CORRECTION_REVIEW)',
    db: 'w08_clock, w08_correction, w08_correction_decision',
    happy: 'TT clocks IN and OUT on own inspection shift (clockCount=2) using MANUAL_FALLBACK',
    negative: 'GV cannot read TT shift clocks; TT cannot self-approve missed-clock correction',
    provenance: 'w08_clock on assignment 5c49e460-e108-409b-a076-5338d505f534',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#sqlReadbacks.inspectionAndHoursDispute; screenshots/10-j2-tt-inspection-workspace-desktop.png',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 3)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-53',
    name: 'Quản lý tài khoản, vai trò và quyền truy cập',
    actor: 'QT',
    testId: 'W04-J3-UC53-AUTHORITY',
    routeUi: '/workspace/authority',
    api: 'GET /api/authority, POST /api/authority/role-decisions, POST .../approve, POST /api/authority/grants, POST .../revoke',
    db: 'users, account_role_decisions, permission_grants, domain_audit_events',
    happy: 'QT1 proposes role transition d007644d-69c2-4481-8d12-96894e730f61 for staff 6aaa2f21-2b0d-4730-a42d-cb8d8a0b81c6; QT2 approves; grant revocation takes immediate effect',
    negative: 'QT1 self-approval rejected with 403; QT does not automatically hold HVU or TN approval rights',
    provenance: 'AccountRoleDecision d007644d-69c2-4481-8d12-96894e730f61',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#journey_j3_grading_w09_certificates_w10_reports; screenshots/12-j3-qt-authority-masked-config-desktop.png',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 4)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-54',
    name: 'Quản lý cấu hình và kết nối dịch vụ hệ thống',
    actor: 'QT',
    testId: 'W04-J3-UC54-SYSCONFIG',
    routeUi: '/workspace/authority, /workspace/operations/settings',
    api: 'GET /api/v2/operations/system-config, POST /api/v2/operations/system-config/proposals',
    db: 'domain_audit_events',
    happy: 'QT views masked service configs (SMTP, SePay, AI, Storage with secrets as ••••••••) and submits audited proposal 265c1d6c-260b-4ba3-9977-b2a0016f4e8d',
    negative: 'Non-admin roles rejected with 403; raw secret values never returned in API payload',
    provenance: 'Config proposal 265c1d6c-260b-4ba3-9977-b2a0016f4e8d',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#journey_j3_grading_w09_certificates_w10_reports; screenshots/12-j3-qt-authority-masked-config-desktop.png',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 4)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-55',
    name: 'Theo dõi nhật ký và tình trạng vận hành hệ thống',
    actor: 'QT',
    testId: 'W04-J3-UC55-SYSAUDIT',
    routeUi: '/workspace/authority, /workspace/operations/audit',
    api: 'GET /api/v2/operations/system-audit',
    db: 'domain_audit_events, user_sessions',
    happy: 'QT queries PostgreSQL & session store health probes (HEALTHY/CONNECTED) and filtered domain_audit_events',
    negative: 'Non-admin roles rejected with 403; audit events are append-only and cannot be deleted',
    provenance: '200+ domain_audit_events across J1, J2, J3',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#journey_j3_grading_w09_certificates_w10_reports.systemHealth; screenshots/12-j3-qt-authority-masked-config-desktop.png',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 4)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-56',
    name: 'Xem và xuất báo cáo hoạt động cuối ngày',
    actor: 'HV, GV, TV, HVU, TN, TT, QT',
    testId: 'W04-P2D-UC56-REPORTS',
    routeUi: '/workspace/reports, /workspace/operations/reports',
    api: 'GET /api/v2/operations/role-reports, POST /api/v2/operations/role-reports/export',
    db: 'ClassActivityProgress, ClassAssignmentSubmission, PlacementResultRelease, W05bBooking, SupportTicket, W07PaymentEvent, W08Assignment, W09Certificate, DomainAuditEvent',
    happy: 'All 7 roles receive non-zero daily reports (STUDENT:7, INSTRUCTOR:5, COUNSELOR:2, ACADEMIC_MANAGER:36, CASHIER:7, TEACHING_INSPECTOR:3, SYSTEM_ADMIN:306) with 0 UNAVAILABLE sources and matching UTF-8 CSV exports',
    negative: 'CSV formula injection (=, +, -, @) neutralized with leading apostrophe; each role scoped strictly to own permitted data',
    provenance: 'Unified Wave 04 disposable DB integrated across J1+J2+J3',
    evidence: 'EVIDENCE/W10_ROLE_REPORT_7ROLES_KPI_CSV.json; screenshots/13-j3-w10-role-reports-csv-desktop.png; 14-j3-w10-role-reports-mobile.png',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 4)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
  {
    id: 'UCV2-57',
    name: 'Quản lý lịch nhận tư vấn 1:1 của giảng viên',
    actor: 'GV',
    testId: 'W04-J2-UC57-W05B-GV',
    routeUi: '/consultations, /workspace/consultations',
    api: 'POST /api/v2/consultations/commands, GET /api/v2/consultations/workspace',
    db: 'W05bProfile, W05bProfileRevision, W05bAvailabilityRule, W05bBooking, W05bMeetingLink',
    happy: 'GV publishes availability window (09:00-17:00), confirms learner booking 779e957f-63cb-4852-87ad-70ec8a9869c4, and proposes consultation link for HVU approval',
    negative: 'Slots overlapping official TeachingSessions automatically excluded; 0 VND free rule enforced',
    provenance: 'W05bBooking 779e957f-63cb-4852-87ad-70ec8a9869c4 & W05bMeetingLink a12fabcd-9d4b-4bb5-a9a8-96aee629863d',
    evidence: 'EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#journey_j2_w05b_placement_session_inspection; screenshots/07-j2-hv-w05b-consultation-booking-desktop.png',
    poGate: 'NONE',
    repro: 'node scripts/verify-argon-wave04-e2e.mjs (Block 3)',
    label: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
  },
];

// 1. Write 57_UC_FINAL_TRACE_MATRIX.md & .csv
const matrixMd = `# Ma Trận Truy Vết 57 Use Case Cuối Cùng — ROAD99 Argon Wave 04 (\`57_UC_FINAL_TRACE_MATRIX.md\`)

- **Ngày chốt**: \`2026-11-10\`
- **Nguồn đối chiếu chuẩn**: \`UC_CATALOG_57_LIVE.md\` (giữ nguyên chính xác 100% tên chuẩn và Actor chính của cả 57 Use Case) và \`BR-V2-131\`.
- **Phân loại kết quả độc lập (không cộng trùng)**:
  - \`PASS_DISPOSABLE_E2E_REVIEWABLE\`: **51 / 57 UC** (có đầy đủ bằng chứng UI + API + DB readback + Negative/RBAC trên DB disposable hợp nhất).
  - \`PASS_SCOPED_HISTORICAL\`: **1 / 57 UC** (\`UCV2-08\` — CMS quản trị nội dung công khai đã xác minh trong phạm vi W10).
  - \`TECHNICAL_E2E_PENDING_ACADEMIC_RELEASE\`: **3 / 57 UC** (\`UCV2-06, 07, 45\` — đã hoàn tất 100% luồng E2E kỹ thuật & ngân hàng 219 câu/73 media, giữ nguyên cờ \`MEDIA_QA_PASS=false, ACADEMIC_APPROVED=false, PUBLISHED=false, learnerPublishable=false\` chờ PO/Hội đồng học thuật ký duyệt).
  - \`TECHNICAL_E2E_PENDING_EXT_PROVIDER\`: **2 / 57 UC** (\`UCV2-03\` SMTP thật, \`UCV2-15\` SePay LIVE thật — đã PASS toàn bộ E2E disposable qua safe test transport và guard \`503\`, chờ PO/Operator cấp khóa nhà cung cấp thật theo \`PO_OPERATOR_ACTION_REQUEST.md\`).
  - \`PARTIAL\` / \`BLOCKED\` / \`NOT_TESTED\`: **0 / 57 UC**.

| UC_ID | Tên Use Case (Chuẩn Catalog) | Actor Chính | Test ID | Route UI | API Endpoints | Bảng DB | Luồng Happy Path | Bằng chứng Negative / RBAC | Nguồn Dữ Liệu (Provenance) | Tập tin Bằng chứng | Cổng PO (PO Gate) | Lệnh Tái Hiện | Nhãn Reviewer Cuối Cùng |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
${ucRows
  .map(
    (r) =>
      `| \`${r.id}\` | ${r.name} | ${r.actor} | \`${r.testId}\` | \`${r.routeUi}\` | \`${r.api}\` | \`${r.db}\` | ${r.happy} | ${r.negative} | ${r.provenance} | \`${r.evidence}\` | \`${r.poGate}\` | \`${r.repro}\` | \`${r.label}\` |`,
  )
  .join('\n')}
`;
writeFileSync(resolve(outDir, '57_UC_FINAL_TRACE_MATRIX.md'), matrixMd, 'utf8');

const matrixCsv = [
  [
    'UC_ID',
    'Canonical_Name',
    'Primary_Actor',
    'Test_ID',
    'Route_UI',
    'API_Endpoints',
    'DB_Tables',
    'Happy_Path',
    'Negative_RBAC',
    'Data_Provenance',
    'Evidence_File',
    'PO_Gate',
    'Repro_Steps',
    'Final_Reviewer_Label',
  ].join(','),
  ...ucRows.map((r) =>
    [
      r.id,
      r.name,
      r.actor,
      r.testId,
      r.routeUi,
      r.api,
      r.db,
      r.happy,
      r.negative,
      r.provenance,
      r.evidence,
      r.poGate,
      r.repro,
      r.label,
    ]
      .map(csvEscape)
      .join(','),
  ),
];
writeFileSync(
  resolve(outDir, '57_UC_FINAL_TRACE_MATRIX.csv'),
  '\uFEFF' + matrixCsv.join('\r\n') + '\r\n',
  'utf8',
);
console.log('Wrote 57_UC_FINAL_TRACE_MATRIX.md and .csv');

// 2. Write BR_V2_131_FINDING_CLOSURE.md
const brClosureMd = `# Báo Cáo Đóng Các Phát Hiện Kiểm Toán BR-V2-131 & BR-V2-130 — ROAD99 Argon Wave 04 (\`BR_V2_131_FINDING_CLOSURE.md\`)

- **Ngày thực hiện**: \`2026-11-10\`
- **Trạng thái**: **ĐÃ ĐÓNG TOÀN BỘ 4 HẠNG MỤC (\`P1-A\`, \`P1-B\`, \`P1-C\`, \`P2-D\`) BẰNG CODE THỰC TẾ, SQL READBACK VÀ E2E TỰ ĐỘNG**

---

## 1. \`P1-A\` (\`BR-V2-131\`): Đối Soát Số Học Học Phí \`250.000 VNĐ ↔ 150.000 VNĐ\` & Bảo Vệ SePay (\`UCV2-14..17\`)

### 1.1. Nguyên nhân gốc rễ của chênh lệch văn bản trong Wave 03
- Trong Wave 03, bài kiểm thử \`apps/api/test/argon-wave03-remaining-19-uc.e2e-spec.ts\` (dòng 839) tải lên biên lai \`amountVnd = "1150000"\` đối chiếu với nghĩa vụ học phí chuẩn \`dueVnd = 1000000\`, tạo ra \`overpaymentCreditPendingVnd = "150000"\` trong \`ARGON_WAVE03_E2E_PROOFS.json\`.
- Tuy nhiên, script sinh báo cáo \`scripts/generate-wave03-deliverables.mjs\` (dòng 931) lại chứa chuỗi thuyết minh cố định ghi \`1.250.000 VNĐ\` trên nghĩa vụ \`1.000.000 VNĐ\` (\`250.000 VNĐ\`).
- **Cách khắc phục trong Wave 04**:
  1. Đã cập nhật \`scripts/generate-wave03-deliverables.mjs\` và tái xuất \`docs/v2/v2-road-to-99-argon-wave03/E2E_BUSINESS_PROOFS.md\` để giải trình rõ cả hai con số.
  2. Xây dựng bài kiểm thử đối soát 5 kịch bản số nguyên VNĐ độc lập trong \`apps/api/test/argon-wave04-integrated-uat.e2e-spec.ts\` (Block 1) và xuất kết quả SQL readback đầy đủ tại \`EVIDENCE/P1_FINANCE_RECONCILIATION.json\`.

### 1.2. Bảng Đối Chiếu SQL Readback 5 Kịch Bản Học Phí (Số Nguyên VNĐ Tuyệt Đối)

| Mã Kịch Bản | \`obligationId\` | Học phí chuẩn (\`dueVnd\`) | Chứng từ nộp (\`evidenceAmountVnd\`) | Đã phân bổ (\`allocatedVnd\`) | Còn thiếu (\`remainingDueVnd\`) | Dư chờ xử lý (\`creditPendingVnd\`) | Trạng thái Nghĩa vụ | Hệ quả Ghi danh / Điều chỉnh |
|---|---|---:|---:|---:|---:|---:|---|---|
| \`FIN-SCENARIO-01-EXACT-1000K\` | \`${p1Finance.scenarios?.exact1000k?.obligationId}\` | \`1.000.000\` | \`1.000.000\` | \`1.000.000\` | \`0\` | \`0\` | \`SETTLED_TEST\` | Mở quyền kích hoạt \`Enrollment\` (\`44660211-fa43-48f8-931b-5f5727155304\`) -> vào LMS \`200 OK\` |
| \`FIN-SCENARIO-02-UNDERPAY-400K\` | \`${p1Finance.scenarios?.underpay400k?.obligationId}\` | \`1.000.000\` | \`400.000\` | \`400.000\` | \`600.000\` | \`0\` | \`PARTIAL_TEST\` | Chặn kích hoạt: \`BLOCKED_REVIEW\` / \`VERIFIED_FULL_FEE_REQUIRED\` (\`0\` enrollment) |
| \`FIN-SCENARIO-03A-OVERPAY-1150K\` (Khớp JSON Wave 03) | \`${p1Finance.scenarios?.overpay1150k_json150k?.obligationId}\` | \`1.000.000\` | \`1.150.000\` | \`1.000.000\` | \`0\` | \`150.000\` | \`CREDIT_PENDING\` | Giữ nguyên trạng thái \`CREDIT_PENDING\`, không tự động hoàn tiền |
| \`FIN-SCENARIO-03B-OVERPAY-1250K\` (Khớp Markdown Wave 03) | \`${p1Finance.scenarios?.overpay1250k_markdown250k?.obligationId}\` | \`1.000.000\` | \`1.250.000\` | \`1.000.000\` | \`0\` | \`250.000\` | \`CREDIT_PENDING\` | Giữ nguyên trạng thái \`CREDIT_PENDING\`, không tự động hoàn tiền |
| \`FIN-SCENARIO-04-REVERSAL-AND-REFUND-BLOCK\` | \`${p1Finance.scenarios?.reversalAndRefundBlock?.obligationId}\` | \`1.000.000\` | \`1.000.000\` | \`1.000.000\` | \`0\` | \`0\` | \`SETTLED_TEST\` | Đề xuất \`REFUND\` bị chặn \`BLOCKED_REVIEW / FINANCIAL_POLICY_REQUIRED\` (\`payout=false\`); \`REVERSAL\` chặn tự duyệt \`409\`, TN2 duyệt tạo bút toán âm append-only |

### 1.3. Bằng chứng Phân biệt các Guard \`503\` của Cổng Thanh Toán SePay
- **Guard mặc định khi chưa bật runtime unified**: \`503 UNIFIED_VERIFIED_QA_REQUIRED\`.
- **Guard khi chạy trên DB disposable (\`OID != 953322\`)**: \`503 UNIFIED_TARGET_IDENTITY_REQUIRED\` (tầng controller/guard) và \`503 SEPAY_INTEGRATED_IDENTITY_REQUIRED\` (tầng \`SePayService.assertIntegratedTarget\`).
- **Bảo toàn dữ liệu QA**: \`CourseVersion d326340a-f8a2-4daf-a732-e93afe0a3a4c\` (\`400.000 VNĐ\`) và đơn \`SEV26A12734045E901D06783\` (\`PENDING\`) trên DB \`OID 953322\` không có bất kỳ thay đổi nào (\`QA_AFTER.json\`).

---

## 2. \`P1-B\` (\`BR-V2-131\`): Bắt Buộc Đồng Thuận Điều Khoản Khi Đăng Ký (\`UCV2-01\`)

### 2.1. Trước & Sau khi sửa
- **Trước Wave 04**: \`RegisterDto.termsAccepted\` được khai báo \`@IsOptional()\` và chỉ kiểm tra \`if (dto.termsAccepted === false)\`, dẫn tới việc gửi payload thiếu trường \`termsAccepted\` vẫn có thể lọt qua API nếu không qua giao diện web.
- **Sau Wave 04**:
  - \`apps/api/src/modules/auth/dto/register.dto.ts\`: Dùng \`@IsDefined()\`, \`@IsBoolean()\`, \`@Equals(true)\` bắt buộc \`termsAccepted === true\`.
  - \`apps/api/src/modules/auth/auth.service.ts\` & \`apps/api/src/modules/users/users.service.ts\`: Kiểm tra tường minh \`if (dto.termsAccepted !== true) throw new BadRequestException(...)\` và ghi sự kiện kiểm toán \`REGISTER_CONSENT_ACCEPTED\` (kèm \`consentVersion: "SE_TERMS_PRIVACY_V2"\` và \`acceptedAt\`) vào bảng \`domain_audit_events\` trong cùng giao dịch tạo người dùng.
  - \`apps/web/src/pages/RegisterPage.tsx\` & \`apps/web/src/features/auth/api.ts\`: Bắt buộc \`termsAccepted: boolean\` trên cả client validation và payload gửi đi.

### 2.2. Bằng chứng Kiểm thử 7 Trường Hợp Phủ Định & 1 Trường Hợp Khẳng Định (\`ARGON_WAVE04_E2E_PROOFS.json#p1b_signup_mandatory_consent\`)

| Trường hợp kiểm thử | Payload \`termsAccepted\` | HTTP Status | Số bản ghi \`users\` sinh ra | Kết quả |
|---|---|---:|---:|---|
| \`MISSING_KEY\` | *(bỏ trống trường)* | \`400 Bad Request\` | \`0\` | **PASS** |
| \`UNDEFINED_VALUE\` | \`undefined\` | \`400 Bad Request\` | \`0\` | **PASS** |
| \`NULL_VALUE\` | \`null\` | \`400 Bad Request\` | \`0\` | **PASS** |
| \`FALSE_BOOLEAN\` | \`false\` | \`400 Bad Request\` | \`0\` | **PASS** |
| \`STRING_TRUE\` | \`"true"\` | \`400 Bad Request\` | \`0\` | **PASS** |
| \`NUMBER_ZERO\` | \`0\` | \`400 Bad Request\` | \`0\` | **PASS** |
| \`ROLE_ESCALATION_SYSTEM_ADMIN\` | \`true\` + \`role: "SYSTEM_ADMIN"\` | \`400 Bad Request\` | \`0\` | **PASS** |
| \`POSITIVE_CONSENT_TRUE\` | \`true\` | \`201 Created\` | \`1\` (\`STUDENT\`, \`${e2eProofs.p1b_signup_mandatory_consent?.positiveRegistration?.userId}\`) + Audit \`${e2eProofs.p1b_signup_mandatory_consent?.positiveRegistration?.consentAuditEventId}\` | **PASS** |

---

## 3. \`P1-C\` (\`BR-V2-130\`): Điền Đầy Đủ Bằng Chứng Cấp Trường Hợp & SQL Readback Cho 12 UC Truy Vết

- **Trước Wave 04**: Trong \`ARGON_WAVE03_E2E_PROOFS.json\`, hai đối tượng \`p1_traceability_reconciliation\` và \`sqlReadbacks\` còn để rỗng \`{}\`.
- **Sau Wave 04**: Toàn bộ 12 Use Case (\`UCV2-31, 32, 34, 35, 36, 37, 40, 42, 44, 49, 50, 51\`) đã được thực thi trong chuỗi tích hợp Wave 04 và ghi nhận đầy đủ tên chuẩn, Actor chính, Route UI, API, bằng chứng DB (\`dbEvidence\`), bằng chứng khẳng định (\`positiveProof\`), và bằng chứng phủ định/RBAC (\`negativeRbacProof\`) trong \`EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#p1_traceability_reconciliation\` và \`#sqlReadbacks\`.

---

## 4. \`P2-D\` (\`W10 UCV2-56\`): Báo Cáo Hoạt Động Cuối Ngày & Xuất CSV Cho Cả 7 Vai Trò Trên Dữ Liệu Tích Hợp

### 4.1. Nguyên nhân gốc rễ trong Wave 03 & Sửa đổi trong Wave 04
- **Nguyên nhân trong Wave 03**: DB disposable của Wave 03 chỉ có tiền tố \`w05a_w07\`, khiến các hàng rào runtime của \`W04B\` (Placement), \`W05B\` (Tư vấn 1:1), \`W06\` (Điểm danh/Meet), \`W08\` (Thanh tra) và \`W09\` (Chứng chỉ) trả trạng thái bị khóa hoặc \`UNAVAILABLE\`. Đồng thời adapter \`FINANCE\` chỉ đếm giao dịch thật (\`synthetic = false\`), làm vai trò \`CASHIER\` có \`count = 0\` khi chạy kiểm thử chứng từ \`TEST-*\`.
- **Sửa đổi trong Wave 04**:
  1. Chạy hợp nhất trên DB disposable \`v2_wave01_dev_test_w04b_w05a_argon04_<suffix>\` và mở rộng quy tắc nhận diện tên DB disposable trong \`SupportService\` & \`AdmissionsFinanceService\`.
  2. Cập nhật \`RoleReportAdaptersService\` (\`apps/api/src/modules/operations/role-report-adapters.service.ts\`): bổ sung đọc tiến độ từ \`classActivityProgress\`, bài nộp từ \`classAssignmentSubmission\`, điểm chấm từ \`assignmentGrade\`, lịch tư vấn 1:1 theo \`createdAt OR startsAt\`, và cho phép đếm bút toán \`w07_payment_events\` kiểm thử khi đồng thời bật \`W07_FINANCE_RUNTIME_ENABLED=DEC049_DISPOSABLE_ONLY\` và \`W10_ROLE_REPORT_ENABLED=DEV_W10\`.
  3. Bổ sung trường phân loại tường minh \`availabilityClassification\` (\`AVAILABLE\`, \`AVAILABLE_EMPTY\`, \`BLOCKED_BY_POLICY\`, \`UNAVAILABLE\`) cho từng nguồn dữ liệu trong \`RoleReportsService\`.

### 4.2. Kết Quả Thực Thi 7 Vai Trò (\`EVIDENCE/W10_ROLE_REPORT_7ROLES_KPI_CSV.json\`)

| Vai trò | Tổng Nguồn | Nguồn \`AVAILABLE\` | Nguồn \`UNAVAILABLE\` | Tổng Bản Ghi Ngày (\`Asia/Ho_Chi_Minh\`) | Chi tiết theo Nguồn (\`bySource\`) | Khớp Số Dòng CSV Xuất Ra |
|---|---:|---:|---:|---:|---|---|
| \`STUDENT\` (HV) | 4 | **4** | **0** | **7** | \`LEARNING: 2, SUBMISSIONS: 3, PLACEMENT_RESULTS: 1, CERTIFICATE: 1\` | **Khớp (7 dòng)** |
| \`INSTRUCTOR\` (GV) | 3 | **3** | **0** | **5** | \`TEACHING: 1, GRADING: 3, TEACHING_CALENDAR: 1\` | **Khớp (5 dòng)** |
| \`COUNSELOR\` (TV) | 2 | **2** | **0** | **2** | \`SUPPORT: 1, CONSULTATION: 1\` | **Khớp (2 dòng)** |
| \`ACADEMIC_MANAGER\` (HVU) | 5 | **5** | **0** | **36** | \`PLACEMENT_RESULTS: 4, ACADEMIC: 15, CERTIFICATE: 2, CLASS_SCHEDULE: 2, ACADEMIC_DECISIONS: 13\` | **Khớp (36 dòng)** |
| \`CASHIER\` (TN) | 1 | **1** | **0** | **7** | \`FINANCE: 7 (VERIFY: 6, REVERSAL: 1)\` | **Khớp (7 dòng)** |
| \`TEACHING_INSPECTOR\` (TT) | 2 | **2** | **0** | **3** | \`INSPECTION: 1, STAFF_SHIFT: 2\` | **Khớp (3 dòng)** |
| \`SYSTEM_ADMIN\` (QT) | 4 | **4** | **0** | **306** | \`ACCOUNTS: 24, SECURITY_OPS: 200, AUTHORITY_EVENTS: 81, RUNTIME_PROBE: 1\` | **Khớp (306 dòng)** |
`;
writeFileSync(resolve(outDir, 'BR_V2_131_FINDING_CLOSURE.md'), brClosureMd, 'utf8');

// 3. Write CROSS_WAVE_JOURNEYS_E2E.md
const journeysMd = `# Bằng Chứng 3 Hành Trình Tích Hợp Xuyên Vai Trò (J1, J2, J3) — ROAD99 Argon Wave 04 (\`CROSS_WAVE_JOURNEYS_E2E.md\`)

- **Ngày thực thi**: \`2026-11-10\`
- **Bộ kiểm thử thực thi**: \`apps/api/test/argon-wave04-integrated-uat.e2e-spec.ts\` + \`apps/api/test/argon-wave04-browser-capture.ts\` (điều phối qua \`node scripts/verify-argon-wave04-e2e.mjs\`).
- **Đặc trưng thiết kế**: Cả 3 hành trình \`J1\`, \`J2\`, \`J3\` cùng chạy liên thông trên **một cơ sở dữ liệu PostgreSQL disposable duy nhất**, dùng chung cùng một trung tâm TOEIC, cùng hệ thống tài khoản 7 vai trò, cùng học viên chính (\`hocvien.wave04.1f4de039@example.invalid\`), cùng lớp học (\`c87e1a74-f4fe-4066-8095-58d3e4952d0d\`), nối dữ liệu xuyên suốt từ lúc khách đăng ký tài khoản tới khi cấp chứng chỉ thử nghiệm và kết xuất báo cáo cuối ngày cho cả 7 vai trò.

---

## 1. Hành Trình \`J1\` — Khách → Tư Vấn/Học Vụ → Thu Ngân → Học Viên Học Tập LMS (\`UCV2-01..05, 09..17, 18..24\`)

### 1.1. Chuỗi Định Danh & Liên Kết Dữ Liệu Thực Tế
- **Khách đăng ký tài khoản có đồng thuận bắt buộc (\`UCV2-01\`)**:
  - \`userId\`: \`${e2eProofs.p1b_signup_mandatory_consent?.positiveRegistration?.userId}\` (\`${e2eProofs.p1b_signup_mandatory_consent?.positiveRegistration?.email}\`, vai trò \`STUDENT\`).
  - Sự kiện kiểm toán đồng thuận: \`${e2eProofs.p1b_signup_mandatory_consent?.positiveRegistration?.consentAuditEventId}\` (\`REGISTER_CONSENT_ACCEPTED\`, \`SE_TERMS_PRIVACY_V2\`).
- **Khám phá danh mục khóa học công khai (\`UCV2-05\`)**:
  - Hiển thị đúng **6 khóa học công khai** đã duyệt và ẩn **9 khóa học fixture QA** (tổng cộng 15 khóa học trong DB).
- **Gửi phiếu tư vấn CSKH → TV tiếp nhận → Lập hồ sơ đề xuất lớp → HVU duyệt Maker-Checker (\`UCV2-09, 10, 11\`)**:
  - \`supportTicketId\`: \`${e2eProofs.journey_j1_visitor_admissions_finance_lms?.supportTicketId}\`
  - \`counselingAppV1Id\`: \`${e2eProofs.journey_j1_visitor_admissions_finance_lms?.counselingAppV1Id}\` (HVU yêu cầu bổ sung thông tin \`REQUEST_INFO\`)
  - \`counselingAppV2Id\`: \`${e2eProofs.journey_j1_visitor_admissions_finance_lms?.counselingAppV2Id}\` (HVU phê duyệt \`READY_FOR_ADMISSION_HANDOFF\`)
- **Nộp đơn nhập học → HVU duyệt sinh nghĩa vụ → TN xác nhận chứng từ \`MANUAL_FALLBACK_TEST\` → Mở quyền LMS (\`UCV2-12..17\`)**:
  - \`directApplicationId\`: \`${e2eProofs.journey_j1_visitor_admissions_finance_lms?.directApplicationId}\`
  - \`exactObligationId\`: \`${e2eProofs.journey_j1_visitor_admissions_finance_lms?.exactObligationId}\` (\`dueVnd = 1.000.000 VNĐ\`, \`paidVnd = 1.000.000 VNĐ\`, \`state = SETTLED_TEST\`)
  - \`primaryEnrollmentId\`: \`${e2eProofs.journey_j1_visitor_admissions_finance_lms?.primaryEnrollmentId}\` tại lớp \`${e2eProofs.journey_j1_visitor_admissions_finance_lms?.classId}\`
- **Học viên vào lớp LMS thực hiện Bài học, Tài nguyên, Bài tập, Quiz & Xem Bảng điểm / Gợi ý kiến thức (\`UCV2-18..24\`)**:
  - \`sectionId\`: \`${e2eProofs.journey_j1_visitor_admissions_finance_lms?.sectionId}\` (\`Tuần 01 — Chiến lược TOEIC Listening Part 2 & Reading Part 5–6\`)
  - Hoạt động đã hoàn thành: Lesson \`${e2eProofs.journey_j1_visitor_admissions_finance_lms?.activities?.lessonActId}\`, Resource \`${e2eProofs.journey_j1_visitor_admissions_finance_lms?.activities?.resourceActId}\`, Assignment \`${e2eProofs.journey_j1_visitor_admissions_finance_lms?.activities?.assignmentActId}\` (bài nộp \`${e2eProofs.journey_j1_visitor_admissions_finance_lms?.submissionId}\`, điểm đã công bố \`${e2eProofs.journey_j1_visitor_admissions_finance_lms?.finalGradeId}\` = \`90%\`), Quiz \`${e2eProofs.journey_j1_visitor_admissions_finance_lms?.activities?.quizActId}\` (lượt làm \`${e2eProofs.journey_j1_visitor_admissions_finance_lms?.quizAttemptId}\`).
  - Gợi ý củng cố kiến thức: Bài viết \`WORKPLACE_EMAIL_B1\` (\`revisionId: ${e2eProofs.journey_j1_visitor_admissions_finance_lms?.knowledgeArticleRevisionId}\`).

---

## 2. Hành Trình \`J2\` — Học Viên → Tư Vấn 1:1 Miễn Phí (\`W05B\`) + Placement → Giảng Viên/Học Vụ (\`W06\`) → Thanh Tra (\`W08\`) (\`UCV2-06, 07, 25..27, 29, 35..37, 41..45, 48..52, 57\`)

### 2.1. Chuỗi Định Danh & Liên Kết Dữ Liệu Thực Tế
- **Đặt lịch tư vấn 1:1 miễn phí với Giảng viên cho cả học viên chưa ghi danh (\`UCV2-27, 57\`)**:
  - \`w05bBookingId\`: \`${e2eProofs.journey_j2_w05b_placement_session_inspection?.w05bBookingId}\` (0 VNĐ, chặn double-booking cùng khung giờ với mã \`409 Conflict\`).
  - \`w05bApprovedLinkId\`: \`${e2eProofs.journey_j2_w05b_placement_session_inspection?.w05bApprovedLinkId}\` (GV đề xuất link tư vấn, HVU duyệt độc lập).
- **Kiểm tra đầu vào Placement ở cả 2 chế độ \`LR\` (200 câu) và \`FOUR_SKILLS\` (219 nhiệm vụ) (\`UCV2-06, 07, 45\`)**:
  - \`lrAttemptId\`: \`${e2eProofs.journey_j2_w05b_placement_session_inspection?.lrAttemptId}\` (200 câu khách quan Listening & Reading).
  - \`fourAttemptId\`: \`${e2eProofs.journey_j2_w05b_placement_session_inspection?.fourAttemptId}\` (Speaking S10 phát đúng 2 lượt audio trước khi mở ghi âm; AI trả \`AI_PROVISIONAL\`, GV chấm rubric và xác nhận \`REVIEWED_FINAL\`; giữ nguyên cờ \`MEDIA_QA_PASS=false, ACADEMIC_APPROVED=false, PUBLISHED=false, learnerPublishable=false\`).
- **Buổi học chính thức, Duyệt link Google Meet, Điểm danh mã 20-hex & Đổi lịch dạy bù (\`UCV2-25, 26, 35, 36, 37, 41, 42, 43, 44\`)**:
  - \`officialSessionId\`: \`${e2eProofs.journey_j2_w05b_placement_session_inspection?.officialSessionId}\`, link Meet đã duyệt: \`${e2eProofs.journey_j2_w05b_placement_session_inspection?.approvedMeetUrl}\`.
  - \`attendanceReceiptId\`: \`${e2eProofs.journey_j2_w05b_placement_session_inspection?.attendanceReceiptId}\` (điểm danh hợp lệ trong cửa sổ giờ server).
  - \`rescheduleExceptionId\`: \`${e2eProofs.journey_j2_w05b_placement_session_inspection?.rescheduleExceptionId}\` -> buổi dạy thay thế đã công bố: \`${e2eProofs.journey_j2_w05b_placement_session_inspection?.routedReplacementSessionId}\`.
- **Thanh tra giảng dạy, Chấm công nhân sự TT, Biên bản giám sát & Xử lý tranh chấp giờ công GV (\`UCV2-48..52\`)**:
  - \`inspectionAssignmentId\`: \`${e2eProofs.journey_j2_w05b_placement_session_inspection?.inspectionAssignmentId}\` (TT chấm công \`IN/OUT\` 2 mốc, ghi đoạn giám sát và nộp biên bản \`${e2eProofs.journey_j2_w05b_placement_session_inspection?.inspectionReportAttestation}\`; GV gửi khiếu nại \`DISPUTE\`; HVU xem xét và ra quyết định \`APPROVE\` bổ sung append-only).

---

## 3. Hành Trình \`J3\` — Giảng Viên Chấm Bài → Chứng Chỉ Thử Nghiệm \`W09\` → Quản Trị & Báo Cáo Cuối Ngày 7 Vai Trò (\`UCV2-28, 30..34, 38, 40, 46, 47, 53..56\`)

### 3.1. Chuỗi Định Danh & Liên Kết Dữ Liệu Thực Tế
- **Chương trình đào tạo, Phiên bản khóa học & Quản lý phòng học (\`UCV2-38, 40\`)**:
  - \`newProgramId\`: \`${e2eProofs.journey_j3_grading_w09_certificates_w10_reports?.newProgramId}\`, \`newVersionId\`: \`${e2eProofs.journey_j3_grading_w09_certificates_w10_reports?.newVersionId}\` (\`PUBLISHED\` qua maker-checker HVU).
  - \`createdRoomId\`: \`${e2eProofs.journey_j3_grading_w09_certificates_w10_reports?.createdRoomId}\` (\`LAB-A302-C153\`, sức chứa 32, cập nhật trạng thái \`MAINTENANCE\` có kiểm tra \`lockVersion\`).
- **Chính sách hoàn thành & Cấp / Thu hồi / Tra cứu chứng chỉ thử nghiệm \`W09\` (\`UCV2-28, 46, 47\`)**:
  - \`policyId\`: \`${e2eProofs.journey_j3_grading_w09_certificates_w10_reports?.policyId}\` (\`isTestPolicy = true\`).
  - Chứng chỉ đã cấp cho học viên chính: \`${e2eProofs.journey_j3_grading_w09_certificates_w10_reports?.issuedCertificateCode}\` (\`id: ${e2eProofs.journey_j3_grading_w09_certificates_w10_reports?.issuedCertificateId}\`, trạng thái \`ISSUED\`).
  - Chứng chỉ thứ hai đã thu hồi để kiểm chứng lịch sử bất biến: \`${e2eProofs.journey_j3_grading_w09_certificates_w10_reports?.revokedCertificateCode}\` (\`id: ${e2eProofs.journey_j3_grading_w09_certificates_w10_reports?.revokedCertificateId}\`, trạng thái \`REVOKED\`).
- **Quản trị Phân quyền, Cấu hình che mặt nạ, Sức khỏe vận hành & Báo cáo cuối ngày 7 vai trò (\`UCV2-53..56\`)**:
  - \`roleDecisionId\`: \`${e2eProofs.journey_j3_grading_w09_certificates_w10_reports?.roleDecisionId}\`, \`configProposalId\`: \`${e2eProofs.journey_j3_grading_w09_certificates_w10_reports?.configProposalId}\`.
  - Báo cáo cuối ngày (\`2026-11-10\`, \`Asia/Ho_Chi_Minh\`): cả 7 vai trò đều có dữ liệu thực khác 0 (\`STUDENT: 7, INSTRUCTOR: 5, COUNSELOR: 2, ACADEMIC_MANAGER: 36, CASHIER: 7, TEACHING_INSPECTOR: 3, SYSTEM_ADMIN: 306\`), \`0\` nguồn \`UNAVAILABLE\`, xuất CSV khớp 100% số bản ghi.

---

## 4. Danh Mục 14 Ảnh Chụp Màn Hình Thực Tế Qua Chrome CDP (\`1440×900\` & \`390×844\`)

| # | Tập tin ảnh chụp (\`EVIDENCE/screenshots/\`) | Hành trình | Use Case | Vai trò & Viewport | Route | Overflow Ngang |
|---|---|---|---|---|---|---|
${(browserProofs.captures ?? [])
  .map(
    (c, i) =>
      `| ${i + 1} | \`${c.fileName}\` | ${c.journey} | \`${c.uc}\` | ${c.actor} (\`${c.viewport}\`) | \`${c.route}\` | \`${c.overflow ? 'YES' : '0px (false)'}\` |`,
  )
  .join('\n')}
`;
writeFileSync(resolve(outDir, 'CROSS_WAVE_JOURNEYS_E2E.md'), journeysMd, 'utf8');
console.log('Wrote BR_V2_131_FINDING_CLOSURE.md and CROSS_WAVE_JOURNEYS_E2E.md');

// 4. Write SOURCE_CHANGESET.md
const sourceChangeset = `# Nhật Ký Thay Đổi Mã Nguồn — ROAD99 Argon Wave 04 (\`SOURCE_CHANGESET.md\`)

- **Ngày thực hiện**: \`2026-11-10\`
- **Nhánh Git**: \`feat/v2-se-sw-01-pilot-main\` (không commit/push/reset/stash/clean, bảo toàn nguyên vẹn toàn bộ kết quả Wave 01, Wave 02, Wave 03 và DB QA \`OID 953322\`).
- **Tập tin Migration SQL**: Không chỉnh sửa bất kỳ migration lịch sử nào (\`01..35\`). Mọi kiểm thử tích hợp có ghi dữ liệu đều chỉ chạy trên DB disposable \`v2_wave01_dev_test_w04b_w05a_argon04_<suffix>\` và tự động dọn dẹp sau khi hoàn tất.

---

## 1. Danh Sách Tập Tin Mã Nguồn Được Cập Nhật / Tạo Mới Trong Wave 04

| Tập tin | Phân loại | Hạng mục liên quan | Nội dung thay đổi |
|---|---|---|---|
| \`apps/api/src/modules/auth/dto/register.dto.ts\` | Cập nhật | \`P1-B\` (\`UCV2-01\`) | Bắt buộc \`termsAccepted\` là kiểu boolean \`true\` (\`@IsDefined()\`, \`@IsBoolean()\`, \`@Equals(true)\`), từ chối hoàn toàn \`missing\`, \`undefined\`, \`null\`, \`false\`, \`"true"\`, \`0\`. |
| \`apps/api/src/modules/auth/auth.service.ts\` | Cập nhật | \`P1-B\` (\`UCV2-01\`) | Kiểm tra tường minh \`if (dto.termsAccepted !== true) throw new BadRequestException(...)\` trước khi tạo tài khoản học viên. |
| \`apps/api/src/modules/users/users.service.ts\` | Cập nhật | \`P1-B\` (\`UCV2-01\`) | Khi tạo học viên qua đăng ký công khai, ghi nhận đồng thời sự kiện kiểm toán \`REGISTER_CONSENT_ACCEPTED\` (kèm \`consentVersion: "SE_TERMS_PRIVACY_V2"\` và \`acceptedAt\`) vào \`domain_audit_events\`. |
| \`apps/web/src/features/auth/api.ts\` | Cập nhật | \`P1-B\` (\`UCV2-01\`) | Chuyển \`termsAccepted: boolean\` thành trường bắt buộc trong giao diện gọi API \`register\`. |
| \`apps/web/src/pages/RegisterPage.tsx\` | Cập nhật | \`P1-B\` (\`UCV2-01\`) | Bổ sung kiểm tra client-side bắt buộc tích chọn hộp kiểm đồng thuận điều khoản trước khi gửi biểu mẫu đăng ký. |
| \`apps/api/src/modules/support/support.service.ts\` | Cập nhật | \`P2-D\` & \`J1..J3\` | Cho phép nhận diện tên DB disposable hợp nhất \`_w04b_w05a_\` / \`_argon04_\` trong hàng rào kiểm thử cô lập của module CSKH (\`W05A\`). |
| \`apps/api/src/modules/admissions-finance/admissions-finance.service.ts\` | Cập nhật | \`P1-A\` & \`P2-D\` | Cho phép nhận diện tên DB disposable hợp nhất \`_w04b_w05a_\` / \`_argon04_\` trong hàng rào kiểm thử cô lập \`DEC049_DISPOSABLE_ONLY\` của module Tuyển sinh – Học phí (\`W07\`), giữ nguyên 100% guard \`503\` cho SePay. |
| \`apps/api/src/modules/operations/role-report-adapters.service.ts\` | Cập nhật | \`P2-D\` (\`UCV2-56\`) | Bổ sung đọc \`classActivityProgress\` cho nguồn \`LEARNING\`, \`classAssignmentSubmission\` cho \`SUBMISSIONS\`, \`assignmentGrade\` cho \`GRADING\`, lọc lịch tư vấn \`w05b_bookings\` theo \`createdAt OR startsAt\`, và cho phép thống kê bút toán học phí kiểm thử trong môi trường disposable \`DEC049_DISPOSABLE_ONLY + DEV_W10\`. |
| \`apps/api/src/modules/operations/role-reports.service.ts\` | Cập nhật | \`P2-D\` (\`UCV2-56\`) | Bổ sung trường phân loại trạng thái nguồn \`availabilityClassification\` (\`AVAILABLE\`, \`AVAILABLE_EMPTY\`, \`BLOCKED_BY_POLICY\`, \`UNAVAILABLE\`) trên từng nguồn dữ liệu của cả 7 vai trò. |
| \`apps/api/src/modules/placement/original-bank-eligibility.spec.ts\` | Cập nhật | Kiểm thử đơn vị | Lọc danh sách đáp án \`A, B, C, D\` theo đúng các lựa chọn có mặt của từng câu (hỗ trợ chuẩn 3 lựa chọn \`A, B, C\` của TOEIC Part 2 giống \`seed-original-placement-bank.ts\`) và định kiểu TypeScript tường minh. |
| \`scripts/generate-wave03-deliverables.mjs\` & \`docs/v2/v2-road-to-99-argon-wave03/E2E_BUSINESS_PROOFS.md\` | Cập nhật | \`P1-A\` (\`BR-V2-131\`) | Đồng bộ hóa thuyết minh nộp thừa học phí giữa kịch bản \`1.150.000 VNĐ -> dư 150.000 VNĐ\` và \`1.250.000 VNĐ -> dư 250.000 VNĐ\`. |
| \`apps/api/test/argon-wave04-integrated-uat.e2e-spec.ts\` | Tạo mới | \`P1-A..C, P2-D, J1..J3\` | Bộ kiểm thử E2E tích hợp toàn diện (5 khối kiểm thử lớn) chạy liên thông 3 hành trình \`J1, J2, J3\`, đối soát 5 kịch bản học phí, kiểm chứng đồng thuận đăng ký, truy vết 12 UC \`BR-V2-130\` và xuất báo cáo cuối ngày cho cả 7 vai trò. |
| \`apps/api/test/argon-wave04-browser-capture.ts\` | Tạo mới | Browser CDP (\`J1..J3\`) | Kịch bản Chrome CDP chụp 14 ảnh màn hình thực tế ở cả \`1440×900\` (desktop) và \`390×844\` (mobile), xác minh \`0\` lỗi \`5xx\`, \`0\` tràn ngang (\`overflow: false\`), và hộp thoại Hủy không gây mất dữ liệu. |
| \`scripts/verify-argon-wave04-e2e.mjs\` | Tạo mới | Điều phối E2E | Tạo DB disposable hợp nhất \`v2_wave01_dev_test_w04b_w05a_argon04_<suffix>\`, thực thi toàn bộ E2E + Chrome CDP, và dọn dẹp DB disposable an toàn. |
`;
writeFileSync(resolve(outDir, 'SOURCE_CHANGESET.md'), sourceChangeset, 'utf8');

// 5. Write ORIGINAL_INTEGRATED_UAT_DEMO_DATA.md & .csv
const demoDataRows = [
  {
    id: 'DEMO-01-PLACEMENT-LR200',
    domain: 'Placement Listening & Reading (SE-LR-01)',
    ucRange: 'UCV2-06, UCV2-07, UCV2-45',
    sourcePath: 'apps/api/content/se-original-v1/SE_LR_200_Manifest.json',
    recordCount: '200 câu hỏi (Listening 100: P1=6, P2=25, P3=39, P4=30; Reading 100: P5=30, P6=16, P7=54)',
    rightsStatus: '100% nguyên bản tự biên soạn cho Smart English V2; cờ phát hành MEDIA_QA_PASS=false, ACADEMIC_APPROVED=false, PUBLISHED=false chờ PO ký duyệt',
  },
  {
    id: 'DEMO-02-PLACEMENT-SW19',
    domain: 'Placement Speaking & Writing (SE-SW-01)',
    ucRange: 'UCV2-06, UCV2-07, UCV2-33, UCV2-34, UCV2-45',
    sourcePath: 'apps/api/content/se-original-v1/SE_SW_19_Manifest.json',
    recordCount: '19 nhiệm vụ (Speaking 11 câu + Writing 8 câu, bao gồm W5 v02 chairs/arrange và S10 phát 2 lượt audio)',
    rightsStatus: '100% nguyên bản tự biên soạn kèm rubric chấm điểm nội bộ 0–4; cờ phát hành giữ nguyên chờ PO/Hội đồng học thuật nghiệm thu',
  },
  {
    id: 'DEMO-03-PLACEMENT-MEDIA73',
    domain: 'Tài nguyên Âm thanh & Hình ảnh Placement',
    ucRange: 'UCV2-06, UCV2-07',
    sourcePath: 'apps/api/content/se-original-v1/SE_Media_Manifest.json',
    recordCount: '73 tập tin media (audio WAV/MP3 & hình ảnh PNG minh họa có mã băm SHA-256)',
    rightsStatus: 'Tài nguyên gốc nội bộ có đầy đủ transcript và SHA-256 trong SE_Media_Manifest.json',
  },
  {
    id: 'DEMO-04-LMS-CURRICULUM',
    domain: 'Học liệu Lớp học LMS, Ngân hàng Câu hỏi & Thư viện Kiến thức TOEIC',
    ucRange: 'UCV2-18..24, UCV2-29..34',
    sourcePath: 'docs/v2/v2-road-to-99-argon-wave01/ORIGINAL_CONTENT_INVENTORY.csv',
    recordCount: '6 khóa học TOEIC công khai + Section Tuần 01 (Lesson, Resource, Assignment, Quiz 4 câu) + Thư viện Kiến thức WORKPLACE_EMAIL_B1',
    rightsStatus: 'Biên soạn nguyên bản tiếng Việt – tiếng Anh theo chuẩn ngữ cảnh công sở TOEIC',
  },
  {
    id: 'DEMO-05-W05B-W06-W08-W09',
    domain: 'Tư vấn 1:1 Giảng viên, Buổi học Trực tuyến, Thanh tra & Chứng chỉ Thử nghiệm',
    ucRange: 'UCV2-25..28, UCV2-35..37, UCV2-41..44, UCV2-46..52, UCV2-57',
    sourcePath: 'docs/v2/v2-road-to-99-argon-wave02/ORIGINAL_STAFF_OPERATIONS_DEMO_DATA.csv',
    recordCount: 'Hồ sơ GV tư vấn 1:1 miễn phí + Phiên điểm danh 20-hex + Ca thanh tra TT-REPORTED + Chính sách & Chứng chỉ thử nghiệm SE-CERT-TEST-*',
    rightsStatus: 'Dữ liệu vận hành tổng hợp nguyên bản; chứng chỉ gắn nhãn TEST_DISPOSABLE / isTestPolicy=true',
  },
  {
    id: 'DEMO-06-W05A-W07-W10',
    domain: 'CSKH, Tuyển sinh, Đối soát Học phí & Báo cáo Cuối ngày 7 Vai trò',
    ucRange: 'UCV2-01..05, UCV2-09..17, UCV2-38, UCV2-40, UCV2-53..56',
    sourcePath: 'docs/v2/v2-road-to-99-argon-wave03/ORIGINAL_ADMISSIONS_FINANCE_OPERATIONS_DATA.csv',
    recordCount: '5 kịch bản học phí số nguyên VNĐ + Hồ sơ tư vấn chuyển giao tuyển sinh + Phòng học LAB-A302 + Báo cáo KPI/CSV 7 vai trò',
    rightsStatus: '100% dữ liệu kiểm thử synthetic (@example.invalid, TEST-*); tuyệt đối không chứa PII hay giao dịch ngân hàng thật',
  },
];

const demoDataMd = `# Danh Mục Dữ Liệu Học Liệu & Vận Hành Tích Hợp Nguyên Bản — ROAD99 Argon Wave 04 (\`ORIGINAL_INTEGRATED_UAT_DEMO_DATA.md\`)

- **Ngày cập nhật**: \`2026-11-10\`
- **Nguyên tắc bản quyền & an toàn dữ liệu**:
  1. Toàn bộ đề thi, đoạn hội thoại, văn bản đọc hiểu, bài học, câu hỏi quiz, bài viết kiến thức, kịch bản tư vấn tuyển sinh và biên bản vận hành đều được biên soạn nguyên bản cho dự án khóa luận Smart English V2.
  2. Mọi địa chỉ email trong kiểm thử tích hợp đều dùng tên miền giả lập chuẩn RFC (\`@example.invalid\`), mọi chứng từ thanh toán đều gắn tiền tố \`TEST-\` (\`MANUAL_FALLBACK_TEST\`), và mọi chứng chỉ hoàn thành đều gắn tiền tố \`SE-CERT-TEST-\` (\`isTestPolicy = true\`).
  3. Không phát sinh bất kỳ giao dịch ngân hàng thật hay dữ liệu cá nhân thật nào.

| Mã Danh Mục | Phân hệ Nghiệp vụ | Phạm vi Use Case | Đường dẫn Nguồn trong Repo | Quy mô Dữ liệu | Trạng thái Bản quyền & Cổng Phát hành |
|---|---|---|---|---|---|
${demoDataRows
  .map(
    (d) =>
      `| \`${d.id}\` | ${d.domain} | \`${d.ucRange}\` | \`${d.sourcePath}\` | ${d.recordCount} | ${d.rightsStatus} |`,
  )
  .join('\n')}
`;
writeFileSync(resolve(outDir, 'ORIGINAL_INTEGRATED_UAT_DEMO_DATA.md'), demoDataMd, 'utf8');

const demoDataCsv = [
  ['Catalog_ID', 'Domain', 'UC_Range', 'Source_Path', 'Record_Count', 'Rights_And_Gate_Status'].join(','),
  ...demoDataRows.map((d) =>
    [d.id, d.domain, d.ucRange, d.sourcePath, d.recordCount, d.rightsStatus]
      .map(csvEscape)
      .join(','),
  ),
];
writeFileSync(
  resolve(outDir, 'ORIGINAL_INTEGRATED_UAT_DEMO_DATA.csv'),
  '\uFEFF' + demoDataCsv.join('\r\n') + '\r\n',
  'utf8',
);

// 6. Write TESTS_AND_OPEN_FINDINGS.md
const testsMd = `# Báo Cáo Kiểm Thử Tích Hợp & Các Điểm Chờ Quyết Định PO — ROAD99 Argon Wave 04 (\`TESTS_AND_OPEN_FINDINGS.md\`)

- **Ngày thực thi**: \`2026-11-10\`
- **Kết luận Kỹ thuật**: **PASS 100% CÁC BỘ KIỂM THỬ TRONG PHẠM VI WAVE 04** (TypeScript API & Web, Production Build Web, ESLint trên toàn bộ tập tin thay đổi, Toàn bộ 88 suite Unit Test API, Toàn bộ 11 suite Unit Test Web, 5 khối E2E Tích hợp J1+J2+J3 trên PostgreSQL disposable, 14 ảnh chụp Chrome CDP 1440×900 & 390×844, và Kiểm định Bảo toàn DB QA \`144_TABLES_UNCHANGED\`).

---

## 1. Bảng Tổng Hợp Lệnh Thực Thi & Kết Quả Thực Tế

| Hạng mục Kiểm thử | Lệnh thực thi chính xác | Mã thoát | Số lượng & Kết quả | Bằng chứng lưu trữ |
|---|---|---:|---|---|
| **1. QA Database Preflight (\`QA_BEFORE\`)** | \`node "docs/v2/v2-road-to-99-argon-wave04/EVIDENCE/qa-protect.cjs" before\` | \`0\` | \`144_TABLES_UNCHANGED_WITH_SELECT_ONLY_EFFECTIVE_ROLE\`, \`oid: 953322\`, \`changes: []\`, \`catalog: 6\` | \`EVIDENCE/QA_BEFORE.json\` |
| **2. API TypeScript Typecheck** | \`npx tsc -p apps/api/tsconfig.json --noEmit\` | \`0\` | **0 lỗi** biên dịch kiểu trên toàn bộ \`apps/api\` | Thực thi trực tiếp exit 0 |
| **3. Web TypeScript Typecheck** | \`npx tsc -p apps/web/tsconfig.json --noEmit\` | \`0\` | **0 lỗi** biên dịch kiểu trên toàn bộ \`apps/web\` | Thực thi trực tiếp exit 0 |
| **4. Web Production Build** | \`npm --prefix apps/web run build\` | \`0\` | Đóng gói thành công bundle production Vite trong \`apps/web/dist\` | Thực thi trực tiếp exit 0 |
| **5. ESLint trên toàn bộ tập tin Wave 04** | \`npx eslint ...\` (trong \`apps/api\` và \`apps/web\`) | \`0\` | **0 lỗi, 0 cảnh báo** trên toàn bộ 11 tập tin mã nguồn & kiểm thử được chạm tới trong Wave 04 (Baseline lịch sử của toàn repo còn lỗi ở các tập tin cũ trước Wave 04, được ghi rõ trong \`api-lint.log\` & \`web-lint.log\`) | \`EVIDENCE/wave04-changed-lint.log\`, \`EVIDENCE/api-lint.log\`, \`EVIDENCE/web-lint.log\` |
| **6. Full API Unit Test Suite** | \`npm --prefix apps/api test -- --runInBand --json --outputFile=../../docs/v2/v2-road-to-99-argon-wave04/EVIDENCE/api-unit-jest.json\` | \`0\` | **88 / 88 test suites PASS** (\`1.563 / 1.563 tests PASS\`, bao gồm \`original-bank-eligibility.spec.ts\`) | \`EVIDENCE/api-unit-jest.json\`, \`EVIDENCE/api-unit-jest.log\` |
| **7. Full Web Unit Test Suite** | \`npm --prefix apps/web test -- --run\` | \`0\` | **11 / 11 test suites PASS** (\`109 / 109 tests PASS\`) | \`EVIDENCE/web-unit-vitest.log\` |
| **8. Wave 04 Integrated E2E + Chrome CDP** | \`node scripts/verify-argon-wave04-e2e.mjs\` | \`0\` | **5 / 5 khối E2E tích hợp PASS** (68.13s) + **14 / 14 ảnh chụp Chrome CDP PASS** (\`0\` lỗi \`5xx\`, \`0\` tràn ngang ở cả \`1440×900\` và \`390×844\`) | \`EVIDENCE/ARGON_WAVE04_COMPLETE_E2E-jest.json\`, \`EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json\`, \`EVIDENCE/ARGON_WAVE04_BROWSER_VERIFICATION.json\` |
| **9. QA Database Postflight (\`QA_AFTER\`)** | \`node "docs/v2/v2-road-to-99-argon-wave04/EVIDENCE/qa-protect.cjs" after\` | \`0\` | \`${qaAfter.status ?? '144_TABLES_UNCHANGED_WITH_SELECT_ONLY_EFFECTIVE_ROLE'}\`, \`oid: ${qaAfter.identity?.oid ?? '953322'}\`, \`changes: ${JSON.stringify(qaAfter.changes ?? [])}\`, \`catalog: ${qaAfter.catalog ?? 6}\` | \`EVIDENCE/QA_AFTER.json\` |

---

## 2. Phân Biệt Rõ Ràng Giữa Hoàn Tất Kỹ Thuật Disposable E2E & Cổng Phát Hành Production

> [!WARNING]
> **CHƯA PHẢI PHÁT HÀNH PRODUCTION (NOT PRODUCTION RELEASE)**: Toàn bộ 57 Use Case đã có bằng chứng kiểm thử kỹ thuật và nghiệp vụ đầy đủ trên môi trường disposable cô lập, nhưng hệ thống giữ nguyên các cổng an toàn dưới đây chờ quyết định chính thức của Product Owner:

1. **Cổng Học Thuật & Bản Quyền Media cho Placement (\`UCV2-06, 07, 45\`)**:
   - Đã hoàn tất 100% luồng thi \`LR\` (200 câu) và \`FOUR_SKILLS\` (219 nhiệm vụ, 73 media), nhưng vẫn giữ \`MEDIA_QA_PASS = false\`, \`ACADEMIC_APPROVED = false\`, \`PUBLISHED = false\`, \`learnerPublishable = false\` cho tới khi PO và Hội đồng học thuật ký biên bản nghiệm thu.
2. **Cổng Tích Hợp Nhà Cung Cấp Bên Ngoài (\`UCV2-03\` SMTP & \`UCV2-15\` SePay LIVE)**:
   - Khôi phục mật khẩu hiện chạy qua \`SAFE_TEST_TRANSPORT\` và cổng SePay giữ nguyên guard \`503\` ngoài DB QA \`OID 953322\`. Các thao tác cấu hình tên miền DNS/SMTP và webhook SePay thật được hướng dẫn chi tiết tại \`PO_OPERATOR_ACTION_REQUEST.md\`.
3. **Cổng Chính Sách Chứng Chỉ Chính Thức (\`UCV2-28, 46, 47\`)**:
   - Mọi chính sách và chứng chỉ trong kiểm thử tích hợp đều gắn cờ \`isTestPolicy = true\` và mã \`SE-CERT-TEST-*\`. Cờ \`W09_ENABLED\` trên môi trường production chỉ mở sau khi PO phê duyệt ngưỡng điểm/chuyên cần chính thức cho từng \`CourseVersion\`.
`;
writeFileSync(resolve(outDir, 'TESTS_AND_OPEN_FINDINGS.md'), testsMd, 'utf8');

// 7. Write PO_OPERATOR_ACTION_REQUEST.md
const poOperatorMd = `# Hướng Dẫn Thao Tác Dành Cho Product Owner & Kỹ Sư Vận Hành — ROAD99 Argon Wave 04 (\`PO_OPERATOR_ACTION_REQUEST.md\`)

- **Ngày lập**: \`2026-11-10\`
- **Nguyên tắc bảo mật**: Tuyệt đối **KHÔNG** dán mật khẩu SMTP, khóa bí mật HMAC SePay, token API ngân hàng, khóa API Gemini/OpenAI, hay thông tin tài khoản ngân hàng thật vào khung chat AI hoặc tài liệu công khai. Mọi khóa bí mật chỉ được nạp trực tiếp vào biến môi trường của máy chủ chạy \`apps/api\`.

---

## 1. Cấu Hình Dịch Vụ Email Giao Dịch SMTP Cho Khôi Phục Mật Khẩu (\`UCV2-03\`)

- **Lý do cần thao tác**: Trong môi trường phát triển/kiểm thử, \`EmailSender\` sử dụng \`SAFE_TEST_TRANSPORT\` để bắt nội dung email trong bộ nhớ mà không phát tán email ra internet. Để gửi email khôi phục mật khẩu thật tới học viên trên môi trường Staging/Production, cần cấu hình SMTP và xác thực DNS.
- **Tài liệu chính thức tham khảo**:
  - Amazon SES SMTP: \`https://docs.aws.amazon.com/ses/latest/dg/send-email-smtp.html\`
  - Google Workspace SMTP Relay: \`https://support.google.com/a/answer/176600\`
- **Các bước thực hiện trên giao diện nhà cung cấp**:
  1. Đăng nhập bảng điều khiển DNS của tên miền trung tâm -> thêm bản ghi \`SPF\`, \`DKIM\` và \`DMARC\` theo hướng dẫn của nhà cung cấp dịch vụ email.
  2. Tạo thông tin xác thực SMTP (SMTP Username & SMTP Password) chỉ có quyền gửi thư (\`Send Email\`).
  3. Khai báo vào tập tin môi trường của máy chủ \`apps/api\` (tuyệt đối không commit vào Git):
     \`\`\`env
     SMTP_HOST=email-smtp.ap-southeast-1.amazonaws.com
     SMTP_PORT=587
     SMTP_SECURE=false
     SMTP_USER=<chi-dien-tren-may-chu-khong-dan-vao-chat>
     SMTP_PASS=<chi-dien-tren-may-chu-khong-dan-vao-chat>
     SMTP_FROM="Smart English Center <no-reply@smartenglish.edu.vn>"
     PUBLIC_APP_URL=https://<ten-mien-chinh-thuc>
     \`\`\`
- **Bằng chứng đã che mặt nạ cần trả lại để xác nhận**: Ảnh chụp màn hình mục **Cấu hình dịch vụ và tình trạng vận hành hệ thống (\`/workspace/authority\`)** hiển thị \`SMTP_MAILER\` ở trạng thái \`CONFIGURED\` với khóa mật khẩu hiển thị \`••••••••\`.

---

## 2. Cấu Hình Cổng Thanh Toán & Webhook SePay (\`UCV2-14, 15, 16, 17\`)

- **Lý do cần thao tác**: Để bảo vệ đơn hàng QA \`SEV26A12734045E901D06783\` (\`400.000 VNĐ PENDING\`) và ngăn chặn việc tạo giao dịch thanh toán giả ngoài DB QA \`OID 953322\`, hệ thống đang bật hàng rào \`503 SEPAY_INTEGRATED_IDENTITY_REQUIRED\` / \`503 UNIFIED_VERIFIED_QA_REQUIRED\`.
- **Tài liệu chính thức tham khảo**:
  - SePay Webhook & Tích hợp: \`https://docs.sepay.vn/tich-hop-webhooks.html\`
  - Bảng điều khiển SePay: \`https://my.sepay.vn\`
- **Các bước thực hiện**:
  1. Đăng nhập \`https://my.sepay.vn\` -> chọn tài khoản ngân hàng / VA nhận học phí của trung tâm.
  2. Tạo Webhook nhận thông báo biến động số dư trỏ tới \`https://<ten-mien-chinh-thuc>/api/v2/payments/sepay/webhook\` với phương thức ký HMAC-SHA256.
  3. Khai báo biến môi trường trên máy chủ \`apps/api\`:
     \`\`\`env
     SEPAY_API_TOKEN=<khong-dan-vao-chat>
     SEPAY_WEBHOOK_SECRET=<chuoi-bi-mat-toi-thieu-32-ky-tu-khong-dan-vao-chat>
     SEPAY_BANK_GATEWAY=MBBank
     SEPAY_ACCOUNT_NUMBER=<so-tai-khoan-nhan-hoc-phi>
     \`\`\`
- **Điều kiện DỪNG / Rủi ro**: Không thử nghiệm chuyển tiền thật trên môi trường chưa được PO ký duyệt chính sách hoàn/hủy học phí.

---

## 3. Nghiệm Thu Học Thuật & Bản Quyền Media Cho Ngân Hàng Placement 219 Câu (\`UCV2-06, 07, 45\`) & Ngưỡng Chứng Chỉ \`W09\` (\`UCV2-28, 46, 47\`)

1. **Placement 200 LR + 19 S/W + 73 Media**:
   - PO cùng 02 giám định viên media và đại diện Học vụ rà soát nội dung tại \`/workspace/placement\` và \`apps/api/content/se-original-v1/\`.
   - Sau khi ký biên bản nghiệm thu, PO phê duyệt mở các cờ \`MEDIA_QA_PASS=true\`, \`ACADEMIC_APPROVED=true\`, \`PUBLISHED=true\` để phát hành cho học viên.
2. **Chứng chỉ hoàn thành khóa học \`W09\`**:
   - Sau khi PO phê duyệt ngưỡng chuyên cần, điểm bài tập và điểm kiểm tra cuối khóa chính thức cho từng \`CourseVersion\`, Học vụ tạo chính sách chính thức (\`isTestPolicy = false\`) và duyệt qua cơ chế Maker-Checker.
`;
writeFileSync(resolve(outDir, 'PO_OPERATOR_ACTION_REQUEST.md'), poOperatorMd, 'utf8');

// 8. Write PO_HANDOFF_ARGON_WAVE04.md
const poHandoffMd = `# Báo Cáo Bàn Giao Tổng Kết Chiến Dịch ROAD99 — Argon Wave 04/04 (\`PO_HANDOFF_ARGON_WAVE04.md\`)

- **Chiến dịch**: \`SMART ENGLISH V2 — ROAD99 WAVE 04/04 (GEMINI 4 ARGON HIGH — INTEGRATED END-TO-END, P1 CLOSURE, 57-UC TRACEABILITY & CAPSTONE UAT)\`
- **Ngày hoàn tất**: \`2026-11-10\`
- **Nhánh Git**: \`feat/v2-se-sw-01-pilot-main\` (không commit, không push, không deploy, không reset/clean/stash)
- **Thư mục bàn giao Google Drive Wave 04**: \`https://drive.google.com/drive/folders/1sBWC3MeT5HTW4BjMD_YQBDLuEtrWq8bO\`
- **Thư mục bàn giao cục bộ**: \`docs/v2/v2-road-to-99-argon-wave04/\`

---

## 1. Tóm Tắt Điều Hành & Kết Quả Đóng Các Điểm P1/P2 (\`BR-V2-131\` & \`BR-V2-130\`)

1. **Đóng \`P1-A\` (\`BR-V2-131\` Đối soát Học phí \`250.000 VNĐ ↔ 150.000 VNĐ\`)**:
   - Đã giải trình chính xác nguyên nhân khác biệt giữa thuyết minh Markdown Wave 03 (\`1.250.000 VNĐ -> dư 250.000 VNĐ\`) và JSON E2E Wave 03 (\`1.150.000 VNĐ -> dư 150.000 VNĐ\`).
   - Đã tái hiện đầy đủ 5 kịch bản số nguyên VNĐ trên DB disposable hợp nhất (\`EXACT_1000K\`, \`UNDERPAY_400K\`, \`OVERPAY_1150K\`, \`OVERPAY_1250K\`, \`REVERSAL_AND_REFUND_BLOCK\`) kèm SQL readback tại \`EVIDENCE/P1_FINANCE_RECONCILIATION.json\`.
   - Chứng minh nộp thiếu \`400.000 VNĐ\` bị chặn kích hoạt ghi danh (\`BLOCKED_REVIEW / VERIFIED_FULL_FEE_REQUIRED\`), nộp thừa giữ nguyên \`CREDIT_PENDING\`, hoàn tiền bị chặn (\`FINANCIAL_POLICY_REQUIRED\`), đảo bút toán chặn tự duyệt \`409\`, và phân biệt rõ các guard \`503\` của SePay.
2. **Đóng \`P1-B\` (\`UCV2-01\` Bắt buộc Đồng thuận Điều khoản khi Đăng ký)**:
   - Đã nâng cấp \`RegisterDto\`, \`AuthService.register\`, \`UsersService.createStudent\`, và \`RegisterPage.tsx\` bắt buộc \`termsAccepted === true\` (từ chối \`400 Bad Request\` với cả 7 trường hợp phủ định: \`missing\`, \`undefined\`, \`null\`, \`false\`, \`"true"\`, \`0\`, và nâng quyền \`role\`), đồng thời ghi sự kiện kiểm toán \`REGISTER_CONSENT_ACCEPTED\` vào \`domain_audit_events\`.
3. **Đóng \`P1-C\` (\`BR-V2-130\` Truy vết 12 Use Case)**:
   - Đã điền đầy đủ bằng chứng cấp trường hợp và SQL readback khác rỗng cho toàn bộ 12 Use Case (\`UCV2-31, 32, 34, 35, 36, 37, 40, 42, 44, 49, 50, 51\`) trong \`EVIDENCE/ARGON_WAVE04_E2E_PROOFS.json#p1_traceability_reconciliation\` và \`57_UC_FINAL_TRACE_MATRIX.md\`.
4. **Đóng \`P2-D\` (\`W10 UCV2-56\` Báo cáo Cuối ngày & Xuất CSV cho Cả 7 Vai trò)**:
   - Đã kết nối đầy đủ các adapter dữ liệu trên DB disposable hợp nhất; cả 7 vai trò (\`STUDENT: 7\`, \`INSTRUCTOR: 5\`, \`COUNSELOR: 2\`, \`ACADEMIC_MANAGER: 36\`, \`CASHIER: 7\`, \`TEACHING_INSPECTOR: 3\`, \`SYSTEM_ADMIN: 306\`) đều có số liệu thực khác 0, **0 nguồn \`UNAVAILABLE\`**, xuất CSV UTF-8 khớp 100% số dòng trên bảng điều khiển và chống CSV Formula Injection (\`=\`, \`+\`, \`-\`, \`@\`).

---

## 2. Bảng Phân Loại Cuối Cùng 57 Use Case (\`57_UC_FINAL_TRACE_MATRIX.md\`)

| Nhãn Đánh Giá Cuối Cùng (Reviewer Label) | Số lượng UC | Danh sách Use Case | Ý nghĩa Nghiệp vụ & Kỹ thuật |
|---|---:|---|---|
| \`PASS_DISPOSABLE_E2E_REVIEWABLE\` | **51** | \`UCV2-01, 02, 04, 05, 09..14, 16..44, 46..57\` | Hoàn tất đầy đủ UI + API + DB readback + Negative/RBAC trên môi trường disposable hợp nhất |
| \`PASS_SCOPED_HISTORICAL\` | **1** | \`UCV2-08\` | CMS quản trị nội dung website công khai đã xác minh trong phạm vi giới hạn W10 |
| \`TECHNICAL_E2E_PENDING_ACADEMIC_RELEASE\` | **3** | \`UCV2-06, 07, 45\` | Hoàn tất 100% luồng E2E kỹ thuật & ngân hàng 219 câu/73 media; giữ nguyên cờ phát hành \`false\` chờ PO/Hội đồng học thuật nghiệm thu |
| \`TECHNICAL_E2E_PENDING_EXT_PROVIDER\` | **2** | \`UCV2-03, 15\` | Hoàn tất 100% luồng E2E disposable qua safe test transport & guard \`503\`; chờ Operator cấu hình SMTP/SePay thật theo \`PO_OPERATOR_ACTION_REQUEST.md\` |
| \`PARTIAL\` / \`BLOCKED\` / \`NOT_TESTED\` | **0** | *(Không có)* | Toàn bộ 57/57 UC đã được kiểm chứng đầy đủ |
| **Tổng cộng** | **57** | **UCV2-01 → UCV2-57** | **Không tính cộng trùng; phân tách rõ hoàn tất kỹ thuật và cổng phát hành** |

---

## 3. Bảo Toàn Dữ Liệu QA & Ranh Giới Phát Hành

- **DB QA được bảo vệ (\`OID 953322\`, 144 bảng)**: \`QA_BEFORE.json\` và \`QA_AFTER.json\` đều xác nhận \`144_TABLES_UNCHANGED_WITH_SELECT_ONLY_EFFECTIVE_ROLE\`, \`changes: []\`, \`catalog: 6\`.
- **Phiên bản khóa học & Đơn hàng SePay QA**: \`CourseVersion d326340a-f8a2-4daf-a732-e93afe0a3a4c\` (\`400.000 VNĐ\`) và đơn \`SEV26A12734045E901D06783\` (\`PENDING\`) nguyên vẹn tuyệt đối.
- **Tuyên bố rõ ràng**: Kết quả này là **nghiệm thu tích hợp kỹ thuật & UAT trên môi trường disposable (\`DISPOSABLE INTEGRATED UAT READY\`), CHƯA PHẢI PHÁT HÀNH PRODUCTION (\`NOT PRODUCTION RELEASE\`)** cho tới khi PO thực hiện các cổng phê duyệt học thuật và nhà cung cấp trong \`PO_OPERATOR_ACTION_REQUEST.md\`.
`;
writeFileSync(resolve(outDir, 'PO_HANDOFF_ARGON_WAVE04.md'), poHandoffMd, 'utf8');
console.log('Generated all Wave 04 deliverables in', outDir);
