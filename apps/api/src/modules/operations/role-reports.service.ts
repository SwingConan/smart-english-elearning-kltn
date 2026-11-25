import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { RoleReportAdapters } from './role-report-adapters.service';
import { available, unavailable, ref, type Source } from './report-source';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthorizationService, type AuthorityActor } from '../authorization/authorization.service';
import { BUSINESS_ROLES } from '../authorization/permission.policy';
import {
  effectiveInstructorScope,
  currentAssignmentWindow,
} from '../authorization/instructor-scope';
import { ClassLmsService } from '../class-lms/class-lms.service';
import { privatePlacementPreviewEnabled } from '../placement/placement-preview.guard';
import { encodeSafeCsvCell, resolveCenterDay } from './operations-foundation';
import type { BusinessRole } from './operations.contracts';
import type { RoleReportQuery } from './role-reports.dto';

const domains: Record<BusinessRole, readonly string[]> = {
  STUDENT: ['LEARNING', 'SUBMISSIONS', 'PLACEMENT_RESULTS', 'CERTIFICATE'],
  INSTRUCTOR: ['TEACHING', 'GRADING', 'TEACHING_CALENDAR'],
  COUNSELOR: ['SUPPORT', 'CONSULTATION'],
  ACADEMIC_MANAGER: [
    'ACADEMIC',
    'PLACEMENT_RESULTS',
    'CLASS_SCHEDULE',
    'ACADEMIC_DECISIONS',
    'CERTIFICATE',
  ],
  CASHIER: ['FINANCE'],
  TEACHING_INSPECTOR: ['INSPECTION', 'STAFF_SHIFT'],
  SYSTEM_ADMIN: ['ACCOUNTS', 'AUTHORITY_EVENTS', 'RUNTIME_PROBE', 'SECURITY_OPS'],
};

const PLACEMENT_SKILL_VI: Record<string, string> = {
  LR: 'Nghe & Đọc',
  FOUR_SKILLS: '4 kỹ năng',
  SPEAKING: 'Kỹ năng Nói',
  WRITING: 'Kỹ năng Viết',
  LISTENING: 'Kỹ năng Nghe',
  READING: 'Kỹ năng Đọc',
};

function formatPlacementSkillVi(skill: string): string {
  return PLACEMENT_SKILL_VI[skill] ?? skill;
}

/** Source activity views reuse existing domain read authority. They do not mint
 * report.view/report.export grants or turn OPEN KPI definitions into official metrics.
 * Existing W10 authority adapters and their fail-closed outcome stay unchanged.
 */
