import { ClassModality, EnrollmentStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { VirtualClassroomService } from './virtual-classroom.service';

describe('VirtualClassroomService session occurrences', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-26T03:30:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('derives Vietnam-time occurrences and only exposes the live join URL', async () => {
    const prisma = {
      enrollment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'enrollment',
          status: EnrollmentStatus.ACTIVE,
          classOffering: {
            id: 'class',
            name: 'Online class',
            code: 'ONL-01',
            modality: ClassModality.ONLINE,
            classStart: new Date('2026-10-01T00:00:00.000Z'),
            classEnd: new Date('2026-12-31T23:59:59.000Z'),
            instructor: { fullName: 'Instructor' },
            scheduleSlots: [
              {
                id: 'slot',
                dayOfWeek: 1,
                startTime: new Date('1970-01-01T10:00:00.000Z'),
                endTime: new Date('1970-01-01T11:00:00.000Z'),
                meetingUrl: 'https://meet.example.com/private-room',
                locationText: null,
              },
            ],
          },
        }),
      },
    };
    const service = new VirtualClassroomService(prisma as unknown as PrismaService);
    const result = await service.get('learner', 'enrollment');

    expect(result.classOffering.scheduleSlots[0]).toEqual(
      expect.objectContaining({ id: 'slot', meetingAvailable: true }),
    );
    expect(result.classOffering.scheduleSlots[0]).not.toHaveProperty('meetingUrl');
    const live = result.occurrences.find((occurrence) => occurrence.status === 'LIVE');
    expect(live).toMatchObject({
      date: '2026-10-26',
      dayOfWeek: 1,
      startAt: new Date('2026-10-26T03:00:00.000Z'),
      endAt: new Date('2026-10-26T04:00:00.000Z'),
      joinUrl: 'https://meet.example.com/private-room',
    });
    expect(
      result.occurrences
        .filter((occurrence) => occurrence.status !== 'LIVE')
        .every((occurrence) => occurrence.joinUrl === null),
    ).toBe(true);
  });
});
