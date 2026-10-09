import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ConfirmDialog } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/feedback-context';
import { useAuth } from './auth-context';

export function AuthNavigation() {
  const { user, isLoading, logout } = useAuth();
  const navigate = useNavigate();
  const notify = useToast();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (isLoading) {
    return <span className="text-sm text-slate-500">Đang tải...</span>;
  }

  if (!user) {
    return (
      <div className="flex gap-4">
        <Link to="/login">Đăng nhập</Link>
        <Link to="/register">Đăng ký</Link>
      </div>
    );
  }

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      setConfirmOpen(false);
      navigate('/');
      notify('Phiên đăng nhập đã kết thúc an toàn.');
    } catch {
      notify('Không thể đăng xuất. Vui lòng thử lại.', 'error');
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {user.role === 'ADMIN_COORDINATOR' ? (
        <>
          <Link to="/admin/courses">Quản lý khóa học</Link>
          <Link to="/admin/class-offerings">Quản lý lớp học</Link>
        </>
      ) : null}
      {user.role === 'INSTRUCTOR' ? <Link to="/instructor/teaching">Lớp giảng dạy</Link> : null}
      {user.role === 'STUDENT' ? <Link to="/student/enrollments">Khóa học của tôi</Link> : null}
      <span>{user.fullName}</span>
      <button
        className="rounded-lg border border-slate-300 px-3 py-2 font-semibold transition hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50"
        disabled={isLoggingOut}
        onClick={() => setConfirmOpen(true)}
        type="button"
      >
        Đăng xuất
      </button>
      <ConfirmDialog
        busyLabel="Đang đăng xuất…"
        confirmLabel="Đăng xuất"
        description="Bạn sẽ cần đăng nhập lại để tiếp tục học hoặc quản lý lớp."
        isBusy={isLoggingOut}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void handleLogout()}
        open={confirmOpen}
        title="Kết thúc phiên đăng nhập?"
      />
    </div>
  );
}
