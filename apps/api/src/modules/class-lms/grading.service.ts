import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthorizationService, type AuthorityActor } from '../authorization/authorization.service';
import { ClassLmsService } from './class-lms.service';
import { AssignmentService } from './assignment.service';
import { LearningResourceStorage } from '../learning/learning-resource.storage';
import {
  AssignmentGradeDto,
  AssignmentRubricDto,
  EditAssignmentGradeDto,
  EditAssignmentRubricDto,
  GradingTransitionDto,
} from './grading.dto';
type Tx = Prisma.TransactionClient;
const no = () => new NotFoundException('Assignment grading not available');
const stale = () =>
  new ConflictException('Stale grading version or already confirmed; reload before retry');
const rubricInclude = { criteria: { orderBy: { orderIndex: 'asc' as const } } };
const gradeInclude = {
  rubric: { include: rubricInclude },
  criterionScores: true,
  submission: { include: { revision: true, learner: { select: { fullName: true } } } },
};
type Rubric = Prisma.RubricGetPayload<{ include: typeof rubricInclude }>;
type Grade = Prisma.AssignmentGradeGetPayload<{ include: typeof gradeInclude }>;
function canonical(v: unknown): unknown {
  return Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, canonical(x)]),
        )
      : v;
}
@Injectable()
export class AssignmentGradingService {
  constructor(
    private readonly db: PrismaService,
    private readonly authority: AuthorizationService,
    private readonly lms: ClassLmsService,
    private readonly assignments: AssignmentService,
    private readonly storage: LearningResourceStorage,
  ) {}
  private async run<T>(
    actor: AuthorityActor,
    classId: string,
    mode: 'teacher' | 'student' | 'academic.rubric.approve' | 'academic.grade.publish',
    work: (tx: Tx) => Promise<T>,
  ) {
    try {
      return await this.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
          if (mode === 'teacher') await this.lms.access(tx, actor, classId, true);
          else if (mode === 'student') {
            const s = await this.lms.access(tx, actor, classId);
            if (!s.enrollment) throw no();
          } else await this.authority.requireActor(tx, actor, mode, { type: 'CLASS', id: classId });
          await tx.$queryRaw`SELECT set_config('app.class_lms_actor',${actor.id},true),set_config('app.class_lms_session',${actor.sessionId},true)`;
          return work(tx);
        },
        { maxWait: 10000, timeout: 30000 },
      );
    } catch (e) {
      if (e instanceof HttpException) throw e;
      const detail = String(e) + JSON.stringify(e);
      if (/42501|W03.*(DENIED|INDEPENDENT|AUTH)/.test(detail))
        throw new ForbiddenException('Current independent authority required');
      if (/P2002|P2003|P2004|P2034|23514|23505|W03BB_/.test(detail)) throw stale();
      throw e;
    }
  }
  private async activity(tx: Tx, c: string, a: string) {
    const row = await this.lms.activity(tx, c, a);
    if (row.type !== 'ASSIGNMENT') throw no();
    return row;
  }
  private async submission(tx: Tx, c: string, a: string, id: string) {
    const row = await tx.classAssignmentSubmission.findFirst({
      where: {
        id,
        classOfferingId: c,
        activityId: a,
        state: 'SUBMITTED',
        enrollment: { status: 'ACTIVE' },
        learner: { status: 'ACTIVE', role: 'STUDENT' },
      },
      include: { revision: true },
    });
    if (!row || row.revision.activityId !== a || row.revision.classOfferingId !== c) throw no();
    return row;
  }
  private async rubric(tx: Tx, c: string, a: string, id: string) {
    await this.activity(tx, c, a);
    const row = await tx.rubric.findFirst({
      where: { id, assignmentActivityId: a },
      include: rubricInclude,
    });
    if (!row) throw no();
    return row;
  }
  private async grade(tx: Tx, c: string, a: string, id: string) {
    const g = await tx.assignmentGrade.findFirst({
      where: { id, submission: { classOfferingId: c, activityId: a } },
      include: gradeInclude,
    });
    if (!g) throw no();
    await this.submission(tx, c, a, g.submissionId);
    return g;
  }
  private rubricView(r: Rubric) {
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      version: r.assignmentVersion,
      state: r.assignmentState,
      lockVersion: r.lockVersion,
      approvedAt: r.approvedAt,
      criteria: r.criteria.map((x) => ({
        id: x.id,
        name: x.name,
        description: x.description,
        maxScore: x.maxScore.toFixed(2),
      })),
    };
  }
  private gradeView(g: Grade) {
    const complete =
      g.rubric.criteria.length > 0 &&
      g.rubric.criteria.every((c) => g.criterionScores.some((s) => s.rubricCriterionId === c.id));
    const max = g.rubric.criteria.reduce((t, c) => t.plus(c.maxScore), new Prisma.Decimal(0)),
      earned = complete
        ? g.criterionScores.reduce((t, s) => t.plus(s.score), new Prisma.Decimal(0))
        : null;
    return {
      id: g.id,
      submissionId: g.submissionId,
      number: g.number,
      state: g.state,
      lockVersion: g.lockVersion,
      reason: g.reason,
      feedback: g.feedback,
      confirmedAt: g.confirmedAt,
      publishedAt: g.publishedAt,
      rubric: this.rubricView(g.rubric),
      scores: g.criterionScores.map((s) => ({
        criterionId: s.rubricCriterionId,
        score: s.score.toFixed(2),
        feedback: s.feedback ?? '',
      })),
      earned: earned?.toFixed(2) ?? null,
      max: max.toFixed(2),
      percent: earned && max.gt(0) ? earned.div(max).mul(100).toDecimalPlaces(2).toString() : null,
    };
  }
  private sourceView(s: Grade['submission']) {
    return {
      id: s.id,
      text: s.text,
      learnerName: s.learner.fullName,
      submittedAt: s.submittedAt,
      source: {
        id: s.revisionId,
        title: s.revision.title,
        introduction: s.revision.introduction,
        contentMarkdown: s.revision.contentMarkdown,
        version: s.revision.number,
      },
      file: s.storageKey
        ? {
            name: s.originalFileName,
            mimeType: s.mimeType,
            bytes: s.fileBytes,
            sha256: s.fileSha256,
          }
        : null,
    };
  }
  private learnerView(g: Grade) {
    const p = this.gradeView(g);
    return {
      id: p.id,
      submissionId: p.submissionId,
      number: p.number,
      state: 'PUBLISHED',
      reason: p.reason,
      feedback: p.feedback,
      publishedAt: p.publishedAt,
      earned: p.earned,
      max: p.max,
      percent: p.percent,
      scores: p.scores,
      rubric: {
        id: p.rubric.id,
        name: p.rubric.name,
        version: p.rubric.version,
        criteria: p.rubric.criteria,
      },
    };
  }
  private async idem<T extends { id: string }>(
    tx: Tx,
    actor: AuthorityActor,
    c: string,
    kind: 'RUBRIC' | 'GRADE',
    action: string,
    b: { idempotencyKey: string },
    scope: unknown,
    load: (id: string) => Promise<T>,
    work: () => Promise<T>,
  ) {
    const key = b.idempotencyKey.toLowerCase(),
      hash = createHash('sha256')
        .update(
          JSON.stringify(
            canonical({ actor: actor.id, scope, body: { ...b, idempotencyKey: key } }),
          ),
        )
        .digest('hex'),
      objectType = 'W03BB_' + kind + ':' + c,
      reason = key + ':' + hash;
    const old = await tx.domainAuditEvent.findFirst({
      where: { actorId: actor.id, action, objectType, reason: { startsWith: key + ':' } },
    });
    if (old) {
      if (old.reason !== reason)
        throw new ConflictException('Idempotency key already used with different content');
      return load(old.objectId);
    }
    const value = await work();
    await this.authority.audit(tx, actor.id, action, objectType, value.id, reason);
    return value;
  }
  private cas(actual: number, expected: number) {
    if (actual !== expected) throw stale();
  }
  private criteria(b: AssignmentRubricDto) {
    if (
      !b.name.trim() ||
      b.criteria.some(
        (c) => !c.name.trim() || !c.description.trim() || new Prisma.Decimal(c.maxScore).lte(0),
      )
    )
      throw new BadRequestException(
        'Rubric name, positive maximum and attainment description required',
      );
    return b.criteria.map((c, i) => ({
      code: 'C' + (i + 1),
      name: c.name.trim(),
      description: c.description.trim(),
      maxScore: new Prisma.Decimal(c.maxScore),
      weight: 1,
      orderIndex: i,
    }));
  }
  saveRubric(
    actor: AuthorityActor,
    c: string,
    a: string,
    b: AssignmentRubricDto | EditAssignmentRubricDto,
    id?: string,
  ) {
    return this.run(actor, c, 'teacher', async (tx) => {
      await this.activity(tx, c, a);
      return this.idem(
        tx,
        actor,
        c,
        'RUBRIC',
        id ? 'RUBRIC_EDIT' : 'RUBRIC_CREATE',
        b,
        { activity: a, id: id ?? null },
        async (rid) => this.rubricView(await this.rubric(tx, c, a, rid)),
        async () => {
          const criteria = this.criteria(b);
          let row;
          if (id) {
            const old = await this.rubric(tx, c, a, id);
            this.cas(old.lockVersion, (b as EditAssignmentRubricDto).expectedLockVersion);
            if (old.assignmentState !== 'DRAFT') throw stale();
            row = await tx.rubric.update({
              where: { id },
              data: {
                name: b.name.trim(),
                description: b.description,
                lockVersion: { increment: 1 },
              },
            });
            await tx.rubricCriterion.deleteMany({ where: { rubricId: id } });
          } else {
            const last = await tx.rubric.findFirst({
              where: { assignmentActivityId: a },
              orderBy: { assignmentVersion: 'desc' },
            });
            this.cas(last?.assignmentVersion ?? 0, b.expectedPreviousVersion);
            if (last && last.assignmentState !== 'PUBLISHED') throw stale();
            row = await tx.rubric.create({
              data: {
                name: b.name.trim(),
                description: b.description,
                isActive: false,
                assignmentActivityId: a,
                assignmentVersion: (last?.assignmentVersion ?? 0) + 1,
                assignmentState: 'DRAFT',
                authoredById: actor.id,
              },
            });
          }
          await tx.rubricCriterion.createMany({
            data: criteria.map((x) => ({ ...x, rubricId: row.id })),
          });
          return this.rubricView(await this.rubric(tx, c, a, row.id));
        },
      );
    });
  }
  publishRubric(actor: AuthorityActor, c: string, a: string, id: string, b: GradingTransitionDto) {
    return this.run(actor, c, 'academic.rubric.approve', (tx) =>
      this.idem(
        tx,
        actor,
        c,
        'RUBRIC',
        'RUBRIC_PUBLISH',
        b,
        { activity: a, id },
        async (rid) => this.rubricView(await this.rubric(tx, c, a, rid)),
        async () => {
          const old = await this.rubric(tx, c, a, id);
          this.cas(old.lockVersion, b.expectedLockVersion);
          if (old.assignmentState !== 'DRAFT') throw stale();
          if (old.makerIds.includes(actor.id))
            throw new ForbiddenException('Independent checker required');
          if (!old.criteria.length) throw new ConflictException('Criteria required');
          await tx.rubric.update({
            where: { id },
            data: {
              assignmentState: 'PUBLISHED',
              approvedById: actor.id,
              approvedAt: await this.lms.now(tx),
              lockVersion: { increment: 1 },
            },
          });
          return this.rubricView(await this.rubric(tx, c, a, id));
        },
      ),
    );
  }
  private validateScores(r: Rubric, b: AssignmentGradeDto) {
    if (r.assignmentState !== 'PUBLISHED')
      throw new ConflictException('Approved immutable rubric required');
    return b.scores.map((s) => {
      const criterion = r.criteria.find((x) => x.id === s.criterionId);
      if (
        !criterion ||
        new Prisma.Decimal(s.score).gt(criterion.maxScore) ||
        new Prisma.Decimal(s.score).lt(0)
      )
        throw new BadRequestException('Criterion outside this rubric or score outside maximum');
      return {
        rubricCriterionId: s.criterionId,
        score: new Prisma.Decimal(s.score),
        feedback: s.feedback,
      };
    });
  }
  saveGrade(
    actor: AuthorityActor,
    c: string,
    a: string,
    sid: string,
    b: AssignmentGradeDto | EditAssignmentGradeDto,
    id?: string,
  ) {
    return this.run(actor, c, 'teacher', async (tx) => {
      const source = await this.submission(tx, c, a, sid);
      return this.idem(
        tx,
        actor,
        c,
        'GRADE',
        id ? 'GRADE_EDIT' : 'GRADE_CREATE',
        b,
        { activity: a, submission: sid, id: id ?? null },
        async (gid) => this.gradeView(await this.grade(tx, c, a, gid)),
        async () => {
          const r = await this.rubric(tx, c, a, b.rubricId),
            scores = this.validateScores(r, b);
          if (source.storageKey) await this.assignments.checkFile(source);
          let row;
          if (id) {
            const old = await this.grade(tx, c, a, id);
            if (old.submissionId !== sid || old.rubricId !== b.rubricId) throw no();
            this.cas(old.lockVersion, (b as EditAssignmentGradeDto).expectedLockVersion);
            if (old.state !== 'DRAFT') throw stale();
            row = await tx.assignmentGrade.update({
              where: { id },
              data: {
                feedback: b.feedback,
                reason: b.reason,
                gradedById: actor.id,
                lockVersion: { increment: 1 },
              },
            });
            await tx.rubricCriterionScore.deleteMany({ where: { assignmentGradeId: id } });
          } else {
            const last = await tx.assignmentGrade.findFirst({
              where: { submissionId: sid },
              orderBy: { number: 'desc' },
            });
            this.cas(last?.number ?? 0, b.expectedPreviousVersion);
            if (last && last.state !== 'PUBLISHED') throw stale();
            if (last && !b.reason.trim())
              throw new BadRequestException('Correction reason required');
            row = await tx.assignmentGrade.create({
              data: {
                submissionId: sid,
                rubricId: r.id,
                number: (last?.number ?? 0) + 1,
                createdById: actor.id,
                gradedById: actor.id,
                feedback: b.feedback,
                reason: b.reason,
              },
            });
          }
          if (scores.length)
            await tx.rubricCriterionScore.createMany({
              data: scores.map((s) => ({ ...s, assignmentGradeId: row.id })),
            });
          return this.gradeView(await this.grade(tx, c, a, row.id));
        },
      );
    });
  }
  finalize(actor: AuthorityActor, c: string, a: string, id: string, b: GradingTransitionDto) {
    return this.run(actor, c, 'teacher', (tx) =>
      this.idem(
        tx,
        actor,
        c,
        'GRADE',
        'GRADE_FINAL',
        b,
        { activity: a, id },
        async (gid) => this.gradeView(await this.grade(tx, c, a, gid)),
        async () => {
          const old = await this.grade(tx, c, a, id);
          this.cas(old.lockVersion, b.expectedLockVersion);
          if (old.state !== 'DRAFT') throw stale();
          if (old.submission.storageKey) await this.assignments.checkFile(old.submission);
          if (
            old.rubric.assignmentState !== 'PUBLISHED' ||
            !old.rubric.criteria.length ||
            old.rubric.criteria.some(
              (c) => !old.criterionScores.some((s) => s.rubricCriterionId === c.id),
            )
          )
            throw new ConflictException(
              'Complete each criterion using the approved rubric before final confirmation',
            );
          await tx.assignmentGrade.update({
            where: { id },
            data: {
              state: 'REVIEWED_FINAL',
              confirmedAt: await this.lms.now(tx),
              gradedById: actor.id,
              lockVersion: { increment: 1 },
            },
          });
          return this.gradeView(await this.grade(tx, c, a, id));
        },
      ),
    );
  }
  publishGrade(actor: AuthorityActor, c: string, a: string, id: string, b: GradingTransitionDto) {
    return this.run(actor, c, 'academic.grade.publish', (tx) =>
      this.idem(
        tx,
        actor,
        c,
        'GRADE',
        'GRADE_PUBLISH',
        b,
        { activity: a, id },
        async (gid) => this.gradeView(await this.grade(tx, c, a, gid)),
        async () => {
          const old = await this.grade(tx, c, a, id);
          this.cas(old.lockVersion, b.expectedLockVersion);
          if (old.state !== 'REVIEWED_FINAL') throw stale();
          if (
            old.makerIds.includes(actor.id) ||
            old.createdById === actor.id ||
            old.gradedById === actor.id
          )
            throw new ForbiddenException('Independent checker required');
          if (old.submission.storageKey) await this.assignments.checkFile(old.submission);
          await tx.assignmentGrade.update({
            where: { id },
            data: {
              state: 'PUBLISHED',
              publishedById: actor.id,
              publishedAt: await this.lms.now(tx),
              lockVersion: { increment: 1 },
            },
          });
          return this.gradeView(await this.grade(tx, c, a, id));
        },
      ),
    );
  }
  queue(actor: AuthorityActor, c: string, a: string) {
    return this.run(actor, c, 'teacher', async (tx) => {
      await this.activity(tx, c, a);
      const rubrics = await tx.rubric.findMany({
        where: { assignmentActivityId: a },
        include: rubricInclude,
        orderBy: { assignmentVersion: 'desc' },
      });
      const submissions = await tx.classAssignmentSubmission.findMany({
        where: {
          classOfferingId: c,
          activityId: a,
          state: 'SUBMITTED',
          enrollment: { status: 'ACTIVE' },
          learner: { status: 'ACTIVE' },
        },
        include: {
          revision: true,
          learner: { select: { fullName: true } },
          gradeVersions: { include: gradeInclude, orderBy: { number: 'desc' } },
        },
        orderBy: { submittedAt: 'asc' },
      });
      return {
        rubrics: rubrics.map((r) => this.rubricView(r)),
        submissions: submissions.map((s) => ({
          ...this.sourceView(s),
          grades: s.gradeVersions.map((g) => this.gradeView(g)),
        })),
      };
    });
  }
  async inbox(actor: AuthorityActor) {
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
        const u = await this.lms.context(tx, actor);
        if (u.role !== 'ACADEMIC_MANAGER') throw new ForbiddenException('Academic checker only');
        const now = await this.lms.now(tx),
          grants = await tx.permissionGrant.findMany({
            where: {
              userId: actor.id,
              capability: { in: ['academic.rubric.approve', 'academic.grade.publish'] },
              scopeType: 'CLASS',
              approvedBy: { not: null },
              approvedAt: { lte: now },
              revokedAt: null,
              effectiveAt: { lte: now },
              expiresAt: { gt: now },
            },
          });
        const rc = grants
            .filter((g) => g.capability === 'academic.rubric.approve')
            .flatMap((g) => (g.scopeId ? [g.scopeId] : [])),
          gc = grants
            .filter((g) => g.capability === 'academic.grade.publish')
            .flatMap((g) => (g.scopeId ? [g.scopeId] : []));
        const classes = await tx.classOffering.findMany({
          where: { id: { in: [...new Set([...rc, ...gc])] } },
          select: { id: true, code: true, name: true },
          orderBy: { code: 'asc' },
          take: 201,
        });
        const rubrics = await tx.rubric.findMany({
          where: {
            assignmentState: 'DRAFT',
            assignmentActivity: { section: { classOfferingId: { in: rc } } },
          },
          include: { ...rubricInclude, assignmentActivity: { include: { section: true } } },
          orderBy: { createdAt: 'asc' },
          take: 201,
        });
        const grades = await tx.assignmentGrade.findMany({
          where: {
            state: 'REVIEWED_FINAL',
            submission: {
              classOfferingId: { in: gc },
              enrollment: { status: 'ACTIVE' },
              learner: { status: 'ACTIVE' },
            },
          },
          include: gradeInclude,
          orderBy: { confirmedAt: 'asc' },
          take: 201,
        });
        return {
          classes: classes.slice(0, 200),
          rubrics: rubrics.slice(0, 200).map((r) => ({
            classId: r.assignmentActivity!.section.classOfferingId,
            activityId: r.assignmentActivityId,
            canPublish: !r.makerIds.includes(actor.id),
            rubric: this.rubricView(r),
          })),
          grades: grades.slice(0, 200).map((g) => ({
            classId: g.submission.classOfferingId,
            activityId: g.submission.activityId,
            canPublish: !g.makerIds.includes(actor.id),
            submission: this.sourceView(g.submission),
            grade: this.gradeView(g),
          })),
          truncated: classes.length > 200 || rubrics.length > 200 || grades.length > 200,
        };
      },
      { maxWait: 10000, timeout: 30000 },
    );
  }
  gradebook(actor: AuthorityActor, c: string) {
    return this.run(actor, c, 'student', async (tx) => {
      const rows = await tx.classAssignmentSubmission.findMany({
        where: {
          classOfferingId: c,
          learnerId: actor.id,
          state: 'SUBMITTED',
          enrollment: { status: 'ACTIVE' },
          // D5 release is controlled by the immutable grade publication, not a later
          // teacher edit of the Activity draft. Only the submitted frozen title is projected.
          activity: { section: { publishedRevisionId: { not: null } } },
        },
        include: {
          revision: { select: { title: true } },
          gradeVersions: {
            where: { state: 'PUBLISHED' },
            include: gradeInclude,
            orderBy: { number: 'desc' },
          },
        },
        orderBy: { submittedAt: 'asc' },
      });
      let localGradesBySub = new Map<string, any>();
      let quizEntries: any[] = [];
      let attendanceEntries: any[] = [];
      let formalAssessments: any[] = [];
      let draftCoreQuizCount = 0;

      if (typeof tx.$queryRawUnsafe === 'function') {
        try {
          const [localAssignRows, localQuizRows, localAttendanceRows] = await Promise.all([
            tx.$queryRawUnsafe(
              `SELECT submission_id, score, max_score, feedback, state, graded_at, published_at
                 FROM lms_local_assignment_grades
                WHERE class_offering_id = $1 AND state = 'PUBLISHED'`,
              c,
            ) as Promise<any[]>,
            tx.$queryRawUnsafe(
              `SELECT a.id AS activity_id, COALESCE(rev.title, a.title) AS title,
                      COALESCE(cfg.assessment_kind, 'QUIZ') AS assessment_kind,
                      cfg.pass_score,
                      att.id AS attempt_id, att.attempt_number, att.status, att.submitted_at,
                      att.grading_status, att.grade_published, att.total_score, att.max_score,
                      att.teacher_feedback, att.graded_at
                 FROM lms_local_activity_kinds k
                 JOIN class_activities a ON a.id::text = k.activity_id
                 JOIN class_sections sec ON sec.id = a."sectionId"
                 LEFT JOIN class_activity_revisions rev ON rev.id = a."publishedRevisionId"
                 LEFT JOIN lms_local_quiz_configs cfg ON cfg.activity_id = a.id::text
                 LEFT JOIN LATERAL (
                   SELECT * FROM lms_local_quiz_attempts qa
                    WHERE qa.activity_id = a.id::text AND qa.learner_id = $2
                    ORDER BY qa.attempt_number DESC
                    LIMIT 1
                 ) att ON true
                WHERE k.class_offering_id = $1
                  AND k.kind = 'LOCAL_QUIZ'
                  AND a.state = 'PUBLISHED'
                  AND sec."publishedRevisionId" IS NOT NULL
                ORDER BY sec."orderIndex" ASC, a."orderIndex" ASC`,
              c,
              actor.id,
            ) as Promise<any[]>,
            tx.$queryRawUnsafe(
              `SELECT a.id AS activity_id, COALESCE(rev.title, a.title) AS title,
                      acfg.check_in_start_at, acfg.check_in_end_at,
                      rec.status AS attendance_status, rec.checked_in_at, rec.note
                 FROM lms_local_activity_kinds k
                 JOIN class_activities a ON a.id::text = k.activity_id
                 JOIN class_sections sec ON sec.id = a."sectionId"
                 LEFT JOIN class_activity_revisions rev ON rev.id = a."publishedRevisionId"
                 LEFT JOIN lms_local_attendance_configs acfg ON acfg.activity_id = a.id::text
                 LEFT JOIN lms_local_attendance_records rec
                   ON rec.activity_id = a.id::text AND rec.learner_id = $2
                WHERE k.class_offering_id = $1
                  AND k.kind = 'LOCAL_ATTENDANCE'
                  AND a.state = 'PUBLISHED'
                  AND sec."publishedRevisionId" IS NOT NULL
                ORDER BY sec."orderIndex" ASC, a."orderIndex" ASC`,
              c,
              actor.id,
            ) as Promise<any[]>,
          ]);

          localGradesBySub = new Map(localAssignRows.map((g) => [String(g.submission_id), g]));
          quizEntries = localQuizRows.map((q) => {
            const hasAttempt = Boolean(q.attempt_id);
            const submitted = q.status === 'SUBMITTED';
            const pendingManual = q.grading_status === 'PENDING_MANUAL_GRADE';
            const published = submitted && Boolean(q.grade_published) && !pendingManual;
            const score = published && q.total_score !== null ? Number(q.total_score) : null;
            const maxScore = q.max_score !== null ? Number(q.max_score) : null;
            const passScore = Number(q.pass_score ?? 5);
            return {
              activityId: String(q.activity_id),
              title: String(q.title),
              assessmentKind: String(q.assessment_kind || 'QUIZ'),
              status: !hasAttempt
                ? 'NOT_STARTED'
                : !submitted
                  ? 'IN_PROGRESS'
                  : published
                    ? 'PUBLISHED'
                    : pendingManual
                      ? 'PENDING_MANUAL_GRADE'
                      : 'PENDING_PUBLICATION',
              score,
              maxScore,
              passScore,
              passed: score !== null ? score >= passScore : null,
              submittedAt: q.submitted_at ? new Date(q.submitted_at).toISOString() : null,
              feedback: published ? String(q.teacher_feedback ?? '') : '',
            };
          });
          attendanceEntries = localAttendanceRows.map((att) => ({
            activityId: String(att.activity_id),
            title: String(att.title),
            status:
              att.attendance_status === 'PRESENT' || att.attendance_status === 'LATE'
                ? String(att.attendance_status)
                : 'NOT_RECORDED',
            checkedInAt: att.checked_in_at ? new Date(att.checked_in_at).toISOString() : null,
            startAt: att.check_in_start_at ? new Date(att.check_in_start_at).toISOString() : null,
            endAt: att.check_in_end_at ? new Date(att.check_in_end_at).toISOString() : null,
          }));
        } catch {
          // Local tables might not exist in isolated unit tests.
        }
      }

      if (tx.classAssessment?.findMany) {
        const assessments = await tx.classAssessment.findMany({
          where: { classOfferingId: c, isActive: true },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            stage: true,
            test: { select: { title: true } },
            attempts: {
              where: { learnerId: actor.id },
              orderBy: { attemptNumber: 'desc' },
              take: 1,
              select: { status: true, score: true, maxScore: true, submittedAt: true },
            },
          },
        });
        formalAssessments = assessments.map((fa) => ({
          id: fa.id,
          title: fa.test.title,
          stage: fa.stage,
          status: fa.attempts[0]?.status ?? 'NOT_STARTED',
          score: fa.attempts[0]?.score ?? null,
          maxScore: fa.attempts[0]?.maxScore ?? null,
          submittedAt: fa.attempts[0]?.submittedAt?.toISOString() ?? null,
        }));
      }

      if (tx.classActivity?.count) {
        draftCoreQuizCount = await tx.classActivity.count({
          where: { type: 'QUIZ', state: 'DRAFT', section: { classOfferingId: c } },
        });
      }

      const entries = [];
      for (const s of rows) {
        const published = s.gradeVersions;
        const localDirect = localGradesBySub.get(s.id);
        if (published.length) {
          entries.push({
            submissionId: s.id,
            activityId: s.activityId,
            title: s.revision.title,
            status: 'PUBLISHED',
            gradeSource: 'CORE_RUBRIC',
            result: this.learnerView(published[0]),
            history: published.map((g) => this.learnerView(g)),
          });
        } else if (localDirect) {
          entries.push({
            submissionId: s.id,
            activityId: s.activityId,
            title: s.revision.title,
            status: 'PUBLISHED',
            gradeSource: 'LOCAL_DIRECT',
            result: null,
            directResult: {
              score: Number(localDirect.score ?? 0),
              maxScore: Number(localDirect.max_score ?? 10),
              feedback: String(localDirect.feedback ?? ''),
              gradedAt: localDirect.graded_at ? new Date(localDirect.graded_at).toISOString() : null,
              publishedAt: localDirect.published_at
                ? new Date(localDirect.published_at).toISOString()
                : null,
            },
            history: [],
          });
        } else {
          const latest = await tx.assignmentGrade.findFirst({
            where: { submissionId: s.id },
            select: { state: true },
            orderBy: { number: 'desc' },
          });
          entries.push({
            submissionId: s.id,
            activityId: s.activityId,
            title: s.revision.title,
            status:
              latest?.state === 'REVIEWED_FINAL'
                ? 'PENDING_PUBLICATION'
                : latest
                  ? 'GRADING_IN_PROGRESS'
                  : 'NOT_GRADED',
            result: null,
            history: [],
          });
        }
      }
      return {
        entries,
        quizEntries,
        attendanceEntries,
        formalAssessments,
        draftCoreQuizCount,
      };
    });
  }
  file(actor: AuthorityActor, c: string, a: string, id: string, teacher: boolean) {
    return this.run(actor, c, teacher ? 'teacher' : 'academic.grade.publish', async (tx) => {
      const g = await this.grade(tx, c, a, id),
        s = g.submission;
      if (!s.storageKey) throw no();
      await this.assignments.checkFile(s);
      return {
        stream: this.storage.open(s.storageKey),
        mimeType: s.mimeType!,
        fileName: s.originalFileName!,
      };
    });
  }
}
