import { apiFetch } from '@/lib/api-client';
export type Practice = { prompt: string; options: string[]; answer: number; feedback: string };
export type Draft = {
  kind: 'ARTICLE' | 'TAG';
  slug: string;
  tagCode?: string;
  title: string;
  objectives: string[];
  bodyMarkdown: string;
  examples: { english: string; explanation: string }[];
  practice: Practice[];
  rights: { kind: 'ORIGINAL' | 'LICENSED'; owner: string; license: string; proof: string };
  references: { title: string; url: string }[];
  skills: string[];
  part?: number;
  synonyms: string[];
  tagRevisionIds: string[];
  expectedLockVersion: number;
  expectedPreviousVersion: number;
};
export type Tag = {
  revisionId: string;
  entryId: string;
  code: string;
  name: string;
  version: number;
  skills: string[];
  part: number;
  synonyms: string[];
};
export type Revision = {
  id: string;
  entryId: string;
  kind: 'ARTICLE' | 'TAG';
  slug: string;
  tagCode: string | null;
  number: number;
  state: string;
  lockVersion: number;
  entryLockVersion: number;
  latestNumber: number;
  visibility: string;
  currentPublished: boolean;
  reviewedAt: string | null;
  publishedAt: string | null;
  reviewReason: string;
  withdrawalReason: string;
  makerIds: string[];
  canReview?: boolean;
  canPublish?: boolean;
  payload: Draft;
  tags: Tag[];
};
export type Entry = {
  id: string;
  kind: 'ARTICLE' | 'TAG';
  slug: string;
  tagCode: string | null;
  visibility: string;
  lockVersion: number;
  latestNumber: number;
  publishedRevisionId: string | null;
  revisions: Revision[];
};
export type KnowledgeLink = {
  id: string;
  state: string;
  lockVersion: number;
  classId: string;
  testQuestionId: string;
  prompt: string;
  quizTitle: string;
  quizVersion: number;
  tag: string;
  article: string;
  reason: string;
  canReview: boolean;
  canPublish: boolean;
};
export type Workspace = {
  capabilities: { author: boolean; review: boolean; publish: boolean };
  entries: Entry[];
  tags: Tag[];
  links: KnowledgeLink[];
};
export type Article = {
  revisionId: string;
  slug: string;
  title: string;
  version: number;
  objectives: string[];
  bodyMarkdown: string;
  examples: Draft['examples'];
  practice: { item: number; prompt: string; options: string[] }[];
  references: Draft['references'];
  tags: Tag[];
  publishedAt: string;
  attribution: string;
  selfCheckOnly: true;
};
export type Recommendation = {
  state: string;
  message: string;
  recommendations: {
    tag: string;
    code: string;
    correct: number;
    total: number;
    message: string;
    article: { slug: string; title: string; version: number; revisionId: string };
    source: string;
    notProficiency: true;
  }[];
};
export const knowledgeGet = <T>(p: string) => apiFetch<T>('/v2/knowledge/' + p);
export const knowledgeWrite = <T>(p: string, b: object, method = 'POST') =>
  apiFetch<T>('/v2/knowledge/' + p, { method, body: JSON.stringify(b) });
export function knowledgeReturnTo(value: string | null) {
  return value &&
    /^\/classroom\/[a-f0-9-]{36}(?:\/(?:gradebook|activities\/[a-f0-9-]{36}(?:\/quiz)?|quiz-attempts\/[a-f0-9-]{36}))?$/i.test(
      value,
    )
    ? value
    : '/knowledge';
}
export const knowledgeState: Record<string, string> = {
  DRAFT: 'Nháp học thuật',
  SUBMITTED: 'Chờ kiểm tra',
  REVIEWED: 'Đã duyệt, chưa công bố',
  PUBLISHED: 'Đã công bố phiên bản',
  REJECTED: 'Cần sửa theo nhận xét',
  WITHDRAWN: 'Đã thu hồi',
};
