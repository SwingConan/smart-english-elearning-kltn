import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from './auth-context';

export function AuthNavigation() {
  const { user, isLoading, logout } = useAuth();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);

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
    setLogoutError(false);
    try {
      await logout();
      navigate('/');
    } catch {
      setLogoutError(true);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <span>{user.fullName}</span>
      <button
        className="rounded-md border px-3 py-1 disabled:opacity-50"
        disabled={isLoggingOut}
        onClick={() => void handleLogout()}
        type="button"
      >
        {isLoggingOut ? 'Đang đăng xuất...' : 'Đăng xuất'}
      </button>
      {logoutError ? (
        <span className="text-xs text-red-700" role="alert">
          Không thể đăng xuất. Vui lòng thử lại.
        </span>
      ) : null}
    </div>
  );
}
