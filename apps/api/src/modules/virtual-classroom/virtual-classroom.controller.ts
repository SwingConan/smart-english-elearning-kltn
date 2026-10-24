import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PublicUser } from '../users/user.types';
import { VirtualClassroomService } from './virtual-classroom.service';

@Roles(UserRole.STUDENT)
@Controller('virtual-classroom/enrollments')
export class VirtualClassroomController {
  constructor(private readonly service: VirtualClassroomService) {}
  @Get(':enrollmentId') get(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
  ) {
    return this.service.get(user.id, enrollmentId);
  }
}
