import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminCriteriaService } from './admin-criteria.service';
import {
  AdminCourseRecommendationQueryDto,
  UpdateCourseRecommendationProfileDto,
  UpdatePlacementEvaluationCriteriaDto,
} from './dto/admin-criteria.dto';

@ApiTags('admin criteria')
@Roles(UserRole.ADMIN_COORDINATOR)
@Controller('admin/criteria')
export class AdminCriteriaController {
  constructor(private readonly service: AdminCriteriaService) {}

  @Get('placement-evaluation')
  @ApiOperation({ summary: 'Get the active deterministic Placement L&R criteria' })
  getPlacementEvaluation() {
    return this.service.getPlacementEvaluation();
  }

  @Put('placement-evaluation')
  @ApiOperation({ summary: 'Update the shared Placement L&R normalized boundaries' })
  updatePlacementEvaluation(@Body() input: UpdatePlacementEvaluationCriteriaDto) {
    return this.service.updatePlacementEvaluation(input);
  }

  @Get('course-recommendations')
  @ApiOperation({ summary: 'List courses and their deterministic recommendation profiles' })
  listCourseRecommendations(@Query() query: AdminCourseRecommendationQueryDto) {
    return this.service.listCourseRecommendations(query);
  }

  @Get('course-recommendations/:courseId')
  @ApiOperation({ summary: 'Get one course and its recommendation profile' })
  getCourseRecommendation(@Param('courseId', new ParseUUIDPipe()) courseId: string) {
    return this.service.getCourseRecommendation(courseId);
  }

  @Put('course-recommendations/:courseId')
  @ApiOperation({ summary: 'Replace one course recommendation profile configuration' })
  updateCourseRecommendation(
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Body() input: UpdateCourseRecommendationProfileDto,
  ) {
    return this.service.updateCourseRecommendation(courseId, input);
  }
}
