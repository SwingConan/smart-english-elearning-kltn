import { FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { LoadingButton } from '@/components/ui/Feedback';
import { AuthShell } from '@/features/auth/AuthShell';
import { authApi } from '@/features/auth/api';
import { passwordResetRequestErrorMessage } from '@/features/auth/auth-errors';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUCCESS_MESSAGE =
  'Nếu email này được liên kết với một tài khoản có thể khôi phục, hướng dẫn đặt lại mật khẩu đã được gửi. Vui lòng kiểm tra hộp thư và thư rác.';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const normalizedEmail = email.trim();
  const emailError = !normalizedEmail
    ? 'Vui lòng nhập email.'
    : !EMAIL_PATTERN.test(normalizedEmail)
      ? 'Nhập email đúng định dạng.'
      : normalizedEmail.length > 320
        ? 'Email không được vượt quá 320 ký tự.'
        : null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    setStatus(null);
    setError(null);
    if (emailError) return;

    setIsSubmitting(true);
    try {
      await authApi.requestPasswordReset(normalizedEmail);
      setStatus(SUCCESS_MESSAGE);
    } catch (requestError: unknown) {
      setError(passwordResetRequestErrorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Khôi phục truy cập"
      title="Quên mật khẩu"
      description="Nhập email đã dùng cho tài khoản. Nếu tài khoản phù hợp, hệ thống sẽ gửi hướng dẫn đặt lại mật khẩu."
    >
      <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <label className="block" htmlFor="recovery-email">
          <span className="text-sm font-medium">Email</span>
          <input
            autoFocus
            autoComplete="email"
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            id="recovery-email"
            type="email"
            maxLength={321}
            aria-invalid={touched && Boolean(emailError)}
            aria-describedby={touched && emailError ? 'recovery-email-error' : undefined}
            onBlur={() => setTouched(true)}
            onChange={(event) => setEmail(event.target.value)}
            value={email}
          />
        </label>
        {touched && emailError ? (
          <p className="text-sm text-red-700" id="recovery-email-error" role="alert">
            {emailError}
          </p>
        ) : null}
        {status ? (
          <p
            className="rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-900"
            role="status"
          >
            {status}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-xl bg-red-50 p-4 text-sm text-red-800" role="alert">
            {error}
          </p>
        ) : null}
        <LoadingButton
          className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
          isLoading={isSubmitting}
          loadingLabel="Gửi hướng dẫn…"
          type="submit"
        >
          Gửi hướng dẫn
        </LoadingButton>
      </form>
      <p className="mt-5 text-sm">
        <Link className="font-medium underline underline-offset-4" to="/login">
          Quay lại đăng nhập
        </Link>
      </p>
    </AuthShell>
  );
}
