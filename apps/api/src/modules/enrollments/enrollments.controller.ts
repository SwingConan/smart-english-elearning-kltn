import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PublicUser } from '../users/user.types';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { EnrollmentsService } from './enrollments.service';

@ApiTags('enrollments')
@Roles(UserRole.STUDENT)
@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Enroll the current student in a class offering' })
  create(
    @Body() input: CreateEnrollmentDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.enrollmentsService.create(user.id, input);
  }

  @Get('my')
  @ApiOperation({ summary: "List the current student's enrollments" })
  listMine(@CurrentUser() user: PublicUser) {
    return this.enrollmentsService.listMine(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: "Get the current student's enrollment detail" })
  detail(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: PublicUser,
  ) {
    return this.enrollmentsService.getMineById(user.id, id);
  }
}
