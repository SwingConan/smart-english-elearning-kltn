import { ConsultationsPage } from '@/pages/ConsultationsPage';
import {
  KnowledgeLibraryPage,
  KnowledgeArticlePage,
  KnowledgeWorkspacePage,
  KnowledgeEditorPage,
} from '@/pages/KnowledgeLibraryPage';
import { SupportHomePage, SupportWorkspacePage, SupportTicketPage } from '@/pages/SupportPage';
import {
  QuizAuthorPage,
  QuizCheckerPage,
  QuizLaunchPage,
  QuizExamPage,
} from '@/pages/ClassQuizPage';
import {
  AssignmentGradingPage,
  AssignmentCheckerPage,
  AssignmentGradebookPage,
} from '@/pages/AssignmentGradingPage';
import { LocalQuizCreatePage } from '@/features/class-lms/LocalQuizPanel';
import { LocalAttendanceCreatePage } from '@/features/class-lms/LocalAttendancePanel';
import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router';
import { RoleRoute } from '@/features/auth/RoleRoute';
import { useAuth } from '@/features/auth/auth-context';
import { OperationsPage } from '@/features/operations/OperationsPage';
import { AdminOperationsCenterPage } from '@/features/operations/AdminOperationsCenterPage';
import { RoleReportsPage } from '@/features/operations/RoleReportsPage';
import { CmsPublicPage } from '@/features/operations/CmsPublicPage';
import { operationsRoles } from '@/features/operations/model';
import { AcademicDashboardPage } from '@/pages/AcademicDashboardPage';
import { AcademicProgramPage } from '@/pages/AcademicProgramPage';
import { AcademicClassPage } from '@/pages/AcademicClassPage';
import { AcademicPlanningPage } from '@/pages/AcademicPlanningPage';
import { AcademicApprovalsPage } from '@/pages/AcademicApprovalsPage';
import { AcademicVersionsPage } from '@/pages/AcademicVersionsPage';
import { AcademicCalendarPage } from '@/pages/AcademicCalendarPage';
import { MyDashboardPage, MyCalendarEventPage } from '@/pages/MyDashboardPage';
import {
  AdmissionsPage,
  AdmissionDetailPage,
  AdmissionsWorkspacePage,
} from '@/pages/AdmissionsFinancePage';
import { ClassAttendancePage, SessionEngagementReviewPage } from '@/pages/SessionEngagementPage';
import { InspectionPage } from '@/pages/InspectionPage';
import {
  CertificatesWorkspacePage,
  CertificateLookupPage,
} from '@/pages/CertificatesWorkspacePage';
import {
  ClassLearningPage,
  ClassActivityEditorPage,
  ClassActivityPage,
} from '@/pages/ClassLearningPage';
import { PermissionRoute } from '@/features/auth/PermissionRoute';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { RoleWorkspacePage, WorkspaceClassPage } from '@/pages/RoleWorkspacePage';
import { AuthorityPage } from '@/pages/AuthorityPage';
import { ClassShellLayout } from '@/layouts/ClassShellLayout';
import { SePayPaymentsPage } from '@/pages/SePayPaymentsPage';
import { AdminLayout } from '@/layouts/AdminLayout';
import { AdminCriteriaLayout } from '@/layouts/AdminCriteriaLayout';
import { InstructorClassWorkspaceLayout } from '@/layouts/InstructorClassWorkspaceLayout';
import { ActorWorkspaceLayout } from '@/layouts/ActorWorkspaceLayout';
import { PublicLayout } from '@/layouts/PublicLayout';
import { PlacementExamLayout } from '@/layouts/PlacementExamLayout';
import { LearnerServiceLayout } from '@/layouts/LearnerServiceLayout';
import { AboutPage } from '@/pages/AboutPage';
import { AdaptivePolicyPage } from '@/pages/AdaptivePolicyPage';
import { AdminClassOfferingsPage } from '@/pages/AdminClassOfferingsPage';
import { AdminClassOfferingEditorPage } from '@/pages/AdminClassOfferingEditorPage';
import { AdminClassOfferingOperationsPage } from '@/pages/AdminClassOfferingOperationsPage';
import { AdminCourseEditorPage } from '@/pages/AdminCourseEditorPage';
import { AdminCoursesPage } from '@/pages/AdminCoursesPage';
import { AdminStudyRecommendationPolicyPage } from '@/pages/AdminStudyRecommendationPolicyPage';
import { AdminEvaluationCriteriaPage } from '@/pages/AdminEvaluationCriteriaPage';
import { AdminCourseRecommendationProfilesPage } from '@/pages/AdminCourseRecommendationProfilesPage';
import { AdminCourseRecommendationProfilePage } from '@/pages/AdminCourseRecommendationProfilePage';
import { AdminAccountsPage } from '@/pages/AdminAccountsPage';
import { AdminReportsPage } from '@/pages/AdminReportsPage';
import { S10RecoveryPage } from '@/pages/S10RecoveryPage';
import { AdminAccountCreatePage } from '@/pages/AdminAccountCreatePage';
import { AdminAccountDetailPage } from '@/pages/AdminAccountDetailPage';
import { ClassOfferingDetailPage } from '@/pages/ClassOfferingDetailPage';
import { ClassOverviewPage } from '@/pages/ClassOverviewPage';
import { ClassResultsPage } from '@/pages/ClassResultsPage';
import { ClassAssessmentManagementPage } from '@/pages/ClassAssessmentManagementPage';
import { AssessmentGradingQueuePage } from '@/pages/AssessmentGradingQueuePage';
import { AssessmentGradingDetailPage } from '@/pages/AssessmentGradingDetailPage';
import { ContactPage } from '@/pages/ContactPage';
import { CourseContentManagementPage } from '@/pages/CourseContentManagementPage';
import { CourseDetailPage } from '@/pages/CourseDetailPage';
import { CatalogPage } from '@/pages/CatalogPage';
import { GuidePage } from '@/pages/GuidePage';
import { HomePage } from '@/pages/HomePage';
import { InstructorLearnerMasteryPage } from '@/pages/InstructorLearnerMasteryPage';
import { InstructorTeachingPage } from '@/pages/InstructorTeachingPage';
import { InstructorAssessmentsHubPage } from '@/pages/InstructorAssessmentsHubPage';
import { InstructorRequestsPage } from '@/pages/InstructorRequestsPage';
import { InstructorClassOverviewPage } from '@/pages/InstructorClassOverviewPage';
import { InstructorRosterPage } from '@/pages/InstructorRosterPage';
import { InstructorLearnerDetailPage } from '@/pages/InstructorLearnerDetailPage';
import { InstructorClassContentPage } from '@/pages/InstructorClassContentPage';
import { InstructorClassGradingPage } from '@/pages/InstructorClassGradingPage';
import { InstructorClassResultsPage } from '@/pages/InstructorClassResultsPage';
import { KnowledgeModelPage } from '@/pages/KnowledgeModelPage';
import { LearningPage } from '@/pages/LearningPage';
import { LessonPage } from '@/pages/LessonPage';
import { LoginPage } from '@/pages/LoginPage';
import { MyEnrollmentsPage } from '@/pages/MyEnrollmentsPage';
import { StudentFinancePage } from '@/features/learner/StudentFinancePage';
import { NewsEventDetailPage } from '@/pages/NewsEventDetailPage';
import { NewsEventsPage } from '@/pages/NewsEventsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ProgressPage } from '@/pages/ProgressPage';
import { PlacementExamPage } from '@/pages/PlacementExamPage';
import {
  PlacementWorkflowPage,
  PlacementSittingPage,
  PlacementWorkflowResultPage,
  PlacementWorkflowReviewPage,
} from '@/pages/PlacementWorkflowPage';
import {
  PlacementIntegrationPage as PlacementPage,
  PlacementDiagnosticPage as PlacementResultPage,
  PlacementPreviewExamPage,
} from '@/pages/PlacementIntegrationPage';
import { QuestionBankPage } from '@/pages/QuestionBankPage';
import { PlacementMicrophonePage } from '@/pages/PlacementMicrophonePage';
import { RegisterPage } from '@/pages/RegisterPage';
import { ProfilePage } from '@/features/product/ProfilePage';
import { ClassProgressPage } from '@/features/product/ClassProgressPage';
import { CompletionPage } from '@/features/product/CompletionPage';
import { OperationsLivePage } from '@/features/product/OperationsLivePage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { StudentAdaptivePathPage } from '@/pages/StudentAdaptivePathPage';
import { StudentAssessmentListPage } from '@/pages/StudentAssessmentListPage';
import { StudentMasteryPage } from '@/pages/StudentMasteryPage';
import { StudentTestAttemptPage } from '@/pages/StudentTestAttemptPage';
import { StudentTestResultPage } from '@/pages/StudentTestResultPage';
import { PracticeTestsPage } from '@/pages/PracticeTestsPage';
import { PracticeTestAttemptPage } from '@/pages/PracticeTestAttemptPage';
import { PracticeTestResultPage } from '@/pages/PracticeTestResultPage';
import { StudyRecommendationsPage } from '@/pages/StudyRecommendationsPage';
import { SystemStatusPage } from '@/pages/SystemStatusPage';
import { TestEditorPage } from '@/pages/TestEditorPage';
import { TestManagementPage } from '@/pages/TestManagementPage';

