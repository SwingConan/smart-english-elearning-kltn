import { BadRequestException } from '@nestjs/common';
import { AcademicService } from './academic.service';
import type { PublicUser } from '../users/user.types';

describe('AcademicService Direction A (Course Setup, LMS Sections & Class Roadmap)', () => {
  const actor = { id: 'mgr-1', sessionId: 'sess-1' };
  const user: PublicUser = {
    id: 'mgr-1',
    email: 'academic@smartenglish.local',
    fullName: 'Quản lý Học vụ',
    role: 'ACADEMIC_MANAGER',
    status: 'ACTIVE',
  };

  function makeHarness() {
    const createdSections: Array<{ title: string; orderIndex: number }> = [];
    const createdRoadmap: Array<Record<string, unknown>> = [];
    const createdSessions: Array<Record<string, unknown>> = [];

    const tx: Record<string, any> = {
      $queryRaw: jest.fn().mockResolvedValue([{ ms: Date.now() }]),
      user: {
        findUnique: jest.fn().mockResolvedValue({ role: 'ACADEMIC_MANAGER', status: 'ACTIVE' }),
      },
      course: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'course-1',
          createdById: 'mgr-1',
          defaultSessionsCount: 4,
          defaultPeriodsPerSession: 3,
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'course-1', isPublished: true }),
        update: jest.fn().mockResolvedValue({ id: 'course-1', isPublished: true }),
      },
      module: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'mod-1',
            title: 'Học phần 1: Ngữ pháp',
            description: 'Nền tảng',
            orderIndex: 0,
            lessons: [{ id: 'les-1', title: 'Bài 1: Từ loại', orderIndex: 0 }],
          },
          {
            id: 'mod-2',
            title: 'Học phần 2: Đọc hiểu',
            description: 'Part 7',
            orderIndex: 1,
            lessons: [{ id: 'les-2', title: 'Bài 2: Quét từ khóa', orderIndex: 0 }],
          },
        ]),
        create: jest.fn().mockResolvedValue({ id: 'mod-new' }),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      lesson: {
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({}),
      },
      classOffering: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cls-1',
          courseId: 'course-1',
          code: 'SE-READ-550-246',
          name: 'TOEIC Reading 550+',
          modality: 'OFFLINE',
          pricingType: 'PAID',
          tuitionFeeVnd: 1850000,
          totalSessions: 4,
          periodsPerSession: 3,
          defaultRoomId: 'room-1',
          instructorId: 'inst-1',
          classStart: new Date('2026-11-23T00:00:00+07:00'),
          course: {
            modules: [
              {
                id: 'mod-1',
                title: 'Học phần 1: Ngữ pháp',
                description: 'Nền tảng',
                lessons: [{ id: 'les-1', title: 'Bài 1: Từ loại' }],
              },
              {
                id: 'mod-2',
                title: 'Học phần 2: Đọc hiểu',
                description: 'Part 7',
                lessons: [{ id: 'les-2', title: 'Bài 2: Quét từ khóa' }],
              },
            ],
          },
          defaultRoom: { id: 'room-1', code: 'A2.04', name: 'Phòng A2.04', location: 'Nhà A' },
          scheduleSlots: [
            {
              id: 'slot-1',
              dayOfWeek: 1,
              startTime: new Date('1970-01-01T18:30:00.000Z'),
              endTime: new Date('1970-01-01T20:45:00.000Z'),
              roomId: 'room-1',
              room: { id: 'room-1', code: 'A2.04', name: 'Phòng A2.04', location: 'Nhà A' },
              locationText: 'A2.04 — Phòng A2.04',
              meetingUrl: null,
            },
            {
              id: 'slot-2',
              dayOfWeek: 3,
              startTime: new Date('1970-01-01T18:30:00.000Z'),
              endTime: new Date('1970-01-01T20:45:00.000Z'),
              roomId: 'room-1',
              room: { id: 'room-1', code: 'A2.04', name: 'Phòng A2.04', location: 'Nhà A' },
              locationText: 'A2.04 — Phòng A2.04',
              meetingUrl: null,
            },
          ],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      room: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'room-1',
          code: 'A2.04',
          name: 'Phòng A2.04',
          location: 'Nhà A',
        }),
      },
      classInstructorAssignment: {
        findFirst: jest.fn().mockResolvedValue({ id: 'assign-1' }),
      },
      classRoadmapItem: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          createdRoadmap.push(data);
          return data;
        }),
      },
      teachingSession: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          createdSessions.push(data);
          return { id: `ts-${createdSessions.length}` };
        }),
      },
      w06Window: { count: jest.fn().mockResolvedValue(0) },
      classSection: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'sec-existing', title: 'Học phần 1: Ngữ pháp', orderIndex: 0 }]),
        create: jest.fn().mockImplementation(async ({ data }: { data: { title: string; orderIndex: number } }) => {
          createdSections.push(data);
          return { id: 'sec-new', ...data };
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      classSectionRevision: {
        create: jest.fn().mockResolvedValue({ id: 'rev-1' }),
      },
    };

    const prisma: Record<string, any> = {
      $transaction: jest.fn().mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
      $queryRaw: jest.fn().mockResolvedValue([{ ms: Date.now() }]),
      classInstructorAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      classOffering: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cls-1',
          courseId: 'course-1',
          code: 'SE-READ-550-246',
          name: 'TOEIC Reading 550+',
          status: 'OPEN',
          modality: 'OFFLINE',
          totalSessions: 4,
          totalPeriods: 12,
          periodsPerSession: 3,
          durationWeeks: 2,
          course: { id: 'course-1', title: 'TOEIC 550+', isPublished: true, createdById: 'mgr-1' },
          instructor: { id: 'inst-1', fullName: 'GV TOEIC' },
          scheduleSlots: [],
          _count: { enrollments: 0 },
        }),
      },
      enrollment: { count: jest.fn().mockResolvedValue(0) },
      classRoadmapItem: {
        findMany: jest.fn().mockImplementation(async () =>
          createdRoadmap.map((r) => ({
            ...r,
            sessionDate: r.sessionDate,
            room: { id: 'room-1', code: 'A2.04', name: 'Phòng A2.04', location: 'Nhà A' },
          })),
        ),
      },
      classSection: { count: jest.fn().mockResolvedValue(2) },
    };

    const authority = {
      requireActor: jest.fn().mockResolvedValue(undefined),
      audit: jest.fn().mockResolvedValue(undefined),
    };

    const service = new AcademicService(prisma as never, authority as never);
    return { service, tx, createdRoadmap, createdSessions, createdSections };
  }

  it('publishProgram directly toggles Course.isPublished without maker-checker self-block', async () => {
    const { service, tx } = makeHarness();
    const res = await service.publishProgram(actor, 'course-1', { isPublished: true });
    expect(tx.course.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'course-1' },
        data: { isPublished: true },
      }),
    );
    expect(res).toEqual({ id: 'course-1', isPublished: true });
  });

  it('syncLmsSections creates missing ClassSections without overwriting existing sections', async () => {
    const { service, createdSections } = makeHarness();
    const res = await service.syncLmsSections(actor, 'cls-1');
    expect(createdSections).toHaveLength(1);
    expect(createdSections[0].title).toBe('Học phần 2: Đọc hiểu');
    expect(createdSections[0].orderIndex).toBe(1);
    expect(res).toEqual({ createdCount: 1, totalSections: 2 });
  });

  it('generateRoadmap builds dated session rows from weekly schedule, room, and curriculum and initializes LMS sections', async () => {
    const { service, tx, createdRoadmap, createdSessions, createdSections } = makeHarness();
    await service.generateRoadmap(actor, user, 'cls-1', {
      totalSessions: 4,
      periodsPerSession: 3,
      syncTeachingSessions: true,
      syncLmsSections: true,
    });

    expect(createdRoadmap).toHaveLength(4);
    expect(createdSessions).toHaveLength(4);
    expect(createdSections).toHaveLength(1);
    // Mon 2026-11-23, Wed 2026-11-25, Mon 2026-11-30, Wed 2026-12-02
    expect((createdRoadmap[0].sessionDate as Date).toISOString().slice(0, 10)).toBe('2026-11-23');
    expect((createdRoadmap[3].sessionDate as Date).toISOString().slice(0, 10)).toBe('2026-12-02');
    expect(createdRoadmap[0].weekNumber).toBe(1);
    expect(createdRoadmap[3].weekNumber).toBe(2);
    expect(tx.classOffering.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cls-1' },
        data: expect.objectContaining({
          totalSessions: 4,
          periodsPerSession: 3,
          totalPeriods: 12,
          durationWeeks: 2,
        }),
      }),
    );
  });

  it('generateRoadmap partitions ALL modules and lessons across fewer sessions without dropping trailing content', async () => {
    const { service, tx, createdRoadmap } = makeHarness();
    const orig = await tx.classOffering.findUnique();
    tx.classOffering.findUnique.mockResolvedValue({
      ...orig,
      scheduleSlots: orig.scheduleSlots.map((s: any) => ({
        ...s,
        startTime: new Date('1970-01-01T18:30:00.000Z'),
        endTime: new Date('1970-01-01T20:00:00.000Z'),
      })),
      course: {
        modules: [
          { id: 'm1', title: 'HP1', lessons: [{ id: 'l1', title: 'Bài 1' }, { id: 'l2', title: 'Bài 2' }] },
          { id: 'm2', title: 'HP2', lessons: [{ id: 'l3', title: 'Bài 3' }, { id: 'l4', title: 'Bài 4' }] },
          { id: 'm3', title: 'HP3', lessons: [{ id: 'l5', title: 'Bài 5' }, { id: 'l6', title: 'Bài 6' }] },
          { id: 'm4', title: 'HP4', lessons: [{ id: 'l7', title: 'Bài 7' }, { id: 'l8', title: 'Bài 8' }] },
        ],
      },
    });
    await service.generateRoadmap(actor, user, 'cls-1', {
      totalSessions: 4,
      syncTeachingSessions: false,
      syncLmsSections: false,
    });
    expect(createdRoadmap).toHaveLength(4);
    expect(createdRoadmap[0].periods).toBe(2);
    expect(createdRoadmap[0].topicTitle).toBe('HP1');
    expect(createdRoadmap[0].contentSummary).toBe('Bài 1 • Bài 2');
    expect(createdRoadmap[3].topicTitle).toBe('HP4');
    expect(createdRoadmap[3].contentSummary).toBe('Bài 7 • Bài 8');
  });

  it('generateRoadmap throws clear error when scheduleSlots are empty', async () => {
    const { service, tx } = makeHarness();
    tx.classOffering.findUnique.mockResolvedValue({
      id: 'cls-1',
      courseId: 'course-1',
      classStart: new Date('2026-11-23T00:00:00+07:00'),
      course: { modules: [] },
      scheduleSlots: [],
    });
    await expect(service.generateRoadmap(actor, user, 'cls-1', {})).rejects.toThrow(
      BadRequestException,
    );
  });
});
