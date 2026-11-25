import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { ClassLmsService } from './class-lms.service';
import {
  normalizeAssessmentKind,
  normalizeReleaseMode,
  type AssessmentKind,
  type QuizReleaseMode,
} from './lms-unified-results.helpers';

export type Tx = Prisma.TransactionClient;
export type LocalActivityKind = 'LOCAL_QUIZ' | 'LOCAL_ATTENDANCE';

export interface QuizQuestionOptionInput {
  id?: string;
  text: string;
}

export interface QuizMediaItem {
  id: string;
  kind: 'IMAGE' | 'AUDIO';
  name: string;
  mimeType: string;
  bytes: number;
  url: string;
}

export interface QuizQuestionInput {
  id?: string;
  type: 'MCQ' | 'ESSAY';
  prompt: string;
  points?: number;
  options?: QuizQuestionOptionInput[];
  correctOptionId?: string | null;
  explanation?: string;
  groupId?: string | null;
  groupTitle?: string;
  media?: QuizMediaItem[];
}

export interface SaveLocalQuizPayload {
  title: string;
  introduction?: string;
  assessmentKind?: AssessmentKind;
  releaseMode?: QuizReleaseMode;
  openAt?: string | null;
  closeAt?: string | null;
  durationMinutes?: number;
  maxAttempts?: number;
  shuffleQuestions?: boolean;
  autoReleaseObjective?: boolean;
  passScore?: number;
  publish?: boolean;
  questions: QuizQuestionInput[];
}

export interface SaveLocalAttendancePayload {
  title: string;
  introduction?: string;
  sessionTitle?: string;
  sessionDateLabel?: string;
  checkInStartAt: string;
  checkInEndAt: string;
  lateAfterMinutes?: number;
  requireCode?: boolean;
  checkInCode?: string;
  publish?: boolean;
}

export interface QuizAnswerSubmission {
  questionId: string;
  selectedOptionId?: string | null;
  textAnswer?: string | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseOptionalDate(raw: string | null | undefined, label: string): Date | null {
  if (!raw || !String(raw).trim()) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${label} không đúng định dạng ngày giờ.`);
  }
  return parsed;
}

function parseRequiredDate(raw: string | null | undefined, label: string): Date {
  if (!raw || !String(raw).trim()) {
    throw new BadRequestException(`Vui lòng nhập ${label}.`);
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${label} không đúng định dạng ngày giờ.`);
  }
  return parsed;
}

/**
 * Ensures the additive local quiz & attendance Postgres tables exist idempotently.
 */
export async function ensureQuizAttendanceTables(db: PrismaService): Promise<void> {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS lms_local_activity_kinds (
      activity_id TEXT PRIMARY KEY,
      class_offering_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_lms_local_kinds_class
    ON lms_local_activity_kinds (class_offering_id);
  `);
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS lms_local_quiz_configs (
      activity_id TEXT PRIMARY KEY,
      duration_minutes INTEGER NOT NULL DEFAULT 15,
      max_attempts INTEGER NOT NULL DEFAULT 1,
      shuffle_questions BOOLEAN NOT NULL DEFAULT false,
      auto_release_objective BOOLEAN NOT NULL DEFAULT true,
      pass_score NUMERIC(6,2) NOT NULL DEFAULT 5,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS lms_local_quiz_questions (
      id TEXT PRIMARY KEY,
      activity_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      q_type TEXT NOT NULL,
      prompt TEXT NOT NULL,
      points NUMERIC(6,2) NOT NULL DEFAULT 1,
      options_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      correct_option_id TEXT,
      explanation TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_lms_local_quiz_q_act
    ON lms_local_quiz_questions (activity_id, order_index);
  `);
  await db.$executeRawUnsafe(`
    ALTER TABLE lms_local_quiz_questions
      ADD COLUMN IF NOT EXISTS group_id TEXT,
      ADD COLUMN IF NOT EXISTS group_title TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS media_json JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS lms_local_quiz_media_files (
      id TEXT PRIMARY KEY,
      class_offering_id TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      kind TEXT NOT NULL,
      original_file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_bytes INTEGER NOT NULL,
      uploaded_by_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_lms_local_quiz_media_class
    ON lms_local_quiz_media_files (class_offering_id);
  `);
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS lms_local_quiz_attempts (
      id TEXT PRIMARY KEY,
      activity_id TEXT NOT NULL,
      class_offering_id TEXT NOT NULL,
      learner_id TEXT NOT NULL,
      enrollment_id TEXT NOT NULL,
      attempt_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deadline_at TIMESTAMPTZ NOT NULL,
      submitted_at TIMESTAMPTZ,
      auto_score NUMERIC(6,2) NOT NULL DEFAULT 0,
      manual_score NUMERIC(6,2) NOT NULL DEFAULT 0,
      total_score NUMERIC(6,2) NOT NULL DEFAULT 0,
      max_score NUMERIC(6,2) NOT NULL DEFAULT 0,
      objective_max NUMERIC(6,2) NOT NULL DEFAULT 0,
      essay_max NUMERIC(6,2) NOT NULL DEFAULT 0,
      has_essay BOOLEAN NOT NULL DEFAULT false,
      grading_status TEXT NOT NULL DEFAULT 'AUTO_GRADED',
      answers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      manual_grades_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      teacher_feedback TEXT NOT NULL DEFAULT '',
      graded_by_id TEXT,
      graded_at TIMESTAMPTZ,
      UNIQUE (activity_id, learner_id, attempt_number)
    );
  `);
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_lms_local_quiz_att_act
    ON lms_local_quiz_attempts (activity_id, submitted_at DESC);
  `);
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS lms_local_attendance_configs (
      activity_id TEXT PRIMARY KEY,
      class_offering_id TEXT NOT NULL,
      session_id TEXT,
      session_title TEXT NOT NULL,
      session_date_label TEXT NOT NULL DEFAULT '',
      check_in_start_at TIMESTAMPTZ NOT NULL,
      check_in_end_at TIMESTAMPTZ NOT NULL,
      late_after_minutes INTEGER NOT NULL DEFAULT 15,
      require_code BOOLEAN NOT NULL DEFAULT false,
      check_in_code TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS lms_local_attendance_records (
      id TEXT PRIMARY KEY,
      activity_id TEXT NOT NULL,
      class_offering_id TEXT NOT NULL,
      enrollment_id TEXT NOT NULL,
      learner_id TEXT NOT NULL,
      status TEXT NOT NULL,
      checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      note TEXT NOT NULL DEFAULT '',
      UNIQUE (activity_id, learner_id)
    );
  `);
  await db.$executeRawUnsafe(`
    ALTER TABLE lms_local_quiz_configs
      ADD COLUMN IF NOT EXISTS assessment_kind TEXT NOT NULL DEFAULT 'QUIZ',
      ADD COLUMN IF NOT EXISTS release_mode TEXT NOT NULL DEFAULT 'AUTO_ON_SUBMIT';
  `);
  await db.$executeRawUnsafe(`
    ALTER TABLE lms_local_quiz_attempts
      ADD COLUMN IF NOT EXISTS grade_published BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS grade_published_at TIMESTAMPTZ;
  `);
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS lms_local_archived_content (
      entity_id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      class_offering_id TEXT NOT NULL,
      archived_by_id TEXT NOT NULL,
      archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_lms_local_archived_class
    ON lms_local_archived_content (class_offering_id);
  `);
}

