import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuthorityActor } from '../authorization/authorization.service';
import { ClassLmsService } from '../class-lms/class-lms.service';
import { CertificatesWorkspaceService } from './certificates-workspace.service';

@Injectable()
export class CompletionReadinessService {
  constructor(
    private readonly db: PrismaService,
    private readonly lms: ClassLmsService,
    @Optional() private readonly workspace?: CertificatesWorkspaceService,
  ) {}

  read(actor: AuthorityActor) {
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
        const user = await this.lms.context(tx, actor);
        if (user.role !== 'STUDENT')
          throw new ForbiddenException('Learner owner session required');
        const w09Enabled = Boolean(this.workspace?.isW09Enabled());
        const rows = await tx.enrollment.findMany({
          where: {
            learnerId: user.id,
            status: w09Enabled ? { in: ['ACTIVE', 'COMPLETED'] } : 'ACTIVE',
          },
          orderBy: [{ enrolledAt: 'desc' }, { id: 'asc' }],
          select: {
            id: true,
            status: true,
            classOffering: {
              select: { id: true, code: true, name: true, versionId: true },
            },
          },
        });

        if (!w09Enabled || rows.length === 0) {
          return {
            assessment: 'PENDING_POLICY' as const,
            certificates: null,
            issuanceAvailable: false as const,
            certificateRecordsVerified: false as const,
            enrollments: rows.map((e) => ({
              enrollmentId: e.id,
              classId: e.classOffering.id,
              classCode: e.classOffering.code,
              className: e.classOffering.name,
              courseVersionId: e.classOffering.versionId,
              assessment: 'NOT_EVALUATED' as const,
            })),
          };
        }

        const enrollmentIds = rows.map((r) => r.id);
        const [certs, lmsProgressRows] = await Promise.all([
          tx
            .$queryRaw<any[]>`
              SELECT
                cert.id,
                cert."certificateCode",
                cert."enrollmentId",
                cert."policyId",
                cert."reviewId",
                cert."isTestPolicy",
                cert.state,
                cert."immutableSnapshot",
                cert."issuedAt",
                cert."revokedAt",
                cert."revokeReason"
              FROM w09_certificates cert
              WHERE cert."enrollmentId" = ANY(${enrollmentIds}::uuid[])
            `
            .catch(() => []),
          tx
            .$queryRaw<
              { enrollmentId: string; totalActivities: number; completedActivities: number }[]
            >`
              SELECT
                e.id::text AS "enrollmentId",
                count(ca.id)::int AS "totalActivities",
                count(*) FILTER (
                  WHERE p.status = 'COMPLETED'
                    OR qa.submitted_cnt > 0
                    OR ar.att_cnt > 0
                    OR asub.sub_cnt > 0
                )::int AS "completedActivities"
              FROM enrollments e
              JOIN class_sections cs
                ON cs."classOfferingId" = e."classOfferingId"
                AND cs."publishedRevisionId" IS NOT NULL
              JOIN class_activities ca
                ON ca."sectionId" = cs.id
                AND ca.state = 'PUBLISHED'
                AND ca."publishedRevisionId" IS NOT NULL
              LEFT JOIN class_activity_revisions car
                ON car.id = ca."publishedRevisionId"
              LEFT JOIN lms_local_activity_kinds lk
                ON lk.activity_id = ca.id::text
              LEFT JOIN class_activity_progress p
                ON p."enrollmentId" = e.id
                AND p."revisionId" = ca."publishedRevisionId"
              LEFT JOIN LATERAL (
                SELECT count(*)::int AS submitted_cnt
                FROM lms_local_quiz_attempts qa
                WHERE qa.enrollment_id = e.id::text
                  AND qa.activity_id = ca.id::text
                  AND qa.status = 'SUBMITTED'
              ) qa ON true
              LEFT JOIN LATERAL (
                SELECT count(*)::int AS att_cnt
                FROM lms_local_attendance_records ar
                WHERE ar.enrollment_id = e.id::text
                  AND ar.activity_id = ca.id::text
              ) ar ON true
              LEFT JOIN LATERAL (
                SELECT count(*)::int AS sub_cnt
                FROM class_assignment_submissions s
                WHERE s."enrollmentId" = e.id
                  AND s."activityId" = ca.id
                  AND s.state IN ('SUBMITTED', 'IN_REVIEW', 'GRADED', 'RETURNED')
              ) asub ON true
              WHERE e.id = ANY(${enrollmentIds}::uuid[])
                AND (
                  lk.kind IN ('LOCAL_ATTENDANCE', 'LOCAL_QUIZ')
                  OR (
                    (car."availableFrom" IS NULL OR car."availableFrom" <= NOW())
                    AND (car.type = 'ASSIGNMENT' OR car."availableUntil" IS NULL OR car."availableUntil" > NOW())
                  )
                )
              GROUP BY e.id
            `
            .catch(() => []),
        ]);

        const enrichedEnrollments = await Promise.all(
          rows.map(async (e) => {
            const evalRes = await this.workspace!
              .evaluateEnrollmentInternal(e.id)
              .catch(() => null);
            const cert = certs.find((c) => c.enrollmentId === e.id) ?? null;
            const lmsRow = lmsProgressRows.find((r) => r.enrollmentId === e.id);
            const totalActivities = Number(lmsRow?.totalActivities ?? 0);
            const completedActivities = Number(lmsRow?.completedActivities ?? 0);
            const lmsProgress =
              totalActivities > 0
                ? {
                    completedActivities,
                    totalActivities,
                    progressPercent: Math.min(
                      100,
                      Math.round((completedActivities / totalActivities) * 100),
                    ),
                  }
                : null;
            const hasApprovedPolicy = evalRes?.policy?.state === 'APPROVED';
            const assessment = cert
              ? (cert.state as 'ISSUED' | 'REVOKED')
              : hasApprovedPolicy
                ? evalRes.status
                : ('NOT_EVALUATED' as const);
            return {
              enrollmentId: e.id,
              enrollmentStatus: e.status,
              classId: e.classOffering.id,
              classCode: e.classOffering.code,
              className: e.classOffering.name,
              courseVersionId: e.classOffering.versionId,
              lmsProgress,
              assessment,
              statusLabel:
                evalRes?.statusLabel ??
                (cert?.state === 'ISSUED'
                  ? 'ĐÃ CẤP CHỨNG CHỈ'
                  : cert?.state === 'REVOKED'
                    ? 'ĐÃ THU HỒI'
                    : 'CHƯA CÓ CHÍNH SÁCH'),
              missingEvidence: evalRes?.missingEvidence ?? [],
              policy: evalRes?.policy ?? null,
              evaluation: evalRes?.evaluation ?? null,
              evidenceSummary: evalRes?.evidenceSummary ?? null,
              certificate: cert,
            };
          }),
        );

        const anyApprovedPolicy = enrichedEnrollments.some(
          (e) => e.policy?.state === 'APPROVED' || e.certificate != null,
        );

        return {
          assessment: anyApprovedPolicy
            ? enrichedEnrollments.some((e) => e.certificate?.state === 'ISSUED')
              ? ('ISSUED' as const)
              : ('EVALUATED' as const)
            : ('PENDING_POLICY' as const),
          certificates: certs.length > 0 ? certs : null,
          issuanceAvailable: anyApprovedPolicy,
          certificateRecordsVerified: certs.length > 0,
          enrollments: enrichedEnrollments,
        };
      },
      { maxWait: 10000, timeout: 15000 },
    );
  }
}
