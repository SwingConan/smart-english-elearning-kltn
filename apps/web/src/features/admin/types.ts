export interface AdminCourse {
  id: string;
  title: string;
  slug: string;
  description: string;
  level: string;
  thumbnailUrl: string | null;
  isPublished: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; fullName: string };
  _count?: { classOfferings: number };
}

export interface CourseInput {
  title: string;
  description?: string;
  level: string;
  thumbnailUrl?: string;
  isPublished: boolean;
}

export const OFFERING_STATUSES = [
  'DRAFT',
  'OPEN',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;

export type OfferingStatus = (typeof OFFERING_STATUSES)[number];
export type PricingType = 'FREE' | 'PAID';

export interface AdminClassOffering {
  id: string;
  courseId: string;
  instructorId: string | null;
  name: string;
  status: OfferingStatus;
  pricingType: PricingType;
  tuitionFeeVnd: number | null;
  maxStudents: number | null;
  enrollmentStart: string | null;
  enrollmentEnd: string | null;
  classStart: string | null;
  classEnd: string | null;
  createdAt: string;
  updatedAt: string;
  course: { id: string; title: string; slug: string };
  instructor: { id: string; fullName: string } | null;
}

export interface ClassOfferingInput {
  courseId: string;
  name: string;
  status: OfferingStatus;
  pricingType: PricingType;
  tuitionFeeVnd?: number | null;
  maxStudents?: number | null;
  enrollmentStart?: string | null;
  enrollmentEnd?: string | null;
  classStart?: string | null;
  classEnd?: string | null;
}
