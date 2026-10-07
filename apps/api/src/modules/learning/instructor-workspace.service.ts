import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AnswerEvaluationSource,
  AnswerEvaluationStatus,
  ClassOfferingStatus,
  EnrollmentStatus,
  LessonProgressStatus,
  SkillScoreStatus,
  TestAttemptStatus,
  TestPurpose,
  ToeicSkill,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const SKILLS: ToeicSkill[] = [
  ToeicSkill.LISTENING,
  ToeicSkill.READING,
  ToeicSkill.SPEAKING,
  ToeicSkill.WRITING,
];
const PRODUCTIVE_SKILLS: ToeicSkill[] = [ToeicSkill.SPEAKING, ToeicSkill.WRITING];

@Injectable()
export class InstructorWorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async listClasses(instructorId: string) {
    const classes = await this.prisma.classOffering.findMany({
      where: { instructorId },
      orderBy: [{ classStart: 'desc' }, { code: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        modality: true,
        classStart: true,
        classEnd: true,
        course: { select: { id: true, title: true, level: true } },
        scheduleSlots: {
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
          select: { dayOfWeek: true, startTime: true, endTime: true, locationText: true },
        },
        _count: { select: { enrollments: { where: { status: EnrollmentStatus.ACTIVE } } } },
      },
    });
    return classes.map((item) => ({
      ...item,
      status:
        item.status === ClassOfferingStatus.CANCELLED ? 'CLOSED' : item.status,
      scheduleSlots: item.scheduleSlots.map(projectScheduleSlot),
      activeLearnerCount: item._count.enrollments,
      _count: undefined,
    }));
  }

