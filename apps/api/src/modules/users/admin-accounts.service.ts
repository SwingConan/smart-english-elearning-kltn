import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { ClassOfferingStatus, Prisma, UserRole, UserStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AdminAccountQueryDto, CreateStaffAccountDto } from './dto/admin-account.dto';

const operationalStatuses: ClassOfferingStatus[] = [
  ClassOfferingStatus.DRAFT,
  ClassOfferingStatus.OPEN,
  ClassOfferingStatus.IN_PROGRESS,
];

const accountSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  assignedClassOfferings: {
    where: { status: { in: operationalStatuses } },
    select: { id: true },
  },
  _count: { select: { assignedClassOfferings: true, enrollments: true } },
} satisfies Prisma.UserSelect;

type AccountRecord = Prisma.UserGetPayload<{ select: typeof accountSelect }>;
type TransactionClient = Prisma.TransactionClient;

const conflict = (code: string, message: string) => new ConflictException({ code, message });

@Injectable()
export class AdminAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminAccountQueryDto) {
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total, summaryTotal, active, inactive, locked] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: accountSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.user.count({ where }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
      this.prisma.user.count({ where: { status: UserStatus.INACTIVE } }),
      this.prisma.user.count({ where: { status: UserStatus.LOCKED } }),
    ]);
    return {
      data: data.map((account) => this.project(account)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      },
      summary: { total: summaryTotal, active, inactive, locked },
    };
  }

  async getById(userId: string) {
    const account = await this.prisma.user.findUnique({
      where: { id: userId },
      select: accountSelect,
    });
    if (!account) throw new NotFoundException('Account not found');
    return this.project(account);
  }

  async create(input: CreateStaffAccountDto) {
    if (![UserRole.INSTRUCTOR, UserRole.ADMIN_COORDINATOR].includes(input.role)) {
      throw new BadRequestException('Only staff accounts can be created');
    }
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    try {
      const account = await this.prisma.user.create({
        data: {
          fullName: input.fullName.trim(),
          email: input.email.trim().toLowerCase(),
          passwordHash,
          role: input.role,
          status: UserStatus.ACTIVE,
        },
        select: accountSelect,
      });
      return this.project(account);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw conflict('ACCOUNT_EMAIL_EXISTS', 'An account with this email already exists');
      }
      throw error;
    }
  }

  async updateRole(
    actorId: string,
    userId: string,
    role: Extract<UserRole, 'INSTRUCTOR' | 'ADMIN_COORDINATOR'>,
  ) {
    if (actorId === userId) {
      throw conflict('ACCOUNT_SELF_ROLE_CHANGE_FORBIDDEN', 'You cannot change your own role');
    }
    return this.prisma.$transaction(
      async (transaction) => {
        const target = await this.requireAccount(transaction, userId);
        if (target.role === UserRole.STUDENT) {
          throw conflict('STUDENT_ROLE_IMMUTABLE', 'Student roles cannot be changed');
        }
        if (target.role === role) return this.project(target);
        await this.assertLastActiveAdminSafe(transaction, target, role, target.status);
        if (
          target.role === UserRole.INSTRUCTOR &&
          role !== UserRole.INSTRUCTOR &&
          target.assignedClassOfferings.length > 0
        ) {
          throw conflict(
            'INSTRUCTOR_OPERATIONAL_ASSIGNMENTS_BLOCK_ROLE',
            'Reassign operational classes before changing this instructor role',
          );
        }
        const updated = await transaction.user.update({
          where: { id: userId },
          data: { role },
          select: accountSelect,
        });
        await this.revokeSessions(transaction, userId);
        return this.project(updated);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async updateStatus(actorId: string, userId: string, status: UserStatus) {
    if (actorId === userId) {
      throw conflict('ACCOUNT_SELF_STATUS_CHANGE_FORBIDDEN', 'You cannot change your own status');
    }
    return this.prisma.$transaction(
      async (transaction) => {
        const target = await this.requireAccount(transaction, userId);
        if (target.status === status) return this.project(target);
        await this.assertLastActiveAdminSafe(transaction, target, target.role, status);
        if (
          target.role === UserRole.INSTRUCTOR &&
          status === UserStatus.INACTIVE &&
          target.assignedClassOfferings.length > 0
        ) {
          throw conflict(
            'INSTRUCTOR_OPERATIONAL_ASSIGNMENTS_BLOCK_INACTIVE',
            'Reassign operational classes before deactivating this instructor',
          );
        }
        const updated = await transaction.user.update({
          where: { id: userId },
          data: { status },
          select: accountSelect,
        });
        await this.revokeSessions(transaction, userId);
        return this.project(updated);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async requireAccount(transaction: TransactionClient, userId: string) {
    const account = await transaction.user.findUnique({
      where: { id: userId },
      select: accountSelect,
    });
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  private async assertLastActiveAdminSafe(
    transaction: TransactionClient,
    target: AccountRecord,
    nextRole: UserRole,
    nextStatus: UserStatus,
  ) {
    if (
      target.role !== UserRole.ADMIN_COORDINATOR ||
      target.status !== UserStatus.ACTIVE ||
      (nextRole === UserRole.ADMIN_COORDINATOR && nextStatus === UserStatus.ACTIVE)
    ) {
      return;
    }
    const otherActiveAdmins = await transaction.user.count({
      where: {
        id: { not: target.id },
        role: UserRole.ADMIN_COORDINATOR,
        status: UserStatus.ACTIVE,
      },
    });
    if (otherActiveAdmins === 0) {
      throw conflict('LAST_ACTIVE_ADMIN_PROTECTED', 'The last active administrator is protected');
    }
  }

  private revokeSessions(transaction: TransactionClient, userId: string) {
    return transaction.userSession.deleteMany({
      where: { sess: { path: ['userId'], equals: userId } },
    });
  }

  private project(account: AccountRecord) {
    return {
      id: account.id,
      email: account.email,
      fullName: account.fullName,
      role: account.role,
      status: account.status,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      context: {
        operationalClassAssignments: account.assignedClassOfferings.length,
        totalClassAssignments: account._count.assignedClassOfferings,
        enrollmentCount: account._count.enrollments,
      },
    };
  }
}