/**
 * Shared helper that creates or updates a LESSON-backed Section activity while preserving
 * W03 Postgres content/revision guards and calendar synchronization (availableFrom/availableUntil).
 */
async function upsertSectionBackedActivity(
  tx: Tx,
  actorId: string,
  classId: string,
  sectionId: string | undefined,
  activityId: string | undefined,
  input: {
    title: string;
    introduction: string;
    contentMarkdown: string;
    availableFrom: Date | null;
    availableUntil: Date | null;
    publish?: boolean;
  },
) {
  const cleanTitle = input.title.trim();
  if (!cleanTitle) throw new BadRequestException('Tiêu đề hoạt động không được để trống.');
  const cleanIntro = input.introduction.trim();
  const cleanMarkdown = input.contentMarkdown.trim() || cleanIntro || cleanTitle;

  if (input.availableFrom && input.availableUntil && input.availableUntil <= input.availableFrom) {
    throw new BadRequestException('Thời gian đóng phải sau thời gian mở.');
  }

  let existing: {
    id: string;
    sectionId: string;
    state: 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
    revisionNumber: number;
    section: { id: string; publishedRevisionId: string | null };
  } | null = null;

  let targetSection: { id: string; publishedRevisionId: string | null } | null = null;

  if (activityId) {
    existing = await tx.classActivity.findFirst({
      where: { id: activityId, section: { classOfferingId: classId } },
      select: {
        id: true,
        sectionId: true,
        state: true,
        revisionNumber: true,
        section: { select: { id: true, publishedRevisionId: true } },
      },
    });
    if (!existing) throw new NotFoundException('Không tìm thấy hoạt động trong lớp học.');
    targetSection = existing.section;
  } else {
    if (!sectionId) throw new BadRequestException('Thiếu chủ đề (Section) đích.');
    targetSection = await tx.classSection.findFirst({
      where: { id: sectionId, classOfferingId: classId },
      select: { id: true, publishedRevisionId: true },
    });
    if (!targetSection) throw new NotFoundException('Không tìm thấy chủ đề trong lớp học.');
  }

  const shouldPublish =
    input.publish === true || (input.publish === undefined && existing?.state === 'PUBLISHED');

  if (shouldPublish && !targetSection.publishedRevisionId) {
    throw new BadRequestException(
      'Chủ đề chứa hoạt động này chưa được xuất bản. Hãy xuất bản chủ đề trước khi công bố cho học viên.',
    );
  }

  let saved;
  if (existing) {
    saved = await tx.classActivity.update({
      where: { id: existing.id },
      data: {
        title: cleanTitle,
        introduction: cleanIntro,
        contentMarkdown: cleanMarkdown,
        availableFrom: input.availableFrom,
        availableUntil: input.availableUntil,
        state: 'DRAFT',
        lockVersion: { increment: 1 },
        updatedById: actorId,
      },
    });
  } else {
    const inSec = await tx.classActivity.count({ where: { sectionId: targetSection.id } });
    if (inSec >= 200) throw new BadRequestException('Mỗi chủ đề tối đa 200 hoạt động.');
    const inClass = await tx.classActivity.count({
      where: { section: { classOfferingId: classId } },
    });
    if (inClass >= 500) throw new BadRequestException('Mỗi lớp tối đa 500 hoạt động.');
    const last = await tx.classActivity.aggregate({
      where: { sectionId: targetSection.id },
      _max: { orderIndex: true },
    });
    saved = await tx.classActivity.create({
      data: {
        sectionId: targetSection.id,
        type: 'LESSON',
        title: cleanTitle,
        introduction: cleanIntro,
        contentMarkdown: cleanMarkdown,
        availableFrom: input.availableFrom,
        availableUntil: input.availableUntil,
        orderIndex: (last._max.orderIndex ?? -1) + 1,
        state: 'DRAFT',
        createdById: actorId,
        updatedById: actorId,
      },
    });
  }

  if (shouldPublish) {
    const rev = await tx.classActivityRevision.create({
      data: {
        activityId: saved.id,
        quizTestId: null,
        classOfferingId: classId,
        number: saved.revisionNumber + 1,
        type: saved.type,
        title: saved.title,
        introduction: saved.introduction,
        contentMarkdown: saved.contentMarkdown,
        resourceUrl: saved.resourceUrl,
        storageKey: saved.storageKey,
        originalFileName: saved.originalFileName,
        mimeType: saved.mimeType,
        fileBytes: saved.fileBytes,
        fileSha256: saved.fileSha256,
        sourceLessonId: saved.sourceLessonId,
        sourceResourceId: saved.sourceResourceId,
        sourceUpdatedAt: saved.sourceUpdatedAt,
        availableFrom: saved.availableFrom,
        availableUntil: saved.availableUntil,
        publishedById: actorId,
      },
    });
    saved = await tx.classActivity.update({
      where: { id: saved.id },
      data: {
        state: 'PUBLISHED',
        publishedRevisionId: rev.id,
        revisionNumber: rev.number,
        lockVersion: { increment: 1 },
        updatedById: actorId,
      },
    });
  }

  return saved;
}

export async function getClassActivityKindsInTx(tx: Tx, classId: string) {
  const rows = (await tx.$queryRawUnsafe(
    `SELECT activity_id, kind, meta_json
       FROM lms_local_activity_kinds
      WHERE class_offering_id = $1`,
    classId,
  )) as Array<{ activity_id: string; kind: LocalActivityKind; meta_json: Record<string, any> }>;

  const kinds: Record<string, { kind: LocalActivityKind; meta: Record<string, any> }> = {};
  for (const r of rows) {
    kinds[r.activity_id] = {
      kind: r.kind,
      meta: r.meta_json && typeof r.meta_json === 'object' ? r.meta_json : {},
    };
  }
  return { kinds };
}

async function assertKindOrFail(
  tx: Tx,
  classId: string,
  activityId: string,
  expectedKind: LocalActivityKind,
  isStudent: boolean,
) {
  const rows = (await tx.$queryRawUnsafe(
    `SELECT kind FROM lms_local_activity_kinds WHERE activity_id = $1 AND class_offering_id = $2`,
    activityId,
    classId,
  )) as Array<{ kind: string }>;
  if (!rows[0] || rows[0].kind !== expectedKind) {
    throw new NotFoundException('Không tìm thấy hoạt động tương ứng trong lớp.');
  }

  const activity = await tx.classActivity.findFirst({
    where: {
      id: activityId,
      section: { classOfferingId: classId },
    },
    include: { section: { select: { id: true, title: true, publishedRevisionId: true } } },
  });
  if (!activity) throw new NotFoundException('Hoạt động không tồn tại.');
  if (isStudent && (activity.state !== 'PUBLISHED' || !activity.section.publishedRevisionId)) {
    throw new NotFoundException('Hoạt động chưa được công bố cho học viên.');
  }
  return activity;
}

