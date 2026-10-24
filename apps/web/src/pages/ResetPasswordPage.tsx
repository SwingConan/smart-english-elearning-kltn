import { FormEvent, useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Link } from 'react-router';
import { LoadingButton } from '@/components/ui/Feedback';
import { AuthShell } from '@/features/auth/AuthShell';
import { authApi } from '@/features/auth/api';
import { passwordResetConfirmErrorMessage } from '@/features/auth/auth-errors';
import { navigateAfterPasswordReset } from '@/features/auth/hard-navigation';

const INVALID_LINK_MESSAGE =
  'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu liên kết mới.';

function readResetToken(): string | null {
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
  return token && token.length <= 512 ? token : null;
}

function InvalidLinkState({ message = INVALID_LINK_MESSAGE }: { message?: string }) {
  return (
    <div className="mt-6 space-y-4">
      <p className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900" role="alert">
        {message}
      </p>
      <Link className="btn-primary inline-flex w-full justify-center" to="/forgot-password">
        Yêu cầu liên kết mới
      </Link>
      <p className="text-center text-sm">
        <Link className="font-medium underline underline-offset-4" to="/login">
          Quay lại đăng nhập
        </Link>
      </p>
    </div>
  );
}

export function ResetPasswordPage() {
  const [token] = useState(readResetToken);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [touched, setTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [invalidMessage, setInvalidMessage] = useState<string | null>(null);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const passwordError =
    password.length < 8
      ? 'Mật khẩu phải có ít nhất 8 ký tự.'
      : password.length > 128
        ? 'Mật khẩu không được vượt quá 128 ký tự.'
        : null;
  const confirmationError = confirmation !== password ? 'Mật khẩu xác nhận chưa khớp.' : null;

  useEffect(() => {
    if (!token || !window.location.hash) return;
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${window.location.search}`,
    );
  }, [token]);

  if (!token || invalidMessage) {
    return (
      <AuthShell
        eyebrow="Bảo mật tài khoản"
        title="Đặt lại mật khẩu"
        description="Liên kết khôi phục chỉ có thể sử dụng một lần và có thời hạn."
      >
        <InvalidLinkState message={invalidMessage ?? undefined} />
      </AuthShell>
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    setServiceError(null);
    if (passwordError || confirmationError) return;

    setIsSubmitting(true);
    try {
      await authApi.confirmPasswordReset({ token, newPassword: password });
      navigateAfterPasswordReset();
    } catch (requestError: unknown) {
      const message = passwordResetConfirmErrorMessage(requestError);
      if (message === INVALID_LINK_MESSAGE) setInvalidMessage(message);
      else setServiceError(message);
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Bảo mật tài khoản"
      title="Đặt lại mật khẩu"
      description="Chọn mật khẩu mới để tiếp tục sử dụng Smart English an toàn."
    >
      <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <PasswordField
          id="reset-password"
          label="Mật khẩu mới"
          value={password}
          visible={showPassword}
          invalid={touched && Boolean(passwordError)}
          onBlur={() => setTouched(true)}
          onChange={setPassword}
          onToggle={() => setShowPassword((current) => !current)}
        />
        {touched && passwordError ? (
          <p className="text-sm text-red-700" role="alert">
            {passwordError}
          </p>
        ) : null}
        <PasswordField
          id="reset-password-confirmation"
          label="Xác nhận mật khẩu mới"
          value={confirmation}
          visible={showConfirmation}
          invalid={touched && Boolean(confirmationError)}
          onBlur={() => setTouched(true)}
          onChange={setConfirmation}
          onToggle={() => setShowConfirmation((current) => !current)}
        />
        {touched && confirmationError ? (
          <p className="text-sm text-red-700" role="alert">
            {confirmationError}
          </p>
        ) : null}
        {serviceError ? (
          <p className="rounded-xl bg-red-50 p-4 text-sm text-red-800" role="alert">
            {serviceError}
          </p>
        ) : null}
        <LoadingButton
          className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
          isLoading={isSubmitting}
          loadingLabel="Đang cập nhật…"
          type="submit"
        >
          Đặt lại mật khẩu
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

function PasswordField({
  id,
  label,
  value,
  visible,
  invalid,
  onBlur,
  onChange,
  onToggle,
}: {
  id: string;
  label: string;
  value: string;
  visible: boolean;
  invalid: boolean;
  onBlur: () => void;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <div>
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <span className="relative mt-2 block">
        <input
          aria-invalid={invalid}
          autoComplete="new-password"
          className="w-full rounded-xl border border-slate-300 px-4 py-3 pr-12 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          id={id}
          maxLength={129}
          onBlur={onBlur}
          onChange={(event) => onChange(event.target.value)}
          type={visible ? 'text' : 'password'}
          value={value}
        />
        <button
          aria-label={visible ? `Ẩn ${label.toLowerCase()}` : `Hiện ${label.toLowerCase()}`}
          className="absolute right-2 top-1/2 min-h-10 min-w-10 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-600"
          onClick={onToggle}
          type="button"
        >
          {visible ? <EyeOff size={19} /> : <Eye size={19} />}
        </button>
      </span>
    </div>
  );
}
