import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthorityActor } from '../authorization/authorization.service';
import { ClassLmsService } from './class-lms.service';
import { buildQ04ProgressAnalytics } from './class-progress-analytics.helpers';

/** Read-only current-publication progress. Never a completion-policy evaluator. */
@Injectable()
export class ClassProgressService {
  constructor(private readonly lms: ClassLmsService) {}
  read(actor: AuthorityActor, classId: string) {
    return this.lms.run(actor, classId, async (tx, scope) => {
      if (!scope.enrollment || scope.teacher) throw new NotFoundException();
      const sections = await tx.classSection.findMany({
        where: { classOfferingId: classId, publishedRevisionId: { not: null } },
        include: {
          publishedRevision: true,
          activities: { include: { publishedRevision: true }, orderBy: { orderIndex: 'asc' } },
        },
        orderBy: { orderIndex: 'asc' },
      });
      let localKindMap = new Map<string, string>();
      if (typeof tx.$queryRawUnsafe === 'function') {
        try {
          const kinds = (await tx.$queryRawUnsafe(
            `SELECT activity_id, kind FROM lms_local_activity_kinds WHERE class_offering_id = $1`,
            classId,
          )) as any[];
          localKindMap = new Map(kinds.map((r) => [String(r.activity_id), String(r.kind)]));
        } catch {
          // Local tables may not be initialized in unit mocks.
        }
      }
      const isActivityReadable = (revision: any, now: Date) =>
        typeof (this.lms as any).readable === 'function'
          ? (this.lms as any).readable(revision, now, localKindMap.get(revision.activityId) ?? null)
          : this.lms.visible(revision, now);

      const revisions = sections.flatMap((s) =>
        s.activities
          .filter(
            (a) =>
              a.state === 'PUBLISHED' &&
              a.publishedRevision &&
              isActivityReadable(a.publishedRevision, scope.now),
          )
          .map((a) => a.publishedRevision!),
      );
      const revisionIds = revisions.map((r) => r.id);
      const progress = await tx.classActivityProgress.findMany({
        where: { enrollmentId: scope.enrollment.id, revisionId: { in: revisionIds } },
        select: { revisionId: true, status: true },
      });
      const submissions = await tx.classAssignmentSubmission.findMany({
        where: {
          learnerId: actor.id,
          enrollmentId: scope.enrollment.id,
          classOfferingId: classId,
          revisionId: { in: revisionIds },
        },
        select: {
          activityId: true,
          revisionId: true,
          state: true,
          gradeVersions: {
            where: { state: 'PUBLISHED' },
            select: { id: true, number: true },
            orderBy: { number: 'desc' },
            take: 1,
          },
        },
      });
      // Direct read: deliberately do not instantiate ClassQuizService (expiry sweeps).
      const attempts = await tx.testAttempt.findMany({
        where: {
          learnerId: actor.id,
          enrollmentId: scope.enrollment.id,
          quizRevisionId: { in: revisionIds },
        },
        select: { id: true, quizRevisionId: true, status: true, quizPublishedAt: true },
        orderBy: { startedAt: 'desc' },
      });

      let localQuizConfigMap = new Map<string, { assessmentKind: string; passScore: number }>();
      let localQuizAttemptMap = new Map<string, any>();
      let localAssignGradeMap = new Map<string, any>();
      let localAttendanceMap = new Map<string, any>();

      if (typeof tx.$queryRawUnsafe === 'function') {
        try {
          const [qCfgs, qAttempts, aGrades, attRecs] = await Promise.all([
            tx.$queryRawUnsafe(
              `SELECT c.activity_id, c.assessment_kind, c.pass_score
                 FROM lms_local_quiz_configs c
                 JOIN class_activities a ON a.id::text = c.activity_id
                 JOIN class_sections s ON s.id = a."sectionId"
                WHERE s."classOfferingId"::text = $1`,
              classId,
            ) as Promise<any[]>,
            tx.$queryRawUnsafe(
              `SELECT activity_id, status, grading_status, grade_published, total_score, max_score,
                      submitted_at, graded_at, grade_published_at, teacher_feedback
                 FROM lms_local_quiz_attempts
                WHERE class_offering_id = $1 AND enrollment_id = $2
                ORDER BY attempt_number DESC`,
              classId,
              scope.enrollment.id,
            ) as Promise<any[]>,
            tx.$queryRawUnsafe(
              `SELECT ag.activity_id, ag.score, ag.max_score, ag.state, ag.feedback, ag.published_at
                 FROM lms_local_assignment_grades ag
                 JOIN class_assignment_submissions s ON s.id::text = ag.submission_id
                WHERE ag.class_offering_id = $1
                  AND s."enrollmentId"::text = $2
                  AND ag.state = 'PUBLISHED'`,
              classId,
              scope.enrollment.id,
            ) as Promise<any[]>,
            tx.$queryRawUnsafe(
              `SELECT activity_id, status, checked_in_at
                 FROM lms_local_attendance_records
                WHERE class_offering_id = $1 AND enrollment_id = $2`,
              classId,
              scope.enrollment.id,
            ) as Promise<any[]>,
          ]);
          localQuizConfigMap = new Map(
            qCfgs.map((r) => [
              String(r.activity_id),
              {
                assessmentKind: String(r.assessment_kind || 'QUIZ'),
                passScore: Number(r.pass_score ?? 5),
              },
            ]),
          );
          for (const qa of qAttempts) {
            if (!localQuizAttemptMap.has(String(qa.activity_id))) {
              localQuizAttemptMap.set(String(qa.activity_id), qa);
            }
          }
          localAssignGradeMap = new Map(aGrades.map((r) => [String(r.activity_id), r]));
          localAttendanceMap = new Map(attRecs.map((r) => [String(r.activity_id), r]));
        } catch {
          // Local tables may not be initialized in unit mocks.
        }
      }

      const entries = revisions.map((r) => {
        const submission = submissions.find((s) => s.revisionId === r.id),
          attempt = attempts.find((a) => a.quizRevisionId === r.id),
          localKind = localKindMap.get(r.activityId) ?? null,
          qCfg = localQuizConfigMap.get(r.activityId),
          localQuizAttempt = localQuizAttemptMap.get(r.activityId),
          localAssignGrade = localAssignGradeMap.get(r.activityId),
          localAttendance = localAttendanceMap.get(r.activityId);

        let state: string;
        let score: number | null = null;
        let maxScore: number | null = null;

        if (localKind === 'LOCAL_QUIZ') {
          if (!localQuizAttempt) {
            state = 'NOT_STARTED';
          } else if (localQuizAttempt.status === 'IN_PROGRESS') {
            state = 'IN_PROGRESS';
          } else if (
            Boolean(localQuizAttempt.grade_published) &&
            localQuizAttempt.grading_status !== 'PENDING_MANUAL_GRADE'
          ) {
            state = 'PUBLISHED';
            score = Number(localQuizAttempt.total_score ?? 0);
            maxScore = Number(localQuizAttempt.max_score ?? 0);
          } else {
            state = 'PENDING_RELEASE';
          }
        } else if (localKind === 'LOCAL_ATTENDANCE') {
          state = localAttendance ? 'COMPLETED' : 'NOT_STARTED';
        } else if (r.type === 'ASSIGNMENT') {
          if (submission?.gradeVersions.length || (submission?.state === 'SUBMITTED' && localAssignGrade)) {
            state = 'PUBLISHED';
            if (localAssignGrade) {
              score = Number(localAssignGrade.score ?? 0);
              maxScore = Number(localAssignGrade.max_score ?? 10);
            }
          } else {
            state =
              submission?.state === 'SUBMITTED'
                ? 'PENDING_REVIEW'
                : (submission?.state ?? 'NOT_STARTED');
          }
        } else if (r.type === 'QUIZ') {
          state = !attempt
            ? 'NOT_STARTED'
            : attempt.status === 'IN_PROGRESS'
              ? 'IN_PROGRESS'
              : attempt.quizPublishedAt
                ? 'PUBLISHED'
                : 'PENDING_RELEASE';
        } else {
          state = progress.find((p) => p.revisionId === r.id)?.status ?? 'NOT_STARTED';
        }

        return {
          activityId: r.activityId,
          revisionId: r.id,
          revisionNumber: r.number,
          title: r.title,
          type: r.type,
          ...(localKind ? { localKind } : {}),
          ...(qCfg ? { assessmentKind: qCfg.assessmentKind } : {}),
          ...(localAttendance ? { attendanceStatus: String(localAttendance.status) } : {}),
          ...(score !== null ? { score, maxScore } : {}),
          state,
        };
      });

      let w06AttendanceSummary = {
        openedSessions: 0,
        attendedSessions: 0,
        presentCount: 0,
        lateCount: 0,
        items: [] as Array<{
          sessionId: string;
          title: string;
          status: string;
          checkedInAt: string | null;
        }>,
      };
      if (typeof (tx as any).teachingSession?.findMany === 'function') {
        try {
          const officialSessions = await (tx as any).teachingSession.findMany({
            where: {
              classOfferingId: classId,
              state: 'PUBLISHED',
              intent: 'PUBLISH',
            },
            include: {
              w06WindowSession: {
                include: {
                  w06ReceiptWindow: {
                    where: { learnerId: actor.id },
                  },
                  w06CorrectionWindow: {
                    where: { learnerId: actor.id, state: 'APPROVED' },
                    orderBy: { reviewedAt: 'desc' },
                  },
                },
              },
            },
            orderBy: { startsAt: 'asc' },
          });
          for (const s of officialSessions) {
            const win = s.w06WindowSession?.[0];
            if (!win) continue;
            const corr = win.w06CorrectionWindow?.[0];
            const rec = win.w06ReceiptWindow?.[0];
            const effectiveStatus = String(corr?.requestedStatus ?? rec?.status ?? 'ABSENT');
            w06AttendanceSummary.openedSessions += 1;
            if (['PRESENT', 'LATE', 'EXCUSED'].includes(effectiveStatus)) {
              w06AttendanceSummary.attendedSessions += 1;
            }
            if (effectiveStatus === 'PRESENT') w06AttendanceSummary.presentCount += 1;
            if (effectiveStatus === 'LATE') w06AttendanceSummary.lateCount += 1;
            w06AttendanceSummary.items.push({
              sessionId: String(s.id),
              title: `Buổi học ${new Date(s.startsAt).toLocaleDateString('vi-VN')}`,
              status: effectiveStatus,
              checkedInAt: rec?.acceptedAt ? new Date(rec.acceptedAt).toISOString() : null,
            });
          }
        } catch {
          // Unit mocks without teachingSession delegate keep empty W06 rollup.
        }
      }

      const analytics = await buildQ04ProgressAnalytics({
        tx,
        classId,
        actorId: actor.id,
        enrollmentId: scope.enrollment.id,
        now: scope.now,
        sectionsRaw: sections,
        entries,
        localQuizAttemptMap,
        localAssignGradeMap,
        localQuizConfigMap,
        localAttendanceMap,
        w06AttendanceSummary,
        submissions,
        isVisible: isActivityReadable,
      });

      let certificateIssued = false;
      let q05Completion:
        | {
            enabled: boolean;
            hasPolicy: boolean;
            policyCode: string | null;
            policyTitle: string | null;
            isTestPolicy: boolean;
            latestReviewDecision: string | null;
            status: string;
            statusLabel: string;
            certificateCode: string | null;
            certificateState: string | null;
          }
        | undefined;

      if (
        process.env.W09_ENABLED === 'DEV_W09' &&
        process.env.NODE_ENV !== 'production' &&
        typeof (tx as any).$queryRaw === 'function'
      ) {
        try {
          const courseId = (scope.class as any).courseId ?? null;
          const [polRows, revRows, certRows] = await Promise.all([
            courseId
              ? (tx as any).$queryRaw`
                  SELECT id, code, title, "isTestPolicy", state
                  FROM w09_completion_policies
                  WHERE state = 'APPROVED'
                    AND "courseId" = ${courseId}::uuid
                    AND ("classOfferingId" IS NULL OR "classOfferingId" = ${classId}::uuid)
                  ORDER BY
                    CASE WHEN "classOfferingId" = ${classId}::uuid THEN 0 ELSE 1 END,
                    version DESC,
                    "reviewedAt" DESC
                  LIMIT 1
                `
              : Promise.resolve([]),
            (tx as any).$queryRaw`
              SELECT decision, "policyId", "createdAt"
              FROM w09_certificate_reviews
              WHERE "enrollmentId" = ${scope.enrollment.id}::uuid
              ORDER BY "createdAt" DESC
              LIMIT 1
            `,
            (tx as any).$queryRaw`
              SELECT "certificateCode", state, "isTestPolicy", "issuedAt", "revokedAt"
              FROM w09_certificates
              WHERE "enrollmentId" = ${scope.enrollment.id}::uuid
              LIMIT 1
            `,
          ]);
          const pol = polRows?.[0] ?? null;
          const rev = revRows?.[0] ?? null;
          const cert = certRows?.[0] ?? null;
          certificateIssued = cert?.state === 'ISSUED';
          const status = cert?.state
            ? cert.state
            : pol
              ? rev?.decision === 'ELIGIBLE'
                ? 'ELIGIBLE_FOR_REVIEW'
                : 'EVALUATED_WITH_POLICY'
              : 'PENDING_POLICY';
          const statusLabel =
            cert?.state === 'ISSUED'
              ? 'ĐÃ CẤP CHỨNG CHỈ'
              : cert?.state === 'REVOKED'
                ? 'ĐÃ THU HỒI'
                : !pol
                  ? 'CHƯA CÓ CHÍNH SÁCH'
                  : rev?.decision === 'ELIGIBLE'
                    ? 'ĐẠT ĐIỀU KIỆN'
                    : 'Đang theo dõi điều kiện';
          q05Completion = {
            enabled: true,
            hasPolicy: Boolean(pol),
            policyCode: pol?.code ?? null,
            policyTitle: pol?.title ?? null,
            isTestPolicy: Boolean(cert?.isTestPolicy ?? pol?.isTestPolicy),
            latestReviewDecision: rev?.decision ?? null,
            status,
            statusLabel,
            certificateCode: cert?.certificateCode ?? null,
            certificateState: cert?.state ?? null,
          };
        } catch {
          certificateIssued = false;
        }
      }

      return {
        class: { id: classId, code: scope.class.code, name: scope.class.name },
        enrollmentId: scope.enrollment.id,
        courseVersionId: scope.class.versionId,
        observedAt: scope.now.toISOString(),
        completion: 'POLICY_NOT_EVALUATED' as const,
        percentage: null,
        certificateIssued,
        ...(q05Completion ? { q05Completion } : {}),
        summary: {
          totalActivities: entries.length,
          completedOrSubmittedCount: entries.filter((e) =>
            ['COMPLETED', 'PUBLISHED', 'PENDING_REVIEW', 'PENDING_RELEASE', 'SUBMITTED'].includes(
              e.state,
            ),
          ).length,
          publishedGradesCount: entries.filter((e) => e.state === 'PUBLISHED').length,
          attendanceCheckedCount: analytics.assessmentSummary.attendance.checkedCount,
        },
        ...analytics,
        entries,
      };
    });
  }
}
