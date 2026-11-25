import { s10NewAttemptProtocol } from './s10-protocol';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type PlacementSitting } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ClassLmsService } from '../class-lms/class-lms.service';
import { AuthorizationService, type AuthorityActor } from '../authorization/authorization.service';
import { quizDigest } from '../class-lms/quiz.service';
import { PlacementIntegrationService } from './integration.service';
import { privatePlacementPreviewEnabled } from './placement-preview.guard';
import {
  INTERNAL_RELEASE,
  internalPlacementEnabled,
  internalPlacementRelease,
  releasedTiming,
} from './internal-release';
import {
  placementEligibility,
  type PlacementProvenance,
  type PlacementSnapshot,
} from './source-eligibility';
import { candidateStimulusText } from './candidate-information-table';
import { AssessmentResponseStorage } from './assessment-response.storage';
import { AssessmentStimulusMediaStorage } from './assessment-stimulus-media.storage';
import { originalPcmDuration } from './workflow-recording';
import { inspectM05Content } from './content-readiness';
import type { MicrophoneConfirmDto, MicrophoneUploadDto } from './microphone-check.dto';
import {
  duration,
  nextPhase,
  phaseGroups,
  rawParts,
  validateTiming,
  type CriteriaPolicy,
  type Phase,
  type RubricPolicy,
  type TimingPolicy,
} from './workflow.policy';
import {
  buildPlacementStructuredDiagnosis,
  buildSelfStudyGuidance,
  generatePlacementAiAdvisory,
  KNOWLEDGE_DOMAIN_CATALOG,
  normalizeCanonicalPartCode,
  type AiAdvisoryProviderHook,
  type ClassAvailabilityEvaluation,
  type CourseRecommendationEvaluation,
  type CourseRuleTraceItem,
  type DbQuestionMetadataMap,
  type PlacementStructuredDiagnosis,
  type PlacementStructuredRecommendation,
} from './placement-diagnosis-advisory';
import { GeminiAdvisoryAdapter } from './gemini-advisory-provider';
import {
  WorkflowAssignDto,
  WorkflowCommandDto,
  WorkflowEvaluationDto,
  WorkflowPolicyDto,
  WorkflowReasonDto,
  WorkflowStartDto,
  WorkflowAnswerDto,
} from './workflow.dto';
type Tx = Prisma.TransactionClient;
const missing = () => new NotFoundException('Placement workflow unavailable');
const stale = () => new ConflictException('WORKFLOW_STALE_OR_REQUEST_CONFLICT');
const digest = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
class SourceIntegrityFault extends Error {
  constructor(
    readonly attemptId: string,
    readonly original: HttpException,
  ) {
    super('Source integrity incident');
  }
}
const capability = (kind: string, approve = false) =>
  'placement.' +
  { SOURCE_TIMING: 'source', RUBRIC: 'rubric', CRITERIA: 'criteria' }[kind] +
  '.' +
  (approve ? 'approve' : 'author');
