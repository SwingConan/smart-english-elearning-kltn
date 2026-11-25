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
  reservedUntil?: string | null;
  seatReleasedAt?: string | null;
  releaseReason?: string | null;
  entrySource?: string | null;
  placementAttemptId?: string | null;
  receivable?: {
    id: string;
    receivableCode: string;
    amountVnd: number;
    paidAmountVnd: number;
    status: string;
    dueAt: string | null;
    paidAt: string | null;
    isTestHarness: boolean;
    receipt?: {
      id: string;
      receiptNumber: string;
      amountVnd: number;
      verificationMethod: string;
      isTestHarness: boolean;
      issuedAt: string;
    } | null;
  } | null;
  activeOrder?: {
    id: string;
    paymentCode: string;
    expectedAmountVnd: number;
    currency: string;
    bankCode: string | null;
    accountNumber: string | null;
    accountName: string | null;
    qrUrl: string | null;
    status: string;
    expiresAt: string;
    remainingSeconds: number;
    isTestHarness: boolean;
  } | null;
  latestOrder?: {
    id: string;
    paymentCode: string;
    expectedAmountVnd: number;
    status: string;
    expiresAt: string;
    remainingSeconds: number;
  } | null;
}
