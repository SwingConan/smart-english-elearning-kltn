import { FormEvent, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { loginErrorMessage } from '@/features/auth/auth-errors';
import { useAuth } from '@/features/auth/auth-context';
import { safeReturnUrl } from '@/features/auth/return-url';
import { AuthShell } from '@/features/auth/AuthShell';
import { LoadingButton } from '@/components/ui/Feedback';
import { useUnsavedChanges } from '@/components/ui/use-unsaved-changes';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginPage() {
  const { user, isLoading, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  useUnsavedChanges(Boolean(email || password) && !isSubmitting && !user);

  if (isLoading) {
    return (
      <div className="section-shell" role="status">
        <div className="mx-auto h-96 max-w-5xl animate-pulse rounded-3xl bg-slate-200" />
      </div>
    );
  }

  if (user && !isSubmitting) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (!email.trim() || !password) {
      setFormError('Vui lòng nhập email và mật khẩu.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login({ email: email.trim(), password });
      navigate(safeReturnUrl(searchParams.get('returnUrl')));
    } catch (error: unknown) {
      setFormError(loginErrorMessage(error));
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      description="Tiếp tục hành trình học, bài kiểm tra và tiến độ trong một không gian tập trung."
      eyebrow="Chào mừng trở lại"
      title="Đăng nhập"
    >
      {searchParams.get('registered') === '1' ? (
        <p className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
          Đăng ký tài khoản thành công. Vui lòng đăng nhập.
        </p>
      ) : null}
      <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input
            autoFocus
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
          <label className="text-sm font-medium" htmlFor="login-password">
            Mật khẩu
          </label>
          <span className="relative mt-2 block">
            <input
              aria-invalid={touched.password && !password}
              autoComplete="current-password"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 pr-12"
              id="login-password"
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
          {touched.password && !password ? (
            <span className="mt-1.5 block text-sm text-red-700">Nhập mật khẩu để tiếp tục.</span>
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
          loadingLabel="Đang đăng nhập…"
          type="submit"
        >
          Đăng nhập
        </LoadingButton>
      </form>
      <p className="mt-4 text-sm">
        Chưa có tài khoản?{' '}
        <Link
          className="font-medium underline"
          to={`/register?${new URLSearchParams({
            returnUrl: safeReturnUrl(searchParams.get('returnUrl')),
          }).toString()}`}
        >
          Đăng ký
        </Link>
      </p>
    </AuthShell>
  );
}
