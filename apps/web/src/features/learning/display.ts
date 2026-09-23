import type { LessonProgressStatus, ResourceType } from './types';

export function progressStatusLabel(status: LessonProgressStatus): string {
  switch (status) {
    case 'COMPLETED': return 'Hoàn thành';
    case 'IN_PROGRESS': return 'Đang học';
    case 'NOT_STARTED': return 'Chưa bắt đầu';
  }
}

export function progressStatusIcon(status: LessonProgressStatus): string {
  switch (status) {
    case 'COMPLETED': return '✓';
    case 'IN_PROGRESS': return '●';
    case 'NOT_STARTED': return '○';
  }
}

export function progressStatusColor(status: LessonProgressStatus): string {
  switch (status) {
    case 'COMPLETED': return 'text-green-600';
    case 'IN_PROGRESS': return 'text-blue-600';
    case 'NOT_STARTED': return 'text-gray-400';
  }
}

export function resourceTypeLabel(type: ResourceType): string {
  switch (type) {
    case 'VIDEO': return 'Video';
    case 'DOCUMENT': return 'Tài liệu';
    case 'LINK': return 'Liên kết';
  }
}

export function resourceTypeIcon(type: ResourceType): string {
  switch (type) {
    case 'VIDEO': return '🎬';
    case 'DOCUMENT': return '📄';
    case 'LINK': return '🔗';
  }
}

const percentageFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function masteryPercentage(probability: number): string {
  return percentageFormatter.format(probability);
}

export function masteryTimestamp(value: string | null): string {
  if (!value) return 'Chưa có observation';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Chưa cập nhật' : dateTimeFormatter.format(date);
}
