import { Link } from 'react-router';
import type { PublicCourse } from './types';

export function CourseCard({ course }: { course: PublicCourse }) {
  const description =
    course.description.length > 160
      ? `${course.description.slice(0, 157)}...`
      : course.description;

  return (
    <article className="overflow-hidden rounded-xl border bg-white shadow-sm">
      {course.thumbnailUrl ? (
        <img
          alt={`Ảnh khóa học ${course.title}`}
          className="h-44 w-full object-cover"
          src={course.thumbnailUrl}
        />
      ) : null}
      <div className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {course.level}
        </p>
        <h2 className="mt-2 text-xl font-semibold">{course.title}</h2>
        {description ? <p className="mt-3 text-sm text-slate-600">{description}</p> : null}
        <Link
          className="mt-5 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm text-white"
          to={`/catalog/${course.slug}`}
        >
          Xem chi tiết
        </Link>
      </div>
    </article>
  );
}
