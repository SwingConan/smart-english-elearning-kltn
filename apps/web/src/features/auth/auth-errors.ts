import { ApiError } from '@/lib/api-client';

const SERVER_ERROR = 'Không thể kết nối máy chủ. Vui lòng thử lại.';

export function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) {
    return 'Email hoặc mật khẩu không đúng.';
  }
  return SERVER_ERROR;
}

export function registerErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return 'Email đã được sử dụng.';
  }
  return SERVER_ERROR;
}

export function passwordResetRequestErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 429) {
    return 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.';
  }
  return 'Dịch vụ khôi phục mật khẩu tạm thời chưa sẵn sàng. Vui lòng thử lại sau.';
}

export function passwordResetConfirmErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 400) {
    return 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu liên kết mới.';
  }
  return 'Không thể cập nhật mật khẩu lúc này. Vui lòng thử lại sau.';
}
