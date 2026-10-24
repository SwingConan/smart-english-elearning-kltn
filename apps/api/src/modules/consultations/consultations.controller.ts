import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PublicUser } from '../users/user.types';
import { CreateConsultationDto, UpdateConsultationDto } from './consultations.dto';
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
