import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import {
  Prisma,
  SkillScoreSource,
  SkillScoreStatus,
  TestAttemptStatus,
  TestPurpose,
  TestStatus,
  ToeicSkill,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { SavePracticeProgressDto, StartPracticeTestDto } from './dto/practice-tests.dto';

export interface PracticeStatePayload {
  phase: 'LISTENING' | 'READING';
  listeningGroupIndex: number;
  listeningStartedAt: string | null;
  readingStartedAt: string | null;
  readingDurationSeconds: number;
  markedQuestionIds: string[];
  summary?: PracticeResultSummary;
}

export interface PartBreakdownItem {
  part: number;
  label: string;
  skill: ToeicSkill;
  correctCount: number;
  totalCount: number;
}

export interface PracticeResultSummary {
  correctCount: number;
  totalQuestions: number;
  listeningRaw: number;
  listeningTotal: number;
  listeningScore: number;
  readingRaw: number;
  readingTotal: number;
  readingScore: number;
  totalScore: number;
  partBreakdown: PartBreakdownItem[];
}

const READING_DURATION_SECONDS = 75 * 60;
const PRACTICE_MEDIA_ROOT = resolvePracticeMediaRoot();

function resolvePracticeMediaRoot(): string {
  if (process.env.TOEIC_PRACTICE_MEDIA_ROOT) {
    return resolve(process.env.TOEIC_PRACTICE_MEDIA_ROOT);
  }
  const candidates = [
    resolve(process.cwd(), '.local-storage', 'toeic-practice-media'),
    resolve(process.cwd(), '..', '..', '.local-storage', 'toeic-practice-media'),
    resolve(__dirname, '..', '..', '..', '..', '..', '.local-storage', 'toeic-practice-media'),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0];
}

export function estimateToeicSectionScore(correct: number, total: number): number {
  if (total <= 0) return 5;
  const ratio = Math.max(0, Math.min(1, correct / total));
  // Standard ETS L&R curve approximation: ~5 baseline, linear-curved up to 495 at >=96%
  const rawScaled = 5 + Math.round((Math.min(1, ratio / 0.96) * 490) / 5) * 5;
  return Math.max(5, Math.min(495, rawScaled));
}

function parsePartNumber(taskCode: string | null | undefined, skill: ToeicSkill, orderIndex: number): number {
  const m = taskCode?.match(/TOEIC_PART_(\d)/i);
  if (m) return Number(m[1]);
  if (skill === ToeicSkill.LISTENING) {
    if (orderIndex <= 6) return 1;
    if (orderIndex <= 31) return 2;
    if (orderIndex <= 44) return 3;
    return 4;
  }
  if (orderIndex <= 84) return 5;
  if (orderIndex <= 88) return 6;
  return 7;
}

function defaultState(): PracticeStatePayload {
  return {
    phase: 'LISTENING',
    listeningGroupIndex: 0,
    listeningStartedAt: new Date().toISOString(),
    readingStartedAt: null,
    readingDurationSeconds: READING_DURATION_SECONDS,
    markedQuestionIds: [],
  };
}

function parsePracticeState(raw: Prisma.JsonValue | null | undefined): PracticeStatePayload {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return defaultState();
  }
  const obj = raw as Record<string, unknown>;
  const phase = obj.phase === 'READING' ? 'READING' : 'LISTENING';
  const listeningGroupIndex =
    typeof obj.listeningGroupIndex === 'number' && obj.listeningGroupIndex >= 0
      ? Math.floor(obj.listeningGroupIndex)
      : 0;
  const readingDurationSeconds =
    typeof obj.readingDurationSeconds === 'number' && obj.readingDurationSeconds > 0
      ? Math.floor(obj.readingDurationSeconds)
      : READING_DURATION_SECONDS;
  const markedQuestionIds = Array.isArray(obj.markedQuestionIds)
    ? obj.markedQuestionIds.filter((v): v is string => typeof v === 'string')
    : [];
  return {
    phase,
    listeningGroupIndex,
    listeningStartedAt: typeof obj.listeningStartedAt === 'string' ? obj.listeningStartedAt : null,
    readingStartedAt: typeof obj.readingStartedAt === 'string' ? obj.readingStartedAt : null,
    readingDurationSeconds,
    markedQuestionIds,
    summary:
      obj.summary && typeof obj.summary === 'object'
        ? (obj.summary as PracticeResultSummary)
        : undefined,
  };
}

