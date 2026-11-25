import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { PublicUser } from '../users/user.types';
import { AcademicReasonDto } from './academic.dto';
import {
  AssignmentApprovalDto,
  AssignmentDto,
  DecisionDto,
  GenerationDto,
  PlanningQueryDto,
  RoomDto,
  SessionDto,
  UpdateRoomDto,
  UpdateSessionDto,
  UpdateVersionDto,
  VersionDto,
  VersionOfferDto,
  VersionApprovalDto,
  OpenVersionOfferDto,
} from './academic-planning.dto';
import { AcademicPlanningService } from './academic-planning.service';
import { SessionApprovalDto } from './academic-planning.dto';
const uuid = new ParseUUIDPipe();
const actor = (u: PublicUser, r: Request) => ({ id: u.id, sessionId: r.sessionID });
@Controller('v2/academic')
@Roles('ACADEMIC_MANAGER')
export class AcademicPlanningController {
  constructor(private readonly service: AcademicPlanningService) {}
  @Get('rooms') rooms(@Query() q: PlanningQueryDto) {
    return this.service.rooms(q);
  }
  @Get('rooms/:id/schedule') roomSchedule(@Param('id', uuid) id: string) {
    return this.service.roomSchedule(id);
  }
  @Post('rooms') roomCreate(@CurrentUser() u: PublicUser, @Req() r: Request, @Body() b: RoomDto) {
    return this.service.saveRoom(actor(u, r), b);
  }
  @Patch('rooms/:id') roomUpdate(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: UpdateRoomDto,
  ) {
    return this.service.saveRoom(actor(u, r), b, id);
  }
  @Delete('rooms/:id') roomDelete(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: DecisionDto,
  ) {
    return this.service.deleteRoom(actor(u, r), id, b);
  }
  @Get('instructors') instructors() {
    return this.service.instructors();
  }
  @Get('programs/:id/versions') versions(
    @CurrentUser() u: PublicUser,
    @Param('id', uuid) id: string,
  ) {
    return this.service.versions(u, id);
  }
  @Post('programs/:id/versions') versionCreate(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: VersionDto,
  ) {
    return this.service.saveVersion(actor(u, r), id, b);
  }
  @Patch('programs/:courseId/versions/:id') versionUpdate(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('courseId', uuid) c: string,
    @Param('id', uuid) id: string,
    @Body() b: UpdateVersionDto,
  ) {
    return this.service.saveVersion(actor(u, r), c, b, id);
  }
  @Post('versions/:id/submit') versionSubmit(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: DecisionDto,
  ) {
    return this.service.submit(actor(u, r), 'versions', id, b);
  }
  @Post('versions/:id/approve') versionApprove(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: VersionApprovalDto,
  ) {
    return this.service.approve(actor(u, r), 'versions', id, b);
  }
  @Get('programs/:id/version-context') versionContext(
    @CurrentUser() u: PublicUser,
    @Param('id', uuid) id: string,
  ) {
    return this.service.versionContext(u, id);
  }
  @Get('versions/:id/history') versionHistory(
    @CurrentUser() u: PublicUser,
    @Param('id', uuid) id: string,
  ) {
    return this.service.versionHistory(u, id);
  }
  @Post('versions/:id/return-to-draft') versionReturn(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: DecisionDto,
  ) {
    return this.service.returnVersion(actor(u, r), id, b);
  }
  @Post('versions/:id/offers') offer(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: VersionOfferDto,
  ) {
    return this.service.createOffer(actor(u, r), id, b);
  }
  @Post('classes/:id/open-approved-offer') openOffer(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: OpenVersionOfferDto,
  ) {
    return this.service.openOffer(actor(u, r), id, b);
  }
  @Get('classes/:id/assignments') assignments(
    @CurrentUser() u: PublicUser,
    @Param('id', uuid) id: string,
  ) {
    return this.service.assignments(u, id);
  }
  @Post('classes/:id/assignments') assignmentCreate(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: AssignmentDto,
  ) {
    return this.service.createAssignment(actor(u, r), id, b);
  }
  @Post('assignments/:id/submit') assignmentSubmit(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: DecisionDto,
  ) {
    return this.service.submit(actor(u, r), 'assignments', id, b);
  }
  @Post('assignments/:id/approve') assignmentApprove(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: AssignmentApprovalDto,
  ) {
    return this.service.approve(actor(u, r), 'assignments', id, b);
  }
  @Post('classes/:id/generate-sessions') generate(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: GenerationDto,
  ) {
    return this.service.generate(actor(u, r), id, b);
  }
  @Post('classes/:id/sessions') createSession(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: SessionDto,
  ) {
    return this.service.createSession(actor(u, r), id, b);
  }
  @Get('sessions/:id') detail(@CurrentUser() u: PublicUser, @Param('id', uuid) id: string) {
    return this.service.detail(u, id);
  }
  @Patch('sessions/:id') updateSession(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: UpdateSessionDto,
  ) {
    return this.service.updateSession(actor(u, r), id, b);
  }
  @Post('sessions/:id/reschedule') revise(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: SessionDto,
  ) {
    return this.service.revise(actor(u, r), id, b.reason, b);
  }
  @Post('sessions/:id/cancel') cancel(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: AcademicReasonDto,
  ) {
    return this.service.revise(actor(u, r), id, b.reason);
  }
  @Post('sessions/:id/submit') submit(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: DecisionDto,
  ) {
    return this.service.submit(actor(u, r), 'sessions', id, b);
  }
  @Post('sessions/:id/approve') approve(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: SessionApprovalDto,
  ) {
    return this.service.approve(actor(u, r), 'sessions', id, b);
  }
  @Get('approvals') approvals(@CurrentUser() u: PublicUser) {
    return this.service.approvals(u);
  }
  @Get('calendar')
  @Roles('ACADEMIC_MANAGER', 'INSTRUCTOR', 'STUDENT', 'TEACHING_INSPECTOR')
  calendar(@CurrentUser() u: PublicUser, @Query() q: PlanningQueryDto) {
    return this.service.calendar(u, q);
  }
}