@Injectable()
export class RoleReportsService {
  constructor(
    private readonly db: PrismaService,
    private readonly lms: ClassLmsService,
    private readonly authority: AuthorizationService,
    private readonly adapters: RoleReportAdapters,
  ) {}
  private window(date: string) {
    const zone = process.env.REPORT_CENTER_TIME_ZONE;
    const day = resolveCenterDay({
      date,
      timeZone: zone ?? '',
      configurationRef: { id: 'REPORT_CENTER_TIME_ZONE', revision: zone ?? 'UNCONFIGURED' },
    });
    if (day.status !== 'RESOLVED')
      throw new BadRequestException({
        code: day.reason,
        message: 'Ngày hoặc múi giờ trung tâm chưa hợp lệ.',
      });
    return {
      date,
      timeZone: 'Asia/Ho_Chi_Minh',
      startAt: day.window.startAt,
      endExclusive: day.window.endExclusive,
    };
  }
  view(actor: AuthorityActor, query: RoleReportQuery) {
    const window = this.window(query.date),
      start = new Date(window.startAt),
      end = new Date(window.endExclusive);
    return this.db.$transaction(
      async (tx) => {
        // Same revocation fence as W01. READ COMMITTED reads authority after lock
        // acquisition, rather than pinning a snapshot before a blocked lock.
        // No caller identity/role/scope is accepted.
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
        await tx.$queryRaw`SELECT set_config('TimeZone','UTC',true)`;
        const user = await this.lms.context(tx, actor);
        if (!BUSINESS_ROLES.includes(user.role))
          throw new ForbiddenException('Business role required');
        const role = user.role as BusinessRole,
          requested = query.source ?? 'ALL';
        if (requested !== 'ALL' && !domains[role].includes(requested))
          throw new ForbiddenException('Source outside current role projection');
        const now = await this.lms.now(tx),
          sources: Source[] = [];
        const wants = (code: string) => requested === 'ALL' || requested === code;
        const dates = { gte: start, lt: end };
        if (role === 'STUDENT') {
          if (wants('LEARNING')) {
            const rows = await tx.$queryRaw<
              {
                id: string;
                status: string;
                lastAccessedAt: Date;
                updatedAt: Date;
                enrollmentId: string;
              }[]
            >`SELECT p.id,p.status,p."lastAccessedAt",p."updatedAt",p."enrollmentId" FROM lesson_progress p JOIN enrollments en ON en.id=p."enrollmentId" JOIN class_offerings c ON c.id=en."classOfferingId" JOIN lessons l ON l.id=p."lessonId" JOIN modules m ON m.id=l."moduleId" WHERE en."learnerId"=${user.id}::uuid AND en.status='ACTIVE' AND m."courseId"=c."courseId" AND p."lastAccessedAt">=(${start}::timestamptz AT TIME ZONE 'UTC') AND p."lastAccessedAt"<(${end}::timestamptz AT TIME ZONE 'UTC') ORDER BY p."lastAccessedAt" DESC,p.id LIMIT 201`;
            const activityRows = tx.classActivityProgress?.findMany
              ? await tx.classActivityProgress.findMany({
                  where: {
                    enrollment: { learnerId: user.id, status: 'ACTIVE' },
                    openedAt: dates,
                  },
                  select: {
                    id: true,
                    status: true,
                    openedAt: true,
                    completedAt: true,
                    enrollmentId: true,
                  },
                  orderBy: [{ openedAt: 'desc' }, { id: 'asc' }],
                  take: 201,
                })
              : [];
            sources.push(
              available(
                'LEARNING',
                'W03',
                'OWN_ACTIVE_ENROLLMENT_COURSE_BOUND_PROGRESS_METADATA',
                [
                  ...rows.map((r) => ({
                    id: r.id,
                    at: r.lastAccessedAt!.toISOString(),
                    label: 'Truy cập bài học',
                    state: r.status,
                    revision: r.updatedAt.toISOString(),
                    resource: ref(r.enrollmentId),
                  })),
                  ...activityRows.map((r) => ({
                    id: r.id,
                    at: (r.completedAt ?? r.openedAt).toISOString(),
                    label: 'Tiến độ hoạt động lớp học',
                    state: r.status,
                    revision: (r.completedAt ?? r.openedAt).toISOString(),
                    resource: ref(r.enrollmentId),
                  })),
                ].slice(0, 201),
              ),
            );
          }
          if (wants('SUBMISSIONS')) {
            const rows = await tx.testAttempt.findMany({
              where: { learnerId: user.id, submittedAt: dates },
              select: { id: true, status: true, submittedAt: true, updatedAt: true },
              orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
              take: 201,
            });
            const assignmentRows = tx.classAssignmentSubmission?.findMany
              ? await tx.classAssignmentSubmission.findMany({
                  where: { learnerId: user.id, state: 'SUBMITTED', submittedAt: dates },
                  select: { id: true, state: true, submittedAt: true, updatedAt: true },
                  orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
                  take: 201,
                })
              : [];
            sources.push(
              available(
                'SUBMISSIONS',
                'W03/W04',
                'OWN_ATTEMPT_METADATA_ONLY',
                [
                  ...rows.map((r) => ({
                    id: r.id,
                    at: r.submittedAt!.toISOString(),
                    label: 'Nộp bài kiểm tra',
                    state: r.status,
                    revision: r.updatedAt.toISOString(),
                    resource: ref(r.id),
                  })),
                  ...assignmentRows.map((r) => ({
                    id: r.id,
                    at: r.submittedAt!.toISOString(),
                    label: 'Nộp bài tự luận lớp học',
                    state: r.state,
                    revision: r.updatedAt.toISOString(),
                    resource: ref(r.id),
                  })),
                ].slice(0, 201),
              ),
            );
          }
        }
        if ((role === 'STUDENT' || role === 'ACADEMIC_MANAGER') && wants('PLACEMENT_RESULTS')) {
          const scoped =
            role === 'STUDENT' ||
            (await this.authority.permits(
              user.id,
              'placement.result.publish',
              { type: 'GLOBAL' },
              tx,
            ));
          if (!scoped || !(await privatePlacementPreviewEnabled(tx)))
            sources.push(
              unavailable(
                'PLACEMENT_RESULTS',
                'W04',
                'CURRENT_SOURCE_AUTHORITY_OR_GUARD_UNAVAILABLE',
              ),
            );
          else {
            const rows = await tx.placementResultRelease.findMany({
              where: {
                createdAt: dates,
                ...(role === 'STUDENT'
                  ? { evaluation: { attempt: { learnerId: user.id } } }
                  : { publishedById: user.id }),
              },
              select: {
                evaluationId: true,
                createdAt: true,
                evaluation: { select: { skill: true, number: true, attemptId: true } },
              },
              orderBy: [{ createdAt: 'desc' }, { evaluationId: 'asc' }],
              take: 201,
            });
            sources.push(
              available(
                'PLACEMENT_RESULTS',
                'W04',
                role === 'STUDENT'
                  ? 'OWN_INDEPENDENTLY_PUBLISHED_RELEASES'
                  : 'SOURCE_CAPABILITY:placement.result.publish:OWN_PUBLICATIONS',
                rows.map((r) => ({
                  id: r.evaluationId,
                  at: r.createdAt.toISOString(),
                  label: `Công bố kết quả ${formatPlacementSkillVi(r.evaluation.skill)}`,
                  state: 'PUBLISHED',
                  revision: String(r.evaluation.number),
                  resource: ref(r.evaluation.attemptId),
                })),
              ),
            );
          }
        }
        if (role === 'INSTRUCTOR') {
          if (wants('TEACHING')) {
            const classes = await tx.classOffering.findMany({
              where: effectiveInstructorScope(user.id, currentAssignmentWindow(now)),
              select: { id: true },
            });
            if (!classes.length)
              sources.push(unavailable('TEACHING', 'W02', 'NO_CURRENT_ASSIGNED_CLASS'));
            else {
              const rows = await tx.$queryRaw<
                { id: string; startsAt: Date; revision: number; classOfferingId: string }[]
              >(
                Prisma.sql`SELECT s.id,s."startsAt",s.revision,s."classOfferingId" FROM teaching_sessions s WHERE s."classOfferingId" IN (${Prisma.join(classes.map((c) => Prisma.sql`${c.id}::uuid`))}) AND s."instructorId"=${user.id}::uuid AND s.state='PUBLISHED' AND s.intent='PUBLISH' AND s."startsAt">=${start} AND s."startsAt"<${end} AND NOT EXISTS(SELECT 1 FROM teaching_sessions n WHERE n."supersedesId"=s.id AND n.state='PUBLISHED') ORDER BY s."startsAt" DESC,s.id LIMIT 201`,
              );
              sources.push(
                available(
                  'TEACHING',
                  'W02',
                  'CURRENT_EFFECTIVE_CLASS_ASSIGNMENT',
                  rows.map((r) => ({
                    id: r.id,
                    at: r.startsAt.toISOString(),
                    label: 'Buổi dạy đã công bố',
                    state: 'PUBLISHED',
                    revision: String(r.revision),
                    resource: ref(r.classOfferingId),
                  })),
                ),
              );
            }
          }
          if (wants('GRADING')) {
            const placementEnabled = await privatePlacementPreviewEnabled(tx);
            const assignmentGrades = tx.assignmentGrade?.findMany
              ? await tx.assignmentGrade.findMany({
                  where: {
                    gradedById: user.id,
                    confirmedAt: dates,
                  },
                  select: {
                    id: true,
                    number: true,
                    state: true,
                    confirmedAt: true,
                    submissionId: true,
                  },
                  orderBy: [{ confirmedAt: 'desc' }, { id: 'asc' }],
                  take: 201,
                })
              : [];
            if (!placementEnabled && assignmentGrades.length === 0)
              sources.push(unavailable('GRADING', 'W04', 'SOURCE_GUARD_UNAVAILABLE'));
            else {
              const rows = placementEnabled
                ? await tx.$queryRaw<
                    {
                      id: string;
                      skill: string;
                      number: number;
                      createdAt: Date;
                      attemptId: string;
                    }[]
                  >`SELECT e.id,e.skill,e.number,e."createdAt",e."attemptId" FROM placement_human_evaluations e JOIN placement_grader_assignments a ON a.id=e."assignmentId" WHERE e."graderId"=${user.id}::uuid AND a."graderId"=${user.id}::uuid AND e."createdAt">=${start} AND e."createdAt"<${end} AND NOT EXISTS(SELECT 1 FROM placement_grader_assignments newer WHERE newer."attemptId"=a."attemptId" AND newer.number>a.number) ORDER BY e."createdAt" DESC,e.id LIMIT 201`
                : [];
              sources.push(
                available(
                  'GRADING',
                  'W03/W04',
                  'CURRENT_ATTEMPT_ASSIGNMENT_OWN_EVALUATIONS',
                  [
                    ...rows.map((r) => ({
                      id: r.id,
                      at: r.createdAt.toISOString(),
                      label: `Bản chấm ${formatPlacementSkillVi(r.skill)}`,
                      state: 'REVIEWED_FINAL',
                      revision: String(r.number),
                      resource: ref(r.attemptId),
                    })),
                    ...assignmentGrades.map((g) => ({
                      id: g.id,
                      at: g.confirmedAt!.toISOString(),
                      label: 'Chấm điểm bài tập tự luận lớp học',
                      state: g.state,
                      revision: String(g.number),
                      resource: ref(g.submissionId),
                    })),
                  ].slice(0, 201),
                ),
              );
            }
          }
        }
        if (role === 'ACADEMIC_MANAGER' && wants('ACADEMIC')) {
          if (!(await this.authority.permits(user.id, 'class.read', { type: 'GLOBAL' }, tx)))
            sources.push(unavailable('ACADEMIC', 'W02', 'CURRENT_CLASS_READ_REQUIRED'));
          else {
            const rows = await tx.classOffering.findMany({
              where: { updatedAt: dates },
              select: { id: true, code: true, name: true, status: true, updatedAt: true },
              orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
              take: 201,
            });
            sources.push(
              available(
                'ACADEMIC',
                'W02',
                'SOURCE_CAPABILITY:class.read:CURRENT_CLASS_METADATA',
                rows.map((r) => ({
                  id: r.id,
                  at: r.updatedAt.toISOString(),
                  label: `Lớp ${r.code} · ${r.name}`,
                  state: r.status,
                  revision: r.updatedAt.toISOString(),
                  resource: ref(r.id),
                })),
              ),
            );
          }
        }
        if (role === 'SYSTEM_ADMIN') {
          if (wants('ACCOUNTS')) {
            if (!(await this.authority.permits(user.id, 'accounts.manage', { type: 'GLOBAL' }, tx)))
              sources.push(unavailable('ACCOUNTS', 'W01', 'CURRENT_ACCOUNTS_SOURCE_READ_REQUIRED'));
            else {
              const rows = await tx.user.findMany({
                where: { createdAt: dates },
                select: { id: true, createdAt: true },
                orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
                take: 201,
              });
              sources.push(
                available(
                  'ACCOUNTS',
                  'W01',
                  'SOURCE_CAPABILITY:accounts.manage:REDACTED_CREATION_FACTS_ONLY',
                  rows.map((r) => ({
                    id: ref(r.id),
                    at: r.createdAt.toISOString(),
                    label: 'Tài khoản được tạo',
                    state: 'RECORDED',
                    revision: r.createdAt.toISOString(),
                    resource: ref(r.id),
                  })),
                ),
              );
            }
          }
          if (wants('SECURITY_OPS')) {
            if (
              process.env.W10_REPORT_CSV_ENABLED === 'DEV_W10' &&
              (await this.authority.permits(user.id, 'accounts.manage', { type: 'GLOBAL' }, tx))
            ) {
              const rows = await tx.domainAuditEvent.findMany({
                where: { createdAt: dates },
                select: {
                  id: true,
                  createdAt: true,
                  action: true,
                  decision: true,
                  objectType: true,
                  objectId: true,
                },
                orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
                take: 201,
              });
              sources.push(
                available(
                  'SECURITY_OPS',
                  'W01/W10',
                  'W10_DEV_SECURITY_OPS_AUDIT_EVENTS',
                  rows.map((r) => ({
                    id: r.id,
                    at: r.createdAt.toISOString(),
                    label: `${r.objectType}: ${r.action}`,
                    state: r.decision,
                    revision: r.createdAt.toISOString(),
                    resource: ref(r.objectId),
                  })),
                ),
              );
            } else {
              sources.push(
                unavailable('SECURITY_OPS', 'W01/W10', 'EXACT_OPS_AUDIT_SCOPE_NOT_REGISTERED'),
              );
            }
          }
        }
        sources.push(...(await this.adapters.read(tx, actor, user.role, start, end, requested)));
        for (const code of domains[role])
          if (wants(code) && !sources.some((s) => s.code === code)) {
            sources.push(
              unavailable(
                code,
                code === 'CONSULTATION'
                  ? 'W05B'
                  : code === 'CERTIFICATE'
                    ? 'W09'
                    : code === 'SUPPORT'
                      ? 'W05A'
                      : code === 'FINANCE'
                        ? 'W07'
                        : 'W08',
                code === 'CONSULTATION'
                  ? 'W05B_RUNTIME_UNACCEPTED'
                  : code === 'CERTIFICATE'
                    ? 'W09_ISSUANCE_UNAVAILABLE'
                    : 'GUARDED_SCOPED_SOURCE_READER_NOT_CONNECTED',
              ),
            );
          }
        const devReportEnabled = process.env.W10_REPORT_CSV_ENABLED === 'DEV_W10';
        const byState: Record<string, number> = {};
        for (const s of sources) {
          for (const rec of s.records ?? []) {
            byState[rec.state] = (byState[rec.state] ?? 0) + 1;
          }
        }
        const kpiSummary = devReportEnabled
          ? {
              totalSources: sources.length,
              availableSources: sources.filter((s) => s.state === 'AVAILABLE').length,
              totalRecords: sources.reduce((sum, s) => sum + (s.records?.length ?? 0), 0),
              bySource: Object.fromEntries(
                sources.map((s) => {
                  const count = s.records ? s.records.length : null;
                  const availabilityClassification =
                    s.state === 'AVAILABLE'
                      ? count && count > 0
                        ? 'AVAILABLE'
                        : 'AVAILABLE_EMPTY'
                      : s.reason &&
                          /GUARD|SCOPE|AUTHORITY|REQUIRED|PRIVATE_DEV_ONLY/.test(s.reason)
                        ? 'BLOCKED_BY_POLICY'
                        : 'UNAVAILABLE';
                  return [
                    s.code,
                    {
                      state: s.state,
                      availabilityClassification,
                      count,
                      wave: s.wave,
                      reason: s.reason,
                    },
                  ];
                }),
              ),
              byState,
            }
          : null;
        return {
          viewerId: user.id,
          role,
          asOf: now.toISOString(),
          window,
          filters: { source: requested },
          sourceOptions: domains[role],
          mode: 'DOMAIN_AUTHORIZED_ACTIVITY_ONLY' as const,
          // Source authority is not a substitute grant for formal W10 metrics or CSV unless DEV_W10 is explicitly enabled on disposable E2E.
          formalReportAuthorized: devReportEnabled,
          metrics: devReportEnabled
            ? {
                state: 'AVAILABLE' as const,
                value: kpiSummary,
                reason: null,
              }
            : {
                state: 'UNAVAILABLE' as const,
                value: null,
                reason: 'APPROVED_METRIC_DEFINITIONS_REQUIRED',
              },
          csv: devReportEnabled
            ? {
                available: true as const,
                reason: null,
              }
            : {
                available: false as const,
                reason: 'EXACT_REPORT_EXPORT_SCOPE_AND_COLUMNS_APPROVAL_REQUIRED',
              },
          completeness: 'PARTIAL' as const,
          sources,
          health: 'UNKNOWN' as const,
        };
      },
      {
        maxWait: 10000,
        timeout: 30000,
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      },
    );
  }
  async export(actor: AuthorityActor, query: RoleReportQuery) {
    // Recheck current principal, resource predicates and date before rejecting;
    // never reinterpret a domain read capability as report.export unless DEV_W10 is enabled.
    const report = await this.view(actor, query);
    if (process.env.W10_REPORT_CSV_ENABLED !== 'DEV_W10' || !report.csv.available) {
      throw new ForbiddenException({
        code: 'W10_EXPORT_SCOPE_AND_COLUMNS_UNAPPROVED',
        message: 'CSV chưa có quyền report.export theo resource và mẫu cột được duyệt.',
      });
    }
    const header = [
      'date',
      'timeZone',
      'role',
      'sourceCode',
      'wave',
      'sourceState',
      'recordId',
      'occurredAt',
      'activityLabel',
      'recordState',
      'revision',
      'resourceRef',
    ];
    const dataRows: string[][] = [];
    for (const src of report.sources) {
      if (!src.records || src.records.length === 0) {
        dataRows.push([
          report.window.date,
          report.window.timeZone,
          report.role,
          src.code,
          src.wave,
          src.state,
          '',
          '',
          src.reason ?? 'NO_RECORDS_IN_WINDOW',
          src.state,
          '',
          '',
        ]);
        continue;
      }
      for (const rec of src.records) {
        dataRows.push([
          report.window.date,
          report.window.timeZone,
          report.role,
          src.code,
          src.wave,
          src.state,
          rec.id,
          rec.at,
          rec.label,
          rec.state,
          rec.revision,
          rec.resource,
        ]);
      }
    }
    const csvLines = [
      header.map((col) => encodeSafeCsvCell(col)).join(','),
      ...dataRows.map((row) => row.map((cell) => encodeSafeCsvCell(cell)).join(',')),
    ];
    const csv = '\uFEFF' + csvLines.join('\r\n');
    if (this.db.domainAuditEvent?.create) {
      await this.db.domainAuditEvent.create({
        data: {
          actorId: report.viewerId,
          action: 'W10_ROLE_REPORT_CSV_EXPORT',
          objectType: 'ROLE_REPORT',
          objectId: `${report.role}:${report.window.date}:${report.filters.source}`,
          decision: 'EXPORTED',
          reason: `Xuất CSV báo cáo ngày ${report.window.date} cho vai trò ${report.role} (${dataRows.length} dòng)`,
        },
      });
    }
    return {
      fileName: `smart-english-report-${report.role.toLowerCase()}-${report.window.date}.csv`,
      contentType: 'text/csv; charset=utf-8',
      date: report.window.date,
      role: report.role,
      source: report.filters.source,
      rowCount: dataRows.length,
      csv,
    };
  }

