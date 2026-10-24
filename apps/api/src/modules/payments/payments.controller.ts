import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PublicUser } from '../users/user.types';
import {
  PaymentQueryDto,
  RejectPaymentDto,
  ReviewPaymentDto,
  SubmitPaymentDto,
} from './dto/payment.dto';
import { PaymentsService } from './payments.service';

@Roles(UserRole.STUDENT)
@Controller('enrollments/:enrollmentId/payments')
export class StudentPaymentsController {
  constructor(private readonly payments: PaymentsService) {}
  @Post() create(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
  ) {
    return this.payments.create(user.id, enrollmentId);
  }
  @Get() list(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
  ) {
    return this.payments.listMine(user.id, enrollmentId);
  }
  @Patch(':paymentId/submitted') submit(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() input: SubmitPaymentDto,
  ) {
    return this.payments.submit(user.id, enrollmentId, paymentId, input);
  }
}

@Roles(UserRole.ADMIN_COORDINATOR)
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}
  @Get() list(@Query() query: PaymentQueryDto) {
    return this.payments.listAdmin(query);
  }
  @Get(':id') detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.payments.adminDetail(id);
  }
  @Post(':id/verify') verify(
    @CurrentUser() user: PublicUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ReviewPaymentDto,
  ) {
    return this.payments.verify(user.id, id, input);
  }
  @Post(':id/reject') reject(
    @CurrentUser() user: PublicUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: RejectPaymentDto,
  ) {
    return this.payments.reject(user.id, id, input);
  }
}
