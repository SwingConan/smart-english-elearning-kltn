import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { loginErrorMessage } from '@/features/auth/auth-errors';
import { useAuth } from '@/features/auth/auth-context';
import { safeReturnUrl } from '@/features/auth/return-url';
import { AuthShell } from '@/features/auth/AuthShell';
import { LoadingButton } from '@/components/ui/Feedback';
import { useUnsavedChanges } from '@/components/ui/use-unsaved-changes';

export function LoginPage() {
  const { user, isLoading, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            value={email}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Mật khẩu</span>
          <input
            autoComplete="current-password"
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
        </label>
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