  async overview(instructorId: string, classOfferingId: string) {
    const classroom = await this.requireOwnedClass(instructorId, classOfferingId);
    const now = new Date();
    const [
      activeLearnerCount,
      totalLessons,
      completedLessonRows,
      assessments,
      attempts,
      activeEnrollments,
    ] = await Promise.all([
      this.prisma.enrollment.count({ where: { classOfferingId, status: EnrollmentStatus.ACTIVE } }),
      this.prisma.lesson.count({ where: { module: { courseId: classroom.course.id } } }),
      this.prisma.lessonProgress.count({
        where: {
          enrollment: { classOfferingId, status: EnrollmentStatus.ACTIVE },
          status: LessonProgressStatus.COMPLETED,
        },
      }),
      this.prisma.classAssessment.findMany({
        where: { classOfferingId, isActive: true },
        orderBy: [{ openAt: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          stage: true,
          openAt: true,
          closeAt: true,
          test: { select: { id: true, title: true } },
        },
      }),
      this.prisma.testAttempt.findMany({
        where: { classAssessment: { classOfferingId } },
        select: {
          learnerId: true,
          status: true,
          submittedAt: true,
          classAssessmentId: true,
          answers: {
            select: {
              evaluations: {
                where: { status: AnswerEvaluationStatus.REVIEWED_FINAL },
                select: { id: true },
              },
              testQuestion: { select: { question: { select: { toeicSkill: true } } } },
            },
          },
        },
      }),
      this.prisma.enrollment.findMany({
        where: { classOfferingId, status: EnrollmentStatus.ACTIVE },
        select: {
          id: true,
          enrolledAt: true,
          learnerId: true,
          lessonProgress: { select: { status: true, lastAccessedAt: true, completedAt: true } },
        },
      }),
    ]);
    const submittedAttempts = attempts.filter(
      (attempt) => attempt.status === TestAttemptStatus.SUBMITTED,
    );
    const gradingState = submittedAttempts.map((attempt) => {
      const productive = attempt.answers.filter((answer) =>
        PRODUCTIVE_SKILLS.includes(answer.testQuestion.question.toeicSkill),
      );
      const finalized = productive.filter((answer) => answer.evaluations.length > 0).length;
      return productive.length === 0 || finalized === productive.length
        ? 'FINAL'
        : finalized === 0
          ? 'WAITING'
          : 'PARTIAL';
    });
    const pendingGradingCount = gradingState.filter((state) => state !== 'FINAL').length;
    const percentages = activeEnrollments.map((enrollment) =>
      totalLessons === 0
        ? 0
        : Math.round(
            (enrollment.lessonProgress.filter(
              (item) => item.status === LessonProgressStatus.COMPLETED,
            ).length /
              totalLessons) *
              100,
          ),
    );
    const progressBuckets = [
      { label: '0–24%', count: percentages.filter((value) => value < 25).length },
      { label: '25–49%', count: percentages.filter((value) => value >= 25 && value < 50).length },
      { label: '50–74%', count: percentages.filter((value) => value >= 50 && value < 75).length },
      { label: '75–99%', count: percentages.filter((value) => value >= 75 && value < 100).length },
      { label: '100%', count: percentages.filter((value) => value === 100).length },
    ];
    const inactiveLearnerCount = activeEnrollments.filter((enrollment) => {
      const latest = enrollment.lessonProgress.reduce<Date>(
        (value, item) =>
          [item.lastAccessedAt, item.completedAt]
            .filter((date): date is Date => Boolean(date))
            .reduce((a, b) => (a > b ? a : b), value),
        enrollment.enrolledAt,
      );
      return now.getTime() - latest.getTime() >= 7 * 86_400_000;
    }).length;
    return {
      classOffering: classroom,
      activeLearnerCount,
      lessonProgress: {
        completed: completedLessonRows,
        total: totalLessons * activeLearnerCount,
        percentage:
          totalLessons * activeLearnerCount === 0
            ? 0
            : Math.round((completedLessonRows / (totalLessons * activeLearnerCount)) * 100),
      },
      assessments: assessments.map((item) => {
        const submittedLearners = new Set(
          submittedAttempts
            .filter((attempt) => attempt.classAssessmentId === item.id)
            .map((attempt) => attempt.learnerId),
        );
        const inProgressLearners = new Set(
          attempts
            .filter(
              (attempt) =>
                attempt.classAssessmentId === item.id &&
                attempt.status === TestAttemptStatus.IN_PROGRESS,
            )
            .map((attempt) => attempt.learnerId),
        );
        return {
          ...item,
          availability:
            item.openAt && item.openAt > now
              ? 'UPCOMING'
              : !item.closeAt || item.closeAt >= now
                ? 'OPEN'
                : 'CLOSED',
          submittedLearnerCount: submittedLearners.size,
          inProgressLearnerCount: inProgressLearners.size,
          notSubmittedLearnerCount: Math.max(
            0,
            activeLearnerCount - submittedLearners.size - inProgressLearners.size,
          ),
          activeLearnerCount,
        };
      }),
      pendingGradingCount,
      grading: {
        waiting: gradingState.filter((state) => state === 'WAITING').length,
        partial: gradingState.filter((state) => state === 'PARTIAL').length,
        final: gradingState.filter((state) => state === 'FINAL').length,
      },
      progressBuckets,
      upcomingDeadlines: assessments
        .flatMap((item) => [
          { kind: 'OPEN', at: item.openAt, assessmentId: item.id, title: item.test.title },
          { kind: 'CLOSE', at: item.closeAt, assessmentId: item.id, title: item.test.title },
        ])
        .filter((item) => item.at && item.at >= now)
        .sort((a, b) => a.at!.getTime() - b.at!.getTime())
        .slice(0, 6),
      followUps: [
        ...(pendingGradingCount
          ? [{ kind: 'GRADING', count: pendingGradingCount, label: 'Bài nộp đang chờ chấm' }]
          : []),
        ...(inactiveLearnerCount
          ? [
              {
                kind: 'INACTIVE',
                count: inactiveLearnerCount,
                label: 'Học viên chưa có hoạt động trong 7 ngày',
              },
            ]
          : []),
      ],
    };
  }

  async learners(instructorId: string, classOfferingId: string) {
    const classroom = await this.requireOwnedClass(instructorId, classOfferingId);
    const totalLessons = await this.prisma.lesson.count({
      where: { module: { courseId: classroom.course.id } },
    });
    const enrollments = await this.prisma.enrollment.findMany({
      where: { classOfferingId },
      orderBy: [{ learner: { fullName: 'asc' } }, { id: 'asc' }],
      select: {
        id: true,
        status: true,
        enrolledAt: true,
        learner: { select: { id: true, fullName: true, email: true } },
        lessonProgress: { select: { status: true, lastAccessedAt: true, completedAt: true } },
        testAttempts: {
          where: { classAssessment: { classOfferingId }, status: TestAttemptStatus.SUBMITTED },
          orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
          select: {
            submittedAt: true,
            classAssessment: { select: { test: { select: { title: true } } } },
            skillScores: { select: { status: true, normalizedScore: true } },
            answers: {
              select: {
                evaluations: {
                  where: { status: AnswerEvaluationStatus.REVIEWED_FINAL },
                  select: { id: true },
                },
                testQuestion: { select: { question: { select: { toeicSkill: true } } } },
              },
            },
          },
        },
      },
    });
    return {
      classOffering: classroom,
      learners: enrollments.map((enrollment) => {
        const completedLessons = enrollment.lessonProgress.filter(
          (item) => item.status === LessonProgressStatus.COMPLETED,
        ).length;
        const pendingGradingCount = enrollment.testAttempts.filter((attempt) =>
          attempt.answers.some(
            (answer) =>
              PRODUCTIVE_SKILLS.includes(answer.testQuestion.question.toeicSkill) &&
              answer.evaluations.length === 0,
          ),
        ).length;
        const latestFinal = enrollment.testAttempts.find((attempt) =>
          attempt.skillScores.some((score) => score.status === SkillScoreStatus.FINAL),
        );
        const latestAttempt = enrollment.testAttempts[0];
        const latestLearningActivityAt = enrollment.lessonProgress.reduce<Date | null>(
          (latest, item) => {
            const activityAt = item.lastAccessedAt ?? item.completedAt;
            return activityAt && (!latest || activityAt > latest) ? activityAt : latest;
          },
          null,
        );
        const finalScores =
          latestAttempt?.skillScores.filter((score) => score.status === SkillScoreStatus.FINAL) ??
          [];
        return {
          id: enrollment.id,
          status: enrollment.status,
          enrolledAt: enrollment.enrolledAt,
          learner: enrollment.learner,
          completedLessons,
          totalLessons,
          progressPercentage:
            totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100),
          submittedAssessmentCount: enrollment.testAttempts.length,
          pendingGradingCount,
          latestGradedAssessmentAt: latestFinal?.submittedAt ?? null,
          latestLearningActivityAt,
          latestAssessment: latestAttempt
            ? {
                title: latestAttempt.classAssessment?.test.title,
                submittedAt: latestAttempt.submittedAt,
                state:
                  pendingGradingCount > 0
                    ? 'PENDING'
                    : finalScores.length > 0
                      ? 'GRADED'
                      : 'SUBMITTED',
                average:
                  finalScores.length > 0
                    ? Math.round(
                        (finalScores.reduce(
                          (sum, score) => sum + Number(score.normalizedScore),
                          0,
                        ) /
                          finalScores.length) *
                          10,
                      ) / 10
                    : null,
              }
            : null,
        };
      }),
    };
  }

