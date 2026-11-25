import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { evaluateCompletion } from './completion-evaluator';
import type {
  AcademicApproval,
  ApprovedRule,
  CompletionCriterion,
  CompletionEvidence,
  CompletionInput,
  EvidenceReference,
} from './completion.contracts';

export type W09GradeComponent =
  | 'OVERALL_PUBLISHED'
  | 'ASSIGNMENT'
  | 'QUIZ'
  | 'REGULAR'
  | 'MIDTERM'
  | 'FINAL'
  | 'WEIGHTED_TOTAL';

export type W09ScoreScale = 'PERCENT_100' | 'SCORE_10';

export interface W09WeightedComponentRule {
  component: Exclude<W09GradeComponent, 'OVERALL_PUBLISHED' | 'WEIGHTED_TOTAL'>;
  weightPercent: number;
}

export interface W09PolicyCriterionInput {
  criterionId: string;
  domain: 'W03_GRADE' | 'W06_ATTENDANCE' | 'W07_ENTITLEMENT';
  label: string;
  required: boolean;
  minNumericValue?: number;
  minimumNumericValue?: number;
  component?: W09GradeComponent;
  scale?: W09ScoreScale;
  weightPercent?: number;
  weightedComponents?: W09WeightedComponentRule[];
}

export interface CreateCompletionPolicyInput {
  courseId: string;
  classOfferingId?: string | null;
  code: string;
  title: string;
  description: string;
  isTestPolicy?: boolean;
  criteria: W09PolicyCriterionInput[];
  reason: string;
}

export interface UpdateDraftPolicyInput {
  title?: string;
  description?: string;
  isTestPolicy?: boolean;
  criteria: W09PolicyCriterionInput[];
  reason: string;
}

const VALID_COMPONENTS: readonly W09GradeComponent[] = [
  'OVERALL_PUBLISHED',
  'ASSIGNMENT',
  'QUIZ',
  'REGULAR',
  'MIDTERM',
  'FINAL',
  'WEIGHTED_TOTAL',
];

export function q05StatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'ISSUED':
      return 'ĐÃ CẤP CHỨNG CHỈ';
    case 'REVOKED':
      return 'ĐÃ THU HỒI';
    case 'ELIGIBLE_FOR_REVIEW':
      return 'ĐẠT ĐIỀU KIỆN';
    case 'NOT_ELIGIBLE':
      return 'CHƯA ĐẠT';
    case 'PENDING_EVIDENCE':
    case 'PENDING_REVIEW':
      return 'CHƯA ĐỦ DỮ LIỆU';
    case 'PENDING_POLICY':
    case 'NOT_EVALUATED':
    default:
      return 'CHƯA CÓ CHÍNH SÁCH';
  }
}

export interface ReviewCompletionPolicyInput {
  decision: 'APPROVED' | 'REJECTED';
  reason: string;
}

export interface SubmitCertificateReviewInput {
  enrollmentId: string;
  policyId: string;
  decision: 'ELIGIBLE' | 'REJECTED';
  reason: string;
}

export interface IssueCertificateInput {
  enrollmentId: string;
  reviewId: string;
  idempotencyKey: string;
  reason: string;
}

export interface RevokeCertificateInput {
  reason: string;
}

