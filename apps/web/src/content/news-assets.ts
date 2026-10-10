import enrollmentCover from '@/assets/editorial/enrollment-opening.webp';
import resultsCover from '@/assets/editorial/four-skill-results.webp';
import experienceCover from '@/assets/editorial/learning-experience-update.webp';
import workshopCover from '@/assets/editorial/listening-workshop.webp';
import readingCover from '@/assets/editorial/reading-strategy.webp';
import speakingCover from '@/assets/editorial/speaking-practice.webp';
import guidanceCover from '@/assets/editorial/study-path-guidance.webp';
import writingCover from '@/assets/editorial/writing-purpose.webp';
import type { NewsCoverKey, NewsEventItem } from './news-events';

const covers: Record<NewsCoverKey, string> = {
  enrollment: enrollmentCover,
  listening: workshopCover,
  reading: readingCover,
  speaking: speakingCover,
  writing: writingCover,
  placement: guidanceCover,
  'study-rhythm': experienceCover,
  results: resultsCover,
};

export function newsCoverUrl(item: Pick<NewsEventItem, 'coverKey'>) {
  return covers[item.coverKey];
}
