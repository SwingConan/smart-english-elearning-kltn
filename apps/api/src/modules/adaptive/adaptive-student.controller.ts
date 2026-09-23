import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PublicUser } from '../users/user.types';
import { AdaptiveStudentService } from './adaptive-student.service';

@ApiTags('student adaptive path')
@Roles(UserRole.STUDENT)
@Controller('learning')
export class AdaptiveStudentController {
  constructor(private readonly adaptiveStudent: AdaptiveStudentService) {}

  @Get('enrollments/:enrollmentId/adaptive-path')
  @ApiOperation({ summary: 'Get the current adaptive path for an active Enrollment' })
  getAdaptivePath(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
  ) {
    return this.adaptiveStudent.getAdaptivePath(user.id, enrollmentId);
  }
}
