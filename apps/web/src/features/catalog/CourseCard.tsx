import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { courseCoverUrl } from './course-assets';
import { courseLevelLabel, skillScopeLabel } from './display';
import type { PublicCourse } from './types';

export function CourseCard({ course }: { course: PublicCourse }) {
  const description =
    course.description.length > 160 ? `${course.description.slice(0, 157)}...` : course.description;
  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
      <img
        alt={`Không gian học cho khóa ${course.title}`}
        className="aspect-[16/10] w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        decoding="async"
        loading="lazy"
        src={courseCoverUrl(course)}
      />
      <div className="p-5">
        <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide">
          <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-700">
            {courseLevelLabel(course.level)}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
            {skillScopeLabel(course.skillScope)}
          </span>
        </div>
        <h2 className="mt-3 text-xl font-bold">{course.title}</h2>
        {description ? (
          <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
        ) : null}
        <p className="mt-4 text-sm font-medium text-slate-500">
          {course.openOfferingCount} lớp đang mở
        </p>
        <Link
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white group-hover:bg-indigo-700"
          to={`/catalog/${course.slug}`}
        >
          Xem khóa học <ArrowRight size={16} />
        </Link>
      </div>
    </article>
  );
}
