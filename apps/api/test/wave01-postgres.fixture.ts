import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { configureHttpApplication } from '../src/app.setup';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { BUSINESS_ROLES } from '../src/modules/authorization/permission.policy';

export function wave01Url() {
  const value = process.env.WAVE01_PG_URL;
  if (!value) throw new Error('Explicit WAVE01_PG_URL required; no default database');
  const url = new URL(value);
  if (
    url.hostname !== '127.0.0.1' ||
    url.port !== '55401' ||
    !/^\/v2_wave01_dev(?:_test_[a-z0-9_]+)?$/.test(url.pathname)
  )
    throw new Error('Only isolated Wave01 PostgreSQL is allowed');
  return value;
}
export async function startWave01App() {
  process.env.DATABASE_URL = wave01Url();
  process.env.SESSION_SECRET = 'wave01-isolated-synthetic-session-secret-only';
  process.env.NODE_ENV = 'test';
  const root = resolve(__dirname, '../../../.local-storage/v2-wave01');
  process.env.ASSESSMENT_STIMULUS_AUTHORED_ROOT = resolve(root, 'dev-media');
  process.env.ASSESSMENT_RESPONSE_STORAGE_ROOT = resolve(root, 'dev-responses');
  await mkdir(process.env.ASSESSMENT_STIMULUS_AUTHORED_ROOT, { recursive: true });
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
  configureHttpApplication(app, app.get(ConfigService));
  // Private browser harness handshake; never installed by the production bootstrap.
  if (process.env.E2E_FIXTURE_NONCE) {
    const nonce = process.env.E2E_FIXTURE_NONCE;
    app.use(
      (
        _req: unknown,
        res: { setHeader: (name: string, value: string) => void },
        next: () => void,
      ) => {
        res.setHeader('X-Smart-English-E2E-Fixture', nonce);
        next();
      },
    );
  }
  await app.init();
  const prisma = app.get(PrismaService);
  const [location] = await prisma.$queryRaw<{ data_directory: string }[]>`SHOW data_directory`;
  if (resolve(location.data_directory) !== resolve(root, 'postgres')) {
    await app.close();
    throw new Error('Unexpected PostgreSQL directory');
  }
  return { app, prisma };
}
export async function seedWave01(prisma: PrismaService) {
  wave01Url();
  const suffix = randomUUID();
  const password = 'Synthetic-Wave01-only!';
  const passwordHash = await argon2.hash(password);
  const users = await Promise.all(
    [
      ...BUSINESS_ROLES,
      'ADMIN_COORDINATOR',
      'SYSTEM_ADMIN',
      'SYSTEM_ADMIN',
      'STUDENT',
      'INSTRUCTOR',
    ].map((role, i) =>
      prisma.user.create({
        data: {
          fullName: 'Wave01 DEV ' + role + ' ' + i,
          email: 'wave01-' + suffix + '-' + i + '@example.invalid',
          passwordHash,
          role: role as (typeof BUSINESS_ROLES)[number],
        },
      }),
    ),
  );
  const [
    learner,
    teacher,
    counselor,
    academic,
    cashier,
    inspector,
    admin,
    legacy,
    approver,
    secondApprover,
    otherLearner,
    otherTeacher,
  ] = users;
  // ONLY synthetic bootstrap: independent identities, auditable explicit approval.
  for (const operator of [approver, secondApprover]) {
    await prisma.permissionGrant.create({
      data: {
        userId: operator.id,
        capability: 'authority.approve',
        scopeType: 'GLOBAL',
        requestedBy: admin.id,
        approvedBy: operator.id === approver.id ? secondApprover.id : approver.id,
        approvedAt: new Date(),
        effectiveAt: new Date(Date.now() - 1000),
        expiresAt: new Date(Date.now() + 86400000),
        reason: 'Synthetic DEV fixture bootstrap; not a human approval or production mapping',
      },
    });
    await prisma.domainAuditEvent.create({
      data: {
        actorId: admin.id,
        action: 'DEV_SYNTHETIC_BOOTSTRAP',
        objectType: 'USER',
        objectId: operator.id,
        decision: 'DEV_ONLY',
        reason: 'Isolated synthetic operators only; production bootstrap pending PO',
      },
    });
  }
  const course = await prisma.course.create({
    data: {
      title: 'Wave01 Synthetic English',
      slug: 'wave01-' + suffix,
      description: 'Synthetic DEV only',
      level: 'A2',
      createdById: academic.id,
    },
  });
  const classes = await Promise.all(
    [teacher, otherTeacher].map((instructor, i) =>
      prisma.classOffering.create({
        data: {
          courseId: course.id,
          code: 'W01-' + suffix + '-' + i,
          name: i ? 'Foreign synthetic class' : 'My synthetic English class',
          status: 'IN_PROGRESS',
          instructorId: instructor.id,
        },
      }),
    ),
  );
  await prisma.enrollment.create({
    data: { learnerId: learner.id, classOfferingId: classes[0].id, status: 'ACTIVE' },
  });
  await prisma.enrollment.create({
    data: { learnerId: otherLearner.id, classOfferingId: classes[1].id, status: 'ACTIVE' },
  });
  await prisma.examRecoveryPermission.create({
    data: { userId: legacy.id, grantedBy: academic.id },
  });
  return {
    users,
    learner,
    teacher,
    counselor,
    academic,
    cashier,
    inspector,
    admin,
    legacy,
    approver,
    secondApprover,
    otherLearner,
    otherTeacher,
    password,
    classes,
  };
}