  async trend(actor: AuthorityActor, query: RoleReportQuery, daysParam = 7) {
    this.window(query.date);
    const totalDays = Math.min(14, Math.max(2, Number(daysParam) || 7));
    const [y, m, d] = query.date.split('-').map(Number);
    const dayKeys = Array.from({ length: totalDays }, (_, idx) => {
      const offset = idx - (totalDays - 1);
      return new Date(Date.UTC(y, m - 1, d + offset, 12, 0, 0)).toISOString().slice(0, 10);
    });
    const completedSet = new Set([
      'PUBLISHED',
      'CONFIRMED',
      'APPROVED',
      'REVIEWED_FINAL',
      'ISSUED',
      'ACKNOWLEDGED',
      'OUT',
      'COMPLETED',
      'PAID',
      'AUTO_SETTLED',
      'SETTLED',
      'CLOSED',
      'RESOLVED',
      'ALLOW',
      'RECORDED',
      'QUERY_SUCCEEDED',
      'RETURNED_TO_COUNSELOR',
    ]);
    const series = [];
    for (const dayDate of dayKeys) {
      const r = await this.view(actor, { date: dayDate, source: query.source });
      let total = 0;
      let completed = 0;
      const bySource: Record<string, number> = {};
      for (const s of r.sources) {
        const recs = s.records ?? [];
        bySource[s.code] = recs.length;
        total += recs.length;
        for (const rec of recs) {
          if (completedSet.has(rec.state)) completed += 1;
        }
      }
      series.push({ date: dayDate, total, completed, bySource });
    }
    return {
      endDate: query.date,
      days: series,
    };
  }
}
