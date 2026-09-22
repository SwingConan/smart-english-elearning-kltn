import { Link, Route, Routes } from 'react-router';
import { HomePage } from '@/pages/HomePage';
import { SystemStatusPage } from '@/pages/SystemStatusPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { AuthNavigation } from '@/features/auth/AuthNavigation';
import { RoleRoute } from '@/features/auth/RoleRoute';
import { CatalogPage } from '@/pages/CatalogPage';
import { CourseDetailPage } from '@/pages/CourseDetailPage';
import { AdminCoursesPage } from '@/pages/AdminCoursesPage';
import { AdminClassOfferingsPage } from '@/pages/AdminClassOfferingsPage';
import { MyEnrollmentsPage } from '@/pages/MyEnrollmentsPage';
import { LearningPage } from '@/pages/LearningPage';
import { InstructorTeachingPage } from '@/pages/InstructorTeachingPage';
import { CourseContentManagementPage } from '@/pages/CourseContentManagementPage';
import { QuestionBankPage } from '@/pages/QuestionBankPage';
import { TestManagementPage } from '@/pages/TestManagementPage';
import { TestEditorPage } from '@/pages/TestEditorPage';
import { StudentAssessmentListPage } from '@/pages/StudentAssessmentListPage';
import { StudentTestAttemptPage } from '@/pages/StudentTestAttemptPage';
import { StudentTestResultPage } from '@/pages/StudentTestResultPage';
import { KnowledgeModelPage } from '@/pages/KnowledgeModelPage';
import { StudentMasteryPage } from '@/pages/StudentMasteryPage';

export function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link className="font-semibold" to="/">
            Smart English E-Learning
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/catalog">Khóa học</Link>
            <Link to="/status">System Status</Link>
            <AuthNavigation />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/status" element={<SystemStatusPage />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/catalog/:slug" element={<CourseDetailPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Student routes */}
          <Route
            path="/student/enrollments"
            element={
              <RoleRoute allowedRoles={['STUDENT']}>
                <MyEnrollmentsPage />
              </RoleRoute>
            }
          />
          <Route
            path="/student/enrollments/:enrollmentId/learn"
            element={
              <RoleRoute allowedRoles={['STUDENT']}>
                <LearningPage />
              </RoleRoute>
            }
          />
          <Route
            path="/student/enrollments/:enrollmentId/mastery"
            element={
              <RoleRoute allowedRoles={['STUDENT']}>
                <StudentMasteryPage />
              </RoleRoute>
            }
          />

          {/* Instructor routes */}
          <Route
            path="/instructor/teaching"
            element={
              <RoleRoute allowedRoles={['INSTRUCTOR']}>
                <InstructorTeachingPage />
              </RoleRoute>
            }
          />
          <Route
            path="/instructor/courses/:courseId/content"
            element={
              <RoleRoute allowedRoles={['INSTRUCTOR']}>
                <CourseContentManagementPage />
              </RoleRoute>
            }
          />
          <Route
            path="/student/enrollments/:enrollmentId/tests"
            element={
              <RoleRoute allowedRoles={['STUDENT']}>
                <StudentAssessmentListPage />
              </RoleRoute>
            }
          />
          <Route
            path="/student/enrollments/:enrollmentId/attempts/:attemptId"
            element={
              <RoleRoute allowedRoles={['STUDENT']}>
                <StudentTestAttemptPage />
              </RoleRoute>
            }
          />
          <Route
            path="/student/enrollments/:enrollmentId/attempts/:attemptId/result"
            element={
              <RoleRoute allowedRoles={['STUDENT']}>
                <StudentTestResultPage />
              </RoleRoute>
            }
          />
          <Route
            path="/instructor/courses/:courseId/skills"
            element={
              <RoleRoute allowedRoles={['INSTRUCTOR']}>
                <KnowledgeModelPage />
              </RoleRoute>
            }
          />
          <Route
            path="/instructor/courses/:courseId/question-bank"
            element={
              <RoleRoute allowedRoles={['INSTRUCTOR']}>
                <QuestionBankPage />
              </RoleRoute>
            }
          />
          <Route
            path="/instructor/courses/:courseId/tests"
            element={
              <RoleRoute allowedRoles={['INSTRUCTOR']}>
                <TestManagementPage />
              </RoleRoute>
            }
          />
          <Route
            path="/instructor/tests/:testId/edit"
            element={
              <RoleRoute allowedRoles={['INSTRUCTOR']}>
                <TestEditorPage />
              </RoleRoute>
            }
          />

          {/* Admin routes */}
          <Route
            path="/admin/courses"
            element={
              <RoleRoute allowedRoles={['ADMIN_COORDINATOR']}>
                <AdminCoursesPage />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/class-offerings"
            element={
              <RoleRoute allowedRoles={['ADMIN_COORDINATOR']}>
                <AdminClassOfferingsPage />
              </RoleRoute>
            }
          />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  );
}
