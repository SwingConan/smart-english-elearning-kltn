import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { UserStatus } from '../../generated/prisma/client';
import { EmailSender } from '../../infrastructure/email/email-sender';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PasswordResetService } from './password-reset.service';

describe('PasswordResetService shutdown lifecycle', () => {
  it('drains blocked reset DB work before Prisma disconnects without an unhandled rejection', async () => {
    const events: string[] = [];
    let releaseLookup!: () => void;
    let markLookupStarted!: () => void;
    const lookupStarted = new Promise<void>((resolve) => {
      markLookupStarted = resolve;
    });
    const lookupGate = new Promise<void>((resolve) => {
      releaseLookup = resolve;
    });
    const activeUser = {
      id: '10000000-0000-4000-8000-000000000001',
      email: 'shutdown@example.com',
      status: UserStatus.ACTIVE,
    };
    let lookupCount = 0;

    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ email: activeUser.email, status: UserStatus.ACTIVE }]),
      passwordResetToken: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockImplementation(async () => {
          events.push('db-work-complete');
          return { id: '20000000-0000-4000-8000-000000000002' };
        }),
      },
    };
    const disconnect = jest.fn().mockImplementation(async () => {
      events.push('prisma-disconnect');
    });
    const prisma = {
      passwordResetToken: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findUnique: jest.fn().mockImplementation(async () => {
          lookupCount += 1;
          if (lookupCount === 1) {
            markLookupStarted();
            await lookupGate;
          }
          return activeUser;
        }),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
      $disconnect: disconnect,
      onApplicationShutdown: PrismaService.prototype.onApplicationShutdown,
    };
    const emailSender = {
      send: jest.fn().mockImplementation(async () => {
        events.push('email-sent');
      }),
    };
    const unhandled: unknown[] = [];
    const captureUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', captureUnhandled);

    let app: INestApplication | undefined;
    let lookupReleased = false;
    let shutdown: Promise<void> | undefined;
    try {
      const moduleRef = await Test.createTestingModule({
        providers: [
          PasswordResetService,
          { provide: PrismaService, useValue: prisma },
          { provide: EmailSender, useValue: emailSender },
          {
            provide: ConfigService,
            useValue: new ConfigService({
              NODE_ENV: 'test',
              PASSWORD_RESET_TTL_MINUTES: '30',
              WEB_ORIGIN: 'http://localhost:5173',
            }),
          },
        ],
      }).compile();
      app = moduleRef.createNestApplication();
      await app.init();

      app.get(PasswordResetService).request(activeUser.email);
      await lookupStarted;

      let shutdownComplete = false;
      shutdown = app.close().then(() => {
        shutdownComplete = true;
        events.push('shutdown-complete');
      });
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(shutdownComplete).toBe(false);
      expect(disconnect).not.toHaveBeenCalled();

      releaseLookup();
      lookupReleased = true;
      await shutdown;
      app = undefined;

      expect(events).toEqual([
        'db-work-complete',
        'email-sent',
        'prisma-disconnect',
        'shutdown-complete',
      ]);
      expect(unhandled).toEqual([]);
    } finally {
      try {
        if (!lookupReleased) releaseLookup();
        if (shutdown) await shutdown;
        else if (app) await app.close();
      } finally {
        process.off('unhandledRejection', captureUnhandled);
      }
    }
  });
});
