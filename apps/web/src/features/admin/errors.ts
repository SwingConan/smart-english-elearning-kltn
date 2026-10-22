import { ApiError } from '@/lib/api-client';

export function adminErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const code =
      typeof error.body === 'object' && error.body !== null && 'code' in error.body
        ? String((error.body as { code?: unknown }).code ?? '')
        : '';
    const businessMessages: Record<string, string> = {
      PLACEMENT_EVALUATION_CONFIG_INVALID:
        'Cấu hình đánh giá hiện tại không hợp lệ. Vui lòng kiểm tra lại các khoảng điểm.',
      PLACEMENT_BOUNDARIES_INVALID: 'Ngưỡng Nền tảng phải nhỏ hơn ngưỡng bắt đầu Nâng cao.',
      ACTIVE_PROFILE_REQUIRES_CRITERION:
        'Cần ít nhất một điều kiện kỹ năng khi bật gợi ý cho khóa học.',
      COURSE_CRITERION_SKILL_DUPLICATED: 'Mỗi kỹ năng chỉ được cấu hình một lần.',
      COURSE_CRITERION_BOUND_REQUIRED: 'Mỗi điều kiện kỹ năng phải có ít nhất một ngưỡng.',
      COURSE_CRITERION_RANGE_INVALID: 'Khoảng điểm kỹ năng không hợp lệ.',
      COURSE_CRITERION_SKILL_INVALID: 'Chỉ hỗ trợ điều kiện Listening và Reading.',
      COURSE_PROFILE_INVALID: 'Cấu hình hồ sơ gợi ý khóa học không hợp lệ.',
      COURSE_NOT_FOUND: 'Không tìm thấy khóa học.',
      ACCOUNT_SELF_ROLE_CHANGE_FORBIDDEN: 'Bạn không thể thay đổi vai trò của chính mình.',
      ACCOUNT_SELF_STATUS_CHANGE_FORBIDDEN: 'Bạn không thể thay đổi trạng thái của chính mình.',
      LAST_ACTIVE_ADMIN_PROTECTED: 'Không thể thay đổi điều phối viên đang hoạt động cuối cùng.',
      STUDENT_ROLE_IMMUTABLE: 'Vai trò học viên không thể chuyển đổi tại đây.',
      INSTRUCTOR_OPERATIONAL_ASSIGNMENTS_BLOCK_ROLE:
        'Hãy điều phối lại các lớp đang vận hành trước khi đổi vai trò giảng viên.',
      INSTRUCTOR_OPERATIONAL_ASSIGNMENTS_BLOCK_INACTIVE:
        'Hãy điều phối lại các lớp đang vận hành trước khi ngưng hoạt động giảng viên.',
      ACCOUNT_EMAIL_EXISTS: 'Email này đã được sử dụng cho một tài khoản khác.',
    };
    if (code && businessMessages[code]) return businessMessages[code];
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
