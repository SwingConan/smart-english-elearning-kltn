import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuthorityActor } from '../authorization/authorization.service';
import {
  currentAssignmentWindow,
  effectiveInstructorScope,
} from '../authorization/instructor-scope';
import { ClassLmsService } from './class-lms.service';
import { schoolMonthBounds } from './class-lms.policy';
@Injectable()
export class ClassDashboardService {
  constructor(
    private readonly db: PrismaService,
    private readonly lms: ClassLmsService,
  ) {}
  private async scope(tx: Prisma.TransactionClient, actor: AuthorityActor) {
    const u = await this.lms.context(tx, actor),
      now = await this.lms.now(tx);
    let where: Prisma.ClassOfferingWhereInput = { id: { in: [] } };
    if (u.role === 'INSTRUCTOR')
      where = effectiveInstructorScope(u.id, currentAssignmentWindow(now));
    if (u.role === 'STUDENT')
      where = { enrollments: { some: { learnerId: u.id, status: 'ACTIVE' } } };
    if (u.role === 'ACADEMIC_MANAGER') {
      const grants = await tx.permissionGrant.findMany({
        where: {
          userId: u.id,
          capability: {
            in: [
              'class.read',
              'academic.schedule.approve',
              ...(process.env.W06_ENABLED === 'DEV_DEC047'
                ? ['academic.meeting.approve', 'academic.attendance.approve']
                : []),
            ],
          },
          scopeType: 'CLASS',
          approvedBy: { not: null },
          approvedAt: { lte: now },
          effectiveAt: { lte: now },
          expiresAt: { gt: now },
          revokedAt: null,
        },
        select: { scopeId: true },
      });
      where = {
        OR: [
          { course: { createdById: u.id } },
          { id: { in: grants.flatMap((g) => (g.scopeId ? [g.scopeId] : [])) } },
        ],
      };
    }
    if (u.role === 'TEACHING_INSPECTOR' && process.env.W06_ENABLED === 'DEV_DEC047') {
      const grants = await tx.permissionGrant.findMany({
        where: {
          userId: u.id,
          capability: 'class.read',
          scopeType: 'CLASS',
          approvedBy: { not: null },
          approvedAt: { lte: now },
          effectiveAt: { lte: now },
          expiresAt: { gt: now },
          revokedAt: null,
        },
        select: { scopeId: true },
      });
      where = { id: { in: grants.flatMap((x) => (x.scopeId ? [x.scopeId] : [])) } };
    }
    return { u, where };
  }
  private async read<T>(
    actor: AuthorityActor,
    work: (
      tx: Prisma.TransactionClient,
      s: Awaited<ReturnType<ClassDashboardService['scope']>>,
    ) => Promise<T>,
  ) {
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
        return work(tx, await this.scope(tx, actor));
      },
      { maxWait: 10000, timeout: 15000 },
    );
  }
  classes(actor: AuthorityActor) {
    return this.read(actor, async (tx, s) => {
      const data = await tx.classOffering.findMany({
        where: s.where,
        select: {
          id: true,
          code: true,
          name: true,
          course: { select: { title: true, level: true } },
          enrollments: {
            where: { learnerId: s.u.id, status: 'ACTIVE' },
            select: {
              classActivityProgress: {
                select: { openedAt: true },
                orderBy: { openedAt: 'desc' },
                take: 1,
              },
            },
          },
        },
        orderBy: { code: 'asc' },
        take: 200,
      });
      return {
        data: data.map((c) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          course: c.course,
          lastAccessedAt:
            s.u.role === 'STUDENT'
              ? (c.enrollments[0]?.classActivityProgress[0]?.openedAt ?? null)
              : null,
        })),
        limit: 200,
        // Approval/read grants do not authorize ownClass proposal creation in W02.
        canProposeOfficialSession:
          s.u.role === 'ACADEMIC_MANAGER' &&
          !!(await tx.classOffering.findFirst({
            where: { course: { createdById: s.u.id } },
            select: { id: true },
          })),
      };
    });
  }
  private event(r: {
    id: string;
    startsAt: Date;
    endsAt: Date;
    timezone: string;
    modality: string;
    revision: number;
    classOffering: { id: string; code: string; name: string; course: { title: string } };
    room: { code: string; name: string; location: string } | null;
    instructor: { fullName: string } | null;
  }) {
    return {
      id: r.id,
      source: 'TEACHING_SESSION' as const,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      timezone: r.timezone,
      modality: r.modality,
      revision: r.revision,
      classOffering: r.classOffering,
      room: r.room,
      instructor: r.instructor,
    };
  }
  private select = {
    id: true,
    startsAt: true,
    endsAt: true,
    timezone: true,
    modality: true,
    revision: true,
    classOffering: {
      select: { id: true, code: true, name: true, course: { select: { title: true } } },
    },
    room: { select: { code: true, name: true, location: true } },
    instructor: { select: { fullName: true } },
  } satisfies Prisma.TeachingSessionSelect;
  private async marker(
    tx: Prisma.TransactionClient,
    u: { id: string; role: string },
    id: string,
    startsAt: Date,
    endsAt: Date,
  ) {
    if (process.env.W06_ENABLED !== 'DEV_DEC047') return {};
    const now = await this.lms.now(tx),
      w = await tx.w06Window.findUnique({ where: { sessionId: id } });
    let status = 'NOT_RECORDED';
    if (w && u.role === 'STUDENT') {
      const raw = await tx.w06Receipt.findUnique({
        where: { windowId_learnerId: { windowId: w.id, learnerId: u.id } },
      });
      const review = await tx.w06Correction.findFirst({
        where: { windowId: w.id, learnerId: u.id, state: 'APPROVED' },
        orderBy: { revision: 'desc' },
      });
      status = review?.requestedStatus ?? raw?.status ?? status;
    }
    const meet = await tx.w06Meet.findFirst({
      where: { sessionId: id },
      orderBy: { number: 'desc' },
      select: { state: true, url: true },
    });
    return {
      meetUrl: u.role === 'STUDENT' && meet?.state === 'APPROVED' ? meet.url : null,
      attendance: {
        configured: !!w,
        state: now >= startsAt && now < endsAt ? 'OPEN' : 'CLOSED',
        ...(u.role === 'STUDENT' ? { status } : {}),
      },
    };
  }
  private schoolDayYmd(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(date);
  }
  private schoolHm(date: Date): string {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  }
  private roadmapWindow(sessionDate: Date, startTime: string, endTime: string) {
    const day = this.schoolDayYmd(sessionDate);
    const start = /^\d{2}:\d{2}/.test(startTime) ? startTime.slice(0, 5) : '18:30';
    const end = /^\d{2}:\d{2}/.test(endTime) ? endTime.slice(0, 5) : '20:00';
    const startsAt = new Date(`${day}T${start}:00+07:00`);
    let endsAt = new Date(`${day}T${end}:00+07:00`);
    if (!Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
      endsAt = new Date(startsAt.getTime() + 90 * 60 * 1000);
    }
    return { day, start, startsAt, endsAt };
  }
  private async learnerEvents(
    tx: Prisma.TransactionClient,
    s: Awaited<ReturnType<ClassDashboardService['scope']>>,
    from: Date,
    until: Date,
    classId?: string,
  ) {
    if (s.u.role !== 'STUDENT' && s.u.role !== 'INSTRUCTOR') return [];
    const isStudent = s.u.role === 'STUDENT';
    const now = await this.lms.now(tx);
    const scoped = { AND: [s.where, ...(classId ? [{ id: classId }] : [])] };
    const classSelect = {
      id: true,
      code: true,
      name: true,
      course: { select: { title: true } },
    } as const;
    // Read immutable publications, never the teacher's mutable draft or another learner's work.
    const activities = await tx.classActivity.findMany({
      where: {
        state: 'PUBLISHED',
        publishedRevisionId: { not: null },
        section: { publishedRevisionId: { not: null }, classOffering: scoped },
      },
      select: {
        id: true,
        sectionId: true,
        publishedRevision: {
          select: {
            id: true,
            type: true,
            title: true,
            number: true,
            availableFrom: true,
            availableUntil: true,
            classOffering: { select: classSelect },
            progress: {
              where: { enrollment: { learnerId: s.u.id, status: 'ACTIVE' } },
              select: { status: true },
            },
            quizTest: {
              select: {
                id: true,
                quizState: true,
                classAssessments: {
                  where: { isActive: true },
                  select: { openAt: true, closeAt: true },
                },
                attempts: {
                  where: { learnerId: s.u.id, enrollment: { status: 'ACTIVE' } },
                  select: { status: true, submittedAt: true, quizDeadline: true },
                  orderBy: { startedAt: 'desc' },
                },
              },
            },
          },
        },
        assignmentSubmissions: {
          where: { learnerId: s.u.id, enrollment: { status: 'ACTIVE' } },
          select: { state: true, submittedAt: true },
        },
      },
    });
    const assessments = await tx.classAssessment.findMany({
      where: {
        isActive: true,
        classOffering: scoped,
        test: {
          status: 'PUBLISHED',
          quizActivityId: null,
          purpose: { in: ['IN_CLASS', 'PRACTICE_MOCK'] },
        },
      },
      select: {
        id: true,
        openAt: true,
        closeAt: true,
        classOffering: {
          select: {
            ...classSelect,
            enrollments: { where: { learnerId: s.u.id, status: 'ACTIVE' }, select: { id: true } },
          },
        },
        test: {
          select: {
            id: true,
            title: true,
            questionGroups: { select: { skill: true }, distinct: ['skill'] },
          },
        },
        attempts: {
          where: { learnerId: s.u.id, enrollment: { status: 'ACTIVE' } },
          select: { status: true, submittedAt: true },
        },
      },
    });
    type LearningEvent = {
      id: string;
      source: string;
      title: string;
      startsAt: Date;
      endsAt: Date;
      deadline: Date | null;
      availableFrom: Date | null;
      status?: string;
      submittedAt: Date | null;
      classOffering: { id: string; code: string; name: string; course: { title: string } };
      actionUrl: string;
      actionLabel: string;
      actionNote: string | null;
      timezone: string;
      modality: string;
      revision: number;
      room: null;
      instructor: null;
    };
    const result: LearningEvent[] = [];
    let localKindMap = new Map<string, string>();
    let localQuizCfgMap = new Map<string, string>();
    let localQuizSubMap = new Map<string, Date | null>();
    let localAttSubMap = new Map<string, Date | null>();
    const archivedEntityIds = new Set<string>();
    if (typeof tx.$queryRawUnsafe === 'function') {
      try {
        const [kinds, qCfgs, qSubs, aSubs, archivedRows] = await Promise.all([
          tx.$queryRawUnsafe(`SELECT activity_id, kind FROM lms_local_activity_kinds`) as Promise<any[]>,
          tx.$queryRawUnsafe(
            `SELECT activity_id, assessment_kind FROM lms_local_quiz_configs`,
          ) as Promise<any[]>,
          isStudent
            ? (tx.$queryRawUnsafe(
                `SELECT activity_id, submitted_at FROM lms_local_quiz_attempts
                  WHERE learner_id = $1 AND status = 'SUBMITTED'
                  ORDER BY submitted_at DESC NULLS LAST`,
                s.u.id,
              ) as Promise<any[]>)
            : Promise.resolve([]),
          isStudent
            ? (tx.$queryRawUnsafe(
                `SELECT activity_id, checked_in_at FROM lms_local_attendance_records WHERE learner_id = $1`,
                s.u.id,
              ) as Promise<any[]>)
            : Promise.resolve([]),
          tx.$queryRawUnsafe(`SELECT entity_id FROM lms_local_archived_content`) as Promise<any[]>,
        ]);
        for (const ar of archivedRows) {
          archivedEntityIds.add(String(ar.entity_id));
        }
        localKindMap = new Map(kinds.map((k) => [String(k.activity_id), String(k.kind)]));
        localQuizCfgMap = new Map(
          qCfgs.map((q) => [String(q.activity_id), String(q.assessment_kind || 'QUIZ')]),
        );
        for (const qs of qSubs) {
          if (!localQuizSubMap.has(String(qs.activity_id))) {
            localQuizSubMap.set(
              String(qs.activity_id),
              qs.submitted_at ? new Date(qs.submitted_at) : null,
            );
          }
        }
        for (const as of aSubs) {
          localAttSubMap.set(
            String(as.activity_id),
            as.checked_in_at ? new Date(as.checked_in_at) : null,
          );
        }
      } catch {
        // Local tables may not be initialized in unit mocks.
      }
    }
    const add = (
      id: string,
      source: string,
      title: string,
      open: Date | null,
      deadline: Date | null,
      c: LearningEvent['classOffering'],
      status: string | undefined,
      submittedAt: Date | null,
      url: string,
      label: string,
      revision = 1,
      available = true,
      noteOverride?: string | null,
    ) => {
      // Start and due dates are distinct milestones. No date is inferred from creation/publication.
      const points = [
        open && { kind: 'START', at: open },
        deadline && { kind: 'DUE', at: deadline },
      ].filter((p): p is { kind: string; at: Date } => !!p && Number.isFinite(p.at.getTime()));
      for (const p of points) {
        if (
          p.at < from ||
          p.at >= until ||
          (p.kind === 'START' && deadline?.getTime() === p.at.getTime())
        )
          continue;
        result.push({
          id: `${source}:${id}:${p.kind}`,
          source,
          title: (p.kind === 'DUE' ? 'Hạn: ' : 'Bắt đầu: ') + title,
          startsAt: p.at,
          endsAt: p.at,
          deadline,
          availableFrom: open,
          ...(status ? { status } : {}),
          submittedAt,
          classOffering: { id: c.id, code: c.code, name: c.name, course: c.course },
          actionUrl: available ? url : '/classroom/' + c.id,
          actionLabel: available ? label : 'Vào lớp',
          actionNote:
            noteOverride !== undefined
              ? noteOverride
              : available
                ? null
                : open && now < open
                  ? 'Hoạt động chưa mở.'
                  : 'Hoạt động đã đóng; xem thông tin trong lớp.',
          timezone: 'Asia/Ho_Chi_Minh',
          modality: '',
          revision,
          room: null,
          instructor: null,
        });
      }
    };
    for (const a of activities) {
      if (archivedEntityIds.has(a.id) || (a.sectionId && archivedEntityIds.has(a.sectionId))) continue;
      const r = a.publishedRevision;
      if (!r || (r.type === 'QUIZ' && r.quizTest?.quizState !== 'APPROVED')) continue;
      const localKind = localKindMap.get(a.id) ?? null;
      const cfg = r.quizTest?.classAssessments[0];
      const open = r.type === 'QUIZ' ? (cfg?.openAt ?? r.availableFrom) : r.availableFrom;
      const attempt = isStudent ? r.quizTest?.attempts.find((x) => x.status === 'IN_PROGRESS') : undefined;
      const deadline =
        attempt?.quizDeadline ??
        (r.type === 'QUIZ' ? (cfg?.closeAt ?? r.availableUntil) : r.availableUntil);
      const localQuizSubmittedAt =
        isStudent && localKind === 'LOCAL_QUIZ' ? localQuizSubMap.get(a.id) : undefined;
      const localAttCheckedAt =
        isStudent && localKind === 'LOCAL_ATTENDANCE' ? localAttSubMap.get(a.id) : undefined;
      const submitted = isStudent
        ? (a.assignmentSubmissions.find((x) => x.state === 'SUBMITTED') ??
          r.quizTest?.attempts.find((x) => x.status === 'SUBMITTED'))
        : undefined;
      const completed = isStudent ? r.progress.some((p) => p.status === 'COMPLETED') : false;
      const status = isStudent
        ? submitted || localQuizSubmittedAt !== undefined
          ? 'SUBMITTED'
          : completed || localAttCheckedAt !== undefined
            ? 'COMPLETED'
            : deadline && deadline <= now
              ? 'OVERDUE'
              : 'NOT_STARTED'
        : undefined;
      const available =
        !isStudent ||
        r.type === 'QUIZ' ||
        ((!r.availableFrom || r.availableFrom <= now) &&
          (r.type === 'ASSIGNMENT' || !r.availableUntil || r.availableUntil > now));
      const eventSource =
        localKind === 'LOCAL_QUIZ'
          ? (localQuizCfgMap.get(a.id) ?? 'QUIZ')
          : localKind === 'LOCAL_ATTENDANCE'
            ? 'ATTENDANCE'
            : r.type;
      const eventUrl =
        localKind === 'LOCAL_QUIZ'
          ? `/classroom/${r.classOffering.id}/activities/${a.id}/local-quiz`
          : localKind === 'LOCAL_ATTENDANCE'
            ? `/classroom/${r.classOffering.id}/activities/${a.id}/local-attendance`
            : `/classroom/${r.classOffering.id}/activities/${a.id}${r.type === 'QUIZ' ? '/quiz' : ''}`;
      const eventActionLabel = !isStudent
        ? localKind === 'LOCAL_ATTENDANCE'
          ? 'Mở điểm danh'
          : localKind === 'LOCAL_QUIZ' || r.type === 'QUIZ'
            ? 'Xem đề & Điểm'
            : r.type === 'ASSIGNMENT'
              ? 'Xem & Chấm bài'
              : 'Mở hoạt động'
        : localKind === 'LOCAL_ATTENDANCE'
          ? localAttCheckedAt !== undefined
            ? 'Đã điểm danh'
            : 'Điểm danh'
          : submitted || localQuizSubmittedAt !== undefined
            ? 'Xem bài đã nộp'
            : completed
              ? 'Xem hoạt động'
              : r.type === 'ASSIGNMENT'
                ? 'Xem bài tập'
                : r.type === 'QUIZ' || localKind === 'LOCAL_QUIZ'
                  ? 'Làm bài'
                  : 'Xem hoạt động';
      const instructorNote = !isStudent
        ? deadline && deadline <= now
          ? 'Đã qua hạn mở · Xem tình hình thực hiện của lớp'
          : 'Mở cho học viên trong lớp'
        : undefined;
      add(
        a.id,
        eventSource,
        r.title,
        open ?? null,
        deadline ?? null,
        r.classOffering,
        status,
        submitted?.submittedAt ?? localQuizSubmittedAt ?? localAttCheckedAt ?? null,
        eventUrl,
        eventActionLabel,
        r.number,
        available,
        instructorNote,
      );
    }
    for (const a of assessments) {
      const submitted = isStudent ? a.attempts.find((x) => x.status === 'SUBMITTED') : undefined;
      const status = isStudent
        ? submitted
          ? 'SUBMITTED'
          : a.closeAt && a.closeAt <= now
            ? 'OVERDUE'
            : 'NOT_STARTED'
        : undefined;
      const skills = a.test.questionGroups
        .map((x) => x.skill)
        .filter((x) => x === 'SPEAKING' || x === 'WRITING');
      const enrollmentId = a.classOffering.enrollments[0]?.id;
      add(
        a.id,
        'ASSESSMENT',
        a.test.title +
          (skills.length
            ? ' · ' + skills.map((x) => (x === 'SPEAKING' ? 'Speaking' : 'Writing')).join('/')
            : ''),
        a.openAt,
        a.closeAt,
        a.classOffering,
        status,
        submitted?.submittedAt ?? null,
        !isStudent
          ? `/instructor/classes/${a.classOffering.id}/assessments/${a.id}/grading`
          : enrollmentId
            ? `/student/enrollments/${enrollmentId}/tests?focus=${a.test.id}`
            : `/classroom/${a.classOffering.id}`,
        !isStudent ? 'Mở chấm bài' : submitted ? 'Xem bài đã nộp' : 'Làm bài',
        1,
        !isStudent || Boolean(enrollmentId),
        !isStudent
          ? 'Đánh giá chính thức trong lớp'
          : undefined,
      );
    }
    return result;
  }
  month(actor: AuthorityActor, month: string, classId?: string) {
    const { from, until } = schoolMonthBounds(month);
    return this.read(actor, async (tx, s) => {
      const rows = await tx.teachingSession.findMany({
        where: {
          state: 'PUBLISHED',
          startsAt: { lt: until },
          endsAt: { gt: from },
          classOffering: { AND: [s.where, ...(classId ? [{ id: classId }] : [])] },
        },
        select: this.select,
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      });
      const existingKeys = new Set(
        rows.map(
          (r) =>
            `${r.classOffering.id}|${this.schoolDayYmd(r.startsAt)}|${this.schoolHm(r.startsAt)}`,
        ),
      );
      const roadmapDelegate = (
        tx as unknown as {
          classRoadmapItem?: {
            findMany?: (args: unknown) => Promise<
              Array<{
                id: string;
                sessionNumber: number;
                topicTitle: string;
                sessionDate: Date;
                startTime: string;
                endTime: string;
                modality: string;
                locationText: string | null;
                meetingUrl: string | null;
                classOffering: {
                  id: string;
                  code: string;
                  name: string;
                  course: { title: string };
                  instructor: { fullName: string } | null;
                };
                room: { code: string; name: string; location: string } | null;
              }>
            >;
          };
        }
      ).classRoadmapItem;
      const roadmapRows =
        roadmapDelegate && typeof roadmapDelegate.findMany === 'function'
          ? await roadmapDelegate.findMany({
              where: {
                teachingSessionId: null,
                sessionDate: {
                  gte: new Date(from.getTime() - 24 * 3600 * 1000),
                  lt: new Date(until.getTime() + 24 * 3600 * 1000),
                },
                classOffering: { AND: [s.where, ...(classId ? [{ id: classId }] : [])] },
              },
              select: {
                id: true,
                sessionNumber: true,
                topicTitle: true,
                sessionDate: true,
                startTime: true,
                endTime: true,
                modality: true,
                locationText: true,
                meetingUrl: true,
                classOffering: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                    course: { select: { title: true } },
                    instructor: { select: { fullName: true } },
                  },
                },
                room: { select: { code: true, name: true, location: true } },
              },
              orderBy: [{ sessionDate: 'asc' }, { startTime: 'asc' }, { sessionNumber: 'asc' }],
            })
          : [];
      const roadmapEvents = roadmapRows.flatMap((rm) => {
        const w = this.roadmapWindow(rm.sessionDate, rm.startTime, rm.endTime);
        if (w.endsAt <= from || w.startsAt >= until) return [];
        const key = `${rm.classOffering.id}|${w.day}|${w.start}`;
        if (existingKeys.has(key)) return [];
        return [
          {
            id: `roadmap:${rm.id}`,
            source: 'TEACHING_SESSION' as const,
            title: rm.topicTitle || `Buổi ${rm.sessionNumber}`,
            startsAt: w.startsAt,
            endsAt: w.endsAt,
            timezone: 'Asia/Ho_Chi_Minh',
            modality: rm.modality,
            revision: 1,
            meetUrl: s.u.role === 'STUDENT' || s.u.role === 'INSTRUCTOR' ? rm.meetingUrl : null,
            actionUrl: `/classroom/${rm.classOffering.id}`,
            actionLabel: 'Vào lớp',
            classOffering: {
              id: rm.classOffering.id,
              code: rm.classOffering.code,
              name: rm.classOffering.name,
              course: rm.classOffering.course,
            },
            room:
              rm.room ??
              (rm.locationText
                ? { code: '', name: rm.locationText, location: rm.locationText }
                : null),
            instructor: rm.classOffering.instructor,
          },
        ];
      });
      const learning = await this.learnerEvents(tx, s, from, until, classId);
      const sessions = await Promise.all(
        rows.map(async (r) => ({
          ...this.event(r),
          ...(await this.marker(tx, s.u, r.id, r.startsAt, r.endsAt)),
        })),
      );
      return {
        month,
        timezone: 'Asia/Ho_Chi_Minh',
        from,
        until,
        data: [...sessions, ...roadmapEvents, ...learning].sort(
          (a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id),
        ),
        truncated: false,
      };
    });
  }
  detail(actor: AuthorityActor, id: string) {
    return this.read(actor, async (tx, s) => {
      if (id.startsWith('roadmap:')) {
        const rawId = id.slice('roadmap:'.length);
        const rm = await tx.classRoadmapItem.findFirst({
          where: { id: rawId, classOffering: s.where },
          select: {
            id: true,
            sessionNumber: true,
            topicTitle: true,
            sessionDate: true,
            startTime: true,
            endTime: true,
            modality: true,
            locationText: true,
            meetingUrl: true,
            classOffering: {
              select: {
                id: true,
                code: true,
                name: true,
                course: { select: { title: true } },
                instructor: { select: { fullName: true } },
              },
            },
            room: { select: { code: true, name: true, location: true } },
          },
        });
        if (!rm) throw new NotFoundException('Calendar event not available');
        const w = this.roadmapWindow(rm.sessionDate, rm.startTime, rm.endTime);
        return {
          id,
          source: 'TEACHING_SESSION' as const,
          title: rm.topicTitle || `Buổi ${rm.sessionNumber}`,
          startsAt: w.startsAt,
          endsAt: w.endsAt,
          timezone: 'Asia/Ho_Chi_Minh',
          modality: rm.modality,
          revision: 1,
          meetUrl: rm.meetingUrl ?? null,
          classOffering: {
            id: rm.classOffering.id,
            code: rm.classOffering.code,
            name: rm.classOffering.name,
            course: rm.classOffering.course,
          },
          room:
            rm.room ??
            (rm.locationText
              ? { code: '', name: rm.locationText, location: rm.locationText }
              : null),
          instructor: rm.classOffering.instructor,
          relatedActivities: [],
        };
      }
      const r = await tx.teachingSession.findFirst({
        where: { id, state: 'PUBLISHED', classOffering: s.where },
        select: this.select,
      });
      if (!r) throw new NotFoundException('Calendar event not available');
      // Links are authored in immutable lesson publications. Match the exact event URL
      // inside the same class; a link never grants access to a different class or draft.
      const now = await this.lms.now(tx);
      const linked = ['STUDENT', 'INSTRUCTOR'].includes(s.u.role)
        ? await tx.classActivity.findMany({
            where: {
              state: 'PUBLISHED',
              section: { classOfferingId: r.classOffering.id, publishedRevisionId: { not: null } },
              publishedRevision: {
                is: {
                  type: 'LESSON',
                  contentMarkdown: { contains: `](/my/events/${id})` },
                  ...(s.u.role === 'STUDENT' ? {
                    AND: [
                      { OR: [{ availableFrom: null }, { availableFrom: { lte: now } }] },
                      { OR: [{ availableUntil: null }, { availableUntil: { gt: now } }] },
                    ],
                  } : {}),
                },
              },
            },
            select: { id: true, publishedRevision: { select: { title: true, availableFrom: true } } },
            orderBy: { orderIndex: 'asc' },
          })
        : [];
      return {
        ...this.event(r),
        ...(await this.marker(tx, s.u, r.id, r.startsAt, r.endsAt)),
        relatedActivities: linked.map(a => ({
          id: a.id,
          title: a.publishedRevision!.title,
          availableFrom: a.publishedRevision!.availableFrom,
          actionUrl: `/classroom/${r.classOffering.id}/activities/${a.id}`,
        })),
      };
    });
  }
}
