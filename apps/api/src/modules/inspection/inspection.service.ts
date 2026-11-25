import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type User, type W08Assignment } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthorizationService, type AuthorityActor } from '../authorization/authorization.service';
import type { InspectionCommand, InspectionQuery } from './inspection.dto';
type Tx = Prisma.TransactionClient;
const live = (a: W08Assignment) => ['ACTIVE', 'ACKNOWLEDGED'].includes(a.state);
const capabilities = ['inspection.assign', 'inspection.hours.review', 'shift.review'];
@Injectable()
export class InspectionService {
  constructor(
    private readonly db: PrismaService,
    private readonly authority: AuthorizationService,
  ) {}
  private async run<T>(actor: AuthorityActor, work: (tx: Tx, u: User) => Promise<T>) {
    if (process.env.W08_ENABLED !== 'DEV_DEC053' || process.env.NODE_ENV === 'production')
      throw new NotFoundException();
    try {
      return await this.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
          const u = await this.reportContext(tx, actor);
          return work(tx, u);
        },
        { maxWait: 10000, timeout: 30000 },
      );
    } catch (e) {
      if (e instanceof HttpException) throw e;
      const msg = String(e) + JSON.stringify(e);
      if (msg.includes('W08_SEGMENT_WINDOW')) {
        throw new ConflictException(
          'Chỉ được bắt đầu quan sát trong khung giờ diễn ra ca học đã lên lịch.',
        );
      }
      if (msg.includes('W08_CLOCK_OUTSIDE_SHIFT_CORRECTION_REQUIRED')) {
        throw new ConflictException(
          'Hiện đang ngoài khung giờ ca; vui lòng dùng mục Đề xuất điều chỉnh chấm công để Học vụ xét duyệt.',
        );
      }
      if (msg.includes('W08_CLOCK_STATE_CORRECTION_REQUIRED')) {
        throw new ConflictException(
          'Chưa khớp trình tự vào/ra ca (cần vào ca trước khi ra ca, hoặc hoàn tất/điều chỉnh ca trước đó).',
        );
      }
      if (msg.includes('W08_PENDING_EVIDENCE')) {
        throw new ConflictException(
          'Cần hoàn tất ít nhất 1 lượt Bắt đầu và Dừng quan sát trước khi gửi biên bản.',
        );
      }
      if (msg.includes('W08_CORRECTION_EVIDENCE_BOUNDS')) {
        throw new ConflictException(
          'Thời gian ra ca đề xuất phải nằm sau lúc vào ca và không vượt quá giờ kết thúc ca hoặc thời điểm hiện tại.',
        );
      }
      if (/P2002|P2003|P2004|P2034|23514|23P01|42501|W08_/.test(msg))
        throw new ConflictException(
          'Ca, phiên bản hoặc bằng chứng không còn hợp lệ; tải lại để kiểm tra. Ngoại lệ cần học vụ duyệt, không tự ghi giờ.',
        );
      throw e;
    }
  }
  private async reportContext(tx: Tx, actor: AuthorityActor) {
    if (process.env.W08_ENABLED !== 'DEV_DEC053' || process.env.NODE_ENV === 'production')
      throw new NotFoundException();
    await tx.$queryRaw`SELECT set_config('app.w08_actor',${actor.id},true),set_config('app.w08_session',${actor.sessionId},true)`;
    const [identity] = await tx.$queryRaw<{ id: string }[]>`SELECT w08_actor()::text AS id`;
    const u = identity?.id ? await tx.user.findUnique({ where: { id: identity.id } }) : null;
    if (!u || !['INSTRUCTOR', 'ACADEMIC_MANAGER', 'TEACHING_INSPECTOR'].includes(u.role))
      throw new NotFoundException();
    return u;
  }
  async reportActivity(
    tx: Tx,
    actor: AuthorityActor,
    from: Date,
    to: Date,
    kind: 'INSPECTION' | 'STAFF_SHIFT',
  ) {
    const u = await this.reportContext(tx, actor);
    if (u.role !== 'TEACHING_INSPECTOR') throw new NotFoundException();
    if (kind === 'INSPECTION')
      return tx.w08Assignment.findMany({
        where: { inspectorId: u.id, startsAt: { gte: from, lt: to } },
        select: { id: true, startsAt: true, state: true, revision: true },
        orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
        take: 201,
      });
    return tx.$queryRaw<
      { id: string; createdAt: Date; kind: string; assignmentId: string }[]
    >`SELECT c.id,c."createdAt",c.kind,c."assignmentId" FROM w08_clock c JOIN w08_assignment a ON a.id=c."assignmentId" WHERE c."inspectorId"=${u.id}::uuid AND a."inspectorId"=${u.id}::uuid AND c."createdAt">=${from} AND c."createdAt"<${to} ORDER BY c."createdAt" DESC,c.id LIMIT 201`;
  }
  private async rights(tx: Tx, u: User, classId: string) {
    const found = await Promise.all(
      capabilities.map((c) => this.authority.permits(u.id, c, { type: 'CLASS', id: classId }, tx)),
    );
    return { assign: found[0], hours: found[1], shift: found[2] };
  }
  private async access(tx: Tx, u: User, id: string) {
    const a = await tx.w08Assignment.findUnique({ where: { id } });
    if (!a) throw new NotFoundException();
    const rights = await this.rights(tx, u, a.classId);
    const inspector = u.role === 'TEACHING_INSPECTOR' && a.inspectorId === u.id,
      teacher = u.role === 'INSTRUCTOR' && a.teacherId === u.id;
    if (!inspector && !teacher && !Object.values(rights).some(Boolean))
      throw new NotFoundException();
    return { a, rights, inspector, teacher };
  }
  private async current(tx: Tx, a: W08Assignment) {
    const [r] = await tx.$queryRaw<
      { valid: boolean }[]
    >`SELECT w08_current(t) AS valid FROM w08_assignment t WHERE id=${a.id}::uuid`;
    return !!r?.valid;
  }
  private async detail(tx: Tx, u: User, id: string) {
    const { a, rights, inspector, teacher } = await this.access(tx, u, id),
      valid = await this.current(tx, a);
    const [segments, reports, decisions, disputes, clocks, corrections] = await Promise.all([
      tx.w08Segment.findMany({ where: { assignmentId: id }, orderBy: { startedAt: 'asc' } }),
      tx.w08Report.findMany({ where: { assignmentId: id }, orderBy: { number: 'asc' } }),
      tx.w08Decision.findMany({ where: { assignmentId: id }, orderBy: { number: 'asc' } }),
      tx.w08Dispute.findMany({ where: { assignmentId: id }, orderBy: { createdAt: 'asc' } }),
      tx.w08Clock.findMany({ where: { assignmentId: id }, orderBy: { createdAt: 'asc' } }),
      tx.w08Correction.findMany({ where: { assignmentId: id }, orderBy: { createdAt: 'asc' } }),
    ]);
    const [seconds] = await tx.$queryRaw<
      { observed: number | null; scheduled: number; serverTime: Date }[]
    >`SELECT w08_observed(id) AS observed,floor(extract(epoch FROM "endsAt"-"startsAt"))::int AS scheduled,clock_timestamp() AS "serverTime" FROM w08_assignment WHERE id=${id}::uuid`;
    const last = decisions.at(-1),
      report = reports.at(-1),
      approved =
        valid && live(a) && last?.reportId === report?.id && last?.disposition !== 'REJECT'
          ? (last?.approvedSeconds ?? null)
          : null;
    const meet =
      inspector && valid && live(a)
        ? await tx.w06Meet.findUnique({ where: { id: a.meetId }, select: { url: true } })
        : null;
    const reviews = await tx.w08CorrectionDecision.findMany({
      where: { correctionId: { in: corrections.map((c) => c.id) } },
    });
    const assignment = { ...a, meetId: undefined };
    // Personnel clocks and corrections are private to TT and the explicitly scoped staff reviewer.
    const accepted = reviews
      .filter((r) => r.disposition === 'ACCEPT')
      .sort((x, y) => y.revision - x.revision)[0];
    const actual =
      inspector || rights.shift
        ? (
            await tx.$queryRaw<
              { seconds: number | null }[]
            >`SELECT floor(extract(epoch FROM ((max("createdAt") FILTER(WHERE kind='OUT'))-(min("createdAt") FILTER(WHERE kind='IN')))))::int AS seconds FROM w08_clock WHERE "assignmentId"=${id}::uuid`
          )[0].seconds
        : null;
    const personnel =
      inspector || rights.shift
        ? {
            actualSeconds: actual,
            approvedSeconds: accepted?.approvedShiftSeconds ?? null,
            correctedOutAt: accepted?.correctedOutAt ?? null,
            revision: accepted?.revision ?? null,
          }
        : null;
    return {
      assignment,
      rights: { ...rights, inspector, teacher },
      valid,
      meetUrl: meet?.url ?? null,
      scheduledSeconds: seconds.scheduled,
      observedSeconds: seconds.observed,
      approvedSeconds: approved,
      hoursState: approved === null ? (report ? 'PENDING_REVIEW' : 'UNCONFIRMED') : 'HVU_CONFIRMED',
      attestation: 'TT-REPORTED',
      serverTime: seconds.serverTime,
      segments,
      reports,
      decisions,
      disputes,
      personnel,
      clocks: inspector || rights.shift ? clocks : [],
      corrections:
        inspector || rights.shift
          ? corrections.map((c) => ({
              ...c,
              decision: reviews.find((r) => r.correctionId === c.id) ?? null,
            }))
          : [],
    };
  }
  dashboard(actor: AuthorityActor, q: InspectionQuery = { limit: 25 }) {
    return this.run(actor, async (tx, u) => {
      const [clock] = await tx.$queryRaw<{ time: Date }[]>`SELECT clock_timestamp() AS time`;
      const from = q.from
        ? new Date(q.from)
        : new Date(clock.time.toISOString().slice(0, 10) + 'T00:00:00Z');
      const to = q.to ? new Date(q.to) : new Date(from.getTime() + 7 * 86400000),
        limit = q.limit ?? 25;
      if (
        !Number.isFinite(from.getTime()) ||
        !Number.isFinite(to.getTime()) ||
        to <= from ||
        to.getTime() - from.getTime() > 31 * 86400000 ||
        limit < 1 ||
        limit > 50
      )
        throw new BadRequestException('Chọn khoảng ngày tối đa 31 ngày.');
      // Scope is part of the database predicate BEFORE the keyset/limit, never a global take500.
      const grants =
        u.role === 'ACADEMIC_MANAGER'
          ? await tx.permissionGrant.findMany({
              where: {
                userId: u.id,
                capability: { in: capabilities },
                scopeType: 'CLASS',
                scopeId: { not: null },
                approvedBy: { not: null },
                approvedAt: { lte: clock.time },
                effectiveAt: { lte: clock.time },
                expiresAt: { gt: clock.time },
                revokedAt: null,
              },
              select: { scopeId: true, capability: true },
            })
          : [];
      const classes = [
        ...new Set(grants.map((g) => g.scopeId!).filter((x) => /^[a-f0-9-]{36}$/i.test(x))),
      ];
      const scope: Prisma.W08AssignmentWhereInput =
        u.role === 'TEACHING_INSPECTOR'
          ? { inspectorId: u.id }
          : u.role === 'INSTRUCTOR'
            ? { teacherId: u.id }
            : { classId: { in: classes } };
      const window = { startsAt: { lt: to }, endsAt: { gt: from } };
      let after: Prisma.W08AssignmentWhereInput = {};
      if (q.assignmentCursor) {
        const cursor = await tx.w08Assignment.findFirst({
          where: { AND: [scope, window, { id: q.assignmentCursor }] },
        });
        if (!cursor) throw new NotFoundException();
        after = {
          OR: [
            { startsAt: { gt: cursor.startsAt } },
            { startsAt: cursor.startsAt, id: { gt: cursor.id } },
          ],
        };
      }
      const rows = await tx.w08Assignment.findMany({
        where: { AND: [scope, window, after] },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        take: limit + 1,
      });
      const more = rows.length > limit,
        page = rows.slice(0, limit),
        data = [];
      for (const a of page) data.push(await this.detail(tx, u, a.id));
      const sessionIds =
        u.role === 'ACADEMIC_MANAGER'
          ? await tx.$queryRaw<{ id: string }[]>`SELECT s.id FROM teaching_sessions s
      JOIN LATERAL(SELECT state FROM w06_meet m WHERE m."sessionId"=s.id ORDER BY number DESC LIMIT 1)m ON m.state='APPROVED'
      WHERE s.state='PUBLISHED' AND s.modality IN ('ONLINE','HYBRID') AND s."startsAt"<${to.toISOString()}::timestamptz AND s."endsAt">${from.toISOString()}::timestamptz
      AND w06_cap(${u.id}::uuid,'inspection.assign',s."classOfferingId")
      AND (${q.sessionCursor ?? null}::uuid IS NULL OR EXISTS(SELECT 1 FROM teaching_sessions c WHERE c.id=${q.sessionCursor ?? null}::uuid AND w06_cap(${u.id}::uuid,'inspection.assign',c."classOfferingId") AND (s."startsAt",s.id)>(c."startsAt",c.id)))
      ORDER BY s."startsAt",s.id LIMIT ${limit + 1}`
          : [];
      const moreSessions = sessionIds.length > limit,
        ids = sessionIds.slice(0, limit).map((s) => s.id);
      const sessions = await tx.teachingSession.findMany({
        where: { id: { in: ids } },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          classOfferingId: true,
          startsAt: true,
          endsAt: true,
          revision: true,
          instructorId: true,
        },
      });
      const inspectors = sessions.length
        ? await tx.user.findMany({
            where: { role: 'TEACHING_INSPECTOR', status: 'ACTIVE' },
            select: { id: true, fullName: true },
            orderBy: { id: 'asc' },
            take: 100,
          })
        : [];
      const notifications = await tx.w08Notification.findMany({
        where: { recipientId: u.id, assignmentId: { in: page.map((a) => a.id) } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 100,
      });
      const classIds = [
        ...new Set([
          ...data.map((d) => d.assignment.classId),
          ...sessions.map((s) => s.classOfferingId),
        ]),
      ];
      const classRows = classIds.length
        ? await tx.classOffering.findMany({
            where: { id: { in: classIds } },
            select: { id: true, code: true, name: true },
          })
        : [];
      const classMap = new Map(classRows.map((c) => [c.id, c]));
      return {
        data: data.map((d) => ({
          ...d,
          classCode: classMap.get(d.assignment.classId)?.code ?? null,
          className: classMap.get(d.assignment.classId)?.name ?? null,
        })),
        sessions: sessions.map((s) => ({
          ...s,
          classId: s.classOfferingId,
          classCode: classMap.get(s.classOfferingId)?.code ?? null,
          className: classMap.get(s.classOfferingId)?.name ?? null,
        })),
        inspectors,
        notifications,
        role: u.role,
        from,
        to,
        nextAssignmentCursor: more ? page.at(-1)!.id : null,
        nextSessionCursor: moreSessions ? ids.at(-1)! : null,
      };
    });
  }
  view(actor: AuthorityActor, id: string) {
    return this.run(actor, (tx, u) => this.detail(tx, u, id));
  }
  private async dispatch(tx: Tx, u: User, b: InspectionCommand) {
    if (!b.sessionId || !b.inspectorId) throw new BadRequestException('Chọn buổi và thanh tra.');
    const s = await tx.teachingSession.findUnique({ where: { id: b.sessionId } });
    if (!s || !(await this.rights(tx, u, s.classOfferingId)).assign) throw new NotFoundException();
    const meet = await tx.w06Meet.findFirst({
      where: { sessionId: s.id },
      orderBy: { number: 'desc' },
    });
    if (!meet || meet.state !== 'APPROVED' || !s.instructorId)
      throw new ConflictException('Cần buổi, GV và Meet đã duyệt hiện hành.');
    return tx.w08Assignment.create({
      data: {
        sessionId: s.id,
        classId: s.classOfferingId,
        teacherId: s.instructorId,
        inspectorId: b.inspectorId,
        dispatcherId: u.id,
        meetId: meet.id,
        revision: s.revision,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        state: 'ACTIVE',
        version: 0,
        reason: b.reason,
      },
    });
  }
  command(actor: AuthorityActor, id: string | null, b: InspectionCommand) {
    return this.run(actor, async (tx, u) => {
      const digest = createHash('sha256')
        .update(JSON.stringify({ id, ...b }))
        .digest('hex');
      const context = id ? await this.access(tx, u, id) : null;
      if (!id) {
        const s = b.sessionId
          ? await tx.teachingSession.findUnique({ where: { id: b.sessionId } })
          : null;
        if (!s || !(await this.rights(tx, u, s.classOfferingId)).assign)
          throw new NotFoundException();
      }
      const old = await tx.w08Receipt.findUnique({
        where: { actorId_key: { actorId: u.id, key: b.key } },
      });
      if (old) {
        if (old.digest !== digest) throw new ConflictException('Khóa đã dùng với nội dung khác.');
        return old.result;
      }
      const sourceId = randomUUID();
      let target = id,
        result: object,
        before: Prisma.InputJsonValue | undefined;
      if (!context) {
        const a = await this.dispatch(tx, u, b);
        target = a.id;
        result = { id: a.id, version: 0, state: a.state };
      } else {
        const { a, rights, inspector, teacher } = context;
        if (b.version !== a.version)
          throw new ConflictException('Phiên bản đã đổi; tải lại trước khi quyết định.');
        before = { version: a.version, state: a.state };
        const own = () => {
          if (!inspector) throw new NotFoundException();
        };
        if (
          ['ACK', 'DECLINE', 'START', 'REPORT', 'REVIEW', 'IN', 'OUT'].includes(b.action ?? '') &&
          (!live(a) || !(await this.current(tx, a)))
        )
          throw new ConflictException('Buổi hoặc Meet đã đổi; phân công cũ không được dùng.');
        switch (b.action) {
          case 'ACK':
          case 'DECLINE':
            own();
            await tx.w08Assignment.update({
              where: { id: a.id },
              data: {
                state: b.action === 'ACK' ? 'ACKNOWLEDGED' : 'DECLINED',
                version: { increment: 1 },
              },
            });
            break;
          case 'REASSIGN':
            if (!rights.assign) throw new NotFoundException();
            await tx.w08Assignment.update({
              where: { id: a.id },
              data: { state: 'REASSIGNED', version: { increment: 1 } },
            });
            target = (await this.dispatch(tx, u, { ...b, sessionId: a.sessionId })).id;
            await tx.$executeRaw`SELECT w08_notify(${a.id}::uuid,'REASSIGNED',${sourceId}::uuid)`;
            break;
          case 'START': {
            own();
            const [n] = await tx.$queryRaw<{ time: Date }[]>`SELECT clock_timestamp() AS time`;
            await tx.w08Segment.create({
              data: { assignmentId: a.id, inspectorId: u.id, startedAt: n.time },
            });
            break;
          }
          case 'STOP': {
            own();
            const g = await tx.w08Segment.findFirst({
              where: { assignmentId: a.id, inspectorId: u.id, stoppedAt: null },
            });
            if (!g) throw new ConflictException('Chưa có đoạn đang quan sát.');
            await tx.w08Segment.update({ where: { id: g.id }, data: { stoppedAt: g.startedAt } });
            break;
          }
          case 'REPORT': {
            own();
            if (!b.presence || !b.conditions)
              throw new BadRequestException('Cần tình trạng GV và điều kiện quan sát.');
            const last = await tx.w08Report.findFirst({
              where: { assignmentId: a.id },
              orderBy: { number: 'desc' },
            });
            await tx.w08Report.create({
              data: {
                assignmentId: a.id,
                reporterId: u.id,
                number: (last?.number ?? 0) + 1,
                presence: b.presence,
                conditions: b.conditions,
                reason: b.reason,
                attestation: 'TT-REPORTED',
              },
            });
            break;
          }
          case 'REVIEW': {
            if (!rights.hours || [a.inspectorId, a.teacherId].includes(u.id))
              throw new NotFoundException();
            if (!['APPROVE', 'PARTIAL', 'REJECT'].includes(b.disposition ?? ''))
              throw new BadRequestException();
            const report = await tx.w08Report.findFirst({
              where: { assignmentId: a.id },
              orderBy: { number: 'desc' },
            });
            if (!report) throw new ConflictException('PENDING_EVIDENCE: chưa có biên bản.');
            const last = await tx.w08Decision.findFirst({
              where: { assignmentId: a.id },
              orderBy: { number: 'desc' },
            });
            await tx.w08Decision.create({
              data: {
                assignmentId: a.id,
                reportId: report.id,
                reviewerId: u.id,
                number: (last?.number ?? 0) + 1,
                disposition: b.disposition!,
                approvedSeconds: b.disposition === 'REJECT' ? null : b.approvedSeconds,
                reason: b.reason,
              },
            });
            break;
          }
          case 'DISPUTE':
            if (!teacher) throw new NotFoundException();
            await tx.w08Dispute.create({
              data: { assignmentId: a.id, teacherId: u.id, reason: b.reason },
            });
            break;
          case 'IN':
          case 'OUT':
            own();
            await tx.w08Clock.create({
              data: { assignmentId: a.id, inspectorId: u.id, kind: b.action },
            });
            break;
          case 'CORRECTION': {
            own();
            if (!b.kind || !b.evidence) throw new BadRequestException();
            const prior = await tx.w08CorrectionDecision.findFirst({
              where: {
                disposition: 'ACCEPT',
                correctionId: {
                  in: (
                    await tx.w08Correction.findMany({
                      where: { assignmentId: a.id },
                      select: { id: true },
                    })
                  ).map((c) => c.id),
                },
              },
              orderBy: { revision: 'desc' },
            });
            const last = await tx.w08Correction.findFirst({
              where: { assignmentId: a.id },
              orderBy: { revision: 'desc' },
            });
            await tx.w08Correction.create({
              data: {
                assignmentId: a.id,
                inspectorId: u.id,
                kind: b.kind,
                evidence: b.evidence,
                reason: b.reason,
                revision: (last?.revision ?? 0) + 1,
                supersedesId: prior?.correctionId,
                proposedOutAt: b.proposedOutAt ? new Date(b.proposedOutAt) : null,
              },
            });
            break;
          }
          case 'CORRECTION_REVIEW': {
            if (!rights.shift || [a.inspectorId, a.teacherId].includes(u.id))
              throw new NotFoundException();
            const c = b.correctionId
              ? await tx.w08Correction.findUnique({ where: { id: b.correctionId } })
              : null;
            if (
              !c ||
              c.assignmentId !== a.id ||
              !['ACCEPT', 'REJECT'].includes(b.disposition ?? '')
            )
              throw new NotFoundException();
            await tx.w08CorrectionDecision.create({
              data: {
                correctionId: c.id,
                reviewerId: u.id,
                disposition: b.disposition!,
                revision: c.revision,
                reason: b.reason,
              },
            });
            break;
          }
          default:
            throw new BadRequestException('Hành động không hợp lệ.');
        }
        if (!['ACK', 'DECLINE', 'REASSIGN'].includes(b.action!))
          await tx.w08Assignment.update({
            where: { id: a.id },
            data: { version: { increment: 1 } },
          });
        const updated = await tx.w08Assignment.findUniqueOrThrow({ where: { id: target! } });
        result = { id: target, version: updated.version, state: updated.state };
      }
      const receipt = await tx.w08Receipt.create({
        data: {
          id: sourceId,
          actorId: u.id,
          key: b.key,
          digest,
          assignmentId: target,
          action: b.action ?? 'DISPATCH',
          result: result as Prisma.InputJsonValue,
          before,
          after: result as Prisma.InputJsonValue,
          reason: b.reason,
        },
      });
      await tx.$executeRaw`SELECT w08_notify(${target}::uuid,${b.action ?? 'DISPATCH'},${receipt.id}::uuid)`;
      await this.authority.audit(
        tx,
        u.id,
        'W08_' + (b.action ?? 'DISPATCH'),
        'INSPECTION',
        target!,
        b.reason,
      );
      return result;
    });
  }
}
