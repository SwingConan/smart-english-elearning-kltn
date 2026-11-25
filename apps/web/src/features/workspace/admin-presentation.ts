import type { UserRole } from '@/features/auth/api';
import { accountLabel, isTechnicalQaRecord } from '@/features/catalog/record-presentation';

export type AdminAccountItem = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: 'ACTIVE' | 'INACTIVE' | 'LOCKED' | string;
  createdAt?: string;
  updatedAt?: string;
  context?: {
    operationalClassAssignments: number;
    totalClassAssignments: number;
    enrollmentCount: number;
  };
};

export type AdminAccountDirectoryResponse = {
  data: AdminAccountItem[];
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary?: {
    total: number;
    active: number;
    inactive: number;
    locked: number;
    excludedFixtures?: number;
  };
};

export type ServiceHealthLevel = 'OPERATIONAL' | 'UNREACHABLE' | 'UNDETERMINED';

export const ADMIN_ROLE_LABELS: Record<string, string> = {
  STUDENT: 'Học viên',
  INSTRUCTOR: 'Giảng viên',
  COUNSELOR: 'Tư vấn viên',
  ACADEMIC_MANAGER: 'Quản lý học vụ',
  CASHIER: 'Thu ngân',
  TEACHING_INSPECTOR: 'Thanh tra đào tạo',
  SYSTEM_ADMIN: 'Quản trị hệ thống',
  ADMIN_COORDINATOR: 'Điều phối viên (cũ)',
};

export const ADMIN_ROLE_SHORT: Record<string, string> = {
  STUDENT: 'HV · Học viên',
  INSTRUCTOR: 'GV · Giảng viên',
  COUNSELOR: 'TV · Tư vấn',
  ACADEMIC_MANAGER: 'HVỤ · Học vụ',
  CASHIER: 'TN · Thu ngân',
  TEACHING_INSPECTOR: 'TT · Thanh tra',
  SYSTEM_ADMIN: 'QT · Quản trị',
  ADMIN_COORDINATOR: 'Điều phối (cũ)',
};

