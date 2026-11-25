// Test-only HTTP fixture: real controller/service/auth guards, in-memory users,
// sessions and Prisma/storage adapters. Never import this file into AppModule.
import { ValidationPipe, type INestApplication, type Type, type Provider } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { LegacyPlacementFixtureGuard } from '../src/modules/placement/legacy-fixture.guard';
import * as session from 'express-session';
import { Readable } from 'node:stream';
import type { Request, Response, NextFunction } from 'express';
import {
  PlacementMode,
  TestAttemptStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { AuthGuard } from '../src/modules/auth/guards/auth.guard';
import { RolesGuard } from '../src/modules/auth/guards/roles.guard';
import { UsersService } from '../src/modules/users/users.service';
import { RecommendationService } from '../src/modules/recommendations/recommendation.service';
import { PlacementController } from '../src/modules/placement/placement.controller';
import { PlacementService } from '../src/modules/placement/placement.service';
import { AssessmentResponseStorage } from '../src/modules/placement/assessment-response.storage';
import {
  AssessmentStimulusMediaStorage,
  AssessmentStimulusMediaUnavailableError,
  InvalidAssessmentStimulusMediaKeyError,
} from '../src/modules/placement/assessment-stimulus-media.storage';

export const fixtureIds = {
  attempt: '10000000-0000-4000-8000-000000000001',
  question: '30000000-0000-4000-8000-000000000001',
  audio: '40000000-0000-4000-8000-000000000001',
  image: '40000000-0000-4000-8000-000000000002',
  protected: '40000000-0000-4000-8000-000000000003',
  missing: '40000000-0000-4000-8000-000000000004',
};
function toneWav() {
  const bytes = Buffer.alloc(44 + (16000 * 2) / 5);
  bytes.write('RIFF');
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16000, 24);
  bytes.writeUInt32LE(32000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(bytes.length - 44, 40);
  for (let i = 44; i < bytes.length; i += 2)
    bytes.writeInt16LE(Math.round(Math.sin(i / 8) * 1000), i);
  return bytes;
}
export async function createMediaPilotFixture(
  audioBytes: Buffer = toneWav(),
  imageBytes: Buffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=',
    'base64',
  ),
  configure?: (app: INestApplication) => void,
  extensions?: { controllers: Type[]; providers: Provider[] },
) {
  const owner = { id: 'fixture-owner', role: UserRole.STUDENT, status: UserStatus.ACTIVE };
  const users = new Map<string, { id: string; role: UserRole; status: UserStatus }>([
    ['owner', owner],
    ['other', { ...owner, id: 'fixture-other' }],
    ['teacher', { ...owner, id: 'fixture-teacher', role: UserRole.INSTRUCTOR }],
  ]);
  let mediaFailure = '',
    uploadFailures = 0,
    stored: { key: string; bytes: Buffer; mimeType: string } | null = null;
  const question = {
    id: fixtureIds.question,
    orderIndex: 0,
    points: 1,
    question: {
      id: 'synthetic-question',
      content: 'Synthetic response task',
      responseType: 'AUDIO_RESPONSE',
      toeicSkill: 'SPEAKING',
      options: [],
      explanation: 'PRIVATE_EXPLANATION',
    },
  };
  const sheet = {
    kind: 'assessment-table',
    version: 1,
    caption: 'Synthetic schedule',
    columns: ['Time', 'Activity'],
    rows: [['08:00', 'Example event']],
    expectedFacts: 'PRIVATE_FACTS',
    rubric: 'PRIVATE_RUBRIC',
    sourceBrief: 'PRIVATE_BRIEF',
  };
  const attempt = {
    id: fixtureIds.attempt,
    learnerId: owner.id,
    status: TestAttemptStatus.IN_PROGRESS,
    startedAt: new Date(),
    submittedAt: null,
    placementGoalScore: 550,
    placementSelfLevel: 'UNKNOWN',
    answers: [] as unknown[],
    skillScores: [],
    test: {
      id: 'synthetic-test',
      title: 'Private HTTP/browser fixture',
      description: null,
      placementMode: PlacementMode.FOUR_SKILLS,
      timeLimitMinutes: 60,
      testQuestions: [question],
      questionGroups: [
        {
          id: 'synthetic-group',
          orderIndex: 0,
          skill: 'SPEAKING',
          taskCode: 'SYNTHETIC_SPEAKING',
          title: 'Synthetic controlled speaking',
          instructions: 'Test fixture only',
          preparationSeconds: 0,
          responseSeconds: 30,
          maxRecordingSeconds: 30,
          audioUrl: null,
          stimulusText: null,
          testQuestions: [question],
          stimuli: [
            {
              id: 'synthetic-table',
              type: 'TEXT',
              orderIndex: 0,
              textContent: JSON.stringify(sheet),
              storageKey: null,
              mimeType: null,
              isProtected: false,
              altText: null,
            },
            {
              id: fixtureIds.audio,
              type: 'AUDIO',
              orderIndex: 1,
              textContent: null,
              storageKey: 'authored/fixture-question.wav',
              mimeType: 'audio/wav',
              isProtected: false,
              altText: null,
            },
            {
              id: fixtureIds.image,
              type: 'IMAGE',
              orderIndex: 2,
              textContent: null,
              storageKey: 'authored/fixture-image.png',
              mimeType: 'image/png',
              isProtected: false,
              altText: 'Synthetic fixture image',
            },
            {
              id: fixtureIds.protected,
              type: 'AUDIO',
              orderIndex: 3,
              textContent: 'PRIVATE_TRANSCRIPT',
              storageKey: 'authored/private.wav',
              mimeType: 'audio/wav',
              isProtected: true,
              altText: null,
            },
          ],
        },
      ],
    },
  };
  const transaction = {
    testAttempt: {
      findFirst: async ({ where }: { where: { id: string; learnerId: string } }) =>
        where.id === fixtureIds.attempt && where.learnerId === owner.id ? attempt : null,
    },
    testAnswer: {
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        attempt.answers = [{ ...create, selectedOptionIds: [] }];
        return { updatedAt: new Date() };
      },
    },
  };
  const prisma = {
    $transaction: async (fn: (tx: typeof transaction) => unknown) => fn(transaction),
  };
  const stimulus = {
    read: async (key: string) => {
      if (key.includes('..')) throw new InvalidAssessmentStimulusMediaKeyError('private-path');
      if (key === 'authored/fixture-question.wav' && mediaFailure !== 'audio') return audioBytes;
      if (key === 'authored/fixture-image.png' && mediaFailure !== 'image') return imageBytes;
      throw new AssessmentStimulusMediaUnavailableError('PRIVATE_STORAGE_DETAIL');
    },
  };
  const responses = {
    put: async (_scope: unknown, bytes: Buffer, mimeType: string) => {
      if (uploadFailures-- > 0) throw new Error('synthetic upload failure');
      stored = { key: 'authored/response.webm', bytes, mimeType };
      return { key: stored.key, bytes: bytes.length, mimeType };
    },
    delete: async () => undefined,
    open: () => Readable.from(stored?.bytes ?? Buffer.alloc(0)),
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [PlacementController, ...(extensions?.controllers ?? [])],
    providers: [
      PlacementService,
      { provide: PrismaService, useValue: prisma },
      { provide: RecommendationService, useValue: {} },
      { provide: AssessmentResponseStorage, useValue: responses },
      { provide: AssessmentStimulusMediaStorage, useValue: stimulus },
      ...(extensions?.providers ?? []),
    ],
  }).overrideGuard(LegacyPlacementFixtureGuard).useValue({canActivate:()=>true}).compile();
  const app = moduleRef.createNestApplication();
  app.use(
    session({
      secret: 'throwaway-fixture-session-secret',
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'lax' },
    }),
  );
  app.use((req: Request, res: Response, next: NextFunction) => {
    const identity = req.path.match(/^\/__fixture\/session\/(owner|other|teacher)$/)?.[1];
    if (identity) {
      req.session.userId = users.get(identity)!.id;
      res.json({ identity });
      return;
    }
    if (req.path === '/__fixture/logout') {
      req.session.destroy(() => res.json({ loggedOut: true }));
      return;
    }
    if (req.path.startsWith('/__fixture/media-error/')) {
      mediaFailure = req.path.split('/').pop() ?? '';
      res.json({ mediaFailure });
      return;
    }
    if (req.path === '/__fixture/upload-fails-once') {
      uploadFailures = 1;
      res.json({ testOnly: true });
      return;
    }
    next();
  });
  const reflector = new Reflector();
  app.useGlobalGuards(
    new AuthGuard(reflector, {
      findById: async (id: string) => [...users.values()].find((u) => u.id === id),
    } as unknown as UsersService),
    new RolesGuard(reflector),
  );
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.setGlobalPrefix('api');
  configure?.(app);
  await app.init();
  return {
    app,
    attempt,
    stimulus,
    responseStorage: responses,
    setMediaFailure: (kind: string) => {
      mediaFailure = kind;
    },
    bytes: audioBytes,
    ids: fixtureIds,
  };
}
