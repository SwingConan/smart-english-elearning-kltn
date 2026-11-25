import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { PublicUser } from '../users/user.types';
import { SavePracticeProgressDto, StartPracticeTestDto } from './dto/practice-tests.dto';
import { PracticeTestsService } from './practice-tests.service';

@ApiTags('toeic practice tests')
@Controller('v2/practice-tests')
export class PracticeTestsController {
  constructor(private readonly practiceTestsService: PracticeTestsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List 6 standalone TOEIC mock tests and current learner latest history' })
  listTests(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Cookie');
    const learnerId = req.session?.userId ?? null;
    return this.practiceTestsService.listTests(learnerId);
  }

  @Roles(UserRole.STUDENT)
  @Post(':testId/start')
  @ApiOperation({ summary: 'Start or resume a TOEIC practice mock attempt' })
  startTest(
    @CurrentUser() user: PublicUser,
    @Param('testId', new ParseUUIDPipe()) testId: string,
    @Body() dto: StartPracticeTestDto,
  ) {
    return this.practiceTestsService.startTest(user.id, testId, dto ?? {});
  }

  @Roles(UserRole.STUDENT)
  @Get('attempts/:attemptId')
  @ApiOperation({ summary: 'Load active TOEIC mock exam content without answer keys' })
  getAttempt(
    @CurrentUser() user: PublicUser,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'private, no-store');
    return this.practiceTestsService.getAttempt(user.id, attemptId);
  }

  @Roles(UserRole.STUDENT)
  @Patch('attempts/:attemptId/answers')
  @ApiOperation({ summary: 'Save selected answers, bookmarks, and Listening/Reading progress' })
  saveProgress(
    @CurrentUser() user: PublicUser,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Body() dto: SavePracticeProgressDto,
  ) {
    return this.practiceTestsService.saveProgress(user.id, attemptId, dto);
  }

  @Roles(UserRole.STUDENT)
  @Post('attempts/:attemptId/submit')
  @ApiOperation({ summary: 'Grade TOEIC mock exam and retain only latest attempt for this test' })
  submitAttempt(
    @CurrentUser() user: PublicUser,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
  ) {
    return this.practiceTestsService.submitAttempt(user.id, attemptId);
  }

  @Roles(UserRole.STUDENT)
  @Get(':testId/history')
  @ApiOperation({ summary: 'Get latest submitted TOEIC mock result and Part 5-7 explanations' })
  getLatestHistory(
    @CurrentUser() user: PublicUser,
    @Param('testId', new ParseUUIDPipe()) testId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'private, no-store');
    return this.practiceTestsService.getLatestHistoryByTest(user.id, testId);
  }

  @Roles(UserRole.STUDENT)
  @Get('attempts/:attemptId/result')
  @ApiOperation({ summary: 'Get submitted TOEIC mock result by attemptId' })
  getAttemptResult(
    @CurrentUser() user: PublicUser,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'private, no-store');
    return this.practiceTestsService.getAttemptResult(user.id, attemptId);
  }

  @Public()
  @Get('media/:testSlug/:assetType/:fileName')
  @ApiOperation({ summary: 'Stream TOEIC mock test audio or cropped passage WebP image' })
  serveMedia(
    @Param('testSlug') testSlug: string,
    @Param('assetType') assetType: string,
    @Param('fileName') fileName: string,
    @Res() res: Response,
  ) {
    const filePath = this.practiceTestsService.resolveMediaFile(testSlug, assetType, fileName);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(filePath, { dotfiles: 'allow' });
  }
}
