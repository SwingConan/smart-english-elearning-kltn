import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PublicUser } from '../users/user.types';
import { InstructorLearnerMasteryService } from './instructor-learner-mastery.service';

@ApiTags('instructor learner mastery')
@Roles(UserRole.INSTRUCTOR)
@Controller('instructor/courses/:courseId/learner-mastery')
export class InstructorLearnerMasteryController {
  constructor(private readonly learnerMastery: InstructorLearnerMasteryService) {}

  @Get()
  @ApiOperation({ summary: 'Get current learner mastery for assigned ClassOfferings' })
  getDashboard(
    @CurrentUser() user: PublicUser,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
  ) {
    return this.learnerMastery.getDashboard(user.id, courseId);
  }
}
