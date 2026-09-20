import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { registerErrorMessage } from '@/features/auth/auth-errors';
import { useAuth } from '@/features/auth/auth-context';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RegisterPage() {
  const { user, isLoading, register } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isLoading) {
    return <p role="status">Đang kiểm tra phiên đăng nhập...</p>;
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
      navigate('/login?registered=1', { replace: true });
    } catch (error: unknown) {
      setFormError(registerErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="mx-auto max-w-md rounded-xl border bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold">Đăng ký</h1>
      <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <label className="block">
          <span className="text-sm font-medium">Họ và tên</span>
          <input
            autoComplete="name"
            className="mt-1 w-full rounded-md border px-3 py-2"
            onChange={(event) => setFullName(event.target.value)}
            value={fullName}
          />
        </label>
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
            autoComplete="new-password"
            className="mt-1 w-full rounded-md border px-3 py-2"
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Xác nhận mật khẩu</span>
          <input
            autoComplete="new-password"
            className="mt-1 w-full rounded-md border px-3 py-2"
            onChange={(event) => setConfirmPassword(event.target.value)}
            type="password"
            value={confirmPassword}
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
          {isSubmitting ? 'Đang đăng ký...' : 'Đăng ký'}
        </button>
      </form>
      <p className="mt-4 text-sm">
        Đã có tài khoản?{' '}
        <Link className="font-medium underline" to="/login">
          Đăng nhập
        </Link>
      </p>
    </section>
  );
}
