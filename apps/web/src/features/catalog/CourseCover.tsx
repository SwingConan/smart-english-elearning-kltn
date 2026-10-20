import type { PublicCourse } from './types';
import { courseCoverUrl } from './course-assets';

export function CourseCover({
  skillScope,
  thumbnailUrl = null,
  className = '',
  alt = '',
  loading = 'lazy',
}: {
  skillScope: PublicCourse['skillScope'];
  thumbnailUrl?: string | null;
  className?: string;
  alt?: string;
  loading?: 'eager' | 'lazy';
}) {
  return (
    <img
      alt={alt}
      className={`block object-cover ${className}`}
      decoding="async"
      loading={loading}
      src={courseCoverUrl({ skillScope, thumbnailUrl })}
    />
  );
}