  async learnerDetail(instructorId: string, classOfferingId: string, enrollmentId: string) {
    const classroom = await this.requireOwnedClass(instructorId, classOfferingId);
    const [enrollment, modules] = await Promise.all([
      this.prisma.enrollment.findFirst({
        where: { id: enrollmentId, classOfferingId },
        select: {
          id: true,
          status: true,
          enrolledAt: true,
          learner: { select: { id: true, fullName: true, email: true } },
          lessonProgress: {
            orderBy: [
              { lesson: { module: { orderIndex: 'asc' } } },
              { lesson: { orderIndex: 'asc' } },
            ],
            select: {
              status: true,
              lastAccessedAt: true,
              completedAt: true,
              lesson: {
                select: { id: true, title: true, module: { select: { id: true, title: true } } },
              },
            },
          },
          testAttempts: {
            where: { classAssessment: { classOfferingId }, status: TestAttemptStatus.SUBMITTED },
            orderBy: [{ submittedAt: 'desc' }, { attemptNumber: 'desc' }],
            select: {
              id: true,
              attemptNumber: true,
              submittedAt: true,
              classAssessment: {
                select: { id: true, stage: true, test: { select: { title: true, purpose: true } } },
              },
              skillScores: { select: { skill: true, status: true, normalizedScore: true } },
              answers: {
                select: {
                  evaluations: {
                    where: { status: AnswerEvaluationStatus.REVIEWED_FINAL },
                    select: { feedback: true, updatedAt: true },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.module.findMany({
        where: { courseId: classroom.course.id },
        orderBy: { orderIndex: 'asc' },
        select: {
          id: true,
          title: true,
          lessons: { orderBy: { orderIndex: 'asc' }, select: { id: true, title: true } },
        },
      }),
    ]);
    if (!enrollment) throw new NotFoundException('Learner enrollment not found');
    const latestFullyFinalized = enrollment.testAttempts.find((attempt) => {
      const finals = new Set(
        attempt.skillScores
          .filter((score) => score.status === SkillScoreStatus.FINAL)
          .map((score) => score.skill),
      );
      return (
        attempt.classAssessment?.test.purpose === TestPurpose.IN_CLASS &&
        SKILLS.every((skill) => finals.has(skill))
      );
    });
    const progressByLesson = new Map(
      enrollment.lessonProgress.map((item) => [item.lesson.id, item]),
    );
    const moduleProgress = modules.map((module) => {
      const completed = module.lessons.filter(
        (lesson) => progressByLesson.get(lesson.id)?.status === LessonProgressStatus.COMPLETED,
      ).length;
      return {
        id: module.id,
        title: module.title,
        completed,
        total: module.lessons.length,
        percentage: module.lessons.length
          ? Math.round((completed / module.lessons.length) * 100)
          : 0,
      };
    });
    const allActivity = [
      ...enrollment.lessonProgress.flatMap((item) => [
        {
          type:
            item.status === LessonProgressStatus.COMPLETED ? 'LESSON_COMPLETED' : 'LESSON_ACCESSED',
          at: item.completedAt ?? item.lastAccessedAt,
          label: item.lesson.title,
        },
      ]),
      ...enrollment.testAttempts.flatMap((attempt) => [
        {
          type: 'ASSESSMENT_SUBMITTED',
          at: attempt.submittedAt,
          label: attempt.classAssessment?.test.title ?? 'Bài kiểm tra',
        },
        ...attempt.answers.flatMap((answer) =>
          answer.evaluations.map((evaluation) => ({
            type: 'GRADING_FINAL',
            at: evaluation.updatedAt,
            label: attempt.classAssessment?.test.title ?? 'Bài kiểm tra',
          })),
        ),
      ]),
    ]
      .filter((item): item is { type: string; at: Date; label: string } => Boolean(item.at))
      .sort((a, b) => b.at.getTime() - a.at.getTime());
    const submittedAssessmentCount = new Set(
      enrollment.testAttempts.map((attempt) => attempt.classAssessment?.id).filter(Boolean),
    ).size;
    const pendingGrading = enrollment.testAttempts.filter((attempt) =>
      attempt.skillScores.some((score) => score.status !== SkillScoreStatus.FINAL),
    ).length;
    return {
      classOffering: classroom,
      enrollment: {
        id: enrollment.id,
        status: enrollment.status,
        enrolledAt: enrollment.enrolledAt,
        learner: enrollment.learner,
      },
      lessonProgress: enrollment.lessonProgress,
      attempts: enrollment.testAttempts.map((attempt) => ({
        ...attempt,
        skillScores: attempt.skillScores.map((score) => ({
          ...score,
          normalizedScore: Number(score.normalizedScore),
        })),
        feedback: [
          ...new Map(
            attempt.answers
              .flatMap((answer) => answer.evaluations)
              .filter((item) => item.feedback)
              .map((item) => [item.feedback, item]),
          ).values(),
        ],
        answers: undefined,
      })),
      latestFourSkillSnapshot: latestFullyFinalized
        ? {
            attemptId: latestFullyFinalized.id,
            assessmentTitle: latestFullyFinalized.classAssessment?.test.title,
            submittedAt: latestFullyFinalized.submittedAt,
            scores: latestFullyFinalized.skillScores.map((score) => ({
              ...score,
              normalizedScore: Number(score.normalizedScore),
            })),
          }
        : null,
      summary: {
        completedLessons: enrollment.lessonProgress.filter(
          (item) => item.status === LessonProgressStatus.COMPLETED,
        ).length,
        totalLessons: modules.reduce((sum, module) => sum + module.lessons.length, 0),
        submittedAssessmentCount,
        pendingGradingCount: pendingGrading,
        lastActivityAt: allActivity[0]?.at ?? null,
      },
      moduleProgress,
      recentActivity: allActivity.slice(0, 12),
      skillTrend: enrollment.testAttempts
        .filter((attempt) => attempt.classAssessment?.test.purpose === TestPurpose.IN_CLASS)
        .map((attempt) => ({
          attemptId: attempt.id,
          assessmentTitle: attempt.classAssessment?.test.title,
          stage: attempt.classAssessment?.stage,
          date: attempt.submittedAt,
          scores: attempt.skillScores
            .filter((score) => score.status === SkillScoreStatus.FINAL)
            .map((score) => ({
              skill: score.skill,
              normalizedScore: Number(score.normalizedScore),
            })),
        }))
        .filter((item) => item.scores.length > 0)
        .reverse(),
    };
  }

  async results(instructorId: string, classOfferingId: string) {
    const classroom = await this.requireOwnedClass(instructorId, classOfferingId);
    const [assessments, enrollments] = await Promise.all([
      this.prisma.classAssessment.findMany({
        where: { classOfferingId },
        orderBy: [{ createdAt: 'desc' }],
        select: {
          id: true,
          stage: true,
          createdAt: true,
          openAt: true,
          closeAt: true,
          test: { select: { id: true, title: true, purpose: true } },
          attempts: {
            where: { status: TestAttemptStatus.SUBMITTED },
            orderBy: [{ learnerId: 'asc' }, { attemptNumber: 'desc' }],
            select: {
              id: true,
              learnerId: true,
              attemptNumber: true,
              submittedAt: true,
              learner: { select: { fullName: true, email: true } },
              skillScores: { select: { skill: true, status: true, normalizedScore: true } },
            },
          },
        },
      }),
      this.prisma.enrollment.findMany({
        where: { classOfferingId, status: EnrollmentStatus.ACTIVE },
        select: { id: true, learnerId: true, learner: { select: { fullName: true, email: true } } },
      }),
    ]);
    const projected = assessments.map((assessment) =>
      this.projectAssessmentResults(assessment, enrollments.length),
    );
    return {
      classOffering: classroom,
      activeLearnerCount: enrollments.length,
      assessments: projected,
      trend: projected
        .filter((item, index) => assessments[index].test.purpose === TestPurpose.IN_CLASS)
        .map((item, index) => ({
          assessmentId: item.id,
          title: item.test.title,
          stage: item.stage,
          date:
            assessments[index].closeAt ?? assessments[index].openAt ?? assessments[index].createdAt,
          skills: item.skillAverages
            .filter((score) => score.average !== null)
            .map(({ skill, average, sampleCount }) => ({ skill, average, sampleCount })),
        })),
    };
  }

  async gradingInbox(instructorId: string, classOfferingId: string) {
    const classroom = await this.requireOwnedClass(instructorId, classOfferingId);
    const attempts = await this.prisma.testAttempt.findMany({
      where: { classAssessment: { classOfferingId }, status: TestAttemptStatus.SUBMITTED },
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        attemptNumber: true,
        submittedAt: true,
        learner: { select: { id: true, fullName: true, email: true } },
        classAssessment: {
          select: { id: true, stage: true, test: { select: { id: true, title: true } } },
        },
        answers: {
          where: {
            testQuestion: {
              question: { toeicSkill: { in: [ToeicSkill.SPEAKING, ToeicSkill.WRITING] } },
            },
          },
          select: {
            evaluations: {
              where: { source: AnswerEvaluationSource.INSTRUCTOR },
              select: { id: true, status: true },
            },
          },
        },
        skillScores: {
          where: {
            skill: { in: [ToeicSkill.LISTENING, ToeicSkill.READING] },
            status: SkillScoreStatus.FINAL,
          },
          select: { skill: true, normalizedScore: true },
        },
      },
    });
    const submissions = attempts.flatMap((attempt) => {
      if (attempt.answers.length === 0 || !attempt.classAssessment) return [];
      const evaluatedCount = attempt.answers.filter(
        (answer) => answer.evaluations.length > 0,
      ).length;
      const finalizedCount = attempt.answers.filter((answer) =>
        answer.evaluations.some(
          (evaluation) => evaluation.status === AnswerEvaluationStatus.REVIEWED_FINAL,
        ),
      ).length;
      const gradingState =
        evaluatedCount === 0
          ? 'WAITING'
          : finalizedCount === attempt.answers.length
            ? 'FINAL'
            : 'PARTIAL';
      const snapshot = (skill: ToeicSkill) => {
        const score = attempt.skillScores.find((item) => item.skill === skill);
        return score ? Number(score.normalizedScore) : null;
      };
      return [
        {
          ...attempt,
          answers: undefined,
          skillScores: undefined,
          gradingState,
          listeningScore: snapshot(ToeicSkill.LISTENING),
          readingScore: snapshot(ToeicSkill.READING),
          productiveFinalizedCount: finalizedCount,
          productiveTotal: attempt.answers.length,
        },
      ];
    });
    const grouped = submissions.reduce<
      Array<{
        classAssessment: (typeof submissions)[number]['classAssessment'];
        learners: Array<{
          learner: (typeof submissions)[number]['learner'];
          attempts: typeof submissions;
        }>;
      }>
    >((assessmentGroups, submission) => {
      let assessmentGroup = assessmentGroups.find(
        (item) => item.classAssessment!.id === submission.classAssessment!.id,
      );
      if (!assessmentGroup) {
        assessmentGroup = { classAssessment: submission.classAssessment, learners: [] };
        assessmentGroups.push(assessmentGroup);
      }
      let learnerGroup = assessmentGroup.learners.find(
        (item) => item.learner.id === submission.learner.id,
      );
      if (!learnerGroup) {
        learnerGroup = { learner: submission.learner, attempts: [] };
        assessmentGroup.learners.push(learnerGroup);
      }
      learnerGroup.attempts.push(submission);
      return assessmentGroups;
    }, []);
    return {
      classOffering: classroom,
      summary: {
        waiting: submissions.filter((item) => item.gradingState === 'WAITING').length,
        partial: submissions.filter((item) => item.gradingState === 'PARTIAL').length,
        final: submissions.filter((item) => item.gradingState === 'FINAL').length,
      },
      submissions,
      groups: grouped,
    };
  }

  private projectAssessmentResults(
    assessment: {
      id: string;
      stage: unknown;
      test: { id: string; title: string; purpose: TestPurpose };
      createdAt: Date;
      openAt: Date | null;
      closeAt: Date | null;
      attempts: Array<{
        id: string;
        learnerId: string;
        attemptNumber: number;
        submittedAt: Date | null;
        learner: { fullName: string; email: string };
        skillScores: Array<{
          skill: ToeicSkill;
          status: SkillScoreStatus;
          normalizedScore: { toString(): string };
        }>;
      }>;
    },
    activeLearnerCount: number,
  ) {
    const latestByLearner = new Map<string, (typeof assessment.attempts)[number]>();
    for (const attempt of assessment.attempts)
      if (!latestByLearner.has(attempt.learnerId)) latestByLearner.set(attempt.learnerId, attempt);
    const averages = SKILLS.map((skill) => {
      const values = [...latestByLearner.values()].flatMap((attempt) =>
        attempt.skillScores
          .filter((score) => score.skill === skill && score.status === SkillScoreStatus.FINAL)
          .map((score) => Number(score.normalizedScore)),
      );
      const buckets = {
        below50: values.filter((value) => value < 50).length,
        from50To69: values.filter((value) => value >= 50 && value < 70).length,
        from70To84: values.filter((value) => value >= 70 && value < 85).length,
        from85To100: values.filter((value) => value >= 85).length,
      };
      return {
        skill,
        average: values.length
          ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
          : null,
        sampleCount: values.length,
        excludedCount: activeLearnerCount - values.length,
        distribution: buckets,
      };
    });
    const latestAttempts = [...latestByLearner.values()];
    const fullyGradedCount = latestAttempts.filter((attempt) =>
      SKILLS.every((skill) =>
        attempt.skillScores.some(
          (score) => score.skill === skill && score.status === SkillScoreStatus.FINAL,
        ),
      ),
    ).length;
    return {
      id: assessment.id,
      stage: assessment.stage,
      test: assessment.test,
      submittedCount: assessment.attempts.length,
      latestAttemptCount: latestByLearner.size,
      fullyGradedCount,
      pendingGradingCount: latestByLearner.size - fullyGradedCount,
      notSubmittedCount: Math.max(0, activeLearnerCount - latestByLearner.size),
      completion: {
        fullyGraded: fullyGradedCount,
        pendingGrading: latestByLearner.size - fullyGradedCount,
        notSubmitted: Math.max(0, activeLearnerCount - latestByLearner.size),
        total: activeLearnerCount,
      },
      skillAverages: averages,
      learners: latestAttempts.map((attempt) => ({
        ...attempt,
        label: 'Lượt gần nhất',
        skillScores: attempt.skillScores.map((score) => ({
          ...score,
          normalizedScore: Number(score.normalizedScore),
        })),
      })),
    };
  }

  private async requireOwnedClass(instructorId: string, classOfferingId: string) {
    const classroom = await this.prisma.classOffering.findFirst({
      where: { id: classOfferingId, instructorId },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        modality: true,
        classStart: true,
        classEnd: true,
        course: { select: { id: true, title: true, level: true } },
        scheduleSlots: {
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
          select: { dayOfWeek: true, startTime: true, endTime: true, locationText: true },
        },
      },
    });
    if (!classroom) throw new ForbiddenException('You are not assigned to this class');
    return { ...classroom, scheduleSlots: classroom.scheduleSlots.map(projectScheduleSlot) };
  }
}

function formatTimeOnly(value: Date): string {
  return `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`;
}

function projectScheduleSlot(slot: {
  dayOfWeek: number;
  startTime: Date;
  endTime: Date;
  locationText: string | null;
}) {
  return {
    ...slot,
    startTime: formatTimeOnly(slot.startTime),
    endTime: formatTimeOnly(slot.endTime),
  };
}