async function resolveQuizMediaById(
  tx: Tx,
  classId: string,
  rawQuestions: QuizQuestionInput[],
): Promise<Map<string, QuizMediaItem>> {
  const mediaIds = Array.from(
    new Set(
      (Array.isArray(rawQuestions) ? rawQuestions : [])
        .flatMap((q) => (Array.isArray(q?.media) ? q.media : []))
        .map((m) => String(m?.id ?? '').trim())
        .filter(Boolean),
    ),
  );
  const map = new Map<string, QuizMediaItem>();
  if (mediaIds.length === 0) return map;

  const rows = (await tx.$queryRawUnsafe(
    `SELECT id, kind, original_file_name, mime_type, file_bytes
       FROM lms_local_quiz_media_files
      WHERE class_offering_id = $1 AND id = ANY($2::text[])`,
    classId,
    mediaIds,
  )) as any[];

  for (const r of rows) {
    const id = String(r.id);
    map.set(id, {
      id,
      kind: r.kind === 'AUDIO' ? 'AUDIO' : 'IMAGE',
      name: String(r.original_file_name ?? 'media'),
      mimeType: String(r.mime_type ?? 'application/octet-stream'),
      bytes: Number(r.file_bytes ?? 0),
      url: `/api/v2/lms-local/classes/${classId}/quiz-media/${id}`,
    });
  }

  for (const id of mediaIds) {
    if (!map.has(id)) {
      throw new BadRequestException(
        'Tệp hình ảnh hoặc âm thanh đính kèm không thuộc lớp học này hoặc không tồn tại.',
      );
    }
  }
  return map;
}

function normalizeQuestionMedia(
  rawMedia: unknown,
  mediaById: Map<string, QuizMediaItem>,
): QuizMediaItem[] {
  if (!Array.isArray(rawMedia) || rawMedia.length === 0) return [];
  const seen = new Set<string>();
  const out: QuizMediaItem[] = [];
  for (const item of rawMedia) {
    const id = String((item as any)?.id ?? '').trim();
    if (!id || seen.has(id)) continue;
    const verified = mediaById.get(id);
    if (!verified) continue;
    seen.add(id);
    out.push(verified);
    if (out.length >= 12) break;
  }
  return out;
}

function normalizeQuizQuestions(
  rawQuestions: QuizQuestionInput[],
  mediaById: Map<string, QuizMediaItem>,
) {
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    throw new BadRequestException('Quiz cần ít nhất 1 câu hỏi (trắc nghiệm hoặc tự luận).');
  }
  if (rawQuestions.length > 100) {
    throw new BadRequestException('Mỗi Quiz tối đa 100 câu hỏi.');
  }

  return rawQuestions.map((q, idx) => {
    const qType = q.type === 'ESSAY' ? 'ESSAY' : 'MCQ';
    const prompt = String(q.prompt ?? '').trim();
    if (!prompt) {
      throw new BadRequestException(`Câu hỏi số ${idx + 1} chưa nhập nội dung đề bài.`);
    }
    const points = round2(Number(q.points ?? 1));
    if (!Number.isFinite(points) || points <= 0 || points > 100) {
      throw new BadRequestException(`Điểm câu hỏi số ${idx + 1} phải lớn hơn 0 và tối đa 100.`);
    }
    const groupId = q.groupId && String(q.groupId).trim() ? String(q.groupId).trim().slice(0, 100) : null;
    const groupTitle = groupId ? String(q.groupTitle ?? '').trim().slice(0, 200) : '';
    const media = normalizeQuestionMedia(q.media, mediaById);

    if (qType === 'ESSAY') {
      return {
        id: q.id && q.id.trim() ? q.id.trim() : randomUUID(),
        orderIndex: idx,
        type: 'ESSAY' as const,
        prompt,
        points,
        options: [] as Array<{ id: string; text: string }>,
        correctOptionId: null as string | null,
        explanation: String(q.explanation ?? '').trim(),
        groupId,
        groupTitle,
        media,
      };
    }

    const rawOptions = Array.isArray(q.options) ? q.options : [];
    const options = rawOptions
      .map((o) => ({
        id: o.id && String(o.id).trim() ? String(o.id).trim() : randomUUID(),
        text: String(o.text ?? '').trim(),
      }))
      .filter((o) => o.text.length > 0);

    if (options.length < 2 || options.length > 6) {
      throw new BadRequestException(`Câu trắc nghiệm số ${idx + 1} cần từ 2 đến 6 phương án.`);
    }

    const correctId = String(q.correctOptionId ?? '').trim();
    if (!options.some((o) => o.id === correctId)) {
      throw new BadRequestException(`Câu trắc nghiệm số ${idx + 1} chưa chọn đáp án đúng.`);
    }

    return {
      id: q.id && q.id.trim() ? q.id.trim() : randomUUID(),
      orderIndex: idx,
      type: 'MCQ' as const,
      prompt,
      points,
      options,
      correctOptionId: correctId,
      explanation: String(q.explanation ?? '').trim(),
      groupId,
      groupTitle,
      media,
    };
  });
}

export async function saveLocalQuizInTx(
  tx: Tx,
  actorId: string,
  classId: string,
  sectionId: string | undefined,
  activityId: string | undefined,
  body: SaveLocalQuizPayload,
) {
  const durationMinutes = Math.round(Number(body.durationMinutes ?? 15));
  if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 240) {
    throw new BadRequestException('Thời gian làm bài phải từ 1 đến 240 phút.');
  }
  const maxAttempts = Math.round(Number(body.maxAttempts ?? 1));
  if (!Number.isFinite(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
    throw new BadRequestException('Số lượt làm bài tối đa phải từ 1 đến 20.');
  }
  const openAt = parseOptionalDate(body.openAt, 'Thời gian mở Quiz');
  const closeAt = parseOptionalDate(body.closeAt, 'Thời gian đóng Quiz');
  if (openAt && closeAt && closeAt <= openAt) {
    throw new BadRequestException('Thời gian đóng Quiz phải sau thời gian mở.');
  }

  const assessmentKind = normalizeAssessmentKind(body.assessmentKind);
  const autoReleaseObjective = body.autoReleaseObjective !== false;
  const releaseMode = normalizeReleaseMode(body.releaseMode, assessmentKind, autoReleaseObjective);

  const mediaById = await resolveQuizMediaById(tx, classId, body.questions);
  const questions = normalizeQuizQuestions(body.questions, mediaById);
  const mcqCount = questions.filter((q) => q.type === 'MCQ').length;
  const essayCount = questions.filter((q) => q.type === 'ESSAY').length;
  const totalPoints = round2(questions.reduce((sum, q) => sum + q.points, 0));
  const passScore = round2(
    Math.min(totalPoints, Math.max(0, Number(body.passScore ?? totalPoints * 0.5))),
  );

  const summaryMarkdown =
    String(body.introduction ?? '').trim() ||
    `Bài kiểm tra (${assessmentKind}) gồm ${questions.length} câu (${mcqCount} trắc nghiệm, ${essayCount} tự luận) · Thời lượng ${durationMinutes} phút · Tổng điểm ${totalPoints}.`;

  const saved = await upsertSectionBackedActivity(tx, actorId, classId, sectionId, activityId, {
    title: body.title,
    introduction: String(body.introduction ?? '').trim(),
    contentMarkdown: summaryMarkdown,
    availableFrom: openAt,
    availableUntil: closeAt,
    publish: body.publish,
  });

  await tx.$executeRawUnsafe(
    `INSERT INTO lms_local_quiz_configs
       (activity_id, duration_minutes, max_attempts, shuffle_questions, auto_release_objective, pass_score, assessment_kind, release_mode, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
     ON CONFLICT (activity_id) DO UPDATE SET
       duration_minutes = EXCLUDED.duration_minutes,
       max_attempts = EXCLUDED.max_attempts,
       shuffle_questions = EXCLUDED.shuffle_questions,
       auto_release_objective = EXCLUDED.auto_release_objective,
       pass_score = EXCLUDED.pass_score,
       assessment_kind = EXCLUDED.assessment_kind,
       release_mode = EXCLUDED.release_mode,
       updated_at = now()`,
    saved.id,
    durationMinutes,
    maxAttempts,
    Boolean(body.shuffleQuestions),
    autoReleaseObjective,
    passScore,
    assessmentKind,
    releaseMode,
  );

  await tx.$executeRawUnsafe(`DELETE FROM lms_local_quiz_questions WHERE activity_id = $1`, saved.id);
  for (const q of questions) {
    await tx.$executeRawUnsafe(
      `INSERT INTO lms_local_quiz_questions
         (id, activity_id, order_index, q_type, prompt, points, options_json, correct_option_id, explanation, group_id, group_title, media_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12::jsonb)`,
      q.id,
      saved.id,
      q.orderIndex,
      q.type,
      q.prompt,
      q.points,
      JSON.stringify(q.options),
      q.correctOptionId,
      q.explanation,
      q.groupId,
      q.groupTitle,
      JSON.stringify(q.media),
    );
  }

  await tx.$executeRawUnsafe(
    `INSERT INTO lms_local_activity_kinds (activity_id, class_offering_id, kind, meta_json, updated_at)
     VALUES ($1,$2,'LOCAL_QUIZ',$3::jsonb,now())
     ON CONFLICT (activity_id) DO UPDATE SET
       kind = 'LOCAL_QUIZ',
       meta_json = EXCLUDED.meta_json,
       updated_at = now()`,
    saved.id,
    classId,
    JSON.stringify({
      assessmentKind,
      releaseMode,
      questionCount: questions.length,
      mcqCount,
      essayCount,
      totalPoints,
      durationMinutes,
      maxAttempts,
    }),
  );

  return { activityId: saved.id, state: saved.state, assessmentKind, releaseMode };
}

