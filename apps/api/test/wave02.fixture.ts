import { randomUUID } from 'node:crypto';
import { seedWave01 } from './wave01-postgres.fixture';
import type { PrismaService } from '../src/infrastructure/prisma/prisma.service';
export async function seedWave02(prisma: PrismaService, namespace = 'W02') {
  const f = await seedWave01(prisma),
    suffix = randomUUID();
  const otherAcademic = await prisma.user.create({
    data: {
      email: 'w02-other-' + suffix + '@example.invalid',
      fullName: 'W02 Other Academic',
      role: 'ACADEMIC_MANAGER',
      passwordHash: f.academic.passwordHash,
    },
  });
  const foreignDraft = await prisma.course.create({
    data: {
      title: 'Other owner private draft',
      slug: 'w02-private-' + suffix,
      description: 'Private draft standard',
      level: 'BASIC',
      createdById: otherAcademic.id,
    },
  });
  const foreignDraftClass = await prisma.classOffering.create({
    data: { courseId: foreignDraft.id, code: 'W02-FOREIGN-' + suffix, name: 'Private draft class' },
  });
  const published = await prisma.course.create({
    data: {
      title: namespace + ' TOEIC Foundation',
      slug: 'w02-foundation-' + suffix,
      description: 'TOEIC nền tảng: phát triển kỹ năng nghe và đọc.',
      level: 'FOUNDATION',
      skillScope: 'LR',
      isPublished: true,
      createdById: f.academic.id,
      modules: { create: { title: 'Nghe hiểu nền tảng', orderIndex: 0 } },
    },
  });
  const classroom = await prisma.classOffering.create({
    data: {
      courseId: published.id,
      code: 'W02-OPEN-' + suffix,
      name: 'TOEIC buổi tối DEV',
      status: 'OPEN',
      instructorId: f.teacher.id,
      maxStudents: 2,
      pricingType: 'PAID',
      tuitionFeeVnd: 1500000,
      modality: 'HYBRID',
      classStart: new Date('2026-11-02T11:00:00Z'),
      classEnd: new Date('2027-02-02T13:00:00Z'),
    },
  });
  const otherClass = await prisma.classOffering.create({
    data: {
      courseId: published.id,
      code: 'W02-OTHER-' + suffix,
      name: 'Other assigned DEV class',
      status: 'OPEN',
      instructorId: f.otherTeacher.id,
      maxStudents: 10,
    },
  });
  const freeClass = await prisma.classOffering.create({
    data: {
      courseId: published.id,
      code: 'W02-FREE-' + suffix,
      name: 'One seat concurrency fixture',
      status: 'OPEN',
      maxStudents: 1,
    },
  });
  await prisma.classScheduleSlot.create({
    data: {
      classOfferingId: classroom.id,
      dayOfWeek: 1,
      startTime: new Date('1970-01-01T18:00:00Z'),
      endTime: new Date('1970-01-01T19:30:00Z'),
      locationText: 'Cơ sở DEV · mẫu tuần',
      meetingUrl: 'https://meet.google.com/PRIVATE_MEET_W02',
    },
  });
  await prisma.enrollment.create({
    data: { learnerId: f.learner.id, classOfferingId: classroom.id, status: 'ACTIVE' },
  });
  await prisma.enrollment.create({
    data: {
      learnerId: f.otherLearner.id,
      classOfferingId: classroom.id,
      status: 'PENDING_PAYMENT',
    },
  });
  const contenders = await Promise.all(
    [0, 1, 2].map((i) =>
      prisma.user.create({
        data: {
          email: 'w02-contender-' + suffix + '-' + i + '@example.invalid',
          fullName: 'W02 synthetic contender ' + i,
          passwordHash: f.learner.passwordHash,
          role: 'STUDENT',
        },
      }),
    ),
  );
  return {
    ...f,
    otherAcademic,
    foreignDraft,
    foreignDraftClass,
    published,
    classroom,
    otherClass,
    freeClass,
    contenders,
  };
}
