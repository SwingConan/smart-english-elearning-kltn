import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  PublicUser,
  publicUserSelect,
  UserCredentials,
  userCredentialsSelect,
} from './user.types';

interface CreateStudentInput {
  email: string;
  passwordHash: string;
  fullName: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  findById(id: string): Promise<PublicUser | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
  }

  findByEmail(email: string): Promise<UserCredentials | null> {
    return this.prisma.user.findUnique({
      where: { email: this.normalizeEmail(email) },
      select: userCredentialsSelect,
    });
  }

  async createStudent(input: CreateStudentInput): Promise<PublicUser> {
    try {
      return await this.prisma.user.create({
        data: {
          email: this.normalizeEmail(input.email),
          passwordHash: input.passwordHash,
          fullName: input.fullName.trim(),
          role: UserRole.STUDENT,
          status: UserStatus.ACTIVE,
        },
        select: publicUserSelect,
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('An account with this email already exists');
      }

      throw error;
    }
  }
}
