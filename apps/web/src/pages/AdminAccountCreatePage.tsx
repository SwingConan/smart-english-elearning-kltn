import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { adminApi } from '@/features/admin/api';
import { adminErrorMessage } from '@/features/admin/errors';
import type { CreateStaffAccountInput } from '@/features/admin/types';
import { useAdminSessionExpiry } from '@/features/admin/use-admin-session-expiry';

const control = 'mt-1 w-full rounded-xl border border-slate-300 px-3 py-2';

export function AdminAccountCreatePage() {
  const navigate = useNavigate();
  const redirectExpiredSession = useAdminSessionExpiry();
  const [form, setForm] = useState<CreateStaffAccountInput>({
    fullName: '',
    email: '',
    password: '',
    role: 'INSTRUCTOR',
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.password !== confirmPassword) {
      setError('Mật khẩu xác nhận chưa khớp.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await adminApi.accounts.create({
        ...form,
        fullName: form.fullName.trim(),
        email: form.email.trim(),
      });
      setForm((current) => ({ ...current, password: '' }));
      setConfirmPassword('');
      navigate(`/admin/accounts/${created.id}`, {
        replace: true,
        state: { success: 'Tài khoản đã được tạo.' },
      });
    } catch (cause) {
      if (!(await redirectExpiredSession(cause))) setError(adminErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">
          Quản trị học vụ
        </p>
        <h1 className="mt-2 text-3xl font-black">Tạo tài khoản nhân sự</h1>
        <p className="mt-2 text-slate-600">
          Tài khoản mới được kích hoạt ngay. Học viên tiếp tục đăng ký qua luồng công khai.
        </p>
      </header>
      <form className="space-y-5 rounded-2xl border bg-white p-6 shadow-sm" onSubmit={submit}>
        {error ? (
          <p className="rounded-xl bg-red-50 p-3 text-red-800" role="alert">
            {error}
          </p>
        ) : null}
        <label className="block">
          <span className="font-semibold">Họ và tên</span>
          <input
            className={control}
            required
            maxLength={200}
            value={form.fullName}
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
          />
        </label>
        <label className="block">
          <span className="font-semibold">Email</span>
          <input
            className={control}
            required
            maxLength={320}
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </label>
        <label className="block">
          <span className="font-semibold">Vai trò</span>
          <select
            className={control}
            value={form.role}
            onChange={(e) =>
              setForm((f) => ({ ...f, role: e.target.value as CreateStaffAccountInput['role'] }))
            }
          >
            <option value="INSTRUCTOR">Giảng viên</option>
            <option value="ADMIN_COORDINATOR">Điều phối viên</option>
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="font-semibold">Mật khẩu ban đầu</span>
            <input
              className={control}
              required
              minLength={8}
              maxLength={128}
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
          </label>
          <label>
            <span className="font-semibold">Xác nhận mật khẩu</span>
            <input
              className={control}
              required
              minLength={8}
              maxLength={128}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </label>
        </div>
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Email là danh tính đăng nhập và không chỉnh sửa trong M09-C. Mật khẩu sẽ không được hiển
          thị lại sau khi gửi.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
            disabled={busy}
            type="submit"
          >
            {busy ? 'Đang tạo...' : 'Tạo tài khoản'}
          </button>
          <Link className="rounded-xl border px-5 py-3 font-semibold" to="/admin/accounts">
            Hủy
          </Link>
        </div>
      </form>
    </div>
  );
}
