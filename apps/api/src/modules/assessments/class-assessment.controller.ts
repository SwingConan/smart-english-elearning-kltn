import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PublicUser } from '../users/user.types';
import { ClassAssessmentService } from './class-assessment.service';
import {
  CreateClassAssessmentDto,
  UpdateClassAssessmentDto,
} from './dto/class-assessment.dto';
import { GradeProductiveAnswerDto } from './dto/grade-answer.dto';

@ApiTags('instructor class assessments')
@Roles(UserRole.INSTRUCTOR)
@Controller('instructor/classes/:classOfferingId/assessments')
export class ClassAssessmentController {
  constructor(private readonly service: ClassAssessmentService) {}

  @Get()
  @ApiOperation({ summary: 'List scheduled assessments for an assigned class' })
  list(
    @CurrentUser() user: PublicUser,
    @Param('classOfferingId', new ParseUUIDPipe()) classOfferingId: string,
  ) {
    return this.service.list(user.id, classOfferingId);
  }

  @Post()
  @ApiOperation({ summary: 'Schedule a published in-class assessment' })
  create(
    @CurrentUser() user: PublicUser,
    @Param('classOfferingId', new ParseUUIDPipe()) classOfferingId: string,
    @Body() dto: CreateClassAssessmentDto,
  ) {
    return this.service.create(user.id, classOfferingId, dto);
  }

  @Get(':classAssessmentId')
  get(
    @CurrentUser() user: PublicUser,
    @Param('classOfferingId', new ParseUUIDPipe()) classOfferingId: string,
    @Param('classAssessmentId', new ParseUUIDPipe()) classAssessmentId: string,
  ) {
    return this.service.get(user.id, classOfferingId, classAssessmentId);
  }

  @Patch(':classAssessmentId')
  update(
    @CurrentUser() user: PublicUser,
    @Param('classOfferingId', new ParseUUIDPipe()) classOfferingId: string,
    @Param('classAssessmentId', new ParseUUIDPipe()) classAssessmentId: string,
    @Body() dto: UpdateClassAssessmentDto,
  ) {
    return this.service.update(user.id, classOfferingId, classAssessmentId, dto);
  }

  @Get(':classAssessmentId/grading')
  gradingQueue(
    @CurrentUser() user: PublicUser,
    @Param('classOfferingId', new ParseUUIDPipe()) classOfferingId: string,
    @Param('classAssessmentId', new ParseUUIDPipe()) classAssessmentId: string,
  ) {
    return this.service.gradingQueue(user.id, classOfferingId, classAssessmentId);
  }

  @Get(':classAssessmentId/attempts/:attemptId/grading')
  gradingDetail(
    @CurrentUser() user: PublicUser,
    @Param('classOfferingId', new ParseUUIDPipe()) classOfferingId: string,
    @Param('classAssessmentId', new ParseUUIDPipe()) classAssessmentId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
  ) {
    return this.service.gradingDetail(
      user.id,
      classOfferingId,
      classAssessmentId,
      attemptId,
    );
  }

  @Put(':classAssessmentId/attempts/:attemptId/answers/:testQuestionId/evaluation')
  gradeAnswer(
    @CurrentUser() user: PublicUser,
    @Param('classOfferingId', new ParseUUIDPipe()) classOfferingId: string,
    @Param('classAssessmentId', new ParseUUIDPipe()) classAssessmentId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Param('testQuestionId', new ParseUUIDPipe()) testQuestionId: string,
    @Body() dto: GradeProductiveAnswerDto,
  ) {
    return this.service.gradeAnswer(
      user.id,
      classOfferingId,
      classAssessmentId,
      attemptId,
      testQuestionId,
      dto,
    );
  }

  @Get(':classAssessmentId/attempts/:attemptId/answers/:testQuestionId/audio')
  async playLearnerAudio(
    @CurrentUser() user: PublicUser,
    @Param('classOfferingId', new ParseUUIDPipe()) classOfferingId: string,
    @Param('classAssessmentId', new ParseUUIDPipe()) classAssessmentId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Param('testQuestionId', new ParseUUIDPipe()) testQuestionId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const media = await this.service.openLearnerAudio(
      user.id,
      classOfferingId,
      classAssessmentId,
      attemptId,
      testQuestionId,
    );
    response.setHeader('Content-Type', media.mimeType);
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(media.stream);
  }
}
