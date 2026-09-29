export type PricingType = 'FREE' | 'PAID';
export type CourseSkillScope =
  'LR' | 'FOUR_SKILLS' | 'LISTENING' | 'READING' | 'SPEAKING' | 'WRITING';
export type ClassModality = 'ONLINE' | 'OFFLINE' | 'HYBRID';

export interface ScheduleSlot {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  locationText: string | null;
  meetingUrl: string | null;
}

export interface PublicInstructor {
  id: string;
  fullName: string;
}

export interface PublicClassOffering {
  id: string;
  code: string;
  name: string;
  status: 'OPEN' | 'IN_PROGRESS';
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
  instructor: PublicInstructor | null;
  scheduleSlots: ScheduleSlot[];
  registeredCount: number;
  remainingSeats: number | null;
  isFull: boolean;
  registrationState: 'AVAILABLE' | 'FULL' | 'UPCOMING' | 'CLOSED';
}

export interface PublicLessonPreview {
  id: string;
  title: string;
  description: string | null;
  orderIndex: number;
  focusSkills: string[];
  resourceCount: number;
}

export interface PublicModulePreview {
  id: string;
  title: string;
  description: string | null;
  orderIndex: number;
  lessons: PublicLessonPreview[];
}

export interface PublicCourse {
  id: string;
  title: string;
  slug: string;
  description: string;
  level: string;
  skillScope: CourseSkillScope;
  thumbnailUrl: string | null;
  isPublished: boolean;
  classOfferings: PublicClassOffering[];
  openOfferingCount: number;
  modules?: PublicModulePreview[];
}

export interface CatalogMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CatalogResponse {
  data: PublicCourse[];
  meta: CatalogMeta;
}

export interface CatalogQuery {
  search?: string;
  level?: string;
  skillScope?: CourseSkillScope;
  availability?: 'OPEN';
  page: number;
  limit: number;
}
