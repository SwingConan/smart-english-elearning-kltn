import type {
  AdminClassOffering,
  ClassOfferingInput,
  OfferingStatus,
  PricingType,
} from './types';

export interface OfferingFormValues {
  courseId: string;
  name: string;
  status: OfferingStatus;
  pricingType: PricingType;
  tuitionFeeVnd: string;
  maxStudents: string;
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
    name: offering?.name ?? '',
    status: offering?.status ?? 'DRAFT',
    pricingType: offering?.pricingType ?? 'FREE',
    tuitionFeeVnd: offering?.tuitionFeeVnd?.toString() ?? '',
    maxStudents: offering?.maxStudents?.toString() ?? '',
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
      name: values.name.trim(),
      status: values.status,
      pricingType: values.pricingType,
      tuitionFeeVnd: values.pricingType === 'FREE' ? 0 : tuitionFeeVnd,
      ...(maxStudents !== undefined ? { maxStudents } : {}),
      ...optionalDate('enrollmentStart', enrollmentStart, values.enrollmentStart, isEdit),
      ...optionalDate('enrollmentEnd', enrollmentEnd, values.enrollmentEnd, isEdit),
      ...optionalDate('classStart', classStart, values.classStart, isEdit),
      ...optionalDate('classEnd', classEnd, values.classEnd, isEdit),
    },
  };
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
