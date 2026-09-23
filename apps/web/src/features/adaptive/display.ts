import type {
  AdaptiveLessonCategory,
  AdaptiveLessonReason,
  AdaptiveMasteryBand,
  AdaptivePrerequisiteStatus,
} from './types';

const percentFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

export function adaptivePercentage(probability: number): string {
  return percentFormatter.format(probability);
}

export function masteryBandLabel(band: AdaptiveMasteryBand): string {
  switch (band) {
    case 'UNASSESSED':
      return 'Chưa đánh giá';
    case 'REMEDIAL':
      return 'Cần học lại nền tảng';
    case 'REINFORCEMENT':
      return 'Cần củng cố';
    case 'PROGRESSION_READY':
      return 'Sẵn sàng tiến tiếp';
  }
}

export function prerequisiteStatusLabel(status: AdaptivePrerequisiteStatus): string {
  return status === 'READY' ? 'Đủ điều kiện' : 'Chưa đủ điều kiện';
}

export function categoryLabel(category: AdaptiveLessonCategory): string {
  switch (category) {
    case 'REMEDIAL':
      return 'Ôn lại nền tảng';
    case 'REINFORCEMENT':
      return 'Củng cố';
    case 'PROGRESSION':
      return 'Học nội dung tiếp theo';
  }
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
  }
}
