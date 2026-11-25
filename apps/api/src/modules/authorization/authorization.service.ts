import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { BUSINESS_ROLES, eligible, inherent, type Scope } from './permission.policy';
import {
  resolveAcademicProfileFromGrants,
  type AcademicTrackProfile,
} from './academic-track';
import * as argon2 from 'argon2';
import type { CreateStaffAccountDto } from '../users/dto/admin-account.dto';
import type { UserStatus } from '../../generated/prisma/client';

type Tx = Prisma.TransactionClient;
export type AuthorityActor = { id: string; sessionId: string };
const denied = () =>
  new ForbiddenException({
    code: 'AUTHORITY_DENIED',
    message: 'No current authority for this action',
  });

@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}
  get client() {
    return this.prisma;
  }
  private async now(tx: Tx) {
    // Numeric epoch avoids driver/session-timezone ambiguity of raw timestamptz.
    const [clock] = await tx.$queryRaw<
      { ms: number }[]
    >`SELECT (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::double precision AS ms`;
    return new Date(clock.ms);
  }
  async permits(
    userId: string,
    capability: string,
    scope: Scope = { type: 'GLOBAL' },
    tx: Tx = this.prisma,
  ) {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { role: true, status: true },
    });
    if (!user || user.status !== 'ACTIVE' || !eligible(user.role, capability)) return false;
    if (inherent(user.role, capability)) return true;
    const now = await this.now(tx);
    return !!(await tx.permissionGrant.findFirst({
      where: {
        userId,
        capability,
        approvedBy: { not: null },
        approvedAt: { lte: now },
        revokedAt: null,
        effectiveAt: { lte: now },
        expiresAt: { gt: now },
        OR: [
          ...(!capability.startsWith('academic.') && !capability.startsWith('consultation.') &&
          !capability.startsWith('inspection.') && capability !== 'shift.review' &&
          !capability.startsWith('finance.') &&
          (!capability.startsWith('support.') || capability.startsWith('support.taxonomy.'))
            ? [{ scopeType: 'GLOBAL', scopeId: null }]
            : []),
          ...(scope.type !== 'GLOBAL' && scope.id
            ? [{ scopeType: scope.type, scopeId: scope.id }]
            : []),
        ],
      },
    }));
  }
  async audit(
    tx: Tx,
    actorId: string,
    action: string,
    objectType: string,
    objectId: string,
    reason: string,
    decision = 'ALLOW',
  ) {
    return tx.domainAuditEvent.create({
      data: {
        actorId,
        action,
        objectType,
        objectId,
        reason,
        decision,
        createdAt: await this.now(tx),
      },
    });
  }
  async requireActor(
    tx: Tx,
    actor: AuthorityActor,
    capability = 'accounts.manage',
    scope: Scope = { type: 'GLOBAL' },
  ) {
    const [session] = await tx.$queryRaw<{ sid: string }[]>`SELECT sid FROM user_sessions
      WHERE sid=${actor.sessionId} AND sess->>'userId'=${actor.id} AND expire > clock_timestamp()`;
    if (!session || !(await this.permits(actor.id, capability, scope, tx))) throw denied();
  }
  async write<T>(
    actor: AuthorityActor,
    action: string,
    objectId: string,
    work: (tx: Tx) => Promise<T>,
  ) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // One lock serializes authority mutations BEFORE reading current role/grants.
          await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
          await this.requireActor(tx, actor);
          return work(tx);
        },
        { maxWait: 10000, timeout: 15000 },
      );
    } catch (error) {
      await this.audit(
        this.prisma,
        actor.id,
        action,
        'AUTHORITY',
        objectId,
        error instanceof Error ? error.name : 'Rejected',
        'DENY',
      );
      throw error;
    }
  }
  private async target(tx: Tx, id: string) {
    const user = await tx.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Account not found');
    return user;
  }
  private assertDistinct(actor: string, target: string, requester?: string) {
    if (actor === target || actor === requester)
      throw new ForbiddenException({
        code: 'INDEPENDENT_APPROVAL_REQUIRED',
        message: 'Requester, recipient and approver must be distinct',
      });
  }
  async requestGrant(
    actor: AuthorityActor,
    input: {
      userId: string;
      capability: string;
      scopeType: 'GLOBAL' | 'CLASS' | 'COURSE' | 'SUPPORT_TOPIC' | 'TEACHER';
      scopeId?: string;
      effectiveAt: string;
      expiresAt: string;
      reason: string;
    },
  ) {
    return this.write(actor, 'GRANT_REQUEST', input.userId, async (tx) => {
      this.assertDistinct(actor.id, input.userId);
      const user = await this.target(tx, input.userId);
      if (!eligible(user.role, input.capability)) throw denied();
      const supportScope =
        input.capability.startsWith('support.') &&
        !input.capability.startsWith('support.taxonomy.');
      if (
        supportScope &&
        (input.scopeType !== 'SUPPORT_TOPIC' ||
          !input.scopeId ||
          !(await tx.supportTopic.findFirst({
            where: { code: input.scopeId, approvedById: { not: null }, approvedAt: { not: null } },
          })))
      )
        throw new BadRequestException('Approved support topic scope required');
      if (
        ['CLASS', 'COURSE', 'TEACHER'].includes(input.scopeType) &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          input.scopeId ?? '',
        )
      )
        throw new BadRequestException('UUID scope required');
      const academicScope = input.capability.startsWith('consultation.') ? 'TEACHER' : [
        'inspection.assign',
        'inspection.hours.review',
        'shift.review',
        'academic.schedule.approve',
        'academic.admission.approve',
        'finance.verify',
        'finance.adjust.propose',
        'finance.adjust.approve',
        'academic.meeting.approve',
        'academic.attendance.approve',
        'academic.rubric.approve',
        'academic.grade.publish',
        'academic.quiz.approve',
        'academic.quiz.grade.publish',
      ].includes(input.capability)
        ? 'CLASS'
        : input.capability === 'academic.program.approve'
          ? 'COURSE'
          : null;
      if (
        (input.scopeType !== 'GLOBAL') !== !!input.scopeId ||
        (academicScope
          ? input.scopeType !== academicScope
          : !supportScope &&
            input.scopeType !== 'GLOBAL' &&
            !(input.scopeType === 'CLASS' && input.capability === 'class.read'))
      )
        throw new BadRequestException('Invalid capability scope');
      if (
        input.scopeType === 'CLASS' &&
        input.scopeId &&
        !(await tx.classOffering.findUnique({ where: { id: input.scopeId }, select: { id: true } }))
      )
        throw new NotFoundException('Class not found');
      if (
        input.scopeType === 'COURSE' &&
        input.scopeId &&
        !(await tx.course.findUnique({ where: { id: input.scopeId }, select: { id: true } }))
      )
        throw new NotFoundException('Course not found');
      if (input.scopeType === 'TEACHER' && !(await tx.user.findFirst({where:{id:input.scopeId,role:'INSTRUCTOR',status:'ACTIVE'},select:{id:true}})))
        throw new NotFoundException('Instructor not found');
      const now = await this.now(tx),
        effectiveAt = new Date(input.effectiveAt),
        expiresAt = new Date(input.expiresAt);
      if (
        expiresAt <= effectiveAt ||
        expiresAt <= now ||
        expiresAt.getTime() - now.getTime() > 366 * 86400000
      )
        throw new BadRequestException({
          code: 'GRANT_INTERVAL_INVALID',
          message: 'Invalid grant interval (maximum 366 days)',
          serverTime: now.toISOString(),
          effectiveAt: effectiveAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
        });
      const grant = await tx.permissionGrant.create({
        data: {
          ...input,
          scopeId: input.scopeId ?? null,
          effectiveAt,
          expiresAt,
          requestedBy: actor.id,
          createdAt: now,
        },
      });
      await this.audit(tx, actor.id, 'GRANT_REQUEST', 'GRANT', grant.id, input.reason);
      return grant;
    });
  }
  approveGrant(actor: AuthorityActor, id: string) {
    return this.write(actor, 'GRANT_APPROVE', id, async (tx) => {
      await this.requireActor(tx, actor, 'authority.approve');
      const grant = await tx.permissionGrant.findUnique({ where: { id } });
      if (!grant) throw new NotFoundException('Grant not found');
      this.assertDistinct(actor.id, grant.userId, grant.requestedBy);
      if (grant.revokedAt || grant.expiresAt <= (await this.now(tx)))
        throw new ConflictException('Grant is revoked or expired');
      const target = await this.target(tx, grant.userId);
      if (target.status !== 'ACTIVE' || !eligible(target.role, grant.capability)) throw denied();
      if (grant.approvedBy) return grant; // serialized idempotent approval; no duplicate audit
      const approved = await tx.permissionGrant.update({
        where: { id },
        data: { approvedBy: actor.id, approvedAt: await this.now(tx) },
      });
      await this.audit(tx, actor.id, 'GRANT_APPROVE', 'GRANT', id, grant.reason);
      await this.revokeSessions(tx, grant.userId);
      return approved;
    });
  }
  revokeGrant(actor: AuthorityActor, id: string, reason: string) {
    return this.write(actor, 'GRANT_REVOKE', id, async (tx) => {
      const grant = await tx.permissionGrant.findUnique({ where: { id } });
      if (!grant) throw new NotFoundException('Grant not found');
      this.assertDistinct(actor.id, grant.userId);
      if (grant.revokedAt) return grant;
      if (grant.capability === 'authority.approve')
        await this.protectApprover(tx, grant.id, grant.userId);
      const result = await tx.permissionGrant.update({
        where: { id },
        data: { revokedAt: await this.now(tx), revokedBy: actor.id, revokeReason: reason },
      });
      await this.audit(tx, actor.id, 'GRANT_REVOKE', 'GRANT', id, reason);
      await this.revokeSessions(tx, grant.userId);
      return result;
    });
  }
  requestRole(actor: AuthorityActor, userId: string, nextRole: UserRole, reason: string) {
    return this.write(actor, 'ROLE_REQUEST', userId, async (tx) => {
      this.assertDistinct(actor.id, userId);
      const target = await this.target(tx, userId);
      if (
        !BUSINESS_ROLES.includes(nextRole) ||
        nextRole === 'STUDENT' ||
        target.role === 'STUDENT' ||
        target.role === nextRole
      )
        throw new BadRequestException('Only explicit staff role transitions are supported');
      const result = await tx.accountRoleDecision.create({
        data: {
          userId,
          previousRole: target.role,
          nextRole,
          requestedBy: actor.id,
          reason,
          createdAt: await this.now(tx),
        },
      });
      await this.audit(tx, actor.id, 'ROLE_REQUEST', 'ROLE_DECISION', result.id, reason);
      return result;
    });
  }
  approveRole(actor: AuthorityActor, id: string) {
    return this.write(actor, 'ROLE_APPROVE', id, async (tx) => {
      await this.requireActor(tx, actor, 'authority.approve');
      const decision = await tx.accountRoleDecision.findUnique({ where: { id } });
      if (!decision) throw new NotFoundException('Decision not found');
      this.assertDistinct(actor.id, decision.userId, decision.requestedBy);
      if (decision.approvedBy) return decision;
      const target = await this.target(tx, decision.userId);
      if (target.role !== decision.previousRole)
        throw new ConflictException('Role changed since request; submit a new decision');
      await this.protectAdmin(tx, target.id, decision.nextRole, target.status);
      if (
        target.role === 'INSTRUCTOR' &&
        (await tx.classOffering.count({
          where: { instructorId: target.id, status: { in: ['DRAFT', 'OPEN', 'IN_PROGRESS'] } },
        }))
      )
        throw new ConflictException('Reassign operational classes before changing instructor role');
      await tx.user.update({ where: { id: target.id }, data: { role: decision.nextRole } });
      // Historical ExamRecoveryPermission is deliberately untouched.
      await this.revokeSessions(tx, target.id);
      const result = await tx.accountRoleDecision.update({
        where: { id },
        data: { approvedBy: actor.id, effectiveAt: await this.now(tx) },
      });
      await this.audit(tx, actor.id, 'ROLE_APPROVE', 'ROLE_DECISION', id, decision.reason);
      return result;
    });
  }
  async protectAdmin(tx: Tx, userId: string, nextRole: UserRole, nextStatus: string) {
    const user = await this.target(tx, userId);
    if (
      user.role !== 'SYSTEM_ADMIN' ||
      user.status !== 'ACTIVE' ||
      (nextRole === 'SYSTEM_ADMIN' && nextStatus === 'ACTIVE')
    )
      return;
    if (
      !(await tx.user.count({
        where: { id: { not: userId }, role: 'SYSTEM_ADMIN', status: 'ACTIVE' },
      }))
    )
      throw new ConflictException({
        code: 'LAST_ACTIVE_ADMIN_PROTECTED',
        message: 'Last administrator is protected',
      });
    await this.protectApprover(tx, undefined, userId);
  }
  private async protectApprover(tx: Tx, excludedGrant: string | undefined, excludedUser: string) {
    const now = await this.now(tx);
    const other = await tx.permissionGrant.findMany({
      where: {
        capability: 'authority.approve',
        userId: { not: excludedUser },
        ...(excludedGrant ? { id: { not: excludedGrant } } : {}),
        approvedBy: { not: null },
        revokedAt: null,
        effectiveAt: { lte: now },
        expiresAt: { gt: now },
      },
      select: { userId: true },
    });
    for (const grant of other)
      if (await this.permits(grant.userId, 'authority.approve', { type: 'GLOBAL' }, tx)) return;
    // Only prevent removal when this target is itself a live approver.
    if (await this.permits(excludedUser, 'authority.approve', { type: 'GLOBAL' }, tx))
      throw new ConflictException({
        code: 'LAST_AUTHORIZED_APPROVER_PROTECTED',
        message: 'Last authorized approver is protected',
      });
  }
  revokeSessions(tx: Tx, userId: string) {
    return tx.userSession.deleteMany({ where: { sess: { path: ['userId'], equals: userId } } });
  }
  revokeRecovery(actor: AuthorityActor, userId: string, reason: string) {
    return this.write(actor, 'RECOVERY_AUTHORITY_REVOKE', userId, async (tx) => {
      this.assertDistinct(actor.id, userId);
      await this.target(tx, userId);
      const now = await this.now(tx);
      await tx.examRecoveryPermission.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.permissionGrant.updateMany({
        where: { userId, capability: 'assessment.recovery.approve', revokedAt: null },
        data: { revokedAt: now, revokedBy: actor.id, revokeReason: reason },
      });
      await this.revokeSessions(tx, userId);
      await this.audit(tx, actor.id, 'RECOVERY_AUTHORITY_REVOKE', 'USER', userId, reason);
      return { revoked: true };
    });
  }
  async createAccount(actor: AuthorityActor, input: CreateStaffAccountDto) {
    // Privileged primary roles require a later independent role decision.
    if (!['INSTRUCTOR', 'COUNSELOR', 'CASHIER', 'TEACHING_INSPECTOR'].includes(input.role))
      throw denied();
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    return this.write(actor, 'ACCOUNT_CREATE', 'NEW', async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email: input.email.trim().toLowerCase() },
        select: { id: true },
      });
      if (existing)
        throw new ConflictException({
          code: 'ACCOUNT_EMAIL_EXISTS',
          message: 'An account with this email already exists',
        });
      const user = await tx.user.create({
        data: {
          fullName: input.fullName.trim(),
          email: input.email.trim().toLowerCase(),
          role: input.role,
          passwordHash,
        },
        select: { id: true, fullName: true, email: true, role: true, status: true },
      });
      await this.audit(
        tx,
        actor.id,
        'ACCOUNT_CREATE',
        'USER',
        user.id,
        'Create non-privileged staff account; privileged role requires independent decision',
      );
      return user;
    });
  }
  updateStatus(actor: AuthorityActor, userId: string, status: UserStatus, reason: string) {
    return this.write(actor, 'ACCOUNT_STATUS', userId, async (tx) => {
      this.assertDistinct(actor.id, userId);
      const target = await this.target(tx, userId);
      await this.protectAdmin(tx, userId, target.role, status);
      if (
        target.role === 'INSTRUCTOR' &&
        status === 'INACTIVE' &&
        (await tx.classOffering.count({
          where: { instructorId: userId, status: { in: ['DRAFT', 'OPEN', 'IN_PROGRESS'] } },
        }))
      )
        throw new ConflictException('Reassign operational classes before deactivation');
      const updated = await tx.user.update({
        where: { id: userId },
        data: { status },
        select: { id: true, role: true, status: true },
      });
      await this.revokeSessions(tx, userId);
      await this.audit(tx, actor.id, 'ACCOUNT_STATUS', 'USER', userId, reason);
      return updated;
    });
  }
  async academicProfile(
    userId: string,
    role?: UserRole,
    tx: Tx = this.prisma,
  ): Promise<AcademicTrackProfile> {
    const resolvedRole =
      role ??
      (
        await tx.user.findUnique({
          where: { id: userId },
          select: { role: true },
        })
      )?.role;
    if (resolvedRole !== 'ACADEMIC_MANAGER') {
      return resolveAcademicProfileFromGrants(resolvedRole ?? 'STUDENT', []);
    }
    const now = await this.now(tx);
    const grants = await tx.permissionGrant.findMany({
      where: {
        userId,
        approvedBy: { not: null },
        approvedAt: { lte: now },
        revokedAt: null,
        effectiveAt: { lte: now },
        expiresAt: { gt: now },
      },
      select: { capability: true },
    });
    return resolveAcademicProfileFromGrants(
      resolvedRole,
      grants.map((g) => g.capability),
    );
  }
  async overview() {
    const [grants, roles, audit] = await Promise.all([
      this.prisma.permissionGrant.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.accountRoleDecision.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.domainAuditEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);
    return { grants, roles, audit };
  }
}
