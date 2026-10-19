import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PublicUser } from '../users/user.types';
import { StudyRecommendationService } from './study-recommendation.service';

@Roles(UserRole.STUDENT)
@Controller('learning/enrollments/:enrollmentId/recommendations')
export class StudyRecommendationController {
  constructor(private readonly service: StudyRecommendationService) {}

  @Get()
  getRecommendations(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
  ) {
    return this.service.getForLearner(user.id, enrollmentId);
  }
}
