import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
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
