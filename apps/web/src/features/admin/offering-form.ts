import type { AdminClassOffering, ClassOfferingInput, OfferingStatus, PricingType } from './types';

export interface OfferingFormValues {
  courseId: string;
  code: string;
  name: string;
  status: OfferingStatus;
  modality: AdminClassOffering['modality'];
  pricingType: PricingType;
  tuitionFeeVnd: string;
  maxStudents: string;
  totalSessions: string;
  totalPeriods: string;
  enrollmentStartDate: string;
  enrollmentStartTime: string;
  enrollmentEndDate: string;
  enrollmentEndTime: string;
  classStartDate: string;
  classStartTime: string;
  classEndDate: string;
  classEndTime: string;
}

export interface OfferingFormResult {
  errors: Record<string, string>;
  input?: ClassOfferingInput;
}

export function initialOfferingValues(offering: AdminClassOffering | null): OfferingFormValues {
  const enrollmentStart = toLocalDateTimeParts(offering?.enrollmentStart);
  const enrollmentEnd = toLocalDateTimeParts(offering?.enrollmentEnd);
  const classStart = toLocalDateTimeParts(offering?.classStart);
  const classEnd = toLocalDateTimeParts(offering?.classEnd);
  return {
    courseId: offering?.courseId ?? '',
    code: offering?.code ?? '',
    name: offering?.name ?? '',
    status: offering?.status ?? 'DRAFT',
    modality: offering?.modality ?? 'ONLINE',
    pricingType: offering?.pricingType ?? 'FREE',
    tuitionFeeVnd: offering?.tuitionFeeVnd?.toString() ?? '',
    maxStudents: offering?.maxStudents?.toString() ?? '',
    totalSessions: offering?.totalSessions?.toString() ?? '',
    totalPeriods: offering?.totalPeriods?.toString() ?? '',
    enrollmentStartDate: enrollmentStart.date,
    enrollmentStartTime: enrollmentStart.time,
    enrollmentEndDate: enrollmentEnd.date,
    enrollmentEndTime: enrollmentEnd.time,
    classStartDate: classStart.date,
    classStartTime: classStart.time,
    classEndDate: classEnd.date,
    classEndTime: classEnd.time,
  };
}

export function buildOfferingInput(
  values: OfferingFormValues,
  isEdit: boolean,
): OfferingFormResult {
  const errors: Record<string, string> = {};
  if (!values.courseId) errors.courseId = 'Vui lòng chọn khóa học.';
  if (!values.name.trim()) errors.name = 'Vui lòng nhập tên lớp.';
  if (values.code.trim().length > 100) errors.code = 'Mã lớp không được vượt quá 100 ký tự.';

  let tuitionFeeVnd: number | undefined;
  if (values.pricingType === 'PAID') {
    tuitionFeeVnd = Number(values.tuitionFeeVnd);
    if (!Number.isInteger(tuitionFeeVnd) || tuitionFeeVnd <= 0) {
      errors.tuitionFeeVnd = 'Học phí phải là số nguyên dương.';
    }
  }

  let maxStudents: number | null | undefined;
  if (values.maxStudents) {
    maxStudents = Number(values.maxStudents);
    if (!Number.isInteger(maxStudents) || maxStudents <= 0) {
      errors.maxStudents = 'Sĩ số phải là số nguyên dương.';
    }
  } else if (isEdit) {
    maxStudents = null;
  }

  const totalSessions = optionalPositiveInteger(
    values.totalSessions,
    'totalSessions',
    errors,
    isEdit,
  );
  const totalPeriods = optionalPositiveInteger(values.totalPeriods, 'totalPeriods', errors, isEdit);

  const enrollmentStart = parseLocalDateTime(
    values.enrollmentStartDate,
    values.enrollmentStartTime,
    'enrollmentStart',
    errors,
  );
  const enrollmentEnd = parseLocalDateTime(
    values.enrollmentEndDate,
    values.enrollmentEndTime,
    'enrollmentEnd',
    errors,
  );
  const classStart = parseLocalDateTime(
    values.classStartDate,
    values.classStartTime,
    'classStart',
    errors,
  );
  const classEnd = parseLocalDateTime(values.classEndDate, values.classEndTime, 'classEnd', errors);

  if (enrollmentStart && enrollmentEnd && enrollmentStart > enrollmentEnd) {
    errors.enrollmentEnd = 'Ngày đóng đăng ký phải sau hoặc bằng ngày mở.';
  }
  if (classStart && classEnd && classStart >= classEnd) {
    errors.classEnd = 'Ngày kết thúc lớp phải sau ngày bắt đầu.';
  }
  if (Object.keys(errors).length > 0) return { errors };

  return {
    errors,
    input: {
      courseId: values.courseId,
      ...(values.code.trim() ? { code: values.code.trim() } : {}),
      name: values.name.trim(),
      status: values.status,
      modality: values.modality,
      pricingType: values.pricingType,
      tuitionFeeVnd: values.pricingType === 'FREE' ? 0 : tuitionFeeVnd,
      ...(maxStudents !== undefined ? { maxStudents } : {}),
      ...(totalSessions !== undefined ? { totalSessions } : {}),
      ...(totalPeriods !== undefined ? { totalPeriods } : {}),
      ...optionalDate(
        'enrollmentStart',
        enrollmentStart,
        values.enrollmentStartDate,
        values.enrollmentStartTime,
        isEdit,
      ),
      ...optionalDate(
        'enrollmentEnd',
        enrollmentEnd,
        values.enrollmentEndDate,
        values.enrollmentEndTime,
        isEdit,
      ),
      ...optionalDate(
        'classStart',
        classStart,
        values.classStartDate,
        values.classStartTime,
        isEdit,
      ),
      ...optionalDate('classEnd', classEnd, values.classEndDate, values.classEndTime, isEdit),
    },
  };
}

function optionalPositiveInteger(
  value: string,
  field: 'totalSessions' | 'totalPeriods',
  errors: Record<string, string>,
  isEdit: boolean,
): number | null | undefined {
  if (!value) return isEdit ? null : undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    errors[field] = 'Vui lòng nhập số nguyên dương.';
  }
  return parsed;
}

function parseLocalDateTime(
  dateValue: string,
  timeValue: string,
  field: string,
  errors: Record<string, string>,
): Date | null {
  if (!dateValue && !timeValue) return null;
  if (!dateValue || !timeValue) {
    errors[field] = 'Vui lòng nhập cả ngày và giờ.';
    return null;
  }
  const date = new Date(`${dateValue}T${timeValue}`);
  if (Number.isNaN(date.getTime())) {
    errors[field] = 'Ngày và giờ không hợp lệ.';
    return null;
  }
  return date;
}

function optionalDate(
  key: 'enrollmentStart' | 'enrollmentEnd' | 'classStart' | 'classEnd',
  date: Date | null,
  dateValue: string,
  timeValue: string,
  isEdit: boolean,
): Partial<ClassOfferingInput> {
  if (date) return { [key]: date.toISOString() };
  return !dateValue && !timeValue && isEdit ? { [key]: null } : {};
}

function toLocalDateTimeParts(value: string | null | undefined): { date: string; time: string } {
  if (!value) return { date: '', time: '' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: '', time: '' };
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return {
    date: `${year}-${month}-${day}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
