import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { AlertTriangle, ArrowLeft, ShieldCheck } from 'lucide-react';
import { adminApi } from '@/features/admin/api';
import { adminErrorMessage } from '@/features/admin/errors';
import {
  accountRoleBadgeClass,
  accountRoleLabel,
  accountStatusBadgeClass,
  accountStatusLabel,
} from '@/features/admin/labels';
import type { AccountRole, AccountStatus, AdminAccount } from '@/features/admin/types';
import { useAdminSessionExpiry } from '@/features/admin/use-admin-session-expiry';
import { useAuth } from '@/features/auth/auth-context';

const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const control = 'mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2';

export function AdminAccountDetailPage() {
  const { userId = '' } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const redirectExpiredSession = useAdminSessionExpiry();
  const [account, setAccount] = useState<AdminAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(
    (location.state as { success?: string } | null)?.success ?? '',
  );
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void adminApi.accounts
      .get(userId, controller.signal)
      .then((value) => {
        setAccount(value);
        setError('');
      })
      .catch(async (cause) => {
        if (
          !(cause instanceof DOMException && cause.name === 'AbortError') &&
          !(await redirectExpiredSession(cause))
        )
          setError(adminErrorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [userId, reloadKey, redirectExpiredSession]);

  const mutate = async (work: () => Promise<AdminAccount>, message: string) => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      setAccount(await work());
      setSuccess(message);
    } catch (cause) {
      if (!(await redirectExpiredSession(cause))) setError(adminErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  if (loading) return <p role="status">Đang tải tài khoản...</p>;
  if (!account)
    return (
      <div className="rounded-xl bg-red-50 p-5 text-red-800" role="alert">
        <p>{error || 'Không tìm thấy tài khoản.'}</p>
        <button
          className="mt-2 font-semibold underline"
          onClick={() => {
            setLoading(true);
            setReloadKey((v) => v + 1);
          }}
        >
          Thử lại
        </button>
      </div>
    );

  const isSelf = user?.id === account.id;
  const operational = account.context.operationalClassAssignments;
  return (
    <div className="space-y-6">
      <Link
        className="inline-flex items-center gap-2 font-semibold text-indigo-700"
        to="/admin/accounts"
      >
        <ArrowLeft size={17} /> Danh sách tài khoản
      </Link>
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-black">{account.fullName}</h1>
            {isSelf ? (
              <span className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-bold text-white">
                Tài khoản hiện tại
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-slate-600">{account.email}</p>
        </div>
        <div className="flex gap-2">
          <Badge
            label={accountRoleLabel(account.role)}
            className={accountRoleBadgeClass(account.role)}
          />
          <Badge
            label={accountStatusLabel(account.status)}
            className={accountStatusBadgeClass(account.status)}
          />
        </div>
      </header>
      {success ? (
        <p className="rounded-xl bg-emerald-50 p-4 text-emerald-800" role="status">
          {success}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl bg-red-50 p-4 text-red-800" role="alert">
          {error}
        </p>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card}>
          <h2 className="text-lg font-bold">Danh tính</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <Row label="Họ và tên" value={account.fullName} />
            <Row label="Email" value={account.email} />
            <Row label="Ngày tạo" value={new Date(account.createdAt).toLocaleString('vi-VN')} />
            <Row label="Cập nhật" value={new Date(account.updatedAt).toLocaleString('vi-VN')} />
          </dl>
        </section>
        <section className={card}>
          <h2 className="text-lg font-bold">Phụ thuộc vận hành</h2>
          <dl className="mt-4 grid grid-cols-3 gap-3">
            <Count label="Lớp đang vận hành" value={operational} />
            <Count label="Tổng lớp phân công" value={account.context.totalClassAssignments} />
            <Count label="Lớp đã ghi danh" value={account.context.enrollmentCount} />
          </dl>
          {operational > 0 ? (
            <Link
              className="mt-4 inline-block text-sm font-semibold text-indigo-700"
              to="/admin/class-offerings"
            >
              Mở quản lý lớp học
            </Link>
          ) : null}
        </section>
        <RoleControl
          account={account}
          busy={busy}
          disabled={isSelf}
          onChange={(role) =>
            mutate(
              () => adminApi.accounts.updateRole(account.id, role),
              'Đã cập nhật vai trò và thu hồi các phiên đăng nhập cũ.',
            )
          }
        />
        <StatusControl
          account={account}
          busy={busy}
          disabled={isSelf}
          onChange={(status) =>
            mutate(
              () => adminApi.accounts.updateStatus(account.id, status),
              'Đã cập nhật trạng thái và thu hồi các phiên đăng nhập cũ.',
            )
          }
        />
      </div>
    </div>
  );
}

function RoleControl({
  account,
  busy,
  disabled,
  onChange,
}: {
  account: AdminAccount;
  busy: boolean;
  disabled: boolean;
  onChange: (role: Extract<AccountRole, 'INSTRUCTOR' | 'ADMIN_COORDINATOR'>) => void;
}) {
  const [role, setRole] = useState<Extract<AccountRole, 'INSTRUCTOR' | 'ADMIN_COORDINATOR'>>(
    account.role === 'ADMIN_COORDINATOR' ? 'ADMIN_COORDINATOR' : 'INSTRUCTOR',
  );
  const blocked =
    account.role === 'STUDENT' ||
    disabled ||
    (account.role === 'INSTRUCTOR' &&
      account.context.operationalClassAssignments > 0 &&
      role !== 'INSTRUCTOR');
  const save = () => {
    if (role === account.role) return;
    if (
      window.confirm(
        'Đổi vai trò của tài khoản này? Quyền truy cập sẽ thay đổi ngay và các phiên đăng nhập hiện tại sẽ bị thu hồi.',
      )
    )
      onChange(role);
  };
  return (
    <section className={card}>
      <h2 className="text-lg font-bold">Vai trò &amp; quyền truy cập</h2>
      {account.role === 'STUDENT' ? (
        <p className="mt-3 rounded-xl bg-sky-50 p-3 text-sm text-sky-900">
          Vai trò học viên không được chuyển thành tài khoản nhân sự tại đây. Hãy tạo tài khoản nhân
          sự riêng để giữ lịch sử học tập tách biệt.
        </p>
      ) : (
        <>
          <label className="mt-4 block text-sm font-semibold">
            Vai trò
            <select
              className={control}
              disabled={disabled || busy}
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
            >
              <option value="INSTRUCTOR">Giảng viên</option>
              <option value="ADMIN_COORDINATOR">Điều phối viên</option>
            </select>
          </label>
          {disabled ? (
            <p className="mt-3 text-sm text-amber-800">
              Bạn không thể thay đổi vai trò của chính mình.
            </p>
          ) : null}
          {account.role === 'INSTRUCTOR' && account.context.operationalClassAssignments > 0 ? (
            <p className="mt-3 text-sm text-amber-800">
              Giảng viên đang phụ trách {account.context.operationalClassAssignments} lớp vận hành;
              cần điều phối lại trước khi đổi vai trò.
            </p>
          ) : null}
          <button
            className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-40"
            disabled={blocked || busy || role === account.role}
            onClick={save}
          >
            Lưu vai trò
          </button>
        </>
      )}
    </section>
  );
}

function StatusControl({
  account,
  busy,
  disabled,
  onChange,
}: {
  account: AdminAccount;
  busy: boolean;
  disabled: boolean;
  onChange: (status: AccountStatus) => void;
}) {
  const [status, setStatus] = useState<AccountStatus>(account.status);
  const operational =
    account.role === 'INSTRUCTOR' && account.context.operationalClassAssignments > 0;
  const blocked = disabled || (operational && status === 'INACTIVE');
  const copy: Record<AccountStatus, string> = {
    ACTIVE: 'Mở lại tài khoản này?',
    INACTIVE: 'Ngưng hoạt động tài khoản này? Người dùng sẽ không thể tiếp tục truy cập.',
    LOCKED:
      'Khóa tài khoản này ngay? Người dùng sẽ mất quyền truy cập và phải đăng nhập lại sau khi được mở khóa.',
  };
  const save = () => {
    if (status === account.status) return;
    if (window.confirm(copy[status])) onChange(status);
  };
  return (
    <section className={card}>
      <h2 className="text-lg font-bold">Trạng thái tài khoản</h2>
      <p className="mt-2 text-sm text-slate-600">
        ACTIVE cho phép truy cập; INACTIVE là ngưng hành chính; LOCKED là khóa bảo mật tức thời.
      </p>
      <label className="mt-4 block text-sm font-semibold">
        Trạng thái
        <select
          className={control}
          disabled={disabled || busy}
          value={status}
          onChange={(e) => setStatus(e.target.value as AccountStatus)}
        >
          <option value="ACTIVE">Đang hoạt động</option>
          <option value="INACTIVE">Ngưng hoạt động</option>
          <option value="LOCKED">Đã khóa</option>
        </select>
      </label>
      {disabled ? (
        <p className="mt-3 text-sm text-amber-800">
          Bạn không thể thay đổi trạng thái của chính mình.
        </p>
      ) : null}
      {operational ? (
        <div className="mt-3 flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="shrink-0" size={18} />
          <p>
            INACTIVE bị chặn khi còn lớp vận hành. LOCKED vẫn khả dụng cho tình huống bảo mật; dữ
            liệu phân công lớp được giữ nguyên và cần điều phối lại.
          </p>
        </div>
      ) : null}
      <button
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-40"
        disabled={blocked || busy || status === account.status}
        onClick={save}
      >
        <ShieldCheck size={17} /> Lưu trạng thái
      </button>
    </section>
  );
}

function Badge({ label, className }: { label: string; className: string }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${className}`}>{label}</span>;
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-2 last:border-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
}
function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-center">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 text-2xl font-black">{value}</dd>
    </div>
  );
}
