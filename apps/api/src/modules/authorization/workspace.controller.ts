import { Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { PublicUser } from '../users/user.types';
import { AuthorizationService } from './authorization.service';
import {
  assignmentProjection,
  currentAssignmentWindow,
  effectiveInstructorScope,
} from './instructor-scope';

const classSelect = {
  id: true,
  code: true,
  name: true,
  status: true,
  classStart: true,
  classEnd: true,
  course: { select: { id: true, title: true, level: true } },
  instructor: { select: { id: true, fullName: true } },
  _count: { select: { enrollments: { where: { status: 'ACTIVE' as const } } } },
} satisfies Prisma.ClassOfferingSelect;

@Controller('workspace')
export class WorkspaceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authority: AuthorizationService,
  ) {}
  @Get()
  async me(@CurrentUser() user: PublicUser) {
    const trackProfile =
      user.role === 'ACADEMIC_MANAGER'
        ? await this.authority.academicProfile(user.id, user.role)
        : { academicTrack: null, academicScopes: undefined };
    return {
      role: user.role,
      academicTrack: trackProfile.academicTrack,
      capabilities: {
        accountsManage: await this.authority.permits(user.id, 'accounts.manage'),
        authorityApprove: await this.authority.permits(user.id, 'authority.approve'),
        classRead: await this.authority.permits(user.id, 'class.read'),
        // Existing recovery provenance is valid only AFTER individual HVU mapping.
        recoveryApprove:
          user.role === 'ACADEMIC_MANAGER' &&
          (!!(await this.prisma.examRecoveryPermission.findFirst({
            where: { userId: user.id, revokedAt: null },
          })) ||
            (await this.authority.permits(user.id, 'assessment.recovery.approve'))),
        ...(trackProfile.academicScopes ? { academic: trackProfile.academicScopes } : {}),
      },
    };
  }
  private async scope(user: PublicUser): Promise<Prisma.ClassOfferingWhereInput> {
    if (user.role === 'INSTRUCTOR') {
      const [clock] = await this.prisma.$queryRaw<
        { ms: number }[]
      >`SELECT (EXTRACT(EPOCH FROM clock_timestamp())*1000)::double precision AS ms`;
      return effectiveInstructorScope(user.id, currentAssignmentWindow(new Date(clock.ms)));
    }
    if (user.role === 'STUDENT') return { enrollments: { some: { learnerId: user.id } } };
    if (await this.authority.permits(user.id, 'class.read')) return {};
    // Additional read grants can be per class; never return foreign classes then filter in browser.
    const clock = (
      await this.prisma.$queryRaw<
        { ms: number }[]
      >`SELECT (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::double precision AS ms`
    )[0];
    const now = new Date(clock.ms);
    const grants = ['COUNSELOR', 'TEACHING_INSPECTOR'].includes(user.role)
      ? await this.prisma.permissionGrant.findMany({
          where: {
            userId: user.id,
            capability: 'class.read',
            scopeType: 'CLASS',
            approvedBy: { not: null },
            approvedAt: { lte: now },
            revokedAt: null,
            effectiveAt: { lte: now },
            expiresAt: { gt: now },
          },
          select: { scopeId: true },
        })
      : [];
    return { id: { in: grants.flatMap((g) => (g.scopeId ? [g.scopeId] : [])) } };
  }
  @Get('classes')
  @Roles('STUDENT', 'INSTRUCTOR', 'ACADEMIC_MANAGER', 'COUNSELOR', 'TEACHING_INSPECTOR')
  async classes(@CurrentUser() user: PublicUser) {
    const data = await this.prisma.classOffering.findMany({
      where: await this.scope(user),
      select: classSelect,
      orderBy: { code: 'asc' },
      take: 100,
    });
    const projection = await this.teachers(data.map((c) => c.id));
    return {
      data: data.map(({ _count, ...item }) => ({
        ...item,
        instructor:
          projection.current.get(item.id) ??
          (projection.managed.has(item.id) ? null : item.instructor),
        activeLearnerCount: _count.enrollments,
      })),
      limit: 100,
    };
  }
  @Get('classes/:id')
  @Roles('STUDENT', 'INSTRUCTOR', 'ACADEMIC_MANAGER', 'COUNSELOR', 'TEACHING_INSPECTOR')
  async detail(@CurrentUser() user: PublicUser, @Param('id', new ParseUUIDPipe()) id: string) {
    const item = await this.prisma.classOffering.findFirst({
      where: { AND: [{ id }, await this.scope(user)] },
      select: classSelect,
    });
    if (!item) throw new NotFoundException('Class not found');
    const projection = await this.teachers([id]);
    // Learner sees own enrollment only; roster never returned to learner or optional scoped readers.
    const enrollments = ['COUNSELOR', 'TEACHING_INSPECTOR'].includes(user.role)
      ? undefined
      : await this.prisma.enrollment.findMany({
          where: {
            classOfferingId: id,
            ...(user.role === 'STUDENT' ? { learnerId: user.id } : {}),
            ...(['STUDENT', 'INSTRUCTOR'].includes(user.role) ? { status: 'ACTIVE' as const } : {}),
          },
          select:
            user.role === 'STUDENT'
              ? { id: true, status: true, enrolledAt: true }
              : {
                  id: true,
                  status: true,
                  enrolledAt: true,
                  ...(['ACADEMIC_MANAGER', 'INSTRUCTOR'].includes(user.role)
                    ? { learner: { select: { id: true, fullName: true } } }
                    : {}),
                },
          take: 200,
          orderBy: { enrolledAt: 'asc' },
        });
    const { _count, ...classroom } = item;
    return {
      ...classroom,
      instructor:
        projection.current.get(id) ?? (projection.managed.has(id) ? null : classroom.instructor),
      activeLearnerCount: _count.enrollments,
      enrollments: ['COUNSELOR', 'TEACHING_INSPECTOR'].includes(user.role)
        ? undefined
        : enrollments,
      rosterLimit: 200,
    };
  }
  private async teachers(ids: string[]) {
    const [clock] = await this.prisma.$queryRaw<
      { ms: number }[]
    >`SELECT (EXTRACT(EPOCH FROM clock_timestamp())*1000)::double precision AS ms`;
    return assignmentProjection(this.prisma, ids, currentAssignmentWindow(new Date(clock.ms)));
  }
}
