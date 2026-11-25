import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  type CourseVersion,
  type TeachingSession,
  type ClassInstructorAssignment,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthorizationService, type AuthorityActor } from '../authorization/authorization.service';
import type { PublicUser } from '../users/user.types';
import { dateOnly, localMinute, resolveLocal } from './academic-time';
import { projectWallClockTime } from '../classes/class-operations';
import { randomUUID } from 'node:crypto';
import { verifyUnifiedTarget } from '../operations/unified-runtime.guard';
import { requireConfirmedPrice, requireOfferWindow } from './approved-offer.policy';
import type { W06DecisionDto } from '../session-engagement/session-engagement.dto';
import type { ClassModality, RoomCapability } from '../../generated/prisma/client';
import {
  type AssignmentApprovalDto,
  type AssignmentDto,
  type DecisionDto,
  type GenerationDto,
  type PlanningQueryDto,
  type RoomDto,
  type SessionDto,
  type SessionApprovalDto,
  type UpdateRoomDto,
  type UpdateSessionDto,
  type UpdateVersionDto,
  type VersionDto,
  type VersionOfferDto,
  type VersionApprovalDto,
  type OpenVersionOfferDto,
} from './academic-planning.dto';

type Tx = Prisma.TransactionClient;
type Kind = 'sessions' | 'assignments' | 'versions';
const scheduleCap = 'academic.schedule.approve',
  programCap = 'academic.program.approve';
