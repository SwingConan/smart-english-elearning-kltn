import {
  Body,
  Controller,
  Get,
  Optional,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { TuitionPaymentService } from '../tuition/tuition-payment.service';
import { PublicUser } from '../users/user.types';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { EnrollmentsService } from './enrollments.service';

@ApiTags('enrollments')
@Roles(UserRole.STUDENT)
@Controller('enrollments')
export class EnrollmentsController {
  constructor(
    private readonly enrollmentsService: EnrollmentsService,
    @Optional() private readonly tuitionPayment?: TuitionPaymentService,
  ) {}

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

  @Post(':id/retry-hold')
  @ApiOperation({ summary: 'Re-create or resume 15-minute seat hold payment order for a pending/expired enrollment' })
  retryHold(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: PublicUser,
  ) {
    return this.tuitionPayment!.retryHoldForEnrollment(user.id, id);
  }
}
