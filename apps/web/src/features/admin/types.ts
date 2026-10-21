export type CourseSkillScope =
  'LISTENING' | 'READING' | 'LR' | 'SPEAKING' | 'WRITING' | 'FOUR_SKILLS';
export const COURSE_SKILL_SCOPES: CourseSkillScope[] = [
  'LISTENING',
  'READING',
  'LR',
  'SPEAKING',
  'WRITING',
  'FOUR_SKILLS',
];

export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export interface AdminCourse {
  id: string;
  title: string;
  slug: string;
  description: string;
  level: string;
  skillScope: CourseSkillScope;
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
  skillScope: CourseSkillScope;
  thumbnailUrl?: string | null;
  isPublished: boolean;
}

export interface CourseQuery {
  search?: string;
  isPublished?: boolean;
  skillScope?: CourseSkillScope;
  level?: string;
  page?: number;
  limit?: number;
}

export const OFFERING_STATUSES = [
  'DRAFT',
  'OPEN',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;
export const CLASS_MODALITIES = ['ONLINE', 'OFFLINE', 'HYBRID'] as const;
export type OfferingStatus = (typeof OFFERING_STATUSES)[number];
export type ClassModality = (typeof CLASS_MODALITIES)[number];
export type PricingType = 'FREE' | 'PAID';
export type RegistrationState = 'AVAILABLE' | 'FULL' | 'UPCOMING' | 'CLOSED';
export type OperationalReadinessReason =
  | 'COURSE_UNPUBLISHED'
  | 'INSTRUCTOR_MISSING'
  | 'INSTRUCTOR_INACTIVE'
  | 'SCHEDULE_MISSING'
  | 'SCHEDULE_DESTINATION_MISSING'
  | 'CLASS_DATES_MISSING';
export type EnrollmentStatus = 'ACTIVE' | 'PENDING_PAYMENT' | 'COMPLETED' | 'DROPPED' | 'CANCELLED';

export interface AdminClassOffering {
  id: string;
  courseId: string;
  instructorId: string | null;
  code: string;
  name: string;
  status: OfferingStatus;
  modality: ClassModality;
  pricingType: PricingType;
  tuitionFeeVnd: number | null;
  maxStudents: number | null;
  totalSessions: number | null;
  totalPeriods: number | null;
  enrollmentStart: string | null;
  enrollmentEnd: string | null;
  classStart: string | null;
  classEnd: string | null;
  createdAt: string;
  updatedAt: string;
  course: { id: string; title: string; slug: string; isPublished?: boolean };
  instructor: {
    id: string;
    fullName: string;
    email: string;
    role: 'INSTRUCTOR';
    status: string;
  } | null;
  scheduleSlots: Array<{
    id: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    locationText: string | null;
    meetingUrl: string | null;
  }>;
  registeredCount: number;
  remainingSeats: number | null;
  isFull: boolean;
  registrationState: RegistrationState;
  operationalReadiness: {
    isReady: boolean;
    missing: OperationalReadinessReason[];
  };
}

export interface InstructorOption {
  id: string;
  fullName: string;
  email: string;
}

export interface ScheduleSlotInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  locationText?: string | null;
  meetingUrl?: string | null;
}

export interface AdminRosterRow {
  id: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  learner: { id: string; fullName: string; email: string };
}

export interface AdminRoster {
  classOffering: AdminClassOffering;
  summary: {
    total: number;
    active: number;
    pendingPayment: number;
    completed: number;
    droppedOrCancelled: number;
    maxStudents: number | null;
  };
  data: AdminRosterRow[];
  meta: PageMeta;
}

export interface RosterQuery {
  search?: string;
  status?: EnrollmentStatus;
  page?: number;
  limit?: number;
}

export interface ClassOfferingInput {
  courseId: string;
  code?: string;
  name: string;
  status?: OfferingStatus;
  modality: ClassModality;
  pricingType: PricingType;
  tuitionFeeVnd?: number | null;
  maxStudents?: number | null;
  totalSessions?: number | null;
  totalPeriods?: number | null;
  enrollmentStart?: string | null;
  enrollmentEnd?: string | null;
  classStart?: string | null;
  classEnd?: string | null;
}

export interface OfferingQuery {
  search?: string;
  courseId?: string;
  status?: OfferingStatus;
  modality?: ClassModality;
  pricingType?: PricingType;
  page?: number;
  limit?: number;
}

export interface StudyRecommendationPolicy {
  id: string;
  code: string;
  name: string;
  weakThreshold: number;
  strongThreshold: number;
  minimumTaskQuestions: number;
  maxRecommendations: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface StudyRecommendationPolicyInput {
  weakThreshold: number;
  strongThreshold: number;
  minimumTaskQuestions: number;
  maxRecommendations: number;
}

export const ACCOUNT_ROLES = ['STUDENT', 'INSTRUCTOR', 'ADMIN_COORDINATOR'] as const;
export const ACCOUNT_STATUSES = ['ACTIVE', 'INACTIVE', 'LOCKED'] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export interface AccountContext {
  operationalClassAssignments: number;
  totalClassAssignments: number;
  enrollmentCount: number;
}

export interface AdminAccount {
  id: string;
  email: string;
  fullName: string;
  role: AccountRole;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
  context: AccountContext;
}

export interface AdminAccountDirectory extends Paginated<AdminAccount> {
  summary: { total: number; active: number; inactive: number; locked: number };
}

export interface AccountQuery {
  search?: string;
  role?: AccountRole;
  status?: AccountStatus;
  page?: number;
  limit?: number;
}

export interface CreateStaffAccountInput {
  fullName: string;
  email: string;
  password: string;
  role: Extract<AccountRole, 'INSTRUCTOR' | 'ADMIN_COORDINATOR'>;
}
