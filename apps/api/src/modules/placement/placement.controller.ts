import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PublicUser } from '../users/user.types';
import { SavePlacementAnswerDto } from './dto/save-placement-answer.dto';
import { StartPlacementAttemptDto } from './dto/start-placement-attempt.dto';
import { SubmitPlacementAttemptDto } from './dto/submit-placement-attempt.dto';
import { PlacementService } from './placement.service';

@ApiTags('placement')
@Controller('placement')
export class PlacementController {
  constructor(private readonly placementService: PlacementService) {}

  @Public()
  @Get('config')
  @ApiOperation({ summary: 'Get public-safe Placement configuration' })
  getConfig() {
    return this.placementService.getConfig();
  }

  @Roles(UserRole.STUDENT)
  @Post('attempts/start')
  @ApiOperation({ summary: 'Start or resume a learner-owned Placement attempt' })
  start(@CurrentUser() user: PublicUser, @Body() dto: StartPlacementAttemptDto) {
    return this.placementService.startOrResume(user.id, dto);
  }

  @Roles(UserRole.STUDENT)
  @Get('attempts/:id/exam')
  @ApiOperation({ summary: 'Get an answer-safe Placement exam payload' })
  getExam(@CurrentUser() user: PublicUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.placementService.getExam(user.id, id);
  }

  @Roles(UserRole.STUDENT)
  @Put('attempts/:id/answers/:testQuestionId')
  @ApiOperation({ summary: 'Autosave one Placement answer' })
  saveAnswer(
    @CurrentUser() user: PublicUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('testQuestionId', new ParseUUIDPipe()) testQuestionId: string,
    @Body() dto: SavePlacementAnswerDto,
  ) {
    return this.placementService.saveAnswer(user.id, id, testQuestionId, dto);
  }

  @Roles(UserRole.STUDENT)
  @Post('attempts/:id/answers/:testQuestionId/audio')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Upload one learner-owned Speaking response' })
  uploadAudio(
    @CurrentUser() user: PublicUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('testQuestionId', new ParseUUIDPipe()) testQuestionId: string,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    return this.placementService.uploadAudio(user.id, id, testQuestionId, file);
  }

  @Roles(UserRole.STUDENT)
  @Get('attempts/:id/answers/:testQuestionId/audio')
  async playAudioResponse(
    @CurrentUser() user: PublicUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('testQuestionId', new ParseUUIDPipe()) testQuestionId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const media = await this.placementService.openAudioResponse(user.id, id, testQuestionId);
    response.setHeader('Content-Type', media.mimeType);
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(media.stream);
  }

  @Roles(UserRole.STUDENT)
  @Get('attempts/:id/stimuli/:stimulusId/media')
  async getStimulusMedia(
    @CurrentUser() user: PublicUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('stimulusId', new ParseUUIDPipe()) stimulusId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const media = await this.placementService.openStimulusMedia(user.id, id, stimulusId);
    response.setHeader('Content-Type', media.mimeType);
    response.setHeader('Cache-Control', 'private, max-age=300');
    return new StreamableFile(media.body);
  }

  @Roles(UserRole.STUDENT)
  @Post('attempts/:id/submit')
  @ApiOperation({ summary: 'Idempotently submit and objectively score Placement' })
  submit(
    @CurrentUser() user: PublicUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SubmitPlacementAttemptDto,
  ) {
    return this.placementService.submit(user.id, id, dto);
  }

  @Roles(UserRole.STUDENT)
  @Get('attempts/:id/result')
  @ApiOperation({ summary: 'Get an internal, non-official Placement result' })
  getResult(@CurrentUser() user: PublicUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.placementService.getResult(user.id, id);
  }

  @Roles(UserRole.STUDENT)
  @Get('history')
  @ApiOperation({ summary: 'List the current learner Placement history' })
  getHistory(@CurrentUser() user: PublicUser) {
    return this.placementService.getHistory(user.id);
  }
}
