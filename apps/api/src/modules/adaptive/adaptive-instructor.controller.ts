import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PublicUser } from '../users/user.types';
import { AdaptiveInstructorService } from './adaptive-instructor.service';
import { ReplaceAdaptivePolicyDto } from './dto/replace-adaptive-policy.dto';

@ApiTags('instructor adaptive policy')
@Roles(UserRole.INSTRUCTOR)
@Controller('instructor/courses/:courseId/adaptive-policy')
export class AdaptiveInstructorController {
  constructor(private readonly adaptiveInstructor: AdaptiveInstructorService) {}

  @Get()
  @ApiOperation({ summary: 'Get adaptive policy for an assigned Course' })
  getPolicy(
    @CurrentUser() user: PublicUser,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
  ) {
    return this.adaptiveInstructor.getPolicy(user.id, courseId);
  }

  @Put()
  @ApiOperation({ summary: 'Replace adaptive policy for an assigned Course' })
  replacePolicy(
    @CurrentUser() user: PublicUser,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Body() dto: ReplaceAdaptivePolicyDto,
  ) {
    return this.adaptiveInstructor.replacePolicy(user.id, courseId, dto);
  }
}