@Injectable()
export class CertificatesWorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  isW09Enabled(): boolean {
    return process.env.W09_ENABLED === 'DEV_W09' && process.env.NODE_ENV !== 'production';
  }

  private assertEnabled(): void {
    if (!this.isW09Enabled()) {
      throw new NotFoundException('Certificate governance workspace is not enabled');
    }
  }

  private async assertActorRole(actorId: string, allowedRoles: string[]) {
    const user = await this.prisma.user.findFirst({
      where: { id: actorId, status: 'ACTIVE' },
      select: { id: true, role: true, fullName: true, email: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException('Insufficient role for certificate governance operation');
    }
    return user;
  }

  private async assertHvuScopedGrant(
    actorId: string,
    capabilities: string[],
    classOfferingId: string | null,
    courseId: string,
  ): Promise<void> {
    await this.assertActorRole(actorId, ['ACADEMIC_MANAGER']);
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM permission_grants
      WHERE "userId" = ${actorId}::uuid
        AND capability = ANY(${capabilities}::text[])
        AND "approvedBy" IS NOT NULL
        AND "revokedAt" IS NULL
        AND "effectiveAt" <= clock_timestamp()
        AND ("expiresAt" IS NULL OR "expiresAt" > clock_timestamp())
        AND (
          ("scopeType" = 'COURSE' AND "scopeId" = ${courseId})
          OR (${classOfferingId}::text IS NOT NULL AND "scopeType" = 'CLASS' AND "scopeId" = ${classOfferingId})
          OR ("scopeType" = 'GLOBAL' AND capability LIKE 'certificate.%')
        )
      LIMIT 1
    `;
    if (!rows.length) {
      throw new ForbiddenException('Scoped HVU authority grant required for this course or class');
    }
  }

  async getWorkspace(actorId: string) {
    this.assertEnabled();
    await this.assertActorRole(actorId, ['ACADEMIC_MANAGER']);

    const [courses, classes, policies, enrollments, certificates] = await Promise.all([
      this.prisma.course.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, title: true, slug: true, level: true },
      }),
      this.prisma.classOffering.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, code: true, name: true, courseId: true, status: true },
      }),
      this.prisma.$queryRaw<any[]>`
        SELECT
          p.id,
          p."courseId",
          p."classOfferingId",
          p.code,
          p.version,
          p.title,
          p.description,
          p."isTestPolicy",
          p.criteria,
          p.state,
          p."makerId",
          m."fullName" AS "makerName",
          p."reviewerId",
          rv."fullName" AS "reviewerName",
          p.reason,
          p."reviewReason",
          p."createdAt",
          p."reviewedAt",
          c.title AS "courseTitle",
          co.code AS "classCode"
        FROM w09_completion_policies p
        JOIN courses c ON c.id = p."courseId"
        LEFT JOIN class_offerings co ON co.id = p."classOfferingId"
        JOIN users m ON m.id = p."makerId"
        LEFT JOIN users rv ON rv.id = p."reviewerId"
        ORDER BY p."createdAt" DESC
      `,
      this.prisma.enrollment.findMany({
        orderBy: { enrolledAt: 'desc' },
        take: 100,
        include: {
          learner: { select: { id: true, fullName: true, email: true } },
          classOffering: {
            select: {
              id: true,
              code: true,
              name: true,
              courseId: true,
              course: { select: { id: true, title: true, level: true } },
            },
          },
        },
      }),
      this.prisma.$queryRaw<any[]>`
        SELECT
          cert.id,
          cert."certificateCode",
          cert."enrollmentId",
          cert."policyId",
          cert."reviewId",
          cert."idempotencyKey",
          cert."isTestPolicy",
          cert.state,
          cert."immutableSnapshot",
          cert."reviewerId",
          rv."fullName" AS "reviewerName",
          cert."issuerId",
          iss."fullName" AS "issuerName",
          cert."issueReason",
          cert."issuedAt",
          cert."revokedById",
          rev."fullName" AS "revokedByName",
          cert."revokeReason",
          cert."revokedAt"
        FROM w09_certificates cert
        JOIN users rv ON rv.id = cert."reviewerId"
        JOIN users iss ON iss.id = cert."issuerId"
        LEFT JOIN users rev ON rev.id = cert."revokedById"
        ORDER BY cert."issuedAt" DESC
      `,
    ]);

    const reviews = await this.prisma.$queryRaw<any[]>`
      SELECT
        r.id,
        r."enrollmentId",
        r."policyId",
        r.decision,
        r."evaluationSnapshot",
        r."reviewerId",
        u."fullName" AS "reviewerName",
        r.reason,
        r."createdAt"
      FROM w09_certificate_reviews r
      JOIN users u ON u.id = r."reviewerId"
      ORDER BY r."createdAt" DESC
    `;

    const enrollmentRows = await Promise.all(
      enrollments.map(async (e) => {
        const evalResult = await this.evaluateEnrollmentInternal(e.id).catch(() => null);
        const latestReview = reviews.find((r) => r.enrollmentId === e.id) ?? null;
        const cert = certificates.find((c) => c.enrollmentId === e.id) ?? null;
        return {
          enrollmentId: e.id,
          status: e.status,
          enrolledAt: e.enrolledAt,
          learner: e.learner,
          classOffering: {
            id: e.classOffering.id,
            code: e.classOffering.code,
            name: e.classOffering.name,
          },
          course: e.classOffering.course,
          evaluation: evalResult,
          latestReview,
          certificate: cert,
        };
      }),
    );

    const events = await this.prisma.$queryRaw<any[]>`
      SELECT
        ev.id,
        ev."certificateId",
        ev."policyId",
        ev."enrollmentId",
        ev."actorId",
        u."fullName" AS "actorName",
        ev.kind,
        ev.reason,
        ev.payload,
        ev."createdAt"
      FROM w09_certificate_events ev
      LEFT JOIN users u ON u.id = ev."actorId"
      ORDER BY ev."createdAt" DESC
      LIMIT 120
    `;

    return {
      courses,
      classes,
      policies,
      enrollments: enrollmentRows,
      certificates,
      reviews,
      events,
    };
  }

  private validateAndNormalizeCriteria(rawCriteria: W09PolicyCriterionInput[]): W09PolicyCriterionInput[] {
    if (!Array.isArray(rawCriteria) || rawCriteria.length === 0) {
      throw new BadRequestException('At least one completion criterion is required');
    }

    const seenIds = new Set<string>();
    const normalized: W09PolicyCriterionInput[] = [];
    const weightValues: number[] = [];

    for (const c of rawCriteria) {
      const criterionId = String(c?.criterionId ?? '').trim();
      const label = String(c?.label ?? '').trim();
      if (
        !criterionId ||
        !label ||
        !['W03_GRADE', 'W06_ATTENDANCE', 'W07_ENTITLEMENT'].includes(c?.domain) ||
        typeof c?.required !== 'boolean'
      ) {
        throw new BadRequestException(`Invalid completion criterion contract: ${JSON.stringify(c)}`);
      }
      if (seenIds.has(criterionId)) {
        throw new BadRequestException(`DUPLICATE_CRITERION_ID: Trùng mã tiêu chí "${criterionId}"`);
      }
      seenIds.add(criterionId);

      const rawMin =
        c.minNumericValue !== undefined && c.minNumericValue !== null
          ? Number(c.minNumericValue)
          : c.minimumNumericValue !== undefined && c.minimumNumericValue !== null
            ? Number(c.minimumNumericValue)
            : undefined;

      if (c.domain === 'W06_ATTENDANCE') {
        if (rawMin === undefined || !Number.isFinite(rawMin) || rawMin < 0 || rawMin > 100) {
          throw new BadRequestException(
            `INVALID_ATTENDANCE_THRESHOLD: Tiêu chí chuyên cần "${label}" phải nhập ngưỡng phần trăm hợp lệ trong khoảng 0 - 100.`,
          );
        }
        normalized.push({
          criterionId,
          domain: 'W06_ATTENDANCE',
          label,
          required: c.required,
          scale: 'PERCENT_100',
          minNumericValue: Math.round(rawMin * 100) / 100,
        });
        continue;
      }

      if (c.domain === 'W03_GRADE') {
        const component: W09GradeComponent = c.component ?? 'OVERALL_PUBLISHED';
        if (!VALID_COMPONENTS.includes(component)) {
          throw new BadRequestException(`INVALID_GRADE_COMPONENT: Thành phần điểm không hợp lệ: ${String(component)}`);
        }
        const scale: W09ScoreScale = c.scale ?? 'PERCENT_100';
        if (scale !== 'PERCENT_100' && scale !== 'SCORE_10') {
          throw new BadRequestException(`INVALID_SCORE_SCALE: Thang điểm không hợp lệ: ${String(scale)}`);
        }
        const maxAllowed = scale === 'SCORE_10' ? 10 : 100;
        if (rawMin === undefined || !Number.isFinite(rawMin) || rawMin < 0 || rawMin > maxAllowed) {
          throw new BadRequestException(
            `INVALID_GRADE_THRESHOLD: Tiêu chí "${label}" phải nhập ngưỡng đạt từ 0 đến ${maxAllowed} theo thang ${scale === 'SCORE_10' ? 'điểm 10' : 'phần trăm 100%'}.`,
          );
        }

        let cleanWeight: number | undefined;
        if (c.weightPercent !== undefined && c.weightPercent !== null) {
          const w = Number(c.weightPercent);
          if (!Number.isFinite(w) || w <= 0 || w > 100) {
            throw new BadRequestException(
              `INVALID_WEIGHT_PERCENT: Tỷ trọng của "${label}" phải nằm trong khoảng (0, 100].`,
            );
          }
          cleanWeight = Math.round(w * 100) / 100;
          weightValues.push(cleanWeight);
        }

        let cleanWeightedComponents: W09WeightedComponentRule[] | undefined;
        if (component === 'WEIGHTED_TOTAL') {
          if (!Array.isArray(c.weightedComponents) || c.weightedComponents.length === 0) {
            throw new BadRequestException(
              `WEIGHTED_COMPONENTS_REQUIRED: Tiêu chí điểm tổng kết "${label}" cần cấu hình các thành phần và tỷ trọng.`,
            );
          }
          let totalW = 0;
          cleanWeightedComponents = c.weightedComponents.map((wc) => {
            const wNum = Number(wc.weightPercent);
            if (
              !['ASSIGNMENT', 'QUIZ', 'REGULAR', 'MIDTERM', 'FINAL'].includes(wc.component) ||
              !Number.isFinite(wNum) ||
              wNum <= 0 ||
              wNum > 100
            ) {
              throw new BadRequestException(
                `INVALID_WEIGHTED_COMPONENT: Thành phần "${wc.component}" phải có tỷ trọng dương (0..100).`,
              );
            }
            totalW += wNum;
            return {
              component: wc.component,
              weightPercent: Math.round(wNum * 100) / 100,
            };
          });
          if (Math.abs(totalW - 100) > 0.01) {
            throw new BadRequestException(
              `WEIGHTED_SUM_INVALID: Tổng tỷ trọng các thành phần trong "${label}" phải bằng đúng 100% (hiện tại: ${totalW}%).`,
            );
          }
        }

        normalized.push({
          criterionId,
          domain: 'W03_GRADE',
          label,
          required: c.required,
          component,
          scale,
          minNumericValue: Math.round(rawMin * 100) / 100,
          ...(cleanWeight !== undefined ? { weightPercent: cleanWeight } : {}),
          ...(cleanWeightedComponents ? { weightedComponents: cleanWeightedComponents } : {}),
        });
        continue;
      }

      normalized.push({
        criterionId,
        domain: 'W07_ENTITLEMENT',
        label,
        required: c.required,
      });
    }

    if (weightValues.length > 0) {
      const sum = Math.round(weightValues.reduce((a, b) => a + b, 0) * 100) / 100;
      if (Math.abs(sum - 100) > 0.01) {
        throw new BadRequestException(
          `CRITERIA_WEIGHT_SUM_INVALID: Tổng tỷ trọng các tiêu chí điểm phải bằng đúng 100% (hiện tại: ${sum}%).`,
        );
      }
    }

    return normalized;
  }

  private async assertNoRetroactiveOfficialConflict(
    courseId: string,
    classOfferingId: string | null,
    isTestPolicy: boolean,
    excludePolicyId?: string,
  ): Promise<void> {
    if (isTestPolicy) {
      return;
    }

    const activeConflicts = await this.prisma.$queryRaw<
      { id: string; code: string; reviewCount: number; certCount: number }[]
    >`
      SELECT
        p.id,
        p.code,
        (SELECT count(*)::int FROM w09_certificate_reviews r WHERE r."policyId" = p.id) AS "reviewCount",
        (SELECT count(*)::int FROM w09_certificates c WHERE c."policyId" = p.id) AS "certCount"
      FROM w09_completion_policies p
      WHERE p.state = 'APPROVED'
        AND p."isTestPolicy" = false
        AND p."courseId" = ${courseId}::uuid
        AND p."classOfferingId" IS NOT DISTINCT FROM ${classOfferingId}::uuid
        AND (${excludePolicyId ?? null}::uuid IS NULL OR p.id <> ${excludePolicyId ?? null}::uuid)
    `;

    const blocked = activeConflicts.find((c) => c.reviewCount > 0 || c.certCount > 0);
    if (blocked) {
      throw new ConflictException(
        `RETROACTIVE_POLICY_CHANGE_BLOCKED: Chính sách chính thức "${blocked.code}" đã có ${blocked.reviewCount} lượt xét duyệt và ${blocked.certCount} chứng chỉ trên phạm vi này; không được áp dụng hồi tố chính sách mới lên lớp/kết quả đã chốt.`,
      );
    }

    if (classOfferingId && activeConflicts.length > 0) {
      throw new ConflictException(
        `RETROACTIVE_POLICY_CHANGE_BLOCKED: Lớp học đã có chính sách chính thức "${activeConflicts[0].code}" đang hiệu lực; không được ghi đè hồi tố lên lớp đang học.`,
      );
    }
  }

  async createPolicy(actorId: string, input: CreateCompletionPolicyInput) {
    this.assertEnabled();
    await this.assertHvuScopedGrant(
      actorId,
      ['certificate.policy.approve', 'academic.program.approve', 'academic.grade.publish'],
      input.classOfferingId ?? null,
      input.courseId,
    );

    if (!input.code?.trim() || input.code.trim().length < 3) {
      throw new BadRequestException('Policy code is required (min 3 chars)');
    }
    if (!input.title?.trim() || input.title.trim().length < 5) {
      throw new BadRequestException('Policy title is required (min 5 chars)');
    }
    if (!input.description?.trim() || input.description.trim().length < 10) {
      throw new BadRequestException('Policy description is required (min 10 chars)');
    }
    if (!input.reason?.trim() || input.reason.trim().length < 10) {
      throw new BadRequestException('Policy authoring reason is required (min 10 chars)');
    }

    const normalizedCriteria = this.validateAndNormalizeCriteria(input.criteria);
    const isTestPolicy = Boolean(input.isTestPolicy);

    await this.assertNoRetroactiveOfficialConflict(
      input.courseId,
      input.classOfferingId ?? null,
      isTestPolicy,
    );

    const existingCount = await this.prisma.$queryRaw<{ cnt: number }[]>`
      SELECT count(*)::int AS cnt FROM w09_completion_policies WHERE "courseId" = ${input.courseId}::uuid
    `;
    const version = (existingCount[0]?.cnt ?? 0) + 1;

    try {
      const [created] = await this.prisma.$queryRaw<any[]>`
        INSERT INTO w09_completion_policies (
          "courseId",
          "classOfferingId",
          code,
          version,
          title,
          description,
          "isTestPolicy",
          criteria,
          state,
          "makerId",
          reason
        )
        VALUES (
          ${input.courseId}::uuid,
          ${input.classOfferingId ?? null}::uuid,
          ${input.code.trim()},
          ${version},
          ${input.title.trim()},
          ${input.description.trim()},
          ${isTestPolicy},
          ${JSON.stringify(normalizedCriteria)}::jsonb,
          'DRAFT',
          ${actorId}::uuid,
          ${input.reason.trim()}
        )
        RETURNING *
      `;

      await this.prisma.$executeRaw`
        INSERT INTO w09_certificate_events ("policyId", "actorId", kind, reason, payload)
        VALUES (
          ${created.id}::uuid,
          ${actorId}::uuid,
          'POLICY_DRAFT_CREATED',
          ${input.reason.trim()},
          ${JSON.stringify({ code: created.code, version, isTestPolicy })}::jsonb
        )
      `;

      return created;
    } catch (e) {
      if (/23505|unique/i.test(String(e))) {
        throw new ConflictException('Policy code already exists');
      }
      throw e;
    }
  }

  async updateDraftPolicy(actorId: string, policyId: string, input: UpdateDraftPolicyInput) {
    this.assertEnabled();
    if (!input.reason?.trim() || input.reason.trim().length < 10) {
      throw new BadRequestException('Update reason must be at least 10 characters');
    }

    const [policy] = await this.prisma.$queryRaw<any[]>`
      SELECT * FROM w09_completion_policies WHERE id = ${policyId}::uuid
    `;
    if (!policy) {
      throw new NotFoundException('Completion policy not found');
    }

    await this.assertHvuScopedGrant(
      actorId,
      ['certificate.policy.approve', 'academic.program.approve', 'academic.grade.publish'],
      policy.classOfferingId ?? null,
      policy.courseId,
    );

    if (policy.state !== 'DRAFT') {
      throw new ConflictException(
        `RETROACTIVE_POLICY_CHANGE_BLOCKED: Chính sách đang ở trạng thái ${policy.state}, không thể chỉnh sửa trực tiếp sau khi đã duyệt hoặc chốt kết quả.`,
      );
    }

    const nextTitle = input.title?.trim() ?? policy.title;
    const nextDescription = input.description?.trim() ?? policy.description;
    if (nextTitle.length < 5) {
      throw new BadRequestException('Policy title is required (min 5 chars)');
    }
    if (nextDescription.length < 10) {
      throw new BadRequestException('Policy description is required (min 10 chars)');
    }

    const normalizedCriteria = this.validateAndNormalizeCriteria(input.criteria);
    const nextIsTestPolicy =
      input.isTestPolicy !== undefined ? Boolean(input.isTestPolicy) : Boolean(policy.isTestPolicy);

    const [updated] = await this.prisma.$queryRaw<any[]>`
      UPDATE w09_completion_policies
      SET title = ${nextTitle},
          description = ${nextDescription},
          "isTestPolicy" = ${nextIsTestPolicy},
          criteria = ${JSON.stringify(normalizedCriteria)}::jsonb,
          reason = ${input.reason.trim()}
      WHERE id = ${policyId}::uuid
      RETURNING *
    `;

    await this.prisma.$executeRaw`
      INSERT INTO w09_certificate_events ("policyId", "actorId", kind, reason, payload)
      VALUES (
        ${policyId}::uuid,
        ${actorId}::uuid,
        'POLICY_DRAFT_UPDATED',
        ${input.reason.trim()},
        ${JSON.stringify({ code: policy.code, criteriaCount: normalizedCriteria.length })}::jsonb
      )
    `;

    return updated;
  }

  async reviewPolicy(actorId: string, policyId: string, input: ReviewCompletionPolicyInput) {
    this.assertEnabled();
    if (!['APPROVED', 'REJECTED'].includes(input.decision)) {
      throw new BadRequestException('Decision must be APPROVED or REJECTED');
    }
    if (!input.reason?.trim() || input.reason.trim().length < 10) {
      throw new BadRequestException('Review reason must be at least 10 characters');
    }

    const [policy] = await this.prisma.$queryRaw<any[]>`
      SELECT * FROM w09_completion_policies WHERE id = ${policyId}::uuid
    `;
    if (!policy) {
      throw new NotFoundException('Completion policy not found');
    }

    await this.assertHvuScopedGrant(
      actorId,
      ['certificate.policy.approve', 'academic.program.approve'],
      policy.classOfferingId ?? null,
      policy.courseId,
    );

    if (policy.state !== 'DRAFT') {
      throw new ConflictException(`Policy is already in terminal review state: ${policy.state}`);
    }

    if (input.decision === 'APPROVED') {
      await this.assertNoRetroactiveOfficialConflict(
        policy.courseId,
        policy.classOfferingId ?? null,
        Boolean(policy.isTestPolicy),
        policy.id,
      );
    }

    const [updated] = await this.prisma.$queryRaw<any[]>`
      UPDATE w09_completion_policies
      SET state = ${input.decision},
          "reviewerId" = ${actorId}::uuid,
          "reviewReason" = ${input.reason.trim()},
          "reviewedAt" = clock_timestamp()
      WHERE id = ${policyId}::uuid
      RETURNING *
    `;

    await this.prisma.$executeRaw`
      INSERT INTO w09_certificate_events ("policyId", "actorId", kind, reason, payload)
      VALUES (
        ${policyId}::uuid,
        ${actorId}::uuid,
        ${input.decision === 'APPROVED' ? 'POLICY_APPROVED' : 'POLICY_REJECTED'},
        ${input.reason.trim()},
        ${JSON.stringify({ decision: input.decision, reviewerId: actorId })}::jsonb
      )
    `;

    return updated;
  }

  async previewPolicy(actorId: string, policyId: string) {
    this.assertEnabled();
    await this.assertActorRole(actorId, ['ACADEMIC_MANAGER']);
    const [policy] = await this.prisma.$queryRaw<any[]>`
      SELECT * FROM w09_completion_policies WHERE id = ${policyId}::uuid
    `;
    if (!policy) {
      throw new NotFoundException('Completion policy not found');
    }

    const enrollments = await this.prisma.enrollment.findMany({
      where: policy.classOfferingId
        ? { classOfferingId: policy.classOfferingId }
        : { classOffering: { courseId: policy.courseId } },
      orderBy: { enrolledAt: 'desc' },
      take: 30,
      include: {
        learner: { select: { id: true, fullName: true, email: true } },
        classOffering: { select: { id: true, code: true, name: true } },
      },
    });

    const previews = await Promise.all(
      enrollments.map(async (e) => {
        const evalRes = await this.evaluateEnrollmentInternal(e.id, policyId, {
          allowDraftPreview: true,
        });
        return {
          enrollmentId: e.id,
          learner: e.learner,
          classOffering: e.classOffering,
          status: evalRes.status,
          statusLabel: evalRes.statusLabel,
          missingEvidence: evalRes.missingEvidence,
          evaluation: evalRes.evaluation,
          evidenceSummary: evalRes.evidenceSummary,
        };
      }),
    );

    const summaryCounts = previews.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    }, {});

    return {
      policy,
      previewMode: true,
      sampleCount: previews.length,
      summaryCounts,
      enrollments: previews,
    };
  }

  async evaluateEnrollmentForActor(actorId: string, enrollmentId: string, policyId?: string) {
    this.assertEnabled();
    const user = await this.assertActorRole(actorId, ['ACADEMIC_MANAGER', 'STUDENT']);
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        classOffering: { include: { course: true } },
      },
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }
    if (user.role === 'STUDENT' && enrollment.learnerId !== actorId) {
      throw new NotFoundException('Enrollment not found');
    }
    return this.evaluateEnrollmentInternal(enrollmentId, policyId);
  }

  async evaluateEnrollmentInternal(
    enrollmentId: string,
    explicitPolicyId?: string,
    options?: { allowDraftPreview?: boolean },
  ) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        learner: { select: { id: true, fullName: true, email: true } },
        classOffering: {
          include: {
            course: { select: { id: true, title: true, level: true, slug: true } },
          },
        },
      },
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }

    let policies: any[] = [];
    if (explicitPolicyId) {
      policies = await this.prisma.$queryRaw<any[]>`
        SELECT * FROM w09_completion_policies
        WHERE id = ${explicitPolicyId}::uuid
      `;
    } else {
      policies = await this.prisma.$queryRaw<any[]>`
        SELECT * FROM w09_completion_policies
        WHERE state = 'APPROVED'
          AND "courseId" = ${enrollment.classOffering.courseId}::uuid
          AND ("classOfferingId" IS NULL OR "classOfferingId" = ${enrollment.classOfferingId}::uuid)
        ORDER BY
          CASE WHEN "classOfferingId" = ${enrollment.classOfferingId}::uuid THEN 0 ELSE 1 END,
          version DESC,
          "reviewedAt" DESC
        LIMIT 1
      `;
    }

    const existingCert = await this.prisma
      .$queryRaw<any[]>`
        SELECT id, "certificateCode", state, "isTestPolicy", "issuedAt", "revokedAt", "revokeReason"
        FROM w09_certificates
        WHERE "enrollmentId" = ${enrollmentId}::uuid
        LIMIT 1
      `
      .catch(() => []);
    const certRecord = existingCert?.[0] ?? null;

    const policy = policies[0] ?? null;
    if (!policy || (policy.state !== 'APPROVED' && !options?.allowDraftPreview)) {
      const noPolStatus =
        certRecord?.state === 'ISSUED'
          ? ('ISSUED' as const)
          : certRecord?.state === 'REVOKED'
            ? ('REVOKED' as const)
            : ('PENDING_POLICY' as const);
      return {
        enrollmentId,
        status: 'PENDING_POLICY' as const,
        effectiveStatus: noPolStatus,
        statusLabel: q05StatusLabel(noPolStatus),
        missingEvidence: [
          'Chưa có chính sách hoàn thành được Học vụ phê duyệt cho khóa học/lớp học này.',
        ],
        policy: policy
          ? {
              id: policy.id,
              code: policy.code,
              title: policy.title,
              state: policy.state,
              isTestPolicy: policy.isTestPolicy,
            }
          : null,
        evaluation: null,
        evidenceSummary: null,
        certificate: certRecord,
      };
    }

    const criteria = (policy.criteria ?? []) as W09PolicyCriterionInput[];
    const nowIso = new Date().toISOString();

    type NormalizedGradeItem = {
      id: string;
      activityId: string;
      title: string;
      component: 'ASSIGNMENT' | 'QUIZ' | 'REGULAR' | 'MIDTERM' | 'FINAL';
      percent: number;
      score: number;
      maxScore: number;
      publishedAt: string | null;
      source: 'PRISMA' | 'LMS_LOCAL';
    };

    // 1. Gather Unified W03 Grade Evidence (Prisma + lms_local_* tables; NO DRAFT, NO PLACEMENT)
    const [
      assignmentGrades,
      quizAttempts,
      localAssignGrades,
      localQuizAttempts,
      pendingAssignSubmissions,
      pendingLocalQuizzes,
    ] = await Promise.all([
      this.prisma.assignmentGrade.findMany({
        where: {
          submission: { enrollmentId },
          state: 'PUBLISHED',
        },
        include: {
          rubric: { include: { criteria: true } },
          criterionScores: true,
        },
        orderBy: { publishedAt: 'desc' },
      }),
      this.prisma.testAttempt.findMany({
        where: {
          enrollmentId,
          quizPublishedAt: { not: null },
          test: { purpose: { not: 'PLACEMENT' } },
        },
        include: {
          test: { select: { id: true, title: true, purpose: true } },
        },
        orderBy: { submittedAt: 'desc' },
      }),
      this.prisma
        .$queryRaw<
          {
            submissionId: string;
            activityId: string;
            title: string | null;
            score: string | number;
            maxScore: string | number;
            publishedAt: Date | null;
          }[]
        >`
          SELECT
            g.submission_id AS "submissionId",
            g.activity_id AS "activityId",
            r.title,
            g.score,
            g.max_score AS "maxScore",
            COALESCE(g.published_at, g.updated_at) AS "publishedAt"
          FROM lms_local_assignment_grades g
          JOIN class_assignment_submissions s ON s.id::text = g.submission_id
          JOIN class_activities ca ON ca.id::text = g.activity_id
          JOIN class_sections cs ON cs.id = ca."sectionId"
          LEFT JOIN class_activity_revisions r ON r.id = ca."publishedRevisionId"
          WHERE s."enrollmentId" = ${enrollmentId}::uuid
            AND (g.state = 'PUBLISHED' OR g.published_at IS NOT NULL)
            AND ca.state = 'PUBLISHED'
            AND cs."publishedRevisionId" IS NOT NULL
            AND g.max_score > 0
          ORDER BY COALESCE(g.published_at, g.updated_at) DESC
        `
        .catch(() => []),
      this.prisma
        .$queryRaw<
          {
            id: string;
            activityId: string;
            title: string | null;
            assessmentKind: string | null;
            totalScore: string | number | null;
            autoScore: string | number | null;
            manualScore: string | number | null;
            maxScore: string | number;
            publishedAt: Date | null;
          }[]
        >`
          SELECT DISTINCT ON (qa.activity_id)
            qa.id,
            qa.activity_id AS "activityId",
            r.title,
            COALESCE(qc.assessment_kind, 'QUIZ') AS "assessmentKind",
            qa.total_score AS "totalScore",
            qa.auto_score AS "autoScore",
            qa.manual_score AS "manualScore",
            qa.max_score AS "maxScore",
            COALESCE(qa.grade_published_at, qa.submitted_at) AS "publishedAt"
          FROM lms_local_quiz_attempts qa
          JOIN class_activities ca ON ca.id::text = qa.activity_id
          JOIN class_sections cs ON cs.id = ca."sectionId"
          LEFT JOIN class_activity_revisions r ON r.id = ca."publishedRevisionId"
          LEFT JOIN lms_local_quiz_configs qc ON qc.activity_id = qa.activity_id
          WHERE qa.enrollment_id = ${enrollmentId}
            AND qa.grade_published = true
            AND ca.state = 'PUBLISHED'
            AND cs."publishedRevisionId" IS NOT NULL
            AND qa.max_score > 0
          ORDER BY qa.activity_id, COALESCE(qa.grade_published_at, qa.submitted_at) DESC, qa.attempt_number DESC
        `
        .catch(() => []),
      this.prisma
        .$queryRaw<{ cnt: number }[]>`
          SELECT count(*)::int AS cnt
          FROM class_assignment_submissions s
          LEFT JOIN lms_local_assignment_grades g ON g.submission_id = s.id::text AND (g.state = 'PUBLISHED' OR g.published_at IS NOT NULL)
          WHERE s."enrollmentId" = ${enrollmentId}::uuid
            AND s.state IN ('SUBMITTED', 'IN_REVIEW')
            AND g.submission_id IS NULL
        `
        .catch(() => []),
      this.prisma
        .$queryRaw<{ kind: string; cnt: number }[]>`
          SELECT COALESCE(qc.assessment_kind, 'QUIZ') AS kind, count(*)::int AS cnt
          FROM lms_local_quiz_attempts qa
          JOIN class_activities ca ON ca.id::text = qa.activity_id
          JOIN class_sections cs ON cs.id = ca."sectionId"
          LEFT JOIN lms_local_quiz_configs qc ON qc.activity_id = qa.activity_id
          WHERE qa.enrollment_id = ${enrollmentId}
            AND qa.grade_published = false
            AND ca.state = 'PUBLISHED'
            AND cs."publishedRevisionId" IS NOT NULL
          GROUP BY 1
        `
        .catch(() => []),
    ]);

    const gradeItems: NormalizedGradeItem[] = [];
    const seenActivityIds = new Set<string>();

    for (const lg of localAssignGrades) {
      const score = Number(lg.score);
      const maxScore = Number(lg.maxScore);
      if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) continue;
      seenActivityIds.add(`ASSIGN:${lg.activityId}`);
      gradeItems.push({
        id: lg.submissionId,
        activityId: lg.activityId,
        title: lg.title ?? 'Bài tập Assignment',
        component: 'ASSIGNMENT',
        percent: Math.round((score / maxScore) * 10000) / 100,
        score,
        maxScore,
        publishedAt: lg.publishedAt ? new Date(lg.publishedAt).toISOString() : null,
        source: 'LMS_LOCAL',
      });
    }

    for (const g of assignmentGrades) {
      const max = g.rubric.criteria.reduce((acc, c) => acc + Number(c.maxScore), 0);
      const earned = g.criterionScores.reduce((acc, s) => acc + Number(s.score), 0);
      if (max > 0 && !seenActivityIds.has(`ASSIGN_PRISMA:${g.id}`)) {
        seenActivityIds.add(`ASSIGN_PRISMA:${g.id}`);
        gradeItems.push({
          id: g.id,
          activityId: g.id,
          title: 'Bài tập chấm Rubric',
          component: 'ASSIGNMENT',
          percent: Math.round((earned / max) * 10000) / 100,
          score: earned,
          maxScore: max,
          publishedAt: g.publishedAt ? new Date(g.publishedAt).toISOString() : null,
          source: 'PRISMA',
        });
      }
    }

    for (const lq of localQuizAttempts) {
      const maxScore = Number(lq.maxScore);
      const total =
        lq.totalScore !== null && lq.totalScore !== undefined
          ? Number(lq.totalScore)
          : Number(lq.autoScore ?? 0) + Number(lq.manualScore ?? 0);
      if (!Number.isFinite(total) || !Number.isFinite(maxScore) || maxScore <= 0) continue;
      const rawKind = String(lq.assessmentKind ?? 'QUIZ').toUpperCase();
      if (rawKind === 'PLACEMENT') continue;
      const component: NormalizedGradeItem['component'] =
        rawKind === 'REGULAR' || rawKind === 'MIDTERM' || rawKind === 'FINAL'
          ? rawKind
          : 'QUIZ';
      seenActivityIds.add(`QUIZ:${lq.activityId}`);
      gradeItems.push({
        id: lq.id,
        activityId: lq.activityId,
        title: lq.title ?? `Bài kiểm tra ${component}`,
        component,
        percent: Math.round((total / maxScore) * 10000) / 100,
        score: total,
        maxScore,
        publishedAt: lq.publishedAt ? new Date(lq.publishedAt).toISOString() : null,
        source: 'LMS_LOCAL',
      });
    }

    for (const q of quizAttempts) {
      if (q.score != null && q.maxScore && Number(q.maxScore) > 0) {
        const purpose = String((q as any).test?.purpose ?? '').toUpperCase();
        if (purpose === 'PLACEMENT') continue;
        const component: NormalizedGradeItem['component'] =
          purpose === 'MIDTERM'
            ? 'MIDTERM'
            : purpose === 'FINAL'
              ? 'FINAL'
              : purpose === 'PRACTICE'
                ? 'QUIZ'
                : 'REGULAR';
        const score = Number(q.score);
        const maxScore = Number(q.maxScore);
        gradeItems.push({
          id: q.id,
          activityId: q.testId,
          title: (q as any).test?.title ?? `Bài kiểm tra ${component}`,
          component,
          percent: Math.round((score / maxScore) * 10000) / 100,
          score,
          maxScore,
          publishedAt: q.quizPublishedAt ? new Date(q.quizPublishedAt).toISOString() : null,
          source: 'PRISMA',
        });
      }
    }

    const componentAverage = (comp: W09GradeComponent, weighted?: W09WeightedComponentRule[]) => {
      if (comp === 'WEIGHTED_TOTAL') {
        if (!weighted?.length) return undefined;
        let sumWeight = 0;
        let acc = 0;
        for (const w of weighted) {
          const items = gradeItems.filter((g) => g.component === w.component);
          if (items.length === 0) {
            // Missing required component cannot be treated as 0
            return undefined;
          }
          const avg = items.reduce((s, it) => s + it.percent, 0) / items.length;
          acc += avg * (w.weightPercent / 100);
          sumWeight += w.weightPercent;
        }
        return sumWeight > 0 ? Math.round(acc * 100) / 100 : undefined;
      }

      const items =
        comp === 'OVERALL_PUBLISHED'
          ? gradeItems
          : gradeItems.filter((g) => g.component === comp);
      if (items.length === 0) return undefined;
      return Math.round((items.reduce((a, b) => a + b.percent, 0) / items.length) * 100) / 100;
    };

    const avgGradePercent = componentAverage('OVERALL_PUBLISHED');
    const componentAverages = {
      OVERALL_PUBLISHED: avgGradePercent ?? null,
      ASSIGNMENT: componentAverage('ASSIGNMENT') ?? null,
      QUIZ: componentAverage('QUIZ') ?? null,
      REGULAR: componentAverage('REGULAR') ?? null,
      MIDTERM: componentAverage('MIDTERM') ?? null,
      FINAL: componentAverage('FINAL') ?? null,
    };

    // 2. Gather W06 + lms_local_attendance_records Attendance Evidence (NO w08_clock)
    const [officialSessions, localOpenAttActivities, localAttRecords] = await Promise.all([
      this.prisma.teachingSession.findMany({
        where: {
          classOfferingId: enrollment.classOfferingId,
          state: 'PUBLISHED',
          intent: 'PUBLISH',
        },
        include: {
          w06WindowSession: {
            include: {
              w06ReceiptWindow: {
                where: { learnerId: enrollment.learnerId },
              },
              w06CorrectionWindow: {
                where: {
                  learnerId: enrollment.learnerId,
                  state: 'APPROVED',
                },
                orderBy: { reviewedAt: 'desc' },
                take: 1,
              },
            },
          },
        },
      }),
      this.prisma
        .$queryRaw<{ activityId: string }[]>`
          SELECT ca.id::text AS "activityId"
          FROM class_activities ca
          JOIN class_sections cs ON cs.id = ca."sectionId"
          JOIN class_activity_revisions r ON r.id = ca."publishedRevisionId"
          JOIN lms_local_activity_kinds k ON k.activity_id = ca.id::text
          WHERE cs."classOfferingId" = ${enrollment.classOfferingId}::uuid
            AND ca.state = 'PUBLISHED'
            AND cs."publishedRevisionId" IS NOT NULL
            AND k.kind = 'LOCAL_ATTENDANCE'
            AND (r."availableFrom" IS NULL OR r."availableFrom" <= clock_timestamp())
        `
        .catch(() => []),
      this.prisma
        .$queryRaw<{ id: string; activityId: string; status: string }[]>`
          SELECT id, activity_id AS "activityId", status
          FROM lms_local_attendance_records
          WHERE enrollment_id = ${enrollmentId}
        `
        .catch(() => []),
    ]);

    let w06OpenedSessions = 0;
    let w06AttendedSessions = 0;
    for (const s of officialSessions) {
      const win = s.w06WindowSession?.[0];
      if (!win) continue;
      w06OpenedSessions += 1;
      const corr = win.w06CorrectionWindow?.[0];
      const rec = win.w06ReceiptWindow?.[0];
      const effectiveStatus = corr?.requestedStatus ?? rec?.status ?? 'ABSENT';
      if (['PRESENT', 'LATE', 'EXCUSED'].includes(effectiveStatus)) {
        w06AttendedSessions += 1;
      }
    }

    const localAttActivityIds = new Set<string>([
      ...localOpenAttActivities.map((a) => a.activityId),
      ...localAttRecords.map((r) => r.activityId),
    ]);
    const localRecordByActivity = new Map(localAttRecords.map((r) => [r.activityId, r]));
    let localAttendedSessions = 0;
    for (const actId of localAttActivityIds) {
      const rec = localRecordByActivity.get(actId);
      if (rec && ['PRESENT', 'LATE', 'EXCUSED'].includes(String(rec.status).toUpperCase())) {
        localAttendedSessions += 1;
      }
    }

    const totalOpenedSessions = w06OpenedSessions + localAttActivityIds.size;
    const attendedSessions = w06AttendedSessions + localAttendedSessions;
    const hasAttendanceEvidence = totalOpenedSessions > 0;
    const attendanceRatePercent = hasAttendanceEvidence
      ? Math.round((attendedSessions / totalOpenedSessions) * 10000) / 100
      : undefined;

    // 3. Gather W07 Entitlement / Enrollment Standing Evidence
    const w07Apps = await this.prisma.$queryRaw<{ id: string; state: string }[]>`
      SELECT id, state FROM w07_applications
      WHERE "enrollmentId" = ${enrollmentId}::uuid
      ORDER BY "createdAt" DESC
      LIMIT 1
    `.catch(() => []);
    const entitlementActive =
      enrollment.status === 'ACTIVE' ||
      enrollment.status === 'COMPLETED' ||
      w07Apps.some((a) => a.state === 'ENROLLED' || a.state === 'PAID_VERIFIED');

    const courseVersionId =
      enrollment.classOffering.versionId ?? enrollment.classOffering.courseId;
    const scope = {
      enrollmentId,
      classOfferingId: enrollment.classOfferingId,
      courseVersionId,
    };
    const approvedAtIso = policy.reviewedAt
      ? new Date(policy.reviewedAt).toISOString()
      : nowIso;
    const policyApproval: AcademicApproval = {
      decisionId: `dec-policy-${policy.id}`,
      actorId: policy.reviewerId ?? policy.makerId,
      approvedAt: approvedAtIso,
    };
    const makeRule = (id: string): ApprovedRule => ({
      ref: { id, revision: `v${policy.version}` },
      approval: policyApproval,
    });
    const courseVersionRef: EvidenceReference = {
      id: courseVersionId,
      revision: 'cv-approved-v1',
    };
    const policyRef: EvidenceReference = {
      id: policy.id,
      revision: `v${policy.version}`,
    };

    const evaluatorCriteria: CompletionCriterion[] = [];
    const evaluatorEvidence: CompletionEvidence[] = [];
    const evidencePins: Record<string, EvidenceReference> = {};
    const criterionMetaMap = new Map<
      string,
      {
        component: W09GradeComponent | 'ATTENDANCE' | 'ENTITLEMENT';
        scale: W09ScoreScale;
        observedValue: number | null;
        minNumericValue: number | null;
        missingReason: string | null;
      }
    >();

    for (const c of criteria) {
      const rawThreshold =
        c.minNumericValue !== undefined && c.minNumericValue !== null
          ? Number(c.minNumericValue)
          : c.minimumNumericValue !== undefined && c.minimumNumericValue !== null
            ? Number(c.minimumNumericValue)
            : NaN;

      if (c.domain === 'W03_GRADE') {
        const component: W09GradeComponent = c.component ?? 'OVERALL_PUBLISHED';
        const scale: W09ScoreScale = c.scale ?? 'PERCENT_100';
        const selRule = makeRule(`rule-w03-sel-${c.criterionId}`);
        const rndRule = makeRule(`rule-w03-rnd-${c.criterionId}`);
        const hasValidThreshold = Number.isFinite(rawThreshold);

        const metricPercent = componentAverage(component, c.weightedComponents);
        const hasComponentData = metricPercent !== undefined;
        const observedValue =
          metricPercent !== undefined
            ? scale === 'SCORE_10'
              ? Math.round((metricPercent / 10) * 100) / 100
              : metricPercent
            : null;

        let missingReason: string | null = null;
        if (!hasValidThreshold) {
          missingReason = `Tiêu chí "${c.label}" chưa có ngưỡng đạt cấu hình (hệ thống không tự áp dụng ngưỡng mặc định).`;
        } else if (!hasComponentData) {
          const pendingForComp =
            component === 'ASSIGNMENT'
              ? pendingAssignSubmissions?.[0]?.cnt ?? 0
              : pendingLocalQuizzes.find((p) => p.kind === component)?.cnt ?? 0;
          missingReason =
            pendingForComp > 0
              ? `Tiêu chí "${c.label}" (${component}): hiện có ${pendingForComp} bài đang chờ chấm/công bố điểm.`
              : `Tiêu chí "${c.label}" (${component}): chưa có kết quả đã công bố trong lớp.`;
        }

        criterionMetaMap.set(c.criterionId, {
          component,
          scale,
          observedValue,
          minNumericValue: hasValidThreshold ? rawThreshold : null,
          missingReason,
        });

        evaluatorCriteria.push({
          id: c.criterionId,
          mandatory: Boolean(c.required),
          kind: 'W03_GRADE',
          threshold: { minimum: hasValidThreshold ? rawThreshold : 0, scale },
          selectionRule: selRule,
          roundingRule: rndRule,
          exemptionRule: null,
        });
        const evRef: EvidenceReference = {
          id:
            gradeItems[0]?.id ??
            assignmentGrades[0]?.id ??
            quizAttempts[0]?.id ??
            `w03-ev-${enrollmentId}`,
          revision:
            hasValidThreshold && hasComponentData ? `pub-${component}-${observedValue}` : 'pending',
        };
        evidencePins[c.criterionId] = evRef;
        evaluatorEvidence.push({
          criterionId: c.criterionId,
          scope,
          ref: evRef,
          kind: 'W03_GRADE',
          state: hasValidThreshold && hasComponentData ? 'PUBLISHED' : 'PENDING',
          finalized: hasValidThreshold && hasComponentData,
          publication: hasValidThreshold && hasComponentData ? policyApproval : null,
          selectionRuleRef: selRule.ref,
          roundingRuleRef: rndRule.ref,
          value: hasValidThreshold && observedValue !== null ? observedValue : null,
          scale,
        });
      } else if (c.domain === 'W06_ATTENDANCE') {
        const calcRule = makeRule(`rule-w06-calc-${c.criterionId}`);
        const hasValidThreshold = Number.isFinite(rawThreshold);
        const missingReason = !hasValidThreshold
          ? `Tiêu chí "${c.label}" chưa có ngưỡng chuyên cần cấu hình.`
          : !hasAttendanceEvidence
            ? `Tiêu chí "${c.label}": chưa có buổi điểm danh mở nào trong lớp.`
            : null;

        criterionMetaMap.set(c.criterionId, {
          component: 'ATTENDANCE',
          scale: 'PERCENT_100',
          observedValue: attendanceRatePercent ?? null,
          minNumericValue: hasValidThreshold ? rawThreshold : null,
          missingReason,
        });

        evaluatorCriteria.push({
          id: c.criterionId,
          mandatory: Boolean(c.required),
          kind: 'W06_ATTENDANCE',
          calculationRule: calcRule,
          exemptionRule: null,
        });
        const evRef: EvidenceReference = {
          id: `w06-rollup-${enrollment.classOfferingId}-${enrollment.learnerId}`,
          revision:
            hasValidThreshold && hasAttendanceEvidence
              ? `att-${attendanceRatePercent}`
              : 'pending',
        };
        evidencePins[c.criterionId] = evRef;

        const sessionRefs: EvidenceReference[] = [
          ...officialSessions
            .filter((s) => s.w06WindowSession?.length)
            .map((s) => ({ id: s.id, revision: `rev-${s.revision}` })),
          ...[...localAttActivityIds].map((id) => ({ id, revision: 'local-open-v1' })),
        ];
        const receiptRefs: EvidenceReference[] = [
          ...officialSessions
            .flatMap((s) => s.w06WindowSession?.[0]?.w06ReceiptWindow ?? [])
            .map((r) => ({ id: r.id, revision: 'v1' })),
          ...localAttRecords.map((r) => ({ id: r.id, revision: 'local-att-v1' })),
        ];
        const corrections = officialSessions
          .flatMap((s) => s.w06WindowSession?.[0]?.w06CorrectionWindow ?? [])
          .map((corr) => ({
            ref: { id: corr.id, revision: 'v1' },
            state: 'APPROVED' as const,
            approval: {
              decisionId: `corr-${corr.id}`,
              actorId: corr.reviewerId ?? policyApproval.actorId,
              approvedAt: corr.reviewedAt ? corr.reviewedAt.toISOString() : approvedAtIso,
            },
          }));
        if (hasAttendanceEvidence && !receiptRefs.length && !corrections.length) {
          receiptRefs.push({ id: `w06-absent-obs-${enrollmentId}`, revision: 'v1' });
        }

        const attSatisfied =
          hasValidThreshold &&
          hasAttendanceEvidence &&
          (attendanceRatePercent ?? 0) >= rawThreshold;

        evaluatorEvidence.push({
          criterionId: c.criterionId,
          scope,
          ref: evRef,
          kind: 'W06_ATTENDANCE',
          state: hasValidThreshold && hasAttendanceEvidence ? 'OFFICIAL_CONFIRMED' : 'PENDING',
          sessionRefs,
          receiptRefs,
          corrections,
          calculationRuleRef: calcRule.ref,
          outcome:
            !hasValidThreshold || !hasAttendanceEvidence
              ? 'PENDING'
              : attSatisfied
                ? 'SATISFIED'
                : 'NOT_MET',
        });
      } else if (c.domain === 'W07_ENTITLEMENT') {
        const valRule = makeRule(`rule-w07-val-${c.criterionId}`);
        criterionMetaMap.set(c.criterionId, {
          component: 'ENTITLEMENT',
          scale: 'PERCENT_100',
          observedValue: null,
          minNumericValue: null,
          missingReason: entitlementActive ? null : 'Học viên chưa ở trạng thái ghi danh/học phí hợp lệ (ACTIVE/COMPLETED).',
        });
        evaluatorCriteria.push({
          id: c.criterionId,
          mandatory: Boolean(c.required),
          kind: 'W07_ENTITLEMENT',
          validityRule: valRule,
        });
        const evRef: EvidenceReference = {
          id: w07Apps[0]?.id ?? `w07-enr-${enrollmentId}`,
          revision: entitlementActive ? 'active' : 'hold',
        };
        evidencePins[c.criterionId] = evRef;
        evaluatorEvidence.push({
          criterionId: c.criterionId,
          scope,
          ref: evRef,
          kind: 'W07_ENTITLEMENT',
          state: 'AUTHORIZED',
          authorizationRef: { id: `auth-${enrollmentId}`, revision: 'v1' },
          validityRuleRef: valRule.ref,
          outcome: entitlementActive ? 'VALID' : 'INVALID',
        });
      }
    }

    const completionInput: CompletionInput = {
      scope,
      courseVersion: {
        ref: courseVersionRef,
        state: 'APPROVED',
        approval: policyApproval,
      },
      courseVersionPin: courseVersionRef,
      policy: {
        ref: policyRef,
        courseVersionRef,
        state: policy.state === 'APPROVED' || options?.allowDraftPreview ? 'APPROVED' : 'DRAFT',
        approval: policyApproval,
        applicabilityRule: makeRule(`rule-app-${policy.id}`),
        applicability: 'APPLICABLE',
        criteria: evaluatorCriteria,
      },
      policyPin: policyRef,
      evidencePins,
      evidence: evaluatorEvidence,
      exemptions: [],
    };

    const rawEvaluation = evaluateCompletion(completionInput);
    const missingEvidence: string[] = [];
    const enrichedCriteria = rawEvaluation.criteria.map((cr) => {
      const meta = criteria.find((m) => m.criterionId === cr.criterionId);
      const calcMeta = criterionMetaMap.get(cr.criterionId);
      if (calcMeta?.missingReason && cr.status === 'PENDING') {
        missingEvidence.push(calcMeta.missingReason);
      }
      return {
        ...cr,
        domain: meta?.domain ?? 'W07_ENTITLEMENT',
        label: meta?.label ?? cr.criterionId,
        component: calcMeta?.component ?? meta?.component ?? null,
        scale: calcMeta?.scale ?? meta?.scale ?? 'PERCENT_100',
        observedNumericValue: calcMeta?.observedValue ?? null,
        minNumericValue: calcMeta?.minNumericValue ?? null,
        missingReason: calcMeta?.missingReason ?? null,
      };
    });

    const evaluation = {
      ...rawEvaluation,
      overall: rawEvaluation.state,
      criteria: enrichedCriteria,
    };

    const effectiveStatus =
      certRecord?.state === 'ISSUED'
        ? ('ISSUED' as const)
        : certRecord?.state === 'REVOKED'
          ? ('REVOKED' as const)
          : rawEvaluation.state;

    return {
      enrollmentId,
      status: rawEvaluation.state,
      effectiveStatus,
      statusLabel: q05StatusLabel(effectiveStatus),
      missingEvidence,
      policy: {
        id: policy.id,
        code: policy.code,
        version: policy.version,
        title: policy.title,
        description: policy.description,
        state: policy.state,
        isTestPolicy: policy.isTestPolicy,
        criteria,
      },
      evaluation,
      evidenceSummary: {
        w03: {
          publishedAssignmentGrades: gradeItems.filter((g) => g.component === 'ASSIGNMENT').length,
          publishedQuizAttempts: gradeItems.filter((g) => g.component !== 'ASSIGNMENT').length,
          pendingAssignmentSubmissions: pendingAssignSubmissions?.[0]?.cnt ?? 0,
          pendingQuizGrading: pendingLocalQuizzes.reduce((s, r) => s + r.cnt, 0),
          avgGradePercent: avgGradePercent ?? null,
          componentAverages,
          items: gradeItems,
        },
        w06: {
          officialPublishedSessions: officialSessions.length,
          localAttendanceSessions: localAttActivityIds.size,
          totalOpenedSessions,
          attendedSessions,
          attendanceRatePercent: attendanceRatePercent ?? null,
        },
        w07: {
          enrollmentStatus: enrollment.status,
          entitlementActive,
        },
      },
      certificate: certRecord,
    };
  }

  async summarizeEnrollmentForProgress(enrollmentId: string) {
    if (!this.isW09Enabled()) {
      return null;
    }
    const evalRes = await this.evaluateEnrollmentInternal(enrollmentId).catch(() => null);
    if (!evalRes) return null;
    return {
      status: evalRes.effectiveStatus,
      evaluationStatus: evalRes.status,
      statusLabel: evalRes.statusLabel,
      hasPolicy: Boolean(evalRes.policy && evalRes.policy.state === 'APPROVED'),
      policyCode: evalRes.policy?.code ?? null,
      policyTitle: evalRes.policy?.title ?? null,
      isTestPolicy: Boolean(evalRes.policy?.isTestPolicy),
      missingEvidence: evalRes.missingEvidence,
      criteriaCount: evalRes.evaluation?.criteria.length ?? 0,
      satisfiedCount:
        evalRes.evaluation?.criteria.filter((c: any) => c.status === 'SATISFIED').length ?? 0,
      certificateCode: evalRes.certificate?.certificateCode ?? null,
      certificateState: evalRes.certificate?.state ?? null,
    };
  }

  async submitReview(actorId: string, input: SubmitCertificateReviewInput) {
    this.assertEnabled();
    if (!['ELIGIBLE', 'REJECTED'].includes(input.decision)) {
      throw new BadRequestException('Review decision must be ELIGIBLE or REJECTED');
    }
    if (!input.reason?.trim() || input.reason.trim().length < 10) {
      throw new BadRequestException('Review reason must be at least 10 characters');
    }

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: input.enrollmentId },
      include: { classOffering: true },
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }

    await this.assertHvuScopedGrant(
      actorId,
      ['certificate.review', 'academic.grade.publish', 'academic.program.approve'],
      enrollment.classOfferingId,
      enrollment.classOffering.courseId,
    );

    const evaluated = await this.evaluateEnrollmentInternal(input.enrollmentId, input.policyId);
    if (!evaluated.policy || evaluated.policy.state !== 'APPROVED') {
      throw new ConflictException('APPROVED_POLICY_REQUIRED_FOR_REVIEW');
    }

    if (input.decision === 'ELIGIBLE') {
      if (evaluated.status !== 'ELIGIBLE_FOR_REVIEW') {
        throw new ConflictException({
          code: 'NOT_ELIGIBLE_FOR_CERTIFICATE_REVIEW',
          reasons: evaluated.evaluation?.blockers ?? [evaluated.status],
          evaluation: evaluated.evaluation,
        });
      }
    }

    const snapshot = {
      evaluatedAt: new Date().toISOString(),
      overall: evaluated.status,
      policy: evaluated.policy,
      evaluation: evaluated.evaluation,
      evidenceSummary: evaluated.evidenceSummary,
    };

    const [review] = await this.prisma.$queryRaw<any[]>`
      INSERT INTO w09_certificate_reviews (
        "enrollmentId",
        "policyId",
        decision,
        "evaluationSnapshot",
        "reviewerId",
        reason
      )
      VALUES (
        ${input.enrollmentId}::uuid,
        ${input.policyId}::uuid,
        ${input.decision},
        ${JSON.stringify(snapshot)}::jsonb,
        ${actorId}::uuid,
        ${input.reason.trim()}
      )
      RETURNING *
    `;

    await this.prisma.$executeRaw`
      INSERT INTO w09_certificate_events ("policyId", "enrollmentId", "actorId", kind, reason, payload)
      VALUES (
        ${input.policyId}::uuid,
        ${input.enrollmentId}::uuid,
        ${actorId}::uuid,
        'CERTIFICATE_REVIEW_RECORDED',
        ${input.reason.trim()},
        ${JSON.stringify({ reviewId: review.id, decision: input.decision })}::jsonb
      )
    `;

    return review;
  }

  async issueCertificate(actorId: string, input: IssueCertificateInput) {
    this.assertEnabled();
    if (!input.idempotencyKey?.trim() || input.idempotencyKey.trim().length < 6) {
      throw new BadRequestException('idempotencyKey is required (min 6 chars)');
    }
    if (!input.reason?.trim() || input.reason.trim().length < 10) {
      throw new BadRequestException('Issuance reason must be at least 10 characters');
    }

    // 1. Check idempotent replay first
    const [existingByKey] = await this.prisma.$queryRaw<any[]>`
      SELECT * FROM w09_certificates WHERE "idempotencyKey" = ${input.idempotencyKey.trim()}
    `;
    if (existingByKey) {
      if (
        existingByKey.enrollmentId !== input.enrollmentId ||
        existingByKey.reviewId !== input.reviewId
      ) {
        throw new ConflictException('IDEMPOTENCY_KEY_PAYLOAD_CONFLICT');
      }
      return { ...existingByKey, status: existingByKey.state, idempotentReplay: true };
    }

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: input.enrollmentId },
      include: {
        learner: { select: { id: true, fullName: true, email: true } },
        classOffering: {
          include: {
            course: { select: { id: true, title: true, level: true, slug: true } },
          },
        },
      },
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }

    await this.assertHvuScopedGrant(
      actorId,
      ['certificate.issue', 'academic.grade.publish', 'academic.program.approve'],
      enrollment.classOfferingId,
      enrollment.classOffering.courseId,
    );

    const [existingForEnrollment] = await this.prisma.$queryRaw<any[]>`
      SELECT * FROM w09_certificates WHERE "enrollmentId" = ${input.enrollmentId}::uuid
    `;
    if (existingForEnrollment) {
      throw new ConflictException('CERTIFICATE_ALREADY_ISSUED_FOR_ENROLLMENT');
    }

    const [review] = await this.prisma.$queryRaw<any[]>`
      SELECT * FROM w09_certificate_reviews WHERE id = ${input.reviewId}::uuid
    `;
    if (!review || review.enrollmentId !== input.enrollmentId) {
      throw new NotFoundException('Certificate eligibility review not found for enrollment');
    }
    if (review.decision !== 'ELIGIBLE') {
      throw new ConflictException('CERTIFICATE_REVIEW_NOT_ELIGIBLE');
    }

    const evaluated = await this.evaluateEnrollmentInternal(input.enrollmentId, review.policyId);
    if (!evaluated.policy || evaluated.policy.state !== 'APPROVED') {
      throw new ConflictException('POLICY_NOT_APPROVED');
    }

    if (evaluated.status !== 'ELIGIBLE_FOR_REVIEW') {
      throw new ConflictException({
        code: 'CERTIFICATE_ISSUE_PREFLIGHT_REJECTED',
        reasons: evaluated.evaluation?.blockers ?? [evaluated.status],
      });
    }

    const codeSuffix = createHash('sha256')
      .update(`${input.enrollmentId}:${review.id}:${randomUUID()}`)
      .digest('hex')
      .slice(0, 8)
      .toUpperCase();
    const certificateCode = evaluated.policy.isTestPolicy
      ? `SE-CERT-TEST-2026-${codeSuffix}`
      : `SE-CERT-2026-${codeSuffix}`;

    const issuedAtIso = new Date().toISOString();
    const immutableSnapshot = {
      schemaVersion: 1,
      certificateCode,
      isTestPolicy: Boolean(evaluated.policy.isTestPolicy),
      governanceLabel: evaluated.policy.isTestPolicy
        ? 'TEST_DISPOSABLE_GOVERNANCE_PROOF'
        : 'GOVERNED_ACADEMIC_CERTIFICATE',
      learner: {
        id: enrollment.learner.id,
        fullName: enrollment.learner.fullName,
        email: enrollment.learner.email,
      },
      course: {
        id: enrollment.classOffering.course.id,
        title: enrollment.classOffering.course.title,
        level: enrollment.classOffering.course.level,
      },
      classOffering: {
        id: enrollment.classOffering.id,
        code: enrollment.classOffering.code,
        name: enrollment.classOffering.name,
      },
      policy: {
        id: evaluated.policy.id,
        code: evaluated.policy.code,
        version: evaluated.policy.version,
        title: evaluated.policy.title,
        isTestPolicy: Boolean(evaluated.policy.isTestPolicy),
      },
      evaluation: evaluated.evaluation,
      evidenceSummary: evaluated.evidenceSummary,
      audit: {
        reviewId: review.id,
        reviewerId: review.reviewerId,
        issuerId: actorId,
        issuedAt: issuedAtIso,
      },
    };

    const [created] = await this.prisma.$queryRaw<any[]>`
      INSERT INTO w09_certificates (
        "certificateCode",
        "enrollmentId",
        "policyId",
        "reviewId",
        "idempotencyKey",
        "isTestPolicy",
        state,
        "immutableSnapshot",
        "reviewerId",
        "issuerId",
        "issueReason"
      )
      VALUES (
        ${certificateCode},
        ${input.enrollmentId}::uuid,
        ${review.policyId}::uuid,
        ${review.id}::uuid,
        ${input.idempotencyKey.trim()},
        ${Boolean(evaluated.policy.isTestPolicy)},
        'ISSUED',
        ${JSON.stringify(immutableSnapshot)}::jsonb,
        ${review.reviewerId}::uuid,
        ${actorId}::uuid,
        ${input.reason.trim()}
      )
      RETURNING *
    `;

    await this.prisma.$executeRaw`
      INSERT INTO w09_certificate_events (
        "certificateId",
        "policyId",
        "enrollmentId",
        "actorId",
        kind,
        reason,
        payload
      )
      VALUES (
        ${created.id}::uuid,
        ${review.policyId}::uuid,
        ${input.enrollmentId}::uuid,
        ${actorId}::uuid,
        'CERTIFICATE_ISSUED',
        ${input.reason.trim()},
        ${JSON.stringify({ certificateCode, isTestPolicy: created.isTestPolicy })}::jsonb
      )
    `;

    return { ...created, status: created.state, idempotentReplay: false };
  }

  async revokeCertificate(actorId: string, certificateId: string, input: RevokeCertificateInput) {
    this.assertEnabled();
    if (!input.reason?.trim() || input.reason.trim().length < 10) {
      throw new BadRequestException('Revocation reason must be at least 10 characters');
    }

    const [cert] = await this.prisma.$queryRaw<any[]>`
      SELECT * FROM w09_certificates WHERE id = ${certificateId}::uuid
    `;
    if (!cert) {
      throw new NotFoundException('Certificate not found');
    }

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: cert.enrollmentId },
      include: { classOffering: true },
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }

    await this.assertHvuScopedGrant(
      actorId,
      ['certificate.revoke', 'academic.program.approve', 'academic.grade.publish'],
      enrollment.classOfferingId,
      enrollment.classOffering.courseId,
    );

    if (cert.state === 'REVOKED') {
      throw new ConflictException('Certificate is already revoked');
    }

    const [updated] = await this.prisma.$queryRaw<any[]>`
      UPDATE w09_certificates
      SET state = 'REVOKED',
          "revokedById" = ${actorId}::uuid,
          "revokeReason" = ${input.reason.trim()},
          "revokedAt" = clock_timestamp()
      WHERE id = ${certificateId}::uuid
      RETURNING *
    `;

    await this.prisma.$executeRaw`
      INSERT INTO w09_certificate_events (
        "certificateId",
        "policyId",
        "enrollmentId",
        "actorId",
        kind,
        reason,
        payload
      )
      VALUES (
        ${certificateId}::uuid,
        ${cert.policyId}::uuid,
        ${cert.enrollmentId}::uuid,
        ${actorId}::uuid,
        'CERTIFICATE_REVOKED',
        ${input.reason.trim()},
        ${JSON.stringify({ certificateCode: cert.certificateCode, revokedById: actorId })}::jsonb
      )
    `;

    return { ...updated, status: updated.state };
  }

  async lookupByCode(code: string) {
    this.assertEnabled();
    const normalized = String(code ?? '').trim().toUpperCase();
    if (!normalized) {
      throw new NotFoundException('Certificate not found');
    }
    const [cert] = await this.prisma.$queryRaw<any[]>`
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
        cert."revokeReason",
        rv."fullName" AS "reviewerName",
        iss."fullName" AS "issuerName",
        rev."fullName" AS "revokedByName"
      FROM w09_certificates cert
      JOIN users rv ON rv.id = cert."reviewerId"
      JOIN users iss ON iss.id = cert."issuerId"
      LEFT JOIN users rev ON rev.id = cert."revokedById"
      WHERE upper(cert."certificateCode") = ${normalized}
      LIMIT 1
    `;
    if (!cert) {
      throw new NotFoundException('Certificate code not found');
    }

    const events = await this.prisma.$queryRaw<any[]>`
      SELECT id, kind, reason, payload, "createdAt"
      FROM w09_certificate_events
      WHERE "certificateId" = ${cert.id}::uuid
      ORDER BY "createdAt" ASC
    `;

    return {
      ...cert,
      status: cert.state,
      valid: cert.state === 'ISSUED',
      events,
    };
  }
}
