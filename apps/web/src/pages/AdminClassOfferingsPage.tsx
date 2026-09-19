import { FormEvent, useEffect, useState } from 'react';
import { adminApi } from '@/features/admin/api';
import { adminErrorMessage } from '@/features/admin/errors';
import {
  buildOfferingInput,
  initialOfferingValues,
  type OfferingFormValues,
} from '@/features/admin/offering-form';
import {
  OFFERING_STATUSES,
  type AdminClassOffering,
  type AdminCourse,
} from '@/features/admin/types';

type OfferingsLoadState =
  | { key: number; status: 'loading' }
  | { key: number; status: 'success'; offerings: AdminClassOffering[]; courses: AdminCourse[] }
  | { key: number; status: 'error' };

export function AdminClassOfferingsPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [loadState, setLoadState] = useState<OfferingsLoadState>({ key: -1, status: 'loading' });
  const [editing, setEditing] = useState<AdminClassOffering | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      adminApi.offerings.list(controller.signal),
      adminApi.courses.list(controller.signal),
    ])
      .then(([offerings, courses]) => setLoadState({ key: reloadKey, status: 'success', offerings, courses }))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setLoadState({ key: reloadKey, status: 'error' });
        }
      });
    return () => controller.abort();
  }, [reloadKey]);

  const isCurrent = loadState.key === reloadKey;
  const data = isCurrent && loadState.status === 'success' ? loadState : null;
  const handleSaved = (mode: 'created' | 'updated') => {
    setEditing(null);
    setSuccess(mode === 'created' ? 'Đã tạo lớp học.' : 'Đã cập nhật lớp học.');
    setReloadKey((current) => current + 1);
  };

  return (
    <section>
      <h1 className="text-3xl font-bold">Quản lý lớp học</h1>
      <p className="mt-2 text-slate-600">Tạo lớp nháp và cập nhật trạng thái mở đăng ký.</p>
      {success ? <p className="mt-4 rounded-md bg-emerald-50 p-3 text-emerald-800" role="status">{success}</p> : null}

      {data ? (
        <OfferingForm
          courses={data.courses}
          key={editing?.id ?? 'create'}
          offering={editing}
          onCancel={editing ? () => setEditing(null) : undefined}
          onSaved={handleSaved}
        />
      ) : null}

      <section className="mt-10" aria-labelledby="offering-list-heading">
        <h2 className="text-2xl font-semibold" id="offering-list-heading">Danh sách lớp học</h2>
        {!isCurrent || loadState.status === 'loading' ? <p className="mt-4" role="status">Đang tải lớp học...</p> : null}
        {isCurrent && loadState.status === 'error' ? (
          <p className="mt-4 rounded-md bg-red-50 p-4 text-red-700" role="alert">Không thể tải dữ liệu quản trị. Vui lòng thử lại.</p>
        ) : null}
        {data?.offerings.length === 0 ? <p className="mt-4 rounded-md border bg-white p-5">Chưa có lớp học nào.</p> : null}
        {data && data.offerings.length > 0 ? (
          <div className="mt-5 space-y-4">
            {data.offerings.map((offering) => (
              <article className="rounded-xl border bg-white p-5" key={offering.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold">{offering.name}</h3>
                    <p className="mt-1 text-sm text-slate-600">{offering.course.title}</p>
                    <p className="mt-2 text-sm">{statusLabel(offering.status)} · {priceLabel(offering)}</p>
                    <p className="text-sm text-slate-500">Giảng viên: {offering.instructor?.fullName ?? 'Chưa phân công'}</p>
                  </div>
                  <button className="rounded-md border px-4 py-2" onClick={() => { setEditing(offering); setSuccess(null); }} type="button">Chỉnh sửa</button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </section>
  );
}

interface OfferingFormProps {
  offering: AdminClassOffering | null;
  courses: AdminCourse[];
  onCancel?: () => void;
  onSaved: (mode: 'created' | 'updated') => void;
}

function OfferingForm({ offering, courses, onCancel, onSaved }: OfferingFormProps) {
  const [values, setValues] = useState<OfferingFormValues>(() => initialOfferingValues(offering));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const update = <K extends keyof OfferingFormValues>(key: K, value: OfferingFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = buildOfferingInput(values, Boolean(offering));
    setErrors(result.errors);
    setApiError(null);
    if (!result.input) return;

    setIsSubmitting(true);
    try {
      if (offering) {
        await adminApi.offerings.update(offering.id, result.input);
        onSaved('updated');
      } else {
        await adminApi.offerings.create(result.input);
        onSaved('created');
        setValues(initialOfferingValues(null));
      }
    } catch (error: unknown) {
      setApiError(adminErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="mt-6 rounded-xl border bg-white p-5" onSubmit={(event) => void submit(event)}>
      <h2 className="text-xl font-semibold">{offering ? 'Chỉnh sửa lớp học' : 'Tạo lớp học'}</h2>
      {offering ? <p className="mt-1 text-sm text-slate-500">Giảng viên: {offering.instructor?.fullName ?? 'Chưa phân công'} (chỉ đọc)</p> : <p className="mt-1 text-sm text-slate-500">Lớp mới sẽ chưa được phân công giảng viên.</p>}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <FormField label="Khóa học" error={errors.courseId}>
          <select className="mt-1 w-full rounded-md border px-3 py-2" onChange={(event) => update('courseId', event.target.value)} value={values.courseId}>
            <option value="">Chọn khóa học</option>
            {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
          </select>
        </FormField>
        <FormField label="Tên lớp" error={errors.name}>
          <input className="mt-1 w-full rounded-md border px-3 py-2" onChange={(event) => update('name', event.target.value)} value={values.name} />
        </FormField>
        <FormField label="Trạng thái">
          <select className="mt-1 w-full rounded-md border px-3 py-2" onChange={(event) => update('status', event.target.value as OfferingFormValues['status'])} value={values.status}>
            {OFFERING_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
          </select>
        </FormField>
        <FormField label="Loại học phí">
          <select className="mt-1 w-full rounded-md border px-3 py-2" onChange={(event) => update('pricingType', event.target.value as OfferingFormValues['pricingType'])} value={values.pricingType}>
            <option value="FREE">Miễn phí</option><option value="PAID">Có phí</option>
          </select>
        </FormField>
        {values.pricingType === 'PAID' ? (
          <FormField label="Học phí (VND)" error={errors.tuitionFeeVnd}>
            <input className="mt-1 w-full rounded-md border px-3 py-2" min="1" onChange={(event) => update('tuitionFeeVnd', event.target.value)} step="1" type="number" value={values.tuitionFeeVnd} />
          </FormField>
        ) : null}
        <FormField label="Sĩ số tối đa" error={errors.maxStudents}>
          <input className="mt-1 w-full rounded-md border px-3 py-2" min="1" onChange={(event) => update('maxStudents', event.target.value)} step="1" type="number" value={values.maxStudents} />
        </FormField>
        <DateField error={errors.enrollmentStart} label="Mở đăng ký" onChange={(value) => update('enrollmentStart', value)} value={values.enrollmentStart} />
        <DateField error={errors.enrollmentEnd} label="Đóng đăng ký" onChange={(value) => update('enrollmentEnd', value)} value={values.enrollmentEnd} />
        <DateField error={errors.classStart} label="Bắt đầu lớp" onChange={(value) => update('classStart', value)} value={values.classStart} />
        <DateField error={errors.classEnd} label="Kết thúc lớp" onChange={(value) => update('classEnd', value)} value={values.classEnd} />
      </div>
      {apiError ? <p className="mt-4 text-sm text-red-700" role="alert">{apiError}</p> : null}
      <div className="mt-5 flex gap-3">
        <button className="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-50" disabled={isSubmitting || courses.length === 0} type="submit">{isSubmitting ? 'Đang lưu...' : offering ? 'Lưu thay đổi' : 'Tạo lớp học'}</button>
        {onCancel ? <button className="rounded-md border px-4 py-2" disabled={isSubmitting} onClick={onCancel} type="button">Hủy chỉnh sửa</button> : null}
      </div>
      {courses.length === 0 ? <p className="mt-3 text-sm text-amber-700">Cần tạo khóa học trước khi tạo lớp.</p> : null}
    </form>
  );
}

function FormField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <label><span className="text-sm font-medium">{label}</span>{children}{error ? <span className="mt-1 block text-sm text-red-700">{error}</span> : null}</label>;
}

function DateField({ label, error, value, onChange }: { label: string; error?: string; value: string; onChange: (value: string) => void }) {
  return <FormField error={error} label={label}><input className="mt-1 w-full rounded-md border px-3 py-2" onChange={(event) => onChange(event.target.value)} type="datetime-local" value={value} /></FormField>;
}

function statusLabel(status: AdminClassOffering['status']): string {
  return ({ DRAFT: 'Bản nháp', OPEN: 'Đang mở', IN_PROGRESS: 'Đang học', COMPLETED: 'Hoàn thành', CANCELLED: 'Đã hủy' })[status];
}

function priceLabel(offering: AdminClassOffering): string {
  if (offering.pricingType === 'FREE') return 'Miễn phí';
  return offering.tuitionFeeVnd === null
    ? 'Chưa có học phí'
    : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(offering.tuitionFeeVnd);
}
