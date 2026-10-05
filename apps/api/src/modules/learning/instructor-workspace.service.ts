import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AnswerEvaluationStatus,
  EnrollmentStatus,
  LessonProgressStatus,
  SkillScoreStatus,
  TestAttemptStatus,
  TestPurpose,
  ToeicSkill,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const SKILLS: ToeicSkill[] = [ToeicSkill.LISTENING, ToeicSkill.READING, ToeicSkill.SPEAKING, ToeicSkill.WRITING];
const PRODUCTIVE_SKILLS: ToeicSkill[] = [ToeicSkill.SPEAKING, ToeicSkill.WRITING];

@Injectable()
export class InstructorWorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async listClasses(instructorId: string) {
    const classes = await this.prisma.classOffering.findMany({
      where: { instructorId },
      orderBy: [{ classStart: 'desc' }, { code: 'asc' }],
      select: {
        id: true, code: true, name: true, status: true, modality: true,
        classStart: true, classEnd: true,
        course: { select: { id: true, title: true, level: true } },
        scheduleSlots: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }], select: { dayOfWeek: true, startTime: true, endTime: true, locationText: true } },
        _count: { select: { enrollments: { where: { status: EnrollmentStatus.ACTIVE } } } },
      },
    });
    return classes.map((item) => ({ ...item, activeLearnerCount: item._count.enrollments, _count: undefined }));
  }

  async overview(instructorId: string, classOfferingId: string) {
    const classroom = await this.requireOwnedClass(instructorId, classOfferingId);
    const now = new Date();
    const [activeLearnerCount, totalLessons, completedLessonRows, assessments, submittedAttempts] = await Promise.all([
      this.prisma.enrollment.count({ where: { classOfferingId, status: EnrollmentStatus.ACTIVE } }),
      this.prisma.lesson.count({ where: { module: { courseId: classroom.course.id } } }),
      this.prisma.lessonProgress.count({ where: { enrollment: { classOfferingId, status: EnrollmentStatus.ACTIVE }, status: LessonProgressStatus.COMPLETED } }),
      this.prisma.classAssessment.findMany({
        where: { classOfferingId, isActive: true },
        orderBy: [{ openAt: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, stage: true, openAt: true, closeAt: true, test: { select: { id: true, title: true } } },
      }),
      this.prisma.testAttempt.findMany({
        where: { classAssessment: { classOfferingId }, status: TestAttemptStatus.SUBMITTED },
        select: { answers: { select: { evaluations: { where: { status: AnswerEvaluationStatus.REVIEWED_FINAL }, select: { id: true } }, testQuestion: { select: { question: { select: { toeicSkill: true } } } } } } },
      }),
    ]);
    const pendingGradingCount = submittedAttempts.filter((attempt) =>
      attempt.answers.some((answer) =>
        PRODUCTIVE_SKILLS.includes(answer.testQuestion.question.toeicSkill) && answer.evaluations.length === 0,
      ),
    ).length;
    return {
      classOffering: classroom,
      activeLearnerCount,
      lessonProgress: {
        completed: completedLessonRows,
        total: totalLessons * activeLearnerCount,
        percentage: totalLessons * activeLearnerCount === 0 ? 0 : Math.round((completedLessonRows / (totalLessons * activeLearnerCount)) * 100),
      },
      assessments: assessments.map((item) => ({
        ...item,
        availability: item.openAt && item.openAt > now ? 'UPCOMING' : !item.closeAt || item.closeAt >= now ? 'OPEN' : 'CLOSED',
      })),
      pendingGradingCount,
    };
  }

  async learners(instructorId: string, classOfferingId: string) {
    const classroom = await this.requireOwnedClass(instructorId, classOfferingId);
    const totalLessons = await this.prisma.lesson.count({ where: { module: { courseId: classroom.course.id } } });
    const enrollments = await this.prisma.enrollment.findMany({
      where: { classOfferingId },
      orderBy: [{ learner: { fullName: 'asc' } }, { id: 'asc' }],
      select: {
        id: true, status: true, enrolledAt: true,
        learner: { select: { id: true, fullName: true, email: true } },
        lessonProgress: { select: { status: true } },
        testAttempts: {
          where: { classAssessment: { classOfferingId }, status: TestAttemptStatus.SUBMITTED },
          orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
          select: { submittedAt: true, skillScores: { select: { status: true } }, answers: { select: { evaluations: { where: { status: AnswerEvaluationStatus.REVIEWED_FINAL }, select: { id: true } }, testQuestion: { select: { question: { select: { toeicSkill: true } } } } } } },
        },
      },
    });
    return {
      classOffering: classroom,
      learners: enrollments.map((enrollment) => {
        const completedLessons = enrollment.lessonProgress.filter((item) => item.status === LessonProgressStatus.COMPLETED).length;
        const pendingGradingCount = enrollment.testAttempts.filter((attempt) => attempt.answers.some((answer) => PRODUCTIVE_SKILLS.includes(answer.testQuestion.question.toeicSkill) && answer.evaluations.length === 0)).length;
        const latestFinal = enrollment.testAttempts.find((attempt) => attempt.skillScores.some((score) => score.status === SkillScoreStatus.FINAL));
        return {
          id: enrollment.id, status: enrollment.status, enrolledAt: enrollment.enrolledAt, learner: enrollment.learner,
          completedLessons, totalLessons,
          progressPercentage: totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100),
          submittedAssessmentCount: enrollment.testAttempts.length,
          pendingGradingCount,
          latestGradedAssessmentAt: latestFinal?.submittedAt ?? null,
        };
      }),
    };
  }

  async learnerDetail(instructorId: string, classOfferingId: string, enrollmentId: string) {
    const classroom = await this.requireOwnedClass(instructorId, classOfferingId);
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id: enrollmentId, classOfferingId },
      select: {
        id: true, status: true, enrolledAt: true,
        learner: { select: { id: true, fullName: true, email: true } },
        lessonProgress: {
          orderBy: [{ lesson: { module: { orderIndex: 'asc' } } }, { lesson: { orderIndex: 'asc' } }],
          select: { status: true, lastAccessedAt: true, completedAt: true, lesson: { select: { id: true, title: true, module: { select: { id: true, title: true } } } } },
        },
        testAttempts: {
          where: { classAssessment: { classOfferingId }, status: TestAttemptStatus.SUBMITTED },
          orderBy: [{ submittedAt: 'desc' }, { attemptNumber: 'desc' }],
          select: {
            id: true, attemptNumber: true, submittedAt: true,
            classAssessment: { select: { id: true, stage: true, test: { select: { title: true, purpose: true } } } },
            skillScores: { select: { skill: true, status: true, normalizedScore: true } },
            answers: { select: { evaluations: { where: { status: AnswerEvaluationStatus.REVIEWED_FINAL }, select: { feedback: true, updatedAt: true } } } },
          },
        },
      },
    });
    if (!enrollment) throw new NotFoundException('Learner enrollment not found');
    const latestFullyFinalized = enrollment.testAttempts.find((attempt) => {
      const finals = new Set(attempt.skillScores.filter((score) => score.status === SkillScoreStatus.FINAL).map((score) => score.skill));
      return attempt.classAssessment?.test.purpose === TestPurpose.IN_CLASS && SKILLS.every((skill) => finals.has(skill));
    });
    return {
      classOffering: classroom,
      enrollment: { id: enrollment.id, status: enrollment.status, enrolledAt: enrollment.enrolledAt, learner: enrollment.learner },
      lessonProgress: enrollment.lessonProgress,
      attempts: enrollment.testAttempts.map((attempt) => ({
        ...attempt,
        skillScores: attempt.skillScores.map((score) => ({ ...score, normalizedScore: Number(score.normalizedScore) })),
        feedback: attempt.answers.flatMap((answer) => answer.evaluations).filter((item) => item.feedback),
        answers: undefined,
      })),
      latestFourSkillSnapshot: latestFullyFinalized ? {
        attemptId: latestFullyFinalized.id,
        assessmentTitle: latestFullyFinalized.classAssessment?.test.title,
        submittedAt: latestFullyFinalized.submittedAt,
        scores: latestFullyFinalized.skillScores.map((score) => ({ ...score, normalizedScore: Number(score.normalizedScore) })),
      } : null,
    };
  }

  async results(instructorId: string, classOfferingId: string) {
    const classroom = await this.requireOwnedClass(instructorId, classOfferingId);
    const assessments = await this.prisma.classAssessment.findMany({
      where: { classOfferingId },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true, stage: true, test: { select: { id: true, title: true } },
        attempts: {
          where: { status: TestAttemptStatus.SUBMITTED },
          orderBy: [{ learnerId: 'asc' }, { attemptNumber: 'desc' }],
          select: { id: true, learnerId: true, attemptNumber: true, submittedAt: true, learner: { select: { fullName: true, email: true } }, skillScores: { select: { skill: true, status: true, normalizedScore: true } } },
        },
      },
    });
    return { classOffering: classroom, assessments: assessments.map((assessment) => this.projectAssessmentResults(assessment)) };
  }

  async gradingInbox(instructorId: string, classOfferingId: string) {
    const classroom = await this.requireOwnedClass(instructorId, classOfferingId);
    const attempts = await this.prisma.testAttempt.findMany({
      where: { classAssessment: { classOfferingId }, status: TestAttemptStatus.SUBMITTED },
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true, attemptNumber: true, submittedAt: true,
        learner: { select: { id: true, fullName: true, email: true } },
        classAssessment: { select: { id: true, stage: true, test: { select: { id: true, title: true } } } },
        answers: { where: { testQuestion: { question: { toeicSkill: { in: [ToeicSkill.SPEAKING, ToeicSkill.WRITING] } } } }, select: { evaluations: { where: { status: AnswerEvaluationStatus.REVIEWED_FINAL }, select: { id: true } } } },
      },
    });
    return {
      classOffering: classroom,
      submissions: attempts.map((attempt) => {
        const finalCount = attempt.answers.filter((answer) => answer.evaluations.length > 0).length;
        return { ...attempt, answers: undefined, gradingState: finalCount === 0 ? 'WAITING' : finalCount === attempt.answers.length ? 'FINAL' : 'PARTIAL' };
      }),
    };
  }

  private projectAssessmentResults(assessment: {
    id: string; stage: unknown; test: { id: string; title: string };
    attempts: Array<{ id: string; learnerId: string; attemptNumber: number; submittedAt: Date | null; learner: { fullName: string; email: string }; skillScores: Array<{ skill: ToeicSkill; status: SkillScoreStatus; normalizedScore: { toString(): string } }> }>;
  }) {
    const latestByLearner = new Map<string, (typeof assessment.attempts)[number]>();
    for (const attempt of assessment.attempts) if (!latestByLearner.has(attempt.learnerId)) latestByLearner.set(attempt.learnerId, attempt);
    const averages = SKILLS.map((skill) => {
      const values = [...latestByLearner.values()].flatMap((attempt) => attempt.skillScores.filter((score) => score.skill === skill && score.status === SkillScoreStatus.FINAL).map((score) => Number(score.normalizedScore)));
      return { skill, average: values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null, sampleCount: values.length, excludedCount: latestByLearner.size - values.length };
    });
    const latestAttempts = [...latestByLearner.values()];
    const fullyGradedCount = latestAttempts.filter((attempt) =>
      SKILLS.every((skill) => attempt.skillScores.some((score) => score.skill === skill && score.status === SkillScoreStatus.FINAL)),
    ).length;
    return {
      id: assessment.id, stage: assessment.stage, test: assessment.test,
      submittedCount: assessment.attempts.length,
      latestAttemptCount: latestByLearner.size,
      fullyGradedCount,
      pendingGradingCount: latestByLearner.size - fullyGradedCount,
      skillAverages: averages,
      learners: latestAttempts.map((attempt) => ({ ...attempt, label: 'Lượt gần nhất', skillScores: attempt.skillScores.map((score) => ({ ...score, normalizedScore: Number(score.normalizedScore) })) })),
    };
  }

  private async requireOwnedClass(instructorId: string, classOfferingId: string) {
    const classroom = await this.prisma.classOffering.findFirst({
      where: { id: classOfferingId, instructorId },
      select: {
        id: true, code: true, name: true, status: true, modality: true,
        classStart: true, classEnd: true,
        course: { select: { id: true, title: true, level: true } },
        scheduleSlots: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }], select: { dayOfWeek: true, startTime: true, endTime: true, locationText: true } },
      },
    });
    if (!classroom) throw new ForbiddenException('You are not assigned to this class');
    return classroom;
  }
}