function mapQuizAttemptRow(
  row: any,
  learner?: { id: string; fullName: string; email?: string },
  hideUnpublishedScore = false,
) {
  const gradingStatus = row.grading_status as 'AUTO_GRADED' | 'PENDING_MANUAL_GRADE' | 'GRADED';
  const gradePublished = Boolean(row.grade_published ?? true) && gradingStatus !== 'PENDING_MANUAL_GRADE';
  const maskScore = hideUnpublishedScore && row.status === 'SUBMITTED' && !gradePublished;
  const rawAnswers = Array.isArray(row.answers_json) ? row.answers_json : [];

  return {
    id: row.id,
    attemptNumber: Number(row.attempt_number),
    status: row.status as 'IN_PROGRESS' | 'SUBMITTED',
    startedAt: new Date(row.started_at).toISOString(),
    deadlineAt: new Date(row.deadline_at).toISOString(),
    submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
    autoScore: maskScore ? 0 : Number(row.auto_score ?? 0),
    manualScore: maskScore ? 0 : Number(row.manual_score ?? 0),
    totalScore: maskScore ? 0 : Number(row.total_score ?? 0),
    maxScore: Number(row.max_score ?? 0),
    objectiveMax: Number(row.objective_max ?? 0),
    essayMax: Number(row.essay_max ?? 0),
    hasEssay: Boolean(row.has_essay),
    gradingStatus,
    gradePublished,
    gradePublishedAt: row.grade_published_at ? new Date(row.grade_published_at).toISOString() : null,
    scoreVisible: !maskScore,
    answers: maskScore
      ? rawAnswers.map((a: any) => ({
          questionId: a.questionId,
          type: a.type,
          prompt: a.prompt,
          points: a.points,
          groupId: a.groupId ?? null,
          groupTitle: a.groupTitle ?? '',
          media: Array.isArray(a.media) ? a.media : [],
          selectedOptionId: a.selectedOptionId ?? null,
          selectedOptionText: a.selectedOptionText ?? null,
          textAnswer: a.textAnswer ?? null,
        }))
      : rawAnswers,
    manualGrades:
      !maskScore && row.manual_grades_json && typeof row.manual_grades_json === 'object'
        ? row.manual_grades_json
        : {},
    teacherFeedback: maskScore ? '' : String(row.teacher_feedback ?? ''),
    gradedAt: !maskScore && row.graded_at ? new Date(row.graded_at).toISOString() : null,
    learner,
  };
}

