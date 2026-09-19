import { Link, Route, Routes } from 'react-router';
import { HomePage } from '@/pages/HomePage';
import { SystemStatusPage } from '@/pages/SystemStatusPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link className="font-semibold" to="/">
            Smart English E-Learning
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link to="/catalog">Khóa học</Link>
            <Link to="/status">System Status</Link>
            <Link to="/login">Đăng nhập</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/status" element={<SystemStatusPage />} />
          <Route path="/catalog" element={<PlaceholderPage title="Public Catalog" />} />
          <Route path="/login" element={<PlaceholderPage title="Login" />} />
          <Route path="/student/*" element={<PlaceholderPage title="Student Area" />} />
          <Route path="/instructor/*" element={<PlaceholderPage title="Instructor Area" />} />
          <Route path="/admin/*" element={<PlaceholderPage title="Admin / Điều phối" />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  );
}
