import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Optional,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthorizationService } from '../authorization/authorization.service';
import type { AcademicTrackProfile } from '../authorization/academic-track';
import { PublicUser } from '../users/user.types';
import { UserProfileDetails } from '../users/users.service';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PasswordResetService } from './password-reset.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
    private readonly config: ConfigService,
    @Optional() private readonly authority?: AuthorizationService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a student account' })
  register(@Body() input: RegisterDto): Promise<PublicUser> {
    return this.authService.register(input);
  }

  @Public()
  @Post('password-reset/request')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(ThrottlerGuard)
  @Throttle({ passwordReset: { limit: 5, ttl: 15 * 60 * 1000 } })
  @ApiOperation({ summary: 'Request a password-reset email' })
  requestPasswordReset(@Body() input: RequestPasswordResetDto): void {
    this.passwordResetService.request(input.email);
  }

  @Public()
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Confirm a password reset' })
  async confirmPasswordReset(@Body() input: ConfirmPasswordResetDto): Promise<void> {
    await this.passwordResetService.confirm(input.token, input.newPassword);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with a server-side session' })
  async login(
    @Body() input: LoginDto,
    @Req() request: Request,
  ): Promise<PublicUser & { avatarUrl?: string } & Partial<AcademicTrackProfile>> {
    const user = await this.authService.login(input);
    await this.regenerateSession(request);
    request.session.userId = user.id;
    await this.saveSession(request);
    const profile = await this.authService.getProfile(user.id);
    const trackProfile =
      user.role === 'ACADEMIC_MANAGER' && this.authority
        ? await this.authority.academicProfile(user.id, user.role)
        : undefined;
    return {
      ...user,
      ...(profile.preferences.avatarUrl ? { avatarUrl: profile.preferences.avatarUrl } : {}),
      ...(trackProfile ?? {}),
    };
  }

  @Get('me')
  @ApiOperation({ summary: 'Get the current authenticated user' })
  async me(
    @CurrentUser() user: PublicUser,
  ): Promise<PublicUser & { avatarUrl?: string } & Partial<AcademicTrackProfile>> {
    const profile = await this.authService.getProfile(user.id);
    const trackProfile =
      user.role === 'ACADEMIC_MANAGER' && this.authority
        ? await this.authority.academicProfile(user.id, user.role)
        : undefined;
    return {
      ...user,
      ...(profile.preferences.avatarUrl ? { avatarUrl: profile.preferences.avatarUrl } : {}),
      ...(trackProfile ?? {}),
    };
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get the current user profile and personal preferences' })
  getProfile(@CurrentUser() user: PublicUser): Promise<UserProfileDetails> {
    return this.authService.getProfile(user.id);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update own profile details and personal preferences' })
  updateProfile(
    @CurrentUser() user: PublicUser,
    @Body() input: UpdateProfileDto,
  ): Promise<UserProfileDetails> {
    return this.authService.updateProfile(user.id, input);
  }

  @Post('profile/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Change own password and revoke other active sessions' })
  async changePassword(
    @CurrentUser() user: PublicUser,
    @Body() input: ChangePasswordDto,
    @Req() request: Request,
  ): Promise<void> {
    await this.authService.changePassword(user.id, input, request.sessionID);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Destroy the current server-side session' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      request.session.destroy((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    response.clearCookie('sel.sid', {
      httpOnly: true,
      secure:
        this.config.get<string>('NODE_ENV') === 'production' ||
        this.config.get<string>('VPS_DEPLOY_APPROVED') === 'SMART_ENGLISH_VPS_2026',
      sameSite: 'lax',
      path: '/',
    });
  }

  private regenerateSession(request: Request): Promise<void> {
    return new Promise((resolve, reject) => {
      request.session.regenerate((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private saveSession(request: Request): Promise<void> {
    return new Promise((resolve, reject) => {
      request.session.save((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}
