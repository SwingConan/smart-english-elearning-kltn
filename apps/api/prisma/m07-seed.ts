import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  EnrollmentStatus,
  LessonProgressStatus,
  PrismaClient,
  ResourceType,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/client';

const stableUuid = (key: string) => {
  const hex = createHash('sha256').update(`smart-english:m07:${key}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
};

interface M07SeedContext {
  courseId: string;
  classOfferingId: string;
  passwordHash: string;
}

const learners = [
  ['ngoc.anh', 'Trần Ngọc Anh'],
  ['minh.khang', 'Nguyễn Minh Khang'],
  ['hoang.lan', 'Lê Hoàng Lan'],
  ['gia.huy', 'Phạm Gia Huy'],
  ['thu.trang', 'Võ Thu Trang'],
  ['bao.long', 'Đặng Bảo Long'],
  ['thanh.ha', 'Bùi Thanh Hà'],
  ['quoc.viet', 'Đỗ Quốc Việt'],
  ['mai.phuong', 'Hồ Mai Phương'],
] as const;

export async function seedM07(prisma: PrismaClient, context: M07SeedContext): Promise<void> {
  const lessons = await prisma.lesson.findMany({
    where: { module: { courseId: context.courseId } },
    orderBy: [{ module: { orderIndex: 'asc' } }, { orderIndex: 'asc' }],
    select: { id: true },
  });
  if (lessons.length === 0) throw new Error('M07 seed requires the demo course curriculum');

  for (const [learnerIndex, [emailPrefix, fullName]] of learners.entries()) {
    const learnerId = stableUuid(`learner:${emailPrefix}`);
    const enrollmentId = stableUuid(`enrollment:${emailPrefix}`);
    await prisma.user.upsert({
      where: { email: `${emailPrefix}@smart-elearning.local` },
      update: { fullName, passwordHash: context.passwordHash, role: UserRole.STUDENT, status: UserStatus.ACTIVE },
      create: { id: learnerId, email: `${emailPrefix}@smart-elearning.local`, fullName, passwordHash: context.passwordHash, role: UserRole.STUDENT, status: UserStatus.ACTIVE },
    });
    await prisma.enrollment.upsert({
      where: { learnerId_classOfferingId: { learnerId, classOfferingId: context.classOfferingId } },
      update: { status: EnrollmentStatus.ACTIVE },
      create: { id: enrollmentId, learnerId, classOfferingId: context.classOfferingId, status: EnrollmentStatus.ACTIVE },
    });
    for (const [lessonIndex, lesson] of lessons.entries()) {
      const completedThreshold = learnerIndex % (lessons.length + 1);
      const status = lessonIndex < completedThreshold
        ? LessonProgressStatus.COMPLETED
        : lessonIndex === completedThreshold && learnerIndex % 3 !== 0
          ? LessonProgressStatus.IN_PROGRESS
          : LessonProgressStatus.NOT_STARTED;
      const completedAt = status === LessonProgressStatus.COMPLETED
        ? new Date(Date.UTC(2026, 8, 10 + learnerIndex, 2 + lessonIndex))
        : null;
      await prisma.lessonProgress.upsert({
        where: { enrollmentId_lessonId: { enrollmentId, lessonId: lesson.id } },
        update: { status, lastAccessedAt: status === LessonProgressStatus.NOT_STARTED ? null : new Date('2026-10-04T02:00:00Z'), completedAt },
        create: { id: stableUuid(`progress:${emailPrefix}:${lesson.id}`), enrollmentId, lessonId: lesson.id, status, lastAccessedAt: status === LessonProgressStatus.NOT_STARTED ? null : new Date('2026-10-04T02:00:00Z'), completedAt },
      });
    }
  }

  const storageKey = 'm07/instructor-class-handbook.txt';
  const storagePath = resolve(process.cwd(), '.local-storage', 'learning-resources', storageKey);
  await mkdir(dirname(storagePath), { recursive: true });
  await writeFile(storagePath, 'Smart English — Tài liệu hướng dẫn học tập M07\nNội dung dự án tự biên soạn.\n', 'utf8');
  const targetLesson = lessons[0];
  const lastResource = await prisma.learningResource.findFirst({ where: { lessonId: targetLesson.id }, orderBy: { orderIndex: 'desc' }, select: { orderIndex: true } });
  await prisma.learningResource.upsert({
    where: { id: stableUuid('stored-resource') },
    update: { lessonId: targetLesson.id, title: 'Cẩm nang học tập của lớp', type: ResourceType.DOCUMENT, url: null, storageKey, originalFileName: 'cam-nang-hoc-tap.txt', mimeType: 'text/plain', isDownloadable: true },
    create: { id: stableUuid('stored-resource'), lessonId: targetLesson.id, title: 'Cẩm nang học tập của lớp', type: ResourceType.DOCUMENT, url: null, storageKey, originalFileName: 'cam-nang-hoc-tap.txt', mimeType: 'text/plain', orderIndex: (lastResource?.orderIndex ?? -1) + 1, isDownloadable: true },
  });
}
