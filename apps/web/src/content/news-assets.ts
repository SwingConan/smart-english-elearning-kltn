import enrollmentCover from '@/assets/editorial/enrollment-opening.webp';
import experienceCover from '@/assets/editorial/learning-experience-update.webp';
import workshopCover from '@/assets/editorial/listening-workshop.webp';
import guidanceCover from '@/assets/editorial/study-path-guidance.webp';
import type { NewsEventItem } from './news-events';

const covers: Record<NewsEventItem['type'], string> = {
  KHAI_GIANG: enrollmentCover,
  WORKSHOP: workshopCover,
  HUONG_DAN: guidanceCover,
  CHUONG_TRINH: experienceCover,
};

export function newsCoverUrl(item: Pick<NewsEventItem, 'type'>) {
  return covers[item.type];
}