const includeCalendar = {
  classOffering: { select: { id: true, code: true, name: true } },
  room: { select: { id: true, code: true, name: true, location: true } },
  instructor: { select: { id: true, fullName: true } },
} satisfies Prisma.TeachingSessionInclude;
@Injectable()
export class AcademicPlanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authority: AuthorizationService,
  ) {}
  private async now(tx: Tx) {
    const [c] = await tx.$queryRaw<
      { ms: number }[]
    >`SELECT (EXTRACT(EPOCH FROM clock_timestamp())*1000)::double precision AS ms`;
    return new Date(c.ms);
  }
  private async write<T>(actor: AuthorityActor, work: (tx: Tx) => Promise<T>): Promise<T> {
    for (let n = 0; n < 3; n++)
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
            if (process.env.V2_UNIFIED_RUNTIME === 'DEV_UNIFIED_01') {
              await verifyUnifiedTarget(tx);
              await tx.$queryRaw`SELECT set_config('academic_offer_v2.actor',${actor.id},true),set_config('academic_offer_v2.session',${actor.sessionId},true)`;
            }
            await this.authority.requireActor(tx, actor, 'class.read');
            if (
              (await tx.user.findUnique({ where: { id: actor.id }, select: { role: true } }))
                ?.role !== 'ACADEMIC_MANAGER'
            )
              throw new ForbiddenException('Active academic manager required');
            if (typeof this.authority.academicProfile === 'function') {
              const profile = await this.authority.academicProfile(actor.id, 'ACADEMIC_MANAGER', tx);
              if (profile.academicTrack === 'STUDENT_AFFAIRS') {
                throw new ForbiddenException('Chức năng này thuộc phạm vi Quản lý Đào tạo');
              }
            }
            return work(tx);
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            maxWait: 10000,
            timeout: 30000,
          },
        );
      } catch (e) {
        if (e instanceof HttpException) throw e;
        const detail = String(e) + JSON.stringify(e);
        if (/P2034|TransactionWriteConflict|40001|40P01/.test(detail) && n < 2) continue;
        if (
          /P2002|P2003|P2004|P2034|23P01|23514|23505|ExclusionConstraint|CheckConstraint|UniqueConstraint|ForeignKeyConstraint|ACADEMIC_|ROOM_|SESSION_|OFFER_|ASSIGNMENT_|W05B_OFFICIAL_CONSULTATION_CONFLICT/.test(
            detail,
          )
        )
          throw new ConflictException({
            code: 'ACADEMIC_DB_CONFLICT',
            message:
              'Không thể duyệt/lưu: xung đột dữ liệu, tài nguyên hoặc quy tắc bất biến. Tải lại và kiểm tra yêu cầu.',
          });
        throw e;
      }
    throw new ConflictException('Concurrent academic change; reload');
  }
  private async audit(tx: Tx, a: AuthorityActor, action: string, id: string, reason: string) {
    await this.authority.audit(tx, a.id, action, 'ACADEMIC', id, reason);
  }
  private async versionEvent(
    tx: Tx,
    a: AuthorityActor,
    id: string,
    kind: string,
    reason: string,
    reference?: string,
  ) {
    if (process.env.V2_UNIFIED_RUNTIME !== 'DEV_UNIFIED_01') return;
    await tx.$executeRaw`INSERT INTO academic_offer_v2.version_events(id,version_id,actor_id,kind,snapshot,reason,po_reference)
      SELECT ${randomUUID()}::uuid,v.id,${a.id}::uuid,${kind},to_jsonb(v),${reason},${reference ?? null}
      FROM public.course_versions v WHERE v.id=${id}::uuid`;
  }
  private cas(actual: number, expected: number) {
    if (actual !== expected)
      throw new ConflictException({
        code: 'STALE_ACADEMIC_EDIT',
        message: 'Dữ liệu đã thay đổi. Tải lại trước khi lưu.',
      });
  }
  private async ownClass(tx: Tx, actor: AuthorityActor, id: string) {
    const c = await tx.classOffering.findUnique({
      where: { id },
      include: { course: { select: { createdById: true } } },
    });
    if (!c || c.course.createdById !== actor.id)
      throw new NotFoundException('Owned class not found');
    return c;
  }
  private async ownCourse(tx: Tx, a: AuthorityActor, id: string) {
    const c = await tx.course.findUnique({ where: { id } });
    if (!c || c.createdById !== a.id) throw new NotFoundException('Owned program not found');
    return c;
  }
  private async scopes(tx: Tx, id: string, capability: string) {
    const now = await this.now(tx);
    const rows = await tx.permissionGrant.findMany({
      where: {
        userId: id,
        capability,
        approvedBy: { not: null },
        approvedAt: { lte: now },
        revokedAt: null,
        effectiveAt: { lte: now },
        expiresAt: { gt: now },
      },
      select: { scopeId: true },
    });
    return rows.flatMap((r) => (r.scopeId ? [r.scopeId] : []));
  }
  private async classReadScope(tx: Tx, user: PublicUser): Promise<Prisma.ClassOfferingWhereInput> {
    if (user.role === 'ACADEMIC_MANAGER')
      return {
        OR: [
          { course: { createdById: user.id } },
          { id: { in: await this.scopes(tx, user.id, scheduleCap) } },
        ],
      };
    if (user.role === 'INSTRUCTOR')
      return { datedSessions: { some: { state: 'PUBLISHED', instructorId: user.id } } };
    if (user.role === 'STUDENT')
      return { enrollments: { some: { learnerId: user.id, status: 'ACTIVE' } } };
    if (user.role === 'TEACHING_INSPECTOR')
      return (await this.authority.permits(user.id, 'class.read'))
        ? {}
        : { id: { in: await this.scopes(tx, user.id, 'class.read') } };
    throw new ForbiddenException();
  }
  async rooms(q: PlanningQueryDto) {
    return {
      data: await this.prisma.room.findMany({
        orderBy: { code: 'asc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      total: await this.prisma.room.count(),
    };
  }
  async roomSchedule(id: string) {
    const room = await this.prisma.room.findUnique({ where: { id } });
    if (!room) throw new NotFoundException('Room not found');
    const [slots, sessions] = await Promise.all([
      this.prisma.classScheduleSlot.findMany({
        where: { OR: [{ roomId: id }, { classOffering: { defaultRoomId: id } }] },
        include: {
          classOffering: {
            select: {
              id: true,
              code: true,
              name: true,
              status: true,
              instructor: { select: { id: true, fullName: true } },
            },
          },
        },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      }),
      this.prisma.teachingSession.findMany({
        where: { roomId: id, state: 'PUBLISHED', endsAt: { gte: new Date() } },
        include: {
          classOffering: { select: { id: true, code: true, name: true } },
          instructor: { select: { id: true, fullName: true } },
        },
        orderBy: { startsAt: 'asc' },
        take: 30,
      }),
    ]);
    return {
      room,
      weeklySlots: slots.map((s) => ({
        id: s.id,
        dayOfWeek: s.dayOfWeek,
        startTime: projectWallClockTime(s.startTime),
        endTime: projectWallClockTime(s.endTime),
        locationText: s.locationText,
        classOffering: s.classOffering,
      })),
      upcomingSessions: sessions,
    };
  }
  saveRoom(a: AuthorityActor, input: RoomDto | UpdateRoomDto, id?: string) {
    return this.write(a, async (tx) => {
      let result;
      if (id) {
        const old = await tx.room.findUnique({ where: { id } });
        if (!old || old.createdBy !== a.id) throw new NotFoundException('Owned room not found');
        this.cas(old.lockVersion, (input as UpdateRoomDto).expectedLockVersion);
        const { reason, ...data } = input;
        void reason;
        delete (data as Partial<UpdateRoomDto>).expectedLockVersion;
        result = await tx.room.update({
          where: { id },
          data: { ...data, lockVersion: { increment: 1 } },
        });
      } else {
        const { reason, ...data } = input;
        void reason;
        result = await tx.room.create({ data: { ...data, createdBy: a.id } });
      }
      await this.audit(tx, a, 'W02B_ROOM_SAVE', result.id, input.reason);
      return result;
    });
  }
  deleteRoom(a: AuthorityActor, id: string, input: DecisionDto) {
    return this.write(a, async (tx) => {
      const r = await tx.room.findUnique({ where: { id } });
      if (!r || r.createdBy !== a.id) throw new NotFoundException();
      this.cas(r.lockVersion, input.expectedLockVersion);
      if (await tx.teachingSession.count({ where: { roomId: id } }))
        throw new ConflictException('Referenced room cannot be deleted; preserve history');
      await tx.room.delete({ where: { id } });
      await this.audit(tx, a, 'W02B_ROOM_DELETE_UNUSED', id, input.reason);
      return { removed: true };
    });
  }
  instructors() {
    return this.prisma.user.findMany({
      where: { role: 'INSTRUCTOR', status: 'ACTIVE' },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
  }
  async versions(a: PublicUser, courseId: string) {
    const scope = await this.scopes(this.prisma, a.id, programCap);
    const c = await this.prisma.course.findFirst({
      where: { id: courseId, OR: [{ createdById: a.id }, { id: { in: scope } }] },
      select: { id: true },
    });
    if (!c) throw new NotFoundException();
    return this.prisma.courseVersion.findMany({ where: { courseId }, orderBy: { number: 'desc' } });
  }
  async versionContext(a: PublicUser, courseId: string) {
    await this.versions(a, courseId);
    const course = await this.prisma.course.findUniqueOrThrow({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        description: true,
        level: true,
        skillScope: true,
        isPublished: true,
        createdById: true,
      },
    });
    const legacyPrices = await this.prisma.classOffering.findMany({
      where: { courseId, versionId: null, pricingType: 'PAID' },
      select: { id: true, code: true, name: true, tuitionFeeVnd: true },
      orderBy: { code: 'asc' },
    });
    const offers = await this.prisma.classOffering.findMany({
      where: { courseId, versionId: { not: null } },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        updatedAt: true,
        versionId: true,
        approvedTuitionFeeVnd: true,
        enrollmentStart: true,
        enrollmentEnd: true,
        classStart: true,
        classEnd: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      course,
      canAuthor: course.createdById === a.id,
      legacyPrices,
      offers,
      legacyPricesAreApproved: false,
      requiredApproval: {
        capability: programCap,
        scopeType: 'COURSE',
        scopeId: courseId,
        independent: true,
      },
      nextAdmissionPermission: 'academic.admission.approve',
      priceDefault: null,
    };
  }
  async versionHistory(a: PublicUser, id: string) {
    const v = await this.prisma.courseVersion.findUnique({ where: { id } });
    if (!v) throw new NotFoundException();
    await this.versions(a, v.courseId);
    if (process.env.V2_UNIFIED_RUNTIME !== 'DEV_UNIFIED_01')
      return {
        events: [],
        availability: 'UNAVAILABLE',
        reason: 'Full snapshots require the approved integrated QA ledger',
      };
    return {
      availability: 'AVAILABLE',
      events: await this.prisma.$queryRaw`
      SELECT id,actor_id,kind,snapshot,reason,po_reference,created_at
      FROM academic_offer_v2.version_events WHERE version_id=${id}::uuid ORDER BY created_at,id`,
    };
  }
  returnVersion(a: AuthorityActor, id: string, input: DecisionDto) {
    return this.write(a, async (tx) => {
      const v = await tx.courseVersion.findUnique({ where: { id } });
      if (!v || v.proposedBy !== a.id) throw new NotFoundException();
      await this.ownCourse(tx, a, v.courseId);
      this.cas(v.lockVersion, input.expectedLockVersion);
      if (v.state !== 'PENDING_APPROVAL') throw new ConflictException('Pending version required');
      const result = await tx.courseVersion.update({
        where: { id },
        data: { state: 'DRAFT', lockVersion: { increment: 1 } },
      });
      await this.versionEvent(tx, a, id, 'RETURNED', input.reason);
      await this.audit(tx, a, 'W02B_VERSION_RETURNED', id, input.reason);
      return result;
    });
  }
  private prices(input: VersionDto) {
    const p = input.standardPricingType ?? null,
      fee = input.standardTuitionFeeVnd ?? null;
    if (
      (p === null) !== (fee === null) ||
      (p === 'FREE' && fee !== 0) ||
      (p === 'PAID' && (fee === null || fee <= 0))
    )
      throw new BadRequestException(
        'Explicit standard price pair required; unknown is null, not zero',
      );
    return { standardPricingType: p, standardTuitionFeeVnd: fee };
  }
  saveVersion(
    a: AuthorityActor,
    courseId: string,
    input: VersionDto | UpdateVersionDto,
    id?: string,
  ) {
    return this.write(a, async (tx) => {
      await this.ownCourse(tx, a, courseId);
      const { reason, ...fields } = input;
      void reason;
      delete (fields as Partial<UpdateVersionDto>).expectedLockVersion;
      const data = {
        ...fields,
        ...this.prices(input),
        effectiveFrom: new Date(input.effectiveFrom),
      };
      let result;
      if (id) {
        const old = await tx.courseVersion.findUnique({ where: { id } });
        if (!old || old.courseId !== courseId || old.proposedBy !== a.id)
          throw new NotFoundException();
        if (old.state !== 'DRAFT') throw new ConflictException('Version is frozen');
        this.cas(old.lockVersion, (input as UpdateVersionDto).expectedLockVersion);
        result = await tx.courseVersion.update({
          where: { id },
          data: { ...data, reason: input.reason, lockVersion: { increment: 1 } },
        });
      } else {
        const max = await tx.courseVersion.aggregate({
          where: { courseId },
          _max: { number: true },
        });
        result = await tx.courseVersion.create({
          data: {
            ...data,
            courseId,
            number: (max._max.number ?? 0) + 1,
            proposedBy: a.id,
            reason: input.reason,
          },
        });
      }
      await this.audit(tx, a, 'W02B_VERSION_DRAFT_SAVE', result.id, input.reason);
      await this.versionEvent(tx, a, result.id, 'DRAFT_SAVED', input.reason);
      return result;
    });
  }
  createOffer(a: AuthorityActor, versionId: string, input: VersionOfferDto) {
    return this.write(a, async (tx) => {
      const v = await tx.courseVersion.findUnique({ where: { id: versionId } });
      if (!v) throw new NotFoundException();
      await this.ownCourse(tx, a, v.courseId);
      if (
        v.state !== 'PUBLISHED' ||
        v.effectiveFrom > (await this.now(tx)) ||
        v.standardPricingType === null ||
        v.standardTuitionFeeVnd === null
      )
        throw new ConflictException(
          'Effective approved version with explicit approved price is required; individual price override is not supported',
        );
      const { reason, ...fields } = input;
      void reason;
      const dates = requireOfferWindow(
        {
          enrollmentStart: new Date(input.enrollmentStart),
          enrollmentEnd: new Date(input.enrollmentEnd),
          classStart: new Date(input.classStart),
          classEnd: new Date(input.classEnd),
        },
        await this.now(tx),
      );
      const result = await tx.classOffering.create({
        data: {
          ...fields,
          ...dates,
          courseId: v.courseId,
          versionId: v.id,
          status: 'DRAFT',
          pricingType: v.standardPricingType,
          tuitionFeeVnd: v.standardTuitionFeeVnd,
          termsTitle: v.title,
          termsDescription: v.description,
          termsLevel: v.level,
          termsSkillScope: v.skillScope,
          approvedPricingType: v.standardPricingType,
          approvedTuitionFeeVnd: v.standardTuitionFeeVnd,
          termsApprovedAt: v.approvedAt,
        },
      });
      await this.audit(tx, a, 'W02B_VERSION_OFFER_CREATE', result.id, input.reason);
      return result;
    });
  }
  openOffer(a: AuthorityActor, id: string, input: OpenVersionOfferDto) {
    return this.write(a, async (tx) => {
      await this.authority.requireActor(tx, a, 'academic.admission.approve', { type: 'CLASS', id });
      const c = await this.ownClass(tx, a, id);
      if (!c.versionId || c.status !== 'DRAFT')
        throw new ConflictException('Owned DRAFT with approved version required');
      if (c.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime())
        throw new ConflictException('Offer changed; reload');
      const [price] = await tx.$queryRaw<
        { valid: boolean }[]
      >`SELECT public.w07_price(${id}::uuid) AS valid`;
      if (
        !price.valid ||
        !(await tx.course.findUniqueOrThrow({ where: { id: c.courseId } })).isPublished
      )
        throw new ConflictException('Published program and immutable approved terms required');
      if (!c.enrollmentStart || !c.enrollmentEnd || !c.classStart || !c.classEnd || !c.maxStudents)
        throw new BadRequestException('Explicit capacity and enrollment/class dates required');
      requireOfferWindow(
        {
          enrollmentStart: c.enrollmentStart,
          enrollmentEnd: c.enrollmentEnd,
          classStart: c.classStart,
          classEnd: c.classEnd,
        },
        await this.now(tx),
      );
      const result = await tx.classOffering.update({ where: { id }, data: { status: 'OPEN' } });
      await this.audit(tx, a, 'W02B_APPROVED_OFFER_OPEN', id, input.reason);
      return {
        ...result,
        noSeatHold: true,
        lmsEntitlement: 'UNCHANGED',
        livePaymentEligibility: 'REQUIRES_APPROVED_W07_ADMISSION_SOURCE',
      };
    });
  }
  async assignments(a: PublicUser, classId: string) {
    const where = await this.classReadScope(this.prisma, a);
    const c = await this.prisma.classOffering.findFirst({
      where: { AND: [{ id: classId }, where] },
    });
    if (!c) throw new NotFoundException();
    return this.prisma.classInstructorAssignment.findMany({
      where: { classOfferingId: classId },
      include: {
        instructor: { select: { id: true, fullName: true } },
        replacement: { select: { id: true, effectiveFrom: true, state: true } },
      },
      orderBy: { effectiveFrom: 'asc' },
    });
  }
  createAssignment(a: AuthorityActor, classId: string, input: AssignmentDto) {
    return this.write(a, async (tx) => {
      await this.ownClass(tx, a, classId);
      const now = await this.now(tx),
        from = new Date(input.effectiveFrom),
        to = new Date(input.effectiveTo);
      if (from < now || to <= from || to.getTime() - from.getTime() > 366 * 86400000)
        throw new BadRequestException('Assignment must be future, finite and at most 366 days');
      if (
        !(await tx.user.findFirst({
          where: { id: input.instructorId, role: 'INSTRUCTOR', status: 'ACTIVE' },
        }))
      )
        throw new BadRequestException('Active instructor required');
      if (input.replacesId) {
        const prior = await tx.classInstructorAssignment.findUnique({
          where: { id: input.replacesId },
        });
        if (!prior || prior.classOfferingId !== classId) throw new NotFoundException();
        if (prior.state !== 'PUBLISHED' || from < prior.effectiveFrom || from > prior.reservedUntil)
          throw new ConflictException('Replacement cannot rewrite earlier attribution');
      }
      const { reason, ...data } = input;
      const result = await tx.classInstructorAssignment.create({
        data: {
          ...data,
          classOfferingId: classId,
          effectiveFrom: from,
          effectiveTo: to,
          reservedUntil: to,
          proposedBy: a.id,
          reason,
        },
      });
      await this.audit(tx, a, 'W02B_ASSIGNMENT_PROPOSE', result.id, reason);
      return result;
    });
  }
  private async fields(tx: Tx, classId: string, input: SessionDto) {
    const startsAt = resolveLocal(input.startLocal, input.timezone, input.startOffset),
      endsAt = resolveLocal(input.endLocal, input.timezone, input.endOffset),
      now = await this.now(tx);
    if (
      startsAt <= now ||
      endsAt <= startsAt ||
      endsAt.getTime() - startsAt.getTime() > 12 * 3600000 ||
      startsAt.getTime() - now.getTime() > 366 * 86400000
    )
      throw new BadRequestException('Future session up to 12h within 366 days required');
    if (input.modality === 'ONLINE' && input.roomId)
      throw new BadRequestException('Online session has no physical room');
    if (input.roomId && !(await tx.room.findUnique({ where: { id: input.roomId } })))
      throw new NotFoundException('Room not found');
    const assignment = input.assignmentId
      ? await tx.classInstructorAssignment.findUnique({ where: { id: input.assignmentId } })
      : null;
    if (input.assignmentId && (!assignment || assignment.classOfferingId !== classId))
      throw new NotFoundException('Class assignment not found');
    return {
      startsAt,
      endsAt,
      timezone: input.timezone,
      modality: input.modality,
      roomId: input.roomId ?? null,
      assignmentId: assignment?.id ?? null,
      instructorId: assignment?.instructorId ?? null,
      requiredCapabilities: input.requiredCapabilities,
    };
  }
  private async templateStatus(s: TeachingSession, tx: Tx = this.prisma) {
    if (!s.sourceTemplateId)
      return { kind: 'MANUAL' as const, capturedUpdatedAt: null, currentUpdatedAt: null };
    const source = await tx.classScheduleSlot.findUnique({
      where: { id: s.sourceTemplateId },
      select: { updatedAt: true },
    });
    return {
      kind: !source
        ? ('MISSING' as const)
        : source.updatedAt.getTime() !== s.sourceTemplateUpdatedAt?.getTime()
          ? ('STALE' as const)
          : ('CURRENT' as const),
      capturedUpdatedAt: s.sourceTemplateUpdatedAt?.toISOString() ?? null,
      currentUpdatedAt: source?.updatedAt.toISOString() ?? null,
    };
  }
  async warnings(s: TeachingSession, tx: Tx = this.prisma) {
    const warnings: string[] = [];
    const source = await this.templateStatus(s, tx);
    if (source.kind === 'STALE' || source.kind === 'MISSING')
      warnings.push('SOURCE_TEMPLATE_' + source.kind);
    const excludeIds = [s.id, ...(s.supersedesId ? [s.supersedesId] : [])];
    const other = await tx.teachingSession.findMany({
      where: {
        state: { in: ['PUBLISHED', 'PENDING_APPROVAL'] },
        id: { notIn: excludeIds },
        startsAt: { lt: s.endsAt },
        endsAt: { gt: s.startsAt },
        OR: [
          { classOfferingId: s.classOfferingId },
          ...(s.roomId ? [{ roomId: s.roomId }] : []),
          ...(s.instructorId ? [{ instructorId: s.instructorId }] : []),
        ],
      },
      select: { classOfferingId: true, roomId: true, instructorId: true },
    });
    if (other.some((x) => x.classOfferingId === s.classOfferingId)) warnings.push('CLASS_CONFLICT');
    if (s.roomId && other.some((x) => x.roomId === s.roomId)) warnings.push('ROOM_CONFLICT');
    if (s.instructorId && other.some((x) => x.instructorId === s.instructorId))
      warnings.push('INSTRUCTOR_CONFLICT');
    const a = s.assignmentId
      ? await tx.classInstructorAssignment.findUnique({ where: { id: s.assignmentId } })
      : null;
    if (
      !a ||
      !['PUBLISHED', 'SUPERSEDED'].includes(a.state) ||
      a.effectiveFrom > s.startsAt ||
      a.reservedUntil < s.endsAt
    )
      warnings.push('APPROVED_EFFECTIVE_ASSIGNMENT_REQUIRED');
    if (a && (a.effectiveFrom > s.startsAt || a.reservedUntil < s.endsAt))
      warnings.push('ASSIGNMENT_WINDOW_MISMATCH');
    if (s.modality !== 'ONLINE') {
      const r = s.roomId ? await tx.room.findUnique({ where: { id: s.roomId } }) : null,
        c = await tx.classOffering.findUnique({
          where: { id: s.classOfferingId },
          select: { maxStudents: true },
        });
      if (
        !r ||
        r.status !== 'ACTIVE' ||
        !c?.maxStudents ||
        r.capacity < c.maxStudents ||
        s.requiredCapabilities.some((cap) => !r.capabilities.includes(cap))
      )
        warnings.push('ROOM_UNSUITABLE');
    }
    return [...new Set(warnings)];
  }
  private async assertNoSessionConflicts(
    s: TeachingSession,
    tx: Tx,
    requireApprovedAssignment: boolean,
  ) {
    const found = await this.warnings(s, tx);
    const blocking = found.filter((code) =>
      code === 'CLASS_CONFLICT' ||
      code === 'ROOM_CONFLICT' ||
      code === 'INSTRUCTOR_CONFLICT' ||
      code === 'ROOM_UNSUITABLE' ||
      code === 'ASSIGNMENT_WINDOW_MISMATCH' ||
      (requireApprovedAssignment && code === 'APPROVED_EFFECTIVE_ASSIGNMENT_REQUIRED'),
    );
    if (!blocking.length) return found;
    const labels: Record<string, string> = {
      CLASS_CONFLICT: 'Trùng khung giờ của chính lớp học này',
      ROOM_CONFLICT: 'Phòng học đã được sử dụng trong khung giờ này',
      INSTRUCTOR_CONFLICT: 'Giảng viên đã có lịch dạy khác trong khung giờ này',
      ROOM_UNSUITABLE: 'Phòng học không khả dụng, không đủ sức chứa hoặc thiếu tiện ích yêu cầu',
      ASSIGNMENT_WINDOW_MISMATCH: 'Thời gian buổi học nằm ngoài hiệu lực phân công giảng viên',
      APPROVED_EFFECTIVE_ASSIGNMENT_REQUIRED:
        'Buổi học phải gắn phân công giảng viên đã phê duyệt và còn hiệu lực',
    };
    throw new ConflictException({
      code: blocking[0],
      conflicts: blocking,
      message: blocking.map((c) => labels[c] ?? c).join('; '),
    });
  }
  createSession(a: AuthorityActor, classId: string, input: SessionDto) {
    return this.write(a, async (tx) => {
      await this.ownClass(tx, a, classId);
      const fields = await this.fields(tx, classId, input);
      const result = await tx.teachingSession.create({
        data: { ...fields, classOfferingId: classId, proposedBy: a.id, reason: input.reason },
      });
      const warnings = await this.assertNoSessionConflicts(result, tx, false);
      await this.audit(tx, a, 'W02B_SESSION_DRAFT_CREATE', result.id, input.reason);
      return { ...result, warnings };
    });
  }
  updateSession(a: AuthorityActor, id: string, input: UpdateSessionDto) {
    return this.write(a, async (tx) => {
      const old = await tx.teachingSession.findUnique({ where: { id } });
      if (!old) throw new NotFoundException();
      await this.ownClass(tx, a, old.classOfferingId);
      if (old.proposedBy !== a.id) throw new NotFoundException();
      if (old.state !== 'DRAFT' || old.intent === 'CANCEL')
        throw new ConflictException('Submitted/official session is frozen; propose a revision');
      if (old.startsAt <= (await this.now(tx)))
        throw new ConflictException('Past session cannot be modified');
      this.cas(old.lockVersion, input.expectedLockVersion);
      const result = await tx.teachingSession.update({
        where: { id },
        data: {
          ...(await this.fields(tx, old.classOfferingId, input)),
          reason: input.reason,
          lockVersion: { increment: 1 },
        },
      });
      const warnings = await this.assertNoSessionConflicts(result, tx, false);
      await this.audit(tx, a, 'W02B_SESSION_DRAFT_UPDATE', id, input.reason);
      return { ...result, warnings };
    });
  }
  generate(a: AuthorityActor, classId: string, input: GenerationDto) {
    return this.write(a, async (tx) => {
      const c = await this.ownClass(tx, a, classId),
        from = dateOnly(input.from),
        through = dateOnly(input.through),
        today = localMinute(await this.now(tx), input.timezone).slice(0, 10);
      if (
        input.from < today ||
        through < from ||
        through.getTime() - from.getTime() > 60 * 86400000 ||
        from.getTime() - (await this.now(tx)).getTime() > 366 * 86400000
      )
        throw new BadRequestException(
          'Explicit future generation range up to 61 dates within 366 days required',
        );
      for (const d of input.excludeDates) {
        dateOnly(d);
        if (d < input.from || d > input.through)
          throw new BadRequestException('Excluded date outside generation interval');
      }
      const slots = await tx.classScheduleSlot.findMany({
        where: { classOfferingId: classId },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      });
      const result: TeachingSession[] = [];
      let existing = 0;
      const existingSources: {
        id: string;
        state: string;
        sourceTemplateStatus: Awaited<ReturnType<AcademicPlanningService['templateStatus']>>;
      }[] = [];
      for (let day = from.getTime(); day <= through.getTime(); day += 86400000) {
        const d = new Date(day),
          date = d.toISOString().slice(0, 10);
        if (input.excludeDates.includes(date)) continue;
        for (const slot of slots.filter((s) => s.dayOfWeek === (d.getUTCDay() || 7))) {
          if (result.length + existing >= 120)
            throw new BadRequestException('Maximum 120 occurrences per batch');
          const key = [classId, slot.id, date, input.timezone].join('|');
          const prev = await tx.teachingSession.findUnique({ where: { generationKey: key } });
          if (prev) {
            existing++;
            existingSources.push({
              id: prev.id,
              state: prev.state,
              sourceTemplateStatus: await this.templateStatus(prev, tx),
            });
            continue;
          }
          const data = await this.fields(tx, classId, {
            ...input,
            startLocal: date + 'T' + slot.startTime.toISOString().slice(11, 16),
            endLocal: date + 'T' + slot.endTime.toISOString().slice(11, 16),
            modality: c.modality,
          });
          result.push(
            await tx.teachingSession.create({
              data: {
                ...data,
                classOfferingId: classId,
                proposedBy: a.id,
                reason: input.reason,
                sourceTemplateId: slot.id,
                sourceTemplateUpdatedAt: slot.updatedAt,
                generationKey: key,
                generatedFrom: from,
                generatedThrough: through,
              },
            }),
          );
        }
      }
      await this.audit(tx, a, 'W02B_GENERATE_DRAFTS', classId, input.reason);
      return {
        created: result.length,
        existing,
        staleExisting: existingSources.filter(
          (s) =>
            s.sourceTemplateStatus.kind === 'STALE' || s.sourceTemplateStatus.kind === 'MISSING',
        ).length,
        existingSources,
        data: await Promise.all(
          result.map(async (s) => ({ ...s, warnings: await this.warnings(s, tx) })),
        ),
        kind: 'DRAFT_ONLY',
        excluded: input.excludeDates,
      };
    });
  }
  revise(a: AuthorityActor, id: string, reason: string, input?: SessionDto) {
    return this.write(a, async (tx) => {
      const old = await tx.teachingSession.findUnique({ where: { id } });
      if (!old) throw new NotFoundException();
      await this.ownClass(tx, a, old.classOfferingId);
      if (old.state !== 'PUBLISHED' || old.startsAt <= (await this.now(tx)))
        throw new ConflictException(
          'Only future current official session may be revised/cancelled',
        );
      const fields = input
        ? await this.fields(tx, old.classOfferingId, input)
        : {
            startsAt: old.startsAt,
            endsAt: old.endsAt,
            timezone: old.timezone,
            modality: old.modality,
            roomId: old.roomId,
            assignmentId: old.assignmentId,
            instructorId: old.instructorId,
            requiredCapabilities: old.requiredCapabilities,
          };
      const result = await tx.teachingSession.create({
        data: {
          ...fields,
          occurrenceId: old.occurrenceId,
          revision: old.revision + 1,
          supersedesId: old.id,
          classOfferingId: old.classOfferingId,
          proposedBy: a.id,
          reason,
          intent: input ? 'RESCHEDULE' : 'CANCEL',
          sourceTemplateId: old.sourceTemplateId,
          sourceTemplateUpdatedAt: old.sourceTemplateUpdatedAt,
        },
      });
      if (input) await this.assertNoSessionConflicts(result, tx, false);
      await this.audit(
        tx,
        a,
        input ? 'W02B_RESCHEDULE_DRAFT' : 'W02B_CANCELLATION_DRAFT',
        result.id,
        reason,
      );
      return result;
    });
  }
  private async exceptionFields(
    tx: Tx,
    old: TeachingSession,
    request: {
      kind: string;
      startLocal: string | null;
      endLocal: string | null;
      timezone: string;
      startOffsetMinutes: number | null;
      endOffsetMinutes: number | null;
      modality: string | null;
      roomId: string | null;
      assignmentId: string | null;
      requiredCapabilities: string[];
    },
    reason: string,
  ) {
    if (request.kind === 'LEAVE') {
      return {
        startsAt: old.startsAt,
        endsAt: old.endsAt,
        timezone: old.timezone,
        modality: old.modality,
        roomId: old.roomId,
        assignmentId: old.assignmentId,
        instructorId: old.instructorId,
        requiredCapabilities: old.requiredCapabilities,
      };
    }
    const offset = (n: number | null) =>
      n === null
        ? undefined
        : (n < 0 ? '-' : '+') +
          String(Math.floor(Math.abs(n) / 60)).padStart(2, '0') +
          ':' +
          String(Math.abs(n) % 60).padStart(2, '0');
    return this.fields(tx, old.classOfferingId, {
      startLocal: request.startLocal!,
      endLocal: request.endLocal!,
      timezone: request.timezone,
      startOffset: offset(request.startOffsetMinutes),
      endOffset: offset(request.endOffsetMinutes),
      modality: request.modality as ClassModality,
      roomId: request.roomId ?? undefined,
      assignmentId: request.assignmentId ?? undefined,
      requiredCapabilities: request.requiredCapabilities as RoomCapability[],
      reason,
    });
  }
  async previewException(
    tx: Tx,
    request: {
      id: string;
      sessionId: string;
      kind: string;
      startLocal: string | null;
      endLocal: string | null;
      timezone: string;
      startOffsetMinutes: number | null;
      endOffsetMinutes: number | null;
      modality: string | null;
      roomId: string | null;
      assignmentId: string | null;
      requiredCapabilities: string[];
      reason: string;
    },
  ) {
    const old = await tx.teachingSession.findUniqueOrThrow({
      where: { id: request.sessionId },
      include: {
        classOffering: { select: { id: true, code: true, name: true } },
        room: { select: { id: true, code: true, name: true, location: true } },
        instructor: { select: { id: true, fullName: true } },
      },
    });
    const proposedRoom = request.roomId
      ? await tx.room.findUnique({
          where: { id: request.roomId },
          select: { id: true, code: true, name: true, location: true },
        })
      : null;
    if (request.kind === 'LEAVE') {
      return {
        originalSession: {
          id: old.id,
          classOffering: old.classOffering,
          startsAt: old.startsAt,
          endsAt: old.endsAt,
          timezone: old.timezone,
          modality: old.modality,
          room: old.room,
          instructor: old.instructor,
        },
        proposedRoom,
        proposedStartsAt: null,
        proposedEndsAt: null,
        conflicts: [] as string[],
      };
    }
    try {
      const candidate = await this.exceptionFields(tx, old, request, request.reason);
      const pseudo: TeachingSession = {
        ...old,
        id: '00000000-0000-0000-0000-000000000000',
        supersedesId: request.kind === 'MAKEUP' ? null : old.id,
        ...candidate,
      };
      const conflicts = (await this.warnings(pseudo, tx)).filter(
        (c) => !c.startsWith('SOURCE_TEMPLATE_'),
      );
      return {
        originalSession: {
          id: old.id,
          classOffering: old.classOffering,
          startsAt: old.startsAt,
          endsAt: old.endsAt,
          timezone: old.timezone,
          modality: old.modality,
          room: old.room,
          instructor: old.instructor,
        },
        proposedRoom,
        proposedStartsAt: candidate.startsAt,
        proposedEndsAt: candidate.endsAt,
        conflicts,
      };
    } catch (e) {
      return {
        originalSession: {
          id: old.id,
          classOffering: old.classOffering,
          startsAt: old.startsAt,
          endsAt: old.endsAt,
          timezone: old.timezone,
          modality: old.modality,
          room: old.room,
          instructor: old.instructor,
        },
        proposedRoom,
        proposedStartsAt: null,
        proposedEndsAt: null,
        conflicts: [e instanceof HttpException ? e.message : 'INVALID_PROPOSAL'],
      };
    }
  }
  // Route teacher intent into the EXISTING two-HVU official lifecycle, never publish here.
  routeW06Exception(a: AuthorityActor,id:string,input:W06DecisionDto) {
    if(process.env.W06_ENABLED!=='DEV_DEC047')throw new NotFoundException();
    return this.write(a,async tx=>{
      const request=await tx.w06Exception.findUnique({where:{id}});if(!request)throw new NotFoundException();
      const old=await tx.teachingSession.findUniqueOrThrow({where:{id:request.sessionId}});
      await this.authority.requireActor(tx,a,scheduleCap,{type:'CLASS',id:old.classOfferingId});
      await this.ownClass(tx,a,old.classOfferingId);
      if(request.makerId===a.id)throw new ForbiddenException('Independent academic routing required');
      if(request.state!=='PENDING_APPROVAL'){
        if(request.routedById===a.id&&request.decisionKey===input.key&&request.reviewReason===input.reason&&request.state===(input.decision==='APPROVED'?'ROUTED':'REJECTED'))return {id:request.id,state:request.state,routedSessionId:request.routedSessionId};
        throw new ConflictException('Already routed/reviewed');
      }
      if(old.state!=='PUBLISHED'||old.startsAt<=await this.now(tx))throw new ConflictException('Stale or started official session');
      await tx.$queryRaw`SELECT set_config('app.w06_actor',${a.id},true),set_config('app.w06_session',${a.sessionId},true)`;
      let routedSessionId:string|null=null;
      if(input.decision==='APPROVED'){
        const data=await this.exceptionFields(tx,old,request,input.reason);
        const revision=await tx.teachingSession.create({data:{...data,classOfferingId:old.classOfferingId,proposedBy:a.id,reason:input.reason,
          ...(request.kind==='MAKEUP'?{}:{occurrenceId:old.occurrenceId,revision:old.revision+1,supersedesId:old.id}),
          intent:request.kind==='LEAVE'?'CANCEL':request.kind==='RESCHEDULE'?'RESCHEDULE':'PUBLISH',
        }});
        if(request.kind!=='LEAVE')await this.assertNoSessionConflicts(revision,tx,true);
        await tx.teachingSession.update({where:{id:revision.id},data:{state:'PENDING_APPROVAL',submittedAt:await this.now(tx),lockVersion:{increment:1}}});routedSessionId=revision.id;
      }
      const result=await tx.w06Exception.update({where:{id},data:{state:input.decision==='APPROVED'?'ROUTED':'REJECTED',routedSessionId,routedById:a.id,decisionKey:input.key,reviewReason:input.reason}});
      await this.audit(tx,a,'W06_EXCEPTION_'+result.state,id,input.reason);
      return {id:result.id,state:result.state,routedSessionId:result.routedSessionId,requiresIndependentOfficialApproval:!!routedSessionId};
    });
  }
  private async object(tx: Tx, kind: Kind, id: string) {
    const r =
      kind === 'sessions'
        ? await tx.teachingSession.findUnique({ where: { id } })
        : kind === 'assignments'
          ? await tx.classInstructorAssignment.findUnique({ where: { id } })
          : await tx.courseVersion.findUnique({ where: { id } });
    if (!r) throw new NotFoundException();
    return r;
  }
  submit(a: AuthorityActor, kind: Kind, id: string, input: DecisionDto) {
    return this.write(a, async (tx) => {
      const r = await this.object(tx, kind, id);
      if (kind === 'versions') await this.ownCourse(tx, a, (r as CourseVersion).courseId);
      else await this.ownClass(tx, a, (r as TeachingSession).classOfferingId);
      if (r.proposedBy !== a.id) throw new NotFoundException();
      if (r.state === 'PENDING_APPROVAL') return r;
      if (r.state !== 'DRAFT')
        throw new ConflictException('Cannot submit immutable approved history');
      this.cas(r.lockVersion, input.expectedLockVersion);
      if (kind === 'sessions' && (r as TeachingSession).intent !== 'CANCEL')
        await this.assertNoSessionConflicts(r as TeachingSession, tx, false);
      if (kind === 'versions' && (r as CourseVersion).standardTuitionFeeVnd === null)
        throw new BadRequestException({
          code: 'PO_PRICE_DECISION_PENDING',
          message:
            'Phiên bản cần có mức học phí chính thức trước khi gửi duyệt ban hành.',
        });
      const data = {
        state: 'PENDING_APPROVAL' as const,
        submittedAt: await this.now(tx),
        lockVersion: { increment: 1 },
      };
      const result =
        kind === 'sessions'
          ? await tx.teachingSession.update({ where: { id }, data })
          : kind === 'assignments'
            ? await tx.classInstructorAssignment.update({ where: { id }, data })
            : await tx.courseVersion.update({ where: { id }, data });
      await this.audit(tx, a, 'W02B_' + kind.toUpperCase() + '_SUBMIT', id, input.reason);
      if (kind === 'versions') await this.versionEvent(tx, a, id, 'SUBMITTED', input.reason);
      return result;
    });
  }
  approve(
    a: AuthorityActor,
    kind: Kind,
    id: string,
    input: DecisionDto | AssignmentApprovalDto | SessionApprovalDto | VersionApprovalDto,
  ) {
    return this.write(a, async (tx) => {
      const r = await this.object(tx, kind, id),
        scope =
          kind === 'versions'
            ? { type: 'COURSE' as const, id: (r as CourseVersion).courseId }
            : { type: 'CLASS' as const, id: (r as TeachingSession).classOfferingId };
      await this.authority.requireActor(
        tx,
        a,
        kind === 'versions' ? programCap : scheduleCap,
        scope,
      );
      if (r.approvedBy === a.id && ['PUBLISHED', 'CANCELLED'].includes(r.state)) return r;
      if (r.state !== 'PENDING_APPROVAL')
        throw new ConflictException('Pending independent request required');
      this.cas(r.lockVersion, input.expectedLockVersion);
      if (kind === 'versions') {
        const review = input as VersionApprovalDto;
        requireConfirmedPrice(r as CourseVersion, review);
        await this.versionEvent(
          tx,
          a,
          id,
          'PRICE_CONFIRMED',
          input.reason,
          review.poPriceReference.trim(),
        );
      }
      const data = {
        state: 'PUBLISHED' as const,
        approvedBy: a.id,
        approvedAt: await this.now(tx),
        decisionReason: input.reason,
        lockVersion: { increment: 1 },
      };
      let result;
      if (kind === 'sessions') {
        const s = r as TeachingSession;
        if (s.intent !== 'CANCEL') {
          await this.assertNoSessionConflicts(s, tx, true);
          const source = await this.templateStatus(s, tx),
            review = input as SessionApprovalDto;
          if (
            source.kind === 'MISSING' ||
            (source.kind === 'STALE' &&
              (!review.sourceTemplateReviewed ||
                review.expectedSourceTemplateUpdatedAt !== source.currentUpdatedAt))
          )
            throw new ConflictException({
              code: 'STALE_WEEKLY_TEMPLATE_REVIEW_REQUIRED',
              message:
                'Mẫu tuần đã thay đổi. Quản lý Đào tạo cần kiểm tra lại phiên bản nguồn và giờ buổi nháp trước khi duyệt.',
            });
          if (source.kind === 'STALE')
            await this.audit(
              tx,
              a,
              'W02B_STALE_TEMPLATE_REVIEW',
              id,
              `Captured=${source.capturedUpdatedAt}; reviewed=${source.currentUpdatedAt}; dated snapshot retained`,
            );
        }
        if (s.supersedesId) {
          const old = await tx.teachingSession.findUnique({ where: { id: s.supersedesId } });
          if (!old || old.state !== 'PUBLISHED' || old.startsAt <= (await this.now(tx)))
            throw new ConflictException('Stale or past official revision');
          await tx.teachingSession.update({
            where: { id: old.id },
            data: { state: 'SUPERSEDED', lockVersion: { increment: 1 } },
          });
        }
        result = await tx.teachingSession.update({
          where: { id },
          data: { ...data, state: s.intent === 'CANCEL' ? 'CANCELLED' : 'PUBLISHED' },
        });
        const recipients = await tx.enrollment.findMany({
          where: {
            classOfferingId: s.classOfferingId,
            status: 'ACTIVE',
            learner: { status: 'ACTIVE' },
          },
          select: { learnerId: true },
        });
        const targets = new Set(recipients.map((x) => x.learnerId));
        if (s.instructorId) targets.add(s.instructorId);
        if (s.supersedesId) {
          const old = await tx.teachingSession.findUnique({
            where: { id: s.supersedesId },
            select: { instructorId: true },
          });
          if (old?.instructorId) targets.add(old.instructorId);
        }
        await tx.academicNotificationIntent.createMany({
          data: [...targets].map((recipientId) => ({ sessionId: id, recipientId, kind: s.intent })),
          skipDuplicates: true,
        });
        if(process.env.W06_ENABLED==='DEV_DEC047'){
          await tx.$queryRaw`SELECT set_config('app.w06_actor',${a.id},true),set_config('app.w06_session',${a.sessionId},true)`;
          const inspectors=await tx.permissionGrant.findMany({where:{capability:'class.read',scopeType:'CLASS',scopeId:s.classOfferingId,approvedBy:{not:null},revokedAt:null},select:{userId:true}});
          for(const g of inspectors)if((await tx.user.findUnique({where:{id:g.userId},select:{role:true,status:true}}))?.role==='TEACHING_INSPECTOR'&&await this.authority.permits(g.userId,'class.read',scope,tx))targets.add(g.userId);
          await tx.w06Notification.createMany({data:[...targets].map(recipientId=>({sessionId:id,recipientId,sourceId:id,kind:s.intent})),skipDuplicates:true});
        }
      } else if (kind === 'assignments') {
        const s = r as ClassInstructorAssignment;
        if (!(input as AssignmentApprovalDto).eligibilityConfirmed)
          throw new BadRequestException('Explicit instructor eligibility review required');
        if (s.replacesId) {
          const old = await tx.classInstructorAssignment.findUnique({
            where: { id: s.replacesId },
          });
          if (
            !old ||
            old.state !== 'PUBLISHED' ||
            old.classOfferingId !== s.classOfferingId ||
            s.effectiveFrom < old.effectiveFrom ||
            s.effectiveFrom > old.reservedUntil
          )
            throw new ConflictException('Stale assignment replacement');
          await tx.classInstructorAssignment.update({
            where: { id: old.id },
            data: {
              state: 'SUPERSEDED',
              reservedUntil: s.effectiveFrom,
              lockVersion: { increment: 1 },
            },
          });
        }
        result = await tx.classInstructorAssignment.update({
          where: { id },
          data: { ...data, eligibilityConfirmed: true },
        });
      } else result = await tx.courseVersion.update({ where: { id }, data });
      await this.audit(tx, a, 'W02B_' + kind.toUpperCase() + '_APPROVE', id, input.reason);
      if (kind === 'versions') await this.versionEvent(tx, a, id, 'PUBLISHED', input.reason);
      return result;
    });
  }
  async calendar(u: PublicUser, q: PlanningQueryDto) {
    const scope = await this.classReadScope(this.prisma, u);
    const now = await this.now(this.prisma),
      from = q.from ? new Date(q.from) : new Date(now.getTime() - 7 * 86400000),
      through = q.through ? new Date(q.through) : new Date(now.getTime() + 180 * 86400000);
    if (through <= from || through.getTime() - from.getTime() > 366 * 86400000)
      throw new BadRequestException('Calendar range up to 366 days required');
    const where: Prisma.TeachingSessionWhereInput = {
      classOffering: { AND: [scope, ...(q.classId ? [{ id: q.classId }] : [])] },
      startsAt: { gte: from, lt: through },
      ...(u.role !== 'ACADEMIC_MANAGER'
        ? { state: 'PUBLISHED', ...(u.role === 'INSTRUCTOR' ? { instructorId: u.id } : {}) }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.teachingSession.findMany({
        where,
        include: includeCalendar,
        orderBy: [{ startsAt: 'asc' }, { revision: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.teachingSession.count({ where }),
    ]);
    return {
      data: await Promise.all(
        rows.map(async (s) =>
          u.role === 'ACADEMIC_MANAGER'
            ? { ...s, sourceTemplateStatus: await this.templateStatus(s) }
            : {
                id: s.id,
                classOfferingId: s.classOfferingId,
                occurrenceId: s.occurrenceId,
                revision: s.revision,
                state: s.state,
                startsAt: s.startsAt,
                endsAt: s.endsAt,
                timezone: s.timezone,
                modality: s.modality,
                classOffering: s.classOffering,
                room: s.room,
                instructor: s.instructor,
              },
        ),
      ),
      meta: { total, page: q.page, limit: q.limit },
      notificationDelivery: 'INTENT_ONLY',
    };
  }
  async detail(u: PublicUser, id: string) {
    const r = await this.prisma.teachingSession.findFirst({
      where: { id, classOffering: await this.classReadScope(this.prisma, u) },
      include: includeCalendar,
    });
    if (!r) throw new NotFoundException();
    const history = await this.prisma.teachingSession.findMany({
      where: { occurrenceId: r.occurrenceId },
      orderBy: { revision: 'asc' },
    });
    return {
      ...r,
      history,
      sourceTemplateStatus: await this.templateStatus(r),
      warnings: r.intent === 'CANCEL' ? [] : await this.warnings(r),
      canApprove:
        r.state === 'PENDING_APPROVAL' &&
        (await this.authority.permits(u.id, scheduleCap, { type: 'CLASS', id: r.classOfferingId })),
    };
  }
  async approvals(u: PublicUser) {
    const classes = await this.classReadScope(this.prisma, u),
      courseIds = await this.scopes(this.prisma, u.id, programCap);
    const [sessions, assignments, versions] = await this.prisma.$transaction([
      this.prisma.teachingSession.findMany({
        where: { state: 'PENDING_APPROVAL', classOffering: classes },
        include: includeCalendar,
        orderBy: { submittedAt: 'asc' },
        take: 100,
      }),
      this.prisma.classInstructorAssignment.findMany({
        where: { state: 'PENDING_APPROVAL', classOffering: classes },
        include: {
          classOffering: { select: { id: true, code: true, name: true } },
          instructor: { select: { id: true, fullName: true } },
        },
        orderBy: { submittedAt: 'asc' },
        take: 100,
      }),
      this.prisma.courseVersion.findMany({
        where: {
          state: 'PENDING_APPROVAL',
          course: { OR: [{ createdById: u.id }, { id: { in: courseIds } }] },
        },
        orderBy: { submittedAt: 'asc' },
        take: 100,
      }),
    ]);
    return {
      sessions: await Promise.all(
        sessions.map(async (s) => ({ ...s, sourceTemplateStatus: await this.templateStatus(s) })),
      ),
      assignments,
      versions,
      limitPerKind: 100,
    };
  }
}
