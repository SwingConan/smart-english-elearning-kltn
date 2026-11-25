import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthorizationService, type AuthorityActor } from '../authorization/authorization.service';
import { ClassLmsService } from '../class-lms/class-lms.service';
import { quizDigest } from '../class-lms/quiz.service';
import {
  KnowledgeDraftDto,
  KnowledgeLinkDto,
  KnowledgeQueryDto,
  KnowledgeRequestDto,
  KnowledgeSelfCheckDto,
  KnowledgeTransitionDto,
} from './knowledge.dto';
import { validateKnowledge } from './knowledge.policy';
type Tx = Prisma.TransactionClient;
type Cap = 'knowledge.author' | 'knowledge.review' | 'knowledge.publish';
type Mode = Cap | 'editor' | 'student' | 'workspace';
const missing = () =>
  new NotFoundException('Knowledge content is unavailable or no longer published');
const stale = () => new ConflictException('KNOWLEDGE_STALE_OR_PROVENANCE_CHANGED');
const include = {
  entry: true,
  articleTags: { include: { tagRevision: { include: { entry: true } } } },
};
type Revision = Prisma.KnowledgeRevisionGetPayload<{ include: typeof include }>;
type Practice = { prompt: string; options: string[]; answer: number; feedback: string };
type Example = { english: string; explanation: string };
type Reference = { title: string; url: string };
@Injectable()
export class KnowledgeLibraryService {
  constructor(
    private readonly db: PrismaService,
    private readonly authority: AuthorizationService,
    private readonly lms: ClassLmsService,
  ) {}
  private async caps(tx: Tx, actor: AuthorityActor) {
    return {
      author: await this.authority.permits(actor.id, 'knowledge.author', { type: 'GLOBAL' }, tx),
      review: await this.authority.permits(actor.id, 'knowledge.review', { type: 'GLOBAL' }, tx),
      publish: await this.authority.permits(actor.id, 'knowledge.publish', { type: 'GLOBAL' }, tx),
    };
  }
  private async run<T>(actor: AuthorityActor, mode: Mode, work: (tx: Tx) => Promise<T>) {
    try {
      return await this.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
          const u = await this.lms.context(tx, actor);
          if (mode === 'student') {
            if (u.role !== 'STUDENT') throw missing();
          } else if (mode === 'editor') {
            const c = await this.caps(tx, actor);
            if (!c.author && !c.review && !c.publish)
              throw new ForbiddenException('Explicit knowledge capability required');
          } else if (mode === 'workspace') {
            if (!['INSTRUCTOR', 'ACADEMIC_MANAGER'].includes(u.role)) throw missing();
          } else await this.authority.requireActor(tx, actor, mode, { type: 'GLOBAL' });
          await tx.$queryRaw`SELECT set_config('app.class_lms_actor',${actor.id},true),set_config('app.class_lms_session',${actor.sessionId},true)`;
          return work(tx);
        },
        { maxWait: 10000, timeout: 30000 },
      );
    } catch (e) {
      if (e instanceof HttpException) throw e;
      const code = String(e) + JSON.stringify(e);
      if (/42501|INDEPENDENT|CAPABILITY_REQUIRED/.test(code))
        throw new ForbiddenException('Current independent knowledge authority required');
      if (/P200[234]|P2034|23514|23505|W03BD_/.test(code)) throw stale();
      throw new ServiceUnavailableException(
        'Knowledge temporarily unavailable; retry the same request',
      );
    }
  }
  private async revision(tx: Tx, id: string) {
    const r = await tx.knowledgeRevision.findUnique({ where: { id }, include });
    if (!r) throw missing();
    return r;
  }
  private async live(tx: Tx, id: string, current = true) {
    const [x] = await tx.$queryRaw<
      { ok: boolean }[]
    >`SELECT w03bd_live(${id}::uuid,${current}) AS ok`;
    return !!x?.ok;
  }
  private async tagsLive(tx: Tx, r: Revision, current = false) {
    for (const t of r.articleTags)
      if (!(await this.live(tx, t.tagRevisionId, current))) return false;
    return true;
  }
  private payload(r: Revision): KnowledgeDraftDto {
    return {
      idempotencyKey: '',
      kind: r.entry.kind as 'ARTICLE' | 'TAG',
      slug: r.entry.slug,
      tagCode: r.entry.tagCode ?? undefined,
      title: r.title,
      objectives: r.objectives,
      bodyMarkdown: r.bodyMarkdown,
      examples: r.examples as Example[],
      practice: r.practice as Practice[],
      references: r.references as Reference[],
      rights: r.rights as unknown as KnowledgeDraftDto['rights'],
      skills: r.skills,
      part: r.part ?? undefined,
      synonyms: r.synonyms,
      tagRevisionIds: r.articleTags.map((x) => x.tagRevisionId),
      expectedPreviousVersion: r.number,
      expectedLockVersion: r.lockVersion,
    };
  }
  private tagView(r: Revision['articleTags'][number]['tagRevision']) {
    return {
      revisionId: r.id,
      entryId: r.entryId,
      code: r.entry.tagCode,
      name: r.title,
      version: r.number,
      skills: r.skills,
      part: r.part,
      synonyms: r.synonyms,
    };
  }
  private internal(r: Revision) {
    return {
      id: r.id,
      entryId: r.entryId,
      kind: r.entry.kind,
      slug: r.entry.slug,
      tagCode: r.entry.tagCode,
      number: r.number,
      state: r.state,
      lockVersion: r.lockVersion,
      entryLockVersion: r.entry.lockVersion,
      latestNumber: r.entry.latestNumber,
      visibility: r.entry.visibility,
      currentPublished: r.entry.publishedRevisionId === r.id,
      createdById: r.createdById,
      makerIds: r.makerIds,
      reviewedById: r.reviewedById,
      reviewedAt: r.reviewedAt,
      publishedAt: r.publishedAt,
      reviewReason: r.reviewReason,
      sourceHash: r.sourceHash,
      withdrawalReason: r.entry.withdrawalReason,
      payload: this.payload(r),
      tags: r.articleTags.map((x) => this.tagView(x.tagRevision)),
    };
  }
  private learner(r: Revision) {
    const p = r.practice as Practice[];
    return {
      revisionId: r.id,
      slug: r.entry.slug,
      title: r.title,
      version: r.number,
      objectives: r.objectives,
      bodyMarkdown: r.bodyMarkdown,
      examples: r.examples as Example[],
      practice: p.map((x, i) => ({ item: i, prompt: x.prompt, options: x.options })),
      references: r.references as Reference[],
      tags: r.articleTags.map((x) => this.tagView(x.tagRevision)),
      publishedAt: r.publishedAt,
      attribution: (r.rights as { owner?: string }).owner ?? '',
      selfCheckOnly: true,
    };
  }
  private async idem<T>(
    tx: Tx,
    actor: AuthorityActor,
    action: string,
    b: KnowledgeRequestDto,
    scope: unknown,
    load: (id: string) => Promise<T>,
    work: () => Promise<{ id: string }>,
  ) {
    const key = b.idempotencyKey.toLowerCase(),
      hash = quizDigest({ scope, body: { ...b, idempotencyKey: key } }),
      kind = 'W03BD_REQUEST',
      prev = await tx.domainAuditEvent.findFirst({
        where: { actorId: actor.id, action, objectType: kind, reason: { startsWith: key + ':' } },
      });
    if (prev) {
      if (prev.reason !== key + ':' + hash) throw stale();
      return load(prev.objectId);
    }
    const x = await work();
    await this.authority.audit(tx, actor.id, action, kind, x.id, key + ':' + hash);
    return load(x.id);
  }
  workspace(actor: AuthorityActor) {
    return this.run(actor, 'workspace', async (tx) => {
      const caps = await this.caps(tx, actor);
      if (!caps.author && !caps.review && !caps.publish)
        return { capabilities: caps, entries: [], tags: [], links: [] };
      const entries = await tx.knowledgeEntry.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 100,
        include: { revisions: { orderBy: { number: 'desc' }, include } },
      });
      const tags = await tx.knowledgeRevision.findMany({
        where: { state: 'PUBLISHED', entry: { kind: 'TAG', visibility: 'LIVE' } },
        include,
      });
      const links = [];
      const rows = await tx.quizKnowledgeLink.findMany({
        take: 200,
        orderBy: { createdAt: 'desc' },
        include: {
          testQuestion: { include: { test: true, question: { select: { content: true } } } },
          tagRevision: { include: { entry: true } },
          articleRevision: { include: { entry: true } },
        },
      });
      for (const row of rows) {
        const c = await this.classOf(tx, row.testQuestion.testId);
        if (!c) continue;
        const allowed = caps.author
          ? await this.teacherAllowed(tx, actor, c)
          : await this.authority.permits(
              actor.id,
              'academic.quiz.approve',
              { type: 'CLASS', id: c },
              tx,
            );
        if (allowed)
          links.push({
            id: row.id,
            state: row.state,
            lockVersion: row.lockVersion,
            classId: c,
            testQuestionId: row.testQuestionId,
            prompt: row.testQuestion.question.content,
            quizTitle: row.testQuestion.test.title,
            quizVersion: row.testQuestion.test.quizVersion,
            tag: row.tagRevision.title,
            article: row.articleRevision.title,
            reason: row.reason,
            makerIds: row.makerIds,
            canReview:
              caps.review &&
              !row.makerIds.includes(actor.id) &&
              !row.testQuestion.test.quizMakerIds.includes(actor.id),
            canPublish:
              caps.publish &&
              !row.makerIds.includes(actor.id) &&
              !row.testQuestion.test.quizMakerIds.includes(actor.id),
          });
      }
      return {
        capabilities: caps,
        entries: entries.map((e) => ({
          id: e.id,
          kind: e.kind,
          slug: e.slug,
          tagCode: e.tagCode,
          visibility: e.visibility,
          lockVersion: e.lockVersion,
          latestNumber: e.latestNumber,
          publishedRevisionId: e.publishedRevisionId,
          revisions: e.revisions.map((r) => ({
            ...this.internal(r),
            canReview: caps.review,
            canPublish: caps.publish,
          })),
        })),
        tags: tags
          .filter((t) => t.entry.publishedRevisionId === t.id)
          .map((t) => ({
            revisionId: t.id,
            entryId: t.entryId,
            code: t.entry.tagCode,
            name: t.title,
            version: t.number,
            skills: t.skills,
            part: t.part,
            synonyms: t.synonyms,
          })),
        links,
      };
    });
  }
  detail(actor: AuthorityActor, id: string) {
    return this.run(actor, 'editor', async (tx) => this.internal(await this.revision(tx, id)));
  }
  save(actor: AuthorityActor, b: KnowledgeDraftDto, entryId?: string, revisionId?: string) {
    return this.run(actor, 'knowledge.author', async (tx) => {
      validateKnowledge(b);
      return this.idem(
        tx,
        actor,
        'W03BD_DRAFT_SAVE',
        b,
        { entryId, revisionId },
        async (id) => this.internal(await this.revision(tx, id)),
        async () => {
          const data = {
            title: b.title.trim(),
            objectives: b.objectives.map((x) => x.trim()).filter(Boolean),
            bodyMarkdown: b.bodyMarkdown,
            examples: b.examples as unknown as Prisma.InputJsonValue,
            practice: b.practice as unknown as Prisma.InputJsonValue,
            rights: (b.rights ?? {}) as unknown as Prisma.InputJsonValue,
            references: b.references as unknown as Prisma.InputJsonValue,
            skills: b.skills,
            part: b.part ?? null,
            synonyms: [...new Set(b.synonyms.map((x) => x.trim().toLowerCase()).filter(Boolean))],
          };
          let r;
          if (revisionId) {
            const old = await this.revision(tx, revisionId);
            if (
              !['DRAFT', 'REJECTED'].includes(old.state) ||
              old.lockVersion !== b.expectedLockVersion ||
              old.number !== b.expectedPreviousVersion ||
              old.entry.slug !== b.slug ||
              old.entry.kind !== b.kind ||
              old.entry.tagCode !== (b.tagCode ?? null)
            )
              throw stale();
            r = await tx.knowledgeRevision.update({
              where: { id: revisionId },
              data: { ...data, state: 'DRAFT', reviewReason: '', lockVersion: { increment: 1 } },
            });
            await tx.knowledgeRevisionTag.deleteMany({ where: { articleRevisionId: r.id } });
          } else {
            let entry = entryId
              ? await tx.knowledgeEntry.findUnique({ where: { id: entryId } })
              : null;
            if (entryId && !entry) throw missing();
            if (entry) {
              if (
                entry.lockVersion !== b.expectedLockVersion ||
                entry.latestNumber !== b.expectedPreviousVersion ||
                entry.slug !== b.slug ||
                entry.kind !== b.kind ||
                entry.tagCode !== (b.tagCode ?? null)
              )
                throw stale();
            } else {
              if (b.expectedLockVersion || b.expectedPreviousVersion) throw stale();
              entry = await tx.knowledgeEntry.create({
                data: {
                  kind: b.kind,
                  slug: b.slug,
                  tagCode: b.tagCode ?? null,
                  createdById: actor.id,
                },
              });
            }
            r = await tx.knowledgeRevision.create({
              data: {
                ...data,
                entryId: entry.id,
                number: entry.latestNumber + 1,
                createdById: actor.id,
                makerIds: [actor.id],
              },
            });
            await tx.knowledgeEntry.update({
              where: { id: entry.id },
              data: { latestNumber: r.number, lockVersion: { increment: 1 } },
            });
          }
          if (b.tagRevisionIds.length)
            await tx.knowledgeRevisionTag.createMany({
              data: b.tagRevisionIds.map((tagRevisionId) => ({
                articleRevisionId: r.id,
                tagRevisionId,
              })),
            });
          await this.authority.audit(
            tx,
            actor.id,
            'KNOWLEDGE_DRAFT',
            'KNOWLEDGE_REVISION',
            r.id,
            'Explicit authorized center draft saved',
          );
          return r;
        },
      );
    });
  }
  transition(
    actor: AuthorityActor,
    id: string,
    action: 'submit' | 'review' | 'reject' | 'publish',
    b: KnowledgeTransitionDto,
  ) {
    const cap: Cap =
      action === 'submit'
        ? 'knowledge.author'
        : action === 'publish'
          ? 'knowledge.publish'
          : 'knowledge.review';
    return this.run(actor, cap, async (tx) =>
      this.idem(
        tx,
        actor,
        'W03BD_REVISION_' + action.toUpperCase(),
        b,
        { id },
        async (rid) => this.internal(await this.revision(tx, rid)),
        async () => {
          const r = await this.revision(tx, id);
          if (r.lockVersion !== b.expectedLockVersion) throw stale();
          if (action === 'submit') {
            if (!['DRAFT', 'REJECTED'].includes(r.state)) throw stale();
            validateKnowledge(this.payload(r), true);
            if (!(await this.tagsLive(tx, r, true))) throw stale();
          } else {
            if (action === 'review' && (r.state !== 'SUBMITTED' || b.rightsConfirmed !== true))
              throw new BadRequestException(
                'Submitted version and explicit academic/rights confirmation required',
              );
            if (
              (action === 'publish' && r.state !== 'REVIEWED') ||
              (action === 'reject' && !['SUBMITTED', 'REVIEWED'].includes(r.state))
            )
              throw stale();
          }
          const state =
              action === 'submit'
                ? 'SUBMITTED'
                : action === 'review'
                  ? 'REVIEWED'
                  : action === 'publish'
                    ? 'PUBLISHED'
                    : 'REJECTED',
            now = await this.lms.now(tx);
          const row = await tx.knowledgeRevision.update({
            where: { id },
            data: {
              state,
              lockVersion: { increment: 1 },
              ...(action === 'review' ? { reviewedById: actor.id, reviewedAt: now } : {}),
              ...(['review', 'reject'].includes(action) ? { reviewReason: b.reason } : {}),
              ...(action === 'publish' ? { publishedById: actor.id, publishedAt: now } : {}),
            },
          });
          if (action === 'publish')
            await tx.knowledgeEntry.update({
              where: { id: r.entryId },
              data: {
                publishedRevisionId: id,
                visibility: 'LIVE',
                withdrawnById: null,
                withdrawnAt: null,
                withdrawalReason: '',
                lockVersion: { increment: 1 },
              },
            });
          await this.authority.audit(
            tx,
            actor.id,
            'KNOWLEDGE_' + action.toUpperCase(),
            'KNOWLEDGE_REVISION',
            id,
            b.reason,
          );
          return row;
        },
      ),
    );
  }
  withdraw(actor: AuthorityActor, id: string, b: KnowledgeTransitionDto) {
    return this.run(actor, 'knowledge.publish', async (tx) =>
      this.idem(
        tx,
        actor,
        'W03BD_WITHDRAW',
        b,
        { id },
        async (eid) => {
          const e = await tx.knowledgeEntry.findUniqueOrThrow({ where: { id: eid } });
          return {
            id: e.id,
            visibility: e.visibility,
            lockVersion: e.lockVersion,
            reason: e.withdrawalReason,
          };
        },
        async () => {
          const e = await tx.knowledgeEntry.findUnique({ where: { id } });
          if (!e) throw missing();
          if (e.lockVersion !== b.expectedLockVersion || e.visibility !== 'LIVE') throw stale();
          const row = await tx.knowledgeEntry.update({
            where: { id },
            data: {
              visibility: 'WITHDRAWN',
              withdrawnById: actor.id,
              withdrawnAt: await this.lms.now(tx),
              withdrawalReason: b.reason,
              lockVersion: { increment: 1 },
            },
          });
          await this.authority.audit(
            tx,
            actor.id,
            'KNOWLEDGE_WITHDRAW',
            'KNOWLEDGE_ENTRY',
            id,
            b.reason,
          );
          return row;
        },
      ),
    );
  }
  browse(actor: AuthorityActor, q: KnowledgeQueryDto) {
    return this.run(actor, 'student', async (tx) => {
      const rows = await tx.knowledgeEntry.findMany({
          where: { kind: 'ARTICLE', visibility: 'LIVE' },
          include: { publishedRevision: { include } },
          orderBy: { updatedAt: 'desc' },
        }),
        all = [];
      for (const e of rows) {
        const r = e.publishedRevision;
        if (!r || r.state !== 'PUBLISHED' || !(await this.tagsLive(tx, r))) continue;
        const tags = r.articleTags.map((x) => x.tagRevision);
        if (
          (q.skill && !tags.some((t) => t.skills.includes(q.skill!))) ||
          (q.part && !tags.some((t) => t.part === q.part)) ||
          (q.tag && !tags.some((t) => t.entry.tagCode === q.tag))
        )
          continue;
        const needle = q.search?.trim().toLowerCase();
        if (
          needle &&
          ![
            r.title,
            ...r.objectives,
            ...tags.flatMap((t) => [t.title, t.entry.tagCode ?? '', ...t.synonyms]),
          ]
            .join(' ')
            .toLowerCase()
            .includes(needle)
        )
          continue;
        all.push({
          slug: e.slug,
          title: r.title,
          version: r.number,
          revisionId: r.id,
          objectives: r.objectives,
          tags: r.articleTags.map((x) => this.tagView(x.tagRevision)),
          publishedAt: r.publishedAt,
        });
      }
      const tags = await tx.knowledgeRevision.findMany({
        where: { state: 'PUBLISHED', entry: { kind: 'TAG', visibility: 'LIVE' } },
        include: { entry: true },
      });
      return {
        data: all.slice((q.page - 1) * q.limit, q.page * q.limit),
        meta: { total: all.length, page: q.page, limit: q.limit },
        tags: tags
          .filter((t) => t.entry.publishedRevisionId === t.id)
          .map((t) => ({
            code: t.entry.tagCode,
            name: t.title,
            skills: t.skills,
            part: t.part,
            synonyms: t.synonyms,
          })),
      };
    });
  }
  article(actor: AuthorityActor, slug: string) {
    return this.run(actor, 'student', async (tx) =>
      this.learner(await this.publishedArticle(tx, slug)),
    );
  }
  private async publishedArticle(tx: Tx, slug: string) {
    const e = await tx.knowledgeEntry.findFirst({
      where: { slug, kind: 'ARTICLE', visibility: 'LIVE' },
      include: { publishedRevision: { include } },
    });
    const r = e?.publishedRevision;
    if (!r || r.state !== 'PUBLISHED' || !(await this.tagsLive(tx, r))) throw missing();
    return r;
  }
  selfCheck(actor: AuthorityActor, slug: string, b: KnowledgeSelfCheckDto) {
    return this.run(actor, 'student', async (tx) => {
      const r = await this.publishedArticle(tx, slug);
      if (r.id !== b.revisionId) throw stale();
      const item = (r.practice as Practice[])[b.item];
      if (!item || b.option >= item.options.length)
        throw new BadRequestException('Unknown formative item/option');
      return {
        revisionId: r.id,
        item: b.item,
        correct: b.option === item.answer,
        feedback: item.feedback,
        formativeOnly: true,
        gradeRecorded: false,
      };
    });
  }
  private async classOf(tx: Tx, testId: string) {
    const [c] = await tx.$queryRaw<
      { id: string | null }[]
    >`SELECT w03bc_class(${testId}::uuid) AS id`;
    return c?.id ?? null;
  }
  private async teacherAllowed(tx: Tx, actor: AuthorityActor, c: string) {
    try {
      await this.lms.access(tx, actor, c, true);
      return true;
    } catch (e) {
      if (e instanceof NotFoundException) return false;
      throw e;
    }
  }
  sources(actor: AuthorityActor, c: string) {
    return this.run(actor, 'knowledge.author', async (tx) => {
      await this.lms.access(tx, actor, c, true);
      return tx.test.findMany({
        where: { quizState: 'APPROVED', quizActivity: { section: { classOfferingId: c } } },
        select: {
          id: true,
          title: true,
          quizVersion: true,
          testQuestions: {
            orderBy: { orderIndex: 'asc' },
            select: { id: true, question: { select: { content: true } } },
          },
        },
      });
    });
  }
  private async link(tx: Tx, id: string) {
    const x = await tx.quizKnowledgeLink.findUnique({
      where: { id },
      include: { testQuestion: { include: { test: true } } },
    });
    if (!x) throw missing();
    return x;
  }
  createLink(actor: AuthorityActor, b: KnowledgeLinkDto) {
    return this.run(actor, 'knowledge.author', async (tx) => {
      const tq = await tx.testQuestion.findUnique({
          where: { id: b.testQuestionId },
          include: { test: true },
        }),
        c = tq ? await this.classOf(tx, tq.testId) : null;
      if (!tq || !c || tq.test.quizState !== 'APPROVED' || !tq.test.quizSourceHash) throw missing();
      await this.lms.access(tx, actor, c, true);
      return this.idem(
        tx,
        actor,
        'W03BD_LINK_CREATE',
        b,
        {},
        (id) =>
          this.link(tx, id).then((x) => ({ id: x.id, state: x.state, lockVersion: x.lockVersion })),
        async () =>
          tx.quizKnowledgeLink.create({
            data: {
              testQuestionId: b.testQuestionId,
              tagRevisionId: b.tagRevisionId,
              articleRevisionId: b.articleRevisionId,
              sourceHash: tq.test.quizSourceHash!,
              authoredById: actor.id,
              makerIds: [actor.id],
              reason: b.reason,
            },
          }),
      );
    });
  }
  linkTransition(
    actor: AuthorityActor,
    id: string,
    action: 'submit' | 'review' | 'reject' | 'publish' | 'withdraw',
    b: KnowledgeTransitionDto,
  ) {
    const cap: Cap =
      action === 'submit'
        ? 'knowledge.author'
        : action === 'review' || action === 'reject'
          ? 'knowledge.review'
          : 'knowledge.publish';
    return this.run(actor, cap, async (tx) => {
      const row = await this.link(tx, id),
        c = await this.classOf(tx, row.testQuestion.testId);
      if (!c) throw missing();
      if (action === 'submit') await this.lms.access(tx, actor, c, true);
      else {
        await this.authority.requireActor(tx, actor, 'academic.quiz.approve', {
          type: 'CLASS',
          id: c,
        });
        if (
          row.makerIds.includes(actor.id) ||
          row.testQuestion.test.quizMakerIds.includes(actor.id)
        )
          throw new ForbiddenException('Independent assessment provenance checker required');
      }
      return this.idem(
        tx,
        actor,
        'W03BD_LINK_' + action.toUpperCase(),
        b,
        { id },
        (rid) =>
          this.link(tx, rid).then((x) => ({
            id: x.id,
            state: x.state,
            lockVersion: x.lockVersion,
          })),
        async () => {
          if (row.lockVersion !== b.expectedLockVersion) throw stale();
          if (action === 'review' && b.rightsConfirmed !== true)
            throw new BadRequestException('Explicit reviewed provenance confirmation required');
          const now = await this.lms.now(tx),
            state =
              action === 'submit'
                ? 'SUBMITTED'
                : action === 'review'
                  ? 'REVIEWED'
                  : action === 'reject'
                    ? 'REJECTED'
                    : action === 'publish'
                      ? 'PUBLISHED'
                      : 'WITHDRAWN';
          const x = await tx.quizKnowledgeLink.update({
            where: { id },
            data: {
              state,
              lockVersion: { increment: 1 },
              ...(action === 'review' ? { reviewedById: actor.id, reviewedAt: now } : {}),
              ...(action === 'publish' ? { publishedById: actor.id, publishedAt: now } : {}),
              ...(action === 'withdraw'
                ? { withdrawnById: actor.id, withdrawnAt: now, withdrawalReason: b.reason }
                : {}),
            },
          });
          await this.authority.audit(
            tx,
            actor.id,
            'KNOWLEDGE_LINK_' + action.toUpperCase(),
            'QUIZ_KNOWLEDGE_LINK',
            id,
            b.reason,
          );
          return x;
        },
      );
    });
  }
  recommendations(actor: AuthorityActor) {
    return this.run(actor, 'student', async (tx) => {
      const active = await tx.testAttempt.count({
        where: { learnerId: actor.id, quizDeadline: { not: null }, status: 'IN_PROGRESS' },
      });
      if (active)
        return { state: 'INSUFFICIENT_DATA', message: 'Chưa đủ dữ liệu', recommendations: [] };
      const rows = await tx.$queryRaw<
        { tagRevisionId: string; articleRevisionId: string; correct: number; total: number }[]
      >`
   WITH permitted AS (
    SELECT DISTINCT a.id AS attempt_id,q.id AS question_id,l."tagRevisionId",l."articleRevisionId",
      CASE WHEN cardinality(ans."selectedOptionIds")=1 AND o."isCorrect" THEN 1 ELSE 0 END AS correct
    FROM test_attempts a JOIN enrollments en ON en.id=a."enrollmentId" JOIN tests t ON t.id=a."testId" JOIN test_questions q ON q."testId"=t.id
    JOIN quiz_knowledge_links l ON l."testQuestionId"=q.id AND l.state='PUBLISHED' AND l."sourceHash"=t."quizSourceHash"
    LEFT JOIN test_answers ans ON ans."attemptId"=a.id AND ans."testQuestionId"=q.id LEFT JOIN question_options o ON o.id=ans."selectedOptionIds"[1] AND o."questionId"=q."questionId"
    WHERE a."learnerId"=${actor.id}::uuid AND en."learnerId"=${actor.id}::uuid AND en.status='ACTIVE' AND a.status='SUBMITTED' AND a."quizDeadline" IS NOT NULL AND a."quizPublishedAt" IS NOT NULL AND t."quizState"='APPROVED'
    AND w03bd_live(l."tagRevisionId",true) AND w03bd_live(l."articleRevisionId",true)
   ) SELECT "tagRevisionId","articleRevisionId",sum(correct)::int AS correct,count(*)::int AS total FROM permitted GROUP BY "tagRevisionId","articleRevisionId" HAVING count(*)>=4`;
      const recommendations = [];
      for (const x of rows) {
        const a = await this.revision(tx, x.articleRevisionId),
          tag = await this.revision(tx, x.tagRevisionId);
        if (!(await this.tagsLive(tx, a, true))) continue;
        recommendations.push({
          tag: tag.title,
          code: tag.entry.tagCode,
          correct: x.correct,
          total: x.total,
          message:
            tag.title + ': ' + x.correct + '/' + x.total + ' câu đúng — nên ôn kiến thức này',
          article: { slug: a.entry.slug, title: a.title, version: a.number, revisionId: a.id },
          source: 'PUBLISHED_QUIZ_AGGREGATE',
          notProficiency: true,
        });
      }
      return {
        state: recommendations.length ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
        message: recommendations.length ? 'Gợi ý từ kết quả Quiz đã công bố' : 'Chưa đủ dữ liệu',
        recommendations,
      };
    });
  }
}
