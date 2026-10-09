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

export function courseCoverUrl(course: Pick<PublicCourse, 'thumbnailUrl' | 'skillScope'>) {
  return course.thumbnailUrl || courseCovers[course.skillScope];
}
