import { Body, Controller, Get, Put } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdateStudyRecommendationPolicyDto } from './dto/update-study-recommendation-policy.dto';
import { StudyRecommendationService } from './study-recommendation.service';

@Roles(UserRole.ADMIN_COORDINATOR)
@Controller('admin/study-recommendation-policy')
export class AdminStudyRecommendationController {
  constructor(private readonly service: StudyRecommendationService) {}

  @Get()
  getPolicy() {
    return this.service.getActivePolicy();
  }

  @Put()
  updatePolicy(@Body() input: UpdateStudyRecommendationPolicyDto) {
    return this.service.updateActivePolicy(input);
  }
}
