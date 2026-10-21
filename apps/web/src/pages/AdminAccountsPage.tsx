import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Plus, RotateCcw, Search, Users } from 'lucide-react';
import { adminApi } from '@/features/admin/api';
import { adminErrorMessage } from '@/features/admin/errors';
import {
  accountRoleBadgeClass,
  accountRoleLabel,
  accountStatusBadgeClass,
  accountStatusLabel,
} from '@/features/admin/labels';
import type { AccountQuery, AdminAccount, AdminAccountDirectory } from '@/features/admin/types';
import { useAdminSessionExpiry } from '@/features/admin/use-admin-session-expiry';

const control = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm';

export function AdminAccountsPage() {
  const [query, setQuery] = useState<AccountQuery>({ page: 1, limit: 20 });
  const [search, setSearch] = useState('');
  const [directory, setDirectory] = useState<AdminAccountDirectory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const redirectExpiredSession = useAdminSessionExpiry();

  useEffect(() => {
    const controller = new AbortController();
    void adminApi.accounts
      .list(query, controller.signal)
      .then((result) => {
        setDirectory(result);
        setError('');
      })
      .catch(async (cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        if (!(await redirectExpiredSession(cause))) setError(adminErrorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, reloadKey, redirectExpiredSession]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setQuery((current) => ({ ...current, search: search.trim() || undefined, page: 1 }));
  };
  const reset = () => {
    setLoading(true);
    setSearch('');
    setQuery({ page: 1, limit: 20 });
  };
  const filtered = Boolean(query.search || query.role || query.status);

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">
            Quản trị học vụ
          </p>
          <h1 className="mt-2 text-3xl font-black">Tài khoản &amp; phân quyền</h1>
          <p className="mt-2 text-slate-600">
            Quản lý tài khoản học viên, giảng viên và điều phối viên.
          </p>
        </div>
        <Link
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white"
          to="/admin/accounts/new"
        >
          <Plus size={18} /> Tạo tài khoản nhân sự
        </Link>
      </header>

      {directory ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Summary label="Tổng tài khoản" value={directory.summary.total} />
          <Summary
            label="Đang hoạt động"
            value={directory.summary.active}
            tone="text-emerald-700"
          />
          <Summary
            label="Ngưng hoạt động"
            value={directory.summary.inactive}
            tone="text-amber-700"
          />
          <Summary label="Đã khóa" value={directory.summary.locked} tone="text-rose-700" />
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <form
          className="grid gap-3 lg:grid-cols-[1fr_200px_200px_auto_auto] lg:items-end"
          onSubmit={submit}
        >
          <label>
            <span className="text-sm font-semibold">Tìm tài khoản</span>
            <input
              className={control}
              placeholder="Họ tên hoặc email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label>
            <span className="text-sm font-semibold">Vai trò</span>
            <select
              className={control}
              value={query.role ?? ''}
              onChange={(e) => {
                setLoading(true);
                setQuery((q) => ({
                  ...q,
                  role: (e.target.value || undefined) as AccountQuery['role'],
                  page: 1,
                }));
              }}
            >
              <option value="">Tất cả</option>
              <option value="STUDENT">Học viên</option>
              <option value="INSTRUCTOR">Giảng viên</option>
              <option value="ADMIN_COORDINATOR">Điều phối viên</option>
            </select>
          </label>
          <label>
            <span className="text-sm font-semibold">Trạng thái</span>
            <select
              className={control}
              value={query.status ?? ''}
              onChange={(e) => {
                setLoading(true);
                setQuery((q) => ({
                  ...q,
                  status: (e.target.value || undefined) as AccountQuery['status'],
                  page: 1,
                }));
              }}
            >
              <option value="">Tất cả</option>
              <option value="ACTIVE">Đang hoạt động</option>
              <option value="INACTIVE">Ngưng hoạt động</option>
              <option value="LOCKED">Đã khóa</option>
            </select>
          </label>
          <button
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            type="submit"
          >
            <Search className="mr-1 inline" size={16} /> Tìm
          </button>
          <button
            className="rounded-xl border px-4 py-2 text-sm font-semibold"
            onClick={reset}
            type="button"
          >
            <RotateCcw className="mr-1 inline" size={16} /> Đặt lại
          </button>
        </form>

        {loading ? (
          <p className="mt-6 text-sm text-slate-500" role="status">
            Đang tải danh sách tài khoản...
          </p>
        ) : null}
        {error ? (
          <div className="mt-6 rounded-xl bg-red-50 p-4 text-red-800" role="alert">
            <p>{error}</p>
            <button
              className="mt-2 font-semibold underline"
              onClick={() => {
                setLoading(true);
                setReloadKey((v) => v + 1);
              }}
              type="button"
            >
              Thử lại
            </button>
          </div>
        ) : null}
        {!loading && !error && directory?.data.length === 0 ? (
          <div className="mt-6 rounded-xl bg-slate-50 p-8 text-center">
            <Users className="mx-auto text-slate-400" />
            <p className="mt-2 font-semibold">
              {filtered ? 'Không có tài khoản phù hợp.' : 'Chưa có tài khoản nào.'}
            </p>
          </div>
        ) : null}
        {!loading && !error && directory?.data.length ? (
          <AccountResults accounts={directory.data} />
        ) : null}

        {directory && directory.meta.totalPages > 1 ? (
          <div className="mt-5 flex items-center justify-end gap-3">
            <button
              className="rounded-lg border px-3 py-2 disabled:opacity-40"
              disabled={directory.meta.page <= 1}
              onClick={() => {
                setLoading(true);
                setQuery((q) => ({ ...q, page: directory.meta.page - 1 }));
              }}
            >
              Trang trước
            </button>
            <span className="text-sm">
              Trang {directory.meta.page}/{directory.meta.totalPages}
            </span>
            <button
              className="rounded-lg border px-3 py-2 disabled:opacity-40"
              disabled={directory.meta.page >= directory.meta.totalPages}
              onClick={() => {
                setLoading(true);
                setQuery((q) => ({ ...q, page: directory.meta.page + 1 }));
              }}
            >
              Trang sau
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function AccountResults({ accounts }: { accounts: AdminAccount[] }) {
  const context = useCallback(
    (account: AdminAccount) =>
      account.role === 'STUDENT'
        ? `${account.context.enrollmentCount} lớp đã ghi danh`
        : account.role === 'INSTRUCTOR'
          ? `${account.context.operationalClassAssignments} lớp đang vận hành`
          : 'Quản trị hệ thống',
    [],
  );
  return (
    <>
      <div className="mt-6 hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-y bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-3">Tài khoản</th>
              <th className="px-3 py-3">Vai trò</th>
              <th className="px-3 py-3">Trạng thái</th>
              <th className="px-3 py-3">Ngữ cảnh sử dụng</th>
              <th className="px-3 py-3">Ngày tạo</th>
              <th className="px-3 py-3">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {accounts.map((a) => (
              <tr key={a.id}>
                <td className="px-3 py-4">
                  <p className="font-semibold">{a.fullName}</p>
                  <p className="text-xs text-slate-500">{a.email}</p>
                </td>
                <td className="px-3">
                  <Badge
                    text={accountRoleLabel(a.role)}
                    className={accountRoleBadgeClass(a.role)}
                  />
                </td>
                <td className="px-3">
                  <Badge
                    text={accountStatusLabel(a.status)}
                    className={accountStatusBadgeClass(a.status)}
                  />
                </td>
                <td className="px-3 text-slate-600">{context(a)}</td>
                <td className="px-3">{new Date(a.createdAt).toLocaleDateString('vi-VN')}</td>
                <td className="px-3">
                  <Link className="font-semibold text-indigo-700" to={`/admin/accounts/${a.id}`}>
                    Xem chi tiết
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-6 grid gap-3 md:hidden">
        {accounts.map((a) => (
          <article className="rounded-xl border p-4" key={a.id}>
            <p className="font-bold">{a.fullName}</p>
            <p className="text-sm text-slate-500">{a.email}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge text={accountRoleLabel(a.role)} className={accountRoleBadgeClass(a.role)} />
              <Badge
                text={accountStatusLabel(a.status)}
                className={accountStatusBadgeClass(a.status)}
              />
            </div>
            <p className="mt-3 text-sm text-slate-600">{context(a)}</p>
            <Link
              className="mt-3 inline-block font-semibold text-indigo-700"
              to={`/admin/accounts/${a.id}`}
            >
              Xem chi tiết
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}

function Badge({ text, className }: { text: string; className: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${className}`}>
      {text}
    </span>
  );
}
function Summary({
  label,
  value,
  tone = 'text-slate-950',
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-black ${tone}`}>{value}</p>
    </div>
  );
}
