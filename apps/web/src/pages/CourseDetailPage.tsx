import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, CalendarDays, ChevronRight } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { catalogApi } from '@/features/catalog/api';
import type { PublicClassOffering, PublicCourse } from '@/features/catalog/types';
import { ApiError } from '@/lib/api-client';

type State =
  | { slug: string; status: 'loading' }
  | { slug: string; status: 'ready'; course: PublicCourse }
  | { slug: string; status: 'not-found' | 'error' };
const date = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short' });
const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });

export function CourseDetailPage() {
  const { slug = '' } = useParams();
  const [state, setState] = useState<State>({ slug: '', status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void catalogApi
      .detail(slug, controller.signal)
      .then((course) => setState({ slug, status: 'ready', course }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({
          slug,
          status: error instanceof ApiError && error.status === 404 ? 'not-found' : 'error',
        });
      });
    return () => controller.abort();
  }, [slug, reloadKey]);
  if (state.slug !== slug || state.status === 'loading')
    return (
      <div className="section-shell" role="status">
        <div className="h-80 animate-pulse rounded-3xl bg-slate-200" />
      </div>
    );
  if (state.status === 'not-found')
    return (
      <Message
        title="Không tìm thấy khóa học"
        text="Course chưa được công bố hoặc đường dẫn không chính xác."
      />
    );
  if (state.status === 'error')
    return (
      <section className="section-shell">
        <div className="state-error" role="alert">
          Không thể tải thông tin Course.
          <button
            className="ml-3 font-semibold underline"
            onClick={() => setReloadKey((value) => value + 1)}
            type="button"
          >
            Thử lại
          </button>
        </div>
      </section>
    );
  if (state.status !== 'ready') return null;
  const { course } = state;
  return (
    <article>
      <section className="bg-indigo-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <Link
            className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-200"
            to="/catalog"
          >
            <ArrowLeft size={16} />
            Danh mục khóa học
          </Link>
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
            <div>
              <div className="flex flex-wrap gap-2 text-xs font-bold uppercase tracking-wide">
                <span className="rounded-full bg-white/10 px-3 py-1">{course.level}</span>
                <span className="rounded-full bg-white/10 px-3 py-1">{course.skillScope}</span>
              </div>
              <h1 className="mt-4 text-4xl font-bold sm:text-5xl">{course.title}</h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-indigo-100">
                {course.description}
              </p>
              <a className="btn-light mt-7" href="#open-classes">
                Xem lớp đang mở
              </a>
            </div>
            <div className="visual-sky grid min-h-52 place-items-center rounded-3xl">
              <BookOpen size={58} />
            </div>
          </div>
        </div>
      </section>
      <section className="section-shell">
        <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
          <div>
            <p className="eyebrow">Curriculum preview</p>
            <h2 className="section-title">Nội dung chương trình</h2>
            <div className="mt-7 space-y-4">
              {course.modules?.map((module) => (
                <article className="rounded-2xl border bg-white p-5" key={module.id}>
                  <h3 className="font-bold">
                    {module.orderIndex + 1}. {module.title}
                  </h3>
                  {module.description ? (
                    <p className="mt-2 text-sm text-slate-600">{module.description}</p>
                  ) : null}
                  <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                    {module.lessons.map((lesson) => (
                      <li className="flex items-start gap-2 text-sm text-slate-700" key={lesson.id}>
                        <ChevronRight className="mt-0.5 shrink-0 text-indigo-600" size={16} />
                        <span>
                          {lesson.title}{' '}
                          <span className="text-slate-400">· {lesson.resourceCount} tài liệu</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
          <aside className="rounded-2xl bg-slate-100 p-6">
            <h2 className="font-bold">Thông tin nhanh</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <Row label="Trình độ" value={course.level} />
              <Row label="Phạm vi kỹ năng" value={course.skillScope} />
              <Row label="Lớp đang mở" value={String(course.openOfferingCount)} />
              <Row label="Modules" value={String(course.modules?.length ?? 0)} />
            </dl>
          </aside>
        </div>
      </section>
      <section className="section-shell pt-0" id="open-classes">
        <p className="eyebrow">ClassOffering</p>
        <h2 className="section-title">So sánh lớp đang mở</h2>
        {course.classOfferings.length === 0 ? (
          <div className="state-empty mt-7">Hiện chưa có lớp nhận đăng ký cho Course này.</div>
        ) : (
          <div className="mt-7 overflow-x-auto rounded-2xl border bg-white">
            <table className="min-w-[1080px] w-full text-left text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  {[
                    'Mã lớp',
                    'Giảng viên',
                    'Lịch học',
                    'Hình thức',
                    'Khai giảng',
                    'Kết thúc',
                    'Học phí',
                    'Sĩ số',
                    'Trạng thái',
                    '',
                  ].map((heading) => (
                    <th className="px-4 py-3 font-semibold" key={heading}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {course.classOfferings.map((offering) => (
                  <OfferingRow key={offering.id} offering={offering} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </article>
  );
}

function OfferingRow({ offering }: { offering: PublicClassOffering }) {
  return (
    <tr>
      <td className="px-4 py-4 font-semibold">{offering.code}</td>
      <td className="px-4 py-4">{offering.instructor?.fullName ?? 'Đang cập nhật'}</td>
      <td className="px-4 py-4">
        <span className="inline-flex items-center gap-1">
          <CalendarDays size={15} />
          {formatSchedule(offering)}
        </span>
      </td>
      <td className="px-4 py-4">{offering.modality}</td>
      <td className="px-4 py-4">{formatDate(offering.classStart)}</td>
      <td className="px-4 py-4">{formatDate(offering.classEnd)}</td>
      <td className="px-4 py-4">
        {offering.pricingType === 'FREE'
          ? 'Miễn phí'
          : offering.tuitionFeeVnd
            ? money.format(offering.tuitionFeeVnd)
            : 'Đang cập nhật'}
      </td>
      <td className="px-4 py-4">
        {offering.registeredCount}/{offering.maxStudents ?? '∞'}
      </td>
      <td className="px-4 py-4">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${offering.isFull ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}
        >
          {offering.isFull ? 'Đã đầy' : 'Còn chỗ'}
        </span>
      </td>
      <td className="px-4 py-4">
        <Link className="font-semibold text-indigo-700" to={`/classes/${offering.id}`}>
          Xem chi tiết
        </Link>
      </td>
    </tr>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
function formatDate(value: string | null) {
  if (!value) return 'Đang cập nhật';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Đang cập nhật' : date.format(parsed);
}
function formatSchedule(offering: PublicClassOffering) {
  if (offering.scheduleSlots.length === 0) return 'Đang cập nhật';
  const days: Record<number, string> = {
    1: 'T2',
    2: 'T3',
    3: 'T4',
    4: 'T5',
    5: 'T6',
    6: 'T7',
    7: 'CN',
  };
  const first = offering.scheduleSlots[0];
  return `${offering.scheduleSlots.map((slot) => days[slot.dayOfWeek] ?? `Ngày ${slot.dayOfWeek}`).join('/')} ${new Date(first.startTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}`;
}
function Message({ title, text }: { title: string; text: string }) {
  return (
    <section className="section-shell text-center">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="mt-3 text-slate-600">{text}</p>
      <Link className="btn-primary mt-6" to="/catalog">
        Về danh mục
      </Link>
    </section>
  );
}
