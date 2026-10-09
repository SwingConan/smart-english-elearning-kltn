import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { Roles } from '../auth/decorators/roles.decorator';
import { PublicUser } from '../users/user.types';
import { AssessmentStudentService } from './assessment-student.service';
import { AssessmentCompatibilityInterceptor } from './assessment-compatibility.interceptor';
import { SaveAttemptAnswersDto } from './dto/save-attempt-answers.dto';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';

@ApiTags('student assessments')
@Roles(UserRole.STUDENT)
@UseInterceptors(AssessmentCompatibilityInterceptor)
@Controller('learning')
export class AssessmentStudentController {
  constructor(private readonly assessmentStudentService: AssessmentStudentService) {}

  @Get('enrollments/:enrollmentId/tests')
  @ApiOperation({ summary: 'List published tests for an active enrollment' })
  listTests(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
  ) {
    return this.assessmentStudentService.listTests(user.id, enrollmentId);
  }

  @Post('enrollments/:enrollmentId/tests/:testId/attempts')
  @ApiOperation({ summary: 'Start or resume a test attempt' })
  startOrResumeAttempt(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
    @Param('testId', new ParseUUIDPipe()) testId: string,
  ) {
    return this.assessmentStudentService.startOrResumeAttempt(user.id, enrollmentId, testId);
  }

  @Get('enrollments/:enrollmentId/attempts/:attemptId')
  @ApiOperation({ summary: 'Get safe test-taking content for an attempt' })
  getAttempt(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
  ) {
    return this.assessmentStudentService.getAttempt(user.id, enrollmentId, attemptId);
  }

  @Patch('enrollments/:enrollmentId/attempts/:attemptId/answers')
  @ApiOperation({ summary: 'Atomically autosave attempt answers' })
  saveAnswers(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Body() dto: SaveAttemptAnswersDto,
  ) {
    return this.assessmentStudentService.saveAnswers(user.id, enrollmentId, attemptId, dto);
  }

  @Post('enrollments/:enrollmentId/attempts/:attemptId/answers/:testQuestionId/audio')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Upload one learner-owned in-class Speaking response' })
  uploadAudio(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Param('testQuestionId', new ParseUUIDPipe()) testQuestionId: string,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    return this.assessmentStudentService.uploadAudio(
      user.id,
      enrollmentId,
      attemptId,
      testQuestionId,
      file,
    );
  }

  @Get('enrollments/:enrollmentId/attempts/:attemptId/answers/:testQuestionId/audio')
  async playAudioResponse(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Param('testQuestionId', new ParseUUIDPipe()) testQuestionId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const media = await this.assessmentStudentService.openAudioResponse(
      user.id,
      enrollmentId,
      attemptId,
      testQuestionId,
    );
    response.setHeader('Content-Type', media.mimeType);
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(media.stream);
  }

  @Get('enrollments/:enrollmentId/attempts/:attemptId/stimuli/:stimulusId/media')
  async getStimulusMedia(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Param('stimulusId', new ParseUUIDPipe()) stimulusId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const media = await this.assessmentStudentService.openStimulusMedia(
      user.id,
      enrollmentId,
      attemptId,
      stimulusId,
    );
    response.setHeader('Content-Type', media.mimeType);
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(media.body);
  }

  @Post('enrollments/:enrollmentId/attempts/:attemptId/submit')
  @ApiOperation({ summary: 'Submit and score final answers' })
  submitAttempt(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Body() dto: SubmitAttemptDto,
  ) {
    return this.assessmentStudentService.submitAttempt(user.id, enrollmentId, attemptId, dto);
  }

  @Get('enrollments/:enrollmentId/attempts/:attemptId/result')
  @ApiOperation({ summary: 'Get a published submitted-attempt result' })
  getResult(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
  ) {
    return this.assessmentStudentService.getResult(user.id, enrollmentId, attemptId);
  }
}