export async function getQuizWorkspaceInTx(
  tx: Tx,
  scope: Awaited<ReturnType<ClassLmsService['access']>>,
  classId: string,
  activityId: string,
) {
  const isStudent = !scope.teacher;
  const activity = await assertKindOrFail(tx, classId, activityId, 'LOCAL_QUIZ', isStudent);

  const cfgRows = (await tx.$queryRawUnsafe(
    `SELECT duration_minutes, max_attempts, shuffle_questions, auto_release_objective, pass_score, assessment_kind, release_mode
       FROM lms_local_quiz_configs WHERE activity_id = $1`,
    activityId,
  )) as any[];
  const cfg = cfgRows[0];
  const assessmentKind = normalizeAssessmentKind(cfg?.assessment_kind);
  const autoReleaseObjective = cfg?.auto_release_objective !== false;
  const releaseMode = normalizeReleaseMode(cfg?.release_mode, assessmentKind, autoReleaseObjective);
  const config = {
    assessmentKind,
    releaseMode,
    durationMinutes: Number(cfg?.duration_minutes ?? 15),
    maxAttempts: Number(cfg?.max_attempts ?? 1),
    shuffleQuestions: Boolean(cfg?.shuffle_questions ?? false),
    autoReleaseObjective,
    passScore: Number(cfg?.pass_score ?? 5),
  };

  const qRows = (await tx.$queryRawUnsafe(
    `SELECT id, order_index, q_type, prompt, points, options_json, correct_option_id, explanation, group_id, group_title, media_json
       FROM lms_local_quiz_questions
      WHERE activity_id = $1
      ORDER BY order_index ASC`,
    activityId,
  )) as any[];

  const fullQuestions = qRows.map((q) => ({
    id: q.id,
    orderIndex: Number(q.order_index),
    type: q.q_type as 'MCQ' | 'ESSAY',
    prompt: String(q.prompt),
    points: Number(q.points),
    options: Array.isArray(q.options_json) ? q.options_json : [],
    groupId: q.group_id ? String(q.group_id) : null,
    groupTitle: String(q.group_title ?? ''),
    media: Array.isArray(q.media_json) ? q.media_json : [],
    ...(isStudent
      ? {}
      : {
          correctOptionId: q.correct_option_id ?? null,
          explanation: String(q.explanation ?? ''),
        }),
  }));

  const mcqCount = qRows.filter((q) => q.q_type === 'MCQ').length;
  const essayCount = qRows.filter((q) => q.q_type === 'ESSAY').length;
  const totalPoints = round2(qRows.reduce((s, q) => s + Number(q.points), 0));
  const objectivePoints = round2(
    qRows.filter((q) => q.q_type === 'MCQ').reduce((s, q) => s + Number(q.points), 0),
  );
  const essayPoints = round2(totalPoints - objectivePoints);

  const baseActivity = {
    id: activity.id,
    sectionId: activity.sectionId,
    sectionTitle: activity.section.title,
    sectionPublished: Boolean(activity.section.publishedRevisionId),
    title: activity.title,
    introduction: activity.introduction,
    state: activity.state,
    availableFrom: activity.availableFrom?.toISOString() ?? null,
    availableUntil: activity.availableUntil?.toISOString() ?? null,
    revisionNumber: activity.revisionNumber,
  };

  if (scope.teacher) {
    const attRows = (await tx.$queryRawUnsafe(
      `SELECT *
         FROM lms_local_quiz_attempts
        WHERE activity_id = $1
        ORDER BY submitted_at DESC NULLS LAST, started_at DESC`,
      activityId,
    )) as any[];
    const learnerIds = Array.from(new Set(attRows.map((r) => String(r.learner_id))));
    const learners = learnerIds.length
      ? await tx.user.findMany({
          where: { id: { in: learnerIds } },
          select: { id: true, fullName: true, email: true },
        })
      : [];
    const learnerMap = new Map(learners.map((u) => [u.id, u]));
    const attempts = attRows.map((r) => {
      const u = learnerMap.get(String(r.learner_id));
      return mapQuizAttemptRow(r, u ? { id: u.id, fullName: u.fullName, email: u.email } : undefined);
    });
    const enrolledCount = await tx.enrollment.count({
      where: { classOfferingId: classId, status: 'ACTIVE' },
    });
    return {
      editable: true,
      serverNow: scope.now.toISOString(),
      activity: baseActivity,
      config,
      summary: { questionCount: qRows.length, mcqCount, essayCount, totalPoints, objectivePoints, essayPoints },
      questions: fullQuestions,
      stats: {
        enrolledCount,
        submittedCount: attempts.filter((a) => a.status === 'SUBMITTED').length,
        pendingEssayCount: attempts.filter(
          (a) => a.status === 'SUBMITTED' && a.gradingStatus === 'PENDING_MANUAL_GRADE',
        ).length,
        pendingPublishCount: attempts.filter(
          (a) => a.status === 'SUBMITTED' && !a.gradePublished,
        ).length,
      },
      attempts,
    };
  }

  // Student view
  const learnerId = scope.enrollment!.learnerId;
  const attRows = (await tx.$queryRawUnsafe(
    `SELECT * FROM lms_local_quiz_attempts
      WHERE activity_id = $1 AND learner_id = $2
      ORDER BY attempt_number DESC`,
    activityId,
    learnerId,
  )) as any[];
  const myAttempts = attRows.map((r) => mapQuizAttemptRow(r, undefined, true));
  const activeAttempt = myAttempts.find(
    (a) => a.status === 'IN_PROGRESS' && new Date(a.deadlineAt) > scope.now,
  ) ?? null;

  const isBeforeOpen = Boolean(activity.availableFrom && scope.now < activity.availableFrom);
  const isAfterClose = Boolean(activity.availableUntil && scope.now > activity.availableUntil);
  const windowStatus: 'UPCOMING' | 'OPEN' | 'CLOSED' = isBeforeOpen
    ? 'UPCOMING'
    : isAfterClose
      ? 'CLOSED'
      : 'OPEN';

  const submittedCount = myAttempts.filter((a) => a.status === 'SUBMITTED').length;
  const canStartNew =
    windowStatus === 'OPEN' && !activeAttempt && submittedCount < config.maxAttempts;

  return {
    editable: false,
    serverNow: scope.now.toISOString(),
    activity: baseActivity,
    config,
    summary: { questionCount: qRows.length, mcqCount, essayCount, totalPoints, objectivePoints, essayPoints },
    // Hide questions from learners until they have an active attempt or submitted attempt review
    questions: activeAttempt ? fullQuestions : [],
    windowStatus,
    canStartNew,
    activeAttempt,
    myAttempts,
  };
}

export async function startQuizAttemptInTx(
  tx: Tx,
  scope: Awaited<ReturnType<ClassLmsService['access']>>,
  classId: string,
  activityId: string,
) {
  if (scope.teacher || !scope.enrollment) {
    throw new ForbiddenException('Chỉ học viên trong lớp mới có thể làm bài kiểm tra.');
  }
  const activity = await assertKindOrFail(tx, classId, activityId, 'LOCAL_QUIZ', true);
  if (activity.availableFrom && scope.now < activity.availableFrom) {
    throw new BadRequestException('Chưa đến thời gian mở bài kiểm tra.');
  }
  if (activity.availableUntil && scope.now > activity.availableUntil) {
    throw new BadRequestException('Bài kiểm tra đã hết thời gian mở.');
  }

  const cfgRows = (await tx.$queryRawUnsafe(
    `SELECT duration_minutes, max_attempts FROM lms_local_quiz_configs WHERE activity_id = $1`,
    activityId,
  )) as any[];
  const durationMinutes = Number(cfgRows[0]?.duration_minutes ?? 15);
  const maxAttempts = Number(cfgRows[0]?.max_attempts ?? 1);

  const qRows = (await tx.$queryRawUnsafe(
    `SELECT id, q_type, points FROM lms_local_quiz_questions WHERE activity_id = $1`,
    activityId,
  )) as any[];
  if (qRows.length === 0) {
    throw new BadRequestException('Bài kiểm tra chưa có câu hỏi.');
  }

  const objectiveMax = round2(
    qRows.filter((q) => q.q_type === 'MCQ').reduce((s, q) => s + Number(q.points), 0),
  );
  const essayMax = round2(
    qRows.filter((q) => q.q_type === 'ESSAY').reduce((s, q) => s + Number(q.points), 0),
  );
  const maxScore = round2(objectiveMax + essayMax);
  const hasEssay = qRows.some((q) => q.q_type === 'ESSAY');

  const existingRows = (await tx.$queryRawUnsafe(
    `SELECT id, status, attempt_number, deadline_at
       FROM lms_local_quiz_attempts
      WHERE activity_id = $1 AND learner_id = $2
      ORDER BY attempt_number DESC`,
    activityId,
    scope.enrollment.learnerId,
  )) as any[];

  const active = existingRows.find(
    (r) => r.status === 'IN_PROGRESS' && new Date(r.deadline_at) > scope.now,
  );
  if (active) {
    return getQuizWorkspaceInTx(tx, scope, classId, activityId);
  }

  if (existingRows.length >= maxAttempts) {
    throw new BadRequestException(`Bạn đã sử dụng hết ${maxAttempts} lượt làm bài cho phép.`);
  }

  const nextAttemptNumber = (existingRows[0]?.attempt_number ?? 0) + 1;
  const durationDeadline = new Date(scope.now.getTime() + durationMinutes * 60_000);
  const effectiveDeadline =
    activity.availableUntil && activity.availableUntil < durationDeadline
      ? activity.availableUntil
      : durationDeadline;

  await tx.$executeRawUnsafe(
    `INSERT INTO lms_local_quiz_attempts
       (id, activity_id, class_offering_id, learner_id, enrollment_id, attempt_number,
        status, started_at, deadline_at, max_score, objective_max, essay_max, has_essay, grading_status)
     VALUES ($1,$2,$3,$4,$5,$6,'IN_PROGRESS',$7::timestamptz,$8::timestamptz,$9,$10,$11,$12,$13)`,
    randomUUID(),
    activityId,
    classId,
    scope.enrollment.learnerId,
    scope.enrollment.id,
    nextAttemptNumber,
    scope.now.toISOString(),
    effectiveDeadline.toISOString(),
    maxScore,
    objectiveMax,
    essayMax,
    hasEssay,
    hasEssay ? 'PENDING_MANUAL_GRADE' : 'AUTO_GRADED',
  );

  return getQuizWorkspaceInTx(tx, scope, classId, activityId);
}

