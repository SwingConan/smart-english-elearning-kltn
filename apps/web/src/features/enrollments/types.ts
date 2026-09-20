export type EnrollmentStatus =
  | 'ACTIVE'
  | 'PENDING_PAYMENT'
  | 'COMPLETED'
  | 'DROPPED'
  | 'CANCELLED';

export type ClassOfferingStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type PricingType = 'FREE' | 'PAID';

export interface EnrollmentView {
  id: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  classOffering: {
    id: string;
    name: string;
    status: ClassOfferingStatus;
    pricingType: PricingType;
    tuitionFeeVnd: number | null;
    course: {
      id: string;
      title: string;
      slug: string;
      level: string;
    };
  };
}
