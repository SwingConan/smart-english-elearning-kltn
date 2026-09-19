import { FormEvent, useEffect, useState } from 'react';
import { adminApi } from '@/features/admin/api';
import { adminErrorMessage } from '@/features/admin/errors';
import type { AdminCourse, CourseInput } from '@/features/admin/types';

type CoursesLoadState =
  | { key: number; status: 'loading' }
  | { key: number; status: 'success'; courses: AdminCourse[] }
  | { key: number; status: 'error' };

export function AdminCoursesPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [loadState, setLoadState] = useState<CoursesLoadState>({ key: -1, status: 'loading' });
  const [editing, setEditing] = useState<AdminCourse | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void adminApi.courses.list(controller.signal)
      .then((courses) => setLoadState({ key: reloadKey, status: 'success', courses }))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setLoadState({ key: reloadKey, status: 'error' });
        }
      });
    return () => controller.abort();
  }, [reloadKey]);

  const isCurrent = loadState.key === reloadKey;
  const courses = isCurrent && loadState.status === 'success' ? loadState.courses : null;
  const handleSaved = (mode: 'created' | 'updated') => {
    setEditing(null);
    setSuccess(mode === 'created' ? 'Đã tạo khóa học.' : 'Đã cập nhật khóa học.');
    setReloadKey((current) => current + 1);
  };

  return (
    <section>
      <h1 className="text-3xl font-bold">Quản lý khóa học</h1>
      <p className="mt-2 text-slate-600">Tạo, chỉnh sửa và xuất bản khóa học.</p>
      {success ? <p className="mt-4 rounded-md bg-emerald-50 p-3 text-emerald-800" role="status">{success}</p> : null}

      <CourseForm
        course={editing}
        key={editing?.id ?? 'create'}
        onCancel={editing ? () => setEditing(null) : undefined}
        onSaved={handleSaved}
      />

      <section className="mt-10" aria-labelledby="course-list-heading">
        <h2 className="text-2xl font-semibold" id="course-list-heading">Danh sách khóa học</h2>
        {!isCurrent || loadState.status === 'loading' ? <p className="mt-4" role="status">Đang tải khóa học...</p> : null}
        {isCurrent && loadState.status === 'error' ? (
          <p className="mt-4 rounded-md bg-red-50 p-4 text-red-700" role="alert">Không thể tải danh sách khóa học. Vui lòng thử lại.</p>
        ) : null}
        {courses?.length === 0 ? <p className="mt-4 rounded-md border bg-white p-5">Chưa có khóa học nào.</p> : null}
        {courses && courses.length > 0 ? (
          <div className="mt-5 space-y-4">
            {courses.map((course) => (
              <article className="rounded-xl border bg-white p-5" key={course.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold">{course.title}</h3>
                    <p className="mt-1 text-sm text-slate-500">/{course.slug} · {course.level}</p>
                    <p className="mt-2 text-sm">{course.isPublished ? 'Đã xuất bản' : 'Bản nháp'}</p>
                    {course._count ? <p className="text-sm text-slate-500">{course._count.classOfferings} lớp học</p> : null}
                  </div>
                  <button className="rounded-md border px-4 py-2" onClick={() => { setEditing(course); setSuccess(null); }} type="button">
                    Chỉnh sửa
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </section>
  );
}

interface CourseFormProps {
  course: AdminCourse | null;
  onCancel?: () => void;
  onSaved: (mode: 'created' | 'updated') => void;
}

function CourseForm({ course, onCancel, onSaved }: CourseFormProps) {
  const [title, setTitle] = useState(course?.title ?? '');
  const [description, setDescription] = useState(course?.description ?? '');
  const [level, setLevel] = useState(course?.level ?? '');
  const [thumbnailUrl, setThumbnailUrl] = useState(course?.thumbnailUrl ?? '');
  const [isPublished, setIsPublished] = useState(course?.isPublished ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!title.trim()) nextErrors.title = 'Vui lòng nhập tên khóa học.';
    if (!level.trim()) nextErrors.level = 'Vui lòng nhập trình độ.';
    if (thumbnailUrl.trim() && !isValidUrl(thumbnailUrl.trim())) {
      nextErrors.thumbnailUrl = 'URL ảnh không hợp lệ.';
    }
    setErrors(nextErrors);
    setApiError(null);
    if (Object.keys(nextErrors).length > 0) return;

    const input: CourseInput = {
      title: title.trim(),
      ...(description.trim() || course ? { description: description.trim() } : {}),
      level: level.trim(),
      ...(thumbnailUrl.trim() ? { thumbnailUrl: thumbnailUrl.trim() } : {}),
      isPublished,
    };
    setIsSubmitting(true);
    try {
      if (course) {
        await adminApi.courses.update(course.id, input);
        onSaved('updated');
      } else {
        await adminApi.courses.create(input);
        onSaved('created');
        setTitle('');
        setDescription('');
        setLevel('');
        setThumbnailUrl('');
        setIsPublished(false);
      }
    } catch (error: unknown) {
      setApiError(adminErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="mt-6 rounded-xl border bg-white p-5" onSubmit={(event) => void submit(event)}>
      <h2 className="text-xl font-semibold">{course ? 'Chỉnh sửa khóa học' : 'Tạo khóa học'}</h2>
      {course ? <p className="mt-1 text-sm text-slate-500">Slug được backend quản lý: /{course.slug}</p> : null}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Tên khóa học" error={errors.title}>
          <input className="mt-1 w-full rounded-md border px-3 py-2" onChange={(event) => setTitle(event.target.value)} value={title} />
        </Field>
        <Field label="Trình độ" error={errors.level}>
          <input className="mt-1 w-full rounded-md border px-3 py-2" onChange={(event) => setLevel(event.target.value)} value={level} />
        </Field>
        <Field label="URL ảnh đại diện" error={errors.thumbnailUrl}>
          <input className="mt-1 w-full rounded-md border px-3 py-2" onChange={(event) => setThumbnailUrl(event.target.value)} type="url" value={thumbnailUrl} />
        </Field>
        <label className="flex items-center gap-2 self-end py-2">
          <input checked={isPublished} onChange={(event) => setIsPublished(event.target.checked)} type="checkbox" />
          Đã xuất bản
        </label>
      </div>
      <label className="mt-4 block">
        <span className="text-sm font-medium">Mô tả</span>
        <textarea className="mt-1 min-h-28 w-full rounded-md border px-3 py-2" onChange={(event) => setDescription(event.target.value)} value={description} />
      </label>
      {apiError ? <p className="mt-4 text-sm text-red-700" role="alert">{apiError}</p> : null}
      <div className="mt-5 flex gap-3">
        <button className="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-50" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Đang lưu...' : course ? 'Lưu thay đổi' : 'Tạo khóa học'}
        </button>
        {onCancel ? <button className="rounded-md border px-4 py-2" disabled={isSubmitting} onClick={onCancel} type="button">Hủy chỉnh sửa</button> : null}
      </div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <label><span className="text-sm font-medium">{label}</span>{children}{error ? <span className="mt-1 block text-sm text-red-700">{error}</span> : null}</label>;
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