export async function saveOrSubmitQuizAttemptInTx(
  tx: Tx,
  scope: Awaited<ReturnType<ClassLmsService['access']>>,
  classId: string,
  activityId: string,
  attemptId: string,
  body: { answers?: QuizAnswerSubmission[]; submit?: boolean },
) {
  if (scope.teacher || !scope.enrollment) {
    throw new ForbiddenException('Chỉ học viên mới được nộp bài.');
  }
  await assertKindOrFail(tx, classId, activityId, 'LOCAL_QUIZ', true);

  const rows = (await tx.$queryRawUnsafe(
    `SELECT * FROM lms_local_quiz_attempts
      WHERE id = $1 AND activity_id = $2 AND learner_id = $3`,
    attemptId,
    activityId,
    scope.enrollment.learnerId,
  )) as any[];
  const attempt = rows[0];
  if (!attempt) throw new NotFoundException('Không tìm thấy lượt làm bài.');
  if (attempt.status === 'SUBMITTED') {
    throw new BadRequestException('Lượt làm bài này đã được nộp trước đó.');
  }

  const qRows = (await tx.$queryRawUnsafe(
    `SELECT id, order_index, q_type, prompt, points, options_json, correct_option_id, explanation, group_id, group_title, media_json
       FROM lms_local_quiz_questions
      WHERE activity_id = $1
      ORDER BY order_index ASC`,
    activityId,
  )) as any[];

  const submittedMap = new Map<string, QuizAnswerSubmission>();
  for (const ans of body.answers ?? []) {
    if (ans?.questionId) submittedMap.set(ans.questionId, ans);
  }

  if (body.submit !== true) {
    const draftAnswers = qRows.map((q) => {
      const a = submittedMap.get(q.id);
      return {
        questionId: q.id,
        selectedOptionId: a?.selectedOptionId ?? null,
        textAnswer: a?.textAnswer ?? '',
      };
    });
    await tx.$executeRawUnsafe(
      `UPDATE lms_local_quiz_attempts SET answers_json = $2::jsonb WHERE id = $1`,
      attemptId,
      JSON.stringify(draftAnswers),
    );
    return getQuizWorkspaceInTx(tx, scope, classId, activityId);
  }

  // Final submit: auto-grade MCQ immediately; leave ESSAY as PENDING_MANUAL_GRADE
  let autoScore = 0;
  let objectiveMax = 0;
  let essayMax = 0;
  let hasEssay = false;

  const evaluatedAnswers = qRows.map((q) => {
    const pts = Number(q.points);
    const a = submittedMap.get(q.id);
    const options: Array<{ id: string; text: string }> = Array.isArray(q.options_json)
      ? q.options_json
      : [];

    const media = Array.isArray(q.media_json) ? q.media_json : [];
    const groupId = q.group_id ? String(q.group_id) : null;
    const groupTitle = String(q.group_title ?? '');

    if (q.q_type === 'ESSAY') {
      hasEssay = true;
      essayMax = round2(essayMax + pts);
      return {
        questionId: q.id,
        type: 'ESSAY',
        prompt: String(q.prompt),
        points: pts,
        groupId,
        groupTitle,
        media,
        textAnswer: String(a?.textAnswer ?? '').trim(),
        selectedOptionId: null,
        selectedOptionText: null,
        correctOptionId: null,
        correctOptionText: null,
        isCorrect: null,
        autoEarned: 0,
        explanation: String(q.explanation ?? ''),
      };
    }

    objectiveMax = round2(objectiveMax + pts);
    const selectedId = a?.selectedOptionId ? String(a.selectedOptionId) : null;
    const selectedOpt = options.find((o) => o.id === selectedId);
    const correctOpt = options.find((o) => o.id === q.correct_option_id);
    const isCorrect = Boolean(selectedId && selectedId === q.correct_option_id);
    const earned = isCorrect ? pts : 0;
    autoScore = round2(autoScore + earned);

    return {
      questionId: q.id,
      type: 'MCQ',
      prompt: String(q.prompt),
      points: pts,
      groupId,
      groupTitle,
      media,
      selectedOptionId: selectedId,
      selectedOptionText: selectedOpt?.text ?? null,
      textAnswer: null,
      correctOptionId: q.correct_option_id,
      correctOptionText: correctOpt?.text ?? null,
      isCorrect,
      autoEarned: earned,
      explanation: String(q.explanation ?? ''),
    };
  });

  const cfgRows = (await tx.$queryRawUnsafe(
    `SELECT auto_release_objective, assessment_kind, release_mode FROM lms_local_quiz_configs WHERE activity_id = $1`,
    activityId,
  )) as any[];
  const cfg = cfgRows[0];
  const releaseMode = normalizeReleaseMode(
    cfg?.release_mode,
    normalizeAssessmentKind(cfg?.assessment_kind),
    cfg?.auto_release_objective !== false,
  );
  const maxScore = round2(objectiveMax + essayMax);
  const gradingStatus = hasEssay ? 'PENDING_MANUAL_GRADE' : 'AUTO_GRADED';
  const gradePublished = !hasEssay && releaseMode === 'AUTO_ON_SUBMIT';

  await tx.$executeRawUnsafe(
    `UPDATE lms_local_quiz_attempts
        SET status = 'SUBMITTED',
            submitted_at = $2::timestamptz,
            auto_score = $3,
            manual_score = 0,
            total_score = $3,
            max_score = $4,
            objective_max = $5,
            essay_max = $6,
            has_essay = $7,
            grading_status = $8,
            answers_json = $9::jsonb,
            grade_published = $10,
            grade_published_at = $11::timestamptz
      WHERE id = $1`,
    attemptId,
    scope.now.toISOString(),
    autoScore,
    maxScore,
    objectiveMax,
    essayMax,
    hasEssay,
    gradingStatus,
    JSON.stringify(evaluatedAnswers),
    gradePublished,
    gradePublished ? scope.now.toISOString() : null,
  );

  return getQuizWorkspaceInTx(tx, scope, classId, activityId);
}

