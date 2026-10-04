import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  EnrollmentStatus,
  Prisma,
  QuestionResponseType,
  SkillScoreSource,
  SkillScoreStatus,
  TestAttemptStatus,
  TestPurpose,
  TestStatus,
  ToeicSkill,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { computeBktUpdate } from '../knowledge-model/bkt';
import { AnswerSelectionDto, SaveAttemptAnswersDto } from './dto/save-attempt-answers.dto';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';
import {
  AssessmentResponseStorage,
} from '../placement/assessment-response.storage';
import {
  AssessmentStimulusMediaStorage,
  AssessmentStimulusMediaUnavailableError,
  InvalidAssessmentStimulusMediaKeyError,
} from '../placement/assessment-stimulus-media.storage';

const MAX_STUDENT_TRANSACTION_ATTEMPTS = 3;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const ACCEPTED_AUDIO_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg']);

const answerableTestQuestionSelect = {
  id: true,
  orderIndex: true,
  points: true,
  question: {
    select: {
      id: true,
      responseType: true,
      toeicSkill: true,
      difficulty: true,
      content: true,
      explanation: true,
      skills: {
        orderBy: { skillId: 'asc' as const },
        select: {
          skill: {
            select: {
              id: true,
              pInit: true,
              pLearn: true,
              pGuess: true,
              pSlip: true,
            },
          },
        },
      },
      options: {
        orderBy: { orderIndex: 'asc' as const },
        select: {
          id: true,
          content: true,
          orderIndex: true,
          isCorrect: true,
        },
      },
    },
  },
} satisfies Prisma.TestQuestionSelect;

type AnswerableTestQuestion = Prisma.TestQuestionGetPayload<{
  select: typeof answerableTestQuestionSelect;
}>;

const studentAttemptSelect = {
  id: true,
  learnerId: true,
  enrollmentId: true,
  classAssessmentId: true,
  attemptNumber: true,
  status: true,
  score: true,
  maxScore: true,
  startedAt: true,
  submittedAt: true,
  classAssessment: {
    select: {
      id: true,
      stage: true,
      openAt: true,
      closeAt: true,
      isActive: true,
      maxAttemptsOverride: true,
      classOfferingId: true,
    },
  },
  test: {
    select: {
      id: true,
      title: true,
      description: true,
      purpose: true,
      showResultAfterSubmit: true,
      timeLimitMinutes: true,
      testQuestions: {
        orderBy: { orderIndex: 'asc' as const },
        select: answerableTestQuestionSelect,
      },
      questionGroups: {
        orderBy: { orderIndex: 'asc' as const },
        select: {
          id: true,
          skill: true,
          orderIndex: true,
          title: true,
          instructions: true,
          stimulusText: true,
          taskCode: true,
          preparationSeconds: true,
          responseSeconds: true,
          recommendedSeconds: true,
          maxRecordingSeconds: true,
          stimuli: {
            where: { isProtected: false },
            orderBy: { orderIndex: 'asc' as const },
            select: {
              id: true,
              type: true,
              orderIndex: true,
              textContent: true,
              storageKey: true,
              mimeType: true,
              altText: true,
              isProtected: true,
            },
          },
          testQuestions: {
            orderBy: { orderIndex: 'asc' as const },
            select: answerableTestQuestionSelect,
          },
        },
      },
    },
  },
  answers: {
    select: {
      id: true,
      testQuestionId: true,
      selectedOptionIds: true,
      textResponse: true,
      audioStorageKey: true,
      isCorrect: true,
      pointsAwarded: true,
      updatedAt: true,
      evaluations: {
        where: { source: 'INSTRUCTOR' },
        orderBy: { updatedAt: 'desc' as const },
        take: 1,
        select: {
          status: true,
          totalScore: true,
          feedback: true,
          criterionScores: {
            orderBy: { rubricCriterion: { orderIndex: 'asc' as const } },
            select: {
              score: true,
              feedback: true,
              rubricCriterion: {
                select: { id: true, name: true, maxScore: true, orderIndex: true },
              },
            },
          },
        },
      },
    },
  },
  skillScores: {
    orderBy: { skill: 'asc' as const },
    select: {
      skill: true,
      rawScore: true,
      maxRawScore: true,
      normalizedScore: true,
      estimatedToeicScore: true,
      status: true,
      source: true,
    },
  },
} satisfies Prisma.TestAttemptSelect;

type StudentAttemptRecord = Prisma.TestAttemptGetPayload<{
  select: typeof studentAttemptSelect;
}>;

interface GradedBktObservation {
  testAnswerId: string;
  isCorrect: boolean;
  skills: Array<{
    id: string;
    pInit: number;
    pLearn: number;
    pGuess: number;
    pSlip: number;
  }>;
}

@Injectable()
export class AssessmentStudentService {
  private readonly logger = new Logger(AssessmentStudentService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly responseStorage?: AssessmentResponseStorage,
    @Optional() private readonly stimulusMediaStorage?: AssessmentStimulusMediaStorage,
  ) {}

