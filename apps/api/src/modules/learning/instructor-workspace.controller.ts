import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PublicUser } from '../users/user.types';
import { InstructorWorkspaceService } from './instructor-workspace.service';

@Roles(UserRole.INSTRUCTOR)
@Controller('instructor/classes')
export class InstructorWorkspaceController {
  constructor(private readonly service: InstructorWorkspaceService) {}

  @Get()
  list(@CurrentUser() user: PublicUser) { return this.service.listClasses(user.id); }

  @Get(':classOfferingId/overview')
  overview(@CurrentUser() user: PublicUser, @Param('classOfferingId', new ParseUUIDPipe()) id: string) { return this.service.overview(user.id, id); }

  @Get(':classOfferingId/learners')
  learners(@CurrentUser() user: PublicUser, @Param('classOfferingId', new ParseUUIDPipe()) id: string) { return this.service.learners(user.id, id); }

  @Get(':classOfferingId/learners/:enrollmentId')
  learner(@CurrentUser() user: PublicUser, @Param('classOfferingId', new ParseUUIDPipe()) id: string, @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string) { return this.service.learnerDetail(user.id, id, enrollmentId); }

  @Get(':classOfferingId/results')
  results(@CurrentUser() user: PublicUser, @Param('classOfferingId', new ParseUUIDPipe()) id: string) { return this.service.results(user.id, id); }

  @Get(':classOfferingId/grading')
  grading(@CurrentUser() user: PublicUser, @Param('classOfferingId', new ParseUUIDPipe()) id: string) { return this.service.gradingInbox(user.id, id); }
}
