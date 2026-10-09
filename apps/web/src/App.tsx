import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router';
import { RoleRoute } from '@/features/auth/RoleRoute';
import { ClassShellLayout } from '@/layouts/ClassShellLayout';
import { InstructorClassWorkspaceLayout } from '@/layouts/InstructorClassWorkspaceLayout';
import { PublicLayout } from '@/layouts/PublicLayout';
import { PlacementExamLayout } from '@/layouts/PlacementExamLayout';
import { StudentLayout } from '@/layouts/StudentLayout';
import { AboutPage } from '@/pages/AboutPage';
import { AdaptivePolicyPage } from '@/pages/AdaptivePolicyPage';
import { AdminClassOfferingsPage } from '@/pages/AdminClassOfferingsPage';
import { AdminCoursesPage } from '@/pages/AdminCoursesPage';
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
        <Route path="instructor/classes/:classOfferingId" element={instructor(<InstructorClassWorkspaceLayout />)}>
          <Route index element={<InstructorClassOverviewPage />} />
          <Route path="learners" element={<InstructorRosterPage />} />
          <Route path="learners/:enrollmentId" element={<InstructorLearnerDetailPage />} />
          <Route path="content" element={<InstructorClassContentPage />} />
          <Route path="assessments" element={<ClassAssessmentManagementPage />} />
          <Route path="grading" element={<InstructorClassGradingPage />} />
          <Route path="results" element={<InstructorClassResultsPage />} />
          <Route path="assessments/:classAssessmentId/grading" element={<AssessmentGradingQueuePage />} />
          <Route path="assessments/:classAssessmentId/attempts/:attemptId/grading" element={<AssessmentGradingDetailPage />} />
        </Route>
        <Route path="admin/courses" element={admin(<AdminCoursesPage />)} />
        <Route path="admin/class-offerings" element={admin(<AdminClassOfferingsPage />)} />
        <Route path="*" element={<NotFoundPage />} />
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