  async listTests(learnerId: string, enrollmentId: string) {
    const enrollment = await this.requireActiveEnrollment(this.prisma, learnerId, enrollmentId);

    const [assignments, practiceTests] = await Promise.all([
      this.prisma.classAssessment.findMany({
        where: {
          classOfferingId: enrollment.classOffering.id,
          isActive: true,
          test: { status: TestStatus.PUBLISHED, purpose: TestPurpose.IN_CLASS },
        },
        orderBy: [{ openAt: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          stage: true,
          openAt: true,
          closeAt: true,
          maxAttemptsOverride: true,
          test: {
            select: {
              id: true,
              purpose: true,
              title: true,
              description: true,
              lessonId: true,
              maxAttempts: true,
              timeLimitMinutes: true,
              showResultAfterSubmit: true,
              questionGroups: { distinct: ['skill'], select: { skill: true } },
              _count: { select: { testQuestions: true } },
            },
          },
          attempts: {
            where: { enrollmentId },
            orderBy: { attemptNumber: 'asc' },
            select: { id: true, attemptNumber: true, status: true, submittedAt: true },
          },
        },
      }),
      this.prisma.test.findMany({
        where: {
          courseId: enrollment.classOffering.courseId,
          status: TestStatus.PUBLISHED,
          purpose: TestPurpose.PRACTICE_MOCK,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          purpose: true,
          title: true,
          description: true,
          lessonId: true,
          maxAttempts: true,
          timeLimitMinutes: true,
          showResultAfterSubmit: true,
          _count: { select: { testQuestions: true } },
          attempts: {
            where: { enrollmentId, classAssessmentId: null },
            orderBy: { attemptNumber: 'asc' },
            select: { id: true, attemptNumber: true, status: true, submittedAt: true },
          },
        },
      }),
    ]);

    const inClass = assignments.map((assignment) => {
      const test = assignment.test;
      const inProgress = assignment.attempts.find(
        ({ status }) => status === TestAttemptStatus.IN_PROGRESS,
      );
      const submitted = [...assignment.attempts]
        .reverse()
        .find(({ status }) => status === TestAttemptStatus.SUBMITTED);

      return {
        classAssessmentId: assignment.id,
        id: test.id,
        purpose: test.purpose,
        stage: assignment.stage,
        title: test.title,
        description: test.description,
        lessonId: test.lessonId,
        maxAttempts: assignment.maxAttemptsOverride ?? test.maxAttempts,
        timeLimitMinutes: test.timeLimitMinutes,
        openAt: assignment.openAt,
        closeAt: assignment.closeAt,
        showResultAfterSubmit: test.showResultAfterSubmit,
        questionCount: test._count.testQuestions,
        skills: test.questionGroups.map(({ skill }) => skill),
        attemptsUsed: assignment.attempts.length,
        hasInProgressAttempt: Boolean(inProgress),
        inProgressAttemptId: inProgress?.id ?? null,
        latestSubmittedAttemptId: submitted?.id ?? null,
        latestSubmittedAt: submitted?.submittedAt ?? null,
      };
    });

    const practice = practiceTests.map((test) => {
      const inProgress = test.attempts.find(({ status }) => status === TestAttemptStatus.IN_PROGRESS);
      const submitted = [...test.attempts]
        .reverse()
        .find(({ status }) => status === TestAttemptStatus.SUBMITTED);
      return {
        classAssessmentId: null,
        id: test.id,
        purpose: test.purpose,
        stage: null,
        title: test.title,
        description: test.description,
        lessonId: test.lessonId,
        maxAttempts: test.maxAttempts,
        timeLimitMinutes: test.timeLimitMinutes,
        openAt: null,
        closeAt: null,
        showResultAfterSubmit: test.showResultAfterSubmit,
        questionCount: test._count.testQuestions,
        skills: [],
        attemptsUsed: test.attempts.length,
        hasInProgressAttempt: Boolean(inProgress),
        inProgressAttemptId: inProgress?.id ?? null,
        latestSubmittedAttemptId: submitted?.id ?? null,
        latestSubmittedAt: submitted?.submittedAt ?? null,
      };
    });
    return [...inClass, ...practice];
  }

  async startOrResumeAttempt(learnerId: string, enrollmentId: string, testId: string) {
    const outcome = await this.runStudentTransaction(async (transaction) => {
      const enrollment = await this.requireActiveEnrollment(transaction, learnerId, enrollmentId);
      const test = await transaction.test.findFirst({
        where: {
          id: testId,
          courseId: enrollment.classOffering.courseId,
          status: TestStatus.PUBLISHED,
        },
        select: {
          id: true,
          purpose: true,
          maxAttempts: true,
          timeLimitMinutes: true,
          testQuestions: {
            select: {
              id: true,
              orderIndex: true,
              points: true,
              question: {
                select: {
                  id: true,
                  updatedAt: true,
                  options: { select: { id: true, updatedAt: true } },
                },
              },
            },
          },
        },
      });
      if (!test) {
        throw new NotFoundException('Test not found');
      }

      const classAssessment =
        test.purpose === TestPurpose.IN_CLASS
          ? await transaction.classAssessment.findFirst({
              where: {
                classOfferingId: enrollment.classOffering.id,
                testId,
                isActive: true,
              },
              select: {
                id: true,
                openAt: true,
                closeAt: true,
                maxAttemptsOverride: true,
              },
            })
          : null;
      if (test.purpose === TestPurpose.IN_CLASS && !classAssessment) {
        throw new NotFoundException('Class assessment not found');
      }
      const now = new Date();
      if (classAssessment?.openAt && now < classAssessment.openAt) {
        throw new ConflictException({ code: 'ASSESSMENT_NOT_OPEN', message: 'Bài kiểm tra chưa đến thời gian mở.' });
      }
      if (classAssessment?.closeAt && now >= classAssessment.closeAt) {
        throw new ConflictException({ code: 'ASSESSMENT_CLOSED', message: 'Bài kiểm tra đã đóng.' });
      }

      const inProgress = await transaction.testAttempt.findFirst({
        where: {
          testId,
          learnerId,
          enrollmentId,
          classAssessmentId: classAssessment?.id ?? null,
          status: TestAttemptStatus.IN_PROGRESS,
        },
        orderBy: { attemptNumber: 'desc' },
        select: this.attemptStartSelect(),
      });
      if (inProgress) {
        if (this.isDeadlineReached(inProgress.startedAt, test.timeLimitMinutes, classAssessment?.closeAt ?? null)) {
          await this.finalizeAttempt(transaction, enrollmentId, inProgress.id);
          return { state: 'EXPIRED' as const };
        }
        return { state: 'READY' as const, attempt: inProgress };
      }

      const attemptsUsed = await transaction.testAttempt.count({
        where: {
          testId,
          enrollmentId,
          classAssessmentId: classAssessment?.id ?? null,
        },
      });
      const maxAttempts = classAssessment?.maxAttemptsOverride ?? test.maxAttempts;
      if (attemptsUsed >= maxAttempts) {
        throw new ConflictException('Maximum number of attempts has been reached');
      }

      const attempt = await transaction.testAttempt.create({
        data: {
          testId,
          learnerId,
          enrollmentId,
          classAssessmentId: classAssessment?.id ?? null,
          attemptNumber: attemptsUsed + 1,
          status: TestAttemptStatus.IN_PROGRESS,
        },
        select: this.attemptStartSelect(),
      });
      return { state: 'READY' as const, attempt };
    }, 'Attempt start changed concurrently; please try again');
    if (outcome.state === 'EXPIRED') {
      throw new ConflictException({
        code: 'ATTEMPT_EXPIRED',
        message: 'Lượt làm đã hết hạn và được nộp tự động.',
      });
    }
    return outcome.attempt;
  }

  async getAttempt(learnerId: string, enrollmentId: string, attemptId: string) {
    const attempt = await this.runStudentTransaction(async (transaction) => {
      const enrollment = await this.requireActiveEnrollment(transaction, learnerId, enrollmentId);
      let current = await this.findStudentAttempt(
        transaction,
        learnerId,
        enrollment.classOffering.courseId,
        enrollmentId,
        attemptId,
      );
      if (
        current.status === TestAttemptStatus.IN_PROGRESS &&
        this.isDeadlineReached(
          current.startedAt,
          current.test.timeLimitMinutes,
          current.classAssessment?.closeAt ?? null,
        )
      ) {
        await this.finalizeAttempt(transaction, enrollmentId, attemptId);
        current = await this.findStudentAttempt(
          transaction,
          learnerId,
          enrollment.classOffering.courseId,
          enrollmentId,
          attemptId,
        );
      }
      return current;
    }, 'Lượt làm đang được cập nhật. Vui lòng thử lại.');

    const attemptMetadata = {
      id: attempt.id,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      expiresAt: this.effectiveDeadline(
        attempt.startedAt,
        attempt.test.timeLimitMinutes,
        attempt.classAssessment?.closeAt ?? null,
      ),
    };
    const testMetadata = {
      id: attempt.test.id,
      title: attempt.test.title,
      description: attempt.test.description,
      type: attempt.test.purpose,
      purpose: attempt.test.purpose,
      stage: attempt.classAssessment?.stage ?? null,
      timeLimitMinutes: attempt.test.timeLimitMinutes,
    };

    if (attempt.status === TestAttemptStatus.SUBMITTED) {
      return { attempt: attemptMetadata, test: testMetadata };
    }

    const saved = new Map(attempt.answers.map((answer) => [answer.testQuestionId, answer]));
    const projectQuestion = (testQuestion: AnswerableTestQuestion) => ({
      testQuestionId: testQuestion.id,
      orderIndex: testQuestion.orderIndex,
      points: testQuestion.points,
      question: {
        id: testQuestion.question.id,
        type: testQuestion.question.responseType,
        responseType: testQuestion.question.responseType,
        toeicSkill: testQuestion.question.toeicSkill,
        difficulty: testQuestion.question.difficulty,
        content: testQuestion.question.content,
        options: testQuestion.question.options.map((option) => ({
          id: option.id,
          content: option.content,
          orderIndex: option.orderIndex,
        })),
      },
      selectedOptionIds: saved.get(testQuestion.id)?.selectedOptionIds ?? [],
      textResponse: saved.get(testQuestion.id)?.textResponse ?? null,
      audioUploaded: Boolean(saved.get(testQuestion.id)?.audioStorageKey),
      audioUrl: saved.get(testQuestion.id)?.audioStorageKey
        ? `/api/learning/enrollments/${enrollmentId}/attempts/${attemptId}/answers/${testQuestion.id}/audio`
        : null,
    });
    return {
      attempt: attemptMetadata,
      test: testMetadata,
      questions: attempt.test.testQuestions.map(projectQuestion),
      groups: attempt.test.questionGroups.map((group) => ({
        id: group.id,
        skill: group.skill,
        orderIndex: group.orderIndex,
        title: group.title,
        instructions: group.instructions,
        taskCode: group.taskCode,
        preparationSeconds: group.preparationSeconds,
        responseSeconds: group.responseSeconds,
        recommendedSeconds: group.recommendedSeconds,
        maxRecordingSeconds: group.maxRecordingSeconds,
        stimulusText: group.skill === ToeicSkill.READING ? group.stimulusText : null,
        stimuli: group.stimuli.map((stimulus) => ({
          id: stimulus.id,
          type: stimulus.type,
          orderIndex: stimulus.orderIndex,
          textContent: stimulus.type === 'TEXT' ? stimulus.textContent : null,
          mediaUrl:
            stimulus.type === 'TEXT'
              ? null
              : `/api/learning/enrollments/${enrollmentId}/attempts/${attemptId}/stimuli/${stimulus.id}/media`,
          mimeType: stimulus.mimeType,
          altText: stimulus.altText,
        })),
        questions: group.testQuestions.map(projectQuestion),
      })),
    };
  }

  async saveAnswers(
    learnerId: string,
    enrollmentId: string,
    attemptId: string,
    dto: SaveAttemptAnswersDto,
  ) {
    const outcome = await this.runStudentTransaction(async (transaction) => {
      const enrollment = await this.requireActiveEnrollment(transaction, learnerId, enrollmentId);
      const attempt = await this.findStudentAttempt(
        transaction,
        learnerId,
        enrollment.classOffering.courseId,
        enrollmentId,
        attemptId,
      );
      if (attempt.status === TestAttemptStatus.SUBMITTED) {
        throw new ConflictException('Submitted attempts cannot be changed');
      }
      if (
        this.isDeadlineReached(
          attempt.startedAt,
          attempt.test.timeLimitMinutes,
          attempt.classAssessment?.closeAt ?? null,
        )
      ) {
        await this.finalizeAttempt(transaction, enrollmentId, attemptId);
        return { state: 'EXPIRED' as const };
      }

      const testQuestionMap = new Map(
        attempt.test.testQuestions.map((testQuestion) => [testQuestion.id, testQuestion]),
      );
      const seen = new Set<string>();
      const savedAnswers = [];
      for (const answer of dto.answers) {
        if (seen.has(answer.testQuestionId)) {
          throw new BadRequestException('Each TestQuestion may appear only once in an answer batch');
        }
        seen.add(answer.testQuestionId);
        const testQuestion = testQuestionMap.get(answer.testQuestionId);
        if (!testQuestion) throw new BadRequestException('TestQuestion does not belong to this Test');
        const responseType = testQuestion.question.responseType;
        let selectedOptionIds: string[] = [];
        let textResponse: string | null = null;
        if (responseType === QuestionResponseType.TEXT_RESPONSE) {
          if (answer.textResponse === undefined || answer.selectedOptionIds !== undefined) {
            throw new BadRequestException('Writing answers require textResponse only');
          }
          textResponse = answer.textResponse;
        } else if (responseType === QuestionResponseType.AUDIO_RESPONSE) {
          throw new BadRequestException('Speaking answers must use the audio upload endpoint');
        } else {
          if (answer.selectedOptionIds === undefined || answer.textResponse !== undefined) {
            throw new BadRequestException('Objective answers require selectedOptionIds only');
          }
          selectedOptionIds = this.validateSingleSelection(answer, testQuestion);
        }
        const saved = await transaction.testAnswer.upsert({
          where: {
            attemptId_testQuestionId: { attemptId, testQuestionId: testQuestion.id },
          },
          update: {
            selectedOptionIds,
            textResponse,
            audioStorageKey: null,
            isCorrect: null,
            pointsAwarded: null,
          },
          create: {
            attemptId,
            testQuestionId: testQuestion.id,
            selectedOptionIds,
            textResponse,
            isCorrect: null,
            pointsAwarded: null,
          },
          select: { updatedAt: true },
        });
        savedAnswers.push({
          testQuestionId: testQuestion.id,
          selectedOptionIds,
          textResponse,
          savedAt: saved.updatedAt,
        });
      }

      return { state: 'SAVED' as const, attemptId, answers: savedAnswers };
    }, 'Answer save changed concurrently; please try again');
    if (outcome.state === 'EXPIRED') {
      throw new ConflictException({
        code: 'ATTEMPT_EXPIRED',
        message: 'Lượt làm đã hết hạn và được nộp tự động.',
      });
    }
    return { attemptId: outcome.attemptId, answers: outcome.answers };
  }

  async uploadAudio(
    learnerId: string,
    enrollmentId: string,
    attemptId: string,
    testQuestionId: string,
    file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    if (!file?.buffer?.length || file.size <= 0) {
      throw new BadRequestException({ code: 'AUDIO_FILE_REQUIRED', message: 'Tệp ghi âm đang trống.' });
    }
    if (!ACCEPTED_AUDIO_TYPES.has(file.mimetype) || file.size > MAX_AUDIO_BYTES) {
      throw new BadRequestException({
        code: 'AUDIO_FILE_INVALID',
        message: 'Định dạng hoặc dung lượng tệp ghi âm không được hỗ trợ.',
      });
    }
    if (!this.responseStorage) {
      throw new ServiceUnavailableException('Assessment response storage is unavailable');
    }
    const stored = await this.responseStorage.put(
      { learnerId, attemptId, testQuestionId },
      file.buffer,
      file.mimetype,
    );
    try {
      const committed = await this.runStudentTransaction(async (transaction) => {
        const enrollment = await this.requireActiveEnrollment(transaction, learnerId, enrollmentId);
        const attempt = await this.findStudentAttempt(
          transaction,
          learnerId,
          enrollment.classOffering.courseId,
          enrollmentId,
          attemptId,
        );
        if (attempt.status === TestAttemptStatus.SUBMITTED) {
          return { state: 'REJECTED' as const, code: 'ATTEMPT_ALREADY_SUBMITTED' };
        }
        if (
          this.isDeadlineReached(
            attempt.startedAt,
            attempt.test.timeLimitMinutes,
            attempt.classAssessment?.closeAt ?? null,
          )
        ) {
          await this.finalizeAttempt(transaction, enrollmentId, attemptId);
          return { state: 'REJECTED' as const, code: 'ATTEMPT_EXPIRED' };
        }
        const testQuestion = attempt.test.testQuestions.find(({ id }) => id === testQuestionId);
        if (
          !testQuestion ||
          testQuestion.question.responseType !== QuestionResponseType.AUDIO_RESPONSE
        ) {
          throw new BadRequestException('This question does not accept an audio response');
        }
        const previous = attempt.answers.find(
          (answer) => answer.testQuestionId === testQuestionId,
        )?.audioStorageKey;
        const answer = await transaction.testAnswer.upsert({
          where: { attemptId_testQuestionId: { attemptId, testQuestionId } },
          update: {
            selectedOptionIds: [],
            textResponse: null,
            audioStorageKey: stored.key,
            isCorrect: null,
            pointsAwarded: null,
          },
          create: {
            attemptId,
            testQuestionId,
            selectedOptionIds: [],
            audioStorageKey: stored.key,
          },
          select: { updatedAt: true },
        });
        return { state: 'SAVED' as const, previous, savedAt: answer.updatedAt };
      }, 'Bản ghi âm đang được lưu ở phiên khác. Vui lòng thử lại.');
      if (committed.state === 'REJECTED') {
        await this.responseStorage.delete(stored.key).catch(() => undefined);
        throw new ConflictException({
          code: committed.code,
          message: committed.code === 'ATTEMPT_EXPIRED'
            ? 'Lượt làm đã hết hạn và được nộp tự động.'
            : 'Bài kiểm tra đã được nộp.',
        });
      }
      if (committed.previous && committed.previous !== stored.key) {
        await this.responseStorage.delete(committed.previous).catch(() => undefined);
      }
      return {
        attemptId,
        testQuestionId,
        state: 'UPLOADED',
        savedAt: committed.savedAt,
        playbackUrl: `/api/learning/enrollments/${enrollmentId}/attempts/${attemptId}/answers/${testQuestionId}/audio`,
      };
    } catch (error: unknown) {
      await this.responseStorage.delete(stored.key).catch(() => undefined);
      throw error;
    }
  }

  async openAudioResponse(
    learnerId: string,
    enrollmentId: string,
    attemptId: string,
    testQuestionId: string,
  ) {
    if (!this.responseStorage) throw new NotFoundException('Audio response not found');
    const enrollment = await this.requireActiveEnrollment(this.prisma, learnerId, enrollmentId);
    const attempt = await this.findStudentAttempt(
      this.prisma,
      learnerId,
      enrollment.classOffering.courseId,
      enrollmentId,
      attemptId,
    );
    const testQuestion = attempt.test.testQuestions.find(({ id }) => id === testQuestionId);
    const answer = attempt.answers.find(({ testQuestionId: id }) => id === testQuestionId);
    if (
      !testQuestion ||
      testQuestion.question.responseType !== QuestionResponseType.AUDIO_RESPONSE ||
      !answer?.audioStorageKey
    ) {
      throw new NotFoundException('Audio response not found');
    }
    return {
      stream: this.responseStorage.open(answer.audioStorageKey),
      mimeType: this.audioMimeForKey(answer.audioStorageKey),
    };
  }

  async openStimulusMedia(
    learnerId: string,
    enrollmentId: string,
    attemptId: string,
    stimulusId: string,
  ) {
    if (!this.stimulusMediaStorage) {
      throw new ServiceUnavailableException('Assessment stimulus storage is unavailable');
    }
    const enrollment = await this.requireActiveEnrollment(this.prisma, learnerId, enrollmentId);
    const attempt = await this.findStudentAttempt(
      this.prisma,
      learnerId,
      enrollment.classOffering.courseId,
      enrollmentId,
      attemptId,
    );
    const stimulus = attempt.test.questionGroups
      .flatMap(({ stimuli }) => stimuli)
      .find(({ id }) => id === stimulusId && !id.startsWith('protected:'));
    if (!stimulus?.storageKey || !stimulus.mimeType || stimulus.isProtected) {
      throw new NotFoundException('Assessment stimulus not found');
    }
    try {
      return {
        body: await this.stimulusMediaStorage.read(stimulus.storageKey),
        mimeType: stimulus.mimeType,
      };
    } catch (error: unknown) {
      if (error instanceof InvalidAssessmentStimulusMediaKeyError) {
        throw new NotFoundException('Assessment stimulus not found');
      }
      if (error instanceof AssessmentStimulusMediaUnavailableError) {
        this.logger.error(error.message);
        throw new ServiceUnavailableException({
          code: 'STIMULUS_MEDIA_UNAVAILABLE',
          message: 'Nội dung đa phương tiện hiện không khả dụng.',
        });
      }
      throw error;
    }
  }

  async submitAttempt(
    learnerId: string,
    enrollmentId: string,
    attemptId: string,
    dto: SubmitAttemptDto,
  ) {
    return this.runStudentTransaction(async (transaction) => {
      const enrollment = await this.requireActiveEnrollment(transaction, learnerId, enrollmentId);
      let attempt = await this.findStudentAttempt(
        transaction,
        learnerId,
        enrollment.classOffering.courseId,
        enrollmentId,
        attemptId,
      );
      if (attempt.status === TestAttemptStatus.SUBMITTED) {
        return this.buildSubmissionResponse(attempt);
      }

      const expired = this.isDeadlineReached(
        attempt.startedAt,
        attempt.test.timeLimitMinutes,
        attempt.classAssessment?.closeAt ?? null,
      );
      if (expired) {
        const submitted = await this.finalizeAttempt(transaction, enrollmentId, attemptId);
        return this.buildSubmissionResponse(submitted);
      }

      if (dto.answers.length > 0) {
        await this.saveSubmissionAnswers(transaction, attemptId, dto.answers, attempt.test.testQuestions);
        attempt = await this.findStudentAttempt(
          transaction,
          learnerId,
          enrollment.classOffering.courseId,
          enrollmentId,
          attemptId,
        );
      }
      if (attempt.test.purpose === TestPurpose.IN_CLASS) {
        const missingSpeaking = attempt.test.testQuestions.filter(
          ({ id, question }) =>
            question.responseType === QuestionResponseType.AUDIO_RESPONSE &&
            !attempt.answers.some(
              (answer) => answer.testQuestionId === id && Boolean(answer.audioStorageKey),
            ),
        );
        const missingWriting = attempt.test.testQuestions.filter(
          ({ id, question }) =>
            question.responseType === QuestionResponseType.TEXT_RESPONSE &&
            !attempt.answers.some(
              (answer) => answer.testQuestionId === id && Boolean(answer.textResponse?.trim()),
            ),
        );
        if (missingSpeaking.length || missingWriting.length) {
          throw new ConflictException({
            code: 'PRODUCTIVE_RESPONSES_INCOMPLETE',
            message: 'Cần lưu đầy đủ câu trả lời Speaking và Writing trước khi nộp bài.',
            speakingTestQuestionIds: missingSpeaking.map(({ id }) => id),
            writingTestQuestionIds: missingWriting.map(({ id }) => id),
          });
        }
      }

      const submitted = await this.finalizeAttempt(transaction, enrollmentId, attemptId);
      return this.buildSubmissionResponse(submitted);
    }, 'Attempt submission changed concurrently; please try again');
  }

  async getResult(learnerId: string, enrollmentId: string, attemptId: string) {
    const attempt = await this.runStudentTransaction(async (transaction) => {
      const enrollment = await this.requireActiveEnrollment(transaction, learnerId, enrollmentId);
      let current = await this.findStudentAttempt(
        transaction,
        learnerId,
        enrollment.classOffering.courseId,
        enrollmentId,
        attemptId,
      );
      if (
        current.status === TestAttemptStatus.IN_PROGRESS &&
        this.isDeadlineReached(
          current.startedAt,
          current.test.timeLimitMinutes,
          current.classAssessment?.closeAt ?? null,
        )
      ) {
        await this.finalizeAttempt(transaction, enrollmentId, attemptId);
        current = await this.findStudentAttempt(
          transaction,
          learnerId,
          enrollment.classOffering.courseId,
          enrollmentId,
          attemptId,
        );
      }
      return current;
    }, 'Kết quả đang được cập nhật. Vui lòng thử lại.');
    if (attempt.status !== TestAttemptStatus.SUBMITTED) {
      throw new NotFoundException('Result not found');
    }
    if (!attempt.test.showResultAfterSubmit) {
      throw new ForbiddenException('This result is not currently available');
    }

    const answerMap = new Map(attempt.answers.map((answer) => [answer.testQuestionId, answer]));
    const score = attempt.score ?? 0;
    const maxScore = attempt.maxScore ?? 0;
    const skills = [...new Set(attempt.test.testQuestions.map(({ question }) => question.toeicSkill))];
    const skillResults = skills.map((skill) => {
      const persisted = attempt.skillScores.find((item) => item.skill === skill);
      const productive = skill === ToeicSkill.SPEAKING || skill === ToeicSkill.WRITING;
      const skillQuestions = attempt.test.testQuestions.filter(
        ({ question }) => question.toeicSkill === skill,
      );
      const hasResponse = skillQuestions.some(({ id }) => {
        const answer = answerMap.get(id);
        return Boolean(answer?.textResponse?.trim() || answer?.audioStorageKey || answer?.selectedOptionIds.length);
      });
      return persisted
        ? {
            skill,
            status: persisted.status,
            source: persisted.source,
            rawScore: Number(persisted.rawScore ?? 0),
            maxRawScore: Number(persisted.maxRawScore ?? 0),
            normalizedScore: Number(persisted.normalizedScore),
            state: 'FINAL',
          }
        : {
            skill,
            status: null,
            source: null,
            rawScore: null,
            maxRawScore: skillQuestions.reduce((sum, question) => sum + question.points, 0),
            normalizedScore: null,
            state: productive && hasResponse ? 'PENDING_REVIEW' : 'MISSING_RESPONSE',
          };
    });
    const allSkillsFinal = skillResults.length > 0 && skillResults.every(({ state }) => state === 'FINAL');
    const totalAwarded = attempt.answers.reduce(
      (sum, answer) => sum.plus(answer.pointsAwarded ?? 0),
      new Prisma.Decimal(0),
    );
    const totalConfigured = attempt.test.testQuestions.reduce(
      (sum, question) => sum.plus(question.points),
      new Prisma.Decimal(0),
    );
    const total = allSkillsFinal
      ? {
          awardedPoints: Number(totalAwarded.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)),
          maxPoints: Number(totalConfigured.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)),
          percentage: Number(
            totalAwarded
              .div(totalConfigured)
              .mul(100)
              .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
          ),
          label: 'Tổng điểm bài kiểm tra',
        }
      : null;