export const ACCOUNT_STATUS_META: Record<string, { label: string; badgeClass: string }> = {
  ACTIVE: {
    label: 'Đang hoạt động',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  LOCKED: {
    label: 'Đã khóa',
    badgeClass: 'border-rose-200 bg-rose-50 text-rose-700',
  },
  INACTIVE: {
    label: 'Ngưng hoạt động',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-800',
  },
};

export const SERVICE_STATUS_META: Record<
  ServiceHealthLevel,
  { label: string; description: string; badgeClass: string }
> = {
  OPERATIONAL: {
    label: 'Hoạt động',
    description: 'Dịch vụ phản hồi hợp lệ từ máy chủ thực tế.',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  UNREACHABLE: {
    label: 'Không truy cập được',
    description: 'Không kết nối được hoặc endpoint bị từ chối / không khả dụng.',
    badgeClass: 'border-rose-200 bg-rose-50 text-rose-700',
  },
  UNDETERMINED: {
    label: 'Chưa thể xác định',
    description: 'Chưa cấu hình đầy đủ, đang dùng chế độ an toàn hoặc chưa có nguồn xác minh.',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-800',
  },
};

export const AUDIT_DECISION_META: Record<string, { label: string; badgeClass: string }> = {
  ALLOW: {
    label: 'Hợp lệ / Cho phép',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  DENY: {
    label: 'Từ chối truy cập',
    badgeClass: 'border-rose-200 bg-rose-50 text-rose-700',
  },
  PENDING_OPERATOR_REVIEW: {
    label: 'Chờ duyệt vận hành',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  EXPORTED: {
    label: 'Đã xuất dữ liệu',
    badgeClass: 'border-sky-200 bg-sky-50 text-sky-700',
  },
  RECORDED: {
    label: 'Đã ghi nhận',
    badgeClass: 'border-slate-200 bg-slate-50 text-slate-700',
  },
};

const CAPABILITY_LABELS: Record<string, string> = {
  'accounts.manage': 'Quản lý danh bạ tài khoản',
  'authority.approve': 'Phê duyệt vai trò & quyền bổ sung',
  'class.read': 'Xem thông tin lớp học',
  'assessment.recovery.approve': 'Duyệt mở lại bài kiểm tra',
  'academic.schedule.approve': 'Phê duyệt điều chỉnh lịch dạy',
  'academic.admission.approve': 'Xét duyệt hồ sơ nhập học',
  'academic.meeting.approve': 'Phê duyệt liên kết phòng học trực tuyến',
  'academic.attendance.approve': 'Phê duyệt điều chỉnh điểm danh',
  'academic.program.approve': 'Phê duyệt chương trình học',
  'academic.rubric.approve': 'Phê duyệt tiêu chí chấm bài',
  'academic.grade.publish': 'Công bố điểm bài tập',
  'academic.quiz.approve': 'Phê duyệt đề kiểm tra lớp',
  'academic.quiz.grade.publish': 'Công bố điểm kiểm tra lớp',
  'consultation.profile.approve': 'Phê duyệt hồ sơ tư vấn viên / giảng viên',
  'consultation.link.approve': 'Duyệt liên kết tư vấn 1:1',
  'consultation.booking.review': 'Rà soát lịch đặt tư vấn 1:1',
  'finance.verify': 'Xác minh phiếu thu học phí',
  'finance.adjust.propose': 'Đề xuất điều chỉnh công nợ / hoàn phí',
  'finance.adjust.approve': 'Duyệt điều chỉnh công nợ / hoàn phí',
  'support.ticket.read': 'Đọc phiếu hỗ trợ theo chủ đề',
  'support.ticket.assign': 'Nhận / phân công phiếu hỗ trợ',
  'support.ticket.reply': 'Phản hồi phiếu hỗ trợ',
  'support.ticket.close': 'Cập nhật trạng thái / đóng phiếu',
  'support.ticket.transfer': 'Chuyển phiếu & báo sự cố kỹ thuật',
  'support.referral.respond': 'Phản hồi phối hợp chuyên môn',
  'support.taxonomy.author': 'Soạn danh mục chủ đề hỗ trợ',
  'support.taxonomy.approve': 'Phê duyệt danh mục chủ đề hỗ trợ',
  'inspection.assign': 'Phân công thanh tra giảng dạy',
  'inspection.hours.review': 'Xét duyệt giờ thanh tra',
  'shift.review': 'Xét duyệt điều chỉnh chấm công ca trực',
  'knowledge.author': 'Soạn học liệu & ma trận kỹ năng',
  'knowledge.review': 'Thẩm định học liệu & ma trận kỹ năng',
  'knowledge.publish': 'Ban hành học liệu & ma trận kỹ năng',
  'placement.source.author': 'Soạn ngân hàng đề đầu vào',
  'placement.source.approve': 'Phê duyệt ngân hàng đề đầu vào',
  'placement.rubric.author': 'Soạn tiêu chí chấm bài đầu vào',
  'placement.rubric.approve': 'Phê duyệt tiêu chí chấm bài đầu vào',
  'placement.grader.assign': 'Phân công chấm bài đầu vào',
  'placement.result.publish': 'Công bố kết quả kiểm tra đầu vào',
  'certificate.issue': 'Cấp phát chứng chỉ hoàn thành khóa học',
  'certificate.review': 'Thẩm định quy định & hồ sơ chứng chỉ',
};

const OBJECT_TYPE_LABELS: Record<string, string> = {
  USER: 'Tài khoản',
  GRANT: 'Quyền bổ sung',
  ROLE_DECISION: 'Quyết định vai trò',
  AUTHORITY: 'Phân quyền hệ thống',
  ACADEMIC: 'Lớp học & Buổi học',
  CLASS_OFFERING: 'Lớp học mở',
  SupportTicket: 'Phiếu hỗ trợ CSKH',
  PlacementAssignment: 'Phân công chấm bài đầu vào',
  PlacementAttempt: 'Bài kiểm tra đầu vào',
  SYSTEM_CONFIG: 'Cấu hình tích hợp',
  ROLE_REPORT: 'Báo cáo hoạt động',
  INSPECTION_ASSIGNMENT: 'Ca trực thanh tra',
  FINANCE: 'Giao dịch học phí',
  Enrollment: 'Hồ sơ ghi danh',
  Certificate: 'Chứng chỉ khóa học',
};

const ESCALATION_CATEGORY_LABELS: Record<string, string> = {
  LMS_SUBMISSION_ERROR: 'Lỗi nộp bài / tài nguyên LMS',
  ACCOUNT_ACCESS_ISSUE: 'Lỗi đăng nhập / khóa tài khoản',
  PAYMENT_SYNC_ERROR: 'Lỗi đồng bộ giao dịch học phí',
  MEETING_LINK_ERROR: 'Lỗi phòng học / lịch trực tuyến',
  OTHER_TECHNICAL: 'Sự cố kỹ thuật khác',
};

const ESCALATION_STATUS_LABELS: Record<string, { label: string; badgeClass: string }> = {
  OPEN: {
    label: 'Chờ tiếp nhận',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-900',
  },
  IN_REVIEW: {
    label: 'Đang kiểm tra',
    badgeClass: 'border-sky-200 bg-sky-50 text-sky-900',
  },
  RESOLVED: {
    label: 'Đã xử lý xong',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  RETURNED_TO_COUNSELOR: {
    label: 'Đã trả lại CSKH',
    badgeClass: 'border-slate-200 bg-slate-100 text-slate-700',
  },
};

const TICKET_STATE_LABELS: Record<string, string> = {
  NEW: 'Mới tiếp nhận',
  TRIAGED: 'Đã phân loại',
  IN_PROGRESS: 'Đang xử lý',
  WAITING_CUSTOMER: 'Chờ học viên',
  WAITING_SPECIALIST: 'Chờ chuyên môn / kỹ thuật',
  RESOLVED: 'Đã giải quyết',
  CLOSED: 'Đã đóng',
  REOPENED: 'Đã mở lại',
};

const CONFIG_SETTING_META: Record<string, { name: string; category: string }> = {
  EMAIL_PROVIDER: { name: 'Nhà cung cấp gửi thư (Email)', category: 'Khôi phục tài khoản & Email' },
  SMTP_CREDENTIALS: { name: 'Thông tin xác thực máy chủ thư', category: 'Khôi phục tài khoản & Email' },
  SEPAY_WEBHOOK_SECRET: { name: 'Khóa xác thực đối soát SePay', category: 'Thanh toán & Đối soát' },
  SEPAY_API_TOKEN: { name: 'Mã truy cập API SePay', category: 'Thanh toán & Đối soát' },
  REPORT_CENTER_TIME_ZONE: { name: 'Múi giờ chuẩn trung tâm', category: 'Báo cáo vận hành' },
  AI_EXTERNAL_PROVIDER: { name: 'Dịch vụ trí tuệ nhân tạo mở rộng', category: 'Đánh giá & Gợi ý học tập' },
};

const CONFIG_CONNECTION_LABELS: Record<string, string> = {
  VERIFIED_TIMEZONE: 'Đã xác minh (UTC+7)',
  CONNECTED: 'Đã kết nối',
  CONFIGURED_TEST_TRANSPORT: 'Cấu hình thử nghiệm',
  SAFE_NOOP_TRANSPORT: 'Chế độ an toàn (chưa mở gửi thật)',
  MASKED_CONFIGURED: 'Đã cấu hình & che bí mật',
  UNCONFIGURED: 'Chưa cấu hình',
  GUARDED_NON_LIVE: 'Khóa an toàn ngoài môi trường thật',
  RULE_BASED_FALLBACK_ACTIVE: 'Đang dùng bộ quy tắc nội bộ',
  GEMINI_ADVISORY_ACTIVE: 'Gemini AI đang hoạt động',
};

const READINESS_DOMAIN_LABELS: Record<string, string> = {
  W01_AUTHORITY: 'Phân hệ Tài khoản & Phân quyền',
  W02_W03_W04_W06_W07_W08: 'Phân hệ Học vụ · Lớp học · Tuyển sinh · Tài chính',
  W05B_CONSULTATION: 'Phân hệ Tư vấn & Đặt lịch 1:1',
  W09_CERTIFICATE: 'Phân hệ Chứng chỉ hoàn thành khóa học',
};

const READINESS_REASON_LABELS: Record<string, string> = {
  W10_CAPABILITY_SCOPE_AND_AUDIT_READER_REQUIRED:
    'Chưa bật phạm vi đọc nhật ký tự động ở cổng vận hành mở rộng',
  APPROVED_METRICS_AND_SCOPED_READERS_REQUIRED:
    'Chưa bật chỉ số tổng hợp liên phân hệ trực tiếp',
  REAL_CLOCK_ACCEPTANCE_DEFERRED:
    'Đang dùng đồng hồ chuẩn trung tâm trong phạm vi nội bộ',
  ISSUANCE_NOT_IMPLEMENTED: 'Chức năng phát hành chứng chỉ đang tắt trên môi trường hiện tại',
  NO_APPROVED_COMPLETION_POLICY_YET: 'Chưa có quy định hoàn thành khóa học được phê duyệt',
  W09_SCHEMA_UNAVAILABLE: 'Chưa khởi tạo dữ liệu phân hệ chứng chỉ',
};

export function formatCapabilityLabel(capability: string): string {
  return CAPABILITY_LABELS[capability] ?? capability;
}

export function formatObjectTypeLabel(objectType: string): string {
  return OBJECT_TYPE_LABELS[objectType] ?? objectType;
}

export function formatScopeLabel(
  scopeType: string,
  scopeId?: string | null,
  topicTitleMap?: Map<string, string>,
): string {
  const prefixMap: Record<string, string> = {
    GLOBAL: 'Toàn hệ thống',
    CLASS: 'Lớp học',
    COURSE: 'Khóa học',
    TEACHER: 'Giảng viên',
    SUPPORT_TOPIC: 'Chủ đề hỗ trợ',
  };
  const label = prefixMap[scopeType] ?? scopeType;
  if (!scopeId || scopeType === 'GLOBAL') return label;
  if (scopeType === 'SUPPORT_TOPIC' && topicTitleMap?.has(scopeId)) {
    return `${label}: ${topicTitleMap.get(scopeId)}`;
  }
  const shortId = scopeId.length > 14 ? `${scopeId.slice(0, 8)}…` : scopeId;
  return `${label} (${shortId})`;
}

export function formatEscalationCategory(category: string): string {
  return ESCALATION_CATEGORY_LABELS[category] ?? category;
}

export function formatEscalationStatus(status: string): { label: string; badgeClass: string } {
  return (
    ESCALATION_STATUS_LABELS[status] ?? {
      label: status,
      badgeClass: 'border-slate-200 bg-slate-100 text-slate-700',
    }
  );
}

export function formatTicketStateLabel(state: string): string {
  return TICKET_STATE_LABELS[state] ?? state;
}

export function formatConfigSettingMeta(code: string, fallbackCategory: string) {
  return CONFIG_SETTING_META[code] ?? { name: code, category: fallbackCategory };
}

export function formatConfigConnectionLabel(connectionState: string): string {
  return CONFIG_CONNECTION_LABELS[connectionState] ?? connectionState;
}

export function formatReadinessDomain(domain: string): string {
  return READINESS_DOMAIN_LABELS[domain] ?? domain;
}

export function formatReadinessReason(reason: string): string {
  if (READINESS_REASON_LABELS[reason]) return READINESS_REASON_LABELS[reason];
  const w01Match = /^W01_LIVE_(\d+)_USERS_(\d+)_GRANTS$/.exec(reason);
  if (w01Match) {
    return `${w01Match[1]} tài khoản đang hoạt động · ${w01Match[2]} quyền cấp phát còn hiệu lực`;
  }
  const w02Match = /^W02_W08_LIVE_(\d+)_CLASSES_(\d+)_ENROLLMENTS$/.exec(reason);
  if (w02Match) {
    return `${w02Match[1]} lớp đang mở/diễn ra · ${w02Match[2]} hồ sơ ghi danh đang học`;
  }
  const w05bMatch = /^W05B_LIVE_(\d+)_PROFILES_(\d+)_BOOKINGS$/.exec(reason);
  if (w05bMatch) {
    return `${w05bMatch[1]} hồ sơ cố vấn · ${w05bMatch[2]} lịch đặt tư vấn 1:1`;
  }
  const w09Match = /^W09_ACTIVE_POLICIES_(\d+)_CERTIFICATES_(\d+)$/.exec(reason);
  if (w09Match) {
    return `${w09Match[1]} quy định chứng chỉ đang hiệu lực · ${w09Match[2]} chứng chỉ đã phát hành`;
  }
  return reason;
}

export function isTestFixtureEmail(email?: string | null): boolean {
  return Boolean(email && email.toLowerCase().endsWith('@example.invalid'));
}

export function classifyConfigConnection(connectionState: string): ServiceHealthLevel {
  if (
    connectionState === 'VERIFIED_TIMEZONE' ||
    connectionState === 'CONNECTED' ||
    connectionState === 'MASKED_CONFIGURED' ||
    connectionState === 'GEMINI_ADVISORY_ACTIVE'
  ) {
    return 'OPERATIONAL';
  }
  if (connectionState === 'UNAVAILABLE' || connectionState === 'ERROR') {
    return 'UNREACHABLE';
  }
  return 'UNDETERMINED';
}

export function classifyReadinessSource(state: string): ServiceHealthLevel {
  if (state === 'AVAILABLE' || state === 'VERIFIED' || state === 'HEALTHY') {
    return 'OPERATIONAL';
  }
  if (state === 'UNAVAILABLE' || state === 'FAILED') {
    return 'UNREACHABLE';
  }
  return 'UNDETERMINED';
}

export function sanitizeAccountDisplayName(fullName?: string | null): string {
  if (!fullName) return 'Tài khoản hệ thống';
  if (isTechnicalQaRecord(fullName) || /synthetic|contender/i.test(fullName)) {
    return accountLabel(fullName);
  }
  return fullName;
}

export function redactSensitiveText(value?: string | null): string {
  if (!value) return 'Không có ghi chú bổ sung';
  return value
    .replace(
      /(password|passwd|secret|token|apikey|api_key|authorization|bearer)\s*[:=]\s*\S+/gi,
      '$1=***REDACTED***',
    )
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '***JWT_REDACTED***');
}

export function formatActionLabel(action: string): string {
  const map: Record<string, string> = {
    ACCOUNT_CREATE: 'Tạo tài khoản nhân sự',
    ACCOUNT_STATUS: 'Đổi trạng thái tài khoản',
    ROLE_REQUEST: 'Đề xuất đổi vai trò',
    ROLE_APPROVE: 'Phê duyệt vai trò',
    GRANT_REQUEST: 'Đề xuất cấp quyền',
    GRANT_APPROVE: 'Phê duyệt quyền',
    GRANT_REVOKE: 'Thu hồi quyền',
    RECOVERY_AUTHORITY_REVOKE: 'Thu hồi quyền mở lại bài',
    CONFIG_CHANGE_PROPOSED: 'Đề xuất đổi cấu hình',
    W02B_SESSIONS_APPROVE: 'Duyệt ban hành buổi học',
    W02B_SESSIONS_SUBMIT: 'Gửi duyệt lịch buổi học',
    W02B_SESSION_DRAFT_CREATE: 'Tạo nháp buổi học mới',
    W02A_PROGRAM_APPROVE: 'Phê duyệt chương trình học',
    W02A_COURSE_APPROVE: 'Phê duyệt khóa học',
    W03_ACTIVITY_PUBLISH: 'Công bố hoạt động lớp',
    W03_ACTIVITY_DRAFT: 'Lưu nháp hoạt động lớp',
    W03_ACTIVITY_HIDE: 'Ẩn hoạt động lớp',
    W03_SECTION_PUBLISH: 'Công bố chương học',
    W03_SECTION_SAVE: 'Lưu chương học',
    W10_ROLE_REPORT_CSV_EXPORT: 'Xuất CSV báo cáo vận hành',
    SUPPORT_TECHNICAL_ESCALATION_CREATED: 'Tiếp nhận sự cố kỹ thuật mới',
    SUPPORT_TECHNICAL_ESCALATION_IN_REVIEW: 'Đang kiểm tra sự cố kỹ thuật',
    SUPPORT_TECHNICAL_ESCALATION_RESOLVED: 'Hoàn tất xử lý sự cố kỹ thuật',
    SUPPORT_TECHNICAL_ESCALATION_RETURNED_TO_COUNSELOR: 'Chuyển lại CSKH kiểm tra thêm',
    PLACEMENT_GRADER_ASSIGN: 'Phân công người chấm bài đầu vào',
    PLACEMENT_SCORE: 'Chấm điểm bài kiểm tra đầu vào',
    PLACEMENT_RESULT_PUBLISH: 'Công bố kết quả kiểm tra đầu vào',
    CERTIFICATE_ISSUE: 'Cấp phát chứng chỉ hoàn thành khóa học',
    CERTIFICATE_POLICY_APPROVE: 'Phê duyệt quy định chứng chỉ',
    INSPECTION_ASSIGN: 'Phân công ca thanh tra',
    INSPECTION_HOUR_REVIEW: 'Xét duyệt giờ thanh tra',
  };
  return map[action] ?? action.replace(/^W\d+[A-Z]?_/, '').replace(/_/g, ' ');
}

export function formatVnDateTime(value?: string | null): string {
  if (!value) return 'Chưa có mốc thời gian';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Thời gian không hợp lệ';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
}
