import { seedWave02 } from './wave02.fixture';
import type { PrismaService } from '../src/infrastructure/prisma/prisma.service';
export async function seedWave02B(prisma: PrismaService) {
  const f = await seedWave02(prisma, 'W02B');
  await prisma.enrollment.create({
    data: {
      learnerId: f.otherLearner.id,
      classOfferingId: f.classes[0].id,
      status: 'PENDING_PAYMENT',
    },
  });
  const ungrantedAcademic = await prisma.user.create({
    data: {
      email: 'w02b-ungranted-' + f.academic.id + '@example.invalid',
      fullName: 'W02B HVU chưa có grant duyệt',
      role: 'ACADEMIC_MANAGER',
      passwordHash: f.academic.passwordHash,
    },
  });
  const grants = [];
  for (const id of [f.classroom.id, f.otherClass.id, f.freeClass.id])
    grants.push(
      await grantAcademic(
        prisma,
        f.otherAcademic.id,
        f.approver.id,
        f.secondApprover.id,
        'academic.schedule.approve',
        'CLASS',
        id,
      ),
    );
  grants.push(
    await grantAcademic(
      prisma,
      f.otherAcademic.id,
      f.approver.id,
      f.secondApprover.id,
      'academic.program.approve',
      'COURSE',
      f.published.id,
    ),
  );
  return {
    ...f,
    users: [...f.users, ungrantedAcademic],
    ungrantedAcademic,
    planningApprover: f.otherAcademic,
    planningGrants: grants,
  };
}
export async function grantAcademic(
  prisma: PrismaService,
  userId: string,
  requestedBy: string,
  approvedBy: string,
  capability: string,
  scopeType: 'CLASS' | 'COURSE',
  scopeId: string,
) {
  return prisma.permissionGrant.create({
    data: {
      userId,
      requestedBy,
      approvedBy,
      capability,
      scopeType,
      scopeId,
      reason: 'Synthetic isolated W02B approval scope only',
      effectiveAt: new Date(Date.now() - 60000),
      approvedAt: new Date(Date.now() - 60000),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
}
