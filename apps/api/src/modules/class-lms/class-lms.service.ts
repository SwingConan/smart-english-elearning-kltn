import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  Prisma,
  type ClassActivity,
  type ClassActivityRevision,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthorizationService, type AuthorityActor } from '../authorization/authorization.service';
import {
  currentAssignmentWindow,
  effectiveInstructorScope,
} from '../authorization/instructor-scope';
import { LearningResourceStorage } from '../learning/learning-resource.storage';
import { ActivityDto, type OrderDto } from './class-lms.dto';
import { safeClassResourceUrl } from './class-lms.policy';
type Tx = Prisma.TransactionClient;
const missing = () => new NotFoundException('Class learning content not available');
@Injectable()
export class ClassLmsService {
  private archiveTableReady = false;
  constructor(
    private readonly db: PrismaService,
    private readonly authority: AuthorizationService,
    private readonly storage: LearningResourceStorage,
  ) {}
  async ensureArchiveTable() {
    if (this.archiveTableReady || typeof this.db?.$executeRawUnsafe !== 'function') return;
    await this.db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS lms_local_archived_content (
        entity_id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        class_offering_id TEXT NOT NULL,
        archived_by_id TEXT NOT NULL,
        archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await this.db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_lms_local_archived_class
      ON lms_local_archived_content (class_offering_id);
    `);
    this.archiveTableReady = true;
  }
  private async archivedIds(tx: Tx, classId: string) {
    const sections = new Set<string>();
    const activities = new Set<string>();
    if (typeof tx.$queryRawUnsafe !== 'function') return { sections, activities };
    const reg = (await tx.$queryRawUnsafe(
      `SELECT to_regclass('lms_local_archived_content')::text AS tbl`,
    )) as Array<{ tbl: string | null }>;
    if (!reg[0]?.tbl) return { sections, activities };
    const rows = (await tx.$queryRawUnsafe(
      `SELECT entity_id, entity_type FROM lms_local_archived_content WHERE class_offering_id = $1`,
      classId,
    )) as Array<{ entity_id: string; entity_type: string }>;
    for (const r of rows) {
      if (r.entity_type === 'SECTION') sections.add(String(r.entity_id));
      else if (r.entity_type === 'ACTIVITY') activities.add(String(r.entity_id));
    }
    return { sections, activities };
  }
  async now(tx: Tx) {
    const [r] = await tx.$queryRaw<
      { ms: number }[]
    >`SELECT (EXTRACT(EPOCH FROM clock_timestamp())*1000)::double precision AS ms`;
    return new Date(r.ms);
  }
  async context(tx: Tx, actor: AuthorityActor) {
    const [s] = await tx.$queryRaw<
      { sid: string }[]
    >`SELECT sid FROM user_sessions WHERE sid=${actor.sessionId} AND sess->>'userId'=${actor.id} AND expire>clock_timestamp()`;
    const u = await tx.user.findFirst({
      where: { id: actor.id, status: 'ACTIVE' },
      select: { id: true, role: true },
    });
    if (!s || !u) throw missing();
    return u;
  }
  async access(tx: Tx, actor: AuthorityActor, classId: string, write = false) {
    const u = await this.context(tx, actor),
      now = await this.now(tx);
    if (u.role === 'INSTRUCTOR') {
      const c = await tx.classOffering.findFirst({
        where: {
          AND: [{ id: classId }, effectiveInstructorScope(u.id, currentAssignmentWindow(now))],
        },
      });
      if (!c) throw missing();
      return { class: c, teacher: true, enrollment: null, now };
    }
    if (!write && u.role === 'STUDENT') {
      const enrollment = await tx.enrollment.findFirst({
        where: { learnerId: u.id, classOfferingId: classId, status: { in: ['ACTIVE', 'COMPLETED'] } },
        include: { classOffering: true },
      });
      if (enrollment) return { class: enrollment.classOffering, teacher: false, enrollment, now };
    }
    throw missing();
  }
  async run<T>(
    actor: AuthorityActor,
    classId: string,
    work: (tx: Tx, scope: Awaited<ReturnType<ClassLmsService['access']>>) => Promise<T>,
    write = false,
  ) {
    try {
      return await this.db.$transaction(
        async (tx) => {
          // Same lock discipline as W01 authority/W02 assignment mutations; check AFTER acquisition.
          await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
          const scope = await this.access(tx, actor, classId, write);
          await tx.$queryRaw`SELECT set_config('app.class_lms_actor',${actor.id},true),set_config('app.class_lms_session',${actor.sessionId},true)`;
          return work(tx, scope);
        },
        { maxWait: 10000, timeout: 15000 },
      );
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034', 'P2003'].includes(e.code)
      )
        throw new ConflictException('Class content changed; reload before retry');
      throw e;
    }
  }
  private cas(actual: number, expected: number) {
    if (actual !== expected) throw new ConflictException('STALE_CLASS_CONTENT');
  }
  visible(r: ClassActivityRevision, now: Date) {
    return (
      (!r.availableFrom || r.availableFrom <= now) && (!r.availableUntil || r.availableUntil > now)
    );
  }
  readable(r: ClassActivityRevision, now: Date, localKind?: string | null) {
    if (localKind === 'LOCAL_ATTENDANCE' || localKind === 'LOCAL_QUIZ') return true;
    return r.type === 'ASSIGNMENT'
      ? !r.availableFrom || r.availableFrom <= now
      : this.visible(r, now);
  }
  private project(r: ClassActivity | ClassActivityRevision, full = true) {
    // Explicit public content fields only: never return private storage keys or actor IDs.
    return {
      id: r.id,
      type: r.type,
      title: r.title,
      introduction: r.introduction,
      ...(full ? { contentMarkdown: r.contentMarkdown } : {}),
      resourceUrl: r.resourceUrl,
      file: r.storageKey
        ? {
            name: r.originalFileName,
            mimeType: r.mimeType,
            bytes: r.fileBytes,
            sha256: r.fileSha256,
          }
        : null,
      availableFrom: r.availableFrom,
      availableUntil: r.availableUntil,
    };
  }
  async activity(tx: Tx, classId: string, id: string) {
    const r = await tx.classActivity.findFirst({
      where: { id, section: { classOfferingId: classId } },
      include: { publishedRevision: true, section: { select: { publishedRevisionId: true } } },
    });
    if (!r) throw missing();
    return r;
  }
  async tree(actor: AuthorityActor, classId: string) {
    await this.ensureArchiveTable();
    return this.run(actor, classId, async (tx, s) => {
      const archived = await this.archivedIds(tx, classId);
      const rawSections = await tx.classSection.findMany({
        where: { classOfferingId: classId },
        orderBy: { orderIndex: 'asc' },
        include: {
          publishedRevision: true,
          activities: { orderBy: { orderIndex: 'asc' }, include: { publishedRevision: true } },
        },
      });
      const sections = rawSections
        .filter((sec) => !archived.sections.has(sec.id))
        .map((sec) => ({
          ...sec,
          activities: sec.activities.filter((a) => !archived.activities.has(a.id)),
        }));
      const progress = s.enrollment
        ? await tx.classActivityProgress.findMany({ where: { enrollmentId: s.enrollment.id } })
        : [];
      const submissions = s.enrollment
        ? await tx.classAssignmentSubmission.findMany({
            where: { enrollmentId: s.enrollment.id },
            select: { activityId: true, state: true },
          })
        : [];
      const w06Enabled = process.env.W06_ENABLED === 'DEV_DEC047';
      let localKindMap = new Map<string, string>();
      let quizConfigMap = new Map<string, { assessmentKind: string; releaseMode: string }>();
      let localDoneIds = new Set<string>();
      if (typeof tx.$queryRawUnsafe === 'function') {
        try {
          const [kindRows, quizCfgRows, quizDoneRows, attDoneRows] = await Promise.all([
            tx.$queryRawUnsafe(
              `SELECT activity_id, kind FROM lms_local_activity_kinds WHERE class_offering_id = $1`,
              classId,
            ) as Promise<any[]>,
            tx.$queryRawUnsafe(
              `SELECT c.activity_id, c.assessment_kind, c.release_mode
                 FROM lms_local_quiz_configs c
                 JOIN class_activities a ON a.id::text = c.activity_id
                 JOIN class_sections sec ON sec.id = a."sectionId"
                WHERE sec."classOfferingId"::text = $1`,
              classId,
            ) as Promise<any[]>,
            s.enrollment
              ? (tx.$queryRawUnsafe(
                  `SELECT DISTINCT activity_id FROM lms_local_quiz_attempts
                    WHERE class_offering_id = $1 AND learner_id = $2 AND status = 'SUBMITTED'`,
                  classId,
                  s.enrollment.learnerId,
                ) as Promise<Array<{ activity_id: string }>>)
              : Promise.resolve([]),
            s.enrollment
              ? (tx.$queryRawUnsafe(
                  `SELECT DISTINCT activity_id FROM lms_local_attendance_records
                    WHERE class_offering_id = $1 AND learner_id = $2`,
                  classId,
                  s.enrollment.learnerId,
                ) as Promise<Array<{ activity_id: string }>>)
              : Promise.resolve([]),
          ]);
          localKindMap = new Map(kindRows.map((k) => [String(k.activity_id), String(k.kind)]));
          quizConfigMap = new Map(
            quizCfgRows.map((c) => [
              String(c.activity_id),
              {
                assessmentKind: String(c.assessment_kind || 'QUIZ'),
                releaseMode: String(c.release_mode || 'AUTO_ON_SUBMIT'),
              },
            ]),
          );
          localDoneIds = new Set([...quizDoneRows, ...attDoneRows].map((x) => String(x.activity_id)));
        } catch {
          // Local tables might not be initialized yet; keep tree readable.
        }
      }
      let formalAssessmentCount = 0;
      let draftCoreQuizCount = 0;
      if (tx.classAssessment?.findMany) {
        const assessments = await tx.classAssessment.findMany({
          where: { classOfferingId: classId },
          select: { isActive: true, test: { select: { quizState: true } } },
        });
        formalAssessmentCount = assessments.filter((ca) => ca.isActive).length;
      }
      for (const sec of sections) {
        for (const act of sec.activities) {
          if (act.type === 'QUIZ' && act.state === 'DRAFT') {
            draftCoreQuizCount += 1;
          }
        }
      }
      const officialSessionsRaw = tx.teachingSession?.findMany
        ? await tx.teachingSession.findMany({
            where: {
              classOfferingId: classId,
              state: 'PUBLISHED' as const,
              intent: { in: ['PUBLISH' as const, 'RESCHEDULE' as const] },
            },
            orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
            include: {
              room: { select: { id: true, code: true, name: true } },
              w06MeetSession: w06Enabled
                ? {
                    orderBy: [{ number: 'desc' as const }, { createdAt: 'desc' as const }],
                    take: 1,
                    select: { id: true, url: true, state: true },
                  }
                : false,
              w06WindowSession: w06Enabled
                ? {
                    orderBy: { createdAt: 'desc' as const },
                    take: 1,
                    select: { id: true, startsAt: true, endsAt: true },
                  }
                : false,
            },
          })
        : [];
      const officialSessions = officialSessionsRaw.map((ts: any) => {
        const win = ts.w06WindowSession?.[0];
        const winState = !win
          ? null
          : win.startsAt <= s.now && win.endsAt > s.now
            ? 'OPEN'
            : 'CLOSED';
        return {
          id: ts.id,
          occurrenceId: ts.occurrenceId,
          revision: ts.revision,
          startsAt: ts.startsAt,
          endsAt: ts.endsAt,
          timezone: ts.timezone,
          modality: ts.modality,
          room: ts.room ?? null,
          approvedMeetUrl:
            ts.w06MeetSession?.[0]?.state === 'APPROVED' ? ts.w06MeetSession[0].url : null,
          attendanceWindowState: winState,
        };
      });
      return {
        class: {
          id: s.class.id,
          code: s.class.code,
          name: s.class.name,
          modality: s.class.modality,
        },
        editable: s.teacher,
        sessionEngagementEnabled: w06Enabled,
        formalAssessmentCount,
        draftCoreQuizCount,
        officialSessions,
        sections: sections.flatMap((section) => {
          const metadata = section.publishedRevision;
          const accessible = section.activities.filter(
            (a) =>
              a.state === 'PUBLISHED' &&
              a.publishedRevision &&
              this.readable(a.publishedRevision, s.now, localKindMap.get(a.id)),
          );
          if (!s.teacher && (!metadata || !accessible.length)) return [];
          return [
            {
              id: section.id,
              title: s.teacher ? section.title : metadata!.title,
              introduction: s.teacher ? section.introduction : metadata!.introduction,
              orderIndex: section.orderIndex,
              ...(s.teacher
                ? {
                    lockVersion: section.lockVersion,
                    publishedMetadata: metadata
                      ? {
                          title: metadata.title,
                          introduction: metadata.introduction,
                          number: metadata.number,
                        }
                      : null,
                    hasDraftChanges:
                      !metadata ||
                      section.title !== metadata.title ||
                      section.introduction !== metadata.introduction,
                  }
                : {}),
              activities: section.activities.flatMap((a) => {
                const r = a.publishedRevision;
                const localKind = localKindMap.get(a.id) ?? null;
                if (!s.teacher && (a.state !== 'PUBLISHED' || !r || !this.readable(r, s.now, localKind)))
                  return [];
                const row = s.teacher ? a : r!;
                const qCfg = quizConfigMap.get(a.id);
                return [
                  {
                    ...this.project(row, false),
                    id: a.id,
                    revisionId: r?.id ?? null,
                    revisionNumber: a.revisionNumber,
                    state: a.state,
                    orderIndex: a.orderIndex,
                    ...(localKind ? { localKind } : {}),
                    ...(qCfg
                      ? {
                          assessmentKind: qCfg.assessmentKind,
                          releaseMode: qCfg.releaseMode,
                        }
                      : {}),
                    ...(s.teacher
                      ? {
                          lockVersion: a.lockVersion,
                          sourceLessonId: a.sourceLessonId,
                          sourceResourceId: a.sourceResourceId,
                          sourceUpdatedAt: a.sourceUpdatedAt,
                        }
                      : {}),
                    progress: localDoneIds.has(a.id)
                      ? 'COMPLETED'
                      : (progress.find((p) => p.revisionId === r?.id)?.status ?? 'NOT_STARTED'),
                    ...(a.type === 'ASSIGNMENT' && !s.teacher
                      ? {
                          submissionState:
                            submissions.find((p) => p.activityId === a.id)?.state ?? null,
                        }
                      : {}),
                  },
                ];
              }),
            },
          ];
        }),
      };
    });
  }
  section(
    actor: AuthorityActor,
    classId: string,
    input: { title: string; introduction: string; expectedLockVersion?: number },
    id?: string,
  ) {
    if (!input.title.trim()) throw new BadRequestException('Title required');
    return this.run(
      actor,
      classId,
      async (tx) => {
        let result;
        if (id) {
          const r = await tx.classSection.findFirst({ where: { id, classOfferingId: classId } });
          if (!r) throw missing();
          this.cas(r.lockVersion, input.expectedLockVersion!);
          result = await tx.classSection.update({
            where: { id },
            data: {
              title: input.title.trim(),
              introduction: input.introduction,
              updatedById: actor.id,
              lockVersion: { increment: 1 },
            },
          });
        } else {
          if ((await tx.classSection.count({ where: { classOfferingId: classId } })) >= 100)
            throw new BadRequestException('Maximum100 sections');
          const last = await tx.classSection.aggregate({
            where: { classOfferingId: classId },
            _max: { orderIndex: true },
          });
          result = await tx.classSection.create({
            data: {
              classOfferingId: classId,
              title: input.title.trim(),
              introduction: input.introduction,
              orderIndex: (last._max.orderIndex ?? -1) + 1,
              createdById: actor.id,
              updatedById: actor.id,
            },
          });
        }
        await this.authority.audit(
          tx,
          actor.id,
          'W03_SECTION_SAVE',
          'CLASS_SECTION',
          result.id,
          'Class-local section authoring',
        );
        return result;
      },
      true,
    );
  }
  publishSection(actor: AuthorityActor, classId: string, id: string, expected: number) {
    return this.run(
      actor,
      classId,
      async (tx) => {
        const s = await tx.classSection.findFirst({ where: { id, classOfferingId: classId } });
        if (!s) throw missing();
        this.cas(s.lockVersion, expected);
        const r = await tx.classSectionRevision.create({
          data: {
            sectionId: id,
            number: s.revisionNumber + 1,
            title: s.title,
            introduction: s.introduction,
            sourceLockVersion: s.lockVersion,
            publishedById: actor.id,
          },
        });
        const result = await tx.classSection.update({
          where: { id },
          data: {
            publishedRevisionId: r.id,
            revisionNumber: r.number,
            lockVersion: { increment: 1 },
            updatedById: actor.id,
          },
        });
        await this.authority.audit(
          tx,
          actor.id,
          'W03_SECTION_PUBLISH',
          'CLASS_SECTION',
          id,
          'Explicit class-local metadata publication; prior snapshots retained',
        );
        return {
          id: result.id,
          lockVersion: result.lockVersion,
          revisionId: r.id,
          revisionNumber: r.number,
        };
      },
      true,
    );
  }
  private async draft(
    tx: Tx,
    classId: string,
    input: ActivityDto,
    createdFile: (key: string) => void,
  ) {
    if (
      ['ASSIGNMENT', 'QUIZ'].includes(input.type) &&
      (input.resourceUrl ||
        input.sourceLessonId ||
        input.sourceResourceId ||
        (input.type === 'QUIZ' && (input.availableFrom || input.availableUntil)))
    )
      throw new BadRequestException(
        'Assignment templates are not supported; configure Quiz dates on its approved source',
      );
    if (!input.title.trim()) throw new BadRequestException('Title required');
    const from = input.availableFrom ? new Date(input.availableFrom) : null,
      until = input.availableUntil ? new Date(input.availableUntil) : null;
    if (from && until && until <= from)
      throw new BadRequestException('Invalid availability interval');
    let markdown = input.contentMarkdown,
      resourceUrl = input.resourceUrl ? safeClassResourceUrl(input.resourceUrl) : null;
    let sourceUpdatedAt: Date | null = null,
      storageKey: string | null = null,
      originalFileName: string | null = null,
      mimeType: string | null = null,
      fileBytes: number | null = null,
      fileSha256: string | null = null;
    if (input.sourceLessonId && input.sourceResourceId)
      throw new BadRequestException('One typed source only');
    if (input.sourceLessonId) {
      if (input.type !== 'LESSON') throw new BadRequestException('Lesson source type mismatch');
      const lesson = await tx.lesson.findFirst({
        where: {
          id: input.sourceLessonId,
          module: { course: { isPublished: true, classOfferings: { some: { id: classId } } } },
        },
      });
      if (!lesson) throw missing();
      if (lesson.updatedAt.toISOString() !== input.expectedSourceUpdatedAt)
        throw new ConflictException('Source lesson changed');
      markdown = lesson.contentMarkdown ?? lesson.description ?? '';
      sourceUpdatedAt = lesson.updatedAt;
    }
    if (input.sourceResourceId) {
      if (input.type !== 'RESOURCE') throw new BadRequestException('Resource source type mismatch');
      const r = await tx.learningResource.findFirst({
        where: {
          id: input.sourceResourceId,
          lesson: {
            module: { course: { isPublished: true, classOfferings: { some: { id: classId } } } },
          },
        },
      });
      if (!r) throw missing();
      if (r.updatedAt.toISOString() !== input.expectedSourceUpdatedAt)
        throw new ConflictException('Source resource changed');
      if (r.storageKey) {
        const metadata = await this.storage.stat(r.storageKey).catch(() => {
          throw missing();
        });
        if (metadata.sizeBytes > 20 * 1024 * 1024)
          throw new BadRequestException('Source file too large');
        const chunks: Buffer[] = [];
        let size = 0;
        try {
          for await (const chunk of this.storage.open(r.storageKey)) {
            const b = Buffer.from(chunk);
            size += b.length;
            if (size > 20 * 1024 * 1024) throw new BadRequestException('Source file too large');
            chunks.push(b);
          }
        } catch {
          throw missing();
        }
        const buffer = Buffer.concat(chunks),
          file = await this.storage.put({
            buffer,
            size: buffer.length,
            mimetype: r.mimeType ?? '',
            originalname: r.originalFileName ?? '',
          });
        createdFile(file.key);
        storageKey = file.key;
        originalFileName = file.originalFileName;
        mimeType = file.mimeType;
        fileBytes = file.bytes;
        fileSha256 = createHash('sha256').update(buffer).digest('hex');
        resourceUrl = null;
      } else if (r.url) resourceUrl = safeClassResourceUrl(r.url);
      else throw new BadRequestException('Source resource has no delivery');
      sourceUpdatedAt = r.updatedAt;
    }
    if (input.type === 'LESSON' && (resourceUrl || input.sourceResourceId))
      throw new BadRequestException('Lesson has no resource delivery');
    if (input.type === 'RESOURCE' && input.contentMarkdown.trim())
      throw new BadRequestException('Use introduction for resource description');
    return {
      type: input.type,
      title: input.title.trim(),
      introduction: input.introduction,
      contentMarkdown: markdown,
      resourceUrl,
      storageKey,
      originalFileName,
      mimeType,
      fileBytes,
      fileSha256,
      sourceLessonId: input.sourceLessonId ?? null,
      sourceResourceId: input.sourceResourceId ?? null,
      sourceUpdatedAt,
      availableFrom: from,
      availableUntil: until,
    };
  }
  async saveActivity(
    actor: AuthorityActor,
    classId: string,
    sectionId: string,
    input: ActivityDto & { expectedLockVersion?: number },
    id?: string,
  ) {
    let copiedKey: string | undefined;
    try {
      return await this.run(
        actor,
        classId,
        async (tx) => {
          const section = await tx.classSection.findFirst({
            where: { id: sectionId, classOfferingId: classId },
          });
          if (!section) throw missing();
          const data = await this.draft(tx, classId, input, (k) => {
            copiedKey = k;
          });
          let result;
          if (id) {
            const old = await this.activity(tx, classId, id);
            if (old.sectionId !== sectionId || old.type !== input.type)
              throw new ConflictException('Activity cannot change owner or type');
            this.cas(old.lockVersion, input.expectedLockVersion!);
            // Preserve an uploaded file unless the teacher explicitly switches to a link/source.
            if (
              old.storageKey &&
              input.type === 'RESOURCE' &&
              !input.resourceUrl &&
              !input.sourceResourceId
            ) {
              Object.assign(data, {
                storageKey: old.storageKey,
                originalFileName: old.originalFileName,
                mimeType: old.mimeType,
                fileBytes: old.fileBytes,
                fileSha256: old.fileSha256,
              });
            }
            result = await tx.classActivity.update({
              where: { id },
              data: {
                ...data,
                state: 'DRAFT',
                lockVersion: { increment: 1 },
                updatedById: actor.id,
              },
            });
          } else {
            if ((await tx.classActivity.count({ where: { sectionId } })) >= 200)
              throw new BadRequestException('Maximum200 activities per section');
            if (
              (await tx.classActivity.count({
                where: { section: { classOfferingId: classId } },
              })) >= 500
            )
              throw new BadRequestException('Maximum500 activities per class');
            const last = await tx.classActivity.aggregate({
              where: { sectionId },
              _max: { orderIndex: true },
            });
            result = await tx.classActivity.create({
              data: {
                ...data,
                sectionId,
                orderIndex: (last._max.orderIndex ?? -1) + 1,
                createdById: actor.id,
                updatedById: actor.id,
              },
            });
          }
          await this.authority.audit(
            tx,
            actor.id,
            'W03_ACTIVITY_DRAFT',
            'CLASS_ACTIVITY',
            result.id,
            'Class-local draft saved; previous immutable publication retained',
          );
          return {
            ...this.project(result),
            id: result.id,
            sectionId,
            state: result.state,
            lockVersion: result.lockVersion,
          };
        },
        true,
      );
    } catch (e) {
      if (copiedKey) await this.storage.delete(copiedKey);
      throw e;
    }
  }
  publish(actor: AuthorityActor, classId: string, id: string, expected: number, hide = false) {
    return this.run(
      actor,
      classId,
      async (tx) => {
        const a = await this.activity(tx, classId, id);
        this.cas(a.lockVersion, expected);
        if (!hide && a.type === 'ASSIGNMENT' && !a.contentMarkdown.trim())
          throw new BadRequestException('Assignment instructions required');
        let quizTestId: string | null = null;
        if (!hide && a.type === 'QUIZ') {
          const source = await tx.test.findFirst({
            where: { quizActivityId: id },
            orderBy: { quizVersion: 'desc' },
          });
          if (!source || source.quizState !== 'APPROVED')
            throw new ConflictException('Independent approved Quiz source required');
          quizTestId = source.id;
        }
        let revisionId = a.publishedRevisionId,
          number = a.revisionNumber;
        if (!hide) {
          if (!a.section.publishedRevisionId)
            throw new ConflictException('Publish the reviewed Section metadata first');
          if (a.state !== 'DRAFT')
            throw new ConflictException('Save an explicit draft before publication');
          if (a.type === 'LESSON' && !a.contentMarkdown.trim())
            throw new BadRequestException('Lesson content required');
          if (a.type === 'RESOURCE' && !a.storageKey && !a.resourceUrl)
            throw new BadRequestException('Resource delivery required');
          if (a.storageKey)
            await this.storage.stat(a.storageKey).catch(() => {
              throw missing();
            });
          const {
            type,
            title,
            introduction,
            contentMarkdown,
            resourceUrl,
            storageKey,
            originalFileName,
            mimeType,
            fileBytes,
            fileSha256,
            sourceLessonId,
            sourceResourceId,
            sourceUpdatedAt,
            availableFrom,
            availableUntil,
          } = a;
          const r = await tx.classActivityRevision.create({
            data: {
              activityId: id,
              quizTestId,
              classOfferingId: classId,
              number: ++number,
              type,
              title,
              introduction,
              contentMarkdown,
              resourceUrl,
              storageKey,
              originalFileName,
              mimeType,
              fileBytes,
              fileSha256,
              sourceLessonId,
              sourceResourceId,
              sourceUpdatedAt,
              availableFrom,
              availableUntil,
              publishedById: actor.id,
            },
          });
          revisionId = r.id;
        }
        const r = await tx.classActivity.update({
          where: { id },
          data: {
            state: hide ? 'HIDDEN' : 'PUBLISHED',
            publishedRevisionId: revisionId,
            revisionNumber: number,
            lockVersion: { increment: 1 },
            updatedById: actor.id,
          },
        });
        await this.authority.audit(
          tx,
          actor.id,
          hide ? 'W03_ACTIVITY_HIDE' : 'W03_ACTIVITY_PUBLISH',
          'CLASS_ACTIVITY',
          id,
          'Explicit class-local teacher decision',
        );
        return { id, state: r.state, lockVersion: r.lockVersion, revisionId };
      },
      true,
    );
  }
  async reorder(actor: AuthorityActor, classId: string, input: OrderDto, sectionId?: string) {
    await this.ensureArchiveTable();
    return this.run(
      actor,
      classId,
      async (tx) => {
        const archived = await this.archivedIds(tx, classId);
        const rawCurrent = sectionId
          ? await tx.classActivity.findMany({
              where: { sectionId, section: { classOfferingId: classId } },
            })
          : await tx.classSection.findMany({ where: { classOfferingId: classId } });
        const current = rawCurrent.filter((c) =>
          sectionId ? !archived.activities.has(c.id) : !archived.sections.has(c.id),
        );
        if (
          current.length !== input.items.length ||
          input.items.some((i) => !current.some((c) => c.id === i.id))
        )
          throw new ConflictException('Order must be complete same-owner permutation');
        for (const i of input.items)
          this.cas(current.find((c) => c.id === i.id)!.lockVersion, i.expectedLockVersion);
        await tx.$executeRawUnsafe(
          'SET CONSTRAINTS ' +
            (sectionId ? 'class_activity_order' : 'class_section_order') +
            ' DEFERRED',
        );
        for (const [orderIndex, i] of input.items.entries()) {
          const data = { orderIndex, lockVersion: { increment: 1 }, updatedById: actor.id };
          if (sectionId) await tx.classActivity.update({ where: { id: i.id }, data });
          else await tx.classSection.update({ where: { id: i.id }, data });
        }
        await this.authority.audit(
          tx,
          actor.id,
          'W03_CONTENT_REORDER',
          'CLASS',
          classId,
          'Complete CAS permutation',
        );
        return { updated: input.items.length };
      },
      true,
    );
  }
  private async removeActivityTx(
    tx: Tx,
    actorId: string,
    classId: string,
    activityId: string,
  ): Promise<void> {
    const a = await this.activity(tx, classId, activityId);
    const submittedCount = await tx.classAssignmentSubmission.count({
      where: { activityId, state: 'SUBMITTED' },
    });
    if (submittedCount > 0) {
      throw new ConflictException(
        'Không thể xóa hoạt động đã có học viên nộp bài. Vui lòng dùng nút Ẩn.',
      );
    }
    let existingLocalTables = new Set<string>();
    if (typeof tx.$queryRawUnsafe === 'function') {
      const tblRows = (await tx.$queryRawUnsafe(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'lms_local_%'`,
      )) as Array<{ table_name: string }>;
      existingLocalTables = new Set(tblRows.map((t) => String(t.table_name)));
      if (existingLocalTables.has('lms_local_quiz_attempts')) {
        const qSubs = (await tx.$queryRawUnsafe(
          `SELECT count(*)::int AS cnt FROM lms_local_quiz_attempts WHERE activity_id = $1 AND status = 'SUBMITTED'`,
          activityId,
        )) as Array<{ cnt: number }>;
        if ((qSubs[0]?.cnt ?? 0) > 0) {
          throw new ConflictException(
            'Không thể xóa quiz đã có học viên nộp bài. Vui lòng dùng nút Ẩn.',
          );
        }
      }
      if (existingLocalTables.has('lms_local_attendance_records')) {
        const aSubs = (await tx.$queryRawUnsafe(
          `SELECT count(*)::int AS cnt FROM lms_local_attendance_records WHERE activity_id = $1`,
          activityId,
        )) as Array<{ cnt: number }>;
        if ((aSubs[0]?.cnt ?? 0) > 0) {
          throw new ConflictException(
            'Không thể xóa buổi điểm danh đã có dữ liệu điểm danh. Vui lòng dùng nút Ẩn.',
          );
        }
      }
    }
    const coreAttempts = await tx.testAttempt.count({
      where: { quizRevision: { activityId } },
    });
    if (coreAttempts > 0) {
      throw new ConflictException(
        'Không thể xóa bài kiểm tra đã có lượt làm bài. Vui lòng dùng nút Ẩn.',
      );
    }
    const [linkedCoreQuizzes, linkedRubrics] = await Promise.all([
      typeof tx.test?.count === 'function'
        ? tx.test.count({ where: { quizActivityId: activityId } })
        : 0,
      typeof tx.rubric?.count === 'function'
        ? tx.rubric.count({ where: { assignmentActivityId: activityId } })
        : 0,
    ]);
    if (linkedCoreQuizzes > 0 || linkedRubrics > 0) {
      throw new ConflictException(
        'Hoạt động đã liên kết đề kiểm tra hoặc rubric học vụ. Vui lòng dùng nút Ẩn thay vì xóa.',
      );
    }
    if (typeof tx.$executeRawUnsafe === 'function') {
      const cleanupTables = [
        'lms_local_assignment_submission_files',
        'lms_local_assignment_submission_meta',
        'lms_local_assignment_grades',
        'lms_local_assignment_configs',
        'lms_local_quiz_attempts',
        'lms_local_quiz_questions',
        'lms_local_quiz_configs',
        'lms_local_attendance_configs',
        'lms_local_activity_kinds',
      ];
      for (const tbl of cleanupTables) {
        if (existingLocalTables.has(tbl)) {
          await tx.$executeRawUnsafe(`DELETE FROM ${tbl} WHERE activity_id = $1`, activityId);
        }
      }
    }
    const maxOrder = await tx.classActivity.aggregate({
      where: { sectionId: a.sectionId },
      _max: { orderIndex: true },
    });
    const archivedOrder =
      a.orderIndex >= 100000
        ? a.orderIndex
        : Math.max(100000, (maxOrder._max.orderIndex ?? 0) + 1);
    if (a.state === 'PUBLISHED' || a.orderIndex !== archivedOrder) {
      await tx.classActivity.update({
        where: { id: activityId },
        data: {
          ...(a.state === 'PUBLISHED' ? { state: 'HIDDEN' } : {}),
          orderIndex: archivedOrder,
          lockVersion: { increment: 1 },
          updatedById: actorId,
        },
      });
    }
    if (typeof tx.$executeRawUnsafe === 'function') {
      await tx.$executeRawUnsafe(
        `INSERT INTO lms_local_archived_content (entity_id, entity_type, class_offering_id, archived_by_id)
         VALUES ($1, 'ACTIVITY', $2, $3)
         ON CONFLICT (entity_id) DO NOTHING`,
        activityId,
        classId,
        actorId,
      );
    }
  }
  async deleteActivity(actor: AuthorityActor, classId: string, id: string) {
    await this.ensureArchiveTable();
    return this.run(
      actor,
      classId,
      async (tx) => {
        await this.removeActivityTx(tx, actor.id, classId, id);
        await this.authority.audit(
          tx,
          actor.id,
          'W03_ACTIVITY_DELETE',
          'CLASS_ACTIVITY',
          id,
          'Teacher deleted unused class-local activity',
        );
        return { deleted: true, id };
      },
      true,
    );
  }
  async deleteSection(actor: AuthorityActor, classId: string, sectionId: string) {
    await this.ensureArchiveTable();
    return this.run(
      actor,
      classId,
      async (tx) => {
        const s = await tx.classSection.findFirst({
          where: { id: sectionId, classOfferingId: classId },
          include: { activities: { select: { id: true } } },
        });
        if (!s) throw missing();
        const archived = await this.archivedIds(tx, classId);
        for (const a of s.activities) {
          if (!archived.activities.has(a.id)) {
            await this.removeActivityTx(tx, actor.id, classId, a.id);
          }
        }
        const maxSec = await tx.classSection.aggregate({
          where: { classOfferingId: classId },
          _max: { orderIndex: true },
        });
        const archivedOrder =
          s.orderIndex >= 100000
            ? s.orderIndex
            : Math.max(100000, (maxSec._max.orderIndex ?? 0) + 1);
        if (s.orderIndex !== archivedOrder) {
          await tx.classSection.update({
            where: { id: sectionId },
            data: {
              orderIndex: archivedOrder,
              lockVersion: { increment: 1 },
              updatedById: actor.id,
            },
          });
        }
        if (typeof tx.$executeRawUnsafe === 'function') {
          await tx.$executeRawUnsafe(
            `INSERT INTO lms_local_archived_content (entity_id, entity_type, class_offering_id, archived_by_id)
             VALUES ($1, 'SECTION', $2, $3)
             ON CONFLICT (entity_id) DO NOTHING`,
            sectionId,
            classId,
            actor.id,
          );
        }
        await this.authority.audit(
          tx,
          actor.id,
          'W03_SECTION_DELETE',
          'CLASS_SECTION',
          sectionId,
          'Teacher deleted class-local section',
        );
        return { deleted: true, id: sectionId };
      },
      true,
    );
  }
  detail(actor: AuthorityActor, classId: string, id: string) {
    return this.run(actor, classId, async (tx, s) => {
      const a = await this.activity(tx, classId, id),
        r = s.teacher ? a : a.publishedRevision;
      let localKind: string | null = null;
      let localDone = false;
      if (typeof tx.$queryRawUnsafe === 'function') {
        try {
          const kindRows = (await tx.$queryRawUnsafe(
            `SELECT kind FROM lms_local_activity_kinds WHERE activity_id = $1 AND class_offering_id = $2`,
            id,
            classId,
          )) as Array<{ kind: string }>;
          localKind = kindRows[0]?.kind ?? null;
          if (s.enrollment && localKind === 'LOCAL_ATTENDANCE') {
            const attRows = (await tx.$queryRawUnsafe(
              `SELECT id FROM lms_local_attendance_records WHERE activity_id = $1 AND learner_id = $2 LIMIT 1`,
              id,
              s.enrollment.learnerId,
            )) as any[];
            localDone = attRows.length > 0;
          } else if (s.enrollment && localKind === 'LOCAL_QUIZ') {
            const qRows = (await tx.$queryRawUnsafe(
              `SELECT id FROM lms_local_quiz_attempts WHERE activity_id = $1 AND learner_id = $2 AND status = 'SUBMITTED' LIMIT 1`,
              id,
              s.enrollment.learnerId,
            )) as any[];
            localDone = qRows.length > 0;
          }
        } catch {
          // Local tables might not be initialized yet.
        }
      }
      if (
        !r ||
        (!s.teacher &&
          (!a.section.publishedRevisionId ||
            a.state !== 'PUBLISHED' ||
            !this.readable(r as ClassActivityRevision, s.now, localKind)))
      )
        throw missing();
      const p =
        s.enrollment && a.publishedRevisionId
          ? await tx.classActivityProgress.findUnique({
              where: {
                enrollmentId_revisionId: {
                  enrollmentId: s.enrollment.id,
                  revisionId: a.publishedRevisionId,
                },
              },
            })
          : null;
      return {
        ...this.project(r),
        id: a.id,
        sectionId: a.sectionId,
        state: a.state,
        revisionId: a.publishedRevisionId,
        revisionNumber: a.revisionNumber,
        progress: localDone ? 'COMPLETED' : (p?.status ?? 'NOT_STARTED'),
        editable: s.teacher,
        ...(r.type === 'ASSIGNMENT'
          ? { submissionOpen: this.visible(r as ClassActivityRevision, s.now) }
          : {}),
        ...(s.teacher ? { lockVersion: a.lockVersion } : {}),
      };
    });
  }
  sources(actor: AuthorityActor, classId: string) {
    return this.run(
      actor,
      classId,
      async (tx, s) => ({
        lessons: await tx.lesson.findMany({
          where: { module: { courseId: s.class.courseId, course: { isPublished: true } } },
          select: {
            id: true,
            title: true,
            updatedAt: true,
            resources: { select: { id: true, title: true, type: true, updatedAt: true } },
          },
          take: 200,
          orderBy: { id: 'asc' },
        }),
      }),
      true,
    );
  }
  progress(actor: AuthorityActor, classId: string, id: string, complete = false) {
    return this.run(actor, classId, async (tx, s) => {
      if (!s.enrollment) throw missing();
      const a = await this.activity(tx, classId, id),
        r = a.publishedRevision;
      if (
        !a.section.publishedRevisionId ||
        a.state !== 'PUBLISHED' ||
        !r ||
        !this.visible(r, s.now)
      )
        throw missing();
      const where = {
          enrollmentId_revisionId: { enrollmentId: s.enrollment.id, revisionId: r.id },
        },
        old = await tx.classActivityProgress.findUnique({ where });
      if (complete && a.type === 'ASSIGNMENT')
        throw new ConflictException('Submit the assignment; lesson completion is not a submission');
      if (complete && !old) throw new ConflictException('Open the activity before completing it');
      if (old?.status === 'COMPLETED' || (old && !complete))
        return { status: old.status, revisionId: r.id };
      const p = complete
        ? await tx.classActivityProgress.update({
            where,
            data: { status: 'COMPLETED', completedAt: await this.now(tx) },
          })
        : await tx.classActivityProgress.create({
            data: { enrollmentId: s.enrollment.id, revisionId: r.id },
          });
      return { status: p.status, revisionId: r.id };
    });
  }
  async upload(
    actor: AuthorityActor,
    classId: string,
    id: string,
    expected: number,
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ) {
    let key: string | undefined;
    try {
      return await this.run(
        actor,
        classId,
        async (tx) => {
          const a = await this.activity(tx, classId, id);
          this.cas(a.lockVersion, expected);
          if (a.type !== 'RESOURCE' || !file)
            throw new BadRequestException('Resource file required');
          const f = await this.storage.put(file);
          key = f.key;
          const r = await tx.classActivity.update({
            where: { id },
            data: {
              state: 'DRAFT',
              storageKey: f.key,
              resourceUrl: null,
              sourceResourceId: null,
              sourceUpdatedAt: null,
              originalFileName: f.originalFileName,
              mimeType: f.mimeType,
              fileBytes: f.bytes,
              fileSha256: createHash('sha256').update(file.buffer).digest('hex'),
              lockVersion: { increment: 1 },
              updatedById: actor.id,
            },
          });
          await this.authority.audit(
            tx,
            actor.id,
            'W03_FILE_ATTACH',
            'CLASS_ACTIVITY',
            id,
            'Private class resource uploaded',
          );
          return { id, lockVersion: r.lockVersion, file: this.project(r).file, state: r.state };
        },
        true,
      );
    } catch (e) {
      if (key) await this.storage.delete(key);
      throw e;
    }
  }
  download(actor: AuthorityActor, classId: string, id: string) {
    return this.run(actor, classId, async (tx, s) => {
      const a = await this.activity(tx, classId, id),
        r = s.teacher ? a : a.publishedRevision;
      if (
        !r ||
        (!s.teacher &&
          (!a.section.publishedRevisionId ||
            a.state !== 'PUBLISHED' ||
            !this.visible(r as ClassActivityRevision, s.now))) ||
        r.type !== 'RESOURCE' ||
        !r.storageKey
      )
        throw missing();
      await this.storage.stat(r.storageKey).catch(() => {
        throw missing();
      });
      return {
        stream: this.storage.open(r.storageKey),
        mimeType: r.mimeType ?? 'application/octet-stream',
        fileName: r.originalFileName ?? 'document',
      };
    });
  }
}
