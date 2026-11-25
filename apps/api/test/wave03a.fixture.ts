import * as request from 'supertest';
import { randomUUID } from 'node:crypto';
import { seedWave02B, grantAcademic } from './wave02b.fixture';
import type { startWave01App } from './wave01-postgres.fixture';
export async function seedWave03A(dev: Awaited<ReturnType<typeof startWave01App>>) {
  const f = await seedWave02B(dev.prisma),
    agents = new Map<string, ReturnType<typeof request.agent>>();
  for (const u of [...f.users, f.otherAcademic, ...f.contenders]) {
    const a = request.agent(dev.app.getHttpServer());
    await a.post('/api/auth/login').send({ email: u.email, password: f.password }).expect(200);
    agents.set(u.id, a);
  }
  const reason = 'Synthetic isolated W03A independent setup',
    maker = agents.get(f.academic.id)!,
    checker = agents.get(f.planningApprover.id)!;
  const classes = [];
  for (const [i, teacher] of [f.teacher, f.otherTeacher].entries()) {
    const c = await dev.prisma.classOffering.create({
      data: {
        courseId: f.published.id,
        instructorId: teacher.id,
        code: 'W03-' + i + '-' + randomUUID().slice(0, 8),
        name: 'Synthetic W03 class ' + i,
        status: 'OPEN',
        maxStudents: 20,
      },
    });
    classes.push(c);
    await dev.prisma.enrollment.create({
      data: { classOfferingId: c.id, learnerId: f.learner.id, status: 'ACTIVE' },
    });
    if (!i)
      await dev.prisma.enrollment.create({
        data: { classOfferingId: c.id, learnerId: f.otherLearner.id, status: 'PENDING_PAYMENT' },
      });
    await grantAcademic(
      dev.prisma,
      f.planningApprover.id,
      f.approver.id,
      f.secondApprover.id,
      'academic.schedule.approve',
      'CLASS',
      c.id,
    );
    let row = (
      await maker
        .post('/api/v2/academic/classes/' + c.id + '/assignments')
        .send({
          instructorId: teacher.id,
          effectiveFrom: new Date(Date.now() + 2000).toISOString(),
          effectiveTo: new Date(Date.now() + 180 * 86400000).toISOString(),
          reason,
        })
        .expect(201)
    ).body;
    row = (
      await maker
        .post('/api/v2/academic/assignments/' + row.id + '/submit')
        .send({ expectedLockVersion: row.lockVersion, reason })
        .expect(201)
    ).body;
    await checker
      .post('/api/v2/academic/assignments/' + row.id + '/approve')
      .send({ expectedLockVersion: row.lockVersion, reason, eligibilityConfirmed: true })
      .expect(201);
  }
  await new Promise((r) => setTimeout(r, 2200));
  const module = await dev.prisma.module.create({
      data: { courseId: f.published.id, title: 'Synthetic standard module', orderIndex: 50 },
    }),
    lesson = await dev.prisma.lesson.create({
      data: {
        moduleId: module.id,
        title: 'Shared standard lesson',
        contentMarkdown: 'Original immutable lesson snapshot',
        orderIndex: 0,
      },
    });
  const resource = await dev.prisma.learningResource.create({
    data: {
      lessonId: lesson.id,
      title: 'Standard external resource',
      type: 'LINK',
      url: 'https://example.com/english',
      orderIndex: 0,
    },
  });
  const foreignModule = await dev.prisma.module.create({
      data: { courseId: f.classes[0].courseId, title: 'Foreign module', orderIndex: 50 },
    }),
    foreignLesson = await dev.prisma.lesson.create({
      data: {
        moduleId: foreignModule.id,
        title: 'Foreign lesson',
        contentMarkdown: 'Foreign private standard',
        orderIndex: 0,
      },
    });
  return {
    ...f,
    lmsClasses: classes,
    standardLesson: lesson,
    standardResource: resource,
    foreignLesson,
    agents,
    reason,
  };
}
