import { s10NewAttemptProtocol } from './s10-protocol';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID, createHash } from 'node:crypto';
import { privatePlacementPreviewEnabled } from './placement-preview.guard';
import {
  INTERNAL_RELEASE,
  internalPlacementEnabled,
  internalPlacementRelease,
  releasedTiming,
} from './internal-release';
import type { TimingPolicy } from './workflow.policy';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ClassLmsService } from '../class-lms/class-lms.service';
import { AuthorizationService, type AuthorityActor } from '../authorization/authorization.service';
import { quizDigest } from '../class-lms/quiz.service';
import { candidateStimulusText } from './candidate-information-table';
import { pilotTaskPolicy } from './pilot-task-policy';
import { AssessmentStimulusMediaStorage } from './assessment-stimulus-media.storage';
import {
  type PlacementSnapshot,
  type PlacementProvenance,
  placementEligibility,
  placementSourceDigest,
  PLACEMENT_BLUEPRINT,
} from './source-eligibility';
import {
  PlacementPreviewAnswerDto,
  PlacementPreviewCommandDto,
  PlacementPreviewMarkDto,
  PlacementPreviewStartDto,
} from './integration.dto';
type Tx = Prisma.TransactionClient;
const missing = () => new NotFoundException('Placement unavailable');
const conflict = () => new ConflictException('PLACEMENT_STALE_OR_REQUEST_CONFLICT');
export const placementGraphInclude = {
  testQuestions: { orderBy: { orderIndex: 'asc' as const }, select: { id: true } },
  questionGroups: {
    orderBy: { orderIndex: 'asc' as const },
    include: {
      stimuli: { orderBy: { orderIndex: 'asc' as const } },
      testQuestions: {
        orderBy: { orderIndex: 'asc' as const },
        include: {
          question: { include: { options: { orderBy: { orderIndex: 'asc' as const } } } },
        },
      },
    },
  },
};
export function placementSnapshot(
  t: Prisma.TestGetPayload<{ include: typeof placementGraphInclude }>,
): PlacementSnapshot {
  return {
    testId: t.id,
    allQuestionIds: t.testQuestions.map((q) => q.id),
    mode: t.placementMode!,
    title: t.title,
    groups: t.questionGroups.map((g) => ({
      id: g.id,
      skill: g.skill,
      taskCode: g.taskCode,
      title: g.title,
      instructions: g.instructions,
      stimulusText: g.stimulusText,
      audioUrl: g.audioUrl,
      preparationSeconds: g.preparationSeconds,
      responseSeconds: g.responseSeconds,
      recommendedSeconds: g.recommendedSeconds,
      maxRecordingSeconds: g.maxRecordingSeconds,
      stimuli: g.stimuli.map((a) => ({
        id: a.id,
        type: a.type,
        orderIndex: a.orderIndex,
        textContent: a.textContent,
        storageKey: a.storageKey,
        mimeType: a.mimeType,
        altText: a.altText,
        isProtected: a.isProtected,
      })),
      questions: g.testQuestions.map((q) => ({
        id: q.id,
        orderIndex: q.orderIndex,
        points: q.points,
        questionId: q.question.id,
        content: q.question.content,
        responseType: q.question.responseType,
        skill: q.question.toeicSkill!,
        explanation: q.question.explanation,
        options: q.question.options.map((a) => ({
          id: a.id,
          content: a.content,
          orderIndex: a.orderIndex,
          isCorrect: a.isCorrect,
        })),
      })),
    })),
  };
}
@Injectable()
export class PlacementIntegrationService {
  constructor(
    private readonly db: PrismaService,
    private readonly lms: ClassLmsService,
    private readonly audit: AuthorizationService,
    private readonly media: AssessmentStimulusMediaStorage,
  ) {}
  private async run<T>(actor: AuthorityActor, work: (tx: Tx) => Promise<T>) {
    try {
      return await this.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
          const user = await this.lms.context(tx, actor);
          if (user.role !== 'STUDENT') throw new ForbiddenException('Learner only');
          await tx.$queryRaw`SELECT set_config('app.class_lms_actor',${actor.id},true),set_config('app.class_lms_session',${actor.sessionId},true)`;
          return work(tx);
        },
        { maxWait: 10000, timeout: 30000 },
      );
    } catch (e) {
      if (e instanceof HttpException) throw e;
      const code = String(e) + JSON.stringify(e);
      if (/42501/.test(code))
        throw new ForbiddenException('Current Placement owner/session required');
      if (/P2002|P2034|W04A_|23514/.test(code)) throw conflict();
      throw new ServiceUnavailableException(
        'Placement temporarily unavailable; saved work retained. Retry the identical request.',
      );
    }
  }
  private async dev(tx: Tx, actor: AuthorityActor) {
    if (!(await privatePlacementPreviewEnabled(tx))) return false;
    const user = await tx.user.findUnique({ where: { id: actor.id }, select: { email: true } });
    return user?.email.endsWith('@example.invalid') === true;
  }

  config(actor: AuthorityActor) {
    return this.run(actor, async (tx) => {
      if (await internalPlacementEnabled(tx)) {
        const activeReleases = await tx.$queryRaw<Array<{ sourceId: string }>>`
          SELECT "sourceId"::text AS "sourceId"
          FROM placement_internal_releases
          WHERE active = true AND "decisionId" = ${INTERNAL_RELEASE}
        `;
        const candidates = await tx.placementSourceVersion.findMany({
          where: {
            id: {
              in: activeReleases.map((r) => r.sourceId),
            },
          },
          orderBy: { mode: 'asc' },
        });
        const sources = [];
        for (const candidate of candidates) {
          const release = await internalPlacementRelease(tx, candidate.id);
          if (!release) continue;
          const source = await this.source(tx, candidate.id);
          const policy = await tx.placementWorkflowPolicy.findUnique({
            where: { id: release.policyId },
          });
          if (
            !policy?.approvedAt ||
            !policy.approvedById ||
            policy.digest !== quizDigest(policy.body)
          )
            throw new ConflictException('INTERNAL_TIMING_POLICY_CHANGED');
          releasedTiming(release, source, policy.id, policy.body as unknown as TimingPolicy);
          const attempt = await tx.testAttempt.findFirst({
            where: { learnerId: actor.id, placementVersionId: source.id },
            select: { id: true, placementSitting: { select: { phase: true } } },
            orderBy: { startedAt: 'desc' },
          });
          sources.push({
            id: source.id,
            mode: source.mode,
            version: source.version,
            title: 'Kiểm tra đầu vào nội bộ Smart English',
            purpose: 'INTERNAL_ASSESSMENT',
            policyId: policy.id,
            itemCount: source.s.allQuestionIds.length,
            attemptId: attempt?.id,
            attemptStatus: attempt?.placementSitting?.phase,
            retakeAllowed: attempt?.placementSitting?.phase === 'SUBMITTED',
          });
        }
        return {
          modes: sources.map((s) => s.mode),
          goals: {
            LR: { min: 10, max: 990 },
            SPEAKING: { min: 0, max: 200 },
            WRITING: { min: 0, max: 200 },
          },
          blueprint: PLACEMENT_BLUEPRINT,
          fullExamEnabled: sources.length === 2,
          policyState: 'PO_AUTHORIZED_INTERNAL',
          releaseScope: 'SMART_ENGLISH_INTERNAL_LOCALHOST',
          previewEnabled: false,
          workflowEnabled: true,
          sources,
          message:
            'Đánh giá đầu vào nội bộ Smart English. Không phải kỳ thi TOEIC do ETS tổ chức. Nói/Viết do giáo viên chấm và xác nhận.',
        };
      }
      const privateDev = await this.dev(tx, actor),
        workflowEnabled =
          privateDev &&
          process.env.W04B_ENABLED === 'DEV_WORKFLOW' &&
          /\/v2_wave01_dev_test_w04b_/.test(process.env.E2E_DATABASE_URL ?? ''),
        preview =
          privateDev && !/\/v2_wave01_dev_test_w04b_/.test(process.env.E2E_DATABASE_URL ?? ''),
        versions = preview
          ? await tx.placementSourceVersion.findMany({
              where: { purpose: 'DEV_PREVIEW' },
              orderBy: { createdAt: 'desc' },
              take: 10,
            })
          : [];
      return {
        modes: ['LR', 'FOUR_SKILLS'],
        goals: {
          LR: { min: 10, max: 990 },
          SPEAKING: { min: 0, max: 200 },
          WRITING: { min: 0, max: 200 },
        },
        blueprint: PLACEMENT_BLUEPRINT,
        fullExamEnabled: false,
        policyState: 'REAL_SOURCE_RELEASE_PENDING',
        previewEnabled: preview,
        workflowEnabled,
        sources: versions.map((v) => ({
          id: v.id,
          mode: v.mode,
          version: v.version,
          title: (v.snapshot as unknown as PlacementSnapshot).title,
          purpose: 'DEV_PREVIEW',
          itemCount: (v.snapshot as unknown as PlacementSnapshot).groups.reduce(
            (a, g) => a + g.questions.length,
            0,
          ),
        })),
        message:
          'Nguồn thi đầy đủ và chính sách phát hành đang chờ duyệt. Không có kết quả năng lực chính thức.',
      };
    });
  }
  async source(tx: Tx, id: string) {
    const v = await tx.placementSourceVersion.findUnique({
      where: { id },
      include: { test: { include: placementGraphInclude } },
    });
    if (!v) throw missing();
    const s = v.snapshot as unknown as PlacementSnapshot;
    if (
      v.sourceHash !== placementSourceDigest(s) ||
      v.sourceHash !== placementSourceDigest(placementSnapshot(v.test))
    )
      throw new ConflictException('PLACEMENT_SOURCE_CHANGED');
    if (
      v.test.purpose !== 'PLACEMENT' ||
      v.test.placementMode !== v.mode ||
      v.test.timeLimitMinutes !== null
    )
      throw conflict();
    for (const asset of s.groups
      .flatMap((g) => g.stimuli)
      .filter((a) => !a.isProtected && a.type !== 'TEXT')) {
      const evidence = (v.provenance as PlacementProvenance).assets?.find((a) => a.id === asset.id);
      if (!asset.storageKey || !evidence || !/^[a-f0-9]{64}$/.test(evidence.sha256))
        throw new ServiceUnavailableException('Private preview asset evidence unavailable');
      try {
        const bytes = await this.media.read(asset.storageKey);
        if (createHash('sha256').update(bytes).digest('hex') !== evidence.sha256) throw Error();
        if (
          asset.mimeType === 'audio/wav' &&
          (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE')
        )
          throw Error();
        if (
          asset.mimeType === 'image/png' &&
          !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        )
          throw Error();
      } catch {
        throw new ServiceUnavailableException('Private preview asset unavailable or changed');
      }
    }
    return { ...v, s };
  }
  private async owned(tx: Tx, actor: AuthorityActor, id: string) {
    const a = await tx.testAttempt.findFirst({
      where: {
        id,
        learnerId: actor.id,
        placementVersionId: { not: null },
        enrollmentId: null,
        classAssessmentId: null,
        quizRevisionId: null,
      },
      include: { answers: true },
    });
    if (!a?.placementVersionId) throw missing();
    if (await tx.placementSitting.findUnique({ where: { attemptId: id } }))
      throw new ConflictException('USE_SERVER_MANAGED_SITTING');
    if (!(await this.dev(tx, actor)))
      throw new ConflictException('PRIVATE_DEV_PREVIEW_UNAVAILABLE');
    const source = await this.source(tx, a.placementVersionId);
    if (source.purpose !== 'DEV_PREVIEW') throw missing();
    return { a, source };
  }
  private async idem<T>(
    tx: Tx,
    actor: AuthorityActor,
    action: string,
    key: string,
    b: unknown,
    load: (id: string) => Promise<T>,
    work: () => Promise<string>,
  ) {
    key = key.toLowerCase();
    const hash = quizDigest(b),
      prev = await tx.domainAuditEvent.findFirst({
        where: {
          actorId: actor.id,
          action,
          objectType: 'W04A_REQUEST',
          reason: { startsWith: key + ':' },
        },
      });
    if (prev) {
      if (prev.reason !== key + ':' + hash) throw conflict();
      return load(prev.objectId);
    }
    const id = await work();
    await this.audit.audit(tx, actor.id, action, 'W04A_REQUEST', id, key + ':' + hash);
    return load(id);
  }
  private startView(
    a: {
      id: string;
      placementGoalScore: number | null;
      placementGoalSpeaking: number | null;
      placementGoalWriting: number | null;
      placementLockVersion: number;
      status: string;
    },
    mode: string,
    resumed: boolean,
  ) {
    return {
      attemptId: a.id,
      mode,
      resumed,
      goals: {
        goalLR: a.placementGoalScore,
        goalSpeaking: a.placementGoalSpeaking,
        goalWriting: a.placementGoalWriting,
      },
      lockVersion: a.placementLockVersion,
      state: a.status === 'SUBMITTED' ? 'PREVIEW_COMPLETED' : 'DEV_PREVIEW',
      examPath: '/placement/previews/' + a.id + '/exam',
      ungraded: true,
    };
  }
  start(actor: AuthorityActor, b: PlacementPreviewStartDto) {
    return this.run(actor, async (tx) => {
      if (/\/v2_wave01_dev_test_w04b_/.test(process.env.E2E_DATABASE_URL ?? ''))
        throw new ConflictException('USE_SERVER_MANAGED_SITTING');
      let created = false;
      if (!(await this.dev(tx, actor))) throw new ConflictException('FULL_PLACEMENT_NOT_ELIGIBLE');
      if (
        (b.mode === 'LR' && (b.goalSpeaking !== undefined || b.goalWriting !== undefined)) ||
        (b.mode === 'FOUR_SKILLS' &&
          (!Number.isInteger(b.goalSpeaking) || !Number.isInteger(b.goalWriting)))
      )
        throw new BadRequestException('Explicit independent goals required for mode');
      const v = await this.source(tx, b.sourceVersionId);
      if (v.mode !== b.mode || v.purpose !== 'DEV_PREVIEW')
        throw new ConflictException('PLACEMENT_SOURCE_MODE_OR_RELEASE_BLOCKED');
      return this.idem(
        tx,
        actor,
        'W04A_START',
        b.idempotencyKey,
        b,
        async (id) => {
          const { a } = await this.owned(tx, actor, id);
          return this.startView(a, b.mode, !created);
        },
        async () => {
          const old = await tx.testAttempt.findFirst({
            where: { learnerId: actor.id, placementVersionId: v.id },
          });
          if (old) {
            if (
              old.placementGoalScore !== b.goalLR ||
              old.placementGoalSpeaking !== (b.goalSpeaking ?? null) ||
              old.placementGoalWriting !== (b.goalWriting ?? null)
            )
              throw conflict();
            return old.id;
          }
          const a = await tx.testAttempt.create({
            data: {
              s10ProtocolVersion: await s10NewAttemptProtocol(tx),
              testId: v.testId,
              learnerId: actor.id,
              attemptNumber: 1,
              placementVersionId: v.id,
              placementGoalScore: b.goalLR,
              placementGoalSpeaking: b.goalSpeaking,
              placementGoalWriting: b.goalWriting,
            },
          });
          created = true;
          await this.audit.audit(
            tx,
            actor.id,
            'W04A_PREVIEW_PREPARED',
            'TestAttempt',
            a.id,
            'Ungraded synthetic DEV preview; not a full Placement',
          );
          return a.id;
        },
      );
    });
  }
  exam(actor: AuthorityActor, id: string) {
    return this.run(actor, async (tx) => {
      const { a, source: v } = await this.owned(tx, actor, id);
      return {
        state: a.status === 'SUBMITTED' ? 'PREVIEW_COMPLETED' : 'DEV_PREVIEW',
        attemptId: id,
        mode: v.mode,
        goals: {
          goalLR: a.placementGoalScore,
          goalSpeaking: a.placementGoalSpeaking,
          goalWriting: a.placementGoalWriting,
        },
        lockVersion: a.placementLockVersion,
        marked: a.placementMarked,
        receipt: a.placementReceipt,
        wholeExamDeadline: null,
        ungraded: true,
        title: v.s.title,
        sourceVersion: v.version,
        groups: v.s.groups.map((g) => ({
          ...g,
          audioUrl: null,
          stimulusText: g.skill === 'READING' ? g.stimulusText : null,
          playbackPolicy: pilotTaskPolicy(g.taskCode),
          stimuli: g.stimuli
            .filter((x) => !x.isProtected)
            .map((x) => ({
              id: x.id,
              type: x.type,
              orderIndex: x.orderIndex,
              textContent: x.type === 'TEXT' ? candidateStimulusText(x.textContent) : null,
              mediaUrl:
                x.type === 'TEXT' ? null : `/api/v2/placement/attempts/${id}/stimuli/${x.id}`,
              mimeType: x.mimeType,
              altText: x.altText,
            })),
          questions: g.questions.map((q) => {
            const ans = a.answers.find((x) => x.testQuestionId === q.id);
            return {
              testQuestionId: q.id,
              orderIndex: q.orderIndex,
              content: q.content,
              responseType: q.responseType,
              toeicSkill: q.skill,
              options: q.options.map((x) => ({
                id: x.id,
                content: x.content,
                orderIndex: x.orderIndex,
              })),
              selectedOptionIds: ans?.selectedOptionIds ?? [],
              textResponse: ans?.textResponse ?? null,
              audioUploaded: !!ans?.audioStorageKey,
            };
          }),
        })),
      };
    });
  }
  write(
    actor: AuthorityActor,
    id: string,
    qid: string | undefined,
    b: PlacementPreviewAnswerDto | PlacementPreviewMarkDto | PlacementPreviewCommandDto,
    kind: 'ANSWER' | 'MARK' | 'COMPLETE',
  ) {
    return this.run(actor, async (tx) => {
      const { a, source: v } = await this.owned(tx, actor, id);
      return this.idem(
        tx,
        actor,
        'W04A_' + kind,
        b.idempotencyKey,
        { id, qid, b },
        async () => {
          const n = await tx.testAttempt.findUniqueOrThrow({ where: { id } });
          return {
            lockVersion: n.placementLockVersion,
            state: n.status === 'SUBMITTED' ? 'PREVIEW_COMPLETED' : 'SAVED',
            receipt: n.placementReceipt,
          };
        },
        async () => {
          if (a.status !== 'IN_PROGRESS' || a.placementLockVersion !== b.expectedLockVersion)
            throw conflict();
          const q = v.s.groups.flatMap((g) => g.questions).find((x) => x.id === qid);
          if (kind !== 'COMPLETE' && !q) throw missing();
          let marks = a.placementMarked;
          let receipt: string | undefined;
          if (kind === 'MARK') {
            marks = (b as PlacementPreviewMarkDto).marked
              ? [...new Set([...marks, qid!])]
              : marks.filter((x) => x !== qid);
          }
          if (kind === 'ANSWER') {
            const x = b as PlacementPreviewAnswerDto;
            if (q!.responseType === 'AUDIO_RESPONSE')
              throw new ConflictException('Use existing durable S10 recording protocol');
            if (q!.responseType === 'TEXT_RESPONSE') {
              if (typeof x.textResponse !== 'string' || x.selectedOptionIds !== undefined)
                throw new BadRequestException('Text answer required');
            } else if (
              !Array.isArray(x.selectedOptionIds) ||
              x.textResponse !== undefined ||
              x.selectedOptionIds.some((id) => !q!.options.some((o) => o.id === id))
            )
              throw new BadRequestException('Own source option required');
            await tx.testAnswer.upsert({
              where: { attemptId_testQuestionId: { attemptId: id, testQuestionId: qid! } },
              create: {
                attemptId: id,
                testQuestionId: qid!,
                selectedOptionIds: x.selectedOptionIds ?? [],
                textResponse: x.textResponse,
              },
              update: {
                selectedOptionIds: x.selectedOptionIds ?? [],
                textResponse: x.textResponse ?? null,
              },
            });
          }
          if (kind === 'COMPLETE') {
            const tasks = v.s.groups
              .filter((g) => pilotTaskPolicy(g.taskCode))
              .flatMap((g) => g.questions);
            for (const q of tasks) {
              const p = await tx.examTaskProgress.findFirst({
                where: { attemptId: id, testQuestionId: q.id },
                orderBy: { createdAt: 'desc' },
              });
              if (p?.phase !== 'SAVED')
                throw new ConflictException('S10_RECORDING_PENDING_OR_REVIEW_REQUIRED');
            }
            receipt = randomUUID();
          }
          await tx.testAttempt.update({
            where: { id },
            data: {
              placementLockVersion: { increment: 1 },
              placementMarked: marks,
              ...(receipt
                ? {
                    status: 'SUBMITTED',
                    submittedAt: await this.lms.now(tx),
                    placementReceipt: receipt,
                  }
                : {}),
            },
          });
          await this.audit.audit(
            tx,
            actor.id,
            'W04A_' + kind + '_SAVED',
            'TestAttempt',
            id,
            kind === 'COMPLETE'
              ? 'Ungraded preview completion receipt; no score'
              : 'Preview work saved',
          );
          return id;
        },
      );
    });
  }
  diagnostic(actor: AuthorityActor, id: string) {
    return this.run(actor, async (tx) => {
      const legacy = await tx.testAttempt.findFirst({
        where: {
          id,
          learnerId: actor.id,
          placementVersionId: null,
          enrollmentId: null,
          classAssessmentId: null,
          test: { purpose: 'PLACEMENT' },
        },
        select: { placementGoalScore: true, test: { select: { placementMode: true } } },
      });
      if (legacy)
        return {
          attemptId: id,
          mode: legacy.test.placementMode,
          state: 'PENDING',
          label: 'CHƯA ĐỦ DỮ LIỆU',
          goals: { goalLR: legacy.placementGoalScore, goalSpeaking: null, goalWriting: null },
          ungraded: true,
          receipt: null,
          score: null,
          officialToeicScore: null,
          measuredLevel: null,
          skillResults: (legacy.test.placementMode === 'FOUR_SKILLS'
            ? ['LISTENING', 'READING', 'SPEAKING', 'WRITING']
            : ['LISTENING', 'READING']
          ).map((skill) => ({ skill, status: 'INSUFFICIENT_DATA', score: null })),
          sourceStatus: 'LEGACY_SOURCE_UNVERIFIED',
          fullBlueprintReady: false,
          criteriaMatching: 'PENDING_APPROVAL',
          recommendations: [],
        };
      const { a, source: v } = await this.owned(tx, actor, id);
      const eligible = placementEligibility(v.s, v.provenance as PlacementProvenance);
      return {
        attemptId: id,
        mode: v.mode,
        state: a.status === 'SUBMITTED' ? 'PENDING' : 'PREVIEW_IN_PROGRESS',
        label: 'CHƯA ĐỦ DỮ LIỆU',
        goals: {
          goalLR: a.placementGoalScore,
          goalSpeaking: a.placementGoalSpeaking,
          goalWriting: a.placementGoalWriting,
        },
        ungraded: true,
        receipt: a.placementReceipt,
        score: null,
        officialToeicScore: null,
        measuredLevel: null,
        skillResults: (v.mode === 'LR'
          ? ['LISTENING', 'READING']
          : ['LISTENING', 'READING', 'SPEAKING', 'WRITING']
        ).map((skill) => ({
          skill,
          status: ['SPEAKING', 'WRITING'].includes(skill)
            ? 'PENDING_EVALUATION'
            : 'INSUFFICIENT_DATA',
          score: null,
        })),
        sourceStatus: 'DEV_PREVIEW_NOT_LEARNER_PUBLISHABLE',
        fullBlueprintReady: eligible.fullBlueprintAndEvidenceReady,
        criteriaMatching: 'PENDING_APPROVAL',
        recommendations: [],
      };
    });
  }
  history(actor: AuthorityActor) {
    return this.run(actor, async (tx) => {
      const a = await tx.testAttempt.findMany({
        where: {
          learnerId: actor.id,
          enrollmentId: null,
          classAssessmentId: null,
          test: { purpose: 'PLACEMENT' },
        },
        select: {
          id: true,
          test: { select: { placementMode: true } },
          placementVersionId: true,
          placementSitting: { select: { phase: true } },
          status: true,
          placementGoalScore: true,
          placementGoalSpeaking: true,
          placementGoalWriting: true,
          startedAt: true,
          submittedAt: true,
        },
        orderBy: { startedAt: 'desc' },
        take: 30,
      });
      return a.map((x) => ({
        attemptId: x.id,
        mode: x.test.placementMode,
        startedAt: x.startedAt,
        submittedAt: x.submittedAt,
        kind: x.placementSitting
          ? 'DEV_WORKFLOW'
          : x.placementVersionId
            ? 'DEV_PREVIEW'
            : 'LEGACY_UNVERIFIED',
        status: x.placementSitting?.phase ?? 'PENDING',
        label:
          process.env.PLACEMENT_INTERNAL_RELEASE === INTERNAL_RELEASE
            ? x.placementSitting?.phase === 'SUBMITTED'
              ? 'Kiểm tra đầu vào · Đã nộp bài'
              : 'Kiểm tra đầu vào · Đang làm bài'
            : x.placementSitting
              ? x.placementSitting.phase === 'BLOCKED_REVIEW'
                ? 'Cần học vụ kiểm tra'
                : x.placementSitting.phase === 'SUBMITTED'
                  ? 'Đã nhận bài — xem bản công bố độc lập'
                  : 'Thi theo deadline server'
              : 'CHƯA ĐỦ DỮ LIỆU',
        score: null,
        goals: {
          goalLR: x.placementGoalScore,
          goalSpeaking: x.placementGoalSpeaking,
          goalWriting: x.placementGoalWriting,
        },
        resultPath: x.placementSitting
          ? '/placement/sittings/' + x.id + '/result'
          : x.placementVersionId
            ? '/placement/previews/' + x.id + '/result'
            : null,
      }));
    });
  }
  async stimulus(actor: AuthorityActor, id: string, sid: string) {
    const asset = await this.run(actor, async (tx) => {
      const { source: v } = await this.owned(tx, actor, id);
      const g = v.s.groups.find((g) => g.stimuli.some((s) => s.id === sid && !s.isProtected));
      const s = g?.stimuli.find((x) => x.id === sid && !x.isProtected);
      if (!s || s.type === 'TEXT' || !s.storageKey) throw missing();
      if (pilotTaskPolicy(g?.taskCode ?? null) && s.type === 'AUDIO')
        throw new ConflictException('Use durable S10 media protocol');
      const ev = (v.provenance as PlacementProvenance).assets?.find((a) => a.id === sid);
      if (!ev) throw new ServiceUnavailableException('Asset provenance unavailable');
      return { s, ev };
    });
    try {
      const body = await this.media.read(asset.s.storageKey!);
      if (createHash('sha256').update(body).digest('hex') !== asset.ev.sha256) throw Error();
      return { body, mimeType: asset.s.mimeType };
    } catch {
      throw new ServiceUnavailableException('Private media unavailable');
    }
  }
}
