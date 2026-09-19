export type PricingType = 'FREE' | 'PAID';

export interface PublicInstructor {
  id: string;
  fullName: string;
}

export interface PublicClassOffering {
  id: string;
  name: string;
  status: 'OPEN';
  pricingType: PricingType;
  tuitionFeeVnd: number | null;
  maxStudents: number | null;
  enrollmentStart: string | null;
  enrollmentEnd: string | null;
  classStart: string | null;
  classEnd: string | null;
  instructor: PublicInstructor | null;
}

export interface PublicCourse {
  id: string;
  title: string;
  slug: string;
  description: string;
  level: string;
  thumbnailUrl: string | null;
  isPublished: boolean;
  classOfferings: PublicClassOffering[];
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
  page: number;
  limit: number;
}
