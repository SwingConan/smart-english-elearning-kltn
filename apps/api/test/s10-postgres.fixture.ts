// Explicit isolated DEV only. No seed, database reset or production fallback.
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { configureHttpApplication } from '../src/app.setup';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { S10DurableService } from '../src/modules/placement/s10-durable.service';

export function isolatedS10Url() {
  const value = process.env.BATCH04_PG_URL;
  if (!value) throw new Error('BATCH04_PG_URL required: no default or .env database allowed');
  const url = new URL(value);
  const wave01 = value === process.env.WAVE01_PG_URL && url.port === '55401' && /^\/v2_wave01_dev(?:_test_[a-z0-9_]+)?$/.test(url.pathname);
  if (
    url.hostname !== '127.0.0.1' ||
    (!wave01 && (url.port !== '55404' || !/^\/se_sw_batch04_(dev|upgrade)$/.test(url.pathname)))
  )
    throw new Error('Only Batch 04 isolated loopback PostgreSQL is allowed');
  return value;
}
function syntheticWav() {
  const b = Buffer.alloc(44 + 3200);
  b.write('RIFF');
  b.writeUInt32LE(b.length - 8, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(3200, 40);
  return b;
}
export async function startS10DevApp() {
  process.env.DATABASE_URL = isolatedS10Url();
  process.env.SESSION_SECRET = 'isolated-dev-only-s10-batch04-session-secret';
  process.env.NODE_ENV = 'test';
  const root = resolve(__dirname, process.env.WAVE01_PG_URL === process.env.BATCH04_PG_URL
    ? '../../../.local-storage/v2-wave01/s10-regression' : '../../../.local-storage/se-sw-01/batch-04');
  process.env.ASSESSMENT_STIMULUS_AUTHORED_ROOT = resolve(root, 'dev-media');
  process.env.ASSESSMENT_RESPONSE_STORAGE_ROOT = resolve(root, 'dev-responses');
  await mkdir(process.env.ASSESSMENT_STIMULUS_AUTHORED_ROOT, { recursive: true });
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
  configureHttpApplication(app, app.get(ConfigService));
  await app.init();
  return { app, prisma: app.get(PrismaService), service: app.get(S10DurableService), root };
}
export async function seedS10DevTask(prisma: PrismaService, body = syntheticWav()) {
  isolatedS10Url();
  const password = 'Batch04-synthetic-only!';
  const suffix = randomUUID();
  const passwordHash = await argon2.hash(password);
  const users = await Promise.all(
    (['STUDENT', 'STUDENT', 'INSTRUCTOR', 'ACADEMIC_MANAGER', 'ACADEMIC_MANAGER'] as const).map(
      (role, i) =>
        prisma.user.create({
          data: {
            email: `batch04-${suffix}-${i}@example.invalid`,
            passwordHash,
            fullName: 'Synthetic DEV reviewer',
            role,
          },
        }),
    ),
  );
  const [owner, other, teacher, coordinator, ungranted] = users;
  const sessionId = randomUUID();
  await prisma.userSession.create({
    data: {
      sid: sessionId,
      sess: { userId: owner.id },
      expire: new Date(Date.now() + 24 * 3600_000),
    },
  });
  const actor = { id: owner.id, role: owner.role, sessionId };
  const test = await prisma.test.create({
    data: {
      purpose: 'PLACEMENT',
      placementMode: 'FOUR_SKILLS',
      title: 'Synthetic S10 isolated DEV',
      timeLimitMinutes: 60,
    },
  });
  const group = await prisma.testQuestionGroup.create({
    data: {
      testId: test.id,
      skill: 'SPEAKING',
      orderIndex: 0,
      taskCode: 'SE_SW_01_S10_V01',
      title: 'Synthetic task',
      instructions: 'Listen twice, then respond.',
      responseSeconds: 30,
      maxRecordingSeconds: 30,
    },
  });
  const question = await prisma.question.create({
    data: {
      responseType: 'AUDIO_RESPONSE',
      difficulty: 'EASY',
      toeicSkill: 'SPEAKING',
      content: 'Synthetic DEV question; no real exam text.',
    },
  });
  const tq = await prisma.testQuestion.create({
    data: { testId: test.id, questionId: question.id, groupId: group.id, orderIndex: 0 },
  });
  const file = suffix + '.wav';
  await writeFile(resolve(process.env.ASSESSMENT_STIMULUS_AUTHORED_ROOT!, file), body);
  const stimulus = await prisma.assessmentStimulus.create({
    data: {
      groupId: group.id,
      type: 'AUDIO',
      orderIndex: 0,
      storageKey: 'authored/' + file,
      mimeType: 'audio/wav',
    },
  });
  const attempt = await prisma.testAttempt.create({
    data: {
      testId: test.id,
      learnerId: owner.id,
      attemptNumber: 1,
      placementSelfLevel: 'UNKNOWN',
      placementGoalScore: 550,
    },
  });
  await prisma.examRecoveryPermission.create({
    data: { userId: coordinator.id, grantedBy: ungranted.id },
  });
  return {
    actor,
    owner,
    other,
    teacher,
    coordinator,
    ungranted,
    password,
    attempt,
    question: tq,
    stimulus,
  };
}
