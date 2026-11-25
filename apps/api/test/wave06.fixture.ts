import { seedWave02B, grantAcademic } from './wave02b.fixture';
import type { PrismaService } from '../src/infrastructure/prisma/prisma.service';
export async function seedWave06(prisma: PrismaService) {
  const f = await seedWave02B(prisma);
  for (const cap of [
    'academic.meeting.approve',
    'academic.attendance.approve',
    'academic.schedule.approve',
  ])
    for (const u of [f.academic, f.planningApprover])
      await grantAcademic(
        prisma,
        u.id,
        f.approver.id,
        f.secondApprover.id,
        cap,
        'CLASS',
        f.classroom.id,
      );
  await grantAcademic(
    prisma,
    f.inspector.id,
    f.approver.id,
    f.secondApprover.id,
    'class.read',
    'CLASS',
    f.classroom.id,
  );
  return f;
}
