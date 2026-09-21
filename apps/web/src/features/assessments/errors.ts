import { ApiError } from '@/lib/api-client';

function backendMessage(error: ApiError): string {
  if (!error.body || typeof error.body !== 'object') return '';
  const message = (error.body as { message?: unknown }).message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message) && message.every((item) => typeof item === 'string')) {
    return message.join(' ');
  }
  return '';
}

function validationMessage(message: string): string {
  if (message.includes('at least one question')) {
    return 'Bài kiểm tra cần có ít nhất một câu hỏi trước khi xuất bản.';
  }
  if (message.includes('published QUIZ') || message.includes('QUIZ must reference')) {
    return 'Bài kiểm tra QUIZ cần chọn một bài học trước khi xuất bản.';
  }
  if (message.includes('Question') || message.includes('option') || message.includes('Option')) {
    return 'Cấu trúc câu hỏi hoặc đáp án chưa hợp lệ. Vui lòng kiểm tra lại.';
  }
  if (message.includes('maxAttempts') || message.includes('positive integer')) {
    return 'Số lượt làm phải là số nguyên lớn hơn hoặc bằng 1.';
  }
  if (message.includes('title') || message.includes('content')) {
    return 'Nội dung bắt buộc chưa được nhập hoặc vượt quá giới hạn cho phép.';
  }
  return 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại các trường đã nhập.';
}

export function assessmentErrorMessage(
  error: unknown,
  fallback: string,
  conflictMessage = 'Dữ liệu vừa thay đổi hoặc đã có lịch sử làm bài. Vui lòng tải lại và thử lại.',
): string {
  if (!(error instanceof ApiError)) return fallback;

  switch (error.status) {
    case 400:
      return validationMessage(backendMessage(error));
    case 403:
      return 'Bạn không có quyền quản lý nội dung đánh giá của khóa học này.';
    case 404:
      return 'Nội dung không tồn tại hoặc bạn không còn quyền truy cập.';
    case 409:
      return conflictMessage;
    default:
      return fallback;
  }
}
