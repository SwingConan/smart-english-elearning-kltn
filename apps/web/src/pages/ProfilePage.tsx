import { Camera, Mail, Phone, ShieldCheck, Trash2 } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Avatar, PageContainer, PageHeader, StatusBadge } from '@/components/ui/ProductPrimitives';
import { useToast } from '@/components/ui/feedback-context';
import { useAuth } from '@/features/auth/auth-context';
import { profileApi, type ProfileView } from '@/features/profile/api';
import { apiUrl } from '@/lib/api-client';

const roleLabel = {
  STUDENT: 'Học viên',
  INSTRUCTOR: 'Giảng viên',
  ADMIN_COORDINATOR: 'Điều phối viên',
} as const;

export function ProfilePage() {
  const { refreshUser } = useAuth();
  const notify = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [form, setForm] = useState({ fullName: '', phoneNumber: '' });
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const load = useCallback(async () => {
    setState('loading');
    try {
      const data = await profileApi.get();
      setProfile(data);
      setForm({ fullName: data.fullName, phoneNumber: data.phoneNumber ?? '' });
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setSavedMessage('');
    try {
      await profileApi.update({ fullName: form.fullName, phoneNumber: form.phoneNumber || null });
      await Promise.all([load(), refreshUser()]);
      setSavedMessage('Hồ sơ đã được cập nhật.');
      notify('Hồ sơ đã được cập nhật.');
    } catch {
      notify('Không thể cập nhật hồ sơ. Vui lòng kiểm tra dữ liệu và thử lại.', 'error');
    } finally {
      setBusy(false);
    }
  };
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      setProfile(await profileApi.uploadAvatar(file));
      await refreshUser();
      notify('Ảnh đại diện đã được cập nhật.');
    } catch {
      notify('Ảnh phải là JPEG, PNG hoặc WebP hợp lệ và không quá 5 MB.', 'error');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      setProfile(await profileApi.removeAvatar());
      await refreshUser();
      notify('Đã xóa ảnh đại diện.');
    } catch {
      notify('Không thể xóa ảnh đại diện.', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (state === 'loading')
    return (
      <PageContainer>
        <div className="h-72 animate-pulse rounded-3xl bg-slate-200" role="status" />
      </PageContainer>
    );
  if (state === 'error' || !profile)
    return (
      <PageContainer>
        <div className="state-error" role="alert">
          Không thể tải hồ sơ.{' '}
          <button className="btn-secondary ml-2" onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      </PageContainer>
    );
  const avatarUrl = profile.avatarKey ? apiUrl(`/user-assets/avatars/${profile.avatarKey}`) : null;
  const profileSummary = profile.summary ?? {
    activeClasses: 0,
    completedClasses: 0,
    certificates: 0,
    teachingClasses: 0,
  };
  const summary =
    profile.role === 'STUDENT'
      ? [
          ['Lớp đang học', profileSummary.activeClasses],
          ['Lớp đã hoàn thành', profileSummary.completedClasses],
          ['Chứng chỉ', profileSummary.certificates],
        ]
      : [['Lớp đang giảng dạy', profileSummary.teachingClasses]];

  return (
    <PageContainer className="space-y-8">
      <PageHeader
        eyebrow="Tài khoản"
        title="Hồ sơ cá nhân"
        description="Quản lý thông tin hiển thị và ảnh đại diện của bạn. Email, vai trò và trạng thái do hệ thống quản lý."
      />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="self-start rounded-3xl border bg-white p-6 text-center shadow-sm">
          <div className="flex justify-center">
            <Avatar name={profile.fullName} size="lg" src={avatarUrl} />
          </div>
          <h2 className="mt-4 text-xl font-black">{profile.fullName}</h2>
          <p className="mt-1 text-sm text-slate-500">{roleLabel[profile.role]}</p>
          <StatusBadge tone={profile.status === 'ACTIVE' ? 'success' : 'warning'}>
            {profile.status === 'ACTIVE' ? 'Đang hoạt động' : 'Tạm khóa'}
          </StatusBadge>
          <input
            ref={inputRef}
            className="sr-only"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => void upload(event.target.files?.[0])}
            type="file"
          />
          <button
            className="btn-primary mt-6 w-full"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            <Camera size={17} /> Chọn ảnh mới
          </button>
          {profile.avatarKey ? (
            <button
              className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-rose-700"
              disabled={busy}
              onClick={() => void remove()}
              type="button"
            >
              <Trash2 size={16} /> Xóa ảnh
            </button>
          ) : null}
          <p className="mt-4 text-xs leading-5 text-slate-500">
            JPEG, PNG hoặc WebP · tối đa 5 MB. Hệ thống kiểm tra nội dung tệp, không chỉ phần mở
            rộng.
          </p>
        </aside>
        <div className="space-y-6">
          <form
            className="rounded-3xl border bg-white p-6 shadow-sm sm:p-8"
            onSubmit={(event) => void save(event)}
          >
            <h2 className="text-xl font-bold">Thông tin liên hệ</h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className="font-semibold sm:col-span-2">
                Họ và tên
                <input
                  className="input-field mt-2"
                  minLength={2}
                  onChange={(event) => setForm({ ...form, fullName: event.target.value })}
                  required
                  value={form.fullName}
                />
              </label>
              <label className="font-semibold">
                <span className="inline-flex items-center gap-2">
                  <Mail size={16} />
                  Email
                </span>
                <input className="input-field mt-2 bg-slate-50" readOnly value={profile.email} />
              </label>
              <label className="font-semibold">
                <span className="inline-flex items-center gap-2">
                  <Phone size={16} />
                  Số điện thoại
                </span>
                <input
                  className="input-field mt-2"
                  onChange={(event) => setForm({ ...form, phoneNumber: event.target.value })}
                  placeholder="Chưa cập nhật"
                  value={form.phoneNumber}
                />
              </label>
            </div>
            <button className="btn-primary mt-6" disabled={busy} type="submit">
              {busy ? 'Đang lưu…' : 'Lưu thay đổi'}
            </button>
            {savedMessage ? (
              <p className="mt-3 font-semibold text-emerald-700" role="status">
                {savedMessage}
              </p>
            ) : null}
          </form>
          <section className="rounded-3xl border bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-center gap-3">
              <ShieldCheck className="text-indigo-600" />
              <div>
                <h2 className="text-xl font-bold">Thông tin tài khoản</h2>
                <p className="text-sm text-slate-500">
                  Thông tin chỉ đọc, được quản lý theo phân quyền.
                </p>
              </div>
            </div>
            <dl className="mt-6 grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-sm text-slate-500">Vai trò</dt>
                <dd className="mt-1 font-bold">{roleLabel[profile.role]}</dd>
              </div>
              <div>
                <dt className="text-sm text-slate-500">Trạng thái</dt>
                <dd className="mt-1 font-bold">
                  {profile.status === 'ACTIVE' ? 'Đang hoạt động' : 'Tạm khóa'}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-slate-500">Ngày tham gia</dt>
                <dd className="mt-1 font-bold">
                  {profile.createdAt
                    ? new Date(profile.createdAt).toLocaleDateString('vi-VN')
                    : '—'}
                </dd>
              </div>
            </dl>
          </section>
          <section className="grid gap-4 sm:grid-cols-3" aria-label="Tóm tắt học tập">
            {summary.map(([label, value]) => (
              <div className="rounded-2xl border bg-white p-5 shadow-sm" key={label}>
                <p className="text-sm text-slate-500">{label}</p>
                <p className="mt-2 text-3xl font-black text-indigo-700">{value}</p>
              </div>
            ))}
          </section>
        </div>
      </div>
    </PageContainer>
  );
}
