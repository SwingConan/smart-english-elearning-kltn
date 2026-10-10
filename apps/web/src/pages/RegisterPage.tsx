import { FormEvent, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { registerErrorMessage } from '@/features/auth/auth-errors';
import { useAuth } from '@/features/auth/auth-context';
import { safeReturnUrl } from '@/features/auth/return-url';
import { AuthShell } from '@/features/auth/AuthShell';
import { LoadingButton } from '@/components/ui/Feedback';
import { useUnsavedChanges } from '@/components/ui/use-unsaved-changes';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RegisterPage() {
  const { user, isLoading, register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnUrl = safeReturnUrl(searchParams.get('returnUrl'));
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [touched, setTouched] = useState({
    fullName: false,
    email: false,
    password: false,
    confirmPassword: false,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  useUnsavedChanges(
    Boolean(fullName || email || password || confirmPassword) && !isSubmitting && !user,
  );

  if (isLoading) {
    return (
      <div className="section-shell" role="status">
        <div className="mx-auto h-96 max-w-5xl animate-pulse rounded-3xl bg-slate-200" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (!fullName.trim() || !email.trim() || !password || !confirmPassword) {
      setFormError('Vui lòng nhập đầy đủ thông tin.');
      return;
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      setFormError('Email không hợp lệ.');
      return;
    }
    if (password.length < 8) {
      setFormError('Mật khẩu phải có ít nhất 8 ký tự.');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setIsSubmitting(true);
    try {
      await register({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
      });
      navigate(`/login?${new URLSearchParams({ registered: '1', returnUrl }).toString()}`, {
        replace: true,
      });
    } catch (error: unknown) {
      setFormError(registerErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      description="Tạo tài khoản để đăng ký lớp và theo dõi hành trình học tập của riêng bạn."
      eyebrow="Bắt đầu hành trình"
      title="Đăng ký"
    >
      <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <label className="block">
          <span className="text-sm font-medium">Họ và tên</span>
          <input
            autoFocus
            autoComplete="name"
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
            aria-invalid={touched.fullName && !fullName.trim()}
            onBlur={() => setTouched((current) => ({ ...current, fullName: true }))}
            onChange={(event) => setFullName(event.target.value)}
            value={fullName}
          />
          {touched.fullName && !fullName.trim() ? (
            <span className="mt-1.5 block text-sm text-red-700">Nhập họ và tên.</span>
          ) : null}
        </label>
        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input
            autoComplete="email"
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
            aria-invalid={touched.email && !EMAIL_PATTERN.test(email)}
            onBlur={() => setTouched((current) => ({ ...current, email: true }))}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            value={email}
          />
          {touched.email && !EMAIL_PATTERN.test(email) ? (
            <span className="mt-1.5 block text-sm text-red-700">Nhập email đúng định dạng.</span>
          ) : null}
        </label>
        <div className="block">
          <label className="text-sm font-medium" htmlFor="register-password">
            Mật khẩu
          </label>
          <span className="relative mt-2 block">
            <input
              aria-describedby="password-hint"
              aria-invalid={touched.password && password.length < 8}
              autoComplete="new-password"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 pr-12"
              id="register-password"
              onBlur={() => setTouched((current) => ({ ...current, password: true }))}
              onChange={(event) => setPassword(event.target.value)}
              type={showPassword ? 'text' : 'password'}
              value={password}
            />
            <button
              aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              onClick={() => setShowPassword((value) => !value)}
              type="button"
            >
              {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </span>
          <span
            className={`mt-1.5 block text-sm ${touched.password && password.length < 8 ? 'text-red-700' : 'text-slate-500'}`}
            id="password-hint"
          >
            Ít nhất 8 ký tự.
          </span>
        </div>
        <div className="block">
          <label className="text-sm font-medium" htmlFor="register-confirm-password">
            Xác nhận mật khẩu
          </label>
          <span className="relative mt-2 block">
            <input
              aria-invalid={touched.confirmPassword && confirmPassword !== password}
              autoComplete="new-password"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 pr-12"
              id="register-confirm-password"
              onBlur={() => setTouched((current) => ({ ...current, confirmPassword: true }))}
              onChange={(event) => setConfirmPassword(event.target.value)}
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
            />
            <button
              aria-label={showConfirmPassword ? 'Ẩn mật khẩu xác nhận' : 'Hiện mật khẩu xác nhận'}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              onClick={() => setShowConfirmPassword((value) => !value)}
              type="button"
            >
              {showConfirmPassword ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </span>
          {touched.confirmPassword && confirmPassword !== password ? (
            <span className="mt-1.5 block text-sm text-red-700">Mật khẩu xác nhận chưa khớp.</span>
          ) : null}
        </div>
        {formError ? (
          <p className="text-sm text-red-700" role="alert">
            {formError}
          </p>
        ) : null}
        <LoadingButton
          className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
          isLoading={isSubmitting}
          loadingLabel="Đang tạo tài khoản…"
          type="submit"
        >
          Đăng ký
        </LoadingButton>
      </form>
      <p className="mt-4 text-sm">
        Đã có tài khoản?{' '}
        <Link
          className="font-medium underline"
          to={`/login?${new URLSearchParams({ returnUrl }).toString()}`}
        >
          Đăng nhập
        </Link>
      </p>
    </AuthShell>
  );
}
