import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { PublicUser } from '../users/user.types';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { PasswordResetService } from './password-reset.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
    private readonly config: ConfigService,
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
  async requestPasswordReset(@Body() input: RequestPasswordResetDto): Promise<void> {
    await this.passwordResetService.request(input.email);
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
  async login(@Body() input: LoginDto, @Req() request: Request): Promise<PublicUser> {
    const user = await this.authService.login(input);
    await this.regenerateSession(request);
    request.session.userId = user.id;
    await this.saveSession(request);
    return user;
  }

  @Get('me')
  @ApiOperation({ summary: 'Get the current authenticated user' })
  me(@CurrentUser() user: PublicUser): PublicUser {
    return user;
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
      secure: this.config.get<string>('NODE_ENV') === 'production',
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
