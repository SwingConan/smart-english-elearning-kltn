import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PublicUser } from '../users/user.types';
import {
  CreateConsultationDto,
  SendConsultationMessageDto,
  UpdateConsultationDto,
} from './consultations.dto';
import { ConsultationsService } from './consultations.service';

@Roles(UserRole.STUDENT)
@Controller('enrollments/:enrollmentId/consultations')
export class StudentConsultationsController {
  constructor(private readonly service: ConsultationsService) {}
  @Get() list(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
  ) {
    return this.service.listMine(user.id, enrollmentId);
  }
  @Post() create(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
    @Body() input: CreateConsultationDto,
  ) {
    return this.service.create(user.id, enrollmentId, input);
  }
  @Post(':id/cancel') cancel(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.cancel(user.id, enrollmentId, id);
  }
}

@Roles(UserRole.INSTRUCTOR)
@Controller('instructor/classes/:classOfferingId/consultations')
export class InstructorConsultationsController {
  constructor(private readonly service: ConsultationsService) {}
  @Get() list(
    @CurrentUser() user: PublicUser,
    @Param('classOfferingId', new ParseUUIDPipe()) classOfferingId: string,
  ) {
    return this.service.listForInstructor(user.id, classOfferingId);
  }
  @Patch(':id') update(
    @CurrentUser() user: PublicUser,
    @Param('classOfferingId', new ParseUUIDPipe()) classOfferingId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: UpdateConsultationDto,
  ) {
    return this.service.update(user.id, classOfferingId, id, input);
  }
}

@Roles(UserRole.STUDENT)
@Controller('enrollments/:enrollmentId/consultation-thread')
export class StudentConsultationThreadController {
  constructor(private readonly service: ConsultationsService) {}

  @Get()
  get(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
  ) {
    return this.service.studentThread(user.id, enrollmentId);
  }

  @Post('messages')
  send(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
    @Body() input: SendConsultationMessageDto,
  ) {
    return this.service.sendStudentMessage(user.id, enrollmentId, input.body);
  }

  @Post('read')
  read(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
  ) {
    return this.service.markStudentRead(user.id, enrollmentId);
  }
}

@Roles(UserRole.INSTRUCTOR)
@Controller('instructor/classes/:classOfferingId/consultation-inbox')
export class InstructorConsultationInboxController {
  constructor(private readonly service: ConsultationsService) {}

  @Get()
  list(
    @CurrentUser() user: PublicUser,
    @Param('classOfferingId', new ParseUUIDPipe()) classId: string,
  ) {
    return this.service.instructorInbox(user.id, classId);
  }

  @Get(':enrollmentId')
  get(
    @CurrentUser() user: PublicUser,
    @Param('classOfferingId', new ParseUUIDPipe()) classId: string,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
  ) {
    return this.service.instructorThread(user.id, classId, enrollmentId);
  }

  @Post(':enrollmentId/messages')
  send(
    @CurrentUser() user: PublicUser,
    @Param('classOfferingId', new ParseUUIDPipe()) classId: string,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
    @Body() input: SendConsultationMessageDto,
  ) {
    return this.service.sendInstructorMessage(user.id, classId, enrollmentId, input.body);
  }

  @Post(':enrollmentId/read')
  read(
    @CurrentUser() user: PublicUser,
    @Param('classOfferingId', new ParseUUIDPipe()) classId: string,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
  ) {
    return this.service.markInstructorRead(user.id, classId, enrollmentId);
  }
}
