import fourSkillsCover from '@/assets/courses/course-four-skills.webp';
import listeningCover from '@/assets/courses/course-listening.webp';
import lrCover from '@/assets/courses/course-lr.webp';
import readingCover from '@/assets/courses/course-reading.webp';
import speakingCover from '@/assets/courses/course-speaking.webp';
import writingCover from '@/assets/courses/course-writing.webp';
import type { PublicCourse } from './types';

const courseCovers: Record<PublicCourse['skillScope'], string> = {
  LISTENING: listeningCover,
  READING: readingCover,
  WRITING: writingCover,
  SPEAKING: speakingCover,
  LR: lrCover,
  FOUR_SKILLS: fourSkillsCover,
};

export function courseCoverUrl(course: Pick<PublicCourse, 'thumbnailUrl' | 'skillScope'> & { title?: string }) {
  if (course.thumbnailUrl) return course.thumbnailUrl;
  if (typeof window !== 'undefined' && document.documentElement.dataset.demoEnvironment === 'true') {
    const skill = /reading|đọc hiểu|ngữ pháp/i.test(course.title ?? '') ? 'reading' : /listening|phản xạ nghe/i.test(course.title ?? '') ? 'listening' : ({LISTENING:'listening',READING:'reading',SPEAKING:'speaking',WRITING:'writing',LR:'lr',FOUR_SKILLS:'four-skills'}[course.skillScope]);
    return '/images/course-'+skill+'.svg';
  }
  return courseCovers[course.skillScope];
}
