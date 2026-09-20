import { ApiError } from '@/lib/api-client';

export function adminErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return 'Dữ liệu chưa hợp lệ. Kiểm tra lại thông tin.';
      case 401:
        return 'Phiên đăng nhập không còn hợp lệ.';
      case 403:
        return 'Bạn không có quyền thực hiện thao tác này.';
      case 404:
        return 'Dữ liệu không còn tồn tại.';
      case 409:
        return 'Thao tác xung đột với dữ liệu hiện tại.';
    }
  }
  return 'Không thể kết nối máy chủ. Vui lòng thử lại.';
}
