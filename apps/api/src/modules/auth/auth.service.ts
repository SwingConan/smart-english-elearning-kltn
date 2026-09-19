import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { UserStatus } from '../../generated/prisma/client';
import { PublicUser } from '../users/user.types';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}

  async register(input: RegisterDto): Promise<PublicUser> {
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });

    return this.usersService.createStudent({
      email: input.email,
      passwordHash,
      fullName: input.fullName,
    });
  }

  async login(input: LoginDto): Promise<PublicUser> {
    const user = await this.usersService.findByEmail(input.email);

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordMatches = await argon2.verify(user.passwordHash, input.password);
    if (!passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
    };
  }
}
