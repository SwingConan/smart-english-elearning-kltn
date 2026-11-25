import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthorizationService, type AuthorityActor } from '../authorization/authorization.service';
import { ClassLmsService } from './class-lms.service';
import { QuizRequestDto, QuizSaveDto, QuizSourceDto, QuizTransitionDto } from './quiz.dto';
type Tx = Prisma.TransactionClient;
type Mode = 'teacher' | 'student' | 'academic.quiz.approve' | 'academic.quiz.grade.publish';
const missing = () => new NotFoundException('Class quiz not available');
const stale = () =>
  new ConflictException('QUIZ_STALE_OR_CLOSED: reload persisted state before retry');
const sourceInclude = {
  testQuestions: {
    orderBy: { orderIndex: 'asc' as const },
    include: { question: { include: { options: { orderBy: { orderIndex: 'asc' as const } } } } },
  },
  classAssessments: true,
};
type Source = Prisma.TestGetPayload<{ include: typeof sourceInclude }>;
const attemptInclude = { test: { include: sourceInclude }, answers: true, quizRevision: true };
type Attempt = Prisma.TestAttemptGetPayload<{ include: typeof attemptInclude }>;
function canonical(x: unknown): unknown {
  return Array.isArray(x)
    ? x.map(canonical)
    : x && typeof x === 'object'
      ? Object.fromEntries(
          Object.entries(x)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, canonical(v)]),
        )
      : x;
}
export function quizDigest(x: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(canonical(x)))
    .digest('hex');
}
@Injectable()
export class ClassQuizService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private ticking = false;
  private readonly logger = new Logger(ClassQuizService.name);
  constructor(
    private readonly db: PrismaService,
    private readonly authority: AuthorizationService,
    private readonly lms: ClassLmsService,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.sweep(), 2000);
    this.timer.unref();
    void this.sweep();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async sweep() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.db.$queryRaw`SELECT w03bc_expire_due()`;
    } catch {
      this.logger.warn(
        'Quiz deadline reconciliation unavailable; durable deadlines retained for retry',
      );
    } finally {
      this.ticking = false;
    }
  }
  private async run<T>(actor: AuthorityActor, c: string, mode: Mode, work: (tx: Tx) => Promise<T>) {
    try {
      return await this.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
          if (mode === 'teacher') await this.lms.access(tx, actor, c, true);
          else if (mode === 'student') {
            const s = await this.lms.access(tx, actor, c);
            if (!s.enrollment) throw missing();
          } else await this.authority.requireActor(tx, actor, mode, { type: 'CLASS', id: c });
          await tx.$queryRaw`SELECT set_config('app.class_lms_actor',${actor.id},true),set_config('app.class_lms_session',${actor.sessionId},true)`;
          await tx.$queryRaw`SELECT w03bc_expire_due()`;
          return work(tx);
        },
        { maxWait: 10000, timeout: 30000 },
      );
    } catch (e) {
      if (e instanceof HttpException) throw e;
      const d = String(e) + JSON.stringify(e);
      if (/42501|INDEPENDENT|SCOPE_DENIED/.test(d))
        throw new ForbiddenException('Current independent class authority required');
      if (/P200[234]|P2034|23514|23505|W03BC_/.test(d)) throw stale();
      this.logger.error('Quiz operation unavailable; private request/source omitted');
      throw new ServiceUnavailableException('Quiz temporarily unavailable; retry the same request');
    }
  }
  private async activity(tx: Tx, c: string, a: string) {
    const x = await this.lms.activity(tx, c, a);
    if (x.type !== 'QUIZ') throw missing();
    return x;
  }
  private async source(tx: Tx, c: string, a: string, id: string) {
    await this.activity(tx, c, a);
    const x = await tx.test.findFirst({ where: { id, quizActivityId: a }, include: sourceInclude });
    if (!x) throw missing();
    return x;
  }
  private sourceView(s: Source, keys = false) {
    const cfg = s.classAssessments[0];
    return {
      id: s.id,
      title: s.title,
      version: s.quizVersion,
      state: s.quizState,
      lockVersion: s.quizLockVersion,
      ...(keys ? { sourceHash: s.quizSourceHash } : {}),
      approvedAt: s.quizApprovedAt,
      openAt: cfg.openAt,
      closeAt: cfg.closeAt,
      durationMinutes: s.timeLimitMinutes,
      questions: s.testQuestions.map((q) => ({
        id: q.id,
        content: q.question.content,
        points: q.points,
        ...(keys ? { explanation: q.question.explanation } : {}),
        options: q.question.options.map((o) => ({
          id: o.id,
          content: o.content,
          ...(keys ? { isCorrect: o.isCorrect } : {}),
        })),
      })),
    };
  }
  private async ownAttempt(tx: Tx, actor: AuthorityActor, c: string, id: string) {
    const a = await tx.testAttempt.findFirst({
      where: {
        id,
        learnerId: actor.id,
        quizDeadline: { not: null },
        enrollment: { classOfferingId: c, status: 'ACTIVE' },
      },
      include: attemptInclude,
    });
    if (!a || !a.quizRevision || a.quizRevision.classOfferingId !== c) throw missing();
    return a;
  }
  private attemptView(a: Attempt, now: Date) {
    return {
      id: a.id,
      activityId: a.test.quizActivityId,
      source: this.sourceView(a.test),
      state: a.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : a.quizFinalReason,
      lockVersion: a.quizLockVersion,
      startedAt: a.startedAt,
      deadline: a.quizDeadline,
      serverNow: now,
      marked: a.quizMarked,
      answers: a.answers.map((x) => ({
        questionId: x.testQuestionId,
        optionId: x.selectedOptionIds[0] ?? null,
      })),
      receipt: a.quizReceipt,
      submittedAt: a.submittedAt,
      gradeState: a.quizPublishedAt
        ? 'PUBLISHED'
        : a.status === 'SUBMITTED'
          ? 'PENDING_RELEASE'
          : null,
      result: a.quizPublishedAt
        ? {
            earned: a.score,
            max: a.maxScore,
            percentage: a.maxScore
              ? Number((((a.score ?? 0) * 100) / a.maxScore).toFixed(2))
              : null,
            publishedAt: a.quizPublishedAt,
          }
        : null,
    };
  }
  private async idem<T>(
    tx: Tx,
    actor: AuthorityActor,
    c: string,
    action: string,
    b: QuizRequestDto,
    scope: unknown,
    load: (id: string) => Promise<T>,
    work: () => Promise<{ id: string }>,
  ) {
    const key = b.idempotencyKey.toLowerCase(),
      hash = quizDigest({ scope, body: { ...b, idempotencyKey: key } }),
      kind = 'W03BC_' + c;
    const row = await tx.domainAuditEvent.findFirst({
      where: { actorId: actor.id, action, objectType: kind, reason: { startsWith: key + ':' } },
    });
    if (row) {
      if (row.reason !== key + ':' + hash) throw stale();
      return load(row.objectId);
    }
    const out = await work();
    await this.authority.audit(tx, actor.id, action, kind, out.id, key + ':' + hash);
    return load(out.id);
  }
  author(actor: AuthorityActor, c: string, a: string) {
    return this.run(actor, c, 'teacher', async (tx) => {
      await this.activity(tx, c, a);
      const sources = await tx.test.findMany({
        where: { quizActivityId: a },
        include: sourceInclude,
        orderBy: { quizVersion: 'desc' },
      });
      const attempts = await tx.testAttempt.findMany({
        where: { test: { quizActivityId: a }, status: 'SUBMITTED' },
        include: { test: true, learner: { select: { fullName: true } } },
      });
      return {
        sources: sources.map((s) => this.sourceView(s, true)),
        attempts: attempts.map((x) => ({
          id: x.id,
          learnerName: x.learner.fullName,
          version: x.test.quizVersion,
          state: x.quizFinalReason,
          submittedAt: x.submittedAt,
          earned: x.score,
          max: x.maxScore,
          gradeState: x.quizPublishedAt ? 'PUBLISHED' : 'PENDING_RELEASE',
        })),
      };
    });
  }
  saveSource(actor: AuthorityActor, c: string, a: string, b: QuizSourceDto, id?: string) {
    return this.run(actor, c, 'teacher', async (tx) => {
      await this.activity(tx, c, a);
      if (
        !b.title.trim() ||
        new Date(b.closeAt) <= new Date(b.openAt) ||
        b.questions.some(
          (q) =>
            !q.content.trim() ||
            q.options.filter((o) => o.isCorrect).length !== 1 ||
            q.options.some((o) => !o.content.trim()),
        )
      )
        throw new BadRequestException(
          'Explicit valid window, prompt and exactly one correct option required',
        );
      return this.idem(
        tx,
        actor,
        c,
        'W03BC_SOURCE_SAVE',
        b,
        { a, id },
        async (rid) => this.sourceView(await this.source(tx, c, a, rid), true),
        async () => {
          const latest = await tx.test.findFirst({
            where: { quizActivityId: a },
            orderBy: { quizVersion: 'desc' },
          });
          let s;
          if (id) {
            if (
              !latest ||
              latest.id !== id ||
              latest.quizState !== 'DRAFT' ||
              latest.quizVersion !== b.expectedVersion ||
              latest.quizLockVersion !== b.expectedLockVersion
            )
              throw stale();
            s = await tx.test.update({
              where: { id },
              data: {
                title: b.title.trim(),
                timeLimitMinutes: b.durationMinutes,
                quizLockVersion: { increment: 1 },
                quizMakerIds: { push: actor.id },
              },
            });
            const qs = await tx.testQuestion.findMany({
              where: { testId: id },
              select: { questionId: true },
            });
            await tx.testQuestion.deleteMany({ where: { testId: id } });
            await tx.questionOption.deleteMany({
              where: { questionId: { in: qs.map((x) => x.questionId) } },
            });
            await tx.question.deleteMany({ where: { id: { in: qs.map((x) => x.questionId) } } });
          } else {
            if (
              (latest?.quizVersion ?? 0) !== b.expectedVersion ||
              (latest && latest.quizState !== 'APPROVED')
            )
              throw stale();
            s = await tx.test.create({
              data: {
                title: b.title.trim(),
                purpose: 'IN_CLASS',
                status: 'DRAFT',
                timeLimitMinutes: b.durationMinutes,
                maxAttempts: 1,
                showResultAfterSubmit: false,
                quizActivityId: a,
                quizVersion: b.expectedVersion + 1,
                quizState: 'DRAFT',
                quizAuthorId: actor.id,
                quizMakerIds: [actor.id],
              },
            });
          }
          const config = {
            openAt: new Date(b.openAt),
            closeAt: new Date(b.closeAt),
            maxAttemptsOverride: 1,
            isActive: false,
          };
          const old = await tx.classAssessment.findFirst({ where: { testId: s.id } });
          if (old) await tx.classAssessment.update({ where: { id: old.id }, data: config });
          else
            await tx.classAssessment.create({
              data: { ...config, testId: s.id, classOfferingId: c, stage: 'PERIODIC' },
            });
          for (const [index, q] of b.questions.entries()) {
            const row = await tx.question.create({
              data: {
                quizSourceId: s.id,
                responseType: 'SINGLE_CHOICE',
                difficulty: 'MEDIUM',
                toeicSkill: 'READING',
                content: q.content.trim(),
                explanation: q.explanation,
                options: {
                  create: q.options.map((o, i) => ({
                    content: o.content.trim(),
                    isCorrect: o.isCorrect,
                    orderIndex: i,
                  })),
                },
              },
            });
            await tx.testQuestion.create({
              data: { testId: s.id, questionId: row.id, orderIndex: index, points: q.points },
            });
          }
          return s;
        },
      );
    });
  }
  approve(actor: AuthorityActor, c: string, a: string, id: string, b: QuizTransitionDto) {
    return this.run(actor, c, 'academic.quiz.approve', async (tx) =>
      this.idem(
        tx,
        actor,
        c,
        'W03BC_SOURCE_APPROVE',
        b,
        { a, id },
        async (rid) => this.sourceView(await this.source(tx, c, a, rid), true),
        async () => {
          const s = await this.source(tx, c, a, id);
          if (s.quizMakerIds.includes(actor.id))
            throw new ForbiddenException('Independent checker required');
          if (s.quizState !== 'DRAFT' || s.quizLockVersion !== b.expectedLockVersion) throw stale();
          return tx.test.update({
            where: { id },
            data: {
              quizState: 'APPROVED',
              quizApprovedById: actor.id,
              quizApprovedAt: await this.lms.now(tx),
              quizSourceHash: quizDigest(this.sourceView(s, true)),
              quizLockVersion: { increment: 1 },
            },
          });
        },
      ),
    );
  }
  launch(actor: AuthorityActor, c: string, a: string) {
    return this.run(actor, c, 'student', async (tx) => {
      const x = await this.activity(tx, c, a),
        r = x.publishedRevision;
      if (x.state !== 'PUBLISHED' || !x.section.publishedRevisionId || !r?.quizTestId)
        throw missing();
      const s = await this.source(tx, c, a, r.quizTestId);
      if (s.quizState !== 'APPROVED') throw missing();
      const prior = await tx.testAttempt.findFirst({
        where: { testId: s.id, learnerId: actor.id, quizDeadline: { not: null } },
        include: attemptInclude,
      });
      return {
        source: { ...this.sourceView(s), questions: [], questionCount: s.testQuestions.length },
        attempt: prior ? this.attemptView(prior, await this.lms.now(tx)) : null,
        serverNow: await this.lms.now(tx),
      };
    });
  }
  start(actor: AuthorityActor, c: string, a: string, b: QuizRequestDto & { sourceId: string }) {
    return this.run(actor, c, 'student', async (tx) =>
      this.idem(
        tx,
        actor,
        c,
        'W03BC_START',
        b,
        { a },
        async (id) =>
          this.attemptView(await this.ownAttempt(tx, actor, c, id), await this.lms.now(tx)),
        async () => {
          const existing = await tx.testAttempt.findFirst({
            where: {
              testId: b.sourceId,
              learnerId: actor.id,
              quizDeadline: { not: null },
              test: { quizActivityId: a },
            },
          });
          if (existing) return existing;
          const x = await this.activity(tx, c, a),
            r = x.publishedRevision,
            s = await this.source(tx, c, a, b.sourceId),
            now = await this.lms.now(tx),
            cfg = s.classAssessments[0];
          if (
            x.state !== 'PUBLISHED' ||
            !x.section.publishedRevisionId ||
            r?.quizTestId !== s.id ||
            s.quizState !== 'APPROVED' ||
            !cfg.openAt ||
            !cfg.closeAt ||
            now < cfg.openAt ||
            now >= cfg.closeAt
          )
            throw new ConflictException('Quiz source or opening window unavailable');
          const e = await tx.enrollment.findFirstOrThrow({
            where: { learnerId: actor.id, classOfferingId: c, status: 'ACTIVE' },
          });
          return tx.testAttempt.create({
            data: {
              testId: s.id,
              learnerId: actor.id,
              enrollmentId: e.id,
              classAssessmentId: cfg.id,
              attemptNumber: 1,
              quizRevisionId: r.id,
              quizDeadline: new Date(
                Math.min(now.getTime() + s.timeLimitMinutes! * 60000, cfg.closeAt.getTime()),
              ),
            },
          });
        },
      ),
    );
  }
  resume(actor: AuthorityActor, c: string, id: string) {
    return this.run(actor, c, 'student', async (tx) =>
      this.attemptView(await this.ownAttempt(tx, actor, c, id), await this.lms.now(tx)),
    );
  }
  save(actor: AuthorityActor, c: string, id: string, b: QuizSaveDto) {
    return this.run(actor, c, 'student', async (tx) =>
      this.idem(
        tx,
        actor,
        c,
        'W03BC_ANSWERS',
        b,
        { id },
        async (rid) =>
          this.attemptView(await this.ownAttempt(tx, actor, c, rid), await this.lms.now(tx)),
        async () => {
          const a = await this.ownAttempt(tx, actor, c, id);
          if (a.status !== 'IN_PROGRESS') return a;
          if (a.quizLockVersion !== b.expectedLockVersion) throw stale();
          const allowed = a.test.testQuestions;
          if (
            b.answers.some(
              (x) =>
                !allowed.some(
                  (q) =>
                    q.id === x.questionId &&
                    (!x.optionId || q.question.options.some((o) => o.id === x.optionId)),
                ),
            ) ||
            b.marked.some((x) => !allowed.some((q) => q.id === x))
          )
            throw new BadRequestException('Foreign question or option');
          await tx.testAttempt.update({
            where: { id },
            data: { quizLockVersion: { increment: 1 }, quizMarked: b.marked },
          });
          for (const q of allowed) {
            const v = b.answers.find((x) => x.questionId === q.id)?.optionId;
            await tx.testAnswer.upsert({
              where: { attemptId_testQuestionId: { attemptId: id, testQuestionId: q.id } },
              create: { attemptId: id, testQuestionId: q.id, selectedOptionIds: v ? [v] : [] },
              update: { selectedOptionIds: v ? [v] : [] },
            });
          }
          return a;
        },
      ),
    );
  }
  submit(actor: AuthorityActor, c: string, id: string, b: QuizTransitionDto) {
    return this.run(actor, c, 'student', async (tx) =>
      this.idem(
        tx,
        actor,
        c,
        'W03BC_SUBMIT',
        b,
        { id },
        async (rid) =>
          this.attemptView(await this.ownAttempt(tx, actor, c, rid), await this.lms.now(tx)),
        async () => {
          const a = await this.ownAttempt(tx, actor, c, id);
          if (a.status === 'SUBMITTED') return a;
          if (a.quizLockVersion !== b.expectedLockVersion) throw stale();
          return tx.testAttempt.update({
            where: { id },
            data: { status: 'SUBMITTED', quizLockVersion: { increment: 1 } },
          });
        },
      ),
    );
  }
  publish(actor: AuthorityActor, c: string, id: string, b: QuizTransitionDto) {
    return this.run(actor, c, 'academic.quiz.grade.publish', async (tx) =>
      this.idem(
        tx,
        actor,
        c,
        'W03BC_GRADE_PUBLISH',
        b,
        { id },
        async (rid) => this.summary(tx, c, rid),
        async () => {
          const a = await tx.testAttempt.findFirst({
            where: {
              id,
              status: 'SUBMITTED',
              quizDeadline: { not: null },
              enrollment: { classOfferingId: c, status: 'ACTIVE' },
            },
            include: { test: true },
          });
          if (!a) throw missing();
          if (a.test.quizMakerIds.includes(actor.id))
            throw new ForbiddenException('Independent checker required');
          if (a.quizPublishedAt || a.quizLockVersion !== b.expectedLockVersion) throw stale();
          return tx.testAttempt.update({
            where: { id },
            data: {
              quizPublishedById: actor.id,
              quizPublishedAt: await this.lms.now(tx),
              quizLockVersion: { increment: 1 },
            },
          });
        },
      ),
    );
  }
  private async summary(tx: Tx, c: string, id: string) {
    const a = await tx.testAttempt.findFirst({
      where: {
        id,
        quizDeadline: { not: null },
        enrollment: { classOfferingId: c },
        status: 'SUBMITTED',
      },
      include: { test: true, learner: { select: { fullName: true } } },
    });
    if (!a) throw missing();
    return {
      id: a.id,
      title: a.test.title,
      activityId: a.test.quizActivityId,
      classId: c,
      learnerName: a.learner.fullName,
      version: a.test.quizVersion,
      lockVersion: a.quizLockVersion,
      earned: a.score,
      max: a.maxScore,
      submittedAt: a.submittedAt,
      publishedAt: a.quizPublishedAt,
    };
  }
  gradebook(actor: AuthorityActor, c: string) {
    return this.run(actor, c, 'student', async (tx) => {
      const all = await tx.testAttempt.findMany({
        where: {
          learnerId: actor.id,
          quizDeadline: { not: null },
          enrollment: { classOfferingId: c, status: 'ACTIVE' },
        },
        include: attemptInclude,
        orderBy: { startedAt: 'desc' },
      });
      return {
        entries: all.map((a) => ({
          id: a.id,
          title: a.test.title,
          activityId: a.test.quizActivityId,
          version: a.test.quizVersion,
          state:
            a.status === 'IN_PROGRESS'
              ? 'IN_PROGRESS'
              : a.quizPublishedAt
                ? 'PUBLISHED'
                : 'PENDING_RELEASE',
          submittedAt: a.submittedAt,
          result: a.quizPublishedAt
            ? {
                earned: a.score,
                max: a.maxScore,
                percentage: a.maxScore
                  ? Number((((a.score ?? 0) * 100) / a.maxScore).toFixed(2))
                  : null,
                publishedAt: a.quizPublishedAt,
              }
            : null,
        })),
      };
    });
  }
  async inbox(actor: AuthorityActor) {
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
        const u = await this.lms.context(tx, actor);
        if (u.role !== 'ACADEMIC_MANAGER') throw missing();
        await tx.$queryRaw`SELECT w03bc_expire_due()`;
        const now = await this.lms.now(tx);
        const grants = await tx.permissionGrant.findMany({
          where: {
            userId: actor.id,
            capability: { in: ['academic.quiz.approve', 'academic.quiz.grade.publish'] },
            scopeType: 'CLASS',
            approvedAt: { not: null },
            revokedAt: null,
            effectiveAt: { lte: now },
            expiresAt: { gt: now },
          },
        });
        const sources = [];
        const attempts = [];
        for (const c of [...new Set(grants.map((g) => g.scopeId!).filter(Boolean))]) {
          const canSource = await this.authority.permits(
              actor.id,
              'academic.quiz.approve',
              { type: 'CLASS', id: c },
              tx,
            ),
            canGrade = await this.authority.permits(
              actor.id,
              'academic.quiz.grade.publish',
              { type: 'CLASS', id: c },
              tx,
            );
          if (canSource) {
            const ss = await tx.test.findMany({
              where: { quizActivity: { section: { classOfferingId: c } }, quizState: 'DRAFT' },
              include: sourceInclude,
              take: 100,
            });
            for (const s of ss)
              sources.push({
                ...this.sourceView(s, true),
                classId: c,
                activityId: s.quizActivityId,
                canApprove: !s.quizMakerIds.includes(actor.id),
              });
          }
          if (canGrade) {
            const aa = await tx.testAttempt.findMany({
              where: {
                quizDeadline: { not: null },
                status: 'SUBMITTED',
                quizPublishedAt: null,
                enrollment: { classOfferingId: c, status: 'ACTIVE' },
              },
              include: { test: true },
              take: 100,
            });
            for (const a of aa)
              attempts.push({
                ...(await this.summary(tx, c, a.id)),
                canPublish: !a.test.quizMakerIds.includes(actor.id),
              });
          }
        }
        return { sources, attempts };
      },
      { maxWait: 10000, timeout: 30000 },
    );
  }
}
