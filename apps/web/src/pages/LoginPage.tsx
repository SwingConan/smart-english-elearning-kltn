import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { loginErrorMessage } from '@/features/auth/auth-errors';
import { useAuth } from '@/features/auth/auth-context';
import { safeReturnUrl } from '@/features/auth/return-url';

export function LoginPage() {
  const { user, isLoading, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isLoading) {
    return <p role="status">Đang kiểm tra phiên đăng nhập...</p>;
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
    <section className="mx-auto max-w-md rounded-xl border bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold">Đăng nhập</h1>
      {searchParams.get('registered') === '1' ? (
        <p className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
          Đăng ký tài khoản thành công. Vui lòng đăng nhập.
        </p>
      ) : null}
      <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input
            autoComplete="email"
            className="mt-1 w-full rounded-md border px-3 py-2"
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            value={email}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Mật khẩu</span>
          <input
            autoComplete="current-password"
            className="mt-1 w-full rounded-md border px-3 py-2"
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
        <button
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>
      <p className="mt-4 text-sm">
        Chưa có tài khoản?{' '}
        <Link className="font-medium underline" to="/register">
          Đăng ký
        </Link>
      </p>
    </section>
  );
}
