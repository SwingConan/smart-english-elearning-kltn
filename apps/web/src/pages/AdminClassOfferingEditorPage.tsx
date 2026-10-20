import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { adminApi } from '@/features/admin/api';
import { adminErrorMessage } from '@/features/admin/errors';
import {
  buildOfferingInput,
  initialOfferingValues,
  type OfferingFormValues,
} from '@/features/admin/offering-form';
import { modalityLabel, statusLabel } from '@/features/admin/labels';
import { useAdminSessionExpiry } from '@/features/admin/use-admin-session-expiry';
import {
  CLASS_MODALITIES,
  OFFERING_STATUSES,
  type AdminClassOffering,
  type AdminCourse,
} from '@/features/admin/types';

const controlClass =
  'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200';

export function AdminClassOfferingEditorPage() {
  const { classOfferingId } = useParams();
  const editing = Boolean(classOfferingId);
  const navigate = useNavigate();
  const redirectExpiredSession = useAdminSessionExpiry();
  const [offering, setOffering] = useState<AdminClassOffering | null>(null);
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [values, setValues] = useState(() => initialOfferingValues(null));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const detail = classOfferingId
      ? adminApi.offerings.get(classOfferingId, controller.signal)
      : Promise.resolve(null);
    void Promise.all([detail, adminApi.courses.list({ page: 1, limit: 50 }, controller.signal)])
      .then(([item, coursePage]) => {
        setOffering(item);
        setValues(initialOfferingValues(item));
        setCourses(coursePage.data);
        setLoading(false);
      })
      .catch(async (error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (await redirectExpiredSession(error)) return;
        setLoading(false);
        setLoadError(true);
      });
    return () => controller.abort();
  }, [classOfferingId, redirectExpiredSession, reloadKey]);

  const update = <K extends keyof OfferingFormValues>(key: K, value: OfferingFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));
  const retry = () => {
    setLoading(true);
    setLoadError(false);
    setReloadKey((value) => value + 1);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = buildOfferingInput(values, editing);
    setErrors(result.errors);
    setApiError(null);
    if (!result.input) return;
    setSaving(true);
    try {
      if (classOfferingId) await adminApi.offerings.update(classOfferingId, result.input);
      else await adminApi.offerings.create(result.input);
      navigate('/admin/class-offerings', {
        state: { message: classOfferingId ? 'Đã cập nhật lớp học.' : 'Đã tạo lớp học.' },
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
        Đang tải lớp học...
      </p>
    );
  if (loadError)
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6" role="alert">
        <p className="font-semibold text-red-800">Không thể tải dữ liệu lớp học.</p>
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
        to="/admin/class-offerings"
      >
        <ArrowLeft size={17} />
        Quay lại danh sách
      </Link>
      <div className="mt-4">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-indigo-600">
          Quản trị học vụ
        </p>
        <h1 className="mt-1 text-3xl font-black">
          {editing ? 'Chỉnh sửa lớp học' : 'Tạo lớp học'}
        </h1>
        <p className="mt-2 text-slate-600">
          Giảng viên: {offering?.instructor?.fullName ?? 'Chưa phân công'}. Việc phân công giảng
          viên và thiết lập lịch học sẽ được thực hiện ở bước vận hành lớp.
        </p>
      </div>
      {courses.length === 0 ? (
        <p
          className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800"
          role="status"
        >
          Cần tạo khóa học trước khi tạo lớp.
        </p>
      ) : null}
      <form
        className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
        onSubmit={(event) => void submit(event)}
        noValidate
      >
        <div className="grid gap-5 md:grid-cols-2">
          <Field error={errors.courseId} id="offering-course" label="Khóa học">
            <select
              aria-describedby={errors.courseId ? 'offering-course-error' : undefined}
              aria-invalid={Boolean(errors.courseId)}
              className={controlClass}
              id="offering-course"
              onChange={(event) => update('courseId', event.target.value)}
              value={values.courseId}
            >
              <option value="">Chọn khóa học</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </Field>
          <Field error={errors.name} id="offering-name" label="Tên lớp">
            <input
              aria-describedby={errors.name ? 'offering-name-error' : undefined}
              aria-invalid={Boolean(errors.name)}
              className={controlClass}
              id="offering-name"
              maxLength={300}
              onChange={(event) => update('name', event.target.value)}
              value={values.name}
            />
          </Field>
          <Field error={errors.code} id="offering-code" label="Mã lớp">
            <input
              aria-describedby={errors.code ? 'offering-code-error' : undefined}
              aria-invalid={Boolean(errors.code)}
              className={controlClass}
              id="offering-code"
              maxLength={100}
              onChange={(event) => update('code', event.target.value)}
              value={values.code}
            />
          </Field>
          <Field id="offering-status" label="Trạng thái">
            <select
              className={controlClass}
              id="offering-status"
              onChange={(event) =>
                update('status', event.target.value as OfferingFormValues['status'])
              }
              value={values.status}
            >
              {OFFERING_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </Field>
          <Field id="offering-modality" label="Hình thức">
            <select
              className={controlClass}
              id="offering-modality"
              onChange={(event) =>
                update('modality', event.target.value as OfferingFormValues['modality'])
              }
              value={values.modality}
            >
              {CLASS_MODALITIES.map((value) => (
                <option key={value} value={value}>
                  {modalityLabel(value)}
                </option>
              ))}
            </select>
          </Field>
          <Field id="offering-pricing" label="Loại học phí">
            <select
              className={controlClass}
              id="offering-pricing"
              onChange={(event) =>
                update('pricingType', event.target.value as OfferingFormValues['pricingType'])
              }
              value={values.pricingType}
            >
              <option value="FREE">Miễn phí</option>
              <option value="PAID">Có phí</option>
            </select>
          </Field>
          {values.pricingType === 'PAID' ? (
            <NumberField
              error={errors.tuitionFeeVnd}
              id="offering-fee"
              label="Học phí (VND)"
              onChange={(value) => update('tuitionFeeVnd', value)}
              value={values.tuitionFeeVnd}
            />
          ) : null}
          <NumberField
            error={errors.maxStudents}
            id="offering-capacity"
            label="Sĩ số tối đa"
            onChange={(value) => update('maxStudents', value)}
            value={values.maxStudents}
          />
          <NumberField
            error={errors.totalSessions}
            id="offering-sessions"
            label="Tổng số buổi"
            onChange={(value) => update('totalSessions', value)}
            value={values.totalSessions}
          />
          <NumberField
            error={errors.totalPeriods}
            id="offering-periods"
            label="Tổng số tiết"
            onChange={(value) => update('totalPeriods', value)}
            value={values.totalPeriods}
          />
        </div>
        <section
          className="mt-6 border-t border-slate-200 pt-5"
          aria-labelledby="enrollment-time-heading"
        >
          <h2 className="text-sm font-semibold text-slate-800" id="enrollment-time-heading">
            Thời gian đăng ký
          </h2>
          <div className="mt-3 grid gap-5 md:grid-cols-2">
            <DateField
              error={errors.enrollmentStart}
              id="enrollment-start"
              label="Mở đăng ký"
              onChange={(value) => update('enrollmentStart', value)}
              value={values.enrollmentStart}
            />
            <DateField
              error={errors.enrollmentEnd}
              id="enrollment-end"
              label="Đóng đăng ký"
              onChange={(value) => update('enrollmentEnd', value)}
              value={values.enrollmentEnd}
            />
          </div>
        </section>
        <section
          className="mt-6 border-t border-slate-200 pt-5"
          aria-labelledby="class-time-heading"
        >
          <h2 className="text-sm font-semibold text-slate-800" id="class-time-heading">
            Thời gian lớp học
          </h2>
          <div className="mt-3 grid gap-5 md:grid-cols-2">
            <DateField
              error={errors.classStart}
              id="class-start"
              label="Bắt đầu lớp"
              onChange={(value) => update('classStart', value)}
              value={values.classStart}
            />
            <DateField
              error={errors.classEnd}
              id="class-end"
              label="Kết thúc lớp"
              onChange={(value) => update('classEnd', value)}
              value={values.classEnd}
            />
          </div>
        </section>
        {apiError ? (
          <p className="mt-5 rounded-xl bg-red-50 p-3 text-red-800" role="alert">
            {apiError}
          </p>
        ) : null}
        <div className="mt-6 flex gap-3">
          <button
            className="rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50"
            disabled={saving || courses.length === 0}
            type="submit"
          >
            {saving ? 'Đang lưu...' : editing ? 'Lưu thay đổi' : 'Tạo lớp học'}
          </button>
          <Link
            className="rounded-xl border border-slate-300 px-5 py-2.5 font-semibold"
            to="/admin/class-offerings"
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
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
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
function NumberField({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field error={error} id={id} label={label}>
      <input
        aria-describedby={error ? `${id}-error` : undefined}
        aria-invalid={Boolean(error)}
        className={controlClass}
        id={id}
        min="1"
        onChange={(event) => onChange(event.target.value)}
        step="1"
        type="number"
        value={value}
      />
    </Field>
  );
}
function DateField({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field error={error} id={id} label={label}>
      <input
        aria-describedby={error ? `${id}-error` : undefined}
        aria-invalid={Boolean(error)}
        className={controlClass}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        type="datetime-local"
        value={value}
      />
    </Field>
  );
}
