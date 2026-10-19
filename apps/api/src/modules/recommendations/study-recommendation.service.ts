import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CourseSkillScope,
  EnrollmentStatus,
  LessonProgressStatus,
  Prisma,
  SkillScoreStatus,
  StudyRecommendationTarget,
  TestAttemptStatus,
  TestPurpose,
  TestStatus,
  ToeicSkill,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { UpdateStudyRecommendationPolicyDto } from './dto/update-study-recommendation-policy.dto';
import {
  analyzeSkillEvidence,
  buildSevenDayPlan,
  groupTaskEvidence,
  LessonCandidate,
  selectRecommendationTargets,
  SkillEvidenceInput,
  StudyRecommendationPolicyInput,
  validateStudyRecommendationPolicy,
} from './study-recommendation.engine';
import {
  parseStudyRecommendationRuleReason,
  StudyRecommendationRuleReasonV1,
} from './study-recommendation-rule-reason';

const MAX_TRANSACTION_ATTEMPTS = 3;
const HISTORY_LIMIT = 10;

@Injectable()
export class StudyRecommendationService {
  constructor(private readonly prisma: PrismaService) {}

  async getActivePolicy() {
    return this.projectPolicy(await this.requireSingleActivePolicy(this.prisma));
  }

  async updateActivePolicy(input: UpdateStudyRecommendationPolicyDto) {
    try {
      validateStudyRecommendationPolicy({ code: 'M08_STUDY_REC_V1', ...input });
    } catch {
      throw new BadRequestException({
        code: 'STUDY_RECOMMENDATION_POLICY_INVALID',
        message: 'Study recommendation thresholds are invalid.',
      });
    }
    const policy = await this.prisma.$transaction(async (transaction) => {
      const policy = await this.requireSingleActivePolicy(transaction);
      return transaction.studyRecommendationPolicy.update({
        where: { id: policy.id },
        data: input,
      });
    });
    return this.projectPolicy(policy);
  }

