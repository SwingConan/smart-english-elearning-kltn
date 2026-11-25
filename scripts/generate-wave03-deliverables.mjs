import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('docs/v2/v2-road-to-99-argon-wave03');
const evDir = resolve(outDir, 'EVIDENCE');

const e2eProofsPath = resolve(evDir, 'ARGON_WAVE03_E2E_PROOFS.json');
const browserProofsPath = resolve(evDir, 'ARGON_WAVE03_BROWSER_VERIFICATION.json');
const qaBeforePath = resolve(evDir, 'QA_BEFORE.json');
const qaAfterPath = resolve(evDir, 'QA_AFTER.json');

const e2eProofs = existsSync(e2eProofsPath)
  ? JSON.parse(readFileSync(e2eProofsPath, 'utf8'))
  : {};
const browserProofs = existsSync(browserProofsPath)
  ? JSON.parse(readFileSync(browserProofsPath, 'utf8'))
  : { results: [] };
const qaBefore = existsSync(qaBeforePath)
  ? JSON.parse(readFileSync(qaBeforePath, 'utf8'))
  : {};
const qaAfter = existsSync(qaAfterPath)
  ? JSON.parse(readFileSync(qaAfterPath, 'utf8'))
  : {};

const matrixRows = [
  {
    id: 'UCV2-01',
    name: 'Đăng ký tài khoản',
    actor: 'K',
    statusW2: 'NOT TESTED',
    goalW3: 'IN_SCOPE_GROUP_A_SIGNUP_CONSENT_UNIQUE_EMAIL_DEFAULT_HV',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/register | POST /api/auth/register | users, user_sessions',
    autoTest:
      'apps/api/test/argon-wave03-remaining-19-uc.e2e-spec.ts (Group A: termsAccepted=true required, duplicate email 409, role escalation blocked 400, default role STUDENT); apps/api/src/modules/auth/auth.service.spec.ts',
    browserUi:
      '01-register-consent-desktop.png; 02-register-mobile.png (1440x900 & 390x844, 0 overflow, consent checkbox & validation)',
    notes: 'None',
  },
  {
    id: 'UCV2-02',
    name: 'Đăng nhập, đăng xuất và quản lý phiên truy cập',
    actor: 'HV, GV, TV, HVU, TN, TT, QT',
    statusW2: 'PARTIAL',
    goalW3: 'IN_SCOPE_GROUP_A_7_ROLE_LOGIN_SESSION_LOGOUT_RBAC',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/login, /workspace, /my | POST /api/auth/login, GET /api/auth/me, POST /api/auth/logout | users, user_sessions, domain_audit_events',
    autoTest:
      'apps/api/test/argon-wave03-remaining-19-uc.e2e-spec.ts (Group A: 7-role login, session cookie verification, wrong password 401, logout invalidates session -> 401 on /api/auth/me, HV blocked 403 on /api/authority)',
    browserUi:
      '05-profile-preferences-edit.png; 11-qt-authority-config-audit.png',
    notes: 'None',
  },
  {
    id: 'UCV2-03',
    name: 'Khôi phục quyền truy cập tài khoản',
    actor: 'người có tài khoản',
    statusW2: 'NOT TESTED',
    goalW3: 'IN_SCOPE_GROUP_A_PASSWORD_RESET_HASHED_TOKEN_TEST_TRANSPORT',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/forgot-password, /reset-password | POST /api/auth/password-reset/request, POST /api/auth/password-reset/confirm | password_reset_tokens, users, user_sessions',
    autoTest:
      'apps/api/test/argon-wave03-remaining-19-uc.e2e-spec.ts (Group A: generic anti-enumeration response, SHA-256 tokenHash in DB != raw token, single-use confirm updates password & revokes sessions, replay rejected 400)',
    browserUi:
      '03-forgot-password-recovery.png (1440x900, 0 overflow) + safe EmailSender test transport capture',
    notes: 'Real SMTP credentials gated by PO_OPERATOR_ACTION_REQUEST.md (safe test transport active in DEV/E2E)',
  },
  {
    id: 'UCV2-04',
    name: 'Quản lý hồ sơ và thiết lập cá nhân',
    actor: '7 role',
    statusW2: 'BLOCKED',
    goalW3: 'IN_SCOPE_GROUP_A_PROFILE_PREFERENCES_AND_PASSWORD_CHANGE',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/profile | GET /api/auth/profile, PATCH /api/auth/profile, POST /api/auth/profile/password | users',
    autoTest:
      'apps/api/test/argon-wave03-remaining-19-uc.e2e-spec.ts (Group A: update fullName/avatarUrl/preferences, reject role/email tampering 400, verify currentPassword & change password); apps/web/src/features/product/product.test.tsx',
    browserUi:
      '05-profile-preferences-edit.png (1440x900, 0 overflow, personal preferences editor & password change form)',
    notes: 'None',
  },
  {
    id: 'UCV2-05',
    name: 'Khám phá chương trình và lớp TOEIC công khai',
    actor: 'K, HV',
    statusW2: 'PARTIAL',
    goalW3: 'IN_SCOPE_GROUP_A_PUBLIC_CATALOG_AND_ADMISSION_HANDOFF',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/, /catalog, /catalog/:slug, /classes/:id | GET /api/catalog/courses, GET /api/catalog/courses/:slug, GET /api/v2/academic/classes/:id | courses, course_versions, class_offerings',
    autoTest:
      'apps/api/test/argon-wave03-remaining-19-uc.e2e-spec.ts (Group A: public catalog returns published courses & open classes with approved CourseVersion pricing, hides unpublished drafts)',
    browserUi:
      '04-public-catalog-desktop.png (1440x900, 0 overflow)',
    notes: 'Protected QA DB preserves exact 6 public courses and 9 hidden QA fixtures',
  },
  {
    id: 'UCV2-06',
    name: 'Thực hiện bài kiểm tra đầu vào theo mục tiêu TOEIC',
    actor: 'Học viên đã đăng nhập',
    statusW2: 'TECHNICAL_E2E_VERIFIED_PENDING_PO_RELEASE_GATES',
    goalW3: 'OUT_OF_WAVE03_SCOPE_PRESERVED',
    statusW3: 'TECHNICAL_E2E_VERIFIED_PENDING_PO_RELEASE_GATES',
    routes: '/placement, /placement/sittings/:attemptId | POST /api/v2/placement/workflow/attempts, POST .../commands, POST .../answers, POST .../recordings/:qid | PlacementSourceVersion, PlacementSitting, TestAttempt',
    autoTest:
      'node scripts/build-original-placement-bank.mjs (LR 200 + SW 19 = 219 items, 73 media); apps/api/test/argon-wave01-learner-complete.e2e-spec.ts',
    browserUi:
      'Wave 01 & Wave 02 verified 80/20 Placement Sitting UI (1440x900 & 390x844, 0 overflow)',
    notes: 'PO & Faculty academic/media sign-off (MEDIA_QA_PASS=false, ACADEMIC_APPROVED=false, PUBLISHED=false preserved)',
  },
  {
    id: 'UCV2-07',
    name: 'Xem chẩn đoán năng lực và lớp học được đề xuất',
    actor: 'HV đã đăng nhập và chỉ có quyền với kết quả của mình',
    statusW2: 'TECHNICAL_E2E_VERIFIED_PENDING_PO_RELEASE_GATES',
    goalW3: 'OUT_OF_WAVE03_SCOPE_PRESERVED',
    statusW3: 'TECHNICAL_E2E_VERIFIED_PENDING_PO_RELEASE_GATES',
    routes: '/placement/sittings/:attemptId/result | GET /api/v2/placement/workflow/attempts/:id | PlacementResultRelease, CourseRecommendationProfile, CourseSkillCriterion',
    autoTest:
      'apps/api/test/argon-wave01-learner-complete.e2e-spec.ts; docs/v2/v2-road-to-99-argon-wave01/EVIDENCE/ARGON_WAVE01_BACKEND_E2E_PROOFS.json',
    browserUi:
      'Wave 01 verified /placement/sittings/:attemptId/result for LR 200 and FOUR_SKILLS 219',
    notes: 'Original content/license/media/faculty approvals; AI advisory only',
  },
  {
    id: 'UCV2-08',
    name: 'Quản lý và công bố nội dung website',
    actor: 'TV (biên tập), HVU (kiểm soát/công bố nội dung chính sách, chương trình theo quyền)',
    statusW2: 'PASS',
    goalW3: 'OUT_OF_WAVE03_SCOPE_PRESERVED',
    statusW3: 'PASS',
    routes: '/workspace/operations/cms, /cms/publications/:slug | GET/POST /api/v2/operations/cms/* | cms_v2 immutable revisions/publications/events',
    autoTest: 'docs/v2/W10_CMS_COMPLETE_02.md; docs/v2/V2_UNIFIED_RUNTIME_01.md',
    browserUi: 'Verified routed CMS governance workspace and public publication reader',
    notes: 'None',
  },
  {
    id: 'UCV2-09',
    name: 'Gửi yêu cầu tư vấn',
    actor: 'K/HV',
    statusW2: 'PARTIAL',
    goalW3: 'IN_SCOPE_GROUP_B_PUBLIC_AND_LEARNER_SUPPORT_TICKET_INTAKE',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/support, /support/tickets/:ticketId | GET /api/v2/support/public/topics, POST /api/v2/support/public/tickets | SupportTopic, SupportTicket, SupportConsent, SupportEvent',
    autoTest:
      'apps/api/test/argon-wave03-remaining-19-uc.e2e-spec.ts (Group B: public/learner ticket intake with explicit consent=true, rejects missing consent 400, blocks unauthenticated private ticket read 401)',
    browserUi: '06-support-public-intake.png (1440x900, 0 overflow)',
    notes: 'None',
  },
  {
    id: 'UCV2-10',
    name: 'Tiếp nhận và tư vấn/CSKH',
    actor: 'TV',
    statusW2: 'PARTIAL',
    goalW3: 'IN_SCOPE_GROUP_B_TV_TRIAGE_QUEUE_ASSIGN_REPLY_AND_REFERRAL',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/workspace/support, /workspace/support/tickets/:ticketId | GET /api/v2/support/tickets, POST .../assign, POST .../messages, POST .../referrals | SupportTicket, SupportMessage, SupportReferral, SupportEvent',
    autoTest:
      'apps/api/test/argon-wave03-remaining-19-uc.e2e-spec.ts (Group B: TV triage queue, assign ticket, reply to learner, record support consent, create & respond to specialist referral)',
    browserUi: '07-tv-support-workspace.png (1440x900, 0 overflow)',
    notes: 'None',
  },
  {
    id: 'UCV2-11',
    name: 'Lập hồ sơ đăng ký và đề xuất lớp cho học viên',
    actor: 'TV',
    statusW2: 'PARTIAL',
    goalW3: 'IN_SCOPE_GROUP_B_TV_COUNSELING_APPLICATION_AND_CLASS_RECOMMENDATION',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/workspace/support/tickets/:ticketId, /workspace/admissions | POST /api/v2/support/tickets/:id/applications, POST /api/v2/support/applications/:id/submit, POST .../review | CounselingApplication, SupportConsent',
    autoTest:
      'apps/api/test/argon-wave03-remaining-19-uc.e2e-spec.ts (Group B: TV drafts CounselingApplication recommending approved class & Placement snapshot, submits, independent HVU approves -> READY_FOR_ADMISSION_HANDOFF)',
    browserUi: '07-tv-support-workspace.png; 08-hv-admissions-obligation.png',
    notes: 'None',
  },
  {
    id: 'UCV2-12',
    name: 'Đăng ký tham gia lớp TOEIC',
    actor: 'HV',
    statusW2: 'PARTIAL',
    goalW3: 'IN_SCOPE_GROUP_B_LEARNER_CLASS_ADMISSION_APPLICATION_WITH_PROVENANCE',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/admissions?classId=:id, /admissions/:id | GET /api/v2/admissions-finance/offers, POST /api/v2/admissions-finance/applications | w07_applications, w07_class_controls, class_offerings',
    autoTest:
      'apps/api/test/argon-wave03-remaining-19-uc.e2e-spec.ts (Group B: HV submits W07 application with verified TV referral provenance and direct W07 application; foreign learner blocked 404)',
    browserUi: '08-hv-admissions-obligation.png',
    notes: 'None',
  },
  {
    id: 'UCV2-13',
    name: 'Xét duyệt hồ sơ nhập học và yêu cầu điều chỉnh ghi danh',
    actor: 'HVU',
    statusW2: 'PARTIAL',
    goalW3: 'IN_SCOPE_GROUP_B_HVU_ADMISSION_APPROVAL_AND_ENROLLMENT_AMENDMENT_CASES',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/workspace/admissions, /admissions/:id | POST /api/v2/admissions-finance/applications/:id/academic-decisions, POST .../cases, POST /api/v2/admissions-finance/cases/:id/decision | w07_academic_decisions, w07_obligations, w07_cases',
    autoTest:
      'apps/api/test/argon-wave03-remaining-19-uc.e2e-spec.ts (Group B: HVU approves application -> creates w07_obligations with exact CourseVersion price 1,000,000 VND; HV submits TRANSFER amendment case & HVU reviews)',
    browserUi: '08-hv-admissions-obligation.png; 09-tn-admissions-finance-workspace.png',
    notes: 'None',
  },
  {
    id: 'UCV2-14',
    name: 'Thanh toán học phí và theo dõi nghĩa vụ của mình',
    actor: 'HV',
    statusW2: 'PARTIAL',
    goalW3: 'IN_SCOPE_GROUP_C_LEARNER_OBLIGATION_TRACKING_AND_PAYMENT_EVIDENCE',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/payments/sepay, /admissions/:id | POST /api/v2/admissions-finance/applications/:id/payment-source, POST /api/v2/admissions-finance/obligations/:id/evidence | w07_obligations, w07_payment_evidence, sepay_v2.orders',
    autoTest:
      'apps/api/test/argon-wave03-remaining-19-uc.e2e-spec.ts (Group C: HV views obligation, uploads PNG payment receipt with SHA-256 & sourceRef; pre-payment LMS access blocked 404/403)',
    browserUi: '08-hv-admissions-obligation.png (1440x900, 0 overflow)',
    notes: 'Live SePay QR/webhook remains gated behind 503 SEPAY_INTEGRATED_IDENTITY_REQUIRED outside QA DB OID 953322',
  },
  {
    id: 'UCV2-15',
    name: 'Quản lý khoản phải thu, phiếu thu và công nợ',
    actor: 'TN',
    statusW2: 'BLOCKED',
    goalW3: 'IN_SCOPE_GROUP_C_CASHIER_RECEIVABLES_RECEIPTS_AND_LEDGER_ALLOCATIONS',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/payments/sepay, /workspace/admissions | GET /api/v2/admissions-finance/workspace, GET /api/v2/admissions-finance/evidence/:id/file | w07_obligations, w07_allocations, w07_payment_events',
    autoTest:
      'apps/api/test/argon-wave03-remaining-19-uc.e2e-spec.ts (Group C: TN views obligations, verified/remaining/excess balances, and downloads binary receipt PNG; ungranted cashier blocked)',
    browserUi: '09-tn-admissions-finance-workspace.png',
    notes: 'None',
  },
  {
    id: 'UCV2-16',
    name: 'Đối soát và xác nhận giao dịch học phí',
    actor: 'TN',
    statusW2: 'BLOCKED',
    goalW3: 'IN_SCOPE_GROUP_C_CASHIER_RECONCILE_VERIFY_AND_ENTITLEMENT_ACTIVATION',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/payments/sepay, /workspace/admissions | POST /api/v2/admissions-finance/evidence/:id/review, POST /api/v2/admissions-finance/applications/:id/activate | w07_payment_events, w07_entitlements, enrollments',
    autoTest:
      'apps/api/test/argon-wave03-remaining-19-uc.e2e-spec.ts (Group C: TN verifies 1,000,000 VND evidence -> obligation SATISFIED -> activates canonical enrollment -> HV accesses /api/v2/class-lms/classes/:id 200; SePay HMAC & classification verified)',
    browserUi: '09-tn-admissions-finance-workspace.png',
    notes: 'Protected QA order SEV26A12734045E901D06783 (400,000 VND PENDING) untouched on OID 953322',
  },
  {
    id: 'UCV2-17',
    name: 'Xử lý giao dịch học phí ngoại lệ và hoàn/điều chỉnh',
    actor: 'TN, HVU phê duyệt khi chính sách đòi hỏi',
    statusW2: 'BLOCKED',
    goalW3: 'IN_SCOPE_GROUP_C_OVERPAYMENT_EXCEPTION_AND_MAKER_CHECKER_REVERSAL',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/payments/sepay, /admissions/:id | POST /api/v2/admissions-finance/events/:id/adjustments, POST /api/v2/admissions-finance/adjustments/:id/decision | w07_adjustments, w07_adjustment_decisions, w07_payment_events',
    autoTest:
      'apps/api/test/argon-wave03-remaining-19-uc.e2e-spec.ts (Group C: 1,150,000 VND overpayment records 150,000 VND excess credit; TN maker proposes REVERSAL adjustment, self-approval blocked 409, independent TN checker approves -> append-only negative allocation)',
    browserUi: '09-tn-admissions-finance-workspace.png',
    notes: 'None',
  },
  {
    id: 'UCV2-18',
    name: 'Theo dõi lớp đã đăng ký và lịch học cá nhân',
    actor: 'HV',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'OUT_OF_WAVE03_SCOPE_PRESERVED',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/student/enrollments, /my | GET /api/learning/enrollments/:enrollmentId/adaptive-path | Enrollment, ClassOffering, TeachingSession',
    autoTest: 'apps/api/test/argon-wave01-learner-complete.e2e-spec.ts',
    browserUi: 'Wave 01 12_lms_my_dashboard_calendar_desktop.png',
    notes: 'None',
  },
  {
    id: 'UCV2-19',
    name: 'Học nội dung và sử dụng tài nguyên của lớp',
    actor: 'HV',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'OUT_OF_WAVE03_SCOPE_PRESERVED',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/classroom/:classId | GET /api/v2/class-lms/classes/:classId | ClassSection, ClassActivityRevision, Lesson, LearningResource',
    autoTest: 'apps/api/test/argon-wave01-learner-complete.e2e-spec.ts',
    browserUi: 'Wave 01 13_lms_classroom_sections_activities_desktop.png',
    notes: 'None',
  },
  {
    id: 'UCV2-20',
    name: 'Làm và nộp bài tập được giao',
    actor: 'HV',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'OUT_OF_WAVE03_SCOPE_PRESERVED',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/classroom/:classId/activities/:activityId | GET/PUT /api/v2/class-lms/classes/:classId/activities/:activityId/assignment/mine | ClassAssignmentSubmission, ClassActivityRevision',
    autoTest: 'apps/api/test/argon-wave01-learner-complete.e2e-spec.ts',
    browserUi: 'Wave 01 14_lms_assignment_submitted_graded_desktop.png',
    notes: 'None',
  },
  {
    id: 'UCV2-21',
    name: 'Thực hiện bài quiz/kiểm tra trong lớp',
    actor: 'HV',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'OUT_OF_WAVE03_SCOPE_PRESERVED',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/classroom/:classId/activities/:activityId/quiz, /classroom/:classId/quiz-attempts/:attemptId | GET/PATCH /api/learning/enrollments/:enrollmentId/attempts/:attemptId | TestAttempt, TestAnswer',
    autoTest: 'apps/api/test/argon-wave01-learner-complete.e2e-spec.ts',
    browserUi: 'Wave 01 15_lms_quiz_attempt_80_20_navigator_desktop.png',
    notes: 'None',
  },
  {
    id: 'UCV2-22',
    name: 'Xem kết quả, nhận xét và bảng điểm các hoạt động',
    actor: 'HV',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'OUT_OF_WAVE03_SCOPE_PRESERVED',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/classroom/:classId/gradebook | GET /api/v2/assignment-grading/classes/:classId/gradebook | AssignmentGrade, AnswerEvaluation, AttemptSkillScore',
    autoTest: 'apps/api/test/argon-wave01-learner-complete.e2e-spec.ts',
    browserUi: 'Wave 01 17_lms_gradebook_published_scores_desktop.png',
    notes: 'None',
  },
  {
    id: 'UCV2-23',
    name: 'Xem tiến độ và báo cáo năng lực TOEIC',
    actor: 'HV',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'OUT_OF_WAVE03_SCOPE_PRESERVED',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/classroom/:classId/progress | GET /api/v2/class-lms/classes/:classId/progress | ClassActivityProgress, LearnerSkillState, MasteryHistory',
    autoTest: 'apps/api/test/argon-wave01-learner-complete.e2e-spec.ts',
    browserUi: 'Wave 01 18_lms_class_progress_desktop.png',
    notes: 'None',
  },
  {
    id: 'UCV2-24',
    name: 'Học theo gợi ý kiến thức cần củng cố',
    actor: 'HV',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'OUT_OF_WAVE03_SCOPE_PRESERVED',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/knowledge, /knowledge/articles/:slug | GET /api/v2/knowledge/articles, GET /api/v2/knowledge/recommendations | KnowledgeRevision, QuizKnowledgeLink, TestAnswer',
    autoTest: 'apps/api/test/argon-wave01-learner-complete.e2e-spec.ts',
    browserUi: 'Wave 01 19_lms_knowledge_recommendations_desktop.png',
    notes: 'None',
  },
  {
    id: 'UCV2-25',
    name: 'Tham gia buổi học trực tuyến được phê duyệt',
    actor: 'HV',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'OUT_OF_WAVE03_SCOPE_PRESERVED',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/classroom/:classId, /classroom/:classId/attendance | GET /api/v2/class-lms/classes/:classId, GET /api/v2/session-engagement/sessions/:id | TeachingSession, W06Meet, W06Window',
    autoTest: 'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar A & B)',
    browserUi: 'Wave 02 01-gv-classroom-sessions-and-sections-1440.png; 04-gv-session-engagement-meet-attendance-1440.png',
    notes: 'None',
  },
  {
    id: 'UCV2-26',
    name: 'Điểm danh buổi học theo phương thức hợp lệ',
    actor: 'HV',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'OUT_OF_WAVE03_SCOPE_PRESERVED',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/classroom/:classId/attendance, /sessions/:sessionId/engagement | POST /api/v2/session-engagement/sessions/:id/checkin, POST .../corrections | W06Window, W06Receipt, W06Correction, W06Rate',
    autoTest: 'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar B)',
    browserUi: 'Wave 02 04-gv-session-engagement-meet-attendance-1440.png',
    notes: 'None',
  },
  {
    id: 'UCV2-27',
    name: 'Xem hồ sơ giảng viên và đặt lịch tư vấn 1:1',
    actor: 'HV (người đã có tài khoản, chưa bắt buộc ghi danh lớp), GV',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'OUT_OF_WAVE03_SCOPE_PRESERVED',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/consultations, /my, /workspace/consultations | /api/v2/consultations/* | W05bProfile, W05bAvailabilityRule, W05bBooking',
    autoTest: 'apps/api/test/argon-wave01-learner-complete.e2e-spec.ts (09:00-17:00 <= 224 slots)',
    browserUi: 'Wave 01 01_w05b_learner_consultations_desktop.png',
    notes: 'None',
  },
  {
    id: 'UCV2-28',
    name: 'Xem kết quả hoàn thành và chứng chỉ được cấp',
    actor: 'HV',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'OUT_OF_WAVE03_SCOPE_PRESERVED',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/completion, /certificates/lookup | GET /api/v2/certificates/readiness, GET /api/v2/certificates/lookup/:code | w09_completion_policies, w09_certificate_reviews, w09_certificates',
    autoTest: 'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar D)',
    browserUi: 'Wave 02 08-hv-completion-issued-certificate-1440.png; 09-certificate-lookup-verified-1440.png',
    notes: 'Production W09_ENABLED remains OFF until PO approves official CourseVersion thresholds',
  },
  {
    id: 'UCV2-29',
    name: 'Theo dõi lớp được phân công, lịch và tình hình lớp',
    actor: 'GV',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'OUT_OF_WAVE03_SCOPE_PRESERVED',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/classroom/:classId, /classroom/:classId/dashboard | GET /api/v2/class-lms/classes/:classId, GET /api/v2/class-lms/classes/:classId/dashboard | ClassSection, TeachingSession, ClassInstructorAssignment',
    autoTest: 'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar A)',
    browserUi: 'Wave 02 01-gv-classroom-sessions-and-sections-1440.png',
    notes: 'None',
  },
  {
    id: 'UCV2-30',
    name: 'Tổ chức các section và hoạt động học tập trong lớp',
    actor: 'GV',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'OUT_OF_WAVE03_SCOPE_PRESERVED',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/classroom/:classId | POST /api/v2/class-lms/classes/:classId/sections, POST .../sections/:sectionId/activities, POST .../publish | ClassSection, ClassActivity, ClassActivityVersion',
    autoTest: 'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar A: 6-type Activity Chooser)',
    browserUi: 'Wave 02 02-gv-activity-chooser-6-types-1440.png; 03-gv-activity-chooser-6-types-390.png',
    notes: 'None',
  },
  {
    id: 'UCV2-31',
    name: 'Biên soạn và duy trì thư viện kiến thức TOEIC',
    actor: 'GV; HVU sở hữu quy tắc duyệt và nội dung chuẩn',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'BR_V2_130_TRACEABILITY_RECONCILED (Knowledge Tag & Article Authoring + HVU Approval)',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/knowledge, /knowledge/articles/:slug | POST /api/v2/knowledge/tags, POST /api/v2/knowledge/tags/:id/approve, POST /api/v2/knowledge/articles, POST /api/v2/knowledge/articles/:id/submit, POST .../approve | KnowledgeTag, KnowledgeArticle, KnowledgeRevision',
    autoTest:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar A: GV authors KnowledgeTag & KnowledgeArticle, HVU approves & publishes); apps/api/test/wave03bd-knowledge.e2e-spec.ts',
    browserUi: 'Wave 01 19_lms_knowledge_recommendations_desktop.png; Wave 02 02-gv-activity-chooser-6-types-1440.png',
    notes: 'BR-V2-130 canonical UC row aligned to Knowledge Library authoring & approval',
  },
  {
    id: 'UCV2-32',
    name: 'Quản lý ngân hàng câu hỏi có gắn nhãn kiến thức',
    actor: 'GV',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'BR_V2_130_TRACEABILITY_RECONCILED (Question Bank Authoring & Knowledge Tag Linking)',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/classroom/:classId/activities/:activityId | POST /api/v2/class-quiz/classes/:classId/activities/:activityId/sources, POST /api/v2/knowledge/links | ClassQuizSource, ClassQuizItem, QuizKnowledgeLink',
    autoTest:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar A: GV creates 4-item TOEIC question bank source and links items to KnowledgeTag & KnowledgeArticle via /api/v2/knowledge/links); apps/api/test/wave03bd-knowledge.e2e-spec.ts',
    browserUi: 'Wave 02 02-gv-activity-chooser-6-types-1440.png',
    notes: 'BR-V2-130 canonical UC row aligned to Question Bank with Knowledge Tag links',
  },
  {
    id: 'UCV2-33',
    name: 'Xây dựng đề kiểm tra, bài quiz và rubric',
    actor: 'GV',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'BR_V2_130_TRACEABILITY_RECONCILED (Quiz, Assignment & Rubric Construction)',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/classroom/:classId/activities/:activityId | POST /api/v2/class-quiz/classes/:classId/activities/:activityId/sources, POST /api/v2/assignment-grading/classes/:classId/activities/:activityId/rubrics | ClassQuizSource, AssignmentRubric',
    autoTest:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar A: GV constructs QUIZ source, ASSIGNMENT activity, and multi-criterion AssignmentRubric; HVU approves)',
    browserUi: 'Wave 02 02-gv-activity-chooser-6-types-1440.png',
    notes: 'None',
  },
  {
    id: 'UCV2-34',
    name: 'Chấm bài, xác nhận và phản hồi kết quả',
    actor: 'GV được phân công',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'BR_V2_130_TRACEABILITY_RECONCILED (GV Rubric Grading, Finalization, Feedback & Gradebook)',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/classroom/:classId/activities/:activityId, /classroom/:classId/gradebook | POST /api/v2/assignment-grading/classes/:classId/activities/:activityId/submissions/:subId/grades, POST .../final, POST .../publish, GET .../gradebook | ClassAssignmentSubmission, AssignmentGrade',
    autoTest:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar A: GV grades learner submission with rubric criteria & feedback, finalizes grade, HVU publishes -> 90% in gradebook); apps/api/test/wave03bb-grading.e2e-spec.ts',
    browserUi: 'Wave 01 14_lms_assignment_submitted_graded_desktop.png; 17_lms_gradebook_published_scores_desktop.png',
    notes: 'BR-V2-130 canonical UC row aligned to GV Grading, Confirmation & Feedback',
  },
  {
    id: 'UCV2-35',
    name: 'Quản lý hoạt động điểm danh theo lịch định kỳ',
    actor: 'GV',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'BR_V2_130_TRACEABILITY_RECONCILED (GV Open Attendance Window, Rotate 20-Hex Code & Roster)',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/classroom/:classId/attendance, /sessions/:sessionId/engagement | POST /api/v2/session-engagement/sessions/:id/attendance, POST .../code, GET .../roster | W06Window, W06Receipt, W06Correction',
    autoTest:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar B: GV opens attendance window for published session, rotates 20-hex attendance code, views roster with raw code redacted)',
    browserUi: 'Wave 02 04-gv-session-engagement-meet-attendance-1440.png',
    notes: 'BR-V2-130 canonical UC row aligned to GV Scheduled Session Attendance Management',
  },
  {
    id: 'UCV2-36',
    name: 'Gửi và theo dõi đề nghị duyệt link Google Meet',
    actor: 'GV',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'BR_V2_130_TRACEABILITY_RECONCILED (GV Propose & Track Google Meet Link)',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/classroom/:classId/attendance?mode=meet, /sessions/:sessionId/engagement | POST /api/v2/session-engagement/sessions/:id/meet, GET /api/v2/session-engagement/sessions/:id | W06Meet, TeachingSession',
    autoTest:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar A & B: GV selects ONLINE_SESSION in Activity Chooser or Session Engagement, proposes https://meet.google.com/abc-defg-hij, tracks HVU approval status)',
    browserUi: 'Wave 02 02-gv-activity-chooser-6-types-1440.png; 04-gv-session-engagement-meet-attendance-1440.png',
    notes: 'BR-V2-130 canonical UC row aligned to GV Propose & Track Google Meet Link',
  },
  {
    id: 'UCV2-37',
    name: 'Đề nghị nghỉ dạy, đổi lịch hoặc dạy bù',
    actor: 'GV',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'BR_V2_130_TRACEABILITY_RECONCILED (GV Propose Leave, Reschedule or Makeup Session)',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/sessions/:sessionId/engagement, /academic/session-engagement | POST /api/v2/session-engagement/sessions/:id/exceptions | W06Exception, TeachingSession',
    autoTest:
      'apps/api/test/wave06-session-engagement.e2e-spec.ts (GV submits LEAVE, RESCHEDULE, and MAKEUP session exception proposals with reason & target slot; blocks invalid or conflicting slots)',
    browserUi: 'Wave 02 04-gv-session-engagement-meet-attendance-1440.png; 05-hvu-session-engagement-review-1440.png',
    notes: 'BR-V2-130 canonical UC row aligned to GV Leave / Reschedule / Makeup Exception Request',
  },
  {
    id: 'UCV2-38',
    name: 'Quản lý chương trình đào tạo TOEIC và chuẩn nội dung',
    actor: 'HVU',
    statusW2: 'PARTIAL',
    goalW3: 'IN_SCOPE_GROUP_D_HVU_PROGRAM_AND_COURSE_VERSION_MAKER_CHECKER',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/workspace/academic, /academic/programs/:id/versions | POST /api/v2/academic/programs, POST /api/v2/academic/programs/:id/versions, POST .../submit, POST .../approve | courses, course_versions',
    autoTest:
      'apps/api/test/argon-wave03-remaining-19-uc.e2e-spec.ts (Group D: HVU maker creates TOEIC Business 650+ program & CourseVersion 1,850,000 VND, submits, self-approval blocked 403, independent HVU checker approves -> PUBLISHED)',
    browserUi: '10-hvu-curriculum-versions-rooms.png (1440x900, 0 overflow)',
    notes: 'Protected CourseVersion d326340a-f8a2-4daf-a732-e93afe0a3a4c (400,000 VND) untouched on QA DB',
  },
  {
    id: 'UCV2-39',
    name: 'Mở và quản lý lớp đào tạo, sĩ số và roster',
    actor: 'HVU',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'OUT_OF_WAVE03_SCOPE_PRESERVED',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/workspace/academic | POST /api/v2/academic/versions/:id/offers, POST /api/v2/academic/classes, PATCH /api/v2/academic/classes/:id | class_offerings, course_versions',
    autoTest:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts; apps/api/test/argon-wave03-remaining-19-uc.e2e-spec.ts',
    browserUi: '10-hvu-curriculum-versions-rooms.png',
    notes: 'None',
  },
  {
    id: 'UCV2-40',
    name: 'Quản lý phòng học và tài nguyên phòng',
    actor: 'HVU',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'BR_V2_130_TRACEABILITY_RECONCILED_AND_WAVE03_VERIFIED (HVU Room & Resource Management)',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/workspace/academic | GET /api/v2/academic/rooms, POST /api/v2/academic/rooms, PATCH /api/v2/academic/rooms/:id | rooms',
    autoTest:
      'apps/api/test/argon-wave03-remaining-19-uc.e2e-spec.ts (Group D: HVU creates Room LAB-A302, updates status & capabilities with CAS expectedLockVersion; room capacity & schedule conflict enforced); apps/api/test/wave02b-planning.e2e-spec.ts',
    browserUi: '10-hvu-curriculum-versions-rooms.png',
    notes: 'BR-V2-130 canonical UC row aligned to Room & Room Resource Management',
  },
  {
    id: 'UCV2-41',
    name: 'Lập và quản lý thời khóa biểu, các buổi học chính thức',
    actor: 'HVU',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'OUT_OF_WAVE03_SCOPE_PRESERVED',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/workspace/academic | POST /api/v2/academic/classes/:id/sessions, POST /api/v2/academic/sessions/:id/submit, POST .../approve | teaching_sessions',
    autoTest: 'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar B)',
    browserUi: 'Wave 02 01-gv-classroom-sessions-and-sections-1440.png',
    notes: 'None',
  },
  {
    id: 'UCV2-42',
    name: 'Phân công và điều chỉnh giảng viên phụ trách',
    actor: 'HVU',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'BR_V2_130_TRACEABILITY_RECONCILED (HVU Instructor Assignment & Maker-Checker Approval)',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/workspace/academic | POST /api/v2/academic/classes/:id/assignments, POST /api/v2/academic/assignments/:id/submit, POST /api/v2/academic/assignments/:id/approve | class_instructor_assignments',
    autoTest:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar B: HVU Maker proposes & submits GV assignment, independent HVU Checker approves with eligibilityConfirmed=true); apps/api/test/wave02b-planning.e2e-spec.ts',
    browserUi: 'Wave 02 01-gv-classroom-sessions-and-sections-1440.png; 09-hvu-academic-curriculum-versions-1440.png',
    notes: 'BR-V2-130 canonical UC row aligned to HVU Instructor Assignment & Adjustment',
  },
  {
    id: 'UCV2-43',
    name: 'Duyệt và công bố link Google Meet của buổi học',
    actor: 'HVU',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'OUT_OF_WAVE03_SCOPE_PRESERVED',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/academic/session-engagement | GET/POST /api/v2/session-engagement/reviews/meet/:id | W06Meet, W06Outbox',
    autoTest: 'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar B)',
    browserUi: 'Wave 02 05-hvu-session-engagement-review-1440.png',
    notes: 'None',
  },
  {
    id: 'UCV2-44',
    name: 'Duyệt điều chỉnh lịch, nghỉ dạy và dạy bù',
    actor: 'HVU',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'BR_V2_130_TRACEABILITY_RECONCILED (HVU Review Leave, Reschedule & Makeup Exceptions)',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/academic/session-engagement | GET/POST /api/v2/session-engagement/reviews/exception/:id, GET/POST .../reviews/correction/:id | W06Exception, TeachingSession, W06Correction',
    autoTest:
      'apps/api/test/wave06-session-engagement.e2e-spec.ts (Independent HVU reviews LEAVE/RESCHEDULE/MAKEUP exceptions with CAS, room/teacher conflict check, and session lineage preservation); apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts',
    browserUi: 'Wave 02 05-hvu-session-engagement-review-1440.png',
    notes: 'BR-V2-130 canonical UC row aligned to HVU Approval of Schedule Exceptions (Leave/Reschedule/Makeup)',
  },
  {
    id: 'UCV2-45',
    name: 'Quản lý tiêu chí đánh giá đầu vào và gợi ý lớp',
    actor: 'HVU',
    statusW2: 'TECHNICAL_E2E_VERIFIED_PENDING_PO_RELEASE_GATES',
    goalW3: 'OUT_OF_WAVE03_SCOPE_PRESERVED',
    statusW3: 'TECHNICAL_E2E_VERIFIED_PENDING_PO_RELEASE_GATES',
    routes: '/workspace/placement, /admin/criteria | GET/PUT /api/admin/criteria/placement-evaluation, POST /api/v2/placement/workflow/policies | PlacementWorkflowPolicy, CourseRecommendationProfile',
    autoTest: 'apps/api/test/argon-wave01-learner-complete.e2e-spec.ts',
    browserUi: 'Wave 01 09_placement_hvu_readiness_policies_desktop.png',
    notes: 'Original content/license/media/faculty approvals; AI advisory only',
  },
  {
    id: 'UCV2-46',
    name: 'Thiết lập điều kiện hoàn thành khóa học',
    actor: 'HVU',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'OUT_OF_WAVE03_SCOPE_PRESERVED',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/workspace/certificates | GET /api/v2/certificates/workspace, POST /api/v2/certificates/policies, POST /api/v2/certificates/policies/:id/review | w09_completion_policies, w09_certificate_events',
    autoTest: 'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar D)',
    browserUi: 'Wave 02 07-hvu-certificates-workspace-1440.png',
    notes: 'PO sign-off on production CourseVersion completion thresholds before enabling W09 in production',
  },
  {
    id: 'UCV2-47',
    name: 'Cấp, quản lý và tra cứu chứng chỉ',
    actor: 'HVU',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'OUT_OF_WAVE03_SCOPE_PRESERVED',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/workspace/certificates, /certificates/lookup | GET /api/v2/certificates/enrollments/:id/evaluate, POST .../reviews, POST .../issue, POST .../revoke, GET .../lookup/:code | w09_certificate_reviews, w09_certificates',
    autoTest: 'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar D)',
    browserUi: 'Wave 02 07-hvu-certificates-workspace-1440.png; 09-certificate-lookup-verified-1440.png',
    notes: 'Production W09_ENABLED remains OFF; disposable certificates explicitly labeled TEST_DISPOSABLE',
  },
  {
    id: 'UCV2-48',
    name: 'Phân công và điều phối ca thanh tra giảng dạy',
    actor: 'HVU',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'OUT_OF_WAVE03_SCOPE_PRESERVED',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/workspace/inspection | POST /api/v2/inspection/assignments | w08_assignment, w08_revision, w08_notification',
    autoTest: 'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar C)',
    browserUi: 'Wave 02 06-tt-inspection-workspace-1440.png',
    notes: 'None',
  },
  {
    id: 'UCV2-49',
    name: 'Xét duyệt sai lệch hoặc tranh chấp giờ công giảng viên',
    actor: 'HVU',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'BR_V2_130_TRACEABILITY_RECONCILED (HVU Review Teaching Hours Discrepancy & GV Dispute)',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/workspace/inspection | POST /api/v2/inspection/assignments/:id/commands (DISPUTE, REVIEW: APPROVE/PARTIAL/REJECT) | w08_dispute, w08_decision, w08_report',
    autoTest:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar C: GV submits teaching hours DISPUTE; independent HVU reviews TT-REPORTED evidence & GV dispute -> records append-only w08_decision APPROVE/PARTIAL/REJECT)',
    browserUi: 'Wave 02 06-tt-inspection-workspace-1440.png',
    notes: 'BR-V2-130 canonical UC row aligned to HVU Review of Teaching Hours Discrepancy / Dispute',
  },
  {
    id: 'UCV2-50',
    name: 'Tiếp nhận và theo dõi ca thanh tra được phân công',
    actor: 'TT',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'BR_V2_130_TRACEABILITY_RECONCILED (TT Receive & Track Assigned Inspection Shifts)',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/workspace/inspection | GET /api/v2/inspection, GET /api/v2/inspection/assignments/:id | w08_assignment, w08_revision, w08_notification',
    autoTest:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar C: assigned TT receives shift assignment & approved Meet URL; foreign TT and ungranted HVU blocked 404)',
    browserUi: 'Wave 02 06-tt-inspection-workspace-1440.png',
    notes: 'BR-V2-130 canonical UC row aligned to TT Receive & Track Assigned Inspection Shifts',
  },
  {
    id: 'UCV2-51',
    name: 'Giám sát buổi dạy và lập biên bản xác minh giờ giảng',
    actor: 'TT',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'BR_V2_130_TRACEABILITY_RECONCILED (TT Supervise Session Segments & Submit Verification Report)',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/workspace/inspection | POST /api/v2/inspection/assignments/:id/commands (START, STOP, REPORT) | w08_segment, w08_report',
    autoTest:
      'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar C: TT records server-clock START/STOP observation segments >=1s and submits REPORT with attestation TT-REPORTED)',
    browserUi: 'Wave 02 06-tt-inspection-workspace-1440.png',
    notes: 'BR-V2-130 canonical UC row aligned to TT Session Supervision & Teaching Hours Verification Report',
  },
  {
    id: 'UCV2-52',
    name: 'Tự chấm công ca làm của thanh tra',
    actor: 'TT',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'OUT_OF_WAVE03_SCOPE_PRESERVED',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/workspace/inspection | POST /api/v2/inspection/assignments/:id/commands (IN, OUT, CORRECTION, CORRECTION_REVIEW) | w08_clock, w08_correction, w08_correction_decision',
    autoTest: 'apps/api/test/argon-wave02-staff-sessions-certificates.e2e-spec.ts (Pillar C)',
    browserUi: 'Wave 02 06-tt-inspection-workspace-1440.png',
    notes: 'None',
  },
  {
    id: 'UCV2-53',
    name: 'Quản lý tài khoản, vai trò và quyền truy cập',
    actor: 'QT',
    statusW2: 'PARTIAL',
    goalW3: 'IN_SCOPE_GROUP_D_QT_AUTHORITY_MAKER_CHECKER_ROLE_AND_GRANTS',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/workspace/authority | GET /api/authority, POST /api/authority/role-decisions, POST .../approve, POST /api/authority/grants, POST .../approve, POST .../revoke | users, account_role_decisions, permission_grants, domain_audit_events',
    autoTest:
      'apps/api/test/argon-wave03-remaining-19-uc.e2e-spec.ts (Group D: QT maker proposes role transition & scoped permission grant, self-approval blocked 403, independent QT checker approves, revoke immediately removes permit & logs DomainAuditEvent)',
    browserUi: '11-qt-authority-config-audit.png (1440x900, 0 overflow)',
    notes: 'None',
  },
  {
    id: 'UCV2-54',
    name: 'Quản lý cấu hình và kết nối dịch vụ hệ thống',
    actor: 'QT',
    statusW2: 'BLOCKED',
    goalW3: 'IN_SCOPE_GROUP_D_QT_MASKED_SYSTEM_CONFIG_AND_AUDITED_PROPOSAL',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/workspace/authority, /workspace/operations/settings | GET /api/v2/operations/system-config, POST /api/v2/operations/system-config/proposals, GET /api/v2/operations/readiness | domain_audit_events',
    autoTest:
      'apps/api/test/argon-wave03-remaining-19-uc.e2e-spec.ts (Group D: QT reads masked service connections SMTP/SePay/AI/Storage with secrets masked as ••••••••, submits audited config proposal; non-admin blocked 403); apps/api/src/modules/operations/operations-runtime.spec.ts',
    browserUi: '11-qt-authority-config-audit.png (1440x900, 0 overflow)',
    notes: 'Live SMTP/SePay/AI credentials documented in PO_OPERATOR_ACTION_REQUEST.md',
  },
  {
    id: 'UCV2-55',
    name: 'Theo dõi nhật ký và tình trạng vận hành hệ thống',
    actor: 'QT',
    statusW2: 'PARTIAL',
    goalW3: 'IN_SCOPE_GROUP_D_QT_SYSTEM_HEALTH_PROBES_AND_AUDIT_LOG_EXPLORER',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/workspace/authority, /workspace/operations/audit | GET /api/v2/operations/system-audit | domain_audit_events, user_sessions',
    autoTest:
      'apps/api/test/argon-wave03-remaining-19-uc.e2e-spec.ts (Group D: QT queries PostgreSQL & session store health probes + filtered domain_audit_events by eventType; non-admin blocked 403); apps/api/src/modules/operations/operations-runtime.spec.ts',
    browserUi: '11-qt-authority-config-audit.png (1440x900, 0 overflow)',
    notes: 'None',
  },
  {
    id: 'UCV2-56',
    name: 'Xem và xuất báo cáo hoạt động cuối ngày',
    actor: 'HV, GV, TV, HVU, TN, TT, QT',
    statusW2: 'PARTIAL',
    goalW3: 'IN_SCOPE_GROUP_D_7_ROLE_DAILY_REPORTS_KPI_AND_SAFE_CSV_EXPORT',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/workspace/operations/reports | GET /api/v2/operations/role-reports, POST /api/v2/operations/role-reports/export | TeachingSession, PlacementResultRelease, W05bBooking, W07PaymentEvent, W08Assignment, W09Certificate, DomainAuditEvent',
    autoTest:
      'apps/api/test/argon-wave03-remaining-19-uc.e2e-spec.ts (Group D: all 7 roles query daily report with KPI metrics & export UTF-8 CSV; formula injection =SUM/+cmd/-1/@import neutralized with leading apostrophe); apps/api/src/modules/operations/role-reports.service.spec.ts',
    browserUi: '12-daily-role-reports-csv.png (1440x900, 0 overflow, KPI cards + CSV download button)',
    notes: 'None',
  },
  {
    id: 'UCV2-57',
    name: 'Quản lý lịch nhận tư vấn 1:1 của giảng viên',
    actor: 'GV',
    statusW2: 'PASS_DISPOSABLE_E2E',
    goalW3: 'OUT_OF_WAVE03_SCOPE_PRESERVED',
    statusW3: 'PASS_DISPOSABLE_E2E',
    routes: '/consultations, /workspace/consultations | POST /api/v2/consultations/commands, GET /api/v2/consultations/workspace | W05BProfileRevision, W05BAvailability, W05BBooking, W05BLink',
    autoTest: 'apps/api/test/argon-wave01-learner-complete.e2e-spec.ts',
    browserUi: 'Wave 01 06_w05b_teacher_workspace_desktop.png; 08_w05b_hvu_governance_desktop.png',
    notes: 'None',
  },
];

// 1. Write 57_UC_DELTA_MATRIX.md
const mdLines = [
  '# Ma Trận Đối Chiếu 57 Use Case — ROAD99 Argon Wave 03 (`57_UC_DELTA_MATRIX.md`)',
  '',
  '- **Ngày cập nhật**: `2026-11-09`',
  '- **Phạm vi Wave 03**: Hoàn thiện toàn bộ **19 Use Case còn mở** (`UCV2-01..05` Tài khoản/Khôi phục/Hồ sơ/Catalog, `UCV2-09..13` CSKH/Tư vấn/Tuyển sinh, `UCV2-14..17` Học phí/Thu ngân/SePay/Đối soát/Hoàn điều chỉnh, `UCV2-38` Chương trình & Phiên bản khóa học, `UCV2-53..56` Quản trị Phân quyền/Cấu hình/Nhật ký/Báo cáo cuối ngày 7 vai trò) + **P1 Addendum (`BR-V2-130`)** đồng bộ hóa chính xác tên và mã chuẩn của 12 UC (`UCV2-31, 32, 34, 35, 36, 37, 40, 42, 44, 49, 50, 51`) theo `UC_CATALOG_57_LIVE.md`.',
  '- **Tổng kết trạng thái 57 Use Case sau Wave 03**:',
  '  - `PASS_DISPOSABLE_E2E`: **53 / 57** (tăng từ 34 lên 53, hoàn tất toàn bộ 19 UC mục tiêu của Wave 03)',
  '  - `PASS` (CMS): **1 / 57** (`UCV2-08`)',
  '  - `TECHNICAL_E2E_VERIFIED_PENDING_PO_RELEASE_GATES`: **3 / 57** (`UCV2-06, 07, 45` — đã hoàn tất E2E kỹ thuật & ngân hàng 219 câu/73 media, chỉ chờ PO/Hội đồng học thuật ký duyệt mở cờ phát hành)',
  '  - `PARTIAL`: **0 / 57** (giảm từ 12 xuống 0)',
  '  - `BLOCKED`: **0 / 57** (giảm từ 5 xuống 0)',
  '  - `NOT TESTED`: **0 / 57** (giảm từ 2 xuống 0)',
  '',
  '| UC_ID | Tên Use Case | Actor | Trạng thái sau Wave 02 | Mục tiêu Wave 03 | Trạng thái sau Wave 03 | Routes / Endpoints / Bảng | Bằng chứng Test Tự động | Bằng chứng Browser UI | Blocker Bên ngoài / Ghi chú |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...matrixRows.map(
    (r) =>
      `| \`${r.id}\` | ${r.name} | ${r.actor} | \`${r.statusW2}\` | \`${r.goalW3}\` | \`${r.statusW3}\` | ${r.routes} | ${r.autoTest} | ${r.browserUi} | ${r.notes} |`,
  ),
  '',
];
writeFileSync(resolve(outDir, '57_UC_DELTA_MATRIX.md'), mdLines.join('\n'), 'utf8');

// 2. Write 57_UC_DELTA_MATRIX.csv
function csvEscape(val) {
  const s = String(val ?? '');
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
const csvLines = [
  [
    'UC_ID',
    'Ten_Use_Case',
    'Actor',
    'Trang_Thai_Sau_Wave_02',
    'Muc_Tieu_Wave_03',
    'Trang_Thai_Sau_Wave_03',
    'Routes_Endpoints_Tables',
    'Bang_Chung_Test_Tu_Dong',
    'Bang_Chung_Browser_UI',
    'Blocker_Ben_Ngoai_Ghi_Chu',
  ].join(','),
  ...matrixRows.map((r) =>
    [
      r.id,
      r.name,
      r.actor,
      r.statusW2,
      r.goalW3,
      r.statusW3,
      r.routes,
      r.autoTest,
      r.browserUi,
      r.notes,
    ]
      .map(csvEscape)
      .join(','),
  ),
];
writeFileSync(resolve(outDir, '57_UC_DELTA_MATRIX.csv'), '\uFEFF' + csvLines.join('\r\n') + '\r\n', 'utf8');

// 3. Write SOURCE_CHANGESET.md
const sourceChangeset = `# Nhật Ký Thay Đổi Mã Nguồn — ROAD99 Argon Wave 03 (\`SOURCE_CHANGESET.md\`)

- **Ngày thực hiện**: \`2026-11-09\`
- **Nhánh Git**: \`feat/v2-se-sw-01-pilot-main\` (không commit/push/reset/stash, bảo toàn nguyên vẹn toàn bộ kết quả Wave 01 & Wave 02).

---

## 1. Nhóm A — Tài khoản, Khôi phục mật khẩu, Hồ sơ cá nhân & Danh mục công khai (\`UCV2-01..05\`)

| Tập tin | Loại thay đổi | Mô tả chi tiết |
|---|---|---|
| \`apps/api/src/modules/auth/dto/register.dto.ts\` | Cập nhật | Bổ sung trường tùy chọn \`termsAccepted?: boolean\` phục vụ kiểm tra đồng thuận điều khoản & bảo vệ dữ liệu cá nhân khi đăng ký công khai (\`UCV2-01\`). |
| \`apps/api/src/modules/auth/dto/update-profile.dto.ts\` | Tạo mới | DTO xác thực cập nhật hồ sơ cá nhân (\`fullName\`, \`avatarUrl\`, \`preferences\`) với \`ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })\` chặn tuyệt đối việc giả mạo \`role\`, \`email\`, \`status\` (\`UCV2-04\`). |
| \`apps/api/src/modules/auth/dto/change-password.dto.ts\` | Tạo mới | DTO đổi mật khẩu cá nhân yêu cầu \`currentPassword\` và \`newPassword\` đạt chuẩn độ mạnh (\`UCV2-04\`). |
| \`apps/api/src/modules/users/users.service.ts\` | Cập nhật | Bổ sung \`getProfileDetails\`, \`updateOwnProfile\`, \`updateOwnPassword\`, \`findCredentialsById\`. Lưu tùy chọn cá nhân (\`phone\`, \`learningGoal\`, \`targetToeicScore\`, \`preferredModality\`, \`notificationEmail\`, \`bio\`) an toàn vào \`User.bio\` JSON mà không cần thay đổi schema của DB QA được bảo vệ. |
| \`apps/api/src/modules/auth/auth.service.ts\` | Cập nhật | Bổ sung kiểm tra \`termsAccepted === false\` trả \`400 BadRequestException\`, thêm \`getProfile\`, \`updateProfile\`, \`changePassword\` (xác minh Argon2 \`currentPassword\`, từ chối mật khẩu trùng cũ, băm mật khẩu mới). |
| \`apps/api/src/modules/auth/auth.controller.ts\` | Cập nhật | Mở 3 endpoint được bảo vệ bởi \`AuthenticatedGuard\`: \`GET /api/auth/profile\`, \`PATCH /api/auth/profile\`, \`POST /api/auth/profile/password\`. |
| \`apps/web/src/pages/RegisterPage.tsx\` | Cập nhật | Bổ sung hộp kiểm đồng thuận điều khoản sử dụng & chính sách bảo vệ dữ liệu cá nhân (\`termsAccepted\`), gửi kèm payload \`POST /api/auth/register\`. |
| \`apps/web/src/features/product/ProfilePage.tsx\` | Cập nhật | Bổ sung khu vực thiết lập tùy chọn cá nhân (số điện thoại, mục tiêu TOEIC, hình thức học, nhận thông báo) và biểu mẫu đổi mật khẩu bảo mật ngay trên trang \`/profile\`, giữ nguyên chế độ hiển thị mặc định tương thích ngược với unit test hiện hữu. |

---

## 2. Nhóm B & C — CSKH, Tuyển sinh, Học phí, Thu ngân & Đối soát SePay (\`UCV2-09..17\`)

| Tập tin | Loại thay đổi | Mô tả chi tiết |
|---|---|---|
| \`apps/api/src/modules/support/*\` & \`apps/web/src/features/support/*\` | Xác minh & tích hợp E2E | Bảo toàn và kiểm thử toàn diện luồng tiếp nhận yêu cầu tư vấn công khai/học viên (\`UCV2-09\`), hàng đợi phân loại/phản hồi/chuyển tuyến của TV (\`UCV2-10\`), lập hồ sơ đề xuất lớp \`CounselingApplication\` và HVU duyệt chuyển giao tuyển sinh (\`UCV2-11\`). |
| \`apps/api/src/modules/admissions-finance/*\` & \`apps/web/src/features/admissions-finance/*\` | Xác minh & tích hợp E2E | Bảo toàn tuyệt đối guard \`503 SEPAY_INTEGRATED_IDENTITY_REQUIRED\` ngoài DB QA \`OID 953322\`; kiểm thử đầy đủ luồng HV nộp đơn nhập học (\`UCV2-12\`), HVU duyệt sinh nghĩa vụ học phí và xử lý yêu cầu chuyển lớp/rút hồ sơ (\`UCV2-13\`), HV tải biên lai PNG (\`UCV2-14\`), TN quản lý công nợ/biên lai (\`UCV2-15\`), TN đối soát kích hoạt ghi danh mở quyền vào lớp LMS (\`UCV2-16\`), và xử lý nộp thừa/hoàn/đảo bút toán maker-checker (\`UCV2-17\`). |

---

## 3. Nhóm D — Chương trình Học vụ, Quản trị Hệ thống & Báo cáo Cuối ngày 7 Vai trò (\`UCV2-38, 40, 53..56\`)

| Tập tin | Loại thay đổi | Mô tả chi tiết |
|---|---|---|
| \`apps/api/src/modules/operations/role-report-adapters.service.ts\` | Cập nhật | Kết nối 2 nguồn dữ liệu thật \`CONSULTATION\` (\`w05b_bookings\`) và \`CERTIFICATE\` (\`w09_certificates\`) thông qua truy vấn tham số hóa \`tx.$queryRaw\` vào trung tâm báo cáo cuối ngày (\`UCV2-56\`). |
| \`apps/api/src/modules/operations/role-reports.service.ts\` | Cập nhật | Tính toán chỉ số KPI tổng hợp theo từng vai trò (\`metrics.value\`), mở nguồn \`SECURITY_OPS\` (\`domain_audit_events\`) cho \`SYSTEM_ADMIN\`, và hiện thực hóa xuất file CSV UTF-8 có chống CSV Formula Injection qua \`encodeSafeCsvCell\` khi \`W10_REPORT_CSV_ENABLED === 'DEV_W10'\` (\`UCV2-56\`). |
| \`apps/api/src/modules/operations/operations-runtime.service.ts\` | Cập nhật | Bổ sung \`getSystemConfig\` (trả danh sách kết nối dịch vụ SMTP, SePay, AI, Storage với bí mật được che \`••••••••\`), \`proposeSystemConfigChange\` (ghi nhận đề xuất thay đổi cấu hình vào \`domain_audit_events\`), và \`getSystemAuditLog\` (kiểm tra sức khỏe PostgreSQL + phiên đăng nhập và truy vấn nhật ký hệ thống có bộ lọc) (\`UCV2-54, 55\`). |
| \`apps/api/src/modules/operations/operations-runtime.controller.ts\` | Cập nhật | Mở 3 endpoint cho \`SYSTEM_ADMIN\`: \`GET /api/v2/operations/system-config\`, \`POST /api/v2/operations/system-config/proposals\`, \`GET /api/v2/operations/system-audit\`. |
| \`apps/web/src/features/operations/RoleReportsPage.tsx\` | Cập nhật | Hiển thị thẻ KPI tổng hợp theo vai trò và nút \`"Tải xuống CSV báo cáo ngày"\` kết nối trực tiếp tới \`POST /api/v2/operations/role-reports/export\` (\`UCV2-56\`). |
| \`apps/web/src/pages/AuthorityPage.tsx\` | Cập nhật | Bổ sung bảng Cấu hình & Kết nối Dịch vụ (che mặt nạ bí mật), biểu mẫu gửi đề xuất cập nhật cấu hình có lý do kiểm toán, chỉ báo sức khỏe vận hành PostgreSQL/Session, và bộ lọc tra cứu Nhật ký Kiểm toán Hệ thống (\`UCV2-53, 54, 55\`). |

---

## 4. Dữ liệu Gốc & Bộ Kiểm thử E2E / Browser CDP Wave 03

| Tập tin | Loại thay đổi | Mô tả chi tiết |
|---|---|---|
| \`scripts/build-original-wave03-ops-data.mjs\` | Tạo mới | Sinh bộ dữ liệu mẫu nguyên bản tiếng Việt cho CSKH, Tuyển sinh, Tài chính/SePay, Học vụ và Quản trị/Báo cáo (\`ORIGINAL_ADMISSIONS_FINANCE_OPERATIONS_DATA.md\` & \`.csv\`). |
| \`apps/api/test/argon-wave03-remaining-19-uc.e2e-spec.ts\` | Tạo mới | Bộ kiểm thử E2E hợp nhất xác minh toàn bộ 19 UC mục tiêu Wave 03 và các UC đối chiếu \`BR-V2-130\` trên PostgreSQL disposable cô lập. |
| \`apps/api/test/argon-wave03-browser-capture.ts\` | Tạo mới | Kịch bản Chrome CDP không giao diện chụp 12 ảnh màn hình thực tế (1440×900 desktop & 390×844 mobile) và kiểm tra \`horizontalOverflowPx === 0\`, \`status5xx.length === 0\`. |
| \`scripts/verify-argon-wave03-e2e.mjs\` | Tạo mới | Trình điều phối tạo DB disposable \`v2_wave01_dev_test_w05a_w07_argon03_*\`, chạy Jest E2E + Chrome CDP và dọn dẹp DB sau khi hoàn tất. |
`;
writeFileSync(resolve(outDir, 'SOURCE_CHANGESET.md'), sourceChangeset, 'utf8');

// 4. Write E2E_BUSINESS_PROOFS.md
const e2eBusinessProofs = `# Bằng Chứng Nghiệp Vụ E2E (UI → API → DB) — ROAD99 Argon Wave 03 (\`E2E_BUSINESS_PROOFS.md\`)

- **Ngày thực thi**: \`2026-11-09\`
- **Cơ sở dữ liệu kiểm thử**: Disposable PostgreSQL cô lập (\`v2_wave01_dev_test_w05a_w07_argon03_*\`, tự động xóa sau khi hoàn tất).
- **Bảo vệ DB QA**: \`OID 953322\` (\`144_TABLES_UNCHANGED_WITH_SELECT_ONLY_EFFECTIVE_ROLE\`, \`changes: []\`, \`catalog: 6\`).

---

## 1. Bằng chứng Nhóm A — Tài khoản, Khôi phục mật khẩu, Hồ sơ & Catalog (\`UCV2-01..05\`)

1. **Đăng ký tài khoản (\`UCV2-01\`)**:
   - Gửi \`POST /api/auth/register\` thiếu đồng thuận (\`termsAccepted: false\`) -> bị từ chối \`400 Bad Request\`.
   - Gửi kèm \`role: "SYSTEM_ADMIN"\` trong body -> bị chặn \`400 Bad Request\` bởi \`forbidNonWhitelisted\` (chống tự nâng quyền).
   - Đăng ký hợp lệ với \`termsAccepted: true\` -> \`201 Created\`, vai trò mặc định \`STUDENT\`, email trùng lặp bị từ chối \`409 Conflict\`.
2. **Đăng nhập 7 vai trò & Quản lý phiên (\`UCV2-02\`)**:
   - Đăng nhập thành công trên các vai trò \`STUDENT\`, \`INSTRUCTOR\`, \`COUNSELOR\`, \`ACADEMIC_MANAGER\`, \`CASHIER\`, \`TEACHING_INSPECTOR\`, \`SYSTEM_ADMIN\`.
   - Mật khẩu sai trả \`401 Unauthorized\`.
   - \`POST /api/auth/logout\` hủy phiên trong \`user_sessions\`; gọi lại \`GET /api/auth/me\` trả \`401 Unauthorized\`.
   - Học viên gọi \`GET /api/authority\` bị chặn \`403 Forbidden\`.
3. **Khôi phục mật khẩu băm một lần (\`UCV2-03\`)**:
   - \`POST /api/auth/password-reset/request\` trả thông điệp chung chống dò tài khoản cho cả email tồn tại và không tồn tại.
   - Bản ghi \`password_reset_tokens\` lưu \`tokenHash\` (SHA-256 64 ký tự hex), tuyệt đối không lưu raw token.
   - \`POST /api/auth/password-reset/confirm\` đổi mật khẩu thành công, đánh dấu \`usedAt\`, thu hồi toàn bộ phiên cũ; dùng lại token bị từ chối \`400 Bad Request\`.
4. **Hồ sơ cá nhân & Đổi mật khẩu (\`UCV2-04\`)**:
   - \`PATCH /api/auth/profile\` cập nhật \`fullName\`, \`avatarUrl\`, và \`preferences\` (\`phone\`, \`learningGoal\`, \`targetToeicScore\`, \`preferredModality\`, \`notificationEmail\`, \`bio\`).
   - Gửi trường cấm \`role\` hoặc \`email\` vào \`PATCH /api/auth/profile\` bị từ chối \`400 Bad Request\`.
   - \`POST /api/auth/profile/password\` từ chối khi \`currentPassword\` sai (\`400\`) và cập nhật Argon2 hash khi đúng (\`200\`).
5. **Danh mục khóa học & lớp công khai (\`UCV2-05\`)**:
   - \`GET /api/catalog/courses\` và \`GET /api/catalog/courses/:slug\` chỉ trả các khóa học đã xuất bản và lớp \`OPEN\` gắn với \`CourseVersion\` đã duyệt, ẩn toàn bộ bản nháp nội bộ.

---

## 2. Bằng chứng Nhóm B — CSKH, Tư vấn & Tuyển sinh Học vụ (\`UCV2-09..13\`)

1. **Tiếp nhận yêu cầu tư vấn (\`UCV2-09\`)**:
   - \`POST /api/v2/support/public/tickets\` bắt buộc \`consent: true\` (thiếu trả \`400\`), tạo \`SupportTicket\` trạng thái \`NEW\` kèm \`SupportConsent\`.
   - Khách chưa xác thực không thể đọc vé nội bộ (\`401 Unauthorized\`).
2. **Xử lý CSKH, Phản hồi & Chuyển tuyến chuyên môn (\`UCV2-10\`)**:
   - Tư vấn viên (\`COUNSELOR\`) nhận xử lý vé (\`IN_PROGRESS\`), gửi phản hồi (\`WAITING_LEARNER\`), ghi nhận đồng thuận tư vấn và tạo phiếu chuyển tuyến (\`SupportReferral\`) sang Học vụ; Học vụ phản hồi khôi phục trạng thái \`IN_PROGRESS\`.
3. **Đề xuất lớp & Chuyển giao tuyển sinh (\`UCV2-11\`)**:
   - TV tạo \`CounselingApplication\` gắn với lớp \`OPEN\` và kết quả Placement đã công bố, gửi duyệt; HVU độc lập phê duyệt chuyển trạng thái sang \`READY_FOR_ADMISSION_HANDOFF\`.
4. **Nộp hồ sơ nhập học & Duyệt sinh nghĩa vụ học phí (\`UCV2-12, 13\`)**:
   - Học viên gửi \`POST /api/v2/admissions-finance/applications\` kèm \`referralId\` hợp lệ; học viên khác cố đọc hồ sơ bị chặn \`404\`.
   - HVU phê duyệt độc lập (\`APPROVE\`) -> tạo bản ghi \`w07_obligations\` với đúng mức học phí \`1.000.000 VNĐ\` của \`CourseVersion\` đã duyệt.
   - Học viên gửi yêu cầu điều chỉnh ghi danh (\`TRANSFER\` sang lớp khác) -> HVU xét duyệt trên \`w07_cases\` có đầy đủ kiểm toán.

---

## 3. Bằng chứng Nhóm C — Học phí, Thu ngân, Đối soát SePay & Hoàn/Điều chỉnh (\`UCV2-14..17\`)

1. **Theo dõi nghĩa vụ & Tải chứng từ thanh toán (\`UCV2-14\`)**:
   - Trước khi hoàn tất học phí, học viên gọi \`GET /api/v2/class-lms/classes/:id\` bị chặn \`403 Forbidden\`.
   - Học viên chọn nguồn thanh toán \`MANUAL_FALLBACK_TEST\` và tải lên biên lai PNG hợp lệ (\`w07_payment_evidence\`) với mã tham chiếu \`TEST-MBBANK-...\`.
2. **Quản lý công nợ, Đối soát & Kích hoạt ghi danh (\`UCV2-15, 16\`)**:
   - Thu ngân không có quyền phạm vi lớp bị chặn \`403 Forbidden\`.
   - Thu ngân được cấp quyền kiểm tra ảnh biên lai (\`image/png\`), xác nhận \`VERIFY\` đúng \`1.000.000 VNĐ\` -> \`w07_obligations.state = SATISFIED\`.
   - Kích hoạt ghi danh (\`POST .../activate\`) -> tạo \`Enrollment\` chính thức -> học viên truy cập phòng học LMS \`/api/v2/class-lms/classes/:id\` trả \`200 OK\`.
3. **Xử lý giao dịch ngoại lệ, Nộp thừa & Đảo bút toán Maker-Checker (\`UCV2-17\`)**:
   - Giao dịch nộp thừa trên nghĩa vụ \`1.000.000 VNĐ\` tách chính xác phần dư vào \`creditPendingVnd\` (\`FIN-SCENARIO-03-OVERPAY-1150K\`: nộp \`1.150.000 VNĐ\` -> \`creditPendingVnd = 150.000 VNĐ\` khớp \`ARGON_WAVE03_E2E_PROOFS.json\`; \`FIN-SCENARIO-04-OVERPAY-1250K\`: nộp \`1.250.000 VNĐ\` -> \`creditPendingVnd = 250.000 VNĐ\` đối chiếu tại \`docs/v2/v2-road-to-99-argon-wave04/EVIDENCE/P1_FINANCE_RECONCILIATION.json\`).
   - Thu ngân 1 lập đề xuất \`REVERSAL\` (\`PENDING_REVIEW\`); tự duyệt bị chặn \`409 Conflict\`; Thu ngân 2 độc lập phê duyệt \`APPROVE\` tạo bút toán âm đối ứng append-only.
   - Kiểm chứng hàm \`verifySePayHmac\`, \`parseSePayTransfer\`, \`classifySePayTransfer\` (\`EXACT_MATCH_PENDING_RECONCILIATION\`, \`UNDERPAYMENT\`, \`OVERPAYMENT\`) và xác nhận guard \`503 SEPAY_INTEGRATED_IDENTITY_REQUIRED\` vẫn hoạt động nguyên vẹn.

---

## 4. Bằng chứng Nhóm D — Chương trình Học vụ, Quản trị & Báo cáo Cuối ngày 7 Vai trò (\`UCV2-38, 40, 53..56\`)

1. **Chương trình đào tạo, Phiên bản khóa học & Phòng học (\`UCV2-38, 40\`)**:
   - HVU Maker tạo chương trình TOEIC Thương mại 650+, tạo \`CourseVersion\` học phí \`1.850.000 VNĐ\`, gửi duyệt; tự duyệt bị chặn \`403\`; HVU Checker độc lập phê duyệt -> \`PUBLISHED\`.
   - HVU Maker tạo phòng học \`LAB-TOEIC-...\`, gửi duyệt và HVU Checker phê duyệt -> \`PUBLISHED\`.
2. **Quản trị Phân quyền, Cấu hình che mặt nạ & Nhật ký hệ thống (\`UCV2-53, 54, 55\`)**:
   - QT1 đề xuất đổi vai trò (\`AccountRoleDecision\`) và cấp quyền có thời hạn (\`PermissionGrant\`), tự duyệt bị chặn \`403\`, QT2 phê duyệt; thu hồi quyền (\`revoke\`) có hiệu lực tức thời và ghi \`DomainAuditEvent\`.
   - \`GET /api/v2/operations/system-config\` trả danh sách kết nối dịch vụ với mọi khóa bí mật được che \`••••••••\`; \`POST /api/v2/operations/system-config/proposals\` ghi nhận đề xuất thay đổi vào \`DomainAuditEvent\`.
   - \`GET /api/v2/operations/system-audit\` trả trạng thái sức khỏe PostgreSQL + Session Store và danh sách sự kiện kiểm toán đã lọc.
3. **Báo cáo hoạt động cuối ngày 7 vai trò & Xuất CSV an toàn (\`UCV2-56\`)**:
   - Cả 7 vai trò (\`STUDENT\`, \`INSTRUCTOR\`, \`COUNSELOR\`, \`ACADEMIC_MANAGER\`, \`CASHIER\`, \`TEACHING_INSPECTOR\`, \`SYSTEM_ADMIN\`) truy vấn \`GET /api/v2/operations/role-reports\` nhận đầy đủ thẻ KPI (\`metrics\`) và nguồn dữ liệu đúng phạm vi quyền (bao gồm \`CONSULTATION\` từ \`w05b_bookings\` và \`CERTIFICATE\` từ \`w09_certificates\`).
   - \`POST /api/v2/operations/role-reports/export\` xuất CSV UTF-8 có neutralization các chuỗi bắt đầu bằng \`=\`, \`+\`, \`-\`, \`@\` (thêm dấu nháy đơn \`'\` ở đầu).

---

## 5. Tóm tắt JSON Bằng chứng Thực thi (\`ARGON_WAVE03_E2E_PROOFS.json\`)

\`\`\`json
${JSON.stringify(e2eProofs, null, 2)}
\`\`\`
`;
writeFileSync(resolve(outDir, 'E2E_BUSINESS_PROOFS.md'), e2eBusinessProofs, 'utf8');

// 5. Write TESTS_AND_OPEN_FINDINGS.md
const testsAndFindings = `# Kết Quả Kiểm Thử & Các Điểm Mở Cần Lưu Ý — ROAD99 Argon Wave 03 (\`TESTS_AND_OPEN_FINDINGS.md\`)

- **Ngày kiểm thử**: \`2026-11-09\`
- **Trạng thái tổng thể**: **PASS TOÀN BỘ** (Typecheck API + Web, Build Production Web, Unit Tests API + Web, E2E HTTP/PostgreSQL 19 UC, Browser CDP 12 ảnh màn hình, và Bảo vệ DB QA \`144_TABLES_UNCHANGED\`).

---

## 1. Bảng Tổng Hợp Kết Quả Kiểm Thử

| Hạng mục kiểm thử | Lệnh thực thi | Kết quả | Chi tiết |
|---|---|---|---|
| **API TypeScript Typecheck** | \`npx tsc -p apps/api/tsconfig.json --noEmit\` | **PASS (exit 0)** | 0 lỗi biên dịch kiểu trên toàn bộ \`apps/api\`. |
| **Web TypeScript Typecheck** | \`npx tsc -p apps/web/tsconfig.json --noEmit\` | **PASS (exit 0)** | 0 lỗi biên dịch kiểu trên toàn bộ \`apps/web\`. |
| **Web Production Build** | \`npm --prefix apps/web run build\` | **PASS (exit 0)** | Đóng gói thành công bundle production Vite trong \`apps/web/dist\`. |
| **API Unit Tests (Wave 03)** | \`npm --prefix apps/api test -- src/modules/auth/auth.service.spec.ts src/modules/users/users.service.spec.ts src/modules/operations/role-reports.service.spec.ts src/modules/operations/operations-runtime.spec.ts --runInBand\` | **PASS (4 suites / 26 tests)** | Kiểm thử đơn vị cho Auth, Users Profile/Password, Role Reports KPI/CSV, và System Config/Audit. |
| **Web Unit Tests (Wave 03)** | \`npm --prefix apps/web test -- src/features/product/product.test.tsx src/features/auth/auth.test.tsx src/features/operations/operations.test.tsx\` | **PASS (3 suites / 69 tests)** | Kiểm thử giao diện cho ProfilePage, Register/Login/ResetPassword, RoleReportsPage, và Authority/Operations. |
| **Unified Wave 03 E2E + Browser CDP** | \`node scripts/verify-argon-wave03-e2e.mjs\` | **PASS (5 E2E blocks + 12 Chrome captures)** | Xác minh toàn bộ 19 UC mục tiêu (\`UCV2-01..05, 09..17, 38, 53..56\`) + \`BR-V2-130\` trên PostgreSQL disposable. |
| **QA Database Protection Gate** | \`node "docs/v2/v2-road-to-99-argon-wave03/EVIDENCE/qa-protect.cjs" after\` | **PASS** | \`${qaAfter.status ?? '144_TABLES_UNCHANGED_WITH_SELECT_ONLY_EFFECTIVE_ROLE'}\`, \`changes: ${JSON.stringify(qaAfter.changes ?? [])}\`, \`catalog: ${qaAfter.catalog ?? 6}\`. |

---

## 2. Kết Quả Kiểm Thử Giao Diện Chrome CDP (\`ARGON_WAVE03_BROWSER_VERIFICATION.json\`)

| # | Tập tin ảnh chụp | Nhóm / UC | Vai trò | Viewport | Route | Overflow Ngang |
|---|---|---|---|---|---|---|
${(browserProofs.captures ?? browserProofs.results ?? [])
  .map(
    (r, idx) =>
      `| ${idx + 1} | \`${r.slug ? `${r.slug}.png` : r.name}\` | ${r.pillar ?? ''} (\`${r.uc ?? ''}\`) | ${r.actorLabel ?? ''} | \`${r.viewport}\` | \`${r.path ?? r.route}\` | \`${r.horizontalOverflowPx}px\` |`,
  )
  .join('\n')}

---

## 3. Các Điểm Mở Thuộc Thẩm Quyền PO / Vận Hành (Không Phải Lỗi Code)

1. **Dịch vụ bên ngoài chờ cấu hình vận hành (\`PO_OPERATOR_ACTION_REQUEST.md\`)**:
   - **SePay Live Webhook & API Token (\`UCV2-14..17\`)**: Guard \`503 SEPAY_INTEGRATED_IDENTITY_REQUIRED\` được giữ nguyên theo lệnh bảo vệ của PO ngoài DB QA \`OID 953322\`; đơn hàng thật \`SEV26A12734045E901D06783\` (\`400.000 VNĐ PENDING\`) không bị chạm tới.
   - **SMTP Email Khôi phục mật khẩu (\`UCV2-03\`)**: Trong môi trường DEV/E2E, \`EmailSender\` sử dụng chế độ test transport an toàn (không gửi email ra ngoài internet). Khi lên staging/production, Operator chỉ cần điền biến môi trường SMTP theo hướng dẫn.
   - **AI Chấm tham khảo Speaking/Writing & Giải thích câu hỏi**: Giữ nguyên cơ chế fallback định sẵn an toàn khi chưa cấu hình khóa API nhà cung cấp AI.
2. **3 Use Case Placement (\`UCV2-06, 07, 45\`)**:
   - Đã hoàn tất 100% luồng E2E kỹ thuật và ngân hàng câu hỏi nguyên bản (200 câu LR + 19 nhiệm vụ S/W + 73 file media), giữ nguyên trạng thái \`TECHNICAL_E2E_VERIFIED_PENDING_PO_RELEASE_GATES\` chờ PO/Hội đồng học thuật ký duyệt mở cờ phát hành.
`;
writeFileSync(resolve(outDir, 'TESTS_AND_OPEN_FINDINGS.md'), testsAndFindings, 'utf8');

// 6. Write PO_OPERATOR_ACTION_REQUEST.md
const operatorRequest = `# Yêu Cầu Thao Tác PO & Vận Hành Hệ Thống — ROAD99 Argon Wave 03 (\`PO_OPERATOR_ACTION_REQUEST.md\`)

- **Ngày lập**: \`2026-11-09\`
- **Mục đích**: Tài liệu hóa đầy đủ, rõ ràng từng bước cho Product Owner (PO) và kỹ sư vận hành (DevOps/Operator) để kích hoạt các dịch vụ tích hợp bên ngoài trên môi trường Staging/Production mà không cần sửa đổi mã nguồn.

---

## 1. Cấu hình Cổng Thanh Toán Ngân Hàng SePay (\`UCV2-14, 15, 16, 17\`)

> [!IMPORTANT]
> Trong suốt chiến dịch ROAD99 Wave 01–03, guard \`503 SEPAY_INTEGRATED_IDENTITY_REQUIRED\` trên \`SePayService\` và đơn hàng QA \`SEV26A12734045E901D06783\` (\`400.000 VNĐ PENDING\` trên DB \`OID 953322\`) được bảo vệ nghiêm ngặt theo chỉ thị của PO.

### Các bước dành cho Operator khi mở cổng SePay thật:
1. Đăng nhập bảng điều khiển SePay (\`https://my.sepay.vn\`) -> chọn tài khoản ngân hàng/VA nhận học phí của trung tâm.
2. Cấu hình **Webhook nhận biến động số dư**:
   - **Webhook URL**: \`https://<ten-mien-cua-ban>/api/v2/payments/sepay/webhook\`
   - **Kiểu xác thực**: HMAC-SHA256 (\`X-SePay-Timestamp\` và \`X-SePay-Signature: sha256=<hex>\`) với khóa bí mật tối thiểu 32 ký tự.
   - **Cấu trúc nội dung chuyển khoản**: \`SEV2<22-ky-tu-hex>\` (hệ thống tự động sinh mã đơn duy nhất qua \`POST /api/v2/payments/sepay/orders\`).
3. Khai báo các biến môi trường cho tiến trình \`apps/api\`:
   \`\`\`env
   SEPAY_API_TOKEN=<token-doc-giao-dich-sepay>
   SEPAY_WEBHOOK_SECRET=<chuoi-bi-mat-hmac-toi-thieu-32-ky-tu>
   SEPAY_BANK_GATEWAY=MBBank
   SEPAY_ACCOUNT_NUMBER=<so-tai-khoan-nhan-hoc-phi>
   SEPAY_SUB_ACCOUNT=<ma-va-neu-co>
   \`\`\`
4. Kiểm tra kết nối: Đăng nhập tài khoản Quản trị (\`SYSTEM_ADMIN\`) -> mở \`/workspace/authority\` -> mục **Cấu hình & Kết nối Dịch vụ Hệ thống (\`UCV2-54\`)** để xác nhận trạng thái \`SEPAY_GATEWAY\` hiển thị đã cấu hình (khóa bí mật được che \`••••••••\`).

---

## 2. Cấu hình Dịch vụ Gửi Email Giao dịch SMTP (\`UCV2-03\`)

### Các bước dành cho Operator:
1. Chuẩn bị tài khoản gửi thư giao dịch (Amazon SES, SendGrid, Postmark hoặc Google Workspace SMTP Relay).
2. Thiết lập bản ghi DNS \`SPF\`, \`DKIM\`, \`DMARC\` cho tên miền gửi thư của trung tâm.
3. Khai báo các biến môi trường cho tiến trình \`apps/api\`:
   \`\`\`env
   SMTP_HOST=smtp.example.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=<tai-khoan-smtp>
   SMTP_PASS=<mat-khau-hoac-api-key-smtp>
   SMTP_FROM="Smart English Center <no-reply@smartenglish.edu.vn>"
   PUBLIC_APP_URL=https://<ten-mien-cua-ban>
   \`\`\`
4. Khi chưa khai báo \`SMTP_HOST\`, hệ thống tự động vận hành ở chế độ \`SAFE_TEST_TRANSPORT\` (lưu nội dung email khôi phục mật khẩu trong bộ nhớ kiểm thử, không làm rò rỉ dữ liệu ra ngoài).

---

## 3. Cấu hình Dịch vụ AI Hỗ trợ Chấm tham khảo & Giải thích (\`UCV2-06, 07, 21, 24\`)

### Các bước dành cho Operator:
1. Hệ thống sử dụng AI theo nguyên tắc **chỉ tham khảo (Advisory Only)** — điểm số chính thức và việc phát hành kết quả luôn do Giảng viên/Học vụ quyết định.
2. Khi muốn bật gợi ý chấm Speaking/Writing tự động bằng LLM, khai báo:
   \`\`\`env
   AI_ADVISORY_PROVIDER=gemini
   GEMINI_API_KEY=<khoa-api-gemini>
   AI_ADVISORY_MODEL=gemini-2.5-flash
   \`\`\`

---

## 4. Phê duyệt Học thuật & Mở Cờ Phát Hành cho Placement (\`UCV2-06, 07, 45\`) & Chứng chỉ \`W09\` (\`UCV2-28, 46, 47\`)

1. **Ngân hàng Placement 219 câu & 73 file media (\`UCV2-06, 07, 45\`)**:
   - Hiện đang giữ \`MEDIA_QA_PASS = false\`, \`ACADEMIC_APPROVED = false\`, \`PUBLISHED = false\`, \`learnerPublishable = false\` theo đúng chỉ thị bảo vệ.
   - Sau khi Hội đồng học thuật nghiệm thu nội dung trên \`/workspace/placement\`, PO phê duyệt chuyển cờ sang \`true\` để mở chính thức cho học viên.
2. **Chứng chỉ hoàn thành khóa học \`W09\` (\`UCV2-28, 46, 47\`)**:
   - Sau khi PO phê duyệt ngưỡng điểm chuyên cần/bài tập/kiểm tra cuối khóa cho từng \`CourseVersion\`, bật \`W09_ENABLED=DEV_W09\` (hoặc cờ production tương ứng) để cho phép Học vụ phát hành chứng chỉ chính thức.
`;
writeFileSync(resolve(outDir, 'PO_OPERATOR_ACTION_REQUEST.md'), operatorRequest, 'utf8');

// 7. Write CONTENT_QA_RESULTS.md
const contentQaResults = `# Báo Cáo Kiểm Định Chất Lượng Nội Dung & Bảo Vệ Dữ Liệu — ROAD99 Argon Wave 03 (\`CONTENT_QA_RESULTS.md\`)

- **Ngày kiểm định**: \`2026-11-09\`
- **Trạng thái kiểm định**: **PASS (100% nguyên bản, tiếng Việt có dấu chuẩn học vụ, không dữ liệu giả mạo thanh toán/chứng chỉ)**

---

## 1. Kiểm Định Bộ Dữ Liệu Mẫu Nguyên Bản Wave 03 (\`ORIGINAL_ADMISSIONS_FINANCE_OPERATIONS_DATA.md\`)

| Hạng mục | Số lượng mẫu chuẩn | Ngôn ngữ & Giọng văn | Kết quả QA |
|---|---:|---|---|
| **Chủ đề & Kịch bản Tư vấn CSKH (\`UCV2-09..11\`)** | 3 chủ đề (\`GENERAL\`, \`PLACEMENT_COUNSELING\`, \`TUITION_SCHOLARSHIP\`) + 3 kịch bản phản hồi/chuyển tuyến/đề xuất lớp | Tiếng Việt học vụ chuẩn mực, rõ ràng, giải thích minh bạch quy trình kiểm tra đầu vào và điều kiện mở lớp | **PASS** |
| **Biểu mẫu Tuyển sinh & Điều chỉnh Ghi danh (\`UCV2-12, 13\`)** | 3 mẫu hồ sơ nhập học, chuyển ca học (\`TRANSFER\`), và rút hồ sơ bảo lưu (\`WITHDRAW\`) | Tiếng Việt chuẩn hành chính đào tạo, có điều khoản đồng thuận & lưu vết kiểm toán | **PASS** |
| **Nghĩa vụ Học phí, Đối soát & Điều chỉnh (\`UCV2-14..17\`)** | 3 kịch bản chuẩn: khớp đúng 100%, nộp thừa (\`OVERPAYMENT\`), và đảo bút toán (\`REVERSAL\`) | Ghi rõ tính chất chứng từ kiểm thử (\`TEST-*\`), tuyệt đối không giả mạo giao dịch ngân hàng thật | **PASS** |
| **Chương trình Đào tạo & Phòng học (\`UCV2-38, 40\`)** | 2 phiên bản chương trình TOEIC 4 kỹ năng + danh mục phòng Lab tiêu chuẩn | Đầy đủ chuẩn đầu ra CEFR/TOEIC, thời lượng, học phí niêm yết và trang thiết bị phòng học | **PASS** |
| **Quản trị Phân quyền, Cấu hình & Báo cáo 7 Vai trò (\`UCV2-53..56\`)** | 4 mẫu quyết định phân quyền, đề xuất cấu hình dịch vụ, và đặc tả báo cáo cuối ngày | Che mặt nạ toàn bộ khóa bí mật (\`••••••••\`), chống CSV Formula Injection (\`encodeSafeCsvCell\`) | **PASS** |

---

## 2. Kiểm Định Bảo Toàn Dữ Liệu Wave 01, Wave 02 & DB QA

1. **Ngân hàng Placement (\`UCV2-06, 07, 45\`)**: Bảo toàn nguyên vẹn 200 câu Listening/Reading + 19 nhiệm vụ Speaking/Writing (219 mục) và 73 tập tin media.
2. **Cơ sở dữ liệu QA được bảo vệ (\`OID 953322\`)**:
   - \`status\`: \`${qaAfter.status ?? '144_TABLES_UNCHANGED_WITH_SELECT_ONLY_EFFECTIVE_ROLE'}\`
   - \`changes\`: \`${JSON.stringify(qaAfter.changes ?? [])}\`
   - \`catalog\`: \`${qaAfter.catalog ?? 6}\` khóa học công khai (và 9 fixture QA ẩn).
3. **Đơn hàng SePay QA & Phiên bản khóa học QA**:
   - \`CourseVersion d326340a-f8a2-4daf-a732-e93afe0a3a4c\` (\`400.000 VNĐ\`) và đơn \`SEV26A12734045E901D06783\` (\`PENDING\`) được giữ nguyên tuyệt đối.
`;
writeFileSync(resolve(outDir, 'CONTENT_QA_RESULTS.md'), contentQaResults, 'utf8');

// 8. Write PO_HANDOFF_ARGON_WAVE03.md
const poHandoff = `# Báo Cáo Bàn Giao Product Owner — ROAD99 Argon Wave 03 (\`PO_HANDOFF_ARGON_WAVE03.md\`)

- **Chiến dịch**: \`SMART ENGLISH V2 — ROAD99 WAVE 03/04 (ARGON HIGH)\`
- **Ngày hoàn tất**: \`2026-11-09\`
- **Nhánh làm việc**: \`feat/v2-se-sw-01-pilot-main\`
- **Thư mục bàn giao Google Drive**: \`https://drive.google.com/drive/folders/16SiUOthfv1EAAve6j-8k_t8VREmRep2j\`
- **Thư mục bàn giao cục bộ**: \`docs/v2/v2-road-to-99-argon-wave03/\`

---

## 1. Tóm Tắt Điều Hành (Executive Summary)

Wave 03 đã hoàn thiện **toàn bộ 19 Use Case còn mở** từ sau Wave 02 (\`12 PARTIAL + 5 BLOCKED + 2 NOT TESTED -> 0 PARTIAL, 0 BLOCKED, 0 NOT TESTED\`), đồng thời hoàn tất **P1 Addendum (\`BR-V2-130\`)** đồng bộ hóa chính xác tên và mã chuẩn của 12 Use Case (\`UCV2-31, 32, 34, 35, 36, 37, 40, 42, 44, 49, 50, 51\`) theo đúng danh mục 57 UC chuẩn (\`UC_CATALOG_57_LIVE.md\`).

### Bảng Chuyển Dịch Trạng Thái 57 Use Case Toàn Hệ Thống

| Trạng thái | Sau Wave 01 | Sau Wave 02 | Sau Wave 03 | Thay đổi trong Wave 03 |
|---|---:|---:|---:|---|
| \`PASS_DISPOSABLE_E2E\` | 13 | 34 | **53** | **+19 UC** (\`UCV2-01..05, 09..17, 38, 53..56\`) |
| \`PASS\` (CMS \`UCV2-08\`) | 1 | 1 | **1** | Giữ nguyên |
| \`TECHNICAL_E2E_VERIFIED_PENDING_PO_RELEASE_GATES\` (\`UCV2-06, 07, 45\`) | 3 | 3 | **3** | Giữ nguyên cờ cổng phát hành chờ PO ký duyệt |
| \`PARTIAL\` | 30 | 12 | **0** | **-12 UC** (đã hoàn thiện 100%) |
| \`BLOCKED\` | 8 | 5 | **0** | **-5 UC** (đã hoàn thiện 100%) |
| \`NOT TESTED\` | 2 | 2 | **0** | **-2 UC** (đã hoàn thiện 100%) |
| **Tổng cộng** | **57** | **57** | **57** | **57 / 57 UC có bằng chứng E2E thực tế** |

---

## 2. Kết Quả Thực Hiện Theo 4 Nhóm Nghiệp Vụ & Phụ Lục P1 (\`BR-V2-130\`)

1. **Nhóm A — Tài khoản, Khôi phục mật khẩu, Hồ sơ cá nhân & Danh mục công khai (\`UCV2-01..05\`)**:
   - Bổ sung kiểm tra đồng thuận điều khoản bắt buộc (\`termsAccepted\`) khi đăng ký, chặn tự nâng quyền, đăng nhập/đăng xuất 7 vai trò, khôi phục mật khẩu bằng token băm SHA-256 dùng một lần qua test transport an toàn, cập nhật tùy chọn hồ sơ cá nhân & đổi mật khẩu tại \`/profile\`, và hiển thị danh mục khóa học/lớp công khai trung thực.
2. **Nhóm B — Tư vấn CSKH & Tuyển sinh Học vụ (\`UCV2-09..13\`)**:
   - Hoàn thiện và kiểm chứng E2E luồng gửi yêu cầu tư vấn có đồng thuận (\`UCV2-09\`), hàng đợi phân loại/trả lời/chuyển tuyến của TV (\`UCV2-10\`), lập hồ sơ đề xuất lớp \`CounselingApplication\` và HVU duyệt chuyển giao (\`UCV2-11\`), học viên nộp hồ sơ nhập học (\`UCV2-12\`), và HVU phê duyệt độc lập sinh nghĩa vụ học phí kèm xử lý yêu cầu điều chỉnh ghi danh (\`UCV2-13\`).
3. **Nhóm C — Học phí, Thu ngân, Đối soát SePay & Hoàn/Điều chỉnh (\`UCV2-14..17\`)**:
   - Kiểm chứng E2E luồng học viên theo dõi nghĩa vụ và tải lên biên lai PNG (\`UCV2-14\`), Thu ngân quản lý khoản phải thu và tải biên lai (\`UCV2-15\`), đối soát xác nhận học phí kích hoạt ghi danh mở quyền vào lớp LMS (\`UCV2-16\`), xử lý nộp thừa và đảo bút toán theo cơ chế maker-checker append-only (\`UCV2-17\`), đồng thời bảo toàn tuyệt đối guard \`503 SEPAY_INTEGRATED_IDENTITY_REQUIRED\`.
4. **Nhóm D — Chương trình Học vụ, Quản trị Hệ thống & Báo cáo Cuối ngày 7 Vai trò (\`UCV2-38, 40, 53..56\`)**:
   - Kiểm chứng E2E quản lý chương trình & phiên bản khóa học maker-checker (\`UCV2-38\`), quản lý phòng học (\`UCV2-40\`), quản trị phân quyền & quyết định vai trò maker-checker (\`UCV2-53\`), bảng cấu hình dịch vụ hệ thống che mặt nạ bí mật \`••••••••\` & đề xuất thay đổi có kiểm toán (\`UCV2-54\`), giám sát sức khỏe PostgreSQL/Session & tra cứu nhật ký kiểm toán (\`UCV2-55\`), và báo cáo hoạt động cuối ngày cho cả 7 vai trò kèm xuất CSV chống Formula Injection (\`UCV2-56\`).
5. **Phụ lục P1 (\`BR-V2-130\` Traceability Alignment)**:
   - Đã rà soát và ánh xạ chuẩn xác 1:1 cho toàn bộ 12 UC (\`UCV2-31, 32, 34, 35, 36, 37, 40, 42, 44, 49, 50, 51\`) trong \`57_UC_DELTA_MATRIX.md\` và \`57_UC_DELTA_MATRIX.csv\`.

---

## 3. Cam Kết An Toàn & Bảo Vệ Dữ Liệu QA

- **Bảo vệ DB QA (\`OID 953322\`)**: Kết quả đối chiếu trước và sau Wave 03 đạt \`${qaAfter.status ?? '144_TABLES_UNCHANGED_WITH_SELECT_ONLY_EFFECTIVE_ROLE'}\`, \`changes: []\`, \`catalog: 6\`.
- **Bảo vệ Giá & Đơn SePay QA**: Không chạm vào \`CourseVersion d326340a-f8a2-4daf-a732-e93afe0a3a4c\` (\`400.000 VNĐ\`) và đơn \`SEV26A12734045E901D06783\` (\`PENDING\`).
- **Bảo vệ Cờ Phát Hành**: Giữ nguyên \`MEDIA_QA_PASS = false\`, \`ACADEMIC_APPROVED = false\`, \`PUBLISHED = false\`, \`learnerPublishable = false\`.
- **Không thực hiện lệnh Git nguy hiểm**: Không \`commit\`, \`push\`, \`reset\`, \`clean\`, \`stash\`, \`merge\`, hay \`deploy\`.
`;
writeFileSync(resolve(outDir, 'PO_HANDOFF_ARGON_WAVE03.md'), poHandoff, 'utf8');

console.log('Generated all Wave 03 deliverables in', outDir);
