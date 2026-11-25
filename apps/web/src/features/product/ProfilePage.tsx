import { type ChangeEvent, type FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  Award,
  BookOpen,
  Calendar,
  Camera,
  CheckCircle2,
  KeyRound,
  Mail,
  MapPin,
  PencilLine,
  Phone,
  RefreshCw,
  ShieldCheck,
  Target,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useAuth } from '@/features/auth/auth-context';
import { businessRoleLabels } from '@/features/auth/business-role';
import { accountStatusLabel } from '@/features/admin/labels';
import { enrollmentApi } from '@/features/enrollments/api';
import { ApiError, apiFetch } from '@/lib/api-client';

interface ProfilePreferences {
  phone?: string;
  timezone?: string;
  emailNotifications?: boolean;
  studyGoalNote?: string;
  avatarUrl?: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  targetScore?: string;
}

interface ProfileDetailsResponse {
  id: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
  preferences?: ProfilePreferences;
  updatedAt?: string | null;
}

interface StudentLearningSummary {
  activeCount: number;
  completedCount: number;
  totalCount: number;
}

const PRESET_AVATARS = [
  { url: '/avatars/avatar-1.svg', label: 'Học viên Cử nhân Xanh' },
  { url: '/avatars/avatar-2.svg', label: 'Học viên Đọc hiểu' },
  { url: '/avatars/avatar-3.svg', label: 'Học viên Luyện nghe' },
  { url: '/avatars/avatar-4.svg', label: 'Học viên Mục tiêu cao' },
] as const;

const GENDER_LABELS: Record<string, string> = {
  MALE: 'Nam',
  FEMALE: 'Nữ',
  OTHER: 'Khác',
};

function userInitials(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'HV';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

function formatDateDisplay(value?: string | null): string {
  if (!value) return 'Chưa cập nhật';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(d);
}

function formatTimestamp(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(d);
}

/**
 * Đọc tệp ảnh người dùng chọn và nén/cắt vuông 256×256 JPEG để lưu gọn trong hồ sơ.
 * Tự động fallback sang Data URL gốc nếu môi trường không hỗ trợ Canvas 2D.
 */
async function readAvatarFileAsDataUrl(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|jpg|webp|gif)$/i.test(file.type)) {
    throw new Error('UNSUPPORTED_TYPE');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('FILE_TOO_LARGE');
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('READ_FAILED'));
    reader.readAsDataURL(file);
  });

  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    if (rawDataUrl.length <= 190_000) return rawDataUrl;
    throw new Error('FILE_TOO_LARGE');
  }

  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const size = 256;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          if (rawDataUrl.length <= 190_000) resolve(rawDataUrl);
          else reject(new Error('FILE_TOO_LARGE'));
          return;
        }
        const minSide = Math.min(img.width, img.height) || 1;
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        const compressed = canvas.toDataURL('image/jpeg', 0.85);
        if (compressed && compressed !== 'data:,' && compressed.length <= 190_000) {
          resolve(compressed);
        } else if (rawDataUrl.length <= 190_000) {
          resolve(rawDataUrl);
        } else {
          reject(new Error('FILE_TOO_LARGE'));
        }
      } catch {
        if (rawDataUrl.length <= 190_000) resolve(rawDataUrl);
        else reject(new Error('READ_FAILED'));
      }
    };
    img.onerror = () => {
      if (rawDataUrl.length <= 190_000) resolve(rawDataUrl);
      else reject(new Error('READ_FAILED'));
    };
    img.src = rawDataUrl;
  });
}

