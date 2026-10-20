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
  enrollmentStart: string;
  enrollmentEnd: string;
  classStart: string;
  classEnd: string;
}

export interface OfferingFormResult {
  errors: Record<string, string>;
  input?: ClassOfferingInput;
}

export function initialOfferingValues(offering: AdminClassOffering | null): OfferingFormValues {
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
    enrollmentStart: toLocalDateTime(offering?.enrollmentStart),
    enrollmentEnd: toLocalDateTime(offering?.enrollmentEnd),
    classStart: toLocalDateTime(offering?.classStart),
    classEnd: toLocalDateTime(offering?.classEnd),
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

  const enrollmentStart = parseDate(values.enrollmentStart, 'enrollmentStart', errors);
  const enrollmentEnd = parseDate(values.enrollmentEnd, 'enrollmentEnd', errors);
  const classStart = parseDate(values.classStart, 'classStart', errors);
  const classEnd = parseDate(values.classEnd, 'classEnd', errors);

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
      ...optionalDate('enrollmentStart', enrollmentStart, values.enrollmentStart, isEdit),
      ...optionalDate('enrollmentEnd', enrollmentEnd, values.enrollmentEnd, isEdit),
      ...optionalDate('classStart', classStart, values.classStart, isEdit),
      ...optionalDate('classEnd', classEnd, values.classEnd, isEdit),
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

function parseDate(value: string, field: string, errors: Record<string, string>): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    errors[field] = 'Ngày giờ không hợp lệ.';
    return null;
  }
  return date;
}

function optionalDate(
  key: 'enrollmentStart' | 'enrollmentEnd' | 'classStart' | 'classEnd',
  date: Date | null,
  rawValue: string,
  isEdit: boolean,
): Partial<ClassOfferingInput> {
  if (date) return { [key]: date.toISOString() };
  return !rawValue && isEdit ? { [key]: null } : {};
}

function toLocalDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
