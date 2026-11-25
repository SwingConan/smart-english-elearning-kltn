import { ConflictException } from '@nestjs/common';
import { AcademicPlanningService } from './academic-planning.service';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuthorizationService } from '../authorization/authorization.service';

describe('Q02 AcademicPlanningService conflict and immutability rules', () => {
  const now = new Date('2026-11-15T08:00:00.000Z');
  const futureStart = new Date('2026-11-20T09:00:00.000Z');
  const futureEnd = new Date('2026-11-20T11:00:00.000Z');
  const actor = { id: 'hvu-1', sessionId: 'sess-1' };

  function makeService(overrides: Partial<Record<string, any>> = {}) {
    const tx = {
      $executeRaw: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue([{ ms: now.getTime() }]),
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'hvu-1',
          role: 'ACADEMIC_MANAGER',
          status: 'ACTIVE',
        }),
      },
      classOffering: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'class-1',
          course: { createdById: 'hvu-1' },
          modality: 'OFFLINE',
          maxStudents: 25,
        }),
      },
      room: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'room-1',
          status: 'ACTIVE',
          capacity: 30,
          capabilities: ['WHITEBOARD'],
        }),
      },
      classInstructorAssignment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'assign-1',
          classOfferingId: 'class-1',
          instructorId: 'inst-1',
          state: 'PUBLISHED',
          effectiveFrom: new Date('2026-11-01T00:00:00.000Z'),
          reservedUntil: new Date('2026-12-31T00:00:00.000Z'),
        }),
      },
      classScheduleSlot: { findUnique: jest.fn() },
      teachingSession: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'sess-new',
            occurrenceId: 'occ-1',
            revision: 1,
            supersedesId: null,
            sourceTemplateId: null,
            sourceTemplateUpdatedAt: null,
            ...data,
          }),
        ),
        update: jest.fn(),
      },
      domainAuditEvent: { create: jest.fn() },
      ...overrides,
    };
    const db = {
      $transaction: jest.fn().mockImplementation((fn: (client: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as PrismaService;
    const authority = {
      requireActor: jest.fn().mockResolvedValue(undefined),
      audit: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthorizationService;
    return { service: new AcademicPlanningService(db, authority), tx };
  }

  it('rejects session creation when room or instructor overlaps an existing active/pending session', async () => {
    const { service } = makeService({
      teachingSession: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          {
            classOfferingId: 'other-class',
            roomId: 'room-1',
            instructorId: 'inst-1',
          },
        ]),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'sess-conflict',
            supersedesId: null,
            sourceTemplateId: null,
            sourceTemplateUpdatedAt: null,
            ...data,
          }),
        ),
        update: jest.fn(),
      },
    });

    await expect(
      service.createSession(actor, 'class-1', {
        startLocal: '2026-11-20T16:00',
        endLocal: '2026-11-20T18:00',
        timezone: 'Asia/Ho_Chi_Minh',
        modality: 'OFFLINE',
        roomId: 'room-1',
        assignmentId: 'assign-1',
        requiredCapabilities: ['WHITEBOARD'],
        reason: 'Schedule overlapping session',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects draft modification when session startsAt is already in the past', async () => {
    const { service } = makeService({
      teachingSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'sess-past',
          classOfferingId: 'class-1',
          proposedBy: 'hvu-1',
          state: 'DRAFT',
          intent: 'PUBLISH',
          lockVersion: 1,
          startsAt: new Date('2026-11-15T07:00:00.000Z'),
          endsAt: new Date('2026-11-15T09:00:00.000Z'),
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    });

    await expect(
      service.updateSession(actor, 'sess-past', {
        startLocal: '2026-11-20T16:00',
        endLocal: '2026-11-20T18:00',
        timezone: 'Asia/Ho_Chi_Minh',
        modality: 'OFFLINE',
        roomId: 'room-1',
        assignmentId: 'assign-1',
        requiredCapabilities: [],
        reason: 'Attempt edit past draft',
        expectedLockVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks publishing on approve when assignment is missing or unapproved', async () => {
    const { service } = makeService({
      classInstructorAssignment: { findUnique: jest.fn().mockResolvedValue(null) },
      teachingSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'sess-no-assign',
          classOfferingId: 'class-1',
          proposedBy: 'other-hvu',
          state: 'PENDING_APPROVAL',
          intent: 'PUBLISH',
          lockVersion: 1,
          startsAt: futureStart,
          endsAt: futureEnd,
          modality: 'ONLINE',
          roomId: null,
          assignmentId: null,
          instructorId: null,
          requiredCapabilities: [],
          supersedesId: null,
          sourceTemplateId: null,
          sourceTemplateUpdatedAt: null,
        }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
    });

    await expect(
      service.approve(actor, 'sessions', 'sess-no-assign', {
        reason: 'Publish without assignment',
        expectedLockVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
