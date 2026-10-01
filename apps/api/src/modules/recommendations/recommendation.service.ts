import { Injectable } from '@nestjs/common';
import {
  EnrollmentStatus,
  Prisma,
  SkillScoreStatus,
  ToeicSkill,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { computeRegistrationState } from '../classes/registration-state';
import { EvaluationService } from '../evaluation/evaluation.service';
import { M04DomainError } from '../evaluation/m04-domain.error';
import { matchCourseProfiles } from './recommendation.engine';
import { parseRuleReason } from './rule-reason';

const MAX_ENSURE_ATTEMPTS = 3;

@Injectable()
export class RecommendationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evaluationService: EvaluationService,
  ) {}

  async ensureAndProject(attemptId: string, learnerId: string) {
    let evaluation: Awaited<ReturnType<EvaluationService['ensure']>> | null = null;
    for (let attempt = 1; attempt <= MAX_ENSURE_ATTEMPTS; attempt += 1) {
      try {
        evaluation = await this.prisma.$transaction(
          async (transaction) => {
            const existingM04Evaluation = await transaction.attemptEvaluation.findFirst({
              where: {
                attemptId,
                evaluationPolicy: { code: 'M04_PLACEMENT_LR_NORMALIZED_V1' },
              },
              select: { id: true },
            });
            const ensured = await this.evaluationService.ensure(transaction, attemptId);
            const recommendationCount = await transaction.courseRecommendation.count({
              where: { attemptId },
            });
            if (recommendationCount === 0 && !existingM04Evaluation) {
              await this.generateRecommendations(transaction, attemptId, ensured);
            }
            return ensured;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        break;
      } catch (error: unknown) {
        if (!this.isRetryable(error) || attempt === MAX_ENSURE_ATTEMPTS) throw error;
      }
    }
    if (!evaluation) {
      throw new M04DomainError(
        'RECOMMENDATION_CONFIG_INVALID',
        'Chưa thể hoàn tất gợi ý khóa học.',
      );
    }
    return {
      evaluation,
      recommendations: await this.projectRecommendations(attemptId, learnerId),
    };
  }

  private async generateRecommendations(
    transaction: Prisma.TransactionClient,
    attemptId: string,
    evaluation: Awaited<ReturnType<EvaluationService['ensure']>>,
  ) {
    if (!evaluation.evaluationPolicyId || !evaluation.levelCode) {
      throw new M04DomainError(
        'RECOMMENDATION_CONFIG_INVALID',
        'Đánh giá hiện tại chưa đủ thông tin để gợi ý khóa học.',
      );
    }
    const [policy, skillRows, profiles] = await Promise.all([
      transaction.evaluationPolicy.findUnique({
        where: { id: evaluation.evaluationPolicyId },
        select: { code: true },
      }),
      transaction.attemptSkillScore.findMany({
        where: {
          attemptId,
          status: SkillScoreStatus.FINAL,
          skill: { in: [ToeicSkill.LISTENING, ToeicSkill.READING] },
        },
        select: { skill: true, normalizedScore: true },
      }),
      transaction.courseRecommendationProfile.findMany({
        include: {
          course: { select: { id: true, isPublished: true } },
          criteria: { orderBy: { skill: 'asc' } },
        },
      }),
    ]);
    if (!policy) {
      throw new M04DomainError(
        'RECOMMENDATION_CONFIG_INVALID',
        'Không tìm thấy chính sách đã tạo đánh giá này.',
      );
    }
    const matches = matchCourseProfiles({
      profiles: profiles.map((profile) => ({
        id: profile.id,
        courseId: profile.courseId,
        coursePublished: profile.course.isPublished,
        active: profile.isActive,
        ruleMode: profile.ruleMode,
        priority: profile.priority,
        criteria: profile.criteria.map((criterion) => ({
          skill: criterion.skill,
          minNormalizedScore:
            criterion.minNormalizedScore === null
              ? null
              : Number(criterion.minNormalizedScore),
          maxNormalizedScore:
            criterion.maxNormalizedScore === null
              ? null
              : Number(criterion.maxNormalizedScore),
          minEstimatedToeicScore: criterion.minEstimatedToeicScore,
          maxEstimatedToeicScore: criterion.maxEstimatedToeicScore,
        })),
      })),
      skillScores: new Map(
        skillRows.map(({ skill, normalizedScore }) => [skill, Number(normalizedScore)]),
      ),
      evaluationPolicyCode: policy.code,
      evaluationLevel: evaluation.levelCode,
    });
    if (!matches.length) return;
    await transaction.courseRecommendation.createMany({
      data: matches.map((match) => {
        if (!parseRuleReason(match.reason)) {
          throw new M04DomainError(
            'RECOMMENDATION_CONFIG_INVALID',
            'Không thể lưu lý do gợi ý khóa học.',
          );
        }
        return {
          attemptId,
          courseId: match.courseId,
          kind: match.kind,
          ruleReason: match.reason as unknown as Prisma.InputJsonValue,
          aiExplanation: null,
        };
      }),
    });
  }

  private async projectRecommendations(attemptId: string, learnerId: string) {
    const rows = await this.prisma.courseRecommendation.findMany({
      where: { attemptId },
      include: {
        course: {
          include: {
            classOfferings: {
              include: {
                instructor: { select: { id: true, fullName: true } },
                scheduleSlots: {
                  orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
                  select: {
                    id: true,
                    dayOfWeek: true,
                    startTime: true,
                    endTime: true,
                    locationText: true,
                    meetingUrl: true,
                  },
                },
                enrollments: {
                  where: { learnerId },
                  select: { id: true, status: true },
                },
                _count: {
                  select: { enrollments: { where: { status: EnrollmentStatus.ACTIVE } } },
                },
              },
              orderBy: [{ classStart: 'asc' }, { id: 'asc' }],
            },
          },
        },
      },
    });
    const kindOrder = { PRIMARY: 0, SUPPLEMENTARY: 1 } as const;
    return rows
      .sort(
        (left, right) =>
          kindOrder[left.kind] - kindOrder[right.kind] ||
          left.courseId.localeCompare(right.courseId),
      )
      .map((row) => ({
        kind: row.kind,
        course: {
          id: row.course.id,
          slug: row.course.slug,
          title: row.course.title,
          description: row.course.description,
          level: row.course.level,
          skillScope: row.course.skillScope,
          thumbnailUrl: row.course.thumbnailUrl,
        },
        reason: parseRuleReason(row.ruleReason),
        reasonStatus: parseRuleReason(row.ruleReason) ? ('AVAILABLE' as const) : ('UNAVAILABLE' as const),
        classOfferings: row.course.classOfferings.map((offering) => {
          const currentEnrollment = offering.enrollments[0] ?? null;
          const availability = computeRegistrationState({
            status: offering.status,
            courseIsPublished: row.course.isPublished,
            enrollmentStart: offering.enrollmentStart,
            enrollmentEnd: offering.enrollmentEnd,
            maxStudents: offering.maxStudents,
            registeredCount: offering._count.enrollments,
            currentEnrollmentStatus: currentEnrollment?.status,
            now: new Date(),
          });
          return {
            id: offering.id,
            code: offering.code,
            name: offering.name,
            instructor: offering.instructor,
            modality: offering.modality,
            pricingType: offering.pricingType,
            tuitionFeeVnd: offering.tuitionFeeVnd,
            totalSessions: offering.totalSessions,
            totalPeriods: offering.totalPeriods,
            enrollmentStart: offering.enrollmentStart,
            enrollmentEnd: offering.enrollmentEnd,
            classStart: offering.classStart,
            classEnd: offering.classEnd,
            scheduleSlots: offering.scheduleSlots,
            maxStudents: offering.maxStudents,
            registeredCount: availability.registeredCount,
            remainingSeats: availability.remainingSeats,
            registrationState: availability.registrationState,
            actionable: availability.actionable,
            currentEnrollmentId: currentEnrollment?.id ?? null,
            currentEnrollmentStatus: currentEnrollment?.status ?? null,
          };
        }),
      }));
  }

  private isRetryable(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2034'].includes(error.code)
    );
  }
}
