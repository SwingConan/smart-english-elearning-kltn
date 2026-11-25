import { supportEventLabel } from './support-event-label';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import {
  MAX_TICKET_ATTACHMENTS,
  readAttachmentFile,
  removeAttachmentFileQuietly,
  type UploadedSupportFile,
  validateSupportAttachment,
  writeAttachmentFile,
} from './support-attachment.policy';
import { Prisma, type SupportTicket, type SupportTopic } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthorizationService, type AuthorityActor } from '../authorization/authorization.service';
import { ROUTES, safeSupportText, supportTransition, SUPPORT_CAPABILITIES } from './support.policy';
import type {
  CounselingActionDto,
  CounselingDraftDto,
  SupportActionDto,
  SupportChangeDto,
  SupportConsentDto,
  SupportCreateDto,
  SupportMessageDto,
  SupportReferralDto,
  SupportReferralReplyDto,
  SupportTechnicalEscalationDto,
  SupportTopicDto,
} from './support.dto';
import {
  placementEligibility,
  type PlacementSnapshot,
  type PlacementProvenance,
} from '../placement/source-eligibility';
type Tx = Prisma.TransactionClient;
type Ticket = SupportTicket & { topic: SupportTopic };
const missing = () => new NotFoundException('Support item unavailable');
const conflict = () => new ConflictException('SUPPORT_STALE_OR_IDEMPOTENCY_CONFLICT');
const hash = (x: string) => createHash('sha256').update(x).digest('hex');
const asJson = (x: unknown) => x as Prisma.InputJsonValue;
@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);
  constructor(
    private readonly db: PrismaService,
    private readonly authority: AuthorizationService,
  ) {}
  private async clock(tx: Tx) {
    const [r] = await tx.$queryRaw<
      { ms: number }[]
    >`SELECT (EXTRACT(EPOCH FROM clock_timestamp())*1000)::double precision AS ms`;
    return new Date(r.ms);
  }
  private async fence(tx: Tx) {
    if (
      process.env.W05A_ENABLED !== 'DEV_SUPPORT' ||
      process.env.NODE_ENV === 'production' ||
      !process.env.E2E_DATABASE_URL ||
      process.env.E2E_DATABASE_URL !== process.env.DATABASE_URL
    )
      throw new ConflictException('SUPPORT_PRIVATE_DEV_ONLY');
    const vpsApproved = process.env.VPS_DEPLOY_APPROVED === 'SMART_ENGLISH_VPS_2026';
    const u = new URL(process.env.E2E_DATABASE_URL);
    const dedicatedDemo = u.pathname === '/v2_wave01_dev_test_w04b_br136_demo_20261111_42db33';
    const allowedPort = u.port === '55401' || (vpsApproved && (u.port === '5432' || u.port === ''));
    if (
      u.hostname !== '127.0.0.1' ||
      !allowedPort ||
      u.username !== 'wave01' ||
      (!/^\/v2_wave01_dev_test_(w05a|w04b_w05a)_[a-z0-9_]+$/.test(u.pathname) && !dedicatedDemo) ||
      u.search ||
      u.hash
    )
      throw new ConflictException('SUPPORT_PRIVATE_DEV_ONLY');
    const [i] = await tx.$queryRaw<
      {
        db: string;
        usr: string;
        schema: string;
        dir: string;
        host: string;
        port: number;
        marker: string;
      }[]
    >`SELECT current_database() db,current_user usr,current_schema() schema,current_setting('data_directory') dir,host(inet_server_addr()) host,inet_server_port() port,shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker`;
    const expectedPort = Number(u.port || '5432');
    const dirMismatch = vpsApproved
      ? !i.dir
      : resolve(i.dir) !== resolve('.local-storage/v2-wave01/postgres');
    if (
      i.db !== u.pathname.slice(1) ||
      i.usr !== 'wave01' ||
      i.schema !== 'public' ||
      i.host !== '127.0.0.1' ||
      (vpsApproved ? i.port !== expectedPort : i.port !== 55401) ||
      dirMismatch ||
      i.marker !== 'SMART_ENGLISH_DISPOSABLE_E2E_V1'
    )
      throw new ConflictException('SUPPORT_PRIVATE_DEV_ONLY');
    // This additional target is exact and PO-approved. Existing targets retain
    // their original fence; the shared identity assertion pins OID, physical
    // cluster, marker, path, role and native endpoint for the dedicated demo.
    if (dedicatedDemo) await tx.$queryRaw`SELECT 1 FROM br136_bank_check.assert_target()`;
  }
  private async current(tx: Tx, a: AuthorityActor) {
    const [s] = await tx.$queryRaw<
      { sid: string }[]
    >`SELECT sid FROM user_sessions WHERE sid=${a.sessionId} AND sess->>'userId'=${a.id} AND expire>clock_timestamp()`;
    const u = await tx.user.findFirst({ where: { id: a.id, status: 'ACTIVE' } });
    if (!s || !u) throw new UnauthorizedException('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    if (!u.email.endsWith('@example.invalid')) {
      // Real login emails are valid only on the positively identified local demo.
      // Session ownership, active account and all topic-scoped grants remain mandatory.
      await tx.$queryRaw`SELECT 1 FROM br136_bank_check.assert_target()`;
    }
    return u;
  }
  availability(a: AuthorityActor) {
    return this.run(a, async tx => {
      const u = await this.current(tx, a);
      if (u.role !== 'STUDENT') throw new ForbiddenException('Kênh này dành cho học viên.');
      const topics = await this.topics(tx), now = await this.clock(tx);
      const counselors = await tx.user.findMany({where:{role:'COUNSELOR',status:'ACTIVE'},select:{id:true}});
      const grants = await tx.permissionGrant.findMany({
        where: {
          scopeType: 'SUPPORT_TOPIC', scopeId: { in: topics.map(t=>t.code) },
          capability: { in: ['support.ticket.read','support.ticket.assign','support.ticket.reply'] },
          approvedBy: { not: null }, approvedAt: { lte: now }, revokedAt: null,
          userId: { in: counselors.map(u=>u.id) },
        },
        select: { userId: true, scopeId: true, capability: true, effectiveAt: true, expiresAt: true },
      });
      const handlingAvailable = topics.some(t => grants.some(g =>
        g.scopeId === t.code && ['support.ticket.assign','support.ticket.reply'].every(cap =>
          grants.some(p=>p.scopeId===t.code&&p.userId===g.userId&&p.capability===cap&&p.effectiveAt<=now&&p.expiresAt>now)) &&
        grants.some(p=>p.scopeId===t.code&&p.userId===g.userId&&p.capability==='support.ticket.read'&&p.effectiveAt<=now&&p.expiresAt>now)));
      return {
        canCreate: topics.length > 0, canReadOwnTickets: true,
        reason: !topics.length ? 'NO_APPROVED_TOPIC' : null,
        processingState: handlingAvailable ? 'READY' : grants.some(g=>g.expiresAt<=now) ? 'STAFF_PERMISSION_EXPIRED' : 'STAFF_ASSIGNMENT_REQUIRED',
        consentVersion: 'DEV_SUPPORT_V1',
      };
    });
  }
  private async run<T>(a: AuthorityActor | null, work: (tx: Tx) => Promise<T>) {
    try {
      return await this.db.$transaction(
        async (tx) => {
          // Prisma stores these timestamp-without-time-zone columns as UTC.
          // Keep SQL session/grant expiry comparisons in the same convention;
          // the host timezone must never shorten or extend a temporary grant.
          await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
          await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
          await this.fence(tx);
          if (a) await this.current(tx, a);
          await tx.$queryRaw`SELECT set_config('app.support_actor',${a?.id ?? ''},true),set_config('app.support_session',${a?.sessionId ?? ''},true)`;
          return work(tx);
        },
        { maxWait: 10000, timeout: 30000 },
      );
    } catch (e) {
      if (e instanceof HttpException) throw e;
      const c = String(e);
      this.logger.error(
        JSON.stringify({
          family: 'support_failure',
          code: (e as { code?: string }).code ?? null,
          constraint: /SUPPORT_[A-Z_]+/.exec(c)?.[0] ?? null,
        }),
      );
      if (/42501/.test(c)) throw new ForbiddenException('Current support authority required');
      if (/P2002|P2034|23514|SUPPORT_/.test(c)) throw conflict();
      throw new ServiceUnavailableException(
        'Support unavailable; keep original request key and retry.',
      );
    }
  }
  private async cap(tx: Tx, a: AuthorityActor, cap: string, code: string) {
    if (
      [
        'support.ticket.assign',
        'support.ticket.reply',
        'support.ticket.transfer',
        'support.ticket.close',
        'support.application.write',
      ].includes(cap) &&
      !(await this.authority.permits(
        a.id,
        'support.ticket.read',
        { type: 'SUPPORT_TOPIC', id: code },
        tx,
      ))
    )
      return false;
    return this.authority.permits(a.id, cap, { type: 'SUPPORT_TOPIC', id: code }, tx);
  }
  private async require(tx: Tx, a: AuthorityActor, cap: string, code: string) {
    if (!(await this.cap(tx, a, cap, code)))
      throw new ForbiddenException('Topic-scoped current grant required');
  }
  private async ticket(tx: Tx, id: string) {
    const t = await tx.supportTicket.findUnique({ where: { id }, include: { topic: true } });
    if (!t) throw missing();
    return t;
  }
  private async owned(tx: Tx, a: AuthorityActor, t: Ticket, cap = 'support.ticket.read') {
    const u = await this.current(tx, a);
    if (u.role !== 'COUNSELOR' || t.ownerId !== a.id) throw missing();
    await this.require(tx, a, cap, t.topic.code);
    return u;
  }
  private async hasTechnicalEscalation(tx: Tx, ticketId: string): Promise<boolean> {
    if (typeof (tx as { $queryRaw?: unknown }).$queryRaw !== 'function') return false;
    try {
      const [reg] = await tx.$queryRaw<
        { tbl: string | null }[]
      >`SELECT to_regclass('public.support_technical_escalations')::text AS tbl`;
      if (!reg?.tbl) return false;
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM support_technical_escalations WHERE ticket_id = ${ticketId}::uuid LIMIT 1`;
      return rows.length > 0;
    } catch {
      return false;
    }
  }
  private async hasOpenTechnicalEscalation(tx: Tx, ticketId: string): Promise<boolean> {
    if (typeof (tx as { $queryRaw?: unknown }).$queryRaw !== 'function') return false;
    try {
      const [reg] = await tx.$queryRaw<
        { tbl: string | null }[]
      >`SELECT to_regclass('public.support_technical_escalations')::text AS tbl`;
      if (!reg?.tbl) return false;
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM support_technical_escalations WHERE ticket_id = ${ticketId}::uuid AND status IN ('OPEN', 'IN_REVIEW') LIMIT 1`;
      return rows.length > 0;
    } catch {
      return false;
    }
  }
  private async listTechnicalEscalations(tx: Tx, ticketId: string) {
    if (typeof (tx as { $queryRaw?: unknown }).$queryRaw !== 'function') return [];
    try {
      const [reg] = await tx.$queryRaw<
        { tbl: string | null }[]
      >`SELECT to_regclass('public.support_technical_escalations')::text AS tbl`;
      if (!reg?.tbl) return [];
      return await tx.$queryRaw<
        Array<{
          id: string;
          incidentCategory: string;
          summary: string;
          affectedRoute: string | null;
          affectedAccountEmail: string | null;
          status: string;
          resolutionNote: string | null;
          assignedAdminId: string | null;
          assignedAdminName: string | null;
          resolvedByName: string | null;
          respondedAt: Date | null;
          createdAt: Date;
        }>
      >`
        SELECT e.id,
               e.incident_category AS "incidentCategory",
               e.summary,
               e.affected_route AS "affectedRoute",
               e.affected_account_email AS "affectedAccountEmail",
               e.status,
               e.resolution_note AS "resolutionNote",
               e.assigned_admin_id AS "assignedAdminId",
               au."fullName" AS "assignedAdminName",
               ru."fullName" AS "resolvedByName",
               e.responded_at AS "respondedAt",
               e.created_at AS "createdAt"
        FROM support_technical_escalations e
        LEFT JOIN users au ON au.id = e.assigned_admin_id
        LEFT JOIN users ru ON ru.id = e.resolved_by_id
        WHERE e.ticket_id = ${ticketId}::uuid
        ORDER BY e.created_at DESC
      `;
    } catch {
      return [];
    }
  }
  /** Same target fence and current owner/topic authority as the support workspace. */
  async reportActivity(tx: Tx, actor: AuthorityActor, from: Date, to: Date) {
    await this.fence(tx);
    const u = await this.current(tx, actor);
    if (u.role !== 'COUNSELOR') throw new ForbiddenException('Counselor source required');
    await tx.$queryRaw`SELECT set_config('app.support_actor',${actor.id},true),set_config('app.support_session',${actor.sessionId},true)`;
    const topics = await this.topics(tx),
      ids: string[] = [];
    for (const topic of topics)
      if (await this.cap(tx, actor, 'support.ticket.read', topic.code)) ids.push(topic.id);
    if (!ids.length) return null;
    return tx.supportTicket.findMany({
      where: { ownerId: u.id, topicId: { in: ids }, updatedAt: { gte: from, lt: to } },
      select: { id: true, state: true, lockVersion: true, updatedAt: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: 201,
    });
  }
  private async req<T>(
    tx: Tx,
    principal: string,
    b: { idempotencyKey: string; [key: string]: unknown },
    work: () => Promise<T>,
  ): Promise<T> {
    const digest = hash(JSON.stringify(b)),
      prior = await tx.supportRequest.findUnique({
        where: { principal_key: { principal, key: b.idempotencyKey } },
      });
    if (prior) {
      if (prior.digest !== digest) throw conflict();
      return prior.response as T;
    }
    const result = await work();
    await tx.supportRequest.create({
      data: { principal, key: b.idempotencyKey, digest, response: asJson(result) },
    });
    return result;
  }
  private cas(t: { lockVersion: number }, b: { expectedLockVersion: number }) {
    if (t.lockVersion !== b.expectedLockVersion) throw conflict();
  }
  private async touch(
    tx: Tx,
    t: Ticket,
    b: SupportChangeDto,
    data: Prisma.SupportTicketUpdateInput = {},
  ) {
    this.cas(t, b);
    return tx.supportTicket.update({
      where: { id: t.id },
      data: { ...data, lockVersion: { increment: 1 }, updatedAt: await this.clock(tx) },
    });
  }
  private async event(
    tx: Tx,
    ticketId: string,
    a: AuthorityActor | null,
    kind: string,
    reason: string,
    publicLabel = 'Thông tin phiếu đã cập nhật',
  ) {
    await tx.supportEvent.create({
      data: { ticketId, actorId: a?.id, kind, reason: safeSupportText(reason), publicLabel },
    });
    if (a)
      await this.authority.audit(tx, a.id, 'SUPPORT_' + kind, 'SupportTicket', ticketId, reason);
  }
  private async bump(tx: Tx, id: string, seconds: number, limit: number) {
    const now = await this.clock(tx),
      prior = await tx.supportAbuseBucket.findUnique({ where: { id } });
    if (prior && now.getTime() - prior.windowStart.getTime() < seconds * 1000) {
      if (prior.count >= limit) throw new HttpException('Too many requests; try later', 429);
      await tx.supportAbuseBucket.update({ where: { id }, data: { count: { increment: 1 } } });
    } else
      await tx.supportAbuseBucket.upsert({
        where: { id },
        create: { id, windowStart: now, count: 1 },
        update: { windowStart: now, count: 1 },
      });
  }
  private async topics(tx: Tx) {
    const rows = await tx.supportTopic.findMany({
      where: { approvedById: { not: null }, approvedAt: { not: null } },
      orderBy: { version: 'desc' },
    });
    return rows.filter((x, i) => rows.findIndex((y) => y.code === x.code) === i);
  }
  publicTopics() {
    return this.run(null, async (tx) => ({
      topics: (await this.topics(tx)).map((t) => ({
        id: t.id,
        code: t.code,
        title: t.title,
        version: t.version,
      })),
      consentVersion: 'DEV_SUPPORT_V1',
      guestPrivateRead: false,
      verificationProvider: false,
      externalDelivery: false,
    }));
  }
  config(a: AuthorityActor) {
    return this.run(a, async (tx) => {
      const u = await this.current(tx, a),
        topics = await this.topics(tx),
        scopes = [];
      for (const t of topics) {
        const caps: string[] = [];
        for (const cap of SUPPORT_CAPABILITIES)
          if (!cap.startsWith('support.taxonomy.') && (await this.cap(tx, a, cap, t.code)))
            caps.push(cap);
        if (caps.length || u.role === 'STUDENT')
          scopes.push({
            id: t.id,
            code: t.code,
            title: t.title,
            version: t.version,
            caps,
            routes: t.routes,
          });
      }
      const taxonomyAuthor = await this.authority.permits(
          a.id,
          'support.taxonomy.author',
          { type: 'GLOBAL' },
          tx,
        ),
        taxonomyApprove = await this.authority.permits(
          a.id,
          'support.taxonomy.approve',
          { type: 'GLOBAL' },
          tx,
        );
      return {
        role: u.role,
        topics: scopes,
        taxonomyAuthor,
        taxonomyApprove,
        taxonomy:
          taxonomyAuthor || taxonomyApprove
            ? await tx.supportTopic.findMany({ orderBy: { createdAt: 'desc' }, take: 50 })
            : [],
        externalDelivery: false,
        guestVerification: false,
      };
    });
  }
  create(a: AuthorityActor | null, ip: string, b: SupportCreateDto) {
    return this.run(a, async (tx) => {
      const secret = process.env.SESSION_SECRET;
      if (!secret) throw new ServiceUnavailableException('Intake unavailable');
      const source = createHmac('sha256', secret).update(ip).digest('hex');
      const principal = a ? a.id : 'G:' + source;
      if (a && (await this.current(tx, a)).role !== 'STUDENT')
        throw new ForbiddenException('Learner intake only');
      return this.req(tx, principal, { ...b }, async () => {
        if (!b.consent || b.website)
          throw new BadRequestException('Consent required, no automated submission');
        const topic = (await this.topics(tx)).find((t) => t.id === b.topicId);
        if (!topic) throw new BadRequestException('Current approved topic required');
        if (a && (b.contact || b.guestName || b.contactMethod !== 'IN_APP'))
          throw new BadRequestException('Identity and contact are session-owned');
        if (
          !a &&
          (!b.guestName ||
            b.contactMethod !== 'EMAIL' ||
            !/^[-a-z0-9._+]+@example\.invalid$/i.test(b.contact ?? ''))
        )
          throw new BadRequestException('Synthetic DEV contact only; ownership remains unverified');
        await tx.$queryRaw`SELECT set_config('app.support_intake','true',true)`;
        await this.bump(tx, source, 60, 6);
        if (!a)
          await this.bump(
            tx,
            createHmac('sha256', secret)
              .update('contact:' + b.contact!.toLowerCase())
              .digest('hex'),
            3600,
            3,
          );
        await tx.$queryRaw`SELECT set_config('app.support_intake','true',true)`;
        const t = await tx.supportTicket.create({
          data: {
            reference: 'SE-' + randomBytes(18).toString('hex'),
            topicId: topic.id,
            learnerId: a?.id,
            guestName: a ? null : safeSupportText(b.guestName!),
            claimedContact: a ? null : b.contact!.toLowerCase(),
            contactMethod: b.contactMethod,
            description: safeSupportText(b.description),
            consentVersion: b.consentVersion,
          },
        });
        await this.event(
          tx,
          t.id,
          a,
          'CREATED',
          'Học viên đã xác nhận đồng ý tiếp nhận hỗ trợ',
          'Đã nhận phiếu',
        );
        return {
          reference: t.reference,
          ...(a ? { id: t.id } : {}),
          contactVerified: false,
          delivery: 'NOT_SENT',
          guestPrivateRead: false,
        };
      });
    });
  }
  topic(a: AuthorityActor, b: SupportTopicDto) {
    return this.run(a, async (tx) => {
      await this.authority.requireActor(tx, a, 'support.taxonomy.author');
      return this.req(tx, a.id, { ...b }, async () => {
        const v = await tx.supportTopic.aggregate({
          where: { code: b.code },
          _max: { version: true },
        });
        const t = await tx.supportTopic.create({
          data: {
            code: b.code,
            version: (v._max.version ?? 0) + 1,
            title: safeSupportText(b.title),
            routes: [...new Set(b.routes)],
            reason: safeSupportText(b.reason),
            authorId: a.id,
          },
        });
        await this.authority.audit(tx, a.id, 'SUPPORT_TOPIC_DRAFT', 'SupportTopic', t.id, b.reason);
        return { id: t.id, version: t.version };
      });
    });
  }
  approveTopic(a: AuthorityActor, id: string, b: SupportChangeDto) {
    return this.run(a, async (tx) => {
      await this.authority.requireActor(tx, a, 'support.taxonomy.approve');
      return this.req(tx, a.id, { ...b, id }, async () => {
        const t = await tx.supportTopic.findUnique({ where: { id } });
        if (!t) throw missing();
        if (t.approvedById)
          throw new ConflictException('Support topic already approved');
        const now = await this.clock(tx);
        await tx.supportTopic.update({
          where: { id },
          data: { approvedById: a.id, approvedAt: now },
        });
        await this.authority.audit(tx, a.id, 'SUPPORT_TOPIC_APPROVE', 'SupportTopic', id, b.reason);
        return { id, approved: true };
      });
    });
  }
  inbox(a: AuthorityActor, state?: string) {
    const summarizeTitle = (desc: string) => {
      const compact = desc.replace(/\s+/g, ' ').trim();
      return compact.length > 90 ? `${compact.slice(0, 87).trim()}…` : compact;
    };
    return this.run(a, async (tx) => {
      const u = await this.current(tx, a);
      if (u.role === 'STUDENT') {
        const rows = await tx.supportTicket.findMany({
          where: { learnerId: a.id, ...(state ? { state } : {}) },
          select: {
            id: true,
            reference: true,
            description: true,
            state: true,
            ownerId: true,
            createdAt: true,
            lockVersion: true,
            topic: { select: { title: true } },
            _count: { select: { attachments: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        });
        return {
          items: rows.map((t) => ({
            id: t.id,
            reference: t.reference,
            title: summarizeTitle(t.description),
            state: t.state,
            assigned: Boolean(t.ownerId),
            attachmentCount: t._count.attachments,
            createdAt: t.createdAt,
            lockVersion: t.lockVersion,
            topic: t.topic,
          })),
        };
      }
      if (u.role !== 'COUNSELOR') throw new ForbiddenException('Counselor inbox only');
      const items = [];
      for (const topic of await this.topics(tx)) {
        const read = await this.cap(tx, a, 'support.ticket.read', topic.code),
          assign = await this.cap(tx, a, 'support.ticket.assign', topic.code);
        if (!read && !assign) continue;
        const rows = await tx.supportTicket.findMany({
          where: {
            topic: { code: topic.code },
            ...(state ? { state } : {}),
            OR: [...(read ? [{ ownerId: a.id }] : []), ...(assign ? [{ ownerId: null }] : [])],
          },
          include: { _count: { select: { attachments: true } } },
          take: 100,
          orderBy: { createdAt: 'desc' },
        });
        for (const t of rows)
          items.push({
            id: t.id,
            reference: t.reference,
            title: summarizeTitle(t.description),
            state: t.state,
            topic: { title: topic.title },
            assigned: t.ownerId === a.id,
            attachmentCount: t._count.attachments,
            createdAt: t.createdAt,
            lockVersion: t.lockVersion,
          });
      }
      return {
        items: items.sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime()).slice(0, 100),
      };
    });
  }
  detail(a: AuthorityActor, id: string) {
    return this.run(a, async (tx) => {
      const t = await this.ticket(tx, id),
        u = await this.current(tx, a),
        learner = u.role === 'STUDENT' && t.learnerId === a.id,
        escalatedAdmin =
          !learner &&
          u.role === 'SYSTEM_ADMIN' &&
          (await this.hasTechnicalEscalation(tx, id));
      if (!learner && !escalatedAdmin) await this.owned(tx, a, t);
      const learnerAccount =
        !learner && t.learnerId
          ? await tx.user.findUnique({
              where: { id: t.learnerId },
              select: { email: true, fullName: true },
            })
          : null;
      const technicalEscalations = await this.listTechnicalEscalations(tx, id);
      const messages = await tx.supportMessage.findMany({
          where: { ticketId: id, ...(learner ? { visibility: 'PUBLIC' } : {}) },
          orderBy: { createdAt: 'asc' },
          take: 200,
        }),
        events = await tx.supportEvent.findMany({
          where: { ticketId: id, ...(learner ? { kind: { not: 'INTERNAL_NOTE' } } : {}) },
          orderBy: { createdAt: 'asc' },
          take: 200,
        });
      const consents = await tx.supportConsent.findMany({
        where: { ticketId: id },
        orderBy: { createdAt: 'desc' },
      });
      const attachments = await tx.supportTicketAttachment.findMany({
        where: { ticketId: id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          byteSize: true,
          createdAt: true,
        },
      });
      return {
        id: t.id,
        reference: t.reference,
        topic: {
          id: t.topicId,
          code: t.topic.code,
          title: t.topic.title,
          routes: learner ? [] : t.topic.routes,
        },
        state: t.state,
        assigned: Boolean(t.ownerId),
        lockVersion: t.lockVersion,
        description: t.description,
        createdAt: t.createdAt,
        attachments: attachments.map((att) => ({
          id: att.id,
          originalName: att.originalName,
          mimeType: att.mimeType,
          byteSize: att.byteSize,
          createdAt: att.createdAt,
        })),
        identity: learner
          ? undefined
          : {
              learnerId: t.learnerId,
              learnerEmail: learnerAccount?.email ?? null,
              learnerName: learnerAccount?.fullName ?? null,
              guestName: t.guestName,
              claimedContact: t.claimedContact,
              contactVerified: false,
              contactBasis: t.learnerId ? 'AUTHENTICATED_ACCOUNT' : 'UNVERIFIED_CLAIM',
            },
        technicalEscalations: learner
          ? technicalEscalations.map((e) => ({
              id: e.id,
              incidentCategory: e.incidentCategory,
              status: e.status,
              createdAt: e.createdAt,
              respondedAt: e.respondedAt,
            }))
          : technicalEscalations,
        messages: messages.map((m) => ({
          id: m.id,
          body: m.body,
          visibility: m.visibility,
          from: m.actorId === t.learnerId ? 'LEARNER' : 'STAFF',
          createdAt: m.createdAt,
        })),
        events: events.map((e) => ({
          id: e.id,
          label: supportEventLabel(e.kind, e.publicLabel),
          createdAt: e.createdAt,
          ...(!learner ? { kind: e.kind, reason: e.reason, actorId: e.actorId } : {}),
        })),
        consents: consents.map((c) => ({
          id: c.id,
          purpose: c.purpose,
          attemptId: c.attemptId,
          granted: c.granted,
          createdAt: c.createdAt,
        })),
        referrals: learner
          ? []
          : await tx.supportReferral.findMany({
              where: { ticketId: id },
              orderBy: { createdAt: 'desc' },
            }),
        applications: learner
          ? []
          : await tx.counselingApplication.findMany({
              where: { ticketId: id },
              orderBy: { number: 'desc' },
            }),
      };
    });
  }
  async uploadAttachments(a: AuthorityActor, id: string, files: UploadedSupportFile[]) {
    if (!Array.isArray(files) || files.length < 1 || files.length > MAX_TICKET_ATTACHMENTS) {
      throw new BadRequestException(
        `Vui lòng chọn từ 1 đến ${MAX_TICKET_ATTACHMENTS} tệp đính kèm hợp lệ.`,
      );
    }
    const prepared = files.map((file) => {
      const meta = validateSupportAttachment(file);
      const attachmentId = randomUUID();
      return {
        id: attachmentId,
        storedKey: `${id}/${attachmentId}.${meta.extension}`,
        buffer: file.buffer,
        ...meta,
      };
    });
    const writtenKeys: string[] = [];
    try {
      return await this.run(a, async (tx) => {
        const t = await this.ticket(tx, id),
          u = await this.current(tx, a);
        if (u.role !== 'STUDENT' || t.learnerId !== a.id) throw missing();
        if (t.state === 'CLOSED') {
          throw new ConflictException('Phiếu đã đóng, không thể tải thêm tệp đính kèm.');
        }
        const existingCount = await tx.supportTicketAttachment.count({
          where: { ticketId: id },
        });
        if (existingCount + prepared.length > MAX_TICKET_ATTACHMENTS) {
          throw new BadRequestException(
            `Mỗi phiếu chỉ lưu tối đa ${MAX_TICKET_ATTACHMENTS} tệp đính kèm.`,
          );
        }
        const saved = [];
        for (const item of prepared) {
          await writeAttachmentFile(item.storedKey, item.buffer);
          writtenKeys.push(item.storedKey);
          const row = await tx.supportTicketAttachment.create({
            data: {
              id: item.id,
              ticketId: id,
              uploaderId: a.id,
              originalName: item.originalName,
              storedKey: item.storedKey,
              mimeType: item.mimeType,
              byteSize: item.byteSize,
              sha256: item.sha256,
            },
            select: {
              id: true,
              originalName: true,
              mimeType: true,
              byteSize: true,
              createdAt: true,
            },
          });
          saved.push(row);
        }
        return { attachments: saved };
      });
    } catch (error) {
      await Promise.all(writtenKeys.map((k) => removeAttachmentFileQuietly(k)));
      throw error;
    }
  }
  async downloadAttachment(
    a: AuthorityActor,
    id: string,
    attachmentId: string,
    forceDownload = false,
  ) {
    return this.run(a, async (tx) => {
      const t = await this.ticket(tx, id),
        u = await this.current(tx, a),
        learner = u.role === 'STUDENT' && t.learnerId === a.id;
      if (!learner) {
        if (u.role === 'SYSTEM_ADMIN') {
          if (!(await this.hasTechnicalEscalation(tx, id))) {
            throw new NotFoundException('Ticket not found');
          }
        } else {
          await this.owned(tx, a, t);
        }
      }
      const att = await tx.supportTicketAttachment.findFirst({
        where: { id: attachmentId, ticketId: id },
      });
      if (!att) throw missing();
      const buffer = await readAttachmentFile(att.storedKey, att.byteSize, att.sha256);
      const inline = !forceDownload && att.mimeType.startsWith('image/');
      return {
        buffer,
        mimeType: att.mimeType,
        originalName: att.originalName,
        inline,
      };
    });
  }
  assignable(a: AuthorityActor, id: string) {
    return this.run(a, async (tx) => {
      const t = await this.ticket(tx, id);
      if (t.ownerId) await this.owned(tx, a, t, 'support.ticket.transfer');
      else await this.require(tx, a, 'support.ticket.assign', t.topic.code);
      const people = await tx.user.findMany({
          where: {
            role: { in: ['COUNSELOR', 'ACADEMIC_MANAGER', 'CASHIER', 'INSTRUCTOR'] },
            status: 'ACTIVE',
            NOT: { email: { endsWith: '@example.invalid' } },
          },
          select: { id: true, fullName: true, role: true },
          take: 200,
        }),
        admins = await tx.user.findMany({
          where: {
            role: 'SYSTEM_ADMIN',
            status: 'ACTIVE',
            NOT: { email: { endsWith: '@example.invalid' } },
          },
          select: { id: true, fullName: true, role: true, email: true },
          take: 20,
        }),
        result = [];
      for (const u of people) {
        const cap =
          u.role === 'COUNSELOR'
            ? 'support.ticket.read'
            : u.role === 'ACADEMIC_MANAGER'
              ? 'support.application.review'
              : 'support.referral.respond';
        const counselor =
          u.role !== 'COUNSELOR' ||
          (await this.cap(tx, { id: u.id, sessionId: '' }, 'support.ticket.reply', t.topic.code));
        if (
          counselor &&
          ((await this.cap(tx, { id: u.id, sessionId: '' }, cap, t.topic.code)) ||
            (u.role === 'ACADEMIC_MANAGER' &&
              (await this.cap(
                tx,
                { id: u.id, sessionId: '' },
                'support.referral.respond',
                t.topic.code,
              ))))
        )
          result.push({
            ...u,
            canReferral: await this.cap(
              tx,
              { id: u.id, sessionId: '' },
              'support.referral.respond',
              t.topic.code,
            ),
            canApplicationReview: await this.cap(
              tx,
              { id: u.id, sessionId: '' },
              'support.application.review',
              t.topic.code,
            ),
          });
      }
      return { people: result, admins };
    });
  }
  action(a: AuthorityActor, id: string, b: SupportActionDto) {
    return this.run(a, async (tx) => {
      const t = await this.ticket(tx, id),
        u = await this.current(tx, a),
        learner = u.role === 'STUDENT' && t.learnerId === a.id;
      if (b.action === 'ASSIGN') {
        if (t.ownerId) await this.owned(tx, a, t, 'support.ticket.transfer');
        else await this.require(tx, a, 'support.ticket.assign', t.topic.code);
        if (!b.targetId) throw new BadRequestException('Assignment target required');
        await this.require(
          tx,
          { id: b.targetId, sessionId: '' },
          'support.ticket.read',
          t.topic.code,
        );
        await this.require(
          tx,
          { id: b.targetId, sessionId: '' },
          'support.ticket.reply',
          t.topic.code,
        );
      } else if (!learner) await this.owned(tx, a, t, 'support.ticket.close');
      return this.req(tx, a.id, { ...b, id }, async () => {
        this.cas(t, b);
        let data: Prisma.SupportTicketUpdateInput = {};
        if (b.action === 'ASSIGN') data = { ownerId: b.targetId };
        else {
          if (!b.state) throw new BadRequestException('State required');
          supportTransition(t.state, b.state, learner);
          const openSpecialistCount =
            (await tx.supportReferral.count({ where: { ticketId: id, state: 'OPEN' } })) +
            ((await this.hasOpenTechnicalEscalation(tx, id)) ? 1 : 0);
          if (b.state === 'WAITING_SPECIALIST' && !openSpecialistCount)
            throw new BadRequestException('Open referral or technical escalation required');
          if (['RESOLVED', 'CLOSED'].includes(b.state) && openSpecialistCount)
            throw new ConflictException('Open referral or technical escalation must be handled first');
          data = { state: b.state };
        }
        const next = await this.touch(tx, t, b, data);
        await this.event(
          tx,
          id,
          a,
          b.action,
          b.reason,
          b.action === 'ASSIGN' ? 'Phiếu được phân công' : 'Trạng thái phiếu đã cập nhật',
        );
        return { id, lockVersion: next.lockVersion, state: next.state };
      });
    });
  }
  message(a: AuthorityActor, id: string, b: SupportMessageDto) {
    return this.run(a, async (tx) => {
      const t = await this.ticket(tx, id),
        u = await this.current(tx, a),
        learner = u.role === 'STUDENT' && t.learnerId === a.id;
      if (learner) {
        if (b.visibility !== 'PUBLIC')
          throw new ForbiddenException('Learner replies are public to participants only');
      } else await this.owned(tx, a, t, 'support.ticket.reply');
      return this.req(tx, a.id, { ...b, id }, async () => {
        if (t.state === 'CLOSED')
          throw new ConflictException('Reopen closed ticket before replying');
        const n = await this.touch(tx, t, b);
        const m = await tx.supportMessage.create({
          data: {
            ticketId: id,
            actorId: a.id,
            visibility: b.visibility,
            body: safeSupportText(b.body),
          },
        });
        await this.event(
          tx,
          id,
          a,
          b.visibility === 'INTERNAL' ? 'INTERNAL_NOTE' : 'REPLY',
          b.reason,
          b.visibility === 'INTERNAL' ? 'Thông tin xử lý nội bộ' : 'Có phản hồi mới',
        );
        return { id: m.id, ticketId: id, lockVersion: n.lockVersion, delivery: 'IN_APP_ONLY' };
      });
    });
  }
  consent(a: AuthorityActor, id: string, b: SupportConsentDto) {
    return this.run(a, async (tx) => {
      const t = await this.ticket(tx, id),
        u = await this.current(tx, a);
      if (u.role !== 'STUDENT' || t.learnerId !== a.id) throw missing();
      return this.req(tx, a.id, { ...b, id }, async () => {
        if (b.purpose === 'PLACEMENT') {
          if (
            !b.attemptId ||
            !(await tx.testAttempt.findFirst({ where: { id: b.attemptId, learnerId: a.id } }))
          )
            throw missing();
        } else if (b.attemptId) throw new BadRequestException('Application consent has no attempt');
        const n = await this.touch(tx, t, b);
        const c = await tx.supportConsent.create({
          data: {
            ticketId: id,
            learnerId: a.id,
            purpose: b.purpose,
            attemptId: b.attemptId,
            granted: b.granted,
          },
        });
        await this.event(tx, id, a, 'CONSENT', b.reason, 'Lựa chọn đồng ý đã được lưu');
        return { id: c.id, granted: c.granted, lockVersion: n.lockVersion };
      });
    });
  }
  referral(a: AuthorityActor, id: string, b: SupportReferralDto) {
    return this.run(a, async (tx) => {
      const t = await this.ticket(tx, id);
      await this.owned(tx, a, t, 'support.ticket.transfer');
      const u = await tx.user.findFirst({
        where: { id: b.specialistId, status: 'ACTIVE', role: ROUTES[b.category] as 'INSTRUCTOR' },
      });
      if (!u || !t.topic.routes.includes(b.category))
        throw new BadRequestException('Approved referral route and current specialist required');
      await this.require(tx, { id: u.id, sessionId: '' }, 'support.referral.respond', t.topic.code);
      return this.req(tx, a.id, { ...b, id }, async () => {
        if (['CLOSED', 'RESOLVED'].includes(t.state))
          throw new ConflictException('Ticket is resolved');
        if (
          await tx.supportReferral.count({
            where: { ticketId: id, category: b.category, specialistId: u.id, state: 'OPEN' },
          })
        )
          throw conflict();
        const n = await this.touch(tx, t, b);
        const ref = await tx.supportReferral.create({
          data: {
            ticketId: id,
            category: b.category,
            specialistId: u.id,
            createdById: a.id,
            summary: safeSupportText(b.summary),
            reason: safeSupportText(b.reason),
          },
        });
        await this.event(tx, id, a, 'REFERRAL', b.reason, 'Phiếu đang được hỗ trợ chuyên môn');
        return { id: ref.id, lockVersion: n.lockVersion };
      });
    });
  }
  referrals(a: AuthorityActor) {
    return this.run(a, async (tx) => {
      const refs = await tx.supportReferral.findMany({
          where: { specialistId: a.id },
          include: { ticket: { include: { topic: true } } },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        items = [];
      for (const r of refs)
        if (
          (await this.current(tx, a)).role === ROUTES[r.category] &&
          (await this.cap(tx, a, 'support.referral.respond', r.ticket.topic.code))
        )
          items.push({
            id: r.id,
            category: r.category,
            topic: r.ticket.topic.title,
            summary: r.summary,
            state: r.state,
            response: r.response,
            lockVersion: r.lockVersion,
            createdAt: r.createdAt,
          });
      return { items };
    });
  }
  replyReferral(a: AuthorityActor, id: string, b: SupportReferralReplyDto) {
    return this.run(a, async (tx) => {
      const r = await tx.supportReferral.findUnique({
        where: { id },
        include: { ticket: { include: { topic: true } } },
      });
      if (!r || r.specialistId !== a.id || (await this.current(tx, a)).role !== ROUTES[r.category])
        throw missing();
      await this.require(tx, a, 'support.referral.respond', r.ticket.topic.code);
      return this.req(tx, a.id, { ...b, id }, async () => {
        this.cas(r, b);
        if (r.state !== 'OPEN') throw conflict();
        const n = await tx.supportReferral.update({
          where: { id },
          data: {
            state: 'RESPONDED',
            response: safeSupportText(b.response),
            respondedAt: await this.clock(tx),
            lockVersion: { increment: 1 },
          },
        });
        await this.event(
          tx,
          r.ticketId,
          a,
          'REFERRAL_RESPONSE',
          b.reason,
          'Đã có ý kiến chuyên môn',
        );
        return { id, lockVersion: n.lockVersion, state: n.state };
      });
    });
  }
  private async consentFor(tx: Tx, t: Ticket, purpose: string, attemptId?: string) {
    const c = await tx.supportConsent.findFirst({
      where: {
        ticketId: t.id,
        learnerId: t.learnerId ?? '',
        purpose,
        ...(purpose === 'PLACEMENT' ? { attemptId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    if (!c?.granted)
      throw new ForbiddenException('Current learner purpose-specific consent required');
    return c;
  }
  interests(a: AuthorityActor, id: string) {
    return this.run(a, async (tx) => {
      const t = await this.ticket(tx, id);
      await this.owned(tx, a, t, 'support.application.write');
      const rows = await tx.classOffering.findMany({
        where: {
          status: 'OPEN',
          course: { isPublished: true },
          version: { state: 'PUBLISHED' },
          datedSessions: {
            some: { state: 'PUBLISHED', intent: 'PUBLISH', startsAt: { gt: await this.clock(tx) } },
          },
        },
        select: {
          id: true,
          name: true,
          versionId: true,
          version: { select: { number: true, title: true } },
        },
        take: 100,
      });
      const eligible = [];
      for (const row of rows)
        try {
          await this.classInterest(tx, row.id, row.versionId ?? undefined);
          eligible.push(row);
        } catch (e) {
          if (!(e instanceof BadRequestException)) throw e;
        }
      return {
        classes: eligible,
        placementEvidence: [],
        placementStatus: 'NO_GENUINE_CONSENTED_PUBLISHED_RESULT_AVAILABLE',
        noSeatReserved: true,
      };
    });
  }
  private async classInterest(tx: Tx, classId?: string, versionId?: string) {
    if (!classId && !versionId) return null;
    if (!classId || !versionId)
      throw new BadRequestException('Class and pinned course version required together');
    const c = await tx.classOffering.findFirst({
      where: {
        id: classId,
        versionId,
        status: 'OPEN',
        course: { isPublished: true },
        version: { state: 'PUBLISHED' },
        datedSessions: {
          some: { state: 'PUBLISHED', intent: 'PUBLISH', startsAt: { gt: await this.clock(tx) } },
        },
      },
      include: { version: true },
    });
    if (!c) throw new BadRequestException('Eligible class and approved version unavailable');
    const now = await this.clock(tx),
      occupied = await tx.enrollment.count({
        where: { classOfferingId: c.id, status: { in: ['ACTIVE', 'PENDING_PAYMENT'] } },
      });
    if (
      (c.enrollmentStart && c.enrollmentStart > now) ||
      (c.enrollmentEnd && c.enrollmentEnd < now) ||
      (c.maxStudents !== null && occupied >= c.maxStudents)
    )
      throw new BadRequestException('Class admission window or capacity unavailable');
    return {
      classId: c.id,
      courseVersionId: c.versionId,
      className: c.name,
      courseVersion: c.version!.number,
      noSeatReserved: true,
    };
  }
  private async placement(tx: Tx, t: Ticket, id: string) {
    await this.consentFor(tx, t, 'PLACEMENT', id);
    const a = await tx.testAttempt.findFirst({
      where: { id, learnerId: t.learnerId! },
      include: {
        placementVersion: true,
        placementSitting: true,
        placementHumanEvaluations: { include: { release: true } },
      },
    });
    if (!a?.placementVersion || a.placementSitting?.phase !== 'SUBMITTED')
      throw new BadRequestException('No valid independently published Placement result');
    const p = a.placementVersion.provenance as PlacementProvenance,
      s = a.placementVersion.snapshot as unknown as PlacementSnapshot,
      e = placementEligibility(s, p);
    if (
      p.synthetic !== false ||
      a.placementVersion.purpose !== 'LEARNER_PUBLISHABLE' ||
      !e.fullBlueprintAndEvidenceReady ||
      !e.learnerPublishable
    )
      throw new BadRequestException(
        'Synthetic or unapproved Placement cannot evidence proficiency',
      );
    const required = a.placementVersion.mode === 'LR' ? ['LR'] : ['LR', 'SPEAKING', 'WRITING'];
    const releases = [];
    for (const skill of required) {
      const v = a.placementHumanEvaluations
        .filter((v) => v.skill === skill && v.release && v.release.publishedById !== v.graderId)
        .sort((x, y) => y.number - x.number)[0];
      if (!v) throw new BadRequestException('Pending Placement skill is not evidence');
      releases.push({ evaluationId: v.id, publishedById: v.release!.publishedById, skill });
    }
    return {
      attemptId: id,
      sourceHash: a.placementVersion.sourceHash,
      mode: a.placementVersion.mode,
      releases,
    };
  }
  draft(a: AuthorityActor, id: string, b: CounselingDraftDto) {
    return this.run(a, async (tx) => {
      const t = await this.ticket(tx, id);
      await this.owned(tx, a, t, 'support.application.write');
      if (!t.learnerId)
        throw new BadRequestException('Unverified guest cannot become counseling applicant');
      await this.require(
        tx,
        { id: b.reviewerId, sessionId: '' },
        'support.application.review',
        t.topic.code,
      );
      return this.req(tx, a.id, { ...b, id }, async () => {
        const consent = await this.consentFor(tx, t, 'APPLICATION'),
          interest = await this.classInterest(tx, b.classId, b.courseVersionId),
          placement = b.placementAttemptId
            ? await this.placement(tx, t, b.placementAttemptId)
            : null;
        const last = await tx.counselingApplication.findFirst({
          where: { ticketId: id },
          orderBy: { number: 'desc' },
        });
        if (last && last.state !== 'CORRECTION_REQUESTED')
          throw new ConflictException('Latest application must be returned before a new version');
        const n = await this.touch(tx, t, b);
        const app = await tx.counselingApplication.create({
          data: {
            ticketId: id,
            number: (last?.number ?? 0) + 1,
            learnerId: t.learnerId!,
            authorId: a.id,
            reviewerId: b.reviewerId,
            consentId: consent.id,
            needs: safeSupportText(b.needs),
            target: safeSupportText(b.target),
            goalLR: b.goalLR,
            goalSpeaking: b.goalSpeaking,
            goalWriting: b.goalWriting,
            classId: b.classId,
            courseVersionId: b.courseVersionId,
            placementAttemptId: b.placementAttemptId,
            provenance: asJson({
              consentId: consent.id,
              identityBasis: 'AUTHENTICATED_ACCOUNT',
              interest,
              placement,
              declaredGoalsNotMeasured: true,
            }),
            reason: safeSupportText(b.reason),
          },
        });
        await this.event(
          tx,
          id,
          a,
          'APPLICATION_DRAFT',
          b.reason,
          'Hồ sơ tư vấn đang được chuẩn bị',
        );
        return { id: app.id, number: app.number, lockVersion: n.lockVersion, state: app.state };
      });
    });
  }
  applications(a: AuthorityActor) {
    return this.run(a, async (tx) => {
      const rows = await tx.counselingApplication.findMany({
          where: { reviewerId: a.id, state: { not: 'DRAFT' } },
          include: { ticket: { include: { topic: true } } },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        items = [];
      for (const v of rows)
        if (await this.cap(tx, a, 'support.application.review', v.ticket.topic.code))
          items.push({
            id: v.id,
            number: v.number,
            state: v.state,
            lockVersion: v.lockVersion,
            needs: v.needs,
            target: v.target,
            goalLR: v.goalLR,
            goalSpeaking: v.goalSpeaking,
            goalWriting: v.goalWriting,
            snapshot: v.snapshot,
            reviewReason: v.reviewReason,
            createdAt: v.createdAt,
          });
      return { items };
    });
  }
  applicationAction(a: AuthorityActor, id: string, b: CounselingActionDto) {
    return this.run(a, async (tx) => {
      const app = await tx.counselingApplication.findUnique({
        where: { id },
        include: { ticket: { include: { topic: true } } },
      });
      if (!app) throw missing();
      const t = app.ticket;
      if (b.action === 'SUBMIT') await this.owned(tx, a, t, 'support.application.write');
      else {
        if (app.reviewerId !== a.id || app.authorId === a.id) throw missing();
        await this.require(tx, a, 'support.application.review', t.topic.code);
      }
      return this.req(tx, a.id, { ...b, id }, async () => {
        this.cas(app, b);
        const now = await this.clock(tx);
        if (b.action === 'SUBMIT') {
          if (app.state !== 'DRAFT') throw conflict();
          const c = await this.consentFor(tx, t, 'APPLICATION');
          await this.require(
            tx,
            { id: app.reviewerId, sessionId: '' },
            'support.application.review',
            t.topic.code,
          );
          const interest = await this.classInterest(
              tx,
              app.classId ?? undefined,
              app.courseVersionId ?? undefined,
            ),
            placement = app.placementAttemptId
              ? await this.placement(tx, t, app.placementAttemptId)
              : null;
          const snapshot = {
            number: app.number,
            learnerId: app.learnerId,
            needs: app.needs,
            target: app.target,
            declaredGoals: { LR: app.goalLR, Speaking: app.goalSpeaking, Writing: app.goalWriting },
            classInterest: interest,
            placement,
            consentId: c.id,
            authorId: app.authorId,
            reviewerId: app.reviewerId,
            noEnrollmentOrPaymentAuthority: true,
          };
          await tx.counselingApplication.update({
            where: { id },
            data: {
              state: 'SUBMITTED_TO_HVU',
              snapshot: asJson(snapshot),
              submittedAt: now,
              lockVersion: { increment: 1 },
            },
          });
        } else {
          if (!['SUBMITTED_TO_HVU', 'ACKNOWLEDGED'].includes(app.state)) throw conflict();
          await tx.counselingApplication.update({
            where: { id },
            data: {
              state: b.action === 'ACKNOWLEDGE' ? 'ACKNOWLEDGED' : 'CORRECTION_REQUESTED',
              reviewReason: safeSupportText(b.reason),
              reviewedAt: now,
              lockVersion: { increment: 1 },
            },
          });
        }
        await this.event(
          tx,
          t.id,
          a,
          'APPLICATION_' + b.action,
          b.reason,
          'Hồ sơ tư vấn đã được cập nhật',
        );
        return {
          id,
          lockVersion: app.lockVersion + 1,
          state:
            b.action === 'SUBMIT'
              ? 'SUBMITTED_TO_HVU'
              : b.action === 'ACKNOWLEDGE'
                ? 'ACKNOWLEDGED'
                : 'CORRECTION_REQUESTED',
        };
      });
    });
  }
  escalateToAdmin(a: AuthorityActor, id: string, b: SupportTechnicalEscalationDto) {
    return this.run(a, async (tx) => {
      const t = await this.ticket(tx, id);
      await this.owned(tx, a, t, 'support.ticket.transfer');
      if (b.assignedAdminId) {
        const admin = await tx.user.findFirst({
          where: { id: b.assignedAdminId, role: 'SYSTEM_ADMIN', status: 'ACTIVE' },
          select: { id: true },
        });
        if (!admin) throw new BadRequestException('Active SYSTEM_ADMIN target required');
      }
      return this.req(tx, a.id, { ...b, id }, async () => {
        if (['CLOSED', 'RESOLVED'].includes(t.state))
          throw new ConflictException('Ticket is resolved');
        if (await this.hasOpenTechnicalEscalation(tx, id)) throw conflict();
        if (
          !['NEW', 'TRIAGED', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'REOPENED', 'WAITING_SPECIALIST'].includes(
            t.state,
          )
        )
          supportTransition(t.state, 'WAITING_SPECIALIST', false);
        const escId = randomUUID();
        await tx.$executeRaw`
          INSERT INTO support_technical_escalations (
            id, ticket_id, ticket_reference, topic_code, topic_title, learner_id,
            created_by_id, assigned_admin_id, incident_category, summary, reason,
            affected_route, affected_account_email, status, idempotency_key
          ) VALUES (
            ${escId}::uuid,
            ${id}::uuid,
            ${t.reference},
            ${t.topic.code},
            ${t.topic.title},
            NULLIF(${t.learnerId ?? ''}, '')::uuid,
            ${a.id}::uuid,
            NULLIF(${b.assignedAdminId ?? ''}, '')::uuid,
            ${b.incidentCategory},
            ${safeSupportText(b.summary)},
            ${safeSupportText(b.reason)},
            ${b.affectedRoute ? safeSupportText(b.affectedRoute) : null},
            ${b.affectedAccountEmail ? safeSupportText(b.affectedAccountEmail) : null},
            'OPEN',
            ${b.idempotencyKey}
          )
        `;
        const n = await this.touch(tx, t, b, { state: 'WAITING_SPECIALIST' });
        await tx.supportMessage.create({
          data: {
            ticketId: id,
            actorId: a.id,
            visibility: 'INTERNAL',
            body: safeSupportText(
              `[Chuyển sự cố kỹ thuật (${b.incidentCategory})]: ${b.summary}` +
                (b.affectedRoute ? ` | Đường dẫn: ${b.affectedRoute}` : '') +
                (b.affectedAccountEmail ? ` | Tài khoản liên quan: ${b.affectedAccountEmail}` : ''),
            ),
          },
        });
        await this.event(
          tx,
          id,
          a,
          'TECHNICAL_ESCALATION',
          b.reason,
          'Phiếu đang được Quản trị hệ thống kiểm tra kỹ thuật',
        );
        return {
          id: escId,
          ticketId: id,
          state: n.state,
          lockVersion: n.lockVersion,
        };
      });
    });
  }
}