    return {
      attempt: {
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        score,
        maxScore,
        percentage: this.percentage(score, maxScore),
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
      },
      test: {
        id: attempt.test.id,
        title: attempt.test.title,
        type: attempt.test.purpose,
        purpose: attempt.test.purpose,
        stage: attempt.classAssessment?.stage ?? null,
      },
      gradingState: allSkillsFinal ? 'REVIEWED_FINAL' : 'SUBMITTED_PENDING_REVIEW',
      skills: skillResults,
      total: attempt.test.purpose === TestPurpose.IN_CLASS ? total : {
        awardedPoints: score,
        maxPoints: maxScore,
        percentage: this.percentage(score, maxScore),
        label: 'Điểm',
      },
      questions: attempt.test.testQuestions.map((testQuestion) => {
        const answer = answerMap.get(testQuestion.id);
        const selectedOptionIds = answer?.selectedOptionIds ?? [];
        const selectedSet = new Set(selectedOptionIds.map((id) => id.toLowerCase()));

        return {
          testQuestionId: testQuestion.id,
          points: testQuestion.points,
          question: {
            id: testQuestion.question.id,
            type: testQuestion.question.responseType,
            difficulty: testQuestion.question.difficulty,
            content: testQuestion.question.content,
            explanation: testQuestion.question.explanation,
            toeicSkill: testQuestion.question.toeicSkill,
            options: testQuestion.question.options.map((option) => ({
              id: option.id,
              content: option.content,
              orderIndex: option.orderIndex,
              isCorrect: option.isCorrect,
              wasSelected: selectedSet.has(option.id.toLowerCase()),
            })),
          },
          answer: {
            selectedOptionIds,
            textResponse: answer?.textResponse ?? null,
            audioUrl: answer?.audioStorageKey
              ? `/api/learning/enrollments/${enrollmentId}/attempts/${attemptId}/answers/${testQuestion.id}/audio`
              : null,
            isCorrect: answer?.isCorrect ?? null,
            pointsAwarded: answer?.pointsAwarded === null || answer?.pointsAwarded === undefined
              ? null
              : Number(answer.pointsAwarded),
            evaluation: answer?.evaluations[0]
              ? {
                  status: answer.evaluations[0].status,
                  totalScore: answer.evaluations[0].totalScore === null
                    ? null
                    : Number(answer.evaluations[0].totalScore),
                  feedback: answer.evaluations[0].feedback,
                  criteria: answer.evaluations[0].criterionScores.map((criterion) => ({
                    id: criterion.rubricCriterion.id,
                    name: criterion.rubricCriterion.name,
                    score: Number(criterion.score),
                    maxScore: Number(criterion.rubricCriterion.maxScore),
                    feedback: criterion.feedback,
                  })),
                }
              : null,
          },
        };
      }),
    };
  }

  private async requireActiveEnrollment(
    database: PrismaService | Prisma.TransactionClient,
    learnerId: string,
    enrollmentId: string,
  ) {
    const enrollment = await database.enrollment.findFirst({
      where: {
        id: enrollmentId,
        learnerId,
        status: EnrollmentStatus.ACTIVE,
      },
      select: {
        id: true,
        classOffering: { select: { id: true, courseId: true } },
      },
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }
    return enrollment;
  }

  private async findStudentAttempt(
    database: PrismaService | Prisma.TransactionClient,
    learnerId: string,
    courseId: string,
    enrollmentId: string,
    attemptId: string,
  ): Promise<StudentAttemptRecord> {
    const attempt = await database.testAttempt.findFirst({
      where: {
        id: attemptId,
        learnerId,
        enrollmentId,
        test: { courseId },
      },
      select: studentAttemptSelect,
    });
    if (!attempt) {
      throw new NotFoundException('Attempt not found');
    }
    return attempt;
  }

  private async finalizeAttempt(
    transaction: Prisma.TransactionClient,
    enrollmentId: string,
    attemptId: string,
  ): Promise<StudentAttemptRecord> {
    const attempt = await transaction.testAttempt.findFirst({
      where: { id: attemptId, enrollmentId },
      select: studentAttemptSelect,
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.status === TestAttemptStatus.SUBMITTED) return attempt;

    let objectiveScore = 0;
    let objectiveMax = 0;
    const bySkill = new Map<
      ToeicSkill,
      { raw: Prisma.Decimal; max: Prisma.Decimal }
    >();
    const bktObservations: GradedBktObservation[] = [];
    const answerMap = new Map(attempt.answers.map((answer) => [answer.testQuestionId, answer]));

    for (const testQuestion of attempt.test.testQuestions) {
      const responseType = testQuestion.question.responseType;
      if (
        responseType === QuestionResponseType.TEXT_RESPONSE ||
        responseType === QuestionResponseType.AUDIO_RESPONSE
      ) {
        continue;
      }
      const selectedOptionIds = [...(answerMap.get(testQuestion.id)?.selectedOptionIds ?? [])]
        .map((id) => id.toLowerCase())
        .sort();
      const correctOptionIds = testQuestion.question.options
        .filter(({ isCorrect }) => isCorrect)
        .map(({ id }) => id.toLowerCase())
        .sort();
      const isCorrect = this.sameSet(selectedOptionIds, correctOptionIds);
      const awarded = isCorrect ? testQuestion.points : 0;
      objectiveScore += awarded;
      objectiveMax += testQuestion.points;
      const current = bySkill.get(testQuestion.question.toeicSkill) ?? {
        raw: new Prisma.Decimal(0),
        max: new Prisma.Decimal(0),
      };
      current.raw = current.raw.plus(awarded);
      current.max = current.max.plus(testQuestion.points);
      bySkill.set(testQuestion.question.toeicSkill, current);

      const saved = await transaction.testAnswer.upsert({
        where: { attemptId_testQuestionId: { attemptId, testQuestionId: testQuestion.id } },
        update: { selectedOptionIds, isCorrect, pointsAwarded: new Prisma.Decimal(awarded) },
        create: {
          attemptId,
          testQuestionId: testQuestion.id,
          selectedOptionIds,
          isCorrect,
          pointsAwarded: new Prisma.Decimal(awarded),
        },
        select: { id: true },
      });
      bktObservations.push({
        testAnswerId: saved.id,
        isCorrect,
        skills: testQuestion.question.skills.map(({ skill }) => skill),
      });
    }

    for (const [skill, totals] of bySkill) {
      const normalized = totals.max.equals(0)
        ? new Prisma.Decimal(0)
        : totals.raw
            .div(totals.max)
            .mul(100)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      await transaction.attemptSkillScore.upsert({
        where: { attemptId_skill: { attemptId, skill } },
        update: {
          rawScore: totals.raw,
          maxRawScore: totals.max,
          normalizedScore: normalized,
          estimatedToeicScore: null,
          status: SkillScoreStatus.FINAL,
          source: SkillScoreSource.OBJECTIVE_AUTO,
        },
        create: {
          attemptId,
          skill,
          rawScore: totals.raw,
          maxRawScore: totals.max,
          normalizedScore: normalized,
          estimatedToeicScore: null,
          status: SkillScoreStatus.FINAL,
          source: SkillScoreSource.OBJECTIVE_AUTO,
        },
      });
    }

    if (attempt.test.purpose === TestPurpose.PRACTICE_MOCK) {
      await this.applyBktObservations(transaction, enrollmentId, attemptId, bktObservations);
    }

    await transaction.testAttempt.update({
      where: { id: attemptId },
      data: {
        status: TestAttemptStatus.SUBMITTED,
        score: objectiveScore,
        maxScore: objectiveMax,
        submittedAt: new Date(),
      },
    });
    const submitted = await transaction.testAttempt.findFirst({
      where: { id: attemptId, enrollmentId },
      select: studentAttemptSelect,
    });
    if (!submitted) throw new NotFoundException('Attempt not found');
    return submitted;
  }

  private async saveSubmissionAnswers(
    transaction: Prisma.TransactionClient,
    attemptId: string,
    answers: AnswerSelectionDto[],
    testQuestions: AnswerableTestQuestion[],
  ) {
    const questionMap = new Map(testQuestions.map((question) => [question.id, question]));
    const seen = new Set<string>();
    for (const answer of answers) {
      if (seen.has(answer.testQuestionId)) {
        throw new BadRequestException('Each TestQuestion may appear only once in an answer batch');
      }
      seen.add(answer.testQuestionId);
      const testQuestion = questionMap.get(answer.testQuestionId);
      if (!testQuestion) throw new BadRequestException('TestQuestion does not belong to this Test');
      const responseType = testQuestion.question.responseType;
      if (responseType === QuestionResponseType.AUDIO_RESPONSE) {
        throw new BadRequestException('Speaking answers must use the audio upload endpoint');
      }
      const selectedOptionIds =
        responseType === QuestionResponseType.TEXT_RESPONSE
          ? []
          : this.validateSingleSelection(answer, testQuestion);
      const textResponse =
        responseType === QuestionResponseType.TEXT_RESPONSE ? answer.textResponse : null;
      if (
        responseType === QuestionResponseType.TEXT_RESPONSE &&
        (answer.textResponse === undefined || answer.selectedOptionIds !== undefined)
      ) {
        throw new BadRequestException('Writing answers require textResponse only');
      }
      await transaction.testAnswer.upsert({
        where: { attemptId_testQuestionId: { attemptId, testQuestionId: testQuestion.id } },
        update: { selectedOptionIds, textResponse, isCorrect: null, pointsAwarded: null },
        create: { attemptId, testQuestionId: testQuestion.id, selectedOptionIds, textResponse },
      });
    }
  }

  private validateSingleSelection(
    answer: AnswerSelectionDto,
    testQuestion: AnswerableTestQuestion,
  ): string[] {
    if (answer.selectedOptionIds === undefined || answer.textResponse !== undefined) {
      throw new BadRequestException('Objective answers require selectedOptionIds only');
    }
    const selectedOptionIds = answer.selectedOptionIds.map((id) => id.toLowerCase()).sort();
    if (new Set(selectedOptionIds).size !== selectedOptionIds.length) {
      throw new BadRequestException('selectedOptionIds must not contain duplicates');
    }
    if (
      (testQuestion.question.responseType === QuestionResponseType.SINGLE_CHOICE ||
        testQuestion.question.responseType === QuestionResponseType.TRUE_FALSE) &&
      selectedOptionIds.length > 1
    ) {
      throw new BadRequestException(
        `${testQuestion.question.responseType} accepts at most one selected option`,
      );
    }
    const validOptionIds = new Set(
      testQuestion.question.options.map(({ id }) => id.toLowerCase()),
    );
    if (!selectedOptionIds.every((id) => validOptionIds.has(id))) {
      throw new BadRequestException('Every selected option must belong to the answered Question');
    }
    return selectedOptionIds;
  }

  private validateAnswerSelections(
    answers: AnswerSelectionDto[],
    testQuestions: AnswerableTestQuestion[],
  ): Map<string, string[]> {
    const testQuestionMap = new Map(
      testQuestions.map((testQuestion) => [testQuestion.id.toLowerCase(), testQuestion]),
    );
    const selections = new Map<string, string[]>();

    for (const answer of answers) {
      const testQuestionId = answer.testQuestionId.toLowerCase();
      if (selections.has(testQuestionId)) {
        throw new BadRequestException('Each TestQuestion may appear only once in an answer batch');
      }
      const testQuestion = testQuestionMap.get(testQuestionId);
      if (!testQuestion) {
        throw new BadRequestException('TestQuestion does not belong to this Test');
      }

      const selectedOptionIds = (answer.selectedOptionIds ?? []).map((id) => id.toLowerCase()).sort();
      if (new Set(selectedOptionIds).size !== selectedOptionIds.length) {
        throw new BadRequestException('selectedOptionIds must not contain duplicates');
      }
      if (
        (testQuestion.question.responseType === QuestionResponseType.SINGLE_CHOICE ||
          testQuestion.question.responseType === QuestionResponseType.TRUE_FALSE) &&
        selectedOptionIds.length > 1
      ) {
        throw new BadRequestException(
          `${testQuestion.question.responseType} accepts at most one selected option`,
        );
      }

      const validOptionIds = new Set(
        testQuestion.question.options.map(({ id }) => id.toLowerCase()),
      );
      if (!selectedOptionIds.every((id) => validOptionIds.has(id))) {
        throw new BadRequestException('Every selected option must belong to the answered Question');
      }
      selections.set(testQuestion.id, selectedOptionIds);
    }

    return selections;
  }

  private buildSubmissionResponse(attempt: {
    id: string;
    attemptNumber: number;
    status: TestAttemptStatus;
    score: number | null;
    maxScore: number | null;
    startedAt: Date;
    submittedAt: Date | null;
    test: {
      id: string;
      title: string;
      purpose: string;
      showResultAfterSubmit: boolean;
    };
  }) {
    const response = {
      attempt: {
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
      },
      test: {
        id: attempt.test.id,
        title: attempt.test.title,
        type: attempt.test.purpose,
      },
      resultAvailable: attempt.test.showResultAfterSubmit,
    };

    if (!attempt.test.showResultAfterSubmit) {
      return response;
    }
    const score = attempt.score ?? 0;
    const maxScore = attempt.maxScore ?? 0;
    return {
      ...response,
      attempt: {
        ...response.attempt,
        score,
        maxScore,
        percentage: this.percentage(score, maxScore),
      },
    };
  }

  private attemptStartSelect() {
    return {
      id: true,
      testId: true,
      enrollmentId: true,
      attemptNumber: true,
      status: true,
      startedAt: true,
    } as const;
  }

  private sameSet(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  private async applyBktObservations(
    transaction: Prisma.TransactionClient,
    enrollmentId: string,
    testAttemptId: string,
    observations: GradedBktObservation[],
  ): Promise<void> {
    const observedAt = new Date();

    for (const observation of observations) {
      for (const skill of observation.skills) {
        const currentState = await transaction.learnerSkillState.findUnique({
          where: {
            enrollmentId_skillId: { enrollmentId, skillId: skill.id },
          },
          select: { masteryProbability: true, observationCount: true },
        });
        const priorMastery = currentState?.masteryProbability ?? skill.pInit;
        const { evidencePosterior, posteriorMastery } = computeBktUpdate(
          priorMastery,
          skill.pLearn,
          skill.pGuess,
          skill.pSlip,
          observation.isCorrect,
        );

        if (currentState) {
          await transaction.learnerSkillState.update({
            where: {
              enrollmentId_skillId: { enrollmentId, skillId: skill.id },
            },
            data: {
              masteryProbability: posteriorMastery,
              observationCount: { increment: 1 },
              lastObservedAt: observedAt,
            },
          });
        } else {
          await transaction.learnerSkillState.create({
            data: {
              enrollmentId,
              skillId: skill.id,
              masteryProbability: posteriorMastery,
              observationCount: 1,
              lastObservedAt: observedAt,
            },
          });
        }

        await transaction.masteryHistory.create({
          data: {
            enrollmentId,
            skillId: skill.id,
            testAttemptId,
            testAnswerId: observation.testAnswerId,
            isCorrect: observation.isCorrect,
            priorMastery,
            evidencePosterior,
            posteriorMastery,
          },
        });
      }
    }
  }

  private percentage(score: number, maxScore: number): number {
    return maxScore === 0 ? 0 : Math.round((score / maxScore) * 10_000) / 100;
  }

  private effectiveDeadline(
    startedAt: Date,
    timeLimitMinutes: number | null,
    closeAt: Date | null,
  ): Date | null {
    const timed = timeLimitMinutes
      ? new Date(startedAt.getTime() + timeLimitMinutes * 60_000)
      : null;
    if (timed && closeAt) return timed < closeAt ? timed : closeAt;
    return timed ?? closeAt;
  }

  private isDeadlineReached(
    startedAt: Date,
    timeLimitMinutes: number | null,
    closeAt: Date | null,
  ): boolean {
    const deadline = this.effectiveDeadline(startedAt, timeLimitMinutes, closeAt);
    return Boolean(deadline && Date.now() >= deadline.getTime());
  }

  private audioMimeForKey(key: string): string {
    if (key.endsWith('.ogg')) return 'audio/ogg';
    if (key.endsWith('.m4a') || key.endsWith('.mp4')) return 'audio/mp4';
    if (key.endsWith('.mp3')) return 'audio/mpeg';
    return 'audio/webm';
  }

  private async runStudentTransaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
    conflictMessage: string,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_STUDENT_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: unknown) {
        if (!this.isRetryableConflict(error)) {
          throw error;
        }
        if (attempt === MAX_STUDENT_TRANSACTION_ATTEMPTS) {
          throw new ConflictException(conflictMessage);
        }
      }
    }

    throw new ConflictException(conflictMessage);
  }

  private isRetryableConflict(error: unknown): boolean {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2003', 'P2034'].includes(error.code)
    ) {
      return true;
    }
    if (!error || typeof error !== 'object' || !('name' in error) || !('cause' in error)) {
      return false;
    }
    const adapterError = error as {
      name?: unknown;
      cause?: { kind?: unknown; originalCode?: unknown };
    };
    return (
      adapterError.name === 'DriverAdapterError' &&
      adapterError.cause?.kind === 'TransactionWriteConflict' &&
      ['40001', '40P01'].includes(String(adapterError.cause.originalCode))
    );
  }
}
