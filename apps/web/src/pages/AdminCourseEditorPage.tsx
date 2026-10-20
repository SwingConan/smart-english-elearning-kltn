import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { adminApi } from '@/features/admin/api';
import { adminErrorMessage } from '@/features/admin/errors';
import { courseSkillScopeLabel } from '@/features/admin/labels';
import { useAdminSessionExpiry } from '@/features/admin/use-admin-session-expiry';
import {
  COURSE_SKILL_SCOPES,
  type AdminCourse,
  type CourseInput,
  type CourseSkillScope,
} from '@/features/admin/types';

const controlClass =
  'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-100';
type Values = {
  title: string;
  level: string;
  skillScope: CourseSkillScope;
  description: string;
  thumbnailUrl: string;
  isPublished: boolean;
};
const emptyValues: Values = {
  title: '',
  level: '',
  skillScope: 'LR',
  description: '',
  thumbnailUrl: '',
  isPublished: false,
};

export function AdminCourseEditorPage() {
  const { courseId } = useParams();
  const editing = Boolean(courseId);
  const navigate = useNavigate();
  const redirectExpiredSession = useAdminSessionExpiry();
  const [course, setCourse] = useState<AdminCourse | null>(null);
  const [values, setValues] = useState<Values>(emptyValues);
  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!courseId) return;
    const controller = new AbortController();
    void adminApi.courses
      .get(courseId, controller.signal)
      .then((item) => {
        setCourse(item);
        setValues({
          title: item.title,
          level: item.level,
          skillScope: item.skillScope,
          description: item.description,
          thumbnailUrl: item.thumbnailUrl ?? '',
          isPublished: item.isPublished,
        });
        setLoading(false);
      })
      .catch(async (error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (await redirectExpiredSession(error)) return;
        setLoading(false);
        setLoadError(true);
      });
    return () => controller.abort();
  }, [courseId, redirectExpiredSession, reloadKey]);

  const update = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((current) => ({ ...current, [key]: value }));
  const retry = () => {
    setLoading(true);
    setLoadError(false);
    setReloadKey((value) => value + 1);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!values.title.trim()) nextErrors.title = 'Vui lòng nhập tên khóa học.';
    if (!values.level.trim()) nextErrors.level = 'Vui lòng nhập trình độ.';
    if (values.thumbnailUrl.trim() && !isValidUrl(values.thumbnailUrl.trim()))
      nextErrors.thumbnailUrl = 'URL ảnh không hợp lệ.';
    setErrors(nextErrors);
    setApiError(null);
    if (Object.keys(nextErrors).length) return;
    const input: CourseInput = {
      title: values.title.trim(),
      level: values.level.trim(),
      skillScope: values.skillScope,
      description: values.description.trim(),
      ...(values.thumbnailUrl.trim()
        ? { thumbnailUrl: values.thumbnailUrl.trim() }
        : courseId
          ? { thumbnailUrl: null }
          : {}),
      isPublished: values.isPublished,
    };
    setSaving(true);
    try {
      if (courseId) await adminApi.courses.update(courseId, input);
      else await adminApi.courses.create(input);
      navigate('/admin/courses', {
        state: { message: courseId ? 'Đã cập nhật khóa học.' : 'Đã tạo khóa học.' },
      });
    } catch (error: unknown) {
      if (await redirectExpiredSession(error)) return;
      setApiError(adminErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <p className="rounded-2xl border bg-white p-8 text-center" role="status">
        Đang tải khóa học...
      </p>
    );
  if (loadError)
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6" role="alert">
        <p className="font-semibold text-red-800">Không thể tải thông tin khóa học.</p>
        <button
          className="mt-3 rounded-lg border border-red-300 px-3 py-2"
          onClick={retry}
          type="button"
        >
          Thử lại
        </button>
      </div>
    );

  return (
    <section>
      <Link
        className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700"
        to="/admin/courses"
      >
        <ArrowLeft size={17} />
        Quay lại danh sách
      </Link>
      <div className="mt-4">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-indigo-600">
          Quản trị học vụ
        </p>
        <h1 className="mt-1 text-3xl font-black">
          {editing ? 'Chỉnh sửa khóa học' : 'Tạo khóa học'}
        </h1>
        {course ? (
          <p className="mt-2 text-slate-600">
            Slug do hệ thống quản lý: /{course.slug} · {course._count?.classOfferings ?? 0} lớp học
          </p>
        ) : (
          <p className="mt-2 text-slate-600">Thiết lập nền tảng nội dung cho một khóa học TOEIC.</p>
        )}
      </div>
      <form
        className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
        onSubmit={(event) => void submit(event)}
        noValidate
      >
        <div className="grid gap-5 md:grid-cols-2">
          <Field error={errors.title} id="course-title" label="Tên khóa học">
            <input
              aria-describedby={errors.title ? 'course-title-error' : undefined}
              aria-invalid={Boolean(errors.title)}
              className={controlClass}
              id="course-title"
              maxLength={300}
              onChange={(event) => update('title', event.target.value)}
              value={values.title}
            />
          </Field>
          <Field error={errors.level} id="course-level" label="Trình độ">
            <input
              aria-describedby={errors.level ? 'course-level-error' : undefined}
              aria-invalid={Boolean(errors.level)}
              className={controlClass}
              id="course-level"
              maxLength={100}
              onChange={(event) => update('level', event.target.value)}
              value={values.level}
            />
          </Field>
          <Field id="course-skill" label="Phạm vi kỹ năng">
            <select
              className={controlClass}
              id="course-skill"
              onChange={(event) => update('skillScope', event.target.value as CourseSkillScope)}
              value={values.skillScope}
            >
              {COURSE_SKILL_SCOPES.map((scope) => (
                <option key={scope} value={scope}>
                  {courseSkillScopeLabel(scope)}
                </option>
              ))}
            </select>
          </Field>
          <Field error={errors.thumbnailUrl} id="course-thumbnail" label="URL ảnh đại diện">
            <input
              aria-describedby={errors.thumbnailUrl ? 'course-thumbnail-error' : undefined}
              aria-invalid={Boolean(errors.thumbnailUrl)}
              className={controlClass}
              id="course-thumbnail"
              onChange={(event) => update('thumbnailUrl', event.target.value)}
              type="url"
              value={values.thumbnailUrl}
            />
          </Field>
          <Field id="course-description" label="Mô tả" wide>
            <textarea
              className={`${controlClass} min-h-32`}
              id="course-description"
              maxLength={5000}
              onChange={(event) => update('description', event.target.value)}
              value={values.description}
            />
          </Field>
        </div>
        <label className="mt-5 flex items-center gap-3 rounded-xl bg-slate-50 p-4">
          <input
            checked={values.isPublished}
            onChange={(event) => update('isPublished', event.target.checked)}
            type="checkbox"
          />
          <span>
            <span className="block font-semibold">Xuất bản khóa học</span>
            <span className="text-sm text-slate-600">
              Khóa học xuất bản có thể xuất hiện trong danh mục công khai.
            </span>
          </span>
        </label>
        {apiError ? (
          <p className="mt-5 rounded-xl bg-red-50 p-3 text-red-800" role="alert">
            {apiError}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            className="rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50"
            disabled={saving}
            type="submit"
          >
            {saving ? 'Đang lưu...' : editing ? 'Lưu thay đổi' : 'Tạo khóa học'}
          </button>
          <Link
            aria-disabled={saving}
            className="rounded-xl border border-slate-300 px-5 py-2.5 font-semibold"
            to="/admin/courses"
          >
            Hủy
          </Link>
        </div>
      </form>
    </section>
  );
}

function Field({
  id,
  label,
  error,
  wide = false,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={wide ? 'md:col-span-2' : ''}>
      <label className="text-sm font-semibold" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-sm text-red-700" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
function isValidUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