const student = (element: ReactNode) => <RoleRoute allowedRoles={['STUDENT']}>{element}</RoleRoute>;
const instructor = (element: ReactNode) => (
  <RoleRoute allowedRoles={['INSTRUCTOR']}>{element}</RoleRoute>
);
const admin = (element: ReactNode) => <PermissionRoute>{element}</PermissionRoute>;
function StaffOperationsRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user?.role === 'STUDENT' ? (
    <Navigate to="/workspace" replace />
  ) : (
    <RoleRoute allowedRoles={operationsRoles}>{children}</RoleRoute>
  );
}

function OperationsRouteTarget() {
  const { user } = useAuth();
  const { section } = useParams();
  return user?.role === 'SYSTEM_ADMIN' && section !== 'reports' ? (
    <AdminOperationsCenterPage />
  ) : (
    <OperationsPage />
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
      <Route element={<ActorWorkspaceLayout />}>
        <Route
          path="profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="student/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route path="classroom/:classId/progress" element={student(<ClassProgressPage />)} />
        <Route path="completion" element={student(<CompletionPage />)} />
        <Route path="my/progress" element={student(<CompletionPage />)} />
        <Route
          path="workspace/operations/live"
          element={
            <StaffOperationsRoute>
              <OperationsLivePage />
            </StaffOperationsRoute>
          }
        />
        <Route
          path="payments/sepay"
          element={
            <RoleRoute allowedRoles={['STUDENT', 'CASHIER', 'SYSTEM_ADMIN']}>
              <SePayPaymentsPage />
            </RoleRoute>
          }
        />
        <Route
          path="admissions"
          element={
            <RoleRoute allowedRoles={['STUDENT']}>
              <AdmissionsPage />
            </RoleRoute>
          }
        />
        <Route
          path="admissions/:id"
          element={
            <RoleRoute allowedRoles={['STUDENT', 'ACADEMIC_MANAGER', 'CASHIER']}>
              <AdmissionDetailPage />
            </RoleRoute>
          }
        />
        <Route
          path="workspace/admissions"
          element={
            <RoleRoute allowedRoles={['ACADEMIC_MANAGER', 'CASHIER']}>
              <AdmissionsWorkspacePage />
            </RoleRoute>
          }
        />
        <Route
          path="workspace/inspection"
          element={
            <RoleRoute allowedRoles={['ACADEMIC_MANAGER', 'TEACHING_INSPECTOR', 'INSTRUCTOR']}>
              <InspectionPage />
            </RoleRoute>
          }
        />
        <Route
          path="workspace/certificates"
          element={
            <RoleRoute allowedRoles={['ACADEMIC_MANAGER']}>
              <CertificatesWorkspacePage />
            </RoleRoute>
          }
        />
        <Route
          path="certificates/lookup"
          element={
            <ProtectedRoute>
              <CertificateLookupPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="academic/session-engagement"
          element={
            <RoleRoute allowedRoles={['ACADEMIC_MANAGER']}>
              <SessionEngagementReviewPage />
            </RoleRoute>
          }
        />
        <Route
          path="classroom/:classId/attendance"
          element={
            <RoleRoute allowedRoles={['INSTRUCTOR', 'STUDENT']}>
              <ClassAttendancePage />
            </RoleRoute>
          }
        />
        <Route
          path="consultations"
          element={
            <RoleRoute allowedRoles={['STUDENT', 'INSTRUCTOR', 'ACADEMIC_MANAGER']}>
              <ConsultationsPage />
            </RoleRoute>
          }
        />
        <Route
          path="my"
          element={
            <ProtectedRoute>
              <MyDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="my/calendar"
          element={
            <ProtectedRoute>
              <MyDashboardPage full />
            </ProtectedRoute>
          }
        />
        <Route
          path="my/events/:id"
          element={
            <ProtectedRoute>
              <MyCalendarEventPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="classroom/:classId"
          element={
            <RoleRoute allowedRoles={['INSTRUCTOR', 'STUDENT']}>
              <ClassLearningPage />
            </RoleRoute>
          }
        />
        <Route
          path="classroom/:classId/completion"
          element={instructor(<ClassLearningPage />)}
        />
        <Route
          path="classroom/:classId/sections/:sectionId/activities/new"
          element={instructor(<ClassActivityEditorPage />)}
        />
        <Route
          path="classroom/:classId/sections/:sectionId/activities/:activityId/edit"
          element={instructor(<ClassActivityEditorPage />)}
        />
        <Route
          path="classroom/:classId/activities/:activityId"
          element={
            <RoleRoute allowedRoles={['INSTRUCTOR', 'STUDENT']}>
              <ClassActivityPage />
            </RoleRoute>
          }
        />
        <Route
          path="classroom/:classId/activities/:activityId/grading"
          element={instructor(<AssignmentGradingPage />)}
        />
        <Route
          path="classroom/:classId/sections/:sectionId/quizzes/new"
          element={instructor(<QuizAuthorPage />)}
        />
        <Route
          path="classroom/:classId/sections/:sectionId/local-quiz/new"
          element={instructor(<LocalQuizCreatePage />)}
        />
        <Route
          path="classroom/:classId/sections/:sectionId/attendance/new"
          element={instructor(<LocalAttendanceCreatePage />)}
        />
        <Route
          path="classroom/:classId/activities/:activityId/quiz-author"
          element={instructor(<QuizAuthorPage />)}
        />
        <Route
          path="classroom/:classId/activities/:activityId/quiz"
          element={student(<QuizLaunchPage />)}
        />
        <Route
          path="academic/quizzes"
          element={
            <RoleRoute allowedRoles={['ACADEMIC_MANAGER']}>
              <QuizCheckerPage />
            </RoleRoute>
          }
        />
        <Route path="knowledge" element={student(<KnowledgeLibraryPage />)} />
        <Route path="knowledge/articles/:slug" element={student(<KnowledgeArticlePage />)} />
        <Route
          path="knowledge/workspace"
          element={
            <RoleRoute allowedRoles={['INSTRUCTOR', 'ACADEMIC_MANAGER']}>
              <KnowledgeWorkspacePage />
            </RoleRoute>
          }
        />
        <Route path="knowledge/editor" element={instructor(<KnowledgeEditorPage />)} />
        <Route path="knowledge/editor/:revisionId" element={instructor(<KnowledgeEditorPage />)} />
        <Route path="classroom/:classId/gradebook" element={student(<AssignmentGradebookPage />)} />
        <Route
          path="academic/grading"
          element={
            <RoleRoute allowedRoles={['ACADEMIC_MANAGER']}>
              <AssignmentCheckerPage />
            </RoleRoute>
          }
        />
        <Route
          path="academic/planning"
          element={
            <RoleRoute allowedRoles={['ACADEMIC_MANAGER']}>
              <AcademicPlanningPage />
            </RoleRoute>
          }
        />
        <Route
          path="academic/approvals"
          element={
            <RoleRoute allowedRoles={['ACADEMIC_MANAGER']}>
              <AcademicApprovalsPage />
            </RoleRoute>
          }
        />
        <Route
          path="academic/programs/:id/versions"
          element={
            <RoleRoute allowedRoles={['ACADEMIC_MANAGER']}>
              <AcademicVersionsPage />
            </RoleRoute>
          }
        />
        <Route
          path="calendar"
          element={
            <RoleRoute
              allowedRoles={['ACADEMIC_MANAGER', 'INSTRUCTOR', 'STUDENT', 'TEACHING_INSPECTOR']}
            >
              <AcademicCalendarPage />
            </RoleRoute>
          }
        />
        <Route
          path="academic"
          element={
            <RoleRoute allowedRoles={['ACADEMIC_MANAGER']}>
              <AcademicDashboardPage />
            </RoleRoute>
          }
        />
        <Route
          path="academic/programs/:id"
          element={
            <RoleRoute allowedRoles={['ACADEMIC_MANAGER']}>
              <AcademicProgramPage />
            </RoleRoute>
          }
        />
        <Route
          path="academic/classes/:id"
          element={
            <RoleRoute allowedRoles={['ACADEMIC_MANAGER', 'INSTRUCTOR', 'STUDENT']}>
              <AcademicClassPage />
            </RoleRoute>
          }
        />
        <Route
          path="workspace/reports"
          element={
            <RoleRoute allowedRoles={operationsRoles}>
              <RoleReportsPage />
            </RoleRoute>
          }
        />
        <Route
          path="workspace/operations/:section?"
          element={
            <StaffOperationsRoute>
              <OperationsRouteTarget />
            </StaffOperationsRoute>
          }
        />
        <Route path="my-dashboard" element={<Navigate to="/my/" replace />} />
        <Route
          path="workspace"
          element={
            <ProtectedRoute>
              <RoleWorkspacePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="workspace/classes/:id"
          element={
            <ProtectedRoute>
              <WorkspaceClassPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="workspace/authority"
          element={
            <PermissionRoute capability="accountsManage">
              <AuthorityPage />
            </PermissionRoute>
          }
        />
        <Route
          path="admin/exam-recovery/s10"
          element={
            <PermissionRoute capability="recoveryApprove">
              <S10RecoveryPage />
            </PermissionRoute>
          }
        />
        <Route
          path="workspace/placement"
          element={
            <ProtectedRoute>
              <PlacementWorkflowPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="workspace/placement/attempts/:attemptId"
          element={
            <ProtectedRoute>
              <PlacementWorkflowReviewPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="support/tickets/:ticketId"
          element={
            <ProtectedRoute>
              <SupportTicketPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="workspace/support"
          element={
            <ProtectedRoute>
              <SupportWorkspacePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="workspace/support/tickets/:ticketId"
          element={
            <ProtectedRoute>
              <SupportTicketPage />
            </ProtectedRoute>
          }
        />
        <Route path="instructor/teaching" element={instructor(<InstructorTeachingPage />)} />
        <Route
          path="instructor/assessments-hub"
          element={instructor(<InstructorAssessmentsHubPage />)}
        />
        <Route path="instructor/requests" element={instructor(<InstructorRequestsPage />)} />
        <Route
          path="instructor/courses/:courseId/content"
          element={instructor(<CourseContentManagementPage />)}
        />
        <Route
          path="instructor/courses/:courseId/skills"
          element={instructor(<KnowledgeModelPage />)}
        />
        <Route
          path="instructor/courses/:courseId/adaptive-policy"
          element={instructor(<AdaptivePolicyPage />)}
        />
        <Route
          path="instructor/courses/:courseId/learner-mastery"
          element={instructor(<InstructorLearnerMasteryPage />)}
        />
        <Route
          path="instructor/courses/:courseId/question-bank"
          element={instructor(<QuestionBankPage />)}
        />
        <Route
          path="instructor/courses/:courseId/tests"
          element={instructor(<TestManagementPage />)}
        />
        <Route path="instructor/tests/:testId/edit" element={instructor(<TestEditorPage />)} />
        <Route
          path="instructor/classes/:classOfferingId"
          element={instructor(<InstructorClassWorkspaceLayout />)}
        >
          <Route index element={<InstructorClassOverviewPage />} />
          <Route path="learners" element={<InstructorRosterPage />} />
          <Route path="learners/:enrollmentId" element={<InstructorLearnerDetailPage />} />
          <Route path="content" element={<InstructorClassContentPage />} />
          <Route path="assessments" element={<ClassAssessmentManagementPage />} />
          <Route path="grading" element={<InstructorClassGradingPage />} />
          <Route path="results" element={<InstructorClassResultsPage />} />
          <Route
            path="assessments/:classAssessmentId/grading"
            element={<AssessmentGradingQueuePage />}
          />
          <Route
            path="assessments/:classAssessmentId/attempts/:attemptId/grading"
            element={<AssessmentGradingDetailPage />}
          />
        </Route>
        <Route path="student/enrollments" element={student(<MyEnrollmentsPage />)} />
        <Route path="student/finance" element={student(<StudentFinancePage />)} />
        <Route path="student/billing" element={<Navigate to="/student/finance" replace />} />
        <Route path="student/bookings" element={student(<ConsultationsPage />)} />
        <Route path="student/placement" element={student(<PlacementPage />)} />
        <Route
          path="student/placement/microphone"
          element={student(<PlacementMicrophonePage />)}
        />
        <Route path="student/support" element={student(<SupportHomePage />)} />
        <Route path="student/support/tickets/:ticketId" element={student(<SupportTicketPage />)} />
        <Route element={student(<PlacementExamLayout embedded />)}>
          <Route path="classroom/:classId/quiz-attempts/:attemptId" element={<QuizExamPage />} />
          <Route path="placement/sittings/:attemptId" element={<PlacementSittingPage />} />
          <Route
            path="placement/sittings/:attemptId/result"
            element={<PlacementWorkflowResultPage />}
          />
          <Route path="placement/previews/:attemptId/exam" element={<PlacementPreviewExamPage />} />
          <Route path="placement/previews/:attemptId/result" element={<PlacementResultPage />} />
          <Route path="placement/attempts/:attemptId/exam" element={<PlacementExamPage />} />
          <Route path="placement/attempts/:attemptId/result" element={<PlacementResultPage />} />
        </Route>
        <Route
          path="student/enrollments/:enrollmentId"
          element={student(<ClassShellLayout embedded />)}
        >
          <Route index element={<ClassOverviewPage />} />
          <Route path="learn" element={<LearningPage />} />
          <Route path="lessons/:lessonId" element={<LessonPage />} />
          <Route path="tests" element={<StudentAssessmentListPage />} />
          <Route path="results" element={<ClassResultsPage />} />
          <Route path="recommendations" element={<StudyRecommendationsPage />} />
          <Route path="progress" element={<ProgressPage />} />
          <Route path="attempts/:attemptId" element={<StudentTestAttemptPage />} />
          <Route path="attempts/:attemptId/result" element={<StudentTestResultPage />} />
        </Route>
        <Route
          path="student/enrollments/:enrollmentId/mastery"
          element={student(
            <div className="workspace-page">
              <StudentMasteryPage />
            </div>,
          )}
        />
        <Route
          path="student/enrollments/:enrollmentId/path"
          element={student(
            <div className="workspace-page">
              <StudentAdaptivePathPage />
            </div>,
          )}
        />
      </Route>

      <Route element={<LearnerServiceLayout />}>
        <Route path="support" element={<SupportHomePage />} />
      </Route>
      <Route path="my/placement" element={<Navigate to="/student/placement" replace />} />

      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="placement" element={<PlacementPage />} />
        <Route path="placement/microphone" element={student(<PlacementMicrophonePage />)} />
        <Route path="practice-tests" element={<PracticeTestsPage />} />
        <Route
          path="practice-tests/:testId/history"
          element={student(<PracticeTestResultPage byTestHistory />)}
        />
        <Route
          path="practice-tests/attempts/:attemptId/result"
          element={student(<PracticeTestResultPage />)}
        />
        <Route path="catalog" element={<CatalogPage />} />
        <Route path="catalog/:slug" element={<CourseDetailPage />} />
        <Route path="classes/:id" element={<ClassOfferingDetailPage />} />
        <Route path="guide" element={<GuidePage />} />

        <Route path="news-events" element={<NewsEventsPage />} />
        <Route path="news-events/:slug" element={<NewsEventDetailPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="contact" element={<ContactPage />} />

        <Route path="cms/publications" element={<CmsPublicPage />} />
        <Route path="cms/publications/:slug" element={<CmsPublicPage />} />
        <Route path="status" element={<SystemStatusPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route
        path="practice-tests/attempts/:attemptId"
        element={student(<PracticeTestAttemptPage />)}
      />

      <Route path="admin" element={admin(<AdminLayout />)}>
        <Route index element={<Navigate replace to="reports" />} />
        <Route path="reports" element={<AdminReportsPage />} />
        <Route path="courses" element={<AdminCoursesPage />} />
        <Route path="courses/new" element={<AdminCourseEditorPage />} />
        <Route path="courses/:courseId/edit" element={<AdminCourseEditorPage />} />
        <Route path="class-offerings" element={<AdminClassOfferingsPage />} />
        <Route path="accounts" element={<AdminAccountsPage />} />
        <Route path="accounts/new" element={<AdminAccountCreatePage />} />
        <Route path="accounts/:userId" element={<AdminAccountDetailPage />} />
        <Route path="class-offerings/new" element={<AdminClassOfferingEditorPage />} />
        <Route
          path="class-offerings/:classOfferingId/edit"
          element={<AdminClassOfferingEditorPage />}
        />
        <Route
          path="class-offerings/:classOfferingId/operations"
          element={<AdminClassOfferingOperationsPage />}
        />
        <Route path="criteria" element={<AdminCriteriaLayout />}>
          <Route index element={<Navigate replace to="evaluation" />} />
          <Route path="evaluation" element={<AdminEvaluationCriteriaPage />} />
          <Route
            path="course-recommendations"
            element={<AdminCourseRecommendationProfilesPage />}
          />
          <Route
            path="course-recommendations/:courseId"
            element={<AdminCourseRecommendationProfilePage />}
          />
          <Route path="study-recommendations" element={<AdminStudyRecommendationPolicyPage />} />
        </Route>
        <Route
          path="study-recommendations"
          element={<Navigate replace to="/admin/criteria/study-recommendations" />}
        />
      </Route>
      </Routes>
    </>
  );
}