function ProfileAvatarDisplay({
  avatarUrl,
  fullName,
  sizeClass = 'size-24',
  textClass = 'text-2xl',
}: {
  avatarUrl?: string;
  fullName?: string | null;
  sizeClass?: string;
  textClass?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(avatarUrl && failedSrc !== avatarUrl);
  return (
    <div
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full border-4 border-white bg-[#5b8546] font-extrabold text-white shadow-md ${sizeClass} ${textClass}`}
    >
      {showImage ? (
        <img
          src={avatarUrl}
          alt={fullName ?? 'Ảnh đại diện'}
          className="size-full object-cover"
          onError={() => setFailedSrc(avatarUrl ?? null)}
        />
      ) : (
        <span>{userInitials(fullName)}</span>
      )}
    </div>
  );
}

export function ProfilePage() {
  const { user, refreshUser, isLoading, error } = useAuth();
  const [mode, setMode] = useState<'VIEW' | 'EDIT' | 'PASSWORD'>('VIEW');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [timezone, setTimezone] = useState('Asia/Ho_Chi_Minh');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [studyGoalNote, setStudyGoalNote] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [address, setAddress] = useState('');
  const [targetScore, setTargetScore] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const [learningSummary, setLearningSummary] = useState<StudentLearningSummary | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const applyProfileData = useCallback(
    (profile: ProfileDetailsResponse | null | undefined) => {
      if (!profile) return;
      setFullName(profile.fullName || user?.fullName || '');
      setPhone(profile.preferences?.phone ?? '');
      setTimezone(profile.preferences?.timezone || 'Asia/Ho_Chi_Minh');
      setEmailNotifications(profile.preferences?.emailNotifications ?? true);
      setStudyGoalNote(profile.preferences?.studyGoalNote ?? '');
      setAvatarUrl(profile.preferences?.avatarUrl ?? user?.avatarUrl ?? '');
      setDateOfBirth(profile.preferences?.dateOfBirth ?? '');
      setGender(profile.preferences?.gender ?? '');
      setAddress(profile.preferences?.address ?? '');
      setTargetScore(profile.preferences?.targetScore ?? '');
      setUpdatedAt(profile.updatedAt ?? null);
    },
    [user?.avatarUrl, user?.fullName],
  );

  const loadProfileDetails = useCallback(async () => {
    if (!user) return;
    setFullName(user.fullName ?? '');
    setAvatarUrl((prev) => prev || user.avatarUrl || '');
    try {
      const profile = await apiFetch<ProfileDetailsResponse>('/auth/profile');
      applyProfileData(profile);
    } catch {
      // Giữ nguyên thông tin cơ bản từ phiên đăng nhập nếu endpoint profile chưa sẵn sàng
    }
  }, [applyProfileData, user]);

  useEffect(() => {
    void loadProfileDetails();
  }, [loadProfileDetails]);

  const userId = user?.id;
  const userRole = user?.role;
  useEffect(() => {
    if (!userId || userRole !== 'STUDENT') {
      setLearningSummary(null);
      return;
    }
    let active = true;
    const controller = new AbortController();
    void Promise.resolve(enrollmentApi.listMine(controller.signal))
      .then((list) => {
        if (!active || controller.signal.aborted || !Array.isArray(list)) return;
        setLearningSummary({
          totalCount: list.length,
          activeCount: list.filter((e) => e.status === 'ACTIVE').length,
          completedCount: list.filter((e) => e.status === 'COMPLETED').length,
        });
      })
      .catch(() => {
        // Không làm gián đoạn trang hồ sơ trong môi trường offline/mock
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [userId, userRole]);

  const openProfileEditor = async () => {
    setFormError(null);
    setStatusMessage(null);
    setFullName(user?.fullName ?? '');
    setMode('EDIT');
    try {
      const profile = await apiFetch<ProfileDetailsResponse>('/auth/profile');
      applyProfileData(profile);
    } catch {
      // Giữ giá trị hiện tại trong form
    }
  };

  const handleAvatarFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFormError(null);
    try {
      const dataUrl = await readAvatarFileAsDataUrl(file);
      setAvatarUrl(dataUrl);
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'UNSUPPORTED_TYPE') {
        setFormError('Vui lòng chọn tệp ảnh PNG, JPG, WebP hoặc GIF.');
      } else if (code === 'FILE_TOO_LARGE') {
        setFormError('Ảnh đại diện quá lớn. Vui lòng chọn ảnh nhỏ hơn 5MB.');
      } else {
        setFormError('Không thể đọc tệp ảnh vừa chọn.');
      }
    } finally {
      event.target.value = '';
    }
  };

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setStatusMessage(null);
    if (!fullName.trim()) {
      setFormError('Vui lòng nhập họ và tên.');
      return;
    }
    setBusy(true);
    try {
      const updated = await apiFetch<ProfileDetailsResponse>('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: phone.trim(),
          timezone,
          emailNotifications,
          studyGoalNote: studyGoalNote.trim(),
          avatarUrl: avatarUrl.trim(),
          dateOfBirth: dateOfBirth.trim(),
          gender,
          address: address.trim(),
          targetScore: targetScore.trim(),
        }),
      });
      applyProfileData(updated);
      await refreshUser();
      setStatusMessage('Đã cập nhật hồ sơ cá nhân và ảnh đại diện thành công.');
      setMode('VIEW');
    } catch (err: unknown) {
      setFormError(
        err instanceof ApiError && err.status === 400
          ? 'Thông tin hoặc ảnh đại diện chưa hợp lệ (chỉ hỗ trợ ảnh PNG/JPG/WebP/GIF hoặc URL http(s)).'
          : 'Không thể cập nhật hồ sơ cá nhân lúc này.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setStatusMessage(null);
    if (!currentPassword || newPassword.length < 8) {
      setFormError('Mật khẩu mới phải có ít nhất 8 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError('Mật khẩu xác nhận chưa khớp.');
      return;
    }
    setBusy(true);
    try {
      await apiFetch<void>('/auth/profile/password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setStatusMessage('Đã cập nhật mật khẩu cá nhân và thu hồi các phiên đăng nhập khác.');
      setMode('VIEW');
    } catch (err: unknown) {
      setFormError(
        err instanceof ApiError && err.status === 400
          ? 'Mật khẩu hiện tại không đúng hoặc mật khẩu mới trùng mật khẩu cũ.'
          : 'Không thể đổi mật khẩu lúc này.',
      );
    } finally {
      setBusy(false);
    }
  };

  const displayedName = user?.fullName || fullName;
  const displayedAvatar = avatarUrl || user?.avatarUrl || '';
  const updatedLabel = formatTimestamp(updatedAt);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link className="font-semibold text-[#4e7c38] hover:underline" to="/workspace">
          {user?.role === 'STUDENT' ? '← Trang chủ học tập' : '← Không gian làm việc'}
        </Link>
        {user?.role === 'STUDENT' && (
          <div className="flex flex-wrap gap-3 text-xs font-semibold">
            <Link className="text-slate-600 hover:text-[#4e7c38] hover:underline" to="/student/enrollments">
              Lớp đang theo học
            </Link>
            <Link className="text-slate-600 hover:text-[#4e7c38] hover:underline" to="/my/progress">
              Tiến độ &amp; Chứng chỉ
            </Link>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng tải lại trang.
        </p>
      )}
      {statusMessage && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900"
        >
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>{statusMessage}</span>
        </p>
      )}
      {formError && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800"
        >
          {formError}
        </p>
      )}

      {isLoading ? (
        <p role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Đang tải thông tin tài khoản…
        </p>
      ) : user ? (
        <>
          {/* Hero Card with Avatar & Quick Actions */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="h-24 bg-gradient-to-r from-[#5b8546] via-[#76a35e] to-[#8cb675]" />
            <div className="px-6 pb-6">
              <div className="-mt-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                  <div className="relative w-fit">
                    <ProfileAvatarDisplay
                      avatarUrl={displayedAvatar}
                      fullName={displayedName}
                    />
                    <button
                      type="button"
                      onClick={() => void openProfileEditor()}
                      aria-label="Đổi ảnh đại diện"
                      title="Đổi ảnh đại diện"
                      className="absolute bottom-0 right-0 grid size-8 place-items-center rounded-full border-2 border-white bg-[#e66f2b] text-white shadow-sm transition hover:bg-[#cf5c1b]"
                    >
                      <Camera className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="space-y-1 pt-1 sm:pb-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-2xl font-extrabold text-slate-900">{displayedName}</h1>
                      <span className="rounded-full bg-[#edf5e8] px-2.5 py-0.5 text-xs font-bold text-[#2f5d1e]">
                        {businessRoleLabels[user.role]}
                      </span>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                        {accountStatusLabel(user.status)}
                      </span>
                    </div>
                    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                      <span className="inline-flex items-center gap-1.5 break-all">
                        <Mail className="size-3.5 text-slate-400" aria-hidden="true" />
                        {user.email}
                      </span>
                      {targetScore && (
                        <span className="inline-flex items-center gap-1 font-semibold text-[#e66f2b]">
                          <Target className="size-3.5" aria-hidden="true" />
                          Mục tiêu TOEIC: {targetScore}
                        </span>
                      )}
                    </p>
                    {updatedLabel && (
                      <p className="text-xs text-slate-400">
                        Cập nhật lần cuối: {updatedLabel}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isLoading || busy}
                    onClick={() => {
                      void refreshUser();
                      void loadProfileDetails();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <RefreshCw className="size-3.5" aria-hidden="true" />
                    Làm mới thông tin
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void openProfileEditor()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#76a35e] px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#5f8949]"
                  >
                    <PencilLine className="size-3.5" aria-hidden="true" />
                    Chỉnh sửa hồ sơ cá nhân
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setFormError(null);
                      setStatusMessage(null);
                      setMode(mode === 'PASSWORD' ? 'VIEW' : 'PASSWORD');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <KeyRound className="size-3.5" aria-hidden="true" />
                    Đổi mật khẩu
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Read-only Student/User Profile Details */}
          {mode === 'VIEW' && (
            <div className="grid gap-6 lg:grid-cols-3">
              <section
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-2"
                aria-label="Thông tin tài khoản"
              >
                <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                  <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                    <UserRound className="size-4 text-[#5e9141]" aria-hidden="true" />
                    Thông tin cá nhân &amp; Liên hệ
                  </h2>
                  <button
                    type="button"
                    onClick={() => void openProfileEditor()}
                    className="text-xs font-semibold text-[#4e7c38] hover:underline"
                  >
                    Thay đổi thông tin →
                  </button>
                </div>

                <dl className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Email</dt>
                    <dd className="mt-1 break-all text-sm font-medium text-slate-800">
                      {user.email}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Mã tài khoản</dt>
                    <dd className="mt-1 font-mono text-sm font-semibold text-slate-800">
                      {user.id.slice(0, 8).toUpperCase()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Số điện thoại liên hệ</dt>
                    <dd className="mt-1 flex items-center gap-1.5 text-sm text-slate-800">
                      <Phone className="size-3.5 text-slate-400" aria-hidden="true" />
                      <span>{phone || 'Chưa cập nhật'}</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Ngày sinh</dt>
                    <dd className="mt-1 flex items-center gap-1.5 text-sm text-slate-800">
                      <Calendar className="size-3.5 text-slate-400" aria-hidden="true" />
                      <span>{formatDateDisplay(dateOfBirth)}</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Giới tính</dt>
                    <dd className="mt-1 text-sm text-slate-800">
                      {GENDER_LABELS[gender] ?? 'Chưa cập nhật'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Địa chỉ liên hệ</dt>
                    <dd className="mt-1 flex items-start gap-1.5 text-sm text-slate-800">
                      <MapPin className="mt-0.5 size-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                      <span>{address || 'Chưa cập nhật'}</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Vai trò chính</dt>
                    <dd className="mt-1 text-sm font-medium text-slate-800">
                      {businessRoleLabels[user.role]}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Trạng thái tài khoản</dt>
                    <dd className="mt-1 text-sm font-medium text-slate-800">
                      {accountStatusLabel(user.status)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Múi giờ hiển thị</dt>
                    <dd className="mt-1 text-sm text-slate-800">
                      {timezone === 'Asia/Ho_Chi_Minh' ? 'Việt Nam (GMT+7)' : timezone}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">Thông báo qua email</dt>
                    <dd className="mt-1 text-sm text-slate-800">
                      {emailNotifications ? 'Đang bật nhắc lịch & kết quả' : 'Đã tắt'}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-slate-500">
                      {user.role === 'STUDENT'
                        ? 'Mục tiêu học tập / ghi chú cá nhân'
                        : 'Ghi chú chuyên môn & công việc'}
                    </dt>
                    <dd className="mt-1 rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800">
                      {studyGoalNote ||
                        (user.role === 'STUDENT'
                          ? 'Chưa thiết lập ghi chú mục tiêu học tập.'
                          : 'Chưa thiết lập ghi chú cá nhân.')}
                    </dd>
                  </div>
                </dl>
              </section>

              <aside className="space-y-4">
                {user.role === 'STUDENT' && (
                  <section
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
                    aria-label="Tổng quan học tập cá nhân"
                  >
                    <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                      <BookOpen className="size-4 text-[#5e9141]" aria-hidden="true" />
                      Hồ sơ học tập TOEIC
                    </h2>
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between rounded-xl bg-[#f4f9f1] px-3.5 py-2.5">
                        <span className="text-xs font-medium text-slate-700">Mục tiêu đầu ra</span>
                        <span className="text-sm font-extrabold text-[#2f5d1e]">
                          {targetScore || 'Chưa đặt'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5">
                        <span className="text-xs font-medium text-slate-700">Lớp đang theo học</span>
                        <span className="text-sm font-bold text-slate-900">
                          {learningSummary ? learningSummary.activeCount : '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5">
                        <span className="text-xs font-medium text-slate-700">Lớp đã hoàn thành</span>
                        <span className="inline-flex items-center gap-1 text-sm font-bold text-emerald-700">
                          <Award className="size-3.5" aria-hidden="true" />
                          {learningSummary ? learningSummary.completedCount : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-col gap-2 text-xs font-semibold">
                      <Link
                        to="/student/enrollments"
                        className="rounded-lg border border-slate-200 px-3 py-2 text-center text-slate-700 hover:bg-slate-50"
                      >
                        Mở danh sách lớp học →
                      </Link>
                      <Link
                        to="/my/progress"
                        className="rounded-lg border border-[#cfe2c4] bg-[#f4f9f1] px-3 py-2 text-center text-[#2f5d1e] hover:bg-[#e8f3e1]"
                      >
                        Xem tiến độ &amp; Chứng chỉ →
                      </Link>
                    </div>
                  </section>
                )}

                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                  <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <ShieldCheck className="size-4 text-[#5e9141]" aria-hidden="true" />
                    Bảo mật &amp; Phiên đăng nhập
                  </h2>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    Đổi mật khẩu định kỳ giúp bảo vệ tài khoản của bạn và tự động thu hồi các phiên
                    đăng nhập trên thiết bị khác.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setFormError(null);
                      setStatusMessage(null);
                      setMode('PASSWORD');
                    }}
                    className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Đổi mật khẩu tài khoản
                  </button>
                </section>
              </aside>
            </div>
          )}

          {/* Edit Mode: Avatar Picker/Uploader + Personal Info */}
          {mode === 'EDIT' && (
            <form
              onSubmit={(e) => void handleSaveProfile(e)}
              className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"
              aria-label="Biểu mẫu cập nhật hồ sơ cá nhân"
            >
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-lg font-bold text-slate-900">
                  Cập nhật thông tin và ảnh đại diện
                </h2>
                <p className="text-xs text-slate-500">
                  {user.role === 'STUDENT'
                    ? 'Thay đổi ảnh đại diện, thông tin liên hệ và mục tiêu học tập cá nhân của bạn.'
                    : 'Thay đổi ảnh đại diện, thông tin liên hệ và ghi chú công việc cá nhân của bạn.'}
                </p>
              </div>

              {/* Avatar Changer */}
              <div className="rounded-xl border border-slate-200 bg-[#f8faf7] p-4">
                <h3 className="text-sm font-bold text-slate-900">Ảnh đại diện (Avatar)</h3>
                <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
                  <ProfileAvatarDisplay
                    avatarUrl={avatarUrl}
                    fullName={fullName || user.fullName}
                    sizeClass="size-20"
                    textClass="text-xl"
                  />
                  <div className="flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#76a35e] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#5f8949]">
                        <Camera className="size-3.5" aria-hidden="true" />
                        <span>Tải ảnh từ máy</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          onChange={(e) => void handleAvatarFileChange(e)}
                          className="sr-only"
                        />
                      </label>
                      {avatarUrl && (
                        <button
                          type="button"
                          onClick={() => setAvatarUrl('')}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Trash2 className="size-3.5 text-rose-600" aria-hidden="true" />
                          Xóa ảnh (dùng chữ cái)
                        </button>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-slate-600">Hoặc chọn nhanh avatar mẫu:</p>
                      <div className="flex flex-wrap items-center gap-2.5">
                        {PRESET_AVATARS.map((preset) => {
                          const selected = avatarUrl === preset.url;
                          return (
                            <button
                              key={preset.url}
                              type="button"
                              onClick={() => setAvatarUrl(preset.url)}
                              title={preset.label}
                              aria-label={preset.label}
                              aria-pressed={selected}
                              className={`size-10 overflow-hidden rounded-full border-2 transition ${
                                selected
                                  ? 'border-[#e66f2b] ring-2 ring-[#e66f2b]/30'
                                  : 'border-white shadow-xs hover:scale-105'
                              }`}
                            >
                              <img
                                src={preset.url}
                                alt={preset.label}
                                className="size-full object-cover"
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <label className="block space-y-1 text-xs font-medium text-slate-600">
                      <span>Hoặc nhập đường dẫn ảnh (URL http/https)</span>
                      <input
                        type="text"
                        value={avatarUrl.startsWith('data:') ? '' : avatarUrl}
                        onChange={(e) => setAvatarUrl(e.target.value)}
                        placeholder={
                          avatarUrl.startsWith('data:')
                            ? 'Đang dùng ảnh tải lên từ thiết bị'
                            : 'https://example.com/avatar.jpg'
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-[#76a35e] focus:outline-none"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Personal & Study Fields */}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1 text-sm font-medium text-slate-700">
                  <span>Họ và tên hiển thị</span>
                  <input
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#76a35e] focus:outline-none"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    maxLength={200}
                    required
                  />
                </label>
                <label className="block space-y-1 text-sm font-medium text-slate-700">
                  <span>Số điện thoại liên hệ</span>
                  <input
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#76a35e] focus:outline-none"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    maxLength={30}
                    placeholder="0901234567"
                  />
                </label>
                <label className="block space-y-1 text-sm font-medium text-slate-700">
                  <span>Ngày sinh</span>
                  <input
                    type="date"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#76a35e] focus:outline-none"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                  />
                </label>
                <label className="block space-y-1 text-sm font-medium text-slate-700">
                  <span>Giới tính</span>
                  <select
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#76a35e] focus:outline-none"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                  >
                    <option value="">Chưa cập nhật</option>
                    <option value="MALE">Nam</option>
                    <option value="FEMALE">Nữ</option>
                    <option value="OTHER">Khác</option>
                  </select>
                </label>
                <label className="block space-y-1 text-sm font-medium text-slate-700 sm:col-span-2">
                  <span>Địa chỉ liên hệ</span>
                  <input
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#76a35e] focus:outline-none"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    maxLength={300}
                    placeholder="Ví dụ: 12 Nguyễn Văn Bảo, P.4, Q. Gò Vấp, TP.HCM"
                  />
                </label>
                {user.role === 'STUDENT' && (
                  <label className="block space-y-1 text-sm font-medium text-slate-700">
                    <span>Mục tiêu điểm TOEIC</span>
                    <input
                      list="toeic-target-presets"
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#76a35e] focus:outline-none"
                      value={targetScore}
                      onChange={(e) => setTargetScore(e.target.value)}
                      maxLength={40}
                      placeholder="Ví dụ: 650+ Chuẩn đầu ra"
                    />
                    <datalist id="toeic-target-presets">
                      <option value="450+ Nền tảng" />
                      <option value="550+ Giao tiếp công sở" />
                      <option value="650+ Chuẩn đầu ra" />
                      <option value="750+ Nâng cao" />
                      <option value="850+ Thành thạo" />
                    </datalist>
                  </label>
                )}
                <label className="block space-y-1 text-sm font-medium text-slate-700">
                  <span>Múi giờ hiển thị</span>
                  <select
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#76a35e] focus:outline-none"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                  >
                    <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh (GMT+7)</option>
                    <option value="Asia/Tokyo">Asia/Tokyo (GMT+9)</option>
                    <option value="UTC">UTC</option>
                  </select>
                </label>
              </div>

              <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={emailNotifications}
                  onChange={(e) => setEmailNotifications(e.target.checked)}
                  className="accent-[#76a35e]"
                />
                <span>Nhận thông báo lịch học và kết quả qua email</span>
              </label>

              <label className="block space-y-1 text-sm font-medium text-slate-700">
                <span>
                  {user.role === 'STUDENT'
                    ? 'Mục tiêu TOEIC / Ghi chú cá nhân'
                    : 'Ghi chú chuyên môn cá nhân'}
                </span>
                <textarea
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#76a35e] focus:outline-none"
                  rows={2}
                  maxLength={500}
                  value={studyGoalNote}
                  onChange={(e) => setStudyGoalNote(e.target.value)}
                  placeholder={
                    user.role === 'STUDENT'
                      ? 'Ví dụ: Mục tiêu TOEIC 650+ trong học kỳ này'
                      : 'Ví dụ: Lịch phụ trách lớp TOEIC buổi tối và giờ tư vấn'
                  }
                />
              </label>

              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="submit"
                  className="rounded-lg bg-[#76a35e] px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-[#5f8949] disabled:opacity-60"
                  disabled={busy}
                >
                  {busy ? 'Đang cập nhật...' : 'Cập nhật hồ sơ'}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  disabled={busy}
                  onClick={() => setMode('VIEW')}
                >
                  Đóng
                </button>
              </div>
            </form>
          )}

          {/* Password Mode */}
          {mode === 'PASSWORD' && (
            <form
              onSubmit={(e) => void handleChangePassword(e)}
              className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"
              aria-label="Biểu mẫu đổi mật khẩu"
            >
              <h2 className="text-lg font-bold text-slate-900">Đổi mật khẩu truy cập</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block space-y-1 text-sm font-medium text-slate-700">
                  <span>Mật khẩu hiện tại</span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </label>
                <label className="block space-y-1 text-sm font-medium text-slate-700">
                  <span>Mật khẩu mới (tối thiểu 8 ký tự)</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </label>
                <label className="block space-y-1 text-sm font-medium text-slate-700">
                  <span>Xác nhận mật khẩu mới</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  className="rounded-lg bg-[#76a35e] px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-[#5f8949] disabled:opacity-60"
                  disabled={busy}
                >
                  Xác nhận đổi mật khẩu
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  disabled={busy}
                  onClick={() => setMode('VIEW')}
                >
                  Đóng
                </button>
              </div>
            </form>
          )}
        </>
      ) : (
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Cần đăng nhập để xem hồ sơ.
        </p>
      )}
    </div>
  );
}
