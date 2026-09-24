import type {
  AdaptiveLessonCategory,
  AdaptiveLessonReason,
  AdaptiveMasteryState,
  AdaptiveMasteryBand,
  AdaptivePolicySource,
  AdaptivePrerequisiteStatus,
} from './types';

const percentFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

export function adaptivePercentage(probability: number): string {
  if (!Number.isFinite(probability)) return 'Không xác định';
  return percentFormatter.format(probability);
}

export function masteryBandLabel(band: AdaptiveMasteryBand): string {
  switch (band) {
    case 'UNASSESSED':
      return 'UNASSESSED — Chưa đánh giá';
    case 'REMEDIAL':
      return 'REMEDIAL — Cần học lại nền tảng';
    case 'REINFORCEMENT':
      return 'REINFORCEMENT — Cần củng cố';
    case 'PROGRESSION_READY':
      return 'PROGRESSION_READY — Sẵn sàng tiến tiếp';
    default:
      return 'Không xác định';
  }
}

export function prerequisiteStatusLabel(status: AdaptivePrerequisiteStatus): string {
  switch (status) {
    case 'READY':
      return 'READY — Đủ điều kiện';
    case 'BLOCKED':
      return 'BLOCKED — Chưa đủ điều kiện';
    default:
      return 'Không xác định';
  }
}

export function categoryLabel(category: AdaptiveLessonCategory): string {
  switch (category) {
    case 'REMEDIAL':
      return 'REMEDIAL — Ôn lại nền tảng';
    case 'REINFORCEMENT':
      return 'REINFORCEMENT — Củng cố';
    case 'PROGRESSION':
      return 'PROGRESSION — Học nội dung tiếp theo';
    default:
      return 'Không xác định';
  }
}

export function masteryStateLabel(state: AdaptiveMasteryState): string {
  switch (state) {
    case 'PRIOR':
      return 'PRIOR — Chưa có quan sát đánh giá';
    case 'OBSERVED':
      return 'OBSERVED — Đã có quan sát đánh giá';
    default:
      return 'Không xác định';
  }
}

export function policySourceLabel(source: AdaptivePolicySource): string {
  switch (source) {
    case 'DEFAULT':
      return 'Using default policy';
    case 'SAVED':
      return 'Course-specific policy';
    default:
      return 'Policy source không xác định';
  }
}

export function instructorPolicySourceLabel(source: AdaptivePolicySource): string {
  switch (source) {
    case 'DEFAULT':
      return 'Chính sách mặc định';
    case 'SAVED':
      return 'Chính sách riêng của khóa học';
    default:
      return 'Nguồn chính sách chưa xác định';
  }
}

export function adaptiveTimestamp(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export function adaptiveReasonText(reason: AdaptiveLessonReason): string {
  const mastery = adaptivePercentage(reason.masteryProbability);
  const threshold = reason.threshold === null ? null : adaptivePercentage(reason.threshold);

  switch (reason.reasonCode) {
    case 'REMEDIAL_LOW_MASTERY':
      return threshold
        ? `Khả năng làm chủ ${reason.focusSkillName} hiện khoảng ${mastery}, dưới ngưỡng cần ôn lại ${threshold}.`
        : `Khả năng làm chủ ${reason.focusSkillName} hiện khoảng ${mastery}; nội dung nền tảng đang cần được ưu tiên.`;
    case 'REINFORCEMENT_BUILDING':
      return threshold
        ? `Khả năng làm chủ ${reason.focusSkillName} hiện khoảng ${mastery}. Hãy củng cố trước khi đạt ngưỡng tiến tiếp ${threshold}.`
        : `Khả năng làm chủ ${reason.focusSkillName} hiện khoảng ${mastery} và đang cần được củng cố.`;
    case 'PROGRESSION_PREREQUISITES_READY':
      return `Các điều kiện tiên quyết đã đạt. Bạn có thể bắt đầu nội dung mới về ${reason.focusSkillName}.`;
    case 'LOCKED_PREREQUISITE': {
      const prerequisites = reason.unsatisfiedPrerequisites.map(({ name }) => name).join(', ');
      return prerequisites
        ? `Bạn cần đạt điều kiện ở ${prerequisites} trước khi nội dung về ${reason.focusSkillName} được ưu tiên trong lộ trình.`
        : `Các điều kiện tiên quyết cho ${reason.focusSkillName} chưa đạt nên nội dung này chưa được ưu tiên trong lộ trình.`;
    }
    default:
      return 'Thông tin lý do đề xuất hiện chưa khả dụng.';
  }
}