  async getForLearner(learnerId: string, enrollmentId: string) {
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        const state = await this.prisma.$transaction(
          (transaction) => this.ensureRecommendationSet(transaction, learnerId, enrollmentId),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        return this.projectState(learnerId, enrollmentId, state);
      } catch (error: unknown) {
        if (!this.isRetryable(error) || attempt === MAX_TRANSACTION_ATTEMPTS) throw error;
      }
    }
    throw new ConflictException('Could not create the recommendation set.');
  }

  private async ensureRecommendationSet(
    transaction: Prisma.TransactionClient,
    learnerId: string,
    enrollmentId: string,
  ) {
    const enrollment = await transaction.enrollment.findFirst({
      where: { id: enrollmentId, learnerId, status: EnrollmentStatus.ACTIVE },
      select: {
        id: true,
        learnerId: true,
        classOfferingId: true,
        classOffering: {
          select: {
            courseId: true,
            course: { select: { skillScope: true } },
          },
        },
      },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');

    const policy = await this.requireSingleActivePolicy(transaction);
    const policyInput = this.toPolicyInput(policy);
    const attempts = await transaction.testAttempt.findMany({
      where: {
        learnerId,
        enrollmentId,
        status: TestAttemptStatus.SUBMITTED,
        test: {
          purpose: TestPurpose.IN_CLASS,
          courseId: enrollment.classOffering.courseId,
        },
        classAssessment: { classOfferingId: enrollment.classOfferingId },
      },
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        submittedAt: true,
        testId: true,
        test: {
          select: {
            title: true,
            showResultAfterSubmit: true,
            testQuestions: {
              select: {
                id: true,
                points: true,
                group: { select: { taskCode: true } },
                question: { select: { toeicSkill: true } },
              },
            },
          },
        },
        classAssessment: { select: { stage: true } },
        skillScores: {
          select: {
            skill: true,
            rawScore: true,
            maxRawScore: true,
            normalizedScore: true,
            status: true,
          },
        },
        answers: {
          select: {
            testQuestionId: true,
            pointsAwarded: true,
          },
        },
      },
    });
    const eligibility = attempts.map((attempt) => {
      const representedSkills = [...new Set(
        attempt.test.testQuestions.map(({ question }) => question.toeicSkill),
      )];
      const finalSkills = new Set(
        attempt.skillScores
          .filter(({ status }) => status === SkillScoreStatus.FINAL)
          .map(({ skill }) => skill),
      );
      const pendingSkills = representedSkills.filter((skill) => !finalSkills.has(skill));
      return {
        attempt,
        representedSkills,
        pendingSkills,
        eligible:
          attempt.test.showResultAfterSubmit &&
          representedSkills.length > 0 &&
          pendingSkills.length === 0,
      };
    });
    const selected = eligibility.find(({ eligible }) => eligible) ?? null;
    const pendingNewer = eligibility.find(
      ({ attempt, eligible }) =>
        !eligible &&
        attempt.test.showResultAfterSubmit &&
        (!selected || this.dateValue(attempt.submittedAt) > this.dateValue(selected.attempt.submittedAt)),
    ) ?? null;

    if (!selected) {
      return {
        state: pendingNewer ? ('PENDING_REVIEW' as const) : ('NO_ELIGIBLE_RESULT' as const),
        sourceAttemptId: null,
        pendingNewerAttemptId: pendingNewer?.attempt.id ?? null,
      };
    }

    const existing = await transaction.studyRecommendation.count({
      where: { enrollmentId, sourceAttemptId: selected.attempt.id },
    });
    if (existing > 0) {
      return {
        state: 'READY' as const,
        sourceAttemptId: selected.attempt.id,
        pendingNewerAttemptId: pendingNewer?.attempt.id ?? null,
      };
    }

    const targetSkills = this.targetSkills(enrollment.classOffering.course.skillScope);
    const skillEvidence: SkillEvidenceInput[] = selected.attempt.skillScores
      .filter(
        ({ status, skill }) =>
          status === SkillScoreStatus.FINAL && targetSkills.includes(skill),
      )
      .map((row) => ({
        skill: row.skill,
        rawScore: row.rawScore === null ? null : Number(row.rawScore),
        maxRawScore: row.maxRawScore === null ? null : Number(row.maxRawScore),
        normalizedScore: Number(row.normalizedScore),
      }));
    const testQuestionById = new Map(
      selected.attempt.test.testQuestions.map((question) => [question.id, question]),
    );
    const taskEvidence = groupTaskEvidence(
      selected.attempt.answers.map((answer) => {
        const testQuestion = testQuestionById.get(answer.testQuestionId);
        return {
          taskCode: testQuestion?.group?.taskCode ?? null,
          skill: testQuestion?.question.toeicSkill ?? ToeicSkill.LISTENING,
          pointsAwarded: answer.pointsAwarded === null ? null : Number(answer.pointsAwarded),
          maxPoints: testQuestion?.points ?? 0,
        };
      }),
      targetSkills,
      policy.minimumTaskQuestions,
    );
    const now = new Date();
    const modules = await transaction.module.findMany({
      where: { courseId: enrollment.classOffering.courseId },
      orderBy: { orderIndex: 'asc' },
      select: {
        orderIndex: true,
        lessons: {
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            title: true,
            orderIndex: true,
            focusSkills: true,
            focusTaskCodes: true,
            progress: {
              where: { enrollmentId },
              select: { status: true },
              take: 1,
            },
            tests: {
              where: {
                purpose: TestPurpose.PRACTICE_MOCK,
                status: TestStatus.PUBLISHED,
                classAssessments: {
                  some: {
                    classOfferingId: enrollment.classOfferingId,
                    isActive: true,
                    AND: [
                      { OR: [{ openAt: null }, { openAt: { lte: now } }] },
                      { OR: [{ closeAt: null }, { closeAt: { gt: now } }] },
                    ],
                  },
                },
              },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });
    const lessons: LessonCandidate[] = modules.flatMap((module) =>
      module.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        focusSkills: lesson.focusSkills,
        focusTaskCodes: lesson.focusTaskCodes,
        progressStatus: lesson.progress[0]?.status ?? LessonProgressStatus.NOT_STARTED,
        practiceAvailable: lesson.tests.length > 0,
        moduleOrder: module.orderIndex,
        lessonOrder: lesson.orderIndex,
      })),
    );
    const targets = selectRecommendationTargets({
      policy: policyInput,
      skillEvidence,
      taskEvidence,
      lessons,
    });
    if (!targets.length) {
      return {
        state: 'NO_MATCHING_CONTENT' as const,
        sourceAttemptId: selected.attempt.id,
        pendingNewerAttemptId: pendingNewer?.attempt.id ?? null,
      };
    }

    await transaction.studyRecommendation.updateMany({
      where: { enrollmentId, sourceAttemptId: { not: null }, isActive: true },
      data: { isActive: false },
    });
    const sourceStage = selected.attempt.classAssessment?.stage;
    if (!sourceStage || !selected.attempt.submittedAt) {
      throw new ConflictException('Eligible source attempt is missing assessment metadata.');
    }
    await transaction.studyRecommendation.createMany({
      data: targets.map((target, index) => {
        const reason: StudyRecommendationRuleReasonV1 = {
          schemaVersion: 1,
          policy: policyInput,
          source: {
            attemptId: selected.attempt.id,
            testId: selected.attempt.testId,
            stage: sourceStage,
            submittedAt: selected.attempt.submittedAt!.toISOString(),
          },
          skillEvidence: target.skillEvidence,
          taskEvidence: target.taskEvidence,
          selection: {
            basis: target.basis,
            targetLessonId: target.lesson.id,
            targetLessonTitle: target.lesson.title,
            targetPracticeAvailableAtGeneration: target.lesson.practiceAvailable,
            rank: index + 1,
          },
        };
        return {
          learnerId,
          enrollmentId,
          sourceAttemptId: selected.attempt.id,
          policyId: policy.id,
          priority: index + 1,
          ruleReason: reason as unknown as Prisma.InputJsonValue,
          skill: target.skillEvidence.skill,
          targetType: StudyRecommendationTarget.LESSON,
          lessonId: target.lesson.id,
          title: target.lesson.title,
          actionText: 'Study this lesson next.',
          aiExplanation: null,
          isActive: true,
        };
      }),
    });
    return {
      state: 'READY' as const,
      sourceAttemptId: selected.attempt.id,
      pendingNewerAttemptId: pendingNewer?.attempt.id ?? null,
    };
  }

  private async projectState(
    learnerId: string,
    enrollmentId: string,
    state: {
      state: 'READY' | 'NO_ELIGIBLE_RESULT' | 'PENDING_REVIEW' | 'NO_MATCHING_CONTENT';
      sourceAttemptId: string | null;
      pendingNewerAttemptId: string | null;
    },
  ) {
    const enrollment = await this.prisma.enrollment.findFirstOrThrow({
      where: { id: enrollmentId, learnerId, status: EnrollmentStatus.ACTIVE },
      select: { classOfferingId: true },
    });
    const rows = await this.prisma.studyRecommendation.findMany({
      where: { enrollmentId, sourceAttemptId: { not: null } },
      orderBy: [{ sourceAttempt: { submittedAt: 'desc' } }, { priority: 'asc' }],
      select: {
        id: true,
        sourceAttemptId: true,
        priority: true,
        skill: true,
        targetType: true,
        title: true,
        actionText: true,
        aiExplanation: true,
        isActive: true,
        ruleReason: true,
        sourceAttempt: {
          select: {
            id: true,
            testId: true,
            submittedAt: true,
            test: { select: { title: true } },
            classAssessment: { select: { stage: true } },
          },
        },
        lesson: {
          select: {
            id: true,
            title: true,
            estimatedMinutes: true,
            module: { select: { title: true } },
            resources: {
              orderBy: { orderIndex: 'asc' },
              select: {
                id: true,
                title: true,
                type: true,
                url: true,
                isDownloadable: true,
              },
            },
            tests: {
              where: { purpose: TestPurpose.PRACTICE_MOCK, status: TestStatus.PUBLISHED },
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                title: true,
                maxAttempts: true,
                classAssessments: {
                  where: { classOfferingId: enrollment.classOfferingId, isActive: true },
                  orderBy: { createdAt: 'asc' },
                  select: {
                    id: true,
                    openAt: true,
                    closeAt: true,
                    maxAttemptsOverride: true,
                    attempts: {
                      where: { enrollmentId },
                      select: { id: true, status: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const sourceIds = [...new Set(rows.map(({ sourceAttemptId }) => sourceAttemptId).filter(Boolean))] as string[];
    const sourceRows = sourceIds.length
      ? await this.prisma.testAttempt.findMany({
          where: { id: { in: sourceIds }, learnerId, enrollmentId },
          select: {
            id: true,
            submittedAt: true,
            testId: true,
            test: { select: { title: true } },
            classAssessment: { select: { stage: true } },
          },
        })
      : [];
    const sourceById = new Map(sourceRows.map((source) => [source.id, source]));
    const currentRows = state.sourceAttemptId
      ? rows.filter(({ sourceAttemptId }) => sourceAttemptId === state.sourceAttemptId)
      : [];
    const projectedCurrent = currentRows.map((row) => this.projectRecommendation(row, enrollmentId));
    const currentReasons = projectedCurrent
      .map(({ reason }) => reason)
      .filter((reason): reason is StudyRecommendationRuleReasonV1 => reason !== null);
    const skillRows = this.uniqueSkillEvidence(currentReasons.map(({ skillEvidence }) => skillEvidence));
    const policy = currentReasons[0]?.policy ?? null;
    const analysis = policy ? analyzeSkillEvidence(skillRows, policy) : null;
    const pendingNewerAttempt = state.pendingNewerAttemptId
      ? await this.projectPendingAttempt(learnerId, enrollmentId, state.pendingNewerAttemptId)
      : null;
    const source = state.sourceAttemptId ? sourceById.get(state.sourceAttemptId) ?? null : null;
    const historyGroups = new Map<string, typeof rows>();
    for (const row of rows) {
      if (!row.sourceAttemptId) continue;
      const group = historyGroups.get(row.sourceAttemptId) ?? [];
      group.push(row);
      historyGroups.set(row.sourceAttemptId, group);
    }
    const history = [...historyGroups.entries()].slice(0, HISTORY_LIMIT).map(([sourceAttemptId, items]) => {
      const historySource = sourceById.get(sourceAttemptId) ?? items[0].sourceAttempt;
      const projected = items.map((item) => this.projectRecommendation(item, enrollmentId));
      const reasons = projected.map(({ reason }) => reason).filter((reason): reason is StudyRecommendationRuleReasonV1 => reason !== null);
      return {
        sourceAttemptId,
        sourceTitle: historySource?.test.title ?? 'Assessment result',
        sourceSubmittedAt: historySource?.submittedAt ?? null,
        current: items.some(({ isActive }) => isActive),
        mainFocus: reasons[0]?.skillEvidence.skill ?? null,
        itemCount: items.length,
        strengths: this.historyStrengths(reasons),
        focus: this.historyFocus(reasons),
        sourceResultPath: `/student/enrollments/${enrollmentId}/attempts/${sourceAttemptId}/result`,
        recommendations: projected,
      };
    });
    return {
      state: state.state,
      source: source
        ? {
            attemptId: source.id,
            testId: source.testId,
            testTitle: source.test.title,
            stage: source.classAssessment?.stage ?? null,
            submittedAt: source.submittedAt,
            resultPath: `/student/enrollments/${enrollmentId}/attempts/${source.id}/result`,
          }
        : null,
      pendingNewerAttempt,
      strengths: analysis
        ? analysis.strengths.map(({ evidence, relative }) => ({ ...evidence, relative }))
        : [],
      focus: analysis
        ? this.projectFocus(analysis.focus[0]?.evidence ?? null, currentReasons)
        : null,
      recommendations: projectedCurrent,
      schedule7Days: buildSevenDayPlan(
        projectedCurrent.map((recommendation) => ({
          id: recommendation.id,
          lessonPath: recommendation.lesson.path,
          lessonTitle: recommendation.lesson.title,
          practicePath: recommendation.practice?.startPath ?? null,
        })),
      ),
      history,
    };
  }

  private projectRecommendation<TRow extends {
    id: string;
    priority: number;
    skill: ToeicSkill;
    targetType: StudyRecommendationTarget;
    title: string;
    actionText: string;
    aiExplanation: string | null;
    ruleReason: Prisma.JsonValue;
    lesson: null | {
      id: string;
      title: string;
      estimatedMinutes: number | null;
      module: { title: string };
      resources: Array<{ id: string; title: string; type: string; url: string | null; isDownloadable: boolean }>;
      tests: Array<{
        id: string;
        title: string;
        maxAttempts: number;
        classAssessments: Array<{
          id: string;
          openAt: Date | null;
          closeAt: Date | null;
          maxAttemptsOverride: number | null;
          attempts: Array<{ id: string; status: TestAttemptStatus }>;
        }>;
      }>;
    };
  }>(row: TRow, enrollmentId: string) {
    if (!row.lesson) throw new ConflictException('Stored recommendation target is unavailable.');
    const reason = parseStudyRecommendationRuleReason(row.ruleReason);
    const now = new Date();
    const practice = row.lesson.tests
      .flatMap((test) =>
        test.classAssessments.map((assessment) => ({ test, assessment })),
      )
      .find(({ test, assessment }) => {
        const maxAttempts = assessment.maxAttemptsOverride ?? test.maxAttempts;
        const hasInProgress = assessment.attempts.some(
          ({ status }) => status === TestAttemptStatus.IN_PROGRESS,
        );
        return (
          (!assessment.openAt || assessment.openAt <= now) &&
          (!assessment.closeAt || assessment.closeAt > now) &&
          (hasInProgress || assessment.attempts.length < maxAttempts)
        );
      });
    return {
      id: row.id,
      priority: row.priority,
      skill: row.skill,
      targetType: row.targetType,
      title: row.title,
      actionText: row.actionText,
      lesson: {
        id: row.lesson.id,
        title: row.lesson.title,
        estimatedMinutes: row.lesson.estimatedMinutes,
        moduleTitle: row.lesson.module.title,
        path: `/student/enrollments/${enrollmentId}/lessons/${row.lesson.id}`,
      },
      resources: row.lesson.resources.map((resource) => ({
        ...resource,
        path: resource.url ?? `/api/learning/enrollments/${enrollmentId}/resources/${resource.id}/download`,
      })),
      practice: practice
        ? {
            assessmentId: practice.assessment.id,
            testId: practice.test.id,
            title: practice.test.title,
            maxAttempts: practice.assessment.maxAttemptsOverride ?? practice.test.maxAttempts,
            availability: 'AVAILABLE' as const,
            actionable: true,
            startPath: `/api/learning/enrollments/${enrollmentId}/tests/${practice.test.id}/attempts`,
          }
        : null,
      reason,
      reasonStatus: reason ? ('AVAILABLE' as const) : ('UNAVAILABLE' as const),
      aiExplanation: row.aiExplanation,
    };
  }

  private async projectPendingAttempt(learnerId: string, enrollmentId: string, attemptId: string) {
    const attempt = await this.prisma.testAttempt.findFirst({
      where: { id: attemptId, learnerId, enrollmentId, status: TestAttemptStatus.SUBMITTED },
      select: {
        id: true,
        submittedAt: true,
        test: {
          select: {
            title: true,
            testQuestions: { select: { question: { select: { toeicSkill: true } } } },
          },
        },
        skillScores: { select: { skill: true, status: true } },
      },
    });
    if (!attempt) return null;
    const finalSkills = new Set(
      attempt.skillScores.filter(({ status }) => status === SkillScoreStatus.FINAL).map(({ skill }) => skill),
    );
    const pendingSkills = [...new Set(attempt.test.testQuestions.map(({ question }) => question.toeicSkill))]
      .filter((skill) => !finalSkills.has(skill));
    return {
      attemptId: attempt.id,
      title: attempt.test.title,
      submittedAt: attempt.submittedAt,
      pendingSkills,
      resultPath: `/student/enrollments/${enrollmentId}/attempts/${attempt.id}/result`,
    };
  }

  private projectFocus(
    skill: SkillEvidenceInput | null,
    reasons: StudyRecommendationRuleReasonV1[],
  ) {
    if (!skill) return null;
    const task = reasons.find(({ skillEvidence }) => skillEvidence.skill === skill.skill)?.taskEvidence ?? null;
    return {
      skill: skill.skill,
      normalizedScore: skill.normalizedScore,
      taskCode: task?.taskCode,
      taskQuestionCount: task?.questionCount,
      taskNormalizedScore: task?.normalizedScore,
    };
  }

  private historyStrengths(reasons: StudyRecommendationRuleReasonV1[]) {
    const skills = this.uniqueSkillEvidence(reasons.map(({ skillEvidence }) => skillEvidence));
    const policy = reasons[0]?.policy;
    if (!policy) return [];
    return analyzeSkillEvidence(skills, policy).strengths.map(({ evidence, relative }) => ({ ...evidence, relative }));
  }

  private historyFocus(reasons: StudyRecommendationRuleReasonV1[]) {
    const skills = this.uniqueSkillEvidence(reasons.map(({ skillEvidence }) => skillEvidence));
    const policy = reasons[0]?.policy;
    if (!policy) return null;
    return this.projectFocus(analyzeSkillEvidence(skills, policy).focus[0]?.evidence ?? null, reasons);
  }

  private uniqueSkillEvidence(rows: SkillEvidenceInput[]) {
    return [...new Map(rows.map((row) => [row.skill, row])).values()];
  }

  private targetSkills(scope: CourseSkillScope): ToeicSkill[] {
    switch (scope) {
      case CourseSkillScope.LR:
        return [ToeicSkill.LISTENING, ToeicSkill.READING];
      case CourseSkillScope.LISTENING:
        return [ToeicSkill.LISTENING];
      case CourseSkillScope.READING:
        return [ToeicSkill.READING];
      case CourseSkillScope.SPEAKING:
        return [ToeicSkill.SPEAKING];
      case CourseSkillScope.WRITING:
        return [ToeicSkill.WRITING];
      case CourseSkillScope.FOUR_SKILLS:
        return Object.values(ToeicSkill);
    }
  }

  private async requireSingleActivePolicy(
    client: Prisma.TransactionClient | PrismaService,
  ) {
    const policies = await client.studyRecommendationPolicy.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      take: 2,
    });
    if (policies.length !== 1) {
      throw new ConflictException({
        code: 'STUDY_RECOMMENDATION_POLICY_CONFIG_INVALID',
        message: 'Exactly one active study recommendation policy is required.',
      });
    }
    const policy = policies[0];
    try {
      validateStudyRecommendationPolicy(this.toPolicyInput(policy));
    } catch {
      throw new ConflictException({
        code: 'STUDY_RECOMMENDATION_POLICY_CONFIG_INVALID',
        message: 'The active study recommendation policy is invalid.',
      });
    }
    return policy;
  }

  private toPolicyInput(policy: {
    code: string;
    weakThreshold: Prisma.Decimal;
    strongThreshold: Prisma.Decimal;
    minimumTaskQuestions: number;
    maxRecommendations: number;
  }): StudyRecommendationPolicyInput {
    return {
      code: policy.code,
      weakThreshold: Number(policy.weakThreshold),
      strongThreshold: Number(policy.strongThreshold),
      minimumTaskQuestions: policy.minimumTaskQuestions,
      maxRecommendations: policy.maxRecommendations,
    };
  }

  private projectPolicy(policy: {
    id: string;
    code: string;
    name: string;
    weakThreshold: Prisma.Decimal;
    strongThreshold: Prisma.Decimal;
    minimumTaskQuestions: number;
    maxRecommendations: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      ...policy,
      weakThreshold: Number(policy.weakThreshold),
      strongThreshold: Number(policy.strongThreshold),
    };
  }

  private dateValue(date: Date | null): number {
    return date?.getTime() ?? 0;
  }

  private isRetryable(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2034'].includes(error.code)
    );
  }
}
