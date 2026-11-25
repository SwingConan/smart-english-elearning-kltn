import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Prisma, type TeachingSession, type User } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthorizationService, type AuthorityActor } from '../authorization/authorization.service';
import { AcademicPlanningService } from '../academic/academic-planning.service';
import { resolveLocal } from '../academic/academic-time';
import { codeVerifier, normalizeMeet } from './session-engagement.policy';
import type {
  W06CheckinDto,
  W06Command,
  W06CorrectionDto,
  W06DecisionDto,
  W06ExceptionDto,
  W06MeetDto,
} from './session-engagement.dto';
type Tx = Prisma.TransactionClient;
@Injectable()
export class SessionEngagementService {
  constructor(
    private readonly db: PrismaService,
    private readonly authority: AuthorizationService,
    private readonly planning: AcademicPlanningService,
  ) {}
  private enabled() {
    if (process.env.W06_ENABLED !== 'DEV_DEC047' || process.env.NODE_ENV === 'production')
      throw new NotFoundException();
  }
  async context(tx: Tx, a: AuthorityActor) {
    const [x] = await tx.$queryRaw<
      { id: string }[]
    >`SELECT u.id FROM users u JOIN user_sessions s ON s.sess->>'userId'=u.id::text WHERE u.id=${a.id}::uuid AND u.status='ACTIVE' AND s.sid=${a.sessionId} AND s.expire>clock_timestamp()`;
    if (!x) throw new NotFoundException('Session not available');
    return await tx.user.findUniqueOrThrow({ where: { id: a.id } });
  }
  private async run<T>(a: AuthorityActor, work: (tx: Tx, u: User) => Promise<T>) {
    this.enabled();
    try {
      return await this.db.$transaction(
        async (tx) => {
          // Session/grant timestamp-without-time-zone columns use Prisma UTC.
          await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
          await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
          const u = await this.context(tx, a);
          await tx.$queryRaw`SELECT set_config('app.w06_actor',${a.id},true),set_config('app.w06_session',${a.sessionId},true)`;
          return work(tx, u);
        },
        { maxWait: 10000, timeout: 30000 },
      );
    } catch (e) {
      if (e instanceof HttpException) throw e;
      if (/W06_|P2002|P2003|P2004|23514|42501|23505/.test(String(e) + JSON.stringify(e)))
        throw new ConflictException('Session command unavailable or stale; reload and review', {
          cause: e,
        });
      throw e;
    }
  }
  private async flags(tx: Tx, u: User, s: TeachingSession) {
    const [f] = await tx.$queryRaw<
      { teacher: boolean; learner: boolean; inspector: boolean }[]
    >`SELECT w06_teacher(${u.id}::uuid,t) AS teacher,w06_learner(${u.id}::uuid,t."classOfferingId") AS learner,EXISTS(SELECT 1 FROM permission_grants g WHERE g."userId"=${u.id}::uuid AND g.capability='class.read' AND g."scopeType"='CLASS' AND g."scopeId"=t."classOfferingId"::text AND g."approvedBy" IS NOT NULL AND g."approvedAt"<=clock_timestamp() AND g."effectiveAt"<=clock_timestamp() AND g."expiresAt">clock_timestamp() AND g."revokedAt" IS NULL) AS inspector FROM teaching_sessions t WHERE id=${s.id}::uuid`;
    const scope = { type: 'CLASS' as const, id: s.classOfferingId };
    let meetPreparer = !!f?.teacher;
    // PO-approved demo contract: preparing a future session's link does not
    // confer current teaching, attendance, grading or course-authoring rights.
    const target = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
    if (!meetPreparer && u.role === 'INSTRUCTOR' && target?.pathname === '/v2_wave01_dev_test_w04b_br136_demo_20261111_42db33') {
      await tx.$queryRaw`SELECT 1 FROM br136_bank_check.assert_target()`;
      const [installed] = await tx.$queryRaw<{ ready: boolean }[]>`SELECT to_regprocedure('w06_meet_preparer(uuid,teaching_sessions)') IS NOT NULL AS ready`;
      if (installed?.ready) {
        const [preparation] = await tx.$queryRaw<{ allowed: boolean }[]>`SELECT w06_meet_preparer(${u.id}::uuid,t) AS allowed FROM teaching_sessions t WHERE id=${s.id}::uuid`;
        meetPreparer = !!preparation?.allowed;
      }
    }
    return {
      teacher: !!f?.teacher,
      meetPreparer,
      learner: !!f?.learner,
      inspector: u.role === 'TEACHING_INSPECTOR' && !!f.inspector,
      meeting:
        u.role === 'ACADEMIC_MANAGER' &&
        (await this.authority.permits(u.id, 'academic.meeting.approve', scope, tx)),
      attendance:
        u.role === 'ACADEMIC_MANAGER' &&
        (await this.authority.permits(u.id, 'academic.attendance.approve', scope, tx)),
      schedule:
        u.role === 'ACADEMIC_MANAGER' &&
        (await this.authority.permits(u.id, 'academic.schedule.approve', scope, tx)),
    };
  }
  private async access(
    tx: Tx,
    u: User,
    id: string,
    kind: 'read' | 'teacher' | 'meetPreparer' | 'meeting' | 'attendance' | 'schedule' = 'read',
  ) {
    const s = await tx.teachingSession.findUnique({ where: { id } });
    if (!s || s.state !== 'PUBLISHED')
      throw new NotFoundException('Official session not available');
    const f = await this.flags(tx, u, s);
    if (kind === 'read' ? !Object.values(f).some(Boolean) : !f[kind])
      throw new NotFoundException('Official session not available');
    return { s, f };
  }
  private audit(tx: Tx, a: AuthorityActor, action: string, id: string) {
    return this.authority.audit(
      tx,
      a.id,
      'W06_' + action,
      'TEACHING_SESSION',
      id,
      'Scoped W06 command; private content kept in typed history',
    );
  }
  private async window(tx: Tx, u: User, s: TeachingSession) {
    let w = await tx.w06Window.findUnique({ where: { sessionId: s.id } });
    if (w) return w;
    const [f] = await tx.$queryRaw<
      { ok: boolean }[]
    >`SELECT w06_teacher(${u.id}::uuid,t) AS ok FROM teaching_sessions t WHERE id=${s.id}::uuid`;
    if (!f?.ok) throw new ConflictException('Assigned teacher must enable attendance first');
    const activity = await tx.w06AttendanceActivity.upsert({
      where: { classId: s.classOfferingId },
      create: { classId: s.classOfferingId, creatorId: u.id },
      update: {},
    });
    w = await tx.w06Window.create({
      data: {
        sessionId: s.id,
        activityId: activity.id,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        timezone: s.timezone,
        revision: s.revision,
      },
    });
    return w;
  }
  private async effective(tx: Tx, windowId: string, learnerId: string) {
    const raw = await tx.w06Receipt.findUnique({
      where: { windowId_learnerId: { windowId, learnerId } },
    });
    const review = await tx.w06Correction.findFirst({
      where: { windowId, learnerId, state: 'APPROVED' },
      orderBy: { revision: 'desc' },
    });
    return {
      status: review?.requestedStatus ?? raw?.status ?? 'NOT_RECORDED',
      version: review?.revision ?? 0,
      raw: raw ? { id: raw.id, status: raw.status, acceptedAt: raw.acceptedAt } : null,
      reviewId: review?.id ?? null,
    };
  }
  private async notify(tx: Tx, s: TeachingSession, kind: string, sourceId: string, only?: string) {
    const learners = await tx.enrollment.findMany({
      where: {
        classOfferingId: s.classOfferingId,
        status: 'ACTIVE',
        learner: { status: 'ACTIVE' },
      },
      select: { learnerId: true },
    });
    const inspectors = await tx.user.findMany({
      where: { role: 'TEACHING_INSPECTOR', status: 'ACTIVE' },
      select: { id: true },
    });
    const ids = new Set(only ? [only] : learners.map((x) => x.learnerId));
    if (s.instructorId) ids.add(s.instructorId);
    if (!only)
      for (const x of inspectors)
        if (
          await this.authority.permits(
            x.id,
            'class.read',
            { type: 'CLASS', id: s.classOfferingId },
            tx,
          )
        )
          ids.add(x.id);
    await tx.w06Notification.createMany({
      data: [...ids].map((recipientId) => ({ sessionId: s.id, recipientId, kind, sourceId })),
      skipDuplicates: true,
    });
  }
  view(a: AuthorityActor, id: string) {
    return this.run(a, async (tx, u) => {
      const { s, f } = await this.access(tx, u, id);
      const latest = await tx.w06Meet.findFirst({
          where: { sessionId: id },
          orderBy: { number: 'desc' },
        }),
        w = await tx.w06Window.findUnique({ where: { sessionId: id } });
      const [clock] = await tx.$queryRaw<
        { time: Date; open: boolean }[]
      >`SELECT clock_timestamp() AS time,clock_timestamp()>=${s.startsAt.toISOString()}::timestamptz AND clock_timestamp()<${s.endsAt.toISOString()}::timestamptz AS open`;
      return {
        session: {
          id: s.id,
          classId: s.classOfferingId,
          revision: s.revision,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          timezone: s.timezone,
          modality: s.modality,
        },
        permissions: f,
        meetUrl:
          latest?.state === 'APPROVED' && (f.meetPreparer || f.learner || f.inspector)
            ? latest.url
            : null,
        meetState: latest?.state ?? 'NOT_PROPOSED',
        attendance: {
          configured: !!w,
          state: clock.open ? 'OPEN' : 'CLOSED',
          serverTime: clock.time,
          result: f.learner && w ? await this.effective(tx, w.id, u.id) : null,
        },
      };
    });
  }
  classSessions(a: AuthorityActor, classId: string) {
    return this.run(a, async (tx, u) => {
      const rows = await tx.teachingSession.findMany({
        where: { classOfferingId: classId, state: 'PUBLISHED' },
        orderBy: { startsAt: 'asc' },
        take: 100,
      });
      const data = [];
      for (const s of rows) {
        const f = await this.flags(tx, u, s);
        if (Object.values(f).some(Boolean))
          data.push({
            id: s.id,
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            revision: s.revision,
            modality: s.modality,
          });
      }
      if (!data.length) {
        const assignedTeacher =
          u.role === 'INSTRUCTOR' &&
          !!(await tx.classInstructorAssignment.findFirst({
            where: { classOfferingId: classId, instructorId: u.id, state: 'PUBLISHED' },
            select: { id: true },
          }));
        const enrolledLearner =
          u.role === 'STUDENT' &&
          !!(await tx.enrollment.findFirst({
            where: { classOfferingId: classId, learnerId: u.id, status: 'ACTIVE' },
            select: { id: true },
          }));
        const scope = { type: 'CLASS' as const, id: classId };
        const scopedManager =
          u.role === 'ACADEMIC_MANAGER' &&
          ((await this.authority.permits(u.id, 'academic.meeting.approve', scope, tx)) ||
            (await this.authority.permits(u.id, 'academic.attendance.approve', scope, tx)) ||
            (await this.authority.permits(u.id, 'academic.schedule.approve', scope, tx)));
        if (assignedTeacher || enrolledLearner || scopedManager) return { data: [] };
        throw new NotFoundException('No authorized official sessions');
      }
      return { data };
    });
  }
  configure(a: AuthorityActor, id: string) {
    return this.run(a, async (tx, u) => {
      const { s } = await this.access(tx, u, id, 'teacher');
      const w = await this.window(tx, u, s);
      await this.audit(tx, a, 'ATTENDANCE_ENABLED', id);
      return { id: w.id };
    });
  }
  exceptionOptions(a: AuthorityActor, id: string) {
    return this.run(a, async (tx, u) => {
      const { s } = await this.access(tx, u, id, 'teacher');
      return {
        assignments: await tx.classInstructorAssignment.findMany({
          where: { classOfferingId: s.classOfferingId, state: { in: ['PUBLISHED', 'SUPERSEDED'] } },
          select: {
            id: true,
            effectiveFrom: true,
            reservedUntil: true,
            instructor: { select: { fullName: true } },
          },
          orderBy: { effectiveFrom: 'asc' },
        }),
        rooms: await tx.room.findMany({
          where: { status: 'ACTIVE' },
          select: { id: true, code: true, name: true, capabilities: true },
          orderBy: { code: 'asc' },
          take: 200,
        }),
      };
    });
  }
  proposeMeet(a: AuthorityActor, id: string, input: W06MeetDto) {
    const url = normalizeMeet(input.url);
    return this.run(a, async (tx, u) => {
      await this.access(tx, u, id, 'meetPreparer');
      const old = await tx.w06Meet.findUnique({
        where: { makerId_key: { makerId: u.id, key: input.key } },
      });
      if (old) {
        if (old.sessionId !== id || old.url !== url || old.reason !== input.reason)
          throw new ConflictException('Idempotency key conflict');
        return { id: old.id, state: old.state, number: old.number };
      }
      const last = await tx.w06Meet.findFirst({
        where: { sessionId: id },
        orderBy: { number: 'desc' },
      });
      const r = await tx.w06Meet.create({
        data: {
          sessionId: id,
          number: (last?.number ?? 0) + 1,
          url,
          makerId: u.id,
          reason: input.reason,
          key: input.key,
        },
      });
      await this.audit(tx, a, 'MEET_PROPOSED', id);
      return { id: r.id, state: r.state, number: r.number };
    });
  }
  reviewQueue(a: AuthorityActor) {
    return this.run(a, async (tx, u) => {
      if (u.role !== 'ACADEMIC_MANAGER') throw new ForbiddenException();
      const rows = await tx.teachingSession.findMany({
        where: { state: 'PUBLISHED' },
        include: { classOffering: { select: { code: true, name: true } } },
        orderBy: { startsAt: 'desc' },
        take: 500,
      });
      const data = [];
      for (const s of rows) {
        const f = await this.flags(tx, u, s);
        if (!f.meeting && !f.attendance && !f.schedule) continue;
        const meets = f.meeting
          ? await tx.w06Meet.findMany({
              where: { sessionId: s.id, state: 'PENDING_APPROVAL' },
              select: { id: true, number: true, makerId: true },
              orderBy: { number: 'desc' },
              take: 1,
            })
          : [];
        const corrections = f.attendance
          ? await tx.w06Correction.findMany({
              where: { window: { sessionId: s.id }, state: 'PENDING_APPROVAL' },
              select: { id: true, makerId: true, learnerId: true },
            })
          : [];
        const exceptions = f.schedule
          ? await tx.w06Exception.findMany({
              where: { sessionId: s.id, state: 'PENDING_APPROVAL' },
              select: { id: true, makerId: true, kind: true },
            })
          : [];
        if (meets.length || corrections.length || exceptions.length)
          data.push({
            sessionId: s.id,
            classId: s.classOfferingId,
            classOffering: s.classOffering,
            startsAt: s.startsAt,
            meets,
            corrections,
            exceptions,
          });
      }
      return { data };
    });
  }
  reviewDetail(a: AuthorityActor, kind: 'meet' | 'correction' | 'exception', id: string) {
    return this.run(a, async (tx, u) => {
      if (kind === 'meet') {
        const r = await tx.w06Meet.findUnique({ where: { id } });
        if (!r) throw new NotFoundException();
        await this.access(tx, u, r.sessionId, 'meeting');
        return r;
      }
      if (kind === 'correction') {
        const r = await tx.w06Correction.findUnique({
          where: { id },
          include: { window: true, learner: { select: { fullName: true } } },
        });
        if (!r) throw new NotFoundException();
        await this.access(tx, u, r.window.sessionId, 'attendance');
        return r;
      }
      const r = await tx.w06Exception.findUnique({
        where: { id },
        include: { maker: { select: { id: true, fullName: true, email: true } } },
      });
      if (!r) throw new NotFoundException();
      await this.access(tx, u, r.sessionId, 'schedule');
      const preview = await this.planning.previewException(tx, r);
      return { ...r, ...preview };
    });
  }
  decide(a: AuthorityActor, kind: 'meet' | 'correction', id: string, input: W06DecisionDto) {
    return this.run(a, async (tx, u) => {
      const r =
        kind === 'meet'
          ? await tx.w06Meet.findUnique({ where: { id } })
          : await tx.w06Correction.findUnique({ where: { id }, include: { window: true } });
      if (!r) throw new NotFoundException();
      const sessionId = 'sessionId' in r ? r.sessionId : r.window.sessionId;
      const { s } = await this.access(tx, u, sessionId, kind === 'meet' ? 'meeting' : 'attendance');
      if (r.makerId === u.id)
        throw new ForbiddenException('Independent academic reviewer required');
      if (r.state !== 'PENDING_APPROVAL') {
        if (
          r.decisionKey === input.key &&
          r.reviewerId === u.id &&
          r.state === input.decision &&
          r.reviewReason === input.reason
        )
          return { id: r.id, state: r.state };
        throw new ConflictException('Already reviewed');
      }
      const data = {
        state: input.decision,
        reviewerId: u.id,
        reviewReason: input.reason,
        decisionKey: input.key,
      };
      if (kind === 'meet') await tx.w06Meet.update({ where: { id }, data });
      else await tx.w06Correction.update({ where: { id }, data });
      await this.audit(tx, a, kind.toUpperCase() + '_' + input.decision, sessionId);
      if (input.decision === 'APPROVED')
        await this.notify(
          tx,
          s,
          kind === 'meet' ? 'MEET_APPROVED' : 'ATTENDANCE_REVIEWED',
          id,
          'learnerId' in r ? r.learnerId : undefined,
        );
      return { id, state: input.decision };
    });
  }
  rotate(a: AuthorityActor, id: string, input: W06Command) {
    return this.run(a, async (tx, u) => {
      const { s } = await this.access(tx, u, id, 'teacher'),
        w = await this.window(tx, u, s);
      const old = await tx.w06Code.findUnique({
        where: { creatorId_key: { creatorId: u.id, key: input.key } },
      });
      if (old) {
        if (old.windowId !== w.id) throw new ConflictException('Idempotency key conflict');
        return { id: old.id, code: null, alreadyIssued: true, expiresAt: old.expiresAt };
      }
      const last = await tx.w06Code.findFirst({
          where: { windowId: w.id },
          orderBy: { number: 'desc' },
        }),
        number = (last?.number ?? 0) + 1,
        code = randomBytes(10).toString('hex').toUpperCase();
      const ttl = Number(process.env.W06_CODE_TTL_SECONDS ?? 120);
      if (!Number.isInteger(ttl) || ttl < 1 || ttl > 120)
        throw new ConflictException('Invalid code TTL configuration');
      const [clock] = await tx.$queryRaw<
        { until: Date }[]
      >`SELECT least(clock_timestamp()+${ttl}*interval '1 second',${s.endsAt.toISOString()}::timestamptz) AS until`;
      const c = await tx.w06Code.create({
        data: {
          windowId: w.id,
          number,
          creatorId: u.id,
          key: input.key,
          verifier: codeVerifier(w.id, number, code),
          expiresAt: clock.until,
        },
      });
      await this.audit(tx, a, 'CODE_ROTATED', id);
      return { id: c.id, code, expiresAt: c.expiresAt, alreadyIssued: false };
    });
  }
  async checkin(a: AuthorityActor, id: string, input: W06CheckinDto) {
    const result = await this.run(a, async (tx, u) => {
      const { s, f } = await this.access(tx, u, id);
      if (!f.learner) throw new NotFoundException();
      const w = await tx.w06Window.findUnique({ where: { sessionId: id } });
      if (!w) throw new ConflictException('Attendance not enabled');
      const old = await tx.w06Receipt.findUnique({
        where: { windowId_learnerId: { windowId: w.id, learnerId: u.id } },
      });
      if (old) return { receipt: old, replayed: true };
      const keyOld = await tx.w06Receipt.findUnique({
        where: { learnerId_key: { learnerId: u.id, key: input.key } },
      });
      if (keyOld) throw new ConflictException('Idempotency key conflict');
      const [clock] = await tx.$queryRaw<
        { now: Date; open: boolean }[]
      >`SELECT clock_timestamp() AS now,clock_timestamp()>=${s.startsAt.toISOString()}::timestamptz AND clock_timestamp()<${s.endsAt.toISOString()}::timestamptz AS open`;
      if (!clock.open) throw new ConflictException('Attendance window closed');
      const rate = await tx.w06Rate.findUnique({
        where: { windowId_learnerId: { windowId: w.id, learnerId: u.id } },
      });
      if (rate && rate.resetAt > clock.now && rate.count >= 5)
        return { error: 'CODE_RATE_LIMITED' };
      const c = await tx.w06Code.findFirst({
          where: { windowId: w.id },
          orderBy: { number: 'desc' },
        }),
        hash = codeVerifier(w.id, c?.number ?? 0, input.code);
      if (
        !c ||
        c.expiresAt <= clock.now ||
        !timingSafeEqual(Buffer.from(hash), Buffer.from(c.verifier))
      ) {
        await tx.w06Rate.upsert({
          where: { windowId_learnerId: { windowId: w.id, learnerId: u.id } },
          create: {
            windowId: w.id,
            learnerId: u.id,
            count: 1,
            resetAt: new Date(clock.now.getTime() + 60000),
          },
          update:
            rate && rate.resetAt > clock.now
              ? { count: { increment: 1 } }
              : { count: 1, resetAt: new Date(clock.now.getTime() + 60000) },
        });
        await this.audit(tx, a, 'CODE_REJECTED', id);
        return { error: 'CODE_UNAVAILABLE' };
      }
      await tx.$queryRaw`SELECT set_config('app.w06_verifier',${hash},true)`;
      const receipt = await tx.w06Receipt.create({
        data: { windowId: w.id, learnerId: u.id, codeId: c.id, key: input.key, status: 'PRESENT' },
      });
      await this.audit(tx, a, 'CHECKIN_ACCEPTED', id);
      return { receipt, replayed: false };
    });
    if ('error' in result)
      throw new ForbiddenException({
        code: result.error,
        message: 'Code unavailable; ask your teacher or wait before retrying',
      });
    return result;
  }
  roster(a: AuthorityActor, id: string) {
    return this.run(a, async (tx, u) => {
      const { s, f } = await this.access(tx, u, id);
      if (!f.teacher && !f.attendance) throw new NotFoundException();
      const w = await tx.w06Window.findUnique({ where: { sessionId: id } });
      const users = await tx.enrollment.findMany({
        where: {
          classOfferingId: s.classOfferingId,
          status: 'ACTIVE',
          learner: { status: 'ACTIVE' },
        },
        select: { learner: { select: { id: true, fullName: true } } },
      });
      return {
        data: await Promise.all(
          users.map(async (x) => ({
            learner: x.learner,
            result: w
              ? await this.effective(tx, w.id, x.learner.id)
              : { status: 'NOT_RECORDED', version: 0, raw: null, reviewId: null },
          })),
        ),
      };
    });
  }
  correction(a: AuthorityActor, id: string, input: W06CorrectionDto) {
    return this.run(a, async (tx, u) => {
      const { s, f } = await this.access(tx, u, id);
      if (!f.teacher && !(f.learner && input.learnerId === u.id)) throw new NotFoundException();
      if (
        !(await tx.enrollment.findFirst({
          where: {
            classOfferingId: s.classOfferingId,
            learnerId: input.learnerId,
            status: 'ACTIVE',
            learner: { status: 'ACTIVE' },
          },
        }))
      )
        throw new NotFoundException();
      const w = await tx.w06Window.findUnique({ where: { sessionId: id } });
      if (!w) throw new ConflictException('Attendance not enabled');
      const old = await tx.w06Correction.findUnique({
        where: { makerId_key: { makerId: u.id, key: input.key } },
      });
      if (old) {
        if (
          old.windowId !== w.id ||
          old.learnerId !== input.learnerId ||
          old.baseVersion !== input.baseVersion ||
          old.requestedStatus !== input.requestedStatus ||
          old.evidence !== input.evidence ||
          old.reason !== input.reason
        )
          throw new ConflictException('Idempotency key conflict');
        return old;
      }
      const effective = await this.effective(tx, w.id, input.learnerId);
      if (effective.version !== input.baseVersion)
        throw new ConflictException('Stale attendance version');
      const r = await tx.w06Correction.create({
        data: { ...input, windowId: w.id, makerId: u.id, beforeStatus: effective.status },
      });
      await this.audit(tx, a, 'CORRECTION_REQUESTED', id);
      return r;
    });
  }
  history(a: AuthorityActor, id: string) {
    return this.run(a, async (tx, u) => {
      const { f } = await this.access(tx, u, id);
      if (!f.teacher && !f.learner && !f.attendance) throw new NotFoundException();
      const [data, exceptions, meets] = await Promise.all([
        tx.w06Correction.findMany({
          where: { window: { sessionId: id }, ...(f.learner ? { learnerId: u.id } : {}) },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        f.teacher || f.schedule
          ? tx.w06Exception.findMany({
              where: { sessionId: id },
              orderBy: { createdAt: 'desc' },
              take: 50,
            })
          : Promise.resolve([]),
        f.teacher || f.meetPreparer || f.meeting
          ? tx.w06Meet.findMany({
              where: { sessionId: id },
              orderBy: { number: 'desc' },
              take: 50,
            })
          : Promise.resolve([]),
      ]);
      return { data, exceptions, meets };
    });
  }
  exception(a: AuthorityActor, id: string, input: W06ExceptionDto) {
    return this.run(a, async (tx, u) => {
      const { s } = await this.access(tx, u, id, 'teacher');
      const [{ now }] = await tx.$queryRaw<[{ now: Date }]>`SELECT clock_timestamp() AS now`;
      if (s.state !== 'PUBLISHED' || s.startsAt <= now)
        throw new ConflictException('Only future published official session may be changed');
      if (input.kind !== 'LEAVE') {
        if (!input.startLocal || !input.endLocal || !input.assignmentId)
          throw new BadRequestException('Dated proposal and assignment required');
        const offset = (n: number | undefined) =>
          n === undefined
            ? undefined
            : (n < 0 ? '-' : '+') +
              String(Math.floor(Math.abs(n) / 60)).padStart(2, '0') +
              ':' +
              String(Math.abs(n) % 60).padStart(2, '0');
        const from = resolveLocal(
            input.startLocal,
            input.timezone,
            offset(input.startOffsetMinutes),
          ),
          until = resolveLocal(input.endLocal, input.timezone, offset(input.endOffsetMinutes));
        if (until <= from) throw new BadRequestException('Invalid dated interval');
      }
      const old = await tx.w06Exception.findUnique({
        where: { makerId_key: { makerId: u.id, key: input.key } },
      });
      if (old) {
        const fields = [
          'kind',
          'startLocal',
          'endLocal',
          'timezone',
          'startOffsetMinutes',
          'endOffsetMinutes',
          'roomId',
          'assignmentId',
          'modality',
          'reason',
        ] as const;
        if (
          old.sessionId !== id ||
          fields.some((k) => (old[k] ?? null) !== (input[k] ?? null)) ||
          JSON.stringify(old.requiredCapabilities) !== JSON.stringify(input.requiredCapabilities)
        )
          throw new ConflictException('Idempotency key conflict');
        return { id: old.id, state: old.state, routedSessionId: old.routedSessionId };
      }
      const r = await tx.w06Exception.create({
        data: { ...input, sessionId: s.id, makerId: u.id },
      });
      await this.audit(tx, a, 'EXCEPTION_REQUESTED', id);
      return { id: r.id, state: r.state };
    });
  }
  routeException(a: AuthorityActor, id: string, input: W06DecisionDto) {
    this.enabled();
    return this.planning.routeW06Exception(a, id, input);
  }
  notifications(a: AuthorityActor) {
    return this.run(a, async (tx, u) => {
      const rows = await tx.w06Notification.findMany({
          where: { recipientId: u.id },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        data = [];
      for (const r of rows) {
        const s = await tx.teachingSession.findUnique({ where: { id: r.sessionId } });
        if (!s) continue;
        const f = await this.flags(tx, u, s);
        if (f.teacher || f.learner || f.inspector)
          data.push({
            id: r.id,
            sessionId: s.state === 'PUBLISHED' ? s.id : null,
            classId: s.classOfferingId,
            kind: r.kind,
            createdAt: r.createdAt,
            delivery: 'IN_APP_INTENT',
          });
      }
      return { data };
    });
  }
}
