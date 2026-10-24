import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  AnswerEvaluationStatus,
  AssessmentStage,
  AttendanceStatus,
  ClassOfferingStatus,
  EnrollmentStatus,
  LessonProgressStatus,
  Prisma,
  QuestionResponseType,
  TestAttemptStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CertificateQueryDto, CompletionPolicyDto } from './certificates.dto';

@Injectable()
export class CertificatesService {
  constructor(private readonly prisma: PrismaService) {}

  async readiness(learnerId: string, enrollmentId: string) {
    return this.computeReadiness(this.prisma, learnerId, enrollmentId);
  }

  private async computeReadiness(
    db: PrismaService | Prisma.TransactionClient,
    learnerId: string,
    enrollmentId: string,
  ) {
    const enrollment = await db.enrollment.findFirst({
      where: { id: enrollmentId, learnerId },
      include: {
        learner: { select: { fullName: true, email: true } },
        lessonProgress: { select: { lessonId: true, status: true } },
        attendanceRecords: { select: { status: true, attendanceSessionId: true } },
        courseCompletion: { include: { certificate: true } },
        classOffering: {
          include: {
            course: {
              select: { title: true, modules: { select: { lessons: { select: { id: true } } } } },
            },
            completionPolicy: true,
            attendanceSessions: { select: { id: true } },
            classAssessments: {
              where: { stage: AssessmentStage.FINAL, isActive: true },
              select: {
                id: true,
                test: {
                  select: {
                    testQuestions: {
                      select: { id: true, question: { select: { responseType: true } } },
                    },
                  },
                },
                attempts: {
                  where: { enrollmentId, status: TestAttemptStatus.SUBMITTED },
                  orderBy: { submittedAt: 'desc' },
                  select: {
                    id: true,
                    evaluation: { select: { status: true } },
                    answers: {
                      select: {
                        testQuestionId: true,
                        selectedOptionIds: true,
                        textResponse: true,
                        audioStorageKey: true,
                        evaluations: {
                          where: { status: AnswerEvaluationStatus.REVIEWED_FINAL },
                          select: { id: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    const policy = enrollment.classOffering.completionPolicy ?? {
      minLessonCompletionPercent: 100,
      minAttendancePercent: null,
      requireFinalAssessment: true,
    };
    const lessonIds = enrollment.classOffering.course.modules.flatMap((module) =>
      module.lessons.map((lesson) => lesson.id),
    );
    const completed = new Set(
      enrollment.lessonProgress
        .filter((row) => row.status === LessonProgressStatus.COMPLETED)
        .map((row) => row.lessonId),
    );
    const lessonPercent =
      lessonIds.length === 0
        ? 100
        : Math.round((lessonIds.filter((id) => completed.has(id)).length / lessonIds.length) * 100);
    const sessionIds = new Set(enrollment.classOffering.attendanceSessions.map((item) => item.id));
    const relevantRecords = enrollment.attendanceRecords.filter((item) =>
      sessionIds.has(item.attendanceSessionId),
    );
    const attendanceCoverageComplete = relevantRecords.length === sessionIds.size;
    const attendedStatuses: AttendanceStatus[] = [
      AttendanceStatus.PRESENT,
      AttendanceStatus.LATE,
      AttendanceStatus.EXCUSED,
    ];
    const attended = relevantRecords.filter((row) => attendedStatuses.includes(row.status)).length;
    const attendancePercent =
      relevantRecords.length === 0 ? null : Math.round((attended / relevantRecords.length) * 100);
    const finals = enrollment.classOffering.classAssessments;
    const finalAssessmentSatisfied =
      finals.length > 0 &&
      finals.some((assessment) =>
        assessment.attempts.some((attempt) => {
          const byQuestion = new Map(
            attempt.answers.map((answer) => [answer.testQuestionId, answer]),
          );
          return assessment.test.testQuestions.every((testQuestion) => {
            const answer = byQuestion.get(testQuestion.id);
            if (!answer) return false;
            const productiveTypes: QuestionResponseType[] = [
              QuestionResponseType.TEXT_RESPONSE,
              QuestionResponseType.AUDIO_RESPONSE,
            ];
            const productive = productiveTypes.includes(testQuestion.question.responseType);
            const hasResponse =
              answer.selectedOptionIds.length > 0 ||
              Boolean(answer.textResponse?.trim()) ||
              Boolean(answer.audioStorageKey);
            return hasResponse && (!productive || answer.evaluations.length > 0);
          });
        }),
      );
    const unmet: string[] = [];
    if (enrollment.status !== EnrollmentStatus.ACTIVE && !enrollment.courseCompletion)
      unmet.push('ENROLLMENT_NOT_ACTIVE');
    if (enrollment.classOffering.status !== ClassOfferingStatus.COMPLETED)
      unmet.push('CLASS_NOT_COMPLETED');
    if (lessonPercent < policy.minLessonCompletionPercent)
      unmet.push('LESSON_PROGRESS_BELOW_POLICY');
    if (policy.minAttendancePercent !== null) {
      if (!attendanceCoverageComplete) unmet.push('ATTENDANCE_UNMARKED');
      else if ((attendancePercent ?? 0) < policy.minAttendancePercent)
        unmet.push('ATTENDANCE_BELOW_POLICY');
    }
    if (policy.requireFinalAssessment && !finalAssessmentSatisfied)
      unmet.push(
        finals.length === 0
          ? 'FINAL_ASSESSMENT_NOT_CONFIGURED'
          : 'FINAL_ASSESSMENT_INCOMPLETE_OR_PENDING',
      );
    return {
      enrollment: {
        id: enrollment.id,
        status: enrollment.status,
        learner: enrollment.learner,
        classOffering: {
          id: enrollment.classOffering.id,
          name: enrollment.classOffering.name,
          code: enrollment.classOffering.code,
          status: enrollment.classOffering.status,
          course: { title: enrollment.classOffering.course.title },
        },
      },
      policy: {
        id: enrollment.classOffering.completionPolicy?.id ?? null,
        minLessonCompletionPercent: policy.minLessonCompletionPercent,
        minAttendancePercent: policy.minAttendancePercent,
        requireFinalAssessment: policy.requireFinalAssessment,
      },
      evidence: {
        lesson: { total: lessonIds.length, completed: completed.size, percent: lessonPercent },
        attendance: {
          totalSessions: sessionIds.size,
          markedSessions: relevantRecords.length,
          attendedSessions: attended,
          coverageComplete: attendanceCoverageComplete,
          percent: attendancePercent,
        },
        finalAssessment: { activeCount: finals.length, satisfied: finalAssessmentSatisfied },
      },
      eligible: unmet.length === 0,
      unmet,
      completion: enrollment.courseCompletion,
    };
  }

  async evaluate(learnerId: string, enrollmentId: string) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw(
              Prisma.sql`SELECT id FROM "enrollments" WHERE id = ${enrollmentId}::uuid FOR UPDATE`,
            );
            const readiness = await this.computeReadiness(tx, learnerId, enrollmentId);
            if (readiness.completion || !readiness.eligible) return readiness;
            const enrollmentChanged = await tx.enrollment.updateMany({
              where: { id: enrollmentId, learnerId, status: EnrollmentStatus.ACTIVE },
              data: { status: EnrollmentStatus.COMPLETED },
            });
            if (enrollmentChanged.count !== 1)
              throw new ConflictException('Enrollment changed; reload and retry');
            const created = await tx.courseCompletion.create({
              data: {
                enrollmentId,
                policyId: readiness.policy.id,
                criteriaSnapshot: readiness.policy,
                evidenceSnapshot: readiness.evidence,
                completedAt: new Date(),
              },
            });
            const certificate = await tx.certificate.create({
              data: {
                completionId: created.id,
                certificateNumber: `SE-${new Date().getUTCFullYear()}-${randomBytes(6).toString('hex').toUpperCase()}`,
                learnerNameSnapshot: readiness.enrollment.learner.fullName,
                learnerEmailSnapshot: readiness.enrollment.learner.email,
                courseTitleSnapshot: readiness.enrollment.classOffering.course.title,
                classNameSnapshot: readiness.enrollment.classOffering.name,
                classCodeSnapshot: readiness.enrollment.classOffering.code,
                issuedAt: new Date(),
              },
            });
            return { ...readiness, completion: { ...created, certificate } };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error: unknown) {
        if (!this.isIssuanceConflict(error)) throw error;
        const completion = await this.prisma.courseCompletion.findUnique({
          where: { enrollmentId },
          include: { certificate: true },
        });
        if (completion) return this.readiness(learnerId, enrollmentId);
        if (attempt === 3)
          throw new ConflictException('Concurrent completion evaluation; please retry');
      }
    }
    throw new ConflictException('Concurrent completion evaluation; please retry');
  }

  listMine(learnerId: string) {
    return this.prisma.certificate.findMany({
      where: { completion: { enrollment: { learnerId } } },
      orderBy: { issuedAt: 'desc' },
      select: this.publicCertificateSelect(),
    });
  }

  async getMine(learnerId: string, id: string) {
    const certificate = await this.prisma.certificate.findFirst({
      where: { id, completion: { enrollment: { learnerId } } },
      select: this.publicCertificateSelect(),
    });
    if (!certificate) throw new NotFoundException('Certificate not found');
    return certificate;
  }

  async printable(learnerId: string, id: string) {
    const certificate = await this.getMine(learnerId, id);
    if (certificate.revokedAt) throw new ConflictException('Certificate has been revoked');
    const escape = (value: string) =>
      value.replace(
        /[&<>"']/g,
        (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
      );
    return `<!doctype html><html lang="vi"><meta charset="utf-8"><title>${escape(certificate.certificateNumber)}</title><style>@page{size:A4 landscape;margin:0}body{font-family:"Noto Sans",Arial,sans-serif;margin:0;display:grid;place-items:center;width:297mm;height:210mm;color:#172554}.c{box-sizing:border-box;width:277mm;height:190mm;border:8px double #4f46e5;padding:20mm;text-align:center}h1{font-size:36pt;margin:8mm}h2{font-size:24pt}p{font-size:15pt}</style><body><main class="c"><p>SMART ENGLISH E-LEARNING</p><h1>GIẤY CHỨNG NHẬN HOÀN THÀNH</h1><p>Trân trọng chứng nhận</p><h2>${escape(certificate.learnerNameSnapshot)}</h2><p>đã hoàn thành khóa học <strong>${escape(certificate.courseTitleSnapshot)}</strong></p><p>Lớp ${escape(certificate.classNameSnapshot)} (${escape(certificate.classCodeSnapshot)})</p><p>Số chứng nhận: ${escape(certificate.certificateNumber)} · Cấp ngày ${certificate.issuedAt.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p></main></body></html>`;
  }

  async getPolicy(classOfferingId: string) {
    const offering = await this.prisma.classOffering.findUnique({
      where: { id: classOfferingId },
      select: { id: true, completionPolicy: true },
    });
    if (!offering) throw new NotFoundException('Class offering not found');
    return (
      offering.completionPolicy ?? {
        classOfferingId,
        minLessonCompletionPercent: 100,
        minAttendancePercent: null,
        requireFinalAssessment: true,
      }
    );
  }

  async putPolicy(classOfferingId: string, input: CompletionPolicyDto) {
    const offering = await this.prisma.classOffering.findUnique({
      where: { id: classOfferingId },
      select: {
        status: true,
        enrollments: {
          where: { courseCompletion: { isNot: null } },
          take: 1,
          select: { id: true },
        },
      },
    });
    if (!offering) throw new NotFoundException('Class offering not found');
    if (offering.status === ClassOfferingStatus.COMPLETED || offering.enrollments.length > 0)
      throw new ConflictException('Completion policy is locked');
    return this.prisma.completionPolicy.upsert({
      where: { classOfferingId },
      create: {
        classOfferingId,
        ...input,
        minAttendancePercent: input.minAttendancePercent ?? null,
      },
      update: { ...input, minAttendancePercent: input.minAttendancePercent ?? null },
    });
  }

  async listAdmin(query: CertificateQueryDto) {
    const search = query.search;
    const issuedToExclusive = query.issuedTo
      ? new Date(new Date(query.issuedTo).getTime() + 24 * 60 * 60 * 1000)
      : undefined;
    const where: Prisma.CertificateWhereInput = {
      ...(query.status === 'VALID'
        ? { revokedAt: null }
        : query.status === 'REVOKED'
          ? { revokedAt: { not: null } }
          : {}),
      ...(search
        ? {
            OR: [
              { certificateNumber: { contains: search, mode: 'insensitive' } },
              { learnerNameSnapshot: { contains: search, mode: 'insensitive' } },
              { learnerEmailSnapshot: { contains: search, mode: 'insensitive' } },
              { courseTitleSnapshot: { contains: search, mode: 'insensitive' } },
              { classNameSnapshot: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.issuedFrom || issuedToExclusive
        ? {
            issuedAt: {
              ...(query.issuedFrom ? { gte: new Date(query.issuedFrom) } : {}),
              ...(issuedToExclusive ? { lt: issuedToExclusive } : {}),
            },
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.certificate.findMany({
        where,
        orderBy: { issuedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.certificate.count({ where }),
    ]);
    return {
      data,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async adminDetail(id: string) {
    const item = await this.prisma.certificate.findUnique({
      where: { id },
      include: { completion: true, revokedBy: { select: { id: true, fullName: true } } },
    });
    if (!item) throw new NotFoundException('Certificate not found');
    return item;
  }

  async revoke(adminId: string, id: string, reason: string) {
    const changed = await this.prisma.certificate.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date(), revokedById: adminId, revokeReason: reason.trim() },
    });
    if (changed.count !== 1)
      throw new ConflictException('Certificate is missing or already revoked');
    return this.adminDetail(id);
  }

  private publicCertificateSelect() {
    return {
      id: true,
      certificateNumber: true,
      learnerNameSnapshot: true,
      courseTitleSnapshot: true,
      classNameSnapshot: true,
      classCodeSnapshot: true,
      issuedAt: true,
      revokedAt: true,
    } as const;
  }

  private isIssuanceConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (['P2002', 'P2034'].includes(error.code) ||
        (error.code === 'P2010' && JSON.stringify(error.meta).includes('40001')))
    );
  }
}
