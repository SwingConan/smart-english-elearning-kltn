export type EnrollmentStatus = 'ACTIVE' | 'PENDING_PAYMENT' | 'COMPLETED' | 'DROPPED' | 'CANCELLED';

export type ClassOfferingStatus = 'DRAFT' | 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type PricingType = 'FREE' | 'PAID';

export interface EnrollmentView {
  id: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  classOffering: {
    id: string;
    code: string;
    name: string;
    status: ClassOfferingStatus;
    pricingType: PricingType;
    tuitionFeeVnd: number | null;
    modality: 'ONLINE' | 'OFFLINE' | 'HYBRID';
    classStart: string | null;
    classEnd: string | null;
    instructor: { id: string; fullName: string } | null;
    scheduleSlots: Array<{
      id: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      locationText: string | null;
    }>;
    course: {
      id: string;
      title: string;
      slug: string;
      level: string;
      skillScope: string;
      thumbnailUrl: string | null;
    };
  };
  progress: {
    totalLessons: number;
    completedLessons: number;
    progressPercent: number;
  };
}
