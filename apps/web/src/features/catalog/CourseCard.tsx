import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { courseCoverUrl } from './course-assets';
import { courseLevelLabel, skillScopeLabel } from './display';
import type { PublicCourse } from './types';

export function CourseCard({ course }: { course: PublicCourse }) {
  const description =
    course.description.length > 160 ? `${course.description.slice(0, 157)}...` : course.description;
  const availableOfferings = course.classOfferings.filter(
    (o) => o.registrationState === 'AVAILABLE' && !o.isFull,
  );
  const fullOfferings = course.classOfferings.filter((o) => o.isFull || o.registrationState === 'FULL');
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
      <img
        alt={`Không gian học cho khóa ${course.title}`}
        className="aspect-[16/10] w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        decoding="async"
        src={courseCoverUrl(course)}
      />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide">
          <span className="rounded-full bg-[#f4f8f1] px-2.5 py-1 text-[#3f642c]">
            {courseLevelLabel(course.level)}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
            {skillScopeLabel(course.skillScope)}
          </span>
          {course.openOfferingCount > 0 ? (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
              {availableOfferings.length > 0
                ? `${availableOfferings.length} lớp còn chỗ`
                : fullOfferings.length > 0
                  ? 'Lớp đã đủ sĩ số'
                  : `${course.openOfferingCount} lớp thông tin`}
            </span>
          ) : (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">
              Sắp mở lịch khai giảng mới
            </span>
          )}
        </div>
        <h2 className="mt-3 text-xl font-bold text-slate-900">{course.title}</h2>
        {description ? (
          <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
        ) : null}
        <div className="mt-4 rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700">
          {course.openOfferingCount > 0 ? (
            <p className="font-medium">
              Đang có {course.openOfferingCount} lớp để xem thông tin lịch học & học phí
              {availableOfferings[0]?.remainingSeats != null
                ? ` · Còn ${availableOfferings[0].remainingSeats} chỗ trống`
                : ''}
            </p>
          ) : (
            <p className="font-medium text-slate-600">
              Đang cập nhật lịch khai giảng đợt kế tiếp · Xem khung chương trình & nhận tư vấn xếp lớp
            </p>
          )}
        </div>
        <div className="mt-auto pt-5">
          <Link
            className="inline-flex items-center gap-2 rounded-lg bg-[#203627] px-4 py-2.5 text-sm font-semibold text-white transition group-hover:bg-[#5f8b48]"
            to={`/catalog/${course.slug}`}
          >
            Xem khóa học <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </article>
  );
}
