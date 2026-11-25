import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { UserStatus } from '../../generated/prisma/client';
import { PublicUser } from '../users/user.types';
import { UserProfileDetails, UsersService } from '../users/users.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}

  async register(input: RegisterDto): Promise<PublicUser> {
    if (input.termsAccepted !== true) {
      throw new BadRequestException(
        'Vui lòng đồng ý điều khoản sử dụng và chính sách bảo mật dữ liệu.',
      );
    }

    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });

    return this.usersService.createStudent({
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      termsAccepted: true,
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

  getProfile(userId: string): Promise<UserProfileDetails> {
    return this.usersService.getProfileDetails(userId);
  }

  updateProfile(userId: string, input: UpdateProfileDto): Promise<UserProfileDetails> {
    return this.usersService.updateOwnProfile(userId, input);
  }

  async changePassword(
    userId: string,
    input: ChangePasswordDto,
    currentSessionId?: string,
  ): Promise<void> {
    if (input.currentPassword === input.newPassword) {
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại.');
    }

    const user = await this.usersService.findCredentialsById(userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const matches = await argon2.verify(user.passwordHash, input.currentPassword);
    if (!matches) {
      throw new BadRequestException('Mật khẩu hiện tại không đúng.');
    }

    const nextHash = await argon2.hash(input.newPassword, {
      type: argon2.argon2id,
    });
    await this.usersService.updateOwnPassword(userId, nextHash, currentSessionId);
  }
}