function mediaUrlForKey(storageKey: string | null | undefined): string | null {
  if (!storageKey) return null;
  const clean = storageKey.replace(/^\/+/, '');
  return `/api/v2/practice-tests/media/${clean}`;
}

@Injectable()
export class PracticeTestsService {
  constructor(private readonly prisma: PrismaService) {}

  async listTests(learnerId: string | null) {
    const tests = await this.prisma.test.findMany({
      where: {
        purpose: TestPurpose.PRACTICE_MOCK,
        status: TestStatus.PUBLISHED,
        courseId: null,
        quizActivityId: null,
        classAssessments: { none: {} },
      },
      orderBy: [{ id: 'asc' }],
      select: {
        id: true,
        title: true,
        description: true,
        timeLimitMinutes: true,
        questionGroups: {
          orderBy: { orderIndex: 'asc' },
          select: {
            skill: true,
            _count: { select: { testQuestions: true } },
          },
        },
        _count: { select: { testQuestions: true } },
      },
    });

    const attemptsByTest = new Map<
      string,
      Array<{
        id: string;
        status: TestAttemptStatus;
        score: number | null;
        maxScore: number | null;
        startedAt: Date;
        submittedAt: Date | null;
        practiceState: Prisma.JsonValue | null;
      }>
    >();

    if (learnerId && tests.length > 0) {
      const attempts = await this.prisma.testAttempt.findMany({
        where: {
          learnerId,
          enrollmentId: null,
          classAssessmentId: null,
          testId: { in: tests.map((t) => t.id) },
        },
        orderBy: [{ updatedAt: 'desc' }],
        select: {
          id: true,
          testId: true,
          status: true,
          score: true,
          maxScore: true,
          startedAt: true,
          submittedAt: true,
          practiceState: true,
        },
      });
      for (const a of attempts) {
        const list = attemptsByTest.get(a.testId) ?? [];
        list.push(a);
        attemptsByTest.set(a.testId, list);
      }
    }

    return {
      tests: tests.map((t, index) => {
        const attempts = attemptsByTest.get(t.id) ?? [];
        const latestSubmitted = attempts.find((a) => a.status === TestAttemptStatus.SUBMITTED);
        const inProgress = attempts.find((a) => a.status === TestAttemptStatus.IN_PROGRESS);
        let listeningQuestions = 0;
        let readingQuestions = 0;
        for (const g of t.questionGroups) {
          if (g.skill === ToeicSkill.LISTENING) listeningQuestions += g._count.testQuestions;
          else if (g.skill === ToeicSkill.READING) readingQuestions += g._count.testQuestions;
        }
        const submittedState = latestSubmitted ? parsePracticeState(latestSubmitted.practiceState) : null;
        const inProgressState = inProgress ? parsePracticeState(inProgress.practiceState) : null;
        return {
          id: t.id,
          testNumber: index + 1,
          title: t.title,
          description: t.description,
          timeLimitMinutes: t.timeLimitMinutes ?? 120,
          totalQuestions: t._count.testQuestions,
          listeningQuestions,
          readingQuestions,
          latestHistory: latestSubmitted
            ? {
                attemptId: latestSubmitted.id,
                submittedAt: latestSubmitted.submittedAt?.toISOString() ?? null,
                score: latestSubmitted.score ?? submittedState?.summary?.correctCount ?? 0,
                maxScore: latestSubmitted.maxScore ?? t._count.testQuestions,
                listeningScore: submittedState?.summary?.listeningScore ?? null,
                readingScore: submittedState?.summary?.readingScore ?? null,
                totalToeicScore: submittedState?.summary?.totalScore ?? null,
              }
            : null,
          inProgressAttempt: inProgress
            ? {
                attemptId: inProgress.id,
                startedAt: inProgress.startedAt.toISOString(),
                phase: inProgressState?.phase ?? 'LISTENING',
                listeningGroupIndex: inProgressState?.listeningGroupIndex ?? 0,
              }
            : null,
        };
      }),
    };
  }

