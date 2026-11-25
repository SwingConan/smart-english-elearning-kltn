import { Controller, Get, Header, Module, Optional, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { TuitionModule } from '../tuition/tuition.module';
import { TuitionPaymentService } from '../tuition/tuition-payment.service';
import type { PublicUser } from '../users/user.types';
import { LearnerFinanceService } from './learner-finance.service';

@Controller('v2/my/finance')
@Roles('STUDENT')
export class LearnerFinanceController {
  constructor(
    private readonly finance: LearnerFinanceService,
    @Optional() private readonly tuitionPayment?: TuitionPaymentService,
  ) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  mine(@CurrentUser() user: PublicUser, @Req() req: Request) {
    return this.finance.read({ id: user.id, sessionId: req.sessionID });
  }
  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  detail(
    @CurrentUser() user: PublicUser,
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.finance.read({ id: user.id, sessionId: req.sessionID }, id);
  }
  @Post('enrollments/:id/retry-hold')
  retryHold(
    @CurrentUser() user: PublicUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.tuitionPayment!.retryHoldForEnrollment(user.id, id);
  }
}

@Module({
  imports: [TuitionModule],
  controllers: [LearnerFinanceController],
  providers: [LearnerFinanceService],
})
export class LearnerFinanceModule {}
