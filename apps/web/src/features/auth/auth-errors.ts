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
