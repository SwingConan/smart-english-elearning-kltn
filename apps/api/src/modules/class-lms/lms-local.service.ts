import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, extname, resolve, sep } from 'node:path';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuthorityActor } from '../authorization/authorization.service';
import { ClassLmsService } from './class-lms.service';
import { buildZipArchive, type ZipEntry } from './lms-local.zip';
import {
  buildUnifiedClassResults,
  listClassQuestionBank,
  type QuestionBankQuery,
} from './lms-unified-results.helpers';
import {
  checkInAttendanceInTx,
  ensureQuizAttendanceTables,
  getAttendanceWorkspaceInTx,
  getClassActivityKindsInTx,
  getQuizWorkspaceInTx,
  gradeQuizEssayInTx,
  markAttendanceRecordInTx,
  saveLocalAttendanceInTx,
  saveLocalQuizInTx,
  saveOrSubmitQuizAttemptInTx,
  startQuizAttemptInTx,
  type QuizAnswerSubmission,
  type QuizMediaItem,
  type SaveLocalAttendancePayload,
  type SaveLocalQuizPayload,
} from './lms-local-qa.helpers';

const QUIZ_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const QUIZ_AUDIO_EXTS = new Set(['.mp3', '.m4a', '.wav', '.ogg', '.webm']);
const QUIZ_MEDIA_EXTS = new Set([...QUIZ_IMAGE_EXTS, ...QUIZ_AUDIO_EXTS]);

type Tx = Prisma.TransactionClient;

export interface PromptAttachment {
  id: string;
  key: string;
  name: string;
  mimeType: string;
  bytes: number;
  sha256: string;
  uploadedAt: string;
}

export interface AssignmentConfigView {
  activityId: string;
  maxFiles: number;
  maxFileSizeMb: number;
  allowFile: boolean;
  allowText: boolean;
  allowAudio: boolean;
  allowLate: boolean;
  allowResubmit: boolean;
  acceptedExtensions: string;
  promptUrl: string | null;
  promptFiles: PromptAttachment[];
  maxScore: number;
}

export interface UploadedSubmissionFileView {
  id: string;
  name: string;
  mimeType: string;
  bytes: number;
  sha256: string | null;
  kind: 'ATTACHMENT' | 'AUDIO';
  createdAt: string;
  downloadUrl: string;
}

export interface LocalDirectGradeView {
  score: number | null;
  maxScore: number;
  feedback: string;
  state: 'NOT_GRADED' | 'DRAFT' | 'PUBLISHED';
  gradedAt: string | null;
  publishedAt: string | null;
}

export interface StudentSubmissionView {
  id: string;
  revisionId: string;
  state: 'DRAFT' | 'SUBMITTED';
  text: string;
  files: UploadedSubmissionFileView[];
  submittedAt: string | null;
  updatedAt: string;
  late: boolean;
  canEdit: boolean;
  lockReason: string | null;
  rubricGradingState: 'NOT_GRADED' | 'GRADING_IN_PROGRESS' | 'PENDING_PUBLICATION' | 'PUBLISHED';
  directGrade: LocalDirectGradeView | null;
  learner?: { id: string; fullName: string; email?: string };
}

const DEFAULT_EXTENSIONS =
  '.pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.txt,.zip,.jpg,.jpeg,.png,.webp,.mp3,.wav,.m4a,.ogg,.webm';

const BLOCKED_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.sh',
  '.ps1',
  '.vbs',
  '.js',
  '.mjs',
  '.cjs',
  '.html',
  '.htm',
  '.svg',
  '.msi',
  '.dll',
  '.com',
  '.scr',
]);

function normalizeOriginalName(raw: string): string {
  const hasHighLatin1 = /[\u0080-\u00ff]/.test(raw) && !/[\u0100-\uffff]/.test(raw);
  const decoded = hasHighLatin1 ? Buffer.from(raw, 'latin1').toString('utf8') : raw;
  return decoded.replace(/[\r\n\0]/g, '').trim();
}

function sanitizeZipSegment(value: string): string {
  return value
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|\r\n\0]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'hoc_vien';
}

function formatZipDateVn(value: Date | string | null | undefined): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '0000-00-00';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const byType = new Map(parts.map((p) => [p.type, p.value]));
  return `${byType.get('year') ?? '0000'}-${byType.get('month') ?? '00'}-${byType.get('day') ?? '00'}`;
}

