import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { RoleRoute } from '@/features/auth/RoleRoute';
import { ClassShellLayout } from '@/layouts/ClassShellLayout';
import { AdminLayout } from '@/layouts/AdminLayout';
import { AdminCriteriaLayout } from '@/layouts/AdminCriteriaLayout';
import { InstructorClassWorkspaceLayout } from '@/layouts/InstructorClassWorkspaceLayout';
import { PublicLayout } from '@/layouts/PublicLayout';
import { PlacementExamLayout } from '@/layouts/PlacementExamLayout';
import { StudentLayout } from '@/layouts/StudentLayout';
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
import { NewsEventDetailPage } from '@/pages/NewsEventDetailPage';
import { NewsEventsPage } from '@/pages/NewsEventsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ProgressPage } from '@/pages/ProgressPage';
import { PlacementExamPage } from '@/pages/PlacementExamPage';
import { PlacementPage } from '@/pages/PlacementPage';
import { PlacementResultPage } from '@/pages/PlacementResultPage';
import { QuestionBankPage } from '@/pages/QuestionBankPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { StudentAdaptivePathPage } from '@/pages/StudentAdaptivePathPage';
import { StudentAssessmentListPage } from '@/pages/StudentAssessmentListPage';
import { StudentMasteryPage } from '@/pages/StudentMasteryPage';
import { StudentTestAttemptPage } from '@/pages/StudentTestAttemptPage';
import { StudentTestResultPage } from '@/pages/StudentTestResultPage';
import { StudyRecommendationsPage } from '@/pages/StudyRecommendationsPage';
import { SystemStatusPage } from '@/pages/SystemStatusPage';
import { TestEditorPage } from '@/pages/TestEditorPage';
import { TestManagementPage } from '@/pages/TestManagementPage';

const student = (element: ReactNode) => <RoleRoute allowedRoles={['STUDENT']}>{element}</RoleRoute>;
const instructor = (element: ReactNode) => (
  <RoleRoute allowedRoles={['INSTRUCTOR']}>{element}</RoleRoute>
);
const admin = (element: ReactNode) => (
  <RoleRoute allowedRoles={['ADMIN_COORDINATOR']}>{element}</RoleRoute>
);

export function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="catalog" element={<CatalogPage />} />
        <Route path="catalog/:slug" element={<CourseDetailPage />} />
        <Route path="classes/:id" element={<ClassOfferingDetailPage />} />
        <Route path="guide" element={<GuidePage />} />
        <Route path="placement" element={<PlacementPage />} />
        <Route path="news-events" element={<NewsEventsPage />} />
        <Route path="news-events/:slug" element={<NewsEventDetailPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="status" element={<SystemStatusPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />

        <Route path="instructor/teaching" element={instructor(<InstructorTeachingPage />)} />
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
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route path="admin" element={admin(<AdminLayout />)}>
        <Route index element={<Navigate replace to="courses" />} />
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

      <Route element={student(<StudentLayout />)}>
        <Route path="student/enrollments" element={<MyEnrollmentsPage />} />
      </Route>
      <Route element={student(<PlacementExamLayout />)}>
        <Route path="placement/attempts/:attemptId/exam" element={<PlacementExamPage />} />
        <Route path="placement/attempts/:attemptId/result" element={<PlacementResultPage />} />
      </Route>
      <Route path="student/enrollments/:enrollmentId" element={student(<ClassShellLayout />)}>
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
        element={student(<StudentMasteryPage />)}
      />
      <Route
        path="student/enrollments/:enrollmentId/path"
        element={student(<StudentAdaptivePathPage />)}
      />
    </Routes>
  );
}