export async function gradeQuizEssayInTx(
  tx: Tx,
  scope: Awaited<ReturnType<ClassLmsService['access']>>,
  actorId: string,
  classId: string,
  activityId: string,
  attemptId: string,
  body: {
    scoresByQuestionId?: Record<string, { score: number; comment?: string }>;
    teacherFeedback?: string;
    publishGrade?: boolean;
  },
) {
  await assertKindOrFail(tx, classId, activityId, 'LOCAL_QUIZ', false);
  const rows = (await tx.$queryRawUnsafe(
    `SELECT * FROM lms_local_quiz_attempts WHERE id = $1 AND activity_id = $2`,
    attemptId,
    activityId,
  )) as any[];
  const attempt = rows[0];
  if (!attempt || attempt.status !== 'SUBMITTED') {
    throw new NotFoundException('Không tìm thấy bài làm đã nộp để chấm tự luận.');
  }

  const answers = Array.isArray(attempt.answers_json) ? attempt.answers_json : [];
  const essayQuestions = answers.filter((a: any) => a.type === 'ESSAY');

  let manualScore = Number(attempt.manual_score ?? 0);
  const existingGrades =
    attempt.manual_grades_json && typeof attempt.manual_grades_json === 'object'
      ? (attempt.manual_grades_json as Record<string, { score: number; comment: string }>)
      : {};
  const cleanGrades: Record<string, { score: number; comment: string }> = { ...existingGrades };

  if (essayQuestions.length > 0 && body.scoresByQuestionId) {
    manualScore = 0;
    for (const eq of essayQuestions) {
      const entry = body.scoresByQuestionId?.[eq.questionId];
      const pts = Number(eq.points ?? 0);
      const val = Number(entry?.score ?? 0);
      if (!Number.isFinite(val) || val < 0 || val > pts) {
        throw new BadRequestException(`Điểm tự luận của câu "${eq.prompt}" phải từ 0 đến ${pts}.`);
      }
      const rounded = round2(val);
      manualScore = round2(manualScore + rounded);
      cleanGrades[eq.questionId] = {
        score: rounded,
        comment: String(entry?.comment ?? '').trim(),
      };
    }
  }

  const autoScore = Number(attempt.auto_score ?? 0);
  const totalScore = round2(autoScore + manualScore);
  const feedback =
    body.teacherFeedback !== undefined
      ? String(body.teacherFeedback).trim()
      : String(attempt.teacher_feedback ?? '');
  const publishGrade = body.publishGrade !== false;
  const gradingStatus = essayQuestions.length > 0 ? 'GRADED' : String(attempt.grading_status || 'AUTO_GRADED');

  await tx.$executeRawUnsafe(
    `UPDATE lms_local_quiz_attempts
        SET manual_score = $2,
            total_score = $3,
            grading_status = $8,
            manual_grades_json = $4::jsonb,
            teacher_feedback = $5,
            graded_by_id = $6,
            graded_at = $7::timestamptz,
            grade_published = $9,
            grade_published_at = $10::timestamptz
      WHERE id = $1`,
    attemptId,
    manualScore,
    totalScore,
    JSON.stringify(cleanGrades),
    feedback,
    actorId,
    scope.now.toISOString(),
    gradingStatus,
    publishGrade,
    publishGrade ? scope.now.toISOString() : null,
  );

  return getQuizWorkspaceInTx(tx, scope, classId, activityId);
}

// =========================================================================
// ATTENDANCE (SECTION -> ACTIVITY)
// =========================================================================

export async function saveLocalAttendanceInTx(
  tx: Tx,
  actorId: string,
  classId: string,
  sectionId: string | undefined,
  activityId: string | undefined,
  body: SaveLocalAttendancePayload,
) {
  const startAt = parseRequiredDate(body.checkInStartAt, 'thời gian mở điểm danh');
  const endAt = parseRequiredDate(body.checkInEndAt, 'thời gian đóng điểm danh');
  if (endAt <= startAt) {
    throw new BadRequestException('Thời gian đóng điểm danh phải sau thời gian mở.');
  }

  const lateAfterMinutes = Math.round(Number(body.lateAfterMinutes ?? 15));
  if (!Number.isFinite(lateAfterMinutes) || lateAfterMinutes < 0 || lateAfterMinutes > 180) {
    throw new BadRequestException('Ngưỡng đi muộn phải từ 0 đến 180 phút.');
  }

  const requireCode = Boolean(body.requireCode);
  const checkInCode = String(body.checkInCode ?? '').trim().toUpperCase();
  if (requireCode && checkInCode.length < 3) {
    throw new BadRequestException('Vui lòng nhập mã điểm danh tối thiểu 3 ký tự.');
  }

  const sessionTitle = String(body.sessionTitle ?? '').trim() || body.title.trim();
  const sessionDateLabel = String(body.sessionDateLabel ?? '').trim();
  const intro = String(body.introduction ?? '').trim();
  const markdown =
    intro ||
    `Điểm danh ${sessionTitle}${requireCode ? ' (Yêu cầu nhập mã điểm danh từ giảng viên)' : ''}. Đi muộn sau ${lateAfterMinutes} phút kể từ giờ mở.`;

  const saved = await upsertSectionBackedActivity(tx, actorId, classId, sectionId, activityId, {
    title: body.title,
    introduction: intro,
    contentMarkdown: markdown,
    availableFrom: startAt,
    availableUntil: endAt,
    publish: body.publish,
  });

  await tx.$executeRawUnsafe(
    `INSERT INTO lms_local_attendance_configs
       (activity_id, class_offering_id, session_title, session_date_label,
        check_in_start_at, check_in_end_at, late_after_minutes, require_code, check_in_code, updated_at)
     VALUES ($1,$2,$3,$4,$5::timestamptz,$6::timestamptz,$7,$8,$9,now())
     ON CONFLICT (activity_id) DO UPDATE SET
       session_title = EXCLUDED.session_title,
       session_date_label = EXCLUDED.session_date_label,
       check_in_start_at = EXCLUDED.check_in_start_at,
       check_in_end_at = EXCLUDED.check_in_end_at,
       late_after_minutes = EXCLUDED.late_after_minutes,
       require_code = EXCLUDED.require_code,
       check_in_code = EXCLUDED.check_in_code,
       updated_at = now()`,
    saved.id,
    classId,
    sessionTitle,
    sessionDateLabel,
    startAt.toISOString(),
    endAt.toISOString(),
    lateAfterMinutes,
    requireCode,
    requireCode ? checkInCode : '',
  );

  await tx.$executeRawUnsafe(
    `INSERT INTO lms_local_activity_kinds (activity_id, class_offering_id, kind, meta_json, updated_at)
     VALUES ($1,$2,'LOCAL_ATTENDANCE',$3::jsonb,now())
     ON CONFLICT (activity_id) DO UPDATE SET
       kind = 'LOCAL_ATTENDANCE',
       meta_json = EXCLUDED.meta_json,
       updated_at = now()`,
    saved.id,
    classId,
    JSON.stringify({
      sessionTitle,
      requireCode,
      lateAfterMinutes,
    }),
  );

  return { activityId: saved.id, state: saved.state };
}