  async startTest(learnerId: string, testId: string, dto: StartPracticeTestDto) {
    const test = await this.assertStandalonePracticeTest(testId);

    const existingInProgress = await this.prisma.testAttempt.findFirst({
      where: {
        learnerId,
        testId: test.id,
        enrollmentId: null,
        classAssessmentId: null,
        status: TestAttemptStatus.IN_PROGRESS,
      },
      orderBy: [{ createdAt: 'desc' }],
      select: { id: true },
    });

    if (existingInProgress && !dto.restart) {
      return { attemptId: existingInProgress.id, resumed: true };
    }

    const attempt = await this.prisma.$transaction(async (tx) => {
      // Remove abandoned IN_PROGRESS drafts ONLY; keep previous SUBMITTED history until user submits!
      const staleDrafts = await tx.testAttempt.findMany({
        where: {
          learnerId,
          testId: test.id,
          enrollmentId: null,
          classAssessmentId: null,
          status: TestAttemptStatus.IN_PROGRESS,
        },
        select: { id: true },
      });
      if (staleDrafts.length > 0) {
        const draftIds = staleDrafts.map((d) => d.id);
        await this.deleteAttemptChildren(tx, draftIds);
        await tx.testAttempt.deleteMany({ where: { id: { in: draftIds } } });
      }

      const agg = await tx.testAttempt.aggregate({
        where: { learnerId, testId: test.id },
        _max: { attemptNumber: true },
      });
      const nextAttemptNumber = (agg._max.attemptNumber ?? 0) + 1;
      const initialState: PracticeStatePayload = {
        phase: 'LISTENING',
        listeningGroupIndex: 0,
        listeningStartedAt: new Date().toISOString(),
        readingStartedAt: null,
        readingDurationSeconds: READING_DURATION_SECONDS,
        markedQuestionIds: [],
      };
      return tx.testAttempt.create({
        data: {
          testId: test.id,
          learnerId,
          enrollmentId: null,
          classAssessmentId: null,
          attemptNumber: nextAttemptNumber,
          status: TestAttemptStatus.IN_PROGRESS,
          maxScore: test._count.testQuestions,
          practiceState: initialState as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
    });

    return { attemptId: attempt.id, resumed: false };
  }

  async getAttempt(learnerId: string, attemptId: string) {
    const attempt = await this.loadOwnedAttempt(learnerId, attemptId, false);
    const state = parsePracticeState(attempt.practiceState);

    if (attempt.status === TestAttemptStatus.SUBMITTED) {
      return {
        attemptId: attempt.id,
        testId: attempt.test.id,
        title: attempt.test.title,
        status: attempt.status,
        resultPath: `/practice-tests/attempts/${attempt.id}/result`,
      };
    }

    const listeningGroupsCount = attempt.test.questionGroups.filter(
      (g) => g.skill === ToeicSkill.LISTENING,
    ).length;

    let readingRemainingSeconds = state.readingDurationSeconds;
    if (state.phase === 'READING' && state.readingStartedAt) {
      const elapsed = Math.floor((Date.now() - Date.parse(state.readingStartedAt)) / 1000);
      readingRemainingSeconds = Math.max(0, state.readingDurationSeconds - Math.max(0, elapsed));
    }

    const answerMap = new Map<string, string[]>();
    for (const ans of attempt.answers) {
      answerMap.set(ans.testQuestionId, ans.selectedOptionIds);
    }

    return {
      attemptId: attempt.id,
      testId: attempt.test.id,
      title: attempt.test.title,
      status: attempt.status,
      startedAt: attempt.startedAt.toISOString(),
      listeningGroupsCount,
      state: {
        phase: state.phase,
        listeningGroupIndex: state.listeningGroupIndex,
        readingRemainingSeconds,
        markedQuestionIds: state.markedQuestionIds,
      },
      groups: attempt.test.questionGroups.map((g, gIdx) => {
        const part = parsePartNumber(g.taskCode, g.skill, g.orderIndex);
        return {
          id: g.id,
          groupIndex: gIdx,
          part,
          skill: g.skill,
          taskCode: g.taskCode,
          title: g.title,
          instructions: g.instructions,
          audioUrl: mediaUrlForKey(g.audioUrl),
          images: g.stimuli
            .filter((s) => s.type === 'IMAGE' && s.storageKey)
            .map((s) => ({
              id: s.id,
              url: mediaUrlForKey(s.storageKey)!,
              altText: s.altText ?? g.title ?? 'Hình ảnh đề thi TOEIC',
            })),
          questions: g.testQuestions.map((tq) => ({
            testQuestionId: tq.id,
            questionNumber: tq.orderIndex,
            content: tq.question.content,
            selectedOptionIds: answerMap.get(tq.id) ?? [],
            options: tq.question.options.map((opt, oIdx) => ({
              id: opt.id,
              label: ['A', 'B', 'C', 'D'][oIdx] ?? String(oIdx + 1),
              content: opt.content,
            })),
          })),
        };
      }),
    };
  }

  async saveProgress(learnerId: string, attemptId: string, dto: SavePracticeProgressDto) {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.testAttempt.findFirst({
        where: {
          id: attemptId,
          learnerId,
          enrollmentId: null,
          classAssessmentId: null,
        },
        select: {
          id: true,
          testId: true,
          status: true,
          practiceState: true,
          test: {
            select: {
              questionGroups: {
                where: { skill: ToeicSkill.LISTENING },
                select: { id: true },
              },
              testQuestions: {
                select: {
                  id: true,
                  question: {
                    select: {
                      options: { select: { id: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!attempt) {
        throw new NotFoundException('Không tìm thấy bài thi thử.');
      }
      if (attempt.status !== TestAttemptStatus.IN_PROGRESS) {
        throw new ConflictException('Bài thi đã được nộp, không thể cập nhật thêm.');
      }

      const validOptionsByTq = new Map<string, Set<string>>();
      for (const tq of attempt.test.testQuestions) {
        validOptionsByTq.set(
          tq.id,
          new Set(tq.question.options.map((o) => o.id)),
        );
      }

      if (dto.answers && dto.answers.length > 0) {
        for (const item of dto.answers) {
          const validOpts = validOptionsByTq.get(item.testQuestionId);
          if (!validOpts) {
            throw new BadRequestException('Câu hỏi không thuộc bài thi này.');
          }
          if (item.selectedOptionIds.some((id) => !validOpts.has(id))) {
            throw new BadRequestException('Đáp án không hợp lệ.');
          }
          await tx.testAnswer.upsert({
            where: {
              attemptId_testQuestionId: {
                attemptId: attempt.id,
                testQuestionId: item.testQuestionId,
              },
            },
            create: {
              attemptId: attempt.id,
              testQuestionId: item.testQuestionId,
              selectedOptionIds: item.selectedOptionIds.slice(0, 1),
            },
            update: {
              selectedOptionIds: item.selectedOptionIds.slice(0, 1),
            },
          });
        }
      }

      const state = parsePracticeState(attempt.practiceState);
      const totalListeningGroups = attempt.test.questionGroups.length;

      if (dto.markedQuestionIds !== undefined) {
        state.markedQuestionIds = dto.markedQuestionIds.filter((id) => validOptionsByTq.has(id));
      }

      if (typeof dto.listeningGroupIndex === 'number' && state.phase === 'LISTENING') {
        // Monotonic forward advance: never rewind finished listening tracks
        if (dto.listeningGroupIndex >= state.listeningGroupIndex) {
          state.listeningGroupIndex = Math.min(totalListeningGroups, dto.listeningGroupIndex);
        }
      }

      if (
        (dto.enterReading || state.listeningGroupIndex >= totalListeningGroups) &&
        state.phase !== 'READING'
      ) {
        state.phase = 'READING';
        state.listeningGroupIndex = totalListeningGroups;
        state.readingStartedAt = state.readingStartedAt ?? new Date().toISOString();
      }

      await tx.testAttempt.update({
        where: { id: attempt.id },
        data: {
          practiceState: state as unknown as Prisma.InputJsonValue,
        },
      });

      let readingRemainingSeconds = state.readingDurationSeconds;
      if (state.phase === 'READING' && state.readingStartedAt) {
        const elapsed = Math.floor((Date.now() - Date.parse(state.readingStartedAt)) / 1000);
        readingRemainingSeconds = Math.max(0, state.readingDurationSeconds - Math.max(0, elapsed));
      }

      return {
        saved: true,
        state: {
          phase: state.phase,
          listeningGroupIndex: state.listeningGroupIndex,
          readingRemainingSeconds,
          markedQuestionIds: state.markedQuestionIds,
        },
      };
    });
  }

  async submitAttempt(learnerId: string, attemptId: string) {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.testAttempt.findFirst({
        where: {
          id: attemptId,
          learnerId,
          enrollmentId: null,
          classAssessmentId: null,
        },
        select: {
          id: true,
          testId: true,
          status: true,
          practiceState: true,
          answers: {
            select: {
              id: true,
              testQuestionId: true,
              selectedOptionIds: true,
            },
          },
          test: {
            select: {
              id: true,
              questionGroups: {
                orderBy: { orderIndex: 'asc' },
                select: {
                  orderIndex: true,
                  skill: true,
                  taskCode: true,
                  testQuestions: {
                    orderBy: { orderIndex: 'asc' },
                    select: {
                      id: true,
                      points: true,
                      question: {
                        select: {
                          options: {
                            orderBy: { orderIndex: 'asc' },
                            select: { id: true, isCorrect: true },
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

      if (!attempt) {
        throw new NotFoundException('Không tìm thấy bài thi thử.');
      }

      if (attempt.status === TestAttemptStatus.SUBMITTED) {
        return { attemptId: attempt.id, alreadySubmitted: true };
      }

      const answerMap = new Map(attempt.answers.map((a) => [a.testQuestionId, a]));

      let listeningRaw = 0;
      let listeningTotal = 0;
      let readingRaw = 0;
      let readingTotal = 0;
      const partBuckets = new Map<number, PartBreakdownItem>();

      for (const grp of attempt.test.questionGroups) {
        const part = parsePartNumber(grp.taskCode, grp.skill, grp.orderIndex);
        const bucket = partBuckets.get(part) ?? {
          part,
          label: `Part ${part}`,
          skill: grp.skill,
          correctCount: 0,
          totalCount: 0,
        };

        for (const tq of grp.testQuestions) {
          const correctIds = tq.question.options.filter((o) => o.isCorrect).map((o) => o.id);
          const ans = answerMap.get(tq.id);
          const chosen = ans?.selectedOptionIds ?? [];
          const isCorrect =
            chosen.length > 0 &&
            correctIds.length > 0 &&
            chosen.length === correctIds.length &&
            chosen.every((id) => correctIds.includes(id));

          const pointsAwarded = isCorrect ? tq.points : 0;
          await tx.testAnswer.upsert({
            where: {
              attemptId_testQuestionId: {
                attemptId: attempt.id,
                testQuestionId: tq.id,
              },
            },
            create: {
              attemptId: attempt.id,
              testQuestionId: tq.id,
              selectedOptionIds: chosen,
              isCorrect,
              pointsAwarded,
            },
            update: {
              isCorrect,
              pointsAwarded,
            },
          });

          bucket.totalCount += 1;
          if (isCorrect) bucket.correctCount += 1;

          if (grp.skill === ToeicSkill.LISTENING) {
            listeningTotal += 1;
            if (isCorrect) listeningRaw += 1;
          } else {
            readingTotal += 1;
            if (isCorrect) readingRaw += 1;
          }
        }
        partBuckets.set(part, bucket);
      }

      const listeningScore = estimateToeicSectionScore(listeningRaw, listeningTotal);
      const readingScore = estimateToeicSectionScore(readingRaw, readingTotal);
      const totalScore = listeningScore + readingScore;
      const totalQuestions = listeningTotal + readingTotal;
      const correctCount = listeningRaw + readingRaw;

      const summary: PracticeResultSummary = {
        correctCount,
        totalQuestions,
        listeningRaw,
        listeningTotal,
        listeningScore,
        readingRaw,
        readingTotal,
        readingScore,
        totalScore,
        partBreakdown: Array.from(partBuckets.values()).sort((a, b) => a.part - b.part),
      };

      const state = parsePracticeState(attempt.practiceState);
      state.phase = 'READING';
      state.summary = summary;

      await tx.attemptSkillScore.deleteMany({ where: { attemptId: attempt.id } });
      await tx.attemptSkillScore.createMany({
        data: [
          {
            attemptId: attempt.id,
            skill: ToeicSkill.LISTENING,
            rawScore: listeningRaw,
            maxRawScore: listeningTotal,
            estimatedToeicScore: listeningScore,
            normalizedScore:
              listeningTotal > 0 ? Number(((listeningRaw / listeningTotal) * 100).toFixed(2)) : 0,
            status: SkillScoreStatus.FINAL,
            source: SkillScoreSource.OBJECTIVE_AUTO,
          },
          {
            attemptId: attempt.id,
            skill: ToeicSkill.READING,
            rawScore: readingRaw,
            maxRawScore: readingTotal,
            estimatedToeicScore: readingScore,
            normalizedScore:
              readingTotal > 0 ? Number(((readingRaw / readingTotal) * 100).toFixed(2)) : 0,
            status: SkillScoreStatus.FINAL,
            source: SkillScoreSource.OBJECTIVE_AUTO,
          },
        ],
      });

      const submittedAt = new Date();
      await tx.testAttempt.update({
        where: { id: attempt.id },
        data: {
          status: TestAttemptStatus.SUBMITTED,
          submittedAt,
          score: correctCount,
          maxScore: totalQuestions,
          practiceState: state as unknown as Prisma.InputJsonValue,
        },
      });

      // Keep strictly ONLY the latest submitted attempt per (learner, test)
      const oldAttempts = await tx.testAttempt.findMany({
        where: {
          learnerId,
          testId: attempt.testId,
          enrollmentId: null,
          classAssessmentId: null,
          id: { not: attempt.id },
        },
        select: { id: true },
      });
      if (oldAttempts.length > 0) {
        const oldIds = oldAttempts.map((o) => o.id);
        await this.deleteAttemptChildren(tx, oldIds);
        await tx.testAttempt.deleteMany({ where: { id: { in: oldIds } } });
      }

      return {
        attemptId: attempt.id,
        submittedAt: submittedAt.toISOString(),
        summary,
      };
    });
  }

  async getLatestHistoryByTest(learnerId: string, testId: string) {
    await this.assertStandalonePracticeTest(testId);
    const attempt = await this.prisma.testAttempt.findFirst({
      where: {
        learnerId,
        testId,
        enrollmentId: null,
        classAssessmentId: null,
        status: TestAttemptStatus.SUBMITTED,
      },
      orderBy: [{ submittedAt: 'desc' }, { updatedAt: 'desc' }],
      select: { id: true },
    });
    if (!attempt) {
      throw new NotFoundException('Bạn chưa có lịch sử làm bài cho đề thi này.');
    }
    return this.getAttemptResult(learnerId, attempt.id);
  }

  async getAttemptResult(learnerId: string, attemptId: string) {
    const attempt = await this.loadOwnedAttempt(learnerId, attemptId, true);
    if (attempt.status !== TestAttemptStatus.SUBMITTED) {
      throw new ConflictException('Bài thi chưa được nộp.');
    }

    const answerMap = new Map(attempt.answers.map((a) => [a.testQuestionId, a]));
    const state = parsePracticeState(attempt.practiceState);

    let listeningRaw = 0;
    let listeningTotal = 0;
    let readingRaw = 0;
    let readingTotal = 0;
    const partBuckets = new Map<number, PartBreakdownItem>();

    const groups = attempt.test.questionGroups.map((g, gIdx) => {
      const part = parsePartNumber(g.taskCode, g.skill, g.orderIndex);
      const bucket = partBuckets.get(part) ?? {
        part,
        label: `Part ${part}`,
        skill: g.skill,
        correctCount: 0,
        totalCount: 0,
      };

      const questions = g.testQuestions.map((tq) => {
        const ans = answerMap.get(tq.id);
        const selectedOptionId = ans?.selectedOptionIds?.[0] ?? null;
        const correctOpt = tq.question.options.find((o) => o.isCorrect);
        const isCorrect = Boolean(selectedOptionId && correctOpt && selectedOptionId === correctOpt.id);

        bucket.totalCount += 1;
        if (isCorrect) bucket.correctCount += 1;
        if (g.skill === ToeicSkill.LISTENING) {
          listeningTotal += 1;
          if (isCorrect) listeningRaw += 1;
        } else {
          readingTotal += 1;
          if (isCorrect) readingRaw += 1;
        }

        return {
          testQuestionId: tq.id,
          questionNumber: tq.orderIndex,
          part,
          skill: g.skill,
          content: tq.question.content,
          selectedOptionId,
          correctOptionId: correctOpt?.id ?? null,
          isCorrect,
          isSkipped: !selectedOptionId,
          explanation: part >= 5 ? tq.question.explanation : null,
          options: tq.question.options.map((o, oIdx) => ({
            id: o.id,
            label: ['A', 'B', 'C', 'D'][oIdx] ?? String(oIdx + 1),
            content: o.content,
            isCorrect: o.isCorrect,
            wasSelected: o.id === selectedOptionId,
          })),
        };
      });

      partBuckets.set(part, bucket);

      return {
        id: g.id,
        groupIndex: gIdx,
        part,
        skill: g.skill,
        title: g.title,
        instructions: g.instructions,
        audioUrl: mediaUrlForKey(g.audioUrl),
        images: g.stimuli
          .filter((s) => s.type === 'IMAGE' && s.storageKey)
          .map((s) => ({
            id: s.id,
            url: mediaUrlForKey(s.storageKey)!,
            altText: s.altText ?? g.title ?? 'Hình ảnh đề thi TOEIC',
          })),
        questions,
      };
    });

    const summary: PracticeResultSummary = state.summary ?? {
      correctCount: listeningRaw + readingRaw,
      totalQuestions: listeningTotal + readingTotal,
      listeningRaw,
      listeningTotal,
      listeningScore: estimateToeicSectionScore(listeningRaw, listeningTotal),
      readingRaw,
      readingTotal,
      readingScore: estimateToeicSectionScore(readingRaw, readingTotal),
      totalScore:
        estimateToeicSectionScore(listeningRaw, listeningTotal) +
        estimateToeicSectionScore(readingRaw, readingTotal),
      partBreakdown: Array.from(partBuckets.values()).sort((a, b) => a.part - b.part),
    };

    return {
      attemptId: attempt.id,
      testId: attempt.test.id,
      title: attempt.test.title,
      startedAt: attempt.startedAt.toISOString(),
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
      summary,
      groups,
    };
  }

  resolveMediaFile(testSlug: string, assetType: string, fileName: string): string {
    if (
      !/^test-[1-6]$/.test(testSlug) ||
      !/^(audio|images)$/.test(assetType) ||
      !/^[a-zA-Z0-9_.-]+$/.test(fileName) ||
      fileName.includes('..')
    ) {
      throw new BadRequestException('Đường dẫn tài nguyên không hợp lệ.');
    }
    const target = resolve(PRACTICE_MEDIA_ROOT, testSlug, assetType, fileName);
    if (!target.startsWith(`${PRACTICE_MEDIA_ROOT}${sep}`) || !existsSync(target)) {
      throw new NotFoundException('Không tìm thấy tệp phương tiện của đề thi.');
    }
    return target;
  }

  private async assertStandalonePracticeTest(testId: string) {
    const test = await this.prisma.test.findFirst({
      where: {
        id: testId,
        purpose: TestPurpose.PRACTICE_MOCK,
        status: TestStatus.PUBLISHED,
        courseId: null,
        quizActivityId: null,
        classAssessments: { none: {} },
      },
      select: {
        id: true,
        title: true,
        _count: { select: { testQuestions: true } },
      },
    });
    if (!test) {
      throw new NotFoundException('Không tìm thấy đề luyện thi TOEIC.');
    }
    return test;
  }

  private async loadOwnedAttempt(learnerId: string, attemptId: string, includeCorrect: boolean) {
    const attempt = await this.prisma.testAttempt.findFirst({
      where: {
        id: attemptId,
        learnerId,
        enrollmentId: null,
        classAssessmentId: null,
      },
      select: {
        id: true,
        status: true,
        startedAt: true,
        submittedAt: true,
        practiceState: true,
        answers: {
          select: {
            testQuestionId: true,
            selectedOptionIds: true,
            isCorrect: includeCorrect,
          },
        },
        test: {
          select: {
            id: true,
            title: true,
            questionGroups: {
              orderBy: { orderIndex: 'asc' },
              select: {
                id: true,
                orderIndex: true,
                skill: true,
                taskCode: true,
                title: true,
                instructions: true,
                audioUrl: true,
                stimuli: {
                  orderBy: { orderIndex: 'asc' },
                  select: {
                    id: true,
                    type: true,
                    storageKey: true,
                    altText: true,
                  },
                },
                testQuestions: {
                  orderBy: { orderIndex: 'asc' },
                  select: {
                    id: true,
                    orderIndex: true,
                    question: {
                      select: {
                        content: true,
                        explanation: includeCorrect,
                        options: {
                          orderBy: { orderIndex: 'asc' },
                          select: {
                            id: true,
                            content: true,
                            isCorrect: includeCorrect,
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
      },
    });
    if (!attempt) {
      throw new NotFoundException('Không tìm thấy lượt làm bài.');
    }
    return attempt;
  }

  private async deleteAttemptChildren(tx: Prisma.TransactionClient, attemptIds: string[]) {
    await tx.testAnswer.deleteMany({ where: { attemptId: { in: attemptIds } } });
    await tx.attemptSkillScore.deleteMany({ where: { attemptId: { in: attemptIds } } });
    await tx.attemptEvaluation.deleteMany({ where: { attemptId: { in: attemptIds } } });
    await tx.masteryHistory.deleteMany({ where: { testAttemptId: { in: attemptIds } } });
    await tx.courseRecommendation.deleteMany({ where: { attemptId: { in: attemptIds } } });
    await tx.studyRecommendation.deleteMany({ where: { sourceAttemptId: { in: attemptIds } } });
  }
}
