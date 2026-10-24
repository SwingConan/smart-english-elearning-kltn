import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { profileApi } from '@/features/profile/api';

export function ProfilePage() {
  const { refreshUser } = useAuth();
  const [form, setForm] = useState({ fullName: '', phoneNumber: '', email: '', role: '' });
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const load = useCallback(() => {
    void profileApi
      .get()
      .then((user) => {
        setForm({
          fullName: user.fullName,
          phoneNumber: user.phoneNumber ?? '',
          email: user.email,
          role: user.role,
        });
        setState('ready');
      })
      .catch(() => setState('error'));
  }, []);
  useEffect(() => void load(), [load]);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    const updated = await profileApi.update({
      fullName: form.fullName,
      phoneNumber: form.phoneNumber,
    });
    setForm((current) => ({
      ...current,
      fullName: updated.fullName,
      phoneNumber: updated.phoneNumber ?? '',
    }));
    await refreshUser();
    setMessage('Hồ sơ đã được cập nhật.');
  };
  if (state === 'loading')
    return (
      <p className="p-12 text-center" role="status">
        Đang tải hồ sơ…
      </p>
    );
  if (state === 'error')
    return (
      <div className="state-error mx-auto my-12 max-w-2xl" role="alert">
        Không thể tải hồ sơ.{' '}
        <button className="btn-secondary ml-2" onClick={load}>
          Thử lại
        </button>
      </div>
    );
  return (
    <section className="mx-auto max-w-2xl px-4 py-12">
      <div className="rounded-3xl border bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-black">Hồ sơ cá nhân</h1>
        <form className="mt-8 space-y-5" onSubmit={(event) => void save(event)}>
          <label className="block font-semibold">
            Email
            <input
              className="mt-2 w-full rounded-xl border bg-slate-100 p-3"
              readOnly
              value={form.email}
            />
          </label>
          <label className="block font-semibold">
            Vai trò
            <input
              className="mt-2 w-full rounded-xl border bg-slate-100 p-3"
              readOnly
              value={
                form.role === 'STUDENT'
                  ? 'Học viên'
                  : form.role === 'INSTRUCTOR'
                    ? 'Giảng viên'
                    : 'Điều phối viên'
              }
            />
          </label>
          <label className="block font-semibold">
            Họ và tên
            <input
              className="mt-2 w-full rounded-xl border p-3"
              minLength={2}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              required
              value={form.fullName}
            />
          </label>
          <label className="block font-semibold">
            Số điện thoại
            <input
              className="mt-2 w-full rounded-xl border p-3"
              onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
              value={form.phoneNumber}
            />
          </label>
          <button className="btn-primary" type="submit">
            Lưu thay đổi
          </button>
          {message ? (
            <p className="text-emerald-700" role="status">
              {message}
            </p>
          ) : null}
        </form>
      </div>
    </section>
  );
}