const json = (x: unknown) => x as Prisma.InputJsonValue;
@Injectable()
export class PlacementWorkflowService {
  private readonly logger = new Logger(PlacementWorkflowService.name);
  constructor(
    private readonly db: PrismaService,
    private readonly lms: ClassLmsService,
    private readonly authority: AuthorizationService,
    private readonly integration: PlacementIntegrationService,
    private readonly responses: AssessmentResponseStorage,
    private readonly media: AssessmentStimulusMediaStorage,
  ) {}
  private async run<T>(actor: AuthorityActor, work: (tx: Tx) => Promise<T>) {
    try {
      return await this.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
          await this.lms.context(tx, actor);
          const u = await tx.user.findUniqueOrThrow({
            where: { id: actor.id },
            select: { email: true },
          });
          const internal = await internalPlacementEnabled(tx);
          if (
            process.env.W04B_ENABLED !== 'DEV_WORKFLOW' ||
            (!u.email.endsWith('@example.invalid') && !internal) ||
            !(await privatePlacementPreviewEnabled(tx)) ||
            !/^\/v2_wave01_dev_test_w04b_/.test(new URL(process.env.E2E_DATABASE_URL!).pathname)
          )
            throw new ConflictException('W04B_PRIVATE_DEV_ONLY_REAL_RELEASE_BLOCKED');
          await tx.$queryRaw`SELECT set_config('app.class_lms_actor',${actor.id},true),set_config('app.class_lms_session',${actor.sessionId},true)`;
          if (internal)
            await tx.$queryRaw`SELECT set_config('app.placement_internal_release',${INTERNAL_RELEASE},true)`;
          return work(tx);
        },
        { maxWait: 10000, timeout: 30000 },
      );
    } catch (e) {
      if (e instanceof SourceIntegrityFault) {
        await this.retainIntegrityIncident(actor, e.attemptId);
        throw e.original;
      }
      if (e instanceof HttpException) throw e;
      const code = String(e) + JSON.stringify(e);
      if (process.env.W04B_DIAGNOSTICS === 'DEV_TRACE')
        this.logger.error(
          JSON.stringify({
            family: e instanceof Error ? e.name : typeof e,
            pgCode: /Code: `([0-9A-Z]{5})`/.exec(code)?.[1] ?? null,
            constraint: /W04B_[A-Z_]+/.exec(code)?.[0] ?? null,
            code: (e as { code?: string })?.code,
          }),
        );
      if (/42501/.test(code))
        throw new ForbiddenException('Current independent Placement authority required');
      if (/P2002|P2034|23514|W04B_/.test(code)) throw stale();
      throw new ServiceUnavailableException(
        'Saved evidence retained. Retry identical request; do not start another sitting.',
      );
    }
  }
  private async role(tx: Tx, actor: AuthorityActor, role: string) {
    const u = await this.lms.context(tx, actor);
    if (u.role !== role) throw new ForbiddenException('Placement role required');
  }
  private async retainIntegrityIncident(actor: AuthorityActor, id: string) {
    await this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
        const u = await this.lms.context(tx, actor);
        if (u.role !== 'STUDENT' || !(await privatePlacementPreviewEnabled(tx))) throw missing();
        await tx.$queryRaw`SELECT set_config('app.class_lms_actor',${actor.id},true),set_config('app.class_lms_session',${actor.sessionId},true)`;
        if (await internalPlacementEnabled(tx))
          await tx.$queryRaw`SELECT set_config('app.placement_internal_release',${INTERNAL_RELEASE},true)`;
        const a = await tx.testAttempt.findFirst({
          where: { id, learnerId: actor.id },
          include: { placementSitting: true },
        });
        if (!a?.placementSitting) throw missing();
        if (!['SUBMITTED', 'BLOCKED_REVIEW'].includes(a.placementSitting.phase))
          await this.block(tx, a.placementSitting, 'PINNED_SOURCE_OR_MEDIA_INTEGRITY_UNSAFE');
        await this.authority.audit(
          tx,
          actor.id,
          'PLACEMENT_INTEGRITY_INCIDENT',
          'TestAttempt',
          id,
          'Pinned source/media unsafe; preserve work and original deadlines, no zero',
        );
      },
      { maxWait: 10000, timeout: 15000 },
    );
  }
  private async permit(tx: Tx, actor: AuthorityActor, cap: string) {
    await this.authority.requireActor(tx, actor, cap);
  }
  private async idem<T>(
    tx: Tx,
    actor: AuthorityActor,
    key: string,
    action: string,
    b: unknown,
    work: () => Promise<T>,
  ): Promise<T> {
    const hash = quizDigest(b),
      old = await tx.placementWorkflowRequest.findUnique({
        where: { actorId_key: { actorId: actor.id, key: key.toLowerCase() } },
      });
    if (old) {
      if (old.action !== action || old.digest !== hash) throw stale();
      return old.response as T;
    }
    const response = await work();
    await tx.placementWorkflowRequest.create({
      data: {
        actorId: actor.id,
        key: key.toLowerCase(),
        action,
        digest: hash,
        response: json(response),
      },
    });
    return response;
  }
  private async source(tx: Tx, id: string, allowArchivedInternal = false) {
    const v = await this.integration.source(tx, id);
    const internalRelease = await internalPlacementRelease(tx, id, allowArchivedInternal);
    if (await internalPlacementEnabled(tx)) {
      if (!internalRelease || internalRelease.sourceHash !== v.sourceHash)
        throw new ConflictException('INTERNAL_SOURCE_NOT_AUTHORIZED');
      return { ...v, internalRelease };
    }
    if (v.purpose !== 'DEV_PREVIEW' || !(v.provenance as PlacementProvenance).synthetic)
      throw new ConflictException('REAL_SOURCE_RELEASE_BLOCKED');
    return { ...v, internalRelease: null };
  }
  private async policy(tx: Tx, id: string, kind: string, sourceId?: string) {
    const p = await tx.placementWorkflowPolicy.findUnique({ where: { id } });
    if (
      !p ||
      p.kind !== kind ||
      !p.approvedById ||
      !p.approvedAt ||
      p.digest !== quizDigest(p.body) ||
      (sourceId && p.sourceId !== sourceId)
    )
      throw new ConflictException('APPROVED_IMMUTABLE_POLICY_REQUIRED');
    return p;
  }
  private validatePolicy(p: WorkflowPolicyDto, s?: PlacementSnapshot, hash?: string) {
    try {
      this.validatePolicyShape(p, s, hash);
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new BadRequestException('Malformed policy body; no approval or state change');
    }
  }
  private validatePolicyShape(p: WorkflowPolicyDto, s?: PlacementSnapshot, hash?: string) {
    if (p.kind === 'SOURCE_TIMING') {
      if (!s || !validateTiming(s, p.body as unknown as TimingPolicy, hash!))
        throw new BadRequestException('Exact approved source-specific task windows required');
      return;
    }
    if (p.kind === 'RUBRIC') {
      const b = p.body as unknown as RubricPolicy;
      const groups = s?.groups.filter((g) => ['SPEAKING', 'WRITING'].includes(g.skill)) ?? [];
      if (
        !s ||
        b.sourceHash !== hash ||
        !b.evidence?.trim() ||
        !b.scale?.trim() ||
        !Array.isArray(b.tasks) ||
        b.tasks.length !== groups.length ||
        new Set(b.tasks.map((t) => t.groupId)).size !== groups.length ||
        !groups.every((g) => {
          const t = b.tasks.find((t) => t.groupId === g.id);
          return (
            !!t &&
            Array.isArray(t.criteria) &&
            t.criteria.length > 0 &&
            t.criteria.length <= 20 &&
            new Set(t.criteria.map((c) => c.code)).size === t.criteria.length &&
            t.criteria.every(
              (c) =>
                /^[A-Z0-9_]{1,32}$/.test(c.code) &&
                typeof c.descriptor === 'string' &&
                c.descriptor.trim().length >= 10 &&
                Number.isFinite(c.max) &&
                c.max > 0 &&
                c.max <= 1000,
            )
          );
        })
      )
        throw new BadRequestException(
          'Complete task criterion descriptors, source and internal calibrated scale required',
        );
      return;
    }
    const b = p.body as unknown as CriteriaPolicy;
    if (
      !b.evidence?.trim() ||
      !Array.isArray(b.rules) ||
      !b.rules.length ||
      b.rules.length > 50 ||
      !b.rules.every(
        (r) =>
          ['LISTENING', 'READING', 'SPEAKING', 'WRITING'].includes(r.skill) &&
          typeof r.scale === 'string' &&
          r.scale.trim().length > 0 &&
          (!r.part || /^(?:LR-)?P[1-7]$/.test(r.part)) &&
          (!r.domainCode ||
            (typeof r.domainCode === 'string' && r.domainCode in KNOWLEDGE_DOMAIN_CATALOG)) &&
          Number.isInteger(r.minSamples) &&
          r.minSamples > 0 &&
          Number.isFinite(r.min) &&
          Number.isFinite(r.max) &&
          r.min >= 0 &&
          r.max >= r.min &&
          Array.isArray(r.courseVersionIds) &&
          r.courseVersionIds.length > 0 &&
          r.courseVersionIds.every((id) => /^[a-f0-9-]{36}$/.test(id)),
      )
    )
      throw new BadRequestException(
        'Explicit evidence/sample/raw internal bounds and CourseVersion required',
      );
    if (p.mode === 'LR' && b.rules.some((r) => ['SPEAKING', 'WRITING'].includes(r.skill)))
      throw new BadRequestException('LR criteria cannot use absent SW');
  }
  config(actor: AuthorityActor) {
    return this.run(actor, async (tx) => {
      const internalAssessment = await internalPlacementEnabled(tx);
      const u = await this.lms.context(tx, actor),
        caps = [
          'placement.source.author',
          'placement.source.approve',
          'placement.rubric.author',
          'placement.rubric.approve',
          'placement.criteria.author',
          'placement.criteria.approve',
          'placement.grader.assign',
          'placement.result.publish',
        ];
      const permissions = Object.fromEntries(
        await Promise.all(
          caps.map(async (cap) => [
            cap,
            await this.authority.permits(actor.id, cap, { type: 'GLOBAL' }, tx),
          ]),
        ),
      );
      if (!['STUDENT', 'INSTRUCTOR', 'ACADEMIC_MANAGER'].includes(u.role))
        throw new ForbiddenException('Placement workspace role required');
      const visibleKind = (kind: string) =>
        permissions[capability(kind)] || permissions[capability(kind, true)];
      const sourceEditorial = visibleKind('SOURCE_TIMING') || visibleKind('RUBRIC');
      const policies = await tx.placementWorkflowPolicy.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      const sources = await tx.placementSourceVersion.findMany({
        where: { purpose: 'DEV_PREVIEW' },
        orderBy: { createdAt: 'desc' },
        take: 30,
      });
      const graders = permissions['placement.grader.assign']
        ? await tx.user.findMany({
            where: {
              role: 'INSTRUCTOR',
              status: 'ACTIVE',
              ...(!internalAssessment ? { email: { endsWith: '@example.invalid' } } : {}),
            },
            select: { id: true, fullName: true },
            take: 100,
          })
        : [];
      return {
        role: u.role,
        permissions,
        graders,
        internalAssessment,
        realExamEnabled: false,
        privateDev: true,
        releaseFlags: { MEDIA_QA_PASS: false, ACADEMIC_APPROVED: false, PUBLISHED: false },
        policies:
          u.role === 'STUDENT'
            ? policies
                .filter((p) => p.kind === 'SOURCE_TIMING' && p.approvedById)
                .map((p) => ({
                  id: p.id,
                  sourceId: p.sourceId,
                  mode: p.mode,
                  kind: p.kind,
                  approved: true,
                }))
            : policies.filter((p) => visibleKind(p.kind)),
        sources: sources
          .filter(
            (v) =>
              sourceEditorial ||
              (u.role === 'STUDENT' &&
                policies.some(
                  (p) => p.sourceId === v.id && p.kind === 'SOURCE_TIMING' && p.approvedById,
                )),
          )
          .map((v) => ({
            id: v.id,
            mode: v.mode,
            version: v.version,
            title: (v.snapshot as unknown as PlacementSnapshot).title,
            itemCount: (v.snapshot as unknown as PlacementSnapshot).allQuestionIds.length,
            ...(sourceEditorial
              ? {
                  sourceHash: v.sourceHash,
                  taskReferences: (v.snapshot as unknown as PlacementSnapshot).groups
                    .filter((g) => ['SPEAKING', 'WRITING'].includes(g.skill))
                    .map((g) => ({
                      groupId: g.id,
                      skill: g.skill,
                      taskCode: g.taskCode,
                      preparationSeconds: g.preparationSeconds,
                      responseSeconds: g.responseSeconds,
                    })),
                }
              : {}),
            ...(u.role !== 'STUDENT'
              ? {
                  eligibility: placementEligibility(
                    v.snapshot as unknown as PlacementSnapshot,
                    v.provenance as PlacementProvenance,
                  ),
                }
              : {}),
          })),
      };
    });
  }
  readiness(actor: AuthorityActor) {
    return this.run(actor, async (tx) => {
      const caps = [
        'placement.source.author',
        'placement.source.approve',
        'placement.result.publish',
      ];
      const permitted = await Promise.all(
        caps.map((cap) => this.authority.permits(actor.id, cap, { type: 'GLOBAL' }, tx)),
      );
      if (!permitted.some(Boolean))
        throw new ForbiddenException('Placement readiness authority required');
      const now = await this.lms.now(tx);
      const [content, criteria, classes] = await Promise.all([
        inspectM05Content(),
        tx.placementWorkflowPolicy.findMany({
          where: { kind: 'CRITERIA' },
          select: { mode: true, approvedById: true, approvedAt: true },
        }),
        tx.classOffering.findMany({
          select: {
            status: true,
            versionId: true,
            classStart: true,
            enrollmentStart: true,
            enrollmentEnd: true,
            termsApprovedAt: true,
          },
        }),
      ]);
      return {
        asOf: now.toISOString(),
        content,
        matching: {
          approvedCriteria: criteria
            .filter((p) => p.approvedById && p.approvedAt)
            .map((p) => p.mode),
          draftCriteriaCount: criteria.filter((p) => !p.approvedById).length,
          classCount: classes.length,
          classesWithPinnedVersion: classes.filter((c) => c.versionId && c.termsApprovedAt).length,
          classesWithFutureStart: classes.filter((c) => c.classStart && c.classStart > now).length,
          classesWithOpenAdmission: classes.filter(
            (c) =>
              c.status === 'OPEN' &&
              c.enrollmentStart &&
              c.enrollmentEnd &&
              c.enrollmentStart <= now &&
              c.enrollmentEnd > now,
          ).length,
        },
        releaseFlags: { MEDIA_QA_PASS: false, ACADEMIC_APPROVED: false, PUBLISHED: false },
      };
    });
  }
  microphoneCheck(
    actor: AuthorityActor,
    b: MicrophoneUploadDto,
    file?: { buffer: Buffer; mimetype: string },
  ) {
    if (!file || file.mimetype !== 'audio/wav' || file.buffer.length > 10 * 1024 * 1024)
      throw new BadRequestException('Original PCM WAV required');
    let durationMs: number;
    try {
      durationMs = originalPcmDuration(file.buffer);
    } catch {
      throw new BadRequestException('Invalid original PCM WAV');
    }
    if (durationMs <= 0 || durationMs > 30000)
      throw new BadRequestException('Microphone check must be at most 30 seconds');
    const hash = digest(file.buffer);
    return this.run(actor, async (tx) => {
      await this.role(tx, actor, 'STUDENT');
      return this.idem(
        tx,
        actor,
        b.idempotencyKey,
        'MICROPHONE_CHECK',
        { hash, bytes: file.buffer.length },
        async () => {
          const id = randomUUID();
          await this.responses.put(
            { learnerId: actor.id, attemptId: id, testQuestionId: 'microphone-check' },
            file.buffer,
            'audio/wav',
            this.microphoneKey(actor.id, id),
          );
          const metadata = { sha256: hash, bytes: file.buffer.length, durationMs };
          await this.authority.audit(
            tx,
            actor.id,
            'PLACEMENT_MICROPHONE_SAVED',
            'PlacementMicrophoneCheck',
            id,
            JSON.stringify(metadata),
            'TECHNICAL_ONLY',
          );
          return {
            id,
            ...metadata,
            playbackUrl: `/api/v2/placement/workflow/microphone-checks/${id}/audio`,
            operatorConfirmed: false,
          };
        },
      );
    });
  }
  private microphoneKey(actorId: string, id: string) {
    return `${actorId}/${id}/microphone-check/original.wav`;
  }
  private async microphoneMetadata(tx: Tx, actor: AuthorityActor, id: string) {
    await this.role(tx, actor, 'STUDENT');
    const event = await tx.domainAuditEvent.findFirst({
      where: {
        actorId: actor.id,
        objectType: 'PlacementMicrophoneCheck',
        objectId: id,
        action: 'PLACEMENT_MICROPHONE_SAVED',
      },
    });
    if (!event) throw missing();
    return JSON.parse(event.reason) as { sha256: string; bytes: number; durationMs: number };
  }
  microphoneStatus(actor: AuthorityActor, id: string) {
    return this.run(actor, async (tx) => {
      const metadata = await this.microphoneMetadata(tx, actor, id);
      const confirmation = await tx.domainAuditEvent.findFirst({
        where: {
          actorId: actor.id,
          objectType: 'PlacementMicrophoneCheck',
          objectId: id,
          action: 'PLACEMENT_MICROPHONE_OPERATOR_CONFIRMED',
        },
      });
      return {
        id,
        ...metadata,
        playbackUrl: `/api/v2/placement/workflow/microphone-checks/${id}/audio`,
        operatorConfirmed: !!confirmation,
      };
    });
  }
  microphoneAudio(actor: AuthorityActor, id: string) {
    return this.run(actor, async (tx) => {
      const metadata = await this.microphoneMetadata(tx, actor, id);
      const body = await this.responses.read(this.microphoneKey(actor.id, id));
      if (body.length !== metadata.bytes || digest(body) !== metadata.sha256)
        throw new ServiceUnavailableException(
          'Original microphone recording integrity check failed',
        );
      await this.authority.audit(
        tx,
        actor.id,
        'PLACEMENT_MICROPHONE_PLAYBACK',
        'PlacementMicrophoneCheck',
        id,
        metadata.sha256,
        'TECHNICAL_ONLY',
      );
      return { body, sha256: metadata.sha256 };
    });
  }
  confirmMicrophone(actor: AuthorityActor, id: string, b: MicrophoneConfirmDto) {
    return this.run(actor, async (tx) => {
      await this.microphoneMetadata(tx, actor, id);
      return this.idem(tx, actor, b.idempotencyKey, 'MICROPHONE_CONFIRM', { id, b }, async () => {
        const played = await tx.domainAuditEvent.findFirst({
          where: {
            actorId: actor.id,
            objectType: 'PlacementMicrophoneCheck',
            objectId: id,
            action: 'PLACEMENT_MICROPHONE_PLAYBACK',
          },
        });
        if (!played || !b.physicalDeviceConfirmed || !b.originalPlaybackConfirmed)
          throw new ConflictException('Original playback and operator confirmation required');
        await this.authority.audit(
          tx,
          actor.id,
          'PLACEMENT_MICROPHONE_OPERATOR_CONFIRMED',
          'PlacementMicrophoneCheck',
          id,
          'Operator attests physical microphone use and recognizes own voice in original stored playback; not an assessment or hardware certification',
          'OPERATOR_ATTESTED',
        );
        return { id, operatorConfirmed: true };
      });
    });
  }
  createPolicy(actor: AuthorityActor, b: WorkflowPolicyDto) {
    return this.run(actor, async (tx) => {
      await this.permit(tx, actor, capability(b.kind));
      return this.idem(tx, actor, b.idempotencyKey, 'POLICY_CREATE', b, async () => {
        const v = b.sourceId ? await this.source(tx, b.sourceId) : undefined;
        if ((b.kind === 'CRITERIA') !== !b.sourceId || (v && v.mode !== b.mode))
          throw new BadRequestException('Policy mode/source mismatch');
        this.validatePolicy(b, v?.s, v?.sourceHash);
        if (b.kind === 'CRITERIA')
          for (const id of new Set(
            (b.body as unknown as CriteriaPolicy).rules.flatMap((r) => r.courseVersionIds),
          ))
            if (!(await tx.courseVersion.findFirst({ where: { id, state: 'PUBLISHED' } })))
              throw new BadRequestException('Approved actual CourseVersion required');
        const p = await tx.placementWorkflowPolicy.create({
          data: {
            kind: b.kind,
            mode: b.mode,
            sourceId: b.sourceId,
            body: json(b.body),
            digest: quizDigest(b.body),
            authorId: actor.id,
            reason: b.reason,
          },
        });
        await this.authority.audit(
          tx,
          actor.id,
          'PLACEMENT_POLICY_DRAFT',
          'PlacementPolicy',
          p.id,
          b.reason,
        );
        return { id: p.id, state: 'DRAFT', realApproval: false };
      });
    });
  }
  approvePolicy(actor: AuthorityActor, id: string, b: WorkflowReasonDto) {
    return this.run(actor, async (tx) => {
      const p = await tx.placementWorkflowPolicy.findUnique({ where: { id } });
      if (!p) throw missing();
      await this.permit(tx, actor, capability(p.kind, true));
      return this.idem(tx, actor, b.idempotencyKey, 'POLICY_APPROVE', { id, b }, async () => {
        if (p.approvedById) throw stale();
        const v = p.sourceId ? await this.source(tx, p.sourceId) : undefined;
        this.validatePolicy(
          {
            kind: p.kind,
            mode: p.mode,
            body: p.body as Record<string, unknown>,
          } as WorkflowPolicyDto,
          v?.s,
          v?.sourceHash,
        );
        await tx.placementWorkflowPolicy.update({
          where: { id },
          data: { approvedById: actor.id, approvedAt: await this.lms.now(tx) },
        });
        await this.authority.audit(
          tx,
          actor.id,
          'PLACEMENT_POLICY_APPROVE',
          'PlacementPolicy',
          id,
          b.reason,
        );
        return { id, state: 'APPROVED_DEV_ONLY', realApproval: false };
      });
    });
  }
  start(actor: AuthorityActor, b: WorkflowStartDto) {
    return this.run(actor, async (tx) => {
      await this.role(tx, actor, 'STUDENT');
      return this.idem(tx, actor, b.idempotencyKey, 'SITTING_START', b, async () => {
        const v = await this.source(tx, b.sourceVersionId),
          p = await this.policy(tx, b.policyId, 'SOURCE_TIMING', v.id);
        releasedTiming(v.internalRelease, v, p.id, p.body as unknown as TimingPolicy);
        if (
          v.mode !== b.mode ||
          p.mode !== b.mode ||
          (b.mode === 'LR' && (b.goalSpeaking !== undefined || b.goalWriting !== undefined)) ||
          (b.mode === 'FOUR_SKILLS' &&
            (b.goalSpeaking === undefined || b.goalWriting === undefined))
        )
          throw new BadRequestException('Mode and independent goals required');
        const old = await tx.testAttempt.findFirst({
          where: { learnerId: actor.id, placementVersionId: v.id },
          orderBy: { startedAt: 'desc' },
          include: { placementSitting: true },
        });
        if (old && !(v.internalRelease && old.status === 'SUBMITTED')) {
          if (
            old.placementGoalScore !== b.goalLR ||
            old.placementGoalSpeaking !== (b.goalSpeaking ?? null) ||
            old.placementGoalWriting !== (b.goalWriting ?? null) ||
            !(await tx.placementSitting.findUnique({ where: { attemptId: old.id } }))
          )
            throw stale();
          return { attemptId: old.id, resumed: true };
        }
        const a = await tx.testAttempt.create({
            data: {
              s10ProtocolVersion: await s10NewAttemptProtocol(tx),
              testId: v.testId,
              learnerId: actor.id,
              attemptNumber: (old?.attemptNumber ?? 0) + 1,
              placementVersionId: v.id,
              placementGoalScore: b.goalLR,
              placementGoalSpeaking: b.goalSpeaking,
              placementGoalWriting: b.goalWriting,
            },
          }),
          now = await this.lms.now(tx);
        await tx.placementSitting.create({
          data: {
            attemptId: a.id,
            policyId: p.id,
            phase: 'LISTENING',
            phaseStartedAt: now,
            deadline: new Date(now.getTime() + 2700000),
          },
        });
        await this.authority.audit(
          tx,
          actor.id,
          'PLACEMENT_SITTING_START',
          'TestAttempt',
          a.id,
          v.internalRelease
            ? `Internal Smart English assessment authorized by PO (${INTERNAL_RELEASE}); no ETS claim or staff approval impersonation`
            : 'Synthetic protocol, first sitting, no source publication',
        );
        return { attemptId: a.id, resumed: false };
      });
    });
  }
  private async owned(tx: Tx, actor: AuthorityActor, id: string, staff = false) {
    const a = await tx.testAttempt.findFirst({
      where: { id, ...(!staff ? { learnerId: actor.id } : {}), placementSitting: { isNot: null } },
      include: { placementSitting: { include: { policy: true } }, answers: true },
    });
    if (!a?.placementVersionId || !a.placementSitting) throw missing();
    if (!staff) await this.role(tx, actor, 'STUDENT');
    const v = await this.source(tx, a.placementVersionId, true).catch((e: unknown) => {
        if (!staff && e instanceof HttpException) throw new SourceIntegrityFault(id, e);
        throw e;
      }),
      p = a.placementSitting.policy;
    if (!p.approvedAt || p.digest !== quizDigest(p.body) || p.sourceId !== v.id)
      throw new ConflictException('SOURCE_OR_TIMING_REVIEW_REQUIRED');
    const timing = releasedTiming(v.internalRelease, v, p.id, p.body as unknown as TimingPolicy);
    return { a, v, s: a.placementSitting, p, timing, now: await this.lms.now(tx) };
  }
  private async assignment(tx: Tx, actor: AuthorityActor, id: string) {
    await this.role(tx, actor, 'INSTRUCTOR');
    const r = await tx.placementGraderAssignment.findFirst({
      where: { attemptId: id },
      orderBy: { number: 'desc' },
    });
    if (!r || r.graderId !== actor.id) throw missing();
    return r;
  }
  private async block(tx: Tx, s: PlacementSitting, reason: string) {
    return tx.placementSitting.update({
      where: { attemptId: s.attemptId },
      data: {
        phase: 'BLOCKED_REVIEW',
        blockedReason: reason,
        deadline: null,
        lockVersion: { increment: 1 },
      },
    });
  }
  private async readReceipt(
    tx: Tx,
    assignmentId: string,
    questionId: string,
    hash: string,
    kind: string,
  ) {
    const where = { assignmentId_questionId_digest: { assignmentId, questionId, digest: hash } };
    if (!(await tx.placementEvidenceRead.findUnique({ where })))
      await tx.placementEvidenceRead.create({
        data: { assignmentId, questionId, digest: hash, kind },
      });
  }
  private async original(tx: Tx, id: string, qid: string, key: string) {
    const r = await tx.placementTaskRecording.findUnique({
      where: { attemptId_questionId: { attemptId: id, questionId: qid } },
    });
    const upload = r
      ? null
      : await tx.examTaskUpload.findFirst({
          where: { storageKey: key, status: 'COMMITTED' },
          orderBy: { createdAt: 'desc' },
        });
    const body = await this.responses.read(key),
      expected = r?.digest ?? upload?.digest;
    if (!expected || digest(body) !== expected)
      throw new ConflictException('ORIGINAL_RECORDING_INTEGRITY_REVIEW_REQUIRED');
    return body;
  }
  private async finish(
    tx: Tx,
    ctx: Awaited<ReturnType<PlacementWorkflowService['owned']>>,
    s: PlacementSitting,
  ) {
    const receipt = randomUUID();
    await tx.testAttempt.update({
      where: { id: ctx.a.id },
      data: {
        status: 'SUBMITTED',
        submittedAt: await this.lms.now(tx),
        placementReceipt: receipt,
        placementLockVersion: { increment: 1 },
      },
    });
    const result = await tx.placementSitting.update({
      where: { attemptId: s.attemptId },
      data: {
        phase: 'SUBMITTED',
        taskIndex: 0,
        deadline: null,
        receipt,
        lockVersion: { increment: 1 },
      },
    });
    if (
      !(await tx.placementHumanEvaluation.findFirst({
        where: { attemptId: s.attemptId, skill: 'LR' },
      }))
    )
      await tx.placementHumanEvaluation.create({
        data: {
          attemptId: s.attemptId,
          skill: 'LR',
          number: 1,
          body: json({
            state: ctx.v.internalRelease ? 'INTERNAL_OBJECTIVE_SCORED' : 'OBJECTIVE_VERIFIED_DEV',
            parts: rawParts(ctx.v.s, ctx.a.answers),
            sourceHash: ctx.v.sourceHash,
          }),
          reason: ctx.v.internalRelease
            ? 'Actual saved answers scored against pinned internal source; no teacher signature or official TOEIC score'
            : 'Objective counts from pinned synthetic source, unpublished',
        },
      });
    return result;
  }
  private async advance(
    tx: Tx,
    ctx: Awaited<ReturnType<PlacementWorkflowService['owned']>>,
    s: PlacementSitting,
    breakRequested: boolean,
    expired: boolean,
  ) {
    const groups = phaseGroups(ctx.v.s, s.phase as Phase, s.taskIndex);
    if (s.phase === 'SPEAKING')
      for (const g of groups)
        for (const q of g.questions) {
          const ans = ctx.a.answers.find((a) => a.testQuestionId === q.id);
          if (!ans?.audioStorageKey)
            return this.block(tx, s, 'ORIGINAL_SPEAKING_RECORDING_MISSING');
          if (g.taskCode === 'SE_SW_01_S10_V01') {
            const task = await tx.examTaskProgress.findFirst({
              where: { attemptId: s.attemptId, testQuestionId: q.id },
              orderBy: { resetCount: 'desc' },
            });
            if (task?.phase !== 'SAVED') return this.block(tx, s, 'S10_PENDING_OR_UNSAFE');
          }
        }
    const next = nextPhase(s.phase as Phase, s.taskIndex, ctx.v.s, breakRequested);
    if (next.phase === 'SUBMITTED') return this.finish(tx, ctx, s);
    const start = expired ? s.deadline! : ctx.now,
      seconds = duration(next.phase, next.index, ctx.v.s, ctx.timing),
      deadline = new Date(start.getTime() + seconds * 1000);
    if (deadline <= ctx.now) return this.block(tx, s, 'ORIGINAL_NEXT_WINDOW_ELAPSED');
    return tx.placementSitting.update({
      where: { attemptId: s.attemptId },
      data: {
        phase: next.phase,
        taskIndex: next.index,
        phaseStartedAt: start,
        deadline,
        lockVersion: { increment: 1 },
      },
    });
  }
  private async refresh(tx: Tx, ctx: Awaited<ReturnType<PlacementWorkflowService['owned']>>) {
    let s: PlacementSitting = ctx.s;
    if (s.phase === 'SPEAKING' && s.deadline && ctx.now >= s.deadline) {
      const q = phaseGroups(ctx.v.s, 'SPEAKING', s.taskIndex)[0]?.questions[0];
      if (q) {
        const recording = await tx.placementTaskRecording.findUnique({
          where: { attemptId_questionId: { attemptId: s.attemptId, questionId: q.id } },
        });
        if (recording?.state === 'STARTED' && recording.uploadDeadline >= ctx.now) return s;
      }
    }
    if (s.deadline && ctx.now >= s.deadline) s = await this.advance(tx, ctx, s, false, true);
    return s;
  }
  private view(s: PlacementSitting, now: Date) {
    return {
      attemptId: s.attemptId,
      phase: s.phase,
      taskIndex: s.taskIndex,
      phaseStartedAt: s.phaseStartedAt.toISOString(),
      deadline: s.deadline?.toISOString() ?? null,
      serverTime: now.toISOString(),
      lockVersion: s.lockVersion,
      receipt: s.receipt,
      blockedReason: s.blockedReason,
      privateDev: true,
    };
  }
  exam(actor: AuthorityActor, id: string) {
    return this.run(actor, async (tx) => {
      const ctx = await this.owned(tx, actor, id),
        s = await this.refresh(tx, ctx),
        groups = phaseGroups(ctx.v.s, s.phase as Phase, s.taskIndex);
      const recordings = await tx.placementTaskRecording.findMany({ where: { attemptId: id } }),
        uploadOnly = !!s.deadline && ctx.now >= s.deadline;
      return {
        ...this.view(s, ctx.now),
        awaitingUpload: uploadOnly,
        mode: ctx.v.mode,
        title: ctx.v.internalRelease ? 'Kiểm tra đầu vào nội bộ Smart English' : ctx.v.s.title,
        internalAssessment: !!ctx.v.internalRelease,
        goals: {
          goalLR: ctx.a.placementGoalScore,
          goalSpeaking: ctx.a.placementGoalSpeaking,
          goalWriting: ctx.a.placementGoalWriting,
        },
        marked: ctx.a.placementMarked,
        groups: groups.map((g) => ({
          id: g.id,
          taskCode: g.taskCode,
          skill: g.skill,
          title: uploadOnly ? null : g.title,
          instructions: uploadOnly ? null : g.instructions,
          stimulusText: !uploadOnly && g.skill === 'READING' ? g.stimulusText : null,
          window: ctx.timing.tasks.find((t) => t.groupId === g.id) ?? null,
          stimuli: (uploadOnly ? [] : g.stimuli)
            .filter((a) => !a.isProtected)
            .map((a) => ({
              id: a.id,
              type: a.type,
              textContent: a.type === 'TEXT' ? candidateStimulusText(a.textContent) : null,
              mediaUrl:
                a.type === 'TEXT' || g.taskCode === 'SE_SW_01_S10_V01'
                  ? null
                  : `/api/v2/placement/workflow/attempts/${id}/stimuli/${a.id}`,
            })),
          questions: g.questions.map((q) => {
            const a = ctx.a.answers.find((a) => a.testQuestionId === q.id);
            return {
              testQuestionId: q.id,
              content: uploadOnly ? '' : q.content,
              responseType: q.responseType,
              options: uploadOnly ? [] : q.options.map((o) => ({ id: o.id, content: o.content })),
              selectedOptionIds: a?.selectedOptionIds ?? [],
              textResponse: a?.textResponse ?? null,
              audioUploaded: !!a?.audioStorageKey,
              recordingState: recordings.find((r) => r.questionId === q.id)?.state ?? null,
            };
          }),
        })),
      };
    });
  }
  command(actor: AuthorityActor, id: string, b: WorkflowCommandDto) {
    return this.run(actor, async (tx) => {
      const ctx = await this.owned(tx, actor, id);
      return this.idem(tx, actor, b.idempotencyKey, 'SITTING_COMMAND', { id, b }, async () => {
        if (
          ctx.s.lockVersion !== b.expectedLockVersion ||
          ['SUBMITTED', 'BLOCKED_REVIEW'].includes(ctx.s.phase)
        )
          throw stale();
        let s: PlacementSitting;
        if (b.action === 'INCIDENT') {
          if (!b.reason?.trim()) throw new BadRequestException('Incident reason required');
          s = await this.block(tx, ctx.s, b.reason);
        } else if (ctx.s.deadline && ctx.now >= ctx.s.deadline) s = await this.refresh(tx, ctx);
        else {
          if (
            ctx.s.phase === 'SPEAKING' &&
            !phaseGroups(ctx.v.s, 'SPEAKING', ctx.s.taskIndex).every((g) =>
              g.questions.every((q) =>
                ctx.a.answers.some((a) => a.testQuestionId === q.id && a.audioStorageKey),
              ),
            )
          )
            throw new ConflictException('SPEAKING_RECORDING_REQUIRED_BEFORE_NEXT');
          if (b.action === 'BREAK' && (ctx.s.phase !== 'READING' || ctx.v.mode !== 'FOUR_SKILLS'))
            throw new BadRequestException('Break only after Reading before Speaking');
          s = await this.advance(tx, ctx, ctx.s, b.action === 'BREAK', false);
        }
        await this.authority.audit(
          tx,
          actor.id,
          'PLACEMENT_' + b.action,
          'TestAttempt',
          id,
          b.reason ?? 'Server section transition, no clock extension',
        );
        return this.view(s, ctx.now);
      });
    });
  }
  answer(actor: AuthorityActor, id: string, b: WorkflowAnswerDto) {
    return this.run(actor, async (tx) => {
      const ctx = await this.owned(tx, actor, id);
      return this.idem(tx, actor, b.idempotencyKey, 'SITTING_ANSWER', { id, b }, async () => {
        if (ctx.s.lockVersion !== b.expectedLockVersion) throw stale();
        if (!ctx.s.deadline || ctx.now >= ctx.s.deadline) {
          const s = await this.refresh(tx, ctx);
          return { ...this.view(s, ctx.now), saved: false, error: 'ORIGINAL_WINDOW_CLOSED' };
        }
        const q = phaseGroups(ctx.v.s, ctx.s.phase as Phase, ctx.s.taskIndex)
          .flatMap((g) => g.questions)
          .find((q) => q.id === b.questionId);
        if (!q) throw missing();
        const w = ctx.timing.tasks.find((w) =>
          phaseGroups(ctx.v.s, ctx.s.phase as Phase, ctx.s.taskIndex).some(
            (g) => g.id === w.groupId,
          ),
        );
        if (
          w &&
          ctx.now.getTime() <
            ctx.s.phaseStartedAt.getTime() + (w.preparationSeconds + w.playbackSeconds) * 1000
        )
          throw new ConflictException('RESPONSE_WINDOW_NOT_OPEN');
        if (q.responseType === 'AUDIO_RESPONSE' && b.marked === undefined)
          throw new ConflictException('Use recording protocol');
        if (
          await tx.placementTaskRecording.findFirst({ where: { attemptId: id, state: 'STARTED' } })
        )
          throw new ConflictException('RECORDING_IN_PROGRESS');
        if (b.marked === undefined) {
          if (
            q.responseType === 'TEXT_RESPONSE'
              ? typeof b.textResponse !== 'string' || b.selectedOptionIds !== undefined
              : !Array.isArray(b.selectedOptionIds) ||
                b.textResponse !== undefined ||
                b.selectedOptionIds.some((id) => !q.options.some((o) => o.id === id))
          )
            throw new BadRequestException('Answer must match current source response type');
          await tx.testAnswer.upsert({
            where: { attemptId_testQuestionId: { attemptId: id, testQuestionId: q.id } },
            create: {
              attemptId: id,
              testQuestionId: q.id,
              textResponse: b.textResponse,
              selectedOptionIds: b.selectedOptionIds ?? [],
            },
            update: {
              textResponse: b.textResponse ?? null,
              selectedOptionIds: b.selectedOptionIds ?? [],
            },
          });
        } else if (b.textResponse !== undefined || b.selectedOptionIds !== undefined)
          throw new BadRequestException('Mark and answer are separate commands');
        if (b.marked !== undefined)
          await tx.testAttempt.update({
            where: { id },
            data: {
              placementMarked: b.marked
                ? [...new Set([...ctx.a.placementMarked, q.id])]
                : ctx.a.placementMarked.filter((x) => x !== q.id),
              placementLockVersion: { increment: 1 },
            },
          });
        const s = await tx.placementSitting.update({
          where: { attemptId: id },
          data: { lockVersion: { increment: 1 } },
        });
        return { ...this.view(s, ctx.now), saved: true };
      });
    });
  }
  assign(actor: AuthorityActor, id: string, b: WorkflowAssignDto) {
    return this.run(actor, async (tx) => {
      await this.permit(tx, actor, 'placement.grader.assign');
      return this.idem(tx, actor, b.idempotencyKey, 'GRADER_ASSIGN', { id, b }, async () => {
        const ctx = await this.owned(tx, actor, id, true),
          g = await tx.user.findFirst({
            where: { id: b.graderId, status: 'ACTIVE', role: 'INSTRUCTOR' },
          });
        if (
          ctx.s.phase !== 'SUBMITTED' ||
          ctx.v.mode !== 'FOUR_SKILLS' ||
          !g ||
          !b.eligibilityConfirmed ||
          actor.id === g.id ||
          g.id === ctx.a.learnerId
        )
          throw new ConflictException('Eligible independent GV and submitted SW required');
        const old = await tx.placementGraderAssignment.findFirst({
          where: { attemptId: id },
          orderBy: { number: 'desc' },
        });
        const a = await tx.placementGraderAssignment.create({
          data: {
            attemptId: id,
            number: (old?.number ?? 0) + 1,
            graderId: g.id,
            assignedById: actor.id,
            reason: b.reason,
          },
        });
        await this.authority.audit(
          tx,
          actor.id,
          'PLACEMENT_GRADER_ASSIGN',
          'PlacementAssignment',
          a.id,
          b.reason,
        );
        return { id: a.id, number: a.number, graderId: a.graderId };
      });
    });
  }
  queue(actor: AuthorityActor) {
    return this.run(actor, async (tx) => {
      const u = await this.lms.context(tx, actor);
      if (u.role === 'STUDENT')
        return tx.testAttempt.findMany({
          where: { learnerId: actor.id, placementSitting: { isNot: null } },
          select: { id: true, placementSitting: true },
          orderBy: { startedAt: 'desc' },
          take: 50,
        });
      if (u.role === 'INSTRUCTOR') {
        const all = await tx.placementGraderAssignment.findMany({
          where: { graderId: actor.id },
          orderBy: { number: 'desc' },
          take: 100,
        });
        const active = [];
        for (const a of all) {
          const latest = await tx.placementGraderAssignment.findFirst({
            where: { attemptId: a.attemptId },
            orderBy: { number: 'desc' },
          });
          if (latest?.id === a.id) active.push({ id: a.attemptId, assignmentId: a.id });
        }
        return active;
      }
      if (
        !(await this.authority.permits(
          actor.id,
          'placement.grader.assign',
          { type: 'GLOBAL' },
          tx,
        )) &&
        !(await this.authority.permits(
          actor.id,
          'placement.result.publish',
          { type: 'GLOBAL' },
          tx,
        ))
      )
        throw new ForbiddenException();
      const internal = await internalPlacementEnabled(tx);
      const releasedSourceIds = internal
        ? (
            await tx.$queryRaw<Array<{ sourceId: string }>>`
              SELECT DISTINCT "sourceId"::text AS "sourceId"
              FROM placement_internal_releases
              WHERE "decisionId" = ${INTERNAL_RELEASE}
            `
          ).map((r) => r.sourceId)
        : null;
      const rows = await tx.testAttempt.findMany({
        where: {
          placementSitting: { phase: 'SUBMITTED' },
          ...(releasedSourceIds ? { placementVersionId: { in: releasedSourceIds } } : {}),
        },
        select: {
          id: true,
          startedAt: true,
          submittedAt: true,
          status: true,
          learner: { select: { fullName: true } },
          placementVersion: { select: { mode: true, snapshot: true } },
          placementSitting: {
            select: {
              attemptId: true,
              phase: true,
              createdAt: true,
              deadline: true,
              policy: { select: { mode: true } },
            },
          },
          placementGraderAssignments: {
            orderBy: { number: 'desc' },
            take: 1,
            select: {
              id: true,
              number: true,
              graderId: true,
              createdAt: true,
              grader: { select: { id: true, fullName: true } },
            },
          },
          placementHumanEvaluations: {
            orderBy: [{ skill: 'asc' }, { number: 'desc' }],
            select: {
              skill: true,
              number: true,
              release: { select: { createdAt: true } },
            },
          },
        },
        orderBy: { startedAt: 'desc' },
        take: 100,
      });
      return rows.map((row) => {
        const snapshotTitle =
          (row.placementVersion?.snapshot as unknown as PlacementSnapshot | undefined)?.title ??
          null;
        const latestAssign = row.placementGraderAssignments[0] ?? null;
        const latestBySkill = new Map<string, { skill: string; published: boolean }>();
        for (const ev of row.placementHumanEvaluations) {
          if (!latestBySkill.has(ev.skill)) {
            latestBySkill.set(ev.skill, { skill: ev.skill, published: !!ev.release });
          }
        }
        return {
          id: row.id,
          startedAt: row.startedAt,
          submittedAt: row.submittedAt,
          status: row.status,
          learner: row.learner,
          sourceTitle: snapshotTitle,
          placementSitting: row.placementSitting,
          currentAssignment: latestAssign
            ? {
                id: latestAssign.id,
                graderId: latestAssign.graderId,
                graderName: latestAssign.grader.fullName,
                assignedAt: latestAssign.createdAt,
              }
            : null,
          evaluationSkills: [...latestBySkill.values()],
        };
      });
    });
  }
  review(actor: AuthorityActor, id: string) {
    return this.run(actor, async (tx) => {
      const ctx = await this.owned(tx, actor, id, true),
        u = await this.lms.context(tx, actor);
      const assignment = u.role === 'INSTRUCTOR' ? await this.assignment(tx, actor, id) : null;
      const canPublish = await this.authority.permits(
        actor.id,
        'placement.result.publish',
        { type: 'GLOBAL' },
        tx,
      );
      if (!assignment && !canPublish) await this.permit(tx, actor, 'placement.grader.assign');
      const [learner, latestGraderAssignment, evaluations] = await Promise.all([
        tx.user.findUnique({
          where: { id: ctx.a.learnerId },
          select: { fullName: true },
        }),
        tx.placementGraderAssignment.findFirst({
          where: { attemptId: id },
          orderBy: { number: 'desc' },
          include: { grader: { select: { id: true, fullName: true } } },
        }),
        assignment || canPublish
          ? tx.placementHumanEvaluation.findMany({
              where: { attemptId: id },
              include: { release: true },
              orderBy: [{ skill: 'asc' }, { number: 'desc' }],
            })
          : Promise.resolve([]),
      ]);
      const tasks = [];
      if (assignment)
        for (const g of ctx.v.s.groups.filter((g) => ['SPEAKING', 'WRITING'].includes(g.skill)))
          for (const q of g.questions) {
            const ans = ctx.a.answers.find((a) => a.testQuestionId === q.id);
            if (g.skill === 'WRITING')
              await this.readReceipt(
                tx,
                assignment.id,
                q.id,
                digest(ans?.textResponse ?? ''),
                'ORIGINAL_TEXT',
              );
            tasks.push({
              groupId: g.id,
              questionId: q.id,
              skill: g.skill,
              prompt: q.content,
              text: ans?.textResponse ?? null,
              originalAudio: !!ans?.audioStorageKey,
              recordingUrl: ans?.audioStorageKey
                ? `/api/v2/placement/workflow/attempts/${id}/recordings/${q.id}`
                : null,
            });
          }
      const swGroups = ctx.v.s.groups.filter((g) => ['SPEAKING', 'WRITING'].includes(g.skill));
      return {
        attemptId: id,
        attemptRef: id.slice(0, 8).toUpperCase(),
        learnerName: learner?.fullName ?? null,
        submittedAt: ctx.a.submittedAt,
        sourceTitle: (ctx.v.snapshot as unknown as PlacementSnapshot).title,
        mode: ctx.v.mode,
        state: ctx.s.phase,
        assignmentId: assignment?.id,
        currentAssignment: latestGraderAssignment
          ? {
              id: latestGraderAssignment.id,
              number: latestGraderAssignment.number,
              graderId: latestGraderAssignment.graderId,
              graderName: latestGraderAssignment.grader.fullName,
              assignedAt: latestGraderAssignment.createdAt,
              reason: latestGraderAssignment.reason,
            }
          : null,
        swTaskCounts: {
          speaking: swGroups
            .filter((g) => g.skill === 'SPEAKING')
            .reduce((acc, g) => acc + g.questions.length, 0),
          writing: swGroups
            .filter((g) => g.skill === 'WRITING')
            .reduce((acc, g) => acc + g.questions.length, 0),
        },
        tasks,
        evaluations,
        rubrics: await tx.placementWorkflowPolicy.findMany({
          where: { kind: 'RUBRIC', sourceId: ctx.v.id, approvedById: { not: null } },
        }),
        synthetic: !ctx.v.internalRelease,
        internalAssessment: !!ctx.v.internalRelease,
      };
    });
  }
  evaluate(actor: AuthorityActor, id: string, b: WorkflowEvaluationDto) {
    return this.run(actor, async (tx) => {
      const a = await this.assignment(tx, actor, id);
      return this.idem(tx, actor, b.idempotencyKey, 'HUMAN_FINAL', { id, b }, async () => {
        const ctx = await this.owned(tx, actor, id, true),
          rubric = await this.policy(tx, b.rubricId, 'RUBRIC', ctx.v.id),
          r = rubric.body as unknown as RubricPolicy;
        if (ctx.s.phase !== 'SUBMITTED' || !b.originalEvidenceReviewed)
          throw new ConflictException('Original evidence attestation required');
        const old = await tx.placementHumanEvaluation.findFirst({
          where: { attemptId: id, skill: b.skill },
          orderBy: { number: 'desc' },
        });
        if ((old?.number ?? 0) !== b.expectedNumber) throw stale();
        const groups = ctx.v.s.groups.filter((g) => g.skill === b.skill);
        let total = new Prisma.Decimal(0),
          max = new Prisma.Decimal(0),
          samples = 0;
        if (Object.keys(b.scores).length !== groups.length)
          throw new BadRequestException('Every task must be scored');
        for (const g of groups) {
          const criteria = r.tasks.find((t) => t.groupId === g.id)?.criteria,
            scores = b.scores[g.id];
          if (
            !criteria ||
            !Array.isArray(scores) ||
            !scores.every((x) => x && typeof x === 'object' && typeof x.code === 'string') ||
            scores.length !== criteria.length ||
            new Set(scores.map((x) => x.code)).size !== criteria.length
          )
            throw new BadRequestException('Exact approved task criteria required');
          for (const q of g.questions) {
            const ans = ctx.a.answers.find((x) => x.testQuestionId === q.id);
            let hash: string;
            if (b.skill === 'SPEAKING') {
              if (!ans?.audioStorageKey) throw new ConflictException('Original audio missing');
              hash = digest(await this.original(tx, id, q.id, ans.audioStorageKey));
            } else hash = digest(ans?.textResponse ?? '');
            if (
              !(await tx.placementEvidenceRead.findUnique({
                where: {
                  assignmentId_questionId_digest: {
                    assignmentId: a.id,
                    questionId: q.id,
                    digest: hash,
                  },
                },
              }))
            )
              throw new ConflictException('Grader must inspect original evidence');
            samples++;
          }
          for (const c of criteria) {
            const x = scores.find((x) => x.code === c.code);
            if (
              !x ||
              !Number.isFinite(x.score) ||
              x.score < 0 ||
              x.score > c.max ||
              typeof x.evidence !== 'string' ||
              x.evidence.trim().length < 10 ||
              typeof x.feedback !== 'string' ||
              x.feedback.trim().length < 10
            )
              throw new BadRequestException('Criterion bounds, evidence and feedback required');
            total = total.add(x.score);
            max = max.add(c.max);
          }
        }
        const e = await tx.placementHumanEvaluation.create({
          data: {
            attemptId: id,
            skill: b.skill,
            number: (old?.number ?? 0) + 1,
            rubricId: rubric.id,
            assignmentId: a.id,
            graderId: actor.id,
            reason: b.reason,
            body: json({
              state: 'REVIEWED_FINAL',
              scores: b.scores,
              total: total.toString(),
              max: max.toString(),
              samples,
              scale: r.scale,
              sourceHash: ctx.v.sourceHash,
              originalEvidenceReviewed: true,
            }),
          },
        });
        await this.authority.audit(
          tx,
          actor.id,
          'PLACEMENT_HUMAN_FINAL',
          'PlacementEvaluation',
          e.id,
          b.reason,
        );
        return { id: e.id, number: e.number, state: 'REVIEWED_FINAL', published: false };
      });
    });
  }
  publish(actor: AuthorityActor, id: string, b: WorkflowReasonDto) {
    return this.run(actor, async (tx) => {
      await this.permit(tx, actor, 'placement.result.publish');
      return this.idem(tx, actor, b.idempotencyKey, 'RESULT_PUBLISH', { id, b }, async () => {
        const e = await tx.placementHumanEvaluation.findUnique({ where: { id } });
        if (!e) throw missing();
        const ctx = await this.owned(tx, actor, e.attemptId, true);
        if (
          ctx.s.phase !== 'SUBMITTED' ||
          actor.id === e.graderId ||
          actor.id === ctx.a.learnerId
        )
          throw new ForbiddenException('Independent result publisher required');
        const latest = await tx.placementHumanEvaluation.findFirst({
          where: { attemptId: e.attemptId, skill: e.skill },
          orderBy: { number: 'desc' },
        });
        if (latest?.id !== id) throw stale();
        if (e.rubricId) await this.policy(tx, e.rubricId, 'RUBRIC', ctx.v.id);
        if (e.skill === 'SPEAKING')
          for (const q of ctx.v.s.groups
            .filter((g) => g.skill === 'SPEAKING')
            .flatMap((g) => g.questions)) {
            const answer = ctx.a.answers.find((a) => a.testQuestionId === q.id);
            if (!answer?.audioStorageKey) throw new ConflictException('ORIGINAL_AUDIO_MISSING');
            await this.original(tx, e.attemptId, q.id, answer.audioStorageKey);
          }
        if (e.assignmentId) {
          const current = await tx.placementGraderAssignment.findFirst({
            where: { attemptId: e.attemptId },
            orderBy: { number: 'desc' },
          });
          if (
            current?.id !== e.assignmentId ||
            !(await tx.user.findFirst({
              where: { id: e.graderId!, role: 'INSTRUCTOR', status: 'ACTIVE' },
            }))
          )
            throw new ConflictException('CURRENT_ELIGIBLE_GRADER_RECONFIRM_REQUIRED');
        }
        if ((e.body as { sourceHash?: string }).sourceHash !== ctx.v.sourceHash) throw stale();
        await tx.placementResultRelease.create({
          data: { evaluationId: id, publishedById: actor.id, reason: b.reason },
        });
        await this.authority.audit(
          tx,
          actor.id,
          'PLACEMENT_RESULT_RELEASE',
          'PlacementEvaluation',
          id,
          b.reason,
        );
        return { id, published: true, syntheticDevOnly: true };
      });
    });
  }
  private async published(tx: Tx, id: string) {
    return tx.placementHumanEvaluation.findMany({
      where: { attemptId: id, release: { isNot: null } },
      include: { release: true },
      orderBy: { number: 'desc' },
    });
  }
  private aiProviderHookForTest: AiAdvisoryProviderHook | null = null;
  private geminiAdvisoryAdapterForTest: GeminiAdvisoryAdapter | null = null;
  private static sharedGeminiAdvisoryAdapter: GeminiAdvisoryAdapter | null = null;

  setAiAdvisoryProviderHookForTest(hook: AiAdvisoryProviderHook | null) {
    this.aiProviderHookForTest = hook;
  }
  setGeminiAdvisoryAdapterForTest(adapter: GeminiAdvisoryAdapter | null) {
    this.geminiAdvisoryAdapterForTest = adapter;
  }
  public static setSharedGeminiAdvisoryAdapterForTest(adapter: GeminiAdvisoryAdapter | null) {
    PlacementWorkflowService.configureSharedGeminiAdvisoryAdapter(adapter);
  }
  public static configureSharedGeminiAdvisoryAdapter(adapter: GeminiAdvisoryAdapter | null) {
    PlacementWorkflowService.sharedGeminiAdvisoryAdapter = adapter;
  }
  public static resetSharedAdapter() {
    PlacementWorkflowService.sharedGeminiAdvisoryAdapter = null;
  }
  private resolveEffectiveAiProviderHook(): AiAdvisoryProviderHook | null {
    if (this.aiProviderHookForTest) {
      return this.aiProviderHookForTest;
    }
    if (this.geminiAdvisoryAdapterForTest) {
      return this.geminiAdvisoryAdapterForTest.createHook();
    }
    const provider = (process.env.PLACEMENT_AI_ADVISORY_PROVIDER || 'NONE').toUpperCase();
    if (provider === 'GEMINI') {
      if (!PlacementWorkflowService.sharedGeminiAdvisoryAdapter) {
        PlacementWorkflowService.sharedGeminiAdvisoryAdapter =
          GeminiAdvisoryAdapter.getSharedInstance();
      }
      return PlacementWorkflowService.sharedGeminiAdvisoryAdapter.createHook();
    }
    return null;
  }
  async diagnostic(actor: AuthorityActor, id: string, requestAdvisory = true) {
    const { advisoryInput, ...result } = await this.run(actor, async (tx) => {
      const ctx = await this.owned(tx, actor, id),
        all = await this.published(tx, id),
        latest = (skill: string) => all.find((e) => e.skill === skill),
        lr =
          latest('LR') ??
          (ctx.v.internalRelease && ctx.s.phase === 'SUBMITTED'
            ? await tx.placementHumanEvaluation.findFirst({
                where: { attemptId: id, skill: 'LR' },
                orderBy: { number: 'desc' },
              })
            : null),
        s = latest('SPEAKING'),
        w = latest('WRITING'),
        full = !!lr && (ctx.v.mode === 'LR' || (!!s && !!w));
      const rawStoredParts = lr ? (lr.body as { parts: ReturnType<typeof rawParts> }).parts : [];
      const partBuckets = new Map<
        string,
        { skill: string; part: string | null; samples: number; correct: number }
      >();
      for (const p of rawStoredParts) {
        const canonicalPart = p.part ? normalizeCanonicalPartCode(p.part, p.skill) : null;
        const keyName = `${p.skill}:${canonicalPart ?? ''}`;
        const cur = partBuckets.get(keyName) ?? {
          skill: p.skill,
          part: canonicalPart,
          samples: 0,
          correct: 0,
        };
        cur.samples += p.samples;
        cur.correct += p.correct;
        partBuckets.set(keyName, cur);
      }
      const parts = [...partBuckets.values()];
      const skills = [
        'LISTENING',
        'READING',
        ...(ctx.v.mode === 'FOUR_SKILLS' ? ['SPEAKING', 'WRITING'] : []),
      ].map((skill) => {
        if (skill === 'LISTENING' || skill === 'READING') {
          const items = parts.filter((p) => p.skill === skill);
          return {
            skill,
            status: lr ? 'PUBLISHED' : 'PENDING_REVIEW',
            value: lr ? items.reduce((a, p) => a + p.correct, 0) : null,
            samples: lr ? items.reduce((a, p) => a + p.samples, 0) : null,
            scale: 'INTERNAL_RAW_COUNT',
          };
        }
        const e = skill === 'SPEAKING' ? s : w,
          b = e?.body as { total: number; samples: number; scale: string } | undefined;
        return {
          skill,
          status: e ? 'PUBLISHED' : 'PENDING_REVIEW',
          value: b ? Number(b.total) : null,
          samples: b?.samples ?? null,
          scale: b?.scale ?? null,
        };
      });

      const dbTestQuestions = await tx.testQuestion.findMany({
        where: { testId: ctx.v.testId },
        select: {
          id: true,
          question: {
            select: {
              difficulty: true,
              skills: { select: { skill: { select: { code: true } } } },
            },
          },
          knowledgeLinks: {
            where: { state: 'PUBLISHED', withdrawnAt: null },
            select: {
              tagRevision: { select: { entry: { select: { tagCode: true } } } },
              articleRevision: {
                select: { entry: { select: { slug: true, visibility: true, withdrawnAt: true } } },
              },
            },
          },
        },
      });
      const dbQuestionMeta: DbQuestionMetadataMap = {};
      for (const tq of dbTestQuestions) {
        const tagFromLink = tq.knowledgeLinks.find((l) => l.tagRevision.entry.tagCode)?.tagRevision
          .entry.tagCode;
        const tagFromSkill = tq.question.skills[0]?.skill.code;
        const linkedSlugs = tq.knowledgeLinks
          .filter(
            (l) =>
              ['LIVE', 'PUBLISHED'].includes(l.articleRevision.entry.visibility) &&
              l.articleRevision.entry.withdrawnAt === null,
          )
          .map((l) => l.articleRevision.entry.slug);
        dbQuestionMeta[tq.id] = {
          topicTag: tagFromLink ?? tagFromSkill ?? null,
          difficulty: tq.question.difficulty,
          linkedArticleSlugs: linkedSlugs,
        };
      }

      const diagnosis = buildPlacementStructuredDiagnosis({
        snapshot: ctx.v.s,
        sourceDigest: ctx.v.sourceHash,
        answers: ctx.a.answers,
        lrPublished: !!lr,
        speakingEvaluation: s ? { body: s.body as Record<string, unknown> } : null,
        writingEvaluation: w ? { body: w.body as Record<string, unknown> } : null,
        dbQuestionMeta,
        minSamplesThreshold: 3,
      });

      const evidencePool = [
        ...skills,
        ...parts.map((p) => ({
          skill: p.skill,
          part: p.part ?? undefined,
          value: p.correct,
          samples: p.samples,
          scale: 'INTERNAL_RAW_COUNT',
        })),
        ...diagnosis.knowledgeBreakdown
          .filter((k) => k.domainCode !== 'UNCLASSIFIED')
          .map((k) => ({
            skill: k.skill,
            domainCode: k.domainCode,
            value: k.correct,
            samples: k.samples,
            scale: 'INTERNAL_RAW_COUNT',
          })),
      ];

      const matching = full
        ? await this.match(tx, ctx.v.mode, evidencePool, ctx.now)
        : {
            status: 'INSUFFICIENT',
            reasons: ['PUBLISHED_ALL_REQUIRED_SKILLS_MISSING'],
            classes: [],
          };

      const recommendation = await this.buildDetailedRecommendation(
        tx,
        ctx.v.mode,
        full,
        !!lr,
        evidencePool,
        matching,
        ctx.now,
        diagnosis,
        {
          goalLR: ctx.a.placementGoalScore,
          goalSpeaking: ctx.a.placementGoalSpeaking,
          goalWriting: ctx.a.placementGoalWriting,
        },
      );

      const publishedArticles = await tx.knowledgeEntry.findMany({
        where: {
          kind: 'ARTICLE',
          visibility: { in: ['LIVE', 'PUBLISHED'] },
          withdrawnAt: null,
          publishedRevisionId: { not: null },
        },
        include: { publishedRevision: true },
      });
      const allowlistedArticles = publishedArticles
        .filter((e) => !!e.publishedRevision)
        .map((e) => ({
          slug: e.slug,
          revisionId: e.publishedRevisionId!,
          title: e.publishedRevision!.title,
          skills: e.publishedRevision!.skills,
          part: e.publishedRevision!.part,
        }));

      const selfStudyGuidance = buildSelfStudyGuidance({
        diagnosis,
        allowlistedArticles,
      });

      const allowlistedPaths = allowlistedArticles.map(
        (a) => `/knowledge/articles/${encodeURIComponent(a.slug)}`,
      );
      const advisoryInput = {
        attemptId: id,
        diagnosis,
        recommendation,
        selfStudyGuidance,
        allowlistedPaths,
        learnerTextSamples: [],
      };

      return {
        attemptId: id,
        attemptRef: id.slice(0, 8).toUpperCase(),
        mode: ctx.v.mode,
        state: full ? 'PUBLISHED' : lr ? 'PARTIAL' : 'PENDING_REVIEW',
        label:
          ctx.v.internalRelease && full
            ? 'Kết quả kiểm tra đầu vào nội bộ Smart English'
            : full
              ? 'Kết quả đánh giá năng lực đầu vào đã công bố'
              : lr
                ? 'Kết quả Nghe – Đọc sơ bộ — Đang chờ chấm Nói/Viết'
                : 'ĐANG CHẤM — Chờ công bố kết quả',
        privateDev: true,
        internalAssessment: !!ctx.v.internalRelease,
        sourceVersion: ctx.v.version,
        goals: {
          goalLR: ctx.a.placementGoalScore,
          goalSpeaking: ctx.a.placementGoalSpeaking,
          goalWriting: ctx.a.placementGoalWriting,
        },
        skillResults: skills,
        parts,
        officialToeicScore: null,
        fourSkillsTotal: null,
        matching: { ...matching, asOf: ctx.now.toISOString() },
        diagnosis,
        recommendation,
        selfStudyGuidance,
        advisoryInput,
      };
    });
    // The provider deadline must never hold the workflow transaction/global DB lock.
    const effectiveHook = this.resolveEffectiveAiProviderHook();
    const aiAdvisory = await generatePlacementAiAdvisory({
      ...advisoryInput,
      timeoutMs:
        Math.min(
          30000,
          Math.max(1000, Number(process.env.PLACEMENT_AI_ADVISORY_TIMEOUT_MS) || 4500),
        ) + 500,
      providerHook: requestAdvisory ? effectiveHook : null,
    });
    return { ...result, aiAdvisory, aiProviderReady: !!effectiveHook };
  }
  private async match(
    tx: Tx,
    mode: 'LR' | 'FOUR_SKILLS',
    skills: {
      skill: string;
      part?: string;
      domainCode?: string;
      scale: string | null;
      value: number | null;
      samples: number | null;
    }[],
    now: Date,
  ) {
    const p = await tx.placementWorkflowPolicy.findFirst({
      where: { kind: 'CRITERIA', mode, approvedById: { not: null } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    if (!p) return { status: 'INSUFFICIENT', reasons: ['APPROVED_CRITERIA_MISSING'], classes: [] };
    if (p.digest !== quizDigest(p.body) || !p.approvedAt)
      return {
        status: 'INSUFFICIENT',
        reasons: ['CRITERIA_INTEGRITY_REVIEW_REQUIRED'],
        classes: [],
      };
    const rules = (p.body as unknown as CriteriaPolicy).rules;
    const evidenceFor = (r: CriteriaPolicy['rules'][number]) =>
      skills.find(
        (s) =>
          s.skill === r.skill &&
          (r.part ?? undefined) === (s.part ?? undefined) &&
          (r.domainCode ?? undefined) === (s.domainCode ?? undefined) &&
          s.scale === r.scale,
      );
    if (
      rules.every((r) => {
        const s = evidenceFor(r);
        return !s || s.value === null || s.samples === null || s.samples < r.minSamples;
      })
    )
      return { status: 'INSUFFICIENT', reasons: ['MINIMUM_SAMPLE_OR_SKILL_MISSING'], classes: [] };
    const candidates = await tx.classOffering.findMany({
      where: {
        status: 'OPEN',
        course: { isPublished: true },
        version: { state: 'PUBLISHED', effectiveFrom: { lte: now } },
        versionId: { in: [...new Set(rules.flatMap((r) => r.courseVersionIds))] },
        termsApprovedAt: { not: null },
        classStart: { gt: now },
        enrollmentStart: { lte: now },
        enrollmentEnd: { gt: now },
      },
      include: {
        version: true,
        enrollments: {
          where: {
            OR: [
              { status: 'ACTIVE' },
              {
                status: 'PENDING_PAYMENT',
                OR: [{ reservedUntil: null }, { reservedUntil: { gt: now } }],
              },
            ],
          },
        },
        datedSessions: {
          where: { state: { in: ['PUBLISHED', 'SUPERSEDED'] } },
          include: { room: true, instructor: true, assignment: true, sourceTemplate: true },
        },
      },
    });
    const allCourseVersionIds = [...new Set(rules.flatMap((r) => r.courseVersionIds))];
    const academicallyEligibleVersionIds = new Set(
      allCourseVersionIds.filter((vid) => {
        const relevant = rules.filter((r) => r.courseVersionIds.includes(vid));
        return (
          relevant.length > 0 &&
          relevant.every((r) => {
            const s = evidenceFor(r);
            return (
              !!s &&
              s.value !== null &&
              s.samples !== null &&
              s.samples >= r.minSamples &&
              s.value >= r.min &&
              s.value <= r.max
            );
          })
        );
      }),
    );
    const classes = [];
    const allReasons = new Set<string>();
    const eligibleCourseOperationalReasons = new Set<string>();
    for (const c of candidates) {
      const relevant = rules.filter((r) => r.courseVersionIds.includes(c.versionId!));
      if (
        relevant.some((r) => {
          const s = evidenceFor(r);
          return !s || s.value === null || s.samples === null || s.samples < r.minSamples;
        })
      ) {
        allReasons.add('MINIMUM_SAMPLE_OR_SKILL_MISSING');
        continue;
      }
      if (
        !relevant.every((r) => {
          const s = evidenceFor(r)!;
          return s.value! >= r.min && s.value! <= r.max;
        })
      ) {
        allReasons.add('APPROVED_INTERNAL_RULE_NOT_MET');
        continue;
      }
      if (!c.maxStudents || c.maxStudents <= c.enrollments.length) {
        allReasons.add('CLASS_FULL_OR_CAPACITY_UNVERIFIED');
        eligibleCourseOperationalReasons.add('CLASS_FULL_OR_CAPACITY_UNVERIFIED');
        continue;
      }
      const sessions = c.datedSessions.filter(
        (s) =>
          s.state === 'PUBLISHED' &&
          s.intent === 'PUBLISH' &&
          s.startsAt > now &&
          !c.datedSessions.some((n) => n.supersedesId === s.id && n.state === 'PUBLISHED'),
      );
      if (
        !sessions.length ||
        !c.totalSessions ||
        sessions.length < c.totalSessions ||
        sessions.some(
          (s) =>
            (s.modality !== 'ONLINE' &&
              (!s.room ||
                s.room.status !== 'ACTIVE' ||
                s.room.capacity < c.maxStudents! ||
                !s.requiredCapabilities.every((cap) => s.room!.capabilities.includes(cap)))) ||
            false ||
            s.instructor?.status !== 'ACTIVE' ||
            s.instructor?.role !== 'INSTRUCTOR' ||
            !s.assignment ||
            !['PUBLISHED', 'SUPERSEDED'].includes(s.assignment.state) ||
            s.assignment.effectiveFrom > s.startsAt ||
            s.assignment.reservedUntil < s.endsAt,
        )
      ) {
        allReasons.add('APPROVED_ACTUAL_SCHEDULE_INCOMPLETE');
        eligibleCourseOperationalReasons.add('APPROVED_ACTUAL_SCHEDULE_INCOMPLETE');
        continue;
      }
      if (mode === 'FOUR_SKILLS' && c.termsSkillScope !== 'FOUR_SKILLS') {
        allReasons.add('PROGRAM_SKILL_SCOPE_MISMATCH');
        eligibleCourseOperationalReasons.add('PROGRAM_SKILL_SCOPE_MISMATCH');
        continue;
      }
      if (mode === 'LR' && !['LR', 'LISTENING', 'READING'].includes(c.termsSkillScope ?? '')) {
        allReasons.add('PROGRAM_SKILL_SCOPE_MISMATCH');
        eligibleCourseOperationalReasons.add('PROGRAM_SKILL_SCOPE_MISMATCH');
        continue;
      }
      classes.push({
        id: c.id,
        name: c.name,
        code: c.code,
        courseVersionId: c.versionId,
        availableSeats: c.maxStudents - c.enrollments.length,
        asOf: now.toISOString(),
        schedule: sessions.map((s) => ({
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt.toISOString(),
          modality: s.modality,
        })),
        rationale: relevant.map(
          (r) =>
            `${r.domainCode ?? r.part ?? r.skill}: ${evidenceFor(r)!.value} trong thang nội bộ [${r.min}, ${r.max}], đủ ${r.minSamples} mẫu; chương trình ${c.version!.title}.`,
        ),
        seatGuaranteed: false,
      });
    }
    if (!candidates.length) allReasons.add('NO_ELIGIBLE_ACTUAL_CLASS');
    const scopedReasons =
      classes.length > 0
        ? []
        : academicallyEligibleVersionIds.size > 0
          ? eligibleCourseOperationalReasons.size > 0
            ? [...eligibleCourseOperationalReasons]
            : ['NO_ELIGIBLE_ACTUAL_CLASS']
          : allReasons.size > 0
            ? [...allReasons]
            : ['APPROVED_INTERNAL_RULE_NOT_MET'];
    return {
      status: classes.length ? 'MATCHED' : 'NO_ELIGIBLE_CLASS',
      criteriaId: p.id,
      reasons: scopedReasons,
      classes,
    };
  }
  private async buildDetailedRecommendation(
    tx: Tx,
    mode: 'LR' | 'FOUR_SKILLS',
    full: boolean,
    lrPublished: boolean,
    skills: {
      skill: string;
      part?: string;
      domainCode?: string;
      scale: string | null;
      value: number | null;
      samples: number | null;
    }[],
    matching: {
      status: string;
      criteriaId?: string;
      reasons: string[];
      classes: {
        id: string;
        name: string;
        code?: string;
        courseVersionId?: string | null;
        availableSeats: number;
        schedule?: { startsAt: string; endsAt: string; modality: string }[];
        rationale: string[];
      }[];
    },
    now: Date,
    diagnosis?: PlacementStructuredDiagnosis,
    goals?: { goalLR: number | null; goalSpeaking: number | null; goalWriting: number | null },
  ): Promise<PlacementStructuredRecommendation> {
    if (!lrPublished) {
      return {
        recommendationVersion: 'WAVE05_REC_V1',
        policyId: null,
        policyDigestRef: null,
        evaluatedAt: now.toISOString(),
        overallStatus: 'AWAITING_FINAL_SCORING',
        overallStatusLabelVi: 'Đang chờ công bố điểm',
        overallSummaryVi:
          'Hệ thống sẽ gợi ý chương trình và lớp học phù hợp ngay sau khi có kết quả chính thức.',
        courseEvaluations: [],
        availableClasses: [],
        unavailableClasses: [],
      };
    }

    const p = await tx.placementWorkflowPolicy.findFirst({
      where: {
        kind: 'CRITERIA',
        mode: full ? mode : { in: [mode, 'LR'] },
        approvedById: { not: null },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    if (!p || p.digest !== quizDigest(p.body) || !p.approvedAt) {
      return {
        recommendationVersion: 'WAVE05_REC_V1',
        policyId: p?.id ?? null,
        policyDigestRef: p?.digest.slice(0, 16) ?? null,
        evaluatedAt: now.toISOString(),
        overallStatus: !full ? 'LR_ONLY_PRELIMINARY' : 'CRITERIA_UNAVAILABLE',
        overallStatusLabelVi: !full
          ? 'Đang chờ chấm Speaking/Writing — Chưa chốt lớp 4 kỹ năng'
          : 'Chưa có bộ tiêu chí xếp lớp được duyệt cho chế độ này',
        overallSummaryVi: !full
          ? 'Bài kiểm tra 4 kỹ năng đã có kết quả Nghe – Đọc; sau khi giảng viên chấm xong Nói và Viết, hệ thống sẽ gợi ý lớp 4 kỹ năng phù hợp.'
          : 'Hiện Học vụ đang cập nhật điều kiện xếp lớp cho bài kiểm tra này.',
        courseEvaluations: [],
        availableClasses: [],
        unavailableClasses: [],
      };
    }

    const rules = (p.body as unknown as CriteriaPolicy).rules;
    const evidenceFor = (r: CriteriaPolicy['rules'][number]) =>
      skills.find(
        (s) =>
          s.skill === r.skill &&
          (r.part ?? undefined) === (s.part ?? undefined) &&
          (r.domainCode ?? undefined) === (s.domainCode ?? undefined) &&
          s.scale === r.scale,
      );

    const versionIds = [...new Set(rules.flatMap((r) => r.courseVersionIds))];
    const versions = await tx.courseVersion.findMany({
      where: { id: { in: versionIds } },
      include: {
        course: true,
        offerings: {
          include: {
            enrollments: {
          where: {
            OR: [
              { status: 'ACTIVE' },
              {
                status: 'PENDING_PAYMENT',
                OR: [{ reservedUntil: null }, { reservedUntil: { gt: now } }],
              },
            ],
          },
        },
            scheduleSlots: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    const matchedClassMap = new Map(matching.classes.map((c) => [c.id, c]));
    const courseEvaluations: CourseRecommendationEvaluation[] = [];
    const availableClasses: ClassAvailabilityEvaluation[] = [];
    const unavailableClasses: ClassAvailabilityEvaluation[] = [];

    for (const v of versions) {
      const relevant = rules.filter((r) => r.courseVersionIds.includes(v.id));
      const priorityRank = Math.min(
        ...relevant.map((r) => (typeof r.priorityRank === 'number' ? r.priorityRank : 100)),
      );
      const ruleTraces: CourseRuleTraceItem[] = relevant.map((r) => {
        const ev = evidenceFor(r);
        const metricLabel = r.domainCode
          ? (KNOWLEDGE_DOMAIN_CATALOG[r.domainCode as keyof typeof KNOWLEDGE_DOMAIN_CATALOG]
              ?.titleVi ?? r.domainCode)
          : r.part
            ? `${r.skill} · ${r.part}`
            : r.skill;
        const isRubricScale =
          r.scale === 'INTERNAL_0_100_DRAFT_RUBRIC' ||
          r.skill === 'SPEAKING' ||
          r.skill === 'WRITING';
        const sampleUnit = isRubricScale ? 'nhiệm vụ' : 'câu';
        const thresholdUnit = isRubricScale ? 'điểm' : 'câu';
        const sufficientSample =
          !!ev && ev.value !== null && ev.samples !== null && ev.samples >= r.minSamples;
        const matched = sufficientSample && ev!.value! >= r.min && ev!.value! <= r.max;
        const traceTextVi =
          !ev || ev.value === null || ev.samples === null
            ? `${metricLabel}: Đang chờ có điểm chính thức (yêu cầu tối thiểu ${r.minSamples} ${sampleUnit}).`
            : ev.samples < r.minSamples
              ? `${metricLabel}: Mới có ${ev.samples} ${sampleUnit} (cần ít nhất ${r.minSamples} ${sampleUnit}) nên chưa đủ cơ sở gợi ý.`
              : matched
                ? isRubricScale
                  ? `${metricLabel}: Đạt ${ev.value} điểm (${ev.samples} ${sampleUnit}) — đạt yêu cầu đầu vào của lớp (${r.min}–${r.max} ${thresholdUnit}).`
                  : `${metricLabel}: Đúng ${ev.value}/${ev.samples} câu — đạt yêu cầu đầu vào của lớp (${r.min}–${r.max} câu).`
                : isRubricScale
                  ? `${metricLabel}: Đạt ${ev.value} điểm (${ev.samples} ${sampleUnit}) — chưa nằm trong mức yêu cầu của lớp (${r.min}–${r.max} ${thresholdUnit}).`
                  : `${metricLabel}: Đúng ${ev.value}/${ev.samples} câu — chưa nằm trong mức yêu cầu của lớp (${r.min}–${r.max} câu).`;
        return {
          skill: r.skill,
          part: r.part ?? null,
          domainCode: r.domainCode ?? null,
          observedValue: ev?.value ?? null,
          observedSamples: ev?.samples ?? null,
          requiredMin: r.min,
          requiredMax: r.max,
          requiredMinSamples: r.minSamples,
          scale: r.scale,
          matched,
          traceTextVi,
        };
      });

      const hasLowSample = ruleTraces.some(
        (t) => t.observedSamples !== null && t.observedSamples < t.requiredMinSamples,
      );
      const allRulesMatched = ruleTraces.length > 0 && ruleTraces.every((t) => t.matched);

      const matchedDiagnosisPointsVi: string[] = [];
      if (diagnosis) {
        const ov = diagnosis.overallSummary;
        const weakParts = (diagnosis.partBreakdown ?? []).filter(
          (p) => p.answered > 0 && (p.answeredAccuracyPct ?? p.accuracyPct ?? 0) < 70,
        );
        const courseText = `${v.title} ${v.description ?? ''}`.toLowerCase();
        const isReadingCourse =
          courseText.includes('reading') ||
          courseText.includes('đọc hiểu') ||
          courseText.includes('ngữ pháp');
        const isListeningCourse =
          courseText.includes('listening') || courseText.includes('nghe hiểu');
        const weakReadParts = weakParts.filter((p) => p.skill === 'READING');
        const weakListenParts = weakParts.filter((p) => p.skill === 'LISTENING');

        if (ov.listeningCorrect != null && ov.readingCorrect != null) {
          matchedDiagnosisPointsVi.push(
            `Khớp trình độ hiện tại (Nghe ${ov.listeningCorrect}/${ov.listeningSamples} · Đọc ${ov.readingCorrect}/${ov.readingSamples}) với lộ trình cấp độ ${v.level}.`,
          );
        }
        if (isReadingCourse && isListeningCourse && weakParts.length > 0) {
          matchedDiagnosisPointsVi.push(
            `Khóa học luyện song song cả Nghe & Đọc, trúng các phần bài làm còn yếu (${weakParts.map((p) => `${p.part} ${p.answeredAccuracyPct ?? p.accuracyPct}%`).join(', ')}).`,
          );
        } else if (isReadingCourse && weakReadParts.length > 0) {
          matchedDiagnosisPointsVi.push(
            `Nội dung chuyên sâu Ngữ pháp & Đọc hiểu của lớp bám sát các phần bạn hay sai ở mục nhận xét (${weakReadParts.map((p) => `${p.part} đúng ${p.correct}/${p.answered}`).join(', ')}).`,
          );
        } else if (isListeningCourse && weakListenParts.length > 0) {
          matchedDiagnosisPointsVi.push(
            `Nội dung phản xạ Nghe của lớp xử lý trực tiếp phần Nghe bạn đang mất điểm (${weakListenParts.map((p) => `${p.part} đúng ${p.correct}/${p.answered}`).join(', ')}).`,
          );
        } else if (diagnosis.improvements.length > 0) {
          matchedDiagnosisPointsVi.push(
            `Hỗ trợ khắc phục trực tiếp trọng tâm yếu từ nhận xét: ${diagnosis.improvements
              .slice(0, 2)
              .map((i) => i.titleVi)
              .join('; ')}.`,
          );
        }
        if (goals?.goalLR) {
          matchedDiagnosisPointsVi.push(
            `Định hướng nâng nền tảng hiện tại hướng tới mục tiêu bạn đặt ra (LR ${goals.goalLR}).`,
          );
        }
      }

      let openClassCount = 0;
      let unavailableClassCount = 0;

      if (allRulesMatched && full) {
        for (const off of v.offerings) {
          const enrolledCount = off.enrollments.length;
          const remaining = off.maxStudents ? Math.max(off.maxStudents - enrolledCount, 0) : 0;
          const matchedOpen = matchedClassMap.get(off.id);
          const modalityVi = (m: string) =>
            m === 'ONLINE'
              ? 'Trực tuyến'
              : m === 'OFFLINE'
                ? 'Trực tiếp tại trung tâm'
                : m === 'HYBRID'
                  ? 'Kết hợp'
                  : m;
          const scheduleSummaryVi = matchedOpen?.schedule?.length
            ? matchedOpen.schedule.map(
                (s) =>
                  `${new Intl.DateTimeFormat('vi-VN', {
                    timeZone: 'Asia/Ho_Chi_Minh',
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }).format(new Date(s.startsAt))} (${modalityVi(s.modality)})`,
              )
            : off.scheduleSlots.map(
                (slot) => `Thứ ${slot.dayOfWeek} · ${slot.locationText ?? modalityVi(off.modality)}`,
              );

          if (matchedOpen) {
            openClassCount += 1;
            availableClasses.push({
              classId: off.id,
              classCode: off.code,
              className: off.name,
              courseVersionId: v.id,
              courseTitle: v.title,
              courseSlug: v.course.slug,
              courseLevel: v.level,
              courseSkillScope: v.skillScope,
              courseDescription: v.description ?? null,
              matchedDiagnosisPointsVi,
              modality: off.modality,
              pricingType: off.pricingType,
              tuitionFeeVnd: off.approvedTuitionFeeVnd ?? off.tuitionFeeVnd,
              maxStudents: off.maxStudents,
              enrolledCount,
              availableSeats: matchedOpen.availableSeats,
              availabilityStatus: 'AVAILABLE_NOW',
              availabilityBadgeVi: `Đang mở đăng ký — Còn ${matchedOpen.availableSeats} chỗ`,
              scheduleSummaryVi,
              fitReasonsVi: ruleTraces.map((t) => t.traceTextVi),
              unavailabilityReasonCode: null,
              unavailabilityReasonVi: null,
            });
          } else {
            unavailableClassCount += 1;
            const isFull = !!off.maxStudents && enrolledCount >= off.maxStudents;
            const isClosedWindow =
              off.status !== 'OPEN' || (!!off.enrollmentEnd && off.enrollmentEnd <= now);
            const reasonCode = isFull
              ? 'CLASS_FULL_OR_CAPACITY_UNVERIFIED'
              : isClosedWindow
                ? 'ENROLLMENT_WINDOW_CLOSED'
                : 'APPROVED_ACTUAL_SCHEDULE_INCOMPLETE';
            const reasonVi = isFull
              ? `Lớp đã đủ sĩ số (${enrolledCount}/${off.maxStudents} học viên) — Không còn chỗ trống; có thể đăng ký danh sách chờ hoặc nhận tư vấn lịch khai giảng mới.`
              : isClosedWindow
                ? 'Đã hết thời hạn nhận hồ sơ hoặc lớp đã chuyển sang giai đoạn đang học.'
                : 'Lịch học chi tiết, phòng học hoặc phân công giảng viên đang chờ Học vụ phê duyệt hoàn tất.';
            unavailableClasses.push({
              classId: off.id,
              classCode: off.code,
              className: off.name,
              courseVersionId: v.id,
              courseTitle: v.title,
              courseSlug: v.course.slug,
              courseLevel: v.level,
              courseSkillScope: v.skillScope,
              courseDescription: v.description ?? null,
              matchedDiagnosisPointsVi,
              modality: off.modality,
              pricingType: off.pricingType,
              tuitionFeeVnd: off.approvedTuitionFeeVnd ?? off.tuitionFeeVnd,
              maxStudents: off.maxStudents,
              enrolledCount,
              availableSeats: remaining,
              availabilityStatus: isFull
                ? 'WAITLIST_OR_FULL'
                : isClosedWindow
                  ? 'ENROLLMENT_CLOSED'
                  : 'SCHEDULE_INCOMPLETE',
              availabilityBadgeVi: isFull
                ? 'Hết chỗ (Danh sách chờ)'
                : isClosedWindow
                  ? 'Đã đóng nhận hồ sơ'
                  : 'Đang hoàn thiện lịch học',
              scheduleSummaryVi,
              fitReasonsVi: ruleTraces.map((t) => t.traceTextVi),
              unavailabilityReasonCode: reasonCode,
              unavailabilityReasonVi: reasonVi,
            });
          }
        }
      }

      let status: CourseRecommendationEvaluation['status'];
      let statusBadgeVi: string;
      if (!full) {
        status = 'LR_ONLY_PRELIMINARY';
        statusBadgeVi = 'Sơ bộ theo Nghe – Đọc (Chờ điểm Nói/Viết)';
      } else if (hasLowSample) {
        status = 'INSUFFICIENT_EVIDENCE';
        statusBadgeVi = 'Chưa làm đủ số câu để đánh giá';
      } else if (allRulesMatched && openClassCount > 0) {
        status = 'RECOMMENDED_PRIORITY';
        statusBadgeVi = 'Phù hợp kết quả & Đang mở nhận học viên';
      } else if (allRulesMatched && openClassCount === 0) {
        status = 'ELIGIBLE_NO_OPEN_CLASS';
        statusBadgeVi = 'Phù hợp kết quả — Hiện các lớp đã đủ chỗ';
      } else {
        status = 'NOT_ELIGIBLE';
        statusBadgeVi = 'Chưa khớp mức điểm của chương trình này';
      }

      const fitSummaryVi = allRulesMatched
        ? `Đáp ứng đầy đủ ${ruleTraces.length}/${ruleTraces.length} điều kiện đầu vào của khóa "${v.title}".`
        : `Chưa đạt ${ruleTraces.filter((t) => !t.matched).length}/${ruleTraces.length} điều kiện đầu vào của khóa "${v.title}".`;

      courseEvaluations.push({
        courseVersionId: v.id,
        courseId: v.courseId,
        courseTitle: v.title,
        courseSlug: v.course.slug,
        level: v.level,
        skillScope: v.skillScope,
        courseDescription: v.description ?? null,
        matchedDiagnosisPointsVi,
        status,
        statusBadgeVi,
        priorityRank,
        fitSummaryVi,
        ruleTraces,
        openClassCount,
        unavailableClassCount,
      });
    }

    courseEvaluations.sort((a, b) => {
      const order = {
        RECOMMENDED_PRIORITY: 1,
        ELIGIBLE_ALTERNATIVE: 2,
        ELIGIBLE_NO_OPEN_CLASS: 3,
        LR_ONLY_PRELIMINARY: 4,
        AWAITING_FINAL_SCORING: 5,
        INSUFFICIENT_EVIDENCE: 6,
        NOT_ELIGIBLE: 7,
      };
      return order[a.status] - order[b.status] || a.priorityRank - b.priorityRank;
    });

    const eligibleRanked = courseEvaluations.filter((c) => c.status === 'RECOMMENDED_PRIORITY');
    if (eligibleRanked.length > 1) {
      for (let i = 1; i < eligibleRanked.length; i += 1) {
        eligibleRanked[i].status = 'ELIGIBLE_ALTERNATIVE';
        eligibleRanked[i].statusBadgeVi = 'Lựa chọn phù hợp bổ sung';
      }
    }

    let overallStatus: PlacementStructuredRecommendation['overallStatus'];
    let overallStatusLabelVi: string;
    let overallSummaryVi: string;

    if (!full) {
      overallStatus = 'LR_ONLY_PRELIMINARY';
      overallStatusLabelVi = 'Đang chờ hoàn tất chấm Nói/Viết';
      overallSummaryVi =
        'Kết quả Nghe – Đọc đã được ghi nhận; vui lòng chờ giảng viên chấm xong Nói và Viết để hệ thống chốt lớp 4 kỹ năng phù hợp nhất.';
    } else if (availableClasses.length > 0) {
      overallStatus = 'MATCHED_OPEN_CLASS';
      overallStatusLabelVi = `Đã tìm thấy ${availableClasses.length} lớp đang mở phù hợp`;
      overallSummaryVi = `Dựa vào kết quả bài làm và lịch khai giảng hiện có, hệ thống tìm thấy ${availableClasses.length} lớp đang còn chỗ phù hợp nhất với trình độ của bạn.`;
    } else if (courseEvaluations.some((c) => c.status === 'ELIGIBLE_NO_OPEN_CLASS')) {
      overallStatus = 'ELIGIBLE_COURSE_NO_OPEN_CLASS';
      overallStatusLabelVi = 'Đủ điều kiện chương trình nhưng hiện chưa có lớp còn chỗ';
      overallSummaryVi =
        'Kết quả của bạn phù hợp với chương trình mục tiêu, nhưng các lớp hiện tại đã đủ sĩ số hoặc hết hạn đăng ký. Bạn có thể đăng ký danh sách chờ hoặc nhận tư vấn lịch khai giảng mới.';
    } else if (courseEvaluations.some((c) => c.status === 'INSUFFICIENT_EVIDENCE')) {
      overallStatus = 'INSUFFICIENT_EVIDENCE';
      overallStatusLabelVi = 'Chưa đủ dữ liệu để kết luận';
      overallSummaryVi =
        'Số câu đã làm chưa đủ nhiều nên hệ thống chưa tự động gợi ý lớp. Bạn có thể liên hệ cố vấn học tập để được hỗ trợ.';
    } else {
      overallStatus = 'NO_MATCHING_COURSE';
      overallStatusLabelVi = 'Chưa tìm được chương trình đáp ứng tất cả tiêu chí hiện tại';
      overallSummaryVi =
        'Kết quả hiện tại chưa khớp với các lớp đang mở; vui lòng liên hệ cố vấn học tập để được tư vấn lộ trình học phù hợp.';
    }

    return {
      recommendationVersion: 'WAVE05_REC_V1',
      policyId: p.id,
      policyDigestRef: p.digest.slice(0, 16),
      evaluatedAt: now.toISOString(),
      overallStatus,
      overallStatusLabelVi,
      overallSummaryVi,
      courseEvaluations,
      availableClasses,
      unavailableClasses,
    };
  }
  async recording(actor: AuthorityActor, id: string, qid: string) {
    return this.run(actor, async (tx) => {
      const a = await this.assignment(tx, actor, id),
        ctx = await this.owned(tx, actor, id, true),
        q = ctx.v.s.groups
          .filter((g) => g.skill === 'SPEAKING')
          .flatMap((g) => g.questions)
          .find((q) => q.id === qid),
        answer = ctx.a.answers.find((a) => a.testQuestionId === qid);
      if (!q || !answer?.audioStorageKey) throw missing();
      const body = await this.original(tx, id, qid, answer.audioStorageKey),
        hash = digest(body);
      await this.readReceipt(tx, a.id, qid, hash, 'ORIGINAL_AUDIO');
      return {
        body,
        sha256: hash,
        mimeType:
          body.toString('ascii', 0, 4) === 'RIFF'
            ? 'audio/wav'
            : body.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
              ? 'audio/webm'
              : body.toString('ascii', 0, 4) === 'OggS'
                ? 'audio/ogg'
                : 'audio/mp4',
      };
    });
  }
  async stimulus(actor: AuthorityActor, id: string, sid: string) {
    return this.run(actor, async (tx) => {
      const ctx = await this.owned(tx, actor, id),
        s = await this.refresh(tx, ctx),
        g = phaseGroups(ctx.v.s, s.phase as Phase, s.taskIndex).find((g) =>
          g.stimuli.some((a) => a.id === sid),
        );
      const asset = g?.stimuli.find((a) => a.id === sid && !a.isProtected && a.type !== 'TEXT');
      if (s.deadline && ctx.now >= s.deadline) throw missing();
      const w = ctx.timing.tasks.find((t) => t.groupId === g?.id);
      if (
        asset?.type === 'AUDIO' &&
        w &&
        (ctx.now.getTime() < s.phaseStartedAt.getTime() + w.preparationSeconds * 1000 ||
          ctx.now.getTime() >=
            s.phaseStartedAt.getTime() + (w.preparationSeconds + w.playbackSeconds) * 1000)
      )
        throw missing();
      if (!asset?.storageKey || g?.taskCode === 'SE_SW_01_S10_V01') throw missing();
      return {
        body: await this.media.read(asset.storageKey),
        mimeType: asset.mimeType ?? 'application/octet-stream',
      };
    });
  }

  private recordingWindow(
    ctx: Awaited<ReturnType<PlacementWorkflowService['owned']>>,
    qid: string,
  ) {
    const g = phaseGroups(ctx.v.s, ctx.s.phase as Phase, ctx.s.taskIndex).find((g) =>
      g.questions.some((q) => q.id === qid),
    );
    const window = ctx.timing.tasks.find((t) => t.groupId === g?.id);
    if (
      ctx.s.phase !== 'SPEAKING' ||
      !ctx.s.deadline ||
      !g ||
      g.taskCode === 'SE_SW_01_S10_V01' ||
      !window ||
      !Number.isInteger(window.uploadSeconds)
    )
      throw new ConflictException('Approved non-S10 recording task required');
    return window;
  }
  beginRecording(
    actor: AuthorityActor,
    id: string,
    qid: string,
    b: { idempotencyKey: string; expectedLockVersion: number; tabId: string; token: string },
  ) {
    return this.run(actor, async (tx) => {
      const ctx = await this.owned(tx, actor, id);
      return this.idem(tx, actor, b.idempotencyKey, 'RECORDING_BEGIN', { id, qid, b }, async () => {
        const w = this.recordingWindow(ctx, qid);
        if (
          ctx.s.lockVersion !== b.expectedLockVersion ||
          ctx.now >= ctx.s.deadline! ||
          ctx.now.getTime() <
            ctx.s.phaseStartedAt.getTime() + (w.preparationSeconds + w.playbackSeconds) * 1000
        )
          throw stale();
        if (
          await tx.placementTaskRecording.findUnique({
            where: { attemptId_questionId: { attemptId: id, questionId: qid } },
          })
        )
          throw new ConflictException('RECORDING_ALREADY_STARTED_NO_RETAKE');
        await tx.$queryRaw`SELECT set_config('app.placement_recording_token',${b.token},true)`;
        const r = await tx.placementTaskRecording.create({
          data: {
            attemptId: id,
            questionId: qid,
            state: 'STARTED',
            tabId: b.tabId,
            tokenHash: digest(b.token),
            sessionHash: digest(actor.sessionId),
            startedAt: ctx.now,
            deadline: new Date(
              Math.min(ctx.s.deadline!.getTime(), ctx.now.getTime() + w.responseSeconds * 1000),
            ),
            uploadDeadline: new Date(ctx.s.deadline!.getTime() + w.uploadSeconds! * 1000),
          },
        });
        const sitting = await tx.placementSitting.update({
          where: { attemptId: id },
          data: { lockVersion: { increment: 1 } },
        });
        await this.authority.audit(
          tx,
          actor.id,
          'PLACEMENT_RECORDING_BEGIN',
          'PlacementRecording',
          r.id,
          'One capture receipt, original task deadline, no new capture after refresh',
        );
        return {
          ...this.view(sitting, ctx.now),
          recordingDeadline: r.deadline.toISOString(),
          uploadDeadline: r.uploadDeadline.toISOString(),
        };
      });
    });
  }
  async upload(
    actor: AuthorityActor,
    id: string,
    qid: string,
    b: { idempotencyKey: string; expectedLockVersion: number; tabId: string; token: string },
    file?: { buffer: Buffer; mimetype: string },
  ) {
    if (!file || file.buffer.length > 10 * 1024 * 1024 || file.mimetype !== 'audio/wav')
      throw new BadRequestException('Original PCM WAV required, maximum10MB');
    let ms: number;
    try {
      ms = originalPcmDuration(file.buffer);
    } catch {
      throw new BadRequestException('Valid PCM WAV required');
    }
    return this.run(actor, async (tx) => {
      const ctx = await this.owned(tx, actor, id);
      return this.idem(
        tx,
        actor,
        b.idempotencyKey,
        'ORIGINAL_RECORDING',
        { id, qid, b, digest: digest(file.buffer) },
        async () => {
          this.recordingWindow(ctx, qid);
          const r = await tx.placementTaskRecording.findUnique({
            where: { attemptId_questionId: { attemptId: id, questionId: qid } },
          });
          if (
            !r ||
            r.state !== 'STARTED' ||
            r.tabId !== b.tabId ||
            r.tokenHash !== digest(b.token) ||
            r.sessionHash !== digest(actor.sessionId)
          )
            throw new ForbiddenException('CURRENT_RECORDING_RECEIPT_REQUIRED');
          if (
            ctx.s.lockVersion !== b.expectedLockVersion ||
            ctx.now > r.uploadDeadline ||
            ms > r.deadline.getTime() - r.startedAt.getTime()
          )
            throw stale();
          const reserved = [actor.id, id, qid, r.id + '.wav'].join('/');
          const storedKey = reserved;
          try {
            await this.responses.put(
              { learnerId: actor.id, attemptId: id, testQuestionId: qid },
              file.buffer,
              'audio/wav',
              reserved,
            );
          } catch (error) {
            try {
              if (digest(await this.responses.read(reserved)) !== digest(file.buffer)) throw error;
            } catch {
              throw new ServiceUnavailableException(
                'Original staged WAV retained; retry identical bytes or request incident review',
              );
            }
          }
          if (digest(await this.responses.read(storedKey)) !== digest(file.buffer))
            throw new ConflictException('ORIGINAL_STAGED_RECORDING_CHANGED');
          await tx.$queryRaw`SELECT set_config('app.placement_recording_token',${b.token},true)`;
          await tx.placementTaskRecording.update({
            where: { id: r.id },
            data: {
              state: 'SAVED',
              storageKey: storedKey,
              digest: digest(file.buffer),
              durationMs: ms,
            },
          });
          await tx.testAnswer.create({
            data: { attemptId: id, testQuestionId: qid, audioStorageKey: storedKey },
          });
          const sitting =
            ctx.now < ctx.s.deadline!
              ? await tx.placementSitting.update({
                  where: { attemptId: id },
                  data: { lockVersion: { increment: 1 } },
                })
              : ctx.s;
          await this.authority.audit(
            tx,
            actor.id,
            'PLACEMENT_RECORDING_SAVED',
            'PlacementRecording',
            r.id,
            'Original WAV committed once; upload allowance does not extend recording or next section',
          );
          return { ...this.view(sitting, ctx.now), saved: true, sha256: digest(file.buffer) };
        },
      );
    });
  }
}
