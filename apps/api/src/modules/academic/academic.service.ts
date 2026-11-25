import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthorizationService, type AuthorityActor } from '../authorization/authorization.service';
import type { PublicUser } from '../users/user.types';
import { slugify } from '../courses/courses.service';
import {
  parseWallClockTime,
  projectScheduleSlot,
  projectWallClockTime,
  scheduleRangesOverlap,
} from '../classes/class-operations';
import {
  AcademicQueryDto,
  DraftClassDto,
  DraftProgramDto,
  DraftSlotDto,
  GenerateRoadmapDto,
  PublishToggleDto,
  RemoveDraftSlotDto,
  SaveCourseCurriculumDto,
  SaveRoadmapDto,
  SetupClassDto,
  UpdateDraftClassDto,
  UpdateDraftProgramDto,
} from './academic.dto';
import { randomUUID } from 'node:crypto';
import { assignmentProjection, effectiveInstructorScope } from '../authorization/instructor-scope';
type Tx = Prisma.TransactionClient;
const MINUTES_PER_PERIOD = 45;
const programSelect = {
  id: true,
  title: true,
  slug: true,
  description: true,
  level: true,
  skillScope: true,
  defaultDurationWeeks: true,
  defaultSessionsCount: true,
  defaultPeriodsPerSession: true,
  defaultPricingType: true,
  defaultTuitionFeeVnd: true,
  isPublished: true,
  createdById: true,
  updatedAt: true,
  _count: { select: { classOfferings: true } },
  classOfferings: {
    where: { OR: [{ status: { not: 'DRAFT' as const } }, { enrollments: { some: {} } }] },
    select: { id: true },
    take: 1,
  },
  modules: {
    orderBy: { orderIndex: 'asc' as const },
    select: {
      id: true,
      title: true,
      description: true,
      orderIndex: true,
      _count: { select: { lessons: true } },
      lessons: {
        orderBy: { orderIndex: 'asc' as const },
        select: {
          id: true,
          title: true,
          description: true,
          orderIndex: true,
          estimatedMinutes: true,
        },
      },
    },
  },
} satisfies Prisma.CourseSelect;
const classSelect = {
  id: true,
  versionId: true,
  courseId: true,
  code: true,
  name: true,
  status: true,
  modality: true,
  maxStudents: true,
  pricingType: true,
  tuitionFeeVnd: true,
  totalSessions: true,
  totalPeriods: true,
  periodsPerSession: true,
  durationWeeks: true,
  defaultRoomId: true,
  classStart: true,
  classEnd: true,
  updatedAt: true,
  course: { select: { id: true, title: true, isPublished: true, createdById: true } },
  instructor: { select: { id: true, fullName: true } },
  defaultRoom: {
    select: { id: true, code: true, name: true, location: true, capacity: true, status: true },
  },
  scheduleSlots: {
    orderBy: [{ dayOfWeek: 'asc' as const }, { startTime: 'asc' as const }],
    select: {
      id: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      roomId: true,
      locationText: true,
      meetingUrl: true,
      room: { select: { id: true, code: true, name: true, location: true, capacity: true } },
    },
  },
  _count: { select: { enrollments: { where: { status: 'ACTIVE' as const } } } },
} satisfies Prisma.ClassOfferingSelect;
@Injectable()
export class AcademicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authority: AuthorizationService,
  ) {}
  private scope(
    user: PublicUser,
    current: Prisma.ClassInstructorAssignmentWhereInput,
  ): Prisma.ClassOfferingWhereInput {
    if (user.role === 'ACADEMIC_MANAGER')
      return {};
    if (user.role === 'INSTRUCTOR') return effectiveInstructorScope(user.id, current);
    if (user.role === 'STUDENT')
      return { enrollments: { some: { learnerId: user.id, status: { in: ['ACTIVE', 'COMPLETED'] } } } };
    throw new ForbiddenException('Academic role required');
  }
  private async effectiveNow() {
    const [clock] = await this.prisma.$queryRaw<
      { ms: number }[]
    >`SELECT (EXTRACT(EPOCH FROM clock_timestamp())*1000)::double precision AS ms`;
    const now = new Date(clock.ms);
    return {
      state: { in: ['PUBLISHED', 'SUPERSEDED'] },
      effectiveFrom: { lte: now },
      reservedUntil: { gt: now },
    } satisfies Prisma.ClassInstructorAssignmentWhereInput;
  }
  private async effectiveInstructors(
    ids: string[],
    current: Prisma.ClassInstructorAssignmentWhereInput,
  ) {
    return assignmentProjection(this.prisma, ids, current);
  }
  async programs(user: PublicUser, q: AcademicQueryDto) {
    const where: Prisma.CourseWhereInput = {
      AND: [
        ...(q.search
          ? [
              {
                OR: [
                  { title: { contains: q.search, mode: 'insensitive' as const } },
                  { level: { contains: q.search, mode: 'insensitive' as const } },
                ],
              },
            ]
          : []),
      ],
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        select: programSelect,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.course.count({ where }),
    ]);
    return {
      data: data.map(({ classOfferings, ...p }) => ({
        ...p,
        editable: p.createdById === user.id && !p.isPublished && classOfferings.length === 0,
      })),
      meta: { total, page: q.page, limit: q.limit },
    };
  }
  async program(user: PublicUser, id: string) {
    const p = await this.prisma.course.findFirst({
      where: { id },
      select: programSelect,
    });
    if (!p) throw new NotFoundException('Program not found');
    const blocked = await this.prisma.classOffering.count({
      where: { courseId: id, OR: [{ status: { not: 'DRAFT' } }, { enrollments: { some: {} } }] },
    });
    const { classOfferings, ...projection } = p;
    void classOfferings;
    return {
      ...projection,
      editable: p.createdById === user.id && !p.isPublished && !blocked,
      minutesPerPeriod: MINUTES_PER_PERIOD,
      policyGate:
        'Học vụ có thể thiết lập khung chương trình, lớp học, phòng học và công bố trực tiếp lên Catalog',
    };
  }
  async classes(user: PublicUser, q: AcademicQueryDto) {
    const current = await this.effectiveNow();
    const where: Prisma.ClassOfferingWhereInput = {
      AND: [
        this.scope(user, current),
        ...(q.courseId ? [{ courseId: q.courseId }] : []),
        ...(q.status ? [{ status: q.status }] : []),
        ...(q.search
          ? [
              {
                OR: [
                  { name: { contains: q.search, mode: 'insensitive' as const } },
                  { code: { contains: q.search, mode: 'insensitive' as const } },
                ],
              },
            ]
          : []),
      ],
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.classOffering.findMany({
        where,
        select: classSelect,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.classOffering.count({ where }),
    ]);
    const effective = await this.effectiveInstructors(
      data.map((c) => c.id),
      current,
    );
    return {
      data: data.map((c) => ({
        ...c,
        instructor:
          effective.current.get(c.id) ?? (effective.managed.has(c.id) ? null : c.instructor),
        assignmentProvenance: effective.current.has(c.id)
          ? 'EFFECTIVE_APPROVED'
          : effective.managed.has(c.id)
            ? 'V2_NO_CURRENT_ASSIGNMENT'
            : 'LEGACY_UNKNOWN',
        course:
          user.role === 'ACADEMIC_MANAGER'
            ? c.course
            : { id: c.course.id, title: c.course.title, isPublished: c.course.isPublished },
        scheduleSlots: c.scheduleSlots.map(projectScheduleSlot),
        activeLearnerCount: c._count.enrollments,
      })),
      meta: { total, page: q.page, limit: q.limit },
    };
  }
  async classroom(user: PublicUser, id: string) {
    const current = await this.effectiveNow();
    const c = await this.prisma.classOffering.findFirst({
      where: { AND: [{ id }, this.scope(user, current)] },
      select: classSelect,
    });
    if (!c) throw new NotFoundException('Class not found');
    const effective = await this.effectiveInstructors([id], current);
    const enrolled = await this.prisma.enrollment.count({ where: { classOfferingId: id } });
    const [roadmapItems, lmsSectionsCount] = await Promise.all([
      this.prisma.classRoadmapItem?.findMany
        ? this.prisma.classRoadmapItem.findMany({
            where: { classOfferingId: id },
            orderBy: [{ orderIndex: 'asc' }, { sessionNumber: 'asc' }],
            include: {
              room: { select: { id: true, code: true, name: true, location: true } },
            },
          })
        : Promise.resolve([]),
      this.prisma.classSection?.count
        ? this.prisma.classSection.count({ where: { classOfferingId: id } })
        : Promise.resolve(0),
    ]);
    return {
      ...c,
      instructor:
        effective.current.get(c.id) ?? (effective.managed.has(c.id) ? null : c.instructor),
      assignmentProvenance: effective.current.has(c.id)
        ? 'EFFECTIVE_APPROVED'
        : effective.managed.has(c.id)
          ? 'V2_NO_CURRENT_ASSIGNMENT'
          : 'LEGACY_UNKNOWN',
      course:
        user.role === 'ACADEMIC_MANAGER'
          ? c.course
          : { id: c.course.id, title: c.course.title, isPublished: c.course.isPublished },
      scheduleSlots: c.scheduleSlots.map(projectScheduleSlot),
      roadmapItems: roadmapItems.map((item) => ({
        ...item,
        sessionDate: item.sessionDate.toISOString().slice(0, 10),
      })),
      lmsSectionsCount,
      minutesPerPeriod: MINUTES_PER_PERIOD,
      activeLearnerCount: c._count.enrollments,
      editable:
        user.role === 'ACADEMIC_MANAGER' &&
        c.course.createdById === user.id &&
        c.status === 'DRAFT' &&
        c.versionId === null &&
        enrolled === 0,
      scheduleKind: 'WEEKLY_TEMPLATE_NOT_OFFICIAL',
      timezone: 'Asia/Ho_Chi_Minh',
    };
  }
  async roster(user: PublicUser, id: string, q: AcademicQueryDto) {
    await this.classroom(user, id);
    const where: Prisma.EnrollmentWhereInput = {
      classOfferingId: id,
      ...(user.role === 'STUDENT'
        ? { learnerId: user.id, status: 'ACTIVE' }
        : user.role === 'INSTRUCTOR'
          ? { status: 'ACTIVE' }
          : q.enrollmentStatus
            ? { status: q.enrollmentStatus }
            : {}),
      ...(q.search ? { learner: { fullName: { contains: q.search, mode: 'insensitive' } } } : {}),
    };
    const [rows, total, counts] = await this.prisma.$transaction([
      this.prisma.enrollment.findMany({
        where,
        select: {
          id: true,
          status: true,
          enrolledAt: true,
          ...(user.role !== 'STUDENT' ? { learner: { select: { id: true, fullName: true } } } : {}),
        },
        orderBy: [{ enrolledAt: 'asc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.enrollment.count({ where }),
      this.prisma.enrollment.groupBy({
        by: ['status'],
        orderBy: { status: 'asc' },
        where: {
          classOfferingId: id,
          ...(user.role === 'STUDENT'
            ? { learnerId: user.id, status: 'ACTIVE' }
            : user.role === 'INSTRUCTOR'
              ? { status: 'ACTIVE' }
              : {}),
        },
        _count: { id: true },
      }),
    ]);
    const statusCounts = counts as Array<{ status: string; _count: { id: number } }>;
    return {
      data: rows,
      meta: { total, page: q.page, limit: q.limit },
      summary: Object.fromEntries(statusCounts.map((c) => [c.status, c._count.id])),
      admissionWritesAllowed: false,
    };
  }
  private async write<T>(
    actor: AuthorityActor,
    action: string,
    id: string,
    reason: string,
    work: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    for (let n = 0; n < 3; n++)
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
            await this.authority.requireActor(tx, actor, 'class.read');
            const user = await tx.user.findUnique({
              where: { id: actor.id },
              select: { role: true },
            });
            if (user?.role !== 'ACADEMIC_MANAGER')
              throw new ForbiddenException('Academic manager required');
            if (typeof this.authority.academicProfile === 'function') {
              const profile = await this.authority.academicProfile(actor.id, 'ACADEMIC_MANAGER', tx);
              if (profile.academicTrack === 'STUDENT_AFFAIRS') {
                throw new ForbiddenException('Chức năng này thuộc phạm vi Quản lý Đào tạo');
              }
            }
            const result = await work(tx);
            const objectId =
              id === 'NEW' && result && typeof result === 'object' && 'id' in result
                ? String(result.id)
                : id;
            await this.authority.audit(tx, actor.id, action, 'ACADEMIC', objectId, reason);
            return result;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            maxWait: 10000,
            timeout: 15000,
          },
        );
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034' && n < 2)
          continue;
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
          throw new ConflictException('Program slug or class code already exists');
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034')
          throw new ConflictException('Concurrent change; reload and retry');
        throw e;
      }
    throw new ConflictException('Retry required');
  }
  private async version(tx: Tx, expected: string, current: Date) {
    if (new Date(expected).getTime() !== current.getTime())
      throw new ConflictException({
        code: 'STALE_ACADEMIC_EDIT',
        message: 'Dữ liệu đã thay đổi. Hãy tải lại trước khi lưu.',
      });
    const [clock] = await tx.$queryRaw<
      { ms: number }[]
    >`SELECT (EXTRACT(EPOCH FROM clock_timestamp())*1000)::double precision AS ms`;
    return new Date(Math.max(clock.ms, current.getTime() + 1));
  }
  private async ownProgram(tx: Tx, actor: AuthorityActor, id: string) {
    const p = await tx.course.findUnique({ where: { id } });
    if (!p || p.createdById !== actor.id) throw new NotFoundException('Owned program not found');
    return p;
  }
  private async draft(tx: Tx, actor: AuthorityActor, id: string) {
    await tx.$queryRaw`SELECT id FROM class_offerings WHERE id=${id}::uuid FOR UPDATE`;
    const c = await tx.classOffering.findUnique({
      where: { id },
      include: { course: { select: { createdById: true } } },
    });
    if (!c || c.course.createdById !== actor.id)
      throw new NotFoundException('Owned class not found');
    if (c.status !== 'DRAFT' || (await tx.enrollment.count({ where: { classOfferingId: id } })))
      throw new ConflictException({
        code: 'W02_POLICY_GATE',
        message:
          'Chỉ sửa lớp nháp chưa có ghi danh; thay đổi lớp vận hành chờ chính sách W02B/W07.',
      });
    if (c.versionId) throw new ConflictException('Approved offer terms are immutable');
    return c;
  }
  createProgram(actor: AuthorityActor, input: DraftProgramDto) {
    return this.write(actor, 'W02_PROGRAM_CREATE', 'NEW', input.reason, async (tx) => {
      const p = await tx.course.create({
        data: {
          title: input.title,
          description: input.description,
          level: input.level,
          skillScope: input.skillScope,
          defaultDurationWeeks: input.defaultDurationWeeks ?? null,
          defaultSessionsCount: input.defaultSessionsCount ?? null,
          defaultPeriodsPerSession: input.defaultPeriodsPerSession ?? null,
          defaultPricingType: input.defaultPricingType ?? null,
          defaultTuitionFeeVnd: input.defaultTuitionFeeVnd ?? null,
          slug: (slugify(input.title) || 'program') + '-' + randomUUID().slice(0, 8),
          createdById: actor.id,
          isPublished: false,
        },
        select: programSelect,
      });
      return p;
    });
  }
  updateProgram(actor: AuthorityActor, id: string, input: UpdateDraftProgramDto) {
    return this.write(actor, 'W02_PROGRAM_UPDATE', id, input.reason, async (tx) => {
      await tx.$queryRaw`SELECT id FROM courses WHERE id=${id}::uuid FOR UPDATE`;
      const p = await this.ownProgram(tx, actor, id);
      if (
        p.isPublished ||
        (await tx.classOffering.count({
          where: {
            courseId: id,
            OR: [{ status: { not: 'DRAFT' } }, { enrollments: { some: {} } }],
          },
        }))
      )
        throw new ConflictException(
          'Published/historical program standards are read-only pending OD03',
        );
      const updatedAt = await this.version(tx, input.expectedUpdatedAt, p.updatedAt);
      return tx.course.update({
        where: { id },
        data: {
          title: input.title,
          description: input.description,
          level: input.level,
          skillScope: input.skillScope,
          ...(input.defaultDurationWeeks !== undefined
            ? { defaultDurationWeeks: input.defaultDurationWeeks }
            : {}),
          ...(input.defaultSessionsCount !== undefined
            ? { defaultSessionsCount: input.defaultSessionsCount }
            : {}),
          ...(input.defaultPeriodsPerSession !== undefined
            ? { defaultPeriodsPerSession: input.defaultPeriodsPerSession }
            : {}),
          ...(input.defaultPricingType !== undefined
            ? { defaultPricingType: input.defaultPricingType }
            : {}),
          ...(input.defaultTuitionFeeVnd !== undefined
            ? { defaultTuitionFeeVnd: input.defaultTuitionFeeVnd }
            : {}),
          updatedAt,
        },
        select: programSelect,
      });
    });
  }
  private prices(input: { pricingType?: string; tuitionFeeVnd?: number }) {
    if (input.pricingType === undefined || input.tuitionFeeVnd === undefined) return;
    if (
      (input.pricingType === 'FREE' && input.tuitionFeeVnd !== 0) ||
      (input.pricingType === 'PAID' && input.tuitionFeeVnd <= 0)
    )
      throw new BadRequestException('Draft tuition must match pricing type');
  }
  createClass(actor: AuthorityActor, input: DraftClassDto) {
    return this.write(actor, 'W02_CLASS_CREATE', 'NEW', input.reason, async (tx) => {
      const course = await tx.course.findUnique({ where: { id: input.courseId } });
      if (!course) throw new NotFoundException('Course not found');
      this.prices(input);
      const totalSessions = input.totalSessions ?? course.defaultSessionsCount ?? null;
      const periodsPerSession = input.periodsPerSession ?? course.defaultPeriodsPerSession ?? null;
      const totalPeriods =
        totalSessions && periodsPerSession ? totalSessions * periodsPerSession : null;
      const created = await tx.classOffering.create({
        data: {
          courseId: input.courseId,
          code: input.code,
          name: input.name,
          modality: input.modality,
          maxStudents: input.maxStudents,
          pricingType: input.pricingType,
          tuitionFeeVnd: input.tuitionFeeVnd,
          classStart: input.classStart ? new Date(input.classStart) : null,
          classEnd: input.classEnd ? new Date(input.classEnd) : null,
          totalSessions,
          periodsPerSession,
          totalPeriods,
          durationWeeks: input.durationWeeks ?? course.defaultDurationWeeks ?? null,
          defaultRoomId: input.defaultRoomId ?? null,
          instructorId: input.instructorId ?? null,
          status: 'DRAFT',
        },
        select: classSelect,
      });
      if (input.instructorId) {
        await this.syncClassInstructorAssignment(
          tx,
          actor.id,
          created.id,
          input.instructorId,
          created.classStart,
          created.classEnd,
          input.reason,
        );
      }
      if (input.autoInitSections) {
        await this.ensureLmsSectionsFromCourse(tx, actor.id, created.id, input.courseId);
      }
      return created;
    });
  }
  updateClass(actor: AuthorityActor, id: string, input: UpdateDraftClassDto) {
    return this.write(actor, 'W02_CLASS_UPDATE', id, input.reason, async (tx) => {
      const c = await this.draft(tx, actor, id);
      this.prices(input);
      if (c.courseId !== input.courseId)
        throw new ConflictException('Changing program requires a reviewed transfer/version policy');
      const updatedAt = await this.version(tx, input.expectedUpdatedAt, c.updatedAt);
      const totalSessions = input.totalSessions ?? c.totalSessions;
      const periodsPerSession = input.periodsPerSession ?? c.periodsPerSession;
      const totalPeriods =
        totalSessions && periodsPerSession ? totalSessions * periodsPerSession : c.totalPeriods;
      return tx.classOffering.update({
        where: { id },
        data: {
          name: input.name,
          code: input.code,
          modality: input.modality,
          maxStudents: input.maxStudents,
          pricingType: input.pricingType,
          tuitionFeeVnd: input.tuitionFeeVnd,
          ...(input.classStart !== undefined
            ? { classStart: input.classStart ? new Date(input.classStart) : null }
            : {}),
          ...(input.classEnd !== undefined
            ? { classEnd: input.classEnd ? new Date(input.classEnd) : null }
            : {}),
          ...(totalSessions !== null ? { totalSessions } : {}),
          ...(periodsPerSession !== null ? { periodsPerSession } : {}),
          ...(totalPeriods !== null ? { totalPeriods } : {}),
          ...(input.durationWeeks !== undefined ? { durationWeeks: input.durationWeeks } : {}),
          ...(input.defaultRoomId !== undefined ? { defaultRoomId: input.defaultRoomId } : {}),
          updatedAt,
        },
        select: classSelect,
      });
    });
  }
  saveSlot(actor: AuthorityActor, id: string, input: DraftSlotDto, slotId?: string) {
    return this.write(actor, 'W02_WEEKLY_TEMPLATE_SAVE', id, input.reason, async (tx) => {
      const c = await this.draft(tx, actor, id);
      const updatedAt = await this.version(tx, input.expectedUpdatedAt, c.updatedAt);
      if (
        slotId &&
        !(await tx.classScheduleSlot.findFirst({ where: { id: slotId, classOfferingId: id } }))
      )
        throw new NotFoundException('Class schedule slot not found');
      const startTime = parseWallClockTime(input.startTime)!,
        endTime = parseWallClockTime(input.endTime)!;
      if (startTime >= endTime)
        throw new BadRequestException('End time must follow start time on the same day');
      const siblings = await tx.classScheduleSlot.findMany({
        where: {
          classOfferingId: id,
          dayOfWeek: input.dayOfWeek,
          ...(slotId ? { id: { not: slotId } } : {}),
        },
      });
      if (siblings.some((s) => scheduleRangesOverlap(startTime, endTime, s.startTime, s.endTime)))
        throw new ConflictException('Weekly template overlaps another slot in this class');
      let locationText = input.locationText.trim() || null;
      if (input.roomId && !locationText) {
        const room = await tx.room.findUnique({ where: { id: input.roomId } });
        if (room) locationText = `${room.code} — ${room.name} (${room.location})`;
      }
      const data = {
        dayOfWeek: input.dayOfWeek,
        startTime,
        endTime,
        roomId: input.roomId ?? null,
        locationText,
        meetingUrl: input.meetingUrl?.trim() || null,
      };
      const slot = slotId
        ? await tx.classScheduleSlot.update({
            where: { id: slotId },
            data,
            include: { room: { select: { id: true, code: true, name: true, location: true, capacity: true } } },
          })
        : await tx.classScheduleSlot.create({
            data: { ...data, classOfferingId: id },
            include: { room: { select: { id: true, code: true, name: true, location: true, capacity: true } } },
          });
      await tx.classOffering.update({ where: { id }, data: { updatedAt } });
      return {
        slot: projectScheduleSlot({
          id: slot.id,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          roomId: slot.roomId,
          room: slot.room,
          locationText: slot.locationText,
          meetingUrl: slot.meetingUrl,
        }),
        updatedAt,
        kind: 'WEEKLY_TEMPLATE_NOT_OFFICIAL',
      };
    });
  }
  removeSlot(actor: AuthorityActor, id: string, slotId: string, input: RemoveDraftSlotDto) {
    return this.write(actor, 'W02_WEEKLY_TEMPLATE_REMOVE', id, input.reason, async (tx) => {
      const c = await this.draft(tx, actor, id),
        updatedAt = await this.version(tx, input.expectedUpdatedAt, c.updatedAt);
      const slot = await tx.classScheduleSlot.findFirst({
        where: { id: slotId, classOfferingId: id },
      });
      if (!slot) throw new NotFoundException('Class schedule slot not found');
      if (await tx.teachingSession.count({ where: { sourceTemplateId: slotId } }))
        throw new ConflictException('Weekly template has dated provenance; retain it for history');
      await tx.classScheduleSlot.delete({ where: { id: slotId } });
      await tx.classOffering.update({ where: { id }, data: { updatedAt } });
      return { removed: true, updatedAt };
    });
  }

  private async ensureLmsSectionsFromCourse(
    tx: Tx,
    actorId: string,
    classOfferingId: string,
    courseId: string,
  ) {
    const [modules, existing] = await Promise.all([
      tx.module.findMany({
        where: { courseId },
        orderBy: { orderIndex: 'asc' },
        include: {
          lessons: { orderBy: { orderIndex: 'asc' }, select: { title: true } },
        },
      }),
      tx.classSection.findMany({
        where: { classOfferingId },
        orderBy: { orderIndex: 'asc' },
        select: { id: true, title: true, orderIndex: true },
      }),
    ]);
    if (modules.length === 0) return { createdCount: 0, totalSections: existing.length };
    if (typeof (tx as any).$executeRawUnsafe === 'function') {
      await (tx as any).$executeRawUnsafe(
        `SELECT set_config('app.academic_lms_actor', $1, true)`,
        actorId,
      );
    }
    const existingTitles = new Set(existing.map((s) => s.title.trim().toLowerCase()));
    let nextOrder = existing.length ? Math.max(...existing.map((s) => s.orderIndex)) + 1 : 0;
    let createdCount = 0;
    for (const mod of modules) {
      if (existingTitles.has(mod.title.trim().toLowerCase())) continue;
      const lessonLines = mod.lessons.map((l, idx) => `${idx + 1}. ${l.title}`).join('\n');
      const introParts = [mod.description?.trim(), lessonLines ? `Nội dung bài học:\n${lessonLines}` : ''].filter(Boolean);
      const section = await tx.classSection.create({
        data: {
          classOfferingId,
          title: mod.title.slice(0, 250),
          introduction: introParts.join('\n\n'),
          orderIndex: nextOrder++,
          lockVersion: 0,
          revisionNumber: 0,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      const rev = await tx.classSectionRevision.create({
        data: {
          sectionId: section.id,
          number: 1,
          title: section.title,
          introduction: section.introduction,
          sourceLockVersion: 0,
          publishedById: actorId,
        },
      });
      await tx.classSection.update({
        where: { id: section.id },
        data: {
          publishedRevisionId: rev.id,
          revisionNumber: 1,
          lockVersion: 1,
          updatedById: actorId,
        },
      });
      createdCount += 1;
    }
    return { createdCount, totalSections: existing.length + createdCount };
  }

  private async syncClassInstructorAssignment(
    tx: Tx,
    actorId: string,
    classOfferingId: string,
    instructorId: string,
    classStart: Date | null,
    classEnd: Date | null,
    reason: string,
  ) {
    const instructor = await tx.user.findUnique({
      where: { id: instructorId },
      select: { id: true, role: true, status: true },
    });
    if (!instructor || instructor.role !== 'INSTRUCTOR' || instructor.status !== 'ACTIVE') {
      throw new BadRequestException('Giảng viên được phân công không hợp lệ hoặc đang khóa');
    }
    const now = new Date();
    const effectiveFrom = classStart && classStart < now ? classStart : now;
    const defaultEnd = new Date(effectiveFrom.getTime() + 180 * 24 * 60 * 60 * 1000);
    const effectiveTo = classEnd && classEnd > effectiveFrom ? classEnd : defaultEnd;
    const existing = await tx.classInstructorAssignment.findMany({
      where: { classOfferingId, state: 'PUBLISHED' },
      orderBy: { createdAt: 'desc' },
    });
    const currentSame = existing.find((a) => a.instructorId === instructorId);
    if (currentSame) {
      await tx.classInstructorAssignment.update({
        where: { id: currentSame.id },
        data: {
          effectiveFrom,
          effectiveTo,
          reservedUntil: effectiveTo,
        },
      });
      return currentSame.id;
    }
    if (existing.length > 0) {
      await tx.classInstructorAssignment.updateMany({
        where: { id: { in: existing.map((a) => a.id) } },
        data: { state: 'SUPERSEDED', reservedUntil: now },
      });
    }
    const created = await tx.classInstructorAssignment.create({
      data: {
        classOfferingId,
        instructorId,
        effectiveFrom,
        effectiveTo,
        reservedUntil: effectiveTo,
        state: 'PUBLISHED',
        proposedBy: actorId,
        approvedBy: actorId,
        eligibilityConfirmed: true,
        reason: reason.slice(0, 500) || 'Học vụ phân công giảng viên phụ trách lớp',
        submittedAt: now,
        approvedAt: now,
      },
    });
    return created.id;
  }

  saveCurriculum(actor: AuthorityActor, id: string, input: SaveCourseCurriculumDto) {
    const reason = input.reason?.trim() || 'Học vụ cập nhật khung chương trình chuẩn của khóa học';
    return this.write(actor, 'A1_COURSE_CURRICULUM_SAVE', id, reason, async (tx) => {
      const course = await tx.course.findUnique({ where: { id } });
      if (!course) throw new NotFoundException('Course not found');
      const existingModules = await tx.module.findMany({
        where: { courseId: id },
        orderBy: { orderIndex: 'asc' },
        include: { lessons: { orderBy: { orderIndex: 'asc' } } },
      });
      const existingMap = new Map(existingModules.map((m) => [m.id, m]));
      const keptIds = new Set(
        input.modules.map((m) => m.id).filter((mid): mid is string => Boolean(mid && existingMap.has(mid))),
      );
      const removedModules = existingModules.filter((m) => !keptIds.has(m.id));
      for (const rem of removedModules) {
        const lessonIds = rem.lessons.map((l) => l.id);
        if (lessonIds.length > 0) {
          const [resCount, progCount, testCount, actCount] = await Promise.all([
            tx.learningResource.count({ where: { lessonId: { in: lessonIds } } }),
            tx.lessonProgress.count({ where: { lessonId: { in: lessonIds } } }),
            tx.test.count({ where: { lessonId: { in: lessonIds } } }),
            tx.classActivity.count({ where: { sourceLessonId: { in: lessonIds } } }),
          ]);
          if (resCount + progCount + testCount + actCount > 0) {
            throw new ConflictException(
              `Không thể xóa học phần "${rem.title}" vì đã gắn tài liệu/bài kiểm tra/tiến độ học viên`,
            );
          }
          await tx.lesson.deleteMany({ where: { id: { in: lessonIds } } });
        }
        await tx.module.delete({ where: { id: rem.id } });
      }
      // Shift orderIndex on surviving modules to avoid unique constraint collisions
      for (let i = 0; i < existingModules.length; i++) {
        const mod = existingModules[i];
        if (!keptIds.has(mod.id)) continue;
        await tx.module.update({ where: { id: mod.id }, data: { orderIndex: 10000 + i } });
      }
      for (let mi = 0; mi < input.modules.length; mi++) {
        const modInput = input.modules[mi];
        const existingMod = modInput.id ? existingMap.get(modInput.id) : undefined;
        if (existingMod) {
          await tx.module.update({
            where: { id: existingMod.id },
            data: {
              title: modInput.title.trim(),
              description: modInput.description?.trim() || null,
              orderIndex: mi,
            },
          });
          // Shift existing lessons to avoid orderIndex collision
          for (let li = 0; li < existingMod.lessons.length; li++) {
            await tx.lesson.update({
              where: { id: existingMod.lessons[li].id },
              data: { orderIndex: 10000 + li },
            });
          }
          for (let li = 0; li < modInput.lessons.length; li++) {
            const lessonInput = modInput.lessons[li];
            const targetLesson = existingMod.lessons[li];
            if (targetLesson) {
              await tx.lesson.update({
                where: { id: targetLesson.id },
                data: {
                  title: lessonInput.title.trim(),
                  description: lessonInput.description?.trim() || null,
                  estimatedMinutes: lessonInput.estimatedMinutes ?? null,
                  orderIndex: li,
                },
              });
            } else {
              await tx.lesson.create({
                data: {
                  moduleId: existingMod.id,
                  title: lessonInput.title.trim(),
                  description: lessonInput.description?.trim() || null,
                  estimatedMinutes: lessonInput.estimatedMinutes ?? null,
                  orderIndex: li,
                },
              });
            }
          }
          const extraLessons = existingMod.lessons.slice(modInput.lessons.length);
          for (const extra of extraLessons) {
            const [resCount, progCount, testCount, actCount] = await Promise.all([
              tx.learningResource.count({ where: { lessonId: extra.id } }),
              tx.lessonProgress.count({ where: { lessonId: extra.id } }),
              tx.test.count({ where: { lessonId: extra.id } }),
              tx.classActivity.count({ where: { sourceLessonId: extra.id } }),
            ]);
            if (resCount + progCount + testCount + actCount === 0) {
              await tx.lesson.delete({ where: { id: extra.id } });
            } else {
              await tx.lesson.update({
                where: { id: extra.id },
                data: { orderIndex: modInput.lessons.length + extraLessons.indexOf(extra) },
              });
            }
          }
        } else {
          const createdMod = await tx.module.create({
            data: {
              courseId: id,
              title: modInput.title.trim(),
              description: modInput.description?.trim() || null,
              orderIndex: mi,
            },
          });
          for (let li = 0; li < modInput.lessons.length; li++) {
            const lessonInput = modInput.lessons[li];
            await tx.lesson.create({
              data: {
                moduleId: createdMod.id,
                title: lessonInput.title.trim(),
                description: lessonInput.description?.trim() || null,
                estimatedMinutes: lessonInput.estimatedMinutes ?? null,
                orderIndex: li,
              },
            });
          }
        }
      }
      return tx.course.findUniqueOrThrow({ where: { id }, select: programSelect });
    });
  }

  publishProgram(actor: AuthorityActor, id: string, input: PublishToggleDto) {
    const reason =
      input.reason?.trim() ||
      (input.isPublished
        ? 'Học vụ công bố khóa học trực tiếp lên Catalog'
        : 'Học vụ tạm ẩn khóa học khỏi Catalog');
    return this.write(actor, 'A1_COURSE_PUBLISH', id, reason, async (tx) => {
      const course = await tx.course.findUnique({ where: { id } });
      if (!course) throw new NotFoundException('Course not found');
      return tx.course.update({
        where: { id },
        data: { isPublished: input.isPublished },
        select: programSelect,
      });
    });
  }

  async setupClass(actor: AuthorityActor, user: PublicUser, id: string, input: SetupClassDto) {
    const reason = input.reason?.trim() || 'Học vụ thiết lập cấu hình, lịch tuần và phòng học lớp';
    await this.write(actor, 'A1_CLASS_SETUP', id, reason, async (tx) => {
      await tx.$queryRaw`SELECT id FROM class_offerings WHERE id=${id}::uuid FOR UPDATE`;
      const existing = await tx.classOffering.findUnique({
        where: { id },
        include: { scheduleSlots: true },
      });
      if (!existing) throw new NotFoundException('Class not found');
      const nextPricingType = input.pricingType ?? existing.pricingType;
      const nextFee = input.tuitionFeeVnd ?? existing.tuitionFeeVnd ?? 0;
      this.prices({ pricingType: nextPricingType, tuitionFeeVnd: nextFee });
      const nextClassStart =
        input.classStart !== undefined
          ? input.classStart
            ? new Date(input.classStart)
            : null
          : existing.classStart;
      const nextClassEnd =
        input.classEnd !== undefined
          ? input.classEnd
            ? new Date(input.classEnd)
            : null
          : existing.classEnd;
      const nextTotalSessions =
        input.totalSessions !== undefined ? input.totalSessions : existing.totalSessions;
      const nextPeriodsPerSession =
        input.periodsPerSession !== undefined
          ? input.periodsPerSession
          : existing.periodsPerSession;
      const nextTotalPeriods =
        nextTotalSessions && nextPeriodsPerSession
          ? nextTotalSessions * nextPeriodsPerSession
          : existing.totalPeriods;

      await tx.classOffering.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.code !== undefined ? { code: input.code } : {}),
          ...(input.modality !== undefined ? { modality: input.modality } : {}),
          ...(input.maxStudents !== undefined ? { maxStudents: input.maxStudents } : {}),
          ...(input.pricingType !== undefined ? { pricingType: input.pricingType } : {}),
          ...(input.tuitionFeeVnd !== undefined ? { tuitionFeeVnd: input.tuitionFeeVnd } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          classStart: nextClassStart,
          classEnd: nextClassEnd,
          totalSessions: nextTotalSessions,
          periodsPerSession: nextPeriodsPerSession,
          totalPeriods: nextTotalPeriods,
          ...(input.durationWeeks !== undefined ? { durationWeeks: input.durationWeeks } : {}),
          ...(input.defaultRoomId !== undefined ? { defaultRoomId: input.defaultRoomId } : {}),
          ...(input.instructorId !== undefined ? { instructorId: input.instructorId } : {}),
        },
      });

      if (input.instructorId) {
        await this.syncClassInstructorAssignment(
          tx,
          actor.id,
          id,
          input.instructorId,
          nextClassStart,
          nextClassEnd,
          reason,
        );
      }

      if (input.slots !== undefined) {
        const roomIds = Array.from(
          new Set(
            [
              ...input.slots.map((s) => s.roomId).filter((r): r is string => Boolean(r)),
              ...(input.defaultRoomId ? [input.defaultRoomId] : []),
            ],
          ),
        );
        const rooms = roomIds.length
          ? await tx.room.findMany({ where: { id: { in: roomIds } } })
          : [];
        const roomMap = new Map(rooms.map((r) => [r.id, r]));

        // Validate intra-class weekly slot overlaps
        const parsedSlots = input.slots.map((s) => {
          const st = parseWallClockTime(s.startTime);
          const et = parseWallClockTime(s.endTime);
          if (!st || !et || st >= et) {
            throw new BadRequestException(
              `Khung giờ học thứ ${s.dayOfWeek} không hợp lệ (${s.startTime} - ${s.endTime})`,
            );
          }
          const effectiveRoomId = s.roomId ?? input.defaultRoomId ?? null;
          const room = effectiveRoomId ? roomMap.get(effectiveRoomId) : undefined;
          const fallbackLoc = room ? `${room.code} — ${room.name} (${room.location})` : null;
          return {
            dayOfWeek: s.dayOfWeek,
            startTime: st,
            endTime: et,
            roomId: effectiveRoomId,
            locationText: s.locationText?.trim() || fallbackLoc,
            meetingUrl: s.meetingUrl?.trim() || null,
          };
        });
        for (let i = 0; i < parsedSlots.length; i++) {
          for (let j = i + 1; j < parsedSlots.length; j++) {
            if (
              parsedSlots[i].dayOfWeek === parsedSlots[j].dayOfWeek &&
              scheduleRangesOverlap(
                parsedSlots[i].startTime,
                parsedSlots[i].endTime,
                parsedSlots[j].startTime,
                parsedSlots[j].endTime,
              )
            ) {
              throw new ConflictException(
                `Hai ca học cùng thứ ${parsedSlots[i].dayOfWeek} bị trùng giờ`,
              );
            }
          }
        }

        const oldSlots = existing.scheduleSlots;
        const usedIds = new Set<string>();
        for (const next of parsedSlots) {
          const match = oldSlots.find(
            (o) =>
              !usedIds.has(o.id) &&
              o.dayOfWeek === next.dayOfWeek &&
              projectWallClockTime(o.startTime) === projectWallClockTime(next.startTime),
          );
          if (match) {
            usedIds.add(match.id);
            await tx.classScheduleSlot.update({
              where: { id: match.id },
              data: next,
            });
          } else {
            await tx.classScheduleSlot.create({
              data: { ...next, classOfferingId: id },
            });
          }
        }
        for (const leftover of oldSlots.filter((o) => !usedIds.has(o.id))) {
          const refCount = await tx.teachingSession.count({
            where: { sourceTemplateId: leftover.id },
          });
          if (refCount === 0) {
            await tx.classScheduleSlot.delete({ where: { id: leftover.id } });
          }
        }
      }

      if (input.syncLmsSections) {
        await this.ensureLmsSectionsFromCourse(tx, actor.id, id, existing.courseId);
      }
      return { id };
    });
    return this.classroom(user, id);
  }

  private toVietnamYmd(date: Date): string {
    const vnMs = date.getTime() + 7 * 60 * 60 * 1000;
    const d = new Date(vnMs);
    return d.toISOString().slice(0, 10);
  }

  private ymdToIsoWeekday(ymd: string): number {
    const [y, m, d] = ymd.split('-').map(Number);
    const utcDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return utcDay === 0 ? 7 : utcDay;
  }

  private addDaysYmd(ymd: string, days: number): string {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  }

  private vnWallClockToDate(ymd: string, hhmm: string): Date {
    return new Date(`${ymd}T${hhmm}:00+07:00`);
  }

  private buildRoadmapTeachingSessionData(params: {
    classOfferingId: string;
    startsAt: Date;
    endsAt: Date;
    modality: 'ONLINE' | 'OFFLINE' | 'HYBRID';
    roomId: string | null;
    instructorId: string | null;
    assignmentId: string | null;
    sourceTemplateId?: string | null;
    sessionNumber: number;
    actorId: string;
    reason: string;
    now: Date;
  }): Prisma.TeachingSessionUncheckedCreateInput {
    return {
      id: randomUUID(),
      occurrenceId: randomUUID(),
      revision: 1,
      requiredCapabilities: [],
      classOfferingId: params.classOfferingId,
      startsAt: params.startsAt,
      endsAt: params.endsAt,
      timezone: 'Asia/Ho_Chi_Minh',
      modality: params.modality,
      roomId: params.roomId,
      instructorId: params.instructorId,
      assignmentId: params.assignmentId,
      ...(params.sourceTemplateId !== undefined ? { sourceTemplateId: params.sourceTemplateId } : {}),
      generationKey: `roadmap-${params.classOfferingId}-${params.sessionNumber}-${randomUUID().slice(0, 8)}`,
      state: 'PUBLISHED',
      intent: 'PUBLISH',
      proposedBy: params.actorId,
      approvedBy: params.actorId,
      reason: params.reason,
      submittedAt: params.now,
      approvedAt: params.now,
    };
  }

  async generateRoadmap(
    actor: AuthorityActor,
    user: PublicUser,
    id: string,
    input: GenerateRoadmapDto,
  ) {
    const reason = input.reason?.trim() || 'Học vụ sinh bản đồ lộ trình chi tiết cho lớp học';
    await this.write(actor, 'A1_CLASS_ROADMAP_GENERATE', id, reason, async (tx) => {
      await tx.$queryRaw`SELECT id FROM class_offerings WHERE id=${id}::uuid FOR UPDATE`;
      const cls = await tx.classOffering.findUnique({
        where: { id },
        include: {
          course: {
            include: {
              modules: {
                orderBy: { orderIndex: 'asc' },
                include: { lessons: { orderBy: { orderIndex: 'asc' } } },
              },
            },
          },
          defaultRoom: true,
          scheduleSlots: {
            orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
            include: { room: true },
          },
        },
      });
      if (!cls) throw new NotFoundException('Class not found');
      const startDate = input.classStart ? new Date(input.classStart) : cls.classStart;
      if (!startDate) {
        throw new BadRequestException('Vui lòng chọn Ngày khai giảng trước khi sinh bản đồ lớp học');
      }
      if (cls.scheduleSlots.length === 0) {
        throw new BadRequestException(
          'Lớp chưa có lịch tuần cố định (Thứ + Giờ + Phòng/Link). Hãy lưu lịch học trước khi sinh bản đồ',
        );
      }
      const totalSessions =
        input.totalSessions ?? cls.totalSessions ?? cls.course.defaultSessionsCount ?? 24;
      const periodsPerSession =
        input.periodsPerSession ?? cls.periodsPerSession ?? cls.course.defaultPeriodsPerSession ?? 3;
      const defaultRoomId =
        input.defaultRoomId !== undefined ? input.defaultRoomId : cls.defaultRoomId;
      const defaultRoom = defaultRoomId
        ? await tx.room.findUnique({ where: { id: defaultRoomId } })
        : cls.defaultRoom;

      const startYmd = this.toVietnamYmd(startDate);
      const modules = cls.course.modules;
      const flatLessons = modules.flatMap((m, mi) =>
        m.lessons.length > 0
          ? m.lessons.map((l) => ({
              moduleId: m.id,
              moduleTitle: m.title,
              lessonTitle: l.title,
              moduleIndex: mi,
            }))
          : [{ moduleId: m.id, moduleTitle: m.title, lessonTitle: '', moduleIndex: mi }],
      );

      const generated: Array<{
        weekNumber: number;
        sessionNumber: number;
        sessionDate: string;
        startTime: string;
        endTime: string;
        periods: number;
        modality: 'ONLINE' | 'OFFLINE' | 'HYBRID';
        roomId: string | null;
        locationText: string | null;
        meetingUrl: string | null;
        topicTitle: string;
        contentSummary: string;
        sourceModuleId: string | null;
        sourceSlotId: string;
        orderIndex: number;
      }> = [];

      for (let dayOffset = 0; dayOffset < 730 && generated.length < totalSessions; dayOffset++) {
        const ymd = this.addDaysYmd(startYmd, dayOffset);
        const weekday = this.ymdToIsoWeekday(ymd);
        const daySlots = cls.scheduleSlots.filter((s) => s.dayOfWeek === weekday);
        for (const slot of daySlots) {
          if (generated.length >= totalSessions) break;
          const idx = generated.length;
          const sessionNumber = idx + 1;
          const weekNumber = Math.floor(dayOffset / 7) + 1;
          const startTime = projectWallClockTime(slot.startTime);
          const endTime = projectWallClockTime(slot.endTime);
          const startTimeObj = parseWallClockTime(startTime);
          const endTimeObj = parseWallClockTime(endTime);
          const slotDurationMins =
            startTimeObj !== null &&
            endTimeObj !== null &&
            endTimeObj.getTime() > startTimeObj.getTime()
              ? Math.round((endTimeObj.getTime() - startTimeObj.getTime()) / 60000)
              : 0;
          const itemPeriods =
            slotDurationMins >= 45 && slotDurationMins % 45 === 0
              ? slotDurationMins / 45
              : periodsPerSession;

          // Map ALL curriculum modules / lessons proportionally across 1..totalSessions (no truncation)
          let topicTitle = `Buổi ${sessionNumber} — Thực hành & Ôn tập`;
          let contentSummary = cls.name;
          let sourceModuleId: string | null = null;
          if (flatLessons.length > 0) {
            if (flatLessons.length >= totalSessions) {
              const startIdx = Math.floor((idx * flatLessons.length) / totalSessions);
              const endIdx = Math.max(
                startIdx + 1,
                Math.floor(((idx + 1) * flatLessons.length) / totalSessions),
              );
              const slice = flatLessons.slice(startIdx, endIdx);
              sourceModuleId = slice[0].moduleId;
              const distinctModules = Array.from(new Set(slice.map((item) => item.moduleTitle)));
              if (slice.length === 1) {
                topicTitle = slice[0].lessonTitle || slice[0].moduleTitle;
                contentSummary = slice[0].moduleTitle;
              } else if (distinctModules.length === 1) {
                topicTitle = distinctModules[0];
                contentSummary = slice
                  .map((item) => item.lessonTitle)
                  .filter(Boolean)
                  .join(' • ');
              } else {
                topicTitle = distinctModules.join(' & ');
                contentSummary = slice
                  .map((item) =>
                    item.lessonTitle ? `${item.moduleTitle}: ${item.lessonTitle}` : item.moduleTitle,
                  )
                  .join(' • ');
              }
            } else {
              const itemIdx = Math.min(
                flatLessons.length - 1,
                Math.floor((idx * flatLessons.length) / totalSessions),
              );
              const prevIdx =
                idx > 0
                  ? Math.min(
                      flatLessons.length - 1,
                      Math.floor(((idx - 1) * flatLessons.length) / totalSessions),
                    )
                  : -1;
              const item = flatLessons[itemIdx];
              sourceModuleId = item.moduleId;
              const baseTopic = item.lessonTitle || item.moduleTitle;
              topicTitle = itemIdx === prevIdx ? `Thực hành & Củng cố: ${baseTopic}` : baseTopic;
              contentSummary = item.moduleTitle;
            }
          }

          const slotRoom = slot.room ?? defaultRoom ?? null;
          const itemModality = cls.modality === 'ONLINE' ? 'ONLINE' : 'OFFLINE';
          const resolvedRoomId = itemModality === 'ONLINE' ? null : (slot.roomId ?? defaultRoom?.id ?? null);
          const resolvedLocation =
            slot.locationText?.trim() ||
            (slotRoom ? `${slotRoom.code} — ${slotRoom.name} (${slotRoom.location})` : null);

          generated.push({
            weekNumber,
            sessionNumber,
            sessionDate: ymd,
            startTime,
            endTime,
            periods: itemPeriods,
            modality: itemModality,
            roomId: resolvedRoomId,
            locationText: resolvedLocation,
            meetingUrl: slot.meetingUrl ?? null,
            topicTitle: topicTitle.slice(0, 300),
            contentSummary: contentSummary.slice(0, 1000),
            sourceModuleId,
            sourceSlotId: slot.id,
            orderIndex: idx,
          });
        }
      }

      if (generated.length === 0) {
        throw new BadRequestException('Không khớp được buổi học nào từ lịch tuần và ngày khai giảng');
      }

      await tx.classRoadmapItem.deleteMany({ where: { classOfferingId: id } });
      const latestAssign = cls.instructorId
        ? await tx.classInstructorAssignment.findFirst({
            where: { classOfferingId: id, state: 'PUBLISHED' },
            orderBy: { createdAt: 'desc' },
          })
        : null;

      if (input.syncTeachingSessions) {
        const oldSessions = await tx.teachingSession.findMany({
          where: { classOfferingId: id, generationKey: { startsWith: `roadmap-${id}-` } },
          select: { id: true },
        });
        const oldSessionIds = oldSessions.map((s) => s.id);
        if (oldSessionIds.length > 0) {
          const attCount = await tx.w06Window.count({
            where: { sessionId: { in: oldSessionIds } },
          });
          const extraRefCount =
            (tx.w06Exception?.count
              ? await tx.w06Exception.count({
                  where: {
                    OR: [
                      { sessionId: { in: oldSessionIds } },
                      { routedSessionId: { in: oldSessionIds } },
                    ],
                  },
                })
              : 0) +
            (tx.w06Meet?.count
              ? await tx.w06Meet.count({ where: { sessionId: { in: oldSessionIds } } })
              : 0);
          if (attCount === 0 && extraRefCount === 0) {
            if (tx.academicNotificationIntent?.deleteMany) {
              await tx.academicNotificationIntent.deleteMany({
                where: { sessionId: { in: oldSessionIds } },
              });
            }
            await tx.teachingSession.deleteMany({ where: { id: { in: oldSessionIds } } });
          } else {
            await tx.teachingSession.updateMany({
              where: { id: { in: oldSessionIds }, state: 'PUBLISHED' },
              data: { state: 'SUPERSEDED' },
            });
          }
        }
      }

      const now = new Date();
      for (const row of generated) {
        const itemId = randomUUID();
        let teachingSessionId: string | null = null;
        if (input.syncTeachingSessions) {
          const ts = await tx.teachingSession.create({
            data: this.buildRoadmapTeachingSessionData({
              classOfferingId: id,
              startsAt: this.vnWallClockToDate(row.sessionDate, row.startTime),
              endsAt: this.vnWallClockToDate(row.sessionDate, row.endTime),
              modality: row.modality,
              roomId: row.roomId,
              instructorId: cls.instructorId ?? null,
              assignmentId: latestAssign?.id ?? null,
              sourceTemplateId: row.sourceSlotId,
              sessionNumber: row.sessionNumber,
              actorId: actor.id,
              reason: `Sinh từ bản đồ lớp ${cls.code} - Buổi ${row.sessionNumber}`,
              now,
            }),
          });
          teachingSessionId = ts.id;
        }
        await tx.classRoadmapItem.create({
          data: {
            id: itemId,
            classOfferingId: id,
            weekNumber: row.weekNumber,
            sessionNumber: row.sessionNumber,
            sessionDate: new Date(`${row.sessionDate}T00:00:00.000Z`),
            startTime: row.startTime,
            endTime: row.endTime,
            periods: row.periods,
            modality: row.modality,
            roomId: row.roomId,
            locationText: row.locationText,
            meetingUrl: row.meetingUrl,
            topicTitle: row.topicTitle,
            contentSummary: row.contentSummary,
            sourceModuleId: row.sourceModuleId,
            teachingSessionId,
            orderIndex: row.orderIndex,
          },
        });
      }

      const lastRow = generated[generated.length - 1];
      await tx.classOffering.update({
        where: { id },
        data: {
          classStart: this.vnWallClockToDate(generated[0].sessionDate, '00:00'),
          classEnd: this.vnWallClockToDate(lastRow.sessionDate, '23:59'),
          totalSessions: generated.length,
          periodsPerSession: generated[0]?.periods ?? periodsPerSession,
          totalPeriods: generated.reduce((sum, r) => sum + r.periods, 0),
          durationWeeks: Math.max(...generated.map((r) => r.weekNumber)),
          defaultRoomId: defaultRoomId ?? null,
        },
      });

      if (input.syncLmsSections) {
        await this.ensureLmsSectionsFromCourse(tx, actor.id, id, cls.courseId);
      }
      return { id };
    });
    return this.classroom(user, id);
  }

  async saveRoadmap(actor: AuthorityActor, user: PublicUser, id: string, input: SaveRoadmapDto) {
    const reason = input.reason?.trim() || 'Học vụ chỉnh sửa và lưu bản đồ lộ trình lớp học';
    await this.write(actor, 'A1_CLASS_ROADMAP_SAVE', id, reason, async (tx) => {
      await tx.$queryRaw`SELECT id FROM class_offerings WHERE id=${id}::uuid FOR UPDATE`;
      const cls = await tx.classOffering.findUnique({ where: { id } });
      if (!cls) throw new NotFoundException('Class not found');
      const roomIds = Array.from(
        new Set(input.items.map((i) => i.roomId).filter((r): r is string => Boolean(r))),
      );
      const rooms = roomIds.length
        ? await tx.room.findMany({ where: { id: { in: roomIds } } })
        : [];
      const roomMap = new Map(rooms.map((r) => [r.id, r]));

      for (const item of input.items) {
        const st = parseWallClockTime(item.startTime);
        const et = parseWallClockTime(item.endTime);
        if (!st || !et || st >= et) {
          throw new BadRequestException(
            `Buổi ${item.sessionNumber}: giờ kết thúc phải sau giờ bắt đầu`,
          );
        }
      }

      const latestAssign = cls.instructorId
        ? await tx.classInstructorAssignment.findFirst({
            where: { classOfferingId: id, state: 'PUBLISHED' },
            orderBy: { createdAt: 'desc' },
          })
        : null;

      await tx.classRoadmapItem.deleteMany({ where: { classOfferingId: id } });
      const now = new Date();
      for (let idx = 0; idx < input.items.length; idx++) {
        const item = input.items[idx];
        const ymd = item.sessionDate.slice(0, 10);
        const room = item.roomId ? roomMap.get(item.roomId) : undefined;
        const resolvedLocation =
          item.locationText?.trim() ||
          (room ? `${room.code} — ${room.name} (${room.location})` : null);
        let teachingSessionId = item.teachingSessionId ?? null;
        if (input.syncTeachingSessions) {
          const startsAt = this.vnWallClockToDate(ymd, item.startTime);
          const endsAt = this.vnWallClockToDate(ymd, item.endTime);
          if (teachingSessionId) {
            const existsTs = await tx.teachingSession.findFirst({
              where: { id: teachingSessionId, classOfferingId: id },
              select: { id: true },
            });
            if (existsTs) {
              await tx.teachingSession.update({
                where: { id: teachingSessionId },
                data: {
                  startsAt,
                  endsAt,
                  modality: item.modality,
                  roomId: item.roomId ?? null,
                },
              });
            } else {
              teachingSessionId = null;
            }
          }
          if (!teachingSessionId) {
            const createdTs = await tx.teachingSession.create({
              data: this.buildRoadmapTeachingSessionData({
                classOfferingId: id,
                startsAt,
                endsAt,
                modality: item.modality,
                roomId: item.roomId ?? null,
                instructorId: cls.instructorId ?? null,
                assignmentId: latestAssign?.id ?? null,
                sessionNumber: item.sessionNumber,
                actorId: actor.id,
                reason: `Đồng bộ bản đồ lớp ${cls.code} - Buổi ${item.sessionNumber}`,
                now,
              }),
            });
            teachingSessionId = createdTs.id;
          }
        }
        await tx.classRoadmapItem.create({
          data: {
            classOfferingId: id,
            weekNumber: item.weekNumber,
            sessionNumber: item.sessionNumber,
            sessionDate: new Date(`${ymd}T00:00:00.000Z`),
            startTime: item.startTime,
            endTime: item.endTime,
            periods: item.periods,
            modality: item.modality,
            roomId: item.roomId ?? null,
            locationText: resolvedLocation,
            meetingUrl: item.meetingUrl?.trim() || null,
            topicTitle: item.topicTitle.trim(),
            contentSummary: item.contentSummary?.trim() || '',
            sourceModuleId: item.sourceModuleId ?? null,
            teachingSessionId,
            orderIndex: item.orderIndex ?? idx,
          },
        });
      }

      if (input.items.length > 0) {
        const sortedYmds = input.items.map((i) => i.sessionDate.slice(0, 10)).sort();
        await tx.classOffering.update({
          where: { id },
          data: {
            classStart: this.vnWallClockToDate(sortedYmds[0], '00:00'),
            classEnd: this.vnWallClockToDate(sortedYmds[sortedYmds.length - 1], '23:59'),
            totalSessions: input.items.length,
            totalPeriods: input.items.reduce((sum, r) => sum + r.periods, 0),
            durationWeeks: Math.max(...input.items.map((r) => r.weekNumber)),
          },
        });
      }
      return { id };
    });
    return this.classroom(user, id);
  }

  syncLmsSections(actor: AuthorityActor, id: string, reason?: string) {
    return this.write(
      actor,
      'A1_CLASS_SYNC_LMS_SECTIONS',
      id,
      reason?.trim() || 'Học vụ khởi tạo học phần LMS từ khung chương trình khóa học',
      async (tx) => {
        const cls = await tx.classOffering.findUnique({ where: { id }, select: { courseId: true } });
        if (!cls) throw new NotFoundException('Class not found');
        return this.ensureLmsSectionsFromCourse(tx, actor.id, id, cls.courseId);
      },
    );
  }
}
