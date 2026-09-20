import { Controller, Get, Patch, Param, ParseUUIDPipe } from '@nestjs/common';
import { LearningService } from './learning.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../../generated/prisma/client';
import { PublicUser } from '../users/user.types';

@Roles(UserRole.STUDENT)
@Controller('learning')
export class LearningController {
  constructor(private readonly learningService: LearningService) {}

  @Get('enrollments/:enrollmentId/content')
  async getContent(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
  ) {
    return this.learningService.getContent(user.id, enrollmentId);
  }

  @Get('enrollments/:enrollmentId/lessons/:lessonId')
  async openLesson(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
    @Param('lessonId', new ParseUUIDPipe()) lessonId: string,
  ) {
    return this.learningService.openLesson(user.id, enrollmentId, lessonId);
  }

  @Patch('enrollments/:enrollmentId/lessons/:lessonId/complete')
  async completeLesson(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
    @Param('lessonId', new ParseUUIDPipe()) lessonId: string,
  ) {
    return this.learningService.completeLesson(user.id, enrollmentId, lessonId);
  }

  @Get('enrollments/:enrollmentId/progress')
  async getProgress(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
  ) {
    return this.learningService.getProgress(user.id, enrollmentId);
  }
}
