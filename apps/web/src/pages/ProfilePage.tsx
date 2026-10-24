import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { profileApi } from '@/features/profile/api';

export function ProfilePage() {
  const { refreshUser } = useAuth();
  const [form, setForm] = useState({ fullName: '', phoneNumber: '' });
  const [message, setMessage] = useState('');
  useEffect(() => {
    void profileApi
      .get()
      .then((user) => setForm({ fullName: user.fullName, phoneNumber: user.phoneNumber ?? '' }));
  }, []);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    await profileApi.update(form);
    await refreshUser();
    setMessage('Đã lưu hồ sơ.');
  };
  return (
    <section className="mx-auto max-w-2xl px-4 py-12">
      <div className="rounded-3xl border bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-black">Hồ sơ cá nhân</h1>
        <form className="mt-8 space-y-5" onSubmit={(event) => void save(event)}>
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
