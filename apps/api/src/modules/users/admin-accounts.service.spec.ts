import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { ClassOfferingStatus, Prisma, UserRole, UserStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AdminAccountsService } from './admin-accounts.service';

describe('AdminAccountsService', () => {
  const now = new Date('2026-10-21T00:00:00.000Z');
  const account = (overrides: Record<string, unknown> = {}) => ({
    id: 'target-id',
    email: 'staff@example.com',
    fullName: 'Staff User',
    role: UserRole.INSTRUCTOR,
    status: UserStatus.ACTIVE,
    createdAt: now,
    updatedAt: now,
    assignedClassOfferings: [],
    _count: { assignedClassOfferings: 2, enrollments: 0 },
    ...overrides,
  });
  const prisma = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    userSession: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new AdminAccountsService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (work: unknown) => {
      if (typeof work === 'function') return work(prisma);
      return Promise.all(work as Promise<unknown>[]);
    });
    prisma.user.findUnique.mockResolvedValue(account());
    prisma.user.update.mockImplementation(({ data }) => Promise.resolve(account(data)));
    prisma.user.count.mockResolvedValue(1);
    prisma.userSession.deleteMany.mockResolvedValue({ count: 1 });
  });

  it('lists sanitized accounts with search/filter/pagination and whole-directory summary', async () => {
    prisma.user.findMany.mockResolvedValue([account()]);
    prisma.user.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);

    const result = await service.list({
      search: 'Staff',
      role: UserRole.INSTRUCTOR,
      status: UserStatus.ACTIVE,
      page: 2,
      limit: 20,
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ role: UserRole.INSTRUCTOR, status: UserStatus.ACTIVE }),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: 20,
        take: 20,
      }),
    );
    expect(result.summary).toEqual({ total: 8, active: 5, inactive: 2, locked: 1 });
    expect(result.data[0]).toMatchObject({
      context: { operationalClassAssignments: 0, totalClassAssignments: 2, enrollmentCount: 0 },
    });
    expect(result.data[0]).not.toHaveProperty('passwordHash');
    expect(result.data[0]).not.toHaveProperty('assignedClassOfferings');
  });

  it('returns account dependency details and maps unknown ids to 404', async () => {
    await expect(service.getById('target-id')).resolves.toMatchObject({ id: 'target-id' });
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.getById('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates normalized ACTIVE staff with Argon2id and no password output', async () => {
    prisma.user.create.mockResolvedValue(
      account({
        email: 'staff@example.com',
        fullName: 'Staff User',
      }),
    );
    const result = await service.create({
      email: ' Staff@Example.COM ',
      fullName: ' Staff User ',
      password: 'Password!2026',
      role: UserRole.INSTRUCTOR,
    });
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      email: 'staff@example.com',
      fullName: 'Staff User',
      role: UserRole.INSTRUCTOR,
      status: UserStatus.ACTIVE,
    });
    expect(data.passwordHash).toMatch(/^\$argon2id\$/);
    await expect(argon2.verify(data.passwordHash, 'Password!2026')).resolves.toBe(true);
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('rejects student creation and maps duplicate email to a stable conflict', async () => {
    await expect(
      service.create({
        email: 'student@example.com',
        fullName: 'Student',
        password: 'Password!2026',
        role: UserRole.STUDENT as never,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    prisma.user.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '7.10.0',
      }),
    );
    await expect(
      service.create({
        email: 'staff@example.com',
        fullName: 'Staff',
        password: 'Password!2026',
        role: UserRole.INSTRUCTOR,
      }),
    ).rejects.toMatchObject({ response: { code: 'ACCOUNT_EMAIL_EXISTS' } });
  });

  it('forbids self role/status mutations', async () => {
    await expect(
      service.updateRole('target-id', 'target-id', UserRole.ADMIN_COORDINATOR),
    ).rejects.toMatchObject({ response: { code: 'ACCOUNT_SELF_ROLE_CHANGE_FORBIDDEN' } });
    await expect(
      service.updateStatus('target-id', 'target-id', UserStatus.LOCKED),
    ).rejects.toMatchObject({ response: { code: 'ACCOUNT_SELF_STATUS_CHANGE_FORBIDDEN' } });
  });

  it('keeps student roles immutable', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(account({ role: UserRole.STUDENT }));
    await expect(
      service.updateRole('actor', 'target-id', UserRole.INSTRUCTOR),
    ).rejects.toMatchObject({ response: { code: 'STUDENT_ROLE_IMMUTABLE' } });
  });

  it.each([
    ['role', () => service.updateRole('actor', 'target-id', UserRole.INSTRUCTOR)],
    ['status', () => service.updateStatus('actor', 'target-id', UserStatus.INACTIVE)],
  ])('protects the last active admin during a %s transition', async (_name, mutate) => {
    prisma.user.findUnique.mockResolvedValueOnce(account({ role: UserRole.ADMIN_COORDINATOR }));
    prisma.user.count.mockResolvedValueOnce(0);
    await expect(mutate()).rejects.toMatchObject({
      response: { code: 'LAST_ACTIVE_ADMIN_PROTECTED' },
    });
  });

  it('blocks operational instructor role/deactivation changes but allows emergency lock', async () => {
    const operational = account({
      assignedClassOfferings: [{ id: 'class-id', status: ClassOfferingStatus.OPEN }],
    });
    prisma.user.findUnique.mockResolvedValueOnce(operational);
    await expect(
      service.updateRole('actor', 'target-id', UserRole.ADMIN_COORDINATOR),
    ).rejects.toMatchObject({
      response: { code: 'INSTRUCTOR_OPERATIONAL_ASSIGNMENTS_BLOCK_ROLE' },
    });
    prisma.user.findUnique.mockResolvedValueOnce(operational);
    await expect(
      service.updateStatus('actor', 'target-id', UserStatus.INACTIVE),
    ).rejects.toMatchObject({
      response: { code: 'INSTRUCTOR_OPERATIONAL_ASSIGNMENTS_BLOCK_INACTIVE' },
    });
    prisma.user.findUnique.mockResolvedValueOnce(operational);
    await expect(
      service.updateStatus('actor', 'target-id', UserStatus.LOCKED),
    ).resolves.toMatchObject({ status: UserStatus.LOCKED });
  });

  it('permits historical-only instructor role changes and revokes sessions by JSON userId', async () => {
    await expect(
      service.updateRole('actor', 'target-id', UserRole.ADMIN_COORDINATOR),
    ).resolves.toMatchObject({ role: UserRole.ADMIN_COORDINATOR });
    expect(prisma.userSession.deleteMany).toHaveBeenCalledWith({
      where: { sess: { path: ['userId'], equals: 'target-id' } },
    });
  });

  it('revokes sessions on actual status changes and keeps same-value updates idempotent', async () => {
    await service.updateStatus('actor', 'target-id', UserStatus.LOCKED);
    expect(prisma.userSession.deleteMany).toHaveBeenCalledTimes(1);
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (work: unknown) =>
      typeof work === 'function' ? work(prisma) : Promise.all(work as Promise<unknown>[]),
    );
    prisma.user.findUnique.mockResolvedValue(account());
    await service.updateStatus('actor', 'target-id', UserStatus.ACTIVE);
    await service.updateRole('actor', 'target-id', UserRole.INSTRUCTOR);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.userSession.deleteMany).not.toHaveBeenCalled();
  });

  it('returns 404 for role/status mutation of an unknown account', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.updateStatus('actor', 'missing', UserStatus.LOCKED),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