export async function getAttendanceWorkspaceInTx(
  tx: Tx,
  scope: Awaited<ReturnType<ClassLmsService['access']>>,
  classId: string,
  activityId: string,
) {
  const isStudent = !scope.teacher;
  const activity = await assertKindOrFail(tx, classId, activityId, 'LOCAL_ATTENDANCE', isStudent);

  const cfgRows = (await tx.$queryRawUnsafe(
    `SELECT * FROM lms_local_attendance_configs WHERE activity_id = $1`,
    activityId,
  )) as any[];
  const cfg = cfgRows[0];
  if (!cfg) {
    throw new NotFoundException('Chưa có cấu hình phiên điểm danh.');
  }

  const startAt = new Date(cfg.check_in_start_at);
  const endAt = new Date(cfg.check_in_end_at);
  const windowStatus: 'UPCOMING' | 'OPEN' | 'CLOSED' =
    scope.now < startAt ? 'UPCOMING' : scope.now > endAt ? 'CLOSED' : 'OPEN';

  const config = {
    sessionTitle: String(cfg.session_title),
    sessionDateLabel: String(cfg.session_date_label ?? ''),
    checkInStartAt: startAt.toISOString(),
    checkInEndAt: endAt.toISOString(),
    lateAfterMinutes: Number(cfg.late_after_minutes ?? 15),
    requireCode: Boolean(cfg.require_code),
    // Never reveal checkInCode to learners
    ...(isStudent ? {} : { checkInCode: String(cfg.check_in_code ?? '') }),
  };

  const baseActivity = {
    id: activity.id,
    sectionId: activity.sectionId,
    sectionTitle: activity.section.title,
    sectionPublished: Boolean(activity.section.publishedRevisionId),
    title: activity.title,
    introduction: activity.introduction,
    state: activity.state,
    availableFrom: activity.availableFrom?.toISOString() ?? null,
    availableUntil: activity.availableUntil?.toISOString() ?? null,
    revisionNumber: activity.revisionNumber,
  };

  if (scope.teacher) {
    const enrollments = await tx.enrollment.findMany({
      where: { classOfferingId: classId, status: 'ACTIVE' },
      include: { learner: { select: { id: true, fullName: true, email: true } } },
      orderBy: { learner: { fullName: 'asc' } },
    });
    const recRows = (await tx.$queryRawUnsafe(
      `SELECT learner_id, status, checked_in_at, note
         FROM lms_local_attendance_records
        WHERE activity_id = $1`,
      activityId,
    )) as any[];
    const recMap = new Map(recRows.map((r) => [r.learner_id, r]));

    const roster = enrollments.map((e) => {
      const rec = recMap.get(e.learner.id);
      return {
        enrollmentId: e.id,
        learnerId: e.learner.id,
        fullName: e.learner.fullName,
        email: e.learner.email,
        status: (rec?.status as 'PRESENT' | 'LATE' | undefined) ?? 'NOT_RECORDED',
        checkedInAt: rec?.checked_in_at ? new Date(rec.checked_in_at).toISOString() : null,
        note: String(rec?.note ?? ''),
      };
    });

    return {
      editable: true,
      serverNow: scope.now.toISOString(),
      windowStatus,
      activity: baseActivity,
      config,
      summary: {
        totalEnrolled: roster.length,
        presentCount: roster.filter((r) => r.status === 'PRESENT').length,
        lateCount: roster.filter((r) => r.status === 'LATE').length,
        notRecordedCount: roster.filter((r) => r.status === 'NOT_RECORDED').length,
      },
      roster,
    };
  }

  const learnerId = scope.enrollment!.learnerId;
  const myRows = (await tx.$queryRawUnsafe(
    `SELECT status, checked_in_at, note
       FROM lms_local_attendance_records
      WHERE activity_id = $1 AND learner_id = $2`,
    activityId,
    learnerId,
  )) as any[];
  const my = myRows[0];

  return {
    editable: false,
    serverNow: scope.now.toISOString(),
    windowStatus,
    activity: baseActivity,
    config,
    myRecord: my
      ? {
          status: my.status as 'PRESENT' | 'LATE',
          checkedInAt: new Date(my.checked_in_at).toISOString(),
          note: String(my.note ?? ''),
        }
      : null,
  };
}

export async function checkInAttendanceInTx(
  tx: Tx,
  scope: Awaited<ReturnType<ClassLmsService['access']>>,
  classId: string,
  activityId: string,
  body: { code?: string; note?: string },
) {
  if (scope.teacher || !scope.enrollment) {
    throw new ForbiddenException('Chỉ học viên trong lớp mới có thể check-in điểm danh.');
  }
  await assertKindOrFail(tx, classId, activityId, 'LOCAL_ATTENDANCE', true);

  const cfgRows = (await tx.$queryRawUnsafe(
    `SELECT * FROM lms_local_attendance_configs WHERE activity_id = $1`,
    activityId,
  )) as any[];
  const cfg = cfgRows[0];
  if (!cfg) throw new NotFoundException('Chưa có cấu hình phiên điểm danh.');

  const existing = (await tx.$queryRawUnsafe(
    `SELECT id FROM lms_local_attendance_records WHERE activity_id = $1 AND learner_id = $2`,
    activityId,
    scope.enrollment.learnerId,
  )) as any[];
  if (existing.length > 0) {
    return getAttendanceWorkspaceInTx(tx, scope, classId, activityId);
  }

  const startAt = new Date(cfg.check_in_start_at);
  const endAt = new Date(cfg.check_in_end_at);
  if (scope.now < startAt) {
    throw new BadRequestException('Chưa đến thời gian mở điểm danh cho buổi học này.');
  }
  if (scope.now > endAt) {
    throw new BadRequestException('Đã hết thời gian điểm danh hợp lệ cho buổi học này.');
  }

  if (cfg.require_code) {
    const provided = String(body.code ?? '').trim().toUpperCase();
    const expected = String(cfg.check_in_code ?? '').trim().toUpperCase();
    if (!provided || provided !== expected) {
      throw new BadRequestException('Mã điểm danh không đúng. Vui lòng kiểm tra lại với giảng viên.');
    }
  }

  const lateAfterMinutes = Number(cfg.late_after_minutes ?? 15);
  const lateCutoff = new Date(startAt.getTime() + lateAfterMinutes * 60_000);
  const status = scope.now <= lateCutoff ? 'PRESENT' : 'LATE';
  const note = String(body.note ?? '').trim().slice(0, 300);

  await tx.$executeRawUnsafe(
    `INSERT INTO lms_local_attendance_records
       (id, activity_id, class_offering_id, enrollment_id, learner_id, status, checked_in_at, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz,$8)`,
    randomUUID(),
    activityId,
    classId,
    scope.enrollment.id,
    scope.enrollment.learnerId,
    status,
    scope.now.toISOString(),
    note,
  );

  return getAttendanceWorkspaceInTx(tx, scope, classId, activityId);
}

export async function markAttendanceRecordInTx(
  tx: Tx,
  scope: Awaited<ReturnType<ClassLmsService['access']>>,
  classId: string,
  activityId: string,
  body: { enrollmentId: string; status: 'PRESENT' | 'LATE' | 'NOT_RECORDED'; note?: string },
) {
  if (!scope.teacher) {
    throw new ForbiddenException('Chỉ giảng viên phụ trách mới có quyền cập nhật điểm danh.');
  }
  await assertKindOrFail(tx, classId, activityId, 'LOCAL_ATTENDANCE', false);

  const enrollmentId = String(body.enrollmentId ?? '').trim();
  if (!enrollmentId) {
    throw new BadRequestException('Thiếu thông tin ghi danh học viên.');
  }
  if (!['PRESENT', 'LATE', 'NOT_RECORDED'].includes(body.status)) {
    throw new BadRequestException('Trạng thái điểm danh không hợp lệ.');
  }

  const enrollment = await tx.enrollment.findFirst({
    where: { id: enrollmentId, classOfferingId: classId, status: 'ACTIVE' },
    select: { id: true, learnerId: true },
  });
  if (!enrollment) {
    throw new NotFoundException('Không tìm thấy học viên đang theo học trong lớp.');
  }

  if (body.status === 'NOT_RECORDED') {
    await tx.$executeRawUnsafe(
      `DELETE FROM lms_local_attendance_records WHERE activity_id = $1 AND learner_id = $2`,
      activityId,
      enrollment.learnerId,
    );
    return getAttendanceWorkspaceInTx(tx, scope, classId, activityId);
  }

  const hasExplicitNote = body.note !== undefined;
  const note = hasExplicitNote ? String(body.note).trim().slice(0, 300) : '';
  await tx.$executeRawUnsafe(
    `INSERT INTO lms_local_attendance_records
       (id, activity_id, class_offering_id, enrollment_id, learner_id, status, checked_in_at, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz,$8)
     ON CONFLICT (activity_id, learner_id) DO UPDATE SET
       status = EXCLUDED.status,
       note = CASE WHEN $9::boolean THEN EXCLUDED.note ELSE lms_local_attendance_records.note END`,
    randomUUID(),
    activityId,
    classId,
    enrollment.id,
    enrollment.learnerId,
    body.status,
    scope.now.toISOString(),
    note,
    hasExplicitNote,
  );

  return getAttendanceWorkspaceInTx(tx, scope, classId, activityId);
}