function parseExtList(raw: string): Set<string> {
  return new Set(
    raw
      .split(/[\s,;]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
      .map((item) => (item.startsWith('.') ? item : `.${item}`)),
  );
}

@Injectable()
export class LmsLocalService implements OnModuleInit {
  private readonly localFilesRoot = resolve(
    process.env.LMS_LOCAL_FILES_ROOT ?? resolve(process.cwd(), '.local-storage/lms-local-files'),
  );
  private readonly legacyFilesRoot = resolve(
    process.env.LEARNING_RESOURCE_STORAGE_ROOT ??
      resolve(process.cwd(), '.local-storage/learning-resources'),
  );
  private tablesReady = false;

  constructor(
    private readonly db: PrismaService,
    private readonly lms: ClassLmsService,
  ) {}

  async onModuleInit() {
    await this.ensureTables();
  }

  private async ensureTables() {
    if (this.tablesReady) return;
    await this.db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS lms_local_assignment_configs (
        activity_id TEXT PRIMARY KEY,
        max_files INTEGER NOT NULL DEFAULT 20,
        max_file_size_mb INTEGER NOT NULL DEFAULT 10,
        allow_file BOOLEAN NOT NULL DEFAULT true,
        allow_text BOOLEAN NOT NULL DEFAULT true,
        allow_audio BOOLEAN NOT NULL DEFAULT false,
        allow_late BOOLEAN NOT NULL DEFAULT false,
        allow_resubmit BOOLEAN NOT NULL DEFAULT true,
        accepted_extensions TEXT NOT NULL DEFAULT '${DEFAULT_EXTENSIONS}',
        prompt_url TEXT,
        prompt_files_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        max_score NUMERIC(6,2) NOT NULL DEFAULT 10,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await this.db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS lms_local_assignment_submission_files (
        id TEXT PRIMARY KEY,
        activity_id TEXT NOT NULL,
        enrollment_id TEXT NOT NULL,
        learner_id TEXT NOT NULL,
        class_offering_id TEXT NOT NULL,
        submission_id TEXT,
        storage_key TEXT NOT NULL,
        original_file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        file_bytes INTEGER NOT NULL,
        file_sha256 TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'ATTACHMENT',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await this.db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_lms_local_sub_files_act_enr
      ON lms_local_assignment_submission_files (activity_id, enrollment_id);
    `);
    await this.db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS lms_local_assignment_grades (
        submission_id TEXT PRIMARY KEY,
        activity_id TEXT NOT NULL,
        class_offering_id TEXT NOT NULL,
        score NUMERIC(6,2),
        max_score NUMERIC(6,2) NOT NULL DEFAULT 10,
        feedback TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL DEFAULT 'DRAFT',
        graded_by_id TEXT,
        graded_at TIMESTAMPTZ,
        published_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await this.db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS lms_local_assignment_submission_meta (
        activity_id TEXT NOT NULL,
        enrollment_id TEXT NOT NULL,
        submission_id TEXT NOT NULL,
        text_override TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (activity_id, enrollment_id)
      );
    `);
    await ensureQuizAttendanceTables(this.db);
    this.tablesReady = true;
  }

  private resolveSafePath(root: string, key: string): string {
    if (!key || key.includes('..') || key.includes('\\') || key.includes('/') || key.includes('\0')) {
      throw new BadRequestException('Khóa lưu trữ tệp không hợp lệ.');
    }
    const target = resolve(root, key);
    if (!target.startsWith(`${root}${sep}`)) {
      throw new BadRequestException('Đường dẫn tệp không hợp lệ.');
    }
    return target;
  }

  private findExistingFilePath(key: string): string | null {
    const inLocal = this.resolveSafePath(this.localFilesRoot, key);
    if (existsSync(inLocal)) return inLocal;
    const inLegacy = this.resolveSafePath(this.legacyFilesRoot, key);
    if (existsSync(inLegacy)) return inLegacy;
    return null;
  }

  private async storeUploadedFile(
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
    maxBytes: number,
    allowedExts?: Set<string>,
  ) {
    const cleanName = normalizeOriginalName(file.originalname);
    if (!cleanName || cleanName.includes('/') || cleanName.includes('\\') || cleanName.includes('..')) {
      throw new BadRequestException('Tên tệp không hợp lệ.');
    }
    const ext = extname(cleanName).toLowerCase();
    if (!ext || BLOCKED_EXTENSIONS.has(ext)) {
      throw new BadRequestException(`Định dạng tệp ${ext || '(không có phần mở rộng)'} không được phép tải lên.`);
    }
    if (allowedExts && allowedExts.size > 0 && !allowedExts.has(ext)) {
      throw new BadRequestException(
        `Định dạng ${ext} chưa nằm trong danh sách cho phép (${Array.from(allowedExts).join(', ')}).`,
      );
    }
    if (!Number.isFinite(file.size) || file.size <= 0 || file.size > maxBytes) {
      const mb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;
      throw new BadRequestException(`Tệp "${cleanName}" vượt quá giới hạn dung lượng ${mb} MB hoặc bị rỗng.`);
    }
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const key = `${randomUUID()}${ext}`;
    const dest = this.resolveSafePath(this.localFilesRoot, key);
    await mkdir(this.localFilesRoot, { recursive: true });
    await writeFile(dest, file.buffer, { flag: 'wx' });
    return {
      key,
      name: cleanName,
      mimeType: file.mimetype || 'application/octet-stream',
      bytes: file.size,
      sha256,
    };
  }

  private async readConfig(tx: Tx, activityId: string): Promise<AssignmentConfigView> {
    const rows = (await tx.$queryRawUnsafe(
      `SELECT activity_id, max_files, max_file_size_mb, allow_file, allow_text, allow_audio,
              allow_late, allow_resubmit, accepted_extensions, prompt_url, prompt_files_json, max_score
         FROM lms_local_assignment_configs WHERE activity_id = $1`,
      activityId,
    )) as any[];
    const row = rows[0];
    if (!row) {
      return {
        activityId,
        maxFiles: 20,
        maxFileSizeMb: 10,
        allowFile: true,
        allowText: true,
        allowAudio: false,
        allowLate: false,
        allowResubmit: true,
        acceptedExtensions: DEFAULT_EXTENSIONS,
        promptUrl: null,
        promptFiles: [],
        maxScore: 10,
      };
    }
    return {
      activityId,
      maxFiles: Number(row.max_files ?? 20),
      maxFileSizeMb: Number(row.max_file_size_mb ?? 10),
      allowFile: Boolean(row.allow_file),
      allowText: Boolean(row.allow_text),
      allowAudio: Boolean(row.allow_audio),
      allowLate: Boolean(row.allow_late),
      allowResubmit: Boolean(row.allow_resubmit),
      acceptedExtensions: String(row.accepted_extensions || DEFAULT_EXTENSIONS),
      promptUrl: row.prompt_url ? String(row.prompt_url) : null,
      promptFiles: Array.isArray(row.prompt_files_json) ? row.prompt_files_json : [],
      maxScore: Number(row.max_score ?? 10),
    };
  }

  private async assertAssignment(tx: Tx, classId: string, activityId: string, forStudent: boolean, now: Date) {
    const activity = await this.lms.activity(tx, classId, activityId);
    if (activity.type !== 'ASSIGNMENT') {
      throw new BadRequestException('Chỉ hoạt động loại Bài tập (Assignment) mới hỗ trợ cấu hình và nộp bài.');
    }
    const source = forStudent ? activity.publishedRevision : (activity.publishedRevision ?? activity);
    if (
      forStudent &&
      (!activity.section.publishedRevisionId ||
        activity.state !== 'PUBLISHED' ||
        !activity.publishedRevision ||
        !this.lms.readable(activity.publishedRevision, now))
    ) {
      throw new NotFoundException('Bài tập hiện chưa được mở cho học viên.');
    }
    return { activity, source: source! };
  }

  private evaluateSubmissionWindow(
    availableFrom: Date | null,
    availableUntil: Date | null,
    config: AssignmentConfigView,
    existingState: 'DRAFT' | 'SUBMITTED' | null,
    now: Date,
  ): { canEdit: boolean; late: boolean; lockReason: string | null } {
    if (availableFrom && now < availableFrom) {
      return {
        canEdit: false,
        late: false,
        lockReason: 'Chưa đến thời gian mở nộp bài.',
      };
    }
    const isPastDue = Boolean(availableUntil && now > availableUntil);
    if (isPastDue && !config.allowLate) {
      return {
        canEdit: false,
        late: true,
        lockReason: 'Đã quá hạn nộp bài.',
      };
    }
    if (existingState === 'SUBMITTED' && !config.allowResubmit) {
      return {
        canEdit: false,
        late: isPastDue,
        lockReason: 'Bài tập chỉ cho phép nộp một lần.',
      };
    }
    return { canEdit: true, late: isPastDue, lockReason: null };
  }

  private async buildFilesForSubmission(
    tx: Tx,
    classId: string,
    activityId: string,
    enrollmentId: string,
    legacyRow: {
      id: string;
      storageKey: string | null;
      originalFileName: string | null;
      mimeType: string | null;
      fileBytes: number | null;
      fileSha256: string | null;
      updatedAt: Date;
    } | null,
  ): Promise<UploadedSubmissionFileView[]> {
    const localRows = (await tx.$queryRawUnsafe(
      `SELECT id, storage_key, original_file_name, mime_type, file_bytes, file_sha256, kind, created_at
         FROM lms_local_assignment_submission_files
        WHERE activity_id = $1 AND enrollment_id = $2
        ORDER BY created_at ASC`,
      activityId,
      enrollmentId,
    )) as any[];

    const files: UploadedSubmissionFileView[] = localRows.map((r) => ({
      id: r.id,
      name: r.original_file_name,
      mimeType: r.mime_type,
      bytes: Number(r.file_bytes),
      sha256: r.file_sha256,
      kind: r.kind === 'AUDIO' ? 'AUDIO' : 'ATTACHMENT',
      createdAt: new Date(r.created_at).toISOString(),
      downloadUrl: `/api/v2/lms-local/classes/${classId}/activities/${activityId}/files/${r.id}`,
    }));

    if (legacyRow?.storageKey && !localRows.some((r) => r.storage_key === legacyRow.storageKey)) {
      const legacyId = `legacy-${legacyRow.id}`;
      files.push({
        id: legacyId,
        name: legacyRow.originalFileName ?? 'tep-bai-nop',
        mimeType: legacyRow.mimeType ?? 'application/octet-stream',
        bytes: Number(legacyRow.fileBytes ?? 0),
        sha256: legacyRow.fileSha256 ?? null,
        kind: 'ATTACHMENT',
        createdAt: legacyRow.updatedAt.toISOString(),
        downloadUrl: `/api/v2/lms-local/classes/${classId}/activities/${activityId}/files/${legacyId}`,
      });
    }

    return files;
  }

  private async readDirectGrade(
    tx: Tx,
    submissionId: string,
    defaultMaxScore: number,
    isTeacher: boolean,
  ): Promise<LocalDirectGradeView | null> {
    const rows = (await tx.$queryRawUnsafe(
      `SELECT score, max_score, feedback, state, graded_at, published_at
         FROM lms_local_assignment_grades
        WHERE submission_id = $1`,
      submissionId,
    )) as any[];
    const g = rows[0];
    if (!g) return null;
    if (!isTeacher && g.state !== 'PUBLISHED') {
      return null;
    }
    return {
      score: g.score !== null && g.score !== undefined ? Number(g.score) : null,
      maxScore: Number(g.max_score ?? defaultMaxScore),
      feedback: String(g.feedback ?? ''),
      state: g.state,
      gradedAt: g.graded_at ? new Date(g.graded_at).toISOString() : null,
      publishedAt: g.published_at ? new Date(g.published_at).toISOString() : null,
    };
  }

  async getAssignmentWorkspace(actor: AuthorityActor, classId: string, activityId: string) {
    await this.ensureTables();
    return this.lms.run(actor, classId, (tx, scope) =>
      this.loadWorkspaceInTx(tx, scope, classId, activityId),
    );
  }

  private async loadWorkspaceInTx(
    tx: Tx,
    scope: Awaited<ReturnType<ClassLmsService['access']>>,
    classId: string,
    activityId: string,
  ) {
    const { activity, source } = await this.assertAssignment(
      tx,
      classId,
      activityId,
      !scope.teacher,
      scope.now,
    );
    const config = await this.readConfig(tx, activityId);

      if (scope.teacher) {
        const enrolledCount = await tx.enrollment.count({
          where: { classOfferingId: classId, status: 'ACTIVE' },
        });
        const rows = await tx.classAssignmentSubmission.findMany({
          where: {
            activityId,
            classOfferingId: classId,
            state: 'SUBMITTED',
            enrollment: { status: 'ACTIVE' },
          },
          include: {
            learner: { select: { id: true, fullName: true, email: true } },
            gradeVersions: { select: { state: true } },
          },
          orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
        });

        const metaRows = (await tx.$queryRawUnsafe(
          `SELECT enrollment_id, text_override, updated_at
             FROM lms_local_assignment_submission_meta
            WHERE activity_id = $1`,
          activityId,
        )) as any[];
        const metaMap = new Map(metaRows.map((m) => [m.enrollment_id, m]));

        const submissions: StudentSubmissionView[] = await Promise.all(
          rows.map(async (row) => {
            const files = await this.buildFilesForSubmission(
              tx,
              classId,
              activityId,
              row.enrollmentId,
              row,
            );
            const meta = metaMap.get(row.enrollmentId);
            const directGrade = await this.readDirectGrade(tx, row.id, config.maxScore, true);
            const rubricState = row.gradeVersions.some((g) => g.state === 'PUBLISHED')
              ? 'PUBLISHED'
              : row.gradeVersions.some((g) => g.state === 'REVIEWED_FINAL')
                ? 'PENDING_PUBLICATION'
                : row.gradeVersions.length > 0
                  ? 'GRADING_IN_PROGRESS'
                  : 'NOT_GRADED';
            return {
              id: row.id,
              revisionId: row.revisionId,
              state: row.state as 'DRAFT' | 'SUBMITTED',
              text: meta?.text_override ?? row.text,
              files,
              submittedAt: row.submittedAt?.toISOString() ?? null,
              updatedAt: (meta?.updated_at ? new Date(meta.updated_at) : row.updatedAt).toISOString(),
              late: Boolean(
                source.availableUntil && row.submittedAt && row.submittedAt > source.availableUntil,
              ),
              canEdit: false,
              lockReason: null,
              rubricGradingState: rubricState,
              directGrade,
              learner: {
                id: row.learner.id,
                fullName: row.learner.fullName,
                email: row.learner.email,
              },
            };
          }),
        );

        return {
          editable: true,
          activity: {
            id: activity.id,
            title: activity.title,
            introduction: activity.introduction,
            contentMarkdown: activity.contentMarkdown,
            state: activity.state,
            availableFrom: activity.availableFrom?.toISOString() ?? null,
            availableUntil: activity.availableUntil?.toISOString() ?? null,
            publishedRevisionId: activity.publishedRevisionId,
          },
          config,
          stats: {
            enrolledCount,
            submittedCount: submissions.length,
            gradedCount: submissions.filter(
              (s) => s.directGrade?.state === 'PUBLISHED' || s.rubricGradingState === 'PUBLISHED',
            ).length,
          },
          submissions,
        };
      }

      const enrollment = scope.enrollment!;
      const existing = await tx.classAssignmentSubmission.findUnique({
        where: { activityId_enrollmentId: { activityId, enrollmentId: enrollment.id } },
        include: { gradeVersions: { select: { state: true } } },
      });
      const files = await this.buildFilesForSubmission(
        tx,
        classId,
        activityId,
        enrollment.id,
        existing,
      );
      const windowCheck = this.evaluateSubmissionWindow(
        source.availableFrom,
        source.availableUntil,
        config,
        (existing?.state as 'DRAFT' | 'SUBMITTED' | undefined) ?? null,
        scope.now,
      );
      const directGrade = existing
        ? await this.readDirectGrade(tx, existing.id, config.maxScore, false)
        : null;
      const rubricState = existing?.gradeVersions.some((g) => g.state === 'PUBLISHED')
        ? 'PUBLISHED'
        : existing?.gradeVersions.some((g) => g.state === 'REVIEWED_FINAL')
          ? 'PENDING_PUBLICATION'
          : (existing?.gradeVersions.length ?? 0) > 0
            ? 'GRADING_IN_PROGRESS'
            : 'NOT_GRADED';

      const myMetaRows = (await tx.$queryRawUnsafe(
        `SELECT text_override, updated_at
           FROM lms_local_assignment_submission_meta
          WHERE activity_id = $1 AND enrollment_id = $2`,
        activityId,
        enrollment.id,
      )) as any[];
      const myMeta = myMetaRows[0];

      const mySubmission: StudentSubmissionView | null = existing
        ? {
            id: existing.id,
            revisionId: existing.revisionId,
            state: existing.state as 'DRAFT' | 'SUBMITTED',
            text: myMeta?.text_override ?? existing.text,
            files,
            submittedAt: existing.submittedAt?.toISOString() ?? null,
            updatedAt: (myMeta?.updated_at ? new Date(myMeta.updated_at) : existing.updatedAt).toISOString(),
            late: Boolean(
              source.availableUntil &&
                existing.submittedAt &&
                existing.submittedAt > source.availableUntil,
            ),
            canEdit: windowCheck.canEdit,
            lockReason: windowCheck.lockReason,
            rubricGradingState: rubricState,
            directGrade,
          }
        : null;

        return {
          editable: false,
          activity: {
            id: activity.id,
            title: source.title,
            introduction: source.introduction,
            contentMarkdown: source.contentMarkdown,
            state: activity.state,
            availableFrom: source.availableFrom?.toISOString() ?? null,
            availableUntil: source.availableUntil?.toISOString() ?? null,
            publishedRevisionId: activity.publishedRevisionId,
          },
          config,
          submissionWindow: windowCheck,
          mySubmission,
        };
  }

  async updateAssignmentConfig(
    actor: AuthorityActor,
    classId: string,
    activityId: string,
    body: {
      maxFiles?: number;
      maxFileSizeMb?: number;
      allowFile?: boolean;
      allowText?: boolean;
      allowAudio?: boolean;
      allowLate?: boolean;
      allowResubmit?: boolean;
      acceptedExtensions?: string;
      promptUrl?: string | null;
      maxScore?: number;
      availableFrom?: string | null;
      availableUntil?: string | null;
      syncPublishedDates?: boolean;
    },
  ) {
    await this.ensureTables();
    return this.lms.run(
      actor,
      classId,
      async (tx) => {
        const { activity } = await this.assertAssignment(tx, classId, activityId, false, new Date());
        const current = await this.readConfig(tx, activityId);

        const maxFiles = Math.min(50, Math.max(1, Number(body.maxFiles ?? current.maxFiles)));
        const maxFileSizeMb = Math.min(50, Math.max(1, Number(body.maxFileSizeMb ?? current.maxFileSizeMb)));
        const allowFile = body.allowFile ?? current.allowFile;
        const allowText = body.allowText ?? current.allowText;
        const allowAudio = body.allowAudio ?? current.allowAudio;
        if (!allowFile && !allowText && !allowAudio) {
          throw new BadRequestException('Phải bật ít nhất một hình thức nộp bài (Tệp, Văn bản hoặc Audio).');
        }
        const allowLate = body.allowLate ?? current.allowLate;
        const allowResubmit = body.allowResubmit ?? current.allowResubmit;
        const maxScore = Math.min(100, Math.max(1, Number(body.maxScore ?? current.maxScore)));

        let promptUrl = body.promptUrl === undefined ? current.promptUrl : body.promptUrl?.trim() || null;
        if (promptUrl && !/^https:\/\/.+/i.test(promptUrl)) {
          throw new BadRequestException('Liên kết tài liệu đính kèm phải bắt đầu bằng https://');
        }

        const acceptedExtensions =
          body.acceptedExtensions !== undefined
            ? Array.from(parseExtList(body.acceptedExtensions)).join(',') || DEFAULT_EXTENSIONS
            : current.acceptedExtensions;

        if (body.availableFrom !== undefined || body.availableUntil !== undefined) {
          const nextFrom =
            body.availableFrom !== undefined
              ? body.availableFrom
                ? new Date(body.availableFrom)
                : null
              : activity.availableFrom;
          const nextUntil =
            body.availableUntil !== undefined
              ? body.availableUntil
                ? new Date(body.availableUntil)
                : null
              : activity.availableUntil;
          if (nextFrom && Number.isNaN(nextFrom.getTime())) {
            throw new BadRequestException('Thời gian mở bài không hợp lệ.');
          }
          if (nextUntil && Number.isNaN(nextUntil.getTime())) {
            throw new BadRequestException('Hạn nộp bài không hợp lệ.');
          }
          if (nextFrom && nextUntil && nextUntil <= nextFrom) {
            throw new BadRequestException('Hạn nộp phải sau thời gian mở bài.');
          }
          const fromChanged = (nextFrom?.getTime() ?? null) !== (activity.availableFrom?.getTime() ?? null);
          const untilChanged =
            (nextUntil?.getTime() ?? null) !== (activity.availableUntil?.getTime() ?? null);
          if (fromChanged || untilChanged) {
            const wasPublished = activity.state === 'PUBLISHED';
            const saved = await tx.classActivity.update({
              where: { id: activityId },
              data: {
                availableFrom: nextFrom,
                availableUntil: nextUntil,
                state: 'DRAFT',
                lockVersion: { increment: 1 },
                updatedById: actor.id,
              },
            });
            if (
              body.syncPublishedDates !== false &&
              wasPublished &&
              activity.section.publishedRevisionId &&
              saved.contentMarkdown.trim()
            ) {
              const rev = await tx.classActivityRevision.create({
                data: {
                  activityId,
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
                  publishedById: actor.id,
                },
              });
              await tx.classActivity.update({
                where: { id: activityId },
                data: {
                  state: 'PUBLISHED',
                  publishedRevisionId: rev.id,
                  revisionNumber: rev.number,
                  lockVersion: { increment: 1 },
                  updatedById: actor.id,
                },
              });
            }
          }
        }

        await tx.$executeRawUnsafe(
          `INSERT INTO lms_local_assignment_configs
             (activity_id, max_files, max_file_size_mb, allow_file, allow_text, allow_audio,
              allow_late, allow_resubmit, accepted_extensions, prompt_url, prompt_files_json, max_score, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,now())
           ON CONFLICT (activity_id) DO UPDATE SET
             max_files = EXCLUDED.max_files,
             max_file_size_mb = EXCLUDED.max_file_size_mb,
             allow_file = EXCLUDED.allow_file,
             allow_text = EXCLUDED.allow_text,
             allow_audio = EXCLUDED.allow_audio,
             allow_late = EXCLUDED.allow_late,
             allow_resubmit = EXCLUDED.allow_resubmit,
             accepted_extensions = EXCLUDED.accepted_extensions,
             prompt_url = EXCLUDED.prompt_url,
             max_score = EXCLUDED.max_score,
             updated_at = now()`,
          activityId,
          maxFiles,
          maxFileSizeMb,
          allowFile,
          allowText,
          allowAudio,
          allowLate,
          allowResubmit,
          acceptedExtensions,
          promptUrl,
          JSON.stringify(current.promptFiles),
          maxScore,
        );

        return this.readConfig(tx, activityId);
      },
      true,
    );
  }

  async uploadPromptFile(
    actor: AuthorityActor,
    classId: string,
    activityId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ) {
    await this.ensureTables();
    if (!file) throw new BadRequestException('Vui lòng chọn tệp đính kèm đề bài.');
    return this.lms.run(
      actor,
      classId,
      async (tx) => {
        await this.assertAssignment(tx, classId, activityId, false, new Date());
        const config = await this.readConfig(tx, activityId);
        if (config.promptFiles.length >= 10) {
          throw new BadRequestException('Tối đa 10 tệp đính kèm cho mỗi đề bài.');
        }
        const stored = await this.storeUploadedFile(file, 20 * 1024 * 1024);
        const item: PromptAttachment = {
          id: randomUUID(),
          key: stored.key,
          name: stored.name,
          mimeType: stored.mimeType,
          bytes: stored.bytes,
          sha256: stored.sha256,
          uploadedAt: new Date().toISOString(),
        };
        const nextFiles = [...config.promptFiles, item];
        await tx.$executeRawUnsafe(
          `INSERT INTO lms_local_assignment_configs (activity_id, prompt_files_json, updated_at)
           VALUES ($1, $2::jsonb, now())
           ON CONFLICT (activity_id) DO UPDATE SET
             prompt_files_json = EXCLUDED.prompt_files_json,
             updated_at = now()`,
          activityId,
          JSON.stringify(nextFiles),
        );
        return this.readConfig(tx, activityId);
      },
      true,
    );
  }

  async deletePromptFile(actor: AuthorityActor, classId: string, activityId: string, fileId: string) {
    await this.ensureTables();
    return this.lms.run(
      actor,
      classId,
      async (tx) => {
        await this.assertAssignment(tx, classId, activityId, false, new Date());
        const config = await this.readConfig(tx, activityId);
        const target = config.promptFiles.find((f) => f.id === fileId);
        if (!target) throw new NotFoundException('Không tìm thấy tệp đề bài.');
        const nextFiles = config.promptFiles.filter((f) => f.id !== fileId);
        await tx.$executeRawUnsafe(
          `UPDATE lms_local_assignment_configs SET prompt_files_json = $2::jsonb, updated_at = now() WHERE activity_id = $1`,
          activityId,
          JSON.stringify(nextFiles),
        );
        const path = this.findExistingFilePath(target.key);
        if (path) await rm(path, { force: true }).catch(() => undefined);
        return this.readConfig(tx, activityId);
      },
      true,
    );
  }

  async downloadPromptFile(actor: AuthorityActor, classId: string, activityId: string, fileId: string) {
    await this.ensureTables();
    return this.lms.run(actor, classId, async (tx, scope) => {
      await this.assertAssignment(tx, classId, activityId, !scope.teacher, scope.now);
      const config = await this.readConfig(tx, activityId);
      const item = config.promptFiles.find((f) => f.id === fileId);
      if (!item) throw new NotFoundException('Không tìm thấy tệp đề bài.');
      const path = this.findExistingFilePath(item.key);
      if (!path) throw new NotFoundException('Tệp không còn tồn tại trên máy chủ.');
      return { stream: createReadStream(path), mimeType: item.mimeType, fileName: item.name };
    });
  }

  async saveStudentSubmission(
    actor: AuthorityActor,
    classId: string,
    activityId: string,
    input: { text?: string; mode?: 'SUBMIT' | 'DRAFT'; removeFileIds?: string[] },
    uploadedFiles: Array<{ buffer: Buffer; mimetype: string; originalname: string; size: number }>,
  ) {
    await this.ensureTables();
    const createdKeys: string[] = [];
    try {
      return await this.lms.run(actor, classId, async (tx, scope) => {
        if (scope.teacher || !scope.enrollment) {
          throw new ForbiddenException('Chỉ học viên đang theo học trong lớp mới có thể nộp bài.');
        }
        const { activity, source } = await this.assertAssignment(
          tx,
          classId,
          activityId,
          true,
          scope.now,
        );
        const config = await this.readConfig(tx, activityId);
        const enrollmentId = scope.enrollment.id;
        const existing = await tx.classAssignmentSubmission.findUnique({
          where: { activityId_enrollmentId: { activityId, enrollmentId } },
        });
        const windowCheck = this.evaluateSubmissionWindow(
          source.availableFrom,
          source.availableUntil,
          config,
          (existing?.state as 'DRAFT' | 'SUBMITTED' | undefined) ?? null,
          scope.now,
        );
        if (!windowCheck.canEdit) {
          throw new BadRequestException(windowCheck.lockReason ?? 'Hiện không thể nộp hoặc sửa bài.');
        }

        const existingLocalFiles = (await tx.$queryRawUnsafe(
          `SELECT id, storage_key, original_file_name, mime_type, file_bytes, file_sha256, kind
             FROM lms_local_assignment_submission_files
            WHERE activity_id = $1 AND enrollment_id = $2
            ORDER BY created_at ASC`,
          activityId,
          enrollmentId,
        )) as any[];

        const removeSet = new Set(input.removeFileIds ?? []);
        const retainedFiles = existingLocalFiles.filter((r) => !removeSet.has(r.id));
        const removedFiles = existingLocalFiles.filter((r) => removeSet.has(r.id));
        const removeLegacy = Boolean(existing?.id && removeSet.has(`legacy-${existing.id}`));

        if (!config.allowFile && uploadedFiles.length > 0) {
          throw new BadRequestException('Bài tập này không cho phép nộp tệp đính kèm.');
        }

        const totalCount =
          retainedFiles.length +
          (existing?.storageKey &&
          !removeLegacy &&
          !existingLocalFiles.some((r) => r.storage_key === existing.storageKey)
            ? 1
            : 0) +
          uploadedFiles.length;

        if (totalCount > config.maxFiles) {
          throw new BadRequestException(
            `Vượt quá giới hạn tối đa ${config.maxFiles} tệp đính kèm (đang chọn ${totalCount} tệp).`,
          );
        }

        const textValue = (input.text ?? existing?.text ?? '').trim();
        if (!config.allowText && textValue.length > 0 && (input.text?.trim() ?? '') !== '') {
          throw new BadRequestException('Bài tập này chỉ nhận tệp đính kèm, không nhận văn bản.');
        }

        const mode = input.mode === 'DRAFT' ? 'DRAFT' : 'SUBMIT';
        if (mode === 'SUBMIT' && totalCount === 0 && !textValue) {
          throw new BadRequestException('Vui lòng đính kèm ít nhất một tệp hoặc nhập nội dung bài làm trước khi lưu bài nộp.');
        }

        const allowedExts = parseExtList(config.acceptedExtensions);
        const storedNew: Array<{
          id: string;
          key: string;
          name: string;
          mimeType: string;
          bytes: number;
          sha256: string;
          kind: 'ATTACHMENT' | 'AUDIO';
        }> = [];

        const maxBytes = config.maxFileSizeMb * 1024 * 1024;
        for (const f of uploadedFiles) {
          const saved = await this.storeUploadedFile(f, maxBytes, allowedExts);
          createdKeys.push(saved.key);
          const ext = extname(saved.name).toLowerCase();
          const isAudio = ['.mp3', '.wav', '.m4a', '.ogg', '.webm'].includes(ext);
          storedNew.push({
            id: randomUUID(),
            key: saved.key,
            name: saved.name,
            mimeType: saved.mimeType,
            bytes: saved.bytes,
            sha256: saved.sha256,
            kind: isAudio ? 'AUDIO' : 'ATTACHMENT',
          });
        }

        // Sync primary single-file pointer (<= 20 MB constraint) on class_assignment_submissions
        const allPrimaryCandidates = [
          ...retainedFiles.map((r) => ({
            key: r.storage_key,
            name: r.original_file_name,
            mimeType: r.mime_type,
            bytes: Number(r.file_bytes),
            sha256: r.file_sha256,
          })),
          ...storedNew,
        ];
        const firstEligibleFile = allPrimaryCandidates.find((f) => f.bytes <= 20 * 1024 * 1024) ?? null;
        const dbText =
          textValue || (allPrimaryCandidates.length > 0 && !firstEligibleFile ? '[Bài nộp đính kèm tệp]' : '');

        let sub = existing;
        const revisionId = activity.publishedRevisionId!;

        if (!sub) {
          // w03b_submission_guard requires INSERT to start in DRAFT with lockVersion=1
          sub = await tx.classAssignmentSubmission.create({
            data: {
              activityId,
              enrollmentId,
              revisionId,
              learnerId: actor.id,
              classOfferingId: classId,
              state: 'DRAFT',
              text: dbText,
              storageKey: firstEligibleFile?.key ?? null,
              originalFileName: firstEligibleFile?.name ?? null,
              mimeType: firstEligibleFile?.mimeType ?? null,
              fileBytes: firstEligibleFile?.bytes ?? null,
              fileSha256: firstEligibleFile?.sha256 ?? null,
              lockVersion: 1,
            },
          });
        } else if (sub.state === 'DRAFT') {
          const nextLock = sub.lockVersion + 1;
          sub = await tx.classAssignmentSubmission.update({
            where: { id: sub.id },
            data: {
              revisionId,
              text: dbText,
              storageKey: firstEligibleFile?.key ?? (removeLegacy ? null : sub.storageKey),
              originalFileName: firstEligibleFile?.name ?? (removeLegacy ? null : sub.originalFileName),
              mimeType: firstEligibleFile?.mimeType ?? (removeLegacy ? null : sub.mimeType),
              fileBytes: firstEligibleFile?.bytes ?? (removeLegacy ? null : sub.fileBytes),
              fileSha256: firstEligibleFile?.sha256 ?? (removeLegacy ? null : sub.fileSha256),
              lockVersion: nextLock,
            },
          });
        }

        if (mode === 'SUBMIT' && sub.state === 'DRAFT') {
          const idempotencyKey = randomUUID();
          const requestHash = createHash('sha256')
            .update(
              JSON.stringify({
                activityId,
                enrollmentId,
                revisionId: sub.revisionId,
                text: sub.text,
                storageKey: sub.storageKey,
                idempotencyKey,
              }),
            )
            .digest('hex');
          sub = await tx.classAssignmentSubmission.update({
            where: { id: sub.id },
            data: {
              state: 'SUBMITTED',
              idempotencyKey,
              requestHash,
              submittedAt: scope.now,
              lockVersion: sub.lockVersion + 1,
            },
          });
        }

        await tx.$executeRawUnsafe(
          `INSERT INTO lms_local_assignment_submission_meta
             (activity_id, enrollment_id, submission_id, text_override, updated_at)
           VALUES ($1,$2,$3,$4,now())
           ON CONFLICT (activity_id, enrollment_id) DO UPDATE SET
             submission_id = EXCLUDED.submission_id,
             text_override = EXCLUDED.text_override,
             updated_at = now()`,
          activityId,
          enrollmentId,
          sub.id,
          textValue,
        );

        for (const rem of removedFiles) {
          await tx.$executeRawUnsafe(
            `DELETE FROM lms_local_assignment_submission_files WHERE id = $1 AND activity_id = $2`,
            rem.id,
            activityId,
          );
          const diskPath = this.findExistingFilePath(rem.storage_key);
          if (diskPath) await rm(diskPath, { force: true }).catch(() => undefined);
        }

        for (const item of storedNew) {
          await tx.$executeRawUnsafe(
            `INSERT INTO lms_local_assignment_submission_files
               (id, activity_id, enrollment_id, learner_id, class_offering_id, submission_id,
                storage_key, original_file_name, mime_type, file_bytes, file_sha256, kind)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            item.id,
            activityId,
            enrollmentId,
            actor.id,
            classId,
            sub.id,
            item.key,
            item.name,
            item.mimeType,
            item.bytes,
            item.sha256,
            item.kind,
          );
        }

        return this.loadWorkspaceInTx(tx, scope, classId, activityId);
      });
    } catch (err) {
      for (const k of createdKeys) {
        const p = this.resolveSafePath(this.localFilesRoot, k);
        await rm(p, { force: true }).catch(() => undefined);
      }
      throw err;
    }
  }

  async downloadSubmissionFile(actor: AuthorityActor, classId: string, activityId: string, fileId: string) {
    await this.ensureTables();
    return this.lms.run(actor, classId, async (tx, scope) => {
      await this.assertAssignment(tx, classId, activityId, !scope.teacher, scope.now);

      if (fileId.startsWith('legacy-')) {
        const subId = fileId.slice('legacy-'.length);
        const row = await tx.classAssignmentSubmission.findFirst({
          where: {
            id: subId,
            activityId,
            classOfferingId: classId,
            ...(scope.teacher ? { state: 'SUBMITTED' } : { enrollmentId: scope.enrollment!.id }),
          },
        });
        if (!row?.storageKey) throw new NotFoundException('Không tìm thấy tệp bài nộp.');
        const p = this.findExistingFilePath(row.storageKey);
        if (!p) throw new NotFoundException('Tệp không còn tồn tại trên máy chủ.');
        return {
          stream: createReadStream(p),
          mimeType: row.mimeType ?? 'application/octet-stream',
          fileName: row.originalFileName ?? 'bai-nop',
        };
      }

      const rows = (await tx.$queryRawUnsafe(
        `SELECT storage_key, original_file_name, mime_type, enrollment_id
           FROM lms_local_assignment_submission_files
          WHERE id = $1 AND activity_id = $2 AND class_offering_id = $3`,
        fileId,
        activityId,
        classId,
      )) as any[];
      const row = rows[0];
      if (!row) throw new NotFoundException('Không tìm thấy tệp bài nộp.');
      if (!scope.teacher && row.enrollment_id !== scope.enrollment?.id) {
        throw new ForbiddenException('Không có quyền tải tệp của học viên khác.');
      }
      if (scope.teacher) {
        const sub = await tx.classAssignmentSubmission.findUnique({
          where: { activityId_enrollmentId: { activityId, enrollmentId: row.enrollment_id } },
          select: { state: true },
        });
        if (sub?.state !== 'SUBMITTED') {
          throw new ForbiddenException('Bản nháp của học viên chưa nộp là riêng tư.');
        }
      }
      const p = this.findExistingFilePath(row.storage_key);
      if (!p) throw new NotFoundException('Tệp không còn tồn tại trên máy chủ.');
      return {
        stream: createReadStream(p),
        mimeType: row.mime_type,
        fileName: row.original_file_name,
      };
    });
  }

  async downloadAllSubmissionsZip(actor: AuthorityActor, classId: string, activityId: string) {
    await this.ensureTables();
    return this.lms.run(
      actor,
      classId,
      async (tx) => {
        const { activity } = await this.assertAssignment(tx, classId, activityId, false, new Date());
        const rows = await tx.classAssignmentSubmission.findMany({
          where: {
            activityId,
            classOfferingId: classId,
            state: 'SUBMITTED',
            enrollment: { status: 'ACTIVE' },
          },
          include: { learner: { select: { id: true, fullName: true, email: true } } },
          orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
        });
        if (rows.length === 0) {
          throw new BadRequestException('Chưa có bài nộp nào trong lớp để nén ZIP.');
        }

        const entries: ZipEntry[] = [];
        const usedPaths = new Set<string>();
        const uniquePath = (folder: string, rawFileName: string) => {
          const clean = basename(rawFileName).replace(/[\\/:*?"<>|\r\n\0]+/g, '_') || 'tep';
          const dotIdx = clean.lastIndexOf('.');
          const stem = dotIdx > 0 ? clean.slice(0, dotIdx) : clean;
          const ext = dotIdx > 0 ? clean.slice(dotIdx) : '';
          let candidate = `${folder}/${clean}`;
          let idx = 1;
          while (usedPaths.has(candidate.toLowerCase())) {
            candidate = `${folder}/${stem}(${idx})${ext}`;
            idx += 1;
          }
          usedPaths.add(candidate.toLowerCase());
          return candidate;
        };

        for (const row of rows) {
          const submittedDate = formatZipDateVn(row.submittedAt ?? row.updatedAt ?? row.createdAt);
          const folder = `${sanitizeZipSegment(row.learner.fullName)}_${submittedDate}_${row.id.slice(0, 6)}`;
          const localRows = (await tx.$queryRawUnsafe(
            `SELECT storage_key, original_file_name, created_at
               FROM lms_local_assignment_submission_files
              WHERE activity_id = $1 AND enrollment_id = $2
              ORDER BY created_at ASC`,
            activityId,
            row.enrollmentId,
          )) as any[];

          for (const lf of localRows) {
            const path = this.findExistingFilePath(lf.storage_key);
            if (!path) continue;
            entries.push({
              name: uniquePath(folder, lf.original_file_name),
              data: await readFile(path),
              mtime: lf.created_at ? new Date(lf.created_at) : undefined,
            });
          }

          if (row.storageKey && !localRows.some((r) => r.storage_key === row.storageKey)) {
            const path = this.findExistingFilePath(row.storageKey);
            if (path) {
              entries.push({
                name: uniquePath(folder, row.originalFileName ?? 'bai-nop'),
                data: await readFile(path),
                mtime: row.submittedAt ?? row.updatedAt,
              });
            }
          }

          const metaRows = (await tx.$queryRawUnsafe(
            `SELECT text_override FROM lms_local_assignment_submission_meta WHERE activity_id = $1 AND enrollment_id = $2`,
            activityId,
            row.enrollmentId,
          )) as any[];
          const textBody = metaRows[0]?.text_override ?? row.text;
          if (textBody && textBody.trim()) {
            const header = `Hoc vien: ${row.learner.fullName} (${row.learner.email})\nNop luc: ${row.submittedAt?.toISOString() ?? ''}\n\n`;
            entries.push({
              name: uniquePath(folder, 'bai-lam-van-ban.txt'),
              data: Buffer.from(header + textBody, 'utf8'),
              mtime: row.submittedAt ?? row.updatedAt,
            });
          }
        }

        if (entries.length === 0) {
          throw new BadRequestException('Không tìm thấy tệp hay nội dung bài nộp nào để đóng gói ZIP.');
        }

        const archive = buildZipArchive(entries);
        const safeTitle = sanitizeZipSegment(activity.title);
        return {
          buffer: archive,
          fileName: `${safeTitle || 'bai-nop'}-tat-ca-bai-nop.zip`,
        };
      },
      true,
    );
  }

  async gradeSubmission(
    actor: AuthorityActor,
    classId: string,
    activityId: string,
    submissionId: string,
    body: { score?: number | null; feedback?: string; publish?: boolean },
  ) {
    await this.ensureTables();
    return this.lms.run(
      actor,
      classId,
      async (tx, scope) => {
        await this.assertAssignment(tx, classId, activityId, false, scope.now);
        const config = await this.readConfig(tx, activityId);
        const sub = await tx.classAssignmentSubmission.findFirst({
          where: { id: submissionId, activityId, classOfferingId: classId, state: 'SUBMITTED' },
          select: { id: true },
        });
        if (!sub) throw new NotFoundException('Không tìm thấy bài nộp đã gửi để chấm.');

        const maxScore = config.maxScore;
        const score =
          body.score === null || body.score === undefined || String(body.score) === ''
            ? null
            : Number(body.score);
        if (score !== null && (!Number.isFinite(score) || score < 0 || score > maxScore)) {
          throw new BadRequestException(`Điểm phải nằm trong khoảng 0 đến ${maxScore}.`);
        }
        const feedback = String(body.feedback ?? '').trim();
        const publish = Boolean(body.publish);
        const nextState = publish ? 'PUBLISHED' : 'DRAFT';

        await tx.$executeRawUnsafe(
          `INSERT INTO lms_local_assignment_grades
             (submission_id, activity_id, class_offering_id, score, max_score, feedback, state, graded_by_id, graded_at, published_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(), CASE WHEN $7 = 'PUBLISHED' THEN now() ELSE NULL END, now())
           ON CONFLICT (submission_id) DO UPDATE SET
             score = EXCLUDED.score,
             max_score = EXCLUDED.max_score,
             feedback = EXCLUDED.feedback,
             state = EXCLUDED.state,
             graded_by_id = EXCLUDED.graded_by_id,
             graded_at = now(),
             published_at = CASE WHEN EXCLUDED.state = 'PUBLISHED' THEN COALESCE(lms_local_assignment_grades.published_at, now()) ELSE NULL END,
             updated_at = now()`,
          submissionId,
          activityId,
          classId,
          score,
          maxScore,
          feedback,
          nextState,
          actor.id,
        );

        return this.readDirectGrade(tx, submissionId, maxScore, true);
      },
      true,
    );
  }

  async getClassActivityKinds(actor: AuthorityActor, classId: string) {
    await this.ensureTables();
    return this.lms.run(actor, classId, (tx) => getClassActivityKindsInTx(tx, classId));
  }

  async uploadQuizMedia(
    actor: AuthorityActor,
    classId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ): Promise<QuizMediaItem> {
    await this.ensureTables();
    if (!file) {
      throw new BadRequestException('Vui lòng chọn tệp hình ảnh hoặc âm thanh.');
    }
    let storedKey: string | null = null;
    try {
      return await this.lms.run(
        actor,
        classId,
        async (tx) => {
          const stored = await this.storeUploadedFile(file, 25 * 1024 * 1024, QUIZ_MEDIA_EXTS);
          storedKey = stored.key;
          const ext = extname(stored.name).toLowerCase();
          const kind: 'IMAGE' | 'AUDIO' =
            QUIZ_AUDIO_EXTS.has(ext) || stored.mimeType.startsWith('audio/') ? 'AUDIO' : 'IMAGE';
          const id = randomUUID();
          await tx.$executeRawUnsafe(
            `INSERT INTO lms_local_quiz_media_files
               (id, class_offering_id, storage_key, kind, original_file_name, mime_type, file_bytes, uploaded_by_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            id,
            classId,
            stored.key,
            kind,
            stored.name,
            stored.mimeType,
            stored.bytes,
            actor.id,
          );
          return {
            id,
            kind,
            name: stored.name,
            mimeType: stored.mimeType,
            bytes: stored.bytes,
            url: `/api/v2/lms-local/classes/${classId}/quiz-media/${id}`,
          };
        },
        true,
      );
    } catch (err) {
      if (storedKey) {
        const path = this.findExistingFilePath(storedKey);
        if (path) await rm(path, { force: true }).catch(() => undefined);
      }
      throw err;
    }
  }

  async openQuizMedia(actor: AuthorityActor, classId: string, mediaId: string) {
    await this.ensureTables();
    return this.lms.run(actor, classId, async (tx) => {
      const rows = (await tx.$queryRawUnsafe(
        `SELECT storage_key, original_file_name, mime_type
           FROM lms_local_quiz_media_files
          WHERE id = $1 AND class_offering_id = $2`,
        mediaId,
        classId,
      )) as any[];
      const row = rows[0];
      if (!row) {
        throw new NotFoundException('Không tìm thấy tệp hình ảnh hoặc âm thanh.');
      }
      const path = this.findExistingFilePath(String(row.storage_key));
      if (!path) {
        throw new NotFoundException('Tệp không còn tồn tại trên máy chủ.');
      }
      return {
        path,
        mimeType: String(row.mime_type || 'application/octet-stream'),
        fileName: String(row.original_file_name || 'quiz-media'),
      };
    });
  }

  async createLocalQuiz(
    actor: AuthorityActor,
    classId: string,
    sectionId: string,
    body: SaveLocalQuizPayload,
  ) {
    await this.ensureTables();
    return this.lms.run(
      actor,
      classId,
      (tx) => saveLocalQuizInTx(tx, actor.id, classId, sectionId, undefined, body),
      true,
    );
  }

  async updateLocalQuiz(
    actor: AuthorityActor,
    classId: string,
    activityId: string,
    body: SaveLocalQuizPayload,
  ) {
    await this.ensureTables();
    return this.lms.run(
      actor,
      classId,
      (tx) => saveLocalQuizInTx(tx, actor.id, classId, undefined, activityId, body),
      true,
    );
  }

  async getQuizWorkspace(actor: AuthorityActor, classId: string, activityId: string) {
    await this.ensureTables();
    return this.lms.run(actor, classId, (tx, scope) =>
      getQuizWorkspaceInTx(tx, scope, classId, activityId),
    );
  }

  async startQuizAttempt(actor: AuthorityActor, classId: string, activityId: string) {
    await this.ensureTables();
    return this.lms.run(actor, classId, (tx, scope) =>
      startQuizAttemptInTx(tx, scope, classId, activityId),
    );
  }

  async saveOrSubmitQuizAttempt(
    actor: AuthorityActor,
    classId: string,
    activityId: string,
    attemptId: string,
    body: { answers?: QuizAnswerSubmission[]; submit?: boolean },
  ) {
    await this.ensureTables();
    return this.lms.run(actor, classId, (tx, scope) =>
      saveOrSubmitQuizAttemptInTx(tx, scope, classId, activityId, attemptId, body),
    );
  }

  async gradeQuizEssayAttempt(
    actor: AuthorityActor,
    classId: string,
    activityId: string,
    attemptId: string,
    body: {
      scoresByQuestionId?: Record<string, { score: number; comment?: string }>;
      teacherFeedback?: string;
      publishGrade?: boolean;
    },
  ) {
    await this.ensureTables();
    return this.lms.run(
      actor,
      classId,
      (tx, scope) => gradeQuizEssayInTx(tx, scope, actor.id, classId, activityId, attemptId, body),
      true,
    );
  }

  async getQuestionBank(actor: AuthorityActor, classId: string, query: QuestionBankQuery) {
    await this.ensureTables();
    return this.lms.run(
      actor,
      classId,
      (tx) => listClassQuestionBank(tx, classId, query),
      true,
    );
  }

  async getUnifiedResults(actor: AuthorityActor, classId: string) {
    await this.ensureTables();
    return this.lms.run(actor, classId, (tx, scope) =>
      buildUnifiedClassResults(tx, classId, {
        editable: scope.teacher,
        studentEnrollmentId: scope.enrollment?.id ?? null,
        studentUserId: scope.enrollment?.learnerId ?? null,
      }),
    );
  }

  async createLocalAttendance(
    actor: AuthorityActor,
    classId: string,
    sectionId: string,
    body: SaveLocalAttendancePayload,
  ) {
    await this.ensureTables();
    return this.lms.run(
      actor,
      classId,
      (tx) => saveLocalAttendanceInTx(tx, actor.id, classId, sectionId, undefined, body),
      true,
    );
  }

  async updateLocalAttendance(
    actor: AuthorityActor,
    classId: string,
    activityId: string,
    body: SaveLocalAttendancePayload,
  ) {
    await this.ensureTables();
    return this.lms.run(
      actor,
      classId,
      (tx) => saveLocalAttendanceInTx(tx, actor.id, classId, undefined, activityId, body),
      true,
    );
  }

  async getAttendanceWorkspace(actor: AuthorityActor, classId: string, activityId: string) {
    await this.ensureTables();
    return this.lms.run(actor, classId, (tx, scope) =>
      getAttendanceWorkspaceInTx(tx, scope, classId, activityId),
    );
  }

  async studentAttendanceCheckIn(
    actor: AuthorityActor,
    classId: string,
    activityId: string,
    body: { code?: string; note?: string },
  ) {
    await this.ensureTables();
    return this.lms.run(actor, classId, (tx, scope) =>
      checkInAttendanceInTx(tx, scope, classId, activityId, body),
    );
  }

  async teacherMarkAttendance(
    actor: AuthorityActor,
    classId: string,
    activityId: string,
    body: { enrollmentId: string; status: 'PRESENT' | 'LATE' | 'NOT_RECORDED'; note?: string },
  ) {
    await this.ensureTables();
    return this.lms.run(
      actor,
      classId,
      (tx, scope) => markAttendanceRecordInTx(tx, scope, classId, activityId, body),
      true,
    );
  }
}
