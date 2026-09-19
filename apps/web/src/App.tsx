import { Link, Route, Routes } from 'react-router';
import { HomePage } from '@/pages/HomePage';
import { SystemStatusPage } from '@/pages/SystemStatusPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { AuthNavigation } from '@/features/auth/AuthNavigation';
import { RoleRoute } from '@/features/auth/RoleRoute';
import { CatalogPage } from '@/pages/CatalogPage';
import { CourseDetailPage } from '@/pages/CourseDetailPage';
import { AdminCoursesPage } from '@/pages/AdminCoursesPage';
import { AdminClassOfferingsPage } from '@/pages/AdminClassOfferingsPage';

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
          <Route
            path="/student/*"
            element={
              <RoleRoute allowedRoles={['STUDENT']}>
                <PlaceholderPage title="Student Area" />
              </RoleRoute>
            }
          />
          <Route
            path="/instructor/*"
            element={
              <RoleRoute allowedRoles={['INSTRUCTOR']}>
                <PlaceholderPage title="Instructor Area" />
              </RoleRoute>
            }
          />
          <Route path="/admin/courses" element={<RoleRoute allowedRoles={['ADMIN_COORDINATOR']}><AdminCoursesPage /></RoleRoute>} />
          <Route path="/admin/class-offerings" element={<RoleRoute allowedRoles={['ADMIN_COORDINATOR']}><AdminClassOfferingsPage /></RoleRoute>} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  );
}
