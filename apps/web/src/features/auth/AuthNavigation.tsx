import { useState } from 'react';
import { ChevronDown, UserRound } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ConfirmDialog } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/feedback-context';
import { useAuth } from './auth-context';
import { businessRoleLabels } from './business-role';
import { OperationsNavigationLink } from '@/features/operations/OperationsNavigationLink';
import { accountLabel } from '@/features/catalog/record-presentation';
import { HeaderDropdown } from '@/components/ui/HeaderDropdown';

export function AuthNavigation({
  layout = 'inline',
  surface = 'workspace',
}: {
  layout?: 'inline' | 'stacked';
  surface?: 'workspace' | 'public';
} = {}) {
  const { user, isLoading, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const notify = useToast();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (isLoading) {
    return <span className="text-sm text-slate-500">Đang tải...</span>;
  }

  if (!user) {
    return (
      <div className={layout === 'stacked' ? 'flex flex-col gap-2' : 'flex shrink-0 items-center gap-2 whitespace-nowrap'}>
        <Link className={surface === 'public' ? 'rounded-lg px-3 py-2 font-semibold text-[#3f642c] hover:bg-[#f2f7ee]' : undefined} to="/login">Đăng nhập</Link>
        <Link className={surface === 'public' ? 'rounded-lg bg-[#5f8b48] px-3 py-2 font-semibold text-white hover:bg-[#4c7238]' : undefined} to="/register">Đăng ký</Link>
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
    <div
      className={
        surface === 'public'
          ? layout === 'stacked' ? 'flex min-w-0 flex-col gap-3' : 'flex shrink-0 items-center gap-2 whitespace-nowrap'
          : layout === 'stacked'
          ? 'flex flex-col items-stretch gap-1.5 [&_a]:rounded-lg [&_a]:px-3 [&_a]:py-2 [&_a]:font-medium [&_a:hover]:bg-slate-50'
          : 'flex flex-wrap items-center gap-3'
      }
    >
      {surface === 'public' ? (
        <>
          <Link className="rounded-lg bg-[#5f8b48] px-3 py-2 text-center font-semibold text-white transition hover:bg-[#4c7238]" to="/workspace">
            {user.role === 'STUDENT' ? 'Vào trang học tập' : 'Vào không gian làm việc'}
          </Link>
          <HeaderDropdown stacked={layout === 'stacked'} label={<><UserRound aria-hidden="true" size={18} /><span className="sr-only">Menu tài khoản</span><ChevronDown aria-hidden="true" size={14} /></>}>
            <p className="break-words border-b border-slate-100 px-3 py-2 font-semibold text-slate-900">{accountLabel(user.fullName)}</p>
            <Link className="rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50" to="/profile">Hồ sơ cá nhân</Link>
            <button className="rounded-lg px-3 py-2 text-left font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={isLoggingOut} onClick={() => setConfirmOpen(true)} type="button">Đăng xuất</button>
          </HeaderDropdown>
        </>
      ) : (
        <>
          <Link to="/workspace">{businessRoleLabels[user.role]}</Link>
          <OperationsNavigationLink />
          {['STUDENT', 'CASHIER'].includes(user.role) && (
            <Link to="/payments/sepay">Học phí SePay</Link>
          )}
          {['STUDENT', 'INSTRUCTOR', 'ACADEMIC_MANAGER'].includes(user.role) && (
            <Link to="/my/">Lịch tháng</Link>
          )}
          {user.role === 'INSTRUCTOR' ? <Link to="/my/#my-classes">Lớp giảng dạy</Link> : null}
          {user.role === 'STUDENT' ? <Link to="/student/enrollments">Khóa học của tôi</Link> : null}
          <Link className="max-w-48 break-words" to="/profile" aria-label={`Hồ sơ ${accountLabel(user.fullName)}`}>
            {accountLabel(user.fullName)}
          </Link>
          <button
            className="rounded-lg border border-slate-300 px-3 py-2 font-semibold transition hover:border-[#76a35e] hover:text-[#4d7439] disabled:opacity-50"
            disabled={isLoggingOut}
            onClick={() => setConfirmOpen(true)}
            type="button"
          >
            Đăng xuất
          </button>
        </>
      )}
      <ConfirmDialog
        busyLabel="Đang đăng xuất…"
        confirmLabel="Đăng xuất"
        description={
          /^\/placement\/(?:sittings\/[^/]+|attempts\/[^/]+\/exam)$|^\/classroom\/[^/]+\/quiz-attempts\/[^/]+$|^\/student\/enrollments\/[^/]+\/attempts\/[^/]+$/.test(pathname)
            ? 'Đăng xuất sẽ đóng màn làm bài. Thời gian và khả năng tiếp tục lượt làm bài phụ thuộc trạng thái trên máy chủ. Hãy kiểm tra câu trả lời đã lưu và bản ghi âm đã gửi; nội dung chưa được máy chủ xác nhận có thể bị mất.'
            : 'Bạn sẽ cần đăng nhập lại để tiếp tục học hoặc quản lý lớp.'
        }
        isBusy={isLoggingOut}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void handleLogout()}
        open={confirmOpen}
        title="Kết thúc phiên đăng nhập?"
      />
    </div>
  );
}
